import React, { useEffect, useState } from 'react';
import './WeeklyGoalCard.css';

// ============================================================
// WeeklyGoalCard – Your Path to Next Week's Champions
// Personalized goal card shown inline on the dashboard below the
// topbar. Three motivational variants based on the student's prior-
// week position:
//   - close    (rank 11-25)  🎯  "X ranks away from Top 10"
//   - average  (rank 26-50)  🚀  "Keep Growing"
//   - bottom   (bottom 50)   💙  "Fresh Start"
// Card carries:
//   - hero with variant title + headline + sub
//   - TARGET THIS WEEK checklist (4 server-driven targets per bucket)
//   - 3 meta cards: Estimated SP / Projected Rank / Prior Rank
//   - Live progress path (4 nodes: attendance → polls → discussions
//     → weekly challenge) with glowing fill animation
//   - AI motivation line that updates as targets are completed
//   - Bottom 50 path includes a Recovery Plan with Mon-Sat checklist
// All progress is tracked client-side via localStorage so a refresh
// doesn't lose state within the same week.
// ============================================================

// Stable per-rank, per-target mapping (mirrors backend/levels).
const TIER_THEME = {
  close:   { gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', glow: '#818cf8' },
  average: { gradient: 'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)', glow: '#60a5fa' },
  bottom:  { gradient: 'linear-gradient(135deg, #10b981 0%, #38bdf8 100%)', glow: '#10b981' }
};

const TARGET_ICONS = {
  attendance: '◷',
  poll:       '◈',
  discussion: '☺',
  challenge:  '⌬'
};

// Build a deterministic target list for the current week. Pulled from
// the recap payload when available; falls back to a sensible default
// for the bucket.
function defaultTargets(bucket) {
  if (bucket === 'close') {
    return [
      { id: 'attendance', label: '100% Attendance' },
      { id: 'poll',       label: 'Complete every Daily Poll' },
      { id: 'discussion', label: 'Participate in Daily Discussions' },
      { id: 'challenge',  label: "Complete this Week's Challenge" }
    ];
  }
  if (bucket === 'average') {
    return [
      { id: 'attendance', label: '100% Attendance' },
      { id: 'poll',       label: 'Daily Poll Participation' },
      { id: 'discussion', label: 'Join at least 3 Discussions' },
      { id: 'challenge',  label: 'Complete Weekly Challenge' }
    ];
  }
  // bottom
  return [
    { id: 'attendance', label: 'Attend every session' },
    { id: 'poll',       label: 'Complete every Daily Poll' },
    { id: 'discussion', label: 'Join one Discussion every day' },
    { id: 'challenge',  label: 'Complete the Weekly Challenge' }
  ];
}

// Mon-Sat recovery checklist for the bottom-50 variant.
const RECOVERY_PLAN = [
  { day: 'Monday',    tasks: ['Attend session', 'Complete poll'] },
  { day: 'Tuesday',   tasks: ['Attend session', 'Join discussion'] },
  { day: 'Wednesday', tasks: ['Attend session', 'Complete poll', 'Weekly challenge'] },
  { day: 'Thursday',  tasks: ['Attend session', 'Join discussion'] },
  { day: 'Friday',    tasks: ['Attend session', 'Complete poll', 'Learning module'] },
  { day: 'Saturday',  tasks: ['Attend session', 'Finalize challenge'] }
];

// Pick the best motivational headline + sub based on bucket + rank.
function pickHeadline(bucket, myRank) {
  if (bucket === 'close' && myRank) {
    const ranksAway = Math.max(0, myRank - 10);
    return {
      title: '🎯 Weekly Goal',
      headline: `You were only ${ranksAway} rank${ranksAway === 1 ? '' : 's'} away from becoming a Weekly Champion.`,
      sub: "Stay consistent this week and you'll have a great chance of reaching the Top 10."
    };
  }
  if (bucket === 'average') {
    return {
      title: '🚀 Keep Growing',
      headline: 'You made steady progress last week.',
      sub: 'Maintain your consistency and aim for the Top 20.'
    };
  }
  return {
    title: '💙 Fresh Start',
    headline: 'Every week is a new beginning.',
    sub: 'Small daily improvements will help you move up quickly.'
  };
}

// AI motivation: re-evaluated as the user ticks off targets. Subtle
// copy in the spirit of Apple Fitness / GitHub Goals (no confetti,
// no flashing).
function aiMotivation(progress, bucket) {
  const a = progress.attendance || 0;
  const p = progress.poll || 0;
  if (a > 0 && p > 0) {
    return '✦ Great rhythm. Both attendance and polls are in motion today.';
  }
  if (a > 0) {
    return '✦ Attendance is in. Next: complete today\u2019s poll to lock in the rhythm.';
  }
  if (p > 0) {
    return '✦ Poll logged. Now open the day with attendance to maximize the lift.';
  }
  if (bucket === 'close')   return '✦ One strong day could push you into the Top 10.';
  if (bucket === 'average') return '✦ Steady this week moves you toward Top 20.';
  return '✦ Fresh week. Pick one small win to start — every session counts.';
}

// 4-node progress path with glowing fill.
function ProgressPath({ targets, progress, theme }) {
  return (
    <div className="wgc-path" aria-label="Weekly progress path">
      {targets.map((t, i) => {
        const observed = (progress && progress[t.id]) || 0;
        const meta = TARGET_ICONS[t.id] || '◷';
        return (
          <React.Fragment key={t.id}>
            <div className={`wgc-node${observed > 0 ? ' is-progress' : ''}`}>
              <span className="wgc-node__icon" aria-hidden="true">{meta}</span>
              <span className="wgc-node__label">{t.label}</span>
              <span className="wgc-node__count">{observed}×</span>
            </div>
            {i < targets.length - 1 && (
              <div className="wgc-connector" style={{ '--wgc-glow': theme.glow }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Bottom-50 recovery plan with Mon-Sat checklist.
function RecoveryPlan({ progress, onToggle }) {
  return (
    <div className="wgc-recovery">
      <div className="wgc-recovery__head">
        <span className="wgc-recovery__eyebrow">📅 MON → SAT · CATCH-UP PLAN</span>
      </div>
      <div className="wgc-recovery__grid">
        {RECOVERY_PLAN.map((d, di) => (
          <div key={d.day} className="wgc-recovery__day">
            <div className="wgc-recovery__day-name">{d.day}</div>
            {d.tasks.map((task, ti) => {
              const k = `rec-${di}-${ti}`;
              const done = !!(progress && progress[k]);
              return (
                <button
                  type="button"
                  key={k}
                  className={`wgc-recovery__task${done ? ' is-done' : ''}`}
                  onClick={() => onToggle(k)}
                  aria-pressed={done}
                >
                  <span className="wgc-recovery__task-box" aria-hidden="true">{done ? '✓' : ''}</span>
                  <span className="wgc-recovery__task-label">{task}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyGoalCard({ data }) {
  // data: { bucket, headline, subhead, title, targets, requiredSp,
  //         projectedRank, priorRank, priorWeeklySp, me (raw) }
  if (!data || !data.bucket) return null;

  // Build / pull the target list. If the backend supplied one use it;
  // otherwise generate the right defaults for this bucket.
  const targets = (Array.isArray(data.targets) && data.targets.length)
    ? data.targets
    : defaultTargets(data.bucket);
  const theme = TIER_THEME[data.bucket] || TIER_THEME.average;
  const headline = data.headline || pickHeadline(data.bucket, data.priorRank).headline;
  const subhead  = data.subhead  || pickHeadline(data.bucket, data.priorRank).sub;
  const title    = data.title    || pickHeadline(data.bucket, data.priorRank).title;

  // Persisted progress (per-week). The id combines the bucket and the
  // recap week so a new week starts clean.
  const storageKey = `wgc_progress_${data.bucket}_${data.priorRank || ''}_${data.requiredSp || ''}`;
  const [progress, setProgress] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(progress)); }
    catch {}
  }, [storageKey, progress]);

  const toggle = (id) => {
    setProgress(prev => ({ ...prev, [id]: prev[id] ? 0 : 1 }));
  };
  const toggleRecovery = (id) => {
    setProgress(prev => ({ ...prev, [id]: prev[id] ? 0 : 1 }));
  };

  const done = targets.filter(t => (progress[t.id] || 0) > 0).length;
  const pct = Math.round((done / targets.length) * 100);
  const motivation = aiMotivation(progress, data.bucket);

  return (
    <section className="wgc-card" style={{ '--wgc-glow': theme.glow }}>
      <div className="wgc-card__head">
        <div className="wgc-card__eyebrow">{title} · THIS WEEK</div>
        <h3 className="wgc-card__headline">{headline}</h3>
        <p className="wgc-card__sub">{subhead}</p>
      </div>

      <div className="wgc-card__targets">
        <div className="wgc-card__targets-eyebrow">TARGET THIS WEEK · {done}/{targets.length} DONE</div>
        <ul className="wgc-card__target-list">
          {targets.map(t => {
            const observed = (progress[t.id] || 0);
            const done = observed > 0;
            return (
              <li
                key={t.id}
                className={`wgc-card__target${done ? ' is-done' : ''}`}
                onClick={() => toggle(t.id)}
              >
                <span className="wgc-card__target-check" aria-hidden="true">{done ? '✓' : ''}</span>
                <span className="wgc-card__target-label">{t.label}</span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="wgc-card__meta">
        <div className="wgc-card__meta-card">
          <div className="wgc-card__meta-eyebrow">ESTIMATED SP</div>
          <div className="wgc-card__meta-val wgc-card__meta-val--blue">+{data.requiredSp || 36}</div>
        </div>
        <div className="wgc-card__meta-card">
          <div className="wgc-card__meta-eyebrow">PROJECTED RANK</div>
          <div className="wgc-card__meta-val wgc-card__meta-val--purple">{data.projectedRank || 'Top 30'}</div>
        </div>
        <div className="wgc-card__meta-card">
          <div className="wgc-card__meta-eyebrow">PRIOR RANK</div>
          <div className="wgc-card__meta-val">#{data.priorRank || '—'}</div>
        </div>
      </div>

      <div className="wgc-card__motivation">
        <span className="wgc-card__motivation-line">{motivation}</span>
      </div>

      <ProgressPath targets={targets} progress={progress} theme={theme} />

      <div className="wgc-card__progress-bar">
        <div
          className="wgc-card__progress-fill"
          style={{ width: `${pct}%`, background: theme.gradient }}
        />
      </div>
      <div className="wgc-card__progress-meta">
        <span><b>{pct}%</b> of weekly targets started</span>
        <span>{pct === 100 ? '✨ Week locked in.' : 'Tap a target to mark it started.'}</span>
      </div>

      {data.bucket === 'bottom' && (
        <RecoveryPlan progress={progress} onToggle={toggleRecovery} />
      )}
    </section>
  );
}

export default WeeklyGoalCard;