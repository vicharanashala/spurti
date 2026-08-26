import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  weeklyTotal, rankRows, weeklyPodiumSpecs, weekKey, weekStartIST,
  AWARD_EXCLUDED_BOARDS, WEEKLY_EXCLUDED_CATEGORIES
} from '../server/services/leaderboards.js';

// rankRows takes student-ish documents plus a valueOf(id) lookup.
const student = (id, name, sp) => ({ _id: id, name, totalSp: sp, highestSpEver: sp });
const byMap = (m) => (id) => m[id] ?? 0;

describe('weeklyTotal', () => {
  test('excludes the joining grant from a weekly total', () => {
    // The +100 `initial` grant is awarded for starting, not for anything done
    // that week. Left in, a student who joined mid-week tops the weekly board on
    // the grant alone, beating people who actually earned points.
    const row = { total: 140, cat: { initial: 100, poll: 40 } };
    assert.equal(weeklyTotal(row), 40);
  });

  test('counts everything else, including discretionary manual SP', () => {
    const row = { total: 75, cat: { attendance: 50, poll: 15, manual: 10 } };
    assert.equal(weeklyTotal(row), 75);
  });

  test('a missing row is zero, not NaN', () => {
    assert.equal(weeklyTotal(null), 0);
    assert.equal(weeklyTotal(undefined), 0);
  });

  test('the exclusion list is what the test above assumes', () => {
    assert.deepEqual(WEEKLY_EXCLUDED_CATEGORIES, ['initial']);
  });
});

describe('rankRows', () => {
  const subset = [student('a', 'Asha', 0), student('b', 'Bhavin', 0), student('c', 'Chetan', 0)];

  test('without tieAware, every row gets a distinct rank', () => {
    const rows = rankRows(subset, byMap({ a: 50, b: 30, c: 30 }), false);
    assert.deepEqual(rows.map((r) => r.rank), [1, 2, 3]);
  });

  test('with tieAware, equal SP shares a rank and the next distinct SP jumps the tie', () => {
    // Standard competition ranking: 1, 2, 2, 4.
    const four = [...subset, student('d', 'Divya', 0)];
    const rows = rankRows(four, byMap({ a: 50, b: 30, c: 30, d: 10 }), true);
    assert.deepEqual(rows.map((r) => [r.name, r.sp, r.rank]), [
      ['Asha', 50, 1], ['Bhavin', 30, 2], ['Chetan', 30, 2], ['Divya', 10, 4]
    ]);
  });

  test('RANKS ARE NOT UNIQUE — anything keyed on rank alone will collide', () => {
    // This is load-bearing for the client: a row cannot be identified by its
    // rank, because a real board had 118 students sharing rank 1. Any "is this
    // my row" or React key logic must use something else.
    const rows = rankRows(subset, byMap({ a: 20, b: 20, c: 20 }), true);
    assert.deepEqual(rows.map((r) => r.rank), [1, 1, 1]);
    assert.equal(new Set(rows.map((r) => r.rank)).size, 1);
  });

  test('SP is rounded, and the level comes from the better of totalSp/highestSpEver', () => {
    const rows = rankRows([{ _id: 'a', name: 'Asha', totalSp: 100, highestSpEver: 1284 }], byMap({ a: 42.4 }), true);
    assert.equal(rows[0].sp, 42);
    assert.equal(rows[0].level, 12);
  });

  test('studentId is stringified so it can be compared to a string id', () => {
    const rows = rankRows([student({ toString: () => 'objid' }, 'Asha', 10)], byMap({ objid: 10 }), true);
    assert.equal(rows[0].studentId, 'objid');
  });
});

