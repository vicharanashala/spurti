import React, { useState, useEffect, useCallback } from 'react';
import LeaderboardTable from './LeaderboardTable.jsx';

const API_BASE = '/api/leaderboard';

const SKILL_DESCRIPTIONS = {
  REACT: 'Tracks SP earned through React course modules, live component building, and React quiz polls.',
  MERN: 'Tracks SP earned through Node.js, Express, MongoDB, and full-stack MERN integrations.',
  GITHUB: 'Tracks SP earned through repository contributions, pull requests, and Git workflows.',
  AI: 'Tracks SP earned through prompt engineering, AI tool integration, and LLM sessions.',
  ORIENTATION: 'Tracks SP earned through onboarding tasks, culture sessions, and attendance.'
};

export default function SkillLeaderboard({ skillCategory = 'react', currentStudentId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [metadata, setMetadata] = useState(null);

  const fetchSkill = useCallback((category, targetPage, currentSearch) => {
    setLoading(true);
    setError(null);

    let url = `${API_BASE}/skill/${category.toLowerCase()}?page=${targetPage}&limit=50`;
    if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch skill leaderboard');
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
          setError(json.error || 'Failed to load skill leaderboard');
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
    fetchSkill(skillCategory, 1, search);
  }, [skillCategory, search, fetchSkill]);

  const handleLoadMore = () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSkill(skillCategory, nextPage, search);
  };

  const columns = [
    { key: 'rank', label: 'Rank' },
    { key: 'name', label: 'Student Name' },
    { key: 'skillSP', label: 'Skill SP', render: (row) => <strong>{row.skillSP}</strong> },
    { key: 'rankDelta', label: 'Change' }
  ];

  const catKey = (skillCategory || '').toUpperCase();
  const displayName = metadata?.categoryDisplayName || catKey;
  const description = SKILL_DESCRIPTIONS[catKey] || 'Tracks SP earned in this skill category.';

  return (
    <div>
      {/* Header Info */}
      <div className="subpanel" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>{displayName} Leaderboard</h3>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{description}</p>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 'bold' }}>
          Note: Only students with SP in this skill appear here
        </p>
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
