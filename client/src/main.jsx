import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

// /spurti/verify/SPRT-XXXX-XXXX is a public page — the QR on a shared card
// resolves here, and it must render for someone who has never logged in.
const VERIFY_CODE = (window.location.pathname.match(/\/verify\/([A-Za-z0-9-]+)\/?$/) || [])[1] || null;

function App() {
  if (VERIFY_CODE) return <VerifyView code={VERIFY_CODE.toUpperCase()} />;
  return <AppShell />;
}

function AppShell() {
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
  // Tier 4 — phase cards can ask to open the create-resource modal pre-filled
  // with their own context (e.g. phase='vibe'). Lifted to StudentView so any
  // future surface (poll cards, journey cards) can also trigger it without
  // re-implementing the modal logic.
  const [shareCtx, setShareCtx] = useState(null);
  // Tier 4 — phase card "open this resource" → switch to Resource Exchange
  // and open the detail sheet. State lifted to StudentView so a freshly
  // mounted ResourcesPanel can pick up an already-open resource.
  const [pendingOpenId, setPendingOpenId] = useState(null);
  const openResourceInExchange = (resourceId) => { setTab('resources'); setPendingOpenId(resourceId); };
  const { student } = profile;
  const goToCommitment = ph => { setCommitPhase(ph); setTab('vibe'); };
  // Fetched up here rather than inside the panel because the server decides who
  // gets the tab at all — until it answers `visible`, the tab strip omits it.
  const [ach, markAchievementsSeen] = useAchievements(student.email);
  const unseenAchievements = ach?.counts?.unseen || 0;
  // Opening the tab is what counts as seeing them, wherever it is opened from.
  const selectTab = key => { setTab(key); if (key === 'achievements') markAchievementsSeen(); };
  // Tier 8B — feature toggle. Read once at mount via the public
  // /api/resources/availability endpoint (no auth required). When admin
  // disables, the tab disappears immediately. Stale-page handling for an
  // already-open ResourcesPanel happens INSIDE that component (catches 403
  // response and calls onResourceExchangeDisabled to flip this state).
  const [featureEnabled, setFeatureEnabled] = useState(true);
  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/resources/availability?_=${Date.now()}`)
      .then(r => r.ok ? r.json() : { enabled: true })
      .then(j => { if (!cancelled && j && typeof j.enabled === 'boolean') setFeatureEnabled(j.enabled); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const onResourceExchangeDisabled = () => setFeatureEnabled(false);
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
      <Announcements student={student} />
      <StudentPulse
        profile={profile}
        newAchievements={unseenAchievements}
        canShareAchievements={!!ach?.sharing}
        onOpenAchievements={() => selectTab('achievements')}
      />
      <Tabs tab={tab} setTab={selectTab} tabs={[['bank','SP Bank'],
        ['journey','My Journey'],
        ...(student.eligibleForVibeGoals ? [['vibe','Commitments']] : []),
        ['spa','SPA Points'],
        // Tier 8B — Resource Exchange tab disappears when admin has
        // disabled the feature. If the student is currently on the tab
        // when disable happens, the ResourcesPanel below flips to a
        // friendly empty state via onResourceExchangeDisabled.
        ...(featureEnabled ? [['resources','Resource Exchange']] : []),
        ...(ach?.visible ? [['achievements','Achievements', unseenAchievements]] : []),
        ['leaderboard','Leaderboard'],
        ['faq','FAQ']]} />
      {tab === 'bank' && <div className="bank-stack">
        <RecoveryMissionWidget />
        <SpBank transactions={profile.transactions} />
      </div>}
      {tab === 'journey' && <MyJourney student={student} goToCommitment={goToCommitment} canCommit={student.eligibleForVibeGoals} openShareFor={setShareCtx} onOpenResourceInExchange={openResourceInExchange} featureEnabled={featureEnabled} />}
      {tab === 'vibe' && student.eligibleForVibeGoals && <Commitments student={student} initialPhase={commitPhase} />}
      {tab === 'spa' && <SpaModule student={student} />}
      {tab === 'achievements' && ach?.visible && <AchievementsPanel student={student} data={ach} />}
      {tab === 'leaderboard' && <LeaderboardPanel student={student} />}
      {tab === 'resources' && featureEnabled && <ResourcesPanel student={student} pendingOpenId={pendingOpenId} onConsumedPending={() => setPendingOpenId(null)} onResourceExchangeDisabled={onResourceExchangeDisabled} />}
      {tab === 'faq' && <FaqTab />}
      {shareCtx && <CreateResourceSheet email={student.email} onClose={() => setShareCtx(null)} onCreated={() => setShareCtx(null)} initialContext={shareCtx} />}
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

// ---- Achievements -----------------------------------------------------------
// One tile per board (plus milestones); opening a tile reveals every instance,
// since a weekly win carries its week and is separately shareable. Locked
// milestones show what's left to go so the tab is a goal list, not just a shelf.
// `visible` and `canShare` come from the server's env switches — the client never
// decides either, so pulling the feature back is a .env edit and a restart.
function useAchievements(email) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    fetch(`${API}/achievements?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setData({ visible: false, groups: [], locked: [], counts: {} }); });
    return () => { live = false; };
  }, [email]);
  // Clearing the badge is optimistic: the student HAS looked, so it should go
  // the moment they click rather than after a round trip. If the POST fails the
  // count simply comes back on the next load — nothing is lost either way.
  const markSeen = () => {
    setData(d => (d?.counts?.unseen ? { ...d, counts: { ...d.counts, unseen: 0 } } : d));
    fetch(`${API}/achievements/seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    }).catch(() => {});
  };
  return [data, markSeen];
}

function AchievementsPanel({ student, data }) {
  const [openKey, setOpenKey] = useState(null);
  const [sharing, setSharing] = useState(null);

  if (!data) return <section className="panel">Loading your achievements…</section>;

  const me = { name: student.name, totalSp: student.totalSp, level: student.level, ...(data.student || {}), email: student.email };
  const canShare = !!data.sharing;
  const groups = data.groups || [];
  const locked = data.locked || [];

  return (
    <div className="ach">
      <section className="panel ach-head">
        <div className="ach-counts">
          <div><strong>{data.counts?.earned || 0}</strong><span>earned</span></div>
          <div><strong>{data.counts?.thisWeek || 0}</strong><span>this week</span></div>
          <div><strong>{data.counts?.boards || 0}</strong><span>boards placed on</span></div>
        </div>
        <p className="muted">
          Placing 1st, 2nd or 3rd on any leaderboard earns a permanent card — a new one each week you take it.
          Open a tile to see every time you placed{canShare ? ', and share any of them' : ''}.
        </p>
        {/* Said plainly because the look of these cards HAS already changed once
            and will again. What is permanent is the achievement and its verify
            code, not the artwork — worth stating before someone assumes the
            picture they downloaded is the record. */}
        <p className="muted ach-note">
          The look of the cards may change from time to time as we improve the design. Your achievements
          and their verify links stay exactly as they are — only the artwork is refreshed.
        </p>
      </section>

      {groups.length === 0 && locked.length === 0 && (
        <section className="panel empty"><p className="muted">No achievements yet. Place on any leaderboard, or hit a milestone, and your first card lands here.</p></section>
      )}

      <div className="ach-grid">
        {groups.map(g => (
          <AchievementTile
            key={g.key} group={g} me={me} canShare={canShare}
            open={openKey === g.key}
            onToggle={() => setOpenKey(openKey === g.key ? null : g.key)}
            onShare={setSharing}
          />
        ))}
        {locked.map(l => (
          <div className="ach-tile locked" key={l.key}>
            <div className="ach-medal">{l.icon}</div>
            <div className="ach-body">
              <h4>{l.title}</h4>
              <span className="ach-when">Locked · {l.remaining}</span>
            </div>
          </div>
        ))}
      </div>

      {sharing && <ShareModal item={sharing} me={me} onClose={() => setSharing(null)} />}
    </div>
  );
}

const PLACE_WORD = { 1: '1st', 2: '2nd', 3: '3rd' };

function AchievementTile({ group, me, open, onToggle, onShare, canShare }) {
  const latest = group.items[0];
  const isRank = group.kind === 'rank';
  return (
    <div className={`ach-tile${open ? ' open' : ''}`}>
      <button className="ach-face" onClick={onToggle} aria-expanded={open}>
        <div className="ach-medal">{group.icon}</div>
        <div className="ach-body">
          <h4>{group.title}</h4>
          <span className="ach-when">
            {isRank
              ? `Best: ${PLACE_WORD[group.bestPlace] || '—'} · ${group.items.length} time${group.items.length === 1 ? '' : 's'}`
              : latest.period}
          </span>
        </div>
        <span className="ach-caret">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="ach-items">
          {group.items.map(item => (
            <li key={item.achId}>
              <span className="ach-item-medal">{item.icon}</span>
              <span className="ach-item-text">
                <b>{item.period}</b>
                {item.detail ? <em>{item.detail}</em> : null}
              </span>
              {canShare && <button className="ach-share" onClick={() => onShare(item)}>Share</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Renders the actual PNG the student posts, and hands them the two ways out:
// LinkedIn, or just the file. Each one is logged. WhatsApp was dropped — the
// point of these cards is a public, checkable post, and a forward to a chat
// thread is neither.
// navigator.clipboard is secure-context only (https or localhost), so on any
// plain-http origin it is simply absent and a copy would fail silently. The
// textarea trick still works everywhere.
async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function ShareModal({ item, me, onClose }) {
  const [png, setPng] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const verifyUrl = `${window.location.origin}${APP_BASE}/verify/${item.verifyId}`;
  const [caption, setCaption] = useState('');
  // Posting a card is a four-step job on LinkedIn and every step is easy to skip
  // — most of all uploading the image, without which the post is a bare link.
  // The tick is not paperwork: it is there to make the steps get read once.
  const [readSteps, setReadSteps] = useState(false);

  useEffect(() => {
    import('./shareCard.js').then(m => {
      const text = m.shareCaption(item, verifyUrl);
      setCaption(text);
      setGenerated(text);
    });
  }, [item.achId]);

  useEffect(() => {
    let live = true;
    import('./shareCard.js')
      .then(m => m.renderCard(item, me, verifyUrl))
      .then(url => {
        if (!live) return;
        setPng(url);
        // Hand the card to the server once, so the verify link carries it as a
        // preview image. Best-effort: a failure here only costs the preview.
        fetch(`${API}/share/card`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: me.email, achId: item.achId, dataUrl: url })
        }).catch(() => {});
      })
      .catch(() => { if (live) setError('Could not draw the card. Try again.'); });
    return () => { live = false; };
  }, [item.achId]);

  // `generated` is the caption as we wrote it; comparing against what's in the
  // box at share time is the only way to know whether students take our framing
  // or write their own.
  const [generated, setGenerated] = useState('');
  const track = (platform) => fetch(`${API}/share/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: me.email, achId: item.achId, platform,
      captionEdited: !!generated && caption !== generated,
      captionChars: caption.length
    })
  }).catch(() => {});

  // Two ways to get the picture into the post without the student handling a file:
  //  1. the share sheet, which takes the image itself — phones, and the better path
  //  2. failing that, post the verify link and let the platform expand it into a
  //     preview of the card (that's what the og:image on /verify/:code is for)
  // Downloading is a fallback, not the route.
  const share = async () => {
    const { dataUrlToFile } = await import('./shareCard.js');
    const file = png ? dataUrlToFile(png, `spurti-${item.achId.replace(/[:]/g, '-')}.png`) : null;

    // Only phones get the share sheet. Desktop Chrome/Safari also advertise
    // navigator.share, but there it opens the OS app picker (Mail, AirDrop…),
    // which is not what someone pressing "Share on LinkedIn" is asking for.
    const onPhone = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (onPhone && file && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption, title: item.title });
        track('native');
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;   // they backed out; not a failure
      }
    }

    track('linkedin');
    // LinkedIn cannot be handed post text by URL — it opens an empty composer
    // whatever you pass. Copying first is what makes the paste possible.
    const ok = await copyText(caption);
    setCopied(ok);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(verifyUrl)}`, '_blank', 'noopener');
  };

  const justDownload = async () => {
    const { downloadDataUrl } = await import('./shareCard.js');
    track('download');
    if (png) downloadDataUrl(png, `spurti-${item.achId.replace(/[:]/g, '-')}.png`);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <section className="modal share-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Share your card</h2>
          <button className="icon" onClick={onClose}>x</button>
        </div>
        {error && <p className="muted">{error}</p>}
        {!png && !error && <p className="muted">Drawing your card…</p>}
        {png && <img className="share-preview" src={png} alt={`${item.title} — ${item.period}`} />}
        <div className="caption-box">
          <div className="caption-head">
            <b>Your caption</b>
            <button className="mini-copy" onClick={async () => { track('copy'); setCopied(await copyText(caption)); }}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
          <textarea value={caption} onChange={e => { setCaption(e.target.value); setCopied(false); }} rows={12} />
          <p>LinkedIn always opens an empty box — paste this in with <b>Ctrl+V</b> (<b>Cmd+V</b> on Mac). Edit it first if you like.</p>
        </div>

        <div className="post-howto">
          <b>How to post this — read before you click</b>
          <ol>
            <li><b>Download the card first.</b> LinkedIn will not pick the picture up on its own; you attach it yourself in a moment.</li>
            <li>Click <b>Share on LinkedIn</b>. Your caption is copied for you and the composer opens with your verify link already attached.</li>
            <li><b>Add the card image to the post</b> — the photo button in the composer, then the file you just downloaded. Skip this and your post is only a link.</li>
            <li><b>Paste the caption</b> (Ctrl+V / Cmd+V).</li>
            <li><b>Tag us, in this order</b> — the lab first, then Sudarshan sir, then Sakshi. Type
            <b>@Vicharanashala</b> and pick the lab page, then <b>@Sudarshan Iyengar</b>, then <b>@Sakshi</b>.
            Picking each one from the dropdown is what makes it a real tag — typed text alone doesn't reach
            anyone. Tag any other mentors from the lab you worked with as well.
            <span className="tag-links">
              <a href="https://www.linkedin.com/company/vicharanashala/" target="_blank" rel="noopener">The lab page →</a>
              <a href="https://www.linkedin.com/in/sudarshan-iyengar-3560b8145/" target="_blank" rel="noopener">Sudarshan sir's profile →</a>
              <a href="https://www.linkedin.com/in/sakshivk/" target="_blank" rel="noopener">Sakshi's profile →</a>
            </span></li>
          </ol>
          <label className="ack">
            <input type="checkbox" checked={readSteps} onChange={e => setReadSteps(e.target.checked)} />
            <span>I've read the steps — in particular that I add the image myself.</span>
          </label>
        </div>

        <div className="share-actions">
          <button className="secondary" disabled={!png} onClick={justDownload}>Download card</button>
          <button className="primary" disabled={!png || !readSteps} onClick={share}>Share on LinkedIn</button>
        </div>

        <p className="muted share-note">
          On a phone, Share hands the picture straight to LinkedIn and you can skip step 3 — but samagama.in isn't
          built for small screens, so this is probably a job for a computer. Either way the verify link travels with
          the post: anyone who clicks it lands on proof the achievement is real.
        </p>
      </section>
    </div>
  );
}

// Public credential check behind the QR — no login, and deliberately nothing
// beyond the name, what was won, and when.
function VerifyView({ code }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    fetch(`${API}/verify/${encodeURIComponent(code)}`)
      .then(r => r.ok ? r.json() : { valid: false })
      .then(d => setState({ loading: false, ...d }))
      .catch(() => setState({ loading: false, valid: false }));
  }, [code]);

  return (
    <main className="page verify-page">
      <section className="panel verify-card">
        {state.loading ? <p className="muted">Checking…</p> : state.valid ? (
          <>
            <span className="verify-ok">✓ Verified achievement</span>
            <div className="verify-medal">{state.icon}</div>
            <h1>{state.title}</h1>
            <p className="verify-period">{state.period}</p>
            <p className="verify-awarded">Awarded to</p>
            <p className="verify-name">{state.name}</p>
            <p className="muted">{state.programme}</p>
            <p className="muted">Awarded {new Date(state.earnedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <p className="verify-code">{state.verifyId}</p>
          </>
        ) : (
          <>
            <span className="verify-bad">Not found</span>
            <h1>We can't verify this card</h1>
            <p className="muted">No achievement matches the code <b>{code}</b>. A genuine Spurti card carries a code issued by the system — if this one doesn't resolve, it wasn't issued here.</p>
          </>
        )}
      </section>
    </main>
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

// Programme announcements with read-tracking. Unread notices render as a
// highlighted card with a "Got it" button — that ack is the read signal the
// team tracks. Read ones fold away behind a toggle so the page stays clean,
// and the whole section disappears when there are no notices at all.
function Announcements({ student }) {
  const [data, setData] = useState(null);
  const [showRead, setShowRead] = useState(false);
  const load = async () => {
    try {
      const r = await fetch(`${API}/announcements?email=${encodeURIComponent(student.email)}`);
      if (r.ok) setData(await r.json());
    } catch { /* a failed notice fetch must never break the dashboard */ }
  };
  useEffect(() => { load(); }, [student.email]);
  if (!data || !data.announcements?.length) return null;

  const unread = data.announcements.filter(a => !a.acked);
  const read = data.announcements.filter(a => a.acked);
  const ack = async id => {
    await fetch(`${API}/announcements/${id}/ack`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student.email })
    });
    load();
  };
  const fmt = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <section className="panel announcements">
      <div className="ann-head">
        <h2>📣 Announcements{unread.length > 0 && <em className="ann-badge">{unread.length} new</em>}</h2>
        {read.length > 0 && (
          <button className="ann-toggle" onClick={() => setShowRead(s => !s)}>
            {showRead ? 'Hide read' : `Read earlier (${read.length})`}
          </button>
        )}
      </div>
      {unread.map(a => (
        <article key={a.id} className="ann-item ann-new">
          <header><strong>{a.title}</strong><time>{fmt(a.postedAt)}</time></header>
          <p>{a.body}</p>
          <button className="primary ann-ack" onClick={() => ack(a.id)}>Got it ✓</button>
        </article>
      ))}
      {unread.length === 0 && <p className="muted ann-caughtup">You’re all caught up.</p>}
      {showRead && read.map(a => (
        <article key={a.id} className="ann-item ann-done">
          <header><strong>{a.title}</strong><time>{fmt(a.postedAt)} · read ✓</time></header>
          <p>{a.body}</p>
        </article>
      ))}
    </section>
  );
}

function StudentPulse({ profile, newAchievements = 0, canShareAchievements = false, onOpenAchievements }) {
  const { student, cohort, transactions } = profile;
  const [showTraj, setShowTraj] = useState(false);
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));
  const many = newAchievements > 1;
  return (
    <>
      {/* Milestones are settled on read, so a card can come into existence during
          the very page load the student is looking at. Nothing else on the page
          would tell them: the tab strip sits lower and reads identically whether
          or not something new is waiting. */}
      {newAchievements > 0 && onOpenAchievements && (
        <button className="ach-nudge" onClick={onOpenAchievements}>
          <span className="ach-nudge-icon" aria-hidden="true">🎖️</span>
          <span className="ach-nudge-text">
            <strong>{newAchievements} new achievement{many ? 's' : ''}</strong>
            <em>{canShareAchievements
              ? `See ${many ? 'them' : 'it'} and share ${many ? 'them' : 'it'}`
              : `See ${many ? 'them' : 'it'} in your Achievements tab`}</em>
          </span>
          <span className="ach-nudge-go" aria-hidden="true">→</span>
        </button>
      )}
      <section className="pulse-grid">
        <div className="pulse-card progress-card">
          <span>Standing</span>
          <strong>Rank {student.rank}</strong>
          <p>{cohort.pointsToTop50 === 0 ? 'You are in the Top 50.' : `${cohort.pointsToTop50} SP to enter Top 50.`}</p>
          <div className="compare-list">
            <b>Cohort avg: {cohort.averageSp}</b>
            <b>Top 50: {cohort.top50Cutoff ?? '—'}</b>
            <b>Top 10: {cohort.top10Cutoff ?? '—'}</b>
          </div>
        </div>
        <button className="pulse-card pulse-clickable" onClick={() => setShowTraj(true)} title="Open full trajectory">
          <span>SP trend <em className="expand-hint">expand ↗</em></span>
          <Sparkline points={trend} />
        </button>
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

// A tab entry is [key, label] or [key, label, badge]; the badge is only drawn
// when it is a positive number, so existing callers are untouched.
function Tabs({ tab, setTab, tabs }) {
  return <nav className="tabs">{tabs.map(([key, label, badge]) => (
    <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
      {label}
      {badge > 0 && <span className="tab-badge" aria-label={`${badge} new`}>{badge}</span>}
    </button>
  ))}</nav>;
}

// ---- Tier 3 — Recovery Mission Widget ---------------------------------------
//
// The centerpiece of the recovery-missions feature. Designed against the
// mentor's previous criticism: "admin creates something, student doesn't
// reliably see it." Every piece of state shown here comes from the
// /api/missions/me endpoint on each mount. The widget carries NO local
// state across remounts, so a browser refresh trivially proves the
// closed-loop persistence — the test in test/missions-routes.test.js
// does exactly that.
//
// ponytail: deliberately NOT extracted into its own file. main.jsx is
// the project's single-file React tree (no router, no modules). Keeping
// the widget inline matches the existing convention; if the SPA ever
// moves to file-per-component, this can move with everything else.
function RecoveryMissionWidget() {
  const [state, setState] = useState({ loading: true });
  const [busy, setBusy] = useState(false);

  // Always refetch on mount. No cached state. This is the persistence test.
  useEffect(() => { load(); }, []);

  async function load() {
    setState({ loading: true });
    try {
      const res = await fetch(`${API}/missions/me`, { credentials: 'include' });
      if (!res.ok) {
        // 401/403/404 → widget stays hidden. Same pattern as ResourcesPanel's
        // 403 feature_disabled handler: clean disappearance, no scary error.
        return setState({ loading: false, hidden: true });
      }
      const data = await res.json();
      if (!data.enabled) return setState({ loading: false, hidden: true });
      if (!data.assignment) return setState({ loading: false, assignment: null });
      setState({ loading: false, assignment: data.assignment });
    } catch (err) {
      setState({ loading: false, hidden: true });
    }
  }

  async function send(event) {
    setBusy(true);
    try {
      const res = await fetch(`${API}/missions/me`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event })
      });
      if (!res.ok) {
        // Bubble the error up as a soft message — never raw JSON.
        const body = await res.json().catch(() => ({}));
        setState(s => ({ ...s, error: body.error || `Could not ${event} mission` }));
      } else {
        const data = await res.json();
        setState({ loading: false, assignment: data.assignment });
      }
    } finally {
      setBusy(false);
    }
  }

  if (state.loading) return null;     // widget doesn't appear during initial load
  if (state.hidden) return null;
  if (!state.assignment) return null; // no mission this week

  const { assignment } = state;
  const status = assignment.status;
  const dueLabel = formatDueLabel(assignment.expiresAt);

  // Supportive copy — never "you are falling behind", never "low performer".
  // Detection score, trigger reason, and cohort rank are admin-only — never
  // shown to the student. The widget is intentionally unaware of why the
  // mission exists.
  let body;
  let cta;
  if (status === 'assigned') {
    body = (
      <>
        <p className="rmw-blurb">
          You're a little behind your usual participation. Complete this small activity to get back on track.
        </p>
        <h3 className="rmw-title">{assignment.mission.title}</h3>
        <p className="rmw-meta">
          2 of 3 questions required · +{assignment.mission.rewardSp} SP
        </p>
        <p className="rmw-due">Due {dueLabel}</p>
      </>
    );
    cta = <button disabled={busy} onClick={() => send('start')}>Start Mission</button>;
  } else if (status === 'in_progress') {
    body = (
      <>
        <p className="rmw-blurb">
          You're a little behind your usual participation. Complete this small activity to get back on track.
        </p>
        <h3 className="rmw-title">{assignment.mission.title}</h3>
        <p className="rmw-meta">
          2 of 3 questions required · +{assignment.mission.rewardSp} SP
        </p>
        <p className="rmw-due">Due {dueLabel}</p>
      </>
    );
    cta = <button disabled={busy} onClick={() => send('complete')}>Continue</button>;
  } else if (status === 'completed') {
    body = (
      <>
        <h3 className="rmw-title">Mission complete</h3>
        <p className="rmw-meta rmw-meta--done">
          +{assignment.mission.rewardSp} SP earned
        </p>
      </>
    );
    cta = null;
  } else if (status === 'expired') {
    body = (
      <>
        <h3 className="rmw-title">Mission expired</h3>
        <p className="rmw-blurb">Try again next week.</p>
      </>
    );
    cta = null;
  }

  return (
    <section className="panel rmw">
      <div className="panel-head">
        <h2>
          <span className="rmw-eyebrow">🎯 Your Recovery Mission</span>
        </h2>
      </div>
      <div className="rmw-body">
        {body}
        {state.error && <p className="rmw-error">{state.error}</p>}
      </div>
      {cta && <div className="rmw-cta">{cta}</div>}
    </section>
  );
}

// Render a due-label from the ISO expiresAt — e.g. "Friday" or "Friday 5pm".
function formatDueLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'today';
  return d.toLocaleDateString('en-US', { weekday: 'long' });
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

function MyJourney({ student, goToCommitment, canCommit = false, openShareFor, onOpenResourceInExchange, featureEnabled = true }) {
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
          {featureEnabled && <ResourcesForContext student={student} contextType="phase" contextRef="standup" label="Standup resources" openShareFor={openShareFor} onOpenResourceInExchange={onOpenResourceInExchange} />}
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
          {featureEnabled && <ResourcesForContext student={student} contextType="phase" contextRef="vibe" label="ViBe resources" openShareFor={openShareFor} onOpenResourceInExchange={onOpenResourceInExchange} />}
        </section>

        {/* SPA — goal (date) works now; progress data + commitment coming soon */}
        <section className="jr-card phase-spa">
          <div className="jr-head"><span className="jr-n">3</span><h3>SPA — Matrix Mystics</h3><span className="jr-soon">Data soon</span></div>
          <p className="jr-sub">53-problem set · progress data coming soon</p>
          <PhaseGoal phaseKey="spa" field="spaBy" goal={goals.spa} targetText="solve all 53 problems" {...gp} />
          {featureEnabled && <ResourcesForContext student={student} contextType="phase" contextRef="spa" label="SPA resources" openShareFor={openShareFor} onOpenResourceInExchange={onOpenResourceInExchange} />}
        </section>

        {/* Projects — goal (date) works now; progress data coming soon */}
        <section className="jr-card phase-project">
          <div className="jr-head"><span className="jr-n">4</span><h3>Projects</h3><span className="jr-soon">Data soon</span></div>
          <p className="jr-sub">Pull requests · progress data coming soon</p>
          <PhaseGoal phaseKey="project" field="projectBy" goal={goals.project} targetText="raise your first PR" {...gp} />
          {featureEnabled && <ResourcesForContext student={student} contextType="phase" contextRef="project" label="Project resources" openShareFor={openShareFor} onOpenResourceInExchange={onOpenResourceInExchange} />}
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
    // Both tabs read /admin/analytics — the sharing block rides along with it.
    if ((tab === 'analytics' || tab === 'achievements') && !analytics) loadAnalytics();
  }, [tab]);

  return (
    <main className="page compact">
      <header className="topbar">
        <button className="secondary" onClick={onBack}>Back</button>
        <div><p className="eyebrow">Admin Dashboard</p><h1>Spurti Control Room</h1></div>
        <div className="score-card"><span>Yet to onboard</span><strong>{stats?.yetToOnboard ?? admin.yetToOnboard ?? 0}</strong><span className="divider">|</span><span>Active</span><strong>{stats?.activeStudents ?? admin.activeStudents ?? admin.students ?? 0}</strong><span className="divider">|</span><span>Excused</span><strong>{stats?.excusedStudents ?? admin.excusedStudents ?? 0}</strong><em>{stats?.transactions ?? admin.transactions ?? 0} txns</em></div>
      </header>
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['achievements','Achievements'], ['resources','Resources'], ['students','Students']]} />
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
      {tab === 'achievements' && <AdminAchievements data={analytics?.sharing} reigns={analytics?.reigns} />}
      {tab === 'analytics' && <PipelineHealth data={analytics?.pipeline} />}
      {tab === 'students' && <AllStudentsPanel stats={stats} onStudent={loadStudent} auth={auth} />}
      {tab === 'resources' && <ResourceControlCenter headers={headers} />}
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" onClick={() => setStudentProfile(null)}>x</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
    </main>
  );
}

// ---- Resource Control Center — Tier 7 Admin SPA ----------------------------
// Three sub-views: Resources list, Reports queue, Audit Log. Each action
// from this component goes through the audited admin routes we wired in
// tier 6 — no direct database touch. Closing the lifecycle:
//   student create → admin sees in Resources → admin hides → student can no
//   longer see it → admin sees the action in Audit Log.
const RCC_FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'active',    label: 'Active' },
  { key: 'reported',  label: 'Reported' },
  { key: 'hidden',    label: 'Hidden' },
  { key: 'deleted',   label: 'Deleted' },
  { key: 'effective', label: 'Effective' },
  { key: 'official',  label: 'Official' }
];

function ResourceControlCenter({ headers }) {
  const [sub, setSub] = useState('resources');
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);

  // ── Resources sub-view ───────────────────────────────────────────────────
  const loadResources = async () => {
    setErr(null);
    try {
      const inclDeleted = filter === 'deleted' ? '&deleted=1' : '';
      const r = await fetch(`${API}/admin/resources?_=${Date.now()}${inclDeleted}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      setRows((await r.json()).rows);
    } catch (e) { setErr(e.message || 'Network error'); }
  };
  useEffect(() => { if (sub === 'resources') loadResources(); }, [sub, filter]);

  const filteredRows = (rows || []).filter(r => {
    if (!search) return true;
    const hay = [r.title, r.description, r.tags?.join(' '), r.cohort, r.createdBy?.email, r.createdBy?.name]
      .filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(search.toLowerCase())) return false;
    // Filter by status / source / reports — coarse client-side; the server
    // filter chips are an MVP and the route has no per-filter query params yet.
    if (filter === 'active' && r.deletedAt) return false;
    if (filter === 'deleted' && !r.deletedAt) return false;
    if (filter === 'hidden' && !r.deletedAt) return false;
    if (filter === 'effective' && r.status !== 'effective') return false;
    if (filter === 'official' && r.source !== 'admin') return false;
    return true;
  });

  return (
    <section className="rcc">
      <div className="rcc-subtabs">
        <button className={sub === 'resources' ? 'on' : ''} onClick={() => setSub('resources')}>Resources</button>
        <button className={sub === 'reports'  ? 'on' : ''} onClick={() => setSub('reports')}>Reports</button>
        <button className={sub === 'recovery' ? 'on' : ''} onClick={() => setSub('recovery')}>Recovery</button>
        <button className={sub === 'audit'    ? 'on' : ''} onClick={() => setSub('audit')}>Audit Log</button>
      </div>
      <ResourceExchangeToggle headers={headers} />
      {sub === 'resources' && (
        <>
          <div className="rcc-toolbar">
            <input
              className="rcc-search"
              type="search"
              placeholder="Search title, topic, owner…"
              value={search} onChange={e => setSearch(e.target.value)}
            />
            <div className="rcc-filters">
              {RCC_FILTERS.map(f => (
                <button key={f.key}
                  className={f.key === filter ? 'rcc-chip on' : 'rcc-chip'}
                  onClick={() => setFilter(f.key)}>{f.label}</button>
              ))}
            </div>
          </div>
          {err && <p className="error">{err}</p>}
          {!rows && <p className="muted">Loading…</p>}
          {rows && filteredRows.length === 0 && <p className="muted">No resources match these filters.</p>}
          {rows && filteredRows.length > 0 && (
            <div className="rcc-list">
              {filteredRows.map(r => (
                <div key={r._id} className="rcc-row">
                  <div className="rcc-row-head">
                    <h3>{r.title}</h3>
                    {r.source === 'admin' && <span className="rcc-badge official" title="Admin-created">Official</span>}
                    {r.deletedAt && <span className="rcc-badge deleted">Deleted</span>}
                    {r.status === 'effective' && <span className="rcc-badge effective">Effective</span>}
                  </div>
                  <p className="rcc-meta">
                    {r.contextType} · {r.contextRef} · {r.cohort}
                  </p>
                  <p className="rcc-owner">By {r.createdBy?.name || r.createdBy?.email}</p>
                  <p className="rcc-impact">
                    {r.saveCount} saves · {r.ratingCount > 0 ? `${(r.ratingSum / r.ratingCount).toFixed(1)} ★ · ${r.ratingCount} ratings` : 'no ratings'}
                  </p>
                  <button className="secondary" onClick={() => setOpenId(r._id)}>View</button>
                </div>
              ))}
            </div>
          )}
          {openId && (
            <ResourceAdminDetail
              resourceId={openId}
              headers={headers}
              onClose={() => setOpenId(null)}
              onChanged={() => { setOpenId(null); loadResources(); }}
            />
          )}
        </>
      )}
      {sub === 'reports' && <ReportsSubView headers={headers} />}
      {sub === 'recovery' && <RecoveryMonitorView headers={headers} />}
      {sub === 'audit'   && <AuditSubView headers={headers} />}
    </section>
  );
}

