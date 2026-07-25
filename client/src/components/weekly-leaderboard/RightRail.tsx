import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ============================================================
// Right Sidebar Widgets
// Six cards stacked in a single column:
//   1. Weekly Progress — ring + XP + rank movement + points-to-next
//   2. AI Coach — insight chips + reasons
//   3. Today's Goals — checklist with progress
//   4. Weekly Insights — 8 stat tiles
//   5. Activity Completion — 4 mini progress bars
//   6. Motivation Card — rotating quote
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

// ----- 1. Weekly Progress -----
function WeeklyProgress({ data }) {
  const me = data?.me;
  const displaySp = useCountUp(me?.weeklySp ?? 0);
  const displayTop = useCountUp(Math.max(1, me?.pointsToTop10 ?? 0));
  const rank = me?.weeklyRank;
  const cohort = data?.cohortSize || 1;
  const pct = rank ? Math.min(100, Math.round(((cohort - rank) / cohort) * 100)) : 0;
  const ringR = 36;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - pct / 100);

  return (
    <motion.section className="wl-card wl-card--progress" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">WEEKLY PROGRESS</span>
      </div>
      <div className="wl-progress">
        <svg className="wl-progress__ring" width="92" height="92" viewBox="0 0 92 92">
          <circle cx="46" cy="46" r={ringR} fill="none" stroke="var(--border)" strokeWidth="6" />
          <circle
            cx="46" cy="46" r={ringR}
            fill="none"
            stroke="url(#wl-progress-grad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={ringC}
            strokeDashoffset={ringOffset}
            transform="rotate(-90 46 46)"
          />
          <defs>
            <linearGradient id="wl-progress-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
          </defs>
        </svg>
        <div className="wl-progress__body">
          <div className="wl-progress__sp">
            <span className="wl-progress__sp-val">+{displaySp}</span>
            <span className="wl-progress__sp-label">Weekly SP</span>
          </div>
          <div className="wl-progress__meta">
            <span>Rank <b>{rank ? '#' + rank : '—'}</b> of {typeof cohort === 'number' ? cohort.toLocaleString() : cohort}</span>
            {me?.pointsToTop10 > 0 && (
              <span className="wl-progress__top10">
                <b>{displayTop}</b> SP to Top 10
              </span>
            )}
          </div>
          <div className="wl-progress__xp">
            <div className="wl-progress__xp-bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </motion.section>
  );
}

