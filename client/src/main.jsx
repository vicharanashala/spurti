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
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['study_buddy','Study Buddy']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'study_buddy' && <StudyBuddyTab profile={profile} API={API} />}
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

// --- Study Buddy Matching UI Components ---------------------------------

function StudyBuddyTab({ profile, API }) {
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [sbProfile, setSbProfile] = useState(null);
  const [buddies, setBuddies] = useState([]);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });
  const [notifications, setNotifications] = useState([]);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [activeChatBuddy, setActiveChatBuddy] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'X-Student-Email': profile.student.email
  }), [profile]);

  const loadData = async () => {
    try {
      const profRes = await fetch(`${API}/study-buddy/profile`, { headers });
      if (profRes.ok) {
        const profData = await profRes.json();
        setHasProfile(profData.hasProfile);
        setSbProfile(profData.profile || null);
        
        if (profData.hasProfile) {
          await Promise.all([
            fetchBuddies(),
            fetchRequests(),
            fetchNotifications()
          ]);
        }
      }
    } catch (err) {
      console.error('Error loading study buddy data:', err);
    } finally {
      setProfileLoaded(true);
    }
  };

  const fetchBuddies = async () => {
    const res = await fetch(`${API}/study-buddy/buddies`, { headers });
    if (res.ok) setBuddies(await res.json());
  };

  const fetchRequests = async () => {
    const res = await fetch(`${API}/study-buddy/requests`, { headers });
    if (res.ok) setRequests(await res.json());
  };

  const fetchNotifications = async () => {
    const res = await fetch(`${API}/study-buddy/notifications`, { headers });
    if (res.ok) setNotifications(await res.json());
  };

  useEffect(() => {
    loadData();
    const intervalId = setInterval(() => {
      if (hasProfile && !isEditingProfile) {
        fetchBuddies();
        fetchRequests();
        fetchNotifications();
      }
    }, 30000);
    return () => clearInterval(intervalId);
  }, [hasProfile, isEditingProfile]);

  const handleProfileSave = async (formData) => {
    setErrorMessage('');
    try {
      const res = await fetch(`${API}/study-buddy/profile`, {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save profile');
      setSbProfile(data.profile);
      setHasProfile(true);
      setIsEditingProfile(false);
      loadData();
    } catch (err) {
      setErrorMessage(err.message);
    }
  };

  const handleProgressSave = async (progressData) => {
    try {
      const res = await fetch(`${API}/study-buddy/progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify(progressData)
      });
      const data = await res.json();
      if (res.ok) {
        setSbProfile(data.profile);
        fetchBuddies();
      }
    } catch (err) {
      console.error('Failed to save progress:', err);
    }
  };

  const handleSendRequest = async (receiverId) => {
    try {
      const res = await fetch(`${API}/study-buddy/request`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ receiverId })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'accepted') {
          loadData();
        } else {
          fetchRequests();
        }
      }
    } catch (err) {
      console.error('Error sending request:', err);
    }
  };

  const handleAcceptRequest = async (requestId) => {
    try {
      const res = await fetch(`${API}/study-buddy/request/${requestId}/accept`, {
        method: 'POST',
        headers
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Error accepting request:', err);
    }
  };

  const handleRejectRequest = async (requestId) => {
    try {
      const res = await fetch(`${API}/study-buddy/request/${requestId}/reject`, {
        method: 'POST',
        headers
      });
      if (res.ok) fetchRequests();
    } catch (err) {
      console.error('Error rejecting request:', err);
    }
  };

  const handleCancelRequest = async (requestId) => {
    try {
      const res = await fetch(`${API}/study-buddy/request/${requestId}/cancel`, {
        method: 'POST',
        headers
      });
      if (res.ok) fetchRequests();
    } catch (err) {
      console.error('Error cancelling request:', err);
    }
  };

  const handleRemoveBuddy = async (buddyId) => {
    if (!window.confirm('Are you sure you want to remove this study buddy?')) return;
    try {
      const res = await fetch(`${API}/study-buddy/buddy/${buddyId}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) loadData();
    } catch (err) {
      console.error('Error removing buddy:', err);
    }
  };

  const handleMarkNotificationsRead = async () => {
    try {
      const res = await fetch(`${API}/study-buddy/notifications/read`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      }
    } catch (err) {
      console.error('Error marking notifications as read:', err);
    }
  };

  if (!profileLoaded) {
    return <section className="panel empty">Loading Study Buddy matching dashboard...</section>;
  }

  if (!hasProfile || isEditingProfile) {
    return (
      <section className="panel profile-setup-box">
        <div className="panel-head">
          <h2>{isEditingProfile ? 'Edit Study Buddy Profile' : 'Create Study Buddy Profile'}</h2>
          {hasProfile && <button className="secondary" onClick={() => setIsEditingProfile(false)}>Cancel</button>}
        </div>
        {errorMessage && <p className="error">{errorMessage}</p>}
        <ProfileSetupForm profileData={sbProfile} onSave={handleProfileSave} />
      </section>
    );
  }

  return (
    <>
      <div className="study-buddy-container">
        <div className="sb-left-col">
          <div className="panel">
            <div className="panel-head" style={{marginBottom: '10px'}}>
              <h3>My Matching Profile</h3>
              <button className="secondary" style={{minHeight:'32px', padding:'0 10px', fontSize:'12px'}} onClick={() => setIsEditingProfile(true)}>Edit Profile</button>
            </div>
            <p className="muted" style={{fontSize:'13px', margin:'0 0 8px 0'}}>
              <b>Course:</b> {sbProfile.course || '—'} | <b>Semester:</b> {sbProfile.currentSemester || '—'}
            </p>
            <div className="tag-list" style={{marginTop: '0'}}>
              {sbProfile.preferredSubjects.slice(0, 4).map(sub => <span key={sub} className="tag" style={{background:'#e0f2fe', color:'#0369a1', borderColor:'#bae6fd'}}>{sub}</span>)}
              {sbProfile.learningGoals.slice(0, 3).map(goal => <span key={goal} className="tag" style={{background:'#f3e8ff', color:'#6b21a8', borderColor:'#e9d5ff'}}>{goal}</span>)}
            </div>
          </div>

          <div className="panel">
            <h3>My Study Progress</h3>
            <div className="buddy-progress-section">
              <div className="progress-widget">
                <h4>Streak</h4>
                <div className="progress-widget-val">🔥 {sbProfile.streak} days</div>
              </div>
              <div className="progress-widget">
                <h4>Study Hours</h4>
                <div className="progress-widget-val">⏱️ {sbProfile.studyHours} hrs</div>
              </div>
            </div>

            <div className="progress-goal-box">
              <div>
                <span className="muted" style={{fontSize:'11px', display:'block', textTransform:'uppercase', fontWeight:'700'}}>Weekly Goal</span>
                <span className={sbProfile.weeklyGoalCompleted ? 'completed-goal-text' : ''}>
                  {sbProfile.weeklyGoal || 'No goal set for this week.'}
                </span>
              </div>
              {sbProfile.weeklyGoal && (
                <label>
                  <input
                    type="checkbox"
                    checked={sbProfile.weeklyGoalCompleted}
                    onChange={(e) => handleProgressSave({ weeklyGoalCompleted: e.target.checked })}
                  />
                  <span>Done</span>
                </label>
              )}
            </div>

            <ProgressEditForm profile={sbProfile} onSave={handleProgressSave} />
          </div>

          {notifications.length > 0 && (
            <div className="panel">
              <div className="panel-head" style={{marginBottom: '10px'}}>
                <h3>Activity Nudges</h3>
                {notifications.some(n => !n.read) && (
                  <button className="secondary" style={{minHeight:'28px', padding:'0 8px', fontSize:'11px'}} onClick={handleMarkNotificationsRead}>Mark read</button>
                )}
              </div>
              <div className="sb-notifications-list">
                {notifications.map(n => (
                  <div key={n._id} className={`sb-notification-item ${n.read ? '' : 'unread'}`}>
                    <p>{n.message}</p>
                    <span>{new Date(n.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(requests.incoming.length > 0 || requests.outgoing.length > 0) && (
            <div className="panel">
              <h3>Buddy Requests</h3>
              <div className="requests-pane">
                {requests.incoming.map(req => (
                  <div key={req._id} className="request-card">
                    <div>
                      <strong>{req.sender.name}</strong> wants to pair up
                      <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="request-actions">
                      <button className="primary" style={{minHeight:'28px', padding:'0 10px', fontSize:'12px'}} onClick={() => handleAcceptRequest(req._id)}>Accept</button>
                      <button className="secondary" style={{minHeight:'28px', padding:'0 10px', fontSize:'12px'}} onClick={() => handleRejectRequest(req._id)}>Decline</button>
                    </div>
                  </div>
                ))}
                {requests.outgoing.map(req => (
                  <div key={req._id} className="request-card">
                    <div>
                      Sent to <strong>{req.receiver.name}</strong>
                      <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="request-actions">
                      <button className="secondary" style={{minHeight:'28px', padding:'0 10px', fontSize:'12px'}} onClick={() => handleCancelRequest(req._id)}>Cancel</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h3>My Study Buddies ({buddies.length})</h3>
            {buddies.length === 0 ? (
              <p className="empty">You haven't added any study buddies yet. Find compatible partners in the right pane!</p>
            ) : (
              <div className="sb-buddies-list">
                {buddies.map(buddy => (
                  <BuddyCard
                    key={buddy.profile._id}
                    buddy={buddy}
                    onChat={setActiveChatBuddy}
                    onRemove={handleRemoveBuddy}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sb-right-col">
          <FindBuddySection
            API={API}
            headers={headers}
            onSendRequest={handleSendRequest}
            requests={requests}
            buddies={buddies}
          />
        </div>
      </div>

      {activeChatBuddy && (
        <PlaceholderChatModal
          buddy={activeChatBuddy}
          onClose={() => setActiveChatBuddy(null)}
        />
      )}
    </>
  );
}

function ProfileSetupForm({ profileData, onSave }) {
  const [currentSemester, setCurrentSemester] = useState(profileData?.currentSemester || 'Semester 1');
  const [course, setCourse] = useState(profileData?.course || 'BS in Data Science');
  const [preferredStudyTime, setPreferredStudyTime] = useState(profileData?.preferredStudyTime || 'Flexible');
  const [weeklyAvailability, setWeeklyAvailability] = useState(profileData?.weeklyAvailability || 4);
  const [skillLevel, setSkillLevel] = useState(profileData?.skillLevel || 'Intermediate');

  const [subjects, setSubjects] = useState(profileData?.preferredSubjects || []);
  const [subjectInput, setSubjectInput] = useState('');
  
  const [goals, setGoals] = useState(profileData?.learningGoals || []);
  const [goalInput, setGoalInput] = useState('');
  
  const [languages, setLanguages] = useState(profileData?.languages || ['English']);
  const [languageInput, setLanguageInput] = useState('');
  
  const [interests, setInterests] = useState(profileData?.interests || []);
  const [interestInput, setInterestInput] = useState('');

  const addTag = (val, list, setList, setInput) => {
    const trimmed = val.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
      setInput('');
    }
  };

  const removeTag = (tag, list, setList) => {
    setList(list.filter(item => item !== tag));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!course.trim() || !currentSemester.trim()) return;
    onSave({
      currentSemester,
      course,
      preferredStudyTime,
      weeklyAvailability: Number(weeklyAvailability),
      skillLevel,
      preferredSubjects: subjects,
      learningGoals: goals,
      languages,
      interests
    });
  };

  return (
    <form onSubmit={submit} className="login-form">
      <div className="form-grid">
        <div className="form-group">
          <label>Course / Degree</label>
          <input required value={course} onChange={e => setCourse(e.target.value)} placeholder="e.g. BS in Data Science" />
        </div>
        <div className="form-group">
          <label>Current Semester</label>
          <select value={currentSemester} onChange={e => setCurrentSemester(e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={`Semester ${s}`}>{`Semester ${s}`}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Preferred Study Time</label>
          <select value={preferredStudyTime} onChange={e => setPreferredStudyTime(e.target.value)}>
            <option value="Morning">Morning</option>
            <option value="Afternoon">Afternoon</option>
            <option value="Night">Night</option>
            <option value="Flexible">Flexible</option>
          </select>
        </div>
        <div className="form-group">
          <label>Weekly Availability (Hours)</label>
          <input type="number" min="1" max="80" value={weeklyAvailability} onChange={e => setWeeklyAvailability(e.target.value)} />
        </div>
        <div className="form-group">
          <label>Skill Level</label>
          <select value={skillLevel} onChange={e => setSkillLevel(e.target.value)}>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>

        <div className="form-group">
          <label>Languages Spoken</label>
          <div className="tag-input-row">
            <input value={languageInput} onChange={e => setLanguageInput(e.target.value)} placeholder="e.g. English, Hindi" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(languageInput, languages, setLanguages, setLanguageInput))} />
            <button type="button" className="secondary" onClick={() => addTag(languageInput, languages, setLanguages, setLanguageInput)} style={{minHeight:'38px'}}>Add</button>
          </div>
          <div className="tag-list">
            {languages.map(t => <span key={t} className="tag">{t}<button type="button" onClick={() => removeTag(t, languages, setLanguages)}>×</button></span>)}
          </div>
        </div>

        <div className="form-group wide">
          <label>Subjects you want to study</label>
          <div className="tag-input-row">
            <input value={subjectInput} onChange={e => setSubjectInput(e.target.value)} placeholder="e.g. Data Structures, Machine Learning, Web Dev" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(subjectInput, subjects, setSubjects, setSubjectInput))} />
            <button type="button" className="secondary" onClick={() => addTag(subjectInput, subjects, setSubjects, setSubjectInput)} style={{minHeight:'38px'}}>Add</button>
          </div>
          <div className="tag-list">
            {subjects.map(t => <span key={t} className="tag">{t}<button type="button" onClick={() => removeTag(t, subjects, setSubjects)}>×</button></span>)}
          </div>
        </div>

        <div className="form-group wide">
          <label>Learning Goals</label>
          <div className="tag-input-row">
            <input value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="e.g. Crack DSA interview, Build React portfolio" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(goalInput, goals, setGoals, setGoalInput))} />
            <button type="button" className="secondary" onClick={() => addTag(goalInput, goals, setGoals, setGoalInput)} style={{minHeight:'38px'}}>Add</button>
          </div>
          <div className="tag-list">
            {goals.map(t => <span key={t} className="tag">{t}<button type="button" onClick={() => removeTag(t, goals, setGoals)}>×</button></span>)}
          </div>
        </div>

        <div className="form-group wide">
          <label>Interests / Hobbies</label>
          <div className="tag-input-row">
            <input value={interestInput} onChange={e => setInterestInput(e.target.value)} placeholder="e.g. Competitive Coding, Open Source, Blogging" onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag(interestInput, interests, setInterests, setInterestInput))} />
            <button type="button" className="secondary" onClick={() => addTag(interestInput, interests, setInterests, setInterestInput)} style={{minHeight:'38px'}}>Add</button>
          </div>
          <div className="tag-list">
            {interests.map(t => <span key={t} className="tag">{t}<button type="button" onClick={() => removeTag(t, interests, setInterests)}>×</button></span>)}
          </div>
        </div>
      </div>
      
      <div className="form-actions-row">
        <button type="submit" className="primary">Save Matching Profile</button>
      </div>
    </form>
  );
}

function ProgressEditForm({ profile, onSave }) {
  const [weeklyGoal, setWeeklyGoal] = useState(profile?.weeklyGoal || '');
  const [studyHours, setStudyHours] = useState(profile?.studyHours || 0);
  const [streak, setStreak] = useState(profile?.streak || 0);
  const [completedTasksCount, setCompletedTasksCount] = useState(profile?.completedTasksCount || 0);

  const submit = (e) => {
    e.preventDefault();
    onSave({
      weeklyGoal,
      studyHours: Number(studyHours),
      streak: Number(streak),
      completedTasksCount: Number(completedTasksCount),
      weeklyGoalCompleted: false
    });
  };

  return (
    <form onSubmit={submit} style={{marginTop:'12px', borderTop:'1px solid var(--line)', paddingTop:'12px'}}>
      <p className="eyebrow" style={{fontSize:'10px', marginBottom:'8px'}}>Update Progress</p>
      <div className="form-group" style={{marginBottom:'8px'}}>
        <input value={weeklyGoal} onChange={e => setWeeklyGoal(e.target.value)} placeholder="Enter weekly goal..." style={{padding:'6px 10px', fontSize:'13px'}} />
      </div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: '8px'}}>
        <div className="form-group">
          <label style={{fontSize:'10px', fontWeight:'700'}}>Hours</label>
          <input type="number" min="0" value={studyHours} onChange={e => setStudyHours(e.target.value)} style={{padding:'6px 8px', fontSize:'12px'}} />
        </div>
        <div className="form-group">
          <label style={{fontSize:'10px', fontWeight:'700'}}>Streak</label>
          <input type="number" min="0" value={streak} onChange={e => setStreak(e.target.value)} style={{padding:'6px 8px', fontSize:'12px'}} />
        </div>
        <div className="form-group">
          <label style={{fontSize:'10px', fontWeight:'700'}}>Tasks</label>
          <input type="number" min="0" value={completedTasksCount} onChange={e => setCompletedTasksCount(e.target.value)} style={{padding:'6px 8px', fontSize:'12px'}} />
        </div>
      </div>
      <button type="submit" className="secondary" style={{width:'100%', minHeight:'32px', padding:'0', fontSize:'12px', marginTop:'8px'}}>Save Progress</button>
    </form>
  );
}

function BuddyCard({ buddy, onChat, onRemove }) {
  const { profile, isOnline } = buddy;
  return (
    <article className="buddy-item-card">
      <div className="buddy-item-header">
        <div className="buddy-info-main">
          <h3>
            <i className={`online-indicator ${isOnline ? 'online' : ''}`} title={isOnline ? 'Online' : 'Offline'} />
            {profile.name}
          </h3>
          <span>{profile.email}</span>
        </div>
        <div className="buddy-sp-badge">
          <span>SP Score</span>
          <strong>{profile.totalSp}</strong>
        </div>
      </div>

      <div className="buddy-item-details">
        <div><b>Semester:</b> {profile.currentSemester || '—'} | <b>Degree:</b> {profile.course || '—'}</div>
        <div><b>Study Streak:</b> 🔥 {profile.streak} days</div>
        <div><b>Study Hours logged:</b> ⏱️ {profile.studyHours} hrs</div>
        <div><b>Weekly Goal:</b> <span className={profile.weeklyGoalCompleted ? 'completed-goal-text' : ''}>{profile.weeklyGoal || 'None set'}</span></div>
        <div><b>Tasks Completed:</b> {profile.completedTasksCount} tasks</div>
        <div><b>Last active:</b> {new Date(profile.lastActive).toLocaleDateString()} at {new Date(profile.lastActive).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
      </div>

      <div className="buddy-item-actions">
        <button className="primary" style={{minHeight:'32px', padding:'0 12px', fontSize:'12px'}} onClick={() => onChat(profile)}>Quick Chat</button>
        <button className="remove" style={{minHeight:'32px', padding:'0 12px', fontSize:'12px'}} onClick={() => onRemove(profile.studentId)}>Remove Buddy</button>
      </div>
    </article>
  );
}

function FindBuddySection({ API, headers, onSendRequest, requests, buddies }) {
  const [suggestions, setSuggestions] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [q, setQ] = useState('');
  const [semester, setSemester] = useState('');
  const [course, setCourse] = useState('');
  const [subject, setSubject] = useState('');
  const [studyTime, setStudyTime] = useState('');
  const [online, setOnline] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/study-buddy/suggestions`, { headers });
      if (res.ok) setSuggestions(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuggestions();
  }, [requests, buddies]);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (q) queryParams.append('q', q);
      if (semester) queryParams.append('semester', semester);
      if (course) queryParams.append('course', course);
      if (subject) queryParams.append('subject', subject);
      if (studyTime) queryParams.append('studyTime', studyTime);
      if (online) queryParams.append('online', 'true');

      const res = await fetch(`${API}/study-buddy/search?${queryParams.toString()}`, { headers });
      if (res.ok) setSearchResults(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearSearch = () => {
    setQ('');
    setSemester('');
    setCourse('');
    setSubject('');
    setStudyTime('');
    setOnline(false);
    setSearchResults(null);
    fetchSuggestions();
  };

  const getButtonState = (studentId) => {
    const sidStr = studentId.toString();
    if (buddies.some(b => b.profile.studentId.toString() === sidStr)) {
      return { text: 'Already Buddies', disabled: true, className: 'secondary' };
    }
    if (requests.outgoing.some(r => r.receiver._id.toString() === sidStr)) {
      return { text: 'Pending Sent', disabled: true, className: 'secondary' };
    }
    if (requests.incoming.some(r => r.sender._id.toString() === sidStr)) {
      return { text: 'Accept Request', disabled: false, className: 'primary' };
    }
    return { text: 'Send Request', disabled: false, className: 'primary' };
  };

  const activeList = searchResults !== null ? searchResults : suggestions.map(s => ({
    profile: s.profile,
    matchPercentage: s.matchPercentage,
    isOnline: s.isOnline,
    reasons: s.reasons
  }));

  return (
    <div className="sb-search-section">
      <div className="panel" style={{marginBottom: '0'}}>
        <h3>Find Study Buddy</h3>
        
        <form onSubmit={handleSearch} className="sb-filters-card">
          <div className="search-row">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email..." style={{padding:'9px 12px'}} />
            <button type="submit" className="primary" style={{minHeight:'38px'}}>Search</button>
          </div>
          <div className="filters-row">
            <div className="filter-item">
              <label>Semester</label>
              <select value={semester} onChange={e => setSemester(e.target.value)}>
                <option value="">Any</option>
                {[1,2,3,4,5,6,7,8].map(s => <option key={s} value={`Semester ${s}`}>{`Semester ${s}`}</option>)}
              </select>
            </div>
            <div className="filter-item">
              <label>Study Time</label>
              <select value={studyTime} onChange={e => setStudyTime(e.target.value)}>
                <option value="">Any</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Night">Night</option>
                <option value="Flexible">Flexible</option>
              </select>
            </div>
            <div className="filter-item">
              <label>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. DSA" style={{padding:'6px 8px'}} />
            </div>
            <div className="filter-checkbox-item">
              <input type="checkbox" id="online-check" checked={online} onChange={e => setOnline(e.target.checked)} />
              <label htmlFor="online-check">Online Only</label>
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:'8px', marginTop:'10px'}}>
            {searchResults !== null && <button type="button" className="secondary" onClick={clearSearch} style={{minHeight:'30px', padding:'0 10px', fontSize:'12px'}}>Clear filters</button>}
            <button type="submit" className="primary" style={{minHeight:'30px', padding:'0 12px', fontSize:'12px'}}>Apply Filters</button>
          </div>
        </form>
      </div>

      <div className="panel">
        <h3 style={{marginBottom:'14px'}}>
          {searchResults !== null ? `Search Results (${activeList.length})` : 'Buddy Suggestions'}
        </h3>
        
        {loading ? (
          <p className="empty">Loading list...</p>
        ) : activeList.length === 0 ? (
          <p className="empty">No matching students found. Try widening your search filters!</p>
        ) : (
          <div className="suggestions-grid">
            {activeList.map(item => {
              const btnState = getButtonState(item.profile.studentId);
              return (
                <article key={item.profile._id} className="suggestion-item-card">
                  <div className="suggestion-badge-row">
                    <div className="suggestion-profile-info">
                      <h3>
                        <i className={`online-indicator ${item.isOnline ? 'online' : ''}`} title={item.isOnline ? 'Online' : 'Offline'} />
                        {item.profile.name}
                      </h3>
                      <p>{item.profile.email}</p>
                    </div>
                    {item.matchPercentage !== undefined && (
                      <span className={`match-percentage-badge ${item.matchPercentage >= 70 ? 'high' : item.matchPercentage >= 40 ? 'medium' : ''}`}>
                        {item.matchPercentage}% Match
                      </span>
                    )}
                  </div>

                  <div className="suggestion-details">
                    <span><b>Course:</b> {item.profile.course} ({item.profile.currentSemester})</span>
                    <span><b>Availability:</b> {item.profile.weeklyAvailability} hrs/wk</span>
                    <span><b>Streak:</b> 🔥 {item.profile.streak} days</span>
                    <span><b>Motivation (SP):</b> <strong className="buddy-sp-text">{item.profile.totalSp} SP</strong></span>
                  </div>

                  {item.reasons && item.reasons.length > 0 && (
                    <div className="match-reasons-list">
                      {item.reasons.slice(0, 3).map((r, i) => (
                        <span key={i} className="match-reason-tag">{r}</span>
                      ))}
                    </div>
                  )}

                  <button
                    className={btnState.className}
                    disabled={btnState.disabled}
                    onClick={() => onSendRequest(item.profile.studentId)}
                    style={{width:'100%', minHeight:'32px', padding:'0', fontSize:'12px'}}
                  >
                    {btnState.text}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function PlaceholderChatModal({ buddy, onClose }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal quick-chat-modal">
        <div className="modal-head" style={{justifyContent:'flex-end', borderBottom:'0', padding:'0'}}>
          <button className="icon" onClick={onClose} style={{width:'30px', minHeight:'30px'}}>×</button>
        </div>
        <h2>Quick Chat with {buddy.name}</h2>
        <p>In-app real-time chat is coming soon to Spurti! In the meantime, you can reach out directly to coordinate your study schedules:</p>
        <div className="quick-chat-email">{buddy.email}</div>
        <button className="primary" onClick={onClose} style={{width:'100%'}}>Done</button>
      </section>
    </div>
  );
}


createRoot(document.getElementById('root')).render(<App />);
