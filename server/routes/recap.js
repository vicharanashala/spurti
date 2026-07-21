import express from 'express';
import {
  latestRecap,
  recoveryPlanFor,
  goalFor,
  liveProgressFor
} from '../services/weeklyRecap.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// GET /api/weekly/recap?email=...
// Returns everything the Weekly Goal Card needs in one round-trip:
//   - recap   : last week's archived Top 10 + Bottom 50
//   - goal    : personalized Weekly Goal (close / average / bottom)
//   - plan    : AI Recovery Plan (only for bottom-50 students)
//   - progress: live counts for the current week (attendance/poll/etc)
//   - recapId : weekStart of the recap — used for dismissal flags
router.get('/recap', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const recap = await latestRecap();
  if (!recap) {
    return res.json({
      recap: null,
      plan: null,
      goal: null,
      progress: null,
      recapId: null,
      newWeek: null,
      message: 'No recap yet.'
    });
  }
  const [plan, goal, progress] = await Promise.all([
    recoveryPlanFor(email),
    goalFor(email),
    liveProgressFor(email)
  ]);
  res.json({
    recap: {
      weekStart: recap.weekStart,
      weekEnd: recap.weekEnd,
      cohortSize: recap.cohortSize,
      top10: recap.top10.map(r => ({
        rank: r.rank, name: r.name, weeklySp: r.weeklySp,
        weeklyBadge: r.weeklyBadge, learningPct: r.learningPct
      })),
      bottom50: recap.bottom50.map(r => ({
        rank: r.rank, name: r.name, weeklySp: r.weeklySp
      })),
      finalizedAt: recap.finalizedAt
    },
    plan,
    goal,
    progress,
    recapId: recap.weekStart,
    newWeek: { weekStart: recap.weekStart }
  });
});

// GET /api/weekly/live?email=...
// Lightweight live progress poll — used by the Weekly Goal Card to
// refresh its progress bars / AI motivation every 60s.
router.get('/live', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const progress = await liveProgressFor(email);
  res.json({ progress });
});

export default router;