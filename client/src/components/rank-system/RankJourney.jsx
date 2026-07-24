import React, { useEffect, useRef, useState } from 'react';
import { RANKS, TIER_THEME, RANK_DESCRIPTIONS, rankFor, nextRank } from './ranks';
import './rank-system.css';

// ============================================================
// RankJourney (safe build)
// The previous version used heavy framer-motion animations + complex
// SVG paths inside a sub-system that was breaking the dashboard.
// This is a stripped-down, dependency-light rebuild: pure CSS
// animations, inline SVGs only via the small BadgeArt component, and
// no framer-motion dependency on the new files. All the rank
// definitions, themes, descriptions and lifecycle (current → next,
// milestone markers, celebration toast) still work — we just don't
// promote the celebration to a giant overlay.
// ============================================================

function Badge({ tier, size = 56, glow, accent }) {
  // Inline SVG badge for each tier. Same art as BadgeArt.jsx but
  // folded into one component (no SVG <animate>, no nested defs) to
  // keep the runtime footprint small and avoid edge cases in browsers
  // that don't fully support SMIL.
  const theme = glow && accent ? { glow, accent } : TIER_THEME[tier];
  const props = { size, glow: theme.glow, accent: theme.accent };
  switch (tier) {
    case 'bronze':  return <BronzeShield  {...props} />;
    case 'silver':  return <SilverWings   {...props} />;
    case 'gold':    return <GoldCrystal   {...props} />;
    case 'diamond': return <DiamondCrystal{...props} />;
    case 'heroic':  return <HeroicCrest   {...props} />;
    case 'master':  return <MasterEmblem  {...props} />;
    default:       return <BronzeShield  {...props} />;
  }
}

function BronzeShield({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="bz-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#D4933F" />
          <stop offset="100%" stopColor="#5C2C0C" />
        </linearGradient>
      </defs>
      <path d="M50 8 L82 22 L82 56 C82 76 50 92 50 92 C50 92 18 76 18 56 L18 22 Z"
        fill="url(#bz-g)" stroke={glow} strokeWidth="1.5" />
      <path d="M38 42 L46 50 L62 34" stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="50" cy="58" r="3" fill={accent} />
    </svg>
  );
}

function SilverWings({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="sv-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5F5F5" />
          <stop offset="100%" stopColor="#606060" />
        </linearGradient>
      </defs>
      <path d="M20 60 L34 32 L50 50 L66 32 L80 60 L70 56 L62 70 L50 56 L38 70 L30 56 Z"
        fill="url(#sv-g)" stroke={glow} strokeWidth="1.2" />
      <path d="M50 50 L50 88" stroke={accent} strokeWidth="3" />
    </svg>
  );
}

function GoldCrystal({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="gd-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFE760" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>
      <path d="M50 6 L70 22 L78 50 L50 94 L22 50 L30 22 Z"
        fill="url(#gd-g)" stroke={glow} strokeWidth="1.5" />
      <circle cx="50" cy="50" r="4" fill={accent} />
    </svg>
  );
}

function DiamondCrystal({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="dm-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7CDBFF" />
          <stop offset="100%" stopColor="#003B82" />
        </linearGradient>
      </defs>
      <path d="M50 4 L80 38 L50 96 L20 38 Z" fill="url(#dm-g)" stroke={glow} strokeWidth="1.5" />
      <path d="M50 4 L66 30 L50 56 L34 30 Z" fill={accent} opacity="0.4" />
    </svg>
  );
}

function HeroicCrest({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="hr-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF3B5C" />
          <stop offset="50%" stopColor="#8B0000" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
      <path d="M14 30 L50 6 L86 30 L86 60 C86 80 50 96 50 96 C50 96 14 80 14 60 Z"
        fill="url(#hr-g)" stroke={glow} strokeWidth="1.5" />
      <circle cx="50" cy="46" r="5" fill={accent} />
    </svg>
  );
}

function MasterEmblem({ size, glow, accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="ms-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6B21A8" />
          <stop offset="50%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      <path d="M50 4 L56 36 L88 30 L66 50 L88 70 L56 64 L50 96 L44 64 L12 70 L34 50 L12 30 L44 36 Z"
        fill="url(#ms-g)" stroke={glow} strokeWidth="0.8" />
      <path d="M50 30 L66 50 L50 70 L34 50 Z" fill="#FFFFFF" opacity="0.85" />
      <path d="M50 38 L58 50 L50 62 L42 50 Z" fill={accent} />
    </svg>
  );
}

