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
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['contest','🏆 Contests'], ['missions','🎯 Missions']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'contest' && <StudentContestTab email={profile.student.email} />}
      {tab === 'missions' && <StudentMissionsTab email={profile.student.email} />}
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

      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['students','Students'], ['contest-mgr','🏆 Contests'], ['missions-mgr','🎯 Missions']]} />
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
      {tab === 'contest-mgr' && <ContestAdminPanel headers={headers} />}
      {tab === 'missions-mgr' && <MissionAdminPanel headers={headers} />}

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

// ═══════════════════════════════════════════
// CONTEST — AI CONFIG PANEL
// ═══════════════════════════════════════════

function ContestAIConfig({ headers, onBack }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');

  const loadConfig = async () => {
    try {
      const res = await fetch(`${API}/ai-config/config`, { headers });
      if (res.ok) setConfig(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { loadConfig(); }, []);

  const saveConfig = async () => {
    setSaving(true); setMsg('');
    try {
      const res = await fetch(`${API}/ai-config/config`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (!res.ok) { const d = await res.json(); setMsg(d.error || 'Save failed.'); }
      else { setMsg('Configuration saved!'); setConfig(await res.json()); }
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const testConfig = async () => {
    setTesting(true); setMsg('Testing connection...');
    try {
      const res = await fetch(`${API}/ai-config/config/test`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(config) // Send the current (unsaved) apiKey to test
      });
      const data = await res.json();
      if (res.ok) setMsg(`Success! Connected to ${data.model}`);
      else setMsg(data.error || 'Test failed.');
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setTesting(false); }
  };

  if (loading) return <section className="panel"><p>Loading...</p></section>;
  if (!config) return <section className="panel"><p>Failed to load AI Config</p></section>;

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>⚙️ AI Configuration</h2>
        <button className="secondary" onClick={onBack}>Back to Contests</button>
      </div>
      <div className="contest-create-form">
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Provider</label>
          <select value={config.provider} onChange={e => setConfig({...config, provider: e.target.value})} style={{width:'100%', padding:'0.5rem'}}>
            <option value="openai_compatible">OpenAI Compatible (OpenAI, OpenRouter, vLLM, etc.)</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Base URL</label>
          <input value={config.baseUrl || ''} onChange={e => setConfig({...config, baseUrl: e.target.value})} placeholder="e.g. https://api.openai.com/v1" />
        </div>
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Model Name</label>
          <input value={config.modelName || ''} onChange={e => setConfig({...config, modelName: e.target.value})} placeholder="e.g. gpt-4o" />
        </div>
        <div style={{marginBottom:'1rem'}}>
          <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>API Key</label>
          <input type="password" value={config.apiKey || ''} onChange={e => setConfig({...config, apiKey: e.target.value})} placeholder={config.apiKeyConfigured ? `Configured (ends in ${config.apiKeyLast4}) - Type to replace` : "Enter API Key"} />
        </div>
        <div style={{display:'flex', gap:'0.75rem'}}>
          <button className="primary" onClick={saveConfig} disabled={saving}>{saving ? 'Saving...' : 'Save Config'}</button>
          <button className="secondary" onClick={testConfig} disabled={testing}>{testing ? 'Testing...' : 'Test Connection'}</button>
        </div>
        {msg && <p style={{marginTop:'0.5rem', fontWeight:600, color: msg.includes('Error') || msg.includes('fail') ? 'var(--red)' : 'var(--green)'}}>{msg}</p>}
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════
// CONTEST — ADMIN PANEL
// ═══════════════════════════════════════════

function ContestAdminPanel({ headers }) {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState('list'); // list | create | stats | aiconfig
  const [draft, setDraft] = useState(null);
  const [transcript, setTranscript] = useState('');
  const [contestName, setContestName] = useState('');
  const [statsData, setStatsData] = useState(null);
  const [msg, setMsg] = useState('');

  const loadContests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/contest/admin/contests`, { headers });
      if (res.ok) setContests(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { loadContests(); }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setTranscript(ev.target.result);
    reader.readAsText(file);
  };

  const generateDraft = async () => {
    if (!transcript.trim()) return setMsg('Please paste or upload a transcript first.');
    setMsg('Generating draft questions...');
    try {
      const res = await fetch(`${API}/contest/admin/contests/create-from-transcript`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, contestName: contestName || 'Weekend Contest' })
      });
      const data = await res.json();
      if (!res.ok) return setMsg(data.error || 'Failed to generate draft.');
      setDraft(data);
      setMsg('Draft generated! Review and edit questions below, then save.');
    } catch (err) { setMsg('Error: ' + err.message); }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setMsg('Saving...');
    try {
      const res = await fetch(`${API}/contest/admin/contests`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      if (!res.ok) { const d = await res.json(); return setMsg(d.error || 'Save failed.'); }
      setMsg('Contest saved!');
      setDraft(null); setTranscript(''); setContestName('');
      setSubView('list');
      await loadContests();
    } catch (err) { setMsg('Error: ' + err.message); }
  };

  const toggleContest = async (id) => {
    await fetch(`${API}/contest/admin/contests/${id}/toggle`, { method: 'POST', headers });
    await loadContests();
  };

  const loadStats = async (id) => {
    const res = await fetch(`${API}/contest/admin/contests/${id}/stats`, { headers });
    if (res.ok) { setStatsData(await res.json()); setSubView('stats'); }
  };

  const updateDraftQuestion = (index, field, value) => {
    setDraft(prev => {
      const questions = [...prev.questions];
      questions[index] = { ...questions[index], [field]: value };
      return { ...prev, questions };
    });
  };

  const updateDraftOption = (qIndex, oIndex, value) => {
    setDraft(prev => {
      const questions = [...prev.questions];
      const options = [...questions[qIndex].options];
      options[oIndex] = value;
      questions[qIndex] = { ...questions[qIndex], options };
      return { ...prev, questions };
    });
  };

  const removeQuestion = (index) => {
    setDraft(prev => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }));
  };

  const addQuestion = () => {
    setDraft(prev => ({
      ...prev,
      questions: [...prev.questions, { question: 'New question?', options: ['Option A', 'Option B', 'Option C', 'Option D'], correctAnswer: 0, timeLimit: 20 }]
    }));
  };

  // ── LIST VIEW ──
  if (subView === 'list') {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>🏆 Contest Manager</h2>
          <div style={{display:'flex', gap:'0.5rem'}}>
            <button className="primary" onClick={() => { setSubView('create'); setMsg(''); }}>+ New Contest</button>
            <button className="secondary" onClick={() => { setSubView('aiconfig'); setMsg(''); }}>⚙️ AI Config</button>
          </div>
        </div>
        {loading ? <p>Loading...</p> : contests.length === 0 ? <p className="empty">No contests created yet.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Questions</th><th>Threshold</th><th>SP</th><th>Max Attempts</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>{contests.map(c => (
              <tr key={c._id}>
                <td><strong>{c.name}</strong></td>
                <td>{c.questions?.length || 0}</td>
                <td>{c.threshold}%</td>
                <td>{c.spReward}</td>
                <td>{c.maxAttempts || '∞'}</td>
                <td><span style={{color: c.isActive ? '#22c55e' : '#b42318', fontWeight: 700}}>{c.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{display:'flex', gap:'0.5rem'}}>
                    <button className="secondary small" onClick={() => toggleContest(c._id)}>{c.isActive ? 'Deactivate' : 'Activate'}</button>
                    <button className="secondary small" onClick={() => loadStats(c._id)}>Stats</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    );
  }

  // ── AI CONFIG VIEW ──
  if (subView === 'aiconfig') {
    return <ContestAIConfig headers={headers} onBack={() => setSubView('list')} />;
  }

  // ── STATS VIEW ──
  if (subView === 'stats' && statsData) {
    const { contest, stats, attempts } = statsData;
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>📊 {contest.name} — Stats</h2>
          <button className="secondary" onClick={() => { setSubView('list'); setStatsData(null); }}>Back</button>
        </div>
        <div className="metric-grid">
          <Metric label="Participants" value={stats.totalParticipants} />
          <Metric label="Total Attempts" value={stats.totalAttempts} />
          <Metric label="Passed" value={stats.totalPassed} />
          <Metric label="Pass Rate" value={`${stats.passRate}%`} />
          <Metric label="Avg Score" value={`${stats.averageScore}%`} />
        </div>
        {attempts.length > 0 && (
          <div className="matrix-wrap" style={{marginTop:'1rem'}}>
            <table className="table">
              <thead><tr><th>Student</th><th>Email</th><th>Attempt</th><th>Score</th><th>Passed</th><th>Reflection</th><th>SP</th><th>Date</th></tr></thead>
              <tbody>{attempts.map(a => (
                <tr key={a._id}>
                  <td>{a.studentName}</td>
                  <td>{a.studentEmail}</td>
                  <td>#{a.attemptNumber}</td>
                  <td>{a.score}%</td>
                  <td style={{color: a.passed ? '#22c55e' : '#b42318'}}>{a.passed ? 'Yes' : 'No'}</td>
                  <td>{a.reflectionResponse ? '✅' : '—'}</td>
                  <td>{a.earnedSp > 0 ? `+${a.earnedSp}` : '0'}</td>
                  <td>{new Date(a.completedAt).toLocaleString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  // ── CREATE VIEW ──
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>📝 Create New Contest</h2>
        <button className="secondary" onClick={() => { setSubView('list'); setDraft(null); setMsg(''); }}>Back</button>
      </div>

      {!draft ? (
        <div className="contest-create-form">
          <div style={{marginBottom:'1rem'}}>
            <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Contest Name</label>
            <input value={contestName} onChange={e => setContestName(e.target.value)} placeholder="e.g. Weekend Quiz - 5 July" />
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Upload Zoom Transcript (.txt)</label>
            <input type="file" accept=".txt,.csv,.log" onChange={handleFileUpload} />
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Or paste transcript text</label>
            <textarea value={transcript} onChange={e => setTranscript(e.target.value)} rows={6} placeholder="Paste the full Zoom chat/transcript text here..." style={{width:'100%', padding:'0.75rem', fontFamily:'inherit', border:'1px solid var(--line)', borderRadius:'7px', resize:'vertical'}} />
          </div>
          <button className="primary" onClick={generateDraft}>Generate Questions from Transcript</button>
          {msg && <p style={{marginTop:'0.5rem', fontWeight:600, color: msg.includes('Error') || msg.includes('fail') ? 'var(--red)' : 'var(--green)'}}>{msg}</p>}
        </div>
      ) : (
        <div className="contest-draft-editor">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Contest Name</label>
              <input value={draft.name} onChange={e => setDraft(prev => ({...prev, name: e.target.value}))} />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Description</label>
              <input value={draft.description} onChange={e => setDraft(prev => ({...prev, description: e.target.value}))} />
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Threshold %</label>
              <input type="number" value={draft.threshold} onChange={e => setDraft(prev => ({...prev, threshold: Number(e.target.value)}))} />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>SP Reward</label>
              <input type="number" value={draft.spReward} onChange={e => setDraft(prev => ({...prev, spReward: Number(e.target.value)}))} />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Reflection Bonus</label>
              <input type="number" value={draft.reflectionSpBonus} onChange={e => setDraft(prev => ({...prev, reflectionSpBonus: Number(e.target.value)}))} />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Max Attempts (0=∞)</label>
              <input type="number" value={draft.maxAttempts} onChange={e => setDraft(prev => ({...prev, maxAttempts: Number(e.target.value)}))} />
            </div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Scrambled Words (comma-separated)</label>
            <input value={(draft.scrambledWords || []).join(', ')} onChange={e => setDraft(prev => ({...prev, scrambledWords: e.target.value.split(',').map(w => w.trim().toUpperCase()).filter(Boolean)}))} />
          </div>
          <div style={{marginBottom:'1rem'}}>
            <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Reflection Prompt</label>
            <input value={draft.reflectionPrompt} onChange={e => setDraft(prev => ({...prev, reflectionPrompt: e.target.value}))} />
          </div>

          <div className="panel-head" style={{marginBottom:'0.5rem'}}>
            <h3>Questions ({draft.questions.length})</h3>
            <button className="secondary small" onClick={addQuestion}>+ Add Question</button>
          </div>
          {draft.questions.map((q, qi) => (
            <div key={qi} className="contest-question-editor">
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
                <strong>Q{qi + 1}</strong>
                <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                  <label style={{fontSize:'0.85rem'}}>Time (s):</label>
                  <input type="number" value={q.timeLimit} onChange={e => updateDraftQuestion(qi, 'timeLimit', Number(e.target.value))} style={{width:'60px'}} />
                  <button className="secondary small" onClick={() => removeQuestion(qi)}>🗑</button>
                </div>
              </div>
              <input value={q.question} onChange={e => updateDraftQuestion(qi, 'question', e.target.value)} style={{marginBottom:'0.5rem'}} />
              {q.options.map((opt, oi) => (
                <div key={oi} style={{display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.25rem'}}>
                  <input type="radio" name={`correct-${qi}`} checked={q.correctAnswer === oi} onChange={() => updateDraftQuestion(qi, 'correctAnswer', oi)} />
                  <input value={opt} onChange={e => updateDraftOption(qi, oi, e.target.value)} style={{flex:1}} />
                </div>
              ))}
            </div>
          ))}

          <div style={{display:'flex', gap:'0.75rem', marginTop:'1rem'}}>
            <button className="primary" onClick={saveDraft}>Save Contest</button>
            <button className="secondary" onClick={() => { setDraft(null); setMsg(''); }}>Discard Draft</button>
          </div>
          {msg && <p style={{marginTop:'0.5rem', fontWeight:600, color: msg.includes('Error') || msg.includes('fail') ? 'var(--red)' : 'var(--green)'}}>{msg}</p>}
        </div>
      )}
    </section>
  );
}


// ═══════════════════════════════════════════
// CONTEST — STUDENT VIEW
// ═══════════════════════════════════════════

function StudentContestTab({ email }) {
  const [contests, setContests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeContest, setActiveContest] = useState(null);
  const [phase, setPhase] = useState('list'); // list | scramble | quiz | reflection | results
  const [scrambleInputs, setScrambleInputs] = useState([]);
  const [scrambleMsg, setScrambleMsg] = useState('');
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [reflection, setReflection] = useState('');
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadContests();
  }, []);

  const loadContests = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/contest/active`, { headers: { 'x-student-email': email } });
      if (res.ok) setContests(await res.json());
    } finally { setLoading(false); }
  };

  const startContest = (contest) => {
    setActiveContest(contest);
    setAnswers(new Array(contest.questions.length).fill(-1));
    setCurrentQ(0);
    setReflection('');
    setResult(null);
    if (contest.scrambledWords && contest.scrambledWords.length > 0) {
      setScrambleInputs(contest.scrambledWords.map(() => ''));
      setScrambleMsg('');
      setPhase('scramble');
    } else {
      setPhase('quiz');
      setTimeLeft(contest.questions[0]?.timeLimit || 20);
    }
  };

  // Scramble helper: shuffle letters of a word
  const shuffleWord = (word) => {
    const arr = word.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const shuffled = arr.join('');
    return shuffled === word ? arr.reverse().join('') : shuffled;
  };

  const shuffledWords = useMemo(() => {
    if (!activeContest?.scrambledWords) return [];
    return activeContest.scrambledWords.map(w => shuffleWord(w));
  }, [activeContest]);

  const checkScramble = () => {
    const correct = scrambleInputs.every((input, i) =>
      input.trim().toUpperCase() === activeContest.scrambledWords[i].toUpperCase()
    );
    if (correct) {
      setScrambleMsg('');
      setPhase('quiz');
      setTimeLeft(activeContest.questions[0]?.timeLimit || 20);
    } else {
      setScrambleMsg('Some words are incorrect. Try again!');
    }
  };

  // Timer effect for Time Attack mode
  useEffect(() => {
    if (phase !== 'quiz' || !activeContest) return;
    if (timeLeft <= 0) {
      // Auto-advance to next question
      if (currentQ < activeContest.questions.length - 1) {
        setCurrentQ(prev => prev + 1);
        setTimeLeft(activeContest.questions[currentQ + 1]?.timeLimit || 20);
      } else {
        setPhase('reflection');
      }
      return;
    }
    const timer = setTimeout(() => setTimeLeft(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, phase, currentQ]);

  const selectAnswer = (optionIndex) => {
    setAnswers(prev => { const copy = [...prev]; copy[currentQ] = optionIndex; return copy; });
    // Auto-advance after short delay
    setTimeout(() => {
      if (currentQ < activeContest.questions.length - 1) {
        setCurrentQ(prev => prev + 1);
        setTimeLeft(activeContest.questions[currentQ + 1]?.timeLimit || 20);
      } else {
        setPhase('reflection');
      }
    }, 400);
  };

  const submitContest = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/contest/${activeContest._id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-student-email': email },
        body: JSON.stringify({ answers, reflectionResponse: reflection.trim() })
      });
      const data = await res.json();
      if (!res.ok) { setResult({ error: data.error || 'Submission failed' }); setPhase('results'); setSubmitting(false); return; }
      setResult(data);
      setPhase('results');
      await loadContests();
    } catch (err) {
      setResult({ error: err.message });
      setPhase('results');
    }
    setSubmitting(false);
  };

  // ── LIST ──
  if (phase === 'list') {
    if (loading) return <section className="panel"><p>Loading contests...</p></section>;
    if (contests.length === 0) return <section className="panel"><p className="empty">No active contests right now. Check back this weekend!</p></section>;

    return (
      <section className="panel">
        <h2>🏆 Available Contests</h2>
        <div className="cards">
          {contests.map(c => {
            const attemptsLeft = c.maxAttempts > 0 ? c.maxAttempts - c.attemptsCount : null;
            const canAttempt = !c.hasPassed && (attemptsLeft === null || attemptsLeft > 0);
            return (
              <article className="card" key={c._id}>
                <div className="card-head static">
                  <div>
                    <strong>{c.name}</strong>
                    <p style={{margin:0, color:'var(--muted)'}}>{c.description}</p>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <span style={{color:'var(--primary)', fontWeight:700}}>+{c.spReward} SP</span>
                    {c.reflectionSpBonus > 0 && <p style={{margin:0, color:'var(--muted)', fontSize:'0.85rem'}}>+{c.reflectionSpBonus} reflection bonus</p>}
                  </div>
                </div>
                <div style={{padding:'0.75rem', display:'flex', flexWrap:'wrap', gap:'0.75rem', alignItems:'center', justifyContent:'space-between'}}>
                  <div style={{display:'flex', gap:'1rem', flexWrap:'wrap'}}>
                    <span>📝 {c.questions.length} questions</span>
                    <span>🎯 Pass: {c.threshold}%</span>
                    <span>🔄 Attempts: {c.attemptsCount}{c.maxAttempts > 0 ? `/${c.maxAttempts}` : '/∞'}</span>
                    {c.hasPassed && <span style={{color:'var(--green)', fontWeight:700}}>✅ Passed (best: {c.bestScore}%)</span>}
                  </div>
                  {canAttempt ? (
                    <button className="primary" onClick={() => startContest(c)}>{c.attemptsCount > 0 ? 'Retry' : 'Start'}</button>
                  ) : c.hasPassed ? (
                    <span className="muted" style={{fontWeight:600}}>Completed</span>
                  ) : (
                    <span className="muted">No attempts left</span>
                  )}
                </div>
                {c.attempts && c.attempts.length > 0 && (
                  <div style={{padding:'0 0.75rem 0.75rem'}}>
                    <details>
                      <summary style={{cursor:'pointer', fontWeight:600, fontSize:'0.9rem', color:'var(--muted)'}}>Past attempts ({c.attempts.length})</summary>
                      <div style={{marginTop:'0.5rem'}}>
                        {c.attempts.map(a => (
                          <div key={a._id} style={{display:'flex', gap:'1rem', padding:'0.25rem 0', borderTop:'1px solid var(--line)', fontSize:'0.85rem'}}>
                            <span>#{a.attemptNumber}</span>
                            <span>{a.score}%</span>
                            <span style={{color: a.passed ? 'var(--green)' : 'var(--red)'}}>{a.passed ? 'Passed' : 'Failed'}</span>
                            {a.earnedSp > 0 && <span style={{color:'var(--green)'}}>+{a.earnedSp} SP</span>}
                            <span className="muted">{new Date(a.completedAt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  }

  // ── SCRAMBLE ──
  if (phase === 'scramble') {
    return (
      <section className="panel">
        <h2>🔤 Unscramble the Key Words</h2>
        <p className="muted">Rearrange the letters to form the correct word from the session. Get all correct to unlock the quiz!</p>
        <div className="scramble-grid">
          {shuffledWords.map((scrambled, i) => (
            <div key={i} className="scramble-row">
              <div className="scramble-letters">{scrambled.split('').map((ch, ci) => <span key={ci} className="scramble-tile">{ch}</span>)}</div>
              <input
                value={scrambleInputs[i]}
                onChange={e => setScrambleInputs(prev => { const c = [...prev]; c[i] = e.target.value; return c; })}
                placeholder="Type the word"
                className="scramble-input"
              />
            </div>
          ))}
        </div>
        {scrambleMsg && <p className="error" style={{marginTop:'0.5rem'}}>{scrambleMsg}</p>}
        <div style={{display:'flex', gap:'0.75rem', marginTop:'1rem'}}>
          <button className="primary" onClick={checkScramble}>Check Answers</button>
          <button className="secondary" onClick={() => { setPhase('quiz'); setTimeLeft(activeContest.questions[0]?.timeLimit || 20); }}>Skip</button>
          <button className="secondary" onClick={() => { setPhase('list'); setActiveContest(null); }}>Cancel</button>
        </div>
      </section>
    );
  }

  // ── QUIZ ──
  if (phase === 'quiz' && activeContest) {
    const question = activeContest.questions[currentQ];
    const pct = question?.timeLimit ? Math.round((timeLeft / question.timeLimit) * 100) : 100;
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>⏱️ Question {currentQ + 1} of {activeContest.questions.length}</h2>
          <div className="quiz-timer">
            <span className={`timer-text ${timeLeft <= 5 ? 'timer-danger' : ''}`}>{timeLeft}s</span>
          </div>
        </div>
        <div className="quiz-timer-bar"><div className={`quiz-timer-fill ${timeLeft <= 5 ? 'timer-danger-fill' : ''}`} style={{width: `${pct}%`}} /></div>
        <div className="quiz-question">
          <p style={{fontSize:'1.1rem', fontWeight:600, marginBottom:'1rem'}}>{question.question}</p>
          <div className="quiz-options">
            {question.options.map((opt, oi) => (
              <button
                key={oi}
                className={`quiz-option ${answers[currentQ] === oi ? 'selected' : ''}`}
                onClick={() => selectAnswer(oi)}
              >
                <span className="option-letter">{String.fromCharCode(65 + oi)}</span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── REFLECTION ──
  if (phase === 'reflection') {
    return (
      <section className="panel">
        <h2>💭 Reflection</h2>
        <p className="muted">{activeContest.reflectionPrompt}</p>
        {activeContest.reflectionSpBonus > 0 && <p style={{color:'var(--green)', fontWeight:600, fontSize:'0.9rem'}}>Submit a thoughtful reflection to earn +{activeContest.reflectionSpBonus} bonus SP!</p>}
        <textarea
          value={reflection}
          onChange={e => setReflection(e.target.value)}
          rows={4}
          placeholder="Share your thoughts..."
          style={{width:'100%', padding:'0.75rem', fontFamily:'inherit', border:'1px solid var(--line)', borderRadius:'7px', resize:'vertical'}}
        />
        <div style={{display:'flex', gap:'0.75rem', marginTop:'1rem'}}>
          <button className="primary" onClick={submitContest} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Quiz & Reflection'}</button>
          <button className="secondary" onClick={submitContest} disabled={submitting}>Skip Reflection & Submit</button>
        </div>
      </section>
    );
  }

  // ── RESULTS ──
  if (phase === 'results' && result) {
    if (result.error) {
      return (
        <section className="panel">
          <h2>❌ Submission Error</h2>
          <p className="error">{result.error}</p>
          <button className="secondary" onClick={() => { setPhase('list'); setActiveContest(null); }}>Back to Contests</button>
        </section>
      );
    }
    const { attempt, correctAnswers, score, passed, earnedSp, awardReflection } = result;
    return (
      <section className="panel">
        <h2>{passed ? '🎉 Congratulations!' : '📋 Quiz Complete'}</h2>
        <div className="metric-grid" style={{marginBottom:'1rem'}}>
          <Metric label="Score" value={`${score}%`} />
          <Metric label="Result" value={passed ? '✅ Passed' : '❌ Not passed'} />
          <Metric label="SP Earned" value={earnedSp > 0 ? `+${earnedSp}` : '0'} />
          {awardReflection && <Metric label="Reflection" value="✅ Bonus!" />}
        </div>

        <h3>Answer Review</h3>
        <div className="quiz-review">
          {activeContest.questions.map((q, qi) => {
            const isCorrect = answers[qi] === correctAnswers[qi];
            return (
              <div key={qi} className={`review-item ${isCorrect ? 'correct' : 'incorrect'}`}>
                <p style={{fontWeight:600}}>Q{qi+1}: {q.question}</p>
                <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap'}}>
                  {q.options.map((opt, oi) => (
                    <span key={oi} style={{
                      padding:'0.25rem 0.75rem', borderRadius:'4px', fontSize:'0.85rem',
                      background: oi === correctAnswers[qi] ? '#dcfce7' : oi === answers[qi] ? '#fecaca' : '#f1f5f9',
                      color: oi === correctAnswers[qi] ? '#166534' : oi === answers[qi] ? '#991b1b' : 'var(--muted)',
                      fontWeight: oi === correctAnswers[qi] || oi === answers[qi] ? 700 : 400
                    }}>
                      {String.fromCharCode(65 + oi)}: {opt}
                      {oi === correctAnswers[qi] && ' ✓'}
                      {oi === answers[qi] && oi !== correctAnswers[qi] && ' ✗'}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <button className="primary" onClick={() => { setPhase('list'); setActiveContest(null); }} style={{marginTop:'1rem'}}>Back to Contests</button>
      </section>
    );
  }

  return <section className="panel"><p>Loading...</p></section>;
}

// ═══════════════════════════════════════════
// RECOVERY MISSIONS — STUDENT VIEW
// ═══════════════════════════════════════════

const CATEGORY_ICONS = { learning: '📚', health: '💪', productivity: '⚡', career: '💼', finance: '💰' };
const DURATION_LABELS = { '1d': '1 Day', '3d': '3 Days', '7d': '1 Week', '30d': '30 Days' };
const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };

function StudentMissionsTab({ email }) {
  const [view, setView] = useState('home'); // home | active | history
  const [recommendations, setRecommendations] = useState([]);
  const [setbacks, setSetbacks] = useState([]);
  const [myMissions, setMyMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  const headers = { 'x-student-email': email };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [recRes, myRes] = await Promise.all([
        fetch(`${API}/missions/recommended`, { headers }),
        fetch(`${API}/missions/my-missions`, { headers })
      ]);
      if (recRes.ok) {
        const data = await recRes.json();
        setRecommendations(data.recommendations || []);
        setSetbacks(data.setbacks || []);
      }
      if (myRes.ok) setMyMissions(await myRes.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);

  const acceptMission = async (id) => {
    setActionMsg('');
    const res = await fetch(`${API}/missions/${id}/accept`, {
      method: 'POST', headers
    });
    if (res.ok) { setActionMsg('Mission accepted! 🎯'); await loadAll(); }
    else { const d = await res.json(); setActionMsg(d.error || 'Failed to accept'); }
  };

  const completeTask = async (attemptId, taskIndex) => {
    const res = await fetch(`${API}/missions/${attemptId}/task/${taskIndex}`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidenceNote: '' })
    });
    if (res.ok) await loadAll();
  };

  const completeMission = async (attemptId, reflection) => {
    setActionMsg('');
    const res = await fetch(`${API}/missions/${attemptId}/complete`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reflection })
    });
    if (res.ok) {
      const data = await res.json();
      setActionMsg(`Mission complete! +${data.earnedSp} SP earned 🎉`);
      await loadAll();
    } else {
      const d = await res.json();
      setActionMsg(d.error || 'Failed to complete');
    }
  };

  const abandonMission = async (attemptId) => {
    if (!confirm('Are you sure you want to abandon this mission?')) return;
    const res = await fetch(`${API}/missions/${attemptId}/abandon`, {
      method: 'POST', headers
    });
    if (res.ok) { setActionMsg('Mission abandoned.'); await loadAll(); }
  };

  if (loading) return <section className="panel"><p>Loading missions...</p></section>;

  const activeMissions = myMissions.filter(m => m.status === 'active');
  const completedMissions = myMissions.filter(m => m.status === 'completed');
  const failedMissions = myMissions.filter(m => ['failed', 'abandoned'].includes(m.status));

  return (
    <section className="panel">
      {actionMsg && <p style={{padding:'0.75rem', fontWeight:600, color: actionMsg.includes('Failed') || actionMsg.includes('failed') || actionMsg.includes('abandoned') ? 'var(--red)' : 'var(--green)', background: 'var(--card)', borderRadius:'7px', marginBottom:'0.75rem'}}>{actionMsg}</p>}

      {/* Setback alerts */}
      {setbacks.length > 0 && (
        <div style={{background:'linear-gradient(135deg, #fef2f2, #fff7ed)', border:'1px solid #fecaca', borderRadius:'10px', padding:'1rem', marginBottom:'1rem'}}>
          <strong style={{color:'#b91c1c'}}>⚠️ Setbacks Detected</strong>
          <div style={{display:'flex', gap:'0.5rem', flexWrap:'wrap', marginTop:'0.5rem'}}>
            {setbacks.map((s, i) => (
              <span key={i} style={{background:'#fee2e2', color:'#991b1b', padding:'0.25rem 0.75rem', borderRadius:'20px', fontSize:'0.8rem', fontWeight:600}}>
                {s.type === 'sp_drop' && `SP dropped by ${s.severity}`}
                {s.type === 'missed_attendance' && `Missed ${s.severity} sessions`}
                {s.type === 'contest_fail' && `${s.severity} failed contest(s)`}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{display:'flex', gap:'0.5rem', marginBottom:'1rem'}}>
        <button className={view === 'home' ? 'primary' : 'secondary'} onClick={() => setView('home')} style={{fontSize:'0.85rem'}}>🎯 Recommended ({recommendations.length})</button>
        <button className={view === 'active' ? 'primary' : 'secondary'} onClick={() => setView('active')} style={{fontSize:'0.85rem'}}>🔥 Active ({activeMissions.length})</button>
        <button className={view === 'history' ? 'primary' : 'secondary'} onClick={() => setView('history')} style={{fontSize:'0.85rem'}}>📋 History ({completedMissions.length + failedMissions.length})</button>
      </div>

      {/* RECOMMENDED VIEW */}
      {view === 'home' && (
        <>
          <h2 style={{marginBottom:'0.75rem'}}>🎯 Recovery Missions For You</h2>
          {recommendations.length === 0 ? (
            <p className="empty">No missions available right now. You're doing great! 🌟</p>
          ) : (
            <div className="cards">
              {recommendations.map(m => (
                <article className="card" key={m._id} style={{position:'relative', overflow:'hidden'}}>
                  <div style={{position:'absolute', top:0, right:0, background: PRIORITY_COLORS[m.priority], color:'#fff', padding:'0.2rem 0.75rem', borderRadius:'0 0 0 10px', fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase'}}>{m.priority}</div>
                  <div className="card-head static">
                    <strong>{CATEGORY_ICONS[m.category] || '📋'} {m.name}</strong>
                    <span style={{background:'var(--bg)', padding:'0.2rem 0.5rem', borderRadius:'5px', fontSize:'0.75rem'}}>{DURATION_LABELS[m.duration]}</span>
                  </div>
                  <p style={{color:'var(--muted)', fontSize:'0.9rem', margin:'0.5rem 0'}}>{m.description || 'No description'}</p>
                  <div style={{display:'flex', gap:'1rem', flexWrap:'wrap', alignItems:'center', marginTop:'0.5rem'}}>
                    <span style={{fontSize:'0.8rem', fontWeight:600}}>🏆 +{m.spReward} SP</span>
                    {m.reflectionSpBonus > 0 && <span style={{fontSize:'0.8rem', color:'var(--muted)'}}>+{m.reflectionSpBonus} reflection bonus</span>}
                    <span style={{fontSize:'0.8rem', color:'var(--muted)'}}>📝 {m.tasks?.length || 0} tasks</span>
                    <span style={{fontSize:'0.75rem', padding:'0.15rem 0.5rem', borderRadius:'10px', background: m.difficulty === 'hard' ? '#fee2e2' : m.difficulty === 'easy' ? '#dcfce7' : '#fef3c7', color: m.difficulty === 'hard' ? '#991b1b' : m.difficulty === 'easy' ? '#166534' : '#92400e', fontWeight:600}}>{m.difficulty}</span>
                  </div>
                  <button className="primary" onClick={() => acceptMission(m._id)} style={{marginTop:'0.75rem', width:'100%'}}>Accept Mission</button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {/* ACTIVE MISSIONS VIEW */}
      {view === 'active' && (
        <>
          <h2 style={{marginBottom:'0.75rem'}}>🔥 Active Missions</h2>
          {activeMissions.length === 0 ? (
            <p className="empty">No active missions. Browse recommendations to get started!</p>
          ) : (
            <div className="cards">
              {activeMissions.map(a => {
                const m = a.mission;
                if (!m) return null;
                const done = a.taskProgress.filter(t => t.completed).length;
                const total = a.taskProgress.length;
                const pct = total > 0 ? Math.round(done / total * 100) : 0;
                const daysLeft = Math.max(0, Math.ceil((new Date(a.dueAt) - new Date()) / 86400000));
                const allDone = done === total;
                return (
                  <article className="card" key={a._id}>
                    <div className="card-head static">
                      <strong>{CATEGORY_ICONS[m.category] || '📋'} {m.name}</strong>
                      <span style={{fontSize:'0.8rem', color: daysLeft <= 1 ? 'var(--red)' : 'var(--muted)'}}>{daysLeft}d left</span>
                    </div>
                    {/* Progress bar */}
                    <div style={{background:'var(--line)', borderRadius:'10px', height:'8px', margin:'0.5rem 0', overflow:'hidden'}}>
                      <div style={{background: pct === 100 ? '#22c55e' : 'var(--accent)', width:`${pct}%`, height:'100%', borderRadius:'10px', transition:'width 0.3s ease'}} />
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'var(--muted)'}}>
                      <span>{done}/{total} tasks • {pct}%</span>
                      <span>🔥 {a.streak} day streak</span>
                    </div>
                    {/* Task checklist */}
                    <div style={{marginTop:'0.75rem'}}>
                      {m.tasks.map((task, ti) => {
                        const tp = a.taskProgress.find(t => t.taskIndex === ti);
                        const isDone = tp?.completed;
                        return (
                          <div key={ti} style={{display:'flex', gap:'0.5rem', alignItems:'flex-start', padding:'0.4rem 0', borderBottom:'1px solid var(--line)'}}>
                            <button onClick={() => !isDone && completeTask(a._id, ti)} disabled={isDone} style={{
                              width:'22px', height:'22px', borderRadius:'5px', border: isDone ? 'none' : '2px solid var(--line)', background: isDone ? '#22c55e' : 'transparent',
                              color:'#fff', fontSize:'0.7rem', cursor: isDone ? 'default' : 'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', marginTop:'2px'
                            }}>{isDone ? '✓' : ''}</button>
                            <div style={{flex:1}}>
                              <span style={{fontWeight:600, textDecoration: isDone ? 'line-through' : 'none', opacity: isDone ? 0.6 : 1, fontSize:'0.9rem'}}>Day {task.day}: {task.title}</span>
                              {task.description && <p style={{fontSize:'0.8rem', color:'var(--muted)', margin:'0.15rem 0 0'}}>{task.description}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Action buttons */}
                    <div style={{display:'flex', gap:'0.5rem', marginTop:'0.75rem'}}>
                      {allDone && <MissionCompleteButton attemptId={a._id} onComplete={completeMission} reflectionBonus={m.reflectionSpBonus} />}
                      <button className="secondary" onClick={() => abandonMission(a._id)} style={{fontSize:'0.8rem'}}>Abandon</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* HISTORY VIEW */}
      {view === 'history' && (
        <>
          <h2 style={{marginBottom:'0.75rem'}}>📋 Mission History</h2>
          {completedMissions.length + failedMissions.length === 0 ? (
            <p className="empty">No mission history yet.</p>
          ) : (
            <div className="cards">
              {[...completedMissions, ...failedMissions].map(a => {
                const m = a.mission;
                return (
                  <article className="card" key={a._id}>
                    <div className="card-head static">
                      <strong>{m ? `${CATEGORY_ICONS[m.category] || '📋'} ${m.name}` : 'Unknown Mission'}</strong>
                      <span style={{
                        padding:'0.2rem 0.5rem', borderRadius:'5px', fontSize:'0.75rem', fontWeight:700,
                        background: a.status === 'completed' ? '#dcfce7' : '#fee2e2',
                        color: a.status === 'completed' ? '#166534' : '#991b1b'
                      }}>{a.status === 'completed' ? '✅ Completed' : a.status === 'failed' ? '❌ Failed' : '🚪 Abandoned'}</span>
                    </div>
                    <div style={{display:'flex', gap:'1rem', fontSize:'0.8rem', color:'var(--muted)', marginTop:'0.25rem'}}>
                      {a.earnedSp > 0 && <span style={{color:'var(--green)', fontWeight:600}}>+{a.earnedSp} SP</span>}
                      <span>🔥 {a.streak} day streak</span>
                      {a.completedAt && <span>Finished {new Date(a.completedAt).toLocaleDateString()}</span>}
                    </div>
                    {a.reflection && (
                      <details style={{marginTop:'0.5rem'}}>
                        <summary style={{cursor:'pointer', fontSize:'0.85rem', fontWeight:600}}>📝 Reflection</summary>
                        <p style={{fontSize:'0.85rem', color:'var(--muted)', marginTop:'0.25rem', whiteSpace:'pre-wrap'}}>{a.reflection}</p>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MissionCompleteButton({ attemptId, onComplete, reflectionBonus }) {
  const [showReflection, setShowReflection] = useState(false);
  const [reflection, setReflection] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!showReflection) {
    return <button className="primary" onClick={() => setShowReflection(true)} style={{fontSize:'0.85rem'}}>🎉 Complete Mission</button>;
  }

  return (
    <div style={{width:'100%'}}>
      <p style={{fontWeight:700, marginBottom:'0.25rem', fontSize:'0.9rem'}}>📝 Mission Reflection</p>
      {reflectionBonus > 0 && <p style={{fontSize:'0.8rem', color:'var(--green)', marginBottom:'0.5rem'}}>Write a thoughtful reflection (20+ chars) to earn +{reflectionBonus} bonus SP!</p>}
      <textarea value={reflection} onChange={e => setReflection(e.target.value)} rows={3} placeholder="What did you learn? How did this mission help you recover?" style={{width:'100%', padding:'0.5rem', fontFamily:'inherit', border:'1px solid var(--line)', borderRadius:'7px', resize:'vertical', marginBottom:'0.5rem'}} />
      <div style={{display:'flex', gap:'0.5rem'}}>
        <button className="primary" onClick={async () => { setSubmitting(true); await onComplete(attemptId, reflection); setSubmitting(false); }} disabled={submitting} style={{fontSize:'0.85rem'}}>{submitting ? 'Submitting...' : 'Submit'}</button>
        <button className="secondary" onClick={async () => { setSubmitting(true); await onComplete(attemptId, ''); setSubmitting(false); }} disabled={submitting} style={{fontSize:'0.85rem'}}>Skip Reflection</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// RECOVERY MISSIONS — ADMIN PANEL
// ═══════════════════════════════════════════

function MissionAdminPanel({ headers }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState('list'); // list | create | stats
  const [draft, setDraft] = useState(null);
  const [statsData, setStatsData] = useState(null);
  const [msg, setMsg] = useState('');

  const loadMissions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/missions/admin/missions`, { headers });
      if (res.ok) setMissions(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { loadMissions(); }, []);

  const newDraft = () => ({
    name: '', description: '', category: 'learning', duration: '7d',
    priority: 'medium', difficulty: 'medium', spReward: 10, reflectionSpBonus: 5,
    tasks: [{ day: 1, title: '', description: '', evidenceRequired: false }],
    triggerConditions: [{ type: 'manual', threshold: 0 }],
    isActive: false
  });

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.name.trim()) return setMsg('Mission name is required.');
    setMsg('Saving...');
    try {
      const url = draft._id
        ? `${API}/missions/admin/missions/${draft._id}`
        : `${API}/missions/admin/missions`;
      const res = await fetch(url, {
        method: draft._id ? 'PUT' : 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      if (!res.ok) { const d = await res.json(); return setMsg(d.error || 'Save failed.'); }
      setMsg('Mission saved!');
      setDraft(null);
      setSubView('list');
      await loadMissions();
    } catch (err) { setMsg('Error: ' + err.message); }
  };

  const toggleMission = async (id) => {
    await fetch(`${API}/missions/admin/missions/${id}/toggle`, { method: 'POST', headers });
    await loadMissions();
  };

  const loadStats = async (id) => {
    const res = await fetch(`${API}/missions/admin/missions/${id}/stats`, { headers });
    if (res.ok) { setStatsData(await res.json()); setSubView('stats'); }
  };

  const updateTask = (index, field, value) => {
    setDraft(prev => {
      const tasks = [...prev.tasks];
      tasks[index] = { ...tasks[index], [field]: value };
      return { ...prev, tasks };
    });
  };

  const addTask = () => {
    setDraft(prev => ({
      ...prev,
      tasks: [...prev.tasks, { day: prev.tasks.length + 1, title: '', description: '', evidenceRequired: false }]
    }));
  };

  const removeTask = (index) => {
    setDraft(prev => ({ ...prev, tasks: prev.tasks.filter((_, i) => i !== index) }));
  };

  const updateTrigger = (index, field, value) => {
    setDraft(prev => {
      const triggers = [...prev.triggerConditions];
      triggers[index] = { ...triggers[index], [field]: value };
      return { ...prev, triggerConditions: triggers };
    });
  };

  const addTrigger = () => {
    setDraft(prev => ({
      ...prev,
      triggerConditions: [...prev.triggerConditions, { type: 'manual', threshold: 0 }]
    }));
  };

  const removeTrigger = (index) => {
    setDraft(prev => ({ ...prev, triggerConditions: prev.triggerConditions.filter((_, i) => i !== index) }));
  };

  // ── LIST VIEW ──
  if (subView === 'list') {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>🎯 Mission Manager</h2>
          <button className="primary" onClick={() => { setDraft(newDraft()); setSubView('create'); setMsg(''); }}>+ New Mission</button>
        </div>
        {loading ? <p>Loading...</p> : missions.length === 0 ? <p className="empty">No missions created yet.</p> : (
          <table className="table">
            <thead><tr><th>Name</th><th>Category</th><th>Duration</th><th>SP</th><th>Priority</th><th>Tasks</th><th>Participants</th><th>Active</th><th>Actions</th></tr></thead>
            <tbody>{missions.map(m => (
              <tr key={m._id}>
                <td><strong>{m.name}</strong></td>
                <td>{CATEGORY_ICONS[m.category] || '📋'} {m.category}</td>
                <td>{DURATION_LABELS[m.duration]}</td>
                <td>{m.spReward}</td>
                <td><span style={{color: PRIORITY_COLORS[m.priority], fontWeight:700, textTransform:'uppercase', fontSize:'0.8rem'}}>{m.priority}</span></td>
                <td>{m.tasks?.length || 0}</td>
                <td>{m.participantCount || 0}</td>
                <td><span style={{color: m.isActive ? '#22c55e' : '#b42318', fontWeight:700}}>{m.isActive ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div style={{display:'flex', gap:'0.5rem'}}>
                    <button className="secondary small" onClick={() => toggleMission(m._id)}>{m.isActive ? 'Deactivate' : 'Activate'}</button>
                    <button className="secondary small" onClick={() => { setDraft(m); setSubView('create'); setMsg(''); }}>Edit</button>
                    <button className="secondary small" onClick={() => loadStats(m._id)}>Stats</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    );
  }

  // ── STATS VIEW ──
  if (subView === 'stats' && statsData) {
    const { mission, stats, attempts } = statsData;
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>📊 {mission.name} — Stats</h2>
          <button className="secondary" onClick={() => { setSubView('list'); setStatsData(null); }}>Back</button>
        </div>
        <div className="metric-grid">
          <Metric label="Participants" value={stats.totalParticipants} />
          <Metric label="Active" value={stats.active} />
          <Metric label="Completed" value={stats.completed} />
          <Metric label="Failed" value={stats.failed} />
          <Metric label="Abandoned" value={stats.abandoned} />
          <Metric label="Completion Rate" value={`${stats.completionRate}%`} />
          <Metric label="Avg Streak" value={stats.avgStreak} />
          <Metric label="SP Awarded" value={stats.totalSpAwarded} />
        </div>
        {attempts.length > 0 && (
          <div className="matrix-wrap" style={{marginTop:'1rem'}}>
            <table className="table">
              <thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Tasks Done</th><th>Streak</th><th>SP</th><th>Date</th></tr></thead>
              <tbody>{attempts.map(a => (
                <tr key={a._id}>
                  <td>{a.studentName}</td>
                  <td>{a.studentEmail}</td>
                  <td><span style={{color: a.status === 'completed' ? '#22c55e' : a.status === 'active' ? 'var(--accent)' : '#b42318', fontWeight:700}}>{a.status}</span></td>
                  <td>{a.taskProgress?.filter(t => t.completed).length || 0}/{a.taskProgress?.length || 0}</td>
                  <td>{a.streak}</td>
                  <td>{a.earnedSp > 0 ? `+${a.earnedSp}` : '0'}</td>
                  <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  // ── CREATE/EDIT VIEW ──
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{draft?._id ? '✏️ Edit Mission' : '📝 Create New Mission'}</h2>
        <button className="secondary" onClick={() => { setSubView('list'); setDraft(null); setMsg(''); }}>Back</button>
      </div>
      {draft && (
        <div className="contest-create-form">
          {/* Basic info */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Mission Name</label>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="e.g. Attendance Recovery Sprint" />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Description</label>
              <input value={draft.description} onChange={e => setDraft({...draft, description: e.target.value})} placeholder="Brief description..." />
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Category</label>
              <select value={draft.category} onChange={e => setDraft({...draft, category: e.target.value})} style={{width:'100%', padding:'0.5rem'}}>
                <option value="learning">📚 Learning</option>
                <option value="health">💪 Health</option>
                <option value="productivity">⚡ Productivity</option>
                <option value="career">💼 Career</option>
                <option value="finance">💰 Finance</option>
              </select>
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Duration</label>
              <select value={draft.duration} onChange={e => setDraft({...draft, duration: e.target.value})} style={{width:'100%', padding:'0.5rem'}}>
                <option value="1d">1 Day</option>
                <option value="3d">3 Days</option>
                <option value="7d">1 Week</option>
                <option value="30d">30 Days</option>
              </select>
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Priority</label>
              <select value={draft.priority} onChange={e => setDraft({...draft, priority: e.target.value})} style={{width:'100%', padding:'0.5rem'}}>
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
              </select>
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Difficulty</label>
              <select value={draft.difficulty} onChange={e => setDraft({...draft, difficulty: e.target.value})} style={{width:'100%', padding:'0.5rem'}}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem'}}>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>SP Reward</label>
              <input type="number" value={draft.spReward} onChange={e => setDraft({...draft, spReward: Number(e.target.value)})} />
            </div>
            <div>
              <label style={{fontWeight:700, display:'block', marginBottom:'0.25rem'}}>Reflection Bonus SP</label>
              <input type="number" value={draft.reflectionSpBonus} onChange={e => setDraft({...draft, reflectionSpBonus: Number(e.target.value)})} />
            </div>
          </div>

          {/* Trigger conditions */}
          <div style={{marginBottom:'1rem'}}>
            <div className="panel-head" style={{marginBottom:'0.5rem'}}>
              <h3>⚡ Trigger Conditions ({draft.triggerConditions.length})</h3>
              <button className="secondary small" onClick={addTrigger}>+ Add Trigger</button>
            </div>
            <p style={{fontSize:'0.8rem', color:'var(--muted)', marginBottom:'0.5rem'}}>Defines which setbacks will cause this mission to be recommended to students.</p>
            {draft.triggerConditions.map((t, ti) => (
              <div key={ti} style={{display:'flex', gap:'0.5rem', alignItems:'center', marginBottom:'0.5rem'}}>
                <select value={t.type} onChange={e => updateTrigger(ti, 'type', e.target.value)} style={{flex:2, padding:'0.5rem'}}>
                  <option value="sp_drop">SP Drop</option>
                  <option value="missed_attendance">Missed Attendance</option>
                  <option value="contest_fail">Contest Fail</option>
                  <option value="manual">Manual (always visible)</option>
                </select>
                <input type="number" value={t.threshold} onChange={e => updateTrigger(ti, 'threshold', Number(e.target.value))} placeholder="Threshold" style={{flex:1}} />
                <button className="secondary small" onClick={() => removeTrigger(ti)}>🗑</button>
              </div>
            ))}
          </div>

          {/* Tasks */}
          <div style={{marginBottom:'1rem'}}>
            <div className="panel-head" style={{marginBottom:'0.5rem'}}>
              <h3>📝 Daily Tasks ({draft.tasks.length})</h3>
              <button className="secondary small" onClick={addTask}>+ Add Task</button>
            </div>
            {draft.tasks.map((task, ti) => (
              <div key={ti} className="contest-question-editor">
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
                  <strong>Day {task.day}</strong>
                  <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
                    <label style={{fontSize:'0.85rem'}}>Day:</label>
                    <input type="number" value={task.day} onChange={e => updateTask(ti, 'day', Number(e.target.value))} style={{width:'60px'}} />
                    <button className="secondary small" onClick={() => removeTask(ti)}>🗑</button>
                  </div>
                </div>
                <input value={task.title} onChange={e => updateTask(ti, 'title', e.target.value)} placeholder="Task title..." style={{marginBottom:'0.25rem'}} />
                <input value={task.description} onChange={e => updateTask(ti, 'description', e.target.value)} placeholder="Task description (optional)..." />
              </div>
            ))}
          </div>

          <div style={{display:'flex', gap:'0.75rem', marginTop:'1rem'}}>
            <button className="primary" onClick={saveDraft}>Save Mission</button>
            <button className="secondary" onClick={() => { setDraft(null); setMsg(''); }}>Discard</button>
          </div>
          {msg && <p style={{marginTop:'0.5rem', fontWeight:600, color: msg.includes('Error') || msg.includes('fail') || msg.includes('required') ? 'var(--red)' : 'var(--green)'}}>{msg}</p>}
        </div>
      )}
    </section>
  );
}
=======
>>>>>>> upstream/main

createRoot(document.getElementById('root')).render(<App />);
