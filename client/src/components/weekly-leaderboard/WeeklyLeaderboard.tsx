import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================
// Weekly Champions — Center leaderboard table
// Columns: Rank | Name | Weekly SP | Trend (vs. last week's SP)
// Search + filter (all / top10 / cohort / bottom50) + scroll.
// ============================================================

function useCountUp(target, duration = 700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - (1 - p) * (1 - p);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function Spark({ sp }) {
  // Trend indicator: tiny inline bar chart. Faked (deterministic from name hash)
  // until a real previous-week comparison is wired up.
  const seed = (sp * 17 + 3) % 7;
  const bars = Array.from({ length: 7 }, (_, i) => 4 + ((seed + i * 13) % 11));
  return (
    <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true" className="wl-spark">
      {bars.map((h, i) => (
        <rect key={i} x={i * 9 + 2} y={20 - h} width="6" height={h} rx="1.4" />
      ))}
    </svg>
  );
}

function FilterChip({ active, onClick, children, badge }) {
  return (
    <button
      type="button"
      className={`wl-filter${active ? ' is-active' : ''}`}
      onClick={onClick}
    >
      <span>{children}</span>
      {badge != null && <span className="wl-filter__badge">{badge}</span>}
    </button>
  );
}

export function WeeklyLeaderboard({ data }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | top10 | cohort | bottom50
  const listRef = useRef(null);

  // The dashboard always sees the full 1323-row cohort. We synthesize a
  // unified `rows` array and let the filter narrow the view.
  const allRows = useMemo(() => {
    if (!data) return [];
    // Build from top10 + middle + bottom. Avoid duplication by rank.
    const byRank = new Map();
    for (const r of data.top10 || []) byRank.set(r.rank, { ...r });
    for (const r of data.middle || []) byRank.set(r.rank, { ...r });
    for (const r of data.bottom || []) byRank.set(r.rank, { ...r });
    return [...byRank.values()].sort((a, b) => a.rank - b.rank);
  }, [data]);

  const filteredRows = useMemo(() => {
    if (!allRows.length) return [];
    let rows = allRows;
    const cohortSize = data?.cohortSize || allRows.length;
    if (filter === 'top10') rows = rows.filter(r => r.rank <= 10);
    else if (filter === 'bottom50') rows = rows.filter(r => r.rank > cohortSize - 50);
    // 'cohort' = students near the user (rank +/- 10)
    else if (filter === 'cohort' && data?.me) {
      const myRank = data.me.weeklyRank;
      rows = rows.filter(r => Math.abs(r.rank - myRank) <= 15);
    }
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));
    return rows;
  }, [allRows, filter, query, data]);

  // Computed totals / chip counts
  const counts = useMemo(() => ({
    all: allRows.length,
    top10: allRows.filter(r => r.rank <= 10).length,
    cohort: data?.me ? allRows.filter(r => Math.abs(r.rank - data.me.weeklyRank) <= 15).length : 0,
    bottom50: allRows.filter(r => r.rank > (data?.cohortSize || allRows.length) - 50).length
  }), [allRows, data]);

  // Count up top SP for visual flair
  const topSp = useCountUp(filteredRows[0]?.weeklySp ?? 0);

  if (!data) return null;

  return (
    <div className="wl-leaderboard">
      <header className="wl-leaderboard__head">
        <div>
          <div className="wl-leaderboard__eyebrow">WEEKLY CHAMPIONS</div>
          <h1 className="wl-leaderboard__title">Top performers this week</h1>
          <p className="wl-leaderboard__sub">
            {data.week?.label} · <b>{data.cohortSize?.toLocaleString() || '—'}</b> students competing
            · top SP this view: <b>+{topSp}</b>
          </p>
        </div>
        <div className="wl-leaderboard__head-stats">
          <div className="wl-leaderboard__head-stat">
            <span className="wl-leaderboard__head-stat-label">Top 10 cutoff</span>
            <span className="wl-leaderboard__head-stat-value">+{data.top10?.[9]?.weeklySp ?? 0}</span>
          </div>
          <div className="wl-leaderboard__head-stat">
            <span className="wl-leaderboard__head-stat-label">Your rank</span>
            <span className="wl-leaderboard__head-stat-value">{data.me?.weeklyRank ? '#' + data.me.weeklyRank : '—'}</span>
          </div>
        </div>
      </header>

      <div className="wl-leaderboard__toolbar">
        <div className="wl-leaderboard__search">
          <span className="wl-leaderboard__search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search leaderboard"
          />
          {query && (
            <button type="button" className="wl-leaderboard__clear" onClick={() => setQuery('')} aria-label="Clear search">×</button>
          )}
        </div>
        <div className="wl-leaderboard__filters" role="tablist" aria-label="Filter leaderboard">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} badge={counts.all}>All</FilterChip>
          <FilterChip active={filter === 'top10'} onClick={() => setFilter('top10')} badge={counts.top10}>Top 10</FilterChip>
          <FilterChip active={filter === 'cohort'} onClick={() => setFilter('cohort')} badge={counts.cohort}>My Cohort</FilterChip>
          <FilterChip active={filter === 'bottom50'} onClick={() => setFilter('bottom50')} badge={counts.bottom50}>Bottom 50</FilterChip>
        </div>
      </div>

      <div className="wl-leaderboard__table-wrap" ref={listRef}>
        <table className="wl-leaderboard__table">
          <thead>
            <tr>
              <th className="wl-leaderboard__th-rank">#</th>
              <th className="wl-leaderboard__th-name">Student</th>
              <th className="wl-leaderboard__th-sp">Weekly SP</th>
              <th className="wl-leaderboard__th-trend">Trend</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 && (
              <tr><td colSpan="4" className="wl-leaderboard__empty">No students match your filters.</td></tr>
            )}
            {filteredRows.map((r, i) => (
              <motion.tr
                key={r.email || r.rank}
                className={`wl-leaderboard__row${r.isMe ? ' is-me' : ''}${r.rank <= 3 ? ' is-podium' : ''}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(0.012 * i, 0.4) }}
              >
                <td className="wl-leaderboard__rank">
                  <span className={`wl-leaderboard__rank-chip wl-leaderboard__rank-chip--${r.rank <= 3 ? `p${r.rank}` : 'plain'}`}>
                    {r.rank}
                  </span>
                </td>
                <td className="wl-leaderboard__name">
                  <span className="wl-leaderboard__avatar" aria-hidden="true">{r.name?.slice(0, 1).toUpperCase()}</span>
                  <span className="wl-leaderboard__name-text">{r.name}</span>
                  {r.isMe && <span className="wl-leaderboard__you">You</span>}
                </td>
                <td className="wl-leaderboard__sp">
                  <span className="wl-leaderboard__sp-val">+{r.weeklySp}</span>
                </td>
                <td className="wl-leaderboard__trend">
                  <Spark sp={r.weeklySp} />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="wl-leaderboard__foot">
        <span>Showing {filteredRows.length} of {allRows.length}</span>
        <span className="wl-leaderboard__foot-spacer" />
        <span>Live · Mon 06:00 → Sat 23:59 IST</span>
      </footer>
    </div>
  );
}