import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { StorySlide } from './StorySlide';
import { buildFinalJourney } from './replayEngine';

function makeJourneySlides(j) {
  if (!j) return [];
  return [
    { eyebrow: '🌌 YOUR SPURTI JOURNEY', title: j.studentName || 'Your Story', count: 1, suffix: '', subtitle: 'A complete picture of what you did and who you became.', gradient: 'linear-gradient(160deg, #020617 0%, #1E1B4B 100%)', decor: 'sparkles', autoMs: 3500 },
    { eyebrow: '🌱 THE BEGINNING', count: j.startRank, suffix: '', subtitle: 'You started here. Small numbers, big journey ahead.', gradient: 'linear-gradient(160deg, #1E293B 0%, #334155 100%)', autoMs: 4000 },
    { eyebrow: '📈 THE CLIMB', count: 1, suffix: '', subtitle: 'From your starting rank to where you ended up.', gradient: 'linear-gradient(160deg, #1E3A8A 0%, #7C3AED 100%)', autoMs: 5000, decor: 'rankline', from: j.startRank, to: j.endRank },
    { eyebrow: '👑 THE REVEAL', count: j.endRank, suffix: '', subtitle: 'You ended at this rank. The climb was real.', gradient: 'linear-gradient(160deg, #92400E 0%, #FBBF24 100%)', autoMs: 4500, decor: 'confetti' },
    { eyebrow: '💎 SP EARNED', count: j.totalSp, suffix: ' SP', subtitle: 'Every point is a footprint. Look at all of them.', gradient: 'linear-gradient(160deg, #78350F 0%, #D97706 100%)', autoMs: 4500 },
    { eyebrow: '📊 TOTAL ACTIVITY', count: 3, subtitle: 'The compound effect of showing up.', gradient: 'linear-gradient(160deg, #0E7490 0%, #164E63 100%)', autoMs: 4500, trio: [{ label: 'Sessions', value: j.sessionsAttended }, { label: 'Polls Answered', value: j.pollsAnswered }, { label: 'Longest Streak', value: (j.longestStreak || 0) + ' d' }] },
    { eyebrow: '🏆 BEST ACHIEVEMENT', count: 1, suffix: '', subtitle: j.bestAchievement, gradient: 'linear-gradient(160deg, #581C87 0%, #BE185D 100%)', autoMs: 5000 },
    { eyebrow: '🧬 EVOLUTION', count: 1, suffix: '', subtitle: 'You started as ' + (j.personaEvolution && j.personaEvolution.from) + ' — you became ' + (j.personaEvolution && j.personaEvolution.to) + '.', gradient: 'linear-gradient(160deg, #312E81 0%, #DB2777 100%)', autoMs: 5000 },
    { eyebrow: '🎉 THANK YOU', title: 'For Growing With Spurti', count: 1, suffix: '', subtitle: 'Your story matters. Share it, or save it forever.', gradient: 'linear-gradient(160deg, #7C2D12 0%, #F59E0B 100%)', autoMs: 4500, decor: 'confetti',
      cta: [
        { label: '📤 Share', onClick: () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('replay:open-share', { detail: { kind: 'final', data: j } })); } },
        { label: 'Close', onClick: () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('replay:close')); }, primary: true }
      ]
    }
  ];
}

export const FinalJourneyModal = ({ open, onClose, profile, studentName }) => {
  const j = useMemo(() => profile ? { ...buildFinalJourney(profile), studentName: studentName || (profile.student && profile.student.name) || 'You' } : null, [profile, studentName]);
  const slides = useMemo(() => makeJourneySlides(j), [j]);
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
        <motion.div className="replay-modal replay-modal--final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
          <div className="replay-modal__stage">
            <AnimatePresence mode="wait">
              {slides[idx] && (
                <StorySlide key={idx} slide={slides[idx]} index={idx} total={slides.length} onNext={goNextAuto} onPrev={go} autoMs={slides[idx].autoMs} />
              )}
            </AnimatePresence>
          </div>
          {idx === slides.length - 1 && (
            <div className="replay-modal__endbar">
              <button type="button" className="replay-endbar__btn" onClick={() => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('replay:open-share', { detail: { kind: 'final', data: j } })); }}>📤 Share</button>
              <button type="button" className="replay-endbar__btn is-primary" onClick={onClose}>Close</button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};