import { useState, useEffect } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti')
  ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const DAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* ── Ghost status config ──────────────────────────── */
const STATUS_META = {
  'ahead':     { emoji: '🏃', color: 'var(--green)',
                 label: "You're ahead!" },
  'behind':    { emoji: '👻', color: 'var(--amber)',
                 label: 'Ghost is ahead' },
  'tied':      { emoji: '⚡', color: 'var(--primary)',
                 label: 'Perfectly tied' },
  'no-ghost':  { emoji: '🌟', color: 'var(--muted)',
                 label: 'First week' },
};

/* ── Race track bar ───────────────────────────────── */
function RaceTrack({ thisWindowSp, lastWindowSp, status }) {
  const max    = Math.max(thisWindowSp, lastWindowSp, 1);
  const youPct = Math.round((thisWindowSp / max) * 100);
  const ghoPct = Math.round((lastWindowSp / max) * 100);

  return (
    <div className="gr-race-track">
      <div className="gr-racer-row">
        <span className="gr-racer-label">You</span>
        <div className="gr-bar-wrap">
          <div className="gr-bar gr-bar-you"
            style={{ width: `${youPct}%` }} />
        </div>
        <span className="gr-racer-sp">{thisWindowSp} SP</span>
      </div>
      <div className="gr-racer-row">
        <span className="gr-racer-label gr-ghost-label">👻</span>
        <div className="gr-bar-wrap">
          <div className="gr-bar gr-bar-ghost"
            style={{ width: `${ghoPct}%` }} />
        </div>
        <span className="gr-racer-sp gr-muted">{lastWindowSp} SP</span>
      </div>
      <div className="gr-track-caption">
        Comparing this week vs last week (up to today)
      </div>
    </div>
  );
}

