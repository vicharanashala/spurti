import React, { useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function Login({ onAdmin, onBack }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !token.trim()) {
      return setError('Please enter both email and token.');
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Forbidden');
      
      const auth = { email, token };
      // After login, we load admin stats to hydrate admin state
      const statsRes = await fetch(`${API}/admin/stats`, {
        headers: { 'X-Admin-Email': email, 'X-Admin-Token': token }
      });
      const stats = statsRes.ok ? await statsRes.json() : {};
      onAdmin(stats, auth);
    } catch (err) {
      setError(err.message || 'Admin credentials were not accepted.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page login-page">
      <section className="modal login-card" style={{ maxWidth: '400px', margin: '80px auto' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow" style={{ color: 'var(--red)' }}>Restricted</p>
            <h1>Admin Access</h1>
          </div>
          <button className="secondary" onClick={onBack}>Back</button>
        </div>
        <form onSubmit={submit} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px' }}>
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Admin email"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--line)' }}
          />
          <input
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Admin token / password"
            type="password"
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--line)' }}
          />
          <button type="submit" className="primary" disabled={loading} style={{ padding: '10px' }}>
            {loading ? 'Logging in...' : 'Open Control Room'}
          </button>
          {error && <p className="error" style={{ color: 'var(--red)', fontSize: '13px', textAlign: 'center' }}>{error}</p>}
        </form>
      </section>
    </main>
  );
}
