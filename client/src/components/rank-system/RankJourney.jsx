import React, { useEffect, useRef, useState } from 'react';
import { CurrentRankBadge, JourneyProgressTrack } from './JourneyProgressTrack';
import { AchievementCelebration } from './AchievementCelebration';
import { rankFor } from './ranks';
import './rank-system.css';

// ============================================================
// RankJourney
// Top-level page-level container that combines:
//   - CurrentRankBadge (the hero — current rank + description)
//   - JourneyProgressTrack (the long track with 16 checkpoints)
//   - AchievementCelebration (bottom-right toast when rank up)
// Listens to SP changes (via props) and queues promotion toasts.
// ============================================================

export function RankJourney({ sp, profile }) {
  const [toasts, setToasts] = useState([]);
  const toastSeq = useRef(0);
  const previousSp = useRef(sp);
  const previousRankIdx = useRef(rankFor(sp).idx);

  // Detect rank-up events and queue a celebration toast.
  useEffect(() => {
    const newRank = rankFor(sp);
    if (newRank.idx > previousRankIdx.current) {
      toastSeq.current += 1;
      const id = toastSeq.current;
      setToasts(prev => [...prev, { id, to: newRank }]);
      previousRankIdx.current = newRank.idx;
    } else if (sp !== previousSp.current) {
      previousRankIdx.current = newRank.idx;
    }
    previousSp.current = sp;
  }, [sp, toastSeq]);

  const dismiss = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <div className="rank-journey">
      <CurrentRankBadge sp={sp} profile={profile} />
      <JourneyProgressTrack
        sp={sp}
        onPromoted={(evt) => {
          toastSeq.current += 1;
          const id = toastSeq.current;
          setToasts(prev => [...prev, { id, to: evt.to }]);
        }}
      />
      <AchievementCelebration queue={toasts} onDismiss={dismiss} />
    </div>
  );
}