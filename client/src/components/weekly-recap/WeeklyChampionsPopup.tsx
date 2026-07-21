import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// WeeklyChampionsPopup
// Shown once per week to EVERY student after Monday 06:00 IST.
// Glass card celebrating last week's Top 10. Rank 1 gets a soft
// golden glow. Dismiss writes localStorage flag keyed by weekStart
// so the popup never re-appears for the same week.
// ============================================================

function badgePalette(badge) {
  const b = String(badge || '').toLowerCase();
  if (b.includes('top performer')) return { bg: '#fbbf24', fg: '#1f1500' };
  if (b.includes('attendance'))    return { bg: '#10b981', fg: '#022c1f' };
  if (b.includes('poll'))          return { bg: '#3b82f6', fg: '#04203f' };
  if (b.includes('challenge'))     return { bg: '#8b5cf6', fg: '#2a1065' };
  if (b.includes('consistent'))   return { bg: '#06b6d4', fg: '#03232a' };
  if (b.includes('active'))        return { bg: '#22c55e', fg: '#042c11' };
  return { bg: '#94a3b8', fg: '#0f172a' };
}

function Row({ row, idx }) {
  const pal = badgePalette(row.weeklyBadge);
  return (
    <motion.div
      className={`rc-champ__row${idx === 0 ? ' is-gold' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.3 + idx * 0.06 }}
    >
      <span className={`rc-champ__rank rc-champ__rank--${row.rank <= 3 ? `p${row.rank}` : 'plain'}`}>
        {row.rank}
      </span>
      <span className="rc-champ__name">{row.name}</span>
      <span className="rc-champ__sp">+{row.weeklySp}</span>
      <span
        className="rc-champ__badge"
        title={row.weeklyBadge}
        style={{ background: pal.bg, color: pal.fg }}
      >
        {row.weeklyBadge || 'Starter'}
      </span>
      <span className="rc-champ__pct" title="Learning consistency">{row.learningPct}%</span>
    </motion.div>
  );
}

export function WeeklyChampionsPopup({ open, onClose, recap, recapId }) {
  const weekRange = useMemo(() => {
    if (!recap) return '';
    return recap.weekStart === recap.weekEnd
      ? recap.weekStart
      : `${recap.weekStart} → ${recap.weekEnd}`;
  }, [recap]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="rc-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rc-champ-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="rc-champ"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="rc-overlay__close"
              onClick={onClose}
              aria-label="Close"
              autoFocus
            >×</button>

            <header className="rc-champ__head">
              <div className="rc-champ__eyebrow">WEEKLY RECAP · {weekRange}</div>
              <h2 id="rc-champ-title" className="rc-champ__title">
                <span className="rc-champ__emoji" aria-hidden="true">🏆</span>
                Weekly Learning Champions
              </h2>
              <p className="rc-champ__sub">
                Congratulations to last week's Top 10 performers! They demonstrated outstanding consistency, participation, and learning.
              </p>
            </header>

            <ol className="rc-champ__list">
              {recap?.top10?.map((r, i) => <Row key={r.email || r.rank} row={r} idx={i} />)}
            </ol>

            <footer className="rc-champ__foot">
              <div className="rc-champ__new">
                <div className="rc-champ__new-eyebrow">✨ NEW WEEK STARTED</div>
                <div className="rc-champ__new-text">Everyone starts again from zero. Build your learning journey this week.</div>
              </div>
              <button type="button" className="rc-champ__btn" onClick={onClose}>
                Start My Week
              </button>
            </footer>

            {recapId && (
              <div className="rc-champ__stamp" aria-hidden="true">
                Week {recapId}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook: track dismissal per-week via localStorage.
export function wasChampionsDismissed(recapId) {
  if (!recapId) return true;
  try { return !!localStorage.getItem(`rc_champ_dismissed_${recapId}`); }
  catch { return false; }
}

export function markChampionsDismissed(recapId) {
  if (!recapId) return;
  try { localStorage.setItem(`rc_champ_dismissed_${recapId}`, '1'); }
  catch {}
}