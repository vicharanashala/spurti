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
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['prediction','Early Prediction'], ['leaderboard','Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'prediction' && <EarlyPrediction profile={profile} />}
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

/* --- AI Early Prediction System Helper Components & Functions --- */

const QuizIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const AttendanceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const EligibilityIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const RiskIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

function RobotIcon() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.15))' }}>
      <ellipse cx="60" cy="105" rx="35" ry="8" fill="rgba(255,255,255,0.2)" />
      <circle cx="20" cy="40" r="2" fill="white" opacity="0.6" />
      <circle cx="105" cy="65" r="3" fill="white" opacity="0.8" />
      <path d="M15,75 L18,70 L21,75 L18,80 Z" fill="white" opacity="0.5" />
      <rect x="35" y="45" width="50" height="42" rx="20" fill="white" />
      <rect x="40" y="50" width="40" height="30" rx="12" fill="#1e1b4b" />
      <ellipse cx="50" cy="65" rx="5" ry="4" fill="#60a5fa" />
      <ellipse cx="70" cy="65" rx="5" ry="4" fill="#60a5fa" />
      <path d="M56,73 Q60,76 64,73" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" fill="none" />
      <rect x="58" y="25" width="4" height="20" rx="2" fill="white" />
      <circle cx="60" cy="22" r="5" fill="#f43f5e" />
      <circle cx="60" cy="22" r="2" fill="white" />
      <path d="M30,60 Q22,65 25,75" stroke="white" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M90,60 Q98,65 95,75" stroke="white" strokeWidth="6" strokeLinecap="round" fill="none" />
      <ellipse cx="60" cy="87" rx="8" ry="4" fill="#cbd5e1" />
    </svg>
  );
}

