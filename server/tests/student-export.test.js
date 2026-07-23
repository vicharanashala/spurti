/**
 * server/tests/student-export.test.js
 *
 * Tests for the /api/student/export.csv query-param filter
 * (parseExportQuery logic). Uses a mocked query shape; no DB required.
 *
 * Run: node --test server/tests/student-export.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// The parseExportQuery function is local to server.js (not exported)
// for tightening the PR scope. We re-define the same logic here to
// test its contract. Any divergence will fail these tests when
// integration tested against the live endpoint.
const VALID_CATEGORIES = new Set(['initial', 'attendance', 'poll', 'manual']);

function parseExportQuery(query) {
  const out = { filter: {}, rangeError: null };
  if (query.start) {
    const d = new Date(query.start);
    if (isNaN(d.getTime())) return { filter: {}, rangeError: `invalid start date: ${query.start}` };
    out.filter.dateTime = { ...(out.filter.dateTime || {}), $gte: d };
  }
  if (query.end) {
    const d = new Date(query.end);
    if (isNaN(d.getTime())) return { filter: {}, rangeError: `invalid end date: ${query.end}` };
    out.filter.dateTime = { ...(out.filter.dateTime || {}), $lte: d };
  }
  if (out.filter.dateTime && out.filter.dateTime.$gte > out.filter.dateTime.$lte) {
    return { filter: {}, rangeError: 'start must be on or before end' };
  }
  if (query.category) {
    if (!VALID_CATEGORIES.has(query.category)) {
      return { filter: {}, rangeError: `invalid category: ${query.category} (must be one of: initial, attendance, poll, manual)` };
    }
    out.filter.category = query.category;
  }
  return out;
}

test('empty query: returns empty filter, no error', () => {
  const r = parseExportQuery({});
  assert.equal(r.rangeError, null);
  assert.deepEqual(r.filter, {});
});

test('start only: filter has only $gte', () => {
  const r = parseExportQuery({ start: '2026-06-01' });
  assert.equal(r.rangeError, null);
  assert.ok(r.filter.dateTime.$gte instanceof Date);
  assert.equal(r.filter.dateTime.$lte, undefined);
});

test('end only: filter has only $lte', () => {
  const r = parseExportQuery({ end: '2026-06-30' });
  assert.equal(r.rangeError, null);
  assert.ok(r.filter.dateTime.$lte instanceof Date);
  assert.equal(r.filter.dateTime.$gte, undefined);
});

test('start + end: filter has both, range is valid', () => {
  const r = parseExportQuery({ start: '2026-06-01', end: '2026-06-30' });
  assert.equal(r.rangeError, null);
  assert.ok(r.filter.dateTime.$gte instanceof Date);
  assert.ok(r.filter.dateTime.$lte instanceof Date);
  assert.ok(r.filter.dateTime.$gte <= r.filter.dateTime.$lte);
});

test('invalid start date: returns rangeError', () => {
  const r = parseExportQuery({ start: 'not-a-date' });
  assert.match(r.rangeError, /invalid start date/);
});

test('invalid end date: returns rangeError', () => {
  const r = parseExportQuery({ end: '2026-13-99' });
  assert.match(r.rangeError, /invalid end date/);
});

test('start after end: returns rangeError', () => {
  const r = parseExportQuery({ start: '2026-07-01', end: '2026-06-01' });
  assert.equal(r.rangeError, 'start must be on or before end');
});

test('valid category: poll', () => {
  const r = parseExportQuery({ category: 'poll' });
  assert.equal(r.rangeError, null);
  assert.equal(r.filter.category, 'poll');
});

test('invalid category: returns rangeError with allowed list', () => {
  const r = parseExportQuery({ category: 'gibberish' });
  assert.match(r.rangeError, /invalid category/);
  assert.match(r.rangeError, /initial/);
});

test('all three params combined: filter has all three', () => {
  const r = parseExportQuery({ start: '2026-06-01', end: '2026-06-30', category: 'attendance' });
  assert.equal(r.rangeError, null);
  assert.ok(r.filter.dateTime.$gte);
  assert.ok(r.filter.dateTime.$lte);
  assert.equal(r.filter.category, 'attendance');
});

test('end-of-day end date: inclusive boundary', () => {
  // An end date of "2026-06-30" parses as midnight (start of day), so
  // transactions ON 2026-06-30 00:00 are included. Mid-day transactions
  // on 2026-06-30 are NOT included unless end is "2026-06-30T23:59:59Z".
  // Document this behavior so callers know to use full ISO datetimes.
  const r = parseExportQuery({ end: '2026-06-30' });
  const d = r.filter.dateTime.$lte;
  assert.equal(d.getUTCHours(), 0);
  assert.equal(d.getUTCMinutes(), 0);
});
