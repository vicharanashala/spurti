/**
 * spRules.test.js — Regression tests for the SP scoring constants extraction.
 *
 * Uses Node's built-in test runner (node:test) and assertion library
 * (node:assert) — zero additional dependencies required.
 *
 * Run with:
 *   node --test server/scripts/lib/spRules.test.js
 *
 * Coverage:
 *  1. Sanity: all exported constants from spRules.js match expected values.
 *  2. Attendance: above / exactly at / below / zero attendance / zero total-minutes.
 *  3. Poll scoring: attempted > missed, attempted < missed, all attempted,
 *     zero attempted, attempted equals missed.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_SP,
  ATTENDANCE_THRESHOLD,
  ATTENDANCE_SP_CREDIT,
  ATTENDANCE_SP_DEBIT,
  POLL_ATTEMPTED_SCORE,
  POLL_MISSED_SCORE,
} from './spRules.js';

// ---------------------------------------------------------------------------
// Helper: replicate the attendance-delta logic from ingestion.js so we can
// test it without a database connection.
// ---------------------------------------------------------------------------
function attendanceDelta(minutes, totalMinutes) {
  const qualified = totalMinutes > 0 && minutes / totalMinutes >= ATTENDANCE_THRESHOLD;
  return qualified ? ATTENDANCE_SP_CREDIT : ATTENDANCE_SP_DEBIT;
}

// ---------------------------------------------------------------------------
// Helper: replicate the poll-delta logic from ingestion.js.
// ---------------------------------------------------------------------------
function pollDelta(attempted, totalQuestions) {
  const missed = Math.max(0, totalQuestions - attempted);
  return attempted * POLL_ATTEMPTED_SCORE + missed * POLL_MISSED_SCORE;
}

// ===========================================================================
// 1 — Constants sanity checks
// ===========================================================================

test('spRules: INITIAL_SP equals 100', () => {
  assert.equal(INITIAL_SP, 100);
});

test('spRules: ATTENDANCE_THRESHOLD equals 0.75', () => {
  assert.equal(ATTENDANCE_THRESHOLD, 0.75);
});

test('spRules: ATTENDANCE_SP_CREDIT equals 5', () => {
  assert.equal(ATTENDANCE_SP_CREDIT, 5);
});

test('spRules: ATTENDANCE_SP_DEBIT equals -5', () => {
  assert.equal(ATTENDANCE_SP_DEBIT, -5);
});

test('spRules: POLL_ATTEMPTED_SCORE equals 1', () => {
  assert.equal(POLL_ATTEMPTED_SCORE, 1);
});

test('spRules: POLL_MISSED_SCORE equals -1', () => {
  assert.equal(POLL_MISSED_SCORE, -1);
});

// ===========================================================================
// 2 — Attendance delta scenarios
// ===========================================================================

test('attendance: above threshold (80/100) => delta +5', () => {
  assert.equal(attendanceDelta(80, 100), 5);
});

test('attendance: exactly at threshold (75/100) => delta +5 (boundary inclusive)', () => {
  assert.equal(attendanceDelta(75, 100), 5);
});

test('attendance: below threshold (70/100) => delta -5', () => {
  assert.equal(attendanceDelta(70, 100), -5);
});

test('attendance: zero attendance (0/100) => delta -5', () => {
  assert.equal(attendanceDelta(0, 100), -5);
});

test('attendance: zero total minutes => delta -5 (guard: totalMinutes=0 is not qualified)', () => {
  assert.equal(attendanceDelta(0, 0), -5);
});

// ===========================================================================
// 3 — Poll delta scenarios
// ===========================================================================

test('poll: attempted > missed (3/5) => delta 1', () => {
  assert.equal(pollDelta(3, 5), 1);
});

test('poll: attempted < missed (1/5) => delta -3', () => {
  assert.equal(pollDelta(1, 5), -3);
});

test('poll: all attempted (5/5) => delta 5', () => {
  assert.equal(pollDelta(5, 5), 5);
});

test('poll: zero attempted (0/5) => delta -5', () => {
  assert.equal(pollDelta(0, 5), -5);
});

test('poll: attempted equals missed (2/4) => delta 0', () => {
  assert.equal(pollDelta(2, 4), 0);
});
