import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const DevContext = createContext(null);

export function useDevEmail() {
  return useContext(DevContext);
}

function devHeaders(devEmail) {
  return devEmail ? { 'x-dev-email': devEmail } : {};
}

function App() {
  const [view, setView] = useState(() => new URLSearchParams(window.location.search).get('admin') === '1' ? 'admin-login' : 'landing');
  const [profile, setProfile] = useState(null);
  const [excused, setExcused] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [adminAuth, setAdminAuth] = useState(null);
  const [config, setConfig] = useState({ allowStudentSearch: true });
  const [loading, setLoading] = useState(true);
  const [devEmail, setDevEmail] = useState(() => localStorage.getItem('dev_email') || null);

  const pingHeaders = useMemo(() => ({ ...devHeaders(devEmail), 'Content-Type': 'application/json' }), [devEmail]);

  useEffect(() => {
    if (!profile?.student) return;
    const send = () => fetch(`${API}/ping`, {
      method: 'POST',
      headers: pingHeaders,
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
  }, [profile, pingHeaders]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const configRes = await fetch(`${API}/config`);
        const nextConfig = configRes.ok ? await configRes.json() : { allowStudentSearch: true };
        if (!active) return;
        setConfig(nextConfig);

        if (view !== 'admin-login') {
          const meRes = await fetch(`${API}/me`, { headers: devHeaders(devEmail) });
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
  }, [devEmail]);

  const handleStudentLogin = (data) => {
    if (data?.excused) {
      setExcused(data);
      setProfile(null);
      setView('excused');
      return;
    }
    setProfile(data);
    setExcused(null);
    setView('student');
  };

  if (loading) {
    return <main className="page login-page"><section className="panel auth-card"><p className="eyebrow">Spurti</p><h1>Loading</h1></section></main>;
  }
  if (view === 'student' && profile) {
    return (
      <DevContext.Provider value={devEmail}>
        <StudentView profile={profile} onBack={config.allowStudentSearch ? () => setView('landing') : null} onDevEmailChange={setDevEmail} />
        <SurveyModal
          survey={config.survey}
          student={profile.student}
          onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, surveyCompleted: true } }))}
        />
      </DevContext.Provider>
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
  return <Landing config={config} onStudent={handleStudentLogin} devEmail={devEmail} onDevEmailChange={(email) => { setDevEmail(email); localStorage.setItem('dev_email', email || ''); }} />;
}

function Landing({ config, onStudent, devEmail, onDevEmailChange }) {
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
          <DevLogin devEmail={devEmail} onDevEmailChange={onDevEmailChange} onStudent={onStudent} />
          {config.allowStudentSearch && !devEmail && <button className="primary" onClick={() => setSearchOpen(true)}>Find your Spurti points</button>}
        </div>
      </section>
      {config.allowStudentSearch && searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onStudent={onStudent} />}
    </main>
  );
}

function DevLogin({ devEmail, onDevEmailChange, onStudent }) {
  const [email, setEmail] = useState(devEmail || '');

  const login = async () => {
    if (!email.trim()) return;
    onDevEmailChange(email.trim());
    const res = await fetch(`${API}/me`, { headers: devHeaders(email.trim()) });
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.profile) {
        onStudent(data.profile);
      }
    }
  };

  return (
    <div className="dev-login">
      <p className="eyebrow" style={{ color: '#f59e0b' }}>Dev Mode</p>
      <div className="search-row">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Enter your IIT Ropar email" />
        <button className="secondary" onClick={login}>Login</button>
      </div>
      {devEmail && <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Logged in as {devEmail}</p>}
    </div>
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

function StudentView({ profile, onBack, onDevEmailChange }) {
  const devEmail = useDevEmail();
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
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['marketplace','Marketplace']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'marketplace' && <MarketplaceView student={student} devEmail={devEmail} />}
    </main>
  );
}

