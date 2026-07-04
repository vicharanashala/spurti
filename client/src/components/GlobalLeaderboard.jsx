import React, { useState, useEffect, useCallback } from 'react';
import LeaderboardTable from './LeaderboardTable.jsx';

const API_BASE = '/api/leaderboard';

export default function GlobalLeaderboard({ currentStudentId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');

  const fetchGlobal = useCallback((targetPage, currentSearch) => {
    setLoading(true);
    setError(null);

    let url = `${API_BASE}/global?page=${targetPage}&limit=50`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch global leaderboard');
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
          setError(json.error || 'Failed to load global leaderboard');
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
    fetchGlobal(1, search);
  }, [search, fetchGlobal]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchGlobal(nextPage, search);
  };

  const columns = [
    { key: 'rank', label: 'Rank' },
    { key: 'name', label: 'Student Name' },
    { key: 'totalSP', label: 'Total SP', render: (row) => <strong>{row.totalSP}</strong> },
    { key: 'rankDelta', label: 'Change' }
  ];

  return (
    <div>
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
