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

function StudentView({ profile, setProfile, onBack }) {
  const [tab, setTab] = useState('bank');
  const [commitPhase, setCommitPhase] = useState('vibe');
  const { student } = profile;
  const badges = useMemo(() => buildBadges(profile), [profile]);
  const nextActions = useMemo(() => buildNextActions(profile), [profile]);

  const dismissNudges = async () => {
    try {
      const res = await fetch(`${API}/nudges/read`, {
        method: 'POST',
        headers: { 'X-Student-Email': student.email }
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
      }
    } catch {}
  };

  const goToCommitment = ph => { setCommitPhase(ph); setTab('vibe'); };
  return (
    <main className="page compact">
      <NudgesBanner nudges={student.nudges || []} onDismiss={dismissNudges} />
      <header className="topbar">
        {onBack ? <button className="secondary" onClick={onBack}>Back</button> : <span />}
        <div>
          <p className="eyebrow">Student Spurti Bank</p>
          <h1>{student.name}</h1>
        </div>
        <div className="score-card"><span>SP</span><strong>{student.totalSp}</strong>={student.rank && student.cohortSize ? <em>Rank {student.rank} of {student.cohortSize}</em> : null}</div>
      </header>
      <LevelStatus student={student} />
      <StudentPulse profile={profile} badges={badges} nextActions={nextActions} />
      <Tabs tab={tab} setTab={setTab} tabs={[
        ['bank', 'SP Bank'],
        ['journey', 'My Journey'],
        ...(student.eligibleForVibeGoals ? [['vibe', 'Commitments']] : []),
        ['spa', 'SPA Points'],
        ['polls', 'Polls'],
        ['goals', 'Goals & Reflections'],
        ['shop', 'SP Shield Shop'],
        ['leaderboard', 'Leaderboard'],
        ['faq', 'FAQ']
      ]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'journey' && <MyJourney student={student} goToCommitment={goToCommitment} canCommit={student.eligibleForVibeGoals} />}
      {tab === 'vibe' && student.eligibleForVibeGoals && <Commitments student={student} initialPhase={commitPhase} />}
      {tab === 'spa' && <SpaModule student={student} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
      {tab === 'goals' && <GoalsTab profile={profile} setProfile={setProfile} />}
      {tab === 'shop' && <ShopTab profile={profile} setProfile={setProfile} />}
      {tab === 'leaderboard' && <LeaderboardTabs overall={profile.leaderboard} group={profile.groupLeaderboard} groupLabel={student.leaderboardGroupLabel} />}
      {tab === 'faq' && <FaqTab />}
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
          <span>Streak</span>
          <strong>🔥 {student.currentStreak || 0} sessions</strong>
          <em>longest: {student.longestStreak || 0}</em>
        </div>
        <div className="level-tile">
          <span>SP Shield</span>
          <strong>🛡️ {student.shieldsCount || 0} / 3</strong>
          <em>streak insurance</em>
        </div>
        <div className="level-tile">
          <span>Onboarding Group</span>
          <strong className="group">{student.leaderboardGroupLabel || '—'}</strong>
          <em>biweekly cohort</em>
        </div>
      </div>
      <p className="level-note">
        Level shows your highest achievement and never decreases. Trophy League shows your current performance and can move up or down with your SP. Streaks track consecutive sessions qualified. Shields protect your streak during a missed session.
      </p>
    </section>
  );
}

// Curated leaderboard presets → each maps to a cached board (window/category/scope).
const LB_PRESETS = [
  { key: 'week-total',        label: 'This Week',                          window: 'week', category: 'total',      scope: 'all' },
  { key: 'week-total-cohort', label: 'This Week — My Cohort',             window: 'week', category: 'total',      scope: 'cohort' },
  { key: 'all-total',         label: 'All-Time',                          window: 'all',  category: 'total',      scope: 'all' },
  { key: 'all-total-cohort',  label: 'All-Time — My Cohort',             window: 'all',  category: 'total',      scope: 'cohort' },
  { key: 'week-attendance',   label: '🏅 Best Attendance — This Week',    window: 'week', category: 'attendance', scope: 'all' },
  { key: 'all-attendance',    label: '🏅 Best Attendance — All-Time',     window: 'all',  category: 'attendance', scope: 'all' },
  { key: 'week-poll',         label: '🎯 Poll Champions — This Week',      window: 'week', category: 'poll',       scope: 'all' },
  { key: 'all-poll',          label: '🎯 Poll Champions — All-Time',       window: 'all',  category: 'poll',       scope: 'all' },
  { key: 'week-spa',          label: '🧑‍🏫 Top SPA — This Week',           window: 'week', category: 'spa',        scope: 'all' },
  { key: 'all-spa',           label: '🧑‍🏫 Top SPA — All-Time',            window: 'all',  category: 'spa',        scope: 'all' },
  { key: 'week-query',        label: '💬 Top Query Answerers — This Week', window: 'week', category: 'query',      scope: 'all' },
  { key: 'all-query',         label: '💬 Top Query Answerers — All-Time',  window: 'all',  category: 'query',      scope: 'all' },
];

function LeaderboardPanel({ student }) {
  const [presetKey, setPresetKey] = useState('week-total');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const preset = LB_PRESETS.find(p => p.key === presetKey);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fetch(`${API}/leaderboard/board?window=${preset.window}&category=${preset.category}&scope=${preset.scope}&email=${encodeURIComponent(student.email)}`)
      .then(r => r.json())
      .then(d => { if (live) { setData(d); setLoading(false); } })
      .catch(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [presetKey, student.email]);
  const rows = data?.rows || [];
  const me = data?.me || null;
  const meOutside = me && !rows.some(r => r.studentId === student._id);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Leaderboard</h2>
        <select value={presetKey} onChange={e => setPresetKey(e.target.value)}>
          {LB_PRESETS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>
      {preset.window === 'week' && data?.weekLabel && <p className="muted lb-week">Week of {data.weekLabel} · resets Monday</p>}
      {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No entries yet.</p> : (
        <>
          <table className="table lb-table">
            <thead><tr><th>Rank</th><th>Name</th><th>Level</th><th>SP</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.studentId} className={r.studentId === student._id ? 'current-student' : ''}>
                <td>{r.rank}</td><td>{r.name}</td><td>L{r.level}</td><td>{r.sp}</td>
              </tr>
            ))}</tbody>
          </table>
          {me && (
            <div className="lb-me">
              You: <b>#{me.rank}</b> · {me.sp} SP
              {meOutside && <span className="muted"> — {preset.window === 'week' ? 'earn more this week to climb' : 'keep going to climb'}</span>}
            </div>
          )}
        </>
      )}
    </section>
  );
}

