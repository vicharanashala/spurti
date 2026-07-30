// Student SP trajectories — cumulative SP by WEEK SINCE JOIN (normalised onset, so
// students who joined on different dates are comparable; matches the trajectory-paper
// framing). Three lines on the chart: You / Cohort mean / your Onboarding-group mean.
// Cohort & group means are precomputed (see buildTrajectories.js); the student's own
// line is built live from their ledger.
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import TrajectorySnapshot from '../models/TrajectorySnapshot.js';
import { leaderboardGroup, groupLabel } from './levels.js';

export const WEEKS = 10;                 // cap the axis at ~10 weeks (typical internship length)
const WEEK_MS = 7 * 86400000;

// Balance at time t = balanceAfter of the last txn on/before t (0 before any txn).
// txns must be sorted ascending by dateTime.
function balanceAt(txns, t) {
  let bal = 0;
  for (const tx of txns) {
    if (new Date(tx.dateTime).getTime() <= t) bal = tx.balanceAfter; else break;
  }
  return bal;
}

// Cumulative SP at the end of each COMPLETED week since join. Week is 1-indexed.
function weeklySeries(txns, joinMs, nowMs) {
  const out = [];
  for (let w = 0; w < WEEKS; w++) {
    const boundary = joinMs + (w + 1) * WEEK_MS;
    if (nowMs < boundary) break;         // this week isn't complete yet
    out.push({ week: w + 1, sp: balanceAt(txns, boundary) });
  }
  return out;
}

// Average per week, dropping weeks with too few students (the noisy small-sample tail —
// few learners reach the last weeks). Keep weeks with n >= max(15, 10% of week-1's count).
function toSeries(acc) {
  const first = acc.find(x => x.n > 0);
  const floor = first ? Math.max(15, Math.round(first.n * 0.1)) : 15;
  return acc
    .map((x, i) => ({ week: i + 1, sp: x.n ? Math.round(x.sum / x.n) : null, n: x.n }))
    .filter(p => p.sp !== null && p.n >= floor);
}

// Recompute cohort + per-group average trajectories and upsert the 'latest' snapshot.
export async function computeAndStoreTrajectories(now = new Date()) {
  const nowMs = now.getTime();
  const students = await Student.find({ status: { $ne: 'excused' }, internshipStartDate: { $ne: null } })
    .select('email internshipStartDate').lean();

  const txns = await SPTransaction.find({}).select('email dateTime balanceAfter').sort({ dateTime: 1 }).lean();
  const byEmail = new Map();
  for (const t of txns) { const a = byEmail.get(t.email); if (a) a.push(t); else byEmail.set(t.email, [t]); }

  const blank = () => Array.from({ length: WEEKS }, () => ({ sum: 0, n: 0 }));
  const cohort = blank();
  const groups = new Map();

  for (const s of students) {
    const joinMs = new Date(s.internshipStartDate).getTime();
    if (joinMs > nowMs) continue;        // not started yet
    const series = weeklySeries(byEmail.get(s.email) || [], joinMs, nowMs);
    if (!series.length) continue;
    const gk = leaderboardGroup(s.internshipStartDate);
    if (!groups.has(gk)) groups.set(gk, blank());
    const garr = groups.get(gk);
    for (const p of series) {
      const i = p.week - 1;
      cohort[i].sum += p.sp; cohort[i].n++;
      garr[i].sum += p.sp; garr[i].n++;
    }
  }

  const groupsObj = {}, groupLabels = {};
  for (const [gk, arr] of groups) { groupsObj[gk] = toSeries(arr); groupLabels[gk] = groupLabel(gk); }

  await TrajectorySnapshot.updateOne({ key: 'latest' },
    { $set: { weeks: WEEKS, cohort: toSeries(cohort), groups: groupsObj, groupLabels, computedAt: now } },
    { upsert: true });
  return { students: students.length, cohortWeeks: toSeries(cohort).length, groups: groups.size };
}

// Student-facing payload: their own weekly line + the two cached reference lines.
export async function buildTrajectoryState(student) {
  const joinMs = student.internshipStartDate ? new Date(student.internshipStartDate).getTime() : null;
  const txns = joinMs
    ? await SPTransaction.find({ email: student.email }).select('dateTime balanceAfter').sort({ dateTime: 1 }).lean()
    : [];
  const you = joinMs ? weeklySeries(txns, joinMs, Date.now()) : [];
  const snap = await TrajectorySnapshot.findOne({ key: 'latest' }).lean();
  const gk = student.internshipStartDate ? leaderboardGroup(student.internshipStartDate) : null;
  return {
    weeks: snap?.weeks || WEEKS,
    you,
    cohort: snap?.cohort || [],
    group: (gk && snap?.groups?.[gk]) || [],
    groupLabel: gk ? groupLabel(gk) : null,
    computedAt: snap?.computedAt || null
  };
}
