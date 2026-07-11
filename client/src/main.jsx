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

function StudentView({ profile, onUpdate, onBack }) {
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
        <div className="score-card"><span>SP</span><strong>{student.totalSp}</strong></div>
      </header>
      <LevelStatus student={student} />
      <WeeklyGoalPlanner profile={profile} onUpdate={onUpdate} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} onTabChange={setTab} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['missions', 'Missions'], ['leaderboard','Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'missions' && <DailyMissionPlanner profile={profile} onUpdate={onUpdate} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
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

function StudentPulse({ profile, badges, nextActions, onTabChange }) {
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
      <div className="pulse-card" style={{ cursor: 'pointer' }} onClick={() => onTabChange('missions')}>
        <span>Daily Missions</span>
        <strong>🔥 {student.dailyMissionStreak || 0} Streak</strong>
        <div className="compare-list">
          <b>Longest: {student.longestMissionStreak || 0} days</b>
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Click to plan & earn SP</span>
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

function DailyMissionPlanner({ profile, onUpdate }) {
  const { student } = profile;
  const [date, setDate] = useState(() => {
    // Get local date in IST format YYYY-MM-DD
    const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('en-CA', options);
    return formatter.format(new Date());
  });

  const [missions, setMissions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [streaks, setStreaks] = useState({ daily: 0, weekly: 0, monthly: 0, longest: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'weekly' | 'monthly'

  // Form State
  const [formOpen, setFormOpen] = useState(false);
  const [editingMission, setEditingMission] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [duration, setDuration] = useState(30);
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState('coding');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Coach State
  const [coachFeedback, setCoachFeedback] = useState('');
  const [coachLoading, setCoachLoading] = useState(false);

  // Insights State
  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Expanded card state
  const [expandedMissions, setExpandedMissions] = useState({});

  useEffect(() => {
    loadMissions(date);
    loadCoachFeedback(date);
  }, [date]);

  useEffect(() => {
    if (activeTab === 'weekly') {
      loadWeeklyInsights();
    } else if (activeTab === 'monthly') {
      loadMonthlyAnalytics();
    }
  }, [activeTab, date]);

  const loadMissions = async (targetDate) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/missions?date=${targetDate}`);
      if (res.ok) {
        const data = await res.json();
        setMissions(data.missions || []);
        setSummary(data.summary);
        if (data.streaks) setStreaks(data.streaks);
      }
    } catch (err) {
      console.error('Failed to load missions:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCoachFeedback = async (targetDate) => {
    setCoachLoading(true);
    try {
      const res = await fetch(`${API}/missions/coach-feedback?date=${targetDate}`);
      if (res.ok) {
        const data = await res.json();
        setCoachFeedback(data.coachFeedback);
      }
    } catch (err) {
      console.error('Failed to load coach feedback:', err);
    } finally {
      setCoachLoading(false);
    }
  };

  const loadWeeklyInsights = async () => {
    setInsightsLoading(true);
    try {
      const res = await fetch(`${API}/missions/weekly-insights?date=${date}`);
      if (res.ok) {
        setInsights(await res.json());
      }
    } catch (err) {
      console.error('Failed to load weekly insights:', err);
    } finally {
      setInsightsLoading(false);
    }
  };

  const loadMonthlyAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API}/missions/monthly-analytics?date=${date}`);
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch (err) {
      console.error('Failed to load monthly analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const openAddForm = () => {
    setEditingMission(null);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setDuration(30);
    setDeadline('');
    setCategory('coding');
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (mission) => {
    setEditingMission(mission);
    setTitle(mission.title);
    setDescription(mission.description || '');
    setPriority(mission.priority);
    setDuration(mission.duration);
    setDeadline(mission.deadline || '');
    setCategory(mission.category);
    setFormError('');
    setFormOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setFormError('Title is required');
      return;
    }
    setSubmitting(true);
    setFormError('');

    const payload = { title, description, priority, duration, deadline, category, date };

    try {
      let res;
      if (editingMission) {
        res = await fetch(`${API}/missions/${editingMission._id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch(`${API}/missions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        setFormOpen(false);
        loadMissions(date);
        loadCoachFeedback(date);
        // Trigger profile reload in parent if needed (since SP changed)
        triggerProfileReload();
      } else {
        const errorData = await res.json();
        setFormError(errorData.error || 'Failed to save mission');
      }
    } catch (err) {
      setFormError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this mission?')) return;
    try {
      const res = await fetch(`${API}/missions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadMissions(date);
        loadCoachFeedback(date);
        triggerProfileReload();
      }
    } catch (err) {
      console.error('Failed to delete mission:', err);
    }
  };

  const handleToggleComplete = async (id) => {
    try {
      const res = await fetch(`${API}/missions/${id}/toggle`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        loadMissions(date);
        loadCoachFeedback(date);
        triggerProfileReload();
      }
    } catch (err) {
      console.error('Failed to toggle completion:', err);
    }
  };

  const handleReorder = async (missionId, direction) => {
    const index = missions.findIndex(m => m._id === missionId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === missions.length - 1) return;

    const newMissions = [...missions];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    // Swap order property
    const temp = newMissions[index].order;
    newMissions[index].order = newMissions[targetIndex].order;
    newMissions[targetIndex].order = temp;

    // Swap items in local array
    const tempItem = newMissions[index];
    newMissions[index] = newMissions[targetIndex];
    newMissions[targetIndex] = tempItem;

    setMissions(newMissions);

    try {
      await fetch(`${API}/missions/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orders: newMissions.map((m) => ({ id: m._id, order: m.order }))
        })
      });
    } catch (err) {
      console.error('Failed to save reorder:', err);
    }
  };

  const triggerProfileReload = async () => {
    // Trick to force Parent view to fetch the latest Spurti points from server
    try {
      const res = await fetch(`${API}/me`);
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.profile && onUpdate) {
          onUpdate(data.profile);
        }
      }
    } catch {}
  };

  const changeDate = (days) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + days);
    setDate(d.toISOString().split('T')[0]);
  };

  const toggleDetails = (id) => {
    setExpandedMissions(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getQualityColorClass = (score) => {
    if (score >= 90) return 'high';
    if (score >= 70) return 'med';
    return 'low';
  };

  const getCompletionPercentage = () => {
    if (!missions.length) return 0;
    const completed = missions.filter(m => m.completed).length;
    return Math.round((completed / missions.length) * 100);
  };

  const getTodaySp = () => {
    let base = missions.filter(m => m.completed).reduce((sum, m) => sum + (m.spEarned || 0), 0);
    let bonus = summary?.bonusSpEarned || 0;
    return base + bonus;
  };

  return (
    <div className="mission-planner-layout">
      {/* Streaks stats row */}
      <div className="mission-header-stats">
        <div className="streak-card daily">
          <span>Daily Streak</span>
          <strong>🔥 {streaks.daily} days</strong>
        </div>
        <div className="streak-card weekly">
          <span>Weekly Streak</span>
          <strong>🏆 {streaks.weekly} weeks</strong>
        </div>
        <div className="streak-card monthly">
          <span>Monthly Streak</span>
          <strong>💎 {streaks.monthly} months</strong>
        </div>
        <div className="streak-card longest">
          <span>Longest Streak</span>
          <strong>🎖️ {streaks.longest} days</strong>
        </div>
      </div>

      {/* Date controls and Add Task button */}
      <div className="mission-controls">
        <div className="date-controls">
          <button className="date-btn" onClick={() => changeDate(-1)}>◀</button>
          <span>📅 {date === getISTDateString() ? "Today" : date}</span>
          <button className="date-btn" onClick={() => changeDate(1)}>▶</button>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="primary quick-add-btn" onClick={openAddForm}>
            ➕ Add Mission
          </button>
        </div>
      </div>

      {/* Navigation tabs inside Planner */}
      <div className="tabs">
        <button className={activeTab === 'list' ? 'active' : ''} onClick={() => setActiveTab('list')}>Missions Checklist</button>
        <button className={activeTab === 'weekly' ? 'active' : ''} onClick={() => setActiveTab('weekly')}>Weekly Insights</button>
        <button className={activeTab === 'monthly' ? 'active' : ''} onClick={() => setActiveTab('monthly')}>Monthly Analytics</button>
      </div>

      {activeTab === 'list' && (
        <div className="mission-grid">
          {/* Left panel: Task lists */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-head" style={{ marginBottom: '16px' }}>
              <h2>Missions</h2>
              <span className="muted">{missions.length} Planned</span>
            </div>

            {loading ? (
              <p className="empty">Loading daily missions...</p>
            ) : !missions.length ? (
              <p className="empty">No missions added for today. Click 'Add Mission' to start planning your learning goals!</p>
            ) : (
              <div className="mission-list">
                {missions.map((mission, index) => (
                  <div className="mission-card" key={mission._id}>
                    <div className="mission-main-row">
                      <button 
                        className={`mission-check-btn ${mission.completed ? 'completed' : ''}`}
                        onClick={() => handleToggleComplete(mission._id)}
                      >
                        {mission.completed && '✓'}
                      </button>

                      <div className="mission-info">
                        <h3 className={`mission-title ${mission.completed ? 'completed' : ''}`}>
                          {mission.title}
                        </h3>
                        {mission.description && (
                          <p className="mission-description">{mission.description}</p>
                        )}
                        <div className="mission-meta">
                          <span className={`cat-badge cat-${mission.category}`}>{mission.category.replace('_', ' ')}</span>
                          <span className={`pri-badge pri-${mission.priority}`}>{mission.priority}</span>
                          <span className="duration-badge">⏱️ {mission.duration}m</span>
                          {mission.deadline && (
                            <span className="deadline-badge">📅 {mission.deadline}</span>
                          )}
                          {mission.qualityScore !== null && (
                            <span className={`quality-pill ${getQualityColorClass(mission.qualityScore)}`}>
                              ⭐ Q-{mission.qualityScore}
                            </span>
                          )}
                          {mission.completed && mission.spEarned > 0 && (
                            <span className="sp-earned-pill">+{mission.spEarned} SP</span>
                          )}
                        </div>

                        {mission.qualityEvaluation && (
                          <>
                            <button className="mission-details-toggle" onClick={() => toggleDetails(mission._id)}>
                              {expandedMissions[mission._id] ? '▲ Hide AI evaluation' : '▼ View AI evaluation'}
                            </button>

                            {expandedMissions[mission._id] && (
                              <div className="mission-evaluation-details">
                                <div className="eval-metrics-grid">
                                  <div className="eval-metric-bar">
                                    <span>Specificity: {mission.qualityEvaluation.specificity}/100</span>
                                    <div className="metric-track">
                                      <div className={`metric-fill ${getQualityColorClass(mission.qualityEvaluation.specificity)}`} style={{ width: `${mission.qualityEvaluation.specificity}%` }} />
                                    </div>
                                  </div>
                                  <div className="eval-metric-bar">
                                    <span>Actionability: {mission.qualityEvaluation.actionability}/100</span>
                                    <div className="metric-track">
                                      <div className={`metric-fill ${getQualityColorClass(mission.qualityEvaluation.actionability)}`} style={{ width: `${mission.qualityEvaluation.actionability}%` }} />
                                    </div>
                                  </div>
                                  <div className="eval-metric-bar">
                                    <span>Learning Value: {mission.qualityEvaluation.learningValue}/100</span>
                                    <div className="metric-track">
                                      <div className={`metric-fill ${getQualityColorClass(mission.qualityEvaluation.learningValue)}`} style={{ width: `${mission.qualityEvaluation.learningValue}%` }} />
                                    </div>
                                  </div>
                                </div>
                                <p className="eval-reasoning">
                                  <strong>AI Coach feedback:</strong> {mission.qualityEvaluation.reasoning}
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Reordering and Actions */}
                      <div className="mission-action-buttons">
                        <button className="mission-action-btn" onClick={() => handleReorder(mission._id, 'up')} disabled={index === 0}>▲</button>
                        <button className="mission-action-btn" onClick={() => handleReorder(mission._id, 'down')} disabled={index === missions.length - 1}>▼</button>
                        <button className="mission-action-btn" onClick={() => openEditForm(mission)}>✏️</button>
                        <button className="mission-action-btn delete" onClick={() => handleDelete(mission._id)}>🗑️</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right panel: Coach feedback & Today progress summary */}
          <div>
            {/* AI Coach panel */}
            <div className="coach-card">
              <span className="coach-avatar">🤖</span>
              <div className="coach-content">
                <h4>AI Coach Daily Message</h4>
                {coachLoading ? (
                  <p>Coach is writing feedback...</p>
                ) : (
                  <p>{coachFeedback || 'Set missions and check them off to get personalized coaching!'}</p>
                )}
              </div>
            </div>

            {/* Today Summary */}
            <div className="panel" style={{ margin: 0 }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 850 }}>Today's Performance</h3>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                <svg className="circular-progress-svg">
                  <circle className="circular-bg" cx="45" cy="45" r="38" />
                  <circle 
                    className="circular-indicator" 
                    cx="45" 
                    cy="45" 
                    r="38" 
                    strokeDasharray="239" 
                    strokeDashoffset={239 - (239 * getCompletionPercentage()) / 100}
                  />
                  <text x="45" y="50" textAnchor="middle" dominantBaseline="middle" style={{ transform: 'rotate(90deg)', transformOrigin: '45px 45px', fontWeight: 900, fontSize: '13px' }}>
                    {getCompletionPercentage()}%
                  </text>
                </svg>
              </div>

              <div className="compare-list" style={{ borderTop: '1px solid var(--line)', paddingTop: '12px' }}>
                <b>Today's SP: <span style={{ color: 'var(--primary)' }}>+{getTodaySp()} SP</span></b>
                <b>Completed Tasks: {missions.filter(m => m.completed).length} / {missions.length}</b>
                <b>Avg Quality Score: {summary?.qualityAverage || 0} / 100</b>
                {summary?.bonusSpEarned > 0 && (
                  <b style={{ color: 'var(--green)' }}>🎉 +20% Completion Bonus Earned!</b>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'weekly' && (
        <div>
          {insightsLoading ? (
            <p className="empty">Compiling weekly report...</p>
          ) : !insights ? (
            <p className="empty">No weekly goal logs found. Check off missions to build insights!</p>
          ) : (
            <div className="mission-planner-layout">
              {/* Insights stats */}
              <div className="insights-summary-grid">
                <div className="insight-metric-card">
                  <span>Completion Rate</span>
                  <strong>{insights.completionRate}%</strong>
                  <p>In the last 7 days</p>
                </div>
                <div className="insight-metric-card">
                  <span>Weekly SP Earned</span>
                  <strong>+{insights.spEarned} SP</strong>
                  <p>Total daily planner points</p>
                </div>
                <div className="insight-metric-card">
                  <span>Weekly Quality Avg</span>
                  <strong>{insights.qualityAverage}/100</strong>
                  <p>Task definition detail level</p>
                </div>
              </div>

              {/* Category distribution and AI Suggestions */}
              <div className="analytics-charts-grid">
                {/* Horizontal bar chart */}
                <div className="custom-chart-container">
                  <h4>Category Distribution</h4>
                  <div className="cat-bars-list">
                    {Object.keys(insights.categoryDistribution).map(cat => {
                      const count = insights.categoryDistribution[cat];
                      const maxVal = Math.max(1, ...Object.values(insights.categoryDistribution));
                      const percent = Math.round((count / maxVal) * 100);
                      return (
                        <div className="cat-bar-row" key={cat}>
                          <span className="label">{cat.replace('_', ' ')}</span>
                          <div className="cat-bar-track">
                            <div className="cat-bar-fill" style={{ width: `${percent}%` }} />
                          </div>
                          <span className="val">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Suggestions / Productivity Score */}
                <div className="custom-chart-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <h4>Weekly Productivity Score</h4>
                    <strong style={{ fontSize: '38px', color: 'var(--primary)' }}>{insights.weeklyProductivityScore} / 100</strong>
                    <p className="muted" style={{ fontSize: '13px', margin: '4px 0 0 0' }}>Reflects task specificity, completion rates, and consistent challenge volume.</p>
                  </div>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
                    <h4 style={{ marginBottom: '8px' }}>AI Insights & Recommendations</h4>
                    <ul className="next-list">
                      {insights.aiSuggestions.map((s, idx) => (
                        <li key={idx} style={{ fontSize: '13px', marginBottom: '6px' }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'monthly' && (
        <div>
          {analyticsLoading ? (
            <p className="empty">Analyzing monthly records...</p>
          ) : !analytics ? (
            <p className="empty">No historical logs found for the last 30 days.</p>
          ) : (
            <div className="mission-planner-layout">
              {/* Heatmap Grid */}
              <div className="custom-chart-container">
                <h4>Category Completion Heatmap (Last 30 Days)</h4>
                <div className="heatmap-grid">
                  {Object.keys(analytics.categoryHeatmap).map(cat => {
                    const stats = analytics.categoryHeatmap[cat];
                    const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
                    return (
                      <div className="heatmap-box" key={cat}>
                        <span className="box-lbl">{cat.replace('_', ' ')}</span>
                        <span className="box-val">{stats.completed}/{stats.total}</span>
                        <div className="heatmap-progress-track">
                          <div className="heatmap-progress-fill" style={{ width: `${rate}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quality and SP Growth Graphs */}
              <div className="analytics-charts-grid">
                {/* SP Cumulative Growth */}
                <div className="custom-chart-container">
                  <h4>Cumulative SP Growth (Last 30 Days)</h4>
                  <div className="trend-line-container">
                    {analytics.spGrowth.map((point, idx) => {
                      const maxVal = Math.max(1, ...analytics.spGrowth.map(p => p.value));
                      const heightPercent = Math.round((point.value / maxVal) * 160); // Max height 160px
                      return (
                        <div className="trend-bar" style={{ height: `${heightPercent}px` }} key={idx}>
                          <div className="trend-tooltip">
                            {point.date}: {point.value} SP
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Performance Analytics summary */}
                <div className="custom-chart-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4>Streak & Categorical Milestones</h4>
                  <div className="compare-list">
                    <b>🔥 Longest Streak Achieved: <span style={{ color: 'var(--primary)' }}>{analytics.longestStreak} days</span></b>
                    <b>🌟 Strongest Task Type: <span style={{ color: 'var(--green)' }}>{analytics.bestPerformingCategory}</span></b>
                    <b>⚠️ Focus Needed Category: <span style={{ color: 'var(--red)' }}>{analytics.weakestCategory}</span></b>
                    <b>📋 Most Frequent Activity: <span style={{ textTransform: 'capitalize' }}>{analytics.mostCommonTaskType}</span></b>
                  </div>
                  <p className="muted" style={{ fontSize: '13px', borderTop: '1px solid var(--line)', paddingTop: '12px', marginTop: '6px' }}>
                    Streaks are updated daily as you complete your missions. Weekly completion rate target is 80%+ to maintain high league performance.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {formOpen && (
        <div className="mission-form-overlay">
          <form className="mission-form-modal" onSubmit={handleSubmit}>
            <div className="form-header">
              <h3>{editingMission ? '✏️ Edit Daily Mission' : '➕ Plan New Mission'}</h3>
              <button type="button" className="form-close-btn" onClick={() => setFormOpen(false)}>×</button>
            </div>
            <div className="form-body">
              <div className="form-group">
                <label>Mission Title</label>
                <input 
                  value={title} 
                  onChange={e => setTitle(e.target.value)} 
                  placeholder="e.g. Solve 5 Binary Search problems on LeetCode"
                  required
                />
              </div>

              <div className="form-group">
                <label>Description (Optional details, deliverables, repository links)</label>
                <textarea 
                  value={description} 
                  onChange={e => setDescription(e.target.value)} 
                  placeholder="e.g. Solve Search in Rotated Array, Find Minimum. Push solutions to repo 'dsa-practice'."
                  rows={3}
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="coding">Coding</option>
                    <option value="dsa">DSA</option>
                    <option value="reading">Reading</option>
                    <option value="assignment">Assignment</option>
                    <option value="project">Project</option>
                    <option value="research">Research</option>
                    <option value="communication">Communication</option>
                    <option value="interview_prep">Interview Prep</option>
                    <option value="ai">AI</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>Estimated Duration (Min)</label>
                  <input 
                    type="number" 
                    min="5" 
                    max="480"
                    value={duration} 
                    onChange={e => setDuration(Number(e.target.value))} 
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Deadline (Optional time/date)</label>
                  <input 
                    value={deadline} 
                    onChange={e => setDeadline(e.target.value)} 
                    placeholder="e.g. 17:00 IST or Tonight"
                  />
                </div>
              </div>

              {formError && <p className="error">{formError}</p>}

              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="submit" className="primary" disabled={submitting}>
                  {submitting ? 'Evaluating with AI...' : editingMission ? 'Save Mission' : 'Plan Mission'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
