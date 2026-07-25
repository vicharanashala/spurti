import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// Top 10 Celebration Popup
// Premium glass card centered, ~45-50% of viewport width.
// Confetti / sparkles / poppers are SCOPED to the popup (not
// the whole dashboard). Closes via × button or "Continue".
// localStorage flag prevents re-showing within the same week.
// ============================================================

// localStorage key — keyed by Monday's ISO date so a new week re-enables.
const getDismissKey = (weekLabel) => `wl_top10_dismissed_${weekLabel}`;

function wasDismissedThisWeek(weekLabel) {
  try { return !!localStorage.getItem(getDismissKey(weekLabel)); } catch { return false; }
}
function markDismissedThisWeek(weekLabel) {
  try { localStorage.setItem(getDismissKey(weekLabel), '1'); } catch {}
}

// --- Particle primitives ---
function useRandomParticles(count, opts = {}) {
  return useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * (opts.maxDelay ?? 1.0),
    duration: 2.4 + Math.random() * 2.2,
    rotate: Math.random() * 360,
    drift: -20 + Math.random() * 40,
    size: 6 + Math.random() * 6,
    hue: opts.hues ? opts.hues[i % opts.hues.length] : null
  })), [count, opts.maxDelay, opts.hues]);
}

function ConfettiBits({ count = 28 }) {
  const particles = useRandomParticles(count, {
    maxDelay: 0.8,
    hues: ['#6366f1', '#8b5cf6', '#06b6d4', '#fbbf24', '#10b981', '#ec4899']
  });
  return (
    <div className="wl-t10__confetti" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="wl-t10__confetto"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
            width: `${p.size}px`,
            height: `${p.size * 0.5}px`,
            background: p.hue,
            '--drift': `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
}

function Sparkles({ count = 14 }) {
  const particles = useRandomParticles(count, { maxDelay: 2.0 });
  return (
    <div className="wl-t10__sparkles" aria-hidden="true">
      {particles.map(p => (
        <motion.span
          key={p.id}
          className="wl-t10__sparkle"
          style={{ left: `${p.left}%`, top: `${20 + Math.random() * 60}%` }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0.4, 1.2, 0.4] }}
          transition={{ duration: 2 + p.delay * 2, repeat: 5, delay: p.delay * 1.5, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

function PartyPoppers({ count = 6 }) {
  // Two popper bursts at the top corners of the popup.
  return (
    <div className="wl-t10__poppers" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const side = i % 2 === 0 ? 'left' : 'right';
        return (
          <motion.div
            key={i}
            className={`wl-t10__popper wl-t10__popper--${side}`}
            initial={{ opacity: 0, scale: 0, rotate: side === 'left' ? -20 : 20 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0, 1.05, 1, 0.9], rotate: side === 'left' ? [-20, 0, 0, -8] : [20, 0, 0, 8] }}
            transition={{ duration: 0.9, delay: 0.18 + i * 0.06, times: [0, 0.4, 0.8, 1], ease: 'easeOut' }}
          >
            <span className="wl-t10__popper-stream" />
            <span className="wl-t10__popper-stream wl-t10__popper-stream--alt" />
            <span className="wl-t10__popper-stream wl-t10__popper-stream--side" />
          </motion.div>
        );
      })}
    </div>
  );
}

export function Top10Popup({ open, onClose, data, onViewFullLeaderboard }) {
  const weekLabel = data?.week?.label;
  const top10 = data?.top10 || [];
  const me = data?.me;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="wl-t10-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog" aria-modal="true" aria-labelledby="wl-t10-title"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div className="wl-t10"
            initial={{ y: 24, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <PartyPoppers count={8} />
            <ConfettiBits count={36} />
            <Sparkles count={16} />

            <button type="button" className="wl-t10__close" onClick={onClose} aria-label="Close">×</button>

            <div className="wl-t10__inner">
              <motion.div
                className="wl-t10__header"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.15 }}
              >
                <div className="wl-t10__eyebrow">WEEKLY CHAMPIONS</div>
                <h2 id="wl-t10-title" className="wl-t10__title">
                  <span className="wl-t10__title-emoji" aria-hidden="true">🎉</span> Congratulations!
                </h2>
                <div className="wl-t10__sub">You are among the Top 10 Weekly Performers!</div>
              </motion.div>

              <ol className="wl-t10__list">
                {top10.map((row, i) => (
                  <motion.li
                    key={row.rank}
                    className={`wl-t10__row${row.isMe ? ' is-me' : ''}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.3 + i * 0.06 }}
                  >
                    <span className="wl-t10__rank">{row.rank}</span>
                    <span className="wl-t10__name">{row.name}</span>
                    <span className="wl-t10__sp">+{row.weeklySp}</span>
                    {row.isMe && <span className="wl-t10__you">You</span>}
                  </motion.li>
                ))}
              </ol>

              <motion.div className="wl-t10__actions"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.95 }}
              >
                <button type="button" className="wl-t10__btn wl-t10__btn--ghost" onClick={() => { markDismissedThisWeek(weekLabel); onClose(); }}>Continue to Dashboard</button>
                <button type="button" className="wl-t10__btn wl-t10__btn--primary" onClick={() => { markDismissedThisWeek(weekLabel); onViewFullLeaderboard ? onViewFullLeaderboard() : onClose(); }}>View Full Leaderboard</button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook to auto-show on data load, honoring the dismiss flag.
export function useAutoTop10(data) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!data) return;
    if (data.bucket !== 'top10') return;
    const weekLabel = data.week?.label;
    if (!weekLabel) return;
    if (wasDismissedThisWeek(weekLabel)) return;
    // Tiny delay so the dashboard mounts first and the celebration feels intentional.
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [data]);
  const close = () => {
    const weekLabel = data?.week?.label;
    if (weekLabel) markDismissedThisWeek(weekLabel);
    setOpen(false);
  };
  return { open, setOpen, close };
}