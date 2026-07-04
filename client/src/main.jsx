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
        <StudentView profile={profile} setProfile={setProfile} onBack={config.allowStudentSearch ? () => setView('landing') : null} />
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

function StudentView({ profile, setProfile, onBack }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);

  const handleClaimReward = async (rewardId) => {
    try {
      const res = await fetch(`${API}/challenges/rewards/${rewardId}/ack`, {
        method: 'POST',
        headers: { 'X-Student-Email': student.email }
      });
      if (res.ok) {
        setProfile(prev => ({
          ...prev,
          unseenRewards: prev.unseenRewards.filter(r => r._id !== rewardId)
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <main className="page compact">
      {profile.unseenRewards?.length > 0 && (
        <CelebrationModal
          rewards={profile.unseenRewards}
          onClaim={handleClaimReward}
        />
      )}
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
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['challenges','Challenges 🏆']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'challenges' && <ChallengesView student={student} profile={profile} setProfile={setProfile} />}
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
  
  if (profile.challengeBadges && Array.isArray(profile.challengeBadges)) {
    badges.push(...profile.challengeBadges);
  }
  
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
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['students','Students'], ['challenges','Challenges 🏆']]} />
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
      {tab === 'challenges' && <AdminChallengesPanel stats={stats} auth={auth} />}
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


// ==========================================
// STUDY CHALLENGES COMPONENTS
// ==========================================

function CanvasConfetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationId;
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#eab308'];
    const particles = Array.from({ length: 150 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height - height,
      r: Math.random() * 6 + 4,
      d: Math.random() * height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.07 + 0.02,
      tiltAngle: 0
    }));

    function draw() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p, idx) => {
        p.tiltAngle += p.tiltAngleIncremental;
        p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
        p.x += Math.sin(p.tiltAngle);
        p.tilt = Math.sin(p.tiltAngle - idx / 3) * 15;

        if (p.y > height) {
          p.x = Math.random() * width;
          p.y = -20;
          p.tilt = Math.random() * 10 - 5;
        }

        ctx.beginPath();
        ctx.lineWidth = p.r;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
        ctx.stroke();
      });
      animationId = requestAnimationFrame(draw);
    }

    draw();

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: 'none' }} />;
}

function TrophyAnimation() {
  return (
    <div className="celebration-trophy-wrap">
      <svg className="celebration-trophy" viewBox="0 0 100 100" width="120" height="120">
        <defs>
          <linearGradient id="gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffe259" />
            <stop offset="100%" stopColor="#ffa751" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <path d="M 25 35 A 15 15 0 0 0 25 65 L 25 60 A 10 10 0 0 1 25 40 Z" fill="url(#gold-grad)" />
        <path d="M 75 35 A 15 15 0 0 1 75 65 L 75 60 A 10 10 0 0 0 75 40 Z" fill="url(#gold-grad)" />
        <path d="M 30 25 L 70 25 L 65 65 A 15 15 0 0 1 35 65 Z" fill="url(#gold-grad)" filter="url(#glow)" />
        <rect x="42" y="65" width="16" height="15" fill="url(#gold-grad)" />
        <ellipse cx="50" cy="82" rx="20" ry="6" fill="#333" />
        <circle cx="35" cy="30" r="1.5" fill="#fff" className="sparkle s1" />
        <circle cx="65" cy="50" r="1.5" fill="#fff" className="sparkle s2" />
        <circle cx="50" cy="60" r="1.5" fill="#fff" className="sparkle s3" />
      </svg>
    </div>
  );
}

