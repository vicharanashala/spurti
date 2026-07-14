import React, { useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function Landing({ config, onStudent, onAdminLoginRedirect }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <main className="page">
      <section className="hero" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '40px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <p className="eyebrow" style={{ fontSize: '14px', letterSpacing: '0.15em', color: 'var(--primary)' }}>Spurti Motivation Engine</p>
          <h1 style={{ fontSize: '42px', margin: '15px 0', lineHeight: '1.2' }}>Select Your Portal</h1>
          <p className="lead" style={{ margin: '0 auto', maxWidth: '600px', fontSize: '16px' }}>
            Welcome to Spurti. Choose your role below to view points, monitor consistency, or manage the cohort control room.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '30px',
          width: '100%',
          maxWidth: '800px',
        }}>
          {/* Student Card */}
          <div className="panel" style={{
            padding: '40px 30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            textAlign: 'center',
            borderRadius: '12px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'pointer'
          }}
          onClick={() => {
            if (config.allowStudentSearch) {
              setSearchOpen(true);
            }
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(23, 32, 51, 0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow)';
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(23, 107, 135, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
                fontSize: '28px'
              }}>
                🎓
              </div>
              <h2 style={{ margin: 0, color: 'var(--primary)', fontWeight: '700' }}>Student Portal</h2>
              <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                Find your Spurti Points, view your attendance history, poll statistics, level progression, and the cohort leaderboard.
              </p>
            </div>
            {config.allowStudentSearch ? (
              <button className="primary" style={{ width: '100%', padding: '12px' }}>
                Open Student Dashboard
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                  Please login from Samagama to view your Spurti Points.
                </p>
                <a className="primary link-button" href="/" style={{ width: '100%', minHeight: '38px', borderRadius: '7px' }}>
                  Go to Samagama Login
                </a>
              </div>
            )}
          </div>

          {/* Admin Card */}
          <div className="panel" style={{
            padding: '40px 30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'center',
            textAlign: 'center',
            borderRadius: '12px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            cursor: 'pointer'
          }}
          onClick={onAdminLoginRedirect}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)';
            e.currentTarget.style.boxShadow = '0 20px 40px rgba(23, 32, 51, 0.18)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'var(--shadow)';
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', marginBottom: '25px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(180, 35, 24, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--red)',
                fontSize: '28px'
              }}>
                ⚙️
              </div>
              <h2 style={{ margin: 0, color: 'var(--red)', fontWeight: '700' }}>Admin Portal</h2>
              <p style={{ color: 'var(--muted)', fontSize: '14px', lineHeight: '1.5', margin: 0 }}>
                Access the control panel to view cohort statistics, live active users, detailed analytics, bulk notifications, and goals.
              </p>
            </div>
            <button className="secondary" style={{ width: '100%', padding: '12px', background: '#fdf2f2', color: 'var(--red)' }}>
              Open Admin Dashboard
            </button>
          </div>
        </div>
      </section>
      {config.allowStudentSearch && searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onStudent={onStudent} />}
    </main>
  );
}

function Info({ title, text }) {
  return <div className="info"><h3>{title}</h3><p>{text}</p></div>;
}

function SearchModal({ onClose, onStudent }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [confirmEmail, setConfirmEmail] = useState('');
  const [message, setMessage] = useState('Search by email or name.');

  const search = async () => {
    if (query.trim().length < 2) return setMessage('Type at least 2 characters.');
    const res = await fetch(`${API}/search?q=${encodeURIComponent(query.trim())}`);
    const data = await res.json();
    if (data.excused) return onStudent(data);
    if (data.exact) return onStudent(data.profile);
    setMatches(data.matches || []);
    setMessage(data.matches?.length ? 'Select your record and confirm your email.' : 'No matching student found.');
  };

  const confirm = async () => {
    const res = await fetch(`${API}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: selected?._id, email: confirmEmail })
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error || 'Email did not match.');
    onStudent(data);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal">
        <div className="modal-head">
          <h2>Find your Spurti points</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        <div className="search-row">
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} placeholder="Name or email" />
          <button className="primary" onClick={search}>Search</button>
        </div>
        <p className={message.includes('not') || message.includes('match') ? 'error' : 'muted'}>{message}</p>
        <div className="match-list">
          {matches.map(item => (
            <button key={item._id} className={selected?._id === item._id ? 'match selected' : 'match'} onClick={() => setSelected(item)}>
              <strong>{item.name}</strong>
              <span>{item.maskedEmail}</span>
              {item.maskedAlternateEmail && <span>{item.maskedAlternateEmail}</span>}
            </button>
          ))}
        </div>
        {selected && (
          <div className="confirm">
            <p>Confirm full email for <strong>{selected.name}</strong></p>
            <div className="search-row">
              <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)} placeholder="Full email" />
              <button className="primary" onClick={confirm}>Confirm</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