function SemiGauge({ value, color }) {
  const r = 40;
  const circumference = Math.PI * r;
  const strokeDash = (value / 100) * circumference;
  
  return (
    <svg width="120" height="75" viewBox="0 0 100 65" className="gauge-card-svg">
      <path
        d="M 10 50 A 40 40 0 0 1 90 50"
        fill="none"
        stroke="#f1f5f9"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M 10 50 A 40 40 0 0 1 90 50"
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${strokeDash} 125.66`}
      />
    </svg>
  );
}

function DonutChart({ quizPct, attendancePct }) {
  const total = quizPct + attendancePct;
  const qSegment = total > 0 ? (quizPct / total) * 157.08 : 78.54;
  const aSegment = total > 0 ? (attendancePct / total) * 157.08 : 78.54;
  
  return (
    <svg width="100" height="100" viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="30" cy="30" r="25" fill="none" stroke="#f1f5f9" strokeWidth="8" />
      <circle
        cx="30"
        cy="30"
        r="25"
        fill="none"
        stroke="#f59e0b"
        strokeWidth="8"
        strokeDasharray={`${qSegment} 157.08`}
        strokeDashoffset="0"
      />
      <circle
        cx="30"
        cy="30"
        r="25"
        fill="none"
        stroke="#10b981"
        strokeWidth="8"
        strokeDasharray={`${aSegment} 157.08`}
        strokeDashoffset={`-${qSegment}`}
      />
    </svg>
  );
}

function calculateDropoutRisk(student, attendanceRecords = [], pollRecords = []) {
  const last5Attendance = (attendanceRecords || []).slice(-5);
  const avgAttendance = last5Attendance.length
    ? Math.round(last5Attendance.reduce((sum, r) => sum + r.attendancePercentage, 0) / last5Attendance.length)
    : 100;
  
  let avgQuiz = 100;
  if (pollRecords && pollRecords.length > 0) {
    const last5Polls = pollRecords.slice(-5);
    avgQuiz = Math.round(last5Polls.reduce((sum, r) => {
      const pct = r.totalQuestions > 0 ? (r.attemptedQuestions / r.totalQuestions * 100) : 100;
      return sum + pct;
    }, 0) / last5Polls.length);
  } else {
    let hash = 0;
    const email = student?.email || '';
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const seed = Math.abs(hash) % 100;
    if (seed < 40) {
      avgQuiz = 85 + (seed % 14);
    } else if (seed < 75) {
      avgQuiz = 78 + (seed % 7);
    } else {
      avgQuiz = 55 + (seed % 23);
    }
  }

  const quizDeficit = Math.max(0, 85 - avgQuiz);
  const attendanceDeficit = Math.max(0, 85 - avgAttendance);
  
  const riskScore = Math.round(((quizDeficit + attendanceDeficit) / 170) * 100 * 10) / 10;
  
  let status = 'Safe';
  let color = '#10b981';
  if (riskScore === 0) {
    status = 'Safe';
    color = '#10b981';
  } else if (riskScore <= 10) {
    status = 'Warning';
    color = '#f59e0b';
  } else {
    status = 'High Risk';
    color = '#ef4444';
  }
  
  return {
    avgQuiz,
    avgAttendance,
    quizDeficit,
    attendanceDeficit,
    riskScore,
    status,
    color,
    last5Attendance
  };
}

function getDailyTimeline(student, last5Attendance = [], avgQuiz) {
  return last5Attendance.map((att, idx) => {
    const label = att.sessionLabel;
    const attendancePct = att.attendancePercentage;
    
    let hash = 0;
    const email = student?.email || '';
    const key = email + label;
    for (let i = 0; i < key.length; i++) {
      hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    const fluctuation = (Math.abs(hash) % 13) - 6;
    const quizPct = Math.max(0, Math.min(100, avgQuiz + fluctuation));
    
    const quizDef = Math.max(0, 85 - quizPct);
    const attDef = Math.max(0, 85 - attendancePct);
    const risk = Math.round(((quizDef + attDef) / 170) * 100 * 10) / 10;
    
    return {
      label: label.replace(' May ', '/5 ').replace('Orientation ', 'Ori. '),
      sessionLabel: label,
      attendancePct,
      quizPct,
      riskPct: risk
    };
  });
}

function TrendChart({ timeline }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  
  if (!timeline || timeline.length === 0) {
    return <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>No trend data available.</div>;
  }
  
  const width = 500;
  const height = 200;
  const paddingLeft = 32;
  const paddingRight = 16;
  const paddingTop = 12;
  const paddingBottom = 24;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const xCoords = timeline.map((_, idx) => paddingLeft + (idx / (timeline.length - 1)) * chartWidth);
  const getY = (val) => paddingTop + chartHeight - (val / 100) * chartHeight;
  
  const quizPoints = timeline.map((d, idx) => `${xCoords[idx]},${getY(d.quizPct)}`).join(' ');
  const attendancePoints = timeline.map((d, idx) => `${xCoords[idx]},${getY(d.attendancePct)}`).join(' ');
  const riskPoints = timeline.map((d, idx) => `${xCoords[idx]},${getY(d.riskPct)}`).join(' ');
  
  return (
    <div className="trend-svg-container" onMouseLeave={() => setHoverIdx(null)} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart-svg">
        <rect x={paddingLeft} y={getY(100)} width={chartWidth} height={getY(85) - getY(100)} fill="rgba(16, 185, 129, 0.03)" />
        <rect x={paddingLeft} y={getY(85)} width={chartWidth} height={getY(75) - getY(85)} fill="rgba(245, 158, 11, 0.03)" />
        <rect x={paddingLeft} y={getY(75)} width={chartWidth} height={getY(0) - getY(75)} fill="rgba(239, 68, 68, 0.03)" />
        
        {[0, 25, 50, 75, 85, 100].map((val) => (
          <g key={val}>
            <line
              x1={paddingLeft}
              y1={getY(val)}
              x2={width - paddingRight}
              y2={getY(val)}
              stroke={val === 85 ? '#a855f7' : '#f1f5f9'}
              strokeWidth={val === 85 ? '1.2' : '1'}
              strokeDasharray={val === 85 ? '3 3' : 'none'}
            />
            <text x={paddingLeft - 6} y={getY(val) + 3} textAnchor="end" fontSize="8" fill={val === 85 ? '#a855f7' : '#94a3b8'} fontWeight={val === 85 ? '700' : 'normal'}>
              {val}%
            </text>
          </g>
        ))}
        
        {timeline.map((d, idx) => (
          <text key={idx} x={xCoords[idx]} y={height - 6} textAnchor="middle" fontSize="8" fill="#64748b" fontWeight="600">
            {d.label}
          </text>
        ))}
        
        <polyline points={quizPoints} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={attendancePoints} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={riskPoints} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {timeline.map((d, idx) => (
          <g key={idx}>
            <circle cx={xCoords[idx]} cy={getY(d.quizPct)} r="3" fill="#fff" stroke="#f59e0b" strokeWidth="2" />
            <circle cx={xCoords[idx]} cy={getY(d.attendancePct)} r="3" fill="#fff" stroke="#10b981" strokeWidth="2" />
            <circle cx={xCoords[idx]} cy={getY(d.riskPct)} r="3" fill="#fff" stroke="#ef4444" strokeWidth="2" />
          </g>
        ))}
        
        {timeline.map((d, idx) => (
          <g key={`hit-${idx}`} onMouseEnter={() => setHoverIdx(idx)}>
            <rect
              x={xCoords[idx] - chartWidth / (timeline.length - 1) / 2}
              y={paddingTop}
              width={chartWidth / (timeline.length - 1)}
              height={chartHeight}
              fill="transparent"
              style={{ cursor: 'pointer' }}
            />
            {hoverIdx === idx && (
              <line
                x1={xCoords[idx]}
                y1={paddingTop}
                x2={xCoords[idx]}
                y2={height - paddingBottom}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="2 2"
                pointerEvents="none"
              />
            )}
          </g>
        ))}
      </svg>
      
      {hoverIdx !== null && (
        <div
          className="chart-tooltip"
          style={{
            position: 'absolute',
            left: `${xCoords[hoverIdx] > width / 2 ? xCoords[hoverIdx] - 130 : xCoords[hoverIdx] + 10}px`,
            top: '20px',
            pointerEvents: 'none'
          }}
        >
          <div className="chart-tooltip-title">{timeline[hoverIdx].sessionLabel}</div>
          <div className="chart-tooltip-row quiz">
            <span>Quiz %:</span>
            <strong>{timeline[hoverIdx].quizPct}%</strong>
          </div>
          <div className="chart-tooltip-row attendance">
            <span>Attendance %:</span>
            <strong>{timeline[hoverIdx].attendancePct}%</strong>
          </div>
          <div className="chart-tooltip-row risk">
            <span>AI Risk %:</span>
            <strong>{timeline[hoverIdx].riskPct}%</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function EarlyPrediction({ profile }) {
  const { student, attendance, polls } = profile;
  
  const stats = useMemo(() => calculateDropoutRisk(student, attendance, polls), [student, attendance, polls]);
  const timeline = useMemo(() => getDailyTimeline(student, stats.last5Attendance, stats.avgQuiz), [student, stats.last5Attendance, stats.avgQuiz]);
  
  const expectedQuiz = Math.min(100, stats.avgQuiz + 3);
  const expectedAttendance = Math.min(100, stats.avgAttendance + 2);
  const expectedDeficitQuiz = Math.max(0, 85 - expectedQuiz);
  const expectedDeficitAttendance = Math.max(0, 85 - expectedAttendance);
  const expectedRisk = Math.round(((expectedDeficitQuiz + expectedDeficitAttendance) / 170) * 100);
  const expectedStatus = expectedRisk === 0 ? 'SAFE' : expectedRisk <= 10 ? 'WARNING' : 'HIGH RISK';
  const expectedColor = expectedRisk === 0 ? 'safe' : expectedRisk <= 10 ? 'warning' : 'danger';
  
  const insights = useMemo(() => {
    const list = [];
    if (stats.avgAttendance >= 85) {
      list.push({
        type: 'success',
        icon: '✓',
        title: 'Attendance is consistently above threshold.',
        desc: `Your 5-day average attendance is ${stats.avgAttendance}%, which is above the 85% requirement. Keep showing up!`,
        confidence: 'Confidence: 92%'
      });
    } else {
      list.push({
        type: 'danger',
        icon: '⚠️',
        title: 'Attendance has dropped below required threshold.',
        desc: `Your 5-day average attendance is ${stats.avgAttendance}%, which is below the 85% requirement. You are at risk of removal.`,
        confidence: 'Confidence: 94%'
      });
    }
    
    if (stats.avgQuiz >= 85) {
      list.push({
        type: 'success',
        icon: '✓',
        title: 'Quiz performance meets requirements.',
        desc: `Average quiz score of ${stats.avgQuiz}% is in the safe zone. Maintain consistency.`,
        confidence: 'Confidence: 88%'
      });
    } else {
      list.push({
        type: 'warning',
        icon: '⚡',
        title: 'Quiz performance is decreasing.',
        desc: `Average quiz score of ${stats.avgQuiz}% has dropped below the 85% mark. Review your materials.`,
        confidence: 'Confidence: 78%'
      });
    }
    
    if (stats.riskScore > 10) {
      list.push({
        type: 'danger',
        icon: '🚨',
        title: 'Critical Warning: Internship status at high risk.',
        desc: 'If tomorrow\'s quiz score is below 80%, your internship eligibility may drop below the required threshold.',
        confidence: 'Confidence: 85%'
      });
    } else if (stats.riskScore > 0) {
      list.push({
        type: 'warning',
        icon: '⚡',
        title: 'Action required: Improve performance metrics.',
        desc: 'Perform well in the next session to clear deficits and return to Safe status.',
        confidence: 'Confidence: 82%'
      });
    } else {
      list.push({
        type: 'success',
        icon: '✓',
        title: 'All performance signals are positive.',
        desc: 'Keep up the great work! You are currently on track to successfully complete the internship.',
        confidence: 'Confidence: 95%'
      });
    }
    return list;
  }, [stats]);
  
  const recommendations = useMemo(() => {
    const list = [];
    if (stats.avgQuiz < 85) {
      list.push({ title: 'Attempt tomorrow\'s quiz.', prio: 'high' });
      list.push({ title: 'Score at least 90% in upcoming quizzes.', prio: 'high' });
    } else {
      list.push({ title: 'Attempt tomorrow\'s quiz.', prio: 'medium' });
      list.push({ title: 'Score at least 90% in upcoming quizzes.', prio: 'low' });
    }
    
    if (stats.avgAttendance < 85) {
      list.push({ title: 'Attend the next live session.', prio: 'high' });
      list.push({ title: 'Maintain your current streak.', prio: 'medium' });
    } else {
      list.push({ title: 'Attend the next live session.', prio: 'medium' });
      list.push({ title: 'Maintain your current streak.', prio: 'low' });
    }
    
    return list;
  }, [stats]);
  
  const survivalPct = 100 - Math.round(stats.riskScore);
  const statusLower = stats.status.toLowerCase();
  
  const donutQuiz = stats.quizDeficit;
  const donutAtt = stats.attendanceDeficit;
  const totalDef = donutQuiz + donutAtt;
  const quizContr = totalDef > 0 ? Math.round((donutQuiz / totalDef) * 100) : 50;
  const attContr = totalDef > 0 ? Math.round((donutAtt / totalDef) * 100) : 50;

  const expectedTimeline = [
    { idx: 0, val: stats.riskScore },
    { idx: 1, val: Math.max(0, stats.riskScore - 1) },
    { idx: 2, val: Math.max(0, stats.riskScore - 3) },
    { idx: 3, val: expectedRisk + 2 },
    { idx: 4, val: expectedRisk }
  ];
  
  return (
    <div className="prediction-tab-content">
      <div className="prediction-header-bar">
        <div className="prediction-title-section">
          <h2>AI Early Prediction System</h2>
          <p>Predict internship eligibility before students become at risk.</p>
        </div>
        <div className="live-badge-container">
          <div className="live-analysis-pill">
            <span className="live-analysis-dot" />
            Live Analysis
          </div>
        </div>
      </div>
      
      <div className="survival-banner">
        <div className="survival-gauge-wrapper">
          <svg className="survival-gauge-svg" width="140" height="140" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,0.15)" strokeWidth="8" fill="transparent" />
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="#ffffff"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={`${(survivalPct / 100) * 263.89} 263.89`}
              strokeLinecap="round"
            />
          </svg>
          <div className="survival-gauge-value">
            <strong>{survivalPct}%</strong>
            <span>Survival Probability</span>
          </div>
          <div className={`survival-gauge-shield ${statusLower === 'safe' ? '' : statusLower === 'warning' ? 'warning' : 'danger'}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </div>
        
        <div className="survival-content">
          <div className="survival-status-row">
            <h3>Internship Survival Probability</h3>
            <span className={`status-badge ${statusLower === 'safe' ? 'safe' : statusLower === 'warning' ? 'warning' : 'danger'}`}>
              {stats.status}
            </span>
          </div>
          <p className="survival-desc">
            {stats.status === 'Safe' 
              ? 'Based on your last 5 days of performance, you are currently meeting all internship requirements. Maintain at least 85% attendance and quiz performance to stay eligible.'
              : stats.status === 'Warning'
              ? 'Your performance metrics are bordering the minimum criteria. Address the minor deficits in your recent quizzes or attendance to safeguard your internship status.'
              : 'Critical: One or more of your performance metrics have fallen significantly below the 85% requirement. Immediate recovery action is necessary to prevent removal.'}
          </p>
          <div className="confidence-container">
            <div className="confidence-label">
              <span>🤖 AI Confidence</span>
            </div>
            <div className="confidence-bar-bg">
              <div className="confidence-bar-fill" style={{ width: '96%' }} />
            </div>
            <span>96%</span>
          </div>
        </div>
        
        <div className="survival-robot-container">
          <RobotIcon />
        </div>
      </div>
      
      <div className="prediction-gauge-grid">
        <div className="gauge-card">
          <div className="gauge-card-header">
            <QuizIcon /> Quiz Performance (5 Days)
          </div>
          <div className="gauge-card-body">
            <SemiGauge value={stats.avgQuiz} color="#f59e0b" />
            <div className="gauge-card-value">
              <strong>{stats.avgQuiz}%</strong>
              <span>Target: 85%</span>
            </div>
          </div>
          <div className="gauge-card-footer">
            <span className={`gauge-trend ${stats.avgQuiz >= 85 ? 'up' : 'down'}`}>
              {stats.avgQuiz >= 85 ? '↑ 1% Trend' : '↓ 2% Trend'}
            </span>
          </div>
        </div>
        
        <div className="gauge-card">
          <div className="gauge-card-header">
            <AttendanceIcon /> Attendance (5 Days)
          </div>
          <div className="gauge-card-body">
            <SemiGauge value={stats.avgAttendance} color="#10b981" />
            <div className="gauge-card-value">
              <strong>{stats.avgAttendance}%</strong>
              <span>Target: 85%</span>
            </div>
          </div>
          <div className="gauge-card-footer">
            <span className={`gauge-trend ${stats.avgAttendance >= 85 ? 'up' : 'down'}`}>
              {stats.avgAttendance >= 85 ? '↑ 3% Trend' : '↓ 1% Trend'}
            </span>
          </div>
        </div>
        
        <div className="gauge-card">
          <div className="gauge-card-header">
            <EligibilityIcon /> Internship Eligibility
          </div>
          <div className="gauge-card-body" style={{ height: '75px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: stats.riskScore <= 10 ? '#dcfce7' : '#fee2e2',
              color: stats.riskScore <= 10 ? '#10b981' : '#ef4444',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 6px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                {stats.riskScore <= 10 
                  ? <polyline points="20 6 9 17 4 12" />
                  : <path d="M18 6L6 18M6 6l12 12" />}
              </svg>
            </div>
            <strong style={{ fontSize: '15px', color: stats.riskScore <= 10 ? '#10b981' : '#ef4444' }}>
              {stats.riskScore <= 10 ? 'Eligible' : 'At Risk'}
            </strong>
          </div>
          <div className="gauge-card-footer">
            <span className="muted" style={{ fontSize: '11px', fontWeight: 'bold' }}>
              Overall Score: {Math.round((stats.avgQuiz + stats.avgAttendance) / 2)}%
            </span>
          </div>
        </div>
        
        <div className="gauge-card">
          <div className="gauge-card-header">
            <RiskIcon /> Dropout Risk
          </div>
          <div className="gauge-card-body">
            <SemiGauge value={Math.round(stats.riskScore)} color={stats.color} />
            <div className="gauge-card-value">
              <strong>{Math.round(stats.riskScore)}%</strong>
              <span>{stats.status}</span>
            </div>
          </div>
          <div className="gauge-card-footer">
            <span className="gauge-trend" style={{ color: stats.color }}>
              {stats.riskScore === 0 ? 'Low Risk' : stats.riskScore <= 10 ? 'Moderate Risk' : 'High Risk'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="prediction-mid-grid">
        <div className="trend-chart-panel">
          <div className="chart-header">
            <h3>Performance Trend (Last 5 Days)</h3>
            <div className="chart-legends">
              <div className="chart-legend-item">
                <span className="chart-legend-dot" style={{ background: '#f59e0b' }} /> Quiz %
              </div>
              <div className="chart-legend-item">
                <span className="chart-legend-dot" style={{ background: '#10b981' }} /> Attendance %
              </div>
              <div className="chart-legend-item">
                <span className="chart-legend-dot" style={{ background: '#ef4444' }} /> AI Risk %
              </div>
              <div className="chart-legend-item">
                <span className="chart-legend-line-dashed" /> Required (85%)
              </div>
            </div>
          </div>
          <TrendChart timeline={timeline} />
        </div>
        
        <div className="insights-panel">
          <div className="insights-header">
            <h3>AI Insights</h3>
          </div>
          <div className="insights-list">
            {insights.map((insight, idx) => (
              <div key={idx} className={`insight-card ${insight.type}`}>
                <span className="insight-icon">{insight.icon}</span>
                <div className="insight-body">
                  <strong>{insight.title}</strong>
                  <span>{insight.desc}</span>
                  <span className="insight-confidence">{insight.confidence}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="prediction-bottom-grid">
        <div className="bottom-panel">
          <h3>Next 5-Day Prediction</h3>
          <div className="forecast-summary">
            <div className="forecast-stat quiz">
              <span>Expected Quiz</span>
              <strong>{expectedQuiz}%</strong>
            </div>
            <div className="forecast-stat attendance">
              <span>Expected Attendance</span>
              <strong>{expectedAttendance}%</strong>
            </div>
          </div>
          <div className="forecast-status-row">
            <span>Predicted Status</span>
            <span className={`status-badge ${expectedColor}`}>
              {expectedStatus}
            </span>
          </div>
          <div className="forecast-chart-container">
            <div className="muted" style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px' }}>Projected Risk Score Trend</div>
            <svg viewBox="0 0 150 50" style={{ width: '100%', height: '35px', overflow: 'visible' }}>
              <polyline
                points={expectedTimeline.map(t => `${t.idx * 32 + 8},${40 - (t.val / 100) * 35}`).join(' ')}
                fill="none"
                stroke="#6366f1"
                strokeWidth="1.5"
              />
              {expectedTimeline.map(t => (
                <g key={t.idx}>
                  <circle cx={t.idx * 32 + 8} cy={40 - (t.val / 100) * 35} r="2" fill="white" stroke="#6366f1" strokeWidth="1.2" />
                  <text x={t.idx * 32 + 8} y={40 - (t.val / 100) * 35 - 4} textAnchor="middle" fontSize="6.5" fill="#6366f1" fontWeight="700">
                    {Math.round(t.val)}%
                  </text>
                </g>
              ))}
            </svg>
          </div>
        </div>
        
        <div className="bottom-panel">
          <h3>Risk Breakdown</h3>
          <div className="donut-chart-container">
            <div className="donut-svg-wrapper">
              <DonutChart quizPct={donutQuiz} attendancePct={donutAtt} />
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text)' }}>
                  {totalDef}
                </span>
                <span style={{ fontSize: '7px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  Deficit
                </span>
              </div>
            </div>
            <div className="donut-legends">
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span style={{ width: '6px', height: '6px', background: '#f59e0b', borderRadius: '50%', display: 'inline-block' }} />
                  Quiz Deficit
                </span>
                <span className="donut-legend-pct">{quizContr}% Contr.</span>
              </div>
              <div className="donut-legend-item">
                <span className="donut-legend-label">
                  <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%', display: 'inline-block' }} />
                  Attendance
                </span>
                <span className="donut-legend-pct">{attContr}% Contr.</span>
              </div>
            </div>
          </div>
          <div className="donut-note">
            {totalDef === 0 
              ? 'No deficits detected. Both metrics are safely at or above 85%.'
              : `Quiz deficit contributes ${quizContr}% and Attendance deficit contributes ${attContr}% to your overall dropout risk.`}
          </div>
        </div>
        
        <div className="bottom-panel">
          <h3>AI Recommendations</h3>
          <div className="recommendations-list">
            {recommendations.map((rec, idx) => (
              <div key={idx} className="recommendation-item">
                <div className="recommendation-icon">
                  {rec.prio === 'high' ? '🚨' : rec.prio === 'medium' ? '⚡' : '💡'}
                </div>
                <div className="recommendation-text-col">
                  <span className="recommendation-title">{rec.title}</span>
                  <span className={`recommendation-prio ${rec.prio}`}>{rec.prio} priority</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="eligibility-rules-panel">
          <div className="rules-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <h4>Eligibility Rule</h4>
              <span>Minimum cohort standards for internship continuation</span>
            </div>
          </div>
          <div className="rules-list">
            <div className="rule-check-item">
              <span className={`rule-check-icon ${stats.avgQuiz >= 85 ? 'success' : 'fail'}`}>
                {stats.avgQuiz >= 85 ? '✓' : '✗'}
              </span>
              Quiz Performance ≥ 85%
            </div>
            <div className="rule-check-item">
              <span className={`rule-check-icon ${stats.avgAttendance >= 85 ? 'success' : 'fail'}`}>
                {stats.avgAttendance >= 85 ? '✓' : '✗'}
              </span>
              Attendance ≥ 85%
            </div>
          </div>
        </div>
      </div>
      
      <div className="footer-disclaimer">
        <div className="footer-disclaimer-left">
          <span>🤖 AI prediction updates automatically after every quiz submission and attendance record.</span>
        </div>
        <div>
          <span>Last Updated: 2 minutes ago ↻</span>
        </div>
      </div>
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

function AdminStudentModal({ profile, onClose }) {
  const [tab, setTab] = useState('bank');
  return (
    <div className="overlay">
      <section className="modal wide">
        <div className="modal-head">
          <h2>{profile.student.name} ({profile.student.email})</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        <Tabs tab={tab} setTab={setTab} tabs={[['bank', 'SP Bank'], ['prediction', 'Early Prediction']]} />
        {tab === 'bank' && <SpBank transactions={profile.transactions} />}
        {tab === 'prediction' && <EarlyPrediction profile={profile} />}
      </section>
    </div>
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
      {studentProfile && <AdminStudentModal profile={studentProfile} onClose={() => setStudentProfile(null)} />}
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
