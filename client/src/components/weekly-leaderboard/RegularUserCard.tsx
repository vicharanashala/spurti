import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================
// RegularUserCard
// Premium greeting + weekly performance summary for users who
// finish outside the Top 10 AND outside the Bottom 50.
// Shown above the leaderboard on the Weekly Leaderboard page.
// ============================================================

function useCountUp(target, duration = 700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - (1 - p) * (1 - p);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

function greetingForHour() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function rankMovementArrow(delta) {
  if (delta == null) return { glyph: '—', dir: 'flat', color: '#94a3b8' };
  if (delta > 0) return { glyph: '▲', dir: 'up', color: '#10b981' };
  if (delta < 0) return { glyph: '▼', dir: 'down', color: '#ef4444' };
  return { glyph: '—', dir: 'flat', color: '#94a3b8' };
}

export function RegularUserCard({ data, profile, onViewLeaderboard }) {
  const me = data?.me;
  const rank = me?.weeklyRank;
  const displaySp = useCountUp(me?.weeklySp ?? 0);
  const displayTop = useCountUp(Math.max(1, me?.pointsToTop10 ?? 0));
  const cohort = data?.cohortSize || 1;
  const pct = rank ? Math.min(100, Math.round(((cohort - rank) / cohort) * 100)) : 0;

  // Rank movement: weekly rank vs. total rank (proxy until we get a real
  // previous-week comparison in step 8+).
  const weeklyRank = me?.weeklyRank;
  const lifetimeRank = Number(profile?.rank || 0);
  const movement = lifetimeRank && weeklyRank ? weeklyRank - lifetimeRank : 0;
  const arrow = rankMovementArrow(movement);

  // Streak is sourced from the gamification storage where the dashboard
  // keeps it. Fall back to 0 so the UI renders gracefully.
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    try {
      const emailKey = (profile?.email || '').toLowerCase();
      const raw = localStorage.getItem(`spurti_state_${emailKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        setStreak(Math.max(0, Number(parsed?.currentStreak || 0)));
      }
    } catch {}
  }, [profile?.email]);

  if (!me) return null;

  return (
    <motion.section className="wl-regular"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wl-regular__top">
        <div className="wl-regular__hello">
          <div className="wl-regular__eyebrow">WELCOME BACK</div>
          <h2 className="wl-regular__greeting">
            {greetingForHour()}, <span className="wl-regular__name">{profile?.name?.split(' ')[0] || 'Student'}</span>!
          </h2>
          <div className="wl-regular__sub">Here's your Weekly Performance.</div>
        </div>
        <div className="wl-regular__streak" aria-label="Current streak">
          <div className="wl-regular__streak-flame" aria-hidden="true">🔥</div>
          <div className="wl-regular__streak-body">
            <div className="wl-regular__streak-val">{streak}</div>
            <div className="wl-regular__streak-label">DAY STREAK</div>
          </div>
        </div>
      </div>

      <div className="wl-regular__cards">
        {/* Card 1 — Weekly SP */}
        <div className="wl-regular__card wl-regular__card--sp">
          <div className="wl-regular__card-label">WEEKLY SP</div>
          <div className="wl-regular__card-value">
            <motion.span
              key={displaySp}
              initial={{ scale: 1.15 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.25 }}
              className="wl-regular__card-num"
            >
              +{displaySp}
            </motion.span>
          </div>
          <div className="wl-regular__card-foot">this week</div>
        </div>

        {/* Card 2 — Weekly Rank */}
        <div className="wl-regular__card wl-regular__card--rank">
          <div className="wl-regular__card-label">WEEKLY RANK</div>
          <div className="wl-regular__card-value">
            <span className="wl-regular__card-num">#{weeklyRank ?? '—'}</span>
          </div>
          <div className="wl-regular__card-foot">
            of {typeof cohort === 'number' ? cohort.toLocaleString() : cohort}
          </div>
        </div>

        {/* Card 3 — Progress Ring + Rank Movement */}
        <div className="wl-regular__card wl-regular__card--ring">
          <div className="wl-regular__card-label">RANK POSITION</div>
          <div className="wl-regular__ring-wrap">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="5" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke="url(#wl-regular-grad)" strokeWidth="5" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 26}
                strokeDashoffset={2 * Math.PI * 26 * (1 - pct / 100)}
                transform="rotate(-90 32 32)"
              />
              <defs>
                <linearGradient id="wl-regular-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#06b6d4" />
                </linearGradient>
              </defs>
            </svg>
            <div className="wl-regular__ring-val">{pct}%</div>
          </div>
          <div className="wl-regular__card-foot">you are in the top {100 - pct}% of the cohort</div>
        </div>

        {/* Card 4 — Rank Movement */}
        <div className="wl-regular__card wl-regular__card--move">
          <div className="wl-regular__card-label">RANK MOVEMENT</div>
          <div className="wl-regular__move">
            <span className="wl-regular__move-arrow" style={{ color: arrow.color }}>{arrow.glyph}</span>
            <span className="wl-regular__move-val" style={{ color: arrow.color }}>
              {movement === 0 ? 'Holding' : `${Math.abs(movement)} ${movement > 0 ? 'up' : 'down'}`}
            </span>
          </div>
          <div className="wl-regular__card-foot">vs. last week</div>
        </div>
      </div>

      {/* Motivational progress block */}
      {me?.pointsToTop10 > 0 && (
        <motion.div className="wl-regular__cta"
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}
        >
          <div className="wl-regular__cta-top">
            <div className="wl-regular__cta-text">
              You're only <b>{displayTop} SP</b> away from entering the Top 10 this week.
            </div>
            <div className="wl-regular__cta-bar">
              <motion.div
                className="wl-regular__cta-fill"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.round((me.weeklySp / Math.max(me.weeklySp + me.pointsToTop10, 1)) * 100))}%` }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
              />
            </div>
          </div>
          <button
            type="button"
            className="wl-regular__btn wl-regular__btn--primary"
            onClick={onViewLeaderboard}
          >
            View Leaderboard
          </button>
        </motion.div>
      )}
    </motion.section>
  );
}