import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BadgeArt } from './BadgeArt';
import { RANK_DESCRIPTIONS } from './ranks';

// ============================================================
// AchievementCelebration
// Small bottom-right toast that appears when a new rank is unlocked.
// Auto-dismisses after a few seconds. Multiple toasts stack.
// ============================================================

export function AchievementCelebration({ queue, onDismiss }) {
  return (
    <div className="rk-celebration-stack">
      <AnimatePresence>
        {queue.map((evt) => (
          <motion.div
            key={evt.id}
            className="rk-celebration"
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            style={{ '--rk-glow': evt.to.theme.glow }}
          >
            <div className="rk-celebration__art">
              <BadgeArt tier={evt.to.tier} size={36} glow={evt.to.theme.glow} accent={evt.to.theme.accent} />
            </div>
            <div className="rk-celebration__body">
              <div className="rk-celebration__eyebrow">🎉 RANK UP</div>
              <div className="rk-celebration__title">
                Promoted to <span style={{ color: evt.to.theme.glow }}>{evt.to.name}</span>
              </div>
              <div className="rk-celebration__sub">{RANK_DESCRIPTIONS[evt.to.name]}</div>
            </div>
            <button
              type="button"
              className="rk-celebration__close"
              onClick={() => onDismiss(evt.id)}
              aria-label="Dismiss"
            >×</button>
            <div className="rk-celebration__timer">
              <motion.div
                className="rk-celebration__timer-fill"
                initial={{ width: '100%' }}
                animate={{ width: 0 }}
                transition={{ duration: 4.5, ease: 'linear' }}
                onAnimationComplete={() => onDismiss(evt.id)}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}