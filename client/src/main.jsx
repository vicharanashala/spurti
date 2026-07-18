import React, { useEffect, useMemo, useRef, useState } from 'react';
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

  const refreshProfile = async () => {
    try {
      const meRes = await fetch(`${API}/me`);
      if (meRes.ok) {
        const data = await meRes.json();
        if (data.authenticated && data.profile) {
          setProfile(data.profile);
        }
      }
    } catch (e) {}
  };

  if (loading) {
    return <main className="page login-page"><section className="panel auth-card"><p className="eyebrow">Spurti</p><h1>Loading</h1></section></main>;
  }
  if (view === 'student' && profile) {
    return (
      <>
        <StudentView profile={profile} onRefreshProfile={refreshProfile} onBack={config.allowStudentSearch ? () => setView('landing') : null} />
        <SurveyModal
          survey={config.survey}
          student={profile.student}
          onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, surveyCompleted: true } }))}
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

function StudentView({ profile, onRefreshProfile, onBack }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);
  return (
    <main className={`page compact ${student.isCouncilMember ? 'council-member-layout' : ''}`}>
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
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['council', 'Student Council']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'council' && <StudentCouncilView profile={profile} onRefreshProfile={onRefreshProfile} />}
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
  if (profile.student.isEligibleForCouncil) badges.push('🎖 Eligible for Student Council');
  if (profile.student.isCouncilMember) badges.push('👑 Student Council');
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
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['students','Students'], ['council', 'Student Council']]} />
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
      {tab === 'council' && <AdminCouncilPanel stats={stats} auth={auth} />}
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


const maskEmail = (email) => {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (local.length <= 3) return `***@${domain}`;
  return `${local.slice(0, 3)}***@${domain}`;
};

