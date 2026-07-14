/**
 * GroupLeaderboard.jsx — Content for the "My Onboarding Group" leaderboard tab.
 *
 * NOTE: This component renders only the table content — no outer <section> wrapper.
 * It is embedded inside LeaderboardTabs which already provides the panel wrapper.
 *
 * Enhancements over the plain table:
 *  - Shows a "Trophy League" column.
 *  - When the current user is outside the top 50, their row is pinned at the bottom
 *    with a left accent border and a "Your position in the group" separator.
 *  - When the current user IS in the top 50, their row is highlighted in place.
 *  - A "Share Rank" inline button appears next to the user's name.
 */
import React, { useMemo } from 'react';

export default function GroupLeaderboard({ group = [], groupLabel, student, onShareRank }) {
  /**
   * Detect whether the current-student row was appended outside the top-50.
   * The backend appends it when `idx >= 50`, so the last row will be the
   * current student AND the rank jump from the row before will be > 1.
   */
  const { mainRows, pinnedRow } = useMemo(() => {
    if (group.length === 0) return { mainRows: [], pinnedRow: null };

    const last = group[group.length - 1];
    const secondLast = group[group.length - 2];

    // "Appended" means: last row is current student AND its rank is not
    // consecutive with the row before it (i.e., it was added outside the list).
    const isAppended =
      last?.isCurrentStudent &&
      group.length > 1 &&
      secondLast != null &&
      last.rank !== secondLast.rank + 1;

    if (isAppended) {
      return { mainRows: group.slice(0, -1), pinnedRow: last };
    }
    return { mainRows: group, pinnedRow: null };
  }, [group]);

  const renderRow = (row, isPinned = false) => {
    const isCurrent = row.isCurrentStudent;
    const rowStyle = isCurrent
      ? {
          background: 'var(--current-student-bg, #e9f7ee)',
          fontWeight: 850,
          borderLeft: isPinned ? '4px solid var(--primary)' : undefined
        }
      : {};

    return (
      <tr
        key={`${row.rank}-${row.maskedEmail}`}
        className={isCurrent ? 'current-student' : ''}
        style={rowStyle}
      >
        <td>{row.rank}</td>
        <td>
          {row.name}
          {isCurrent && student?.shareEnabled !== false && onShareRank && (
            <button
              className="inline-share-btn"
              onClick={() => {
                window.__lastSharedRank = row.rank;
                window.__lastSharedContext = 'group';
                onShareRank();
              }}
              title="Share My Rank"
              style={{ marginLeft: '8px' }}
            >
              📢 Share Rank
            </button>
          )}
        </td>
        <td>{row.maskedEmail}</td>
        <td>{row.level}</td>
        <td>{row.trophyLeague || '—'}</td>
        <td>{row.totalSp}</td>
      </tr>
    );
  };

  return (
    <>
      {groupLabel && (
        <p className="muted" style={{ margin: '0 0 12px' }}>
          Showing students onboarded in your group: {groupLabel}
        </p>
      )}

      {group.length === 0 ? (
        <p className="muted">No students found in your onboarding group.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Name</th>
              <th>Email</th>
              <th>Level</th>
              <th>Trophy League</th>
              <th>SP</th>
            </tr>
          </thead>
          <tbody>
            {mainRows.map(row => renderRow(row, false))}
            {pinnedRow && (
              <>
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      padding: '4px 12px',
                      background: 'var(--line)',
                      fontSize: '11px',
                      color: 'var(--muted)',
                      fontStyle: 'italic'
                    }}
                  >
                    Your position in the group
                  </td>
                </tr>
                {renderRow(pinnedRow, true)}
              </>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
