/**
 * server/services/progress.js
 * Derived-view utilities for streaks and progress bands.
 * Pure functions only — no DB access, no side effects.
 */

export const PROGRESS_BANDS = [
  { name: 'Excellent',    minRate: 0.80 },
  { name: 'Active',       minRate: 0.60 },
  { name: 'Slowing Down', minRate: 0.35 },
  { name: 'Recovery',     minRate: 0.00 },
];

export function computeStreak(qualifiedFlags) {
  if (!qualifiedFlags.length)
    return { currentStreak: 0, longestStreak: 0, freezesAvailable: 0 };

  let qualifiedSoFar  = 0;
  let freezesEarned   = 0;
  let freezesConsumed = 0;
  let currentStreak   = 0;
  let longestStreak   = 0;

  for (const qualified of qualifiedFlags) {
    if (qualified) {
      qualifiedSoFar += 1;
      currentStreak  += 1;
      freezesEarned   = Math.floor(qualifiedSoFar / 5);
      if (currentStreak > longestStreak) longestStreak = currentStreak;
    } else {
      const available = freezesEarned - freezesConsumed;
      if (available > 0) {
        freezesConsumed += 1;
      } else {
        currentStreak = 0;
      }
    }
  }

  return {
    currentStreak,
    longestStreak,
    freezesAvailable: freezesEarned - freezesConsumed,
  };
}

export function computeProgressBand(qualifiedFlags) {
  const window = qualifiedFlags.slice(-5);
  if (!window.length)
    return { band: null, rate: null, trend: 'steady' };

  const qualifiedCount = window.filter(Boolean).length;
  const rate = qualifiedCount / window.length;
  const band = PROGRESS_BANDS.find(b => rate >= b.minRate)?.name ?? 'Recovery';

  const recent = qualifiedFlags.slice(-3);
  const prev   = qualifiedFlags.slice(-6, -3);
  let trend = 'steady';
  if (prev.length > 0) {
    const rr   = recent.filter(Boolean).length / recent.length;
    const pr   = prev.filter(Boolean).length   / prev.length;
    const diff = rr - pr;
    if (diff >= 0.20)       trend = 'up';
    else if (diff <= -0.20) trend = 'down';
  }

  return { band, rate: Math.round(rate * 100), trend };
}

export function computeWeeklyXp(transactions) {
  const since    = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weeklyXp = transactions
    .filter(t => new Date(t.dateTime) >= since)
    .reduce((sum, t) => sum + (t.appliedDelta || 0), 0);
  return { weeklyXp };
}

export function buildTimelineDots(qualifiedFlags) {
  return qualifiedFlags.slice(-13).map(q => (q ? 'qualified' : 'missed'));
}