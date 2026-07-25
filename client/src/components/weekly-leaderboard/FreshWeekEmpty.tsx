import React from 'react';
import { motion } from 'framer-motion';

// ============================================================
// FreshWeekEmpty
// Shown ABOVE the leaderboard when the user opens the site
// after Monday 06:00 IST with no weekly SP yet — they get a
// motivating "fresh start" frame with two stat blocks.
// ============================================================

export function FreshWeekEmpty({ data }) {
  const week = data?.week?.label || 'This Week';
  const phase = data?.week?.phase || 'live';
  const isCalculating = phase === 'calculating';

  return (
    <motion.section className="wl-fresh"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
    >
      <div className="wl-fresh__bg" aria-hidden="true">
        <span className="wl-fresh__bg-blob wl-fresh__bg-blob--1" />
        <span className="wl-fresh__bg-blob wl-fresh__bg-blob--2" />
        <span className="wl-fresh__bg-blob wl-fresh__bg-blob--3" />
      </div>

      <div className="wl-fresh__hero">
        <motion.div className="wl-fresh__rocket"
          initial={{ y: 0 }} animate={{ y: [0, -4, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden="true"
        >🚀</motion.div>
        <div className="wl-fresh__hero-body">
          <div className="wl-fresh__eyebrow">{week}{isCalculating ? ' · CALCULATING WINNERS' : ' · NEW WEEK'}</div>
          <h2 className="wl-fresh__title">
            {isCalculating ? 'Calculating Weekly Champions…' : 'A New Weekly Challenge Has Begun!'}
          </h2>
          <p className="wl-fresh__sub">
            Start earning Spurti Points through attendance, polls, learning activities, discussions, and bonus tasks.
          </p>
        </div>
      </div>

      <div className="wl-fresh__stats">
        <div className="wl-fresh__stat">
          <div className="wl-fresh__stat-label">CURRENT RANK</div>
          <div className="wl-fresh__stat-value wl-fresh__stat-value--muted">Not Ranked Yet</div>
          <div className="wl-fresh__stat-foot">waiting for your first activity</div>
        </div>
        <div className="wl-fresh__stat">
          <div className="wl-fresh__stat-label">WEEKLY POINTS</div>
          <div className="wl-fresh__stat-value">0</div>
          <div className="wl-fresh__stat-foot">your first session = +10 SP</div>
        </div>
      </div>
    </motion.section>
  );
}