import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

// ============================================================
// WeeklyGoalCard — Your Path to Next Week's Champions
// Sits below the topbar (full-width, glass, soft blue-purple).
// Three motivational variants selected server-side:
//   - close    (rank 11-25)   "X ranks away from Top 10"
//   - average  (rank 26-cohort-50)  "Keep growing"
//   - bottom   (bottom 50)   "Fresh Start"
// Live progress path glows as targets are completed. AI motivation
// and the prediction panel update as the user crosses milestones.
// ============================================================

const API = (typeof window !== 'undefined' && window.location.pathname.startsWith('/spurti') ? '/spurti' : '') + '/api';

// Friendly per-target label mapping.
const TARGET_META = {
  attendance: { icon: '◷', label: 'Attendance' },
  poll:       { icon: '◈', label: 'Polls' },
  discussion: { icon: '☺', label: 'Discussions' },
  challenge:  { icon: '⌬', label: 'Weekly Challenge' }
};

const VARIANT_THEME = {
  close:   { gradient: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.10))',  glow: '#818cf8' },
  average: { gradient: 'linear-gradient(135deg, rgba(56,189,248,0.16), rgba(99,102,241,0.10))',   glow: '#60a5fa' },
  bottom:  { gradient: 'linear-gradient(135deg, rgba(56,189,248,0.16), rgba(16,185,129,0.10))',   glow: '#10b981' }
};

function classifyProgress(progress, targets) {
  // Returns { [id]: { done, partial, total } } where partial is
  // 0..total based on observed count vs target perWeek.
  const map = {};
  for (const t of targets) {
    const observed = progress[t.id] || 0;
    const target = t.perWeek;
    map[t.id] = {
      done: observed >= target,
      partial: Math.min(1, target > 0 ? observed / target : 0),
      observed,
      target
    };
  }
  return map;
}

function aiMotivation(progress, bucket) {
  const att = progress.attendance || 0;
  const pol = progress.poll || 0;
  const streak = progress.streak || 0;
  const weeklySp = progress.weeklySp || 0;
  if (att + pol === 0) {
    return {
      title: '✨ A new week awaits.',
      sub: "Start with today's attendance to set the tone."
    };
  }
  if (streak >= 3) {
    return {
      title: `🔥 ${streak}-day streak! Excellent.`,
      sub: "Keep participating in discussions to improve your weekly rank."
    };
  }
  if (pol > 0 && att === 0) {
    return {
      title: '✨ Great start!',
      sub: "You've completed today's poll. Next: attend today's session."
    };
  }
  if (weeklySp >= 15) {
    return {
      title: '⚡ Amazing pace.',
      sub: "You're progressing faster than last week — keep your momentum."
    };
  }
  if (bucket === 'close') {
    return {
      title: '🎯 Steady progress.',
      sub: 'One more strong day could push you into the Top 10.'
    };
  }
  if (bucket === 'average') {
    return {
      title: '✨ Solid start.',
      sub: 'Maintain the pace — Top 20 is within reach this week.'
    };
  }
  return {
    title: '✨ Great start!',
    sub: "You've already completed today's attendance. Next: complete today's poll."
  };
}

function aiPrediction(progress, goal) {
  // Heuristic: project weekly SP based on days-elapsed and current pace.
  const total = goal.requiredSp;
  const earned = progress.weeklySp || 0;
  const pct = total > 0 ? Math.min(100, Math.round((earned / total) * 100)) : 0;
  // Map pct to a projected rank range.
  let rank;
  if (pct >= 90) rank = goal.projectedRank;
  else if (pct >= 70) rank = goal.projectedRank;
  else if (pct >= 40) rank = 'Top 50';
  else rank = 'Top 80';
  const confidence = Math.min(95, Math.max(40, 50 + Math.round(pct * 0.4)));
  const expectedSp = Math.max(earned, Math.round(total * 0.85));
  return { rank, confidence, expectedSp, pct };
}

