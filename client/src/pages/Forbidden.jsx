import React from 'react';

export default function Forbidden({ onBack }) {
  return (
    <main className="page login-page">
      <section className="panel auth-card" style={{ textAlign: 'center', maxWidth: '500px', margin: '80px auto' }}>
        <p className="eyebrow" style={{ color: 'var(--red)' }}>403 Error</p>
        <h1 style={{ margin: '10px 0' }}>Access Forbidden</h1>
        <p className="lead" style={{ marginBottom: '20px' }}>You do not have administrative permissions to access this view.</p>
        <button className="primary" onClick={onBack}>Go back</button>
      </section>
    </main>
  );
}
