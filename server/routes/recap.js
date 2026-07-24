import express from 'express';
import { latestRecap, recoveryPlanFor } from '../services/weeklyRecap.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// ============================================================
// Case derivation — powers the WeeklyLearningInsightsPopup.
//   'top10'   : rank 1-10 last week
//   'close'   : rank 11-cohortSize-50 AND pointsToTop10 in [1..20]
//   'bottom50': in the recap's bottom50 list (never named in UI)
//   'other'   : everyone else (rank > 10, gap > 20 OR gap = 0)
// ============================================================
function deriveCase(me, recap) {
  if (!me) return 'other';
  const rank = Number(me.weeklyRank);
  if (rank > 0 && rank <= 10) return 'top10';
  const isInBottom50 = Array.isArray(recap?.bottom50)
    && recap.bottom50.some(r => r.email === me.email);
  if (isInBottom50) return 'bottom50';
  const gap = Number(me.pointsToTop10);
  if (gap > 0 && gap <= 20) return 'close';
  return 'other';
}

// GET /api/weekly/recap?email=...
// Returns:
//   - recap     : last week's Top 10 + Bottom 50
//   - plan      : AI Recovery plan (only for bottom-50 students)
//   - goal      : legacy WeeklyGoalCard payload (always set)
//   - case      : 'top10' | 'close' | 'other' | 'bottom50' — drives the
//                 WeeklyLearningInsightsPopup cascade
//   - me        : student summary incl. rank, weeklySp, pointsToTop10,
//                 attendance/poll/challenge counts
//   - newWeek   : the upcoming week that started Monday 06:00
//   - recapId   : weekStart — used for dismissal flags
router.get('/recap', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const recap = await latestRecap();
  if (!recap) {
    return res.json({
      recap: null,
      plan: null,
      goal: null,
      me: null,
      case: null,
      newWeek: null,
      recapId: null,
      message: 'No recap yet — the first recap is generated after the first week ends.'
    });
  }
  // Look up the student's row in allRanked.
  const myRow = recap.allRanked?.find(r => r.email === email);
  const me = myRow ? {
    email,
    name: myRow.name,
    weeklyRank: myRow.rank,
    weeklySp: myRow.weeklySp,
    attendanceCount: myRow.attendanceCount,
    pollCount: myRow.pollCount,
    challengeCount: myRow.challengeCount,
    pointsToTop10: Math.max(0, (recap.top10[9]?.weeklySp ?? 0) - myRow.weeklySp)
  } : null;
  const plan = await recoveryPlanFor(email);
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
    me,
    case: deriveCase(me, recap),
    recapId: recap.weekStart,
    newWeek: { weekStart: recap.weekStart }
  });
});

export default router;