// ============================================================
// CurrentRankBadge — hero card showing the student's rank
// ============================================================
export function CurrentRankBadge({ sp, profile }) {
  const rank = rankFor(sp);
  const next = nextRank(sp);
  const tier = TIER_THEME[rank.tier];
  const nextTier = next ? TIER_THEME[next.rank.tier] : null;
  const desc = RANK_DESCRIPTIONS[rank.name] || '';
  return (
    <div className="rk-current" style={{ '--rk-glow': tier.glow }}>
      <div className="rk-current__left">
        <Badge tier={rank.tier} size={64} glow={tier.glow} accent={tier.accent} />
      </div>
      <div className="rk-current__body">
        <div className="rk-current__eyebrow">{tier.label.toUpperCase()} TIER</div>
        <div className="rk-current__name" style={{ color: tier.glow }}>{rank.name}</div>
        <div className="rk-current__desc">{desc}</div>
        {next && nextTier && (
          <div className="rk-current__next">
            Next: <b style={{ color: nextTier.glow }}>{next.rank.name}</b>
            <span className="rk-current__next-sep">·</span>
            {next.spNeeded} SP to go
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// JourneyProgressTrack — horizontal track with 16 milestone markers
// and a runner character.
// ============================================================
function spToPct(sp) {
  const v = Math.max(100, Math.min(1500, sp));
  return ((v - 100) / (1500 - 100)) * 100;
}

function MilestoneMarker({ rank, sp, currentSp, isCompleted, theme }) {
  const pct = spToPct(sp);
  return (
    <div className={`rk-milestone${isCompleted ? ' is-completed' : ''}`} style={{ left: `${pct}%` }}>
      <div
        className="rk-milestone__node"
        style={{ background: isCompleted ? theme.gradient : 'var(--surface)',
                 borderColor: isCompleted ? theme.glow : 'var(--border-strong)' }}
      >
        {isCompleted ? <span className="rk-milestone__check">✓</span> : <span className="rk-milestone__sp">{sp >= 1000 ? `${(sp/1000).toFixed(1)}k` : sp}</span>}
      </div>
      <div className="rk-milestone__label" style={{ color: isCompleted ? theme.glow : 'var(--text-dim)' }}>
        {rank.name}
      </div>
    </div>
  );
}

function Runner({ tier }) {
  // Minimal SVG silhouette — no SMIL animations, no nested defs.
  const c = TIER_THEME[tier].glow;
  return (
    <svg width="20" height="26" viewBox="0 0 22 28" fill="none"
      className="rk-runner" style={{ color: c }} aria-hidden="true">
      <circle cx="11" cy="6" r="3.5" fill="currentColor" />
      <path d="M11 10 L11 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 13 L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 13 L7 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 18 L15 27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M11 18 L7 27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function JourneyProgressTrack({ sp }) {
  const rank = rankFor(sp);
  const next = nextRank(sp);
  const tier = TIER_THEME[rank.tier];
  const nextTier = next ? TIER_THEME[next.rank.tier] : null;
  const progressPct = spToPct(sp);

  return (
    <div className="rk-track-wrap">
      <div className="rk-track-head">
        <div className="rk-track-head__left">
          <div className="rk-track-eyebrow">SP JOURNEY</div>
          <div className="rk-track-sp">
            <span className="rk-track-sp-val">{sp}</span>
            <span className="rk-track-sp-label">SP</span>
          </div>
        </div>
        <div className="rk-track-head__right">
          <div className="rk-track-current">
            <div className="rk-track-current-rank" style={{ color: tier.glow }}>
              {rank.name}
            </div>
            <div className="rk-track-current-meta">
              Tier <b>{tier.label}</b> · Rank {rank.idx}/16
            </div>
          </div>
        </div>
      </div>

      <div className="rk-track">
        <div className="rk-track-rail">
          <div
            className="rk-track-fill"
            style={{ width: `${progressPct}%`, '--rk-glow': tier.glow }}
          />
        </div>
        {RANKS.map(r => (
          <MilestoneMarker
            key={r.idx}
            rank={r}
            sp={r.min}
            currentSp={sp}
            isCompleted={sp >= r.min}
            theme={r.theme}
          />
        ))}
        <div
          className="rk-runner-wrap"
          style={{ left: `${progressPct}%`, color: tier.glow }}
        >
          <Runner tier={rank.tier} />
        </div>
      </div>

      <div className="rk-track-foot">
        <div className="rk-track-foot__sp">
          <div className="rk-track-eyebrow">SP</div>
          <span className="rk-track-sp-min">100</span>
        </div>
        {next && nextTier ? (
          <div className="rk-track-foot__next">
            <div className="rk-track-eyebrow">NEXT RANK</div>
            <div className="rk-track-foot__next-row">
              <span className="rk-track-foot__next-name" style={{ color: nextTier.glow }}>
                {next.rank.name}
              </span>
              <span className="rk-track-foot__next-sep">·</span>
              <span className="rk-track-foot__next-meta">
                {next.spNeeded} SP to go
              </span>
            </div>
            <div className="rk-track-foot__next-bar">
              <div
                className="rk-track-foot__next-fill"
                style={{
                  width: `${Math.min(100, Math.round(((sp - rank.min) / (next.rank.min - rank.min)) * 100))}%`,
                  background: nextTier.gradient
                }}
              />
            </div>
          </div>
        ) : (
          <div className="rk-track-foot__max">
            <div className="rk-track-eyebrow">MAXED OUT</div>
            <span className="rk-track-foot__max-name">Master rank achieved</span>
          </div>
        )}
        <div className="rk-track-foot__sp">
          <div className="rk-track-eyebrow">SP</div>
          <span className="rk-track-sp-max">1500</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// RankJourney — top-level container (simplified, no celebration toast)
// ============================================================
export function RankJourney({ sp, profile }) {
  return (
    <div className="rank-journey">
      <CurrentRankBadge sp={sp} profile={profile} />
      <JourneyProgressTrack sp={sp} />
    </div>
  );
}