import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './RecoveryCoachPopup.css';

// ============================================================
// RecoveryCoachPopup (case 4)
// Full-screen premium popup shown AFTER the WeeklyLearningInsightsPopup
// for students in the bottom 50 of the previous week. Never uses
// the words "Bottom 50". Instead provides a calm, AI-style recovery
// plan with a Mon-Sat schedule, predicted outcomes, and an
// encouraging message. Auto-dismisses after 12 seconds, or via the
// "Start My Recovery Plan" / "Dismiss" buttons.
// ============================================================

const RECOVERY_PLAN = [
  { day: 'Monday',    items: ['Attend the live session', 'Complete all polls'] },
  { day: 'Tuesday',   items: ['Attend the session', 'Join one discussion'] },
  { day: 'Wednesday', items: ['Attend the session', 'Complete polls', 'Weekly challenge'] },
  { day: 'Thursday',  items: ['Attend the session', 'Join one discussion'] },
  { day: 'Friday',    items: ['Attend the session', 'Complete polls', 'One learning module'] },
  { day: 'Saturday',  items: ['Attend the session', 'Finalize the challenge'] }
];

function estimateOutcomes(me) {
  const att = me?.attendanceCount || 0;
  const pol = me?.pollCount || 0;
  const sp  = me?.weeklySp || 0;
  const estAtt = Math.min(100, Math.max(50, (att / 5) * 100 + 25));
  const estPol = Math.min(100, Math.max(60, (pol / 5) * 100 + 30));
  const estSp  = Math.max(15, sp + 12);
  const rank = me?.weeklyRank || 1000;
  const estRank = Math.max(1, Math.max(11, rank - 35));
  return { estAtt, estPol, estSp, estRank };
}

function buildObservations(me) {
  const list = [];
  if ((me?.attendanceCount || 0) >= 1) list.push('You showed up this week — that’s the foundation.');
  if ((me?.pollCount || 0) >= 1) list.push('You already completed some polls — keep that streak going.');
  if ((me?.challengeCount || 0) >= 1) list.push('You engaged with a weekly challenge — momentum is real.');
  if ((me?.weeklySp || 0) > 0) list.push(`You already earned ${me.weeklySp} SP last week — that's a base.`);
  if (list.length === 0) list.push('You logged in this week — the first step is done.');
  return list.slice(0, 3);
}

export function RecoveryCoachPopup({ open, onClose, me, recapId, email }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { setDismissed(true); onClose?.(); }, 12000);
    return () => clearTimeout(t);
  }, [open, onClose]);

  if (!open || !me) return null;

  const outcomes = estimateOutcomes(me);
  const observations = buildObservations(me);

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          className="rcp-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rcp-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="rcp"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="rcp__close"
              onClick={onClose}
              aria-label="Close"
            >×</button>

            <header className="rcp__head">
              <div className="rcp__eyebrow">AI LEARNING COACH</div>
              <h2 id="rcp-title" className="rcp__title">💙 Your AI Learning Coach</h2>
              <p className="rcp__sub">
                Every great learner improves step by step. This week is a new opportunity.
              </p>
            </header>

            <div className="rcp__divider" />

            <div className="rcp__section">
              <div className="rcp__section-eyebrow">✅ What You Already Have</div>
              <ul className="rcp__list">
                {observations.map((line, i) => (
                  <li key={i}><span className="rcp__check rcp__check--ok">✓</span>{line}</li>
                ))}
              </ul>
            </div>

            <div className="rcp__section">
              <div className="rcp__section-eyebrow">📅 Mon → Sat · Recovery Plan</div>
              <div className="rcp__plan">
                {RECOVERY_PLAN.map(d => (
                  <div key={d.day} className="rcp__plan-day">
                    <div className="rcp__plan-day-name">{d.day}</div>
                    {d.items.map((it, i) => (
                      <div key={i} className="rcp__plan-item">
                        <span className="rcp__plan-check" aria-hidden="true">✓</span>
                        <span>{it}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="rcp__section">
              <div className="rcp__section-eyebrow">📈 Estimated Outcome</div>
              <div className="rcp__outcomes">
                <div className="rcp__outcome">
                  <div className="rcp__outcome-label">Estimated Attendance</div>
                  <div className="rcp__outcome-val rcp__outcome-val--blue">{outcomes.estAtt}%</div>
                </div>
                <div className="rcp__outcome">
                  <div className="rcp__outcome-label">Expected Poll Completion</div>
                  <div className="rcp__outcome-val rcp__outcome-val--blue">{outcomes.estPol}%</div>
                </div>
                <div className="rcp__outcome">
                  <div className="rcp__outcome-label">Expected Spurti Points</div>
                  <div className="rcp__outcome-val rcp__outcome-val--green">+{outcomes.estSp}</div>
                </div>
                <div className="rcp__outcome">
                  <div className="rcp__outcome-label">Estimated Rank</div>
                  <div className="rcp__outcome-val rcp__outcome-val--purple">Top {outcomes.estRank}</div>
                </div>
              </div>
            </div>

            <div className="rcp__divider" />

            <div className="rcp__encourage">
              <p className="rcp__encourage-title">💙 You Can Do It!</p>
              <p className="rcp__encourage-body">
                Every great learner starts somewhere. This is just the beginning of your learning journey.
                Stay consistent, participate every day, and you'll be surprised how quickly you climb the leaderboard.
              </p>
              <p className="rcp__encourage-msg">✨ Small improvements every day create remarkable results.</p>
            </div>

            <div className="rcp__actions">
              <button type="button" className="rcp__btn rcp__btn--primary" onClick={onClose}>
                Start My Recovery Plan
              </button>
              <button type="button" className="rcp__btn rcp__btn--ghost" onClick={onClose}>
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function wasRecoveryCoachDismissed(recapId) {
  if (!recapId) return true;
  try { return !!localStorage.getItem(`rcp_dismissed_${recapId}`); }
  catch { return false; }
}

export function markRecoveryCoachDismissed(recapId) {
  if (!recapId) return;
  try { localStorage.setItem(`rcp_dismissed_${recapId}`, '1'); }
  catch {}
}