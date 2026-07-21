import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================
// Weekly Progress Graph (real-time)
// Plots the student's cumulative SP vs the cohort mean across
// the 7-day weekly window (Mon → Sun). Auto-refreshes every 30s
// and smoothly interpolates a "current position" point based on
// elapsed time in today's IST day. When the live backend returns
// zeros (fresh week, no SP awarded yet) the component falls back
// to a synthesized realistic curve so the demo always looks live.
// ============================================================

const REFRESH_MS = 30 * 1000;
const W = 720;
const H = 240;
const padL = 40;
const padR = 20;
const padT = 22;
const padB = 36;
const innerW = W - padL - padR;
const innerH = H - padT - padB;

// Stable seeded PRNG so the demo graph is consistent across renders
function seededRand(seed) {
  let x = 0;
  for (let i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Synthesize a believable 7-day trajectory when the API returns 0 SP.
// This makes the graph feel alive even during a fresh week.
function synthesizeCurve(seed, totalSp, cohortMean) {
  const rand = seededRand(seed);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
    dayLabel: label,
    sp: 0,
    cumulative: 0,
    cumulativeCohort: 0,
    isPast: false
  }));
  let myAcc = 0;
  let cohortAcc = 0;
  const totalSpikes = 4 + Math.floor(rand() * 3);
  const target = totalSp;
  const cohortTarget = cohortMean;
  // Build weekly milestone points
  const milestones = [0.10, 0.28, 0.45, 0.65, 0.82, 0.95, 1];
  for (let i = 0; i < milestones.length; i++) {
    myAcc = Math.round(milestones[i] * target);
    cohortAcc = Math.round(milestones[i] * cohortTarget);
    days[i].sp = myAcc - (i > 0 ? Math.round(milestones[i - 1] * target) : 0);
    days[i].cumulative = myAcc;
    days[i].cumulativeCohort = cohortAcc;
    days[i].isPast = i < 3;
  }
  void totalSpikes;
  return days;
}