// ----- 2. AI Coach -----
function AICoach({ data }) {
  const me = data?.me;
  const missed = me?.missed || [];
  const insights = useMemo(() => {
    const list = [];
    if (missed.includes('attendance')) list.push('Attendance is the biggest lever this week — try to attend the next session to recover.');
    else list.push('Attendance looked solid this week.');
    if (missed.includes('poll')) list.push('Poll participation was lower than your usual pace this week.');
    else if (me?.weeklySp === 0) list.push('No poll submissions yet — polls are quick wins for SP.');
    if (me?.weeklyRank && me.weeklyRank > (data?.cohortSize || 100) * 0.5) {
      list.push('A single attended session can lift your rank by 30+ spots.');
    }
    if (list.length < 2) list.push('Keep stacking small wins — consistency beats intensity.');
    return list;
  }, [missed, me, data]);

  return (
    <motion.section className="wl-card wl-card--coach" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.05 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">AI COACH</span>
        <span className="wl-card__eyebrow wl-card__eyebrow--accent">where to focus</span>
      </div>
      <div className="wl-coach__chips">
        {missed.includes('attendance') && <span className="wl-coach__chip wl-coach__chip--miss">✗ Missed Attendance</span>}
        {missed.includes('poll') && <span className="wl-coach__chip wl-coach__chip--miss">✗ Missed Poll</span>}
        {!missed.includes('attendance') && !missed.includes('poll') && <span className="wl-coach__chip wl-coach__chip--ok">✓ Caught up</span>}
      </div>
      <ul className="wl-coach__list">
        {insights.slice(0, 3).map((line, i) => (
          <li key={i}>
            <span className="wl-coach__bullet">→</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

// ----- 3. Today's Goals -----
function TodaysGoals() {
  const items = [
    { id: 'attend', label: "Attend today's session", sp: 10 },
    { id: 'poll',   label: "Complete today's poll", sp: 5 },
    { id: 'streak', label: 'Maintain attendance streak', sp: 5 }
  ];
  return (
    <motion.section className="wl-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.1 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">TODAY'S GOALS</span>
        <span className="wl-card__eyebrow wl-card__eyebrow--soft">+20 SP available</span>
      </div>
      <ul className="wl-goals">
        {items.map((it, i) => (
          <motion.li
            key={it.id}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, delay: 0.15 + i * 0.05 }}
          >
            <span className="wl-goals__box" aria-hidden="true" />
            <span className="wl-goals__label">{it.label}</span>
            <span className="wl-goals__sp">+{it.sp}</span>
          </motion.li>
        ))}
      </ul>
    </motion.section>
  );
}

// ----- 4. Weekly Insights -----
function WeeklyInsights({ data, profile }) {
  const stats = useMemo(() => {
    const me = data?.me;
    const totalXp = Number(profile?.totalSp || 0);
    return [
      { label: 'Weekly XP', value: '+' + (me?.weeklySp ?? 0), color: '#10b981' },
      { label: "Today SP", value: '—', color: '#3b82f6' },
      { label: 'Attendance %', value: '—', color: '#8b5cf6' },
      { label: 'Poll %', value: '—', color: '#ec4899' },
      { label: 'Learning %', value: '—', color: '#06b6d4' },
      { label: 'Bonus %', value: '—', color: '#fbbf24' },
      { label: 'Best Rank', value: '#' + (profile?.rank ?? '—'), color: '#0ea5e9' },
      { label: 'Total SP', value: totalXp, color: '#6366f1' }
    ];
  }, [data, profile]);

  return (
    <motion.section className="wl-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.15 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">WEEKLY INSIGHTS</span>
      </div>
      <div className="wl-insights">
        {stats.map(s => (
          <div className="wl-insight" key={s.label}>
            <div className="wl-insight__label">{s.label}</div>
            <div className="wl-insight__value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

// ----- 5. Activity Completion -----
function ActivityCompletion() {
  const rows = [
    { label: 'Attendance', color: '#10b981' },
    { label: 'Polls',      color: '#3b82f6' },
    { label: 'Learning',   color: '#8b5cf6' },
    { label: 'Bonus',      color: '#fbbf24' }
  ];
  return (
    <motion.section className="wl-card" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.2 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">ACTIVITY COMPLETION</span>
      </div>
      <div className="wl-activity">
        {rows.map(r => (
          <div className="wl-activity__row" key={r.label}>
            <div className="wl-activity__top">
              <span className="wl-activity__label">{r.label}</span>
              <span className="wl-activity__pct">0%</span>
            </div>
            <div className="wl-activity__bar">
              <div className="wl-activity__fill" style={{ width: '0%', background: r.color }} />
            </div>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

// ----- 6. Motivation Card -----
const QUOTES = [
  { text: 'Every champion starts somewhere.', sub: 'Consistency beats intensity.' },
  { text: 'Showing up is half the battle.', sub: 'The other half is staying curious.' },
  { text: 'Small wins, stacked daily.', sub: 'A week of small wins is a big one.' },
  { text: 'Your future self is watching.', sub: 'Do today what you will be proud of.' },
  { text: 'Progress over perfection.', sub: 'You do not have to be the best. Just better than yesterday.' }
];
function MotivationCard() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % QUOTES.length), 9000);
    return () => clearInterval(t);
  }, []);
  const q = QUOTES[idx];
  return (
    <motion.section className="wl-card wl-card--motivation" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.25 }}>
      <div className="wl-card__head">
        <span className="wl-card__eyebrow">DAILY MOTIVATION</span>
        <span className="wl-card__eyebrow wl-card__eyebrow--accent">💡</span>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          className="wl-motivation"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.4 }}
        >
          <div className="wl-motivation__text">"{q.text}"</div>
          <div className="wl-motivation__sub">{q.sub}</div>
        </motion.div>
      </AnimatePresence>
      <div className="wl-motivation__dots">
        {QUOTES.map((_, i) => (
          <span key={i} className={`wl-motivation__dot${i === idx ? ' is-active' : ''}`} />
        ))}
      </div>
    </motion.section>
  );
}

export function RightRail({ data, profile }) {
  return (
    <div className="wl-right-rail">
      <WeeklyProgress data={data} />
      <AICoach data={data} />
      <TodaysGoals />
      <WeeklyInsights data={data} profile={profile} />
      <ActivityCompletion />
      <MotivationCard />
    </div>
  );
}
