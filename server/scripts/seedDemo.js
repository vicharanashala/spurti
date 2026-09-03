/**
 * Seed 50 students with realistic SP history + PollRecords.
 *
 * No JSON file required. Reads nothing from disk; generates 50 students
 * with declining-engagement patterns so the Recovery Missions demo
 * has data to surface.
 *
 * ponytail: not committed to the repo's data pipeline (scripts/seed.js
 * is). This is a demo-only seeder; the canonical seed path is still
 * `npm run seed` once data/students.json exists.
 *
 * Usage: node server/scripts/seedDemo.js
 */
import { fileURLToPath } from 'url';
import path from 'path';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import PollRecord from '../models/PollRecord.js';
import RecoveryMission from '../models/RecoveryMission.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NUM_STUDENTS = 50;
const COHORT_START = new Date('2026-06-01T00:00:00Z');

function isoDay(daysAgo) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

async function run() {
  await mongoose.connect(MONGO_URI);

  // ── Clear demo collections ────────────────────────────────────────────────
  await Student.deleteMany({});
  await SPTransaction.deleteMany({});
  await PollRecord.deleteMany({});
  await RecoveryMission.deleteMany({});

  // ── 1 enabled Recovery Mission template (so the scheduler has something) ──
  await RecoveryMission.create({
    title: 'Decision Trees Check-in',
    description: 'Catch up on Decision Trees',
    activityType: 'poll_check',
    activityPayload: { pollName: 'p1', requiredCount: 2 },
    rewardSp: 3,
    windowHours: 120,
    enabled: true,
    createdBy: 'admin@gmail.com'
  });

  // ── Generate 50 students with varying engagement patterns ────────────────
  const students = [];
  const txns = [];
  const polls = [];
  const now = new Date();

  for (let i = 0; i < NUM_STUDENTS; i++) {
    const id = String(i + 1).padStart(3, '0');
    const email = `student${id}@iitrpr.ac.in`;
    const name = `Student ${id}`;
    const cohort = i < 25 ? 'g1' : 'g2';  // two cohorts so the monitor's cohort filter works

    // ── Engagement pattern selector ──
    //   group A (40%): declining — eligible for a recovery mission
    //   group B (40%): steady — no mission
    //   group C (20%): recently recovered — already completed a mission
    const bucket = i < 20 ? 'declining' : i < 40 ? 'steady' : 'recovered';

    // ── Baseline (14 days ago to 7 days ago) SP pattern ──
    const baselinePerDay =
      bucket === 'declining' ? 4 :
      bucket === 'steady'    ? 3 :
      4; // recovered students had a baseline similar to declining
    const recentPerDay =
      bucket === 'declining' ? 0.5 :   // big drop
      bucket === 'steady'    ? 3 :     // flat
      3;                                // recovered back up

    const balanceStart = 100; // students start at 100
    let balance = balanceStart;

    // ── SPTransactions across 21 days, walking the balance ──
    for (let day = 20; day >= 0; day--) {
      // baseline = 8 to 14 days ago
      const isBaseline = day >= 8 && day <= 14;
      // recent    = last 7 days
      const isRecent   = day <= 6;

      const perDay = isBaseline ? baselinePerDay
                    : isRecent   ? recentPerDay
                                  : baselinePerDay;  // pre-baseline = same as baseline

      // Probabilistic: not every day has a txn, but most do
      if (Math.random() < 0.7 && perDay > 0) {
        const delta = Math.round(perDay * (0.8 + Math.random() * 0.4));
        balance += delta;
        txns.push({
          studentId: students[i]?._id,  // set after Student.create; placeholder
          email,
          category: day % 3 === 0 ? 'poll' : day % 3 === 1 ? 'attendance' : 'spa',
          sessionLabel: '',
          deltaMode: 'absolute',
          deltaValue: delta,
          appliedDelta: delta,
          balanceAfter: balance,
          reason: `seed day-${day}`,
          dateTime: isoDay(day)
        });
      }
    }

    students.push({
      _id: new mongoose.Types.ObjectId(),
      name,
      email,
      alternateEmail: email,
      leaderboardGroup: cohort,
      status: 'active',
      internshipStartDate: COHORT_START,
      totalSp: balance,
      highestSpEver: Math.max(balance, 100),
      level: 1
    });

    // ── PollRecords: at least one for declining students (so missions can complete) ──
    if (bucket !== 'steady') {
      polls.push({
        email,
        sessionLabel: 'p1',
        studentId: students[i]._id,
        totalQuestions: 3,
        attemptedQuestions: 3,
        missedQuestions: 0,
        responses: [
          { pollName: 'p1', question: 'q1', response: 'a', attempted: true },
          { pollName: 'p1', question: 'q2', response: 'b', attempted: true },
          { pollName: 'p1', question: 'q3', response: 'c', attempted: true }
        ]
      });
    } else {
      // Steady students also have partial poll data (covers index)
      polls.push({
        email,
        sessionLabel: 'p1',
        studentId: students[i]._id,
        totalQuestions: 3,
        attemptedQuestions: 1,
        missedQuestions: 2,
        responses: [
          { pollName: 'p1', question: 'q1', response: 'a', attempted: true }
        ]
      });
    }
  }

  // ── Insert students first so txns can reference them ──────────────────────
  await Student.insertMany(students);

  // Re-stamp txn studentIds now that students exist
  for (const s of students) {
    for (const t of txns) {
      if (t.email === s.email) t.studentId = s._id;
    }
  }
  await SPTransaction.insertMany(txns);
  await PollRecord.insertMany(polls);

  const counts = {
    students: await Student.countDocuments({}),
    spTxns: await SPTransaction.countDocuments({}),
    pollRecords: await PollRecord.countDocuments({}),
    recoveryMissions: await RecoveryMission.countDocuments({})
  };
  console.log('Seeded:');
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});