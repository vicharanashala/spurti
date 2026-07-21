import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================
// Bottom50Experience
// Supportive, encouraging tone. No shame. Calming blue + green
// palette. Shown ABOVE the leaderboard when bucket === 'bottom50'.
// Three blocks:
//   1. 💙 You Can Catch Up! headline + motivational sub
//   2. Why You're Behind — only activities actually missed
//   3. AI Coach — Know Where You Lack
//   4. Catch-Up Plan — 6-item checklist + Recovery Progress Bar
// ============================================================

function useCountUp(target, duration = 700) {
  const [v, setV] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const from = prev.current;
    const to = target;
    if (from === to) return;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - (1 - p) * (1 - p);
      setV(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const ACTIVITY_CATALOG = [
  { id: 'attendance', label: 'Missed Attendance', icon: '◷' },
  { id: 'poll',       label: 'Missed Daily Poll', icon: '◈' },
  { id: 'learning',   label: 'Missed Learning Module', icon: '✎' },
  { id: 'bonus',      label: "Didn't Complete Bonus Task", icon: '◆' },
  { id: 'challenge',  label: 'Missed Weekly Challenge', icon: '⌬' },
  { id: 'community',  label: 'Low Community Participation', icon: '☺' }
];

const CHECKLIST = [
  { id: 'attend',   label: "Attend today's session",        sp: 10 },
  { id: 'poll',     label: "Complete today's poll",         sp: 5 },
  { id: 'learning', label: 'Finish one learning module',     sp: 8 },
  { id: 'discuss',  label: 'Participate in one discussion',  sp: 3 },
  { id: 'bonus',    label: 'Complete one bonus activity',    sp: 6 },
  { id: 'streak',   label: 'Maintain attendance streak',     sp: 5 }
];

export function Bottom50Experience({ data }) {
  const me = data?.me;
  const missed = me?.missed || [];
  const totalSp = me?.weeklySp ?? 0;

  const missedActivities = useMemo(() => {
    const flagged = new Set(missed);
    if (totalSp < 20) {
      flagged.add('learning');
      flagged.add('bonus');
      flagged.add('challenge');
      flagged.add('community');
    }
    return ACTIVITY_CATALOG.filter(a => flagged.has(a.id));
  }, [missed, totalSp]);

  const insights = useMemo(() => {
    const out = [];
    if (missed.includes('attendance')) {
      const sessionsLeft = 2;
      out.push(`You missed ${sessionsLeft} session${sessionsLeft > 1 ? 's' : ''} this week — that's a quick 10 SP back per session.`);
    } else if (missed.length === 0) {
      out.push('Attendance looked solid this week. Keep the routine going.');
    }
    if (missed.includes('poll') || totalSp < 5) {
      out.push('Poll participation was lower than your usual pace — polls are quick wins for SP.');
    }
    if (totalSp < 20) {
      out.push('Learning completion is below your weekly average. One module today would shift the trend.');
    }
    if (totalSp < 10) {
      out.push('Bonus activities were skipped. Even one is enough to change the slope.');
    }
    if (out.length === 0) {
      out.push('You are closer than you think — keep going.');
    }
    return out.slice(0, 4);
  }, [missed, totalSp]);

  const [checked, setChecked] = useState(new Set());
  const toggle = (id) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const completedCount = checked.size;
  const totalCount = CHECKLIST.length;
  const pct = Math.round((completedCount / totalCount) * 100);
  const pctDisplay = useCountUp(pct);
  const spEarned = CHECKLIST.filter(c => checked.has(c.id)).reduce((s, c) => s + c.sp, 0);

  if (!me) return null;

  return (
    <motion.section className="wl-bottom"
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
    >
      <div className="wl-bottom__hero">
        <div className="wl-bottom__hero-icon" aria-hidden="true">💙</div>
        <div className="wl-bottom__hero-body">
          <h2 className="wl-bottom__hero-title">You Can Catch Up!</h2>
          <div className="wl-bottom__hero-sub">
            Every champion starts somewhere. This week wasn't your best, but next week can be.
          </div>
        </div>
      </div>

      <div className="wl-bottom__section">
        <div className="wl-bottom__section-head">
          <span className="wl-bottom__section-eyebrow">WHY YOU'RE BEHIND</span>
          <span className="wl-bottom__section-count">{missedActivities.length} flagged</span>
        </div>
        {missedActivities.length === 0 ? (
          <div className="wl-bottom__clean">You didn't miss anything tracked this week. Set your sights on next week.</div>
        ) : (
          <ul className="wl-bottom__list">
            {missedActivities.map((m, i) => (
              <motion.li
                key={m.id}
                className="wl-bottom__miss"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
              >
                <span className="wl-bottom__miss-icon" aria-hidden="true">{m.icon}</span>
                <span className="wl-bottom__miss-x" aria-hidden="true">×</span>
                <span className="wl-bottom__miss-label">{m.label}</span>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <div className="wl-bottom__section">
        <div className="wl-bottom__section-head">
          <span className="wl-bottom__section-eyebrow">AI COACH</span>
          <span className="wl-bottom__section-sub">know where you lack</span>
        </div>
        <ul className="wl-bottom__coach">
          {insights.map((line, i) => (
            <li key={i}>
              <span className="wl-bottom__coach-bullet">→</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="wl-bottom__section wl-bottom__plan">
        <div className="wl-bottom__section-head">
          <span className="wl-bottom__section-eyebrow wl-bottom__section-eyebrow--accent">CATCH-UP PLAN</span>
          <span className="wl-bottom__section-sub">tap to tick</span>
        </div>
        <div className="wl-bottom__plan-rows">
          {CHECKLIST.map((it, i) => {
            const isChecked = checked.has(it.id);
            return (
              <motion.button
                type="button"
                key={it.id}
                className={`wl-bottom__check${isChecked ? ' is-checked' : ''}`}
                onClick={() => toggle(it.id)}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.05 + i * 0.04 }}
                aria-pressed={isChecked}
              >
                <span className="wl-bottom__check-box" aria-hidden="true">{isChecked ? '✓' : ''}</span>
                <span className="wl-bottom__check-label">{it.label}</span>
                <span className="wl-bottom__check-sp">+{it.sp}</span>
              </motion.button>
            );
          })}
        </div>

        <div className="wl-bottom__recovery">
          <div className="wl-bottom__recovery-top">
            <span className="wl-bottom__recovery-label">Recovery Progress</span>
            <span className="wl-bottom__recovery-val">
              <b>{pctDisplay}%</b> <span className="wl-bottom__recovery-count">({completedCount}/{totalCount})</span>
            </span>
          </div>
          <div className="wl-bottom__recovery-bar">
            <motion.div
              className="wl-bottom__recovery-fill"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <div className="wl-bottom__recovery-foot">
            <span>+{spEarned} SP earned</span>
            <span className="wl-bottom__recovery-foot-sep">·</span>
            <span>{totalCount - completedCount} more to recover</span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}