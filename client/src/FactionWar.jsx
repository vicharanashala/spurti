import { useState, useEffect } from 'react';
import { getDevAsEmail } from './devAsEmail.js';

const APP_BASE = window.location.pathname.startsWith('/spurti')
  ? '/spurti' : '';
const API = `${APP_BASE}/api`;

/* ── Countdown timer ─────────────────────────────── */
function Countdown({ targetDate }) {
  const [left, setLeft] = useState('');

  useEffect(() => {
    function tick() {
      const ms = new Date(targetDate) - Date.now();
      if (ms <= 0) { setLeft('00h 00m'); return; }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setLeft(`${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`);
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [targetDate]);

  return <span>{left}</span>;
}

/* ── Faction overview card ────────────────────────── */
function FactionCard({ standing, isCurrentUserFaction }) {
  const { factionMeta, weeklySp, weeklyDelta, rank, memberCount, qualifiedRate, topContributors } = standing;
  const color = factionMeta?.color || '#888';
  const bgLight = hexToRgba(color, 0.10);
  const bgBorder = hexToRgba(color, 0.30);

  return (
    <div
      className={`fw-faction-card${isCurrentUserFaction ? ' fw-your-faction' : ''}`}
      style={{ '--faction-color': color, '--faction-bg': bgLight, '--faction-border': bgBorder }}
    >
      {isCurrentUserFaction && (
        <div className="fw-your-badge">⚔️ Your Faction</div>
      )}

      {/* Faction header */}
      <div className="fw-card-head">
        <div className="fw-emoji" style={{ background: bgLight, borderColor: bgBorder }}>
          {factionMeta?.emoji || '⚔️'}
        </div>
        <div>
          <div className="fw-faction-name" style={{ color }}>{factionMeta?.name}</div>
          <div className="fw-faction-tagline">{factionMeta?.tagline}</div>
        </div>
        {rank === 1 && (
          <div className="fw-crown">👑</div>
        )}
      </div>

      {/* SP total */}
      <div className="fw-card-sp">
        <span className="fw-sp-num" style={{ color }}>{weeklySp.toLocaleString()}</span>
        <span className="fw-sp-label"> SP this week</span>
      </div>

      {/* Delta */}
      <div className={`fw-delta ${weeklyDelta >= 0 ? 'positive' : 'negative'}`}>
        {weeklyDelta >= 0 ? '↑' : '↓'} {Math.abs(weeklyDelta).toLocaleString()} SP vs last week
      </div>

      {/* Stats row */}
      <div className="fw-card-stats">
        <div className="fw-stat">
          <span className="fw-stat-num">{memberCount}</span>
          <span className="fw-stat-label">Members</span>
        </div>
        <div className="fw-stat-divider" />
        <div className="fw-stat">
          <span className="fw-stat-num">{qualifiedRate}%</span>
          <span className="fw-stat-label">Qualified</span>
        </div>
        <div className="fw-stat-divider" />
        <div className="fw-stat">
          <span className="fw-stat-num">#{rank}</span>
          <span className="fw-stat-label">Rank</span>
        </div>
      </div>

      {/* Top contributors */}
      {topContributors?.length > 0 && (
        <div className="fw-contributors">
          <div className="fw-contrib-label">🌟 Top Contributors</div>
          {topContributors.slice(0, 3).map((c, i) => (
            <div key={i} className="fw-contrib-row">
              <span className="fw-contrib-rank">{['🥇','🥈','🥉'][i] || `#${i+1}`}</span>
              <span className="fw-contrib-name">{c.name}</span>
              <span className="fw-contrib-sp" style={{ color }}>+{c.weeklySp}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Standings table ─────────────────────────────── */
function StandingsTable({ standings }) {
  if (!standings?.length) {
    return (
      <div className="fw-empty">
        <p>No faction data yet. Faction assignments are coming soon!</p>
      </div>
    );
  }

  const leader = standings[0];

  return (
    <div className="fw-table-wrap">
      <table className="fw-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Faction</th>
            <th>Weekly SP</th>
            <th>Season SP</th>
            <th>Members</th>
            <th>Qualified</th>
          </tr>
        </thead>
        <tbody>
          {standings.map(s => {
            const isLead = s.rank === 1;
            return (
              <tr
                key={s.factionId}
                className={`fw-table-row${s.isCurrentUserFaction ? ' fw-table-me' : ''}${isLead ? ' fw-table-lead' : ''}`}
              >
                <td className="fw-td-rank">
                  {isLead ? '👑' : `#${s.rank}`}
                </td>
                <td className="fw-td-faction">
                  <div className="fw-table-faction" style={{ '--fc': s.factionMeta?.color || '#888' }}>
                    <span className="fw-table-emoji">{s.factionMeta?.emoji}</span>
                    <div>
                      <div className="fw-table-name" style={{ color: s.factionMeta?.color }}>
                        {s.factionMeta?.name}
                      </div>
                      {s.isCurrentUserFaction && <div className="fw-table-me-tag">You</div>}
                    </div>
                  </div>
                </td>
                <td className="fw-td-sp">
                  <span style={{ color: s.factionMeta?.color }}>{s.weeklySp.toLocaleString()}</span>
                  {s.weeklyDelta !== 0 && (
                    <span className={`fw-td-delta ${s.weeklyDelta > 0 ? 'positive' : 'negative'}`}>
                      {s.weeklyDelta > 0 ? '▲' : '▼'}{Math.abs(s.weeklyDelta)}
                    </span>
                  )}
                </td>
                <td className="fw-td-season">{s.seasonSp.toLocaleString()}</td>
                <td className="fw-td-members">{s.memberCount}</td>
                <td className="fw-td-qual">{s.qualifiedRate}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── My faction highlight ─────────────────────────── */
function MyFactionPanel({ myStanding }) {
  if (!myStanding) {
    return (
      <div className="fw-no-faction">
        <p>⚔️ <strong>Join a faction to compete in Faction Wars!</strong></p>
        <p>Faction assignments are managed by your admin. Contact them to get sorted into a team.</p>
      </div>
    );
  }

  const { factionMeta, weeklySp, weeklyDelta, rank, memberCount, qualifiedRate } = myStanding;
  const color = factionMeta?.color || 'var(--primary)';

  return (
    <div className="fw-my-faction" style={{ '--faction-color': color, '--faction-bg': hexToRgba(color, 0.10), '--faction-border': hexToRgba(color, 0.35) }}>
      <div className="fw-my-head">
        <span className="fw-my-emoji">{factionMeta?.emoji}</span>
        <div>
          <div className="fw-my-name" style={{ color }}>You are in <strong>{factionMeta?.name}</strong></div>
          <div className="fw-my-sub">{factionMeta?.tagline}</div>
        </div>
        <div className="fw-my-rank">
          #{rank}
        </div>
      </div>
      <div className="fw-my-stats">
        <div className="fw-my-stat">
          <strong style={{ color }}>{weeklySp.toLocaleString()}</strong>
          <span>Weekly SP</span>
        </div>
        <div className="fw-my-stat">
          <strong>{memberCount}</strong>
          <span>Members</span>
        </div>
        <div className="fw-my-stat">
          <strong>{qualifiedRate}%</strong>
          <span>Qualified</span>
        </div>
        <div className="fw-my-stat">
          <strong className={weeklyDelta >= 0 ? 'positive' : 'negative'}>
            {weeklyDelta >= 0 ? '+' : ''}{weeklyDelta.toLocaleString()}
          </strong>
          <span>vs last week</span>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ──────────────────────────────── */
export default function FactionWar({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const devAs = getDevAsEmail();
    const qs = devAs ? `?asEmail=${encodeURIComponent(devAs)}` : '';
    fetch(`${API}/faction-war${qs}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return (
    <div className="fw-wrap">
      <div className="fw-loading">⚔️ Loading Faction Wars…</div>
    </div>
  );

  if (error) return (
    <div className="fw-wrap">
      <div className="fw-error">Could not load Faction Wars: {error}</div>
    </div>
  );

  const { warLabel, weekOf, seasonOf, weekEnd, seasonEnd, myFactionId, standings } = data;
  const myStanding = standings?.find(s => s.isCurrentUserFaction);

  return (
    <div className="fw-wrap">
      {/* Header */}
      <div className="fw-head">
        <div>
          <div className="fw-title">⚔️ Faction Wars</div>
          <div className="fw-subtitle">
            {warLabel} &nbsp;·&nbsp; Week of {weekOf}
            {weekEnd && (
              <> &nbsp;·&nbsp; Resets in <Countdown targetDate={weekEnd} /></>
            )}
          </div>
          {seasonOf && (
            <div className="fw-season-label">
              Season {seasonOf}{seasonEnd ? <> &nbsp;·&nbsp; Season ends in <Countdown targetDate={seasonEnd} /></> : null}
            </div>
          )}
        </div>
        {onClose && (
          <button className="skilltree-close" onClick={onClose}>✕</button>
        )}
      </div>

      {/* My faction highlight */}
      <MyFactionPanel myStanding={myStanding} />

      {/* Faction overview cards */}
      {standings?.length > 0 ? (
        <div className="fw-section-label">⚔️ Faction Standings</div>
      ) : null}

      {standings?.length > 0 ? (
        <div className="fw-faction-grid">
          {standings.map(s => (
            <FactionCard
              key={s.factionId}
              standing={s}
              isCurrentUserFaction={s.isCurrentUserFaction}
            />
          ))}
        </div>
      ) : null}

      {/* Standings table */}
      {standings?.length > 0 ? (
        <StandingsTable standings={standings} />
      ) : (
        <div className="fw-empty">
          <p>⚔️ <strong>No faction data yet.</strong></p>
          <p>Ask your admin to assign students to factions using the <code>faction</code> field on student records.</p>
        </div>
      )}

      {/* How it works */}
      <div className="fw-explainer">
        ⚔️ Faction Wars run every week. Earn SP through regular Spurti activities —
        your weekly SP is added to your faction's total. The faction with the most SP
        at the end of the week wins!
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────── */
function hexToRgba(hex, alpha) {
  try {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch {
    return `rgba(128,128,128,${alpha})`;
  }
}