function LevelStatus({ student }) {
  const tier = String(student.trophyLeague || 'Bronze').split(' ')[0].toLowerCase();
  return (
    <section className="level-status">
      <div className="level-tiles">
        <div className="level-tile">
          <span>Level</span>
          <strong>{student.level}</strong>
          <em>lifetime achievement</em>
        </div>
        <div className={`level-tile league tier-${tier}`}>
          <span>Trophy League</span>
          <strong>{student.trophyLeague}</strong>
          <em>current performance</em>
        </div>
        <div className="level-tile">
          <span>Legend Badge</span>
          <strong>{student.legendBadgeUnlocked ? '🏅 Unlocked' : '🔒 Locked'}</strong>
          <em>reach 1500 SP once</em>
        </div>
        <div className="level-tile">
          <span>Onboarding Group</span>
          <strong className="group">{student.leaderboardGroupLabel || '—'}</strong>
          <em>biweekly cohort</em>
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


function SurveyModal({ survey, student, onDone }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const done = useRef(false);

  const enabled = survey?.enabled && survey.formUrl && student && !student.surveyCompleted;

  // Verify against the server. The completion flag is set ONLY by a real Google
  // submission (Apps Script webhook) or the server-side sheet sync — never by the
  // client — so clicking "I've submitted" cannot dismiss the modal without a
  // genuine response on record. showNote=true surfaces feedback for the button.
  async function verifyStatus(showNote) {
    if (done.current) return;
    if (showNote) { setChecking(true); setNote(''); }
    try {
      const r = await fetch(`${API}/survey/status`);
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

function MarketplaceView({ student, devEmail }) {
  const [subTab, setSubTab] = useState('browse');
  const [services, setServices] = useState([]);
  const [myServices, setMyServices] = useState([]);
  const [myApplications, setMyApplications] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ category: '', difficulty: '', status: 'open' });
  const [showCreate, setShowCreate] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const mpHeaders = useMemo(() => devHeaders(devEmail), [devEmail]);

  useEffect(() => {
    loadCategories();
    loadServices();
  }, [filters]);

  useEffect(() => {
    if (student?.email) {
      loadMyServices();
      loadMyApplications();
    }
  }, [student]);

  const loadCategories = async () => {
    const res = await fetch(`${API}/marketplace/categories`);
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories || []);
    }
  };

  const loadServices = async () => {
    setLoading(true);
    const params = new URLSearchParams({ status: filters.status || 'open', limit: 20 });
    if (filters.category) params.set('category', filters.category);
    if (filters.difficulty) params.set('difficulty', filters.difficulty);
    const res = await fetch(`${API}/marketplace/services?${params}`, { headers: mpHeaders });
    if (res.ok) {
      const data = await res.json();
      setServices(data.services || []);
    }
    setLoading(false);
  };

  const loadMyServices = async () => {
    const res = await fetch(`${API}/marketplace/my-services`, { headers: mpHeaders });
    if (res.ok) {
      const data = await res.json();
      setMyServices(data.services || []);
    }
  };

  const loadMyApplications = async () => {
    const res = await fetch(`${API}/marketplace/my-applications`, { headers: mpHeaders });
    if (res.ok) {
      const data = await res.json();
      setMyApplications(data.applications || []);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Spruti Marketplace</h2>
        <button className="primary" onClick={() => setShowCreate(true)}>+ Create Request</button>
      </div>
      <div className="tab-bar">
        <button className={subTab === 'browse' ? 'active' : ''} onClick={() => setSubTab('browse')}>Browse Services</button>
        <button className={subTab === 'my' ? 'active' : ''} onClick={() => setSubTab('my')}>My Requests ({myServices.length})</button>
        <button className={subTab === 'applications' ? 'active' : ''} onClick={() => setSubTab('applications')}>My Applications ({myApplications.length})</button>
      </div>

      {subTab === 'browse' && (
        <>
          <div className="filter-row">
            <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c._id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <select value={filters.difficulty} onChange={e => setFilters(f => ({ ...f, difficulty: e.target.value }))}>
              <option value="">All Levels</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          {loading ? <p className="muted">Loading services...</p> : services.length === 0 ? <p className="empty">No services found. Be the first to post!</p> : (
            <div className="service-grid">
              {services.map(service => (
                <ServiceCard key={service._id} service={service} onClick={() => setSelectedService(service)} />
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'my' && (
        myServices.length === 0 ? <p className="empty">You haven&apos;t created any service requests yet.</p> : (
          <div className="service-grid">
            {myServices.map(service => (
              <ServiceCard key={service._id} service={service} onClick={() => setSelectedService(service)} isOwner />
            ))}
          </div>
        )
      )}

      {subTab === 'applications' && (
        myApplications.length === 0 ? <p className="empty">You haven&apos;t applied to any services yet.</p> : (
          <div className="service-grid">
            {myApplications.map(app => app.serviceId ? (
              <ServiceCard key={app._id} service={app.serviceId} application={app} onClick={() => setSelectedService(app.serviceId)} />
            ) : null)}
          </div>
        )
      )}

      {showCreate && <CreateServiceModal onClose={() => setShowCreate(false)} categories={categories} devEmail={devEmail} onCreated={() => { setShowCreate(false); loadServices(); loadMyServices(); }} />}
      {selectedService && <ServiceDetailModal service={selectedService} student={student} devEmail={devEmail} onClose={() => setSelectedService(null)} onUpdate={loadServices} />}
    </section>
  );
}

function ServiceCard({ service, application, onClick, isOwner }) {
  const statusColors = { open: '#10b981', assigned: '#f59e0b', in_progress: '#3b82f6', completed: '#6366f1', cancelled: '#6b7280', disputed: '#ef4444' };
  const diffColors = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444', expert: '#8b5cf6' };
  return (
    <article className="card service-card" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div className="card-head">
        <span className="service-category">{service.category}</span>
        <span className="service-status" style={{ color: statusColors[service.status] || '#6b7280' }}>{service.status}</span>
      </div>
      <h3>{service.title}</h3>
      <p className="service-desc">{service.description?.slice(0, 80)}{service.description?.length > 80 ? '...' : ''}</p>
      <div className="service-meta">
        <span className="diff-badge" style={{ backgroundColor: diffColors[service.difficulty] }}>{service.difficulty}</span>
        <span className="service-price">{service.estimatedPrice} SP</span>
        <span className="service-duration">{service.estimatedDuration} min</span>
      </div>
      {application && <p className="application-status">Status: {application.status}</p>}
      {isOwner && <p className="owner-label">Your request</p>}
    </article>
  );
}

function CreateServiceModal({ onClose, categories, devEmail, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [duration, setDuration] = useState(30);
  const [urgency, setUrgency] = useState('normal');
  const [estimatedPrice, setEstimatedPrice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [priceLoading, setPriceLoading] = useState(false);

  const estimatePrice = async () => {
    if (!category || !duration) return;
    setPriceLoading(true);
    const res = await fetch(`${API}/marketplace/estimate-price`, {
      method: 'POST',
      headers: { ...devHeaders(devEmail), 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, difficulty, estimatedDuration: duration, urgency })
    });
    if (res.ok) {
      const data = await res.json();
      setEstimatedPrice(data);
    }
    setPriceLoading(false);
  };

  useEffect(() => { estimatePrice(); }, [category, difficulty, duration, urgency]);

  const submit = async () => {
    if (!title || !description || !category) return setError('Please fill all required fields.');
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/marketplace/services`, {
        method: 'POST',
        headers: { ...devHeaders(devEmail), 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category, difficulty, estimatedDuration: duration, urgency, estimatedPrice: estimatedPrice?.estimated })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create service');
      }
      onCreated();
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal wide">
        <div className="modal-head">
          <h2>Create Service Request</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label>Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., Need help debugging my React app" />
          </div>
          <div className="form-group full">
            <label>Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe what you need help with in detail..." rows={4} />
          </div>
          <div className="form-group">
            <label>Category *</label>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">Select category</option>
              {categories.map(c => <option key={c._id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Difficulty</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div className="form-group">
            <label>Estimated Duration (minutes)</label>
            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} max={300} />
          </div>
          <div className="form-group">
            <label>Urgency</label>
            <select value={urgency} onChange={e => setUrgency(e.target.value)}>
              <option value="normal">Normal</option>
              <option value="urgent">Urgent (+50%)</option>
            </select>
          </div>
        </div>
        {estimatedPrice && (
          <div className="price-estimate">
            <p>Estimated Price: <strong>{estimatedPrice.estimated} SP</strong></p>
            <p className="muted">Range: {estimatedPrice.range?.min} - {estimatedPrice.range?.max} SP</p>
            <p className="muted">Confidence: {Math.round(estimatedPrice.confidence * 100)}%</p>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={loading}>{loading ? 'Creating...' : 'Create Request'}</button>
        </div>
      </section>
    </div>
  );
}

function ServiceDetailModal({ service, student, devEmail, onClose, onUpdate }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [appMsg, setAppMsg] = useState('');
  const isOwner = String(service.buyerId?._id) === String(student?._id) || service.buyerEmail === student?.email;
  const isProvider = String(service.providerId?._id) === String(student?._id) || service.providerEmail === student?.email;
  const canApply = !isOwner && service.status === 'open';
  const canComplete = (isBuyer || isProvider) && (service.status === 'assigned' || service.status === 'in_progress');

  useEffect(() => { loadApplications(); }, []);

  const loadApplications = async () => {
    if (!isOwner) { setLoading(false); return; }
    const res = await fetch(`${API}/marketplace/services/${service._id}/applications`, { headers: devHeaders(devEmail) });
    if (res.ok) {
      const data = await res.json();
      setApplications(data.applications || []);
    }
    setLoading(false);
  };

  const apply = async () => {
    setSubmitting(true);
    const res = await fetch(`${API}/marketplace/services/${service._id}/apply`, {
      method: 'POST',
      headers: { ...devHeaders(devEmail), 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setSubmitting(false);
    if (res.ok) {
      setAppMsg('Application submitted! AI analysis: ' + data.aiAnalysis?.recommendation);
    } else {
      setAppMsg(data.error || 'Failed to apply');
    }
  };

  const acceptApplication = async (appId) => {
    setSubmitting(true);
    const res = await fetch(`${API}/marketplace/services/${service._id}/accept`, {
      method: 'POST',
      headers: { ...devHeaders(devEmail), 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId: appId })
    });
    if (res.ok) {
      onUpdate?.();
      onClose();
    } else {
      const data = await res.json();
      setAppMsg(data.error || 'Failed to accept');
    }
    setSubmitting(false);
  };

  const markComplete = async () => {
    setSubmitting(true);
    const res = await fetch(`${API}/marketplace/services/${service._id}/complete`, { method: 'POST', headers: devHeaders(devEmail) });
    if (res.ok) {
      onUpdate?.();
      onClose();
    } else {
      const data = await res.json();
      setAppMsg(data.error || 'Failed to complete');
    }
    setSubmitting(false);
  };

  const statusColors = { open: '#10b981', assigned: '#f59e0b', in_progress: '#3b82f6', completed: '#6366f1', cancelled: '#6b7280', disputed: '#ef4444' };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal wide">
        <div className="modal-head">
          <div>
            <span style={{ color: statusColors[service.status] }}>{service.status}</span>
            <h2>{service.title}</h2>
          </div>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        <p className="service-desc-full">{service.description}</p>
        <div className="service-detail-grid">
          <div><strong>Category:</strong> {service.category}</div>
          <div><strong>Difficulty:</strong> {service.difficulty}</div>
          <div><strong>Duration:</strong> {service.estimatedDuration} min</div>
          <div><strong>Price:</strong> {service.estimatedPrice} SP</div>
          {service.providerId?.name && <div><strong>Provider:</strong> {service.providerId.name}</div>}
          {service.escrowAmount > 0 && <div><strong>Escrow:</strong> {service.escrowAmount} SP held</div>}
        </div>

        {canApply && (
          <div className="action-section">
            {appMsg && <p className={appMsg.includes('submitted') ? 'success' : 'error'}>{appMsg}</p>}
            <button className="primary" onClick={apply} disabled={submitting}>{submitting ? 'Applying...' : 'Apply to Help'}</button>
          </div>
        )}

        {canComplete && (
          <div className="action-section">
            <button className="primary" onClick={markComplete} disabled={submitting}>{submitting ? 'Processing...' : isProvider ? 'Mark In Progress' : 'Approve & Release Payment'}</button>
          </div>
        )}

        {isOwner && !loading && applications.length > 0 && (
          <div className="applications-section">
            <h3>Applications ({applications.length})</h3>
            {applications.map(app => (
              <div key={app._id} className="application-card">
                <div className="app-header">
                  <strong>{app.applicantId?.name || app.applicantEmail}</strong>
                  <span>Match Score: {Math.round(app.matchScore)}%</span>
                </div>
                {app.aiAnalysis?.strengths?.length > 0 && (
                  <p className="ai-strengths">Strengths: {app.aiAnalysis.strengths.join(', ')}</p>
                )}
                {app.aiAnalysis?.concerns?.length > 0 && (
                  <p className="ai-concerns">Concerns: {app.aiAnalysis.concerns.join(', ')}</p>
                )}
                <p>{app.coverMessage || 'No cover message'}</p>
                <div className="app-footer">
                  <span>Proposed: {app.proposedPrice} SP, {app.proposedDuration} min</span>
                  {app.status === 'pending' && (
                    <button className="secondary small" onClick={() => acceptApplication(app._id)} disabled={submitting}>Accept</button>
                  )}
                  {app.status === 'accepted' && <span style={{ color: '#10b981' }}>Accepted</span>}
                  {app.status === 'rejected' && <span style={{ color: '#6b7280' }}>Rejected</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        {isOwner && !loading && applications.length === 0 && service.status === 'open' && (
          <p className="muted">No applications yet.</p>
        )}
      </section>
    </div>
  );
}
