import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StorySlide } from './StorySlide';
import { buildWeeklyReplay } from './replayEngine';

function makeSlides(data) {
  if (!data) return [];
  return [
    { eyebrow: '🎬 WEEKLY REPLAY', title: 'Your Week in Spurti', count: 1, suffix: '', subtitle: 'A look back at what you did this week.', gradient: 'linear-gradient(160deg, #0F172A 0%, #312E81 100%)', decor: 'sparkles', autoMs: 3000 },
    { eyebrow: '📅 SESSIONS', count: data.sessionsAttended || 0, subtitle: data.sessionsAttended > 0 ? 'You showed up. That is most of the battle.' : 'Try to attend at least one session this coming week.', gradient: 'linear-gradient(160deg, #0E7490 0%, #164E63 100%)', autoMs: 3500 },
    { eyebrow: '🗳 POLLS', count: data.pollsAnswered || 0, subtitle: data.pollsAnswered > 0 ? 'Your voice shaped the discussion.' : 'Submit one poll this week to boost this number.', gradient: 'linear-gradient(160deg, #4C1D95 0%, #1E3A8A 100%)', autoMs: 3500 },
    { eyebrow: '💎 SP EARNED', count: data.spEarned || 0, subtitle: data.spEarned > 0 ? 'Every point reflects real activity.' : 'Pick up one small action tomorrow to restart the count.', gradient: 'linear-gradient(160deg, #92400E 0%, #D97706 100%)', autoMs: 3500 },
    { eyebrow: '📊 WEEK HIGHLIGHTS', count: 3, subtitle: 'Three quick stats from your week.', gradient: 'linear-gradient(160deg, #581C87 0%, #831843 100%)', autoMs: 4500, trio: [{ label: 'Highest Rank', value: data.highestRank != null ? '#' + data.highestRank : '—' }, { label: 'Best Day', value: data.bestDayName || '—' }, { label: 'Longest Streak', value: (data.longestStreakInWeek || 0) + ' d' }] },
    { eyebrow: '📈 MOST IMPROVED', count: data.most_improved_pct || 0, suffix: '%', subtitle: (data.most_improved || 'Attendance') + ' grew the most this week. Keep stacking.', gradient: 'linear-gradient(160deg, #064E3B 0%, #0D9488 100%)', autoMs: 4500, decor: 'confetti' }
  ];
}

export const WeeklyReplayModal = ({ open, onClose, profile, onOpenShare }) => {
  const data = useMemo(() => profile ? buildWeeklyReplay(profile) : null, [profile]);
  const slides = useMemo(() => makeSlides(data), [data]);
  const [idx, setIdx] = useState(0);
  function go(next) {
    if (next === 'close') return onClose && onClose();
    if (next === 'prev') setIdx(i => Math.max(0, i - 1));
    if (next === 'next') setIdx(i => Math.min(slides.length - 1, i + 1));
  }
  function goNextAuto() { setIdx(i => Math.min(slides.length - 1, i + 1)); }
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="replay-modal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <div className="replay-modal__stage">
            <AnimatePresence mode="wait">
              {slides[idx] && (
                <StorySlide key={idx} slide={slides[idx]} index={idx} total={slides.length} onNext={goNextAuto} onPrev={go} autoMs={slides[idx].autoMs} />
              )}
            </AnimatePresence>
          </div>
          {idx === slides.length - 1 && (
            <div className="replay-modal__endbar">
              <button type="button" className="replay-endbar__btn" onClick={() => onOpenShare && onOpenShare('weekly', data)}>📤 Share</button>
              <button type="button" className="replay-endbar__btn is-primary" onClick={onClose}>Close</button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};