import { levelFor, leagueBand, legendBadge } from './levels.js';

const QUERY_UNIT = 5;
const QUERY_CAP = 200;

const SPA_LEARN_UNIT = 5;
const SPA_LEARN_CAP = 50;

const SPA_TEACH_UNIT = 10;
const SPA_TEACH_CAP = 25;

const ATTENDANCE_TIERS = [
  { min: 90, sp: 10 },
  { min: 75, sp: 5 },
  { min: 50, sp: 3 },
  { min: 0, sp: 0 },
];

function tierSp(percentage) {
  const pct = Number(percentage) || 0;

  for (const tier of ATTENDANCE_TIERS) {
    if (pct >= tier.min) return tier.sp;
  }

  return 0;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function nextMilestones(currentSp) {
  const sp = Math.max(0, Number(currentSp) || 0);

  const milestones = [
    100,
    200,
    300,
    400,
    500,
    600,
    700,
    800,
    900,
    1000,
    1100,
    1200,
    1300,
    1400,
    1500,
  ];

  return milestones
    .filter((milestone) => milestone > sp)
    .slice(0, 3)
    .map((milestone) => ({
      target: milestone,
      remaining: milestone - sp,
    }));
}

export function simulateSp(studentState = {}, inputs = {}) {
  const currentSp = Math.max(
    0,
    Number(studentState.currentSp) || 0
  );

  const highestSpEver = Math.max(
    currentSp,
    Number(studentState.highestSpEver) || 0
  );

  const sessions = Math.max(
    0,
    Math.floor(Number(inputs.sessions) || 0)
  );

  const attendancePct = clamp(
    Number(inputs.attendancePct) || 0,
    0,
    100
  );

  const pollPct = clamp(
    Number(inputs.pollPct) || 0,
    0,
    100
  );

  const additionalSpaLearn = Math.max(
    0,
    Math.floor(Number(inputs.additionalSpaLearn) || 0)
  );

  const additionalSpaTeach = Math.max(
    0,
    Math.floor(Number(inputs.additionalSpaTeach) || 0)
  );

  const additionalQueries = Math.max(
    0,
    Math.floor(Number(inputs.additionalQueries) || 0)
  );

  const existingSpaLearn = Math.max(
    0,
    Math.floor(Number(studentState.spaLearn || 0))
  );

  const existingSpaTeach = Math.max(
    0,
    Math.floor(Number(studentState.spaTeach || 0))
  );

  const existingQuerySp = Math.max(
    0,
    Math.floor(Number(studentState.querySp || 0))
  );

  // Attendance SP
  const attendanceSp =
    sessions * tierSp(attendancePct);

  // Poll SP
  const pollSp =
    sessions * tierSp(pollPct);

  // SPA Learning SP
  const spaLearnHeadroom = Math.max(
    0,
    SPA_LEARN_CAP - existingSpaLearn
  );

  const appliedSpaLearn = Math.min(
    additionalSpaLearn,
    spaLearnHeadroom
  );

  const spaLearnSp =
    appliedSpaLearn * SPA_LEARN_UNIT;

  // SPA Teaching SP
  const spaTeachHeadroom = Math.max(
    0,
    SPA_TEACH_CAP - existingSpaTeach
  );

  const appliedSpaTeach = Math.min(
    additionalSpaTeach,
    spaTeachHeadroom
  );

  const spaTeachSp =
    appliedSpaTeach * SPA_TEACH_UNIT;

  // Query SP
  const queryHeadroom = Math.max(
    0,
    QUERY_CAP - existingQuerySp
  );

  const appliedQueries = Math.min(
    additionalQueries,
    Math.floor(queryHeadroom / QUERY_UNIT)
  );

  const querySp =
    appliedQueries * QUERY_UNIT;

  // Total gains
  const gains = {
    attendance: attendanceSp,
    polls: pollSp,
    spaLearn: spaLearnSp,
    spaTeach: spaTeachSp,
    queries: querySp,
  };

  const totalGain = Object.values(gains).reduce(
    (sum, value) => sum + value,
    0
  );

  // Projected state
  const projectedSp =
    currentSp + totalGain;

  const projectedHighestSpEver = Math.max(
    highestSpEver,
    projectedSp
  );

  return {
    current: {
      sp: currentSp,
      highestSpEver,
      level: levelFor(highestSpEver),
      league: leagueBand(currentSp),
      legend: legendBadge(highestSpEver),
    },

    gains: {
      ...gains,
      total: totalGain,
    },

    projected: {
      sp: projectedSp,
      highestSpEver: projectedHighestSpEver,
      level: levelFor(projectedHighestSpEver),
      league: leagueBand(projectedSp),
      legend: legendBadge(projectedHighestSpEver),
    },

    applied: {
      sessions,
      attendancePct,
      pollPct,
      spaLearn: appliedSpaLearn,
      spaTeach: appliedSpaTeach,
      queries: appliedQueries,
    },

    headroom: {
      spaLearn: spaLearnHeadroom,
      spaTeach: spaTeachHeadroom,
      queries: queryHeadroom,
    },

    milestones: nextMilestones(projectedSp),
  };
}
