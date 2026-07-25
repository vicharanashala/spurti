import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './SPTrendPanel.css';

// ============================================================
// SPTrendPanel
// Premium glass card that replaces the SP Trend placeholder inside the
// Weekly Leaderboard section. Two-tier visualization:
//   1. SP trajectory line — full program, weekly buckets, single
//      connected SVG path with slope chip + confetti burst on
//      consecutive-up recovery.
//   2. Phase heatmap — 4 categories x Mon-Sat, clickable weakest cell
//      that opens the existing RecoveryCoachPopup pre-focused on the
//      matching day.
// The whole panel lives inside the existing SP Trend card slot.
// ============================================================

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CATEGORY_LABELS = {
  attendance: 'Attendance',
  poll:       'Polls',
  discussion: 'Discussions',
  challenge:  'Challenge'
};
const CATEGORY_COLOR = {
  attendance: '#6366f1',
  poll:       '#8b5cf6',
  discussion: '#10b981',
  challenge:  '#f59e0b'
};

// Map SP value → 0..4 intensity bucket. 0 = empty, 4 = strongest.
function intensityBucket(sp, max) {
  if (sp <= 0) return 0;
  const ratio = sp / Math.max(max, 1);
  if (ratio < 0.20) return 1;
  if (ratio < 0.45) return 2;
  if (ratio < 0.75) return 3;
  return 4;
}

