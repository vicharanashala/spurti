import SPTransaction from '../models/SPTransaction.js';
import Student from '../models/Student.js';
import { weekContaining } from './weeklyWindow.js';

// ============================================================
// Weekly Aggregator
// Pulls SP transactions within the current week window and
// aggregates per-student. Server is the source of truth — the
// client never computes weekly points itself.
// ============================================================

const COHORT_FILTER = { status: { $ne: 'excused' } };

// Aggregate SP earned between [startMs, endMs] for every active
// student. Includes zero-SP students so the leaderboard shows
// them in the bottom 50 too.
export async function aggregateWeek(week = weekContaining()) {
  const match = {
    dateTime: { $gte: new Date(week.startMs), $lte: new Date(week.endMs) }
  };
  // Sum appliedDelta per email.
  const sums = await SPTransaction.aggregate([
    { $match: match },
    { $group: { _id: '$email', weeklySp: { $sum: '$appliedDelta' } } }
  ]);
  const map = new Map(sums.map(s => [s._id, s.weeklySp]));

  // Per-category counts (what they missed / completed) for AI Coach insights.
  const perCat = await SPTransaction.aggregate([
    { $match: match },
    { $group: { _id: { email: '$email', category: '$category' }, count: { $sum: 1 }, sp: { $sum: '$appliedDelta' } } }
  ]);
  const catMap = new Map();
  for (const row of perCat) {
    const e = row._id.email;
    const c = row._id.category;
    if (!catMap.has(e)) catMap.set(e, {});
    catMap.get(e)[c] = { count: row.count, sp: row.sp };
  }

  // Pull the full active student roster.
  const students = await Student.find(COHORT_FILTER)
    .select('name email totalSp internshipStartDate')
    .sort({ name: 1 })
    .lean();

  const rows = students.map(s => ({
    email: s.email,
    name: s.name,
    weeklySp: Math.max(0, map.get(s.email) || 0),
    categories: catMap.get(s.email) || {},
    totalSp: Number(s.totalSp || 0)
  }));

  // Rank: highest weeklySp first. Tie-break: higher totalSp, then name.
  rows.sort((a, b) =>
    b.weeklySp - a.weeklySp
    || b.totalSp - a.totalSp
    || a.name.localeCompare(b.name)
  );

  rows.forEach((r, i) => { r.weeklyRank = i + 1; });

  return { week, rows };
}

// Lightweight summary for a single user within the current week.
export async function userWeeklySummary(email, week = weekContaining()) {
  const result = await aggregateWeek(week);
  const me = result.rows.find(r => r.email === email);
  if (!me) return null;

  // Derive miss/catch-up signals from category counts.
  const cat = me.categories;
  const missed = [];
  if (!cat.attendance || cat.attendance.count < 2) missed.push('attendance');
  if (!cat.poll || cat.poll.count < 2) missed.push('poll');
  if (me.weeklySp < 20 && (!cat.attendance || cat.attendance.count === 0)) missed.push('attendance-major');

  return {
    weeklySp: me.weeklySp,
    weeklyRank: me.weeklyRank,
    cohortSize: result.rows.length,
    top10Cutoff: result.rows[9]?.weeklySp ?? 0,
    pointsToTop10: Math.max(0, (result.rows[9]?.weeklySp ?? 0) - me.weeklySp),
    missed,
    categories: cat
  };
}