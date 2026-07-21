import express from 'express';
import { latestRecap, recoveryPlanFor } from '../services/weeklyRecap.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// GET /api/weekly/recap?email=...
// Returns:
//   - recap: { weekStart, weekEnd, cohortSize, top10[], bottom50[] }
//   - plan: AI Recovery Plan object (only if this student was in the
//     bottom 50 of the latest recap; otherwise null)
//   - newWeek: { weekStart, label } — the upcoming week that started
//     Monday 06:00 IST
// All callers also receive a stable `recapId` (weekStart) so the client
// can stamp localStorage dismissals with it.
router.get('/recap', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const recap = await latestRecap();
  if (!recap) {
    return res.json({
      recap: null,
      plan: null,
      newWeek: null,
      recapId: null,
      message: 'No recap yet — the first recap is generated after the first week ends.'
    });
  }
  const plan = await recoveryPlanFor(email);
  res.json({
    recap: {
      weekStart: recap.weekStart,
      weekEnd: recap.weekEnd,
      cohortSize: recap.cohortSize,
      top10: recap.top10.map(r => ({
        rank: r.rank,
        name: r.name,
        weeklySp: r.weeklySp,
        weeklyBadge: r.weeklyBadge,
        learningPct: r.learningPct
      })),
      bottom50: recap.bottom50.map(r => ({
        rank: r.rank,
        name: r.name,
        weeklySp: r.weeklySp
      })),
      finalizedAt: recap.finalizedAt
    },
    plan,
    recapId: recap.weekStart,
    newWeek: {
      weekStart: recap.weekStart
    }
  });
});

export default router;