import React from 'react';

export default function StudentLayout({ children, student, onBack }) {
  return (
    <main className="page compact">
      <header className="topbar">
        {onBack ? <button className="secondary" onClick={onBack}>Back</button> : <span />}
        <div>
          <p className="eyebrow">Student Spurti Bank</p>
          <h1>{student.name}</h1>
        </div>
        <div className="score-card">
          <span>SP</span>
          <strong>{student.totalSp}</strong>
          <em>Rank {student.rank} of {student.cohortSize}</em>
        </div>
      </header>
      {children}
    </main>
  );
}
