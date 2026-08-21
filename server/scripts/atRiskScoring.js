// At-Risk Student Early-Warning Report
//
// Fills a gap in the existing analytics: analyticsService.js only flags students
// below a static SP threshold ("red zone"), which catches students who are ALREADY
// low but says nothing about direction of travel. A student steadily climbing from
// -20 to 40 SP and a student steadily falling from 200 to 40 SP look identical to
// that check — but only one of them is actually at risk.
//
// This script fits a simple linear trend (least-squares slope) to each active
// student's SP balance over the last N days, using their existing SPTransaction
// ledger. Students with a negative slope AND a below-median current balance are
// flagged as "at risk" and written to a timestamped JSON report.
//
// Read-only: does not modify Student, SPTransaction, or any other collection.
// Does not touch server.js, routes, or analyticsService.js.
//
// Usage:
//   node server/scripts/atRiskScoring.js
//   node server/scripts/atRiskScoring.js --days 21 --top 15
//
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const args = { days: 14, top: 10, outDir: path.join(rootDir, 'sp-runs') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--days') args.days = Number(argv[++i]);
    else if (argv[i] === '--top') args.top = Number(argv[++i]);
    else if (argv[i] === '--out') args.outDir = argv[++i];
  }
  return args;
}

// Ordinary least-squares slope of balance-over-time (SP per day).
// points: [{ t: <ms since window start>, sp: <balanceAfter> }, ...]
function leastSquaresSlope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const meanT = points.reduce((a, p) => a + p.t, 0) / n;
  const meanSp = points.reduce((a, p) => a + p.sp, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.t - meanT) * (p.sp - meanSp);
    den += (p.t - meanT) ** 2;
  }
  if (den === 0) return 0;
  const slopePerMs = num / den;
  return slopePerMs * 86400000; // SP per day
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const { days, top, outDir } = parseArgs(process.argv.slice(2));
  const since = new Date(Date.now() - days * 86400000);
  const windowStartMs = since.getTime();

  await mongoose.connect(MONGO_URI);

  const students = await Student.find({ status: 'active' })
    .select('name email totalSp').lean();

  const txns = await SPTransaction.find({ dateTime: { $gte: since } })
    .select('email dateTime balanceAfter')
    .sort({ dateTime: 1 })
    .lean();

  const byEmail = new Map();
  for (const t of txns) {
    const key = t.email.toLowerCase();
    const arr = byEmail.get(key) || [];
    arr.push({ t: new Date(t.dateTime).getTime() - windowStartMs, sp: t.balanceAfter });
    byEmail.set(key, arr);
  }

  const currentBalances = students.map(s => s.totalSp || 0);
  const medianBalance = median(currentBalances);

  const scored = students.map(s => {
    const key = s.email.toLowerCase();
    const points = byEmail.get(key) || [];
    const slopePerDay = leastSquaresSlope(points);
    return {
      name: s.name,
      email: s.email,
      currentSp: s.totalSp || 0,
      slopePerDay: Math.round(slopePerDay * 100) / 100,
      dataPoints: points.length,
    };
  });

  // At risk = trending down AND currently at/below the cohort median.
  // (Below-median alone is the existing "red zone" signal; trend is the new part.)
  const atRisk = scored
    .filter(s => s.dataPoints >= 2 && s.slopePerDay < 0 && s.currentSp <= medianBalance)
    .sort((a, b) => a.slopePerDay - b.slopePerDay) // steepest decline first
    .slice(0, top);

  const report = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    activeStudentsConsidered: students.length,
    cohortMedianSp: medianBalance,
    atRiskCount: atRisk.length,
    atRisk,
  };

  console.log(`\nAt-Risk Student Report (last ${days} days, cohort median SP = ${medianBalance})`);
  console.log('='.repeat(70));
  if (!atRisk.length) {
    console.log('No students currently match the at-risk criteria.');
  } else {
    for (const s of atRisk) {
      console.log(
        `${s.name.padEnd(28)} ${s.email.padEnd(30)} SP=${String(s.currentSp).padStart(5)}  trend=${s.slopePerDay}/day`
      );
    }
  }
  console.log('='.repeat(70));

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `at-risk-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nFull report written to ${path.relative(rootDir, outPath)}`);

  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
