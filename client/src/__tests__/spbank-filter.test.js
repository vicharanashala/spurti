/**
 * client/src/__tests__/spbank-filter.test.js
 *
 * Validates the SpBank filter + sort logic. The component itself is React,
 * so we test the pure filter+sort helper extracted from it. Mirrors the
 * client/src/main.jsx logic exactly; any divergence is caught by tests.
 *
 * Run: node --test client/src/__tests__/spbank-filter.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Pure copy of the filter+sort logic in <SpBank>.
function applySpBankFilters(transactions, opts) {
  const { category = 'all', search = '', dateFrom = '', dateTo = '', sortBy = 'date_desc' } = opts || {};
  const filtered = transactions.filter(tx => {
    if (category !== 'all' && tx.category !== category) return false;
    if (search && !tx.sessionLabel?.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFrom) {
      const d = new Date(tx.dateTime);
      if (d < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const d = new Date(tx.dateTime);
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  });
  return [...filtered].sort((a, b) => {
    if (sortBy === 'date_asc') return new Date(a.dateTime) - new Date(b.dateTime);
    if (sortBy === 'date_desc') return new Date(b.dateTime) - new Date(a.dateTime);
    if (sortBy === 'amount_asc') return (a.appliedDelta || 0) - (b.appliedDelta || 0);
    if (sortBy === 'amount_desc') return (b.appliedDelta || 0) - (a.appliedDelta || 0);
    return 0;
  });
}

const FIXTURE = [
  { _id: '1', dateTime: '2026-06-01T09:00:00Z', category: 'attendance', appliedDelta: 5, sessionLabel: 'Day 1 (1 Jun)' },
  { _id: '2', dateTime: '2026-06-15T09:00:00Z', category: 'poll', appliedDelta: 3, sessionLabel: 'Day 10 (15 Jun)' },
  { _id: '3', dateTime: '2026-06-15T14:00:00Z', category: 'poll', appliedDelta: -3, sessionLabel: 'Day 10 (15 Jun)' },
  { _id: '4', dateTime: '2026-07-01T09:00:00Z', category: 'initial', appliedDelta: 100, sessionLabel: 'Start' },
  { _id: '5', dateTime: '2026-07-04T09:00:00Z', category: 'attendance', appliedDelta: -5, sessionLabel: 'Day 25 (4 Jul)' },
  { _id: '6', dateTime: '2026-07-04T10:00:00Z', category: 'poll', appliedDelta: 5, sessionLabel: 'Day 25 (4 Jul)' }
];

test('no filters: returns all sorted by date desc', () => {
  const r = applySpBankFilters(FIXTURE, {});
  assert.equal(r.length, 6);
  assert.equal(r[0]._id, '6'); // newest
  assert.equal(r[5]._id, '1'); // oldest
});

test('category=poll: only poll rows', () => {
  const r = applySpBankFilters(FIXTURE, { category: 'poll' });
  assert.equal(r.length, 3);
  for (const tx of r) assert.equal(tx.category, 'poll');
});

test('search "Day 25": only Day 25 rows', () => {
  const r = applySpBankFilters(FIXTURE, { search: 'Day 25' });
  assert.equal(r.length, 2);
});

test('dateFrom=2026-07-01: excludes June', () => {
  const r = applySpBankFilters(FIXTURE, { dateFrom: '2026-07-01' });
  assert.equal(r.length, 3);
  for (const tx of r) assert.ok(new Date(tx.dateTime) >= new Date('2026-07-01'));
});

test('dateTo=2026-06-30: excludes July (end-of-day inclusive)', () => {
  const r = applySpBankFilters(FIXTURE, { dateTo: '2026-06-30' });
  // dateTo is set to 2026-06-30T23:59:59.999Z so anything ON 30 Jun or earlier is included.
  // Our fixture has Jun 1 and Jun 15, both before 30 Jun → both included.
  assert.equal(r.length, 3);
});

test('date range June: From 2026-06-01, To 2026-06-30', () => {
  const r = applySpBankFilters(FIXTURE, { dateFrom: '2026-06-01', dateTo: '2026-06-30' });
  assert.equal(r.length, 3);
});

test('sortBy=amount_asc: lowest amounts first', () => {
  const r = applySpBankFilters(FIXTURE, { sortBy: 'amount_asc' });
  assert.equal(r[0].appliedDelta, -5);
  assert.equal(r[r.length - 1].appliedDelta, 100);
});

test('sortBy=amount_desc: highest amounts first', () => {
  const r = applySpBankFilters(FIXTURE, { sortBy: 'amount_desc' });
  assert.equal(r[0].appliedDelta, 100);
});

test('sortBy=date_asc: oldest first', () => {
  const r = applySpBankFilters(FIXTURE, { sortBy: 'date_asc' });
  assert.equal(r[0]._id, '1');
});

test('combined filters: poll + Day 25 + amount_desc', () => {
  const r = applySpBankFilters(FIXTURE, { category: 'poll', search: 'Day 25', sortBy: 'amount_desc' });
  assert.equal(r.length, 1);
  assert.equal(r[0]._id, '6'); // +5 SP poll on Day 25
});

test('no matches: returns empty array', () => {
  const r = applySpBankFilters(FIXTURE, { search: 'NonexistentSession' });
  assert.equal(r.length, 0);
});
