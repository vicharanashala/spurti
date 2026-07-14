/**
 * server/tests/sp-explanation.test.js
 *
 * Exhaustive tests for server/services/spExplanation.js.
 *
 * Covers every category, every delta sign (positive / zero / negative),
 * every band boundary (90% / 75% / 50%), both rubric flavors (new band
 * rubric + old CSV rubric), missing/malformed reason text, and the batch
 * helper.
 *
 * Run: node --test server/tests/sp-explanation.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  explainTransaction,
  explainTransactions,
  bandFor,
  formatDelta,
} from '../services/spExplanation.js';

// Helper builders — keep fixtures readable.
const tx = (overrides) => ({
  _id: overrides._id || 'tx1',
  category: overrides.category,
  appliedDelta: overrides.appliedDelta,
  reason: overrides.reason,
  dateTime: overrides.dateTime || new Date('2026-07-04T10:00:00Z'),
  sessionLabel: overrides.sessionLabel || 'Day 1 (1 Jul)'
});

// ── formatDelta ──────────────────────────────────────────────────────────

test('formatDelta: positive integer', () => {
  assert.equal(formatDelta(5), '+5 SP');
});
test('formatDelta: negative integer', () => {
  assert.equal(formatDelta(-3), '-3 SP');
});
test('formatDelta: zero', () => {
  assert.equal(formatDelta(0), '0 SP');
});
test('formatDelta: null/undefined fall back to 0', () => {
  assert.equal(formatDelta(null), '0 SP');
  assert.equal(formatDelta(undefined), '0 SP');
});

// ── bandFor ─────────────────────────────────────────────────────────────

test('bandFor: 100% -> 90%+', () => {
  const b = bandFor(100);
  assert.equal(b.label, '90%+');
  assert.equal(b.low, 90); assert.equal(b.high, 100);
});
test('bandFor: 90% boundary -> 90%+', () => {
  assert.equal(bandFor(90).label, '90%+');
});
test('bandFor: 89.9% -> 75-89%', () => {
  assert.equal(bandFor(89.9).label, '75-89%');
});
test('bandFor: 75% boundary -> 75-89%', () => {
  assert.equal(bandFor(75).label, '75-89%');
});
test('bandFor: 74.9% -> 50-74%', () => {
  assert.equal(bandFor(74.9).label, '50-74%');
});
test('bandFor: 50% boundary -> 50-74%', () => {
  assert.equal(bandFor(50).label, '50-74%');
});
test('bandFor: 49.9% -> <50%', () => {
  assert.equal(bandFor(49.9).label, '<50%');
});
test('bandFor: 0% -> <50%', () => {
  assert.equal(bandFor(0).label, '<50%');
});

// ── explainTransaction: category routing ───────────────────────────────

test('explainTransaction: null returns null', () => {
  assert.equal(explainTransaction(null), null);
});
test('explainTransaction: undefined returns null', () => {
  assert.equal(explainTransaction(undefined), null);
});
test('explainTransaction: missing category returns null', () => {
  assert.equal(explainTransaction({ appliedDelta: 5 }), null);
});
test('explainTransaction: unknown category returns null', () => {
  // 'tip' is a future category (ABHISHEK27Y #16) not yet in our registry
  assert.equal(explainTransaction({ category: 'tip', appliedDelta: 5, reason: 'foo' }), null);
});

// ── explainTransaction: initial ────────────────────────────────────────

test('explainTransaction: initial +100', () => {
  const r = explainTransaction(tx({
    _id: 'i1', category: 'initial', appliedDelta: 100,
    reason: 'Base Spurti Points (100) credited on internship start date 2026-05-15.'
  }));
  assert.equal(r.category, 'initial');
  assert.match(r.headline, /\+100 SP/);
  assert.match(r.headline, /initial credit/i);
  assert.equal(r.rubric, null);
  assert.match(r.recommendation, /no action needed/i);
});

test('explainTransaction: initial with custom amount', () => {
  // (defensive — if some day we change the base from 100, this still works)
  const r = explainTransaction(tx({ category: 'initial', appliedDelta: 50 }));
  assert.match(r.headline, /\+50 SP/);
});

// ── explainTransaction: manual ──────────────────────────────────────────

test('explainTransaction: manual positive with reason', () => {
  const r = explainTransaction(tx({
    category: 'manual', appliedDelta: 5, reason: 'Bonus for outstanding question in session 5.'
  }));
  assert.equal(r.category, 'manual');
  assert.match(r.headline, /\+5 SP/);
  assert.match(r.detail, /outstanding question/);
  assert.match(r.recommendation, /contact your admin/i);
  assert.equal(r.rubric, null);
});

test('explainTransaction: manual negative (deduction)', () => {
  const r = explainTransaction(tx({
    category: 'manual', appliedDelta: -3, reason: 'Camera off for whole session per instructor.'
  }));
  assert.match(r.headline, /-3 SP/);
  assert.match(r.detail, /camera off/i);
});

test('explainTransaction: manual with empty reason', () => {
  const r = explainTransaction(tx({ category: 'manual', appliedDelta: 2, reason: '' }));
  assert.match(r.detail, /manual adjustment by an admin/i);
});

// ── explainTransaction: attendance (new band rubric) ───────────────────

test('attendance: 100% band -> +10', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 10,
    reason: 'Day 1 (1 Jul): present 120 of 120 min (100%) within official 09:05-11:00 IST window -> +10 SP.'
  }));
  assert.equal(r.category, 'attendance');
  assert.match(r.headline, /90%\+ band/);
  assert.match(r.headline, /\+10 SP/);
  assert.equal(r.rubric.rule, 'attendance-band');
  assert.equal(r.rubric.values.attended, 120);
  assert.equal(r.rubric.values.totalMinutes, 120);
  assert.equal(r.rubric.values.pct, 100);
  assert.equal(r.rubric.values.delta, 10);
  assert.match(r.recommendation, /full attendance credit/i);
});

test('attendance: 90% boundary -> +10', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 10,
    reason: 'Day 1: present 108 of 120 min (90.0%) ... -> +10 SP.'
  }));
  assert.match(r.headline, /90%\+/);
  assert.equal(r.rubric.values.pct, 90);
});

test('attendance: 75-89% band -> +5', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 5,
    reason: 'Day 2: present 100 of 120 min (83.3%) ... -> +5 SP.'
  }));
  assert.match(r.headline, /75-89% band/);
  assert.match(r.headline, /\+5 SP/);
  assert.match(r.recommendation, /partial credit/i);
  assert.equal(r.rubric.values.pct, 83.3);
});

test('attendance: 75% boundary -> +5', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 5,
    reason: 'Day 3: present 90 of 120 min (75.0%) ... -> +5 SP.'
  }));
  assert.match(r.headline, /75-89%/);
});

test('attendance: 50-74% band -> +3', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 3,
    reason: 'Day 4: present 80 of 120 min (66.7%) ... -> +3 SP.'
  }));
  assert.match(r.headline, /50-74% band/);
  assert.match(r.headline, /\+3 SP/);
  assert.match(r.recommendation, /minimal credit/i);
});

test('attendance: 50% boundary -> +3', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 3,
    reason: 'Day 5: present 60 of 120 min (50.0%) ... -> +3 SP.'
  }));
  assert.match(r.headline, /50-74%/);
});

test('attendance: <50% -> 0 SP', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 0,
    reason: 'Day 6: present 40 of 120 min (33.3%) ... -> 0 SP.'
  }));
  assert.match(r.headline, /<50%/);
  assert.match(r.headline, /0 SP/);
  assert.match(r.recommendation, /below the 50% threshold/i);
  assert.equal(r.rubric.values.delta, 0);
});

test('attendance: 0% (absent) -> 0 SP', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 0,
    reason: 'Day 7: present 0 of 120 min (0.0%) ... -> 0 SP.'
  }));
  assert.equal(r.rubric.values.pct, 0);
  assert.equal(r.rubric.values.delta, 0);
});

// ── explainTransaction: attendance (old CSV rubric fallback) ────────────

test('attendance (old CSV): credited +5 when above 75%', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 5,
    reason: 'Day 1 (1 Jul): attended 100/120 minutes (83.3%). Required 75%, credited +5 SP.'
  }));
  assert.equal(r.rubric.rule, 'attendance-csv-75pct');
  assert.match(r.headline, /attendance credit/i);
  assert.match(r.headline, /\+5 SP/);
  assert.equal(r.rubric.values.attended, 100);
  assert.equal(r.rubric.values.totalMinutes, 120);
  assert.equal(r.rubric.values.required, 90); // 75% of 120
  assert.equal(r.rubric.values.shortBy, 0);
});

test('attendance (old CSV): debited -5 when below 75%', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: -5,
    reason: 'Day 2 (2 Jul): attended 60/120 minutes (50.0%). Required 75%, debited -5 SP.'
  }));
  assert.match(r.headline, /attendance debit/i);
  assert.match(r.headline, /-5 SP/);
  assert.equal(r.rubric.values.required, 90);
  assert.equal(r.rubric.values.shortBy, 30); // 90 - 60
  assert.match(r.recommendation, /new band rubric would have given 0 SP/i);
});

test('attendance (old CSV): debited exactly at 0%', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: -5,
    reason: 'Day 8: attended 0/120 minutes (0.0%). Required 75%, debited -5 SP.'
  }));
  assert.equal(r.rubric.values.shortBy, 90); // required=90, attended=0
});

// ── explainTransaction: attendance (unparseable) ───────────────────────

test('attendance: unparseable reason -> generic but honest answer', () => {
  const r = explainTransaction(tx({
    category: 'attendance', appliedDelta: 0,
    reason: 'some weird format we don\'t recognize'
  }));
  assert.equal(r.rubric.rule, 'unknown');
  assert.match(r.headline, /attendance adjustment/i);
  assert.match(r.recommendation, /show up to the full 09:05-11:00 ist window/i);
});

test('attendance: missing reason -> generic answer', () => {
  const r = explainTransaction(tx({ category: 'attendance', appliedDelta: 0 }));
  assert.equal(r.rubric.rule, 'unknown');
});

test('attendance: empty reason -> generic answer', () => {
  const r = explainTransaction(tx({ category: 'attendance', appliedDelta: 0, reason: '' }));
  assert.equal(r.rubric.rule, 'unknown');
});

// ── explainTransaction: poll ────────────────────────────────────────────

test('poll: 100% answered -> +10', () => {
  const r = explainTransaction(tx({
    category: 'poll', appliedDelta: 10,
    reason: 'Day 1 (1 Jun): answered 16 of 16 poll questions (100.0%) -> +10 SP.'
  }));
  assert.equal(r.category, 'poll');
  assert.match(r.headline, /90%\+ band/);
  assert.match(r.headline, /\+10 SP/);
  assert.equal(r.rubric.rule, 'poll-band');
  assert.equal(r.rubric.values.answered, 16);
  assert.equal(r.rubric.values.totalQuestions, 16);
});

test('poll: 75-89% -> +5', () => {
  const r = explainTransaction(tx({
    category: 'poll', appliedDelta: 5,
    reason: 'Day 2: answered 13 of 16 poll questions (81.3%) -> +5 SP.'
  }));
  assert.match(r.headline, /75-89%/);
  assert.match(r.recommendation, /partial/i);
});

test('poll: 50-74% -> +3', () => {
  const r = explainTransaction(tx({
    category: 'poll', appliedDelta: 3,
    reason: 'Day 3: answered 9 of 16 poll questions (56.3%) -> +3 SP.'
  }));
  assert.match(r.headline, /50-74%/);
});

test('poll: <50% -> 0 SP', () => {
  const r = explainTransaction(tx({
    category: 'poll', appliedDelta: 0,
    reason: 'Day 4: answered 4 of 16 poll questions (25.0%) -> 0 SP.'
  }));
  assert.match(r.headline, /<50%/);
  assert.match(r.headline, /0 SP/);
  assert.match(r.recommendation, /pop up at random times/i);
});

test('poll: 0% -> 0 SP', () => {
  const r = explainTransaction(tx({
    category: 'poll', appliedDelta: 0,
    reason: 'Day 5: answered 0 of 16 poll questions (0.0%) -> 0 SP.'
  }));
  assert.equal(r.rubric.values.answered, 0);
  assert.equal(r.rubric.values.pct, 0);
});

test('poll: unparseable reason -> generic answer', () => {
  const r = explainTransaction(tx({ category: 'poll', appliedDelta: 5, reason: 'unparseable' }));
  assert.equal(r.rubric.rule, 'unknown');
  assert.match(r.recommendation, /answer every poll/i);
});

// ── explainTransactions (batch helper) ─────────────────────────────────

test('explainTransactions: empty array -> empty object', () => {
  assert.deepEqual(explainTransactions([]), {});
});

test('explainTransactions: null -> empty object', () => {
  assert.deepEqual(explainTransactions(null), {});
});

test('explainTransactions: non-array -> empty object', () => {
  assert.deepEqual(explainTransactions('foo'), {});
});

test('explainTransactions: skips txns without _id', () => {
  const out = explainTransactions([
    { category: 'initial', appliedDelta: 100, reason: 'foo' } // no _id
  ]);
  assert.deepEqual(out, {});
});

test('explainTransactions: skips unknown categories', () => {
  const out = explainTransactions([
    { _id: 'a', category: 'tip', appliedDelta: 5, reason: 'foo' },
    { _id: 'b', category: 'initial', appliedDelta: 100, reason: 'foo' }
  ]);
  assert.ok(!out.a, 'unknown category should be skipped');
  assert.ok(out.b, 'known category should be included');
});

test('explainTransactions: stringifies _id to use as key', () => {
  // In JS, all object keys are strings (numeric 42 normalizes to "42").
  // The helper explicitly does String(t._id) so the JSON serializer
  // receives the right type. We verify by reading back via Object.keys
  // (which always returns strings) and via JSON round-trip.
  const out = explainTransactions([
    { _id: 42, category: 'initial', appliedDelta: 100, reason: 'x' }
  ]);
  const keys = Object.keys(out);
  assert.equal(keys.length, 1);
  assert.equal(keys[0], '42', 'key should be the stringified _id');
  const round = JSON.parse(JSON.stringify(out));
  assert.ok(round['42'], 'key should survive JSON round-trip');
});

test('explainTransactions: preserves order via object keys (insertion order)', () => {
  const out = explainTransactions([
    { _id: 'z', category: 'initial', appliedDelta: 100, reason: 'a' },
    { _id: 'a', category: 'initial', appliedDelta: 100, reason: 'b' },
    { _id: 'm', category: 'initial', appliedDelta: 100, reason: 'c' }
  ]);
  assert.deepEqual(Object.keys(out), ['z', 'a', 'm']);
});

test('explainTransactions: mixed batch of 5 categories', () => {
  const out = explainTransactions([
    { _id: '1', category: 'initial', appliedDelta: 100, reason: 'init' },
    { _id: '2', category: 'attendance', appliedDelta: 10, reason: 'Day 1: present 120 of 120 min (100.0%) -> +10 SP.' },
    { _id: '3', category: 'poll', appliedDelta: 5, reason: 'Day 1: answered 13 of 16 poll questions (81.3%) -> +5 SP.' },
    { _id: '4', category: 'manual', appliedDelta: -3, reason: 'camera off' },
    { _id: '5', category: 'tip', appliedDelta: 1, reason: 'future category' }
  ]);
  assert.ok(out['1']);
  assert.ok(out['2']);
  assert.ok(out['3']);
  assert.ok(out['4']);
  assert.ok(!out['5'], 'tip not in registry yet');
});

// ── Sanity: every explainer returns a 4-key shape ──────────────────────

test('every explainer returns category, headline, detail, recommendation', () => {
  const fixtures = [
    { _id: 'a', category: 'initial', appliedDelta: 100, reason: 'init' },
    { _id: 'b', category: 'attendance', appliedDelta: 10, reason: 'Day: present 120 of 120 min (100%) -> +10 SP.' },
    { _id: 'c', category: 'attendance', appliedDelta: -5, reason: 'Day: attended 60/120 minutes (50.0%). Required 75%, debited -5 SP.' },
    { _id: 'd', category: 'poll', appliedDelta: 0, reason: 'Day: answered 0 of 16 poll questions (0.0%) -> 0 SP.' },
    { _id: 'e', category: 'manual', appliedDelta: 5, reason: 'bonus' }
  ];
  for (const f of fixtures) {
    const r = explainTransaction(f);
    for (const key of ['category', 'headline', 'detail', 'recommendation']) {
      assert.ok(key in r, `missing key ${key} for category ${f.category}`);
      assert.ok(typeof r[key] === 'string' && r[key].length > 0, `empty ${key} for ${f.category}`);
    }
  }
});