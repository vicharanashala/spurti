import React from 'react';

export default function AdminLeaderboard({
  leaderboard,
  leaderboardLoading,
  leaderboardTimeRange,
  setLeaderboardTimeRange,
  leaderboardSortBy,
  setLeaderboardSortBy,
  leaderboardSortOrder,
  setLeaderboardSortOrder,
  leaderboardLimit,
  setLeaderboardLimit,
  leaderboardPage,
  setLeaderboardPage,
  leaderboardTotalPages,
  leaderboardTotal,
  loadStudent
}) {
  return (
    <section className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2>Student Leaderboard</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={leaderboardTimeRange} onChange={e => { setLeaderboardTimeRange(e.target.value); setLeaderboardPage(1); }} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value="overall">Overall SP</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>

          <select value={leaderboardSortBy} onChange={e => { setLeaderboardSortBy(e.target.value); setLeaderboardPage(1); }} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value="spEarned">Sort by SP Earned</option>
            <option value="name">Sort by Name</option>
            <option value="email">Sort by Email</option>
          </select>

          <select value={leaderboardSortOrder} onChange={e => { setLeaderboardSortOrder(e.target.value); setLeaderboardPage(1); }} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>

          <select value={leaderboardLimit} onChange={e => { setLeaderboardLimit(Number(e.target.value)); setLeaderboardPage(1); }} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--line)' }}>
            <option value={10}>10 per page</option>
            <option value={25}>25 per page</option>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
          </select>
        </div>
      </div>

      {leaderboardLoading ? (
        <p style={{ textAlign: 'center', padding: '20px' }}>Loading leaderboard...</p>
      ) : leaderboard.length === 0 ? (
        <p className="empty" style={{ textAlign: 'center', padding: '20px' }}>No records found.</p>
      ) : (
        <>
          <table className="table">
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Email</th>
                <th>{leaderboardTimeRange === 'overall' ? 'Total SP' : 'SP Earned'}</th>
                <th>Level / League</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(row => (
                <tr key={row._id} onClick={() => loadStudent(row._id)} style={{ cursor: 'pointer' }}>
                  <td><strong>#{row.rank}</strong></td>
                  <td>{row.name}</td>
                  <td>{row.email}</td>
                  <td>
                    <span className={row.spEarned >= 0 ? 'credit' : 'debit'} style={{ fontWeight: 'bold' }}>
                      {row.spEarned >= 0 ? `+${row.spEarned}` : row.spEarned} SP
                    </span>
                    {leaderboardTimeRange !== 'overall' && (
                      <small style={{ color: 'var(--muted)', marginLeft: '6px' }}>({row.totalSp} total)</small>
                    )}
                  </td>
                  <td>
                    Level {row.level} &bull; <span style={{ color: 'var(--muted)' }}>{row.trophyLeague}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination-row">
            <span>Showing page {leaderboardPage} of {leaderboardTotalPages} ({leaderboardTotal} students)</span>
            <div className="btn-group">
              <button className="secondary" disabled={leaderboardPage <= 1} onClick={() => setLeaderboardPage(prev => prev - 1)}>
                &larr; Prev
              </button>
              <button className="secondary" disabled={leaderboardPage >= leaderboardTotalPages} onClick={() => setLeaderboardPage(prev => prev + 1)}>
                Next &rarr;
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
