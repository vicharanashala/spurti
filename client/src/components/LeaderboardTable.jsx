import React, { useState, useEffect } from 'react';

export default function LeaderboardTable({
  entries = [],
  columns = [],
  currentStudentId = null,
  loading = false,
  onLoadMore = null,
  hasMore = false,
  onSearch = null,
  searchValue = ''
}) {
  const [term, setTerm] = useState(searchValue);

  useEffect(() => {
    setTerm(searchValue);
  }, [searchValue]);

  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => {
      onSearch(term);
    }, 300);
    return () => clearTimeout(timer);
  }, [term, onSearch]);

  const renderRankDelta = (delta) => {
    if (delta === null || delta === undefined || delta === 0) {
      return <span style={{ color: 'var(--muted)' }}>-</span>;
    }
    if (delta > 0) {
      return <span style={{ color: 'var(--green)', fontWeight: 'bold' }}>^ {delta}</span>;
    }
    return <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>v {Math.abs(delta)}</span>;
  };

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
      {/* Search Header */}
      {onSearch && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', background: '#f8fafc' }}>
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by student name..."
            style={{ maxWidth: 300 }}
          />
        </div>
      )}

      {/* Table Content */}
      <div style={{ overflowX: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={{ whiteSpace: 'nowrap' }}>
                  {col.headerTooltip ? (
                    <span title={col.headerTooltip} style={{ cursor: 'help' }}>
                      {col.label} (i)
                    </span>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 ? (
              // Skeleton rows
              Array.from({ length: 10 }).map((_, idx) => (
                <tr key={idx}>
                  {columns.map((_, colIdx) => (
                    <td key={colIdx} style={{ color: 'var(--muted)' }}>
                      Loading...
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              // Empty state
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--muted)' }}>
                  No students on this leaderboard yet
                </td>
              </tr>
            ) : (
              entries.map((entry, rowIdx) => {
                const isCurrentStudent =
                  currentStudentId &&
                  (entry.studentId === currentStudentId ||
                    entry.studentId?._id === currentStudentId ||
                    entry.studentId?.toString() === currentStudentId.toString());

                return (
                  <tr
                    key={entry._id || rowIdx}
                    className={isCurrentStudent ? 'current-student' : ''}
                  >
                    {columns.map((col, colIdx) => (
                      <td key={colIdx} style={{ whiteSpace: 'nowrap' }}>
                        {col.key === 'rankDelta' || col.key === 'change' ? (
                          renderRankDelta(entry.rankDelta)
                        ) : col.render ? (
                          col.render(entry)
                        ) : (
                          entry[col.key] ?? '-'
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {hasMore && onLoadMore && (
        <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid var(--line)', background: '#f8fafc' }}>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            style={{
              padding: '8px 20px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: '#fff',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
