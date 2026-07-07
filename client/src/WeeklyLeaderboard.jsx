import { useState, useEffect } from 'react';
import { getDevAsEmail } from './devAsEmail.js';

const APP_BASE = window.location.pathname.startsWith('/spurti')
 ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const LEAGUE_META = {
 gold: { emoji: '🥇', label: 'Gold League', class: 'wlb-gold' },
 silver: { emoji: '🥈', label: 'Silver League', class: 'wlb-silver' },
 bronze: { emoji: '🥉', label: 'Bronze League', class: 'wlb-bronze' },
};

const CATEGORY_META = {
 weeklyChampion: { emoji: '🏆', label: 'Weekly SP Champion',
 sub: r => `+${r.score} SP this week` },
 mostConsistent: { emoji: '🔥', label: 'Most Consistent',
 sub: r => `${Math.round(r.score * 100)}% sessions qualified` },
 mostImproved: { emoji: '📈', label: 'Most Improved',
 sub: r => `+${r.score} SP vs last week` },
 biggestComeback:{ emoji: '⚡', label: 'Biggest Comeback',
 sub: r => `Recovery → Active in one week` },
 communityStar: { emoji: '🤝', label: 'Community Star',
 sub: r => `${r.score} positive chat contributions` },
};

function CategoryWinners({ winners }) {
 return (
 <div className="wlb-categories">
 {Object.entries(CATEGORY_META).map(([key, meta]) => {
 const w = winners?.[key];
 return (
 <div key={key}
 className={`wlb-cat-card${w?.isCurrentStudent
 ? ' wlb-you' : ''}`}>
 <div className="wlb-cat-emoji">{meta.emoji}</div>
 <div className="wlb-cat-label">{meta.label}</div>
 {w ? (
 <>
 <div className="wlb-cat-name">{w.name}</div>
 <div className="wlb-cat-sub">{meta.sub(w)}</div>
 </>
 ) : (
 <div className="wlb-cat-sub wlb-muted">
 No winner yet
 </div>
 )}
 </div>
 );
 })}
 </div>
 );
}

function LeagueTable({ rows, leagueKey }) {
 const meta = LEAGUE_META[leagueKey];
 if (!rows?.length) return null;
 return (
 <div className={`wlb-league-section ${meta.class}`}>
 <div className="wlb-league-header">
 <span className="wlb-league-badge">{meta.emoji} {meta.label}</span>
 <span className="wlb-league-count">
 {rows.length} student{rows.length !== 1 ? 's' : ''}
 </span>
 </div>
 <table className="wlb-table">
 <thead>
 <tr>
 <th>#</th>
 <th>Name</th>
 <th>SP this week</th>
 <th>Total SP</th>
 </tr>
 </thead>
 <tbody>
 {rows.map(row => (
 <tr key={row.maskedEmail}
 className={row.isCurrentStudent ? 'wlb-you-row' : ''}>
 <td className="wlb-rank">{row.rank}</td>
 <td>
 <div className="wlb-name">{row.name}</div>
 <div className="wlb-email">{row.maskedEmail}</div>
 </td>
 <td className="wlb-sp-week">
 {row.periodSp > 0 ? `+${row.periodSp}` : row.periodSp}
 </td>
 <td className="wlb-sp-total">{row.totalSp}</td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 );
}

export default function WeeklyLeaderboard({ onClose }) {
 const [data, setData] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);
 const [tab, setTab] = useState('gold');

 useEffect(() => {
 const devAs = getDevAsEmail();
 const qs = devAs ? `?asEmail=${encodeURIComponent(devAs)}` : '';
 fetch(`${API}/weekly-leaderboard${qs}`)
 .then(r => {
 if (!r.ok) throw new Error(`HTTP ${r.status}`);
 return r.json();
 })
 .then(d => { setData(d); setTab(d.yourLeague || 'gold');
 setLoading(false); })
 .catch(e => { setError(e.message); setLoading(false); });
 }, []);

 if (loading) return (
 <div className="panel wlb-loading">
 Loading this week's leaderboard…
 </div>
 );

 if (error) return (
 <div className="panel" style={{ color: 'var(--red)' }}>
 Could not load: {error}
 </div>
 );

 const { leagues, categoryWinners,
 yourLeague, yourRank, yourPeriodSp, weekOf } = data;

 return (
 <div className="wlb-wrap">
 {/* Header */}
 <div className="wlb-head">
 <div>
 <div className="wlb-title">🏆 Weekly Leaderboard</div>
 <div className="wlb-subtitle">
 Week of {weekOf} · Resets every Monday
 </div>
 </div>
 {onClose && (
 <button className="wlb-close" onClick={onClose}>✕</button>
 )}
 </div>

 {/* Your standing */}
 {yourLeague && (
 <div className={`wlb-your-standing
 ${LEAGUE_META[yourLeague]?.class || ''}`}>
 <span>{LEAGUE_META[yourLeague]?.emoji}</span>
 <span>You are in <strong>
 {LEAGUE_META[yourLeague]?.label}</strong></span>
 <span>Rank #{yourRank}</span>
 <span className="wlb-your-sp">
 {yourPeriodSp > 0 ? `+${yourPeriodSp}` : yourPeriodSp} SP
 </span>
 </div>
 )}

 {/* Category winners */}
 <div className="wlb-section-label">🎖️ This Week's Winners</div>
 <CategoryWinners winners={categoryWinners} />

 {/* League tabs */}
 <div className="wlb-tabs">
 {Object.entries(LEAGUE_META).map(([key, meta]) => (
 <button key={key}
 className={`wlb-tab wlb-tab-${key}${tab === key ? ' wlb-tab-active' : ''}`}
 onClick={() => setTab(key)}>
 {meta.emoji} {meta.label}
 <span className="wlb-tab-count">
 {leagues[key]?.length || 0}
 </span>
 </button>
 ))}
 </div>

 {/* League table */}
 <LeagueTable rows={leagues[tab]} leagueKey={tab} />

 {/* How leagues work */}
 <div className="wlb-explainer">
 🔄 Leagues update every week based on SP earned.
 Top 25% → Gold · Next 35% → Silver · Rest → Bronze
 </div>
 </div>
 );
}