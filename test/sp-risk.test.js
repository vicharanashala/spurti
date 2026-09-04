import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leagueBand } from '../server/services/levels.js';
import {
  WINDOW_DAYS,
  attendancePercentage,
  pollParticipationPercentage,
  pollQualityScore,
  queryActivityCount,
  overallRiskScore,
  riskLevelFor,
  projectedSpGain,
  computeRiskState,
  parseSessionLabelDate
} from '../server/services/spRisk.js';

const now = new Date('2026-09-03T12:00:00.000Z');

function daysAgo(n, extra = {}) {
  return {
    dateTime: new Date(now.getTime() - n * 86400000),
    createdAt: new Date(now.getTime() - n * 86400000),
    ...extra
  };
}

describe('parseSessionLabelDate', () => {
  test('reads leading and parenthetical labels', () => {
    const a = parseSessionLabelDate('15 May Morning', now);
    const b = parseSessionLabelDate('Day 10 (26 May)', now);
    assert.equal(a.getUTCMonth(), 4);
    assert.equal(a.getUTCDate(), 15);
    assert.equal(b.getUTCDate(), 26);
  });
});

describe('metric helpers', () => {
  test('attendance percentage is minutes-weighted', () => {
    assert.equal(attendancePercentage([
      { attendedMinutes: 54, totalSessionMinutes: 60, attendancePercentage: 90 },
      { attendedMinutes: 30, totalSessionMinutes: 60, attendancePercentage: 50 }
    ], []), 70);
  });

  test('poll participation uses attempted/total', () => {
    assert.equal(pollParticipationPercentage([
      { attemptedQuestions: 8, totalQuestions: 10 },
      { attemptedQuestions: 2, totalQuestions: 10 }
    ]), 50);
  });

  test('poll quality is mean band / 10', () => {
    assert.equal(pollQualityScore([
      { appliedDelta: 10 },
      { appliedDelta: 5 },
      { appliedDelta: 0 }
    ]), 50);
  });

  test('query count ignores non-positive deltas', () => {
    assert.equal(queryActivityCount([
      { appliedDelta: 5 },
      { appliedDelta: 5 },
      { appliedDelta: -10 }
    ]), 2);
  });
});

describe('risk score and level', () => {
  test('perfect window is Low', () => {
    const score = overallRiskScore({
      attendancePct: 100, pollParticipationPct: 100, pollQuality: 100, queryCount: 3
    });
    assert.equal(score, 0);
    assert.equal(riskLevelFor(score), 'Low');
  });

  test('empty window is High', () => {
    const score = overallRiskScore({
      attendancePct: 0, pollParticipationPct: 0, pollQuality: 0, queryCount: 0
    });
    assert.equal(score, 100);
    assert.equal(riskLevelFor(score), 'High');
  });

  test('mid engagement is Medium', () => {
    const score = overallRiskScore({
      attendancePct: 70, pollParticipationPct: 60, pollQuality: 50, queryCount: 1
    });
    assert.equal(riskLevelFor(score), 'Medium');
  });
});

describe('computeRiskState', () => {
  test('returns the Phase 1 fields from last-14-day data only', () => {
    const state = computeRiskState({
      student: { totalSp: 420, email: 'a@test.com' },
      now,
      attendance: [
        daysAgo(3, { sessionLabel: '1 Sep Evening', attendedMinutes: 20, totalSessionMinutes: 60, attendancePercentage: 33 }),
        daysAgo(40, { sessionLabel: 'old', attendedMinutes: 60, totalSessionMinutes: 60, attendancePercentage: 100 })
      ],
      polls: [
        daysAgo(3, { sessionLabel: '1 Sep Evening', attemptedQuestions: 2, totalQuestions: 10 })
      ],
      transactions: [
        daysAgo(3, { category: 'attendance', sessionLabel: '1 Sep Evening', appliedDelta: 0 }),
        daysAgo(3, { category: 'poll', sessionLabel: '1 Sep Evening', appliedDelta: 3 }),
        daysAgo(2, { category: 'query', sessionLabel: '', appliedDelta: 5 }),
        daysAgo(40, { category: 'poll', sessionLabel: 'old', appliedDelta: 10 })
      ],
      sessions: []
    });

    assert.equal(state.windowDays, WINDOW_DAYS);
    assert.equal(state.attendancePercentage, 33);
    assert.equal(state.pollParticipationPercentage, 20);
    assert.equal(state.pollQualityScore, 30);
    assert.equal(state.queryActivityCount, 1);
    assert.ok(state.riskScore >= 0 && state.riskScore <= 100);
    assert.equal(['Low', 'Medium', 'High'].includes(state.riskLevel), true);
    assert.ok(Array.isArray(state.reasons) && state.reasons.length > 0);
    assert.ok(Array.isArray(state.recoverySuggestions) && state.recoverySuggestions.length > 0);
    for (const s of state.recoverySuggestions) {
      assert.equal(typeof s.action, 'string');
      assert.equal(typeof s.estimatedSp, 'number');
      assert.equal(['high', 'medium', 'low'].includes(s.priority), true);
    }
    const b = state.breakdown;
    assert.ok(b.attendance && b.pollParticipation && b.pollQuality && b.queryActivity);
    const pointsSum = b.attendance.points + b.pollParticipation.points + b.pollQuality.points + b.queryActivity.points;
    assert.equal(Math.round(pointsSum), state.riskScore);
    assert.equal(state.daysAnalyzed, WINDOW_DAYS);
    assert.equal(state.sessionsConsidered, 1);
    assert.equal(state.pollsConsidered, 1);
    assert.equal(state.queriesConsidered, 1);
    assert.ok(state.projectedSpGain >= 0);
    assert.equal(state.trophyLeague, leagueBand(420));
    assert.equal(state.projectedLeague, leagueBand(420 + state.projectedSpGain));
    assert.equal(state.metrics.pollSp, 3);
  });

  test('does not treat old-window activity as current', () => {
    const state = computeRiskState({
      student: { totalSp: 100 },
      now,
      attendance: [daysAgo(20, { sessionLabel: 'old', attendedMinutes: 60, totalSessionMinutes: 60, attendancePercentage: 100 })],
      polls: [daysAgo(20, { sessionLabel: 'old', attemptedQuestions: 10, totalQuestions: 10 })],
      transactions: [daysAgo(20, { category: 'query', appliedDelta: 5 })],
      sessions: []
    });
    assert.equal(state.attendancePercentage, 0);
    assert.equal(state.pollParticipationPercentage, 0);
    assert.equal(state.queryActivityCount, 0);
    assert.equal(state.riskLevel, 'High');
    assert.equal(state.sessionsConsidered, 0);
    assert.equal(state.pollsConsidered, 0);
    assert.equal(state.queriesConsidered, 0);
    assert.equal(state.daysAnalyzed, WINDOW_DAYS);
  });
});

describe('projectedSpGain', () => {
  test('is the shortfall vs top band plus missing query pace, capped', () => {
    assert.equal(projectedSpGain({
      attendanceSessions: 2, pollSessions: 2, attendanceSp: 10, pollSp: 10, queryCount: 1
    }), 20 + 10);
  });
});
