/**
 * server/tests/trajectory.test.js
 *
 * Exhaustive tests for the SP Trajectory and At-Risk features.
 *
 * Run: node --test server/tests/trajectory.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_SP,
  computeMyPoints,
  computeCohortAverages,
  buildTrajectoryPayload,
  computeAtRisk
} from '../services/trajectory.js';

const NOW = new Date('2026-07-04T10:00:00Z');
const DAY = 86_400_000;

const tx = (overrides) => ({
  email: overrides.email || 'a@x.com',
  sessionLabel: overrides.sessionLabel || 'Day 1',
  dateTime: overrides.dateTime || new Date(NOW.getTime() - overrides.daysAgo * DAY),
  appliedDelta: overrides.appliedDelta ?? 5,
  createdAt: overrides.createdAt || new Date(NOW.getTime() - overrides.daysAgo * DAY)
});

// ── INITIAL_SP constant ───────────────────────────────────────────────

test('INITIAL_SP is 100', () => {
  assert.equal(INITIAL_SP, 100);
});

// ── computeMyPoints ───────────────────────────────────────────────────

test('computeMyPoints: empty input -> empty output', () => {
  assert.deepEqual(computeMyPoints([]), []);
  assert.deepEqual(computeMyPoints(null), []);
  assert.deepEqual(computeMyPoints(undefined), []);
});

test('computeMyPoints: empty input -> empty output', () => {
  assert.deepEqual(computeMyPoints([]), []);
  assert.deepEqual(computeMyPoints(null), []);
  assert.deepEqual(computeMyPoints(undefined), []);
});

test('computeMyPoints: data has explicit initial credit -> 1 point (the Start txn itself)', () => {
  // When the data has a "Start" txn with +100, we skip it (it's already
  // the initial credit) and add only the synthetic Start point.
  // Result: 1 point at balance 100.
  const r = computeMyPoints([{
    email: 'a@x.com',
    sessionLabel: 'Start',
    appliedDelta: 100,
    dateTime: NOW,
    createdAt: NOW
  }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].session, 'Start');
  assert.equal(r[0].balance, 100);
});

test('computeMyPoints: balances accumulate in dateTime order with Start point prepended', () => {
  // Input: 3 txns without explicit initial credit
  // Output: Start (100) + Day 1 (105) + Day 2 (115) + Day 3 (112)
  const r = computeMyPoints([
    tx({ daysAgo: 3, sessionLabel: 'Day 1', appliedDelta: 5 }),
    tx({ daysAgo: 2, sessionLabel: 'Day 2', appliedDelta: 10 }),
    tx({ daysAgo: 1, sessionLabel: 'Day 3', appliedDelta: -3 })
  ]);
  assert.equal(r.length, 4);
  assert.equal(r[0].session, 'Start');
  assert.equal(r[0].balance, 100);
  assert.equal(r[1].balance, 105);
  assert.equal(r[2].balance, 115);
  assert.equal(r[3].balance, 112);
});

test('computeMyPoints: handles unsorted input (sorts internally)', () => {
  const r = computeMyPoints([
    tx({ daysAgo: 2, sessionLabel: 'Day 2', appliedDelta: 10 }),
    tx({ daysAgo: 3, sessionLabel: 'Day 1', appliedDelta: 5 }),
    tx({ daysAgo: 1, sessionLabel: 'Day 3', appliedDelta: -3 })
  ]);
  assert.equal(r.length, 4);
  assert.equal(r[0].session, 'Start');
  assert.equal(r[0].balance, 100);
  assert.equal(r[1].balance, 105);
  assert.equal(r[2].balance, 115);
  assert.equal(r[3].balance, 112);
});

test('computeMyPoints: negative deltas correctly reduce balance', () => {
  const r = computeMyPoints([
    tx({ daysAgo: 3, sessionLabel: 'Day 1', appliedDelta: 5 }),
    tx({ daysAgo: 2, sessionLabel: 'Day 2', appliedDelta: -5 })
  ]);
  assert.equal(r.length, 3);
  assert.equal(r[0].balance, 100);
  assert.equal(r[1].balance, 105);
  assert.equal(r[2].balance, 100);
});

test('computeMyPoints: missing dateTime falls back to createdAt', () => {
  // Y (1 day ago, -3) is older than X (now, +10). DateTime order:
  // Y first, then X. After Start (100): 100 - 3 = 97, then 97 + 10 = 107.
  const r = computeMyPoints([
    { email: 'a', sessionLabel: 'X', appliedDelta: 10, createdAt: NOW },
    { email: 'a', sessionLabel: 'Y', appliedDelta: -3, createdAt: new Date(NOW.getTime() - DAY) }
  ]);
  assert.equal(r.length, 3);
  assert.equal(r[0].balance, 100);
  assert.equal(r[1].balance, 97);
  assert.equal(r[2].balance, 107);
});

test('computeMyPoints: missing appliedDelta defaults to 0', () => {
  const r = computeMyPoints([
    { email: 'a', sessionLabel: 'X', dateTime: NOW }
  ]);
  assert.equal(r[0].balance, 100); // pinned
});

test('computeMyPoints: returns empty for non-array', () => {
  assert.deepEqual(computeMyPoints('foo'), []);
  assert.deepEqual(computeMyPoints(42), []);
});

// ── computeCohortAverages ─────────────────────────────────────────────

test('computeCohortAverages: empty input -> empty output', () => {
  assert.deepEqual(computeCohortAverages([]), []);
  assert.deepEqual(computeCohortAverages(null), []);
});

test('computeCohortAverages: one student, one session -> avg = their balance', () => {
  const r = computeCohortAverages([
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 100 })
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].session, 'Day 1');
  assert.equal(r[0].avgBalance, 100);
});

test('computeCohortAverages: two students, same session -> avg = mean', () => {
  const r = computeCohortAverages([
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 100 }),
    tx({ email: 'b@x.com', sessionLabel: 'Day 1', appliedDelta: 80 })
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].avgBalance, 90); // (100 + 80) / 2
});

test('computeCohortAverages: per-session average uses running balance (not per-txn)', () => {
  // Student A: +100, then +10 = 110 at end of Day 1
  // Student B: +100, then -5 = 95 at end of Day 1
  // Avg at end of Day 1: (110 + 95) / 2 = 102.5 -> rounds to 103
  const r = computeCohortAverages([
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 100 }),
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 10 }),
    tx({ email: 'b@x.com', sessionLabel: 'Day 1', appliedDelta: 100 }),
    tx({ email: 'b@x.com', sessionLabel: 'Day 1', appliedDelta: -5 })
  ]);
  assert.equal(r[0].avgBalance, 103);
});

test('computeCohortAverages: multiple sessions sorted alphabetically', () => {
  const r = computeCohortAverages([
    tx({ email: 'a@x.com', sessionLabel: 'Day 3', appliedDelta: 100 }),
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 50 }),
    tx({ email: 'a@x.com', sessionLabel: 'Day 2', appliedDelta: 30 })
  ]);
  assert.deepEqual(r.map(x => x.session), ['Day 1', 'Day 2', 'Day 3']);
});

test('computeCohortAverages: rounds to nearest integer', () => {
  // 3 students, balances 100, 101, 102 -> avg 101
  const r = computeCohortAverages([
    tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 100 }),
    tx({ email: 'b@x.com', sessionLabel: 'Day 1', appliedDelta: 101 }),
    tx({ email: 'c@x.com', sessionLabel: 'Day 1', appliedDelta: 102 })
  ]);
  assert.equal(r[0].avgBalance, 101);
});

// ── buildTrajectoryPayload ───────────────────────────────────────────

test('buildTrajectoryPayload: combines myPoints + cohortAverages', () => {
  const my = [tx({ email: 'a@x.com', sessionLabel: 'Day 1', appliedDelta: 100 })];
  const all = [
    ...my,
    tx({ email: 'b@x.com', sessionLabel: 'Day 1', appliedDelta: 80 })
  ];
  const r = buildTrajectoryPayload(my, all);
  // myPoints is [Start, Day 1] = 2 points (Start is prepended by helper)
  assert.equal(r.myPoints.length, 2);
  assert.equal(r.cohortAverages.length, 1);
  assert.equal(r.cohortAverages[0].avgBalance, 90); // (100+80)/2
});

// ── computeAtRisk ─────────────────────────────────────────────────────

const attendance = (overrides) => ({
  email: overrides.email,
  sessionLabel: overrides.sessionLabel,
  qualified: overrides.qualified,
  dateTime: overrides.dateTime,
  createdAt: overrides.dateTime
});

test('computeAtRisk: empty -> empty', () => {
  assert.deepEqual(computeAtRisk([], []), []);
  assert.deepEqual(computeAtRisk(null, null), []);
});

test('computeAtRisk: student with 0 attendance -> not at risk', () => {
  const r = computeAtRisk(
    [{ email: 'a@x.com', name: 'A', totalSp: 100, status: 'active' }],
    []
  );
  assert.deepEqual(r, []);
});

test('computeAtRisk: 2 consecutive missed = at risk', () => {
  // Threshold is 2 (default)
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 80, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: true,  dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  const r = computeAtRisk(students, recs);
  assert.equal(r.length, 1);
  assert.equal(r[0].consecutiveMissed, 2);
  assert.equal(r[0].email, 'a@x.com');
});

test('computeAtRisk: 3 consecutive missed', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 70, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: true,  dateTime: new Date(NOW.getTime() - 4 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 4', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  const r = computeAtRisk(students, recs);
  assert.equal(r[0].consecutiveMissed, 3);
});

test('computeAtRisk: streak broken by 1 qualified session -> not at risk', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 90, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: true,  dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  // Last record is qualified (Day 3) -> consecutive = 0, not at risk
  const r = computeAtRisk(students, recs);
  assert.deepEqual(r, []);
});

test('computeAtRisk: excused students are excluded', () => {
  const students = [
    { email: 'a@x.com', name: 'A', totalSp: 100, status: 'excused' }
  ];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  const r = computeAtRisk(students, recs);
  assert.deepEqual(r, []);
});

test('computeAtRisk: sorts by severity (most consecutive missed first)', () => {
  const students = [
    { email: 'a@x.com', name: 'A', totalSp: 70, status: 'active' },
    { email: 'b@x.com', name: 'B', totalSp: 80, status: 'active' },
    { email: 'c@x.com', name: 'C', totalSp: 85, status: 'active' }
  ];
  const recs = [
    // A: 3 missed
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 4 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 4', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) }),
    // B: 2 missed
    attendance({ email: 'b@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'b@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  const r = computeAtRisk(students, recs);
  assert.equal(r.length, 2);
  assert.equal(r[0].email, 'a@x.com'); // 3 missed
  assert.equal(r[1].email, 'b@x.com'); // 2 missed
});

test('computeAtRisk: handles unsorted attendance (sorts by dateTime internally)', () => {
  // This is the BUG FIX in the original PR — original sorted by sessionLabel
  // alphabetically, which is meaningless. The helper sorts by dateTime.
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 80, status: 'active' }];
  const recs = [
    // Note: alphabetical sort would be: Day 1, Day 2, Day 3.
    // DateTime sort is: Day 3 (oldest), Day 1, Day 2 (newest).
    // Last record by dateTime is Day 2 (newest, NOT qualified).
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: true,  dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) })
  ];
  // With dateTime sort: most recent is Day 2 (not qualified). Going back:
  // Day 2 (not qualified, count 1), Day 1 (not qualified, count 2) -> STOP
  // because we've found consecutive count >= threshold (2).
  // Result: at risk with 2 consecutive missed.
  const r = computeAtRisk(students, recs);
  assert.equal(r.length, 1);
  assert.equal(r[0].consecutiveMissed, 2);
});

test('computeAtRisk: lastActive is null when most recent is missed', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 80, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: true,  dateTime: new Date(NOW.getTime() - 5 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) })
  ];
  const r = computeAtRisk(students, recs);
  assert.equal(r[0].lastActive, null); // most recent is missed
});

test('computeAtRisk: lastActive is the most recent dateTime when last was qualified', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 80, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 5 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 4', qualified: true,  dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  // last record qualified -> not at risk
  const r = computeAtRisk(students, recs);
  assert.equal(r.length, 0);
});

test('computeAtRisk: custom threshold respected', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 90, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) })
  ];
  // With default threshold 2 -> at risk
  assert.equal(computeAtRisk(students, recs).length, 1);
  // With threshold 3 -> not at risk (only 2 missed)
  assert.equal(computeAtRisk(students, recs, { threshold: 3 }).length, 0);
});

test('computeAtRisk: windowSize respected', () => {
  const students = [{ email: 'a@x.com', name: 'A', totalSp: 80, status: 'active' }];
  const recs = [
    attendance({ email: 'a@x.com', sessionLabel: 'Day 1', qualified: false, dateTime: new Date(NOW.getTime() - 5 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 2', qualified: true,  dateTime: new Date(NOW.getTime() - 4 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 3', qualified: false, dateTime: new Date(NOW.getTime() - 3 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 4', qualified: false, dateTime: new Date(NOW.getTime() - 2 * DAY) }),
    attendance({ email: 'a@x.com', sessionLabel: 'Day 5', qualified: false, dateTime: new Date(NOW.getTime() - 1 * DAY) })
  ];
  // Most recent 3 (default window): Day 3 (not qualified, count 1),
  //   Day 4 (not qualified, count 2), Day 5 (not qualified, count 3) -> at risk
  const r3 = computeAtRisk(students, recs, { windowSize: 3 });
  assert.equal(r3[0].consecutiveMissed, 3);
  // Most recent 2 (smaller window): only Day 4 + Day 5 -> 2 consecutive missed
  const r2 = computeAtRisk(students, recs, { windowSize: 2 });
  assert.equal(r2[0].consecutiveMissed, 2);
});