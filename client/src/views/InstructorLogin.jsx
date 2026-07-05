import React, { useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function InstructorLogin({ onLoginSuccess, onBackToLanding }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API}/auth/instructor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: password.trim() })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setError('Backend server is not reachable on port 5290. Please run: node server/server.js');
        setLoading(false);
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid email or password');
        setLoading(false);
        return;
      }

      if (data.token) {
        localStorage.setItem('spurti_token', data.token);
        localStorage.setItem('spurti_role', 'instructor');
        console.log('[DEBUG] Login response role:', data.role || 'instructor');
        console.log('[DEBUG] Switching to instructor view');
        if (onLoginSuccess) {
          onLoginSuccess();
        }
      } else {
        setError('Invalid email or password');
      }
    } catch (err) {
      setError(err?.message || 'Cannot connect to backend server. Please verify the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page login-page">
      <section className="modal login-card" style={{ maxWidth: '420px', width: '100%' }}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Instructor Portal</p>
            <h1>Instructor Login</h1>
          </div>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error" style={{ padding: '10px', borderRadius: '6px', background: '#fef2f2', border: '1px solid #fee2e2', color: '#dc2626', fontSize: '14px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted, #64748b)' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="instructor@spurti.in"
              disabled={loading}
              required
            />
          </div>

          <div style={{ display: 'grid', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--muted, #64748b)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              disabled={loading}
              required
            />
          </div>

          <button
            type="submit"
            className="primary"
            disabled={loading}
            style={{ marginTop: '8px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Logging in...' : 'Log in as Instructor'}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center', paddingTop: '16px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
          <button
            type="button"
            className="link-button"
            onClick={onBackToLanding}
            style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Student login
          </button>
        </div>
      </section>
    </main>
  );
}
