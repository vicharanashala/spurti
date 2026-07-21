import React, { useState, useEffect, useCallback } from 'react';
import LeaderboardTable from './LeaderboardTable.jsx';

const API_BASE = '/api/leaderboard';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const options = { day: '2-digit', month: 'short' };
  return d.toLocaleDateString('en-US', options);
}

export default function WeeklyLeaderboard({ currentStudentId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [targetWeek, setTargetWeek] = useState(null);
  const [metadata, setMetadata] = useState(null);

  const fetchWeekly = useCallback((targetPage, currentSearch, weekDate) => {
    setLoading(true);
    setError(null);

    let url = `${API_BASE}/weekly?page=${targetPage}&limit=50`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
    if (weekDate) url += `&week=${encodeURIComponent(weekDate)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch weekly leaderboard');
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          if (targetPage === 1) {
            setEntries(json.data || []);
          } else {
            setEntries((prev) => [...prev, ...(json.data || [])]);
          }
          setMetadata(json.metadata || null);
          setHasMore(json.pagination?.page < json.pagination?.pages);
        } else {
          setError(json.error || 'Failed to load weekly leaderboard');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    setPage(1);
    fetchWeekly(1, search, targetWeek);
  }, [search, targetWeek, fetchWeekly]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchWeekly(nextPage, search, targetWeek);
  };

  const handlePrevWeek = () => {
    const currentStart = metadata?.weekStart ? new Date(metadata.weekStart) : new Date();
    const prevWeek = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    setTargetWeek(prevWeek.toISOString());
  };

  const handleNextWeek = () => {
    if (metadata?.isCurrentWeek) return;
    const currentStart = metadata?.weekStart ? new Date(metadata.weekStart) : new Date();
    const nextWeek = new Date(currentStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    setTargetWeek(nextWeek.toISOString());
  };

  const columns = [
    { key: 'rank', label: 'Rank' },
    { key: 'name', label: 'Student Name' },
    { key: 'weekSP', label: 'SP This Week', render: (row) => <strong>{row.weekSP}</strong> },
    { key: 'rankDelta', label: 'Change' }
  ];

  const weekStartText = formatDate(metadata?.weekStart);
  const weekEndText = formatDate(metadata?.weekEnd);

  return (
    <div>
      {/* Banner */}
      <div className="card neutral" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Resets every Monday at midnight</span>
          {metadata?.isCurrentWeek && (
            <span style={{ background: 'var(--primary)', color: '#fff', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 'bold' }}>
              ACTIVE WEEK
            </span>
          )}
        </div>
      </div>

      {/* Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>
          {metadata ? `Week of Mon ${weekStartText} — Sun ${weekEndText}` : 'Weekly Leaderboard'}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handlePrevWeek}
            disabled={loading}
            style={{ padding: '6px 12px', border: '1px solid var(--line)', background: '#fff', borderRadius: 6, fontSize: 13 }}
          >
            &lt; Previous Week
          </button>
          <button
            type="button"
            onClick={handleNextWeek}
            disabled={loading || metadata?.isCurrentWeek}
            style={{ padding: '6px 12px', border: '1px solid var(--line)', background: '#fff', borderRadius: 6, fontSize: 13, opacity: (loading || metadata?.isCurrentWeek) ? 0.5 : 1 }}
          >
            Next Week &gt;
          </button>
        </div>
      </div>

      {error && (
        <div className="card negative" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Table */}
      <LeaderboardTable
        entries={entries}
        columns={columns}
        currentStudentId={currentStudentId}
        loading={loading}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        onSearch={setSearch}
        searchValue={search}
      />
    </div>
  );
}
