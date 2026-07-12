import { useState, useEffect } from 'react';
import { getDevAsEmail } from './devAsEmail.js';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const BRANCH_META = {
  consistency: { cls: 'sb-consistency', short: 'C' },
  curiosity:   { cls: 'sb-curiosity',   short: 'Q' },
  momentum:    { cls: 'sb-momentum',    short: 'M' },
  excellence:  { cls: 'sb-excellence',  short: 'E' },
};

/**
 * SkillBadges — small inline pill set showing the highest earned title
 * per branch for one student. Skips branches with no unlocks.
 *
 * Modes:
 *   compact = single row of pills (for leaderboard rows, admin tables)
 *   header  = stacked pill set with branch initial (for topbar, ghost-race, wrapped)
 *
 * Falls back silently to no render on any error so a badged-row never
 * breaks the surface it's decorating.
 */
export default function SkillBadges({ email, mode = 'compact' }) {
  const [titles, setTitles] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!email) return;
    (async () => {
      try {
        const params = getDevAsEmail() ? { asEmail: getDevAsEmail() } : {};
        const r = await fetch(`${API}/skill-tree/badges?${new URLSearchParams(params).toString()}`);
        if (cancelled) return;
        if (!r.ok) {
          setError(true);
          return;
        }
        const d = await r.json();
        if (!cancelled) setTitles(d.titles);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [email]);

  if (error || !titles) return null;

  const entries = Object.entries(titles).filter(([, t]) => t);
  if (entries.length === 0) return null;

  if (mode === 'header') {
    return (
      <div className="skillbadges skillbadges-header" aria-label="Earned skill titles">
        {entries.map(([branch, title]) => {
          const meta = BRANCH_META[branch];
          return (
            <span
              key={branch}
              className={`skillbadge ${meta.cls}`}
              title={`${branch}: ${title}`}
            >
              <span className="skillbadge-mark">{meta.short}</span>
              <span className="skillbadge-title">{title}</span>
            </span>
          );
        })}
      </div>
    );
  }

  // compact (default) — single-line pills, used in leaderboard rows, admin table
  return (
    <span className="skillbadges skillbadges-compact" aria-label="Earned skill titles">
      {entries.map(([branch, title]) => {
        const meta = BRANCH_META[branch];
        return (
          <span
            key={branch}
            className={`skillbadge skillbadge-compact ${meta.cls}`}
            title={`${branch}: ${title}`}
          >
            <span className="skillbadge-mark">{meta.short}</span>
            <span className="skillbadge-title">{title}</span>
          </span>
        );
      })}
    </span>
  );
}