import express from 'express';
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

  // Mid-table (rank 11..cohortSize - 50) and bottom 50 are returned for the
  // various experiences. Clients decide what to render based on rank.
  const middle = agg.rows
    .filter(r => r.weeklyRank > 10 && r.weeklyRank <= Math.max(10, agg.rows.length - 50))
    .map(r => ({ rank: r.weeklyRank, name: r.name, weeklySp: r.weeklySp, isMe: r.email === email }));
  const bottom = agg.rows.slice(-50).map(r => ({
    rank: r.weeklyRank, name: r.name, weeklySp: r.weeklySp, isMe: r.email === email
  }));

  // Pre-compute current user's bucket so the popup can be routed.
  const myRank = summary?.weeklyRank ?? null;
  const cohortSize = agg.rows.length;
  let bucket = 'pre-start';
  if (myRank == null) bucket = 'unknown';
  else if (myRank <= 10) bucket = 'top10';
  else if (myRank > cohortSize - 50) bucket = 'bottom50';
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
    middle,
    bottom
  });
});

export default router;