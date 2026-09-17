import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeStreak } from '../server/services/streaks.js';

const row = (sessionLabel, attendedMinutes) => ({ sessionLabel, attendedMinutes });

describe('computeStreak', () => {
  test('no records at all -> zero, never throws', () => {
    assert.deepEqual(computeStreak([], []), { current: 0, longest: 0 });
    assert.deepEqual(computeStreak(null, null), { current: 0, longest: 0 });
    assert.deepEqual(computeStreak(undefined, undefined), { current: 0, longest: 0 });
  });

  test('attended every session -> current equals longest equals the count', () => {
    const rows = [row('S1', 60), row('S2', 55), row('S3', 60)];
    const order = ['S1', 'S2', 'S3'];
    assert.deepEqual(computeStreak(rows, order), { current: 3, longest: 3 });
  });

  test('missed every session -> zero, zero', () => {
    const rows = [row('S1', 0), row('S2', 0)];
    assert.deepEqual(computeStreak(rows, ['S1', 'S2']), { current: 0, longest: 0 });
  });

  test('a trailing miss zeroes the current streak but keeps the longest', () => {
    // Attended, attended, attended, missed -> best run was 3, current run is 0.
    const rows = [row('S1', 60), row('S2', 60), row('S3', 60), row('S4', 0)];
    const order = ['S1', 'S2', 'S3', 'S4'];
    assert.deepEqual(computeStreak(rows, order), { current: 0, longest: 3 });
  });

  test('a mid-run miss splits the streak; the later run becomes current', () => {
    // attended, missed, attended, attended -> longest is the later 2-run,
    // which is also what's still running, so current === longest here.
    const rows = [row('S1', 60), row('S2', 0), row('S3', 60), row('S4', 60)];
    const order = ['S1', 'S2', 'S3', 'S4'];
    assert.deepEqual(computeStreak(rows, order), { current: 2, longest: 2 });
  });

  test('chronological order comes from the caller, not the input array order', () => {
    // Rows arrive out of order (as a DB result would); the caller-supplied
    // orderedSessionLabels is what decides adjacency, not array position.
    const rows = [row('S3', 60), row('S1', 60), row('S2', 0)];
    const order = ['S1', 'S2', 'S3'];   // S1 hit, S2 miss, S3 hit -> current run is just S3
    assert.deepEqual(computeStreak(rows, order), { current: 1, longest: 1 });
  });

  test('a session the student has no record for is skipped, not a miss', () => {
    // Held before the student joined -> never got an AttendanceRecord row.
    // It must not break the streak that starts once they actually show up.
    const rows = [row('S2', 60), row('S3', 60)];
    const order = ['S1', 'S2', 'S3'];   // S1 has no row for this student
    assert.deepEqual(computeStreak(rows, order), { current: 2, longest: 2 });
  });

  test('attendedMinutes missing or falsy counts as absent, not a crash', () => {
    const rows = [{ sessionLabel: 'S1' }, row('S2', null), row('S3', 60)];
    assert.deepEqual(computeStreak(rows, ['S1', 'S2', 'S3']), { current: 1, longest: 1 });
  });

  test('a session label with no matching order entry is ignored', () => {
    // Legacy/duplicate labels in AttendanceRecord that never made it into the
    // Session collection must not distort the count.
    const rows = [row('S1', 60), row('GHOST', 60), row('S2', 60)];
    assert.deepEqual(computeStreak(rows, ['S1', 'S2']), { current: 2, longest: 2 });
  });
});
