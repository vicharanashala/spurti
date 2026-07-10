import React from 'react';

export default function AdminLayout({ children, stats, admin, onBack }) {
  return (
    <main className="page compact">
      <header className="topbar">
        <button className="secondary" onClick={onBack}>Back</button>
        <div>
          <p className="eyebrow">Admin Dashboard</p>
          <h1>Spurti Control Room</h1>
        </div>
        <div className="score-card">
          <span>Yet to onboard</span>
          <strong>{stats?.yetToOnboard ?? admin?.yetToOnboard ?? 0}</strong>
          <span className="divider">|</span>
          <span>Active</span>
          <strong>{stats?.activeStudents ?? admin?.activeStudents ?? 0}</strong>
          <span className="divider">|</span>
          <span>Excused</span>
          <strong>{stats?.excusedStudents ?? admin?.excusedStudents ?? 0}</strong>
          <em>{stats?.transactions ?? admin?.transactions ?? 0} txns</em>
        </div>
      </header>
      {children}
    </main>
  );
}
