/**
 * server/tests/excuse.test.js
 *
 * Tests for server/services/excuse.js
 *  - validateExcusePayload (9 tests)
 *  - buildExcusePatch (4 tests, including the action guard)
 *  - buildExcuseResponse (3 tests)
 *
 * Run: node --test server/tests/excuse.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateExcusePayload,
  buildExcusePatch,
  buildExcuseResponse,
  EXCUSE_REASON_MAX_LENGTH
} from '../services/excuse.js';

// ── validateExcusePayload ──────────────────────────────────────────────

test('validateExcusePayload: missing body', () => {
  const r = validateExcusePayload(null);
  assert.equal(r.ok, false);
  assert.match(r.error, /object/i);
});
test('validateExcusePayload: non-object body', () => {
  const r = validateExcusePayload('foo');
  assert.equal(r.ok, false);
  assert.match(r.error, /object/i);
});
test('validateExcusePayload: missing reason', () => {
  const r = validateExcusePayload({ something: 'else' });
  assert.equal(r.ok, false);
  assert.match(r.error, /reason/);
});
test('validateExcusePayload: non-string reason', () => {
  const r = validateExcusePayload({ reason: 42 });
  assert.equal(r.ok, false);
  assert.match(r.error, /string/);
});
test('validateExcusePayload: empty reason rejected', () => {
  const r = validateExcusePayload({ reason: '' });
  assert.equal(r.ok, false);
  assert.match(r.error, /empty/);
});
test('validateExcusePayload: whitespace-only reason rejected', () => {
  const r = validateExcusePayload({ reason: '     ' });
  assert.equal(r.ok, false);
});
test('validateExcusePayload: reason over 500 chars rejected', () => {
  const r = validateExcusePayload({ reason: 'x'.repeat(501) });
  assert.equal(r.ok, false);
  assert.match(r.error, /max length/);
});
test('validateExcusePayload: valid reason passes and is trimmed', () => {
  const r = validateExcusePayload({ reason: '  medical leave  ' });
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'medical leave');
});
test('validateExcusePayload: exactly 500 chars allowed', () => {
  const r = validateExcusePayload({ reason: 'a'.repeat(500) });
  assert.equal(r.ok, true);
});

// ── buildExcusePatch ──────────────────────────────────────────────────

test('buildExcusePatch: excuse action sets status, excusedAt, excusedReason', () => {
  const before = Date.now();
  const patch = buildExcusePatch('excuse', 'medical leave');
  assert.equal(patch.status, 'excused');
  assert.ok(patch.excusedAt instanceof Date);
  assert.ok(patch.excusedAt.getTime() >= before);
  assert.equal(patch.excusedReason, 'medical leave');
});
test('buildExcusePatch: activate action resets all three fields', () => {
  const patch = buildExcusePatch('activate', '');
  assert.equal(patch.status, 'active');
  assert.equal(patch.excusedAt, null);
  assert.equal(patch.excusedReason, '');
});
test('buildExcusePatch: unknown action throws (defensive)', () => {
  assert.throws(() => buildExcusePatch('reboot', 'x'), /unknown action/i);
});
test('buildExcusePatch: excuse patch preserves audit-friendly invariant', () => {
  // If status=excused, then excusedAt is non-null AND excusedReason is non-empty.
  // If status=active, then excusedAt is null AND excusedReason is empty.
  // This invariant is enforced by the helper regardless of input.
  for (const action of ['excuse', 'activate']) {
    const patch = buildExcusePatch(action, 'reason');
    if (action === 'excuse') {
      assert.ok(patch.excusedAt);
      assert.notEqual(patch.excusedReason, '');
    } else {
      assert.equal(patch.excusedAt, null);
      assert.equal(patch.excusedReason, '');
    }
  }
});

// ── buildExcuseResponse ────────────────────────────────────────────────

test('buildExcuseResponse: excuse action returns correct shape', () => {
  const now = new Date();
  const student = {
    _id: 'abc', name: 'Alice', status: 'excused',
    excusedAt: now, excusedReason: 'medical leave'
  };
  const r = buildExcuseResponse('excuse', student);
  assert.equal(r.ok, true);
  assert.equal(r.action, 'excuse');
  assert.equal(r.student._id, 'abc');
  assert.equal(r.student.status, 'excused');
  assert.equal(r.student.excusedAt, now);
  assert.equal(r.student.excusedReason, 'medical leave');
});
test('buildExcuseResponse: activate action also returns full student shape', () => {
  const student = {
    _id: 'xyz', name: 'Bob', status: 'active',
    excusedAt: null, excusedReason: ''
  };
  const r = buildExcuseResponse('activate', student);
  assert.equal(r.action, 'activate');
  assert.equal(r.student.status, 'active');
  assert.equal(r.student.excusedAt, null);
  assert.equal(r.student.excusedReason, '');
});
test('buildExcuseResponse: serializes cleanly (no Date object issues)', () => {
  const student = {
    _id: 'id', name: 'C', status: 'excused',
    excusedAt: new Date('2026-07-04T10:00:00Z'),
    excusedReason: 'r'
  };
  // Mirror the JSON.stringify round-trip pattern the controller uses
  const stringified = JSON.stringify(buildExcuseResponse('excuse', student));
  const round = JSON.parse(stringified);
  // Date becomes ISO string in JSON — both paths preserved
  assert.equal(typeof round.student.excusedAt, 'string');
  assert.equal(round.student.excusedAt, '2026-07-04T10:00:00.000Z');
});

// ── mirror the constant ────────────────────────────────────────────────

test('EXCUSE_REASON_MAX_LENGTH constant equals 500', () => {
  // Mirrors what the textarea maxLength uses in the client.
  assert.equal(EXCUSE_REASON_MAX_LENGTH, 500);
});