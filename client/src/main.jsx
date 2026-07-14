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
  const [season, setSeason] = useState(null);

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
              setSeason(data.season || { season: null });
              setExcused(null);
              setView('student');
            } else if (data.authenticated && data.excused && active) {
              setExcused(data);
              setProfile(null);
              setSeason(null);
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
        <StudentView profile={profile} season={season} onBack={config.allowStudentSearch ? () => setView('landing') : null} />
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
      setSeason(null);
      setView('excused');
      return;
    }
    setProfile(data.profile || data);
    setSeason(data.season || null);
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
    if (data.exact) return onStudent({ profile: data.profile, season: data.season });
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

function StudentView({ profile, season, onBack }) {
  const [tab, setTab] = useState('bank');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);
  const seasonClaimed = season?.standing?.claimedRewards?.length || 0;
  const seasonTotalRewards = season?.rewards?.length || 0;
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
      {season?.season && seasonClaimed > 0 && (
        <div className="season-rewards-strip" title="Your earned season rewards — visit the Season tab for details">
          <strong>Season Rewards:</strong>
          <span className="season-rewards-count">{seasonClaimed} / {seasonTotalRewards} claimed</span>
          {season.standing.claimedRewards.slice(0, 5).map(key => {
            const r = (season.rewards || []).find(r2 => r2.key === key);
            return r ? <span key={key} className="season-reward-pill" title={r.label}>{r.icon || '🎖'}</span> : null;
          })}
          {seasonClaimed > 5 && <span className="season-reward-pill">+{seasonClaimed - 5}</span>}
        </div>
      )}
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'], ['polls','Polls'], ['leaderboard','Leaderboard'], ['season','Season']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'season' && <SeasonPanel season={season} />}
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

// --- Season Panel -----------------------------------------------------------

function SeasonStatusPill({ status }) {
  const cls = { upcoming: 'pill-upcoming', active: 'pill-active', ended: 'pill-ended' }[status] || '';
  const txt = { upcoming: '⏳ Upcoming', active: '🔥 Live', ended: '🏁 Ended' }[status] || '';
  return <span className={`season-pill ${cls}`}>{txt}</span>;
}

