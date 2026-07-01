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
    }).catch(() => { });
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
          <button className="icon" aria-label="Close" onClick={onClose}>×</button>
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
  const attentionItems = useMemo(() => buildAttentionItems(profile), [profile]);
  return (
    <main className="page compact">
      <DashboardHeader student={student} />
      <DashboardProgressCards student={student} cohort={profile.cohort} vibeCourse={profile.vibeCourse} />
      <DashboardStatCards profile={profile} badges={badges} />
      <DashboardBottom profile={profile} attentionItems={attentionItems} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank', 'SP Bank'], ['summary', '5-Day Summary'], ['polls', 'Polls'], ['leaderboard', 'Leaderboard']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'summary' && <FiveDaySummary profile={profile} />}
      {tab === 'polls' && <Polls polls={profile.polls} />}
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

// ============================================================
// NEW DASHBOARD COMPONENTS (reference screenshot)
// ============================================================

function DashboardHeader({ student }) {
  const tier = String(student.trophyLeague || 'Bronze').split(' ')[0].toLowerCase();
  const cohortLabel = student.leaderboardGroupLabel
    ? `Cohort: ${student.leaderboardGroupLabel}`
    : null;
  return (
    <div className="dashboard-header">
      <div className="dashboard-header-left">
        <p className="eyebrow">Student Spurti Bank</p>
        <h1>{student.name}</h1>
        <div className="header-tags">
          <span className="header-tag">Level {student.level} · lifetime</span>
          <span className={`header-tag badge-tag tier-${tier}`}>{student.trophyLeague} · current</span>
          {cohortLabel && <span className="header-tag">{cohortLabel}</span>}
        </div>
      </div>
      <div className="dashboard-sp-score">
        <span className="sp-label">Spurti Points</span>
        <span className="sp-number">{student.totalSp}</span>
        {student.rank && student.cohortSize && (
          <span className="sp-rank">Rank {student.rank} of {student.cohortSize.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

function DashboardProgressCards({ student, cohort, vibeCourse }) {
  const sp = student.totalSp || 0;

  // Next rank card
  const toNextRank = cohort.pointsToNextRank;
  const nextRankBarPct = toNextRank === 0
    ? 100
    : Math.max(2, Math.min(98, Math.round((sp / (sp + toNextRank)) * 100)));
  const nextRankNote = toNextRank === 0
    ? 'You are leading your comparison group.'
    : `You're ${toNextRank} SP behind rank ${(student.rank || 1) - 1}.`;

  // Legend badge card
  const legendTarget = 1500;
  const legendPct = Math.max(2, Math.min(100, Math.round((sp / legendTarget) * 100)));
  const legendNote = student.legendBadgeUnlocked
    ? 'Legend Badge unlocked! Permanently yours.'
    : `Reach ${legendTarget} SP once to unlock, permanently.`;

  return (
    <div className="progress-cards">
      {/* Next Rank */}
      <div className="progress-card">
        <div className="progress-card-header">
          <span className="pc-label">Next rank</span>
          <span className="pc-togo">
            {toNextRank === 0 ? null : <><strong>{toNextRank}</strong> <span className="sp-unit">SP</span> <span className="sp-unit">to go</span></>}
          </span>
        </div>
        <div className="sp-bar-track">
          <div className="sp-bar-fill" style={{ width: `${nextRankBarPct}%` }} />
        </div>
        <p className="progress-card-note">{nextRankNote}</p>
      </div>

      {/* Legend badge */}
      <div className="progress-card">
        <div className="progress-card-header">
          <span className="pc-label">Legend badge</span>
          <span className="pc-togo">
            <strong>{sp}</strong>
            <span className="sp-unit"> / {legendTarget.toLocaleString()}</span>
          </span>
        </div>
        <div className="sp-bar-track">
          <div className="sp-bar-fill" style={{ width: `${legendPct}%` }} />
        </div>
        <p className="progress-card-note">{legendNote}</p>
      </div>

      {/* ViBe Course Progress rings */}
      <VibeCourseRingsCard vibeCourse={vibeCourse} />
    </div>
  );
}

// SVG circular progress ring component
function ProgressRing({ pct, color, size = 68, stroke = 6, loading = false, empty = false }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const filled = empty || loading ? 0 : (circ * Math.max(0, Math.min(100, pct))) / 100;
  const label = loading ? '…' : empty ? '—' : `${Math.round(pct)}%`;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      {/* Track */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={stroke}
      />
      {/* Fill */}
      {!loading && !empty && (
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ - filled}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      )}
      {/* Skeleton shimmer arc for loading */}
      {loading && (
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.4} ${circ * 0.6}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="vibe-ring-spin"
        />
      )}
      {/* Center label */}
      <text
        x={size / 2} y={size / 2}
        dominantBaseline="central"
        textAnchor="middle"
        fill={loading || empty ? '#94a3b8' : color}
        fontSize={pct !== null && pct >= 100 ? size * 0.19 : size * 0.22}
        fontWeight="800"
        fontFamily="inherit"
      >
        {label}
      </text>
    </svg>
  );
}

const VIBE_RING_COURSES = [
  { key: 'onboarding',     abbr: 'Onb',  color: 'var(--primary)' },
  { key: 'aiFundamentals', abbr: 'AI',   color: 'var(--green)'   },
  { key: 'mernStack',      abbr: 'MERN', color: 'var(--amber)'   }
];

function VibeCourseRingsCard({ vibeCourse }) {
  return (
    <div className="progress-card vibe-rings-card">
      <div className="progress-card-header">
        <span className="pc-label">ViBe Completion</span>
      </div>
      <div className="vibe-rings-row">
        {VIBE_RING_COURSES.map(course => {
          const raw = vibeCourse ? vibeCourse[course.key] : undefined;
          const isLoading = vibeCourse === undefined || vibeCourse === null;
          const isEmpty = !isLoading && (raw === null || raw === undefined);
          const pct = isEmpty ? null : Math.min(100, Math.max(0, Number(raw) || 0));
          return (
            <div key={course.key} className="vibe-ring-item">
              <ProgressRing
                pct={pct}
                color={course.color}
                size={68}
                stroke={6}
                loading={isLoading}
                empty={isEmpty}
              />
              <span className="vibe-ring-label">{course.abbr}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardStatCards({ profile, badges }) {
  const { student, cohort, attendance, polls } = profile;

  // Attendance
  const attQualified = attendance.filter(a => a.qualified).length;
  const attTotal = attendance.length;
  const attPct = attTotal ? Math.round((attQualified / attTotal) * 100) : 0;

  // Polls
  const pollAttempted = polls.reduce((s, p) => s + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((s, p) => s + p.totalQuestions, 0);
  const pollPct = pollTotal ? Math.round((pollAttempted / pollTotal) * 100) : 0;

  // Badges
  const badgeCount = badges.filter(b => b !== 'Getting Started').length;
  const badgeNames = badges.filter(b => b !== 'Getting Started').join(' · ') || 'Getting Started';

  // SP vs Top 50% Peers
  const top50Avg = cohort.top50AvgSp ?? cohort.averageSp ?? 0;
  const spDelta = student.totalSp - top50Avg;
  const deltaSign = spDelta >= 0 ? '+' : '';
  const deltaClass = spDelta >= 0 ? 'positive' : 'negative';

  return (
    <div className="stat-cards">
      {/* Attendance */}
      <div className="stat-card">
        <span className="stat-card-label">Attendance qualified</span>
        <span className="stat-value">{attPct}%</span>
        <div className="stat-sub">
          {attQualified} / {attTotal} sessions
        </div>
      </div>

      {/* Polls */}
      <div className="stat-card">
        <span className="stat-card-label">Polls attempted</span>
        <span className="stat-value">{pollPct}%</span>
        <div className="stat-sub">
          {pollAttempted} / {pollTotal} questions
        </div>
      </div>

      {/* Badges */}
      <div className="stat-card">
        <span className="stat-card-label">Badges earned</span>
        <span className="stat-value">{badgeCount || 0}</span>
        <div className="stat-badge-names">{badgeNames}</div>
      </div>

      {/* SP vs Top 50% Peers */}
      <div className="stat-card">
        <span className="stat-card-label">SP vs top 50% peers</span>
        <span className={`stat-value ${deltaClass}`}>{deltaSign}{spDelta}</span>
        <div className="stat-delta-sub">
          You: {student.totalSp} · Top 50% Avg: {top50Avg}
        </div>
      </div>
    </div>
  );
}

function DashboardBottom({ profile, attentionItems }) {
  const { transactions } = profile;
  const sessionCount = new Set(transactions.map(tx => tx.sessionLabel).filter(Boolean)).size;
  return (
    <div className="dashboard-bottom">
      <div className="trend-card">
        <p className="trend-card-title">SP trend</p>
        <p className="trend-card-sub">
          {transactions.length > 0
            ? `Cumulative balance across ${sessionCount} session${sessionCount !== 1 ? 's' : ''} — hover for the exact value on any day.`
            : 'No SP transactions recorded yet.'}
        </p>
        <SpTrendChart transactions={transactions} />
      </div>
      <div className="attention-card">
        <p className="attention-card-title">Needs your attention</p>
        <p className="attention-card-sub">Ranked by what costs you the most SP if ignored.</p>
        {attentionItems.length === 0 ? (
          <p style={{ color: 'var(--green)', fontSize: 13 }}>All good — nothing needs your attention right now.</p>
        ) : (
          <ul className="attention-list">
            {attentionItems.map((item, i) => (
              <li key={i} className="attention-item">
                <span className={`attention-dot ${item.severity}`} />
                <div>
                  {/* B2-FIX: no dangerouslySetInnerHTML — structured parts rendered as safe JSX */}
                  <div className="attention-text">
                    {item.preText}
                    {item.highlight && <em>{item.highlight}</em>}
                    {item.postText}
                  </div>
                  {item.sub && <div className="attention-subtext">{item.sub}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// SVG line chart for SP trend
function SpTrendChart({ transactions }) {
  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, tx }
  const [width, setWidth] = useState(600);

  // Keep track of container width for responsive label density
  useEffect(() => {
    if (!wrapRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w) setWidth(Math.round(w));
    });
    obs.observe(wrapRef.current);
    return () => obs.disconnect();
  }, []);

  if (!transactions || transactions.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', fontSize: 13, paddingTop: 8 }}>
        SP trend data will appear here once transactions are recorded.
      </div>
    );
  }

  const PAD = { top: 12, right: 16, bottom: 36, left: 44 };
  const H = 180;
  const W = 560; // SVG internal coordinate width (viewBox)
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const spValues = transactions.map(tx => Number(tx.balanceAfter) || 0);
  const minSP = Math.min(...spValues);
  const maxSP = Math.max(...spValues);
  const spRange = maxSP - minSP || 1;

  const pts = transactions.map((tx, i) => ({
    x: PAD.left + (transactions.length === 1 ? innerW / 2 : (i / (transactions.length - 1)) * innerW),
    y: PAD.top + innerH - ((Number(tx.balanceAfter) - minSP) / spRange) * innerH,
    tx
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = [
    `M${pts[0].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)}`,
    ...pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `L${pts[pts.length - 1].x.toFixed(1)},${(PAD.top + innerH).toFixed(1)}`,
    'Z'
  ].join(' ');

  // Y-axis gridlines
  const ySteps = 4;
  const yLines = Array.from({ length: ySteps + 1 }, (_, i) => {
    const val = Math.round(minSP + (spRange / ySteps) * i);
    const y = PAD.top + innerH - ((val - minSP) / spRange) * innerH;
    return { val, y };
  });

  // X-axis label density: show ~1 label per 60px of real container width
  const maxLabels = Math.max(2, Math.floor(width / 60));
  const labelStep = Math.ceil(transactions.length / maxLabels);

  function abbreviateLabel(label = '') {
    // "Day 10 (26 May)" -> "D10", "15 May Morning" -> "15 May", long labels truncated
    const dayMatch = label.match(/^Day\s+(\d+)/);
    if (dayMatch) return `D${dayMatch[1]}`;
    const dateMatch = label.match(/^(\d{1,2}\s+[A-Za-z]{3})/);
    if (dateMatch) return dateMatch[1];
    return label.length > 8 ? label.slice(0, 7) + '…' : label;
  }

  function formatDate(dt) {
    if (!dt) return null;
    try {
      return new Date(dt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return null; }
  }

  function handleMouseMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Convert mouse position to SVG coordinate space
    const scaleX = W / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    // Find nearest point
    let closest = pts[0];
    let minDist = Math.abs(pts[0].x - mouseX);
    for (const p of pts) {
      const d = Math.abs(p.x - mouseX);
      if (d < minDist) { minDist = d; closest = p; }
    }
    // Position tooltip in % relative to the SVG element
    const tooltipX = ((closest.x - PAD.left) / innerW) * 100;
    const tooltipY = ((closest.y) / H) * 100;
    setTooltip({ pctX: tooltipX, pctY: tooltipY, tx: closest.tx });
  }

  function handleMouseLeave() { setTooltip(null); }

  return (
    <div ref={wrapRef} className="sp-chart-wrap">
      <svg
        ref={svgRef}
        className="sp-chart-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        aria-label="SP trend line chart"
      >
        <defs>
          <linearGradient id="spGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.5" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y gridlines */}
        {yLines.map(({ val, y }) => (
          <g key={val}>
            <line className="chart-grid" x1={PAD.left} y1={y.toFixed(1)} x2={W - PAD.right} y2={y.toFixed(1)} />
            <text className="chart-y-label" x={PAD.left - 6} y={(y + 3.5).toFixed(1)}>{val}</text>
          </g>
        ))}

        {/* Area fill */}
        <path className="chart-area" d={areaPath} />

        {/* Line */}
        <path className="chart-line" d={linePath} />

        {/* Dots + X labels */}
        {pts.map((p, i) => (
          <g key={i}>
            <circle
              className="chart-dot"
              cx={p.x.toFixed(1)}
              cy={p.y.toFixed(1)}
              r="3"
            />
            {i % labelStep === 0 && (
              <text
                className="chart-x-label"
                x={p.x.toFixed(1)}
                y={(PAD.top + innerH + 16).toFixed(1)}
              >
                {abbreviateLabel(p.tx.sessionLabel || `#${i + 1}`)}
              </text>
            )}
          </g>
        ))}

        {/* Highlighted dot on hover */}
        {tooltip && (() => {
          const hp = pts.find(p => p.tx === tooltip.tx);
          return hp ? (
            <circle
              cx={hp.x.toFixed(1)}
              cy={hp.y.toFixed(1)}
              r="5"
              fill="var(--primary)"
              stroke="#fff"
              strokeWidth="2"
              pointerEvents="none"
            />
          ) : null;
        })()}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="sp-tooltip"
          style={{
            left: `${Math.max(5, Math.min(95, tooltip.pctX))}%`,
            top: `${Math.max(5, tooltip.pctY)}%`
          }}
        >
          {tooltip.tx.sessionLabel && (
            <div className="sp-tooltip-row">
              <span className="tt-label">Session</span>
              <span className="tt-val">{tooltip.tx.sessionLabel}</span>
            </div>
          )}
          {tooltip.tx.dateTime && (
            <div className="sp-tooltip-row">
              <span className="tt-label">Date</span>
              <span className="tt-val">{formatDate(tooltip.tx.dateTime)}</span>
            </div>
          )}
          <div className="sp-tooltip-row">
            <span className="tt-label">SP after</span>
            <span className="tt-val">{tooltip.tx.balanceAfter}</span>
          </div>
          {tooltip.tx.appliedDelta !== undefined && tooltip.tx.appliedDelta !== 0 && (
            <div className="sp-tooltip-row">
              <span className="tt-label">Change</span>
              <span className={`tt-val ${tooltip.tx.appliedDelta > 0 ? 'pos' : 'neg'}`}>
                {tooltip.tx.appliedDelta > 0 ? '+' : ''}{tooltip.tx.appliedDelta}
              </span>
            </div>
          )}
          {tooltip.tx.reason && (
            <div className="sp-tooltip-row" style={{ maxWidth: 220, flexWrap: 'wrap' }}>
              <span className="tt-label">Reason</span>
              <span className="tt-val" style={{ fontSize: 11, fontWeight: 500, color: '#cbd5e1', maxWidth: 160, whiteSpace: 'normal' }}>
                {tooltip.tx.reason}
              </span>
            </div>
          )}
        </div>
      )}
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

function buildAttentionItems(profile) {
  const items = [];
  const { student, cohort, attendance, polls } = profile;

  // Check most recent / incomplete poll sets.
  // B2-FIX: items carry {preText, highlight, postText} instead of raw HTML strings.
  const sortedPolls = [...polls].sort((a, b) => pollSortKey(b.sessionLabel) - pollSortKey(a.sessionLabel));
  for (const poll of sortedPolls.slice(0, 5)) {
    if (poll.missedQuestions > 0 && poll.totalQuestions > 0) {
      const remaining = poll.totalQuestions - poll.attemptedQuestions;
      const locked = poll.attemptedQuestions === 0;
      items.push({
        severity: 'red',
        preText: `${poll.sessionLabel} polls — `,
        highlight: `${poll.attemptedQuestions} of ${poll.totalQuestions} attempted`,
        postText: '',
        sub: locked
          ? 'Fully missed; this debit is already locked in.'
          : `Finishing this set is worth up to ${remaining * 5} more SP today.`
      });
      if (items.length >= 2) break;
    }
  }

  // Attendance warning
  const attQualified = attendance.filter(a => a.qualified).length;
  const attTotal = attendance.length;
  const attPct = attTotal ? Math.round((attQualified / attTotal) * 100) : 100;
  if (attPct < 75 && attTotal > 0) {
    items.push({
      severity: 'amber',
      preText: `Attendance dipped to ${attPct}% qualified`,
      highlight: '',
      postText: '',
      sub: 'Stay above 75% on upcoming sessions to avoid further debit.'
    });
  }

  // Top 50 gap
  const toTop50 = cohort.pointsToTop50;
  if (toTop50 !== null && toTop50 > 0) {
    items.push({
      severity: 'amber',
      preText: `${toTop50} SP from the Top 50 cutoff`,
      highlight: '',
      postText: '',
      sub: 'Two strong attendance days would close this gap.'
    });
  }

  return items.slice(0, 6);
}


// ============================================================
// 5-DAY SUMMARY
// ============================================================

// Derive a sort key from a session label so we can order by date consistently.
// Handles both "Day 10 (26 May)" and legacy "15 May Morning" formats.
function sessionSortKey(label = '') {
  // "Day N (DD Mon)" format
  const paren = label.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) {
    const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const m = MONTHS[paren[2].slice(0,3).toLowerCase()];
    return m !== undefined ? m * 100 + Number(paren[1]) : -1;
  }
  // "DD Mon [Morning/Afternoon/Evening]" format
  const lead = label.match(/^(\d{1,2})\s+([A-Za-z]+)/);
  if (lead) {
    const MONTHS = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
    const m = MONTHS[lead[2].slice(0,3).toLowerCase()];
    return m !== undefined ? m * 100 + Number(lead[1]) : -1;
  }
  return -1;
}

function FiveDaySummary({ profile }) {
  const { attendance, polls, transactions } = profile;

  // Build a map of sessionLabel -> { attendancePct, qualified, attSP, pollPct, pollSP }
  // using existing attendance records and poll records.

  // Collect all unique session labels from attendance (these are the mandatory sessions).
  // Sort chronologically descending (most recent first), take last 5.
  const sessionLabels = [...new Set(attendance.map(a => a.sessionLabel).filter(Boolean))]
    .sort((a, b) => sessionSortKey(b) - sessionSortKey(a))
    .slice(0, 5);

  // Build a map for polls: sessionLabel -> poll record
  const pollBySession = new Map();
  for (const p of polls) {
    if (p.sessionLabel) pollBySession.set(p.sessionLabel, p);
  }

  // Build a map for transactions: sessionLabel+category -> appliedDelta sum
  // so we can read the actual SP that was credited from the ledger.
  const txBySessionCat = new Map();
  for (const tx of transactions) {
    if (!tx.sessionLabel || !tx.category) continue;
    const key = `${tx.sessionLabel}|${tx.category}`;
    txBySessionCat.set(key, (txBySessionCat.get(key) || 0) + (Number(tx.appliedDelta) || 0));
  }

  // Build a map for attendance records: sessionLabel -> attendance record
  const attBySession = new Map();
  for (const a of attendance) {
    if (a.sessionLabel) attBySession.set(a.sessionLabel, a);
  }

  // Assemble rows for the 5 sessions.
  const rows = sessionLabels.map(label => {
    const att = attBySession.get(label);
    const poll = pollBySession.get(label);

    const attPct = att ? Math.round(Number(att.attendancePercentage) || 0) : null;
    const pollPct = poll && poll.totalQuestions > 0
      ? Math.round((poll.attemptedQuestions / poll.totalQuestions) * 100)
      : null;

    // Read actual SP from transactions ledger (sum of attendance + poll txns for this session)
    const attSP = txBySessionCat.get(`${label}|attendance`) ?? null;
    const pollSP = txBySessionCat.get(`${label}|poll`) ?? null;
    const totalSP = (attSP ?? 0) + (pollSP ?? 0);

    return { label, attPct, pollPct, attSP, pollSP, totalSP };
  });

  // Summaries (only over sessions where data exists)
  const attRows = rows.filter(r => r.attPct !== null);
  const pollRows = rows.filter(r => r.pollPct !== null);
  const avgAttPct = attRows.length ? Math.round(attRows.reduce((s, r) => s + r.attPct, 0) / attRows.length) : null;
  const avgPollPct = pollRows.length ? Math.round(pollRows.reduce((s, r) => s + r.pollPct, 0) / pollRows.length) : null;
  const totalAttSP = rows.reduce((s, r) => s + (r.attSP ?? 0), 0);
  const totalPollSP = rows.reduce((s, r) => s + (r.pollSP ?? 0), 0);
  const grandTotalSP = totalAttSP + totalPollSP;

  // Engagement status
  const attBelowThreshold = avgAttPct !== null && avgAttPct < 75;
  const pollBelowThreshold = avgPollPct !== null && avgPollPct < 75;
  const bothHealthy = !attBelowThreshold && !pollBelowThreshold && avgAttPct !== null && avgPollPct !== null;

  function pctBar(pct, threshold = 75) {
    if (pct === null) return null;
    const color = pct >= threshold ? 'var(--green)' : 'var(--red)';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 999 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
      </div>
    );
  }

  if (sessionLabels.length === 0) {
    return (
      <section className="panel">
        <h2>5-Day Summary</h2>
        <p className="muted">No session attendance data found yet.</p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>5-Day Summary</h2>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
            Your engagement across the last {rows.length} mandatory session{rows.length !== 1 ? 's' : ''}.
          </p>
        </div>
        {/* Engagement status badge */}
        {bothHealthy && (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--green)', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '6px 12px', whiteSpace: 'nowrap' }}>
            ✅ Healthy Engagement
          </span>
        )}
      </div>

      {/* Warning banners */}
      {(attBelowThreshold || pollBelowThreshold) && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          {attBelowThreshold && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
              ⚠ Attendance is below the safe threshold.
            </div>
          )}
          {pollBelowThreshold && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--amber)', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px' }}>
              ⚠ Poll participation is below the safe threshold.
            </div>
          )}
        </div>
      )}

      {/* Session rows */}
      <div className="bank" style={{ marginBottom: 16 }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, auto)', gap: 10, padding: '10px 12px', background: '#f8fafc', borderBottom: '1px solid var(--line)', fontSize: 11, fontWeight: 900, color: 'var(--muted)', textTransform: 'uppercase' }}>
          <span>Session</span>
          <span style={{ textAlign: 'right', minWidth: 80 }}>Att %</span>
          <span style={{ textAlign: 'right', minWidth: 80 }}>Poll %</span>
          <span style={{ textAlign: 'right', minWidth: 60 }}>Att SP</span>
          <span style={{ textAlign: 'right', minWidth: 60 }}>Poll SP</span>
          <span style={{ textAlign: 'right', minWidth: 60 }}>Total SP</span>
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(5, auto)', gap: 10, padding: '12px 12px', borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : 'none', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{row.label}</span>
            <div style={{ minWidth: 80 }}>
              {row.attPct !== null
                ? pctBar(row.attPct)
                : <span className="muted" style={{ fontSize: 12 }}>—</span>}
            </div>
            <div style={{ minWidth: 80 }}>
              {row.pollPct !== null
                ? pctBar(row.pollPct)
                : <span className="muted" style={{ fontSize: 12 }}>—</span>}
            </div>
            <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.attSP !== null && row.attSP > 0 ? 'var(--green)' : 'var(--muted)', minWidth: 60 }}>
              {row.attSP !== null ? (row.attSP > 0 ? `+${row.attSP}` : row.attSP) : '—'}
            </span>
            <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.pollSP !== null && row.pollSP > 0 ? 'var(--green)' : 'var(--muted)', minWidth: 60 }}>
              {row.pollSP !== null ? (row.pollSP > 0 ? `+${row.pollSP}` : row.pollSP) : '—'}
            </span>
            <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: row.totalSP > 0 ? 'var(--primary)' : 'var(--muted)', minWidth: 60 }}>
              {row.totalSP > 0 ? `+${row.totalSP}` : row.totalSP || '—'}
            </span>
          </div>
        ))}
      </div>

      {/* Totals & averages */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        <div className="metric">
          <span>Avg Attendance</span>
          <strong style={{ color: avgAttPct !== null && avgAttPct >= 75 ? 'var(--green)' : 'var(--red)' }}>
            {avgAttPct !== null ? `${avgAttPct}%` : '—'}
          </strong>
        </div>
        <div className="metric">
          <span>Avg Poll Participation</span>
          <strong style={{ color: avgPollPct !== null && avgPollPct >= 75 ? 'var(--green)' : 'var(--red)' }}>
            {avgPollPct !== null ? `${avgPollPct}%` : '—'}
          </strong>
        </div>
        <div className="metric">
          <span>Total Attendance SP</span>
          <strong>{totalAttSP > 0 ? `+${totalAttSP}` : totalAttSP}</strong>
        </div>
        <div className="metric">
          <span>Total Poll SP</span>
          <strong>{totalPollSP > 0 ? `+${totalPollSP}` : totalPollSP}</strong>
        </div>
        <div className="metric">
          <span>Total SP (5 sessions)</span>
          <strong style={{ color: 'var(--primary)' }}>{grandTotalSP > 0 ? `+${grandTotalSP}` : grandTotalSP}</strong>
        </div>
      </div>
    </section>
  );
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

  // N14-FIX: depend on [auth] (the credential object) not [admin] (the data payload).
  useEffect(() => {
    if (!auth?.email) return;
    const doPing = (page) => fetch(`${API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: auth.email, name: auth.email, page })
    }).catch(() => { });
    doPing('admin-analytics');
    const id = setInterval(() => doPing('admin-live'), 30000);
    return () => clearInterval(id);
  }, [auth]);

  // N6-FIX: all admin fetches check res.ok and catch network errors to prevent silent hangs.
  const loadLeaderboard = async (limit = leaderLimit) => {
    try {
      const res = await fetch(`${API}/admin/leaderboard?limit=${limit}`, { headers });
      if (res.ok) setLeaderboard(await res.json());
    } catch (err) { console.error('loadLeaderboard:', err?.message); }
  };
  const loadAttendance = async () => {
    try {
      const res = await fetch(`${API}/admin/attendance`, { headers });
      if (res.ok) setAttendance(await res.json());
    } catch (err) { console.error('loadAttendance:', err?.message); }
  };
  const loadStudent = async (id) => {
    try {
      const res = await fetch(`${API}/admin/student/${id}`, { headers });
      if (res.ok) setStudentProfile(await res.json());
    } catch (err) { console.error('loadStudent:', err?.message); }
  };
  const loadActive = async () => {
    try {
      const res = await fetch(`${API}/admin/active`, { headers });
      if (res.ok) setActive(await res.json());
    } catch (err) { console.error('loadActive:', err?.message); }
  };
  const loadAnalytics = async () => {
    try {
      const res = await fetch(`${API}/admin/analytics`, { headers });
      if (res.ok) setAnalytics(await res.json());
    } catch (err) { console.error('loadAnalytics:', err?.message); }
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
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard', 'Leaderboard'], ['attendance', 'Attendance'], ['live', 'Live'], ['analytics', 'Analytics'], ['students', 'Students']]} />
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
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" aria-label="Close" onClick={() => setStudentProfile(null)}>×</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
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
          <tbody>{list.map(s => <tr key={s._id} onClick={() => onStudent(s._id)} style={{ cursor: 'pointer' }}><td>{s.name}</td><td>{s.email}</td><td>{s.totalSp}</td><td>{s.internshipStartDate ? new Date(s.internshipStartDate).toLocaleDateString() : '—'}</td></tr>)}</tbody>
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


createRoot(document.getElementById('root')).render(<App />);
