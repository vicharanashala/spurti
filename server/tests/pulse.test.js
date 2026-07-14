/**
 * server/tests/pulse.test.js
 *
 * Exhaustive tests for the 5-Day Pulse feature.
 * Covers computeFiveDayPulse, computeWeeklyStreak, classifyStatus,
 * projectWeeklySP, and the orchestrator computePulse.
 *
 * Run: node --test server/tests/pulse.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeFiveDayPulse,
  computeWeeklyStreak,
  classifyStatus,
  projectWeeklySP,
  computePulse,
  THRESHOLD_DAILY_5DAY,
  THRESHOLD_DAILY_5DAY_WARN,
  THRESHOLD_DAILY_5DAY_BAD,
  THRESHOLD_WEEKLY_STREAK,
  HIGH_PERF_DAILY_SP,
  STREAK_BONUS_SP
} from '../services/pulse.js';

const NOW = new Date('2026-07-10T12:00:00Z');
const DAY = 86_400_000;

const day = (n) => new Date(NOW.getTime() - n * DAY);

// ── Thresholds are correct constants ───────────────────────────────────

test('thresholds match mentor rule', () => {
  assert.equal(THRESHOLD_DAILY_5DAY, 85);
  assert.equal(THRESHOLD_DAILY_5DAY_WARN, 70);
  assert.equal(THRESHOLD_DAILY_5DAY_BAD, 50);
  assert.equal(THRESHOLD_WEEKLY_STREAK, 90);
  assert.equal(HIGH_PERF_DAILY_SP, 20);
  assert.equal(STREAK_BONUS_SP, 10);
});

// ── computeFiveDayPulse ────────────────────────────────────────────────

test('5-day pulse: all 5 days present, all 5 polls -> 100% both', () => {
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [day(0), day(1), day(2), day(3), day(4)],
    pollDates:     [day(0), day(1), day(2), day(3), day(4)],
    sessions: [{ date: day(0) }, { date: day(1) }, { date: day(2) }, { date: day(3) }, { date: day(4) }]
  });
  assert.equal(r.daysTracked, 5);
  assert.equal(r.attendancePct, 100);
  assert.equal(r.pollPct, 100);
  assert.equal(r.daysMissed, 0);
});

test('5-day pulse: attended 3 of 5 (no polls) -> 60% attendance', () => {
  // Pure attendance test: 3 days attended, no polls anywhere.
  // (Polls also count as attended in the new rule, see test 8.)
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [day(0), day(1), day(3)],
    pollDates: [],
    sessions: [day(0), day(1), day(2), day(3), day(4)].map(d => ({ date: d }))
  });
  assert.equal(r.attendancePct, 60);
  assert.equal(r.pollPct, 0);
  assert.equal(r.daysMissed, 2);
});

test('5-day pulse: attended 4 of 5 (no polls) -> 80% attendance', () => {
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [day(0), day(1), day(2), day(4)], // missed day 3
    pollDates: [],
    sessions: [day(0), day(1), day(2), day(3), day(4)].map(d => ({ date: d }))
  });
  assert.equal(r.attendancePct, 80);
  assert.equal(r.daysMissed, 1);
});

test('5-day pulse: 0 attendance 0 polls (fresh student)', () => {
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [],
    pollDates: [],
    sessions: [day(0), day(1)].map(d => ({ date: d }))
  });
  assert.equal(r.attendancePct, 0);
  assert.equal(r.pollPct, 0);
  assert.equal(r.daysMissed, 2);
});

test('5-day pulse: no sessions in window -> nulls', () => {
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [day(0)],
    pollDates: [day(0)],
    sessions: [] // no eligible days
  });
  assert.equal(r.attendancePct, null);
  assert.equal(r.pollPct, null);
  assert.equal(r.daysTracked, 1);
});

test('5-day pulse: dedupes multiple attendance rows on the same day', () => {
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [day(0), day(0), day(0), day(1)], // 3 entries on day 0
    pollDates:     [day(0), day(1)],
    sessions: [day(0), day(1)].map(d => ({ date: d }))
  });
  assert.equal(r.daysAttended, 2);
  assert.equal(r.attendancePct, 100);
});

test('5-day pulse: only poll attempts (no attendance row) still counts as present', () => {
  // A student who answered polls in session is "there" for the day
  const r = computeFiveDayPulse({
    now: NOW,
    attendanceDates: [], // no attendance debits
    pollDates: [day(0), day(1), day(2), day(3), day(4)],
    sessions: [day(0), day(1), day(2), day(3), day(4)].map(d => ({ date: d }))
  });
  assert.equal(r.daysAttended, 5);
  assert.equal(r.attendancePct, 100);
});

// ── computeWeeklyStreak ────────────────────────────────────────────────

test('streak: zero -> 0', () => {
  const r = computeWeeklyStreak({
    now: NOW,
    attendanceDates: [],
    pollDates: [],
    sessions: [day(0), day(1), day(2), day(3), day(4)].map(d => ({ date: d }))
  });
  assert.equal(r.currentStreak, 0);
});

test('streak: this week qualifies only -> 1', () => {
  // Full attendance + polls for past 7 days
  const dates = [0,1,2,3,4,5,6].map(d => day(d));
  const r = computeWeeklyStreak({
    now: NOW,
    attendanceDates: dates,
    pollDates: dates,
    sessions: dates.map(d => ({ date: d }))
  });
  assert.equal(r.currentStreak, 1);
  assert.ok(r.lastStreakWeekStart instanceof Date);
});

test('streak: 2 consecutive qualifying weeks -> 2', () => {
  // This week + last week both qualify
  const sessions = [];
  for (let d = 0; d < 14; d++) sessions.push({ date: day(d) });
  const r = computeWeeklyStreak({
    now: NOW,
    attendanceDates: sessions.map(s => s.date),
    pollDates: sessions.map(s => s.date),
    sessions
  });
  assert.equal(r.currentStreak, 2);
});

test('streak: this week < 90% (current week not yet qualifying) keeps previous streak alive', () => {
  // This week (n=0) is partial: only 3 of 7 days, so < 90%
  // Last week (n=1) is full
  const sessions = [];
  for (let d = 0; d < 14; d++) sessions.push({ date: day(d) });
  const r = computeWeeklyStreak({
    now: NOW,
    attendanceDates: [day(7), day(8), day(9), day(10), day(11), day(12), day(13)], // last week only
    pollDates: [day(7), day(8), day(9), day(10), day(11), day(12), day(13)],
    sessions
  });
  // currentStreak should be 1 (last week counts, current doesn't break it)
  assert.equal(r.currentStreak, 1);
});

test('streak: broken 2 weeks ago -> 0', () => {
  // Last week qualifies; 2 weeks ago does not
  const sessions = [];
  for (let d = 0; d < 21; d++) sessions.push({ date: day(d) });
  const r = computeWeeklyStreak({
    now: NOW,
    attendanceDates: [day(7), day(8), day(9), day(10), day(11), day(12), day(13)],
    pollDates:     [day(7), day(8), day(9), day(10), day(11), day(12), day(13)],
    sessions
  });
  assert.equal(r.currentStreak, 0); // streak broken 2 weeks ago
});

// ── classifyStatus ────────────────────────────────────────────────────

test('classify: 85+/85+ -> on-track', () => {
  assert.equal(classifyStatus({ attendancePct: 85, pollPct: 85, daysMissed: 0, daysTracked: 5 }), 'on-track');
  assert.equal(classifyStatus({ attendancePct: 100, pollPct: 100, daysMissed: 0, daysTracked: 5 }), 'on-track');
});
test('classify: 80/100 with 1 day missed -> at-risk (recovery possible)', () => {
  // 80% means 4/5 days attended = 1 day missed -> at-risk
  assert.equal(classifyStatus({ attendancePct: 80, pollPct: 100, daysMissed: 1, daysTracked: 5 }), 'at-risk');
});
test('classify: 60/60 with 3 days missed -> fallen-behind (either < 70% or 2+ missed)', () => {
  // 60% with 5 sessions = 2 days missed; either condition triggers fallen-behind
  assert.equal(classifyStatus({ attendancePct: 60, pollPct: 60, daysMissed: 3, daysTracked: 5 }), 'fallen-behind');
});
test('classify: 80/80 with 1 day missed -> at-risk (recovery possible)', () => {
  // 80% means 4/5 days attended = 1 day missed
  assert.equal(classifyStatus({ attendancePct: 80, pollPct: 80, daysMissed: 1, daysTracked: 5 }), 'at-risk');
});
test('classify: missed 2+ days even with 90% both -> fallen-behind', () => {
  // Edge case: the test data is inconsistent (90% with 2 days missed is
  // mathematically impossible), but the policy says: 2+ days missed is
  // always fallen-behind regardless.
  assert.equal(classifyStatus({ attendancePct: 90, pollPct: 90, daysMissed: 2, daysTracked: 5 }), 'fallen-behind');
});
test('classify: 30/30 -> fallen-behind', () => {
  assert.equal(classifyStatus({ attendancePct: 30, pollPct: 30, daysMissed: 4, daysTracked: 5 }), 'fallen-behind');
});
test('classify: 0 days tracked -> no-data', () => {
  assert.equal(classifyStatus({ attendancePct: null, pollPct: null, daysMissed: 0, daysTracked: 0 }), 'no-data');
});

// ── projectWeeklySP ────────────────────────────────────────────────────

test('projection: 90+/90+ with streak -> 20 daily × 6 + 10 bonus = 130', () => {
  const p = projectWeeklySP(95, 95, 2);
  assert.equal(p.daily, 20);
  assert.equal(p.weekly, 120);
  assert.equal(p.bonus, 10);
  assert.equal(p.total, 130);
  assert.equal(p.onStreak, true);
});
test('projection: streak of 1 still counts as active', () => {
  const p = projectWeeklySP(95, 95, 1);
  assert.equal(p.onStreak, true);
  assert.equal(p.total, 130);
});
test('projection: no streak, 90+ both -> 10+10 = 20 daily, 120 weekly, no bonus', () => {
  const p = projectWeeklySP(95, 95, 0);
  assert.equal(p.daily, 20);
  assert.equal(p.weekly, 120);
  assert.equal(p.bonus, 0);
  assert.equal(p.onStreak, false);
});
test('projection: 75/75 -> 5+5 = 10 daily, 60 weekly', () => {
  const p = projectWeeklySP(75, 75, 0);
  assert.equal(p.daily, 10);
  assert.equal(p.weekly, 60);
  assert.equal(p.bonus, 0);
});
test('projection: 50/50 -> 3+3 = 6 daily, 36 weekly', () => {
  const p = projectWeeklySP(50, 50, 0);
  assert.equal(p.daily, 6);
  assert.equal(p.weekly, 36);
});
test('projection: 0/0 -> 0 daily, 0 weekly', () => {
  const p = projectWeeklySP(0, 0, 0);
  assert.equal(p.daily, 0);
  assert.equal(p.weekly, 0);
});
test('projection: 0/null or null/anything -> 0 for that side', () => {
  // null treated as 0, so the day-side defaults to 0
  const p = projectWeeklySP(0, null, 0);
  assert.equal(p.daily, 0);
  assert.equal(p.weekly, 0);
});

// ── computePulse (orchestrator) ────────────────────────────────────────

test('orchestrator: strong student -> on-track + streak + 130 projection', () => {
  // 7 days, all present, all polls, both >= 90
  const dates = [0,1,2,3,4,5,6].map(d => day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = dates.map(d => ({
    category: 'attendance', appliedDelta: 10, dateTime: d
  }));
  const polls = dates.map(d => ({ createdAt: d, responses: [{ attempted: true }] }));
  const attendance = []; // derived from transactions
  const r = computePulse({ now: NOW, transactions, attendance, polls, sessions });
  assert.equal(r.status, 'on-track');
  assert.equal(r.streak.currentStreak, 1);
  assert.equal(r.projection.total, 130);
  assert.equal(r.earningWeeklyBonus, true);
  assert.equal(r.fiveDay.attendancePct, 100);
  assert.equal(r.fiveDay.pollPct, 100);
  assert.equal(r.recovery, null);
});

test('orchestrator: missed 1 day with both >= 70% -> at-risk (recovery)', () => {
  // 4 of 5 days attended, 4 of 5 polled. 80%/80% = at-risk (not on-track).
  // daysMissed = 1.
  const dates = [0,1,2,3,4].map(d => day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = [
    day(0), day(1), day(2), day(4) // missed day 3
  ].map(d => ({ category: 'attendance', appliedDelta: 10, dateTime: d }));
  const polls = [day(0), day(1), day(2), day(4)].map(d => ({ createdAt: d, responses: [{ attempted: true }] }));
  const r = computePulse({ now: NOW, transactions, attendance: [], polls, sessions });
  assert.equal(r.status, 'at-risk');
  assert.equal(r.fiveDay.daysMissed, 1);
  assert.ok(r.recovery);
  assert.equal(r.recovery.severity, 'warning');
  assert.match(r.recovery.title, /missed 1 day/i);
});

test('orchestrator: missed 2+ days -> fallen-behind, critical recovery', () => {
  // Only 2 of 5 days present
  const dates = [0,1,2,3,4].map(d => day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = [day(0), day(1)].map(d => ({
    category: 'attendance', appliedDelta: 10, dateTime: d
  }));
  const polls = [day(0), day(1)].map(d => ({ createdAt: d, responses: [{ attempted: true }] }));
  const r = computePulse({ now: NOW, transactions, attendance: [], polls, sessions });
  assert.equal(r.status, 'fallen-behind');
  assert.equal(r.fiveDay.daysMissed, 3);
  assert.equal(r.recovery.severity, 'critical');
});

test('orchestrator: no data -> no-data status, no recovery', () => {
  const r = computePulse({ now: NOW, transactions: [], attendance: [], polls: [], sessions: [] });
  assert.equal(r.status, 'no-data');
  assert.equal(r.recovery, null);
});

test('orchestrator: derives attendance from SPTransaction when no AttendanceRecord', () => {
  // Many students get their attendance counted via SP transactions only
  const dates = [0,1,2,3,4].map(d => day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = dates.map(d => ({
    category: 'attendance', appliedDelta: 10, dateTime: d
  }));
  const r = computePulse({ now: NOW, transactions, attendance: [], polls: [], sessions });
  assert.equal(r.fiveDay.attendancePct, 100); // derived from SP tx
});

test('orchestrator: streak requires poll >= 90% (not just att)', () => {
  // 5 days, all attended, but polls only 3 of 5
  const dates = [0,1,2,3,4].map(d => day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = dates.map(d => ({ category: 'attendance', appliedDelta: 10, dateTime: d }));
  const polls = [day(0), day(1), day(2)].map(d => ({ createdAt: d, responses: [{ attempted: true }] }));
  const r = computePulse({ now: NOW, transactions, attendance: [], polls, sessions });
  // 5/5 att (100%) but 3/5 polls (60%) -> below 90% polls -> no streak
  assert.equal(r.streak.currentStreak, 0);
  assert.equal(r.earningWeeklyBonus, false);
  assert.equal(r.projection.bonus, 0);
});

test('orchestrator: 7+ days of full data = streak 1', () => {
  // 8 days, all attended + polled -> streak should be 1 (7-day window n=0 qualifies)
  const dates = [];
  for (let d = 0; d < 8; d++) dates.push(day(d));
  const sessions = dates.map(d => ({ date: d }));
  const transactions = dates.map(d => ({ category: 'attendance', appliedDelta: 10, dateTime: d }));
  const polls = dates.map(d => ({ createdAt: d, responses: [{ attempted: true }] }));
  const r = computePulse({ now: NOW, transactions, attendance: [], polls, sessions });
  // n=0: 7 days, 100/100 -> qualifies -> streak=1
  // n=1: 1 day (day 7), < 5 eligible days -> skip
  assert.equal(r.streak.currentStreak, 1);
  assert.equal(r.earningWeeklyBonus, true);
  assert.equal(r.projection.total, 130);
});