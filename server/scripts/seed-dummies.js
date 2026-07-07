// DUMMY data seeder for spurti
// Idempotent: cleans up by tag regex first, then inserts.
// Run: node server/scripts/seed-dummies.js
// Drop: node server/scripts/seed-dummies.js --drop
//
// 20 dummy students total:
//   dummy1-10: all 13 sessions qualified  → Excellent 100%, streak 13, freezes 2
//              highestSpEver varied 100..1620 across the 10 to show levels 1..16
//   dummy11-20: deliberately varied last-5 patterns to demo all 4 bands,
//               various streaks (0..13), levels (1..5), and trends (up/down/steady).
//
// All real student data is left untouched.

import mongoose from 'mongoose';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import { MONGO_URI } from '../config.js';

const DROP = process.argv.includes('--drop');
const NOW = new Date();
const DAY = 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────
// Dummy definitions
// ────────────────────────────────────────────────────────────────────
//
// Each entry: [name, email, qualifiedPattern(13 booleans), highestSpEver]
// highestSpEver sets totalSp/level/levelProgress. totalSp mirrors it (this
// is fine for demo purposes).
//
// Pattern positions are OLDEST (1) → NEWEST (13). The progress band is
// computed from the LAST 5 entries (positions 9..13), so that's where the
// band variety comes from. The streak walks the entire array.
//
const DUMMY_DEFS = [
  // ── Group A: all 13 qualified, varying levels ──────────────────────
  // (Level = floor(highestSpEver/100), levelProgress = highestSpEver % 100)
  ['DUMMY One',   'dummy1@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 100],   // L1  / 0
  ['DUMMY Two',   'dummy2@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 250],   // L2  / 50
  ['DUMMY Three', 'dummy3@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 380],   // L3  / 80
  ['DUMMY Four',  'dummy4@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 540],   // L5  / 40
  ['DUMMY Five',  'dummy5@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 720],   // L7  / 20
  ['DUMMY Six',   'dummy6@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 880],   // L8  / 80
  ['DUMMY Seven', 'dummy7@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 1010],  // L10 / 10
  ['DUMMY Eight', 'dummy8@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 1150],  // L11 / 50
  ['DUMMY Nine',  'dummy9@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1], 1380],  // L13 / 80
  ['DUMMY Ten',   'dummy10@spurti.test', [1,1,1,1,1,1,1,1,1,1,1,1,1], 1620],  // L16 / 20 (Legend candidate)

  // ── Group B: deliberately varied bands, streaks, trends, levels ─────
  // Each pattern is hand-tuned so the last-5 + streak + trend produce
  // a distinct, recognizable UI state covering all 4 bands.
  //
  // last5 = positions 9..13. band rates: 5/5=100%, 4/5=80% Excellent;
  // 3/5=60% Active; 2/5=40% Slowing Down; 0..1/5=Recovery.
  // trend compares recent(pos 11..13) vs prev(pos 7..9).
  //
  // Verify by running `node server/scripts/_design.js`.

  ['DUMMY Eleven',  'dummy11@spurti.test',  [1,1,1,1,1,1,1,1,1,1,1,1,1],  100], // Excellent 100% steady,    streak 13, frz 2 — L1  / 0
  ['DUMMY Twelve',  'dummy12@spurti.test',  [1,1,1,1,1,1,1,1,1,1,0,1,1],  240], // Excellent  80% down,      streak 12, frz 1 — L2  / 40
  ['DUMMY Thirteen','dummy13@spurti.test',  [1,1,1,1,1,1,0,0,0,1,1,1,1],  380], // Excellent  80% up,        streak 4,  frz 1 — L3  / 80
  ['DUMMY Fourteen', 'dummy14@spurti.test', [1,1,1,1,1,0,0,0,0,0,1,1,1],  460], // Active     60% up,        streak 3,  frz 0 — L4  / 60
  ['DUMMY Fifteen',  'dummy15@spurti.test', [1,1,1,1,1,1,1,0,1,1,0,0,1],  540], // Active     60% down,      streak 1,  frz 1 — L5  / 40
  ['DUMMY Sixteen',  'dummy16@spurti.test', [1,1,1,1,1,1,0,0,1,0,0,1,1],  720], // Active     60% up,        streak 2,  frz 0 — L7  / 20
  ['DUMMY Seventeen','dummy17@spurti.test', [1,1,1,1,1,1,1,1,0,0,0,0,1],  180], // Recovery   20% steady,    streak 1,  frz 0 — L1  / 80
  ['DUMMY Eighteen', 'dummy18@spurti.test', [1,1,1,1,1,1,1,1,0,0,0,0,0],  320], // Recovery    0% down,      streak 0,  frz 0 — L3  / 20
  ['DUMMY Nineteen', 'dummy19@spurti.test', [1,1,1,1,1,0,0,0,0,0,1,0,1],  880], // Slowing Dn 40% up,        streak 1,  frz 0 — L8  / 80
  ['DUMMY Twenty',   'dummy20@spurti.test', [1,1,1,1,1,1,0,1,1,0,0,1,1], 1200], // Active     60% up,        streak 2,  frz 1 — L12 / 0
];

const DUMMY_NAMES = DUMMY_DEFS.map(([n, e]) => [n, e]);
const DUMMY_PATTERN = /^DUMMY /;
const DUMMY_LABEL = /^DUMMY-/;
const DUMMY_EMAIL = /^dummy\d+@spurti\.test$/i;

// ────────────────────────────────────────────────────────────────────

async function dropAll() {
  const s = await Student.deleteMany({ name: DUMMY_PATTERN });
  const se = await Session.deleteMany({ label: DUMMY_LABEL });
  const a = await AttendanceRecord.deleteMany({ email: DUMMY_EMAIL });
  const t = await SPTransaction.deleteMany({ email: DUMMY_EMAIL });
  console.log(`Dropped dummy: students=${s.deletedCount}, sessions=${se.deletedCount}, attendance=${a.deletedCount}, sp_txns=${t.deletedCount}`);
}

async function seed() {
  // 13 sessions: spaced 2 days apart, last one ending ~1h before now
  const sessions = [];
  for (let i = 1; i <= 13; i++) {
    const offset = (13 - i) * 2 * DAY + 60 * 60 * 1000;
    const start = new Date(NOW.getTime() - offset);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    sessions.push({
      label: `DUMMY-S${String(i).padStart(2, '0')}`,
      date: start,
      startDateTime: start,
      endDateTime: end,
      totalMinutes: 60,
      type: 'lecture',
      title: `Dummy Session ${i}`,
    });
  }
  await Session.insertMany(sessions);
  console.log(`Inserted sessions=${sessions.length}`);

  for (const [name, email, qualified, highestSpEver] of DUMMY_DEFS) {
    const internshipStartDate = new Date(NOW.getTime() - 30 * DAY);
    const qualifiedCount = qualified.filter(Boolean).length;

    const student = await Student.create({
      name,
      email,
      alternateEmail: email,
      internshipStartDate,
      status: 'active',
      totalSp: highestSpEver,
      highestSpEver,
      level: 1,            // sync-levels.cjs will recompute
      trophyLeague: 'Bronze II',
      legendBadgeUnlocked: false,
      leaderboardGroup: 'I',
    });

    // 1 initial txn (100 SP, the default starting balance)
    await SPTransaction.create({
      email,
      studentId: student._id,
      category: 'initial',
      sessionLabel: '',
      deltaMode: 'absolute',
      deltaValue: 100,
      appliedDelta: 100,
      balanceAfter: 100,
      reason: 'Initial credit (DUMMY)',
      dateTime: internshipStartDate,
    });

    // 13 attendance records + per-session SP txns (only when qualified)
    let runningBalance = 100;
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      const isQualified = qualified[i];

      await AttendanceRecord.create({
        email,
        studentId: student._id,
        sessionLabel: s.label,
        attendedMinutes: isQualified ? 60 : 0,
        totalSessionMinutes: 60,
        attendancePercentage: isQualified ? 100 : 0,
        qualified: isQualified,
        transactionId: null,
      });

      if (isQualified) {
        runningBalance += 20;
        await SPTransaction.create({
          email,
          studentId: student._id,
          category: 'attendance',
          sessionLabel: s.label,
          deltaMode: 'absolute',
          deltaValue: 20,
          appliedDelta: 20,
          balanceAfter: runningBalance,
          reason: `Session ${s.label} (DUMMY)`,
          dateTime: s.endDateTime,
        });
      }
    }

    // If highestSpEver target exceeds 100 + qualifiedCount*20, top up with manual txn(s)
    const earnedSoFar = runningBalance;
    let topup = highestSpEver - earnedSoFar;
    let topupTime = NOW;
    let lastBalance = earnedSoFar;
    let idx = 0;
    while (topup > 0) {
      const chunk = Math.min(topup, 50);
      lastBalance += chunk;
      await SPTransaction.create({
        email,
        studentId: student._id,
        category: 'manual',
        sessionLabel: '',
        deltaMode: 'absolute',
        deltaValue: chunk,
        appliedDelta: chunk,
        balanceAfter: lastBalance,
        reason: `Level topup ${++idx} (DUMMY)`,
        dateTime: new Date(topupTime.getTime() - idx * 1000),
      });
      topup -= chunk;
    }
  }

  const totalTxn = await SPTransaction.countDocuments({ email: DUMMY_EMAIL });
  console.log(`Inserted dummy students=${DUMMY_NAMES.length}, attendance=${DUMMY_NAMES.length * sessions.length}, sp_txns=${totalTxn}`);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  await new Promise(r => setTimeout(r, 500));

  if (DROP) {
    await dropAll();
  } else {
    await dropAll();
    await seed();
  }

  const sc = await Student.countDocuments({ name: DUMMY_PATTERN });
  const sec = await Session.countDocuments({ label: DUMMY_LABEL });
  const ac = await AttendanceRecord.countDocuments({ email: DUMMY_EMAIL });
  const tc = await SPTransaction.countDocuments({ email: DUMMY_EMAIL });
  console.log(`Post-run: dummy students=${sc}, dummy sessions=${sec}, dummy attendance=${ac}, dummy sp_txns=${tc}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });