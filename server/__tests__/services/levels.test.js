import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from '../../services/levels.js';

describe('leagueBand', () => {
  test.each([
    [0, 'Bronze III'],
    [50, 'Bronze III'],
    [99, 'Bronze III'],
    [100, 'Bronze II'],
    [150, 'Bronze II'],
    [199, 'Bronze II'],
    [200, 'Bronze I'],
    [250, 'Bronze I'],
    [300, 'Silver III'],
    [400, 'Silver II'],
    [500, 'Silver I'],
    [600, 'Gold III'],
    [700, 'Gold II'],
    [800, 'Gold I'],
    [900, 'Platinum III'],
    [1000, 'Platinum II'],
    [1100, 'Platinum I'],
    [1200, 'Diamond III'],
    [1300, 'Diamond II'],
    [1400, 'Diamond I'],
    [1500, 'Legend'],
    [2000, 'Legend'],
  ])('sp %d -> %s', (sp, expected) => {
    expect(leagueBand(sp)).toBe(expected);
  });

  test('handles non-numbers', () => {
    expect(leagueBand(null)).toBe('Bronze III');
    expect(leagueBand(undefined)).toBe('Bronze III');
    expect(leagueBand('abc')).toBe('Bronze III');
  });
});

describe('levelFor', () => {
  test.each([
    [0, 0],
    [50, 0],
    [99, 0],
    [100, 1],
    [199, 1],
    [200, 2],
    [500, 5],
    [1000, 10],
  ])('highestSpEver %d -> level %d', (sp, expected) => {
    expect(levelFor(sp)).toBe(expected);
  });

  test('handles non-numbers', () => {
    expect(levelFor(null)).toBe(0);
    expect(levelFor(undefined)).toBe(0);
  });
});

describe('legendBadge', () => {
  test('returns true when highestSpEver >= 1500', () => {
    expect(legendBadge(1500)).toBe(true);
    expect(legendBadge(2000)).toBe(true);
  });

  test('returns false when below 1500', () => {
    expect(legendBadge(1499)).toBe(false);
    expect(legendBadge(0)).toBe(false);
    expect(legendBadge(null)).toBe(false);
  });
});

describe('leaderboardGroup', () => {
  test('first half of month (day 1-15)', () => {
    const d = new Date('2026-06-01T03:30:00Z');
    expect(leaderboardGroup(d)).toBe('2026-06-01_to_2026-06-15');
  });

  test('second half of month (day 16+)', () => {
    const d = new Date('2026-06-16T03:30:00Z');
    expect(leaderboardGroup(d)).toBe('2026-06-16_to_2026-06-30');
  });

  test('handles day 31 (leap year)', () => {
    const d = new Date('2026-07-31T03:30:00Z');
    expect(leaderboardGroup(d)).toBe('2026-07-16_to_2026-07-31');
  });

  test('handles invalid dates', () => {
    expect(leaderboardGroup(null)).toBe('');
    expect(leaderboardGroup(undefined)).toBe('');
    expect(leaderboardGroup('invalid')).toBe('');
  });
});

describe('groupLabel', () => {
  test('converts underscore separator to " to "', () => {
    expect(groupLabel('2026-06-01_to_2026-06-15')).toBe('2026-06-01 to 2026-06-15');
  });

  test('handles empty/null', () => {
    expect(groupLabel('')).toBe('');
    expect(groupLabel(null)).toBe('');
  });
});