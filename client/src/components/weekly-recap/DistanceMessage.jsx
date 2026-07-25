import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// DistanceMessage
// Subtle one-liner that appears below the popup right after the
// Champions or AI Coach popup closes. Picks the right message based
// on the student's position last week:
//   - ranks 1-10    → "You made the Top 10 last week. Keep going!"
//   - ranks 11-25   → "You were only N ranks away from the Top 10. Keep going!"
//   - ranks elsewhere, pointsToTop10 set → "You are N SP away from
//     appearing on next week's Weekly Champions board."
//   - bottom 50     → "By completing attendance, polls, this week, you
//     could move from the Bottom 50 into the Top 30."
// Auto-dismisses after 6 seconds.
// ============================================================

function buildMessage({ top10, myRank, pointsToTop10 }) {
  if (!top10) return null;
  const isInTop10 = Number(myRank) > 0 && Number(myRank) <= 10;
  if (isInTop10) {
    return {
      glyph: '🏆',
      headline: 'You were on the Top 10 leaderboard last week.',
      sub: 'Keep your consistency — defend your spot.'
    };
  }
  const ranksAway = Number(myRank) - 10;
  if (ranksAway > 0 && ranksAway <= 25) {
    return {
      glyph: '🎯',
      headline: `You were only ${ranksAway} rank${ranksAway === 1 ? '' : 's'} away from the Top 10 last week.`,
      sub: 'Keep going — one solid week puts you on the board.'
    };
  }
  if (Number(pointsToTop10) > 0) {
    return {
      glyph: '✨',
      headline: `You are ${pointsToTop10} SP away from appearing on next week's Weekly Champions board.`,
      sub: 'Steady attendance + polls + challenge put you there.'
    };
  }
  return {
    glyph: '✨',
    headline: 'A new week is here.',
    sub: 'Build the streak — every session counts.'
  };
}

export function DistanceMessage({ recap, variant = 'champions', onDismiss }) {
  const open = !!recap;
  const message = buildMessage(recap || {});

  // Auto-dismiss after 6 seconds (matches the spec's "subtle message"
  // tone — long enough to read, short enough not to get in the way).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => onDismiss?.(), 6000);
    return () => clearTimeout(t);
  }, [open, onDismiss]);

  return (
    <AnimatePresence>
      {open && message && (
        <motion.div
          className={`rc-distance rc-distance--${variant}`}
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="rc-distance__glyph" aria-hidden="true">{message.glyph}</div>
          <div className="rc-distance__body">
            <div className="rc-distance__headline">{message.headline}</div>
            <div className="rc-distance__sub">{message.sub}</div>
          </div>
          <button
            type="button"
            className="rc-distance__close"
            onClick={() => onDismiss?.()}
            aria-label="Dismiss"
          >×</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================
// Bottom50Message — variant for the bottom-50 cohort. Different copy
// tones it differently: instead of "0 ranks away", it focuses on
// forward momentum: how a recovery plan this week can lift them out.
// ============================================================
export function Bottom50Message({ recap, onDismiss }) {
  return (
    <DistanceMessage
      recap={recap}
      variant="bottom50"
      onDismiss={onDismiss}
    />
  );
}