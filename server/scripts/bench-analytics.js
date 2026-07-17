/**
 * server/scripts/bench-analytics.js
 *
 * Local micro-benchmark for the analytics endpoint. Generates a
 * synthetic cohort (default 1,000 students, 30 sessions, ~30K attendance
 * rows, ~30K transactions) and measures p50 / p95 latency for the
 * runAdminAnalytics() helper.
 *
 *   node server/scripts/bench-analytics.js [students] [sessions] [transactions]
 *
 * Example: node server/scripts/bench-analytics.js 3000 50 50000
 *
 * Reports wall-clock time only (no MongoDB). For a realistic end-to-end
 * benchmark including the network round-trip, run the production
 * analytics endpoint with the X-Analytics-Duration-Ms response header.
 */

import { performance } from 'node:perf_hooks';
import { runAdminAnalytics } from '../services/analyticsAggregation.js';

const STUDENTS  = Number(process.argv[2] || 1000);
const SESSIONS  = Number(process.argv[3] || 30);
const TRANSACTIONS = Number(process.argv[4] || STUDENTS * 10);

const NOW = new Date();
const liveViewers = new Map();

// Build synthetic fixture data
function makeFixture() {
  const students = [];
  for (let i = 0; i < STUDENTS; i++) {
    students.push({
      _id: `s${i}`,
      email: `student${i}@spurti.in`,
      name: `Student ${i}`,
      status: i % 20 === 0 ? 'excused' : 'active',
      internshipStartDate: new Date('2026-05-15'),
      totalSp: 100 + Math.floor(Math.random() * 200)
    });
  }
  const sessions = [];
  for (let i = 0; i < SESSIONS; i++) {
    const d = new Date(NOW.getTime() - (SESSIONS - i) * 86_400_000);
    sessions.push({
      _id: `sess${i}`,
      label: `Day ${i + 1}`,
      date: d.toISOString().slice(0, 10),
      endDateTime: d,
      totalMinutes: 120
    });
  }
  const transactions = [];
  for (let i = 0; i < TRANSACTIONS; i++) {
    const student = students[i % students.length];
    const session = sessions[i % sessions.length];
    transactions.push({
      email: student.email,
      studentId: student._id,
      category: i % 3 === 0 ? 'attendance' : (i % 3 === 1 ? 'poll' : 'initial'),
      sessionLabel: session.label,
      sessionDatetime: session.endDateTime,
      dateTime: session.endDateTime,
      appliedDelta: 5 + Math.floor(Math.random() * 10),
      balanceAfter: 100 + i,
      reason: 'bench'
    });
  }
  return { students, sessions, transactions };
}

const { students, sessions, transactions } = makeFixture();

console.log(`Benchmark config: ${STUDENTS} students, ${SESSIONS} sessions, ${TRANSACTIONS} transactions`);
console.log('Running 5 trials (first as warmup, then measured)...');

// Warmup
runAdminAnalytics({ now: NOW, liveViewers, sessions, students, transactions });

const trials = 5;
const times = [];
for (let i = 0; i < trials; i++) {
  const t0 = performance.now();
  const result = runAdminAnalytics({ now: NOW, liveViewers, sessions, students, transactions });
  const t1 = performance.now();
  times.push(t1 - t0);
  if (i === 0) {
    console.log(`Result shape: { keys: ${Object.keys(result).length}, topImprovers: ${result.trends?.topImprovers?.length || 0} }`);
  }
}

times.sort((a, b) => a - b);
const p50 = times[Math.floor(trials / 2)];
const p95 = times[Math.floor(trials * 0.95)] || times[times.length - 1];
const min = times[0];
const max = times[times.length - 1];

console.log('\n=== Results (pure compute, no MongoDB) ===');
console.log(`  trials:  ${trials}`);
console.log(`  min:     ${min.toFixed(2)}ms`);
console.log(`  p50:     ${p50.toFixed(2)}ms`);
console.log(`  p95:     ${p95.toFixed(2)}ms`);
console.log(`  max:     ${max.toFixed(2)}ms`);
console.log('\nNote: production numbers are higher because of MongoDB network');
console.log('latency. The X-Analytics-Duration-Ms response header shows the');
console.log('end-to-end number. This benchmark is the "compute-only" floor.');
