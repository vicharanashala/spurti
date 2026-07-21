// ============================================================
// Rank System — data layer (client-side mirror of server/levels.js)
// The client cannot import the server module directly (Vite's resolver
// separates the two bundles). We keep a small parallel definition
// here — the server is still the source of truth for the rank name;
// this file only adds the visual metadata (theme colors, descriptions).
// ============================================================

// Rank table — must mirror server/services/levels.js
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
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (v >= RANKS[i].min) return RANKS[i];
  }
  return RANKS[0];
}

export function nextRank(sp) {
  const v = Math.max(0, Math.min(MAX_SP, Number(sp) || 0));
  for (let i = 0; i < RANKS.length; i++) {
    if (v < RANKS[i].min) return { rank: RANKS[i], spNeeded: RANKS[i].min - v };
  }
  return null;
}

// Per-tier visual treatment
export const TIER_THEME = {
  bronze:  {
    label: 'Bronze',
    gradient: 'linear-gradient(135deg, #CD7F32 0%, #8B4513 60%, #5C2C0C 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(205,127,50,0.18) 0%, rgba(139,69,19,0.10) 100%)',
    glow: '#CD7F32',
    accent: '#FFD89A',
    text: '#7A4A1B'
  },
  silver: {
    label: 'Silver',
    gradient: 'linear-gradient(135deg, #E8E8E8 0%, #B8B8B8 50%, #707070 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(232,232,232,0.22) 0%, rgba(112,112,112,0.10) 100%)',
    glow: '#C0C0C0',
    accent: '#FFFFFF',
    text: '#4A4A4A'
  },
  gold: {
    label: 'Gold',
    gradient: 'linear-gradient(135deg, #FFD700 0%, #FFA500 50%, #B8860B 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(255,215,0,0.20) 0%, rgba(184,134,11,0.10) 100%)',
    glow: '#FFD700',
    accent: '#FFF1A8',
    text: '#8A6500'
  },
  diamond: {
    label: 'Diamond',
    gradient: 'linear-gradient(135deg, #4FACFE 0%, #00C2FE 50%, #0050B3 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(79,172,254,0.20) 0%, rgba(0,80,179,0.10) 100%)',
    glow: '#4FACFE',
    accent: '#BDE2FF',
    text: '#003C7A'
  },
  heroic: {
    label: 'Heroic',
    gradient: 'linear-gradient(135deg, #DC143C 0%, #8B0000 40%, #1E40AF 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(220,20,60,0.20) 0%, rgba(30,64,175,0.18) 100%)',
    glow: '#DC143C',
    accent: '#FF6B8A',
    text: '#6B0000'
  },
  master: {
    label: 'Master',
    gradient: 'linear-gradient(135deg, #6B21A8 0%, #FFD700 50%, #FFFFFF 100%)',
    gradientSoft: 'linear-gradient(135deg, rgba(107,33,168,0.22) 0%, rgba(255,215,0,0.20) 100%)',
    glow: '#FFD700',
    accent: '#F0E0FF',
    text: '#3B0764'
  }
};

export const RANK_DESCRIPTIONS = {
  'Bronze III':  'Beginning the learning journey. Show up and earn.',
  'Bronze II':   'Building consistency. Every session counts.',
  'Bronze I':    'Solid attendance. You are ready for the next tier.',
  'Silver III':  'Crossed into Silver. You are part of the top 70%.',
  'Silver II':   'Strong consistency. Keep your daily streak alive.',
  'Silver I':    'Polished learner. You are one rank away from Gold.',
  'Gold III':    'Entered Gold. You stand out from the cohort.',
  'Gold II':     'Reliable performer. You are now in the top 40%.',
  'Gold I':      'Consistent high performer. Diamond is within reach.',
  'Diamond III': 'First Diamond tier. You are in the top 25%.',
  'Diamond II':  'Strong academic record. Heroic awaits.',
  'Diamond I':   'Elite tier. You are now in the top 15%.',
  'Heroic III':  'Heroic unlocked. The top 10% of the cohort.',
  'Heroic II':   'Outstanding performance. One step from Master.',
  'Heroic I':    'Final stretch. Master is one rank away.',
  'Master':      'Maximum achievement. The pinnacle of the program.'
};

export function decorateRank(rank) {
  if (!rank) return null;
  return { ...rank, theme: TIER_THEME[rank.tier], description: RANK_DESCRIPTIONS[rank.name] };
}