function CountdownTimer({ endDate }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!endDate) return;
    function tick() {
      const diff = new Date(endDate) - Date.now();
      if (diff <= 0) { setRemaining('0d 0h'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      setRemaining(d > 0 ? `${d}d ${h}h` : `${h}h left`);
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [endDate]);
  return <>{remaining}</>;
}

function RewardBadge({ reward, isClaimed, isLocked }) {
  const icon = reward.icon || '🎖';
  let detail = '';
  if (reward.goalType === 'sp') detail = `Earn ${reward.goalValue} SP this season`;
  else if (reward.goalType === 'rank') detail = `Finish rank ${reward.goalValue} or better`;
  else if (reward.goalType === 'qualified_sessions') detail = `${reward.goalValue} qualified sessions`;
  else if (reward.goalType === 'league') detail = `Reach ${reward.goalValue} League`;
  const bonus = Number(reward.spBonus || 0);
  const label = reward.label || 'Reward';
  return (
    <div className={`reward-card ${isClaimed ? 'reward-claimed' : isLocked ? 'reward-locked' : 'reward-available'}`}>
      <span className="reward-icon">{icon}</span>
      <div className="reward-body">
        <strong>{label}</strong>
        <p>{detail}</p>
        {bonus > 0 && (
          <p className="reward-bonus" style={{fontSize:'11px',color:'#166534',marginTop:'2px',fontWeight:600}}>
            🎁 +{bonus} SP on claim
          </p>
        )}
      </div>
      <div className="reward-status">
        {isClaimed
          ? <span className="badge-claimed">Claimed</span>
          : isLocked
          ? <span className="badge-locked">Locked</span>
          : <span className="badge-available">Unlocked</span>}
      </div>
    </div>
  );
}

function SeasonPanel({ season }) {
  const [claiming, setClaiming] = useState(null);
  const [claimMsg, setClaimMsg] = useState('');
  const [celebration, setCelebration] = useState(null);
  const [localSeason, setLocalSeason] = useState(null);

  // Allow parent to pass season data directly, but also local state for claim refreshes
  const data = localSeason || season;

  if (!data) {
    return (
      <section className="panel season-panel season-empty">
        <h2>Season</h2>
        <p className="muted">Loading season data…</p>
        <p style={{fontSize:'12px',color:'#e85d04',marginTop:'8px'}}>
          ⚠️ Season data unavailable — session may have expired.<br/>
          <strong>Log out and log in again</strong> to refresh your session.
        </p>
        <details style={{marginTop:'8px',fontSize:'11px',color:'#666'}}>
          <summary>Debug info</summary>
          <pre style={{fontSize:'10px',textAlign:'left',background:'#f8f8f8',padding:'6px',marginTop:'4px'}}>
{JSON.stringify({
  'typeof season': typeof season,
  'season === null': season === null,
  'season truthy': !!season
}, null, 2)}
          </pre>
        </details>
      </section>
    );
  }

  if (!data.season) {
    return (
      <section className="panel season-panel season-empty">
        <h2>Season</h2>
        <div className="season-no-data">
          <p className="season-no-icon">🏟️</p>
          <p><strong>No active season</strong></p>
          <p className="muted">Ask your admin to create a season to get the competition started!</p>
        </div>
      </section>
    );
  }

  const s = data.season;
  const standing = data.standing;
  const rewards = (data.rewards || []).map(r => ({
    ...r,
    claimed:    standing?.claimedRewards?.includes(r.key) ?? false,
    claimable:  (data.eligibleRewards || []).includes(r.key),
  }));
  const lb = data.leaderboard || [];
  const status = s.status || 'active';
  const theme = s.themeColor || '#176b87';
  const earnedSp = standing?.earnedSp ?? 0;
  const myRank = data.myRank;
  const myLeague = standing?.peakLeague || '—';
  const totalStudents = data.cohortSize ?? 0;

  // Season elapsed fraction (0–1)
  function seasonElapsed() {
    if (status === 'upcoming') return 0;
    if (status === 'ended') return 1;
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
  }

  async function handleClaim(rewardId) {
    setClaiming(rewardId);
    setClaimMsg('');
    try {
      const r = await fetch(`${API}/seasons/rewards/${rewardId}/claim`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await r.json();
      if (r.ok) {
        const spBonus = Number(res.spBonus || 0);
        const rewardLabel = res.rewardLabel || 'Reward';
        if (spBonus > 0) {
          setClaimMsg(`🎉 ${rewardLabel} claimed — +${spBonus} SP added!`);
          setCelebration({ label: rewardLabel, spBonus });
          setTimeout(() => setCelebration(null), 3500);
        } else {
          setClaimMsg(`✓ ${rewardLabel} claimed!`);
        }
        // Build the next season state from the current one, then push it to all
setLocalSeason(prev => {
          if (!prev) return prev;
          const claimedReward = (prev.rewards || []).find(r2 => r2._id === rewardId);
          const rewardKey = claimedReward?.key || rewardId;
          return {
            ...prev,
            standing: prev.standing ? {
              ...prev.standing,
              earnedSp: (prev.standing.earnedSp || 0) + spBonus,
              claimedRewards: [...(prev.standing.claimedRewards || []), rewardKey]
            } : prev.standing,
            rewards: prev.rewards ? prev.rewards.map(r2 => r2._id === rewardId ? { ...r2, claimed: true } : r2) : prev.rewards
          };
        });
      } else {
        setClaimMsg(res.error || 'Could not claim — please try again.');
      }
    } catch {
      setClaimMsg('Network error — please try again.');
    } finally {
      setClaiming(null);
    }
  }

  const elapsed = seasonElapsed();
  const elapsedPct = (elapsed * 100).toFixed(1);

  return (
    <section className="panel season-panel" style={{position:'relative'}}>
      {/* Celebration overlay */}
      {celebration && (
        <div className="season-celebration">
          <div className="season-celebration-inner">
            <div className="season-celebrate-icon">🎉</div>
            <strong>{celebration.label}</strong>
            {celebration.spBonus > 0 && <p>+{celebration.spBonus} SP added to your total</p>}
          </div>
        </div>
      )}
      {/* Season hero header */}
      <div className="season-hero" style={{ '--season-theme': theme }}>
        <div className="season-hero-left">
          <div className="season-eyebrow">
            <span className="season-num">Season {s.number}</span>
            <SeasonStatusPill status={status} />
          </div>
          <h2 className="season-title">{s.name}</h2>
          {s.description && <p className="season-desc muted">{s.description}</p>}
        </div>
        <div className="season-hero-right">
          {status === 'active' && (
            <div className="season-clock">
              <span>Time remaining</span>
              <strong><CountdownTimer endDate={s.endDate} /></strong>
            </div>
          )}
          {status === 'upcoming' && (
            <div className="season-clock">
              <span>Starts</span>
              <strong>{new Date(s.startDate).toLocaleDateString()}</strong>
            </div>
          )}
          {status === 'ended' && (
            <div className="season-clock">
              <span>Ended</span>
              <strong>{new Date(s.endDate).toLocaleDateString()}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Season timeline bar */}
      <div className="season-timeline">
        <div className="season-tl-labels">
          <span>{new Date(s.startDate).toLocaleDateString()}</span>
          <strong style={{ color: theme }}>{elapsedPct}% complete</strong>
          <span>{new Date(s.endDate).toLocaleDateString()}</span>
        </div>
        <div className="season-tl-track">
          <div className="season-tl-fill" style={{ width: `${elapsedPct}%`, background: theme }} />
        </div>
      </div>

      {/* Student standing cards */}
      {standing && (
        <div className="season-standing-row">
          <div className="season-standing-card">
            <span>Season SP</span>
            <strong style={{ color: theme }}>{earnedSp}</strong>
            <em>earned this season</em>
          </div>
          {myRank && (
            <div className="season-standing-card">
              <span>Season Rank</span>
              <strong style={{ color: theme }}>#{myRank}</strong>
              <em>of {totalStudents} students</em>
            </div>
          )}
          <div className="season-standing-card">
            <span>Peak League</span>
            <strong style={{ color: theme }}>{myLeague}</strong>
            <em>best this season</em>
          </div>
          {standing?.qualifiedSessions != null && (
            <div className="season-standing-card">
              <span>Qualified Sessions</span>
              <strong style={{ color: theme }}>{standing.qualifiedSessions}</strong>
              <em>attended &amp; on-time</em>
            </div>
          )}
          {rewards.length > 0 && (
            <div className="season-standing-card">
              <span>Rewards Claimed</span>
              <strong style={{ color: theme }}>
                {(standing.claimedRewards || []).length} / {rewards.length}
              </strong>
              <em>milestones unlocked</em>
            </div>
          )}
        </div>
      )}

      {/* Reward checklist */}
      {rewards.length > 0 && (
        <div className="season-section">
          <h3>Season Rewards</h3>
          <div className="reward-list">
            {rewards.map(r => {
              const isClaimed = !!r.claimed;
              const isLocked = !isClaimed && !r.claimable;
              return (
                <div key={r._id} className="reward-item">
                  <RewardBadge reward={r} isClaimed={isClaimed} isLocked={isLocked} />
                  {r.claimable && !isClaimed && (
                    <button
                      className="secondary reward-cta"
                      disabled={claiming === r._id}
                      onClick={() => handleClaim(r._id)}
                    >
                      {claiming === r._id ? 'Claiming…' : 'Claim'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {claimMsg && <p className={`season-msg ${claimMsg.startsWith('✓') ? 'msg-ok' : 'msg-err'}`}>{claimMsg}</p>}
        </div>
      )}

      {/* Season leaderboard strip */}
      {lb.length > 0 && (
        <div className="season-section">
          <h3>Top Season Earners</h3>
          <div className="season-lb">
            {lb.slice(0, 10).map((entry, i) => (
              <div key={entry._id || entry.email || i} className={`season-lb-row ${entry.isCurrentStudent ? 'lb-self' : ''}`}>
                <span className="lb-pos">#{entry.rank}</span>
                <div className="lb-info">
                  <strong>{entry.name}</strong>
                  <span>{entry.earnedSp} SP</span>
                </div>
                {entry.peakLeague && entry.peakLeague !== '—' && <span className="lb-league">{entry.peakLeague}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="season-ended-banner">
          🏁 This season has ended. Congratulations to all participants!
        </div>
      )}
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
  const [seasons, setSeasons] = useState(null);

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
  const loadSeasons = async () => {
    const res = await fetch(`${API}/admin/seasons`, { headers });
    if (res.ok) setSeasons(await res.json());
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
    if (tab === 'seasons' && !seasons) loadSeasons();
    if (tab !== 'seasons') setSeasons(null);
  }, [tab]);

  return (
    <main className="page compact">
      <header className="topbar">
        <button className="secondary" onClick={onBack}>Back</button>
        <div><p className="eyebrow">Admin Dashboard</p><h1>Spurti Control Room</h1></div>
        <div className="score-card"><span>Yet to onboard</span><strong>{stats?.yetToOnboard ?? admin.yetToOnboard ?? 0}</strong><span className="divider">|</span><span>Active</span><strong>{stats?.activeStudents ?? admin.activeStudents ?? admin.students ?? 0}</strong><span className="divider">|</span><span>Excused</span><strong>{stats?.excusedStudents ?? admin.excusedStudents ?? 0}</strong><em>{stats?.transactions ?? admin.transactions ?? 0} txns</em></div>
      </header>
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['students','Students'], ['seasons','Seasons']]} />
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
      {tab === 'seasons' && <SeasonsAdminPanel seasons={seasons} headers={headers} onRefresh={loadSeasons} />}
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" onClick={() => setStudentProfile(null)}>x</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
    </main>
  );
}

// --- Seasons Admin Panel -----------------------------------------------------

function SeasonsAdminPanel({ seasons, headers, onRefresh }) {
  const [view, setView] = useState('list'); // 'list' | 'create' | 'edit' | 'rewards'
  const [selected, setSelected] = useState(null); // season being edited
  const [form, setForm] = useState({ name: '', number: '', description: '', startDate: '', endDate: '', themeColor: '#176b87', status: 'active' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [rewards, setRewards] = useState(null);
  const [rewardForm, setRewardForm] = useState({ goalType: 'sp', goalValue: '', description: '', icon: '🎖', order: '' });
  const [rewardMsg, setRewardMsg] = useState('');
  const [recomputing, setRecomputing] = useState(false);

  // Reset to list whenever prop changes (panel revisited)
  useEffect(() => { setView('list'); setSelected(null); }, [seasons]);

  async function api(method, path, body) {
    const opts = { method, headers: { ...headers, 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${API}${path}`, opts);
    return r;
  }

  // ---- List view ----
  if (view === 'list') {
    if (!seasons) return <section className="panel empty">Loading seasons…</section>;
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Seasons</h2>
          <button className="primary" onClick={() => { setForm({ name: '', number: '', description: '', startDate: '', endDate: '', themeColor: '#176b87', status: 'active' }); setMsg(''); setView('create'); }}>+ New Season</button>
        </div>
        {seasons.length === 0 && <p className="muted">No seasons yet. Create one to get started.</p>}
        <table className="table">
          <thead><tr><th>#</th><th>Name</th><th>Dates</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {seasons.map(s => (
              <tr key={s._id}>
                <td>{s.number}</td>
                <td><strong>{s.name}</strong><br /><span className="muted" style={{fontSize:12}}>{s.description}</span></td>
                <td>{new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()}</td>
                <td>
                  <span className={`season-pill pill-${s.status}`}>{s.status}</span>
                </td>
                <td>
                  <div className="review-actions">
                    <button className="secondary" style={{minHeight:32,padding:'0 10px',fontSize:12}} onClick={() => { setSelected(s); setForm({ name:s.name, number: s.number, description: s.description||'', startDate: s.startDate.slice(0,10), endDate: s.endDate.slice(0,10), themeColor: s.themeColor||'#176b87', status: s.status }); setMsg(''); setView('edit'); }}>Edit</button>
                    <button className="secondary" style={{minHeight:32,padding:'0 10px',fontSize:12}} onClick={() => { setSelected(s); setView('rewards'); setRewards(null); setRewardMsg(''); }}>Rewards</button>
                    <button className="secondary" style={{minHeight:32,padding:'0 10px',fontSize:12}} disabled={recomputing} onClick={async () => { setRecomputing(true); const r = await api('POST', `/admin/seasons/${s._id}/recompute`); const d = await r.json(); setRecomputing(false); alert(r.ok ? `Recomputed: ${d.updated} standings updated.` : `Error: ${d.error}`); }}>{recomputing ? '…' : 'Recompute'}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  // ---- Create form ----
  if (view === 'create') {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>New Season</h2>
          <button className="secondary" onClick={() => setView('list')}>Cancel</button>
        </div>
        <SeasonForm form={form} setForm={setForm} msg={msg} />
        <div className="review-actions" style={{marginTop:14}}>
          <button className="primary" disabled={saving} onClick={async () => {
            setSaving(true); setMsg('');
            const r = await api('POST', '/admin/seasons', form);
            const d = await r.json();
            setSaving(false);
            if (r.ok) { onRefresh(); setView('list'); }
            else setMsg(d.error || 'Failed to create season.');
          }}>{saving ? 'Saving…' : 'Create Season'}</button>
        </div>
        {msg && <p className="error" style={{marginTop:10}}>{msg}</p>}
      </section>
    );
  }

  // ---- Edit form ----
  if (view === 'edit' && selected) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Edit Season</h2>
          <button className="secondary" onClick={() => setView('list')}>Cancel</button>
        </div>
        <SeasonForm form={form} setForm={setForm} msg={msg} />
        <div className="review-actions" style={{marginTop:14}}>
          <button className="primary" disabled={saving} onClick={async () => {
            setSaving(true); setMsg('');
            const r = await api('PATCH', `/admin/seasons/${selected._id}`, form);
            const d = await r.json();
            setSaving(false);
            if (r.ok) { onRefresh(); setView('list'); }
            else setMsg(d.error || 'Failed to update season.');
          }}>{saving ? 'Saving…' : 'Save Changes'}</button>
          <button className="secondary" style={{color:'var(--red)'}} disabled={saving} onClick={async () => {
            if (!confirm('Delete this season and all its standings?')) return;
            const r = await api('DELETE', `/admin/seasons/${selected._id}`);
            if (r.ok) { onRefresh(); setView('list'); }
            else { const d = await r.json(); setMsg(d.error || 'Delete failed.'); }
          }}>Delete</button>
        </div>
        {msg && <p className="error" style={{marginTop:10}}>{msg}</p>}
      </section>
    );
  }

  // ---- Rewards view ----
  if (view === 'rewards' && selected) {
    const loadRewards = async () => {
      const r = await api('GET', `/admin/seasons/${selected._id}/rewards`);
      if (r.ok) setRewards(await r.json());
    };
    if (!rewards) loadRewards();

    const statusBadges = { active: 'pill-active', upcoming: 'pill-upcoming', ended: 'pill-ended' };
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Rewards — {selected.name}</h2>
          <button className="secondary" onClick={() => setView('list')}>Back</button>
        </div>
        <p style={{margin:'0 0 16px'}} className="muted">
          Season: {new Date(selected.startDate).toLocaleDateString()} → {new Date(selected.endDate).toLocaleDateString()}{' '}
          <span className={`season-pill ${statusBadges[selected.status] || ''}`}>{selected.status}</span>
        </p>

        {/* Existing rewards */}
        {rewards !== null && (
          <>
            {rewards.length > 0 && (
              <table className="table" style={{marginBottom:20}}>
                <thead><tr><th>Icon</th><th>Description</th><th>Type</th><th>Goal</th><th>Order</th><th></th></tr></thead>
                <tbody>
                  {rewards.map(r => (
                    <tr key={r._id}>
                      <td>{r.icon || '🎖'}</td>
                      <td>{r.rewardLabel || r.description || '—'}</td>
                      <td>{r.goalType}</td>
                      <td>{r.goalValue}</td>
                      <td>{r.order}</td>
                      <td>
                        <button className="secondary" style={{minHeight:30,padding:'0 10px',fontSize:12,color:'var(--red)'}} onClick={async () => {
                          if (!confirm('Delete this reward?')) return;
                          const r2 = await api('DELETE', `/admin/seasons/${selected._id}/rewards/${r._id}`);
                          if (r2.ok) loadRewards();
                          else { const d = await r2.json(); setRewardMsg(d.error || 'Delete failed.'); }
                        }}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rewards.length === 0 && <p className="muted" style={{marginBottom:16}}>No rewards yet. Add one below.</p>}
          </>
        )}
        {rewards === null && <p className="muted">Loading rewards…</p>}

        {/* Add reward form */}
        <div className="admin-box" style={{marginTop:0}}>
          <h3 style={{margin:'0 0 12px'}}>Add Reward</h3>
          <div className="form-grid">
            <div className="form-field">
              <label>Icon (emoji)</label>
              <input value={rewardForm.icon} onChange={e => setRewardForm(f => ({...f, icon: e.target.value}))} placeholder="🎖" />
            </div>
            <div className="form-field">
              <label>Description</label>
              <input value={rewardForm.description} onChange={e => setRewardForm(f => ({...f, description: e.target.value}))} placeholder="Top 10 finish" />
            </div>
            <div className="form-field">
              <label>Goal type</label>
              <select value={rewardForm.goalType} onChange={e => setRewardForm(f => ({...f, goalType: e.target.value}))}>
                <option value="sp">SP earned</option>
                <option value="rank">Rank</option>
                <option value="qualified_sessions">Qualified sessions</option>
                <option value="league">Trophy League</option>
              </select>
            </div>
            <div className="form-field">
              <label>Goal value</label>
              <input type="number" value={rewardForm.goalValue} onChange={e => setRewardForm(f => ({...f, goalValue: e.target.value}))} placeholder="100" />
            </div>
            <div className="form-field">
              <label>Sort order</label>
              <input type="number" value={rewardForm.order} onChange={e => setRewardForm(f => ({...f, order: e.target.value}))} placeholder="1" />
            </div>
          </div>
          {rewardMsg && <p className="error" style={{margin:'8px 0 0'}}>{rewardMsg}</p>}
          <button className="primary" style={{marginTop:12}} onClick={async () => {
            setRewardMsg('');
            const payload = { ...rewardForm, goalValue: Number(rewardForm.goalValue), order: Number(rewardForm.order || 0) };
            const r = await api('POST', `/admin/seasons/${selected._id}/rewards`, payload);
            const d = await r.json();
            if (r.ok) { setRewardForm({ goalType: 'sp', goalValue: '', description: '', icon: '🎖', order: '' }); setRewardMsg('Reward added!'); loadRewards(); }
            else setRewardMsg(d.error || 'Failed to add reward.');
          }}>Add Reward</button>
        </div>

        <div style={{marginTop:20,padding:14,background:'#f8fafc',border:'1px solid var(--line)',borderRadius:8}}>
          <p style={{margin:'0 0 8px',fontWeight:900,fontSize:13}}>Goal types explained</p>
          <p style={{margin:'0 0 4px',fontSize:13}}><strong>sp</strong> — student earns this reward once they accumulate <em>goalValue</em> season-relative SP</p>
          <p style={{margin:'0 0 4px',fontSize:13}}><strong>rank</strong> — student reaches <em>goalValue</em> or better on the season leaderboard</p>
          <p style={{margin:'0 0 4px',fontSize:13}}><strong>qualified_sessions</strong> — student has <em>goalValue</em> qualified attendance records in this season</p>
          <p style={{margin:0,fontSize:13}}><strong>league</strong> — student's peak league this season reaches <em>goalValue</em> (e.g. Gold, Platinum)</p>
        </div>
      </section>
    );
  }

  return null;
}

function SeasonForm({ form, setForm, msg }) {
  return (
    <div className="admin-box" style={{marginTop:0}}>
      <div className="form-grid">
        <div className="form-field">
          <label>Season name</label>
          <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Summer 2026" />
        </div>
        <div className="form-field">
          <label>Season number</label>
          <input type="number" min="1" value={form.number} onChange={e => setForm(f => ({...f, number: e.target.value}))} placeholder="1" />
        </div>
        <div className="form-field" style={{gridColumn:'1/-1'}}>
          <label>Description</label>
          <input value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder="Three-month intensive — earn SP, climb the leaderboard!" />
        </div>
        <div className="form-field">
          <label>Start date</label>
          <input type="date" value={form.startDate} onChange={e => setForm(f => ({...f, startDate: e.target.value}))} />
        </div>
        <div className="form-field">
          <label>End date</label>
          <input type="date" value={form.endDate} onChange={e => setForm(f => ({...f, endDate: e.target.value}))} />
        </div>
        <div className="form-field">
          <label>Theme colour</label>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <input type="color" value={form.themeColor} onChange={e => setForm(f => ({...f, themeColor: e.target.value}))} style={{width:48,padding:2}} />
            <input value={form.themeColor} onChange={e => setForm(f => ({...f, themeColor: e.target.value}))} placeholder="#176b87" style={{flex:1}} />
          </div>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="ended">Ended</option>
          </select>
        </div>
      </div>
    </div>
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