function CelebrationModal({ rewards, onClaim }) {
  const currentReward = rewards[0];
  if (!currentReward) return null;

  const challengeName = currentReward.challengeId?.name || 'Study Challenge';
  const type = currentReward.type;
  
  let title = 'Challenge Completed! 🎉';
  let message = `Amazing effort! You completed the challenge "${challengeName}" and earned rewards.`;
  let details = '';

  if (type === 'winner') {
    title = '1st Place Champion! 🥇';
    message = `Incredible! You claimed 1st Place on the leaderboard for the challenge "${challengeName}"!`;
    details = `Received a rapid +${currentReward.spPoints} SP Winner Bonus boost!`;
  } else if (type === 'runner_up') {
    title = '2nd Place Runner-Up! 🥈';
    message = `Fantastic job! You claimed 2nd Place on the leaderboard for the challenge "${challengeName}"!`;
    details = `Received a +${currentReward.spPoints} SP Runner-Up Bonus boost!`;
  } else if (type === 'third') {
    title = '3rd Place Finish! 🥉';
    message = `Well done! You claimed 3rd Place on the leaderboard for the challenge "${challengeName}"!`;
    details = `Received a +${currentReward.spPoints} SP Third Place Bonus boost!`;
  } else if (type === 'badge') {
    title = 'Badge Unlocked! 🏅';
    message = `You earned the special badge "${currentReward.badge}" by completing "${challengeName}"!`;
    details = 'This badge is now visible on your profile.';
  }

  return (
    <div className="celebration-overlay">
      <CanvasConfetti />
      <div className="celebration-panel modal animate-pop" style={{ textAlign: 'center', background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: 'var(--shadow)', maxWidth: '480px', position: 'relative', zIndex: 101 }}>
        <TrophyAnimation />
        <h2 style={{ fontSize: '26px', margin: '12px 0 6px', color: 'var(--primary)' }}>{title}</h2>
        <p className="lead" style={{ fontSize: '15px', color: 'var(--muted)', margin: '0 0 16px', lineHeight: '1.5' }}>{message}</p>
        
        {currentReward.spPoints > 0 && (
          <div className="sp-award-box" style={{ background: '#edf8fb', padding: '16px', borderRadius: '8px', margin: '16px 0', border: '1px solid var(--line)' }}>
            <span style={{ fontSize: '12px', display: 'block', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em' }}>Points Gained</span>
            <strong style={{ fontSize: '32px', color: 'var(--primary)', display: 'block', marginTop: '4px' }}>+{currentReward.spPoints} SP</strong>
          </div>
        )}

        {details && <p className="muted" style={{ margin: '12px 0 0', fontSize: '13px', fontWeight: 'bold', color: 'var(--amber)' }}>{details}</p>}
        
        <button className="primary" onClick={() => onClaim(currentReward._id)} style={{ width: '100%', marginTop: '20px', minHeight: '44px' }}>
          Claim Reward & Continue
        </button>
      </div>
    </div>
  );
}

function ChallengesView({ student, profile, setProfile }) {
  const [challenges, setChallenges] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active');
  const [selectedChallengeId, setSelectedChallengeId] = useState(null);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'X-Student-Email': student.email
  }), [student.email]);

  const loadChallenges = async () => {
    setLoading(true);
    try {
      if (tab === 'active') {
        const res = await fetch(`${API}/challenges`, { headers });
        if (res.ok) {
          const data = await res.json();
          setChallenges(data.challenges || []);
        }
      } else {
        const res = await fetch(`${API}/challenges/completed`, { headers });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.completedChallenges || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChallenges();
  }, [tab, headers]);

  const handleJoin = async (id) => {
    try {
      const res = await fetch(`${API}/challenges/${id}/join`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        loadChallenges();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to join challenge');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="challenges-tab-container">
      <nav className="buddy-sub-nav">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Active & Upcoming</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Challenge History</button>
      </nav>

      {loading ? (
        <p className="muted">Loading challenges...</p>
      ) : tab === 'active' ? (
        challenges.length === 0 ? (
          <p className="empty">No active or upcoming challenges at the moment. Check back soon!</p>
        ) : (
          <div className="challenges-grid">
            {challenges.map(ch => (
              <ChallengeCard
                key={ch._id}
                challenge={ch}
                onJoin={handleJoin}
                onOpenDashboard={(id) => setSelectedChallengeId(id)}
              />
            ))}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <p className="empty">You haven't completed any challenges yet. Complete active challenges to earn badges and SP!</p>
        ) : (
          <div className="challenges-grid">
            {history.map(h => (
              <CompletedChallengeCard key={h._id} historyItem={h} />
            ))}
          </div>
        )
      )}

      {selectedChallengeId && (
        <ChallengeDashboardModal
          challengeId={selectedChallengeId}
          student={student}
          onClose={() => {
            setSelectedChallengeId(null);
            fetch(`${API}/me`).then(r => {
              if (r.ok) return r.json();
            }).then(data => {
              if (data?.profile) setProfile(data.profile);
            });
            loadChallenges();
          }}
        />
      )}
    </div>
  );
}

function ChallengeCard({ challenge, onJoin, onOpenDashboard }) {
  const { _id, name, description, banner, type, startDate, endDate, maxParticipants, difficulty, spPoints, winnerBonus, rewardBadge, colorTheme, enrollmentStatus, progressPct } = challenge;
  
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let statusLabel = 'Upcoming';
  let isUpcoming = false;
  if (now < start) {
    statusLabel = `Starts ${start.toLocaleDateString()}`;
    isUpcoming = true;
  } else if (now > end) {
    statusLabel = 'Completed';
  } else {
    statusLabel = 'Active';
  }

  return (
    <article className="challenge-card" style={{ borderTop: `6px solid ${colorTheme.includes('gradient') ? '#176b87' : colorTheme}` }}>
      <div className="challenge-card-header">
        <span className="challenge-emoji">{banner || '🏆'}</span>
        <div className="challenge-card-badge-row">
          <span className={`challenge-badge diff-${difficulty.toLowerCase()}`}>{difficulty}</span>
          <span className="challenge-badge type">{type}</span>
        </div>
      </div>

      <div className="challenge-card-content">
        <h3>{name}</h3>
        <p className="challenge-desc">{description}</p>
        
        <div className="challenge-dates-row">
          <span>🕒 {statusLabel}</span>
          <span>📅 Ends {end.toLocaleDateString()}</span>
        </div>

        <div className="challenge-rewards-summary">
          <span>Standard: <b>+{spPoints} SP</b></span>
          {winnerBonus > 0 && <span className="winner-tag">Winner: <b>+{winnerBonus} SP</b></span>}
          {rewardBadge && <span className="badge-tag">🏅 {rewardBadge}</span>}
        </div>

        {enrollmentStatus !== 'not_joined' && enrollmentStatus !== 'left' ? (
          <div className="challenge-card-progress">
            <div className="progress-info">
              <span>Your Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="challenge-card-actions">
        {enrollmentStatus === 'not_joined' || enrollmentStatus === 'left' ? (
          <button 
            className="primary" 
            disabled={isUpcoming} 
            onClick={() => onJoin(_id)}
            style={{ width: '100%' }}
          >
            {isUpcoming ? 'Coming Soon' : 'Join Challenge'}
          </button>
        ) : (
          <button 
            className="secondary" 
            onClick={() => onOpenDashboard(_id)}
            style={{ width: '100%', background: 'var(--primary)', color: '#fff' }}
          >
            Open Dashboard
          </button>
        )}
      </div>
    </article>
  );
}

function CompletedChallengeCard({ historyItem }) {
  const { name, type, banner, completedAt, spEarned, badgeAwarded, placement, colorTheme } = historyItem;
  
  return (
    <article className="challenge-card completed" style={{ background: '#f8fafc', borderLeft: `6px solid ${colorTheme.includes('gradient') ? '#12805c' : colorTheme}` }}>
      <div className="challenge-card-header">
        <span className="challenge-emoji">{banner || '🏅'}</span>
        <div className="challenge-card-badge-row">
          <span className="challenge-badge completed">Completed ✅</span>
          <span className="challenge-badge type">{type}</span>
        </div>
      </div>

      <div className="challenge-card-content">
        <h3>{name}</h3>
        <p className="placement-label" style={{ margin: '8px 0', fontSize: '14px' }}>Placement: <strong>{placement}</strong></p>
        <p className="muted" style={{ fontSize: '11px', margin: 0 }}>Completed on {new Date(completedAt).toLocaleDateString()}</p>
        
        <div className="challenge-rewards-summary" style={{ marginTop: '12px' }}>
          <span className="sp-earned-tag">Earned: <b>+{spEarned} SP</b></span>
          {badgeAwarded && <span className="badge-tag">🏅 {badgeAwarded}</span>}
        </div>
      </div>
    </article>
  );
}

function ChallengeDashboardModal({ challengeId, student, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState('');
  const [simulating, setSimulating] = useState(false);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'X-Student-Email': student.email
  }), [student.email]);

  const loadDetails = async () => {
    try {
      const res = await fetch(`${API}/challenges/${challengeId}`, { headers });
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetails();
  }, [challengeId, headers]);

  useEffect(() => {
    if (!data?.challenge?.endDate) return;
    const end = new Date(data.challenge.endDate).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeRemaining('Challenge Completed');
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [data]);

  const handleSimulate = async (eventType) => {
    setSimulating(true);
    try {
      const res = await fetch(`${API}/activities/trigger`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ eventType })
      });
      if (res.ok) {
        const updateResult = await res.json();
        if (updateResult.updates?.length > 0) {
          alert(`Successfully simulated event "${eventType}"! Progress updated.`);
        } else {
          alert(`Simulated event "${eventType}"! However, it didn't match criteria or progress is already 100%.`);
        }
        loadDetails();
      }
    } catch (err) {
      alert('Simulation failed.');
    } finally {
      setSimulating(false);
    }
  };

  if (loading) return <div className="overlay"><section className="modal"><p className="muted">Loading challenge dashboard...</p></section></div>;
  if (!data) return <div className="overlay"><section className="modal"><p className="error">Failed to load challenge details.</p><button className="secondary" onClick={onClose}>Close</button></section></div>;

  const { challenge, enrollmentStatus, progress, totalParticipants, leaderboard, myRank, activityFeed } = data;

  return (
    <div className="overlay">
      <section className="modal wide challenge-dashboard-modal" style={{ padding: 0, overflow: 'hidden', width: '900px', display: 'flex', flexDirection: 'column' }}>
        <div className="challenge-dash-header" style={{ background: challenge.colorTheme || 'var(--primary)', padding: '24px', position: 'relative', color: '#fff' }}>
          <div className="header-meta" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <span className="type-badge" style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{challenge.type} Challenge</span>
            <span className="diff-badge" style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold' }}>{challenge.difficulty}</span>
          </div>
          <h2 style={{ fontSize: '24px', margin: '0 0 8px' }}>{challenge.banner} {challenge.name}</h2>
          <p className="desc" style={{ opacity: 0.9, fontSize: '14px', margin: '0 0 16px', maxWidth: '640px' }}>{challenge.description}</p>
          <div className="timer-box" style={{ display: 'inline-block', background: 'rgba(0,0,0,0.15)', padding: '8px 12px', borderRadius: '6px' }}>
            <span style={{ fontSize: '11px', display: 'block', opacity: 0.8 }}>⏳ Time Remaining</span>
            <strong style={{ fontSize: '16px' }}>{timeRemaining}</strong>
          </div>
          <button className="close-btn" onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', border: 0, background: 'transparent', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>×</button>
        </div>

        <div className="challenge-dash-grid" style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '16px', padding: '16px', maxHeight: '70vh', overflowY: 'auto', background: '#f8fafc' }}>
          <div className="dash-col main-col">
            <div className="panel sub-panel" style={{ padding: '16px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--primary)' }}>My Challenge Progress</h3>
              {progress ? (
                <div className="dash-progress-wrap">
                  <div className="progress-numbers" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <strong>{progress.completedTasks} / {progress.targetTasks} tasks</strong>
                    <span>{progress.progressPct}% Completed</span>
                  </div>
                  <div className="progress-track large" style={{ height: '12px', background: '#e2e8f0', borderRadius: '6px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div className="progress-fill" style={{ height: '100%', background: 'var(--primary)', width: `${progress.progressPct}%`, transition: 'width 0.3s ease' }} />
                  </div>
                  {progress.progressPct === 100 ? (
                    <p className="complete-msg" style={{ margin: 0, color: 'var(--green)', fontSize: '13px', fontWeight: 'bold' }}>🎉 Congratulations! You have completed all tasks in this challenge. Standard rewards (+{challenge.spPoints} SP) have been credited to your bank.</p>
                  ) : (
                    <p className="muted" style={{ margin: 0, fontSize: '13px' }}>Complete {progress.targetTasks - progress.completedTasks} more tasks of type <b>{challenge.completionCriteria.eventType.replace('_', ' ')}</b> before deadline to qualify.</p>
                  )}
                </div>
              ) : (
                <p className="error">Join this challenge to track progress.</p>
              )}
            </div>

            <div className="panel sub-panel" style={{ padding: '16px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '16px' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '16px', color: 'var(--primary)' }}>Rules & Rewards</h3>
              <div className="rules-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="rules-item" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '13px' }}>SP Rewards</h4>
                  <p style={{ margin: '0 0 4px', fontSize: '12px' }}>Completion: <b>+{challenge.spPoints} SP</b></p>
                  {challenge.winnerBonus > 0 && <p className="gold-text" style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--amber)' }}>Winner (1st): <b>+{challenge.winnerBonus} SP</b></p>}
                  {challenge.runnerUpBonus > 0 && <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#64748b' }}>Runner-up (2nd): <b>+{challenge.runnerUpBonus} SP</b></p>}
                  {challenge.thirdBonus > 0 && <p style={{ margin: 0, fontSize: '12px', color: '#b45309' }}>Third Place (3rd): <b>+{challenge.thirdBonus} SP</b></p>}
                </div>
                <div className="rules-item" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '13px' }}>Badge Awarded</h4>
                  <p style={{ margin: 0, fontSize: '12px' }}>{challenge.rewardBadge ? `🏅 ${challenge.rewardBadge}` : 'No special badge'}</p>
                </div>
                <div className="rules-item" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '13px' }}>Criteria</h4>
                  <p style={{ margin: '0 0 4px', fontSize: '12px' }}>Event: <code>{challenge.completionCriteria.eventType}</code></p>
                  <p style={{ margin: 0, fontSize: '12px' }}>Tasks Required: <b>{challenge.tasksRequired}</b></p>
                </div>
                <div className="rules-item" style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                  <h4 style={{ margin: '0 0 6px', fontSize: '13px' }}>Details</h4>
                  <p style={{ margin: '0 0 4px', fontSize: '12px' }}>Max Participants: {challenge.maxParticipants || 'Unlimited'}</p>
                  <p style={{ margin: 0, fontSize: '12px' }}>Total Enrolled: <b>{totalParticipants}</b></p>
                </div>
              </div>
            </div>

            <div className="panel sub-panel developer-sim-panel" style={{ padding: '16px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 6px', fontSize: '16px', color: 'var(--amber)' }}>⚙️ Developer Simulator (Test Auto-Tracking)</h3>
              <p className="muted" style={{ fontSize: '12px', margin: '0 0 12px' }}>The challenge tracks the event <code>{challenge.completionCriteria.eventType}</code>. Click the buttons below to simulate student actions. This will automatically update your challenge progress without manual inputs.</p>
              <div className="simulator-buttons-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('quiz_complete')} style={{ minHeight: '30px', fontSize: '11px' }}>✏️ Complete Quiz</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('assignment_submit')} style={{ minHeight: '30px', fontSize: '11px' }}>📤 Submit Assignment</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('attendance_mark')} style={{ minHeight: '30px', fontSize: '11px' }}>📅 Mark Attendance</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('study_goal_complete')} style={{ minHeight: '30px', fontSize: '11px' }}>🎯 Complete Study Goal</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('weekly_goal_complete')} style={{ minHeight: '30px', fontSize: '11px' }}>🗓️ Complete Weekly Goal</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('study_session_finish')} style={{ minHeight: '30px', fontSize: '11px' }}>⏰ Finish Study Session</button>
                <button className="secondary small" disabled={simulating} onClick={() => handleSimulate('reflection_upload')} style={{ minHeight: '30px', fontSize: '11px', gridColumn: 'span 3' }}>📝 Upload Reflection</button>
              </div>
            </div>
          </div>

          <div className="dash-col side-col">
            <div className="panel sub-panel side-panel scrollable-panel" style={{ padding: '16px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--primary)' }}>🏆 Leaderboard</h3>
              {leaderboard.length === 0 ? (
                <p className="empty" style={{ fontSize: '12px' }}>No leaderboard entries yet.</p>
              ) : (
                <div className="challenge-leaderboard-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {leaderboard.map((item, idx) => {
                    let medal = '';
                    if (item.rank === 1) medal = '🥇';
                    else if (item.rank === 2) medal = '🥈';
                    else if (item.rank === 3) medal = '🥉';
                    
                    return (
                      <div key={item.email} className={`leader-row ${String(item.studentId) === String(student._id) ? 'self' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: '4px', background: String(item.studentId) === String(student._id) ? '#edf8fb' : '#f8fafc', fontSize: '12px' }}>
                        <span className="rank" style={{ width: '20px', fontWeight: 'bold' }}>{medal || `${item.rank}`}</span>
                        <div className="name-wrap" style={{ flex: 1, marginLeft: '8px' }}>
                          <strong>{item.name}</strong>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--muted)' }}>{item.completionPct}% done</span>
                        </div>
                        <span className="sp-won" style={{ fontWeight: 'bold', color: 'var(--primary)' }}>+{item.spEarned} SP</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="panel sub-panel side-panel scrollable-panel" style={{ padding: '16px', background: '#fff', border: '1px solid var(--line)', borderRadius: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: 'var(--primary)' }}>⚡ Live Activity Feed</h3>
              {activityFeed.length === 0 ? (
                <p className="empty" style={{ fontSize: '12px' }}>No activities logged yet.</p>
              ) : (
                <div className="activity-feed-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activityFeed.map((feed, idx) => (
                    <div key={idx} className="feed-row" style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', fontSize: '12px' }}>
                      <p style={{ margin: '0 0 2px' }}><strong>{feed.name}</strong> {feed.message}</p>
                      <span style={{ fontSize: '9px', color: 'var(--muted)' }}>{new Date(feed.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function AdminChallengesPanel({ stats, auth }) {
  const [challenges, setChallenges] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editChallengeId, setEditChallengeId] = useState(null);
  const [activeTab, setActiveTab] = useState('list');

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [banner, setBanner] = useState('🏆');
  const [type, setType] = useState('Daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [eligibilityRules, setEligibilityRules] = useState('');
  const [difficulty, setDifficulty] = useState('Easy');
  const [tasksRequired, setTasksRequired] = useState(1);
  const [eventType, setEventType] = useState('quiz_complete');
  const [rewardBadge, setRewardBadge] = useState('');
  const [spPoints, setSpPoints] = useState(10);
  const [winnerBonus, setWinnerBonus] = useState(50);
  const [runnerUpBonus, setRunnerUpBonus] = useState(25);
  const [thirdBonus, setThirdBonus] = useState(10);
  const [colorTheme, setColorTheme] = useState('linear-gradient(135deg, #176b87, #0f4d62)');

  const headers = adminHeaders(auth);

  const loadChallenges = async () => {
    try {
      const res = await fetch(`${API}/challenges`, {
        headers: { 'X-Student-Email': auth.email }
      });
      if (res.ok) {
        const data = await res.json();
        setChallenges(data.challenges || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch(`${API}/admin/challenges/analytics`, { headers });
      if (res.ok) {
        setAnalytics(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadChallenges();
    loadAnalytics();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name, description, banner, type, startDate, endDate,
      maxParticipants: maxParticipants ? Number(maxParticipants) : null,
      eligibilityRules, difficulty, tasksRequired: Number(tasksRequired),
      completionCriteria: { eventType },
      rewardBadge, spPoints: Number(spPoints),
      winnerBonus: Number(winnerBonus), runnerUpBonus: Number(runnerUpBonus), thirdBonus: Number(thirdBonus),
      colorTheme
    };

    try {
      const method = editChallengeId ? 'PUT' : 'POST';
      const url = editChallengeId ? `${API}/challenges/${editChallengeId}` : `${API}/challenges`;
      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowForm(false);
        resetForm();
        loadChallenges();
        loadAnalytics();
      } else {
        const errorData = await res.json();
        alert(errorData.error || 'Failed to save challenge');
      }
    } catch (err) {
      alert('Network error');
    }
  };

  const handleEdit = (ch) => {
    setEditChallengeId(ch._id);
    setName(ch.name);
    setDescription(ch.description);
    setBanner(ch.banner);
    setType(ch.type);
    
    const startIso = new Date(ch.startDate).toISOString();
    const endIso = new Date(ch.endDate).toISOString();
    setStartDate(startIso.substring(0, 16));
    setEndDate(endIso.substring(0, 16));
    
    setMaxParticipants(ch.maxParticipants || '');
    setEligibilityRules(ch.eligibilityRules || '');
    setDifficulty(ch.difficulty);
    setTasksRequired(ch.tasksRequired);
    setEventType(ch.completionCriteria?.eventType || 'quiz_complete');
    setRewardBadge(ch.rewardBadge || '');
    setSpPoints(ch.spPoints);
    setWinnerBonus(ch.winnerBonus);
    setRunnerUpBonus(ch.runnerUpBonus);
    setThirdBonus(ch.thirdBonus);
    setColorTheme(ch.colorTheme);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this challenge? This deletes all enrollments, leaderboard logs and completion history!')) return;
    try {
      const res = await fetch(`${API}/challenges/${id}`, {
        method: 'DELETE',
        headers
      });
      if (res.ok) {
        loadChallenges();
        loadAnalytics();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handlePauseToggle = async (ch) => {
    const nextStatus = ch.status === 'paused' ? 'active' : 'paused';
    try {
      const res = await fetch(`${API}/challenges/${ch._id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        loadChallenges();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRewardWinners = async (id) => {
    if (!confirm('Are you sure you want to finalize and reward winners for this challenge right now?')) return;
    try {
      const res = await fetch(`${API}/challenges/${id}/reward`, {
        method: 'POST',
        headers
      });
      if (res.ok) {
        alert('Winners awarded successfully!');
        loadChallenges();
        loadAnalytics();
      } else {
        const d = await res.json();
        alert(d.error || 'Failed to award winners');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDuplicate = (ch) => {
    setEditChallengeId(null);
    setName(`${ch.name} (Copy)`);
    setDescription(ch.description);
    setBanner(ch.banner);
    setType(ch.type);
    setStartDate('');
    setEndDate('');
    setMaxParticipants(ch.maxParticipants || '');
    setEligibilityRules(ch.eligibilityRules || '');
    setDifficulty(ch.difficulty);
    setTasksRequired(ch.tasksRequired);
    setEventType(ch.completionCriteria?.eventType || 'quiz_complete');
    setRewardBadge(ch.rewardBadge || '');
    setSpPoints(ch.spPoints);
    setWinnerBonus(ch.winnerBonus);
    setRunnerUpBonus(ch.runnerUpBonus);
    setThirdBonus(ch.thirdBonus);
    setColorTheme(ch.colorTheme);
    setShowForm(true);
  };

  const viewParticipants = async (ch) => {
    setSelectedChallenge(ch);
    setActiveTab('participants');
    try {
      const res = await fetch(`${API}/admin/challenges/${ch._id}/participants`, { headers });
      if (res.ok) {
        const d = await res.json();
        setParticipants(d.participants || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setEditChallengeId(null);
    setName('');
    setDescription('');
    setBanner('🏆');
    setType('Daily');
    setStartDate('');
    setEndDate('');
    setMaxParticipants('');
    setEligibilityRules('');
    setDifficulty('Easy');
    setTasksRequired(1);
    setEventType('quiz_complete');
    setRewardBadge('');
    setSpPoints(10);
    setWinnerBonus(50);
    setRunnerUpBonus(25);
    setThirdBonus(10);
    setColorTheme('linear-gradient(135deg, #176b87, #0f4d62)');
  };

  return (
    <section className="panel admin-challenges-panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Challenge Management</h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className={activeTab === 'list' ? 'active' : ''} onClick={() => setActiveTab('list')} style={{ border: '1px solid var(--line)', background: '#fff', padding: '6px 12px', borderRadius: '6px' }}>List</button>
          <button className={activeTab === 'analytics' ? 'active' : ''} onClick={() => { setActiveTab('analytics'); loadAnalytics(); }} style={{ border: '1px solid var(--line)', background: '#fff', padding: '6px 12px', borderRadius: '6px' }}>Analytics</button>
          <button className="primary" onClick={() => { resetForm(); setShowForm(true); }} style={{ padding: '6px 12px', borderRadius: '6px' }}>+ Create Challenge</button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div style={{ marginTop: '16px' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Challenge</th>
                <th>Type</th>
                <th>Timeline</th>
                <th>Difficulty</th>
                <th>SP Rewards</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map(ch => (
                <tr key={ch._id}>
                  <td>
                    <strong>{ch.banner} {ch.name}</strong>
                    <div className="muted" style={{ fontSize: '11px' }}>Criteria: <code>{ch.completionCriteria?.eventType}</code></div>
                  </td>
                  <td>{ch.type}</td>
                  <td>
                    <div style={{ fontSize: '12px' }}>Start: {new Date(ch.startDate).toLocaleDateString()}</div>
                    <div style={{ fontSize: '12px' }}>End: {new Date(ch.endDate).toLocaleDateString()}</div>
                  </td>
                  <td>
                    <span className={`challenge-badge diff-${ch.difficulty.toLowerCase()}`} style={{ display: 'inline-block' }}>{ch.difficulty}</span>
                  </td>
                  <td>
                    <div style={{ fontSize: '12px' }}>Std: +{ch.spPoints}</div>
                    <div style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 'bold' }}>Winner: +{ch.winnerBonus}</div>
                  </td>
                  <td>
                    <span className={`challenge-status-badge ${ch.status}`} style={{ textTransform: 'capitalize' }}>{ch.status}</span>
                    {ch.isRewarded && <span style={{ fontSize: '10px', display: 'block', color: 'var(--green)' }}>Rewarded ✅</span>}
                  </td>
                  <td>
                    <div className="admin-actions-cell" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      <button className="secondary small" onClick={() => handleEdit(ch)} style={{ padding: '2px 6px', fontSize: '11px', minHeight: '26px' }}>Edit</button>
                      <button className="secondary small" onClick={() => handleDuplicate(ch)} style={{ padding: '2px 6px', fontSize: '11px', minHeight: '26px' }}>Duplicate</button>
                      <button className="secondary small" onClick={() => handlePauseToggle(ch)} style={{ padding: '2px 6px', fontSize: '11px', minHeight: '26px' }}>{ch.status === 'paused' ? 'Resume' : 'Pause'}</button>
                      <button className="secondary small" onClick={() => viewParticipants(ch)} style={{ padding: '2px 6px', fontSize: '11px', minHeight: '26px' }}>Participants</button>
                      {!ch.isRewarded && new Date(ch.endDate) <= new Date() && (
                        <button className="secondary small" style={{ color: 'var(--amber)', padding: '2px 6px', fontSize: '11px', minHeight: '26px' }} onClick={() => handleRewardWinners(ch._id)}>Reward Winners</button>
                      )}
                      <button className="secondary small" style={{ color: 'var(--red)', padding: '2px 6px', fontSize: '11px', minHeight: '26px' }} onClick={() => handleDelete(ch._id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'analytics' && analytics && (
        <div style={{ marginTop: '16px' }} className="analytics-section">
          <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            <Metric label="Active Challenges" value={analytics.activeChallenges} />
            <Metric label="Total Completions" value={analytics.totalCompletions} />
            <Metric label="Participation Rate" value={`${analytics.participationRate}%`} />
            <Metric label="Completion Rate" value={`${analytics.completionRate}%`} />
            <Metric label="Average Progress" value={`${analytics.averageProgress}%`} />
            <Metric label="Most Popular" value={analytics.mostPopularChallenge} />
          </div>

          <section className="subpanel" style={{ marginTop: '24px', padding: '16px', border: '1px solid var(--line)', borderRadius: '8px' }}>
            <h3>Challenge SP Reward Distribution</h3>
            <div className="metric-grid small" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginTop: '12px' }}>
              <Metric label="Total SP Distributed" value={analytics.rewardDistribution.totalSpAwarded} />
              <Metric label="Standard Completion SP" value={analytics.rewardDistribution.standardRewards} />
              <Metric label="Winner Placement SP" value={analytics.rewardDistribution.bonusRewards} />
            </div>
          </section>
        </div>
      )}

      {activeTab === 'participants' && selectedChallenge && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3>Participants for: {selectedChallenge.banner} {selectedChallenge.name}</h3>
            <button className="secondary" onClick={() => setActiveTab('list')}>Back to List</button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Email</th>
                <th>Enrollment Status</th>
                <th>Joined Date</th>
                <th>Tasks Completed</th>
                <th>Progress %</th>
              </tr>
            </thead>
            <tbody>
              {participants.map(p => (
                <tr key={p._id}>
                  <td><strong>{p.name}</strong></td>
                  <td>{p.email}</td>
                  <td>
                    <span className={`challenge-status-badge ${p.status}`}>{p.status}</span>
                  </td>
                  <td>{new Date(p.joinedAt).toLocaleDateString()}</td>
                  <td>{p.completedTasks} / {selectedChallenge.tasksRequired}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="progress-track" style={{ width: '80px', margin: 0, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div className="progress-fill" style={{ height: '100%', background: 'var(--primary)', width: `${p.progressPct}%` }} />
                      </div>
                      <b>{p.progressPct}%</b>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="overlay">
          <div className="modal" style={{ width: '600px', background: '#fff', borderRadius: '8px', padding: '20px' }}>
            <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '20px', margin: 0 }}>{editChallengeId ? 'Edit Challenge' : 'Create New Challenge'}</h2>
              <button className="icon" onClick={() => { setShowForm(false); resetForm(); }} style={{ border: 0, background: 'transparent', fontSize: '18px', cursor: 'pointer' }}>x</button>
            </div>
            <form onSubmit={handleSubmit} className="login-form" style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Challenge Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly Coding Blitz" style={{ padding: '8px' }} />
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Description</label>
                <textarea required value={description} onChange={e => setDescription(e.target.value)} placeholder="Summary of challenge rules and targets..." rows="2" style={{ width: '100%', border: '1px solid var(--line)', borderRadius: '7px', padding: '8px' }} />
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Emoji Icon</label>
                  <input value={banner} onChange={e => setBanner(e.target.value)} placeholder="🏆" style={{ padding: '8px' }} />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Type</label>
                  <select value={type} onChange={e => setType(e.target.value)} style={{ padding: '8px', borderRadius: '7px', border: '1px solid var(--line)', height: '40px' }}>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Subject">Subject</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Coding">Coding</option>
                    <option value="Attendance">Attendance</option>
                    <option value="Study Hours">Study Hours</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Start Date</label>
                  <input required type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ padding: '8px' }} />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>End Date</label>
                  <input required type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ padding: '8px' }} />
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Max Participants</label>
                  <input type="number" value={maxParticipants} onChange={e => setMaxParticipants(e.target.value)} placeholder="Unlimited" style={{ padding: '8px' }} />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Difficulty</label>
                  <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={{ padding: '8px', borderRadius: '7px', border: '1px solid var(--line)', height: '40px' }}>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Tasks Required</label>
                  <input required type="number" min="1" value={tasksRequired} onChange={e => setTasksRequired(e.target.value)} style={{ padding: '8px' }} />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Tracked Event</label>
                  <select value={eventType} onChange={e => setEventType(e.target.value)} style={{ padding: '8px', borderRadius: '7px', border: '1px solid var(--line)', height: '40px' }}>
                    <option value="quiz_complete">Complete Quiz</option>
                    <option value="assignment_submit">Submit Assignment</option>
                    <option value="attendance_mark">Mark Attendance</option>
                    <option value="study_goal_complete">Complete Study Goal</option>
                    <option value="weekly_goal_complete">Complete Weekly Goal</option>
                    <option value="study_session_finish">Finish Study Session</option>
                    <option value="reflection_upload">Upload Reflection</option>
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ display: 'flex', gap: '8px' }}>
                <div className="form-group" style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Reward Badge</label>
                  <input value={rewardBadge} onChange={e => setRewardBadge(e.target.value)} placeholder="e.g. Quiz Master" style={{ padding: '8px' }} />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Standard SP Reward</label>
                  <input required type="number" value={spPoints} onChange={e => setSpPoints(e.target.value)} style={{ padding: '8px' }} />
                </div>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Winner Placement SP Bonuses (1st / 2nd / 3rd)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input required type="number" title="Winner Bonus" value={winnerBonus} onChange={e => setWinnerBonus(e.target.value)} placeholder="Winner" style={{ padding: '8px' }} />
                  <input required type="number" title="Runner Up Bonus" value={runnerUpBonus} onChange={e => setRunnerUpBonus(e.target.value)} placeholder="Runner Up" style={{ padding: '8px' }} />
                  <input required type="number" title="Third Place Bonus" value={thirdBonus} onChange={e => setThirdBonus(e.target.value)} placeholder="Third" style={{ padding: '8px' }} />
                </div>
              </div>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Color Theme Gradient</label>
                <input value={colorTheme} onChange={e => setColorTheme(e.target.value)} placeholder="linear-gradient(135deg, #176b87, #0f4d62)" style={{ padding: '8px' }} />
              </div>
              <button className="primary" type="submit" style={{ marginTop: '12px', minHeight: '40px' }}>Save Challenge</button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
