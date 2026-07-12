import { useState, useEffect } from 'react';
import SkillTree from './SkillTree.jsx';

const APP_BASE = window.location.pathname.startsWith('/spurti')
  ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const DAY_KEYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* ── Status config ───────────────────────────────── */
const STATUS_META = {
  'ahead':     { emoji: '🏃', color: 'var(--green)',
                 label: "You're ahead!" },
  'behind':    { emoji: '🥇', color: 'var(--amber)',
                 label: 'Your best is ahead' },
  'tied':      { emoji: '⚡', color: 'var(--primary)',
                 label: 'Perfectly tied' },
  'no-record': { emoji: '🌟', color: 'var(--muted)',
                 label: 'First week' },
};

/* ── Race track bar ───────────────────────────────── */
function RaceTrack({ thisWindowSp, lastWindowSp }) {
  const max    = Math.max(thisWindowSp, lastWindowSp, 1);
  const youPct = Math.round((thisWindowSp / max) * 100);
  const recPct = Math.round((lastWindowSp / max) * 100);

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
        <span className="gr-racer-label gr-record-label">🥇</span>
        <div className="gr-bar-wrap">
          <div className="gr-bar gr-bar-record"
            style={{ width: `${recPct}%` }} />
        </div>
        <span className="gr-racer-sp gr-muted">{lastWindowSp} SP</span>
      </div>
      <div className="gr-track-caption">
        Comparing this week vs your best so far (up to today)
      </div>
    </div>
  );
}

/* ── Daily SP comparison bars ─────────────────────── */
function DailyBars({ thisDailyMap, recordDailyMap, today }) {
  const todayIdx = DAY_KEYS.indexOf(today);
  const allVals  = DAY_KEYS.flatMap(d => [
    Math.abs(thisDailyMap[d]  || 0),
    Math.abs(recordDailyMap[d] || 0),
  ]);
  const max = Math.max(...allVals, 1);

  return (
    <div className="gr-daily-wrap">
      <div className="gr-daily-label-row">
        <span className="gr-legend-dot gr-you-dot" />
        <span className="gr-legend-text">This week</span>
        <span className="gr-legend-dot gr-record-dot" />
        <span className="gr-legend-text">Last week</span>
      </div>
      <div className="gr-daily-bars">
        {DAY_KEYS.map((day, i) => {
          const youSp  = thisDailyMap[day]  || 0;
          const recSp  = recordDailyMap[day] || 0;
          const isPast = i <= todayIdx;
          const isToday= i === todayIdx;
          return (
            <div key={day}
              className={`gr-day-col${isToday ? ' gr-today' : ''}${!isPast ? ' gr-future' : ''}`}>
              <div className="gr-bar-pair">
                <div className="gr-mini-bar gr-mini-you"
                  style={{ height: `${Math.round((Math.abs(youSp) / max) * 60)}px`,
                    opacity: isPast ? 1 : 0.25 }} />
                <div className="gr-mini-bar gr-mini-record"
                  style={{ height: `${Math.round((Math.abs(recSp) / max) * 60)}px`,
                    opacity: isPast ? 0.6 : 0.15 }} />
              </div>
              <div className="gr-day-key">{day}</div>
              {isPast && (youSp !== 0 || recSp !== 0) && (
                <div className="gr-day-diff"
                  style={{ color: youSp >= recSp
                    ? 'var(--green)' : 'var(--amber)' }}>
                  {youSp >= recSp ? '↑' : '↓'}
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
function SessionComparison({ thisSessions, recordSessions }) {
  if (!thisSessions.length && !recordSessions.length) return null;
  const maxLen = Math.max(thisSessions.length, recordSessions.length);
  const rows   = Array.from({ length: maxLen }, (_, i) => ({
    you:    thisSessions[i]    || null,
    record: recordSessions[i]  || null,
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
            <div className={`gr-session-cell gr-record-cell
              ${row.record?.qualified ? 'gr-qualified' : row.record ? 'gr-missed' : 'gr-empty'}`}>
              {row.record
                ? `🥇 ${row.record.qualified ? '✅' : '❌'} ${row.record.sp >= 0 ? '+' : ''}${row.record.sp} SP`
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

/* ── No record card ──────────────────────────────── */
function NoRecordCard() {
  return (
    <div className="gr-no-record">
      <div style={{ fontSize: 48 }}>🥇</div>
      <div className="gr-no-record-title">No record to beat yet</div>
      <div className="gr-no-record-sub">
        Your first full week becomes the benchmark.
        Complete this week — then chase it next week!
      </div>
    </div>
  );
}

/* ── Main component ───────────────────────────────── */
export default function GhostRace({ onClose }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [showSkillTree, setShowSkillTree] = useState(false);

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
    <div className="panel gr-loading">🥇 Loading your best…</div>
  );

  if (error) return (
    <div className="panel" style={{ color: 'var(--red)', padding: 20 }}>
      Could not load ghost race: {error}
    </div>
  );

  // Destructure from API response (field names unchanged — backend stays the same)
  const { thisWeek, ghost, personalBests, today } = data;
  const statusMeta = STATUS_META[ghost.status] || STATUS_META['no-record'];

  return (
    <div className="gr-wrap">
      <div className="gr-head">
        <div>
          <div className="gr-title">🥇 Beat Your Best</div>
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
        <button className="skilltree-entry-btn" onClick={() => setShowSkillTree(true)}>🌳 Skill Tree</button>
      </div>

      {!ghost.hasGhost ? <NoRecordCard /> : (
        <>
          <RaceTrack
            thisWindowSp={ghost.thisWindowSp}
            lastWindowSp={ghost.lastWindowSp}
          />

          <div className="gr-section">
            <div className="gr-section-title">Day by day</div>
            <DailyBars
              thisDailyMap={thisWeek.dailyMap}
              recordDailyMap={ghost.dailyMap}
              today={today}
            />
          </div>

          <div className="gr-stats-row">
            <div className="gr-stat">
              <div className="gr-stat-val">{thisWeek.totalSp}</div>
              <div className="gr-stat-label">Your SP this week</div>
            </div>
            <div className="gr-stat gr-stat-record">
              <div className="gr-stat-val">{ghost.totalSp}</div>
              <div className="gr-stat-label">Last week</div>
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
            recordSessions={ghost.sessions}
          />
        </>
      )}

      <PersonalBests bests={personalBests} />

      {showSkillTree && (
        <div className="wlb-overlay">
          <SkillTree compact={true} />
          <button className="skilltree-close" onClick={() => setShowSkillTree(false)}>✕</button>
        </div>
      )}
    </div>
  );
}