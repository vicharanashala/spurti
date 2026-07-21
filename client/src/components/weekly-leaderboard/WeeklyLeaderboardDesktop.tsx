import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import './WeeklyLeaderboardDesktop.css';
import { WeeklyLeaderboard } from './WeeklyLeaderboard';
import { RightRail } from './RightRail';
import { Top10Popup, useAutoTop10 } from './Top10Popup';
import { RegularUserCard } from './RegularUserCard';
import { FreshWeekEmpty } from './FreshWeekEmpty';
import { WeeklyChampionsPopup, wasChampionsDismissed, markChampionsDismissed } from '../weekly-recap/WeeklyChampionsPopup';
import { AIRecoveryCoachPopup, wasCoachDismissed, markCoachDismissed } from '../weekly-recap/AIRecoveryCoachPopup';
import { WeeklyGoalCard } from '../weekly-recap/WeeklyGoalCard';
import '../weekly-recap/WeeklyGoalCard.css';
import '../weekly-recap/WeeklyRecap.css';

// ============================================================
// Weekly Leaderboard — Desktop Shell
// Owns: theme state, data fetch, and the 3-column layout.
// Children (added in subsequent steps) render the experiences
// based on `data.bucket`:
//   'pre-start'  → empty state (fresh week)
//   'top10'      → top-10 popup experience
//   'regular'    → regular performance card
//   'bottom50'   → supportive catch-up experience
// ============================================================

const API = (typeof window !== 'undefined' && window.location.pathname.startsWith('/spurti') ? '/spurti' : '') + '/api';

const SIDEBAR_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: '◆', badge: null },
  { key: 'leaderboard', label: 'Weekly Leaderboard', icon: '★', badge: 'Live', active: true },
  { key: 'progress', label: 'My Progress', icon: '◐', badge: null },
  { key: 'learning', label: 'Learning Activities', icon: '✎', badge: null },
  { key: 'attendance', label: 'Attendance', icon: '◷', badge: null },
  { key: 'polls', label: 'Polls', icon: '◈', badge: null },
  { key: 'challenges', label: 'Challenges', icon: '⌬', badge: 'New' },
  { key: 'rewards', label: 'Rewards', icon: '◆', badge: null },
  { key: 'achievements', label: 'Achievements', icon: '✦', badge: null },
  { key: 'settings', label: 'Settings', icon: '⚙', badge: null }
];

function useCountdown(targetMs) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remain = Math.max(0, targetMs - now);
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  const s = Math.floor((remain % 60_000) / 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return { text: `${pad(h)}:${pad(m)}:${pad(s)}`, expired: remain <= 0 };
}

function Sidebar({ theme, onThemeToggle }) {
  return (
    <aside className="wl-side">
      <div className="wl-side__brand">
        <div className="wl-side__brand-mark">S</div>
        <div className="wl-side__brand-text">
          <div className="wl-side__brand-name">SPURTI</div>
          <div className="wl-side__brand-tag">VLED · IIT Ropar</div>
        </div>
      </div>

      <nav className="wl-side__nav" aria-label="Primary">
        {SIDEBAR_ITEMS.map(item => (
          <button
            key={item.key}
            type="button"
            className={`wl-side__item${item.active ? ' is-active' : ''}`}
            aria-current={item.active ? 'page' : undefined}
          >
            <span className="wl-side__icon" aria-hidden="true">{item.icon}</span>
            <span className="wl-side__label">{item.label}</span>
            {item.badge && <span className="wl-side__badge">{item.badge}</span>}
          </button>
        ))}
      </nav>

      <div className="wl-side__footer">
        <button type="button" className="wl-side__theme" onClick={onThemeToggle} aria-label="Toggle theme">
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
          <span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span>
        </button>
        <div className="wl-side__copy">© Spurti · IIT Ropar</div>
      </div>
    </aside>
  );
}

