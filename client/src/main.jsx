import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
// Dev override: when ?asEmail= is on the URL, forward it to /api/me so we can
// preview the UI for a specific student (e.g. the DUMMY seed records).
const DEV_AS_EMAIL = (() => {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return '';
  return new URLSearchParams(window.location.search).get('asEmail') || '';
})();
const API = `${APP_BASE}/api`;

function App() {
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1' ? 'admin-login' : 'landing');
  const [profile, setProfile] = useState(null);
  const [excused, setExcused] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [adminAuth, setAdminAuth] = useState(null);
  const [config, setConfig] = useState({ allowStudentSearch: true });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.student) return;
    const send = () => fetch(`${API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: profile.student.email,
        name: profile.student.name,
        page: 'record',
        recordViewed: profile.student.email
      })
    }).catch(() => {});
    send();
    const id = setInterval(send, 30000);
    return () => clearInterval(id);
  }, [profile]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const configRes = await fetch(`${API}/config`);
        const nextConfig = configRes.ok ? await configRes.json() : { allowStudentSearch: true };
        if (!active) return;
        setConfig(nextConfig);

        if (view !== 'admin-login') {
          const meRes = await fetch(`${API}/me${DEV_AS_EMAIL ? `?asEmail=${encodeURIComponent(DEV_AS_EMAIL)}` : ''}`);
          if (meRes.ok) {
            const data = await meRes.json();
            if (data.authenticated && data.profile && active) {
              setProfile(data.profile);
              setExcused(null);
              setView('student');
            } else if (data.authenticated && data.excused && active) {
              setExcused(data);
              setProfile(null);
              setView('excused');
            }
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  if (loading) {
    return <main className="page login-page"><section className="panel auth-card"><p className="eyebrow">Spurti</p><h1>Loading</h1></section></main>;
  }
  if (view === 'student' && profile) {
    return (
      <>
        <StudentView profile={profile} onBack={config.allowStudentSearch ? () => setView('landing') : null} />
        <SurveyModal
          survey={config.survey}
          student={profile.student}
          statusPath="/survey/status"
          completedKey="surveyCompleted"
          onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, surveyCompleted: true } }))}
        />
        <SurveyModal
          survey={config.poll2}
          student={profile.student}
          statusPath="/poll2/status"
          completedKey="poll2Completed"
          onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, poll2Completed: true } }))}
        />
      </>
    );
  }
  if (view === 'excused' && excused) {
    return <ExcusedView data={excused} onBack={config.allowStudentSearch ? () => setView('landing') : null} />;
  }
  if (view === 'admin-login') {
    return <AdminLogin onAdmin={(data, auth) => { setAdmin(data); setAdminAuth(auth); setView('admin'); }} onBack={() => setView('landing')} />;
  }
  if (view === 'admin' && admin && adminAuth) {
    return <AdminView admin={admin} auth={adminAuth} onBack={() => setView('landing')} />;
  }
  return <Landing config={config} onStudent={(data) => {
    if (data?.excused) {
      setExcused(data);
      setProfile(null);
      setView('excused');
      return;
    }
    setProfile(data);
    setExcused(null);
    setView('student');
  }} />;
}

function Landing({ config, onStudent }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Spurti Motivation Engine</p>
          <h1>Spurti Points track participation energy.</h1>
          <p className="lead">Spurti Points are a simple learning currency for showing up, participating, and staying engaged through the internship.</p>
          <div className="info-grid">
            <Info title="What is it?" text="A motivation signal that reflects attendance and poll participation." />
            <Info title="How to get points" text="Attend eligible sessions and answer polls to keep your engagement visible." />
            <Info title="Motive" text="To make consistency visible and help the cohort build disciplined learning habits." />
          </div>
          {config.allowStudentSearch ? (
            <button className="primary" onClick={() => setSearchOpen(true)}>Find your Spurti points</button>
          ) : (
            <div className="auth-card inline-auth">
              <h2>Please login from Samagama to view your Spurti Points.</h2>
              <p className="muted">Open Spurti from your Samagama dashboard using the SP details button.</p>
              <a className="primary link-button" href="/">Go to Samagama Login</a>
            </div>
          )}
        </div>
      </section>
      {config.allowStudentSearch && searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onStudent={onStudent} />}
    </main>
  );
}

function AdminLogin({ onAdmin, onBack }) {
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    try {
      const auth = { email, token };
      const res = await fetch(`${API}/admin/stats`, { headers: adminHeaders(auth) });
      if (!res.ok) throw new Error('Forbidden');
      onAdmin(await res.json(), auth);
    } catch {
      setError('Admin credentials were not accepted.');
    }
  };

  return (
    <main className="page login-page">
      <section className="modal login-card">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Restricted</p>
            <h1>Admin access</h1>
          </div>
          <button className="secondary" onClick={onBack}>Back</button>
        </div>
        <div className="login-form">
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Admin email" />
          <input value={token} onChange={e => setToken(e.target.value)} placeholder="Admin token" type="password" />
          <button className="primary" onClick={submit}>Open dashboard</button>
          {error && <p className="error">{error}</p>}
        </div>
      </section>
    </main>
  );
}

function ExcusedView({ data, onBack }) {
  return (
    <main className="page login-page">
      <section className="panel auth-card">
        <p className="eyebrow">Spurti Account</p>
        <h1>{data.student?.name || 'Account excused'}</h1>
        <p className="lead">{data.message}</p>
        {onBack && <button className="secondary" onClick={onBack}>Back</button>}
      </section>
    </main>
  );
}

function adminHeaders(auth) {
  return { 'X-Admin-Email': auth.email, 'X-Admin-Token': auth.token };
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

function StudentView({ profile, onBack }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);
  return (
    <main className="page compact">
      <header className="topbar">
        {onBack ? <button className="secondary" onClick={onBack}>Back</button> : <span />}
        <div>
          <p className="eyebrow">Student Spurti Bank</p>
          <h1>{student.name}</h1>
        </div>
        <div className="score-card"><span className="sp-label"><SpCoinIcon /> SP</span><strong>{student.totalSp}</strong><em>Rank {student.rank} of {student.cohortSize}</em></div>
      </header>
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
    </main>
  );
}

function computeBandFromTimeline(timeline) {
  // General, data-driven band computation. Used as a fallback when the server
  // doesn't supply a pre-computed progressBand (or supplies an unknown value).
  // Mirrors server/services/progress.js PROGRESS_BANDS thresholds.
  if (!Array.isArray(timeline) || !timeline.length) return null;
  const flags = timeline.map(d => d === 'qualified');
  const win = flags.slice(-5);
  const qualified = win.filter(Boolean).length;
  const rate = qualified / win.length;
  let band;
  if (rate >= 0.85) band = 'Excellent';
  else if (rate >= 0.50) band = 'Active';
  else if (rate >= 0.30) band = 'Slowing Down';
  else band = 'Recovery';
  const recent = flags.slice(-3);
  const prev = flags.slice(-6, -3);
  let trend = 'steady';
  if (prev.length) {
    const rr = recent.filter(Boolean).length / recent.length;
    const pr = prev.filter(Boolean).length / prev.length;
    const diff = rr - pr;
    if (diff >= 0.20) trend = 'up';
    else if (diff <= -0.20) trend = 'down';
  }
  return { progressBand: band, progressRate: Math.round(rate * 100), progressTrend: trend };
}

/* ── Static, photo-realistic tile icons (32x32 viewBox) ── */

function LevelIcon() {
  return (
    <svg className="tile-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="lvlHalo" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"  stopColor="#fde68a" stopOpacity="0.5" />
          <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#92400e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lvlStar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fef9c3" />
          <stop offset="35%"  stopColor="#fcd34d" />
          <stop offset="70%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="lvlStarHi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fffbeb" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#lvlHalo)" />
      {/* 5-pointed star — centered around (16,17) with outer radius 10 */}
      <path
        d="M16 6 L19.5 13 L27 14 L21.3 19.2 L22.9 26.6 L16 23 L9.1 26.6 L10.7 19.2 L5 14 L12.5 13 Z"
        fill="url(#lvlStar)"
        stroke="#7c2d12"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* highlight on the upper-left facet */}
      <path
        d="M16 6 L19.5 13 L12.5 13 Z M16 6 L12.5 13 L10.7 19.2 L5 14 Z"
        fill="url(#lvlStarHi)"
        opacity="0.6"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg className="tile-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="trophyHalo" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"  stopColor="#fef08a" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#854d0e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="trophyCup" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fef9c3" />
          <stop offset="40%"  stopColor="#fbbf24" />
          <stop offset="75%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="trophyShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="14" r="13" fill="url(#trophyHalo)" />
      {/* left handle */}
      <path d="M10 8 C 5 8, 5 14, 10 16" fill="none" stroke="url(#trophyCup)" strokeWidth="2.2" strokeLinecap="round" />
      {/* right handle */}
      <path d="M22 8 C 27 8, 27 14, 22 16" fill="none" stroke="url(#trophyCup)" strokeWidth="2.2" strokeLinecap="round" />
      {/* cup body */}
      <path
        d="M9 6 H 23 V 14 C 23 18.4, 20 21, 16 21 C 12 21, 9 18.4, 9 14 Z"
        fill="url(#trophyCup)"
        stroke="#7c2d12"
        strokeWidth="0.5"
        strokeLinejoin="round"
      />
      {/* shine */}
      <path
        d="M11 7 H 14 V 14 C 14 17, 12.8 18.6, 11 19 Z"
        fill="url(#trophyShine)"
      />
      {/* stem */}
      <rect x="14.5" y="21" width="3" height="3" fill="url(#trophyCup)" stroke="#7c2d12" strokeWidth="0.4" />
      {/* base */}
      <rect x="11" y="24" width="10" height="3" rx="0.6" fill="url(#trophyCup)" stroke="#7c2d12" strokeWidth="0.5" />
      {/* star on cup */}
      <circle cx="16" cy="12" r="1.4" fill="#fef3c7" opacity="0.85" />
    </svg>
  );
}

/* Legend tier badges — 4 unique shapes (shield/star/trophy/hex gem), small layout. */

function TierBadgeBronze({ unlocked }) {
  const metal = unlocked ? ['#fef3c7','#fcd34d','#f59e0b','#b45309'] : ['#f1f5f9','#cbd5e1','#94a3b8','#475569'];
  const stroke = unlocked ? '#78350f' : '#1e293b';
  return (
    <svg className="tier-badge-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bzMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={metal[0]} />
          <stop offset="40%"  stopColor={metal[1]} />
          <stop offset="80%"  stopColor={metal[2]} />
          <stop offset="100%" stopColor={metal[3]} />
        </linearGradient>
      </defs>
      <path d="M6 9 Q 6 4, 11 4 H 21 Q 26 4, 26 9 V 18 Q 26 26, 16 28 Q 6 26, 6 18 Z" fill="url(#bzMetal)" stroke={stroke} strokeWidth="0.7" />
      <path d="M10 11 H 22 V 18" fill="none" stroke={stroke} strokeWidth="0.5" opacity="0.4" />
      <circle cx="16" cy="16" r="2.6" fill={unlocked ? '#fef3c7' : '#cbd5e1'} stroke={stroke} strokeWidth="0.4" />
    </svg>
  );
}

function TierBadgeSilver({ unlocked }) {
  const metal = unlocked ? ['#ffffff','#e2e8f0','#cbd5e1','#94a3b8'] : ['#f1f5f9','#cbd5e1','#94a3b8','#475569'];
  const stroke = unlocked ? '#475569' : '#1e293b';
  return (
    <svg className="tier-badge-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="svMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={metal[0]} />
          <stop offset="40%"  stopColor={metal[1]} />
          <stop offset="80%"  stopColor={metal[2]} />
          <stop offset="100%" stopColor={metal[3]} />
        </linearGradient>
      </defs>
      <path d="M16 4 L19.1 11.4 L27 12.3 L21.2 17.5 L23 25.1 L16 21 L9 25.1 L10.8 17.5 L5 12.3 L12.9 11.4 Z" fill="url(#svMetal)" stroke={stroke} strokeWidth="0.6" strokeLinejoin="round" />
      <path d="M16 4 L19.1 11.4 L12.9 11.4 Z" fill="#ffffff" opacity={unlocked ? 0.55 : 0.2} />
      <circle cx="16" cy="16" r="1.6" fill={unlocked ? '#f8fafc' : '#94a3b8'} opacity={unlocked ? 0.9 : 0.4} />
    </svg>
  );
}

function TierBadgeGold({ unlocked }) {
  const metal = unlocked ? ['#fefce8','#fde047','#eab308','#a16207'] : ['#f1f5f9','#cbd5e1','#94a3b8','#475569'];
  const stroke = unlocked ? '#713f12' : '#1e293b';
  return (
    <svg className="tier-badge-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gdMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={metal[0]} />
          <stop offset="40%"  stopColor={metal[1]} />
          <stop offset="80%"  stopColor={metal[2]} />
          <stop offset="100%" stopColor={metal[3]} />
        </linearGradient>
      </defs>
      <path d="M11 5 H 21 V 14 C 21 18, 18 20, 16 20 C 14 20, 11 18, 11 14 Z" fill="url(#gdMetal)" stroke={stroke} strokeWidth="0.6" />
      <path d="M11 7 C 7 7, 7 13, 11 14" fill="none" stroke={stroke} strokeWidth="1.4" />
      <path d="M21 7 C 25 7, 25 13, 21 14" fill="none" stroke={stroke} strokeWidth="1.4" />
      <rect x="14.7" y="20" width="2.6" height="2.6" fill="url(#gdMetal)" stroke={stroke} strokeWidth="0.4" />
      <rect x="11" y="22.6" width="10" height="2.8" rx="0.5" fill="url(#gdMetal)" stroke={stroke} strokeWidth="0.5" />
      <path d="M13 6 H 14.5 V 13 Q 13.6 14.6, 13 15.5 Z" fill="#ffffff" opacity={unlocked ? 0.55 : 0.18} />
    </svg>
  );
}

function TierBadgePlatinum({ unlocked }) {
  const metal = unlocked ? ['#ecfeff','#a5f3fc','#06b6d4','#155e75'] : ['#f1f5f9','#cbd5e1','#94a3b8','#475569'];
  const stroke = unlocked ? '#155e75' : '#1e293b';
  return (
    <svg className="tier-badge-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ptMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={metal[0]} />
          <stop offset="40%"  stopColor={metal[1]} />
          <stop offset="80%"  stopColor={metal[2]} />
          <stop offset="100%" stopColor={metal[3]} />
        </linearGradient>
        <linearGradient id="ptGem" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={unlocked ? '#a5f3fc' : '#cbd5e1'} />
          <stop offset="40%"  stopColor={unlocked ? '#67e8f9' : '#94a3b8'} />
          <stop offset="100%" stopColor={unlocked ? '#0891b2' : '#475569'} />
        </linearGradient>
      </defs>
      <polygon points="16,3 26,8 26,22 16,27 6,22 6,8" fill="url(#ptMetal)" stroke={stroke} strokeWidth="0.7" strokeLinejoin="round" />
      <polygon points="16,8 22,11 22,19 16,22 10,19 10,11" fill="url(#ptGem)" stroke={stroke} strokeWidth="0.4" strokeLinejoin="round" />
      <polygon points="16,8 22,11 16,14.5" fill="#ffffff" opacity={unlocked ? 0.55 : 0.18} />
      {unlocked && <circle cx="16" cy="15.5" r="1.2" fill="#ffffff" opacity="0.85" />}
    </svg>
  );
}

function TierBadgeIcon({ tier, unlocked }) {
  switch (tier) {
    case 'bronze':   return <TierBadgeBronze unlocked={unlocked} />;
    case 'silver':   return <TierBadgeSilver unlocked={unlocked} />;
    case 'gold':     return <TierBadgeGold unlocked={unlocked} />;
    case 'platinum': return <TierBadgePlatinum unlocked={unlocked} />;
    default:         return <TierBadgeBronze unlocked={unlocked} />;
  }
}





function GroupIcon() {
  return (
    <svg className="tile-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="grpHalo" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"  stopColor="#a5b4fc" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grpFront" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
        <linearGradient id="grpBack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#a5b4fc" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14" fill="url(#grpHalo)" />
      {/* back person (left) */}
      <circle cx="11" cy="11" r="3.6" fill="url(#grpBack)" stroke="#3730a3" strokeWidth="0.4" />
      <path d="M5 24 C 5 19, 8 17, 11 17 C 14 17, 17 19, 17 24 Z" fill="url(#grpBack)" stroke="#3730a3" strokeWidth="0.4" />
      {/* back person (right) */}
      <circle cx="21" cy="11" r="3.6" fill="url(#grpBack)" stroke="#3730a3" strokeWidth="0.4" />
      <path d="M15 24 C 15 19, 18 17, 21 17 C 24 17, 27 19, 27 24 Z" fill="url(#grpBack)" stroke="#3730a3" strokeWidth="0.4" />
      {/* front person (center, larger, brighter) */}
      <circle cx="16" cy="13" r="4.2" fill="url(#grpFront)" stroke="#312e81" strokeWidth="0.4" />
      <path d="M8 28 C 8 22, 11.5 20, 16 20 C 20.5 20, 24 22, 24 28 Z" fill="url(#grpFront)" stroke="#312e81" strokeWidth="0.4" />
      {/* highlights on heads */}
      <ellipse cx="14.5" cy="11.5" rx="1.2" ry="0.7" fill="#e0e7ff" opacity="0.55" />
      <ellipse cx="19.5" cy="11.5" rx="1.2" ry="0.7" fill="#e0e7ff" opacity="0.55" />
      <ellipse cx="14.4" cy="11.7" rx="1.4" ry="0.8" fill="#e0e7ff" opacity="0.6" />
    </svg>
  );
}

function SpCoinIcon() {
  return (
    <svg className="sp-coin" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="spCoinHalo" cx="0.5" cy="0.5" r="0.55">
          <stop offset="0%"   stopColor="#fde68a" stopOpacity="0.55" />
          <stop offset="60%"  stopColor="#f59e0b" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#92400e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="spCoinFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fef9c3" />
          <stop offset="35%"  stopColor="#fcd34d" />
          <stop offset="70%"  stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <linearGradient id="spCoinShine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fffbeb" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* halo */}
      <circle cx="16" cy="16" r="15" fill="url(#spCoinHalo)" />
      {/* outer rim */}
      <circle cx="16" cy="16" r="12" fill="url(#spCoinFace)" stroke="#451a03" strokeWidth="0.6" />
      {/* inner rim ridge (darker inset) */}
      <circle cx="16" cy="16" r="10.4" fill="none" stroke="#b45309" strokeWidth="0.5" opacity="0.65" />
      {/* shine arc on the upper half */}
      <path
        d="M6.5 16 A 9.5 9.5 0 0 1 25.5 16"
        fill="none"
        stroke="url(#spCoinShine)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* "SP" letters engraved in serif */}
      <text
        x="16"
        y="20"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="11"
        fontWeight="700"
        fill="#7c2d12"
        letterSpacing="0.4"
      >SP</text>
      {/* dot accents flanking letters */}
      <circle cx="9.5" cy="17" r="0.7" fill="#78350f" />
      <circle cx="22.5" cy="17" r="0.7" fill="#78350f" />
    </svg>
  );
}

function BandIconExcellent() {
  return (
    <svg className="tile-icon band band-excellent" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="band3ExHalo" cx="0.5" cy="0.55" r="0.6">
          <stop offset="0%"   stopColor="#bbf7d0" stopOpacity="0.65" />
          <stop offset="55%"  stopColor="#34d399" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#065f46" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="band3ExPetalOuter" x1="0" y1="1" x2="0.5" y2="0">
          <stop offset="0%"   stopColor="#064e3b" />
          <stop offset="40%"  stopColor="#047857" />
          <stop offset="80%"  stopColor="#34d399" />
          <stop offset="100%" stopColor="#a7f3d0" />
        </linearGradient>
        <linearGradient id="band3ExPetalMid" x1="0" y1="1" x2="0.5" y2="0">
          <stop offset="0%"   stopColor="#065f46" />
          <stop offset="50%"  stopColor="#10b981" />
          <stop offset="100%" stopColor="#ecfdf5" />
        </linearGradient>
        <linearGradient id="band3ExCore" x1="0" y1="1" x2="0.5" y2="0">
          <stop offset="0%"   stopColor="#10b981" />
          <stop offset="60%"  stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      {/* soft halo behind the burst */}
      <circle cx="16" cy="15" r="13" fill="url(#band3ExHalo)" />
      {/* center petal — largest, deepest green at base */}
      <path
        d="M16 3
           C 12.5 8, 11.4 12.2, 12.6 16
           C 13.4 18.6, 15.0 20.0, 16 22
           C 17.0 20.0, 18.6 18.6, 19.4 16
           C 20.6 12.2, 19.5 8, 16 3 Z"
        fill="url(#band3ExPetalOuter)"
      />
      {/* upper-left petal */}
      <path
        d="M7 7
           C 7.5 10.5, 9.5 13.6, 12.4 15.6
           C 14.2 16.8, 16 17.0, 16 17
           C 15.5 14.6, 13.4 11.2, 10.6 9.0
           C 9.0 7.8, 7.8 7.0, 7 7 Z"
        fill="url(#band3ExPetalMid)" opacity="0.92"
      />
      {/* upper-right petal */}
      <path
        d="M25 7
           C 24.5 10.5, 22.5 13.6, 19.6 15.6
           C 17.8 16.8, 16 17.0, 16 17
           C 16.5 14.6, 18.6 11.2, 21.4 9.0
           C 23.0 7.8, 24.2 7.0, 25 7 Z"
        fill="url(#band3ExPetalMid)" opacity="0.92"
      />
      {/* lower-left small petal */}
      <path
        d="M9.5 22
           C 11.5 19.5, 13.6 17.6, 15.6 17
           C 16.4 16.8, 16.6 17.0, 16.6 17
           C 15.6 19.4, 13.4 22.0, 11 24
           C 10.0 24.6, 9.5 24, 9.5 22 Z"
        fill="url(#band3ExPetalMid)" opacity="0.85"
      />
      {/* lower-right small petal */}
      <path
        d="M22.5 22
           C 20.5 19.5, 18.4 17.6, 16.4 17
           C 15.6 16.8, 15.4 17.0, 15.4 17
           C 16.4 19.4, 18.6 22.0, 21 24
           C 22.0 24.6, 22.5 24, 22.5 22 Z"
        fill="url(#band3ExPetalMid)" opacity="0.85"
      />
      {/* bright core */}
      <ellipse cx="16" cy="16.4" rx="2.2" ry="3.0" fill="url(#band3ExCore)" />
    </svg>
  );
}

function BandIconActive() {
  return (
    <svg className="tile-icon band band-active" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="band3AcHalo" cx="0.5" cy="0.7" r="0.6">
          <stop offset="0%"   stopColor="#bfdbfe" stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#60a5fa" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="band3AcWaveBody" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#1e3a8a" />
          <stop offset="40%"  stopColor="#1d4ed8" />
          <stop offset="75%"  stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#93c5fd" />
        </linearGradient>
        <linearGradient id="band3AcWaveCrest" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#1e40af" />
          <stop offset="50%"  stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#dbeafe" />
        </linearGradient>
        <linearGradient id="band3AcFoam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#60a5fa" />
          <stop offset="60%"  stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      {/* soft halo behind the wave */}
      <ellipse cx="16" cy="22" rx="14" ry="9" fill="url(#band3AcHalo)" />
      {/* large sweeping wave body — one continuous path with two peaks */}
      <path
        d="M2 21
           C 5 21, 7 17, 11 17
           C 15 17, 15 24, 19 24
           C 23 24, 24 18, 30 18
           L 30 30
           L 2 30 Z"
        fill="url(#band3AcWaveBody)"
      />
      {/* second wave layer — slightly behind, deeper */}
      <path
        d="M2 25
           C 6 25, 8 22, 12 22
           C 16 22, 16 28, 20 28
           C 24 28, 26 23, 30 23
           L 30 30
           L 2 30 Z"
        fill="#1e3a8a" opacity="0.55"
      />
      {/* foam crest on the front wave */}
      <path
        d="M2 21
           C 5 21, 7 17, 11 17
           C 15 17, 15 24, 19 24
           C 23 24, 24 18, 30 18"
        fill="none"
        stroke="url(#band3AcWaveCrest)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* bright foam highlights on the wave tops */}
      <path
        d="M9 18 Q 11 16, 13 18"
        fill="none"
        stroke="url(#band3AcFoam)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M17 25 Q 19 23, 21 25"
        fill="none"
        stroke="url(#band3AcFoam)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M24 19.5 Q 26 17.5, 28 19.5"
        fill="none"
        stroke="url(#band3AcFoam)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* tiny spray droplets */}
      <circle cx="11" cy="13" r="0.9" fill="#dbeafe" />
      <circle cx="20" cy="20" r="0.9" fill="#dbeafe" />
      <circle cx="27" cy="14" r="0.9" fill="#dbeafe" />
    </svg>
  );
}

function BandIconSlowingDown() {
  return (
    <svg className="tile-icon band band-slowing-down" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="band3SdGlow" cx="0.5" cy="0.85" r="0.55">
          <stop offset="0%"   stopColor="#fed7aa" stopOpacity="0.55" />
          <stop offset="55%"  stopColor="#f97316" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#7c2d12" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="band3SdSmoke" x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0%"   stopColor="#57534e" />
          <stop offset="40%"  stopColor="#a8a29e" />
          <stop offset="100%" stopColor="#f5f5f4" stopOpacity="0.4" />
        </linearGradient>
        <linearGradient id="band3SdEmber" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#7c2d12" />
          <stop offset="50%"  stopColor="#ea580c" />
          <stop offset="100%" stopColor="#fde047" />
        </linearGradient>
        <linearGradient id="band3SdAsh" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"   stopColor="#44403c" />
          <stop offset="100%" stopColor="#d6d3d1" />
        </linearGradient>
      </defs>
      {/* glow at the base — last bit of warmth */}
      <ellipse cx="16" cy="27" rx="14" ry="5" fill="url(#band3SdGlow)" />
      {/* ember bed — last glowing coal */}
      <path
        d="M6 27
           Q 9 22, 16 22
           Q 23 22, 26 27
           Q 23 29, 16 29
           Q 9 29, 6 27 Z"
        fill="url(#band3SdEmber)"
      />
      {/* small ember highlights */}
      <ellipse cx="13" cy="25.5" rx="2.5" ry="1.4" fill="#fde047" opacity="0.7" />
      <ellipse cx="19" cy="26"   rx="2.0" ry="1.0" fill="#fb923c" opacity="0.6" />
      {/* curling smoke — large sweeping S-curve rising upward */}
      <path
        d="M16 22
           C 11 19, 11 14, 14 11
           C 17 8, 18 5, 16 2"
        fill="none"
        stroke="url(#band3SdSmoke)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* second thinner smoke trail */}
      <path
        d="M20 21
           C 17 18, 18 14, 21 11"
        fill="none"
        stroke="url(#band3SdSmoke)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.6"
      />
      {/* ash flecks scattered around the ember */}
      <circle cx="4"  cy="23" r="0.8" fill="url(#band3SdAsh)" />
      <circle cx="7"  cy="20" r="0.7" fill="url(#band3SdAsh)" opacity="0.7" />
      <circle cx="28" cy="22" r="0.8" fill="url(#band3SdAsh)" />
      <circle cx="25" cy="19" r="0.6" fill="url(#band3SdAsh)" opacity="0.6" />
      <circle cx="10" cy="14" r="0.6" fill="url(#band3SdSmoke)" opacity="0.5" />
      <circle cx="22" cy="13" r="0.5" fill="url(#band3SdSmoke)" opacity="0.5" />
    </svg>
  );
}

function BandIconRecovery() {
  return (
    <svg className="tile-icon band band-recovery" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="band3RcHalo" cx="0.5" cy="0.65" r="0.6">
          <stop offset="0%"   stopColor="#bbf7d0" stopOpacity="0.65" />
          <stop offset="55%"  stopColor="#4ade80" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#14532d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="band3RcDropOuter" x1="0.3" y1="0" x2="0.5" y2="1">
          <stop offset="0%"   stopColor="#bbf7d0" />
          <stop offset="40%"  stopColor="#4ade80" />
          <stop offset="100%" stopColor="#14532d" />
        </linearGradient>
        <linearGradient id="band3RcDropInner" x1="0.3" y1="0" x2="0.5" y2="1">
          <stop offset="0%"   stopColor="#ecfdf5" />
          <stop offset="60%"  stopColor="#86efac" />
          <stop offset="100%" stopColor="#16a34a" />
        </linearGradient>
        <linearGradient id="band3RcSpark" x1="0" y1="1" x2="0.5" y2="0">
          <stop offset="0%"   stopColor="#22c55e" />
          <stop offset="60%"  stopColor="#fef9c3" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      {/* halo behind the leaf */}
      <circle cx="16" cy="14" r="13" fill="url(#band3RcHalo)" />
      {/* outer leaf — large sweeping teardrop path */}
      <path
        d="M16 3
           C 9 7, 5 14, 6 21
           C 7 27, 14 29, 16 29
           C 18 29, 25 27, 26 21
           C 27 14, 23 7, 16 3 Z"
        fill="url(#band3RcDropOuter)"
      />
      {/* inner leaf — same teardrop slightly smaller and brighter */}
      <path
        d="M16 7
           C 11 10, 8.5 14.5, 9.5 19.5
           C 10.4 24.5, 14.5 26, 16 26
           C 17.5 26, 21.6 24.5, 22.5 19.5
           C 23.5 14.5, 21 10, 16 7 Z"
        fill="url(#band3RcDropInner)"
        opacity="0.9"
      />
      {/* central vein sweeping through the leaf */}
      <path
        d="M16 5 C 15.5 12, 15.5 20, 16 28"
        fill="none"
        stroke="#14532d"
        strokeWidth="1.0"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* side veins */}
      <path d="M16 11 Q 13 13, 11 16" fill="none" stroke="#14532d" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
      <path d="M16 11 Q 19 13, 21 16" fill="none" stroke="#14532d" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
      <path d="M16 17 Q 12.5 19, 10.5 22" fill="none" stroke="#14532d" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
      <path d="M16 17 Q 19.5 19, 21.5 22" fill="none" stroke="#14532d" strokeWidth="0.7" strokeLinecap="round" opacity="0.45" />
      {/* bright highlight near the leaf tip */}
      <ellipse cx="13" cy="11" rx="2.2" ry="3.0" fill="url(#band3RcSpark)" opacity="0.55" />
      {/* a single droplet of new growth at the base */}
      <path
        d="M16 29.5 C 14 30, 14 32, 16 32 C 18 32, 18 30, 16 29.5 Z"
        fill="#86efac"
      />
    </svg>
  );
}

function BandIcon({ band }) {
  switch (band) {
    case 'Excellent':    return <BandIconExcellent />;
    case 'Active':       return <BandIconActive />;
    case 'Slowing Down': return <BandIconSlowingDown />;
    case 'Recovery':     return <BandIconRecovery />;
    default:             return <BandIconActive />;
  }
}







function LevelStatus({ student }) {
  const tier = String(student.trophyLeague || 'Bronze').split(' ')[0].toLowerCase();
  // General, data-driven: compute band locally from streakTimeline so the
  // tile always reflects the underlying attendance data, regardless of whether
  // the server supplied a pre-computed progressBand or not. Server value wins
  // only if local computation has nothing to work with.
  const localBand = useMemo(
    () => computeBandFromTimeline(student.streakTimeline),
    [student.streakTimeline]
  );
  const pb = localBand?.progressBand ?? student.progressBand ?? 'Recovery';
  const pr = localBand?.progressRate ?? student.progressRate ?? 0;
  const pt = localBand?.progressTrend ?? student.progressTrend ?? 'steady';
  return (
    <section className="level-status">
      <div className="level-tiles">
        <div className="level-tile">
          <span className="tile-label"><LevelIcon /> Level</span>
          <strong>{student.level}</strong>
          <div className="xp-bar-wrap" aria-label="Progress to next level">
            <div className="xp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, student.levelProgress ?? 0))}%` }} />
          </div>
          <em>lifetime achievement · {student.levelProgress ?? 0}/100 to L{student.level + 1}{student.weeklyXp != null && student.weeklyXp !== 0 ? <span className="xp-weekly"> · {student.weeklyXp > 0 ? '+' : ''}{student.weeklyXp} this week</span> : null}</em>
        </div>
        <div className={`level-tile league tier-${tier}`}>
          <span className="tile-label"><TrophyIcon /> Trophy League</span>
          <strong>{student.trophyLeague}</strong>
          <em>current performance</em>
        </div>
        <div className="level-tile">
          <span className="tile-label">Legend Badge</span>
          <div className="tier-badge-row" aria-label="Legend badge tiers (lifetime SP milestones)">
            {(student.legendTiers || []).map(t => (
              <span
                key={t.key}
                className={`tier-badge${t.unlocked ? ' tier-badge-on' : ' tier-badge-off'}`}
                title={`${t.name} — ${t.threshold}+ SP${t.unlocked ? ' (unlocked)' : ' (locked)'}`}
              >
                <TierBadgeIcon tier={t.key} unlocked={t.unlocked} />
                <small>{t.name}</small>
              </span>
            ))}
          </div>
          <em>{student.legendBadgeUnlocked
            ? 'Platinum unlocked (1500 SP) — full legend status'
            : 'reach 1500 SP to unlock Platinum (legend)'}</em>
        </div>
        <div className="level-tile">
          <span className="tile-label"><GroupIcon /> Onboarding Group</span>
          <strong className="group">{student.leaderboardGroupLabel || '—'}</strong>
          <em>biweekly cohort</em>
        </div>
        <div className={`level-tile streak-tile${(student.currentStreak ?? 0) === 0 ? ' streak-cold' : (student.currentStreak ?? 0) >= 5 ? ' streak-hot' : ''}`}>
          <span>Streak</span>
          <strong>
            <svg className="streak-flame" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <defs>
                <radialGradient id="flameHalo" cx="0.5" cy="0.7" r="0.6">
                  <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.45" />
                  <stop offset="55%" stopColor="#f97316" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="flameOuter" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#7f1d1d" />
                  <stop offset="22%"  stopColor="#b91c1c" />
                  <stop offset="55%"  stopColor="#ef4444" />
                  <stop offset="78%"  stopColor="#f97316" />
                  <stop offset="100%" stopColor="#fb923c" />
                </linearGradient>
                <linearGradient id="flameMid" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#dc2626" />
                  <stop offset="35%"  stopColor="#f97316" />
                  <stop offset="70%"  stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#fde68a" />
                </linearGradient>
                <linearGradient id="flameCore" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#f97316" />
                  <stop offset="50%"  stopColor="#fde047" />
                  <stop offset="100%" stopColor="#fefce8" />
                </linearGradient>
                <linearGradient id="flameHot" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%"   stopColor="#60a5fa" stopOpacity="0.7" />
                  <stop offset="40%"  stopColor="#fef9c3" />
                  <stop offset="100%" stopColor="#ffffff" />
                </linearGradient>
              </defs>
              {/* soft halo / glow behind the flame */}
              <circle cx="16" cy="22" r="13" fill="url(#flameHalo)" />
              {/* outer flame body — deep red base, fading to orange tip */}
              <path
                d="M16 2.6
                   C 14.6 6.2, 12.4 8.4, 11.6 11.0
                   C 10.6 14.2, 11.8 16.0, 10.6 18.4
                   C 9.4 20.8, 7.6 22.2, 7.6 25.0
                   C 7.6 28.6, 11.2 30.6, 16 30.6
                   C 20.8 30.6, 24.4 28.6, 24.4 25.0
                   C 24.4 22.2, 22.8 20.8, 21.6 18.6
                   C 20.4 16.4, 21.4 14.4, 20.4 11.4
                   C 19.6 8.8, 17.4 6.4, 16 2.6 Z"
                fill="url(#flameOuter)"
              />
              {/* mid flame — orange to yellow, slightly smaller */}
              <path
                d="M16 7.2
                   C 15.0 9.6, 13.4 11.2, 13.0 13.4
                   C 12.6 15.6, 13.6 17.0, 13.0 19.0
                   C 12.4 21.0, 11.0 22.0, 11.0 24.4
                   C 11.0 26.8, 13.4 28.0, 16 28.0
                   C 18.6 28.0, 21.0 26.8, 21.0 24.4
                   C 21.0 22.0, 19.6 21.0, 19.0 19.0
                   C 18.4 17.0, 19.4 15.6, 19.0 13.4
                   C 18.6 11.2, 17.0 9.6, 16 7.2 Z"
                fill="url(#flameMid)"
              />
              {/* inner core — bright yellow/white hot spot */}
              <path
                d="M16 12.4
                   C 15.4 14.0, 14.4 15.0, 14.2 16.6
                   C 14.0 18.0, 14.6 18.8, 14.4 20.2
                   C 14.2 21.6, 13.4 22.2, 13.4 23.8
                   C 13.4 25.2, 14.6 26.0, 16 26.0
                   C 17.4 26.0, 18.6 25.2, 18.6 23.8
                   C 18.6 22.2, 17.8 21.6, 17.6 20.2
                   C 17.4 18.8, 18.0 18.0, 17.8 16.6
                   C 17.6 15.0, 16.6 14.0, 16 12.4 Z"
                fill="url(#flameCore)"
              />
              {/* hottest spot — tiny blue-white base where flame meets air (visible in real fire) */}
              <ellipse cx="16" cy="24.6" rx="1.6" ry="2.0" fill="url(#flameHot)" opacity="0.85" />
            </svg>
            {student.currentStreak ?? 0} <small>· best {student.longestStreak ?? 0}</small>
          </strong>
          <div className="streak-dots" aria-label="Session-by-session qualification history (oldest to newest)">
            {(student.streakTimeline || []).map((dot, idx) => (
              <span key={idx} className={`streak-dot dot-${dot}`} title={dot === 'qualified' ? 'Qualified' : 'Missed'} />
            ))}
          </div>
          <em>{student.streakFreezesAvailable ?? 0} streak freeze{student.streakFreezesAvailable === 1 ? '' : 's'} available</em>
        </div>
        <div className={`level-tile band band-${pb.toLowerCase().replace(/ /g, "-")}`}>
          <span className="tile-label">Progress Band</span>
          <strong><BandIcon band={pb} /> {pb}</strong>
          <em>{pr}% qualified · {pt === 'up' ? 'trending up' : pt === 'down' ? 'trending down' : 'steady'} (last 5 sessions)</em>
        </div>
      </div>
      <p className="level-note">
        Level shows your highest achievement and never decreases. Trophy League shows your current performance and can move up or down with your current Spurti Points.
        {student.legendBadgeUnlocked ? ' You have unlocked the Legend Badge by reaching 1500 Spurti Points at least once.' : ''}
      </p>
    </section>
  );
}

