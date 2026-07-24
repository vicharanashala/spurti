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
        <StudentView profile={profile} onBack={config.allowStudentSearch ? () => setView('landing') : null} onUpdateProfile={setProfile} />
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

function StudentView({ profile, onBack, onUpdateProfile }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);

  const [badgeQueue, setBadgeQueue] = useState([]);
  const [currentBadge, setCurrentBadge] = useState(null);

  useEffect(() => {
    if (!student) return;
    const queue = [];
    const MILESTONES = [
      { id: '100', name: 'Centurion', points: 100, icon: '🥉', color: 'bronze' },
      { id: '200', name: 'Double Centurion', points: 200, icon: '🥈', color: 'silver' },
      { id: '500', name: 'Half-Kilo', points: 500, icon: '🥇', color: 'gold' },
      { id: '1000', name: 'Millennium', points: 1000, icon: '💎', color: 'platinum' }
    ];
    for (const milestone of MILESTONES) {
      if (student.totalSp >= milestone.points) {
        const seen = localStorage.getItem(`badge_seen_${milestone.id}_${student.email}`);
        if (!seen) {
          queue.push(milestone);
        }
      }
    }
    if (queue.length > 0) {
      setBadgeQueue(queue);
      setCurrentBadge(queue[0]);
    }
  }, [student]);

  const handleCloseBadge = () => {
    if (currentBadge && student) {
      localStorage.setItem(`badge_seen_${currentBadge.id}_${student.email}`, 'true');
      const remaining = badgeQueue.slice(1);
      setBadgeQueue(remaining);
      setCurrentBadge(remaining.length > 0 ? remaining[0] : null);
    }
  };

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
      <SpurtiTree student={student} onUpdateProfile={onUpdateProfile} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'],
        ...(student.eligibleForVibeGoals ? [['journey','My Journey'], ['vibe','Commitments']] : []),
        ['leaderboard','Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'journey' && student.eligibleForVibeGoals && <MyJourney student={student} setTab={setTab} />}
      {tab === 'vibe' && student.eligibleForVibeGoals && <Commitments student={student} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {currentBadge && <BadgePopup badge={currentBadge} onClose={handleCloseBadge} />}
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
  
  const top3 = rows.slice(0, 3);
  const remaining = rows.slice(3);

  const podium = [];
  if (top3[1]) podium.push({ ...top3[1], rankIndex: 2 });
  if (top3[0]) podium.push({ ...top3[0], rankIndex: 1 });
  if (top3[2]) podium.push({ ...top3[2], rankIndex: 3 });

  return (
    <section className="panel leaderboard-panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <select value={type} onChange={e => setType(e.target.value)} className="leaderboard-select">
          <option value="overall">Overall Leaderboard</option>
          <option value="my_onboarding_group">My Onboarding Group</option>
        </select>
      </div>
      {type === 'my_onboarding_group' && groupLabel &&
        <p className="muted">Showing students onboarded in your group: {groupLabel}</p>}
      
      {podium.length > 0 && (
        <div className="podium-section">
          {podium.map(student => {
            const classMap = { 1: 'gold', 2: 'silver', 3: 'bronze' };
            const medalMap = { 1: '👑', 2: '🥈', 3: '🥉' };
            const place = student.rankIndex;
            return (
              <div key={`${student.maskedEmail}-${place}`} className={`podium-card ${classMap[place]} ${student.isCurrentStudent ? 'current' : ''}`}>
                <div className="podium-badge">{medalMap[place]}</div>
                <strong className="podium-name">{student.name}</strong>
                <span className="podium-email">{student.maskedEmail}</span>
                <span className="podium-points">{student.totalSp} SP</span>
                <div className={`podium-stand place-${place}`}>
                  <span>#{place}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <table className="table leaderboard-table">
        <thead><tr><th>Rank</th><th>Name</th><th>Email</th><th>Level</th><th>SP</th></tr></thead>
        <tbody>{remaining.map(row => (
          <tr key={`${row.rank}-${row.maskedEmail}`} className={row.isCurrentStudent ? 'current-student' : ''}>
            <td>
              <span className="rank-badge">{row.rank}</span>
            </td>
            <td className="font-semibold">{row.name}</td>
            <td className="text-muted">{row.maskedEmail}</td>
            <td>Lvl {row.level}</td>
            <td className="points-col">{row.totalSp} SP</td>
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
  
  // SP Milestone Badges
  const sp = profile.student.totalSp;
  if (sp >= 1000) badges.push('💎 Millennium (1000+ SP)');
  else if (sp >= 500) badges.push('🥇 Half-Kilo (500+ SP)');
  else if (sp >= 200) badges.push('🥈 Double Centurion (200+ SP)');
  else if (sp >= 100) badges.push('🥉 Centurion (100+ SP)');

  if (profile.student.rank <= 50) badges.push('👑 Top 50');
  if (qualifiedPct >= 0.75) badges.push('🔥 Consistent Attendee');
  if (pollTotal && pollAttempted / pollTotal >= 0.75) badges.push('⚡ Poll Champion');
  if (profile.student.totalSp >= profile.cohort.averageSp) badges.push('📈 Above Average');
  return badges.length ? badges : ['🌱 Getting Started'];
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
  
  const totalAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const totalQuestions = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const totalMissed = totalQuestions - totalAttempted;
  const attemptedPct = totalQuestions ? Math.round((totalAttempted / totalQuestions) * 100) : 0;
  const missedPct = 100 - attemptedPct;

  return (
    <section className="panel polls-panel">
      <h2>Poll Participation</h2>
      
      {totalQuestions > 0 && (
        <div className="polls-overall-container">
          <div className="polls-chart-wrapper">
            <svg viewBox="0 0 36 36" className="pie-svg">
              <circle cx="18" cy="18" r="15.915" fill="#fff" />
              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#fec2d1" strokeWidth="4" />
              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#ef4444" strokeWidth="4" 
                      strokeDasharray={`${missedPct} ${attemptedPct}`} 
                      strokeDashoffset="25" />
              <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="4" 
                      strokeDasharray={`${attemptedPct} ${missedPct}`} 
                      strokeDashoffset={`${25 - missedPct}`} />
            </svg>
            <div className="chart-center-text">
              <strong>{attemptedPct}%</strong>
              <span>Overall</span>
            </div>
          </div>
          <div className="chart-legend">
            <div className="legend-item"><span className="dot green"></span> <strong>Attempted:</strong> {totalAttempted} ({attemptedPct}%)</div>
            <div className="legend-item"><span className="dot red"></span> <strong>Missed:</strong> {totalMissed} ({missedPct}%)</div>
            <div className="legend-total">Total Questions: {totalQuestions} across {polls.length} sessions</div>
          </div>
        </div>
      )}

      <h2>Session Breakdown</h2>
      <div className="cards polls-cards-grid">
        {sorted.map(poll => {
          const pct = poll.totalQuestions ? Math.round((poll.attemptedQuestions / poll.totalQuestions) * 100) : 0;
          return (
            <article className="card poll-session-card" key={poll._id}>
              <div className="poll-card-content">
                <div className="poll-info">
                  <strong>{poll.sessionLabel}</strong>
                  <span>{poll.attemptedQuestions} / {poll.totalQuestions} questions</span>
                </div>
                <div className="mini-ring-wrapper">
                  <svg viewBox="0 0 36 36" className="mini-ring-svg">
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                    <circle cx="18" cy="18" r="15.915" fill="transparent" stroke={pct >= 75 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444"} strokeWidth="4" 
                            strokeDasharray={`${pct} ${100 - pct}`} 
                            strokeDashoffset="25" />
                  </svg>
                  <span className="mini-ring-text">{pct}%</span>
                </div>
              </div>
            </article>
          );
        })}
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

const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
const toInput = d => d ? new Date(d).toISOString().slice(0, 10) : '';

// The unified phase-by-phase progress + SP tab. Four phases: Standups, ViBe, SPA,
// Projects. Standups & ViBe show real SP; SPA & Projects are placeholders until the
// Samagama data (and their SP rule) land. Goal *staking* lives in the Commitments tab.
function MyJourney({ student, setTab }) {
  const email = student.email;
  const [data, setData] = useState(null);
  const [plan, setPlan] = useState({ vibeBy: '', spaBy: '', projectBy: '' });
  const [savedMsg, setSavedMsg] = useState(false);

  const load = async () => {
    const r = await fetch(`${API}/journey/state?email=${encodeURIComponent(email)}`);
    const j = await r.json();
    setData(j);
    if (j.plan) setPlan({ vibeBy: toInput(j.plan.vibeBy), spaBy: toInput(j.plan.spaBy), projectBy: toInput(j.plan.projectBy) });
  };
  useEffect(() => { load(); }, [email]);

  const savePlan = async () => {
    const r = await fetch(`${API}/journey/plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ...plan })
    });
    if (r.ok) { setData(await r.json()); setSavedMsg(true); setTimeout(() => setSavedMsg(false), 2000); }
  };

  if (!data) return <section className="panel">Loading your journey…</section>;
  if (!data.eligible) return <section className="panel empty">My Journey isn’t available for your cohort yet.</section>;

  const { standups, vibe, spa, projects } = data;
  const spaPct = spa.total ? Math.round(spa.solved / spa.total * 100) : 0;

  return (
    <div className="jr">
      <section className="panel jr-plan">
        <h2>My internship plan</h2>
        <p className="muted">Four phases to your Summership. Set the dates you’re aiming for — your cards below track you against them. (SP is staked separately in the <b>Commitments</b> tab.)</p>
        <div className="jr-plan-row">
          <label>Finish ViBe by<input type="date" value={plan.vibeBy} onChange={e => setPlan({ ...plan, vibeBy: e.target.value })} /></label>
          <label>Solve all 53 SPA by<input type="date" value={plan.spaBy} onChange={e => setPlan({ ...plan, spaBy: e.target.value })} /></label>
          <label>First project PR by<input type="date" value={plan.projectBy} onChange={e => setPlan({ ...plan, projectBy: e.target.value })} /></label>
          <button className="primary" onClick={savePlan}>Save plan</button>
          {savedMsg && <span className="jr-saved">✓ Saved</span>}
        </div>
      </section>

      <div className="jr-grid">
        {/* Phase 1 — Standups */}
        <section className="jr-card phase-standups">
          <div className="jr-head"><span className="jr-n">1</span><h3>Standups</h3><span className="jr-sp">+{standups.sp} SP</span></div>
          <p className="jr-sub">Zoom attendance + Spandan polls</p>
          <div className="jr-stats">
            <div><strong>{standups.zoomMinutes}</strong><span>Zoom minutes</span></div>
            <div><strong>{standups.sessionsAttended}</strong><span>sessions attended</span></div>
            <div><strong>{standups.pollsAttempted}/{standups.pollsTotal}</strong><span>polls attempted</span></div>
          </div>
          <div className="jr-splits">
            <span className="jr-pill">Attendance +{standups.spAttendance}</span>
            <span className="jr-pill">Polls +{standups.spPolls}</span>
          </div>
        </section>

        {/* Phase 2 — ViBe */}
        <section className="jr-card phase-vibe">
          <div className="jr-head"><span className="jr-n">2</span><h3>ViBe courses</h3><span className={`jr-sp ${vibe.sp < 0 ? 'neg' : ''}`}>{vibe.sp >= 0 ? '+' : ''}{vibe.sp} SP</span></div>
          <p className="jr-sub">{vibe.clearedCount}/{vibe.totalCourses} courses complete · plan: by {fmtDate(data.plan.vibeBy)}</p>
          <div className="jr-dots">
            {vibe.ladder.map(l => (
              <div key={l.key} className={`jr-dot ${l.cleared ? 'done' : (vibe.current && vibe.current.key === l.key ? 'current' : '')}`} title={l.name}>
                <b>{l.cleared ? '✓' : `${l.pct}%`}</b><span>{l.name}</span>
              </div>
            ))}
          </div>
          <div className="jr-splits">
            {vibe.current
              ? <span className="jr-pill">Now: {vibe.current.name} — {vibe.current.pct}%</span>
              : <span className="jr-pill">All courses complete 🎉</span>}
            {vibe.activeCommitment && <span className="jr-pill amber">Active commitment: +{vibe.activeCommitment.goalPct}%</span>}
            <button className="jr-link" onClick={() => setTab('vibe')}>Set a commitment →</button>
          </div>
        </section>

        {/* Phase 3 — SPA (data + SP rule pending Samagama) */}
        <section className="jr-card phase-spa">
          <div className="jr-head"><span className="jr-n">3</span><h3>SPA — Matrix Mystics</h3><span className="jr-soon">Coming soon</span></div>
          <p className="jr-sub">53-problem set · plan: by {fmtDate(data.plan.spaBy)}</p>
          {spa.pending
            ? <p className="cm-soon">Your Matrix Mystics progress and SP will appear here soon — we’re wiring up the data.</p>
            : <>
                <div className="jr-big"><strong>{spa.solved}</strong><span>/ {spa.total} solved</span></div>
                <div className="jr-progress"><i style={{ width: `${spaPct}%` }} /></div>
                <div className="jr-splits"><span className="jr-pill">{spa.spaPoints} SPA points</span></div>
              </>}
        </section>

        {/* Phase 4 — Projects (data + SP rule pending Samagama) */}
        <section className="jr-card phase-project">
          <div className="jr-head"><span className="jr-n">4</span><h3>Projects</h3><span className="jr-soon">Coming soon</span></div>
          <p className="jr-sub">Pull requests · plan: by {fmtDate(data.plan.projectBy)}</p>
          {projects.pending
            ? <p className="cm-soon">Your project PRs and SP will appear here soon — we’re wiring up the data.</p>
            : <div className="jr-stats">
                <div><strong>{projects.prsRaised}</strong><span>PRs raised</span></div>
                <div><strong>{projects.prsMerged}</strong><span>PRs merged</span></div>
              </div>}
        </section>
      </div>
    </div>
  );
}

function courseName(ladder, key) { const c = ladder.find(l => l.key === key); return c ? c.name : key; }
// net SP over the whole commitment: won -> win minus the debited stake; lost -> stake + penalty
function netFor(b) { return b.status === 'won' ? b.potentialWin - b.stake : -(b.stake + b.potentialLoss); }

// The Commitments hub: one accordion card per phase. Every phase shares the same SP
// engine (stake debited → HIT wins it back multiplied / MISS loses a penalty); only
// the target metric differs. ViBe is live; the other three land one by one.
const COMMITMENT_TYPES = [
  { key: 'vibe',    name: 'ViBe courses',        blurb: 'Pledge to raise your current course’s completion by X% before a deadline.', ready: true },
  { key: 'standup', name: 'Standups',            blurb: 'Pledge to attend all of this week’s standups at a chosen attendance tier.', ready: true },
  { key: 'spa',     name: 'SPA — Matrix Mystics', blurb: 'Pledge to solve N of the 53 problems by a date.',                          ready: false },
  { key: 'project', name: 'Projects',            blurb: 'Pledge to raise / merge N pull requests by a date.',                        ready: false }
];

function Commitments({ student }) {
  const [open, setOpen] = useState('vibe');
  return (
    <div className="cm">
      <section className="panel">
        <h2>Commitments</h2>
        <p className="muted">Stake SP on a goal in any phase — hit it by the deadline and win your stake back multiplied; miss and you lose a penalty on top. <b>One active commitment per phase</b> (up to four running at once).</p>
      </section>
      {COMMITMENT_TYPES.map(t => {
        const isOpen = open === t.key;
        return (
          <section key={t.key} className={`cm-acc ${isOpen ? 'open' : ''} phase-${t.key}`}>
            <button className="cm-accbtn" onClick={() => setOpen(isOpen ? null : t.key)}>
              <span className="cm-caret">{isOpen ? '▾' : '▸'}</span>
              <b>{t.name}</b>
              {!t.ready && <span className="cm-tag">coming soon</span>}
              <span className="cm-blurb">{t.blurb}</span>
            </button>
            {isOpen && (
              <div className="cm-body">
                {t.ready
                  ? (t.key === 'vibe' ? <VibeGoals student={student} /> : <StandupGoals student={student} />)
                  : <p className="cm-soon">{t.blurb}<br /><b>Coming soon</b> — same stake-and-win mechanic as ViBe, tuned to this phase.</p>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function VibeGoals({ student }) {
  const email = student.email;
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ goalPct: 20, stake: 100, multiplier: 4, deadline: '' });
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    const r = await fetch(`${API}/vibe/state?email=${encodeURIComponent(email)}`);
    setData(await r.json());
  };
  useEffect(() => {
    load();
    const d = new Date(); d.setDate(d.getDate() + 2);
    setForm(f => ({ ...f, deadline: d.toISOString().slice(0, 10) }));
  }, [email]);

  if (!data) return <section className="panel">Loading ViBe Goals…</section>;
  if (!data.eligible) return <section className="panel empty">ViBe Goals isn’t available for your cohort yet.</section>;

  const cur = data.current, cfg = data.config;
  const s = +form.stake, m = +form.multiplier, g = +form.goalPct;
  const loss = cfg.penaltyFactor * s * m, win = s * m, need = s + loss;   // stake debited + worst-case penalty
  const daysOut = form.deadline
    ? Math.round((new Date(form.deadline).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000) : 0;
  const availForBet = data.available + (editing && data.active ? data.active.reserved + data.active.stake : 0);

  let problem = null;
  if (!cur) problem = 'All courses complete — nothing to commit to.';
  else if (g <= cur.floorPct) problem = `Goal must beat the weekly floor (${cur.floorPct}%).`;
  else if (daysOut < 1 || daysOut > cfg.maxBetDays) problem = `Deadline must be 1–${cfg.maxBetDays} days out.`;
  else if (g > cur.remaining) problem = `Goal exceeds your remaining ${cur.remaining}%.`;
  else if (need > availForBet) problem = `You need ${need} SP (stake ${s} + up to ${loss} loss); you have ${availForBet}.`;

  const post = async (url, body, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return null; } setErr(null); return j;
  };
  const place = async () => { const j = await post(`${API}/vibe/bet`,
    { email, course: cur.key, goalPct: g, stake: s, multiplier: m, deadline: form.deadline }); if (j) setData(j); };
  const saveEdit = async () => { const j = await post(`${API}/vibe/bet/${data.active._id}`,
    { email, goalPct: g, stake: s, multiplier: m }, 'PUT'); if (j) { setEditing(false); setData(j); } };
  const settle = async (result) => { const j = await post(`${API}/vibe/bet/${data.active._id}/settle`,
    { email, result }); if (j) { setEditing(false); setData(j); } };

  const showForm = cur && (!data.active || editing);

  return (
    <div className="vg">
      <section className="panel">
        <h2>Your course path</h2>
        <p className="muted">Courses unlock in order — you work on and set commitments for your current course only. Prior completions are credited automatically.</p>
        <div className="vg-ladder">
          {data.ladder.map((l, i) => (
            <React.Fragment key={l.key}>
              {i > 0 && <div className="vg-arrow">→</div>}
              <div className={`vg-step ${l.cleared ? 'done' : (cur && cur.key === l.key ? 'current' : 'locked')}`}>
                <span className="n">{i + 1}</span><b>{l.name}</b>
                <em>{l.prior ? 'credited ✓' : l.cleared ? '100% ✓' : (cur && cur.key === l.key ? `${l.pct}% · in progress` : '🔒 locked')}</em>
              </div>
            </React.Fragment>
          ))}
        </div>
      </section>

      {cur && (
        <section className="panel">
          <h2>Current course — {cur.name}</h2>
          <div className="vg-tiles">
            <div className={`vg-tile ${data.weeklyFloor.met ? 'done' : ''}`}>
              <span>This week (floor)</span>
              <strong>{data.weeklyFloor.doneHours} h</strong>
              <em>{cfg.floorHours} h required · {data.weeklyFloor.met
                ? <span className="vg-pill green">+{cfg.floorSp} SP earned</span>
                : <span className="vg-pill amber">not yet</span>}</em>
            </div>
            <div className="vg-tile">
              <span>{cur.name} — completion</span>
              <strong>{cur.pct}%</strong>
              <em>{cur.remaining}% left · ≈ {(cur.pct / 100 * cur.hours).toFixed(1)} / {cur.hours} h*</em>
              <div className="vg-progress"><i style={{ width: `${cur.pct}%` }} /></div>
            </div>
          </div>
        </section>
      )}

      {cur && (
        <section className="panel">
          <h2>{editing ? 'Edit your commitment' : 'Set a goal & commit extra SP'}</h2>
          <p className="muted">Your stake is <b>debited now</b>. Hit your goal by the deadline → win it back multiplied; miss → lose an extra penalty on top. One commitment per course, deadline up to {cfg.maxBetDays} days away.</p>
          {!showForm && data.active &&
            <div className="vg-lock">You have an active commitment on {cur.name}. Edit it below, or resolve it with the demo buttons.</div>}
          {showForm && (
            <div className="vg-form">
              <div className="vg-field"><label>Course</label><input value={`${cur.name} (current)`} disabled /></div>
              <div className="vg-field"><label>Raise completion by</label>
                <div className="vg-row"><input type="number" min="1" max={cur.remaining} value={form.goalPct}
                  onChange={e => setForm({ ...form, goalPct: e.target.value })} /><b>%</b></div>
                <span className="hint">Allowed {cur.floorPct}%–{cur.remaining}% (floor → remaining) · ≈ {(g / 100 * cur.hours).toFixed(1)} h</span>
              </div>
              <div className="vg-field"><label>Deadline</label>
                <input type="date" value={form.deadline} disabled={editing}
                  onChange={e => setForm({ ...form, deadline: e.target.value })} />
                <span className="hint">{editing ? 'Fixed — can’t be changed after placing.' : `Up to ${cfg.maxBetDays} days away.`}</span>
              </div>
              <div className="vg-field"><label>Stake — <b>{s}</b> SP</label>
                <input type="range" min={cfg.stakeMin} max={cfg.stakeMax} step="10" value={form.stake}
                  onChange={e => setForm({ ...form, stake: e.target.value })} />
                <span className="hint">{cfg.stakeMin}–{cfg.stakeMax} SP.</span>
              </div>
              <div className="vg-field vg-wide"><label>Confidence multiplier</label>
                <div className="vg-mult">{cfg.multipliers.map(x =>
                  <button key={x} className={m === x ? 'active' : ''} onClick={() => setForm({ ...form, multiplier: x })}>{x}×</button>)}</div>
              </div>
              <div className="vg-readout">
                <div className="r lose"><span>Staked now</span><strong>−{s}</strong></div>
                <div className="r win"><span>If you HIT</span><strong>+{win}</strong><span className="net">net +{win - s}</span></div>
                <div className="r lose"><span>If you MISS</span><strong>−{loss}</strong><span className="net">net −{s + loss}</span></div>
                <div className="r"><span>Left after placing</span><strong>{availForBet - s - loss}</strong></div>
              </div>
              <div className="vg-actions">
                {editing
                  ? <><button className="primary" disabled={!!problem} onClick={saveEdit}>Save changes</button>
                      <button className="secondary" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button></>
                  : <button className="primary" disabled={!!problem} onClick={place}>Place commitment</button>}
                <span className={problem ? 'vg-warn' : 'vg-ok'}>{problem || `✓ Covered — ${loss} SP reserved until it settles.`}</span>
              </div>
              {err && <p className="error">{err}</p>}
            </div>
          )}
        </section>
      )}

      <section className="panel">
        <h2>Your active commitment</h2>
        {data.active ? (
          <div className="vg-bet">
            <div>
              <h4>{courseName(data.ladder, data.active.course)} — raise completion by {data.active.goalPct}%</h4>
              <div className="meta">staked {data.active.stake} (debited) @ {data.active.multiplier}× · by {new Date(data.active.deadline).toLocaleDateString()} · risk −{data.active.potentialLoss} more on miss</div>
            </div>
            <div className="side">
              <div><span className="win">Hit +{data.active.potentialWin}</span> / <span className="lose">Miss −{data.active.potentialLoss}</span></div>
              <div className="vg-betbtns">
                {!editing && <button className="secondary" onClick={() => { setForm({ goalPct: data.active.goalPct, stake: data.active.stake, multiplier: data.active.multiplier, deadline: form.deadline }); setEditing(true); }}>Edit commitment</button>}
                <button className="secondary" onClick={() => settle('won')}>Demo: Hit</button>
                <button className="secondary" onClick={() => settle('lost')}>Demo: Miss</button>
              </div>
            </div>
          </div>
        ) : <p className="muted">No active commitment right now — set one above.</p>}
      </section>

      <section className="panel">
        <h2>Past commitments</h2>
        {data.history.length ? (
          <table className="table"><thead><tr><th>Course</th><th>Goal</th><th>Stake</th><th>Result</th><th>Net SP</th></tr></thead>
            <tbody>{data.history.map(b => (
              <tr key={b._id}><td>{courseName(data.ladder, b.course)}</td><td>+{b.goalPct}%</td><td>{b.stake} @ {b.multiplier}×</td>
                <td className={b.status === 'won' ? 'vg-hit' : 'vg-miss'}>{b.status === 'won' ? 'HIT' : 'MISS'}</td>
                <td className={b.status === 'won' ? 'vg-hit' : 'vg-miss'}>{netFor(b) >= 0 ? '+' : ''}{netFor(b)}</td></tr>))}
            </tbody></table>
        ) : <p className="muted">No settled commitments yet.</p>}
      </section>
    </div>
  );
}

// Standup commitment — weekly, attendance-only, keep-the-stake. Student picks a tier
// (81–90 → stake 20 / 91–100 → stake 50, fixed) and a confidence (2×/3×/4×). HIT pays
// +stake×conf on top of earned attendance; MISS charges −0.5×stake×conf off the balance.
function StandupGoals({ student }) {
  const email = student.email;
  const [data, setData] = useState(null);
  const [tierKey, setTierKey] = useState('91-100');
  const [multiplier, setMultiplier] = useState(4);
  const [err, setErr] = useState(null);

  const load = async () => {
    const r = await fetch(`${API}/standup/state?email=${encodeURIComponent(email)}`);
    setData(await r.json());
  };
  useEffect(() => { load(); }, [email]);

  if (!data) return <section className="panel">Loading standups…</section>;
  if (!data.eligible) return <section className="panel empty">Standup commitments aren’t available for your cohort yet.</section>;

  const tier = data.tiers.find(t => t.key === tierKey) || data.tiers[0];
  const stake = tier.stake, win = stake * multiplier, loss = data.penaltyFactor * stake * multiplier;
  const problem = data.active
    ? 'You already have an active standup commitment this week.'
    : loss > data.available ? `You need ${loss} SP free to cover a possible miss; you have ${data.available}.` : null;

  const post = async (url, body) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json(); if (!r.ok) { setErr(j.error); return null; } setErr(null); return j;
  };
  const place = async () => { const j = await post(`${API}/standup/commit`, { email, tierKey, multiplier }); if (j) setData(j); };
  const settle = async (result) => { const j = await post(`${API}/standup/commit/${data.active._id}/settle`, { email, result }); if (j) setData(j); };

  return (
    <div className="vg">
      <section className="panel">
        <h2>This week’s standups — {data.weekLabel}</h2>
        <p className="muted">Pledge to attend <b>all {data.sessionsThisWeek}</b> standups this week at a chosen attendance tier. Attendance only — polls stay as poll-points. Your stake <b>isn’t deducted</b>: hit your pledge for a bonus on top of the attendance points you earn, miss and a penalty applies.</p>
        <div className="vg-tiles">
          <div className="vg-tile"><span>Attended so far</span><strong>{data.attendedThisWeek}/{data.sessionsThisWeek}</strong><em>this week</em></div>
          <div className="vg-tile"><span>Avg attendance</span><strong>{data.avgPctThisWeek != null ? data.avgPctThisWeek + '%' : '—'}</strong><em>so far</em></div>
        </div>
      </section>

      {!data.active && (
        <section className="panel">
          <h2>Set a standup commitment</h2>
          <div className="vg-form">
            <div className="vg-field vg-wide"><label>Attendance tier (fixed stake)</label>
              <div className="vg-mult">{data.tiers.map(t =>
                <button key={t.key} className={tierKey === t.key ? 'active' : ''} onClick={() => setTierKey(t.key)}>{t.label} · stake {t.stake}</button>)}</div>
              <span className="hint">Higher tier = higher bar and bigger reward. Beating your tier still counts as a hit.</span>
            </div>
            <div className="vg-field vg-wide"><label>Confidence multiplier</label>
              <div className="vg-mult">{data.multipliers.map(x =>
                <button key={x} className={multiplier === x ? 'active' : ''} onClick={() => setMultiplier(x)}>{x}×</button>)}</div>
            </div>
            <div className="vg-readout">
              <div className="r"><span>Stake (fixed by tier)</span><strong>{stake}</strong></div>
              <div className="r win"><span>If you HIT</span><strong>+{win}</strong><span className="net">bonus, on top of attendance</span></div>
              <div className="r lose"><span>If you MISS</span><strong>−{loss}</strong><span className="net">penalty off your balance</span></div>
            </div>
            <div className="vg-actions">
              <button className="primary" disabled={!!problem} onClick={place}>Place commitment</button>
              <span className={problem ? 'vg-warn' : 'vg-ok'}>{problem || `✓ Covered · settles ${new Date(data.deadline).toLocaleDateString()}`}</span>
            </div>
            {err && <p className="error">{err}</p>}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Your active commitment</h2>
        {data.active ? (
          <div className="vg-bet">
            <div>
              <h4>{data.active.label}</h4>
              <div className="meta">stake {data.active.stake} (kept) · by {new Date(data.active.deadline).toLocaleDateString()} · risk −{data.active.potentialLoss} on miss</div>
            </div>
            <div className="side">
              <div><span className="win">Hit +{data.active.potentialWin}</span> / <span className="lose">Miss −{data.active.potentialLoss}</span></div>
              <div className="vg-betbtns">
                <button className="secondary" onClick={() => settle('won')}>Demo: Hit</button>
                <button className="secondary" onClick={() => settle('lost')}>Demo: Miss</button>
              </div>
            </div>
          </div>
        ) : <p className="muted">No active standup commitment — set one above.</p>}
      </section>

      <section className="panel">
        <h2>Past standup commitments</h2>
        {data.history.length ? (
          <table className="table"><thead><tr><th>Week pledge</th><th>Tier</th><th>Result</th><th>SP</th></tr></thead>
            <tbody>{data.history.map(c => (
              <tr key={c._id}><td>{c.label}</td><td>{c.tier}</td>
                <td className={c.status === 'won' ? 'vg-hit' : 'vg-miss'}>{c.status === 'won' ? 'HIT' : 'MISS'}</td>
                <td className={c.status === 'won' ? 'vg-hit' : 'vg-miss'}>{c.resultDelta >= 0 ? '+' : ''}{c.resultDelta}</td></tr>))}
            </tbody></table>
        ) : <p className="muted">No settled standup commitments yet.</p>}
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

function BadgePopup({ badge, onClose }) {
  return (
    <div className="badge-popup-overlay">
      <div className="badge-popup-card">
        <div className="badge-popup-confetti">
          {Array.from({ length: 35 }).map((_, i) => {
            const colors = ['#6366f1', '#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b'];
            const style = {
              left: `${Math.random() * 100}%`,
              top: `${-10 - Math.random() * 20}px`,
              backgroundColor: colors[i % colors.length],
              transform: `rotate(${Math.random() * 360}deg)`,
              animationDelay: `${Math.random() * 1.5}s`,
              animationDuration: `${1.5 + Math.random() * 2.5}s`
            };
            return <div key={i} className="confetti-piece" style={style} />;
          })}
        </div>
        <div className={`badge-popup-glow ${badge.color}`} />
        <div className="badge-popup-icon-container">
          <span className="badge-popup-icon">{badge.icon}</span>
        </div>
        <p className="badge-popup-eyebrow">Milestone Unlocked! 🎉</p>
        <h2 className="badge-popup-title">{badge.name} Badge</h2>
        <p className="badge-popup-description">
          Sensational effort! You have earned this badge for achieving <strong>{badge.points} Spurti Points</strong>. Your consistency and dedication are paying off!
        </p>
        <button className="badge-popup-btn" onClick={onClose}>Awesome!</button>
      </div>
    </div>
  );
}

function playChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Play a beautiful, soft ascending C-major triad chime
    const playNote = (freq, delay, duration, vol) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
      }, delay);
    };

    playNote(523.25, 0, 0.8, 0.12);   // C5
    playNote(659.25, 100, 0.8, 0.12); // E5
    playNote(783.99, 200, 1.0, 0.15); // G5
  } catch (e) {
    console.log("Audio play blocked/failed:", e);
  }
}

const BRANCH_DEFS = [
  // Trunk (unlocks at 0 water)
  { id: 1, x1: 180, y1: 300, x2: 180, y2: 210, thickness: 16, unlock: 0 },
  // Level 1 Branches
  { id: 2, x1: 180, y1: 250, x2: 135, y2: 200, thickness: 11, unlock: 10 },
  { id: 3, x1: 180, y1: 230, x2: 225, y2: 180, thickness: 10, unlock: 20 },
  { id: 4, x1: 180, y1: 210, x2: 175, y2: 150, thickness: 9, unlock: 30 },
  // Level 2 Sub-branches
  { id: 5, x1: 135, y1: 200, x2: 95, y2: 170, thickness: 8, unlock: 40 },
  { id: 6, x1: 135, y1: 200, x2: 150, y2: 155, thickness: 7, unlock: 45 },
  { id: 7, x1: 225, y1: 180, x2: 265, y2: 140, thickness: 8, unlock: 50 },
  { id: 8, x1: 225, y1: 180, x2: 200, y2: 145, thickness: 7, unlock: 55 },
  // Level 3 Sub-branches
  { id: 9, x1: 175, y1: 150, x2: 145, y2: 110, thickness: 6, unlock: 60 },
  { id: 10, x1: 175, y1: 150, x2: 205, y2: 110, thickness: 6, unlock: 65 },
  // Canopy twigs
  { id: 11, x1: 95, y1: 170, x2: 65, y2: 150, thickness: 5, unlock: 70 },
  { id: 12, x1: 95, y1: 170, x2: 105, y2: 130, thickness: 4, unlock: 73 },
  { id: 13, x1: 265, y1: 140, x2: 295, y2: 120, thickness: 5, unlock: 76 },
  { id: 14, x1: 265, y1: 140, x2: 250, y2: 105, thickness: 4, unlock: 80 },
  { id: 15, x1: 145, y1: 110, x2: 120, y2: 80, thickness: 3, unlock: 83 },
  { id: 16, x1: 205, y1: 110, x2: 230, y2: 80, thickness: 3, unlock: 86 },
  { id: 17, x1: 145, y1: 110, x2: 155, y2: 75, thickness: 3, unlock: 89 },
  { id: 18, x1: 205, y1: 110, x2: 195, y2: 75, thickness: 3, unlock: 92 }
];

function SpurtiTree({ student, onUpdateProfile }) {
  const [watering, setWatering] = useState(false);
  const [wiggle, setWiggle] = useState(false);
  const [floatBubbles, setFloatBubbles] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  const sp = student.totalSp || 0;
  const waterCount = student.waterCount || 0;
  const growthPct = waterCount;

  // Decoupled Eligibility Calculations
  const unlocked = Math.min(100, Math.floor(sp / 10));
  const remaining = Math.max(0, unlocked - waterCount);

  // Determine current stage & description
  const stageIndex = Math.floor(waterCount / 10);
  const STAGES = [
    { name: 'Seed', icon: '🌱', range: '0' },
    { name: 'Sprout', icon: '🌿', range: '1-10' },
    { name: 'Seedling', icon: '🪴', range: '11-20' },
    { name: 'Small Plant', icon: '🍃', range: '21-30' },
    { name: 'Young Plant', icon: '🌿', range: '31-40' },
    { name: 'Sapling', icon: '🪵', range: '41-50' },
    { name: 'Young Tree', icon: '🌳', range: '51-60' },
    { name: 'Healthy Tree', icon: '🌲', range: '61-70' },
    { name: 'Beautiful Tree', icon: '🌸', range: '71-80' },
    { name: 'Majestic Tree', icon: '✨', range: '81-90' },
    { name: 'Legendary Tree', icon: '👑', range: '91-100' }
  ];
  const currentStage = STAGES[Math.min(10, stageIndex)];

  const STAGE_DESCRIPTIONS = [
    'A tiny seed lies dormant in dry soil, holding inside it the heart of a majestic tree.',
    'The seed germinates! A delicate root takes hold and the first green shoots emerge.',
    'A thriving seedling rises. Leaves stretch outward to gather the morning wind.',
    'A sturdy plant with multiple healthy leaves. Butterflies have begun visiting!',
    'A rich, young green plant. The leaves react dynamically when watered.',
    'A woody stem forms! The sapling blooms with occasional wild flowers.',
    'A thick woody trunk starts supporting a beautiful canopy in the sunlight.',
    'Foliage thickens, creating a cozy shelter for chirping birds.',
    'A gorgeous, lush tree full of colorful blossoms. Nature is thriving here.',
    'Canopy expands massively, sparkling with magical light after each watering.',
    'A legendary tree of unmatched stature. Fireflies dance under golden rays!'
  ];
  const stageDesc = STAGE_DESCRIPTIONS[Math.min(10, stageIndex)];

  const handleWater = async () => {
    if (watering) return;
    if (remaining <= 0) {
      setErrorMsg('No waterings available! Complete study sessions to earn more SP.');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }
    if (waterCount >= 100) {
      setErrorMsg('Your tree is already fully grown! 🌲');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }

    // Play synthesized sound
    playChime();

    // Trigger local animations
    setWatering(true);
    setWiggle(true);
    setErrorMsg('');

    // Spawn floating numbers (no SP decrease, show tree growth instead!)
    const bid1 = Date.now();
    const bid2 = Date.now() + 1;
    setFloatBubbles([
      { id: bid1, text: '+1 Water Drop 💧', x: '42%', y: '45%' },
      { id: bid2, text: 'Tree Grew 🌱', x: '58%', y: '50%' }
    ]);

    setTimeout(() => {
      setFloatBubbles([]);
    }, 1800);

    // Call database endpoint after can tilts
    setTimeout(async () => {
      try {
        const r = await fetch(`${API}/student/water`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: student.email })
        });
        const data = await r.json();
        if (r.ok && data.success) {
          onUpdateProfile(data.profile);
        } else {
          setErrorMsg(data.error || 'Failed to water.');
        }
      } catch {
        setErrorMsg('Network error.');
      }
    }, 900);

    setTimeout(() => {
      setWiggle(false);
      setWatering(false);
    }, 2000);
  };

  // --- Procedural Branching Calculations ---
  const renderedBranches = BRANCH_DEFS.map(b => {
    if (waterCount <= b.unlock) return null;
    // grows to full length over 10 waterings
    const progress = Math.min(1.0, (waterCount - b.unlock) / 10);
    const cx2 = b.x1 + (b.x2 - b.x1) * progress;
    const cy2 = b.y1 + (b.y2 - b.y1) * progress;
    // thickness grows as tree grows
    const cthickness = b.thickness * (0.4 + 0.6 * (waterCount / 100));
    return { ...b, cx2, cy2, cthickness };
  }).filter(Boolean);

  // --- Procedural Leaves Calculations ---
  const leaves = [];
  renderedBranches.forEach(b => {
    // End leaf: starts growing once branch reaches 80% completion
    const leafUnlock = b.unlock + 8;
    if (waterCount >= leafUnlock) {
      const progress = Math.min(1.0, (waterCount - leafUnlock) / 5);
      const scale = progress * 7;
      const angle = b.x2 < b.x1 ? -40 : b.x2 > b.x1 ? 40 : 0;
      leaves.push({
        id: `leaf-end-${b.id}`,
        x: b.cx2,
        y: b.cy2,
        scale,
        angle
      });
    }

    // Mid-length leaf: starts growing once branch reaches 40% completion
    const midLeafUnlock = b.unlock + 4;
    if (waterCount >= midLeafUnlock && b.id > 1) {
      const progress = Math.min(1.0, (waterCount - midLeafUnlock) / 5);
      const scale = progress * 5;
      const mx = b.x1 + (b.cx2 - b.x1) * 0.65;
      const my = b.y1 + (b.cy2 - b.y1) * 0.65;
      const angle = b.x2 < b.x1 ? -20 : 20;
      leaves.push({
        id: `leaf-mid-${b.id}`,
        x: mx,
        y: my,
        scale,
        angle
      });
    }
  });

  // --- Ground Flower calculations ---
  const flowers = [];
  const flowerPositions = [
    { x: 120, y: 298, unlock: 35, color: '#f43f5e' }, // rose pink
    { x: 245, y: 299, unlock: 45, color: '#eab308' }, // yellow
    { x: 145, y: 301, unlock: 60, color: '#ec4899' }, // deep pink
    { x: 215, y: 297, unlock: 75, color: '#3b82f6' }  // sky blue
  ];
  flowerPositions.forEach((fp, idx) => {
    if (waterCount >= fp.unlock) {
      const progress = Math.min(1.0, (waterCount - fp.unlock) / 5);
      flowers.push({ ...fp, id: `flower-${idx}`, scale: progress * 0.7 });
    }
  });

  return (
    <section className="panel tree-panel">
      <div className="tree-header">
        <div>
          <h2>Spurti Ecosystem</h2>
          <p className="muted">Earn SP in class and water your tree to nurture it to Legendary level!</p>
        </div>
        <span className="tree-stage-tag">{currentStage.name} {currentStage.icon}</span>
      </div>

      <div className="tree-frame-wrapper">
        {/* Progress Ring wrapping the plant card */}
        <div className="progress-ring-container">
          <svg viewBox="0 0 360 360" className="progress-svg-bg">
            {/* Soft backdrop progress line */}
            <circle cx="180" cy="180" r="170" fill="transparent" stroke="rgba(99, 102, 241, 0.05)" strokeWidth="4" />
            {/* Active glow progress ring */}
            <circle cx="180" cy="180" r="170" fill="transparent" stroke="url(#progress-rainbow-grad)" strokeWidth="4" 
                    strokeDasharray="1068.14" 
                    strokeDashoffset={1068.14 - (1068.14 * growthPct) / 100} 
                    strokeLinecap="round" 
                    transform="rotate(-90 180 180)" />
            <defs>
              <linearGradient id="progress-rainbow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="50%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
              <linearGradient id="sunbeam-grad" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Tree Render Canvas */}
        <div className="tree-canvas-container">
          {floatBubbles.map(fb => (
            <span key={fb.id} className="floating-bubble" style={{ left: fb.x, top: fb.y }}>
              {fb.text}
            </span>
          ))}

          <svg viewBox="0 0 360 360" className="tree-svg-canvas">
            {/* Background Sky Light */}
            <radialGradient id="sky-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={waterCount >= 91 ? "#fef3c7" : "#eff6ff"} stopOpacity="0.4" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </radialGradient>
            <rect width="360" height="360" fill="url(#sky-glow)" rx="16" />

            {/* Sunlight rays (unlocks Stage 6, 60+ water) */}
            {waterCount >= 60 && (
              <g className="sunbeams" opacity="0.8">
                <polygon points="360,0 220,360 270,360" fill="url(#sunbeam-grad)" />
                <polygon points="360,0 120,360 170,360" fill="url(#sunbeam-grad)" />
                <polygon points="360,0 0,220 0,280" fill="url(#sunbeam-grad)" />
              </g>
            )}

            {/* Clouds (unlocks Stage 5, 50+ water) */}
            {waterCount >= 50 && (
              <g className="clouds-bg">
                <path d="M 30 50 Q 40 35 55 42 Q 70 35 80 50 L 25 50 Z" fill="rgba(255, 255, 255, 0.75)" />
                <path d="M 280 70 Q 290 55 305 62 Q 320 55 330 70 L 275 70 Z" fill="rgba(255, 255, 255, 0.75)" />
              </g>
            )}

            {/* Soil / Ground */}
            <ellipse cx="180" cy="300" rx="100" ry="12" fill={watering ? "#5c2505" : "#78350f"} />
            
            {/* Soil Cracks (Stage 0 only) */}
            {waterCount === 0 && (
              <path d="M 120 300 Q 130 297 150 299 M 165 302 Q 175 300 195 299 M 205 297 Q 220 299 235 298" 
                    stroke="#451a03" strokeWidth="1.5" fill="transparent" />
            )}

            {/* Grass (unlocks Stage 1+, 5+ water) */}
            {waterCount >= 5 && (
              <g stroke="#10b981" strokeWidth="2.5" fill="transparent" strokeLinecap="round">
                {/* Grass Left */}
                <path d="M 95 300 Q 92 292 90 288" />
                <path d="M 98 300 Q 98 290 100 286" />
                {/* Grass Center */}
                <path d="M 172 301 Q 170 292 168 288" />
                <path d="M 176 301 Q 177 291 180 287" />
                {/* Grass Right */}
                <path d="M 255 299 Q 256 291 259 287" />
              </g>
            )}

            {/* Ground Flowers */}
            {flowers.map(flower => (
              <g key={flower.id} transform={`translate(${flower.x}, ${flower.y}) scale(${flower.scale})`}>
                <circle cx="0" cy="0" r="4.5" fill="#f59e0b" />
                <circle cx="-5" cy="0" r="3.5" fill={flower.color} />
                <circle cx="5" cy="0" r="3.5" fill={flower.color} />
                <circle cx="0" cy="-5" r="3.5" fill={flower.color} />
                <circle cx="0" cy="5" r="3.5" fill={flower.color} />
              </g>
            ))}

            {/* Butterflies (unlocks Stage 3+, 30+ water) */}
            {waterCount >= 30 && (
              <g className="butterfly-1">
                <path d="M 0 0 C -4 -5 -9 -3 -7 1 C -5 5 0 2 0 0" fill="#a855f7" />
                <path d="M 0 0 C 4 -5 9 -3 7 1 C 5 5 0 2 0 0" fill="#ec4899" />
                <circle cx="0" cy="2" r="1.5" fill="#1e1b4b" />
              </g>
            )}
            {waterCount >= 45 && (
              <g className="butterfly-2">
                <path d="M 0 0 C -4 -5 -9 -3 -7 1 C -5 5 0 2 0 0" fill="#06b6d4" />
                <path d="M 0 0 C 4 -5 9 -3 7 1 C 5 5 0 2 0 0" fill="#3b82f6" />
                <circle cx="0" cy="2" r="1.5" fill="#1e1b4b" />
              </g>
            )}

            {/* Sitting Bird (unlocks Stage 5+, 50+ water) */}
            {waterCount >= 50 && (
              <g transform="translate(133, 192) scale(0.65)" className="sitting-bird">
                <ellipse cx="0" cy="0" rx="9" ry="7" fill="#3b82f6" />
                <circle cx="7" cy="-5" r="5" fill="#3b82f6" />
                <path d="M 11 -5 L 15 -4 L 11 -3 Z" fill="#fbbf24" />
                <path d="M -7 0 L -13 -4 L -11 3 Z" fill="#1d4ed8" />
                <circle cx="6" cy="-6" r="1" fill="#fff" />
              </g>
            )}

            {/* Fireflies (unlocks Stage 10, 91+ water) */}
            {waterCount >= 91 && (
              <g className="fireflies">
                <circle cx="90" cy="110" r="2.5" fill="#fef08a" className="ff-1" />
                <circle cx="150" cy="70" r="2" fill="#fef08a" className="ff-2" />
                <circle cx="230" cy="130" r="2.2" fill="#fef08a" className="ff-3" />
                <circle cx="270" cy="90" r="1.8" fill="#fef08a" className="ff-4" />
                <circle cx="120" cy="160" r="2.4" fill="#fef08a" className="ff-5" />
              </g>
            )}

            {/* SVGs Tree Group */}
            <g className={`tree-branches ${wiggle ? 'wiggle' : ''}`} style={{ transformOrigin: '180px 300px' }}>
              {/* Golden Ambient Halo (Stage 10) */}
              {waterCount >= 91 && (
                <ellipse cx="180" cy="150" rx="80" ry="85" fill="transparent" stroke="#f59e0b" strokeWidth="8" opacity="0.12" strokeDasharray="10 6" className="halo-glow" style={{ transformOrigin: '180px 150px' }} />
              )}

              {/* Render branches */}
              {renderedBranches.map(b => (
                <line key={b.id} 
                      x1={b.x1} y1={b.y1} 
                      x2={b.cx2} y2={b.cy2} 
                      stroke="#451a03" 
                      strokeWidth={b.cthickness} 
                      strokeLinecap="round" />
              ))}

              {/* Render leaves */}
              {leaves.map(leaf => (
                <path key={leaf.id} 
                      d="M 0 0 C -5 -9 -11 -10 -11 -4 C -11 2 -5 5 0 0 Z" 
                      fill={waterCount >= 81 ? "#10b981" : "#059669"}
                      stroke="#047857"
                      strokeWidth="0.5"
                      transform={`translate(${leaf.x}, ${leaf.y}) rotate(${leaf.angle}) scale(${leaf.scale / 7})`}
                      className="tree-leaf-item"
                      filter={waterCount >= 81 ? "drop-shadow(0 0 2px rgba(16,185,129,0.3))" : ""} />
              ))}

              {/* Stage 0 Heartbeat Seedling inside soil */}
              {waterCount === 0 && (
                <g className="heartbeat-seed">
                  <circle cx="180" cy="295" r="4.5" fill="#f59e0b" />
                  <path d="M 180 292 Q 182 288 185 287" stroke="#10b981" strokeWidth="1.5" fill="transparent" />
                </g>
              )}
            </g>

            {/* Watering can animation overlay */}
            {watering && (
              <g className="can-group">
                <text x="240" y="80" fontSize="42" className="can-emoji">🚿</text>
                <g className="drip-group">
                  <line x1="220" y1="90" x2="200" y2="140" stroke="#3b82f6" strokeWidth="3" strokeDasharray="5 5" className="drip-line-1" />
                  <line x1="230" y1="95" x2="210" y2="145" stroke="#60a5fa" strokeWidth="3" strokeDasharray="5 5" className="drip-line-2" />
                  <line x1="240" y1="90" x2="220" y2="140" stroke="#3b82f6" strokeWidth="3" strokeDasharray="5 5" className="drip-line-3" />
                </g>
              </g>
            )}
          </svg>
        </div>
      </div>

      <div className="tree-stats-dashboard">
        <div className="tree-stat-tile">
          <span>Lifetime SP</span>
          <strong>⚡ {sp}</strong>
        </div>
        <div className="tree-stat-tile">
          <span>Water Used</span>
          <strong>💧 {waterCount} / 100</strong>
        </div>
        <div className="tree-stat-tile">
          <span>Available Waterings</span>
          <strong>💧 {remaining}</strong>
        </div>
        <div className="tree-stat-tile">
          <span>Next Unlock</span>
          <strong>⚡ {unlocked >= 100 ? 'Max Unlocked' : `${10 - (sp % 10)} SP`}</strong>
        </div>
      </div>

      <div className="tree-info">
        <p className="tree-desc">{stageDesc}</p>
        
        {/* Stepper Timeline */}
        <div className="tree-stepper-track">
          <div className="stepper-line-fill" style={{ width: `${(Math.min(10, stageIndex) / 10) * 100}%` }} />
          {STAGES.map((s, idx) => {
            const active = idx <= stageIndex;
            const current = idx === stageIndex;
            return (
              <div key={s.name} className={`stepper-node ${active ? 'active' : ''} ${current ? 'current' : ''}`} title={`Stage ${idx}: ${s.name} (${s.range} Water)`}>
                <span className="step-icon">{s.icon}</span>
                <span className="step-label">{s.name}</span>
              </div>
            );
          })}
        </div>

        <div className="tree-footer" style={{ marginTop: '24px' }}>
          <span className="next-grow" style={{ fontWeight: '500' }}>
            Available Waterings: <strong>{remaining} Left</strong>
          </span>
          <button className="water-btn primary" onClick={handleWater} disabled={watering || remaining <= 0 || waterCount >= 100}>
            {watering ? 'Watering...' : 'Water Tree 💧'}
          </button>
        </div>
        {errorMsg && <p className="error" style={{ textAlign: 'center', marginTop: '12px' }}>{errorMsg}</p>}
      </div>
    </section>
  );
}
