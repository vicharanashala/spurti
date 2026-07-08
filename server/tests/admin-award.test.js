/**
 * server/tests/admin-award.test.js
 *
 * Tests for server/services/adminAward.js
 *
 * Coverage: validateAwardPayload (15), computeAppliedDelta (6),
 * buildAwardReason (4). 25 tests, ~150ms.
 *
 * Run: node --test server/tests/admin-award.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAwardPayload,
  computeAppliedDelta,
  buildAwardReason,
  AWARD_REASON_MAX_LENGTH,
  AWARD_PERCENTAGE_MAX
} from '../services/adminAward.js';

// ── validateAwardPayload ────────────────────────────────────────────────

test('validateAwardPayload: missing body', () => {
  const r = validateAwardPayload(null);
  assert.equal(r.ok, false);
  assert.match(r.error, /object/i);
});
test('validateAwardPayload: non-object body', () => {
  assert.equal(validateAwardPayload('foo').ok, false);
});
test('validateAwardPayload: missing delta', () => {
  const r = validateAwardPayload({ reason: 'good' });
  assert.equal(r.ok, false);
  assert.match(r.error, /delta/);
});
test('validateAwardPayload: non-numeric delta', () => {
  assert.equal(validateAwardPayload({ delta: '5', reason: 'good' }).ok, false);
});
test('validateAwardPayload: float delta is rejected (must be integer)', () => {
  assert.equal(validateAwardPayload({ delta: 5.5, reason: 'good' }).ok, false);
});
test('validateAwardPayload: NaN delta is rejected', () => {
  assert.equal(validateAwardPayload({ delta: NaN, reason: 'good' }).ok, false);
});
test('validateAwardPayload: zero delta is rejected', () => {
  const r = validateAwardPayload({ delta: 0, reason: 'good' });
  assert.equal(r.ok, false);
  assert.match(r.error, /positive/i);
});
test('validateAwardPayload: negative delta is rejected (use deduction)', () => {
  const r = validateAwardPayload({ delta: -5, reason: 'good' });
  assert.equal(r.ok, false);
  assert.match(r.error, /positive/i);
});
test('validateAwardPayload: delta above 1M is rejected', () => {
  const r = validateAwardPayload({ delta: 1_000_001, reason: 'good' });
  assert.equal(r.ok, false);
  assert.match(r.error, /maximum/);
});
test('validateAwardPayload: missing reason', () => {
  const r = validateAwardPayload({ delta: 5 });
  assert.equal(r.ok, false);
  assert.match(r.error, /reason/);
});
test('validateAwardPayload: non-string reason', () => {
  assert.equal(validateAwardPayload({ delta: 5, reason: 42 }).ok, false);
});
test('validateAwardPayload: empty reason is rejected', () => {
  assert.equal(validateAwardPayload({ delta: 5, reason: '' }).ok, false);
});
test('validateAwardPayload: whitespace-only reason is rejected', () => {
  assert.equal(validateAwardPayload({ delta: 5, reason: '     ' }).ok, false);
});
test('validateAwardPayload: reason over 500 chars is rejected', () => {
  const r = validateAwardPayload({ delta: 5, reason: 'x'.repeat(501) });
  assert.equal(r.ok, false);
  assert.match(r.error, /max length/);
});
test('validateAwardPayload: valid absolute payload', () => {
  const r = validateAwardPayload({ delta: 10, reason: '  Great question  ' });
  assert.equal(r.ok, true);
  assert.equal(r.delta, 10);
  assert.equal(r.reason, 'Great question', 'reason should be trimmed');
  assert.equal(r.deltaMode, 'absolute');
});
test('validateAwardPayload: valid percentage payload (50%)', () => {
  const r = validateAwardPayload({ delta: 50, reason: 'Outstanding', deltaMode: 'percentage' });
  assert.equal(r.ok, true);
  assert.equal(r.delta, 50);
  assert.equal(r.deltaMode, 'percentage');
});
test('validateAwardPayload: percentage over 100 is rejected', () => {
  const r = validateAwardPayload({ delta: 101, reason: 'x', deltaMode: 'percentage' });
  assert.equal(r.ok, false);
  assert.match(r.error, /between 1 and 100/);
});
test('validateAwardPayload: percentage at exactly 100 is allowed', () => {
  const r = validateAwardPayload({ delta: 100, reason: 'x', deltaMode: 'percentage' });
  assert.equal(r.ok, true);
});
test('validateAwardPayload: unknown deltaMode falls back to absolute', () => {
  const r = validateAwardPayload({ delta: 5, reason: 'x', deltaMode: 'totally-bogus' });
  assert.equal(r.ok, true);
  assert.equal(r.deltaMode, 'absolute');
});

// ── computeAppliedDelta ─────────────────────────────────────────────────

test('computeAppliedDelta: absolute mode returns delta unchanged', () => {
  const out = computeAppliedDelta({ delta: 10, deltaMode: 'absolute' }, 145);
  assert.equal(out, 10);
});
test('computeAppliedDelta: percentage of 145 with 10% = 14 (rounded down)', () => {
  const out = computeAppliedDelta({ delta: 10, deltaMode: 'percentage' }, 145);
  assert.equal(out, 14);
});
test('computeAppliedDelta: percentage of 100 with 25% = 25', () => {
  const out = computeAppliedDelta({ delta: 25, deltaMode: 'percentage' }, 100);
  assert.equal(out, 25);
});
test('computeAppliedDelta: percentage of 99 with 33% = 32 (floored)', () => {
  const out = computeAppliedDelta({ delta: 33, deltaMode: 'percentage' }, 99);
  assert.equal(out, 32);
});
test('computeAppliedDelta: percentage of 0 balance = 0', () => {
  const out = computeAppliedDelta({ delta: 50, deltaMode: 'percentage' }, 0);
  assert.equal(out, 0);
});
test('computeAppliedDelta: negative currentBalance normalized to 0', () => {
  const out = computeAppliedDelta({ delta: 10, deltaMode: 'percentage' }, -50);
  assert.equal(out, 0);
});

// ── buildAwardReason ────────────────────────────────────────────────────

test('buildAwardReason: absolute mode', () => {
  const out = buildAwardReason('absolute', 10, 'Great question');
  assert.equal(out, 'Admin award (absolute): Great question');
});
test('buildAwardReason: percentage mode shows the % value', () => {
  const out = buildAwardReason('percentage', 10, 'Outstanding');
  assert.equal(out, 'Admin award (10% of balance): Outstanding');
});
test('buildAwardReason: percentage with large % value', () => {
  const out = buildAwardReason('percentage', 100, 'Incredible');
  assert.equal(out, 'Admin award (100% of balance): Incredible');
});
test('buildAwardReason: empty reason still included', () => {
  const out = buildAwardReason('absolute', 5, '');
  assert.equal(out, 'Admin award (absolute): ');
});