/**
 * Migration: Backfill SP_Transactions from raw CSVs
 * Run once: node server/scripts/migrate_sp_transactions.js
 * 
 * This replaces the old "recompute from raw data on every request" model.
 * After migration, SP is append-only via new transactions.
 */

import fs from 'fs';
import mongoose from 'mongoose';
import { SESSION_LABELS, SESSION_THRESHOLDS_MINUTES, SESSION_THRESHOLDS_PCT, SESSION_DURATIONS } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';

const SESSION_ORDER = ['15 May Morning','15 May Evening','16 May Morning','16 May Evening','17 May Evening','18 May Morning','19 May Morning'];

const SESSION_DATES = {
  '15 May Morning': '2026-05-15',
  '15 May Evening': '2026-05-15',
  '16 May Morning': '2026-05-16',
  '16 May Evening': '2026-05-16',
  '17 May Evening': '2026-05-17',
  '18 May Morning': '2026-05-18',
  '19 May Morning': '2026-05-19'
};

const SESSION_FILE_MAP = {
  '15 May Morning': '15_may_attendance_M.csv',
  '15 May Evening': '15_may_attendance_E.csv',
  '16 May Morning': '16_may_attendance_M.csv',
  '16 May Evening': '16_may_attendance_E.csv',
  '17 May Evening': 'participants_98521543113_2026_05_17.csv',
  '18 May Morning': '18_May_Attendance.csv',
  '19 May Morning': '19-05-2026 Attendance.csv'
};

function parseDate(str) {
  if (!str) return null;
  const months = {'January':1,'February':2,'March':3,'April':4,'May':5,'June':6,'July':7,'August':8,'September':9,'October':10,'November':11,'December':12};
  const m = str.match(/(\d+)\s+(\w+)\s+(\d+)/);
  if (!m) return null;
  return new Date(`${m[3]}-${String(months[m[2]]).padStart(2,'0')}-${m[1].padStart(2,'0')}T00:00:00.000Z`);
}

function parseSessionDatetime(str) {
  // "05/15/2026 01:30:15 PM" -> Date
  const m = str.match(/(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+) (AM|PM)/i);
  if (!m) return new Date(str);
  let h = parseInt(m[4]);
  const ampm = m[7].toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return new Date(`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}T${String(h).padStart(2,'0')}:${m[5]}:${m[6]}.000Z`);
}

function getSessionEndTimes() {
  const times = {};
  for (const [label, fname] of Object.entries(SESSION_FILE_MAP)) {
    const dirs = fs.readdirSync('./data/uploads', { withFileTypes: true }).filter(d => d.isDirectory());
    for (const d of dirs) {
      const files = fs.readdirSync(`./data/uploads/${d.name}`);
      const found = files.find(f => f === fname);
      if (found) {
        const path = `./data/uploads/${d.name}/${found}`;
        const lines = fs.readFileSync(path, 'utf8').split('\n');
        const matches = lines[1]?.match(/"(\d+\/\d+\/\d+ \d+:\d+:\d+ (?:AM|PM))"/g);
        if (matches && matches[1]) times[label] = parseSessionDatetime(matches[1]);
        break;
      }
    }
  }
  return times;
}

async function loadRoster() {
  const csv = fs.readFileSync('./data/students-start-on-or-before-2026-05-18-revised.csv', 'utf8');
  const roster = {};
  for (const line of csv.split('\n').slice(1)) {
    const parts = line.split(',');
    if (parts[0] && parts[1]) {
      roster[parts[1].toLowerCase().trim()] = parseDate(parts[3]?.trim());
    }
  }
  return roster;
}

async function migrate() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);

  console.log('Loading roster...');
  const roster = await loadRoster();

  console.log('Getting session end times...');
  const sessionEndTimes = getSessionEndTimes();

  console.log('Fetching all students...');
  const students = await Student.find({}).lean();
  console.log(`Found ${students.length} students`);

  console.log('Clearing existing transactions (migration only)...');
  await SPTransaction.deleteMany({});

  const allTxns = [];
  const studentBalances = {};  // email -> computed final balance

  for (const s of students) {
    const onboardingDate = roster[s.email.toLowerCase()] || roster[s.alternateEmail?.toLowerCase()] || new Date('2026-05-15');
    const onboardingDt = new Date(onboardingDate);
    const onboardingSessionDt = new Date(`${onboardingDate.toISOString().split('T')[0]}T00:00:00.000Z`);

    // Initial transaction
    allTxns.push({
      email: s.email,
      category: 'initial',
      sessionLabel: '',
      sessionDatetime: onboardingDt,
      delta: 100,
      reason: 'Initial credit by system on the onboarding date',
      recordedAt: new Date(),
      ingestedFrom: 'migration'
    });

    let balance = 100;
    const sessions = {};
    for (const label of SESSION_LABELS) {
      const v = s.sessions instanceof Map ? s.sessions.get(label) : s.sessions?.[label];
      sessions[label] = Number(v || 0);
    }

    // Attendance transactions
    for (const label of SESSION_ORDER) {
      const sessionDt = sessionEndTimes[label];
      if (!sessionDt || sessionDt < onboardingDt) continue;

      const minutes = sessions[label] || 0;
      const fullMinutes = SESSION_DURATIONS[label] || 0;
      const threshold = SESSION_THRESHOLDS_MINUTES[label] != null ? SESSION_THRESHOLDS_MINUTES[label] : Math.round(fullMinutes * SESSION_THRESHOLDS_PCT);
      const qualified = minutes >= threshold;
      const wasPresent = minutes > 0;

      let delta, reason;
      if (qualified) {
        delta = 5;
        reason = `+5 SP as student was present for ${Math.round(minutes)} min which was above the ${threshold} min threshold in the ${label} session`;
      } else if (wasPresent) {
        delta = -5;
        reason = `-5 SP as student was present for ${Math.round(minutes)} min which was below the ${threshold} min threshold in the ${label} session`;
      } else {
        delta = -5;
        reason = `-5 SP as student was absent in the ${label} session`;
      }

      balance += delta;
      allTxns.push({
        email: s.email,
        category: 'attendance',
        sessionLabel: label,
        sessionDatetime: sessionDt,
        delta,
        reason,
        recordedAt: new Date(),
        ingestedFrom: `migration:${label}`
      });
    }

    // Poll transactions
    for (const poll of (s.polls || [])) {
      const sessionDt = sessionEndTimes[poll.session];
      if (!sessionDt || sessionDt < onboardingDt) continue;
      if (!poll.sp) continue;
      const reason = `+${poll.sp} SP for attending ${poll.answered}/${poll.totalPolls} poll(s) in the ${poll.session} session`;
      balance += poll.sp;
      allTxns.push({
        email: s.email,
        category: 'poll',
        sessionLabel: poll.session,
        sessionDatetime: sessionDt,
        delta: poll.sp,
        reason,
        recordedAt: new Date(),
        ingestedFrom: `migration:${poll.session}`
      });
    }

    studentBalances[s.email] = balance;
  }

  console.log(`Inserting ${allTxns.length} transactions...`);
  await SPTransaction.insertMany(allTxns);

  console.log('Updating Student.totalSp...');
  for (const [email, totalSp] of Object.entries(studentBalances)) {
    await Student.updateOne({ email }, { totalSp });
  }

  console.log('Migration complete!');
  console.log(`Total transactions: ${allTxns.length}`);
  console.log(`Total students updated: ${Object.keys(studentBalances).length}`);

  // Verify
  const totalInSystem = Object.values(studentBalances).reduce((a, b) => a + b, 0);
  console.log(`Total SP in system: ${totalInSystem}`);

  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});