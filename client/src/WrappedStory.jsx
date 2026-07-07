import { useState, useEffect, useCallback } from 'react';
import { getDevAsEmail } from './devAsEmail.js';

const APP_BASE = window.location.pathname.startsWith('/spurti')
 ? '/spurti' : '';
const API = `${APP_BASE}/api`;

function IntroCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">✨</div>
 <div className="wrapped-headline">{data.monthLabel}</div>
 <div className="wrapped-sub">
 {data.joinedThisMonth
 ? 'Your first month on the journey.'
 : 'Here\'s your learning story.'}
 </div>
 </div>
 );
}

function SpEarnedCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">💰</div>
 <div className="wrapped-label">SP this month</div>
 <div className="wrapped-headline"
 style={{ color: data.netChange >= 0
 ? 'var(--green)' : 'var(--red)' }}>
 {data.netChange >= 0 ? '+' : ''}{data.netChange}
 </div>
 <div className="wrapped-sub">
 +{data.totalEarned} earned · {data.totalDeducted} deducted
 </div>
 </div>
 );
}

function CategoryCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">📊</div>
 <div className="wrapped-label">Where your SP came from</div>
 <div className="wrapped-stat-row">
 <span>📅 Attendance</span>
 <strong>{data.attendance >= 0 ? '+' : ''}{data.attendance}</strong>
 </div>
 <div className="wrapped-stat-row">
 <span>📋 Polls</span>
 <strong>{data.poll >= 0 ? '+' : ''}{data.poll}</strong>
 </div>
 <div className="wrapped-stat-row">
 <span>🎖️ Manual awards</span>
 <strong>{data.manual >= 0 ? '+' : ''}{data.manual}</strong>
 </div>
 </div>
 );
}

function AttendanceCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">📅</div>
 <div className="wrapped-label">Sessions attended</div>
 <div className="wrapped-headline">
 {data.sessionsAttended}
 <span className="wrapped-denom">/{data.sessionsHeld}</span>
 </div>
 {data.qualifiedRate !== null && (
 <div className="wrapped-sub">
 {data.qualifiedRate}% qualification rate
 </div>
 )}
 </div>
 );
}

function BestSessionCard({ data }) {
 if (!data.label) return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">🏅</div>
 <div className="wrapped-label">Best session</div>
 <div className="wrapped-sub">No session SP earned this month.</div>
 </div>
 );
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">🏅</div>
 <div className="wrapped-label">Best session</div>
 <div className="wrapped-headline">+{data.spEarned} SP</div>
 <div className="wrapped-sub">{data.label}</div>
 </div>
 );
}

function PollCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">📋</div>
 <div className="wrapped-label">Poll participation</div>
 {data.avgAttemptedRate !== null ? (
 <>
 <div className="wrapped-headline">{data.avgAttemptedRate}%</div>
 <div className="wrapped-sub">
 avg across {data.pollsCount} poll session
 {data.pollsCount !== 1 ? 's' : ''}
 </div>
 </>
 ) : (
 <div className="wrapped-sub">No polls this month.</div>
 )}
 </div>
 );
}

function StandingCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">⚡</div>
 <div className="wrapped-label">Your current standing</div>
 <div className="wrapped-stat-row">
 <span>Level</span>
 <strong>{data.level ?? '—'}</strong>
 </div>
 <div className="wrapped-stat-row">
 <span>Trophy League</span>
 <strong>{data.trophyLeague ?? '—'}</strong>
 </div>
 {data.currentStreak !== null && (
 <div className="wrapped-stat-row">
 <span>🔥 Streak</span>
 <strong>{data.currentStreak} sessions</strong>
 </div>
 )}
 {data.progressBand && (
 <div className="wrapped-stat-row">
 <span>Progress Band</span>
 <strong>{data.progressBand}</strong>
 </div>
 )}
 </div>
 );
}

function LifetimeCard({ data }) {
 return (
 <div className="wrapped-card-body">
 <div className="wrapped-icon">🌟</div>
 <div className="wrapped-label">Lifetime SP</div>
 <div className="wrapped-headline">{data.totalSp}</div>
 <div className="wrapped-sub">
 Member since {data.memberSinceLabel}
 </div>
 </div>
 );
}

function NoDataCard({ onClose }) {
 return (
 <div className="wrapped-overlay">
 <div className="wrapped-nodata">
 <div style={{ fontSize: 40, marginBottom: 16 }}>📭</div>
 <p>Not enough data yet for a Wrapped this month.</p>
 <p style={{ fontSize: 13, opacity: 0.7 }}>
 Check back after a few more sessions!
 </p>
 <button className="wrapped-close-btn" onClick={onClose}>
 Close
 </button>
 </div>
 </div>
 );
}

const CARD_COMPONENTS = {
 'intro': IntroCard,
 'sp-earned': SpEarnedCard,
 'category-breakdown': CategoryCard,
 'attendance': AttendanceCard,
 'best-session': BestSessionCard,
 'poll-performance': PollCard,
 'current-standing': StandingCard,
 'lifetime': LifetimeCard,
};

export default function WrappedStory({ onClose }) {
 const [story, setStory] = useState(null);
 const [loading, setLoading] = useState(true);
 const [index, setIndex] = useState(0);

 useEffect(() => {
 const devAs = getDevAsEmail();
 const qs = devAs ? `?asEmail=${encodeURIComponent(devAs)}` : '';
 fetch(`${API}/wrapped${qs}`)
 .then(r => r.json())
 .then(d => { setStory(d); setLoading(false); })
 .catch(() => {
 setStory({ available: false });
 setLoading(false);
 });
 }, []);

 const cards = story?.cards || [];
 const total = cards.length;

 const goNext = useCallback(() =>
 setIndex(i => Math.min(i + 1, total - 1)), [total]);
 const goPrev = useCallback(() =>
 setIndex(i => Math.max(i - 1, 0)), []);

 useEffect(() => {
 const handler = e => {
 if (e.key === 'ArrowRight') goNext();
 if (e.key === 'ArrowLeft') goPrev();
 if (e.key === 'Escape') onClose();
 };
 window.addEventListener('keydown', handler);
 return () => window.removeEventListener('keydown', handler);
 }, [goNext, goPrev, onClose]);

 if (loading) return (
 <div className="wrapped-overlay">
 <div className="wrapped-loading">Loading your story…</div>
 </div>
 );

 if (!story?.available) return <NoDataCard onClose={onClose} />;

 const card = cards[index];
 const CardCmp = CARD_COMPONENTS[card?.type] || (() => null);

 return (
 <div className="wrapped-overlay">
 <button
 className="wrapped-x"
 onClick={onClose}
 aria-label="Close">✕</button>

 <div className="wrapped-progress">
 {cards.map((_, i) => (
 <div key={i} className="wrapped-seg-wrap">
 <div className="wrapped-seg-fill"
 style={{
 width: i < index ? '100%'
 : i === index ? '50%' : '0%'
 }} />
 </div>
 ))}
 </div>

 <div className="wrapped-card">
 <CardCmp data={card} />
 <div className="wrapped-counter">{index + 1} / {total}</div>
 </div>

 <div className="wrapped-tap-prev" onClick={goPrev} />
 <div className="wrapped-tap-next" onClick={goNext} />
 </div>
 );
}
