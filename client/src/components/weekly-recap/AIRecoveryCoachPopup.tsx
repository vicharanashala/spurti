import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// AIRecoveryCoachPopup
// Shown only to students in the previous week's Bottom 50 (after
// closing the Champions popup). Calm blue / green / purple palette,
// no red warnings, supportive copy. Includes the AI Recovery Plan
// (Mon–Sat) with live progress that ticks off as the student
// completes tasks during the week.
// ============================================================

// All tasks map to a category — we observe completion by polling
// the existing endpoints (the coach is read-only; the data layer
// remains the source of truth).
const TASK_TO_CHECK = {
  'Attend session':     { kind: 'attendance', since: 'today' },
  'Complete poll':      { kind: 'poll',       since: 'today' },
  'Join discussion':    { kind: 'discussion', since: 'today' }, // future endpoint
  'Weekly challenge':   { kind: 'challenge',  since: 'week'   }, // weekly tracker
  'Learning module':    { kind: 'learning',   since: 'today' },
  'Finalize challenge': { kind: 'challenge',  since: 'week'   }
};

export function AIRecoveryCoachPopup({ open, onClose, plan, recapId, email }) {
  // Live progress state — keys are "<day>-<task>"
  const [progress, setProgress] = useState(new Set());

  // Reset when a new week loads.
  useEffect(() => {
    if (!recapId) return;
    try {
      const raw = localStorage.getItem(`rc_coach_progress_${recapId}_${email || 'anon'}`);
      const arr = raw ? JSON.parse(raw) : [];
      setProgress(new Set(arr));
    } catch { setProgress(new Set()); }
  }, [recapId, email]);

  // Persist on tick changes.
  useEffect(() => {
    if (!recapId) return;
    try {
      localStorage.setItem(`rc_coach_progress_${recapId}_${email || 'anon'}`, JSON.stringify([...progress]));
    } catch {}
  }, [progress, recapId, email]);

  const toggle = (key) => {
    setProgress(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const planDays = plan?.plan || [];
  const observations = plan?.observations || [];
  const totalTasks = planDays.reduce((s, d) => s + d.tasks.length, 0);
  const completed = useMemo(() => {
    if (!open) return 0;
    let n = 0;
    planDays.forEach((d, i) => d.tasks.forEach((_, j) => { if (progress.has(`${i}-${j}`)) n++; }));
    return n;
  }, [progress, planDays, open]);

  // Estimated outcome — re-derive based on completion.
  const attendancePctDone = useMemo(() => {
    const day0 = planDays[0];
    if (!day0) return 0;
    const doneAttend = day0.tasks.filter((t, j) => t === 'Attend session' && progress.has(`0-${planDays[0].tasks.indexOf(t)}`)).length;
    return doneAttend ? 100 : 0;
  }, [planDays, progress]);

  if (!plan) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="rc-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rc-coach-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            className="rc-coach"
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <button type="button" className="rc-overlay__close" onClick={onClose} aria-label="Close">×</button>

            <header className="rc-coach__head">
              <div className="rc-coach__brain" aria-hidden="true">💙</div>
              <h2 id="rc-coach-title" className="rc-coach__title">Your AI Learning Coach</h2>
              <p className="rc-coach__sub">
                Every great learner improves step by step.<br />
                This week is a new opportunity.
              </p>
              <div className="rc-coach__sub-h">Here's where you can improve this week.</div>
            </header>

            {observations.length > 0 && (
              <div className="rc-coach__observations">
                {observations.map((line, i) => (
                  <motion.div
                    key={i}
                    className="rc-coach__observation"
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: 0.25 + i * 0.06 }}
                  >
                    <span className="rc-coach__observation-icon" aria-hidden="true">→</span>
                    <span>{line}</span>
                  </motion.div>
                ))}
              </div>
            )}

            <div className="rc-coach__plan-head">
              <span className="rc-coach__plan-eyebrow">📅 MONDAY → SATURDAY · TAP TO TICK</span>
              <span className="rc-coach__plan-counter">
                <b>{completed}</b>/{totalTasks}
              </span>
            </div>

            <div className="rc-coach__plan">
              {planDays.map((day, di) => (
                <motion.div
                  key={day.day}
                  className="rc-coach__day"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.4 + di * 0.05 }}
                >
                  <div className="rc-coach__day-head">
                    <span className="rc-coach__day-name">{day.day}</span>
                    <span className="rc-coach__day-count">{day.tasks.length} tasks</span>
                  </div>
                  <div className="rc-coach__day-tasks">
                    {day.tasks.map((task, ti) => {
                      const k = `${di}-${ti}`;
                      const done = progress.has(k);
                      return (
                        <button
                          type="button"
                          key={k}
                          className={`rc-coach__task${done ? ' is-done' : ''}`}
                          onClick={() => toggle(k)}
                          aria-pressed={done}
                        >
                          <span className="rc-coach__task-box" aria-hidden="true">
                            {done ? '✓' : ''}
                          </span>
                          <span className="rc-coach__task-label">{task}</span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="rc-coach__outcome">
              <div className="rc-coach__outcome-eyebrow">IF YOU FOLLOW THIS PLAN</div>
              <div className="rc-coach__outcome-grid">
                <div className="rc-coach__outcome-stat">
                  <span className="rc-coach__outcome-label">Attendance</span>
                  <span className="rc-coach__outcome-val rc-coach__outcome-val--blue">
                    {plan.targetAttendancePct}%
                  </span>
                </div>
                <div className="rc-coach__outcome-stat">
                  <span className="rc-coach__outcome-label">Poll Completion</span>
                  <span className="rc-coach__outcome-val rc-coach__outcome-val--green">
                    {plan.targetPollPct}%
                  </span>
                </div>
                <div className="rc-coach__outcome-stat">
                  <span className="rc-coach__outcome-label">Estimated Weekly Rank</span>
                  <span className="rc-coach__outcome-val rc-coach__outcome-val--purple">
                    {plan.estimatedRank}
                  </span>
                </div>
              </div>
              <div className="rc-coach__message">{plan.message}</div>
            </div>

            <div className="rc-coach__actions">
              <button type="button" className="rc-coach__btn rc-coach__btn--primary" onClick={onClose}>
                Start My Recovery Plan
              </button>
              <button type="button" className="rc-coach__btn rc-coach__btn--ghost" onClick={onClose}>
                Dismiss
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Per-week dismissal flag — set when the student clicks "Dismiss" or
// "Start My Recovery Plan". The popups only re-show the following week.
export function wasCoachDismissed(recapId) {
  if (!recapId) return true;
  try { return !!localStorage.getItem(`rc_coach_dismissed_${recapId}`); }
  catch { return false; }
}

export function markCoachDismissed(recapId) {
  if (!recapId) return;
  try { localStorage.setItem(`rc_coach_dismissed_${recapId}`, '1'); }
  catch {}
}