function ProgressPath({ targets, byTarget, glow }) {
  return (
    <div className="wgc-path" aria-label="Weekly learning progress path">
      {targets.map((t, i) => {
        const seg = byTarget[t.id] || { done: false, partial: 0, observed: 0, target: 0 };
        const meta = TARGET_META[t.id] || { icon: '◷', label: t.label };
        return (
          <React.Fragment key={t.id}>
            <motion.div
              className={`wgc-node${seg.done ? ' is-done' : seg.partial > 0 ? ' is-progress' : ''}`}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <span className="wgc-node__icon" aria-hidden="true">{seg.done ? '✓' : meta.icon}</span>
              <span className="wgc-node__label">{meta.label}</span>
              <span className="wgc-node__count">{seg.observed}/{seg.target}</span>
            </motion.div>
            {i < targets.length - 1 && (
              <div
                className={`wgc-connector${seg.done && byTarget[targets[i + 1].id]?.done ? ' is-both-done' : ''}`}
                style={seg.done ? { '--wgc-glow': glow } : undefined}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function DistanceCard({ targets, byTarget, glow }) {
  // Remaining work to reach Top 10 (or bucket's projected rank).
  const items = targets.map(t => {
    const seg = byTarget[t.id] || { done: false, observed: 0, target: 0 };
    const remaining = Math.max(0, seg.target - seg.observed);
    return { id: t.id, label: TARGET_META[t.id]?.label || t.label, remaining };
  });
  return (
    <div className="wgc-distance">
      <div className="wgc-distance__head">
        <span className="wgc-distance__eyebrow">🏆 DISTANCE TO WEEKLY CHAMPIONS</span>
      </div>
      <div className="wgc-distance__grid">
        {items.map(it => (
          <div key={it.id} className={`wgc-distance__item${it.remaining === 0 ? ' is-done' : ''}`}>
            <span className="wgc-distance__check">{it.remaining === 0 ? '✓' : '○'}</span>
            <span className="wgc-distance__count">{it.remaining}</span>
            <span className="wgc-distance__label">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictionCard({ prediction, bucket }) {
  return (
    <div className="wgc-prediction">
      <div className="wgc-prediction__eyebrow">📈 AI WEEKLY PREDICTION</div>
      <div className="wgc-prediction__body">
        <span className="wgc-prediction__label">If you continue at this pace:</span>
      </div>
      <div className="wgc-prediction__stats">
        <div className="wgc-prediction__stat">
          <span className="wgc-prediction__stat-label">Projected Rank</span>
          <span className="wgc-prediction__stat-val">{prediction.rank}</span>
        </div>
        <div className="wgc-prediction__stat">
          <span className="wgc-prediction__stat-label">Confidence</span>
          <span className="wgc-prediction__stat-val">{prediction.confidence}%</span>
        </div>
        <div className="wgc-prediction__stat">
          <span className="wgc-prediction__stat-label">Expected SP</span>
          <span className="wgc-prediction__stat-val">+{prediction.expectedSp}</span>
        </div>
      </div>
    </div>
  );
}

function CompletedState({ bucket }) {
  return (
    <motion.div
      className="wgc-complete"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="wgc-complete__eyebrow">✨ WEEKLY MISSION COMPLETE</div>
      <div className="wgc-complete__title">Consistency creates champions.</div>
      <div className="wgc-complete__sub">See you on next week's leaderboard.</div>
      <div className="wgc-complete__checks">
        <span>✓ Attendance</span>
        <span>✓ Poll</span>
        <span>✓ Discussion</span>
        <span>✓ Challenge</span>
      </div>
    </motion.div>
  );
}

export function WeeklyGoalCard({ recapData, profile }) {
  const email = profile?.email || '';
  const goal = recapData?.goal || null;
  const progress = recapData?.progress || null;
  const recapId = recapData?.recapId || null;

  // Live poll every 60s for the in-progress counts.
  const [liveProgress, setLiveProgress] = useState(progress);
  const tickRef = useRef(0);
  useEffect(() => { setLiveProgress(progress); }, [progress]);
  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    const loop = async () => {
      try {
        const r = await fetch(`${API}/weekly/live?email=${encodeURIComponent(email)}`);
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled && j.progress) setLiveProgress(j.progress);
      } catch {}
    };
    const id = setInterval(() => { tickRef.current += 1; loop(); }, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [email]);

  if (!goal || !liveProgress) return null;

  const theme = VARIANT_THEME[goal.bucket] || VARIANT_THEME.average;
  const byTarget = classifyProgress(liveProgress, goal.targets);
  const allDone = goal.targets.every(t => byTarget[t.id]?.done);
  const motivation = aiMotivation(liveProgress, goal.bucket);
  const prediction = aiPrediction(liveProgress, goal);

  return (
    <motion.section
      className={`wgc wgc--${goal.bucket}${allDone ? ' wgc--done' : ''}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      style={{ '--wgc-glow': theme.glow }}
    >
      {allDone ? (
        <CompletedState bucket={goal.bucket} />
      ) : (
        <>
          <header className="wgc__head">
            <div className="wgc__eyebrow">{goal.title} · WEEK OF {recapId}</div>
            <h2 className="wgc__headline">{goal.headline}</h2>
            <p className="wgc__sub">{goal.subhead}</p>
          </header>

          <div className="wgc__targets">
            <div className="wgc__targets-head">TARGET THIS WEEK</div>
            <ul className="wgc__target-list">
              {goal.targets.map(t => (
                <li key={t.id}>
                  <span className="wgc__target-check" aria-hidden="true">✓</span>
                  <span>{t.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="wgc__meta">
            <div className="wgc__meta-card">
              <span className="wgc__meta-eyebrow">ESTIMATED WEEKLY SP</span>
              <span className="wgc__meta-val wgc__meta-val--blue">+{goal.requiredSp}</span>
            </div>
            <div className="wgc__meta-card">
              <span className="wgc__meta-eyebrow">PROJECTED RANK</span>
              <span className="wgc__meta-val wgc__meta-val--purple">{goal.projectedRank}</span>
            </div>
            <div className="wgc__meta-card">
              <span className="wgc__meta-eyebrow">YOUR PRIOR RANK</span>
              <span className="wgc__meta-val">#{goal.priorRank}</span>
            </div>
          </div>

          <div className="wgc__motivation">
            <span className="wgc__motivation-title">{motivation.title}</span>
            <span className="wgc__motivation-sub">{motivation.sub}</span>
          </div>

          <ProgressPath targets={goal.targets} byTarget={byTarget} glow={theme.glow} />

          <div className="wgc__row">
            <DistanceCard targets={goal.targets} byTarget={byTarget} glow={theme.glow} />
            <PredictionCard prediction={prediction} bucket={goal.bucket} />
          </div>
        </>
      )}
    </motion.section>
  );
}