function Topbar({ data, theme, onThemeToggle, profile }) {
  const countdown = useCountdown(data?.deadline?.ms || 0);
  return (
    <header className="wl-top">
      <div className="wl-top__left">
        <div className="wl-top__brand">
          <span className="wl-top__brand-mark" aria-hidden="true">IIT</span>
          <div className="wl-top__brand-text">
            <div className="wl-top__brand-name">IIT Ropar · Internship</div>
            <div className="wl-top__brand-tag">Spurti Engagement Platform</div>
          </div>
        </div>
        <div className="wl-top__divider" />
        <div className="wl-top__week">
          <span className="wl-top__week-eyebrow">CURRENT WEEK</span>
          <span className="wl-top__week-label">{data?.week?.label || '—'}</span>
        </div>
      </div>

      <div className="wl-top__center">
        <div className="wl-top__search">
          <span className="wl-top__search-icon" aria-hidden="true">⌕</span>
          <input type="search" placeholder="Search students, sessions, polls…" />
        </div>
      </div>

      <div className="wl-top__right">
        <div className="wl-top__countdown" aria-label="Time until next deadline">
          <span className="wl-top__countdown-label">{data?.week?.phase === 'calculating' ? 'Results in' : 'Deadline'}</span>
          <span className="wl-top__countdown-time">{countdown.text}</span>
        </div>
        <button type="button" className="wl-top__icon-btn" aria-label="Notifications">
          <span aria-hidden="true">◔</span>
          <span className="wl-top__icon-dot" />
        </button>
        <button type="button" className="wl-top__icon-btn" onClick={onThemeToggle} aria-label="Toggle theme" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
        </button>
        <div className="wl-top__profile" tabIndex={0}>
          <div className="wl-top__avatar" aria-hidden="true">{(profile?.name || 'S').slice(0, 1).toUpperCase()}</div>
          <div className="wl-top__profile-text">
            <div className="wl-top__profile-name">{profile?.name || 'Student'}</div>
            <div className="wl-top__profile-meta">{profile?.email || ''}</div>
          </div>
        </div>
      </div>
    </header>
  );
}

