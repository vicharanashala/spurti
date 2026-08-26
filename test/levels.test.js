import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from '../server/services/levels.js';

describe('levelFor', () => {
  test('is floor(sp / 100)', () => {
    assert.equal(levelFor(0), 0);
    assert.equal(levelFor(99), 0);
    assert.equal(levelFor(100), 1);
    assert.equal(levelFor(1284), 12);
  });

  test('never goes negative, and survives junk', () => {
    // A level is a lifetime achievement — it must not be expressible as negative
    // even if a balance somehow is.
    assert.equal(levelFor(-500), 0);
    assert.equal(levelFor(null), 0);
    assert.equal(levelFor(undefined), 0);
    assert.equal(levelFor('not a number'), 0);
  });

  test('the milestone thresholds land where the cards claim', () => {
    // Achievement cards say "Reached Level N" at N*100 SP. If these drift, cards
    // are awarded at a figure that does not match their own printed detail line.
    for (const n of [5, 10, 15, 20, 25]) {
      assert.equal(levelFor(n * 100), n, `${n * 100} SP should be exactly level ${n}`);
      assert.equal(levelFor(n * 100 - 1), n - 1, `${n * 100 - 1} SP should not yet be level ${n}`);
    }
  });
});

describe('legendBadge', () => {
  test('unlocks at 1500 and not before', () => {
    assert.equal(legendBadge(1499), false);
    assert.equal(legendBadge(1500), true);
    assert.equal(legendBadge(9999), true);
  });

  test('reads highestSpEver, so it cannot be lost by spending down', () => {
    // The caller passes highestSpEver precisely so the badge is permanent. This
    // test exists to make that contract visible, not to test Number().
    assert.equal(legendBadge(1500), true);
    assert.equal(legendBadge(null), false);
  });
});

describe('leagueBand', () => {
  test('band edges', () => {
    assert.equal(leagueBand(0), 'Bronze III');
    assert.equal(leagueBand(99), 'Bronze III');
    assert.equal(leagueBand(100), 'Bronze II');
    assert.equal(leagueBand(199), 'Bronze II');
    assert.equal(leagueBand(1499), 'Diamond I');
    assert.equal(leagueBand(1500), 'Legend');
    assert.equal(leagueBand(50000), 'Legend');
  });

  test('every band is reachable and none overlap', () => {
    // Walking every 100 SP boundary catches a typo'd band edge, which would
    // otherwise show as one league silently swallowing another.
    const seen = new Set();
    for (let sp = 0; sp <= 1600; sp += 1) {
      const band = leagueBand(sp);
      assert.ok(band, `no band for ${sp} SP`);
      seen.add(band);
    }
    assert.equal(seen.size, 16, 'expected all 16 bands to be reachable');
  });

  test('negative and junk fall back to the lowest band, not undefined', () => {
    assert.equal(leagueBand(-10), 'Bronze III');
    assert.equal(leagueBand(null), 'Bronze III');
  });
});

describe('leaderboardGroup', () => {
  test('splits the month at the 15th', () => {
    assert.equal(leaderboardGroup('2026-06-15T03:30:00Z'), '2026-06-01_to_2026-06-15');
    assert.equal(leaderboardGroup('2026-06-16T03:30:00Z'), '2026-06-16_to_2026-06-30');
  });

  test('second half ends on the real last day of the month', () => {
    assert.equal(leaderboardGroup('2026-02-20T03:30:00Z'), '2026-02-16_to_2026-02-28');
    assert.equal(leaderboardGroup('2026-01-31T03:30:00Z'), '2026-01-16_to_2026-01-31');
    assert.equal(leaderboardGroup('2026-04-30T03:30:00Z'), '2026-04-16_to_2026-04-30');
  });

  test('leap February', () => {
    assert.equal(leaderboardGroup('2028-02-20T03:30:00Z'), '2028-02-16_to_2028-02-29');
  });

  test('missing or unparseable dates give an empty group, never a broken key', () => {
    // A group string is used as part of a boardKey. "NaN-NaN-01_to_..." would be
    // upserted as a real board and then never cleaned up.
    assert.equal(leaderboardGroup(null), '');
    assert.equal(leaderboardGroup(''), '');
    assert.equal(leaderboardGroup(undefined), '');
    assert.equal(leaderboardGroup('not a date'), '');
  });

  test('a four-digit year is required for a sane group', () => {
    // Two students once had start dates typed as 0026-08-14 and 2006-08-01,
    // which produced groups like "26-08-01_to_26-08-15" sitting alongside the
    // real ones. The function faithfully formats whatever year it is given, so
    // this documents that validation belongs upstream, at data entry.
    assert.equal(leaderboardGroup('0026-08-14T00:00:00Z'), '26-08-01_to_26-08-15');
  });
});

describe('groupLabel', () => {
  test('makes a group key readable', () => {
    assert.equal(groupLabel('2026-06-01_to_2026-06-15'), '2026-06-01 to 2026-06-15');
  });

  test('empty in, empty out', () => {
    assert.equal(groupLabel(''), '');
    assert.equal(groupLabel(null), '');
  });
});