describe('weeklyPodiumSpecs', () => {
  const base = { category: 'total', weekKey: '2026-08-10', period: 'Aug 10–16', earnedAt: new Date('2026-08-17T00:00:00Z') };
  const row = (studentId, sp, rank) => ({ studentId, sp, rank, name: studentId });

  test('awards one card per podium place', () => {
    const out = weeklyPodiumSpecs({ ...base, rows: [row('a', 50, 1), row('b', 40, 2), row('c', 30, 3)] });
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((o) => o.doc.place), [1, 2, 3]);
    assert.deepEqual(out.map((o) => o.doc.achId), [
      'rank:total:week:2026-08-10:1', 'rank:total:week:2026-08-10:2', 'rank:total:week:2026-08-10:3'
    ]);
  });

  test('a shared placing awards every tied student the same achId', () => {
    const out = weeklyPodiumSpecs({ ...base, rows: [row('a', 50, 1), row('b', 50, 1)] });
    assert.equal(out.length, 2);
    assert.equal(out[0].doc.achId, out[1].doc.achId);
    assert.notEqual(out[0].doc.studentId, out[1].doc.studentId);
  });

  test('a placing shared by too many people is not a placing', () => {
    // TIE_MAX is 3. Four people tied for first is a mass tie, not a win.
    const rows = ['a', 'b', 'c', 'd'].map((id) => row(id, 50, 1));
    assert.equal(weeklyPodiumSpecs({ ...base, rows }).length, 0);
  });

  test('the top of a table of zeroes wins nothing', () => {
    assert.equal(weeklyPodiumSpecs({ ...base, rows: [row('a', 0, 1), row('b', 0, 1)] }).length, 0);
  });

  test('negative SP wins nothing either', () => {
    assert.equal(weeklyPodiumSpecs({ ...base, rows: [row('a', -5, 1)] }).length, 0);
  });

  test('an already-settled placing is not re-awarded', () => {
    const settled = new Set(['rank:total:week:2026-08-10:1']);
    const out = weeklyPodiumSpecs({ ...base, rows: [row('a', 50, 1), row('b', 40, 2)], settled });
    assert.deepEqual(out.map((o) => o.doc.place), [2]);
  });

  test('places below 3rd are never awarded', () => {
    const rows = [row('a', 50, 1), row('b', 40, 2), row('c', 30, 3), row('d', 20, 4), row('e', 10, 5)];
    const out = weeklyPodiumSpecs({ ...base, rows });
    assert.equal(out.length, 3);
    assert.ok(out.every((o) => o.doc.place <= 3));
  });

  test('the persisted detail line is the SP that won it', () => {
    const out = weeklyPodiumSpecs({ ...base, rows: [row('a', 214, 1)] });
    assert.equal(out[0].doc.detail, '214 SP');
    assert.equal(out[0].doc.kind, 'rank');
    assert.equal(out[0].doc.board, 'total');
    assert.equal(out[0].doc.periodKey, '2026-08-10');
  });

  test('the filter is studentId x achId, so a re-run is idempotent', () => {
    const out = weeklyPodiumSpecs({ ...base, rows: [row('a', 50, 1)] });
    assert.deepEqual(out[0].filter, { studentId: 'a', achId: 'rank:total:week:2026-08-10:1' });
  });
});

describe('weekKey', () => {
  test('names a week after its Monday in IST, not the preceding Sunday', () => {
    // A week starts 00:00 IST, which is 18:30 UTC the evening BEFORE. Slicing
    // the UTC instant would name the week of Aug 10-16 as "2026-08-09".
    const monday = weekStartIST(new Date('2026-08-12T06:00:00Z'));   // a Wednesday
    assert.equal(weekKey(monday), '2026-08-10');
  });

  test('a time just after the IST week boundary belongs to the new week', () => {
    // 18:30 UTC Sunday == 00:00 IST Monday.
    assert.equal(weekKey(weekStartIST(new Date('2026-08-09T18:31:00Z'))), '2026-08-10');
    assert.equal(weekKey(weekStartIST(new Date('2026-08-09T18:29:00Z'))), '2026-08-03');
  });
});

describe('AWARD_EXCLUDED_BOARDS', () => {
  test('spa mints no cards while its scoring caps out', () => {
    // The SPA scheme caps at 490 SP and over a hundred students sit exactly
    // there, so "top of Peer Learning" is a permanent mass tie decided by who
    // reached the ceiling first. Removing 'spa' here turns the cards back on.
    assert.deepEqual(AWARD_EXCLUDED_BOARDS, ['spa']);
  });
});
