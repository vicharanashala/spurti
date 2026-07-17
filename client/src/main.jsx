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
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['challenges','Challenges']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'challenges' && <ChallengesView studentEmail={student.email} profile={profile} />}
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


function ChallengesView({ studentEmail, profile }) {
  const [squad, setSquad] = useState(null);
  const [invites, setInvites] = useState([]);
  const [sentInvites, setSentInvites] = useState([]);
  const [challengeProgress, setChallengeProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaveError, setLeaveError] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [showInviteSearch, setShowInviteSearch] = useState(false);
  const lastSearchQuery = useRef("");


  const API = `${window.location.pathname.startsWith("/spurti") ? "/spurti" : ""}/api`;

  async function loadSquad() {
    try {
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      const qs = sid && em ? `?studentId=${encodeURIComponent(sid)}&email=${encodeURIComponent(em)}` : '';
      const res = await fetch(`${API}/squad/my${qs}`, { credentials: 'same-origin' });
      const data = await res.json();
      setSquad(data.squad);
      setSentInvites(data.squad?.sentInvites || []);
    } catch (e) { console.error("Failed to load squad", e); }
  }

  async function loadInvites() {
    try {
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      const qs = sid && em ? `?studentId=${encodeURIComponent(sid)}&email=${encodeURIComponent(em)}` : '';
      const res = await fetch(`${API}/squad/invites${qs}`, { credentials: 'same-origin' });
      const data = await res.json();
      setInvites(data.invites || []);
    } catch (e) { console.error("Failed to load invites", e); }
  }

  async function loadChallengeProgress() {
    try {
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      const qs = sid && em ? `?studentId=${encodeURIComponent(sid)}&email=${encodeURIComponent(em)}` : '';
      const res = await fetch(`${API}/challenges/progress${qs}`, { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setChallengeProgress(data);
      }
    } catch (e) { console.error("Failed to load challenge progress", e); }
  }

  useEffect(() => {
    async function load() {
      await Promise.all([loadSquad(), loadInvites(), loadChallengeProgress()]);
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreate() {
    if (!squadName.trim()) return;
    setError("");
    try {
      const body = { name: squadName.trim() };
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      if (sid && em) { body.studentId = sid; body.email = em; }
      const res = await fetch(`${API}/squad/create`, {
        method: "POST", credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSquad(data.squad);
      setShowCreate(false);
      setSquadName("");
      setSuccess("Squad created!");
      loadChallengeProgress();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Network error"); }
  }

  async function handleLeave() {
    setLeaveError("");
    try {
      const body = {};
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      if (sid && em) { body.studentId = sid; body.email = em; }
      const res = await fetch(`${API}/squad/leave`, { method: "POST", credentials: 'same-origin', headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setLeaveError(data.error); return; }
      setSquad(null);
      setConfirmLeave(false);
      setSuccess("Left squad");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setLeaveError("Network error"); }
  }

  async function handleSearch() {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    lastSearchQuery.current = q;
    setSearching(true);
    try {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
      if (lastSearchQuery.current !== q) return; // stale response
      const data = await res.json();
      if (lastSearchQuery.current !== q) return;
      setSearchResults(data.matches || []);
    } catch (e) { /* ignore */ } finally {
      if (lastSearchQuery.current === q) setSearching(false);
    }
  }

  async function handleInvite(item) {
    setError("");
    try {
      const body = { studentId: item._id };
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      if (sid && em) { body.senderStudentId = sid; body.senderEmail = em; }
      const res = await fetch(`${API}/squad/invite`, {
        method: "POST", credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuccess("Invite sent!");
      setSearchQuery("");
      setSearchResults([]);
      loadSquad();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Network error"); }
  }

  async function handleRespond(squadId, action) {
    setError("");
    try {
      const body = { action };
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      if (sid && em) { body.studentId = sid; body.email = em; }
      const res = await fetch(`${API}/squad/invites/${squadId}/respond`, {
        method: "POST", credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      if (action === "accept") {
        setSuccess("Joined squad!");
        setSquad(data.squad);
        loadSquad();
        loadChallengeProgress();
      } else {
        loadInvites();
      }
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Network error"); }
  }

  async function handleCancelInvite(targetEmail) {
    setError("");
    try {
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      const body = { squadId: squad.id, email: targetEmail };
      if (sid && em) { body.senderStudentId = sid; body.senderEmail = em; }
      const res = await fetch(`${API}/squad/invites/${squad.id}/cancel`, {
        method: "POST", credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSuccess("Invite cancelled");
      setSentInvites(prev => prev.filter(i => i.email !== targetEmail));
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Network error"); }
  }

  async function handleRenameSave() {
    const trimmed = newSquadName.trim();
    if (!trimmed || trimmed === squad.name) {
      setEditingName(false);
      setNewSquadName(squad.name);
      return;
    }
    setError("");
    try {
      const sid = profile?.student?._id;
      const em = profile?.student?.email;
      const body = { squadId: squad.id, name: trimmed };
      if (sid && em) { body.studentId = sid; body.email = em; }
      const res = await fetch(`${API}/squad/rename`, {
        method: "POST", credentials: 'same-origin',
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setSquad(prev => ({ ...prev, name: trimmed }));
      setEditingName(false);
      setSuccess("Squad renamed");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) { setError("Network error"); }
  }


  const maxMembers = 5;
  const spotsLeft = squad ? maxMembers - squad.members.length : 0;
  const cp = challengeProgress;

  function ProgressBar({ pct, colorClass = "progress-green" }) {
    return (
      <div className="progress-bar">
        <div className={colorClass} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    );
  }

  function ChallengeCard({ title, subtitle, badge, badgeVariant, action, children }) {
    return (
      <div className="challenge-card">
        <div className="challenge-card-content">
          <div className="challenge-card-header">
            <h3>{title}</h3>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <div className="challenge-card-body">
            {children}
          </div>
          <div className="challenge-card-footer">
            {badge && <span className={`badge badge-${badgeVariant || 'inactive'}`}>{badge}</span>}
            {action}
          </div>
        </div>
      </div>
    );
  }

  if (loading) return <section className="panel"><p className="muted">Loading challenges...</p></section>;

  return (
    <section className="panel">
      <div className="challenges-grid">
        <div className="challenge-cards">

          {/* ── Squad Perfect Week Card ── */}
          <ChallengeCard
            title="Squad Perfect Week"
            subtitle="All squad members must attend every session this week for a 1.1x SP boost for everyone."
            badge={squad ? "Enrolled" : "Not Enrolled"}
            badgeVariant={squad ? "active" : "inactive"}
            action={
              <button
                className="primary"
                onClick={() => !squad && setShowCreate(true)}
                disabled={!!squad}
              >
                {squad ? "JOINED" : "JOIN"}
              </button>
            }
          >
            {squad ? (
              squad.challengeStatus && squad.challengeStatus.sessions.length > 0 ? (
                <div className="challenge-progress-list">
                  {squad.challengeStatus.sessions.map(s => (
                    <div key={s.label} className="challenge-progress-item">
                      <span>{s.label}</span>
                      <span>{s.memberAttendance.filter(m => m.qualified === true).length}/{s.memberAttendance.length} qualified</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">No sessions scheduled this week. The challenge will activate when sessions begin.</p>
              )
            ) : (
              <p className="muted">Create or join a squad to participate in the weekly challenge.</p>
            )}
          </ChallengeCard>

          {/* ── Individual Perfect Week Card ── */}
          <ChallengeCard
            title="Perfect Week"
            subtitle="Attend every session this week. Consistency pays off!"
            badge="Active"
            badgeVariant="active"
            action={<button className="primary">JOIN</button>}
          >
            {cp && cp.individualPerfectWeek.total > 0 ? (
              <div>
                <div className="challenge-progress-summary">
                  <span>{cp.individualPerfectWeek.attended}/{cp.individualPerfectWeek.total} sessions</span>
                  <span>{Math.round(cp.individualPerfectWeek.attended / cp.individualPerfectWeek.total * 100)}%</span>
                </div>
                <ProgressBar pct={(cp.individualPerfectWeek.attended / cp.individualPerfectWeek.total) * 100} color="#555" />
              </div>
            ) : (
              <p className="muted">No sessions scheduled this week. Check back when sessions start!</p>
            )}
          </ChallengeCard>
        </div>

        {/* ── SIDEBAR ── */}
        <aside className="squad-panel">
          {squad ? (
            <div className="subpanel">
              {/* Squad Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingName ? (
                    <input
                      type="text"
                      value={newSquadName}
                      onChange={e => setNewSquadName(e.target.value)}
                      onBlur={handleRenameSave}
                      onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingName(false); setNewSquadName(squad.name); } }}
                      autoFocus
                      style={{ width: "100%", boxSizing: "border-box", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--line)", fontSize: "0.9em" }}
                    />
                  ) : (
                    <>
                      <h3 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{squad.name}</h3>
                      <p className="muted" style={{ margin: 0, fontSize: "0.85em" }}>Level: {squad.squadLevel} SP avg</p>
                    </>
                  )}
                </div>
                {!editingName && (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button className="secondary" style={{ fontSize: "0.8em", padding: "2px 8px" }} onClick={() => { setEditingName(true); setNewSquadName(squad.name); }}>Edit</button>
                    <button className="secondary" style={{ fontSize: "0.8em", padding: "2px 8px", background: "#fef2f2", color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setConfirmLeave(true)}>Leave</button>
                  </div>
                )}
              </div>

              {/* Members */}
              <div style={{ marginBottom: 12 }}>
                <p style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: 4, color: "var(--muted)" }}>Members ({squad.members.length}/{maxMembers})</p>
                {squad.members.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "0.88em", borderBottom: i < squad.members.length - 1 ? "1px solid var(--line)" : "none" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--primary)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.75em", fontWeight: 700, flexShrink: 0 }}>{m.name.charAt(0).toUpperCase()}</span>
                      {m.name}{m.isCurrentUser ? " (you)" : ""}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: "0.9em" }}>{m.totalSp} SP</span>
                  </div>
                ))}
              </div>

              {/* Sent Invites */}
              {sentInvites.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: 4, color: "var(--muted)" }}>Sent Invites</p>
                  {sentInvites.map(inv => (
                    <div key={inv.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", fontSize: "0.85em" }}>
                      <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{inv.email}</span>
                      <button className="secondary" style={{ fontSize: "0.75em", padding: "1px 6px", color: "var(--red)", borderColor: "var(--red)", flexShrink: 0 }} onClick={() => handleCancelInvite(inv.email)}>Cancel</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite / Search */}
              {spotsLeft > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {showInviteSearch ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.85em", margin: 0, color: "var(--muted)" }}>Invite ({spotsLeft} spot{spotsLeft > 1 ? "s" : ""} left)</p>
                        <button className="secondary" style={{ fontSize: "0.75em", padding: "1px 6px" }} onClick={() => { setShowInviteSearch(false); setSearchQuery(""); setSearchResults([]); }}>Close</button>
                      </div>
                      <input
                        type="text"
                        placeholder="Search by name or email..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        autoFocus
                        style={{ width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: "0.85em", border: "1px solid var(--line)", borderRadius: 6 }}
                      />
                      {searching && <p className="muted" style={{ fontSize: "0.8em", marginTop: 4 }}>Searching...</p>}
                      <div className={`squad-search-results${searchResults.length > 0 ? ' open' : ''}`} style={{ marginTop: 6 }}>
                        <div style={{ maxHeight: 200, overflowY: "auto" }}>
                          {searchResults.filter(s => {
                            const inSquad = squad?.members?.some(m => m.maskedEmail === s.maskedEmail);
                            const isSelf = profile?.student?.maskedEmail === s.maskedEmail;
                            return !inSquad && !isSelf;
                          }).map(s => (
                            <div key={s._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: "0.82em", borderBottom: "1px solid var(--line)" }}>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                {s.name} — {s.maskedEmail}
                              </span>
                              <button className="primary" style={{ fontSize: "0.75em", padding: "2px 8px", minHeight: "unset", lineHeight: "24px", flexShrink: 0 }} onClick={() => handleInvite(s)}>Invite</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <button className="primary" style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontWeight: 600 }} onClick={() => { setShowInviteSearch(true); setSearchQuery(""); setSearchResults([]); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="8" r="4"/><path d="M2 20c0-4 3.6-7 8-7s8 3 8 7"/><path d="M18 11v6"/><path d="M21 14h-6"/></svg>
                      Invite
                    </button>
                  )}
                </div>
              )}

              {/* Challenge History */}
              {squad.challengeHistory && squad.challengeHistory.length > 0 && (
                <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: 6, color: "var(--muted)" }}>Challenge History</p>
                  {squad.challengeHistory.slice(-5).reverse().map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: "0.85em" }}>
                      <span>{new Date(c.weekStart).toLocaleDateString()}</span>
                      <span style={{ color: c.status === "completed" ? "var(--green)" : "var(--red)" }}>
                        {c.status === "completed" ? "\u2705" : "\u274C"} {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="subpanel">
              <h3 style={{ margin: 0, marginBottom: 8 }}>My Squad</h3>
              {invites.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontWeight: 600, fontSize: "0.85em", marginBottom: 6, color: "var(--muted)" }}>Pending Invites</p>
                  {invites.map(inv => (
                    <div key={inv.squadId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.9em", margin: 0 }}>{inv.squadName}</p>
                        <p className="muted" style={{ margin: 0, fontSize: "0.8em" }}>by {inv.invitedByName}</p>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button className="primary" style={{ fontSize: "0.8em", padding: "3px 8px" }} onClick={() => handleRespond(inv.squadId, "accept")}>Accept</button>
                        <button className="secondary" style={{ fontSize: "0.8em", padding: "3px 8px" }} onClick={() => handleRespond(inv.squadId, "reject")}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="muted" style={{ fontSize: "0.9em", marginBottom: 0 }}>
                {invites.length > 0 ? "Accept an invite above or create your own squad to unlock squad challenges!" : "Create or join a squad to unlock squad challenges!"}
              </p>
              <button
                className="primary"
                style={{ width: "100%", marginTop: 12 }}
                onClick={() => setShowCreate(true)}
              >
                Create Squad
              </button>
            </div>
          )}
          {error && (
            <div style={{ background: "#ffebee", color: "#c62828", border: "1px solid #ef9a9a", padding: "10px 14px", borderRadius: 8, fontSize: "0.85em", marginTop: 12, marginBottom: 12, fontWeight: 600 }}>
              {error}
            </div>
          )}
          {success && (
            <div style={{ background: "#e8f5e9", color: "#2e7d32", border: "1px solid #a5d6a7", padding: "10px 14px", borderRadius: 8, fontSize: "0.85em", marginTop: 12, marginBottom: 12, fontWeight: 600 }}>
              {success}
            </div>
          )}
        </aside>
      </div>

      {/* ── Create Squad Modal ── */}
      {showCreate && (
        <div className="overlay" onClick={() => { setShowCreate(false); setSquadName(""); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Create a Squad</h3>
            <input
              type="text"
              placeholder="Squad name..."
              value={squadName}
              onChange={e => setSquadName(e.target.value)}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" onClick={handleCreate}>Create</button>
              <button className="secondary" onClick={() => { setShowCreate(false); setSquadName(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Confirmation Modal ── */}
      {confirmLeave && (
        <div className="overlay" onClick={() => { setConfirmLeave(false); setLeaveError(""); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Leave Squad?</h3>
            <p>Are you sure you want to leave {squad?.name}?</p>
            {leaveError && <p className="error" style={{ marginTop: 8 }}>{leaveError}</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="primary" onClick={handleLeave}>Yes, Leave</button>
              <button className="secondary" onClick={() => { setConfirmLeave(false); setLeaveError(""); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}


    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