function StudentCouncilView({ profile, onRefreshProfile }) {
  const { student } = profile;
  const council = student.studentCouncil || {};
  const [nominees, setNominees] = useState([]);
  const [statement, setStatement] = useState('');
  const [nomineeEmail, setNomineeEmail] = useState('');
  const [submittingNomination, setSubmittingNomination] = useState(false);
  const [refining, setRefining] = useState(false);
  const [nominationMsg, setNominationMsg] = useState('');
  const [votingMsg, setVotingMsg] = useState('');
  
  const [suggestionType, setSuggestionType] = useState('platformImprovement');
  const [suggestionContent, setSuggestionContent] = useState('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  
  const [rewardTracks, setRewardTracks] = useState([]);
  const [showCertificate, setShowCertificate] = useState(false);
  
  const [electedMembers, setElectedMembers] = useState([]);
  const [concludedSeasonName, setConcludedSeasonName] = useState('');

  const fetchNominees = async () => {
    try {
      const res = await fetch(`${API}/student-council/nominees`);
      if (res.ok) setNominees(await res.json());
    } catch (e) {}
  };

  const fetchElectedMembers = async () => {
    try {
      const res = await fetch(`${API}/student-council/members`);
      if (res.ok) {
        const data = await res.json();
        setElectedMembers(data.members || []);
        setConcludedSeasonName(data.seasonName || '');
      }
    } catch (e) {}
  };

  const fetchSuggestions = async () => {
    try {
      const res = await fetch(`${API}/student-council/suggestions?email=${encodeURIComponent(student.email)}`);
      if (res.ok) setSuggestions(await res.json());
    } catch (e) {}
  };

  const fetchRewardTracks = async () => {
    try {
      const res = await fetch(`${API}/student-council/reward-tracks?email=${encodeURIComponent(student.email)}`);
      if (res.ok) setRewardTracks(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    fetchNominees();
    fetchElectedMembers();
    if (council.electedInPreviousSeason) {
      fetchSuggestions();
      fetchRewardTracks();
    }
  }, [council.electedInPreviousSeason]);

  const handleNominate = async (e) => {
    e.preventDefault();
    setSubmittingNomination(true);
    setNominationMsg('');
    try {
      const res = await fetch(`${API}/student-council/nominate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomineeEmail, statement })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Nomination failed');
      setNominationMsg('Nomination submitted successfully!');
      setStatement('');
      setNomineeEmail('');
      if (onRefreshProfile) onRefreshProfile();
      fetchNominees();
    } catch (err) {
      setNominationMsg(err.message);
    } finally {
      setSubmittingNomination(false);
    }
  };

  const handleRefineStatement = async () => {
    if (!statement.trim()) return;
    setRefining(true);
    setNominationMsg('');
    try {
      const res = await fetch(`${API}/student-council/nomination/refine-statement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refinement failed');
      setStatement(data.refined);
      setNominationMsg('Statement refined locally!');
    } catch (err) {
      setNominationMsg(err.message);
    } finally {
      setRefining(false);
    }
  };

  const handleVote = async (nomineeId) => {
    setVotingMsg('');
    try {
      const res = await fetch(`${API}/student-council/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nomineeId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Voting failed');
      setVotingMsg('Your vote has been cast successfully!');
      if (onRefreshProfile) onRefreshProfile();
      fetchNominees();
    } catch (err) {
      setVotingMsg(err.message);
    }
  };

  const handleSuggestionSubmit = async (e) => {
    e.preventDefault();
    setSubmittingSuggestion(true);
    try {
      const res = await fetch(`${API}/student-council/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: suggestionType, content: suggestionContent })
      });
      if (res.ok) {
        setSuggestionContent('');
        fetchSuggestions();
      }
    } catch (err) {}
    setSubmittingSuggestion(false);
  };

  const handleSuggestionUpvote = async (id) => {
    try {
      const res = await fetch(`${API}/student-council/suggestions/${id}/upvote`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) fetchSuggestions();
    } catch (err) {}
  };

  const handleTrackVote = async (id) => {
    try {
      const res = await fetch(`${API}/student-council/reward-tracks/${id}/vote`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) fetchRewardTracks();
    } catch (err) {}
  };

  const spTarget = council.activeSeason?.minSpRequired || 500;
  const endorsementsTarget = council.activeSeason?.minEndorsementsRequired || 40;
  
  const hasSp = council.seasonSp >= spTarget;
  const hasEndorsements = council.endorsementsCount >= endorsementsTarget;
  const isClean = !council.hasSpamPenalties && !council.hasDisciplinaryActions;

  return (
    <div className="council-container">
      <section className="panel council-hall">
        <h2>👑 Elected Student Council - {concludedSeasonName || 'Current Season'}</h2>
        <p className="muted">These students represent the community and provide structured feedback to platform coordinators.</p>
        
        {electedMembers.length === 0 ? (
          <div className="empty-state">No student council has been elected yet. Let the nominations begin!</div>
        ) : (
          <div className="elected-grid">
            {electedMembers.map(member => {
              const isMe = member._id === student._id;
              return (
                <div key={member._id} className={`elected-card ${isMe ? 'elected-me' : ''}`}>
                  <div className="elected-badge">👑 Council Member</div>
                  <h3>{member.name}</h3>
                  <p className="masked-email">{member.maskedEmail}</p>
                  
                  <div className="elected-stats">
                    <span>Level {member.level}</span>
                    <span>{member.totalSp} SP</span>
                  </div>

                  <p className="statement">"{member.nominationStatement}"</p>

                  {isMe && (
                    <button className="primary certificate-btn" onClick={() => setShowCertificate(true)}>
                      🎖 View Digital Certificate
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {council.electedInPreviousSeason && (
        <section className="panel council-advisory">
          <h2>📝 Council Room & Advisory Tasks</h2>
          <p className="lead" style={{ marginBottom: '1.5rem' }}>As a Student Council member, you can suggest quests, platform improvements, and vote on seasonal reward tracks.</p>

          <div className="advisory-grid">
            <div className="advisory-form-container">
              <h3>Submit Advisory Proposal</h3>
              <form onSubmit={handleSuggestionSubmit} className="login-form suggestion-form">
                <select value={suggestionType} onChange={e => setSuggestionType(e.target.value)}>
                  <option value="weeklyQuest">Suggest Weekly Quest</option>
                  <option value="communityChallenge">Suggest Community Challenge</option>
                  <option value="structuredFeedback">Structured Feedback for Admins</option>
                  <option value="platformImprovement">Recommend Platform Improvement</option>
                </select>
                <textarea 
                  value={suggestionContent} 
                  onChange={e => setSuggestionContent(e.target.value)} 
                  placeholder="Describe your suggestion or feedback in detail..." 
                  required
                />
                <button type="submit" className="primary" disabled={submittingSuggestion}>
                  {submittingSuggestion ? 'Submitting...' : 'Submit Suggestion'}
                </button>
              </form>
            </div>

            <div className="advisory-list-container">
              <h3>Advisory Suggestions Feed</h3>
              <div className="suggestions-list">
                {suggestions.length === 0 ? <p className="muted">No suggestions submitted yet.</p> : suggestions.map(s => (
                  <div key={s._id} className="suggestion-item">
                    <div className="item-head">
                      <strong>{s.type === 'weeklyQuest' ? 'Quest' : s.type === 'communityChallenge' ? 'Challenge' : s.type === 'structuredFeedback' ? 'Feedback' : 'Improvement'}</strong>
                      <span>by {s.studentName}</span>
                    </div>
                    <p className="item-content">{s.content}</p>
                    <button className={`secondary upvote-btn ${s.voted ? 'voted' : ''}`} onClick={() => handleSuggestionUpvote(s._id)}>
                      ▲ Support ({s.votesCount})
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="advisory-tracks-container" style={{ gridColumn: 'span 2' }}>
              <h3>Vote on Reward Tracks</h3>
              <p className="muted" style={{ marginBottom: '1rem' }}>Support the rewards track you want to activate for the next season.</p>
              <div className="tracks-list">
                {rewardTracks.map(track => (
                  <div key={track._id} className={`track-card ${track.voted ? 'selected-track' : ''}`}>
                    <h4>{track.name}</h4>
                    <p>{track.description}</p>
                    <div className="track-items">
                      {track.items.map(item => <span key={item} className="track-item-badge">{item}</span>)}
                    </div>
                    <button className={`primary track-vote-btn ${track.voted ? 'voted' : ''}`} onClick={() => handleTrackVote(track._id)}>
                      {track.voted ? 'Voted' : 'Vote Track'} ({track.votesCount})
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {council.activeSeason ? (
        <section className="panel council-eligibility">
          <h2>🎖 Current Election Season: {council.activeSeason.name}</h2>
          
          <div className="checklist-nomination-grid">
            <div className="eligibility-checklist">
              <h3>Eligibility Checklist</h3>
              <ul className="checklist">
                <li className={hasSp ? 'completed' : 'incomplete'}>
                  {hasSp ? '✅' : '❌'} Earn at least {spTarget} SP during the season (Current: <strong>{council.seasonSp} SP</strong>)
                </li>
                <li className={hasEndorsements ? 'completed' : 'incomplete'}>
                  {hasEndorsements ? '✅' : '❌'} Receive endorsements for at least {endorsementsTarget}/53 Matrix Mystics questions (Current: <strong>{council.endorsementsCount}/53</strong>)
                </li>
                <li className={isClean ? 'completed' : 'incomplete'}>
                  {isClean ? '✅' : '❌'} No spam penalties or disciplinary actions (Status: <strong>{isClean ? 'Clean' : 'Penalty Registered'}</strong>)
                </li>
              </ul>
              {student.isEligibleForCouncil ? (
                <div className="elig-badge">🎖 You are eligible to run in the election!</div>
              ) : (
                <p className="error-note">You must meet all conditions above to unlock nomination.</p>
              )}
            </div>

            <div className="nomination-form-box">
              <h3>Submit Nomination Campaign</h3>
              {council.isNominated ? (
                <div className="nomination-success-card">
                  <p><strong>You are officially running in this election!</strong></p>
                  <div className="campaign-card-preview">
                    <h4>{student.name}</h4>
                    <p className="campaign-stats">Season SP: <strong>{council.seasonSp}</strong> | Endorsements: <strong>{council.endorsementsCount}/53</strong></p>
                    <p className="statement">"{council.nominationStatement}"</p>
                    {council.nominatedBy && <p className="nominated-by">Nominated by classmate: {maskEmail(council.nominatedBy)}</p>}
                  </div>
                </div>
              ) : student.isEligibleForCouncil ? (
                <form onSubmit={handleNominate} className="login-form nom-form">
                  <input 
                    type="email" 
                    value={nomineeEmail} 
                    onChange={e => setNomineeEmail(e.target.value)} 
                    placeholder="Nominee email (leave blank to nominate yourself)"
                  />
                  <textarea 
                    value={statement} 
                    onChange={e => setStatement(e.target.value)} 
                    placeholder="Submit a short statement describing why you want to represent the community (max 150 words)..."
                    maxLength={500}
                    required
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button type="submit" className="primary" disabled={submittingNomination}>
                      {submittingNomination ? 'Submitting...' : 'Submit Nomination'}
                    </button>
                    <button type="button" className="secondary ai-btn" onClick={handleRefineStatement} disabled={refining || !statement.trim()}>
                      {refining ? 'Refining...' : '✨ Polish statement'}
                    </button>
                  </div>
                  {nominationMsg && <p className="nomination-msg">{nominationMsg}</p>}
                </form>
              ) : (
                <div className="nomination-locked-card">
                  <p className="muted">Nomination is locked until you meet all eligibility criteria above.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="panel council-eligibility empty">
          <h2>Elections Closed</h2>
          <p className="muted">There is no active election season currently running. Check back later!</p>
        </section>
      )}

      {council.activeSeason && (
        <section className="panel nominees-campaigns">
          <h2>🗳 Vote for Candidates</h2>
          <p className="muted">Review the campaign cards and vote based on contribution and statement. You can vote only once per season.</p>
          {votingMsg && <p className="voting-msg">{votingMsg}</p>}

          {nominees.length === 0 ? (
            <div className="empty-state">No nominees have registered campaign cards yet. Be the first!</div>
          ) : (
            <div className="nominees-grid">
              {nominees.map(nominee => {
                const isVoterMe = nominee.studentId === student._id;
                return (
                  <div key={nominee._id} className="campaign-card">
                    <h3>{nominee.name}</h3>
                    <p className="masked-email">{nominee.maskedEmail}</p>

                    <div className="campaign-metrics">
                      <div className="metric-box">
                        <span>Season SP</span>
                        <strong>{nominee.seasonSp}</strong>
                      </div>
                      <div className="metric-box">
                        <span>Endorsements</span>
                        <strong>{nominee.endorsementsCount}/53</strong>
                      </div>
                      <div className="metric-box">
                        <span>Votes</span>
                        <strong>{nominee.votesCount}</strong>
                      </div>
                    </div>

                    <div className="personal-statement">
                      <strong>Personal Statement:</strong>
                      <p>"{nominee.nominationStatement}"</p>
                    </div>

                    <button 
                      className="primary vote-btn" 
                      onClick={() => handleVote(nominee._id)}
                      disabled={isVoterMe}
                      title={isVoterMe ? "You cannot vote for yourself." : ""}
                    >
                      Cast Vote
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showCertificate && (
        <div className="overlay modal-overlay" onClick={() => setShowCertificate(false)}>
          <div className="certificate-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowCertificate(false)}>x</button>
            <div className="certificate-border">
              <div className="certificate-inner">
                <div className="certificate-header">
                  <span className="gold-seal">★</span>
                  <h1>CERTIFICATE OF EXCELLENCE</h1>
                  <h2>STUDENT COUNCIL MEMBER</h2>
                </div>
                <div className="certificate-body">
                  <p>This is proudly presented to</p>
                  <h3>{student.name}</h3>
                  <p className="cert-desc">
                    for outstanding leadership, peer mentorship, and community-driven excellence. 
                    Elected as an official Student Council representative by the student cohort during the
                  </p>
                  <h4>{concludedSeasonName || 'Student Council'} Season</h4>
                  <p className="cert-desc2">
                    in the VLED Summership Internship Program, IIT Ropar.
                  </p>
                </div>
                <div className="certificate-footer">
                  <div className="signature">
                    <span className="sign-line">Rohit</span>
                    <span>VLED Coordinator</span>
                  </div>
                  <div className="date-block">
                    <span className="date-line">{new Date(electedMembers.find(m => m._id === student._id)?.certificateDate || new Date()).toLocaleDateString()}</span>
                    <span>Date of Award</span>
                  </div>
                  <div className="signature">
                    <span className="sign-line">Samagama Gateway</span>
                    <span>Platform Coordinator</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminCouncilPanel({ stats, auth }) {
  const headers = adminHeaders(auth);
  const [activeSeason, setActiveSeason] = useState(null);
  const [lastConcluded, setLastConcluded] = useState(null);
  const [newSeasonName, setNewSeasonName] = useState('');
  const [cap, setCap] = useState(1000);
  const [size, setSize] = useState(5);
  const [reqMM, setReqMM] = useState(40);
  const [reqSP, setReqSP] = useState(500);

  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [mmInput, setMmInput] = useState('');
  const [hasSpam, setHasSpam] = useState(false);
  const [hasDisc, setHasDisc] = useState(false);

  const [insights, setInsights] = useState('');
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [message, setMessage] = useState('');

  const fetchSeasonData = async () => {
    try {
      const statusRes = await fetch(`${API}/student-council/status`);
      if (statusRes.ok) {
        const data = await statusRes.json();
        setActiveSeason(data.activeSeason);
        if (data.activeSeason) {
          setCap(data.activeSeason.maxSpCapForScore || 1000);
          setSize(data.activeSeason.councilSize || 5);
          setReqMM(data.activeSeason.minEndorsementsRequired || 40);
          setReqSP(data.activeSeason.minSpRequired || 500);
        }
      }
      const concludedRes = await fetch(`${API}/student-council/members`);
      if (concludedRes.ok) {
        const data = await concludedRes.json();
        setLastConcluded(data.seasonName ? data : null);
      }
    } catch (e) {}
  };

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API}/admin/students-by-status?status=active&limit=1000`, { headers });
      if (res.ok) setStudents(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    fetchSeasonData();
    fetchStudents();
  }, []);

  const handleStartSeason = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch(`${API}/admin/student-council/season/start`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSeasonName,
          maxSpCapForScore: cap,
          councilSize: size,
          minEndorsementsRequired: reqMM,
          minSpRequired: reqSP
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start season.');
      setMessage(`Started new season: ${data.name}`);
      setNewSeasonName('');
      fetchSeasonData();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch(`${API}/admin/student-council/season/config`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxSpCapForScore: cap,
          councilSize: size,
          minEndorsementsRequired: reqMM,
          minSpRequired: reqSP
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save config.');
      setMessage('Configuration updated.');
      fetchSeasonData();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleUpdateStudent = async (e) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setMessage('');
    const endorsements = mmInput.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n) && n >= 1 && n <= 53);

    try {
      const res = await fetch(`${API}/admin/student-council/student-data`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent._id,
          matrixMysticsEndorsements: endorsements,
          hasSpamPenalties: hasSpam,
          hasDisciplinaryActions: hasDisc
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update student.');
      setMessage(`Updated data for ${selectedStudent.name}.`);
      setSelectedStudent(null);
      setMmInput('');
      setHasSpam(false);
      setHasDisc(false);
      fetchStudents();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleConcludeSeason = async () => {
    if (!window.confirm("Are you sure you want to conclude the current election season? This will award +50 SP and conclusion metrics.")) return;
    setMessage('');
    try {
      const res = await fetch(`${API}/admin/student-council/conclude`, {
        method: 'POST',
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to conclude election.');
      setMessage(data.message);
      fetchSeasonData();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleLoadInsights = async () => {
    setLoadingInsights(true);
    setInsights('');
    try {
      const res = await fetch(`${API}/admin/student-council/insights`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get insights.');
      setInsights(data.insights);
    } catch (err) {
      setInsights('Error: ' + err.message);
    } finally {
      setLoadingInsights(false);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    s.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="admin-council-panel">
      {message && <div className="admin-msg-box" style={{ padding: '10px', background: 'var(--accent)', color: 'white', borderRadius: '4px', marginBottom: '1rem' }}>{message}</div>}

      <div className="admin-grid-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <section className="panel">
          <h3>Elections Controls & Status</h3>
          {activeSeason ? (
            <div className="season-status-box">
              <p>Active Season: <strong>{activeSeason.name}</strong></p>
              <p>Start Date: <strong>{new Date(activeSeason.startDate).toLocaleString()}</strong></p>
              
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button className="primary" onClick={handleConcludeSeason}>Conclude Election & Elect Council</button>
              </div>

              <form onSubmit={handleSaveConfig} className="login-form" style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4>Update Season Settings</h4>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>SP Cap for Council Score
                  <input type="number" value={cap} onChange={e => setCap(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Council Size (Max elected)
                  <input type="number" value={size} onChange={e => setSize(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Min SP Required
                  <input type="number" value={reqSP} onChange={e => setReqSP(Number(e.target.value))} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Min MM Endorsements Required
                  <input type="number" value={reqMM} onChange={e => setReqMM(Number(e.target.value))} />
                </label>
                <button type="submit" className="secondary" style={{ marginTop: '0.5rem' }}>Save Config</button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleStartSeason} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p className="muted">No active season. Start a new season to trigger eligibility, nominations, and voting.</p>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Season Name (e.g. Bronze Season)
                <input type="text" value={newSeasonName} onChange={e => setNewSeasonName(e.target.value)} required />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>SP Cap for Council Score
                <input type="number" value={cap} onChange={e => setCap(Number(e.target.value))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Council Size (Max elected)
                <input type="number" value={size} onChange={e => setSize(Number(e.target.value))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Min SP Required
                <input type="number" value={reqSP} onChange={e => setReqSP(Number(e.target.value))} />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Min MM Endorsements Required
                <input type="number" value={reqMM} onChange={e => setReqMM(Number(e.target.value))} />
              </label>
              <button type="submit" className="primary" style={{ marginTop: '0.5rem' }}>Start Election Season</button>
            </form>
          )}
        </section>

        <section className="panel">
          <h3>Student Eligibility Data Editor</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>Manage a student's Matrix Mystics endorsed questions (1-53) and disciplinary flags for the current season.</p>
          
          <input 
            type="text" 
            placeholder="Search student by name/email..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ marginBottom: '0.5rem', width: '100%', padding: '8px' }}
          />

          <div className="student-scroll-box" style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px', marginBottom: '1rem' }}>
            {filteredStudents.slice(0, 15).map(s => (
              <button key={s._id} className="student-select-row" onClick={() => setSelectedStudent(s)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px', border: 'none', background: selectedStudent?._id === s._id ? 'var(--accent)' : 'none', color: selectedStudent?._id === s._id ? 'white' : 'inherit', cursor: 'pointer', borderRadius: '2px' }}>
                {s.name} ({s.email})
              </button>
            ))}
          </div>

          {selectedStudent && (
            <form onSubmit={handleUpdateStudent} className="login-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h4>Editing: {selectedStudent.name}</h4>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>Endorsed Questions (comma separated numbers 1-53)
                <input 
                  type="text" 
                  value={mmInput} 
                  onChange={e => setMmInput(e.target.value)} 
                  placeholder="e.g. 1,2,5,10,40"
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasSpam} onChange={e => setHasSpam(e.target.checked)} />
                Has Spam Penalty
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={hasDisc} onChange={e => setHasDisc(e.target.checked)} />
                Has Disciplinary Action
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="submit" className="primary">Update Data</button>
                <button type="button" className="secondary" onClick={() => setSelectedStudent(null)}>Cancel</button>
              </div>
            </form>
          )}
        </section>

        <section className="panel wide-admin-panel" style={{ gridColumn: 'span 2' }}>
          <h3>📋 Coordinator Suggestions Report</h3>
          <p className="muted" style={{ marginBottom: '1rem' }}>Summarize, categorize, and action suggestions submitted by the elected council members offline.</p>
          <button className="primary" onClick={handleLoadInsights} disabled={loadingInsights}>
            {loadingInsights ? 'Analyzing Suggestions...' : 'Generate Suggestions Report'}
          </button>
          
          {insights && (
            <div className="insights-report" style={{ marginTop: '1rem', whiteSpace: 'pre-line', padding: '1rem', background: '#1e293b', color: '#f1f5f9', borderLeft: '4px solid gold', borderRadius: '4px', fontSize: '14px', lineHeight: '1.6' }}>
              {insights}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