// Small SVG confetti burst — one-shot per render. Reused only when
// the celebration rule fires (consecutive-up + up direction).
function MiniConfetti() {
  const pieces = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: 35 + Math.random() * 30,
    delay: Math.random() * 0.4,
    duration: 1.6 + Math.random() * 0.6,
    drift: -8 + Math.random() * 16,
    size: 4 + Math.random() * 4,
    rotate: Math.random() * 360,
    hue: ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'][i % 5]
  })), []);
  return (
    <div className="spt-confetti" aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.id}
          className="spt-confetti__bit"
          style={{
            left: `${p.left}%`,
            background: p.hue,
            width: `${p.size}px`,
            height: `${p.size * 0.5}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
            '--spt-drift': `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
}

export function SPTrendPanel({ data, me, onOpenRecoveryCoach }) {
  const [hasFiredConfetti, setHasFiredConfetti] = useState(false);
  const pathRef = useRef(null);

  if (!data) return null;
  const { trend = [], heatmap = [], summary = null } = data;

  // Compute chart geometry — single connected path through all points.
  const maxSp = Math.max(8, ...trend.map(p => p.sp));
  const W = 600, H = 140;
  const padL = 22, padR = 18, padT = 14, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xs = trend.length > 1 ? (innerW / (trend.length - 1)) : 0;
  const pointXY = (p, i) => ({
    x: padL + i * xs,
    y: padT + innerH - (p.sp / maxSp) * innerH
  });
  const pathD = trend.map((p, i) => {
    const { x, y } = pointXY(p, i);
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  // Compute total path length so we can animate stroke-dashoffset.
  const [pathLen, setPathLen] = useState(0);
  useEffect(() => {
    if (pathRef.current && typeof pathRef.current.getTotalLength === 'function') {
      setPathLen(pathRef.current.getTotalLength());
    }
  }, [pathD]);

  // Strict confetti rule: only when direction === 'up' AND consecutiveUpWeeks >= 2.
  const showCelebration = summary?.direction === 'up' && (summary?.consecutiveUpWeeks || 0) >= 2;

  // Compute weakest cells per category (any cell below the category's
  // weekly median — that's clickable, not only zero-SP cells).
  const weakestCellsByCategory = useMemo(() => {
    const out = {};
    if (!heatmap?.length) return out;
    for (const row of heatmap) {
      const values = row.days.map(d => d.sp).sort((a, b) => a - b);
      const median = values.length % 2
        ? values[(values.length - 1) / 2]
        : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
      out[row.category] = row.days.filter(d => d.sp < median);
    }
    return out;
  }, [heatmap]);

  // Identify the strongest cell (highest SP) for the star badge.
  const strongestCell = useMemo(() => {
    let s = null;
    for (const row of heatmap) {
      for (const d of row.days) {
        if (!s || d.sp > s.sp) s = { ...d, category: row.category };
      }
    }
    return s;
  }, [heatmap]);

  // Today's weekday index (0=Mon..5=Sat). 6 means Sunday — no highlight.
  const todayIndex = (() => {
    const d = new Date();
    const c = new Date(d.getTime() + 330 * 60_000).getUTCDay();
    return c === 0 ? 6 : c - 1; // 0..5
  })();

  return (
    <div className="spt">
      {/* Top summary line — always rendered per your locked decision. */}
      <div className="spt-summary">
        <span className="spt-summary__icon">✦</span>
        <span className="spt-summary__text">{summary?.insight || 'Steady progress over recent weeks.'}</span>
      </div>

      {/* Trend line */}
      <div className="spt-trend">
        {showCelebration && <MiniConfetti />}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="spt-trend__svg"
          role="img"
          aria-label="SP trajectory, weekly from program start"
        >
          <defs>
            <linearGradient id="spt-trend-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stopColor="#6366f1" />
              <stop offset="55%"  stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          {/* Y-axis grid */}
          <line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="var(--spt-grid)" strokeWidth="1" />
          <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--spt-grid)" strokeWidth="1" />
          {/* Connected path */}
          {trend.length > 1 && (
            <path
              ref={pathRef}
              d={pathD}
              stroke="url(#spt-trend-grad)"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                strokeDasharray: pathLen || 0,
                strokeDashoffset: pathLen || 0,
                transition: 'stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1)'
              }}
              ref-thing=""
              onAnimationStart={(e) => { e.currentTarget.style.strokeDashoffset = '0'; }}
            />
          )}
          {/* Dots */}
          {trend.map((p, i) => {
            const { x, y } = pointXY(p, i);
            const isLast = i === trend.length - 1;
            return (
              <g key={p.weekStart}>
                <circle cx={x} cy={y} r={isLast ? 4.6 : 2.8}
                  fill={isLast ? '#10b981' : '#6366f1'}
                  stroke="#fff" strokeWidth={isLast ? 2 : 1.2}
                />
                {isLast && (
                  <circle cx={x} cy={y} r="9" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.45">
                    <animate attributeName="r" from="4" to="14" dur="1.6s" repeatCount="indefinite" />
                    <animate attributeName="opacity" from="0.45" to="0" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
          {/* X-axis labels (last 5 weeks only, to avoid clutter) */}
          {trend.length > 0 && (() => {
            const step = Math.max(1, Math.ceil(trend.length / 5));
            const indices = [];
            for (let i = 0; i < trend.length; i += step) indices.push(i);
            if (indices[indices.length - 1] !== trend.length - 1) indices.push(trend.length - 1);
            return indices.map(i => {
              const { x } = pointXY(trend[i], i);
              return (
                <text key={i} x={x} y={H - 4} textAnchor="middle" fontSize="8.5" fill="var(--spt-axis)">
                  {trend[i].weekLabel}
                </text>
              );
            });
          })()}
        </svg>
        <div className="spt-trend__meta">
          <div className="spt-trend__last">
            <span className="spt-trend__last-sp">{trend[trend.length - 1]?.sp ?? 0}</span>
            <span className="spt-trend__last-label">SP · {trend[trend.length - 1]?.weekLabel}</span>
          </div>
          <span className={`spt-chip spt-chip--${summary?.direction || 'flat'}`}>
            {summary?.direction === 'up' && <>↗ +{summary.delta} SP this week</>}
            {summary?.direction === 'down' && <>↘ −{Math.abs(summary.delta || 0)} SP this week</>}
            {summary?.direction === 'flat' && <>→ Flat</>}
          </span>
        </div>
      </div>

      {/* Phase heatmap */}
      <div className="spt-heatmap">
        <div className="spt-heatmap__head">
          <span className="spt-heatmap__eyebrow">Where I'm weak today</span>
          {strongestCell && (
            <span className="spt-heatmap__best">
              ★ {strongestCell.sp} SP · {CATEGORY_LABELS[strongestCell.category] || strongestCell.category} · {strongestCell.weekdayShort}
            </span>
          )}
        </div>
        <div className="spt-heatmap__grid">
          <div className="spt-heatmap__row spt-heatmap__row--header">
            <div className="spt-heatmap__cell spt-heatmap__cell--corner" />
            {WEEKDAY_LABELS.map((d, i) => (
              <div
                key={d}
                className={`spt-heatmap__cell spt-heatmap__cell--label${i === todayIndex ? ' is-today' : ''}`}
              >{d}</div>
            ))}
          </div>
          {heatmap.map(row => {
            const rowMax = Math.max(8, ...row.days.map(d => d.sp));
            const weakSet = new Set((weakestCellsByCategory[row.category] || []).map(d => d.dayIdx));
            const isStrongestRow = strongestCell && strongestCell.category === row.category;
            return (
              <div key={row.category} className="spt-heatmap__row">
                <div className={`spt-heatmap__cell spt-heatmap__cell--label${isStrongestRow ? ' is-best' : ''}`}>
                  {CATEGORY_LABELS[row.category] || row.category}
                </div>
                {row.days.map((d, i) => {
                  const bucket = intensityBucket(d.sp, rowMax);
                  const isWeak = weakSet.has(i);
                  const isBest = strongestCell && strongestCell.category === row.category && strongestCell.dayIdx === i;
                  const isToday = i === todayIndex;
                  return (
                    <button
                      type="button"
                      key={d.dayIdx}
                      className={[
                        'spt-heatmap__cell',
                        'spt-heatmap__cell--data',
                        `spt-heatmap__cell--b${bucket}`,
                        isWeak ? 'is-weak' : '',
                        isBest ? 'is-best' : '',
                        isToday ? 'is-today' : ''
                      ].join(' ').trim()}
                      style={bucket > 0 ? { '--spt-cell-color': CATEGORY_COLOR[row.category] } : undefined}
                      onClick={isWeak ? () => onOpenRecoveryCoach && onOpenRecoveryCoach({ category: row.category, weekday: d.weekday, weekdayShort: d.weekdayShort }) : undefined}
                      disabled={!isWeak}
                      title={`${row.category} · ${d.weekdayShort} · ${d.sp} SP${isWeak ? ' · click for plan' : ''}`}
                      aria-label={`${row.category} on ${d.weekday}: ${d.sp} SP${isWeak ? ', weakest cell, click to plan' : ''}`}
                    >
                      {d.sp > 0 && <span className="spt-heatmap__cell-sp">{d.sp}</span>}
                      {isBest && <span className="spt-heatmap__cell-best">★</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="spt-heatmap__legend">
          <span className="spt-heatmap__legend-item">
            <i className="spt-heatmap__legend-dot" style={{ background: 'var(--spt-axis)', opacity: 0.4 }} />
            empty
          </span>
          <span className="spt-heatmap__legend-item">
            <i className="spt-heatmap__legend-dot" style={{ background: 'rgba(99, 102, 241, 0.30)' }} />
            below median
          </span>
          <span className="spt-heatmap__legend-item">
            <i className="spt-heatmap__legend-dot" style={{ background: 'rgba(99, 102, 241, 0.65)' }} />
            active
          </span>
          <span className="spt-heatmap__legend-item">
            <i className="spt-heatmap__legend-dot" style={{ background: 'rgba(16, 185, 129, 0.85)' }} />
            strong
          </span>
          <span className="spt-heatmap__legend-spacer" />
          <span className="spt-heatmap__legend-item spt-heatmap__legend-item--cta">
            click any dim cell → recovery plan
          </span>
        </div>
      </div>

      <div className="spt-cta">
        <button type="button" className="spt-cta__btn" onClick={() => onOpenRecoveryCoach && onOpenRecoveryCoach()}>
          Open AI Recovery Plan
          <span className="spt-cta__arrow" aria-hidden="true">↗</span>
        </button>
      </div>
    </div>
  );
}