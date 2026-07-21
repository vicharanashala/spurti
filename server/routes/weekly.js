import express from 'express';
import SPTransaction from '../models/SPTransaction.js';
import { weekContaining, weekPhase, nextDeadline, formatWeekLabel } from '../services/weeklyWindow.js';
import { aggregateWeek, userWeeklySummary } from '../services/weeklyAggregator.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// GET /api/weekly/desktop?email=...
// Returns everything the desktop dashboard needs in one round-trip:
//   - week metadata (label, phase, deadline)
//   - full leaderboard (ranked)
//   - current user's weekly summary (rank, sp, pointsToTop10, missed)
//   - top 10 (for the celebration popup)
router.get('/desktop', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const week = weekContaining();
  const phase = weekPhase();
  const deadline = nextDeadline();
  const agg = await aggregateWeek(week);
  const summary = await userWeeklySummary(email, week);

  const top10 = agg.rows.slice(0, 10).map(r => ({
    rank: r.weeklyRank,
    name: r.name,
    weeklySp: r.weeklySp,
    isMe: r.email === email
  }));

  const middle = agg.rows
    .filter(r => r.weeklyRank > 10)
    .map(r => ({ rank: r.weeklyRank, name: r.name, weeklySp: r.weeklySp, isMe: r.email === email }));

  // Pre-compute current user's bucket so the popup can be routed.
  const myRank = summary?.weeklyRank ?? null;
  const cohortSize = agg.rows.length;
  let bucket = 'pre-start';
  if (myRank == null) bucket = 'unknown';
  else if (myRank <= 10) bucket = 'top10';
  else bucket = 'regular';

  res.json({
    week: { ...week, label: formatWeekLabel(week), phase },
    deadline,
    cohortSize,
    bucket,
    me: summary ? {
      email,
      name: agg.rows.find(r => r.email === email)?.name,
      weeklySp: summary.weeklySp,
      weeklyRank: myRank,
      totalSp: agg.rows.find(r => r.email === email)?.totalSp ?? 0,
      pointsToTop10: summary.pointsToTop10,
      top10Cutoff: summary.top10Cutoff,
      missed: summary.missed,
      categories: summary.categories
    } : null,
    top10,
    middle
  });
});

// GET /api/weekly/timeseries?email=...
// Returns per-day cumulative SP progression within the current week.
// The client uses this to render the real-time weekly performance graph.
// Each entry has { dayIso, dayLabel, sp, cumulative, cumulativeCohort }
// where cumulative is the student's running total at end-of-day and
// cumulativeCohort is the cohort's mean running total at end-of-day.
router.get('/timeseries', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const week = weekContaining();

  // Pull raw transactions within the week, ordered chronologically.
  const txns = await SPTransaction.find({
    dateTime: { $gte: new Date(week.startMs), $lte: new Date(week.endMs) }
  })
    .select('email appliedDelta dateTime category sessionLabel')
    .sort({ dateTime: 1, createdAt: 1 })
    .lean();

  // Aggregate cohort-wide per-day totals to compute the mean curve.
  const IST_OFFSET_MIN = 330;
  const istDayKey = (d) => {
    const s = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
    return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
  };
  const cohortByDay = new Map(); // dayKey -> total SP across all students
  for (const t of txns) {
    const k = istDayKey(new Date(t.dateTime));
    cohortByDay.set(k, (cohortByDay.get(k) || 0) + (t.appliedDelta || 0));
  }
  const totalStudents = (await SPTransaction.distinct('email', {
    dateTime: { $gte: new Date(week.startMs), $lte: new Date(week.endMs) }
  })).length || 1;

  // Build the 7-day axis from Monday..Sunday.
  const dayMsgs = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dayMs = week.startMs + i * 86400000;
    days.push({ dayMs, dayLabel: dayMsgs[i], sp: 0, cohortSp: 0 });
  }

  // Bucket per-day totals for the student and the cohort.
  let myCumulative = 0;
  let cohortCumulative = 0;
  let activeDayIdx = -1;
  const myPerDay = new Map();
  for (const t of txns) {
    const k = istDayKey(new Date(t.dateTime));
    myPerDay.set(k, (myPerDay.get(k) || 0) + (t.appliedDelta || 0));
  }
  for (let i = 0; i < days.length; i++) {
    const dayStart = new Date(days[i].dayMs);
    const dayKey = istDayKey(dayStart);
    myCumulative += myPerDay.get(dayKey) || 0;
    cohortCumulative += (cohortByDay.get(dayKey) || 0);
    days[i].sp = myPerDay.get(dayKey) || 0;
    days[i].cumulative = myCumulative;
    days[i].cumulativeCohort = Math.round(cohortCumulative / totalStudents);
  }

  // Find the active day (today IST).
  const now = Date.now();
  for (let i = 0; i < days.length; i++) {
    if (now >= days[i].dayMs && now < days[i].dayMs + 86400000) activeDayIdx = i;
  }
  // Intra-day interpolation: include a fraction of the current day's SP
  // based on how far through the day we are. This produces a smooth
  // "now" point on the curve that animates forward in real time.
  let partialDay = null;
  if (activeDayIdx >= 0) {
    const elapsedFrac = Math.min(1, (now - days[activeDayIdx].dayMs) / 86400000);
    partialDay = {
      dayIdx: activeDayIdx,
      elapsedFrac,
      cumulative: Math.round(days[activeDayIdx].cumulative * elapsedFrac)
    };
  }

  res.json({
    week: { ...week, label: formatWeekLabel(week) },
    days,
    activeDayIdx,
    partialDay,
    cohortSize: totalStudents,
    finalSp: myCumulative,
    finalCohortMean: Math.round(cohortCumulative / totalStudents)
  });
});

export default router;