function CenterColumn({ data, loading, error, onRetry, children }) {
  if (loading) {
    return (
      <div className="wl-center wl-center--loading">
        <div className="wl-skel wl-skel--title" />
        <div className="wl-skel wl-skel--row" />
        <div className="wl-skel wl-skel--row" />
        <div className="wl-skel wl-skel--row" />
        <div className="wl-loading-note">Calculating Weekly Champions…</div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="wl-center wl-center--error">
        <h2>⚠ Couldn't load the leaderboard</h2>
        <p>{error}</p>
        <button type="button" className="wl-btn wl-btn--primary" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return <div className="wl-center">{children}</div>;
}

function RightColumn({ data, children }) {
  return (
    <aside className="wl-right" aria-label="Sidebar">
      {children}
    </aside>
  );
}

export function WeeklyLeaderboardDesktop({ email, profile, inline = false }) {
  const [theme, setTheme] = useState('dark');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recap, setRecap] = useState(null);

  const fetchData = useCallback(async () => {
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/weekly/desktop?email=${encodeURIComponent(email)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to load');
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [email]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    document.documentElement.dataset.wlTheme = theme;
  }, [theme]);

  // Fetch the weekly recap (last week's champions + this student's
  // bottom-50 AI recovery plan if applicable). The recap populates
  // the Monday-morning popups.
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    fetch(`${API}/weekly/recap?email=${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error('recap failed')))
      .then(j => { if (!cancelled) setRecap(j); })
      .catch(() => { /* silent — popups simply don't appear */ });
    return () => { cancelled = true; };
  }, [email]);

  const t10 = useAutoTop10(data);

  // Weekly recap popups — Champions first (everyone), then AI Coach
  // (only bottom-50 students). Dismissed flags are keyed on recapId
  // (weekStart) so each popup shows only once per week.
  const recapOpen = useWeeklyRecapPopups(email, recap);

  const body = (
    <>
      {/* Full-width Weekly Goal Card — sits below the topbar, above the
          3-col body grid. Spec: "Display the card below the top navigation" */}
      <WeeklyGoalCard recapData={recap} profile={profile} />
      <div className="wl-body">
        <CenterColumn data={data} loading={loading} error={error} onRetry={fetchData}>
          {data?.me?.weeklySp === 0 && data?.week?.phase !== 'calculating' && (
            <FreshWeekEmpty data={data} />
          )}
          {data?.bucket === 'regular' && data?.me?.weeklySp > 0 && (
            <RegularUserCard data={data} profile={profile} onViewLeaderboard={() => {}} />
          )}
          <WeeklyLeaderboard data={data} />
        </CenterColumn>
        <RightColumn data={data}>
          <RightRail data={data} profile={profile} />
        </RightColumn>
      </div>
    </>
  );

  if (inline) {
    // Render only the body (3-col grid + theme-aware chrome) so the host
    // page's own sidebar / topbar remain visible. The full App theme
    // already inherits the design tokens.
    return (
      <div className={`wl-shell-inline wl-shell--${theme}`} data-theme={theme}>
        {body}
        <Top10Popup open={t10.open} onClose={t10.close} data={data} />
        <WeeklyChampionsPopup
          open={recapOpen.showChampions}
          onClose={() => { markChampionsDismissed(recap?.recapId); recapOpen.closeChampions(); }}
          recap={recap?.recap}
          recapId={recap?.recapId}
        />
        <AIRecoveryCoachPopup
          open={recapOpen.showCoach}
          onClose={() => { markCoachDismissed(recap?.recapId); recapOpen.closeCoach(); }}
          plan={recap?.plan}
          recapId={recap?.recapId}
          email={email}
        />
      </div>
    );
  }

  return (
    <div className={`wl-shell wl-shell--${theme}`} data-theme={theme}>
      <Sidebar theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      <div className="wl-main">
        <Topbar data={data} theme={theme} onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} profile={profile} />
        {body}
      </div>
      <Top10Popup open={t10.open} onClose={t10.close} data={data} />
      <WeeklyChampionsPopup
        open={recapOpen.showChampions}
        onClose={() => { markChampionsDismissed(recap?.recapId); recapOpen.closeChampions(); }}
        recap={recap?.recap}
        recapId={recap?.recapId}
      />
      <AIRecoveryCoachPopup
        open={recapOpen.showCoach}
        onClose={() => { markCoachDismissed(recap?.recapId); recapOpen.closeCoach(); }}
        plan={recap?.plan}
        recapId={recap?.recapId}
        email={email}
      />
    </div>
  );
}

// ============================================================
// useWeeklyRecapPopups
// State machine for the Monday-morning recap experience:
//   1. Champions popup (everyone) — opens first
//   2. AI Coach popup (bottom-50 only) — opens after Champions closes
// Each popup shows only once per week (recapId = weekStart key).
// ============================================================
function useWeeklyRecapPopups(email, recap) {
  const [showChampions, setShowChampions] = useState(false);
  const [showCoach, setShowCoach] = useState(false);

  // When the recap arrives (or user changes), trigger the cascade.
  useEffect(() => {
    if (!recap || !recap.recap || !recap.recapId) return;
    if (!email) return;
    // Skip if both already dismissed this week.
    const champDismissed = wasChampionsDismissed(recap.recapId);
    const coachDismissed = wasCoachDismissed(recap.recapId);
    if (champDismissed && (coachDismissed || !recap.plan)) return;

    // Tiny delay so the dashboard mounts first — feels intentional.
    const t = setTimeout(() => {
      if (!champDismissed) setShowChampions(true);
      // AI Coach opens after Champions closes (handled in closeChampions).
      else if (!coachDismissed && recap.plan) setShowCoach(true);
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recap?.recapId, recap?.plan, email]);

  return {
    showChampions,
    showCoach,
    closeChampions: () => {
      setShowChampions(false);
      // Cascade to AI Coach if applicable and not yet dismissed.
      if (recap?.plan && recap?.recapId && !wasCoachDismissed(recap.recapId)) {
        setTimeout(() => setShowCoach(true), 400);
      }
    },
    closeCoach: () => setShowCoach(false)
  };
}