const ALL_BADGES = [
  { name: 'Getting Started', emoji: '🚀', desc: 'Welcome to Spurti! You are onboarded.' },
  { name: 'Top 50', emoji: '🏆', desc: 'Rank in the top 50 cohort leaderboard.' },
  { name: 'Consistent Attendee', emoji: '📅', desc: 'Maintain at least 75% qualified attendance.' },
  { name: 'Poll Champion', emoji: '🗳️', desc: 'Answered at least 75% of launched polls.' },
  { name: 'Above Average', emoji: '⚡', desc: 'Exceeded the average SP of your cohort.' },
  { name: 'Streak Master', emoji: '🔥', desc: 'Achieved a streak of 10 or more sessions.' },
  { name: 'Shielded', emoji: '🛡️', desc: 'Acquired or consumed an SP Shield.' },
  { name: 'Reflective Thinker', emoji: '✍️', desc: 'Submitted a weekly self-reflection.' }
];

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

function StudentPulse({ profile }) {
  const { student, cohort, transactions } = profile;
  const [showTraj, setShowTraj] = useState(false);
  const mission = student.recoveryMission;
  return (
    <>
      <section className="pulse-grid">
        {mission && mission.active && (
          <div className="pulse-card progress-card recovery-mission-card">
            <span>Active Recovery Mission</span>
            <strong>{mission.sessionCountCurrent} / {mission.sessionCountTarget} sessions</strong>
            <p>Complete {mission.sessionCountTarget} consecutive qualified sessions to recover +{mission.pointsToRecover} SP.</p>
          </div>
        )}
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
        <div className="pulse-card wide-pulse">
          <span>Badge Gallery</span>
          <div className="badge-gallery-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginTop: '8px' }}>
            {ALL_BADGES.map(b => {
              const unlocked = badges.includes(b.name) || (b.name === 'Getting Started');
              return (
                <div key={b.name} className={`badge-item ${unlocked ? 'unlocked' : 'locked'}`} title={b.desc} style={{
                  background: unlocked ? '#f0fdf4' : '#f8fafc',
                  border: `1px solid ${unlocked ? '#bbf7d0' : '#e2e8f0'}`,
                  borderRadius: '8px',
                  padding: '10px',
                  textAlign: 'center',
                  opacity: unlocked ? 1 : 0.6
                }}>
                  <div style={{ fontSize: '24px' }}>{unlocked ? b.emoji : '🔒'}</div>
                  <strong style={{ display: 'block', fontSize: '13px', margin: '4px 0', color: unlocked ? '#166534' : '#64748b' }}>{b.name}</strong>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>{b.desc}</span>
                </div>
              );
            })}
          </div>
        </div>
        <button className="pulse-card wide-pulse pulse-clickable" onClick={() => setShowTraj(true)} title="Open full trajectory" style={{ textAlign: 'left', border: 'none', background: 'none', padding: 0 }}>
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

function buildBadges(profile) {
  const badges = [];
  const qualifiedPct = profile.attendance.length ? profile.attendance.filter(a => a.qualified).length / profile.attendance.length : 0;
  const pollAttempted = profile.polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = profile.polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  if (profile.student.rank <= 50) badges.push('Top 50');
  if (qualifiedPct >= 0.75) badges.push('Consistent Attendee');
  if (pollTotal && pollAttempted / pollTotal >= 0.75) badges.push('Poll Champion');
  if (profile.student.totalSp >= profile.cohort.averageSp) badges.push('Above Average');
  if ((profile.student.longestStreak || 0) >= 10) badges.push('Streak Master');
  if ((profile.student.shieldsCount || 0) > 0 || (profile.transactions || []).some(tx => tx.category === 'shield_purchase' || tx.category === 'shield_consume')) badges.push('Shielded');
  if ((profile.reflections || []).some(r => r.submitted)) badges.push('Reflective Thinker');
  return badges.length ? badges : ['Getting Started'];
}

// Student-facing FAQ — reflects the CURRENT SP rules (banded attendance/poll,
// SPA, query answering, ViBe commitments, positive-only). Keep in sync with the
// live rubric; edit this array to add/change questions.
const FAQ_ITEMS = [
  { q: 'What are Spurti Points (SP)?', a: 'SP are engagement points — a live signal of how consistently you take part in the programme, kept completely separate from your academic marks. Every active intern begins with 100 SP on their official start date, a base "learning energy" that everyone receives equally. From there your balance grows as you join standups, do the session polls, teach and learn from peers, answer queries, and work through ViBe courses. A high SP reflects steady participation and consistency — not how you performed on any exam.' },
  { q: 'How do I earn SP?', a: 'There are five live sources, and each appears as its own category in your SP Bank: (1) Attendance at the daily standup, (2) the session Polls, (3) SPA — peer teaching and learning endorsements, (4) answering other students’ Queries, and (5) ViBe course Commitments. The system is positive-first: you gain SP for taking part, and most categories can never reduce your balance. The more consistently you engage across these, the higher your SP climbs.' },
  { q: 'How is attendance SP calculated?', a: 'For each standup we measure the share of the session’s official time-window that you were present, then award it in bands: 90% or more → +10 SP, 75–89% → +5, 50–74% → +3, and below 50% → 0. There is no negative attendance SP — the lowest outcome is simply 0, never a deduction. For example, in a 60-minute window, staying about 54 minutes or more earns the full +10, roughly 45 minutes earns +5, and about 30 minutes earns +3.' },
  { q: 'How does attendance work on the evening quiz standups (Spandan)?', a: 'The evening standups now run as a live quiz on the Spandan classroom, and there is no separate "join / leave" time recorded there. So your attendance for those sessions is measured from how many of the launched poll questions you answer correctly. Answering about 60% of the questions correctly counts as a full 60-minute session (the top band), and it scales down proportionally from there before the same 10/5/3/0 bands are applied. In short: genuinely showing up and engaging with the quiz is what earns your attendance now — you can’t idle in the background and still get credit.' },
  { q: 'How is poll SP calculated?', a: 'Poll SP rewards correctness, measured relative to the day’s top scorer: your poll score is taken as a percentage of the highest scorer that day, and that percentage is banded 10/5/3/0. This means simply clicking through answers is not enough — accuracy is what counts, and the bar automatically flexes with how hard the quiz was on a given day, so an unusually tough night doesn’t unfairly punish everyone.' },
  { q: 'What are SPA points?', a: 'SPA is the peer-teaching activity, and it rewards both learning from peers and teaching them. You earn +5 SP for each question you validly learn, capped at 50 SP (that is, up to 10 questions), and +8 SP for each peer you validly teach, capped at 30 SP. Only endorsements that pass validation count toward your SP — unvalidated or flagged ones do not. Integrity is enforced: if fraud is confirmed or an audit is failed, a penalty is applied to your SP, so it pays to be genuine.' },
  { q: 'How do I earn SP for answering queries?', a: 'When you answer another student’s question (a peer query) with a real, useful answer, you earn +5 SP for each distinct query you help with, up to a maximum of 200 SP from this source overall. Answering your own question does not count, and answers that admins reject or mark as low-quality / unworthy earn nothing. The goal is genuine peer help — quality and effort, not volume — so posting shallow or copied answers to many queries will not build SP.' },
  { q: 'What are ViBe commitments?', a: 'ViBe lets you make a commitment on your own learning: you stake some of your current SP on reaching a target completion percentage in a course by a deadline you choose. If you hit that goal in time, you win SP; if you miss it, you lose the amount you staked. It is entirely optional — a motivation tool that puts a bit of "skin in the game" behind a goal you set for yourself, so use it when you want an extra push to finish something.' },
  { q: 'What is My Journey, and what is the 3,600-minute goal?', a: 'My Journey brings your progress across the four programme tracks — Standups, ViBe, SPA and Projects — together in one view. For standups, the target is 3,600 cumulative attended minutes (roughly 60 sessions of about 60 minutes each). You can set a personal target date for each track to pace yourself, and the standup progress bar shows the minutes you have achieved against the 3,600 required. Once you reach 3,600 minutes the goal is marked as achieved and you no longer need to set a date for it — you’ve completed that track’s attendance goal.' },
  { q: 'Can my SP go down?', a: 'For everyday activity, no. Attendance and polls only ever add SP — their floor is 0 — so a day with low attendance or a weak poll simply earns less, never a deduction. SP decreases in only two specific situations: if you lose a ViBe stake you chose to make, or if an SPA integrity penalty applies (confirmed fraud or a failed audit). Spurti is deliberately built to reward participation and recovery, not to punish an ordinary off day, so one quiet session will not undo your progress.' },
  { q: 'What is the SP Bank?', a: 'The SP Bank is your complete, transparent ledger of every SP change. Each line shows the date and time, the category, the reason for the change, the amount, and your running balance immediately afterwards. Reading it session by session tells the full story of how your total was built, rather than just showing a final number. It is also the first place to look whenever a figure seems off — the per-line reasons usually explain exactly what happened.' },
  { q: 'How should I read my SP ledger?', a: 'Go through it session by session rather than staring only at the final total. For each date, check whether you received attendance SP, poll SP, and any SPA or query SP, note the reason text, and look at the balance after each change. The ledger is designed to be self-explanatory — most questions like "why is my SP this number?" are answered simply by reading the reasons line by line.' },
  { q: 'What are the leaderboard and levels?', a: 'The leaderboard ranks active students by total SP, and the levels / leagues reflect where you currently stand. Both are engagement signals — they show consistency and participation, not academic ability, so a higher rank means someone has been steadily involved, not necessarily "better" at the subject. Because scores refresh periodically, rankings can move around; the healthiest approach is to focus on your own steady progress rather than day-to-day position changes.' },
  { q: 'I did something but my SP hasn’t updated — why?', a: 'Scores are recomputed on a schedule (roughly every six hours), not instantly, so new attendance, poll results, endorsements, or answered queries can take some time to appear. Some data also has to be processed first before it can be scored. Give it a little time; if a genuine change still hasn’t shown up after about a day, then it’s worth raising a correction request.' },
  { q: 'Why is a session missing from my SP?', a: 'The usual reasons are: the session happened before your official internship start date (those never count for you), you were marked excused for that period, the email you joined with doesn’t match your registered account, or that day’s data simply hasn’t been processed yet. Check your SP Bank for that specific date first. If a session you genuinely attended is still missing after processing, raise a correction with the date, session label, and the email you used.' },
  { q: 'Why did my SP change by a different amount than I expected?', a: 'SP is calculated category by category and then added together, so a single day can combine, say, a full +10 attendance, a poll band, and some SPA or query SP. Because of this, your net for a day may look surprising until you break it down. Open the SP Bank, read each line’s reason for that date, and the per-category detail will almost always account for the total.' },
  { q: 'How is SP different from marks?', a: 'Marks measure academic performance on assessed tasks; SP measures engagement and consistency in the learning process. You can have strong marks but low SP if you don’t participate steadily, or modest marks but high SP if you attend, attempt the quizzes, teach peers, and stay involved. Both matter, but they answer different questions — Spurti exists to make the engagement side visible early, while it can still be corrected.' },
  { q: 'I joined with a different email — what should I do?', a: 'Always join sessions and quizzes with your registered programme email; otherwise your attendance and poll records may not link to your account and can appear as missing. If you have already used a different email, ask the team to add it as an alternate email on your record so those sessions attach correctly. Keeping to a single registered email everywhere is the simplest way to avoid mismatches.' },
  { q: 'How do I request an SP correction?', a: 'Raise a request with enough detail to verify it quickly: your name, your registered email (and any alternate email), the session date and label, the category involved (Attendance / Poll / SPA / Query / ViBe), what you expected versus what you actually see, and any supporting evidence such as a screenshot, your join and leave time, or course-progress proof. The team checks the system records first, so accurate dates and session labels make a correction far easier and faster to resolve.' },
  { q: 'Why can’t I search my SP directly?', a: 'For privacy and security, direct student search is disabled in production. Instead, open Spurti from your Samagama dashboard — the same login you already use — and it will show only your own record. This is what ensures no one can look up another student’s SP, and it’s why you normally reach Spurti through the official programme link rather than searching by name or email.' },
];

function FaqTab() {
  const [open, setOpen] = useState(0);
  return (
    <section className="panel">
      <div className="panel-head"><h2>FAQ</h2></div>
      <p className="muted faq-intro">Tap a question to see the answer.</p>
      <div className="faq-list">
        {FAQ_ITEMS.map((item, i) => (
          <div className={`faq-item ${open === i ? 'open' : ''}`} key={i}>
            <button className="faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span>{item.q}</span><span className="faq-caret">{open === i ? '–' : '+'}</span>
            </button>
            {open === i && <p className="faq-a">{item.a}</p>}
          </div>
        ))}
      </div>
    </section>
  );
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
      {!goal.pending && goal.progressPct != null && (
        <>
          <span className="jr-goal-meta">{metric}</span>
          <div className="jr-progress"><i style={{ width: `${goal.progressPct}%` }} /></div>
        </>
      )}
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
      {studentProfile && (
        <div className="overlay">
          <section className="modal wide">
            <div className="modal-head">
              <h2>{studentProfile.student.name}</h2>
              <button className="icon" onClick={() => setStudentProfile(null)}>x</button>
            </div>
            <div className="admin-nudge-box" style={{ padding: '0 20px 20px 20px', borderBottom: '1px solid var(--line)' }}>
              <h3>Send Nudge to Student</h3>
              <div className="search-row">
                <input id="admin-nudge-input" placeholder="Enter nudge message (e.g. Please join tomorrow's session early!)..." style={{ flex: 1 }} />
                <button className="primary" onClick={async () => {
                  const input = document.getElementById('admin-nudge-input');
                  const message = input?.value?.trim();
                  if (!message) return alert('Message cannot be empty.');
                  try {
                    const res = await fetch(`${API}/admin/nudge`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Email': auth.email,
                        'X-Admin-Token': auth.token
                      },
                      body: JSON.stringify({ studentId: studentProfile.student._id, message })
                    });
                    if (res.ok) {
                      alert('Nudge sent successfully!');
                      input.value = '';
                    } else {
                      alert('Failed to send nudge.');
                    }
                  } catch {
                    alert('Error sending nudge.');
                  }
                }}>Send Nudge</button>
              </div>
            </div>
            <SpBank transactions={studentProfile.transactions} />
          </section>
        </div>
      )}
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

function NudgesBanner({ nudges, onDismiss }) {
  const unread = nudges.filter(n => !n.read);
  if (unread.length === 0) return null;
  return (
    <div className="nudges-banner">
      <div className="nudge-title">📢 Message from Admin:</div>
      {unread.map((n, i) => (
        <p key={i} className="nudge-message">"{n.message}" <span className="nudge-time">({new Date(n.sentAt).toLocaleDateString()})</span></p>
      ))}
      <button className="primary compact" style={{ marginTop: '8px', padding: '6px 12px' }} onClick={onDismiss}>Dismiss Message</button>
    </div>
  );
}

function GoalsTab({ profile, setProfile }) {
  const { student, reflections = [], currentWeekLabel } = profile;
  const [goalInput, setGoalInput] = useState('');
  const [reflectionInput, setReflectionInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const currentRef = reflections.find(r => r.weekLabel === currentWeekLabel);

  const getWeekRange = (startDate, weekLabel) => {
    const match = String(weekLabel).match(/Week (\d+)/);
    if (!match) return { start: new Date(0), end: new Date() };
    const weekNum = parseInt(match[1], 10);
    const start = new Date(startDate);
    start.setDate(start.getDate() + (weekNum - 1) * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  };

  const { start, end } = getWeekRange(student.internshipStartDate, currentWeekLabel);
  const earnedThisWeek = (profile.transactions || [])
    .filter(tx => {
      const txDate = new Date(tx.dateTime);
      return txDate >= start && txDate < end && tx.appliedDelta > 0;
    })
    .reduce((sum, tx) => sum + tx.appliedDelta, 0);

  const targetGoal = currentRef ? currentRef.weeklySpGoal : 0;
  const remaining = Math.max(0, targetGoal - earnedThisWeek);
  const pct = targetGoal ? Math.min(100, Math.round((earnedThisWeek / targetGoal) * 100)) : 0;

  const handleSetGoal = async () => {
    setError('');
    const goal = Number(goalInput);
    if (isNaN(goal) || goal <= 0) return setError('Please enter a valid goal (positive number).');
    setLoading(true);
    try {
      const res = await fetch(`${API}/reflections/goal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Student-Email': student.email },
        body: JSON.stringify({ goal })
      });
      if (!res.ok) throw new Error('Failed to set goal');
      const data = await res.json();
      setProfile(data.profile);
    } catch (err) {
      setError('Failed to set goal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReflectionSubmit = async () => {
    setError('');
    if (!reflectionInput.trim()) return setError('Reflection text cannot be empty.');
    setLoading(true);
    try {
      const res = await fetch(`${API}/reflections/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Student-Email': student.email },
        body: JSON.stringify({ reflectionText: reflectionInput })
      });
      if (!res.ok) throw new Error('Failed to submit reflection');
      const data = await res.json();
      setProfile(data.profile);
      setReflectionInput('');
    } catch (err) {
      setError('Failed to submit reflection. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Goals & Reflections ({currentWeekLabel})</h2>
      </div>
      {error && <p className="error">{error}</p>}
      
      <div className="goals-section">
        {!currentRef ? (
          <div className="goal-setup">
            <p className="muted" style={{ marginBottom: '12px' }}>Set your target SP goal for {currentWeekLabel} to help track your weekly learning consistency!</p>
            <div className="search-row">
              <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)} placeholder="e.g. 150 SP" style={{ flex: 1 }} />
              <button className="primary" disabled={loading} onClick={handleSetGoal}>Set Goal</button>
            </div>
          </div>
        ) : (
          <div className="goal-active">
            <div className="goal-banner" style={{ marginBottom: '16px' }}>
              <span>🎯 Target Goal: <strong>{currentRef.weeklySpGoal} SP</strong></span>
              <span>Your Current Points: <strong>{student.totalSp} SP</strong></span>
            </div>

            <div className="goal-progress-section" style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>
                <span style={{ color: '#1e293b' }}>Weekly Progress</span>
                <span style={{ color: '#2563eb' }}>{pct}% Completed</span>
              </div>
              <div className="progress-bar-container" style={{
                background: '#e2e8f0',
                borderRadius: '8px',
                height: '16px',
                width: '100%',
                overflow: 'hidden',
                marginBottom: '12px'
              }}>
                <div className="progress-bar-fill" style={{
                  background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)',
                  height: '100%',
                  width: `${pct}%`,
                  transition: 'width 0.4s ease'
                }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div style={{ background: '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
                  <span style={{ color: '#166534', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Earned This Week</span>
                  <strong style={{ color: '#14532d', fontSize: '16px' }}>+{earnedThisWeek} SP</strong>
                </div>
                <div style={{ background: remaining > 0 ? '#eff6ff' : '#f0fdf4', padding: '8px 12px', borderRadius: '8px', border: remaining > 0 ? '1px solid #dbeafe' : '1px solid #dcfce7' }}>
                  <span style={{ color: remaining > 0 ? '#1e40af' : '#166534', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold' }}>Remaining</span>
                  <strong style={{ color: remaining > 0 ? '#1e3a8a' : '#14532d', fontSize: '16px' }}>
                    {remaining > 0 ? `${remaining} SP` : 'Goal Met! 🎉'}
                  </strong>
                </div>
              </div>
            </div>
            
            {!currentRef.submitted ? (
              <div className="reflection-form">
                <h3>Weekly Reflection</h3>
                <p className="muted" style={{ marginBottom: '8px' }}>Submit a short self-reflection on your consistency and learning effort this week to claim a <strong>+5 SP</strong> reward!</p>
                <textarea 
                  value={reflectionInput} 
                  onChange={e => setReflectionInput(e.target.value)} 
                  placeholder="How did this week go? What did you find easy or challenging?"
                  rows="4"
                  className="reflection-textarea"
                  style={{ width: '100%', marginBottom: '12px' }}
                />
                <button className="primary" disabled={loading} onClick={handleReflectionSubmit}>Submit Reflection (+5 SP)</button>
              </div>
            ) : (
              <div className="reflection-completed">
                <p className="success-note">✅ Reflection submitted! +5 SP has been added to your bank statement.</p>
                <blockquote className="reflection-quote">"{currentRef.reflectionText}"</blockquote>
              </div>
            )}
          </div>
        )}
      </div>

      {reflections.length > 0 && (
        <div className="reflections-history" style={{ marginTop: '24px' }}>
          <h3>Goal History</h3>
          <table className="table">
            <thead><tr><th>Week</th><th>Target Goal</th><th>Reflection</th><th>Submitted</th></tr></thead>
            <tbody>
              {reflections.map(ref => (
                <tr key={ref._id}>
                  <td>{ref.weekLabel}</td>
                  <td>{ref.weeklySpGoal} SP</td>
                  <td><em className="text-preview">{ref.reflectionText || '—'}</em></td>
                  <td>{ref.submitted ? '✅ Yes' : '❌ No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ShopTab({ profile, setProfile }) {
  const { student } = profile;
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const buyShield = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/shield/purchase`, {
        method: 'POST',
        headers: { 'X-Student-Email': student.email }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to purchase shield');
      }
      const data = await res.json();
      setProfile(data.profile);
      setSuccess('Successfully purchased 1 SP Shield! Streak protected.');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>SP Shield Shop</h2>
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success-note" style={{ marginBottom: '16px' }}>{success}</p>}

      <div className="shop-grid">
        <div className="shop-card">
          <div className="shield-icon">🛡️</div>
          <h3>SP Shield</h3>
          <p className="price">30 SP</p>
          <p className="muted desc">
            Acquire an SP Shield to protect your streak! If you miss a session or fail to qualify due to connectivity issues, a shield is automatically consumed. Your current streak will be preserved, and you will be awarded baseline attendance points (+5 SP).
          </p>
          <div className="status-indicators">
            <div>Current Balance: <strong>{student.totalSp} SP</strong></div>
            <div>Shield Inventory: <strong>{student.shieldsCount} / 3</strong></div>
          </div>
          <button 
            className="primary" 
            disabled={loading || student.totalSp < 30 || student.shieldsCount >= 3} 
            onClick={buyShield}
          >
            {student.shieldsCount >= 3 ? 'Shield Inventory Full' : 'Buy 1 Shield (30 SP)'}
          </button>
        </div>
      </div>
    </section>
  );
}


createRoot(document.getElementById('root')).render(<App />);
