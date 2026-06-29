import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const dataDir = path.join(rootDir, 'data');

const MONGO_URI = 'mongodb://127.0.0.1:27017/analysis_summership';

const ROSTER_NEW = path.join(dataDir, 'students-start-on-or-before-2026-05-21.csv');
const ROSTER_OLD = path.join(dataDir, 'students-start-on-or-before-2026-05-18-revised.csv');

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeEmail(v) {
  return String(v || '').toLowerCase().trim();
}

function parseDate(str) {
  if (!str) return null;
  const m = str.trim().match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const month = months[m[2].toLowerCase().substring(0, 3)] ?? 0;
  return new Date(parseInt(m[3]), month, parseInt(m[1]));
}

function loadRoster(fp) {
  const lines = fs.readFileSync(fp, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const [name, email, emailAlt, startDateStr, endDateStr] = parts;
    if (!email) continue;
    students.push({
      name: name?.trim() || '',
      email: normalizeEmail(email),
      alternateEmail: emailAlt ? normalizeEmail(emailAlt) : '',
      internshipStartDate: parseDate(startDateStr),
      internshipEndDate: parseDate(endDateStr),
    });
  }
  return students;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(MONGO_URI);
  const Student = (await import('../models/Student.js')).default;

  // 1. Load old roster to know which emails already exist
  const oldRoster = loadRoster(ROSTER_OLD);
  const existingEmails = new Set(oldRoster.map(r => r.email));
  const existingAltEmails = new Set(oldRoster.filter(r => r.alternateEmail).map(r => r.alternateEmail));

  console.log(`Existing students in DB: ${existingEmails.size}`);

  // 2. Load new roster and filter to only newcomers
  const newRoster = loadRoster(ROSTER_NEW);
  const newcomers = newRoster.filter(r => !existingEmails.has(r.email) && !existingAltEmails.has(r.alternateEmail));

  console.log(`New students to upsert: ${newcomers.length}`);

  if (newcomers.length === 0) {
    console.log('No new students to add. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // 3. Upsert each newcomer
  let upserted = 0;
  let skipped = 0;

  for (const r of newcomers) {
    // Check if already in DB (by either email)
    const existing = await Student.findOne({
      $or: [{ email: r.email }, { alternateEmail: r.email }]
    });

    if (existing) {
      // Already exists, skip
      skipped++;
      continue;
    }

    await Student.updateOne(
      { email: r.email },
      {
        $setOnInsert: {
          name: r.name,
          email: r.email,
          alternateEmail: r.alternateEmail,
          onboardingDate: r.internshipStartDate,
          internshipStartDate: r.internshipStartDate,
          internshipEndDate: r.internshipEndDate,
          sessions: new Map(),
          attendanceLedger: [],
          chats: [],
          polls: [],
          activities: [],
          activityItems: '',
          activityMatched: '',
          sp: 100,
          totalSp: 100,
        }
      },
      { upsert: true }
    );
    upserted++;
  }

  console.log(`Upserted: ${upserted}, Skipped (already existed): ${skipped}`);

  // 4. Calculate total SP for new students
  const newStudents = await Student.find({
    email: { $in: newcomers.map(r => r.email) }
  });

  let totalSP = 0;
  for (const s of newStudents) {
    const attSP = (s.attendanceLedger || []).reduce((a, r) => a + (r.sp || 0), 0);
    const pollSP = (s.polls || []).reduce((a, r) => a + (r.sp || 0), 0);
    const sp = 100 + attSP + pollSP;
    await Student.updateOne({ _id: s._id }, { $set: { sp } });
    totalSP += sp;
  }

  console.log(`\nSP calculated for ${newStudents.length} new students`);
  console.log(`Total SP (initial 100 each + earned): ${totalSP}`);
  console.log(`\nNew students ready on spurti.me/summership/`);

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });