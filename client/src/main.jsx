import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
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
          const meRes = await fetch(`${API}/me`);
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
    return <StudentView profile={profile} onBack={config.allowStudentSearch ? () => setView('landing') : null} />;
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
            <Info title="What is it?" text="A motivation signal that reflects attendance, poll participation, and useful chat engagement." />
            <Info title="How to get points" text="Attend eligible sessions, answer polls, and contribute positive or useful messages in the meeting chat." />
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
        <div className="score-card"><span>SP</span><strong>{student.totalSp}</strong><em>Rank {student.rank} of {student.cohortSize}</em></div>
      </header>
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['chats','Chats'], ['polls','Polls'], ['leaderboard','Top 50'], ['event','🏛️ Event'], ['marketplace','🛍️ Marketplace']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'chats' && <Chats chats={profile.chats} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <Leaderboard rows={profile.leaderboard} />}
      {tab === 'event' && <InvestmentEventTab email={profile.student.email} profile={profile} />}
      {tab === 'marketplace' && <MarketplaceTab email={profile.student.email} currentSp={student.totalSp} />}
    </main>
  );
}

function StudentPulse({ profile, badges, nextActions }) {
  const { student, cohort, attendance, polls, chats, transactions } = profile;
  const qualified = attendance.filter(a => a.qualified).length;
  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const positiveChats = chats.filter(c => c.overallSentiment === 'positive').length;
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));
  const [activePet, setActivePet] = useState(null);

  useEffect(() => {
    fetch(`${API}/marketplace/my-pets`)
      .then(r => r.ok ? r.json() : [])
      .then(pets => { if (pets.length) setActivePet(pets[pets.length - 1]); })
      .catch(() => {});
  }, []);

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
          <b>{positiveChats}/{chats.length} positive chat sessions</b>
        </div>
      </div>
      <div className="pulse-card">
        <span>Badges</span>
        <div className="badge-row">{badges.map(badge => <em key={badge}>{badge}</em>)}</div>
      </div>
      {activePet ? (
        <div className="pulse-card pet-companion-card">
          <span>Companion</span>
          <div className="pet-companion">
            <span className="pet-companion-emoji">{activePet.petEmoji}</span>
            <div>
              <strong>{activePet.petName}</strong>
              <p className="pet-companion-sub">Your loyal study buddy 🐾</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="pulse-card pet-companion-card pet-companion-empty">
          <span>Companion</span>
          <p className="muted" style={{fontSize:'13px', marginBottom:0}}>No pet yet — visit the 🛍️ Marketplace tab to adopt one!</p>
        </div>
      )}
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
  const positiveChats = profile.chats.filter(c => c.overallSentiment === 'positive').length;
  if (profile.student.rank <= 50) badges.push('Top 50');
  if (qualifiedPct >= 0.75) badges.push('Consistent Attendee');
  if (pollTotal && pollAttempted / pollTotal >= 0.75) badges.push('Poll Champion');
  if (positiveChats >= 3) badges.push('Positive Contributor');
  if (profile.student.totalSp >= profile.cohort.averageSp) badges.push('Above Average');
  return badges.length ? badges : ['Getting Started'];
}

