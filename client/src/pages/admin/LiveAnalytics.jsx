import React from 'react';

export default function LiveAnalytics({ active }) {
  return (
    <section className="panel">
      <h2>Live Analytics</h2>
      <div className="live-summary">
        <strong>{active.length}</strong>
        <span>active viewers in the last 60 seconds</span>
      </div>
      <table className="table" style={{ marginTop: '15px' }}>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Last Page</th>
            <th>Viewing Record</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {active.map(v => (
            <tr key={v.email}>
              <td>{v.email}</td>
              <td>{v.name}</td>
              <td><code>{v.page}</code></td>
              <td>{v.recordViewed || '—'}</td>
              <td>{v.secondsAgo}s ago</td>
            </tr>
          ))}
          {active.length === 0 && (
            <tr><td colSpan="5" className="empty" style={{ textAlign: 'center' }}>No live viewers active.</td></tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
