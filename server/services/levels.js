/**
 * Spurti Ranks — gamified progression system inspired by ranked emblems.
 * Pure functions, no DB writes. The student's current rank is derived
 * from their total SP.
 *
 * Spec (May 2026 redesign): every intern starts at 100 SP and tops out at
 * 1500 SP ("Master"). 16 named ranks across 6 tiers, distributed evenly
 * along the 100–1500 span.
 */

const RANK_TABLE = [
  { min: 1500, name: 'Master',     tier: 'master',  idx: 16 },
  { min: 1400, name: 'Heroic I',    tier: 'heroic',  idx: 15 },
  { min: 1300, name: 'Heroic II',   tier: 'heroic',  idx: 14 },
  { min: 1200, name: 'Heroic III',  tier: 'heroic',  idx: 13 },
  { min: 1100, name: 'Diamond I',   tier: 'diamond', idx: 12 },
  { min: 1000, name: 'Diamond II',  tier: 'diamond', idx: 11 },
  { min:  900, name: 'Diamond III', tier: 'diamond', idx: 10 },
  { min:  800, name: 'Gold I',      tier: 'gold',    idx:  9 },
  { min:  700, name: 'Gold II',     tier: 'gold',    idx:  8 },
  { min:  600, name: 'Gold III',    tier: 'gold',    idx:  7 },
  { min:  500, name: 'Silver I',    tier: 'silver',  idx:  6 },
  { min:  400, name: 'Silver II',   tier: 'silver',  idx:  5 },
  { min:  300, name: 'Silver III',  tier: 'silver',  idx:  4 },
  { min:  200, name: 'Bronze I',    tier: 'bronze',  idx:  3 },
  { min:  100, name: 'Bronze II',   tier: 'bronze',  idx:  2 },
  { min:    0, name: 'Bronze III',  tier: 'bronze',  idx:  1 }
];

export const STARTING_SP = 100;
export const MAX_SP = 1500;
export const RANKS = RANK_TABLE.slice().sort((a, b) => a.min - b.min);

export function rankFor(sp) {
  const v = Math.max(0, Math.min(MAX_SP, Number(sp) || 0));
  // Iterate descending so the highest-matching rank wins (Bronze III is
  // min=0, which would otherwise match every SP >= 0).
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (v >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

export function nextRank(sp) {
  const v = Math.max(0, Math.min(MAX_SP, Number(sp) || 0));
  // First rank whose minimum is strictly greater than the student's SP.
  for (let i = 0; i < RANKS.length; i++) {
    if (v < RANKS[i].min) return { rank: RANKS[i], spNeeded: RANKS[i].min - v };
  }
  return null;
}

// Legacy compatibility shim — old code calls leagueBand(currentSp).
// Maps the new rank name back to a short label that the rest of the app
// can still consume.
export function leagueBand(currentSp) {
  return rankFor(currentSp).name;
}

// Legacy compatibility shim — levelFor(highestSpEver) used to mean
// "level = floor(sp / 100)". The new system uses idx (1..16) instead.
// Return idx so the existing UI shows the rank number, which is more
// useful than a /100 level counter.
export function levelFor(highestSpEver) {
  return rankFor(highestSpEver).idx;
}

// Master = highestSpEver >= 1500, permanent once unlocked.
export function legendBadge(highestSpEver) {
  return (Number(highestSpEver) || 0) >= 1500;
}

// Biweekly onboarding group (unchanged from before — same semantics).
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