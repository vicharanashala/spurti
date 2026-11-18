import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak, sessionSortKey } from '../server/services/streak.js';

const sessions = ['3 Aug Morning', '3 Aug Evening', '4 Aug Morning', 'Day 5 (5 Aug) Morning', '6 Aug Morning'];

test('orders sessions by date, then morning before evening', () => {
  assert.ok(sessionSortKey('3 Aug Morning') < sessionSortKey('3 Aug Evening'));
  assert.ok(sessionSortKey('3 Aug Evening') < sessionSortKey('Day 5 (5 Aug) Morning'));
  assert.equal(sessionSortKey('no date here'), -1);
});

test('current streak counts back from the latest session held', () => {
  const s = computeStreak(sessions, ['4 Aug Morning', 'Day 5 (5 Aug) Morning', '6 Aug Morning']);
  assert.deepEqual(s, { current: 3, longest: 3 });
});

test('missing the latest session resets the current streak but keeps the best', () => {
  const s = computeStreak(sessions, ['3 Aug Morning', '3 Aug Evening', '4 Aug Morning']);
  assert.deepEqual(s, { current: 0, longest: 3 });
});

test('a session with no record for the student counts as missed', () => {
  const s = computeStreak(sessions, ['3 Aug Morning', '4 Aug Morning', '6 Aug Morning']);
  assert.deepEqual(s, { current: 1, longest: 1 });
});

test('no sessions or no attendance gives zeros', () => {
  assert.deepEqual(computeStreak([], []), { current: 0, longest: 0 });
  assert.deepEqual(computeStreak(sessions, []), { current: 0, longest: 0 });
});
