import express from 'express';
import { latestRecap, recoveryPlanFor } from '../services/weeklyRecap.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// ============================================================
// Weekly Goal derivation
// Pure function — picks one of three motivational buckets based on
// the student's prior-week rank, computes the estimated SP / projected
// rank / targets, and turns the AI Coach plan into a milestone path.
// ============================================================
const GOAL_TARGETS = {
  close: [
    { id: 'attendance', label: '100% Attendance' },
    { id: 'poll',       label: 'Complete every Daily Poll' },
    { id: 'discussion', label: 'Participate in Daily Discussions' },
    { id: 'challenge',  label: "Complete this Week's Challenge" }
  ],
  average: [
    { id: 'attendance', label: '100% Attendance' },
    { id: 'poll',       label: 'Daily Poll Participation' },
    { id: 'discussion', label: 'Join at least 3 Discussions' },
    { id: 'challenge',  label: 'Complete Weekly Challenge' }
  ],
  bottom: [
    { id: 'attendance', label: 'Attend every session' },
    { id: 'poll',       label: 'Complete every Daily Poll' },
    { id: 'discussion', label: 'Join one Discussion every day' },
    { id: 'challenge',  label: 'Complete the Weekly Challenge' }
  ]
};

function pickBucket(myRank, cohortSize) {
  if (!myRank) return 'average';
  if (myRank <= 10) return 'close'; // already in top10 — handled in distance message
  if (myRank <= 25) return 'close';
  if (cohortSize && myRank > cohortSize - 50) return 'bottom';
  return 'average';
}

function pickHeadline(bucket, myRank) {
  if (bucket === 'close' && myRank) {
    const ranksAway = Math.max(0, myRank - 10);
    return {
      title: '🎯 Weekly Goal',
      headline: `You were only ${ranksAway} rank${ranksAway === 1 ? '' : 's'} away from becoming a Weekly Champion.`,
      sub: "Stay consistent this week and you'll have a great chance of reaching the Top 10."
    };
  }
  if (bucket === 'average') {
    return {
      title: '🚀 Keep Growing',
      headline: 'You made steady progress last week.',
      sub: 'Maintain your consistency and aim for the Top 20.'
    };
  }
  return {
    title: '💙 Fresh Start',
    headline: 'Every week is a new beginning.',
    sub: 'Small daily improvements will help you move up quickly.'
  };
}

function deriveGoal(allRankedRow, recap) {
  if (!allRankedRow || !recap) return null;
  // The recap's allRanked entries store `rank` (not `weeklyRank`).
  const myRank = allRankedRow.rank;
  const bucket = pickBucket(myRank, recap.cohortSize);
  const titles = pickHeadline(bucket, myRank);
  const targets = GOAL_TARGETS[bucket];
  const requiredSp = bucket === 'close' ? 42
                  : bucket === 'average' ? 30
                  : 36;
  const projectedRank = bucket === 'close' ? 'Top 10'
                      : bucket === 'average' ? 'Top 20'
                      : 'Top 30';
  return {
    bucket,
    title: titles.title,
    headline: titles.headline,
    subhead: titles.sub,
    targets,
    requiredSp,
    projectedRank,
    priorRank: myRank,
    priorWeeklySp: allRankedRow.weeklySp
  };
}

// GET /api/weekly/recap?email=...
// Returns everything the dashboard renders after the Monday-morning
// recap experience:
//   - recap     : last week's Top 10 + Bottom 50
//   - plan      : AI Recovery plan (only for bottom-50 students)
//   - goal      : personalized Weekly Goal Card payload (always set)
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
      newWeek: null,
      recapId: null,
      message: 'No recap yet — the first recap is generated after the first week ends.'
    });
  }
  const [plan, goal] = await Promise.all([
    recoveryPlanFor(email),
    Promise.resolve(deriveGoal(recap.allRanked?.find(r => r.email === email) || null, recap))
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
    recapId: recap.weekStart,
    newWeek: { weekStart: recap.weekStart }
  });
});

export default router;