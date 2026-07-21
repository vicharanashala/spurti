import React from 'react';
import { motion } from 'framer-motion';

export const EntryPill = ({ kind = 'weekly', onClick }) => {
  if (kind === 'leaderboard') {
    return (
      <motion.button
        type="button"
        className="entry-pill entry-pill--leaderboard"
        onClick={onClick}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, scale: 1.01 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <span className="entry-pill__icon" aria-hidden="true">🏆</span>
        <span className="entry-pill__text">Weekly Leaderboard is Live!</span>
        <span className="entry-pill__chev" aria-hidden="true">→</span>
      </motion.button>
    );
  }
  if (kind === 'final') {
    return (
      <motion.button
        type="button"
        className="entry-pill entry-pill--final"
        onClick={onClick}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, scale: 1.01 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <span className="entry-pill__icon" aria-hidden="true">🎉</span>
        <span className="entry-pill__text">Your Spurti Journey is Ready!</span>
        <span className="entry-pill__chev" aria-hidden="true">→</span>
      </motion.button>
    );
  }
  return (
    <motion.button
      type="button"
      className="entry-pill entry-pill--weekly"
      onClick={onClick}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <span className="entry-pill__icon" aria-hidden="true">🎬</span>
      <span className="entry-pill__text">Your Week is Ready!</span>
      <span className="entry-pill__chev" aria-hidden="true">→</span>
    </motion.button>
  );
};