function buildNextActions(profile) {
  const actions = [];
  if (profile.cohort.pointsToTop50 > 0) actions.push(`Earn ${profile.cohort.pointsToTop50} more SP to enter Top 50.`);
  if (profile.attendance.some(a => !a.qualified)) actions.push('Attend at least 75% of upcoming sessions to avoid attendance debit.');
  if (profile.polls.some(p => p.missedQuestions > 0)) actions.push('Attempt every poll question to avoid poll debit.');
  if (!profile.chats.length) actions.push('Add useful meeting chat contributions to create a positive chat record.');
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

function Chats({ chats }) {
  const [open, setOpen] = useState('');
  if (!chats.length) return <section className="panel empty">No chat records found.</section>;
  return (
    <section className="panel">
      <h2>Chats</h2>
      <div className="cards">
        {chats.map(chat => (
          <article className="card" key={chat._id}>
            <button className="card-head" onClick={() => setOpen(open === chat.sessionLabel ? '' : chat.sessionLabel)}>
              <strong>{chat.sessionLabel}</strong>
              <span className={chat.overallSentiment}>{chat.overallSentiment}</span>
            </button>
            {open === chat.sessionLabel && (
              <div className="message-list">
                {chat.messages.map((msg, i) => (
                  <div className="message" key={i}>
                    <span>{msg.time}</span>
                    <p>{msg.message}</p>
                    <b className={msg.sentiment}>{msg.sentiment === 'positive' ? '+' : msg.sentiment === 'negative' ? '-' : '0'}</b>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function Polls({ polls }) {
  if (!polls.length) return <section className="panel empty">No poll records found.</section>;
  return (
    <section className="panel">
      <h2>Polls</h2>
      <div className="cards">
        {polls.map(poll => (
          <article className="card" key={poll._id}>
            <div className="card-head static">
              <strong>{poll.sessionLabel}</strong>
              <span>{poll.attemptedQuestions}/{poll.totalQuestions} attempted</span>
            </div>
            <div className="poll-responses">
              {poll.responses.map((item, i) => (
                <div key={i} className={item.attempted ? 'attempted' : 'missed'}>
                  <span>{item.pollName}</span>
                  <p>{item.question}</p>
                  <b>{item.response || 'Not attempted'}</b>
                </div>
              ))}
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
  const [spReviews, setSpReviews] = useState([]);
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
  const loadSpReviews = async () => {
    const res = await fetch(`${API}/admin/chat-sp-reviews?status=pending`, { headers });
    setSpReviews(await res.json());
  };
  const reviewAction = async (id, action) => {
    const res = await fetch(`${API}/admin/chat-sp-reviews/${id}/${action}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Review action failed.');
    }
    await loadSpReviews();
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
    if (tab === 'sp-review' && !spReviews.length) loadSpReviews();
  }, [tab]);

  return (
    <main className="page compact">
      <header className="topbar">
        <button className="secondary" onClick={onBack}>Back</button>
        <div><p className="eyebrow">Admin Dashboard</p><h1>Spurti Control Room</h1></div>
        <div className="score-card"><span>Yet to onboard</span><strong>{stats?.yetToOnboard ?? admin.yetToOnboard ?? 0}</strong><span className="divider">|</span><span>Active</span><strong>{stats?.activeStudents ?? admin.activeStudents ?? admin.students ?? 0}</strong><span className="divider">|</span><span>Excused</span><strong>{stats?.excusedStudents ?? admin.excusedStudents ?? 0}</strong><em>{stats?.transactions ?? admin.transactions ?? 0} txns</em></div>
      </header>
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['sp-review','SP Review'], ['live','Live'], ['analytics','Analytics'], ['students','Students'], ['investment','🏛️ Investment']]} />
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
      {tab === 'sp-review' && <ChatSPReviewTable reviews={spReviews} onAction={reviewAction} onRefresh={loadSpReviews} />}
      {tab === 'live' && <LiveAnalytics active={active} />}
      {tab === 'analytics' && <Analytics data={analytics} />}
      {tab === 'students' && <AllStudentsPanel stats={stats} onStudent={loadStudent} auth={auth} />}
      {tab === 'investment' && <InvestmentAdminPanel headers={headers} />}
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" onClick={() => setStudentProfile(null)}>x</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
    </main>
  );
}

function ChatSPReviewTable({ reviews, onAction, onRefresh }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Chat SP Review</h2>
        <button className="secondary" onClick={onRefresh}>Refresh</button>
      </div>
      {!reviews.length ? <p className="empty">No pending chat SP reviews.</p> : (
        <div className="matrix-wrap">
          <table className="table review-table">
            <thead><tr><th>Time</th><th>Student</th><th>SP</th><th>Issued by</th><th>Reason</th><th>Confidence</th><th>Action</th></tr></thead>
            <tbody>{reviews.map(review => (
              <tr key={review._id}>
                <td>{new Date(review.dateTime).toLocaleString()}</td>
                <td><strong>{review.studentName || 'Unmatched'}</strong><span>{review.studentEmail || 'No email match'}</span></td>
                <td className={review.delta > 0 ? 'credit' : 'debit'}>{review.displayDelta || (review.delta > 0 ? `+${review.delta}` : review.delta)}</td>
                <td>{review.issuedByName}</td>
                <td><p>{review.reason}</p><em>{review.evidenceText}</em></td>
                <td>{review.confidence}</td>
                <td>
                  <div className="review-actions">
                    <button className="primary" disabled={!review.studentEmail} onClick={() => onAction(review._id, 'accept')}>Accept</button>
                    <button className="secondary" onClick={() => onAction(review._id, 'reject')}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
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

// ═══════════════════════════════════════════
// INVESTMENT EVENT — STUDENT VIEW
// ═══════════════════════════════════════════

function InvestmentEventTab({ email, profile }) {
  const [eventData, setEventData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [myTeam, setMyTeam] = useState(null);
  const [isLeader, setIsLeader] = useState(false);
  const [wallet, setWallet] = useState(null);
  const [investments, setInvestments] = useState([]);
  const [subTab, setSubTab] = useState('market');
  const [investModal, setInvestModal] = useState(null); // project being invested in
  const [investAmount, setInvestAmount] = useState('');
  const [investComment, setInvestComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState('');

  useEffect(() => {
    loadEvent();
  }, []);

  const loadEvent = async () => {
    setLoading(true);
    try {
      const [evRes, teamRes] = await Promise.all([
        fetch(`${API}/investment-event/market`),
        fetch(`${API}/investment-event/my-team`, { headers: { 'x-student-email': email } })
      ]);
      const ev = await evRes.json();
      const team = await teamRes.json();
      setEventData(ev);
      setMyTeam(team.team);
      setIsLeader(team.isLeader);
      if (ev.projects && team.team) {
        const wRes = await fetch(`${API}/investment-event/wallet`, { headers: { 'x-student-email': email } });
        const invRes = await fetch(`${API}/investment-event/my-investments`, { headers: { 'x-student-email': email } });
        const w = await wRes.json();
        const inv = await invRes.json();
        setWallet(w.wallet);
        setInvestments(inv.investments || []);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  if (loading) return <section className="panel"><p>Loading event...</p></section>;
  if (error) return <section className="panel"><p className="error">{error}</p></section>;
  if (!eventData?.event) return <section className="panel"><p>No active investment event.</p></section>;

  const { event, projects } = eventData;

  const handleInvest = async () => {
    if (!investAmount || !investComment.trim()) return;
    setSubmitting(true);
    setSubmitMsg('');
    try {
      const res = await fetch(`${API}/investment-event/invest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-student-email': email },
        body: JSON.stringify({
          projectId: investModal._id,
          amount: Number(investAmount),
          comment: investComment.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) { setSubmitMsg(data.error || 'Investment failed'); setSubmitting(false); return; }
      setSubmitMsg('✅ Investment submitted!');
      setWallet(data.wallet);
      setInvestments(prev => [data.investment, ...prev]);
      setTimeout(() => { setInvestModal(null); setInvestAmount(''); setInvestComment(''); setSubmitMsg(''); setSubmitting(false); }, 1500);
      // Refresh market data
      const evRes = await fetch(`${API}/investment-event/market`);
      const ev = await evRes.json();
      setEventData(ev);
    } catch (e) {
      setSubmitMsg('Error: ' + e.message);
      setSubmitting(false);
    }
  };

  const myTeamProjectIds = projects.filter(p => p.teamId === myTeam?._id).map(p => p._id);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>🏛️ {event.name}</h2>
        {wallet && (
          <div className="score-card small">
            <span>💰 Wallet</span>
            <strong>{wallet.availableVC} VC</strong>
            <em>Invested: {wallet.investedVC} VC</em>
          </div>
        )}
      </div>

      {!isLeader && <p className="muted" style={{marginBottom: '1rem'}}>Only team leaders can invest. Browse the market below.</p>}

      <div className="tab-bar" style={{marginBottom: '1rem'}}>
        <button className={subTab === 'market' ? 'active' : ''} onClick={() => setSubTab('market')}>📈 Market</button>
        <button className={subTab === 'mine' ? 'active' : ''} onClick={() => setSubTab('mine')}>📋 My Investments</button>
        <button className={subTab === 'rules' ? 'active' : ''} onClick={() => setSubTab('rules')}>ℹ️ Rules</button>
      </div>

      {subTab === 'market' && (
        <div className="cards">
          {projects.length === 0 && <p className="empty">No projects registered yet.</p>}
          {projects.map(p => {
            const isOwn = myTeamProjectIds.includes(p._id);
            return (
              <article className="card" key={p._id}>
                <div className="card-head static">
                  <div>
                    <strong>{p.teamName}</strong>
                    <p style={{margin:0, color:'#666'}}>{p.projectName}</p>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <span style={{color: p.totalInvestmentReceived > 0 ? '#22c55e' : '#999', fontWeight:700}}>💰 {p.totalInvestmentReceived.toLocaleString()} VC</span>
                    <p style={{margin:0, color:'#888'}}>{p.investorCount} investor{p.investorCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div style={{padding: '0.75rem', display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
                  {isOwn
                    ? <span className="muted" style={{padding:'0.4rem 0.8rem'}}>Your Team</span>
                    : isLeader
                      ? <button className="primary small" onClick={() => { setInvestModal(p); setInvestAmount(''); setInvestComment(''); setSubmitMsg(''); }}>💎 Invest</button>
                      : <span className="muted" style={{padding:'0.4rem 0.8rem'}}>Leader access needed</span>
                  }
                </div>
              </article>
            );
          })}
        </div>
      )}

      {subTab === 'mine' && (
        <div>
          {investments.length === 0 ? <p className="empty">No investments made yet.</p> : (
            <table className="table">
              <thead><tr><th>Team</th><th>Project</th><th>Amount</th><th>Comment</th><th>Date</th></tr></thead>
              <tbody>
                {investments.map(inv => (
                  <tr key={inv._id}>
                    <td>{inv.targetTeamName}</td>
                    <td>{inv.targetProjectName}</td>
                    <td><strong style={{color:'#22c55e'}}>{inv.amount} VC</strong></td>
                    <td style={{maxWidth: '200px', fontSize:'0.85em'}}>{inv.comment}</td>
                    <td>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {subTab === 'rules' && (
        <div className="panel" style={{background:'#f9f9f9'}}>
          <h3>📋 Investment Rules</h3>
          <ul style={{lineHeight:1.8}}>
            <li>Each team starts with <strong>{event.startingVCPerTeam} VC</strong></li>
            <li>Minimum investment: <strong>{event.minInvestment} VC</strong> per project</li>
            <li>Maximum investment: <strong>{event.maxInvestment} VC</strong> per project</li>
            <li>You can invest in the same project multiple times (amounts add up)</li>
            <li><strong>Cannot invest in your own team's project</strong></li>
            <li>You must leave a comment explaining your investment rationale</li>
            <li>All investments are <strong>public</strong> — the market is transparent</li>
            <li>At the end, rankings are based on total investment received</li>
          </ul>
        </div>
      )}

      {investModal && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setInvestModal(null)}>
          <section className="modal">
            <div className="modal-head">
              <h2>💎 Invest in {investModal.teamName}</h2>
              <button className="icon" onClick={() => setInvestModal(null)}>x</button>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <p><strong>Project:</strong> {investModal.projectName}</p>
              <p><strong>Currently Raised:</strong> 💰 {investModal.totalInvestmentReceived.toLocaleString()} VC from {investModal.investorCount} investor(s)</p>
              {wallet && <p><strong>Your Available:</strong> 💰 {wallet.availableVC} VC</p>}
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{display:'block', marginBottom:'0.5rem', fontWeight:600}}>Amount to Invest (VC)</label>
              <input type="number" min={event.minInvestment} max={event.maxInvestment} value={investAmount} onChange={e => setInvestAmount(e.target.value)} placeholder={`Min ${event.minInvestment} VC`} style={{width:'100%', padding:'0.5rem', fontSize:'1rem'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{display:'block', marginBottom:'0.5rem', fontWeight:600}}>Why are you investing in this project? *</label>
              <textarea value={investComment} onChange={e => setInvestComment(e.target.value)} rows={4} placeholder="What impressed you about this team's project?" style={{width:'100%', padding:'0.5rem', fontSize:'1rem', resize:'vertical'}} />
            </div>
            {submitMsg && <p style={{color: submitMsg.includes('✅') ? '#22c55e' : '#ef4444'}}>{submitMsg}</p>}
            <div style={{display:'flex', gap:'0.5rem', justifyContent:'flex-end'}}>
              <button className="secondary" onClick={() => setInvestModal(null)}>Cancel</button>
              <button className="primary" onClick={handleInvest} disabled={submitting || !investAmount || !investComment.trim()}>
                {submitting ? 'Submitting...' : 'Submit Investment'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════
// INVESTMENT EVENT — ADMIN PANEL
// ═══════════════════════════════════════════

function InvestmentAdminPanel({ headers }) {
  const [subTab, setSubTab] = useState('teams');
  const [teams, setTeams] = useState([]);
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [wallets, setWallets] = useState([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [newTeam, setNewTeam] = useState({ name: '', description: '', members: [] });
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberName, setNewMemberName] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, [subTab]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tRes, eRes] = await Promise.all([
        fetch(`${API}/investment-event/admin/teams`, { headers }),
        fetch(`${API}/investment-event/admin/events`, { headers })
      ]);
      setTeams(await tRes.json());
      const evs = await eRes.json();
      setEvents(evs);
      if (evs.length > 0) {
        const activeEv = evs.find(e => e.isActive);
        if (activeEv) {
          const [projRes, invRes, walRes] = await Promise.all([
            fetch(`${API}/investment-event/admin/investments?eventId=${activeEv._id}`, { headers }),
            fetch(`${API}/investment-event/market`, { headers }),
            fetch(`${API}/investment-event/admin/wallets?eventId=${activeEv._id}`, { headers })
          ]);
          const invData = await invRes.json();
          setProjects(invData.projects || []);
          setInvestments(await invRes.json());
          setWallets(await walRes.json());
        }
      }
    } catch (e) { setMsg('Error: ' + e.message); }
    setLoading(false);
  };

  const createTeam = async () => {
    if (!newTeam.name.trim()) return;
    const res = await fetch(`${API}/investment-event/admin/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(newTeam)
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error); return; }
    setTeams(prev => [...prev, data]);
    setShowAddTeam(false);
    setNewTeam({ name: '', description: '', members: [] });
    setMsg('Team created!');
  };

  const addMemberToNew = () => {
    if (!newMemberEmail.trim() || !newMemberName.trim()) return;
    setNewTeam(prev => ({
      ...prev,
      members: [...prev.members, { email: newMemberEmail.toLowerCase(), name: newMemberName, isLeader: prev.members.length === 0 }]
    }));
    setNewMemberEmail('');
    setNewMemberName('');
  };

  const deleteTeam = async (id) => {
    if (!confirm('Delete this team?')) return;
    await fetch(`${API}/investment-event/admin/teams/${id}`, { method: 'DELETE', headers });
    setTeams(prev => prev.filter(t => t._id !== id));
  };

  const createEvent = async () => {
    const res = await fetch(`${API}/investment-event/admin/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ name: 'Project Investment', startingVCPerTeam: 1000, minInvestment: 100, maxInvestment: 1000 })
    });
    const data = await res.json();
    if (!res.ok) { setMsg(data.error); return; }
    setEvents(prev => [...prev, data]);
    loadAll();
    setMsg('Event created and activated!');
  };

  const toggleEvent = async (ev) => {
    const res = await fetch(`${API}/investment-event/admin/events/${ev._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ isActive: !ev.isActive })
    });
    if (res.ok) loadAll();
  };

  const concludeEvent = async (ev) => {
    if (!confirm('Conclude this event? Trading will close and rankings will be finalized.')) return;
    const res = await fetch(`${API}/investment-event/admin/conclude/${ev._id}`, { method: 'POST', headers });
    if (res.ok) { loadAll(); setMsg('Event concluded! Rankings finalized.'); }
  };

  const activeEvent = events.find(e => e.isActive);

  return (
    <section className="panel">
      <div className="panel-head"><h2>🏛️ Investment Event Control</h2></div>
      <div className="tab-bar" style={{marginBottom:'1rem'}}>
        <button className={subTab === 'teams' ? 'active' : ''} onClick={() => setSubTab('teams')}>👥 Teams</button>
        <button className={subTab === 'events' ? 'active' : ''} onClick={() => setSubTab('events')}>📅 Events</button>
        <button className={subTab === 'projects' ? 'active' : ''} onClick={() => setSubTab('projects')}>💼 Projects</button>
        <button className={subTab === 'market' ? 'active' : ''} onClick={() => setSubTab('market')}>📊 Market</button>
        <button className={subTab === 'rankings' ? 'active' : ''} onClick={() => setSubTab('rankings')}>🏆 Rankings</button>
      </div>

      {msg && <p style={{color: msg.includes('Error') ? '#ef4444' : '#22c55e'}}>{msg}</p>}

      {subTab === 'teams' && (
        <div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
            <p>{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
            <button className="primary small" onClick={() => setShowAddTeam(true)}>+ Add Team</button>
          </div>
          <table className="table">
            <thead><tr><th>Team</th><th>Leader</th><th>Members</th><th>Actions</th></tr></thead>
            <tbody>
              {teams.map(t => {
                const leader = t.members?.find(m => m.isLeader);
                return (
                  <tr key={t._id}>
                    <td><strong>{t.name}</strong></td>
                    <td>{leader?.name || '—'}<br/><span className="muted">{leader?.email}</span></td>
                    <td>{t.members?.length || 0} / 10</td>
                    <td><button className="secondary small" onClick={() => deleteTeam(t._id)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'events' && (
        <div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
            <p>{events.length} event{events.length !== 1 ? 's' : ''}</p>
            <button className="primary small" onClick={createEvent}>+ Create Event</button>
          </div>
          {events.map(ev => (
            <article key={ev._id} className="card" style={{marginBottom:'0.75rem'}}>
              <div className="card-head static">
                <div>
                  <strong>{ev.name}</strong>
                  <p style={{margin:0, color:'#666'}}>{ev.description || 'No description'}</p>
                </div>
                <div style={{textAlign:'right'}}>
                  <span style={{color: ev.isActive ? '#22c55e' : ev.isConcluded ? '#f59e0b' : '#999', fontWeight:700}}>
                    {ev.isConcluded ? '🏁 Concluded' : ev.isActive ? '🟢 Active' : '⚪ Inactive'}
                  </span>
                </div>
              </div>
              <div style={{padding:'0.5rem 0.75rem', fontSize:'0.85em', color:'#666'}}>
                <span>VC/Team: {ev.startingVCPerTeam} | Min: {ev.minInvestment} | Max: {ev.maxInvestment} VC</span>
              </div>
              <div style={{padding:'0.5rem 0.75rem', display:'flex', gap:'0.5rem'}}>
                {!ev.isConcluded && <button className="secondary small" onClick={() => toggleEvent(ev)}>{ev.isActive ? 'Disable' : 'Activate'}</button>}
                {ev.isActive && !ev.isConcluded && <button className="secondary small" onClick={() => concludeEvent(ev)}>🏁 End & Finalize</button>}
              </div>
            </article>
          ))}
        </div>
      )}

      {subTab === 'projects' && (
        <div>
          <p style={{marginBottom:'1rem'}}>Projects are created when teams are registered. Admin project creation coming soon.</p>
          {projects.length > 0 ? (
            <table className="table">
              <thead><tr><th>Team</th><th>Project</th><th>Received</th><th>Investors</th></tr></thead>
              <tbody>
                {projects.map(p => (
                  <tr key={p._id}>
                    <td>{p.teamName}</td>
                    <td>{p.projectName}</td>
                    <td>💰 {p.totalInvestmentReceived.toLocaleString()} VC</td>
                    <td>{p.investorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="empty">No projects yet. Activate an event and add teams.</p>}
        </div>
      )}

      {subTab === 'market' && (
        <div>
          {wallets.length > 0 && (
            <div style={{marginBottom:'1rem'}}>
              <h3 style={{marginBottom:'0.5rem'}}>💰 Team Wallets</h3>
              <table className="table">
                <thead><tr><th>Team</th><th>Total VC</th><th>Invested</th><th>Available</th></tr></thead>
                <tbody>
                  {wallets.map(w => (
                    <tr key={w._id}>
                      <td>{w.teamName}</td>
                      <td>{w.totalVC} VC</td>
                      <td>{w.investedVC} VC</td>
                      <td style={{color: (w.totalVC - w.investedVC) > 0 ? '#22c55e' : '#ef4444', fontWeight:700}}>{w.totalVC - w.investedVC} VC</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h3 style={{marginBottom:'0.5rem'}}>📊 All Investments</h3>
          <p className="muted">Total: {Array.isArray(investments) ? investments.length : 0} investments</p>
        </div>
      )}

      {subTab === 'rankings' && activeEvent?.rankings?.length > 0 && (
        <div>
          <h3 style={{marginBottom:'1rem'}}>🏆 Final Rankings — {activeEvent.name}</h3>
          <table className="table">
            <thead><tr><th>Rank</th><th>Team</th><th>Total Received</th><th>Investors</th></tr></thead>
            <tbody>
              {activeEvent.rankings.map(r => (
                <tr key={r.rank}>
                  <td>{r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}</td>
                  <td><strong>{r.teamName}</strong></td>
                  <td style={{color:'#22c55e', fontWeight:700}}>💰 {r.totalReceived.toLocaleString()} VC</td>
                  <td>{r.investorCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {subTab === 'rankings' && (!activeEvent?.rankings || activeEvent.rankings.length === 0) && (
        <p className="empty">No rankings yet. Conclude the event to generate rankings.</p>
      )}

      {showAddTeam && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowAddTeam(false)}>
          <section className="modal wide">
            <div className="modal-head">
              <h2>➕ Add Team</h2>
              <button className="icon" onClick={() => setShowAddTeam(false)}>x</button>
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{display:'block', marginBottom:'0.25rem', fontWeight:600}}>Team Name *</label>
              <input value={newTeam.name} onChange={e => setNewTeam(p => ({...p, name: e.target.value}))} placeholder="Alpha Squad" style={{width:'100%', padding:'0.5rem'}} />
            </div>
            <div style={{marginBottom:'1rem'}}>
              <label style={{display:'block', marginBottom:'0.25rem', fontWeight:600}}>Description</label>
              <input value={newTeam.description} onChange={e => setNewTeam(p => ({...p, description: e.target.value}))} placeholder="Optional" style={{width:'100%', padding:'0.5rem'}} />
            </div>
            <div style={{marginBottom:'0.5rem'}}>
              <h4>Members ({newTeam.members.length}) — first member becomes leader</h4>
              {newTeam.members.map((m, i) => (
                <div key={i} style={{display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.25rem'}}>
                  <span style={{color: m.isLeader ? '#22c55e' : '#999'}}>{m.isLeader ? '👑' : '👤'}</span>
                  <span><strong>{m.name}</strong> ({m.email})</span>
                  {!m.isLeader && <button className="secondary small" onClick={() => setNewTeam(p => ({...p, members: p.members.map((x, j) => j === i ? {...x, isLeader: true} : {...x, isLeader: false})}))}>Make Leader</button>}
                  <button className="secondary small" onClick={() => setNewTeam(p => ({...p, members: p.members.filter((_, j) => j !== i)}))}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:'0.5rem', marginBottom:'0.5rem'}}>
              <input value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Student Name" style={{flex:1, padding:'0.5rem'}} />
              <input value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="email@example.com" style={{flex:1, padding:'0.5rem'}} />
              <button className="secondary" onClick={addMemberToNew}>Add</button>
            </div>
            <div style={{display:'flex', gap:'0.5rem', justifyContent:'flex-end', marginTop:'1rem'}}>
              <button className="secondary" onClick={() => setShowAddTeam(false)}>Cancel</button>
              <button className="primary" onClick={createTeam} disabled={!newTeam.name.trim()}>Create Team</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════
// SP MARKETPLACE — PET ADOPTION
// ═══════════════════════════════════════════

const PET_CATALOGUE = [
  { id: 'chick',   emoji: '🐣', name: 'Baby Chick', character: 'Pip',     description: 'A tiny, curious chick who peeps with excitement at every new lesson.', personality: 'Curious & Cheerful',      spCost: 75  },
  { id: 'frog',    emoji: '🐸', name: 'Frog',       character: 'Ribbit',  description: 'A chill frog who sits on lily pads and leaps into action when it counts.', personality: 'Cool & Reliable',        spCost: 120 },
  { id: 'panda',   emoji: '🐼', name: 'Panda',      character: 'Bamboo',  description: 'A gentle giant who munches bamboo and quietly masters every subject.', personality: 'Calm & Wise',            spCost: 170 },
  { id: 'fox',     emoji: '🦊', name: 'Fox',        character: 'Ember',   description: 'A sharp-witted fox with a fiery spirit and an eye for clever solutions.', personality: 'Sharp & Witty',          spCost: 220 },
  { id: 'wolf',    emoji: '🐺', name: 'Wolf',       character: 'Storm',   description: 'A lone wolf who howls at milestones and leads the pack in consistency.', personality: 'Bold & Determined',      spCost: 280 },
  { id: 'lion',    emoji: '🦁', name: 'Lion',       character: 'Roar',    description: 'The king of learners — fierce focus, unstoppable momentum.', personality: 'Fierce & Focused',       spCost: 340 },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn',    character: 'Sparkle', description: 'A magical unicorn who sprinkles creativity and wonder on every task.', personality: 'Creative & Magical',     spCost: 420 },
  { id: 'dragon',  emoji: '🐉', name: 'Dragon',     character: 'Blaze',   description: 'The rarest companion — a dragon earned only by the most dedicated learners.', personality: 'Legendary & Unstoppable', spCost: 500 },
];

function MarketplaceTab({ email, currentSp }) {
  const [myPets, setMyPets]     = useState([]);
  const [balance, setBalance]   = useState(currentSp);
  const [loading, setLoading]   = useState(true);
  const [redeeming, setRedeeming] = useState(null); // petId currently being redeemed
  const [toast, setToast]       = useState(null);   // { type: 'success'|'error', message }
  const [showHistory, setShowHistory] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  const loadMyPets = async () => {
    try {
      const res = await fetch(`${API}/marketplace/my-pets`);
      if (res.ok) setMyPets(await res.json());
    } catch { /* silent */ }
  };

  useEffect(() => {
    loadMyPets().finally(() => setLoading(false));
  }, []);

  const adopt = async (pet) => {
    if (redeeming) return;
    setRedeeming(pet.id);
    try {
      const res = await fetch(`${API}/marketplace/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ petId: pet.id }),
      });
      const data = await res.json();
      if (!res.ok) { showToast('error', data.error || 'Redemption failed.'); return; }
      setBalance(data.newBalance);
      await loadMyPets();
      showToast('success', `${pet.emoji} ${pet.name} adopted! −${pet.spCost} SP. New balance: ${data.newBalance} SP.`);
    } catch {
      showToast('error', 'Network error. Please try again.');
    } finally {
      setRedeeming(null);
    }
  };

  const ownedIds = new Set(myPets.map(p => p.petId));
  const activePet = myPets.length ? myPets[myPets.length - 1] : null;

  if (loading) return <section className="panel empty">Loading marketplace...</section>;

  return (
    <section className="panel marketplace-panel">
      {toast && (
        <div className={`mkt-toast mkt-toast-${toast.type}`}>{toast.message}</div>
      )}

      <div className="marketplace-header">
        <div>
          <h2 style={{marginBottom: 4}}>🛍️ Pet Marketplace</h2>
          <p className="muted" style={{margin:0, fontSize:14}}>Spend your Spurti Points to adopt a virtual companion. It will appear on your dashboard!</p>
        </div>
        <div className="mkt-balance-chip">
          <span>Your SP</span>
          <strong>{balance}</strong>
        </div>
      </div>

      {activePet && (
        <div className="mkt-active-pet">
          <span className="mkt-active-label">Active Companion</span>
          <div className="mkt-active-inner">
            <span className="mkt-active-emoji">{activePet.petEmoji}</span>
            <div>
              <strong>{activePet.petName}</strong>
              <p>Adopted on {new Date(activePet.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="pet-grid">
        {PET_CATALOGUE.map(pet => {
          const owned = ownedIds.has(pet.id);
          const canAfford = balance >= pet.spCost;
          const busy = redeeming === pet.id;
          return (
            <article key={pet.id} className={`pet-card${owned ? ' pet-card-owned' : ''}${!canAfford && !owned ? ' pet-card-locked' : ''}`}>
              <div className="pet-emoji-wrap">
                <span className="pet-emoji">{pet.emoji}</span>
                {owned && <span className="pet-owned-badge">✓ Adopted</span>}
              </div>
              <div className="pet-info">
                <strong className="pet-name">{pet.name}</strong>
                <em className="pet-character">{pet.character}</em>
                <p className="pet-desc">{pet.description}</p>
                <span className="pet-personality">{pet.personality}</span>
              </div>
              <div className="pet-footer">
                <span className="pet-cost">{pet.spCost} SP</span>
                {owned ? (
                  <span className="pet-adopted-tag">Adopted ✓</span>
                ) : (
                  <button
                    id={`adopt-${pet.id}`}
                    className="primary pet-adopt-btn"
                    disabled={!canAfford || busy}
                    onClick={() => adopt(pet)}
                  >
                    {busy ? 'Adopting…' : canAfford ? `Adopt for ${pet.spCost} SP` : `Need ${pet.spCost - balance} more SP`}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {myPets.length > 0 && (
        <div className="mkt-history-section">
          <button className="secondary" style={{marginBottom: '12px'}} onClick={() => setShowHistory(h => !h)}>
            {showHistory ? 'Hide' : 'Show'} Adoption History ({myPets.length})
          </button>
          {showHistory && (
            <div className="mkt-history-list">
              {[...myPets].reverse().map(p => (
                <div key={p._id} className="mkt-history-row">
                  <span className="mkt-history-emoji">{p.petEmoji}</span>
                  <div>
                    <strong>{p.petName}</strong>
                    <span>{new Date(p.createdAt).toLocaleString()}</span>
                  </div>
                  <span className="debit">−{p.spCost} SP</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
