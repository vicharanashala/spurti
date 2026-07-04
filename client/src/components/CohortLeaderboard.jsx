import React, { useState, useEffect, useCallback } from 'react';
import LeaderboardTable from './LeaderboardTable.jsx';

const API_BASE = '/api/leaderboard';

export default function CohortLeaderboard({ currentStudentId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');

  const fetchCohort = useCallback((targetPage, currentSearch) => {
    setLoading(true);
    setError(null);

    let url = `${API_BASE}/cohort?page=${targetPage}&limit=50`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch cohort leaderboard');
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          if (targetPage === 1) {
            setEntries(json.data || []);
          } else {
            setEntries((prev) => [...prev, ...(json.data || [])]);
          }
          setHasMore(json.pagination?.page < json.pagination?.pages);
        } else {
          setError(json.error || 'Failed to load cohort leaderboard');
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
    fetchCohort(1, search);
  }, [search, fetchCohort]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchCohort(nextPage, search);
  };

  const columns = [
    { key: 'rank', label: 'Rank' },
    { key: 'name', label: 'Student Name' },
    { key: 'rawSP', label: 'Raw SP' },
    { key: 'daysActive', label: 'Days Active' },
    {
      key: 'normalizedScore',
      label: 'Normalized Score',
      render: (row) => <strong>{row.normalizedScore}</strong>,
      headerTooltip: 'Normalized score formula: SP divided by days active (minimum 1 day).'
    },
    { key: 'rankDelta', label: 'Change' }
  ];

  return (
    <div>
      {/* Banner / Note */}
      <div className="card" style={{ marginBottom: 16, background: '#f8fafc' }}>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--primary)' }}>
          Rankings adjusted for join date — newer students are not penalized
        </span>
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
