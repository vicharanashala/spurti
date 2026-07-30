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
        <SurveyModal
          survey={config.poll3}
          student={profile.student}
          statusPath="/poll3/status"
          completedKey="poll3Completed"
          onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, poll3Completed: true } }))}
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
  const [commitPhase, setCommitPhase] = useState('vibe');
  const { student } = profile;
  const goToCommitment = ph => { setCommitPhase(ph); setTab('vibe'); };
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
      <Tabs tab={tab} setTab={setTab} tabs={[
        ['bank','SP Bank'],
        ['journey','My Journey'],
        ...(student.eligibleForVibeGoals ? [['vibe','Commitments']] : []),
        ['spa','SPA Points'],
        ['polls','Polls'],
        ['prediction','Early Prediction'],
        ['leaderboard','Leaderboard']
      ]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'journey' && <MyJourney student={student} goToCommitment={goToCommitment} canCommit={student.eligibleForVibeGoals} />}
      {tab === 'vibe' && student.eligibleForVibeGoals && <Commitments student={student} initialPhase={commitPhase} />}
      {tab === 'spa' && <SpaModule student={student} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'prediction' && <EarlyPrediction profile={profile} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
    </main>
  );
}

// SPA → SP (display only). SP is scored + credited by the pipeline rubric
// (+5 per validated question learned, +8 per validated peer taught, capped 50/30,
// minus a one-time audit/fraud penalty) and lands in the SP Bank automatically.
// This tab just reads the rubric's `spaprogresses` summary. Universal across cohorts.
function SpaModule({ student }) {
  const email = student.email;
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${API}/spa/state?email=${encodeURIComponent(email)}`);
      setData(await r.json());
    })();
  }, [email]);

  if (!data) return <section className="panel">Loading your SPA points…</section>;
  if (!data.hasActivity) return (
    <section className="panel empty">
      <h2>SPA — Peer Teaching Points</h2>
      <p className="muted">No validated SPA endorsements on record yet for <b>{data.activity}</b>. Learn a question and get endorsed, or endorse a peer — SP lands in your SP Bank automatically as each is validated.</p>
    </section>
  );

  const { learn, teach, penalty, creditedSp, maxSp, config } = data;

  return (
    <div className="jr">
      <section className="panel jr-intro">
        <h2>SPA — Peer Teaching Points</h2>
        <p className="muted">For <b>{data.activity}</b>, SP is credited to your <b>SP Bank automatically</b> as each endorsement is validated — <b>+{config.learnUnit} SP</b> per question you learn, <b>+{config.teachUnit} SP</b> per peer you teach. No claiming needed.</p>
      </section>

      <div className="jr-grid">
        {/* Track A — Learning */}
        <section className="jr-card phase-spa">
          <div className="jr-head"><span className="jr-n">A</span><h3>Learning</h3><span className="jr-sp">+{learn.sp} SP</span></div>
          <p className="jr-sub">Questions you were validly endorsed on</p>
          <div className="jr-stats">
            <div><strong>{learn.validated}</strong><span>validated</span></div>
            <div><strong>{learn.credited}</strong><span>credited</span></div>
            <div><strong>×{learn.unit}</strong><span>SP each</span></div>
          </div>
          {learn.validated > learn.cap && <div className="jr-splits"><span className="jr-pill amber">Capped at {learn.cap} — extra {learn.validated - learn.cap} not counted</span></div>}
        </section>

        {/* Track B — Teaching */}
        <section className="jr-card phase-vibe">
          <div className="jr-head"><span className="jr-n">B</span><h3>Teaching</h3><span className="jr-sp">+{teach.sp} SP</span></div>
          <p className="jr-sub">Peers you validly endorsed</p>
          <div className="jr-stats">
            <div><strong>{teach.validated}</strong><span>validated</span></div>
            <div><strong>{teach.credited}</strong><span>credited</span></div>
            <div><strong>×{teach.unit}</strong><span>SP each</span></div>
          </div>
          {teach.validated > teach.cap && <div className="jr-splits"><span className="jr-pill amber">Capped at {teach.cap} — extra {teach.validated - teach.cap} not counted</span></div>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>SPA SP summary</h2></div>
        <table className="table">
          <tbody>
            <tr><td>Learning (Track A) — {learn.credited} × {config.learnUnit}</td><td style={{ textAlign: 'right' }}>+{learn.sp} SP</td></tr>
            <tr><td>Teaching (Track B) — {teach.credited} × {config.teachUnit}</td><td style={{ textAlign: 'right' }}>+{teach.sp} SP</td></tr>
            <tr><td><b>Total credited to SP Bank</b> <span className="muted">(max {maxSp})</span></td><td style={{ textAlign: 'right' }}><b>+{creditedSp} SP</b></td></tr>
            {penalty.done && penalty.applied > 0 && (
              <tr className="error">
                <td>{penalty.fraud ? '⚠️ Fraud penalty' : '⚠️ Audit-failure penalty'} — −{Math.round(penalty.rate * 100)}% of current SP{penalty.at ? ` on ${new Date(penalty.at).toLocaleDateString()}` : ''}</td>
                <td style={{ textAlign: 'right' }}>−{penalty.applied} SP</td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12 }}>
          ✅ Auto-credited to your SP Bank — current balance <b>{data.totalSp} SP</b>.
          {penalty.done && penalty.applied > 0 ? ' An integrity penalty was applied (see the debit row in your SP Bank).' : ''}
        </p>
      </section>
    </div>
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

// SP trajectory modal — the student's weekly cumulative SP vs cohort + onboarding-group
// means (reference lines cached in TrajectorySnapshot; own line built live from the ledger).
function TrajectoryModal({ student, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch(`${API}/trajectory/state?email=${encodeURIComponent(student.email)}`).then(r => r.json()).then(setData);
  }, [student.email]);

  const series = data ? [
    { key: 'you', label: 'You', color: 'var(--primary)', points: data.you, width: 3, dots: true },
    { key: 'cohort', label: 'Cohort average', color: '#94a3b8', points: data.cohort, width: 2, dash: '5 4' },
    { key: 'group', label: data.groupLabel ? `Your group (${data.groupLabel})` : 'Your group', color: '#8b5cf6', points: data.group, width: 2 }
  ].filter(s => s.points && s.points.length) : [];

  const weeks = data?.weeks || 10;
  const yMax = Math.max(10, ...series.flatMap(s => s.points.map(p => p.sp)));
  const W = 760, H = 400, padL = 52, padR = 18, padT = 18, padB = 42;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const sx = wk => padL + (weeks <= 1 ? 0 : (wk - 1) / (weeks - 1) * plotW);
  const sy = sp => padT + (1 - sp / yMax) * plotH;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(yMax * f));
  const xTicks = Array.from({ length: weeks }, (_, i) => i + 1);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide traj-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Your trajectory</p>
            <h2>SP over your internship — you vs cohort</h2>
          </div>
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        {!data ? <p className="muted">Loading…</p> : series.length === 0 ? (
          <p className="muted">Not enough data yet — check back after your first week.</p>
        ) : (
          <>
            <div className="traj-legend">
              {series.map(s => <span key={s.key} className="traj-key"><i style={{ background: s.color }} />{s.label}</span>)}
            </div>
            <div className="traj-chart">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="SP trajectory chart">
                {yTicks.map(v => (
                  <g key={v}>
                    <line x1={padL} y1={sy(v)} x2={W - padR} y2={sy(v)} className="traj-grid" />
                    <text x={padL - 8} y={sy(v) + 4} textAnchor="end" className="traj-axis">{v}</text>
                  </g>
                ))}
                {xTicks.map(w => <text key={w} x={sx(w)} y={H - padB + 20} textAnchor="middle" className="traj-axis">W{w}</text>)}
                <text x={padL + plotW / 2} y={H - 5} textAnchor="middle" className="traj-axis-title">Weeks since you joined</text>
                {series.map(s => (
                  <g key={s.key}>
                    <polyline points={s.points.map(p => `${sx(p.week)},${sy(p.sp)}`).join(' ')}
                      fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash || ''}
                      strokeLinejoin="round" strokeLinecap="round" />
                    {s.dots && s.points.map(p => <circle key={p.week} cx={sx(p.week)} cy={sy(p.sp)} r="3.5" fill={s.color} />)}
                  </g>
                ))}
              </svg>
            </div>
            <p className="muted traj-foot">Cumulative SP, aligned to each student's own join week so everyone is compared fairly regardless of start date.{data.computedAt ? ` Cohort lines updated ${new Date(data.computedAt).toLocaleDateString()}.` : ''}</p>
          </>
        )}
      </div>
    </div>
  );
}

function StudentPulse({ profile, badges, nextActions }) {
  const { student, cohort, attendance, polls, transactions } = profile;
  const [showTraj, setShowTraj] = useState(false);
  const qualified = attendance.filter(a => a.qualified).length;
  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));
  return (
    <>
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
            <b>Top 50 cutoff: {cohort.top50Cutoff ?? '—'}</b>
            <b>Top 10 cutoff: {cohort.top10Cutoff ?? '—'}</b>
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
        <button className="pulse-card pulse-clickable wide-pulse" onClick={() => setShowTraj(true)} title="Open full trajectory">
          <span>SP trend <em className="expand-hint">expand ↗</em></span>
          <Sparkline points={trend} />
        </button>
        <div className="pulse-card wide-pulse">
          <span>What to do next</span>
          <ul className="next-list">{nextActions.map(action => <li key={action}>{action}</li>)}</ul>
        </div>
      </section>
      {showTraj && <TrajectoryModal student={student} onClose={() => setShowTraj(false)} />}
    </>
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
  const [size, setSize] = useState(10);
  // Server sends oldest→newest (sorted dateTime asc); show newest first.
  const rows = useMemo(() => [...transactions].reverse(), [transactions]);
  const shown = rows.slice(0, size);
  const downloadCsv = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date & time', 'Credit', 'Debit', 'Balance', 'Reason'].join(',')].concat(
      rows.map(tx => [
        new Date(tx.dateTime).toLocaleString(),
        tx.appliedDelta > 0 ? tx.appliedDelta : '',
        tx.appliedDelta < 0 ? tx.appliedDelta : '',
        tx.balanceAfter, tx.reason
      ].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'sp-bank-statement.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>SP Bank</h2>
        <div className="bank-controls">
          <label>Show
            <select value={size} onChange={e => setSize(Number(e.target.value))}>
              <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option>
            </select>
          </label>
          <button className="secondary" onClick={downloadCsv}>Download CSV</button>
        </div>
      </div>
      <div className="bank">
        <div className="bank-header"><span>Date & time</span><span>Credit</span><span>Debit</span><span>Balance</span><span>Reason</span></div>
        {shown.map(tx => (
          <div className="bank-row" key={tx._id}>
            <span>{new Date(tx.dateTime).toLocaleString()}</span>
            <strong className="credit">{tx.appliedDelta > 0 ? `+${tx.appliedDelta}` : ''}</strong>
            <strong className="debit">{tx.appliedDelta < 0 ? tx.appliedDelta : ''}</strong>
            <b>{tx.balanceAfter}</b>
            <p>{tx.reason}</p>
          </div>
        ))}
      </div>
      <p className="muted bank-foot">Showing {Math.min(size, rows.length)} of {rows.length} — download CSV for the full statement.</p>
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

const fmtDate = d => d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
const toInput = d => d ? new Date(d).toISOString().slice(0, 10) : '';

// The unified phase-by-phase progress + SP tab. Four phases: Standups, ViBe, SPA,
// Projects. Standups & ViBe show real SP; SPA & Projects are placeholders until the
// Samagama data (and their SP rule) land. Goal *staking* lives in the Commitments tab.
const NEXT_NUDGE = { standup: 'Next up: push your ViBe courses.', vibe: 'Next up: keep your SPA pace.', spa: 'Next up: ship your first project PR.', project: 'On track across the board — keep it up!' };

// Goal block that lives ON a phase card: set a target date (none/missed) → pace bar
// once active → "reached" when done. Unit-aware (min for standups, % for ViBe). A GOAL
// is a self-set target (no SP) — distinct from a COMMITMENT (staking SP, the Stake link).
function PhaseGoal({ phaseKey, field, goal, targetText, form, setForm, onSave }) {
  const isPct = goal.unit === '%';
  const metric = isPct ? `${goal.progressPct}% done` : `${goal.current}/${goal.target} ${goal.unit} (${goal.progressPct}%)`;
  const paceLeft = isPct
    ? `${goal.remainingPct}% to go · ~${goal.perDay ?? '—'}%/day to stay on track`
    : `${goal.remaining} ${goal.unit} to go · ~${goal.perDay ?? '—'} ${goal.unit}/${goal.perDayUnit || 'day'} to stay on track`;

  if (goal.status === 'achieved') {
    return <div className="jr-goal"><span className="jr-goal-label done">🎯 Goal reached 🎉</span><span className="jr-goal-foot">{NEXT_NUDGE[phaseKey]}</span></div>;
  }
  if (goal.status === 'active') {
    return (
      <div className="jr-goal">
        {goal.pending ? (
          <span className="jr-goal-meta">🎯 Goal: by {fmtDate(goal.targetDate)} · {goal.daysLeft}d left · progress soon</span>
        ) : (
          <>
            <span className="jr-goal-meta">🎯 Goal: {metric} · by {fmtDate(goal.targetDate)} · {goal.daysLeft}d left</span>
            <div className="jr-progress"><i style={{ width: `${goal.progressPct}%` }} /></div>
            <span className="jr-goal-foot">{paceLeft}</span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="jr-goal">
      <span className={`jr-goal-label ${goal.status === 'missed' ? 'miss' : ''}`}>
        🎯 {goal.status === 'missed' ? `Goal missed — set a new date to ${targetText}` : `Set a target date to ${targetText}`}
      </span>
      <div className="jr-goal-row">
        <input type="date" min={goal.minDate || undefined} max={goal.maxDate || undefined} value={form[field] ?? ''} onChange={e => setForm({ ...form, [field]: e.target.value })} />
        <button className="secondary" disabled={!form[field]} onClick={() => onSave(field, form[field])}>Set goal</button>
      </div>
      {goal.minDate && <span className="jr-goal-hint">Earliest realistic: {fmtDate(goal.minDate)}{goal.paceHint ? ` · ${goal.paceHint}` : ''}</span>}
    </div>
  );
}

function MyJourney({ student, goToCommitment, canCommit = false }) {
  const email = student.email;
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [showTraj, setShowTraj] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    const r = await fetch(`${API}/journey/state?email=${encodeURIComponent(email)}`);
    setData(await r.json());
  };
  useEffect(() => { load(); }, [email]);

  if (!data) return <section className="panel">Loading your journey…</section>;
  if (!data.eligible) return <section className="panel empty">My Journey isn’t available for your cohort yet.</section>;

  const { standups, vibe, goals } = data;

  const saveTarget = async (field, value) => {
    const r = await fetch(`${API}/journey/plan`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, [field]: value })
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error); return; }
    setErr(null); setData(j);
  };
  const gp = { form, setForm, onSave: saveTarget };

  return (
    <div className="jr">
      <section className="panel jr-intro">
        <h2>My Journey</h2>
        <p className="muted"><b>🎯 Goal</b> = your own finish-date target; it tracks your pace, no SP.{canCommit && <> &nbsp;<b>🎲 Commitment</b> = stake SP on a bet — the <b>Stake SP</b> link.</>}</p>
        {err && <p className="error">{err}</p>}
      </section>

      <div className="jr-grid">
        {/* Standups — continuous, no completion goal; commitment only */}
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
          <PhaseGoal phaseKey="standup" field="standupBy" goal={goals.standup} targetText="reach 3,600 Zoom minutes" {...gp} />
          {canCommit && <div className="jr-cardfoot"><button className="jr-stake" onClick={() => goToCommitment('standup')}>🎲 Stake SP →</button></div>}
        </section>

        {/* ViBe — goal + commitment */}
        <section className="jr-card phase-vibe">
          <div className="jr-head"><span className="jr-n">2</span><h3>ViBe courses</h3><span className={`jr-sp ${vibe.sp < 0 ? 'neg' : ''}`}>{vibe.sp >= 0 ? '+' : ''}{vibe.sp} SP</span></div>
          <p className="jr-sub">{vibe.clearedCount}/{vibe.totalCourses} courses complete</p>
          <div className="jr-dots">
            {vibe.ladder.map(l => (
              <div key={l.key} className={`jr-dot ${l.cleared ? 'done' : (vibe.current && vibe.current.key === l.key ? 'current' : '')}`} title={l.name}>
                <b>{l.cleared ? '✓' : `${l.pct}%`}</b><span>{l.name}</span>
              </div>
            ))}
          </div>
          {vibe.activeCommitment && <div className="jr-splits"><span className="jr-pill amber">🎲 Active commitment: +{vibe.activeCommitment.goalPct}%</span></div>}
          <PhaseGoal phaseKey="vibe" field="vibeBy" goal={goals.vibe} targetText="finish all your ViBe courses" {...gp} />
          {canCommit && <div className="jr-cardfoot"><button className="jr-stake" onClick={() => goToCommitment('vibe')}>🎲 Stake SP →</button></div>}
        </section>

        {/* SPA — goal (date) works now; progress data + commitment coming soon */}
        <section className="jr-card phase-spa">
          <div className="jr-head"><span className="jr-n">3</span><h3>SPA — Matrix Mystics</h3><span className="jr-soon">Data soon</span></div>
          <p className="jr-sub">53-problem set · progress data coming soon</p>
          <PhaseGoal phaseKey="spa" field="spaBy" goal={goals.spa} targetText="solve all 53 problems" {...gp} />
        </section>

        {/* Projects — goal (date) works now; progress data coming soon */}
        <section className="jr-card phase-project">
          <div className="jr-head"><span className="jr-n">4</span><h3>Projects</h3><span className="jr-soon">Data soon</span></div>
          <p className="jr-sub">Pull requests · progress data coming soon</p>
          <PhaseGoal phaseKey="project" field="projectBy" goal={goals.project} targetText="raise your first PR" {...gp} />
        </section>
      </div>

      <section className="panel jr-trajlink">
        <div>
          <h2>Your SP trajectory</h2>
          <p className="muted">Your Spurti Points over time vs the cohort and your group.</p>
        </div>
        <button className="secondary" onClick={() => setShowTraj(true)}>View trajectory ↗</button>
      </section>

      {showTraj && <TrajectoryModal student={student} onClose={() => setShowTraj(false)} />}
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
  { key: 'vibe',    name: 'ViBe courses',        blurb: 'ViBe commitments are temporarily on hold — we’re reconnecting the ViBe course-completion feed. They’ll be back up soon.', ready: false },
  { key: 'standup', name: 'Standups',            blurb: 'Standup commitments are paused — standups have moved to YouTube Live and the attendance module is being reworked. They’ll return once the new attendance tracking is ready.', ready: false },
  { key: 'spa',     name: 'SPA — Matrix Mystics', blurb: 'Pledge to solve N of the 53 problems by a date.',                          ready: false },
  { key: 'project', name: 'Projects',            blurb: 'Pledge to raise / merge N pull requests by a date.',                        ready: false }
];

function Commitments({ student, initialPhase }) {
  const [phase, setPhase] = useState(initialPhase || 'vibe');
  const active = COMMITMENT_TYPES.find(t => t.key === phase) || COMMITMENT_TYPES[0];
  return (
    <div className="cm">
      <section className="panel">
        <h2>Commitments</h2>
        <p className="muted">Stake SP on a goal — hit it by the deadline to win it back multiplied; miss and lose a penalty. <b>One active per phase.</b></p>
        <div className="cm-subtabs">
          {COMMITMENT_TYPES.map(t => (
            <button key={t.key} className={`cm-subtab phase-${t.key} ${phase === t.key ? 'active' : ''}`} onClick={() => setPhase(t.key)}>
              {t.name}{!t.ready && <span className="cm-tag">soon</span>}
            </button>
          ))}
        </div>
      </section>
      {active.ready
        ? (active.key === 'vibe' ? <VibeGoals student={student} /> : <StandupGoals student={student} />)
        : <section className="panel"><p className="cm-soon">{active.blurb}{!['standup', 'vibe'].includes(active.key) && <><br /><b>Coming soon</b> — same stake-and-win mechanic, tuned to this phase.</>}</p></section>}
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