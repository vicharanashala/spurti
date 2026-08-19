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
    try {
      const res = await fetch(`${API}/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) return setMessage('Search failed. Please try again.');
      const data = await res.json();
      if (data.excused) return onStudent(data);
      if (data.exact) return onStudent(data.profile);
      setMatches(data.matches || []);
      setMessage(data.matches?.length ? 'Select your record and confirm your email.' : 'No matching student found.');
    } catch { setMessage('Network error. Please try again.'); }
  };

  const confirm = async () => {
    try {
      const res = await fetch(`${API}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selected?._id, email: confirmEmail })
      });
      const data = await res.json();
      if (!res.ok) return setMessage(data.error || 'Email did not match.');
      onStudent(data);
    } catch { setMessage('Network error. Please try again.'); }
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
  // Fetched up here rather than inside the panel because the server decides who
  // gets the tab at all — until it answers `visible`, the tab strip omits it.
  const ach = useAchievements(student.email);
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
      <StudentPulse profile={profile} />
      <Tabs tab={tab} setTab={setTab} tabs={[['bank','SP Bank'],
        ['journey','My Journey'],
        ...(student.eligibleForVibeGoals ? [['vibe','Commitments']] : []),
        ['spa','SPA Points'],
        ...(ach?.visible ? [['achievements','Achievements']] : []),
        ['leaderboard','Leaderboard'],
        ['faq','FAQ']]} />
      {tab === 'bank' && <SpBank transactions={profile.transactions} />}
      {tab === 'journey' && <MyJourney student={student} goToCommitment={goToCommitment} canCommit={student.eligibleForVibeGoals} />}
      {tab === 'vibe' && student.eligibleForVibeGoals && <Commitments student={student} initialPhase={commitPhase} />}
      {tab === 'spa' && <SpaModule student={student} />}
      {tab === 'achievements' && ach?.visible && <AchievementsPanel student={student} data={ach} />}
      {tab === 'leaderboard' && <LeaderboardPanel student={student} />}
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
    let live = true;
    (async () => {
      const r = await fetch(`${API}/spa/state`);
      if (!live) return;
      setData(await r.json());
    })();
    return () => { live = false; };
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
    fetch(`${API}/achievements`)
      .then(r => r.json())
      .then(d => { if (live) setData(d); })
      .catch(() => { if (live) setData({ visible: false, groups: [], locked: [], counts: {} }); });
    return () => { live = false; };
  }, [email]);
  return data;
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
          body: JSON.stringify({ achId: item.achId, dataUrl: url })
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
    let live = true;
    fetch(`${API}/verify/${encodeURIComponent(code)}`)
      .then(r => r.ok ? r.json() : { valid: false })
      .then(d => setState({ loading: false, ...d }))
      .catch(() => setState({ loading: false, valid: false }));
    return () => { live = false; };
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
    fetch(`${API}/leaderboard/board?window=${preset.window}&category=${preset.category}&scope=${preset.scope}`)
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
    let live = true;
    fetch(`${API}/trajectory/state`).then(r => r.json()).then(d => { if (live) setData(d); });
    return () => { live = false; };
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
  const trend = transactions.map(tx => ({ label: tx.sessionLabel || 'Start', value: tx.balanceAfter }));
  return (
    <>
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

  useEffect(() => {
    let live = true;
    fetch(`${API}/journey/state`).then(r => r.json()).then(d => { if (live) setData(d); });
    return () => { live = false; };
  }, []);

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
    const r = await fetch(`${API}/vibe/state`);
    setData(await r.json());
  };
  useEffect(() => {
    let live = true;
    fetch(`${API}/vibe/state`).then(r => r.json()).then(d => { if (live) setData(d); });
    const d = new Date(); d.setDate(d.getDate() + 2);
    setForm(f => ({ ...f, deadline: d.toISOString().slice(0, 10) }));
    return () => { live = false; };
  }, []);

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
    const r = await fetch(`${API}/standup/state`);
    setData(await r.json());
  };
  useEffect(() => {
    let live = true;
    fetch(`${API}/standup/state`).then(r => r.json()).then(d => { if (live) setData(d); });
    return () => { live = false; };
  }, []);

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
    try { const res = await fetch(`${API}/admin/leaderboard?limit=${limit}`, { headers }); if (res.ok) setLeaderboard(await res.json()); } catch {}
  };
  const loadAttendance = async () => {
    try { const res = await fetch(`${API}/admin/attendance`, { headers }); if (res.ok) setAttendance(await res.json()); } catch {}
  };
  const loadStudent = async (id) => {
    try { const res = await fetch(`${API}/admin/student/${id}`, { headers }); if (res.ok) setStudentProfile(await res.json()); } catch {}
  };
  const loadActive = async () => {
    try { const res = await fetch(`${API}/admin/active`, { headers }); if (res.ok) setActive(await res.json()); } catch {}
  };
  const loadAnalytics = async () => {
    try { const res = await fetch(`${API}/admin/analytics`, { headers }); if (res.ok) setAnalytics(await res.json()); } catch {}
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
      <Tabs tab={tab} setTab={setTab} tabs={[['leaderboard','Leaderboard'], ['attendance','Attendance'], ['live','Live'], ['analytics','Analytics'], ['achievements','Achievements'], ['students','Students']]} />
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
      {studentProfile && <div className="overlay"><section className="modal wide"><div className="modal-head"><h2>{studentProfile.student.name}</h2><button className="icon" onClick={() => setStudentProfile(null)}>x</button></div><SpBank transactions={studentProfile.transactions} /></section></div>}
    </main>
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


class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Something went wrong.</h2>
        <p className="muted">Please refresh the page.</p>
        <button className="primary" onClick={() => this.setState({ hasError: false })}>Try again</button>
      </div>
    );
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