function LeaderboardTabs({ overall = [], group = [], groupLabel }) {
  const [type, setType] = useState('overall');
  const rows = type === 'overall' ? overall : group;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <select value={type} onChange={e => setType(e.target.value)}>
          <option value="overall">Overall Leaderboard</option>
          <option value="my_onboarding_group">My Onboarding Group</option>
        </select>
      </div>
      {type === 'my_onboarding_group' && groupLabel &&
        <p className="muted">Showing students onboarded in your group: {groupLabel}</p>}
      <table className="table">
        <thead><tr><th>Rank</th><th>Name</th><th>Email</th><th>Level</th><th>SP</th></tr></thead>
        <tbody>{rows.map(row => (
          <tr key={`${row.rank}-${row.maskedEmail}`} className={row.isCurrentStudent ? 'current-student' : ''}>
            <td>{row.rank}</td><td>{row.name}</td><td>{row.maskedEmail}</td><td>{row.level}</td><td>{row.totalSp}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function StudentPulse({ profile, badges, nextActions }) {
  const { student, cohort, attendance, polls, transactions } = profile;
  const qualified = attendance.filter(a => a.qualified).length;
  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));
  return (
    <section className="pulse-grid">
      <div className="pulse-card progress-card">
        <span>Standing</span>
        <strong>Rank {student.rank}</strong>
        <p>{cohort.pointsToTop50 === 0 ? 'You are in the Top 50.' : `${cohort.pointsToTop50} SP needed to enter Top 50.`}</p>
        <p>{cohort.pointsToNextRank === 0 ? 'You are leading your comparison group.' : `${cohort.pointsToNextRank} SP needed for next rank.`}</p>
      </div>
      <div className="pulse-card">
        <span>Cohort comparison</span>
        <div className="compare-list">
          <b>Your SP: {student.totalSp}</b>
          <b>Cohort avg: {cohort.averageSp}</b>
          <b>Top 50 cutoff: {cohort.top50Cutoff ?? '-'}</b>
          <b>Top 10 cutoff: {cohort.top10Cutoff ?? '-'}</b>
        </div>
      </div>
      <div className="pulse-card">
        <span>Session health</span>
        <div className="compare-list">
          <b>{qualified}/{attendance.length} attendance qualified</b>
          <b>{pollAttempted}/{pollTotal} polls attempted</b>
        </div>
      </div>
      <div className="pulse-card">
        <span>Badges</span>
        <div className="badge-row">{badges.map(badge => <em key={badge}>{badge}</em>)}</div>
      </div>
      <div className="pulse-card wide-pulse">
        <span>SP trend</span>
        <Sparkline points={trend} />
      </div>
      <div className="pulse-card wide-pulse">
        <span>What to do next</span>
        <ul className="next-list">{nextActions.map(action => <li key={action}>{action}</li>)}</ul>
      </div>
    </section>
  );
}

function Sparkline({ points }) {
  const values = points.map(p => p.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  return (
    <div className="sparkline">
      {points.map((point, index) => {
        const pct = max === min ? 50 : ((point.value - min) / (max - min)) * 100;
        return <i key={`${point.label}-${index}`} title={`${point.label}: ${point.value} SP`} style={{ height: `${Math.max(6, pct)}%` }} />;
      })}
    </div>
  );
}

function buildBadges(profile) {
  const badges = [];
  const qualifiedPct = profile.attendance.length ? profile.attendance.filter(a => a.qualified).length / profile.attendance.length : 0;
  const pollAttempted = profile.polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = profile.polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  if (profile.student.rank <= 50) badges.push('Top 50');
  if (qualifiedPct >= 0.75) badges.push('Consistent Attendee');
  if (pollTotal && pollAttempted / pollTotal >= 0.75) badges.push('Poll Champion');
  if (profile.student.totalSp >= profile.cohort.averageSp) badges.push('Above Average');
  return badges.length ? badges : ['Getting Started'];
}

function buildNextActions(profile) {
  const actions = [];
  if (profile.cohort.pointsToTop50 > 0) actions.push(`Earn ${profile.cohort.pointsToTop50} more SP to enter Top 50.`);
  if (profile.attendance.some(a => !a.qualified)) actions.push('Attend at least 75% of upcoming sessions to avoid attendance debit.');
  if (profile.polls.some(p => p.missedQuestions > 0)) actions.push('Attempt every poll question to avoid poll debit.');
  actions.push('Check your SP Bank after each session to understand every credit and debit.');
  return actions.slice(0, 4);
}

function Tabs({ tab, setTab, tabs }) {
  return <nav className="tabs">{tabs.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav>;
}

function SpBank({ transactions }) {
  return (
    <section className="panel">
      <h2>SP Bank Statement</h2>
      <div className="bank">
        <div className="bank-header"><span>Date & time</span><span>Credit</span><span>Debit</span><span>Balance</span><span>Reason</span></div>
        {transactions.map(tx => (
          <div className="bank-row" key={tx._id}>
            <span>{new Date(tx.dateTime).toLocaleString()}</span>
            <strong className="credit">{tx.appliedDelta > 0 ? `+${tx.appliedDelta}` : ''}</strong>
            <strong className="debit">{tx.appliedDelta < 0 ? tx.appliedDelta : ''}</strong>
            <b>{tx.balanceAfter}</b>
            <p>{tx.reason}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const POLL_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const POLL_TOD = { morning: 0, afternoon: 1, evening: 2 };

// Session labels come in two formats — "15 May Morning" and "Day 10 (26 May)".
// Parse the real session date (+ time-of-day) into a comparable number so we can
// sort chronologically; unknown labels sort last. Higher = more recent.
function pollSortKey(label = '') {
  let day, mon;
  const paren = label.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) { day = +paren[1]; mon = paren[2]; }
  else {
    const lead = label.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (lead) { day = +lead[1]; mon = lead[2]; }
  }
  const m = mon ? POLL_MONTHS[mon.slice(0, 3).toLowerCase()] : undefined;
  if (m === undefined || !day) return -1;
  const todMatch = label.toLowerCase().match(/morning|afternoon|evening/);
  const tod = todMatch ? POLL_TOD[todMatch[0]] : 0;
  return ((m * 100 + day) * 10) + tod;
}

function Polls({ polls }) {
  if (!polls.length) return <section className="panel empty">No poll records found.</section>;
  const sorted = [...polls].sort((a, b) => pollSortKey(b.sessionLabel) - pollSortKey(a.sessionLabel));
  return (
    <section className="panel">
      <h2>Polls</h2>
      <div className="cards">
        {sorted.map(poll => (
          <article className="card" key={poll._id}>
            <div className="card-head static">
              <strong>{poll.sessionLabel}</strong>
              <span>{poll.attemptedQuestions}/{poll.totalQuestions} attempted</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Leaderboard({ rows }) {
  return (
    <section className="panel">
      <h2>Top 50 Leaderboard</h2>
      <table className="table">
        <thead><tr><th>Rank</th><th>Name</th><th>Email</th><th>SP</th></tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.rank}-${row.maskedEmail}`} className={row.isCurrentStudent ? 'current-student' : ''}><td>{row.rank}</td><td>{row.name}</td><td>{row.maskedEmail}</td><td>{row.totalSp}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function AdminView({ admin, auth, onBack }) {
  const [tab, setTab] = useState('leaderboard');
  const [leaderLimit, setLeaderLimit] = useState(50);
  const [leaderboard, setLeaderboard] = useState([]);
  const [attendance, setAttendance] = useState(null);
  const [active, setActive] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [stats, setStats] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);

  const headers = adminHeaders(auth);

  // Track admin page views in sessionevents for historical analytics
  useEffect(() => {
    if (!auth?.email) return;
    const doPing = (page) => fetch(`${API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: auth.email, name: auth.email, page })
    }).catch(() => {});
    doPing('admin-analytics');
    const id = setInterval(() => doPing('admin-live'), 30000);
    return () => clearInterval(id);
  }, [admin]);
  const loadLeaderboard = async (limit = leaderLimit) => {
    const res = await fetch(`${API}/admin/leaderboard?limit=${limit}`, { headers });
    setLeaderboard(await res.json());
  };
  const loadAttendance = async () => {
    const res = await fetch(`${API}/admin/attendance`, { headers });
    setAttendance(await res.json());
  };
  const loadStudent = async (id) => {
    const res = await fetch(`${API}/admin/student/${id}`, { headers });
    setStudentProfile(await res.json());
  };
  const loadActive = async () => {
    const res = await fetch(`${API}/admin/active`, { headers });
    setActive(await res.json());
  };
  const loadAnalytics = async () => {
    const res = await fetch(`${API}/admin/analytics`, { headers });
    setAnalytics(await res.json());
  };

  useEffect(() => { loadLeaderboard(50); fetchStats(); }, []);
  const fetchStats = async () => {
    const r = await fetch(`${API}/admin/stats`, headers);
    if (r.ok) setStats(await r.json());
  };
  useEffect(() => {
    if (tab === 'attendance' && !attendance) loadAttendance();
    if (tab === 'live') {
      loadActive();
      loadAnalytics();
      const id = setInterval(loadActive, 10000);
      return () => clearInterval(id);
    }
    if (tab === 'analytics' && !analytics) loadAnalytics();
  }, [tab]);

  return (
    <main className="page compact">
      <header className="topbar">
        <button className="secondary" onClick={onBack}>Back</button>
        <div><p className="eyebrow">Admin Dashboard</p><h1>Spurti Control Room</h1></div>
        <div className="score-card"><span>Yet to onboard</span><strong>{stats?.yetToOnboard ?? admin.yetToOnboard ?? 0}</strong><span className="divider">|</span><span>Active</span><strong>{stats?.activeStudents ?? admin.activeStudents ?? admin.students ?? 0}</strong><span className="divider">|</span><span>Excused</span><strong>{stats?.excusedStudents ?? admin.excusedStudents ?? 0}</strong><em>{stats?.transactions ?? admin.transactions ?? 0} txns</em></div>
      </header>
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['students','Students']]} />
      {tab === 'leaderboard' && (
        <section className="panel">
          <div className="panel-head">
            <h2>Leaderboard</h2>
            <div className="limit-row">
              <input type="number" min="1" max="500" value={leaderLimit} onChange={e => setLeaderLimit(e.target.value)} />
              <button className="secondary" onClick={() => loadLeaderboard(Number(leaderLimit) || 50)}>Apply</button>
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Rank</th><th>Name</th><th>Email</th><th>SP</th></tr></thead>
            <tbody>{leaderboard.map(row => <tr key={row._id} onClick={() => loadStudent(row._id)}><td>{row.rank}</td><td>{row.name}</td><td>{row.email}</td><td>{row.totalSp}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      {tab === 'attendance' && <AdminAttendance data={attendance} onStudent={loadStudent} />}
      {tab === 'live' && <LiveAnalytics active={active} />}
      {tab === 'analytics' && <Analytics data={analytics} />}
      {tab === 'students' && <AllStudentsPanel stats={stats} onStudent={loadStudent} auth={auth} />}
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" onClick={() => setStudentProfile(null)}>x</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
    </main>
  );
}

function AdminAttendance({ data, onStudent }) {
  if (!data) return <section className="panel empty">Loading attendance...</section>;
  return (
    <section className="panel">
      <h2>Attendance Matrix</h2>
      <div className="matrix-wrap">
        <table className="table matrix">
          <thead><tr><th>Student</th><th>SP</th>{data.sessions.map(s => <th key={s.label}>{s.label}</th>)}</tr></thead>
          <tbody>{data.students.map(student => (
            <tr key={student._id} onClick={() => onStudent(student._id)}>
              <td>{student.name}</td><td>{student.totalSp}</td>
              {data.sessions.map(session => {
                const cell = student.cells[session.label];
                return <td key={session.label} className={cell?.qualified ? 'ok-cell' : 'bad-cell'}>{cell ? `${cell.minutes}/${cell.totalMinutes}` : '0'}</td>;
              })}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function LiveAnalytics({ active }) {
  return (
    <section className="panel">
      <h2>Live Analytics</h2>
      <div className="live-summary"><strong>{active.length}</strong><span>active viewers in the last 60 seconds</span></div>
      <div className="cards">
        {active.map(viewer => <article className="card" key={viewer.email}><strong>{viewer.name}</strong><span>{viewer.email}</span><p>{viewer.page} - {viewer.secondsAgo}s ago</p></article>)}
      </div>
    </section>
  );
}

function Analytics({ data }) {
  if (!data) return <section className="panel empty">Loading analytics...</section>;
  const maxHourly = Math.max(1, ...data.users.hourly.map(r => r.uniqueUsers));
  const maxWeekly = Math.max(1, ...data.users.weekly.map(r => r.uniqueUsers));
  return (
    <section className="panel analytics">
      <h2>Analytics</h2>
      <div className="metric-grid">
        <Metric label="Active now" value={data.live.activeNow} />
        <Metric label="Unique last hour" value={data.users.activeLastHour} />
        <Metric label="Unique today" value={data.users.activeToday} />
        <Metric label="Unique 7 days" value={data.users.activeLast7Days} />
        <Metric label="Unique 30 days" value={data.users.activeLast30Days} />
        <Metric label="Attendance qualified" value={`${data.attendance.overallQualifiedPct}%`} />
      </div>

      <section className="subpanel alert-panel">
        <h3>Admin alerts</h3>
        <div className="metric-grid small">
          <Metric label="Below 100 SP" value={data.alerts.lowSp} />
          <Metric label="Inactive today" value={data.alerts.inactiveToday} />
          <Metric label="Attendance debits" value={data.alerts.attendanceDebits} />
          <Metric label="Poll debits" value={data.alerts.pollDebits} />
        </div>
        <table className="table">
          <thead><tr><th>Email</th><th>Debit count</th><th>Debit SP</th></tr></thead>
          <tbody>{data.alerts.topDrops.map(row => <tr key={row.email}><td>{row.email}</td><td>{row.debitCount}</td><td>{row.debitSp}</td></tr>)}</tbody>
        </table>
      </section>

      <div className="analytics-grid">
        <Chart title="Hourly active users" rows={data.users.hourly} max={maxHourly} />
        <Chart title="Weekly active users" rows={data.users.weekly} max={maxWeekly} />
      </div>

      <div className="analytics-grid">
        <section className="subpanel">
          <h3>SP Points</h3>
          <div className="metric-grid small">
            <Metric label="Average" value={data.sp.average} />
            <Metric label="Median" value={data.sp.median} />
            <Metric label="Min" value={data.sp.min} />
            <Metric label="Max" value={data.sp.max} />
          </div>
          <table className="table">
            <thead><tr><th>Band</th><th>Students</th></tr></thead>
            <tbody>
              <tr><td>Below 100</td><td>{data.sp.bands.below100}</td></tr>
              <tr><td>100-149</td><td>{data.sp.bands.from100to149}</td></tr>
              <tr><td>150-199</td><td>{data.sp.bands.from150to199}</td></tr>
              <tr><td>200+</td><td>{data.sp.bands.from200plus}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="subpanel">
          <h3>SP by category</h3>
          <table className="table">
            <thead><tr><th>Category</th><th>Count</th><th>Net SP</th><th>Credits</th><th>Debits</th></tr></thead>
            <tbody>{data.sp.categoryTotals.map(row => (
              <tr key={row.category}><td>{row.category}</td><td>{row.count}</td><td>{row.netSp}</td><td>{row.credits}</td><td>{row.debits}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>

      <section className="subpanel">
        <h3>Attendance by session</h3>
        <table className="table">
          <thead><tr><th>Session</th><th>Qualified</th><th>Not qualified</th><th>Qualified %</th><th>Avg min</th><th>Session min</th></tr></thead>
          <tbody>{data.attendance.sessions.map(row => (
            <tr key={row.label}><td>{row.label}</td><td>{row.qualified}</td><td>{row.notQualified}</td><td>{row.qualifiedPct}%</td><td>{row.avgMinutes}</td><td>{row.sessionMinutes}</td></tr>
          ))}</tbody>
        </table>
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong></div>;
}

function Chart({ title, rows, max }) {
  return (
    <section className="subpanel">
      <h3>{title}</h3>
      <div className="bars">
        {rows.length ? rows.map(row => (
          <div className="bar-row" key={row.label}>
            <span>{row.label}</span>
            <div><i style={{ width: `${Math.max(4, Math.round((row.uniqueUsers / max) * 100))}%` }} /></div>
            <b>{row.uniqueUsers}</b>
          </div>
        )) : <p className="muted">No activity yet.</p>}
      </div>
    </section>
  );
}



function AllStudentsPanel({ stats, onStudent, auth }) {
  const [activeTab, setActiveTab] = useState('yetToOnboard');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const headers = adminHeaders(auth);

  const loadList = async (status) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/students-by-status?status=${status}&limit=200`, headers);
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadList(activeTab); }, [activeTab]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>All Students</h2>
      </div>
      <div className="tab-bar">
        <button className={activeTab === 'yetToOnboard' ? 'active' : ''} onClick={() => { setActiveTab('yetToOnboard'); }}>Yet to Onboard ({stats?.yetToOnboard ?? 0})</button>
        <button className={activeTab === 'active' ? 'active' : ''} onClick={() => { setActiveTab('active'); }}>Active ({stats?.activeStudents ?? 0})</button>
        <button className={activeTab === 'excused' ? 'active' : ''} onClick={() => { setActiveTab('excused'); }}>Excused ({stats?.excusedStudents ?? 0})</button>
      </div>
      {loading ? <p>Loading...</p> : list.length === 0 ? <p className="empty">No students in this category.</p> : (
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>SP</th><th>Start Date</th></tr></thead>
          <tbody>{list.map(s => <tr key={s._id} onClick={() => onStudent(s._id)} style={{cursor:'pointer'}}><td>{s.name}</td><td>{s.email}</td><td>{s.totalSp}</td><td>{s.internshipStartDate ? new Date(s.internshipStartDate).toLocaleDateString() : '—'}</td></tr>)}</tbody>
        </table>
      )}
    </section>
  );
}


function SurveyModal({ survey, student, onDone, statusPath = '/survey/status', completedKey = 'surveyCompleted' }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const done = useRef(false);

  const enabled = survey?.enabled && survey.formUrl && student && !student[completedKey];

  // Verify against the server. The completion flag is set ONLY by a real Google
  // submission (Apps Script webhook) or the server-side sheet sync — never by the
  // client — so clicking "I've submitted" cannot dismiss the modal without a
  // genuine response on record. showNote=true surfaces feedback for the button.
  async function verifyStatus(showNote) {
    if (done.current) return;
    if (showNote) { setChecking(true); setNote(''); }
    try {
      const r = await fetch(`${API}${statusPath}`);
      if (r.ok && (await r.json()).completed) { done.current = true; onDone(); return; }
      if (showNote) setNote("We haven't received your response yet. Please make sure you pressed Submit in the form above — this window closes on its own once your response is recorded (it can take a few seconds).");
    } catch {
      if (showNote) setNote('Network error — please try again in a moment.');
    } finally {
      if (showNote) setChecking(false);
    }
  }

  // Poll for completion: the webhook (instant) or sheet sync sets the flag
  // server-side; this notices and closes the modal without a page reload.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => verifyStatus(false), 5000);
    return () => clearInterval(id);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!enabled) return null;

  const hard = survey.enforcement !== 'soft';
  const email = student.email || '';
  const sep = survey.formUrl.includes('?') ? '&' : '?';
  let src = `${survey.formUrl}${sep}embedded=true`;
  if (survey.emailEntryId && email) {
    src += `&usp=pp_url&${encodeURIComponent(survey.emailEntryId)}=${encodeURIComponent(email)}`;
  }

  // After a real submit Google reloads the iframe to its confirmation page; treat
  // that as a hint to re-check the server (the webhook is the source of truth).
  function handleIframeLoad() { verifyStatus(false); }

  return (
    <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <div className="survey-modal">
        <div className="survey-head">
          <h2 id="survey-title">One quick step — your feedback is required</h2>
          <p>
            Please complete and submit this short survey to continue to your Spurti
            dashboard. Just answer the questions and press <strong>Submit</strong>.
            This window closes on its own once we receive your response (it can take
            a few minutes). <strong>If you skip it, it will reappear.</strong>
          </p>
        </div>
        <iframe title="Spurti feedback survey" src={src} className="survey-frame" onLoad={handleIframeLoad} />
        <div className="survey-actions">
          {!hard && <button type="button" className="survey-ghost" onClick={onDone}>Maybe later</button>}
          <button type="button" className="survey-primary" disabled={checking} onClick={() => verifyStatus(true)}>
            {checking ? 'Checking…' : "I've submitted — continue"}
          </button>
        </div>
        {note && <p className="survey-note">{note}</p>}
      </div>
    </div>
  );
}


createRoot(document.getElementById('root')).render(<App />);