/* ── Daily SP comparison bars ─────────────────────── */
function DailyBars({ thisDailyMap, ghostDailyMap, today }) {
  const todayIdx = DAY_KEYS.indexOf(today);
  const allVals  = DAY_KEYS.flatMap(d => [
    Math.abs(thisDailyMap[d]  || 0),
    Math.abs(ghostDailyMap[d] || 0),
  ]);
  const max = Math.max(...allVals, 1);

  return (
    <div className="gr-daily-wrap">
      <div className="gr-daily-label-row">
        <span className="gr-legend-dot gr-you-dot" />
        <span className="gr-legend-text">This week</span>
        <span className="gr-legend-dot gr-ghost-dot" />
        <span className="gr-legend-text">Ghost (last week)</span>
      </div>
      <div className="gr-daily-bars">
        {DAY_KEYS.map((day, i) => {
          const youSp  = thisDailyMap[day]  || 0;
          const ghoSp  = ghostDailyMap[day] || 0;
          const isPast = i <= todayIdx;
          const isToday= i === todayIdx;
          return (
            <div key={day}
              className={`gr-day-col${isToday ? ' gr-today' : ''}${!isPast ? ' gr-future' : ''}`}>
              <div className="gr-bar-pair">
                <div className="gr-mini-bar gr-mini-you"
                  style={{ height: `${Math.round((Math.abs(youSp) / max) * 60)}px`,
                    opacity: isPast ? 1 : 0.25 }} />
                <div className="gr-mini-bar gr-mini-ghost"
                  style={{ height: `${Math.round((Math.abs(ghoSp) / max) * 60)}px`,
                    opacity: isPast ? 0.6 : 0.15 }} />
              </div>
              <div className="gr-day-key">{day}</div>
              {isPast && (youSp !== 0 || ghoSp !== 0) && (
                <div className="gr-day-diff"
                  style={{ color: youSp >= ghoSp
                    ? 'var(--green)' : 'var(--amber)' }}>
                  {youSp >= ghoSp ? '↑' : '↓'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Session comparison ───────────────────────────── */
function SessionComparison({ thisSessions, ghostSessions }) {
  if (!thisSessions.length && !ghostSessions.length) return null;
  const maxLen = Math.max(thisSessions.length, ghostSessions.length);
  const rows   = Array.from({ length: maxLen }, (_, i) => ({
    you:   thisSessions[i]  || null,
    ghost: ghostSessions[i] || null,
  }));

  return (
    <div className="gr-section">
      <div className="gr-section-title">Session by session</div>
      <div className="gr-sessions">
        {rows.map((row, i) => (
          <div key={i} className="gr-session-row">
            <div className={`gr-session-cell gr-you-cell
              ${row.you?.qualified ? 'gr-qualified' : row.you ? 'gr-missed' : 'gr-empty'}`}>
              {row.you
                ? `${row.you.qualified ? '✅' : '❌'} ${row.you.sp >= 0 ? '+' : ''}${row.you.sp} SP`
                : '—'}
            </div>
            <div className="gr-session-vs">VS</div>
            <div className={`gr-session-cell gr-ghost-cell
              ${row.ghost?.qualified ? 'gr-qualified' : row.ghost ? 'gr-missed' : 'gr-empty'}`}>
              {row.ghost
                ? `👻 ${row.ghost.qualified ? '✅' : '❌'} ${row.ghost.sp >= 0 ? '+' : ''}${row.ghost.sp} SP`
                : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Personal bests ───────────────────────────────── */
function PersonalBests({ bests }) {
  return (
    <div className="gr-section">
      <div className="gr-section-title">🏅 Personal Bests</div>
      <div className="gr-bests-grid">
        <div className="gr-best-card">
          <div className="gr-best-emoji">📅</div>
          <div className="gr-best-val">{bests.bestWeeklySp || 0} SP</div>
          <div className="gr-best-label">Best week ever</div>
          {bests.bestWeekOf && (
            <div className="gr-best-sub">w/o {bests.bestWeekOf}</div>
          )}
        </div>
        <div className="gr-best-card">
          <div className="gr-best-emoji">⚡</div>
          <div className="gr-best-val">{bests.bestSession?.sp || 0} SP</div>
          <div className="gr-best-label">Best session</div>
          {bests.bestSession?.label && (
            <div className="gr-best-sub">{bests.bestSession.label}</div>
          )}
        </div>
        {bests.bestStreak !== null && (
          <div className="gr-best-card">
            <div className="gr-best-emoji">🔥</div>
            <div className="gr-best-val">{bests.bestStreak}</div>
            <div className="gr-best-label">Longest streak</div>
            <div className="gr-best-sub">sessions in a row</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── No ghost card ────────────────────────────────── */
function NoGhostCard() {
  return (
    <div className="gr-no-ghost">
      <div style={{ fontSize: 48 }}>👻</div>
      <div className="gr-no-ghost-title">No ghost yet</div>
      <div className="gr-no-ghost-sub">
        Your ghost appears after your first full week.
        Complete this week — then race yourself next week!
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────── */
export default function GhostRace({ onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch(`${API}/ghost-race`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d);    setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="panel gr-loading">👻 Summoning your ghost…</div>
  );

  if (error) return (
    <div className="panel" style={{ color: 'var(--red)', padding: 20 }}>
      Could not load ghost race: {error}
    </div>
  );

  const { thisWeek, ghost, personalBests, today } = data;
  const statusMeta = STATUS_META[ghost.status] || STATUS_META['no-ghost'];

  return (
    <div className="gr-wrap">
      <div className="gr-head">
        <div>
          <div className="gr-title">👻 Ghost Race</div>
          <div className="gr-subtitle">Race your past self</div>
        </div>
        {onClose && (
          <button className="gr-close" onClick={onClose}>✕</button>
        )}
      </div>

      <div className="gr-status-banner"
        style={{ borderColor: statusMeta.color }}>
        <span className="gr-status-emoji">{statusMeta.emoji}</span>
        <div>
          <div className="gr-status-label"
            style={{ color: statusMeta.color }}>
            {statusMeta.label}
          </div>
          <div className="gr-status-msg">{ghost.message}</div>
        </div>
      </div>

      {!ghost.hasGhost ? <NoGhostCard /> : (
        <>
          <RaceTrack
            thisWindowSp={ghost.thisWindowSp}
            lastWindowSp={ghost.lastWindowSp}
            status={ghost.status}
          />

          <div className="gr-section">
            <div className="gr-section-title">Day by day</div>
            <DailyBars
              thisDailyMap={thisWeek.dailyMap}
              ghostDailyMap={ghost.dailyMap}
              today={today}
            />
          </div>

          <div className="gr-stats-row">
            <div className="gr-stat">
              <div className="gr-stat-val">{thisWeek.totalSp}</div>
              <div className="gr-stat-label">Your SP this week</div>
            </div>
            <div className="gr-stat gr-stat-ghost">
              <div className="gr-stat-val">{ghost.totalSp}</div>
              <div className="gr-stat-label">Ghost last week</div>
            </div>
            <div className="gr-stat">
              <div className="gr-stat-val"
                style={{
                  color: ghost.spDiff >= 0
                    ? 'var(--green)' : 'var(--amber)'
                }}>
                {ghost.spDiff >= 0 ? '+' : ''}{ghost.spDiff}
              </div>
              <div className="gr-stat-label">Your edge</div>
            </div>
          </div>

          <SessionComparison
            thisSessions={thisWeek.sessions}
            ghostSessions={ghost.sessions}
          />
        </>
      )}

      <PersonalBests bests={personalBests} />
    </div>
  );
}