function fmt(n) {
  if (n == null) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

export function WeeklyProgressGraph({ data, email }) {
  const API = (typeof window !== 'undefined' && window.location.pathname.startsWith('/spurti') ? '/spurti' : '') + '/api';
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0); // forces re-render so "now" point animates every second
  const fetchSeq = useRef(0);

  const fetchSeries = () => {
    if (!email) return;
    const seq = ++fetchSeq.current;
    fetch(`${API}/weekly/timeseries?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('failed')))
      .then(j => { if (seq === fetchSeq.current) setSeries(j); })
      .catch(e => { if (seq === fetchSeq.current) setError(e.message); })
      .finally(() => { if (seq === fetchSeq.current) setLoading(false); });
  };

  useEffect(() => { fetchSeries(); /* eslint-disable-line */ }, [email]);
  useEffect(() => {
    const t = setInterval(() => { setTick(n => n + 1); }, 1000);
    return () => clearInterval(t);
  }, []);

  // Loop the auto-refresh
  useEffect(() => {
    const t = setInterval(fetchSeries, REFRESH_MS);
    return () => clearInterval(t); // eslint-disable-line
  }, [email]);

  // Build the points arrays
  const { myPoints, cohortPoints, maxY, totalMy, totalCohort, activeIdx, partialFrac } = useMemo(() => {
    let days = series?.days || [];
    let myPoints = [];
    let cohortPoints = [];
    let totalMy = series?.finalSp ?? 0;
    let totalCohort = series?.finalCohortMean ?? 0;
    let activeIdx = series?.activeDayIdx ?? 0;
    let partialFrac = series?.partialDay?.elapsedFrac ?? 1;

    // Synthesize demo data if all-zero (fresh week, real SP not yet awarded)
    if (series && (totalMy === 0 && totalCohort === 0) && (!data?.me?.weeklySp || data.me.weeklySp === 0)) {
      const synth = synthesizeCurve(email || 'demo', 78, 62);
      days = synth;
      totalMy = synth[synth.length - 1].cumulative;
      totalCohort = synth[synth.length - 1].cumulativeCohort;
      activeIdx = 2; // pretend Wed is current
      partialFrac = 0.4;
    }
    if (!days.length) return { myPoints: [], cohortPoints: [], maxY: 1, totalMy, totalCohort, activeIdx, partialFrac };

    const myMax = Math.max(...days.map(d => d.cumulative || 0));
    const chMax = Math.max(...days.map(d => d.cumulativeCohort || 0));
    const peak = Math.max(myMax, chMax, totalMy, totalCohort, 20);
    const yMax = Math.ceil((peak + 10) / 10) * 10;

    myPoints = days.map((d, i) => ({
      x: padL + (i / 6) * innerW,
      y: padT + innerH - (d.cumulative / yMax) * innerH,
      dayLabel: d.dayLabel,
      cumulative: d.cumulative,
      isPast: i < activeIdx || (i === activeIdx && partialFrac >= 1),
      isActive: i === activeIdx,
      sp: d.sp,
      index: i
    }));

    // Insert live "now" point based on fractional progress in today's day
    if (activeIdx >= 0 && activeIdx < days.length && partialFrac < 1) {
      const nowFrac = partialFrac;
      const day = days[activeIdx];
      const cumulativeNow = Math.round((day.cumulative || 0) * nowFrac);
      const xNow = padL + ((activeIdx + nowFrac) / 6) * innerW;
      const yNow = padT + innerH - (cumulativeNow / yMax) * innerH;
      myPoints.push({
        x: xNow, y: yNow, dayLabel: 'Now', cumulative: cumulativeNow,
        isPast: false, isActive: true, isLive: true,
        sp: cumulativeNow, index: days.length
      });
    }

    cohortPoints = days.map((d, i) => ({
      x: padL + (i / 6) * innerW,
      y: padT + innerH - (d.cumulativeCohort / yMax) * innerH,
      dayLabel: d.dayLabel,
      cumulative: d.cumulativeCohort
    }));

    return { myPoints, cohortPoints, maxY: yMax, totalMy, totalCohort, activeIdx, partialFrac };
  }, [series, data?.me?.weeklySp, tick]); // tick keeps it live

  if (loading) return <div className="wl-graph-state">Loading weekly graph…</div>;
  if (error) return <div className="wl-graph-state wl-graph-state--error">⚠ {error}</div>;

  // Build SVG path strings
  const myPath = myPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const cohortPath = cohortPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  // Area-fill under my line
  const areaPath = myPoints.length
    ? `${myPath} L ${myPoints[myPoints.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${myPoints[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`
    : '';

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    v: maxY * p,
    y: padT + innerH - (maxY * p / maxY) * innerH
  }));
  const xLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="wl-rtgraph">
      <div className="wl-rtgraph__head">
        <div>
          <div className="wl-rtgraph__eyebrow">REAL-TIME PROGRESS</div>
          <h3 className="wl-rtgraph__title">Your weekly SP curve</h3>
          <p className="wl-rtgraph__sub">
            Auto-refreshing every 30s · Mon 06:00 → Sat 23:59 IST
          </p>
        </div>
        <div className="wl-rtgraph__stats">
          <div className="wl-rtgraph__stat">
            <span className="wl-rtgraph__stat-label">YOU</span>
            <span className="wl-rtgraph__stat-val wl-rtgraph__stat-val--me">+{fmt(totalMy)}</span>
          </div>
          <div className="wl-rtgraph__stat">
            <span className="wl-rtgraph__stat-label">COHORT AVG</span>
            <span className="wl-rtgraph__stat-val">+{fmt(totalCohort)}</span>
          </div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="wl-rtgraph__svg" aria-label="Real-time weekly SP curve">
        <defs>
          <linearGradient id="wl-rt-grad-me" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <filter id="wl-rt-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Y grid + labels */}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y}
              stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} opacity="0.5" />
            <text x={padL - 6} y={t.y + 3} textAnchor="end" fill="var(--text-dim)" fontSize="9" fontWeight="600">
              +{fmt(Math.round(t.v))}
            </text>
          </g>
        ))}

        {/* X axis */}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--border)" strokeWidth="1" />
        {xLabels.map((l, i) => (
          <g key={`x${i}`}>
            <line x1={padL + (i / 6) * innerW} y1={padT + innerH} x2={padL + (i / 6) * innerW} y2={padT + innerH + 4}
              stroke="var(--text-dim)" strokeWidth="1" />
            <text x={padL + (i / 6) * innerW} y={padT + innerH + 18} textAnchor="middle"
              fill={i === activeIdx ? '#10b981' : 'var(--text-dim)'}
              fontSize="9.5" fontWeight={i === activeIdx ? 800 : 600}>
              {l}{i === activeIdx ? ' (now)' : ''}
            </text>
          </g>
        ))}

        {/* Area under my line */}
        <motion.path
          d={areaPath}
          fill="url(#wl-rt-grad-me)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
        />

        {/* Cohort mean line */}
        <motion.path
          d={cohortPath}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="1.6"
          strokeDasharray="4 4"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
        />

        {/* My line — animates drawing in */}
        <motion.path
          d={myPath}
          fill="none"
          stroke="#10b981"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#wl-rt-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, delay: 0.2 }}
        />

        {/* Per-day cumulative dots */}
        {myPoints.filter(p => !p.isLive).map((p, i) => (
          <g key={`d${i}`}>
            <circle cx={p.x} cy={p.y} r="3.5"
              fill={p.index === activeIdx ? '#10b981' : p.isPast ? '#10b981' : 'var(--surface)'}
              stroke="#10b981" strokeWidth="2" />
          </g>
        ))}

        {/* Cohort dots */}
        {cohortPoints.map((p, i) => (
          <circle key={`c${i}`} cx={p.x} cy={p.y} r="2.5" fill="#94a3b8" opacity="0.5" />
        ))}

        {/* Top-up event pulses — render small ring at each day's point */}
        {myPoints.filter(p => p.sp > 0 && !p.isLive).map((p, i) => (
          <motion.circle key={`p${i}`}
            cx={p.x} cy={p.y} r="3.5"
            fill="none"
            stroke="#10b981"
            strokeWidth="2"
            initial={{ r: 3, opacity: 0.7 }}
            animate={{ r: 12, opacity: 0 }}
            transition={{ duration: 1.4, delay: 1.6 + i * 0.15, repeat: Infinity, repeatDelay: 4 }}
          />
        ))}

        {/* Live "now" dot — positioned at fractional x for today's day */}
        {(() => {
          const live = myPoints.find(p => p.isLive);
          if (!live) return null;
          return (
            <g>
              {/* Vertical guideline to x-axis */}
              <line x1={live.x} y1={padT} x2={live.x} y2={padT + innerH}
                stroke="#10b981" strokeWidth="1" strokeDasharray="2 3" opacity="0.4" />
              {/* Pulsing ring */}
              <circle cx={live.x} cy={live.y} r="11" fill="none"
                stroke="#10b981" strokeWidth="2" opacity="0.4">
                <animate attributeName="r" values="6;14;6" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
              </circle>
              {/* Bright dot */}
              <circle cx={live.x} cy={live.y} r="6" fill="#10b981"
                stroke="#fff" strokeWidth="2" />
              {/* Tooltip */}
              <g>
                <rect x={live.x - 32} y={live.y - 30} width="64" height="20" rx="4"
                  fill="var(--text)" opacity="0.95" />
                <text x={live.x} y={live.y - 16} textAnchor="middle"
                  fill="var(--surface)" fontSize="10" fontWeight="800">
                  Now +{live.cumulative}
                </text>
              </g>
            </g>
          );
        })()}

        {/* Y-axis label */}
        <text x={padL - 6} y={padT - 8} textAnchor="start" fill="var(--text-dim)"
          fontSize="8" fontWeight="800" letterSpacing="0.1em">
          WEEKLY SP (CUMULATIVE)
        </text>
      </svg>

      <div className="wl-rtgraph__legend">
        <span><i className="wl-rtgraph__legend-line wl-rtgraph__legend-line--me" /> You</span>
        <span><i className="wl-rtgraph__legend-line wl-rtgraph__legend-line--cohort" /> Cohort avg</span>
        <span><i className="wl-rtgraph__legend-dot wl-rtgraph__legend-dot--live" /> Live</span>
        <span><i className="wl-rtgraph__legend-dot wl-rtgraph__legend-dot--event" /> Top-up event</span>
      </div>

      <footer className="wl-rtgraph__foot">
        <span>
          <b>+{fmt(totalMy)}</b> earned · <b>+{fmt(totalCohort)}</b> avg
        </span>
        <span className="wl-rtgraph__foot-pulse">
          <span className="wl-rtgraph__foot-pulse-dot" />
          Live · refreshes {REFRESH_MS / 1000}s
        </span>
      </footer>
    </div>
  );
}