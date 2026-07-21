import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BadgeArt, MiniBadge } from './BadgeArt';
import { RANKS, TIER_THEME, RANK_DESCRIPTIONS, rankFor, nextRank, MAX_SP, STARTING_SP } from './ranks';

// ============================================================
// JourneyProgressTrack
// A horizontal track stretching from STARTING_SP to MAX_SP. All 16
// rank checkpoints are placed along it. A small runner character
// runs continuously above the track; when SP changes, the runner
// dashes forward and leaves speed trails before the count-up catches
// up. Hovering a checkpoint reveals a tooltip with the rank name +
// description.
// ============================================================

// SP range mapped to the track [0, 1] for the runner x position.
function spToPct(sp) {
  const v = Math.max(STARTING_SP, Math.min(MAX_SP, sp));
  return ((v - STARTING_SP) / (MAX_SP - STARTING_SP)) * 100;
}

function pctToTrackX(pct, trackWidth) {
  // Convert track % to an absolute x. The marker centers are pinned
  // by CSS, so we just return a percentage of the track width.
  return (pct / 100) * trackWidth;
}

// Running mini-character — original SVG silhouette with bobbing
// arms. Drawn as inline SVG so it can be transformed via CSS.
function Runner({ dashing }) {
  return (
    <svg width="22" height="28" viewBox="0 0 22 28" fill="none"
      className={`rk-runner${dashing ? ' is-dashing' : ''}`}
      aria-hidden="true"
    >
      {/* Head */}
      <circle cx="11" cy="6" r="3.5" fill="currentColor" />
      {/* Body */}
      <path d="M11 10 L11 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      {/* Front arm (forward) */}
      <path d="M11 13 L15 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Back arm (back) */}
      <path d="M11 13 L7 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Front leg */}
      <path d="M11 18 L15 27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      {/* Back leg */}
      <path d="M11 18 L7 27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Hook: live count-up of a numeric value, easeOutCubic over `duration`.
function useCountUp(target, duration = 700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = Number(target) || 0;
    if (from === to) { setV(to); return; }
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function MilestoneMarker({ rank, sp, currentSp, isCompleted, isCurrent, theme, onHover, onLeave, isHovered }) {
  const pct = spToPct(sp);
  const completed = currentSp >= sp;
  return (
    <div
      className={`rk-milestone${completed ? ' is-completed' : ''}${isCurrent ? ' is-current' : ''}`}
      style={{ left: `${pct}%` }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div
        className="rk-milestone__node"
        style={{ background: completed ? rank.theme.gradient : 'var(--surface)',
                 borderColor: completed ? rank.theme.glow : 'var(--border-strong)' }}
      >
        {completed
          ? <span className="rk-milestone__check">✓</span>
          : <span className="rk-milestone__sp">{sp >= 1000 ? `${(sp/1000).toFixed(1)}k` : sp}</span>
        }
      </div>
      <div className="rk-milestone__label" style={{ color: completed ? rank.theme.glow : 'var(--text-dim)' }}>
        {rank.name}
      </div>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="rk-milestone__tip"
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 2, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            style={{ '--wgc-glow': rank.theme.glow }}
          >
            <div className="rk-milestone__tip-rank" style={{ color: rank.theme.glow }}>
              {rank.name}
            </div>
            <div className="rk-milestone__tip-meta">
              <span>{sp} SP</span>
              <span className="rk-milestone__tip-sep">·</span>
              <span>Rank {rank.idx} / 16</span>
            </div>
            <div className="rk-milestone__tip-desc">{RANK_DESCRIPTIONS[rank.name]}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function JourneyProgressTrack({ sp, onPromoted }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const trackRef = useRef(null);
  const previousSp = useRef(sp);
  const [isDashing, setIsDashing] = useState(false);
  const [promotion, setPromotion] = useState(null);

  const rank = useMemo(() => rankFor(sp), [sp]);
  const next = useMemo(() => nextRank(sp), [sp]);
  const displaySp = useCountUp(sp);

  // Detect SP changes → dashing runner + rank-up event.
  useEffect(() => {
    if (previousSp.current === sp) return;
    if (sp > previousSp.current) {
      const prevRank = rankFor(previousSp.current);
      const newRank = rankFor(sp);
      if (newRank.idx > prevRank.idx) {
        setIsDashing(true);
        setTimeout(() => setIsDashing(false), 1200);
        setPromotion({ from: prevRank, to: newRank });
        setTimeout(() => {
          setPromotion(null);
          onPromoted && onPromoted({ from: prevRank, to: newRank });
        }, 3000);
      } else {
        setIsDashing(true);
        setTimeout(() => setIsDashing(false), 900);
      }
    }
    previousSp.current = sp;
  }, [sp, onPromoted]);

  const progressPct = spToPct(sp);
  const currentIdx = rank.idx;

  return (
    <div className="rk-track-wrap">
      <div className="rk-track-head">
        <div className="rk-track-head__left">
          <div className="rk-track-eyebrow">SP JOURNEY</div>
          <div className="rk-track-sp">
            <span className="rk-track-sp-val">{displaySp}</span>
            <span className="rk-track-sp-label">SP</span>
          </div>
        </div>
        <div className="rk-track-head__right">
          <div className="rk-track-current">
            <div className="rk-track-current-rank" style={{ color: rank.theme.glow }}>
              {rank.name}
            </div>
            <div className="rk-track-current-meta">
              Tier <b>{rank.theme.label}</b> · Rank {rank.idx}/16
            </div>
          </div>
        </div>
      </div>

      <div className="rk-track" ref={trackRef}>
        {/* Track rail (gradient from start to end) */}
        <div className="rk-track-rail">
          <div
            className="rk-track-fill"
            style={{ width: `${progressPct}%`, '--rk-glow': rank.theme.glow }}
          />
        </div>

        {/* Milestone markers */}
        {RANKS.map((r, i) => (
          <MilestoneMarker
            key={r.idx}
            rank={r}
            sp={r.min}
            currentSp={sp}
            isCompleted={sp >= r.min}
            isCurrent={currentIdx === r.idx}
            theme={r.theme}
            isHovered={hoverIdx === r.idx}
            onHover={() => setHoverIdx(r.idx)}
            onLeave={() => setHoverIdx(null)}
          />
        ))}

        {/* Runner */}
        <div
          className="rk-runner-wrap"
          style={{ left: `${progressPct}%`, color: rank.theme.glow, '--rk-runner-color': rank.theme.glow }}
        >
          <div className={`rk-runner-aura${isDashing ? ' is-active' : ''}`} />
          {isDashing && <div className="rk-runner-trail" />}
          {isDashing && <div className="rk-runner-trail rk-runner-trail--2" />}
          <Runner dashing={isDashing} />
        </div>
      </div>

      <div className="rk-track-foot">
        <div className="rk-track-foot__sp">
          <div className="rk-track-eyebrow">SP</div>
          <span className="rk-track-sp-min">{STARTING_SP}</span>
        </div>
        {next ? (
          <div className="rk-track-foot__next">
            <div className="rk-track-eyebrow">NEXT RANK</div>
            <div className="rk-track-foot__next-row">
              <span className="rk-track-foot__next-name" style={{ color: next.rank.theme.glow }}>
                {next.rank.name}
              </span>
              <span className="rk-track-foot__next-sep">·</span>
              <span className="rk-track-foot__next-meta">
                {next.spNeeded} SP to go
              </span>
            </div>
            <div className="rk-track-foot__next-bar">
              <motion.div
                className="rk-track-foot__next-fill"
                style={{ background: next.rank.theme.gradient }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.round(((sp - rank.min) / (next.rank.min - rank.min)) * 100))}%` }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
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
          <span className="rk-track-sp-max">{MAX_SP}</span>
        </div>
      </div>

      <AnimatePresence>
        {promotion && (
          <motion.div
            className="rk-promotion"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            style={{ '--rk-glow': promotion.to.theme.glow }}
          >
            <div className="rk-promotion__eyebrow">✨ RANK PROMOTED!</div>
            <div className="rk-promotion__title">{promotion.to.name}</div>
            <div className="rk-promotion__sub">
              From {promotion.from.name} → {promotion.to.name}
            </div>
            <div className="rk-promotion__art">
              <BadgeArt tier={promotion.to.tier} size={64} glow={promotion.to.theme.glow} accent={promotion.to.theme.accent} />
            </div>
            <div className="rk-promotion__msg">
              {RANK_DESCRIPTIONS[promotion.to.name]}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Big "current rank" display with full-size badge art + meta info.
export function CurrentRankBadge({ sp, profile }) {
  const rank = useMemo(() => rankFor(sp), [sp]);
  const next = useMemo(() => nextRank(sp), [sp]);
  const tier = rank.theme;
  return (
    <div className="rk-current" style={{ '--rk-glow': tier.glow }}>
      <div className="rk-current__left">
        <BadgeArt tier={rank.tier} size={72} glow={tier.glow} accent={tier.accent} />
      </div>
      <div className="rk-current__body">
        <div className="rk-current__eyebrow">{tier.label.toUpperCase()} TIER</div>
        <div className="rk-current__name" style={{ color: tier.glow }}>{rank.name}</div>
        <div className="rk-current__desc">{RANK_DESCRIPTIONS[rank.name]}</div>
        {next && (
          <div className="rk-current__next">
            Next: <b style={{ color: next.rank.theme.glow }}>{next.rank.name}</b>
            <span className="rk-current__next-sep">·</span>
            {next.spNeeded} SP to go
          </div>
        )}
      </div>
    </div>
  );
}