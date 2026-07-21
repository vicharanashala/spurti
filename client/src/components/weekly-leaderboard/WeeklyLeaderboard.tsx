import React, { useMemo, useRef, useState } from 'react';

// ============================================================
// Weekly Performance Curve (graph view)
// Replaces the old scrollable rank table. Plots each student's
// Weekly SP as a dot, with the cohort distribution underneath.
// Renders a "Top 10 cutoff" line, the user's marker, and lets
// the user search by name to highlight a specific student.
// ============================================================

function fmtNum(n) {
  if (n == null || Number.isNaN(n)) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function RankGraph({ rows, cohortSize, myRank, top10Boundary, topRef }) {
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState(null);
  const W = 720, H = 240;
  const padL = 36, padR = 18, padT = 18, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // X-axis = rank (1 → cohortSize). Y-axis = weeklySp.
  const maxRank = Math.max(cohortSize || 0, rows?.length || 0, 1);
  const maxSp = Math.max(
    top10Boundary ?? 0,
    ...rows.map(r => Number(r.weeklySp) || 0),
    1
  );

  const xFor = (rank) => padL + ((rank - 1) / Math.max(maxRank - 1, 1)) * innerW;
  const yFor = (sp) => padT + innerH - (sp / maxSp) * innerH;

  // Build histogram buckets of weeklySp across the cohort.
  const buckets = useMemo(() => {
    const N = 18;
    const counts = new Array(N).fill(0);
    if (!rows?.length) return counts;
    for (const r of rows) {
      const sp = Number(r.weeklySp) || 0;
      const idx = Math.min(N - 1, Math.max(0, Math.round((sp / maxSp) * (N - 1))));
      counts[idx] += 1;
    }
    return counts;
  }, [rows, maxSp]);
  const bucketMax = Math.max(1, ...buckets);
  const barW = innerW / buckets.length;

  // Match search against any student
  const matched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return rows.find(r => (r.name || '').toLowerCase().includes(q)) || null;
  }, [rows, query]);

  // Y-axis ticks (0, 25, 50, 75, 100% of maxSp)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => ({
    v: maxSp * p,
    y: yFor(maxSp * p)
  }));

  // X-axis ticks: top-10 boundary, midpoint, cohort, my rank
  const xTicks = [
    { rank: 1, label: '#1' },
    { rank: 10, label: '#10 (Top 10)' },
    { rank: Math.round(maxRank / 2), label: `#${Math.round(maxRank / 2)}` },
    { rank: maxRank, label: `#${maxRank}` }
  ];
  if (myRank && myRank > 10 && myRank < maxRank) {
    xTicks.push({ rank: myRank, label: `#${myRank} (You)` });
  }

  const top10X = xFor(10);

  return (
    <div className="wl-graph" ref={topRef}>
      <div className="wl-graph__toolbar">
        <div className="wl-graph__search">
          <span className="wl-graph__search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Find a student on the curve…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Find a student"
          />
          {query && (
            <button type="button" className="wl-graph__clear" onClick={() => setQuery('')} aria-label="Clear">×</button>
          )}
          {matched && (
            <span className="wl-graph__match-pill">
              <b>{matched.name}</b> · #{matched.rank} · +{matched.weeklySp} SP
            </span>
          )}
        </div>
        <div className="wl-graph__legend">
          <span><i className="wl-graph__legend-dot wl-graph__legend-dot--hist" /> Cohort</span>
          <span><i className="wl-graph__legend-dot wl-graph__legend-dot--top10" /> Top 10 cutoff</span>
          {myRank && <span><i className="wl-graph__legend-dot wl-graph__legend-dot--me" /> You</span>}
          {matched && <span><i className="wl-graph__legend-dot wl-graph__legend-dot--match" /> Match</span>}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="wl-graph__svg" role="img" aria-label="Weekly performance curve">
        <defs>
          <linearGradient id="wl-graph-grad-hist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="wl-graph-grad-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-grid + labels */}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={padL} y1={t.y} x2={W - padR} y2={t.y}
              stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? '0' : '3 4'} opacity="0.5" />
            <text x={padL - 8} y={t.y + 3} textAnchor="end" fill="var(--text-dim)" fontSize="9" fontWeight="600">
              {fmtNum(Math.round(t.v))}
            </text>
          </g>
        ))}

        {/* X-axis line + labels */}
        <line x1={padL} y1={padT + innerH} x2={W - padR} y2={padT + innerH} stroke="var(--border)" strokeWidth="1" />
        {xTicks.map((t, i) => (
          <g key={`x${i}`}>
            <line x1={xFor(t.rank)} y1={padT + innerH} x2={xFor(t.rank)} y2={padT + innerH + 4}
              stroke="var(--text-dim)" strokeWidth="1" />
            <text x={xFor(t.rank)} y={padT + innerH + 16} textAnchor="middle"
              fill={t.rank === myRank ? 'var(--accent)' : 'var(--text-dim)'}
              fontSize="9" fontWeight={t.rank === myRank ? 800 : 600}>
              {t.label}
            </text>
          </g>
        ))}

        {/* Cohort histogram bars */}
        {buckets.map((c, i) => {
          const h = (c / bucketMax) * (innerH * 0.7);
          const x = padL + i * barW + 2;
          const y = padT + innerH - h;
          const w = Math.max(1, barW - 4);
          return (
            <rect key={`b${i}`} x={x} y={y} width={w} height={h}
              rx="2" fill="url(#wl-graph-grad-hist)" />
          );
        })}

        {/* Top 10 cutoff vertical line */}
        <line x1={top10X} y1={padT} x2={top10X} y2={padT + innerH}
          stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4 4" />
        <rect x={top10X - 32} y={padT - 2} width="64" height="14" rx="7"
          fill="#f59e0b" />
        <text x={top10X} y={padT + 8} textAnchor="middle" fontSize="9" fontWeight="800"
          fill="#1f1500">TOP 10</text>

        {/* All-student dots — sample 200 max for perf */}
        <g>
          {rows.slice(0, 400).map((r) => {
            const x = xFor(r.rank);
            const y = yFor(Number(r.weeklySp) || 0);
            const isMe = r.isMe;
            const isMatch = matched && matched.rank === r.rank;
            return (
              <circle
                key={r.email || r.rank}
                cx={x} cy={y}
                r={isMe || isMatch ? 5 : 2.4}
                fill={isMe ? 'var(--accent)' : isMatch ? '#fbbf24' : '#10b981'}
                opacity={isMe || isMatch ? 1 : 0.55}
                stroke={isMe || isMatch ? '#fff' : 'none'}
                strokeWidth={isMe || isMatch ? 2 : 0}
                onMouseEnter={() => setHover(r)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </g>

        {/* Me marker */}
        {myRank && (() => {
          const meRow = rows.find(r => r.isMe);
          if (!meRow) return null;
          const x = xFor(meRow.rank);
          const y = yFor(Number(meRow.weeklySp) || 0);
          return (
            <g>
              <line x1={x} y1={padT} x2={x} y2={padT + innerH}
                stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.7" />
              <circle cx={x} cy={y} r="6" fill="var(--accent)" stroke="#fff" strokeWidth="2.5" />
              <circle cx={x} cy={y} r="11" fill="var(--accent)" opacity="0.25">
                <animate attributeName="r" from="11" to="18" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" from="0.35" to="0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>
          );
        })()}

        {/* Match marker */}
        {matched && (() => {
          const x = xFor(matched.rank);
          const y = yFor(Number(matched.weeklySp) || 0);
          return (
            <g>
              <circle cx={x} cy={y} r="6" fill="#fbbf24" stroke="#1f1500" strokeWidth="2" />
            </g>
          );
        })()}

        {/* Hover tooltip */}
        {hover && (
          <g>
            <rect
              x={Math.min(W - 160, Math.max(padL, xFor(hover.rank) - 80))}
              y={Math.max(padT, yFor(Number(hover.weeklySp) || 0) - 36)}
              width="160" height="32" rx="6"
              fill="var(--text)" opacity="0.96"
            />
            <text
              x={Math.min(W - 160, Math.max(padL, xFor(hover.rank) - 80)) + 10}
              y={Math.max(padT, yFor(Number(hover.weeklySp) || 0) - 36) + 12}
              fill="#0b1020" fontSize="10" fontWeight="800"
            >
              {hover.name?.slice(0, 24)}
            </text>
            <text
              x={Math.min(W - 160, Math.max(padL, xFor(hover.rank) - 80)) + 10}
              y={Math.max(padT, yFor(Number(hover.weeklySp) || 0) - 36) + 24}
              fill="#475569" fontSize="9" fontWeight="600"
            >
              #{hover.rank} · +{hover.weeklySp} SP
            </text>
          </g>
        )}

        {/* Y-axis label */}
        <text x={padL - 8} y={padT - 6} textAnchor="start" fill="var(--text-dim)"
          fontSize="8" fontWeight="800" letterSpacing="0.1em">
          WEEKLY SP
        </text>
        <text x={W - padR} y={padT + innerH + 26} textAnchor="end" fill="var(--text-dim)"
          fontSize="8" fontWeight="800" letterSpacing="0.1em">
          COHORT RANK
        </text>
      </svg>

      <footer className="wl-graph__foot">
        <span><b>{rows.length.toLocaleString()}</b> students plotted · <b>{top10Boundary || 0}</b> SP needed for Top 10</span>
        {myRank && <span>You're at <b>#{myRank}</b></span>}
      </footer>
    </div>
  );
}

export function WeeklyLeaderboard({ data }) {
  const listRef = useRef(null);

  const allRows = useMemo(() => {
    if (!data) return [];
    const byRank = new Map();
    for (const r of data.top10 || []) byRank.set(r.rank, { ...r });
    for (const r of data.middle || []) byRank.set(r.rank, { ...r });
    for (const r of data.bottom || []) byRank.set(r.rank, { ...r });
    return [...byRank.values()].sort((a, b) => a.rank - b.rank);
  }, [data]);

  if (!data) return null;
  const cohortSize = data.cohortSize || allRows.length || 1;
  const myRank = data.me?.weeklyRank;
  const top10Boundary = data.top10?.[9]?.weeklySp ?? 0;

  return (
    <div className="wl-leaderboard">
      <header className="wl-leaderboard__head">
        <div>
          <div className="wl-leaderboard__eyebrow">WEEKLY CHAMPIONS</div>
          <h1 className="wl-leaderboard__title">Weekly performance curve</h1>
          <p className="wl-leaderboard__sub">
            {data.week?.label} · <b>{typeof cohortSize === 'number' ? cohortSize.toLocaleString() : cohortSize}</b> students competing
          </p>
        </div>
      </header>

      <RankGraph rows={allRows} cohortSize={cohortSize} myRank={myRank} top10Boundary={top10Boundary} topRef={listRef} />
    </div>
  );
}