// ---- Tier 8B — Feature Control toggle card (admin side) --------------------
// Single card at the top of the admin Resources sub-tab. Shows the current
// state and provides Disable / Enable with a small confirmation modal.
// The 1-minute server-side cache means a toggle is NOT instantaneous for
// already-connected students; that caveat is surfaced inline.
// ---- Tier 5 — Recovery Monitor (admin side) ---------------------------------
//
// Centerpiece of the admin side of Recovery Missions. Answers the
// mentor's original criticism: admin creates something, admin can see
// every step of the student-facing lifecycle.
//
// Design rules:
//   - show stats + table + row-level detail (no admin-only actions
//     beyond enable/disable on templates)
//   - human-readable trigger reasons, not raw scoring formulas
//   - monochrome per design directive
//   - support what the SPURTHI scheduler detected (the assignment),
//     don't second-guess it
function RecoveryMonitorView({ headers }) {
  const [stats, setStats] = useState(null);
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [audit, setAudit] = useState([]);
  const [templates, setTemplates] = useState([]);

  async function load() {
    setErr(null);
    try {
      const [s, l, t] = await Promise.all([
        fetch(`${API}/admin/missions/stats`, { headers }).then(r => r.json()),
        fetch(`${API}/admin/missions`,      { headers }).then(r => r.json()),
        fetch(`${API}/admin/missions/templates`, { headers }).then(r => r.json())
      ]);
      setStats(s);
      setRows((l && l.rows) || []);
      setTemplates((t && t.templates) || []);
    } catch (e) { setErr(e.message || 'Network error'); }
  }
  useEffect(() => { load(); }, []);

  async function openRow(id) {
    setOpenId(id);
    setDetail(null);
    setAudit([]);
    try {
      const [d, a] = await Promise.all([
        fetch(`${API}/admin/missions/${id}`, { headers }).then(r => r.json()),
        fetch(`${API}/admin/missions/${id}/audit`, { headers }).then(r => r.json())
      ]);
      setDetail(d);
      setAudit((a && a.events) || []);
    } catch (e) { setErr(e.message || 'Network error'); }
  }

  async function toggleTemplate(id, enabled) {
    try {
      const r = await fetch(`${API}/admin/missions/templates/${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      if (!r.ok) throw new Error(await r.text());
      await load();
    } catch (e) { setErr(e.message || 'Network error'); }
  }

  if (err) return <p className="rcc-err">{err}</p>;
  if (!stats) return <p className="rcc-muted">Loading…</p>;

  return (
    <div className="rmon">
      {/* Stats card — the 5 numbers at the top */}
      <div className="rmon-stats">
        <div className="rmon-stat"><span className="rmon-stat-n">{stats.candidates}</span><span className="rmon-stat-l">Candidates</span></div>
        <div className="rmon-stat"><span className="rmon-stat-n">{stats.assigned}</span><span className="rmon-stat-l">Assigned</span></div>
        <div className="rmon-stat"><span className="rmon-stat-n">{stats.completed}</span><span className="rmon-stat-l">Completed</span></div>
        <div className="rmon-stat"><span className="rmon-stat-n">{stats.expired}</span><span className="rmon-stat-l">Expired</span></div>
        <div className="rmon-stat"><span className="rmon-stat-n">+{stats.spAwarded}</span><span className="rmon-stat-l">SP awarded</span></div>
      </div>

      <p className="rmon-week">This week · {stats.weekStart.slice(0, 10)}</p>

      {/* Assignments table */}
      <div className="rmon-table">
        <div className="rmon-row rmon-row-h">
          <span>Student</span><span>Trigger</span><span>Mission</span><span>Status</span><span>SP</span>
        </div>
        {rows.length === 0 && <p className="rmon-empty">No assignments this week.</p>}
        {rows.map(r => (
          <div key={r.assignmentId} className="rmon-row" onClick={() => openRow(r.assignmentId)}>
            <span className="rmon-student">
              <strong>{r.student.name}</strong>
              <em>{r.student.cohort}</em>
            </span>
            <span className="rmon-trigger">{explainTrigger(r)}</span>
            <span>{r.mission.title}</span>
            <span className={`rmon-status rmon-status-${r.status}`}>{r.status.replace('_', ' ')}</span>
            <span>{r.rewardApplied == null ? '—' : `+${r.rewardApplied}`}</span>
          </div>
        ))}
      </div>

      {/* Detail sheet */}
      {openId && detail && (
        <div className="overlay" onClick={() => setOpenId(null)}>
          <section className="modal wide" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h2>{detail.student.name} · {detail.student.cohort}</h2>
              <button className="icon" onClick={() => setOpenId(null)}>×</button>
            </div>
            <div className="rmon-detail">
              <div className="rmon-detail-section">
                <h3>Why assigned</h3>
                <p>{explainTriggerDetail(detail)}</p>
              </div>
              <div className="rmon-detail-section">
                <h3>Mission</h3>
                <p><strong>{detail.mission.title}</strong></p>
                <p className="rmon-muted">{detail.mission.description}</p>
              </div>
              <div className="rmon-detail-section">
                <h3>Status</h3>
                <p>{detail.status}</p>
                <p className="rmon-muted">
                  Assigned: {new Date(detail.createdAt).toLocaleString()}<br/>
                  Expires: {new Date(detail.expiresAt).toLocaleString()}<br/>
                  {detail.completedAt && <>Completed: {new Date(detail.completedAt).toLocaleString()}</>}
                </p>
              </div>
              <div className="rmon-detail-section">
                <h3>Result</h3>
                <p>{detail.rewardApplied == null ? '—' : `+${detail.rewardApplied} SP`}</p>
                <p className="rmon-muted">Current student SP: {detail.student.currentTotalSp}</p>
              </div>
              <div className="rmon-detail-section">
                <h3>Audit</h3>
                {audit.map(e => (
                  <div key={e.id} className="rmon-audit-row">
                    <span className="rmon-audit-kind">{e.kind}</span>
                    <span className="rmon-muted">{e.actorType}{e.actorEmail ? ` · ${e.actorEmail}` : ''}</span>
                    <span className="rmon-muted">{new Date(e.at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Templates enable/disable */}
      <h3 className="rmon-h3">Templates</h3>
      {templates.length === 0 && <p className="rmon-muted">No templates yet.</p>}
      <div className="rmon-templates">
        {templates.map(t => (
          <div key={t.id} className="rmon-template">
            <div>
              <strong>{t.title}</strong>
              <em>{t.activityType} · +{t.rewardSp} SP · {t.thisWeekAssignments} this week</em>
            </div>
            <label className="rmon-toggle">
              <input
                type="checkbox"
                checked={t.enabled}
                onChange={e => toggleTemplate(t.id, e.target.checked)}
              />
              <span>{t.enabled ? 'Enabled' : 'Disabled'}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// Render the human-readable trigger reason from a row. Avoids the
// raw scoring formula — admin sees "why", not "how".
function explainTrigger(row) {
  if (!row.triggerReason) return '—';
  if (row.spDelta7d < 0) return 'Engagement drop';
  return 'Recent participation dip';
}

function explainTriggerDetail(detail) {
  const delta = Number(detail.spDelta7d || 0);
  const baseline = Number(detail.spAtDetection || 0);
  if (baseline <= 0) return 'Recent participation dip';
  const recent = baseline + delta; // baseline is the absolute total at detection
  const pct = baseline > 0 ? Math.max(0, Math.round((baseline - recent) / baseline * 100)) : 0;
  if (pct >= 30) return `Engagement dropped ${pct}% from personal baseline`;
  if (pct >= 10) return `Engagement dipped ${pct}% from personal baseline`;
  return 'Recent participation dip';
}

function ResourceExchangeToggle({ headers }) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [confirm, setConfirm] = useState(null); // { nextEnabled, reason }

  const load = async () => {
    setErr(null);
    try {
      const r = await fetch(`${API}/admin/resources/config`, { headers });
      if (!r.ok) throw new Error(await r.text());
      setCfg(await r.json());
    } catch (e) { setErr(e.message || 'Network error'); }
  };
  useEffect(() => { load(); }, []);

  const apply = async (enabled, reason) => {
    setErr(null); setMsg(null);
    const r = await fetch(`${API}/admin/resources/config`, {
      method: 'PATCH', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ enabled, reason })
    });
    if (!r.ok) { setErr(`HTTP ${r.status}: ${await r.text()}`); return; }
    setMsg(enabled ? 'Re-enabled.' : 'Disabled.');
    await load();
  };

  if (err && !cfg) return <div className="rcc-feature"><p className="error">{err}</p></div>;
  if (!cfg) return <div className="rcc-feature"><p className="muted">Loading feature state…</p></div>;

  const enabled = !!cfg.enabled;
  return (
    <div className="rcc-feature">
      <div className="rcc-feature-head">
        <div className="rcc-feature-title">
          {/* Tier 9: this toggle now gates both Resource Exchange AND
              Recovery Missions. The label reflects that broader scope. */}
          <strong>Experimental features</strong>
          <span className="rcc-feature-state">{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <button
          onClick={() => setConfirm({ nextEnabled: !enabled, reason: '' })}
        >
          {enabled ? 'Disable' : 'Enable'}
        </button>
      </div>
      <p className="muted rcc-feature-desc">
        {enabled
          ? 'Resource Exchange + Recovery Missions are both available to students.'
          : 'Resource Exchange + Recovery Missions are both paused for students. Admin Control Center remains fully available.'}
      </p>
      {msg && <p className="muted rcc-flash">{msg}</p>}
      {err && <p className="error rcc-flash">{err}</p>}
      <p className="muted rcc-feature-cache">
        Changes may take up to 60 seconds to reach active student sessions (server-side cache).
      </p>
      {confirm && (
        <div className="overlay">
          <section className="modal rcc-confirm">
            <div className="modal-head">
              <h2>{confirm.nextEnabled
                ? 'Enable experimental features?'
                : 'Disable experimental features?'}</h2>
              <button className="icon" aria-label="Close confirm" onClick={() => setConfirm(null)}>x</button>
            </div>
            <p>{confirm.nextEnabled
              ? 'Resource Exchange + Recovery Missions will be available to students again.'
              : 'Resource Exchange + Recovery Missions will be paused for students. Existing data (resources, assignments, audit history) will not be deleted.'}</p>
            <label className="rcc-confirm-reason">
              Reason (optional, encouraged)
              <input
                value={confirm.reason}
                onChange={e => setConfirm({ ...confirm, reason: e.target.value })}
                placeholder={confirm.nextEnabled ? 'e.g. moderation maintenance complete' : 'e.g. moderation maintenance'}
              />
            </label>
            <div className="rcc-confirm-actions">
              <button className="secondary" onClick={() => setConfirm(null)}>Cancel</button>
              <button onClick={async () => {
                  await apply(confirm.nextEnabled, confirm.reason.trim() || '');
                  setConfirm(null);
                }}>{confirm.nextEnabled ? 'Enable' : 'Disable'}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

// Resource detail (admin-side): full info + actions + activity log.
function ResourceAdminDetail({ resourceId, headers, onClose, onChanged }) {
  const [r, setR] = useState(null);
  const [events, setEvents] = useState([]);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);

  const load = async () => {
    setErr(null);
    try {
      const [d, a] = await Promise.all([
        fetch(`${API}/admin/resources/${resourceId}`, { headers }).then(x => x.json()),
        fetch(`${API}/admin/resources/${resourceId}/audit`, { headers }).then(x => x.json())
      ]);
      if (d.error) { setErr(d.error); return; }
      setR(d); setEvents(a.events || []);
      setDraft({
        title: d.title, description: d.description, url: d.url, tags: (d.tags || []).join(', '),
        contextType: d.contextType, contextRef: d.contextRef, reason: ''
      });
    } catch (e) { setErr(e.message || 'Network error'); }
  };
  useEffect(() => { load(); }, [resourceId]);

  const callAdmin = async (method, path, body) => {
    setErr(null); setMsg(null);
    const r = await fetch(`${API}${path}`, { method, headers: { ...headers, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) { setErr(`HTTP ${r.status}: ${await r.text()}`); return false; }
    setMsg('Done.'); return true;
  };

  if (err && !r) return <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>Resource</h2><button className="icon" onClick={onClose}>x</button></div><p className="error">{err}</p></section></div>;
  if (!r) return <div className="overlay"><section className="modal"><p className="muted">Loading…</p></section></div>;

  const isDeleted = !!r.deletedAt;
  return (
    <div className="overlay">
      <section className="modal wide rcc-detail">
        <div className="modal-head">
          <h2>{r.title}</h2>
          <button className="icon" aria-label="Close detail" onClick={onClose}>x</button>
        </div>

        {msg && <p className="muted rcc-flash">{msg}</p>}
        {err && <p className="error rcc-flash">{err}</p>}

        <div className="rcc-detail-grid">
          {/* Content */}
          <div className="rcc-block">
            <h3>Content</h3>
            {editing ? (
              <>
                <label>Title<input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
                <label>Description<textarea rows={3} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
                <label>URL<input value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} /></label>
                <label>Tags (comma-separated)<input value={draft.tags} onChange={e => setDraft({ ...draft, tags: e.target.value })} /></label>
                <label>Context type<input value={draft.contextType} onChange={e => setDraft({ ...draft, contextType: e.target.value })} /></label>
                <label>Context ref<input value={draft.contextRef} onChange={e => setDraft({ ...draft, contextRef: e.target.value })} /></label>
                <label>Reason<input value={draft.reason} onChange={e => setDraft({ ...draft, reason: e.target.value })} placeholder="why this change?" /></label>
              </>
            ) : (
              <>
                <p><strong>Type:</strong> {r.type}</p>
                {r.url && <p><strong>URL:</strong> <a href={r.url} target="_blank" rel="noopener noreferrer">{r.url}</a></p>}
                {r.description && <p><strong>Description:</strong> {r.description}</p>}
                {r.tags && r.tags.length > 0 && <p><strong>Tags:</strong> {r.tags.join(', ')}</p>}
                <p><strong>Context:</strong> {r.contextType} / {r.contextRef}</p>
                <p><strong>Cohort:</strong> {r.cohort}</p>
                <p><strong>Source:</strong> {r.source}{r.source === 'admin' && ' (Official)'}</p>
              </>
            )}
          </div>

          {/* Impact */}
          <div className="rcc-block">
            <h3>Impact</h3>
            <p>Saves: <strong>{r.saveCount}</strong></p>
            <p>Ratings: <strong>{r.ratingCount}</strong></p>
            <p>Average rating: <strong>{r.ratingCount > 0 ? (r.ratingSum / r.ratingCount).toFixed(2) : '—'}</strong></p>
            <p>Utility: <strong>{r.utility?.toFixed?.(3) ?? r.utility}</strong></p>
            <p>Status: <strong>{r.status}</strong></p>
            {isDeleted && <p><strong>Visibility:</strong> deleted{isDeleted && r.deletedBy ? ` (by ${r.deletedBy})` : ''}</p>}
          </div>
        </div>

        <div className="rcc-actions">
          {editing ? (
            <>
              <button onClick={async () => {
                const body = {
                  title: draft.title, description: draft.description, url: draft.url,
                  tags: draft.tags.split(',').map(t => t.trim()).filter(Boolean),
                  contextType: draft.contextType, contextRef: draft.contextRef,
                  reason: draft.reason
                };
                if (await callAdmin('PATCH', `/admin/resources/${resourceId}`, body)) {
                  setEditing(false); onChanged();
                }
              }}>Save</button>
              <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} disabled={isDeleted}>Edit</button>
              <button className="warn" disabled={isDeleted} onClick={async () => {
                const reason = prompt('Hide reason (spam, outdated, inappropriate…)', 'spam');
                if (reason == null) return;
                if (await callAdmin('POST', `/admin/resources/${resourceId}/hide`, { reason })) onChanged();
              }}>Hide</button>
              {isDeleted && <button onClick={async () => {
                if (await callAdmin('POST', `/admin/resources/${resourceId}/restore`)) onChanged();
              }}>Restore</button>}
              <button className="danger" onClick={async () => {
                const reason = prompt('Why delete this resource?', 'wrong topic');
                if (reason == null) return;
                if (await callAdmin('DELETE', `/admin/resources/${resourceId}`, { reason })) onChanged();
              }}>Delete</button>
            </>
          )}
        </div>

        <div className="rcc-block">
          <h3>Activity</h3>
          {events.length === 0 && <p className="muted">No audit events yet for this resource.</p>}
          <ul className="rcc-timeline">
            {events.map((e, i) => (
              <li key={i} className={`rcc-ev rcc-ev-${e.kind}`}>
                <span className="rcc-ev-time">{new Date(e.at).toLocaleString()}</span>
                <span className="rcc-ev-actor"><strong>{e.actorEmail || e.actorType}</strong></span>
                <span className="rcc-ev-kind">{e.kind.replace('resource.', '')}</span>
                {e.payload?.reason && <span className="muted rcc-ev-payload">— {e.payload.reason}</span>}
                {e.payload?.title && <span className="muted rcc-ev-payload">— {e.payload.title}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

// Reports sub-view: open reports first, with quick action buttons.
function ReportsSubView({ headers }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setErr(null);
    try {
      const r = await fetch(`${API}/admin/reports?_=${Date.now()}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      setRows((await r.json()).rows);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const resolve = async (id, action, hideReason) => {
    setErr(null); setMsg(null);
    const body = { action };
    if (action === 'auto_hide') body.hideReason = hideReason || 'spam';
    const r = await fetch(`${API}/admin/resource-reports/${id}/resolve`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) { setErr(`HTTP ${r.status}: ${await r.text()}`); return; }
    setMsg(`Resolved (${action}).`); load();
  };

  return (
    <div className="rcc-reports">
      {msg && <p className="muted rcc-flash">{msg}</p>}
      {err && <p className="error rcc-flash">{err}</p>}
      {!rows && <p className="muted">Loading…</p>}
      {rows && rows.length === 0 && <p className="muted">No reports yet.</p>}
      {rows && rows.map(r => (
        <div key={r._id} className={`rcc-report rcc-report-${r.status}`}>
          <div className="rcc-report-head">
            <strong>Resource:</strong> {r.resourceId}
            {r.status !== 'open' && <span className="rcc-badge">{r.status}</span>}
          </div>
          <p className="muted">Reported by <strong>{r.email}</strong> at {new Date(r.createdAt).toLocaleString()}</p>
          {r.reason && <p>Reason: {r.reason}</p>}
          {r.status === 'open' && (
            <div className="rcc-report-actions">
              <button onClick={() => resolve(r._id, 'dismissed')}>Keep</button>
              <button className="warn" onClick={() => {
                const reason = prompt('Why hide?', 'spam');
                if (reason != null) resolve(r._id, 'auto_hide', reason);
              }}>Hide</button>
              <button className="secondary" onClick={() => resolve(r._id, 'actioned')}>Mark actioned</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Audit sub-view: chronological log with simple filters.
function AuditSubView({ headers }) {
  const [events, setEvents] = useState(null);
  const [err, setErr] = useState(null);
  const [filterActor, setFilterActor] = useState('');
  const [filterKind, setFilterKind] = useState('');
  const [filterFrom, setFilterFrom] = useState('');

  const load = async () => {
    setErr(null);
    const params = new URLSearchParams();
    if (filterActor) params.set('actor', filterActor);
    if (filterKind) params.set('kind', filterKind);
    if (filterFrom) params.set('from', filterFrom);
    try {
      const r = await fetch(`${API}/admin/audit?${params.toString()}`, { headers });
      if (!r.ok) throw new Error(await r.text());
      setEvents((await r.json()).events);
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, [filterActor, filterKind, filterFrom]);

  return (
    <div className="rcc-audit">
      <div className="rcc-toolbar">
        <input type="text" placeholder="Actor email" value={filterActor} onChange={e => setFilterActor(e.target.value)} />
        <select value={filterKind} onChange={e => setFilterKind(e.target.value)}>
          <option value="">All kinds</option>
          <option value="resource.created">created</option>
          <option value="resource.updated">updated</option>
          <option value="resource.reported">reported</option>
          <option value="resource.auto_hidden">auto_hidden</option>
          <option value="resource.hidden">hidden</option>
          <option value="resource.restored">restored</option>
          <option value="resource.deleted">deleted</option>
          <option value="resource.report_resolved">report_resolved</option>
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        <button className="secondary" onClick={load}>Refresh</button>
      </div>
      {err && <p className="error">{err}</p>}
      {!events && <p className="muted">Loading…</p>}
      {events && events.length === 0 && <p className="muted">No events match these filters.</p>}
      {events && (
        <table className="table">
          <thead><tr><th>Time</th><th>Actor</th><th>Kind</th><th>Resource</th></tr></thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={i}>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actorEmail || e.actorType}</td>
                <td>{e.kind.replace('resource.', '')}</td>
                <td className="muted">{e.resourceId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Achievements & sharing. The organising idea is that a raw share count is a
// vanity number — it goes up simply because more cards get minted — so every
// figure here that can be a rate is one, with cards HELD as the denominator.
// Whether the six-hourly SP pipeline is actually working. This exists because
// sync-attendance-records failed 31 runs in a row over eight days and the only
// evidence was one line per run in a 4,700-line log file.
function PipelineHealth({ data }) {
  if (!data?.available) return null;
  const when = (t) => t ? new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pipeline health</h2>
        <span className={data.alerting ? 'error' : 'muted'}>
          {data.alerting ? `${data.alerting} step(s) failing repeatedly` : 'all steps healthy'}
        </span>
      </div>
      <table className="table">
        <thead><tr><th>Step</th><th>Status</th><th>Consecutive failures</th><th>Last run</th><th>Last ok</th></tr></thead>
        <tbody>
          {data.steps.map(s => (
            <tr key={s.name} className={s.consecutiveFailures >= 2 ? 'step-alert' : ''}>
              <td>{s.name}</td>
              <td>{s.status === 'ok' ? 'ok' : <b className="error">failed</b>}</td>
              <td>{s.consecutiveFailures > 0 ? <b className="error">{s.consecutiveFailures}</b> : '—'}</td>
              <td>{when(s.lastRun)}</td>
              <td>{s.lastOk ? when(s.lastOk) : <b className="error">never</b>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AdminAchievements({ data, reigns }) {
  if (!data) return <section className="panel empty">Loading achievement data…</section>;
  const d = (x) => x ? new Date(x).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const r = data.reach || {};
  const pct = (n) => `${n}%`;
  const hrs = data.medianHoursToShare;
  const latency = hrs === null || hrs === undefined ? '—'
    : hrs < 48 ? `${hrs} h` : `${Math.round(hrs / 24)} d`;

  return (
    <>
      <section className="panel">
        <h2>Achievements &amp; sharing</h2>
        <div className="ach-stats">
          <div><span>Cards held</span><strong>{data.achievementsHeld}</strong></div>
          <div><span>Cards shared</span><strong>{data.achievementsShared}</strong><em>{pct(data.shareRatePct)} of held</em></div>
          <div><span>Share actions</span><strong>{data.totalShares}</strong><em>{data.last7Days} in last 7 days</em></div>
          <div><span>Students sharing</span><strong>{data.sharers}</strong></div>
          <div><span>Median earn → share</span><strong>{latency}</strong></div>
          <div><span>Captions rewritten</span><strong>{pct(data.captionEditedPct)}</strong></div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>By category</h2>
          <span className="muted">Share rate = distinct cards shared ÷ cards held, so categories that mint more aren't flattered.</span>
        </div>
        <table className="table">
          <thead><tr><th>Category</th><th>Held</th><th>Shared</th><th>Share rate</th><th>Share actions</th><th>Views</th></tr></thead>
          <tbody>
            {(data.categories || []).map(c => (
              <tr key={c.key}>
                <td>{c.label}</td><td>{c.held}</td><td>{c.sharedCards}</td>
                <td><b>{pct(c.shareRatePct)}</b></td><td>{c.shares}</td><td>{c.views}</td>
              </tr>
            ))}
            {!(data.categories || []).length && <tr><td colSpan={6} className="muted">No cards issued yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2>By placing</h2>
        <p className="muted">Whether a 1st is posted more readily than a 3rd — all three carry the same title, so this is the only place the difference shows.</p>
        <table className="table">
          <thead><tr><th>Place</th><th>Held</th><th>Share actions</th><th>Share rate</th></tr></thead>
          <tbody>
            {(data.byPlace || []).map(p => (
              <tr key={p.place}><td>{['', '1st', '2nd', '3rd'][p.place]}</td><td>{p.held}</td><td>{p.shares}</td><td><b>{pct(p.shareRatePct)}</b></td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Board reigns</h2>
          <span className="muted">Who has held the top of each all-time board, and for how long.</span>
        </div>
        <p className="muted">
          An all-time board never settles while the programme runs, so the top spot is recorded as a dated
          reign rather than an outright title. A reign earns a card once it has lasted <b>7 days</b>; shorter
          ones are still kept here, which is what makes the churn visible.
        </p>
        <div className="ach-stats">
          <div><span>Leadership changes</span><strong>{reigns?.total ?? 0}</strong></div>
          <div><span>Median reign</span><strong>{reigns?.medianDays == null ? '—' : `${reigns.medianDays} d`}</strong><em>completed only</em></div>
          <div><span>Currently reigning</span><strong>{reigns?.current?.length ?? 0}</strong><em>one per board</em></div>
        </div>
        <table className="table">
          <thead><tr><th>Board</th><th>Holder</th><th>From</th><th>To</th><th>Days</th><th>SP</th><th>Card</th></tr></thead>
          <tbody>
            {(reigns?.history || []).map((r, i) => (
              <tr key={i}>
                <td>{r.board}</td><td>{r.name || '—'}</td><td>{d(r.from)}</td>
                <td>{r.current ? <b>still reigning</b> : d(r.to)}</td>
                <td>{r.days}</td><td>{r.sp}</td>
                <td>{r.awarded ? 'yes' : <span className="muted">too short</span>}</td>
              </tr>
            ))}
            {!(reigns?.history || []).length && <tr><td colSpan={7} className="muted">No one has topped a board yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Reach</h2>
          <span className="muted">Did the posts get looked at?</span>
        </div>
        <div className="ach-stats">
          <div><span>Verify page views</span><strong>{r.views ?? 0}</strong><em>humans only</em></div>
          <div><span>Unique viewer-days</span><strong>{r.uniqueViewerDays ?? 0}</strong></div>
          <div><span>Views per share</span><strong>{r.viewsPerShare ?? 0}</strong></div>
          <div><span>Crawler hits</span><strong>{r.botViews ?? 0}</strong><em>excluded above</em></div>
          <div><span>Bad codes</span><strong>{r.notFound ?? 0}</strong></div>
        </div>
        {!!(r.byRef || []).length && (
          <table className="table">
            <thead><tr><th>Came from</th><th>Views</th></tr></thead>
            <tbody>{r.byRef.map(x => <tr key={x.ref}><td>{x.ref}</td><td>{x.count}</td></tr>)}</tbody>
          </table>
        )}
        <p className="muted">
          A viewer-day is one device on one day, counted through a hash that is thrown away nightly — it cannot
          identify anyone and cannot follow the same person to the next day. Verify-page visitors are members of
          the public, not study participants, so no IP or cookie is stored.
        </p>
      </section>

      <section className="panel">
        <h2>Where cards go</h2>
        <div className="ach-stats">
          {Object.entries(data.byPlatform || {}).map(([k, v]) => (
            <div key={k}><span>{k}</span><strong>{v}</strong></div>
          ))}
          {!Object.keys(data.byPlatform || {}).length && <p className="muted">Nothing shared yet.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Top sharers</h2>
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Share actions</th><th>Cards</th><th>Last</th></tr></thead>
          <tbody>
            {(data.topSharers || []).map(s => (
              <tr key={s.email}><td>{s.name}</td><td>{s.email}</td><td>{s.shares}</td><td>{s.achievements}</td>
                <td>{s.last ? new Date(s.last).toLocaleDateString('en-IN') : '—'}</td></tr>
            ))}
            {!(data.topSharers || []).length && <tr><td colSpan={5} className="muted">No shares yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
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

// ---- Resource Exchange ----------------------------------------------------
// Tier 3 SPA tab. Reuses every existing primitive: .panel / .cards / .card /
// .overlay / .modal / .muted / .error / .tabs / .tab-badge. NO new design
// system. NO new state library. NO new api helper — same `${API}/...?email=`
// fetch pattern as every other tab.
// ponytail: list is single-fetch with limit=50 (the route's server cap); no
// infinite scroll, no client-side pagination. Add pagination when 50 isn't
// enough on real cohorts.
// ponytail: no toast/notification system; inline `.error` / `.muted` text
// only, matching the rest of the SPA's status conventions.
// The card surfaces resource.contextType + contextRef + phase as a single
// muted meta line — that's how it visually belongs to SPURTHI's existing
// learning context (plan §1 / §2).

// Tier 4 — "resources attached to this context" inline list. Renders inside
// existing learning surfaces (phase cards in MyJourney today; later, poll
// cards and journey snapshots). Fetches from the context-bound endpoint
// `/api/resources/context/:type/:ref`, sorted by utility desc, capped at 12.
// ponytail: per-context card limit hard-capped at 3 in this view so a busy
// phase card never overflows; rest are reachable from the full list.
//
// ponytail: card click navigates to the full Resource Exchange tab instead of
// rendering its own detail modal. Reason: the existing detail modal lives
// inside ResourcesPanel (with `createdBy`, save/rate/report wiring) —
// duplicating it here would drift. Switching tabs achieves the same goal with
// zero new chrome.
function ResourcesForContext({ student, contextType, contextRef, label, openShareFor, onOpenResourceInExchange }) {
  const email = student.email;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [total, setTotal] = useState(0);
  const load = async () => {
    try {
      const r = await fetch(`${API}/resources/context/${contextType}/${encodeURIComponent(contextRef)}`, { credentials: 'include' });
      if (!r.ok) { setErr('Failed to load resources'); return; }
      const j = await r.json();
      setRows(j.rows || []);
      setTotal(j.total || 0);
    } catch (e) { setErr(e?.message || 'Network error'); }
  };
  useEffect(() => { load(); }, [contextType, contextRef, email]);
  const visible = rows ? rows.slice(0, 3) : null;
  const more = total > 3;
  return (
    <div className="rx-ctx">
      <header className="rx-ctx-head">
        <span className="muted">{label || 'Related resources'}</span>
        <button className="secondary rx-ctx-share" onClick={() => openShareFor && openShareFor({ type: contextType, ref: contextRef })}
                aria-label={`Share a resource for this ${contextType}`}>
          Share a resource
        </button>
      </header>
      {err && <p className="error">{err}</p>}
      {visible == null ? (
        <p className="muted rx-ctx-empty">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="muted rx-ctx-empty">No shared resources yet — be the first to add one.</p>
      ) : (
        <div className="rx-ctx-list">
          {visible.map(r => (
            <button key={r._id} className="rx-ctx-card" onClick={() => onOpenResourceInExchange && onOpenResourceInExchange(r._id)} aria-label={`Open ${r.title} in Resource Exchange`}>
              <span className="muted rx-ctx-card-meta">{contextType === 'phase' ? r.contextRef : r.contextLabel || r.contextRef}</span>
              <span className="rx-ctx-card-title">{r.title}</span>
              {r.description && <span className="muted rx-ctx-card-desc">{r.description.length > 90 ? r.description.slice(0, 87) + '…' : r.description}</span>}
              <span className="muted rx-ctx-card-foot">{(r.ratingCount ? `${(r.ratingSum / r.ratingCount).toFixed(1)} avg · ${r.ratingCount} ratings` : 'no ratings')} · saved by {r.saveCount ?? 0}</span>
            </button>
          ))}
          {more && <button className="rx-ctx-more muted" onClick={() => onOpenResourceInExchange && onOpenResourceInExchange(null)}>See all in Resource Exchange</button>}
        </div>
      )}
    </div>
  );
}
const R_TYPE_ICON = { link: 'Link', video: 'Video', note: 'Note', code: 'Code' };
const R_CONTEXT_LABEL = { topic: '', question: '', phase: '' };
// Each resource row carries a server-computed `contextLabel` (e.g.
// "#backprop", "Standups", or the poll-question text). The SPA never renders
// raw contextRef — that would expose ObjectIds to students.

function ResourcesPanel({ student, pendingOpenId, onConsumedPending, onResourceExchangeDisabled }) {
  const email = student.email;
  const [sub, setSub] = useState('discover');
  const [rows, setRows] = useState(null);
  const [sort, setSort] = useState('latest');
  const [q, setQ] = useState('');
  const [error, setError] = useState(null);
  const [featureDisabled, setFeatureDisabled] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [openRes, setOpenRes] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [mine, setMine] = useState(null);
  const [stats, setStats] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Tier 11 — cohort pulse + my-saved are loaded alongside the row fetch so
  // the first paint of the Discover tab already has numbers. Saves a round
  // trip on every sub-tab switch. Errors here are non-fatal (just leaves
  // stats as null → no pulse strip rendered); the row fetch is the source
  // of truth for the actual content.
  const fetchRows = async () => {
    setError(null);
    setSessionExpired(false);
    const url = sub === 'mine'
      ? `${API}/resources/mine`
      : sub === 'saved'
        ? `${API}/resources/saved`
        : `${API}/resources?feed=${sort}`;
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (r.status === 401) {
        // Tier 11 — show a friendly recovery state instead of the raw
        // server error string. The user is clearly logged in (StudentView
        // just loaded), so a 401 here means the chatengine_token cookie
        // is gone — a reload re-runs the Samagama handshake.
        setSessionExpired(true);
        return;
      }
      const j = await r.json();
      // Tier 8B — 403 feature_disabled is the runtime source-of-truth
      // for stale-page handling. Flip our local state and notify the
      // parent so the tab disappears across the whole student UI.
      if (r.status === 403 && j?.error === 'feature_disabled') {
        setFeatureDisabled(true);
        if (onResourceExchangeDisabled) onResourceExchangeDisabled();
        return;
      }
      if (!r.ok) { setError(j.error || 'Failed to load'); return; }
      if (sub === 'mine') { setMine(j); setRows(j.rows || []); }
      else setRows(j.rows || []);
    } catch (e) { setError(e?.message || 'Network error'); }
  };

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API}/resources/stats`, { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      setStats(j);
    } catch { /* non-fatal */ }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchRows(), sub === 'discover' && fetchStats()]);
    } finally {
      setRefreshing(false);
    }
  };
  useEffect(() => { refresh(); }, [sub, sort, q, email]);
  // Tier 11 — load stats once when the panel mounts; the cohort pulse
  // changes slowly (new resources are spread over weeks), so we don't
  // re-fetch on every tab/sub-tab switch.
  useEffect(() => { fetchStats(); }, [email]);

  // Tier 4 — when StudentView hands us a pendingOpenId (a phase card
  // click requested this exact resource), wait for the list to load, then
  // open the detail sheet. Falls back to "not found" silently if the id
  // doesn't match any current row.
  useEffect(() => {
    if (!pendingOpenId || !rows) return;
    const r = rows.find(x => String(x._id) === String(pendingOpenId));
    if (r) { setOpenRes(r); onConsumedPending && onConsumedPending(); }
  }, [rows, pendingOpenId, onConsumedPending]);

  // Tier 8B — friendly empty state when admin disabled the feature.
  // Replaces the list + search + share-create UI with a single short
  // message. No scary technical error, no toast, no broken UI.
  if (featureDisabled) {
    return (
      <div className="rx">
        <section className="panel rx-head">
          <h2>Resource Exchange</h2>
        </section>
        <section className="panel empty rx-disabled">
          <p className="muted">Resource Exchange is temporarily unavailable.</p>
          <p className="muted rx-disabled-sub">Existing resources remain in place and will return when the feature is re-enabled.</p>
        </section>
      </div>
    );
  }

  // Tier 11 — session recovery state. Replaces the entire list surface
  // with a single short card + reload button. Never shows the raw
  // "Not authenticated" text from the server.
  if (sessionExpired) {
    return (
      <div className="rx">
        <section className="panel rx-head">
          <h2>Resource Exchange</h2>
          <p className="muted">
            Resources contribute useful material at the point in the cohort where it is relevant — tagged to a topic, phase, or poll so it is obvious why each is here.
          </p>
        </section>
        <section className="panel empty rx-session">
          <p className="rx-session-title">Your session expired.</p>
          <p className="muted">Reload the page to re-establish the connection.</p>
          <button className="primary rx-session-btn" onClick={() => window.location.reload()}>
            Reload
          </button>
        </section>
      </div>
    );
  }

  // Tier 11 — Discover surface with the cohort pulse strip. Stats are
  // null on first paint, so this short-circuits cleanly.
  const pulse = sub === 'discover' && stats;

  return (
    <div className="rx">
      <section className="panel rx-head">
        <h2>Resource Exchange</h2>
        <p className="muted">
          Resources contribute useful material at the point in the cohort where it is relevant — tagged to a topic, phase, or poll so it is obvious why each is here.
        </p>
        <div className="rx-subtabs">
          <button className={`rx-subtab ${sub === 'discover' ? 'active' : ''}`} onClick={() => setSub('discover')}>Discover</button>
          <button className={`rx-subtab ${sub === 'saved' ? 'active' : ''}`} onClick={() => setSub('saved')}>Saved</button>
          <button className={`rx-subtab ${sub === 'mine' ? 'active' : ''}`} onClick={() => setSub('mine')}>My resources</button>
          <button className="rx-subtab primary" onClick={() => setShowCreate(true)}>Share a resource</button>
          <button
            className="rx-subtab ghost rx-refresh"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh resources"
            title="Refresh">
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {sub === 'discover' && (
          <div className="rx-search">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by tag (e.g. backprop, easy)" aria-label="Search resources by tag" />
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort resources">
              <option value="latest">Most recent</option>
              <option value="saves">Most saved</option>
              <option value="utility">Most useful</option>
            </select>
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      {/* Tier 11 — cohort pulse strip. Three text-only tiles. Monochrome:
          numbers + label, no coloured dots or pills (per design directive). */}
      {pulse && (
        <section className="panel rx-pulse" aria-label="Cohort activity">
          <div className="rx-pulse-tile">
            <strong>{stats.totalResources}</strong>
            <span>resources in cohort</span>
          </div>
          <div className="rx-pulse-tile">
            <strong>{stats.totalSaves}</strong>
            <span>total saves</span>
          </div>
          <div className="rx-pulse-tile">
            <strong>{stats.totalRaters}</strong>
            <span>students rating</span>
          </div>
        </section>
      )}

      {/* Tier 11 — popular tags as quick-fill chips. Click sets q to that
          tag, which triggers a fetch with ?q=… rebuilt client-side. Tags
          come from the server, sorted by usage desc. */}
      {pulse && Array.isArray(stats.topTags) && stats.topTags.length > 0 && (
        <section className="rx-tags" aria-label="Popular tags">
          <span className="muted rx-tags-label">Popular tags</span>
          {stats.topTags.map(t => (
            <button
              key={t.tag}
              type="button"
              className={`rx-tag ${q === t.tag ? 'active' : ''}`}
              onClick={() => setQ(q === t.tag ? '' : t.tag)}
              aria-label={`Filter by tag ${t.tag}`}>
              {t.tag}
              <em>{t.count}</em>
            </button>
          ))}
        </section>
      )}

      {sub === 'mine' && mine && (
        <section className="panel rx-impact">
          <h3 className="rx-impact-title">Your impact</h3>
          <div className="rx-impact-tiles">
            <div><strong>{mine.resources ?? 0}</strong><span>resources shared</span></div>
            <div><strong>{mine.totalSaves ?? 0}</strong><span>total saves</span></div>
            <div><strong>{mine.totalRaters ?? 0}</strong><span>ratings received</span></div>
            <div><strong>{mine.byStatus?.effective ?? 0}</strong><span>marked effective</span></div>
          </div>
        </section>
      )}

      {rows == null ? (
        <section className="panel rx-skeleton" aria-hidden="true">
          {[0, 1, 2].map(i => (
            <div key={i} className="card rx-card rx-skel" />
          ))}
        </section>
      ) : rows.length === 0 ? (
        sub === 'discover' && !q ? (
          <section className="panel empty rx-empty-cta">
            <p className="rx-empty-title">No resources shared in your cohort yet.</p>
            <p className="muted">Be the first. Share something useful and the cohort will see it instantly.</p>
            <button className="primary rx-empty-btn" onClick={() => setShowCreate(true)}>Share the first resource</button>
          </section>
        ) : (
          <section className="panel empty">
            <p className="muted">
              {sub === 'saved'
                ? 'Nothing saved yet. Tap Save on a resource to keep it here.'
                : sub === 'mine'
                  ? "You haven't shared anything yet. Try Share a resource to start."
                  : q
                    ? `Nothing in your cohort matches "${q}". Try a broader tag, or share the first one yourself.`
                    : 'No resources in your cohort yet. Be the first to share.'}
            </p>
          </section>
        )
      ) : (
        <div className="cards rx-list">
          {rows.map(r => (
            <ResourceCard key={r._id} r={r} onOpen={() => setOpenRes(r)} email={email} onChanged={refresh} />
          ))}
        </div>
      )}

      {openRes && (
        <ResourceSheet resource={openRes} email={email}
          onClose={() => setOpenRes(null)} onChanged={() => { refresh(); setOpenRes(null); }} />
      )}
      {showCreate && (
        <CreateResourceSheet email={email}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh(); }} />
      )}
    </div>
  );
}

// One resource card. Order: title → context (muted, secondary) → description →
// signals + actions. The context line is the differentiator: it shows the
// resource's relevance to the cohort (topic tag, phase, or poll question) so
// the student sees WHY this resource belongs in their feed.
function ResourceCard({ r, onOpen, email, onChanged }) {
  const [busy, setBusy] = useState(false);
  const toggleSave = async (e) => {
    e.stopPropagation();
    setBusy(true);
    try { await fetch(`${API}/resources/${r._id}/save`, { method: 'POST', credentials: 'include' }); onChanged(); }
    finally { setBusy(false); }
  };
  // Tier 10 — like toggle. Optimistic local state for snappy UI; onChanged()
  // refetches the row so the server's likeCount is the source of truth.
  const toggleLike = async (e) => {
    e.stopPropagation();
    const wasLiked = r.likedByMe;
    setBusy(true);
    try {
      await fetch(`${API}/resources/${r._id}/${wasLiked ? 'unlike' : 'like'}`, { method: 'POST', credentials: 'include' });
      onChanged();
    } finally { setBusy(false); }
  };
  const avg = r.ratingCount ? (r.ratingSum / r.ratingCount) : null;
  const context = r.contextLabel || '';
  const typeText = R_TYPE_ICON[r.type] || r.type;
  return (
    <article className="card rx-card" onClick={onOpen} role="button" tabIndex={0}
             onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpen()}
             aria-label={`Open resource: ${r.title}`}>
      <header className="rx-card-head">
        <span className="r-type" aria-hidden="true">{typeText}</span>
        <h3>{r.title}</h3>
        {r.status && <span className={`rx-status s-${r.status}`} title={`Status: ${r.status}`}>{r.status}</span>}
      </header>
      {context && <p className="muted rx-meta">{context}</p>}
      {r.description && <p className="rx-desc">{r.description.length > 140 ? r.description.slice(0, 137) + '…' : r.description}</p>}
      <footer className="rx-card-foot">
        <span className="rx-stats">
          {avg
            ? <span title={`${r.ratingCount} ratings`}>{avg.toFixed(1)} avg <em>({r.ratingCount})</em></span>
            : <span className="muted">no ratings yet</span>}
          <span className="rx-saved">saved by {r.saveCount ?? 0}</span>
          {/* Tier 10 — like/download counters */}
          <span className="muted rx-likes" title="Likes">♥ {r.likeCount ?? 0}</span>
          <span className="muted rx-downloads" title="Downloads">↓ {r.downloadCount ?? 0}</span>
        </span>
        <span className="rx-actions" onClick={e => e.stopPropagation()}>
          {/* Tier 10 — like button next to save */}
          <button className="secondary" disabled={busy} onClick={toggleLike} aria-label={r.likedByMe ? 'Unlike' : 'Like'}>
            {r.likedByMe ? '♥ Liked' : '♡ Like'}
          </button>
          <button className="secondary" disabled={busy} onClick={toggleSave} aria-label="Save this resource">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <span className="muted rx-by">by {r.createdBy?.name || 'a student'}</span>
        </span>
      </footer>
    </article>
  );
}

// Detail overlay. Same .overlay + .modal + .modal-head pattern as SearchModal,
// TrajectoryModal, etc. No new chrome.
function ResourceSheet({ resource: r, email, onClose, onChanged }) {
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const context = r.contextLabel || '';
  const rate = async (n) => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/resources/${r._id}/rate`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: n })
      });
      if (res.ok) { setStars(n); setMsg(`Rated ${n} of 5. Thanks for the signal.`); onChanged(); }
      else { const j = await res.json().catch(() => ({})); setMsg(j.error || 'Could not save your rating.'); }
    } finally { setBusy(false); }
  };
  const report = async () => {
    setBusy(true);
    try {
      const reason = window.prompt('Why are you reporting this resource?') || '';
      const res = await fetch(`${API}/resources/${r._id}/report`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 429) setMsg('You have already reported several resources today. Try again tomorrow.');
      else if (!res.ok) setMsg(j.error || 'Could not report.');
      else { setMsg('Reported. The team will review it.'); onChanged(); }
    } finally { setBusy(false); }
  };
  // Tier 10 — download counter. Opens the URL in a new tab + counts once
  // per (resource, student). The server returns the URL explicitly so the
  // SPA doesn't have to trust its own copy of the row.
  const download = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/resources/${r._id}/download`, { method: 'POST', credentials: 'include' });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.url) {
        if (j.countedByMe) setMsg('Download tracked. Opening link…');
        if (typeof window !== 'undefined') window.open(j.url, '_blank', 'noopener');
        onChanged();
      } else {
        setMsg(j.error || 'Could not track download.');
      }
    } finally { setBusy(false); }
  };
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal rx-sheet">
        <div className="modal-head">
          <div>
            <p className="eyebrow">{R_TYPE_ICON[r.type] || r.type}</p>
            <h2>{r.title}</h2>
          </div>
          <button className="icon" onClick={onClose} aria-label="Close resource">x</button>
        </div>
        {context && <p className="muted rx-meta">{context}</p>}
        {r.description && <p className="rx-desc">{r.description}</p>}
        {r.url && <p><a href={r.url} target="_blank" rel="noopener noreferrer">Open resource</a></p>}
        <div className="rx-rate">
          <span className="muted">How useful was this?</span>
          <div className="rx-stars">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} className="icon" disabled={busy} onClick={() => rate(n)}
                      aria-label={`Rate ${n} of 5 stars`}>
                {n <= stars ? '★' : '☆'}
              </button>
            ))}
            {r.ratingCount ? <span className="muted">avg { (r.ratingSum / r.ratingCount).toFixed(1) } ({r.ratingCount})</span> : null}
          </div>
        </div>
        <div className="rx-sheet-foot">
          {/* Tier 10 — download button. Calls the download endpoint which
              counts the download and returns the URL. Avoids hard-coding
              the URL in the client (server is authoritative). */}
          <button className="secondary" onClick={download} disabled={busy} aria-label="Download this resource">
            {busy ? 'Tracking…' : 'Download'}
          </button>
          <button className="secondary" onClick={report} disabled={busy} aria-label="Report this resource">Report</button>
          <span className="muted">by {r.createdBy?.name || 'a student'}</span>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </section>
    </div>
  );
}

// Create form — same shape as VibeGoals' inline section: labels above inputs,
// error inline, primary submit. Topic context pre-fills because that's the
// most common case; Tier 4 lets callers pass an `initialContext` so the
// form opens already bound to the current phase / poll / topic.
function CreateResourceSheet({ email, onClose, onCreated, initialContext }) {
  const [type, setType] = useState('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [contextType, setContextType] = useState(initialContext?.type || 'topic');
  const [contextRef, setContextRef] = useState(initialContext?.ref || '');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    const tagList = tags.split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    try {
      const res = await fetch(`${API}/resources`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, url: type === 'link' || type === 'video' ? url : '', title, description, contextType, contextRef, tags: tagList })
      });
      const j = await res.json();
      if (!res.ok) setErr(j.error || 'Could not create resource.');
      else onCreated();
    } finally { setBusy(false); }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <section className="modal rx-create">
        <div className="modal-head">
          <h2>Share a resource</h2>
          <button className="icon" onClick={onClose} aria-label="Close share form">x</button>
        </div>
        <p className="muted">Help a peer. Resources are publicly visible to your cohort, and indexed by tag, topic, or phase.</p>
        <div className="rx-form">
          <label>Type
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="link">Link</option>
              <option value="video">Video</option>
              <option value="note">Note</option>
              <option value="code">Code</option>
            </select>
          </label>
          {(type === 'link' || type === 'video') && (
            <label>URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" /></label>
          )}
          <label>Title<input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Backprop explained" /></label>
          <label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={400} rows={3} placeholder="What is this and how does it help?" /></label>
          <label>Context
            <select value={contextType} onChange={e => setContextType(e.target.value)} aria-label="Context type">
              <option value="topic">Topic tag (e.g. backprop)</option>
              <option value="phase">Phase (standup, vibe, spa, project)</option>
              <option value="question">Poll question</option>
            </select>
          </label>
          <label>{contextType === 'topic' ? 'Tag' : contextType === 'phase' ? 'Phase key' : 'Poll record id'}
            <input value={contextRef} onChange={e => setContextRef(e.target.value)}
                   placeholder={contextType === 'topic' ? 'backprop' : contextType === 'phase' ? 'standup' : 'poll id from samagama'} />
          </label>
          <label>Tags (up to 5, space- or comma-separated)
            <input value={tags} onChange={e => setTags(e.target.value)} placeholder="neural-nets entropy easy" />
          </label>
          {err && <p className="error">{err}</p>}
        </div>
        <div className="rx-sheet-foot">
          <button className="secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy || !title || !contextRef}
                  aria-label="Share this resource">
            {busy ? 'Sharing…' : 'Share resource'}
          </button>
        </div>
      </section>
    </div>
  );
}
