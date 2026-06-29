/**
 * Spurti Levels, Trophy Leagues, Legend status, and biweekly onboarding groups.
 *
 * These are DERIVED VIEWS over the existing SP system — pure functions, no DB,
 * no side effects. SP transactions and balances are never changed here.
 * Spec: research/05_experiments/spurti_levels_leagues/samagama_spurti_levels_leagues_spec.md
 */

// Current SP -> Trophy League. Exact bands from the spec (§4).
const LEAGUE_BANDS = [
  [1500, Infinity, 'Legend'],
  [1400, 1499, 'Diamond I'],
  [1300, 1399, 'Diamond II'],
  [1200, 1299, 'Diamond III'],
  [1100, 1199, 'Platinum I'],
  [1000, 1099, 'Platinum II'],
  [900, 999, 'Platinum III'],
  [800, 899, 'Gold I'],
  [700, 799, 'Gold II'],
  [600, 699, 'Gold III'],
  [500, 599, 'Silver I'],
  [400, 499, 'Silver II'],
  [300, 399, 'Silver III'],
  [200, 299, 'Bronze I'],
  [100, 199, 'Bronze II'],
  [0, 99, 'Bronze III'],
];

export function leagueBand(currentSp) {
  const sp = Math.max(0, Number(currentSp) || 0);
  for (const [lo, hi, name] of LEAGUE_BANDS) if (sp >= lo && sp <= hi) return name;
  return 'Bronze III';
}

// Level = lifetime achievement, never decreases. floor(highestSpEver / 100).
export function levelFor(highestSpEver) {
  return Math.floor(Math.max(0, Number(highestSpEver) || 0) / 100);
}

// Legend Badge = highestSpEver >= 1500, permanent once unlocked.
export function legendBadge(highestSpEver) {
  return (Number(highestSpEver) || 0) >= 1500;
}

// Biweekly onboarding group from a date: day 1-15 -> first half, 16-end -> second half.
// Returns e.g. "2026-06-01_to_2026-06-15". Uses UTC date parts (onboarding dates
// in this system are stored at 09:00 IST = 03:30Z, so the UTC day matches intent).
export function leaderboardGroup(onboardingDate) {
  if (!onboardingDate) return '';
  const d = new Date(onboardingDate);
  if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const mm = String(m + 1).padStart(2, '0');
  if (day <= 15) return `${y}-${mm}-01_to_${y}-${mm}-15`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${mm}-16_to_${y}-${mm}-${String(lastDay).padStart(2, '0')}`;
}

// "2026-06-01_to_2026-06-15" -> "2026-06-01 to 2026-06-15" (for display).
export function groupLabel(group) {
  return String(group || '').replace('_to_', ' to ');
}
