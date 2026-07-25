import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './WeeklyLearningInsightsPopup.css';

// ============================================================
// WeeklyLearningInsightsPopup
// Premium centered modal that fires once per week, only on the
// student's first login after Monday 06:00 IST. It surfaces last
// week's Top 10 Champions on the FRONT, then auto-flips after 10
// seconds to show personalized AI insights on the BACK.
//
// Four cases drive the messaging + visuals:
//   top10   - Top 10 (1-10):  celebration effects (confetti,
//                          balloons, sparkles, party poppers)
//                          + 'What Went Right' / 'Why You Stayed
//                          Ahead' on the back
//   close   - 1-20 SP off Top 10: no celebration, smooth flip,
//                          'What Went Right' / 'Where You Lost Those
//                          Points' / 'How You Could Have Reached
//                          Top 10' on the back
//   other   - everyone else (rank > 10, gap > 20): motivational
//                          flip, 'What Went Right' / 'Where You Can
//                          Improve' on the back
//   bottom50- in the bottom 50 (never labeled): handled by the
//                          separate RecoveryCoachPopup
// ============================================================

// ----- Celebration effects (Top 10 only) -----
function useRandomParticles(count, opts = {}) {
  return useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * (opts.maxDelay ?? 0.5),
    duration: 1.8 + Math.random() * 1.6,
    drift: -10 + Math.random() * 30,
    size: 5 + Math.random() * 6,
    rotate: Math.random() * 360,
    hue: opts.hues ? opts.hues[i % opts.hues.length] : null
  })), [count]);
}

function Confetti({ count = 32 }) {
  const particles = useRandomParticles(count, {
    maxDelay: 0.6,
    hues: ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
  });
  return (
    <div className="wli-confetti" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="wli-confetti__bit"
          style={{
            left: `${p.left}%`,
            background: p.hue,
            width: `${p.size}px`,
            height: `${p.size * 0.5}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
            '--wli-drift': `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
}

function Balloons({ count = 6 }) {
  const particles = useRandomParticles(count, { maxDelay: 0.8 });
  return (
    <div className="wli-balloons" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="wli-balloon"
          style={{
            left: `${10 + p.left * 0.8}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${3 + p.duration}s`,
            '--wli-drift': `${p.drift}px`
          }}
        />
      ))}
    </div>
  );
}

function Sparkles({ count = 18 }) {
  const particles = useRandomParticles(count, { maxDelay: 1.5 });
  return (
    <div className="wli-sparkles" aria-hidden="true">
      {particles.map(p => (
        <span
          key={p.id}
          className="wli-sparkle"
          style={{
            left: `${p.left}%`,
            top: `${10 + Math.random() * 80}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${1 + p.duration * 0.6}s`
          }}
        />
      ))}
    </div>
  );
}

function PopperBurst() {
  return (
    <div className="wli-poppers" aria-hidden="true">
      <div className="wli-popper wli-popper--left">
        <span className="wli-popper__stream" />
        <span className="wli-popper__stream wli-popper__stream--2" />
        <span className="wli-popper__stream wli-popper__stream--3" />
      </div>
      <div className="wli-popper wli-popper--right">
        <span className="wli-popper__stream" />
        <span className="wli-popper__stream wli-popper__stream--2" />
        <span className="wli-popper__stream wli-popper__stream--3" />
      </div>
    </div>
  );
}

function CelebrationLayer({ caseKey }) {
  if (caseKey !== 'top10') return null;
  return (
    <>
      <Confetti />
      <Balloons />
      <Sparkles />
      <PopperBurst />
    </>
  );
}

// ----- Top 10 leaderboard row -----
function Top10Row({ row, idx }) {
  const isFirst = idx === 0;
  return (
    <div className={`wli-top10-row${isFirst ? ' is-first' : ''}`}>
      <span className={`wli-top10-rank wli-top10-rank--${row.rank <= 3 ? `p${row.rank}` : 'plain'}`}>
        {row.rank}
      </span>
      <span className="wli-top10-name">{row.name}</span>
      <span className="wli-top10-sp">+{row.weeklySp}</span>
      <span className="wli-top10-badge">{row.weeklyBadge || 'Starter'}</span>
      <span className="wli-top10-pct" title="Learning consistency">
        {row.learningPct || 0}%
      </span>
    </div>
  );
}

// ----- AI insights generator (deterministic, varied per student) -----
function buildInsights(me, caseKey) {
  const att = me?.attendanceCount || 0;
  const pol = me?.pollCount || 0;
  const cha = me?.challengeCount || 0;
  const sp  = me?.weeklySp || 0;
  const rank = me?.weeklyRank || 0;
  const gap = me?.pointsToTop10 || 0;

  if (caseKey === 'top10') {
    const strengths = [];
    if (att >= 3) strengths.push('Excellent attendance consistency');
    if (pol >= 3) strengths.push('Never missed important polls');
    if (cha >= 1) strengths.push('Completed this week\u2019s challenge');
    if (strengths.length === 0) strengths.push('Strong overall learning rhythm', 'Active classroom participation');
    return {
      wentRight: strengths.slice(0, 4),
      ahead: [
        'Consistent engagement kept you ahead.',
        'Active participation in class and polls.',
        'Reliable daily attendance.',
        'You maintained a steady learning rhythm.'
      ],
      missed: [],
      lostPoints: null,
      recover: null,
      headline: '🎉 Congratulations! You\u2019re one of this week\u2019s Top 10 Learning Champions!',
      sub: '✨ Your consistency and dedication kept you ahead of the competition.',
      cta: '🌟 Keep this momentum going. Defending the Top 10 is just as exciting as reaching it.'
    };
  }

  if (caseKey === 'close') {
    const strengths = [];
    if (att >= 2) strengths.push('Good attendance');
    if (pol >= 2) strengths.push('Regular poll participation');
    if (cha >= 1) strengths.push('Completed the weekly challenge');
    if (strengths.length === 0) strengths.push('You showed up and tried');
    const lost = [];
    if (att < 3) lost.push('One missed attendance cost you ~5 SP');
    if (pol < 4) lost.push(`${Math.max(0, 4 - pol)} missed polls cost you ~${(4 - pol) * 3} SP`);
    if (cha < 1) lost.push('Skipping the weekly challenge cost you ~6 SP');
    return {
      wentRight: strengths.slice(0, 4),
      ahead: [],
      missed: lost,
      lostPoints: `You missed the Top 10 by only ${gap} Spurti Points.`,
      recover: [
        'Completing one more poll: +3 points',
        'Perfect attendance this week: +8 points',
        'Joining one more discussion: +4 points',
        'Completing the weekly challenge: +6 points'
      ],
      headline: '🌟 You were so close!',
      sub: `You missed the Top 10 by only ${gap} Spurti Points.`,
      cta: '🚀 You\u2019re closer than you think. One more consistent week could easily place you among the Top 10.'
    };
  }

  // 'other'
  const strengths = [];
  if (att >= 1) strengths.push('Good attendance');
  if (pol >= 1) strengths.push('Improved participation');
  if (cha >= 1) strengths.push('Completed a challenge');
  if (strengths.length === 0) strengths.push('You logged in and tried');
  const improve = [];
  if (att < 3) improve.push('Attend more live sessions this week');
  if (pol < 4) improve.push('Complete every daily poll — small SP, big consistency');
  if (cha < 1) improve.push('Take on the weekly challenge — it\u2019s a quick win');
  improve.push('Keep a steady rhythm; small daily improvements add up.');
  return {
    wentRight: strengths.slice(0, 4),
    ahead: [],
    missed: [],
    lostPoints: null,
    recover: null,
    improve: improve.slice(0, 4),
    headline: '✨ You made steady progress this week.',
    sub: 'A consistent rhythm puts the Top 20 in reach next week.',
    cta: '💪 Every expert was once a beginner. Small improvements every day create remarkable results.'
  };
}

// ----- The popup -----
function ChampionCard({ recap, me, caseKey }) {
  if (!recap) return null;
  const sorted = [...(recap.top10 || [])].sort((a, b) => a.rank - b.rank);
  return (
    <div className="wli-card wli-card--front">
      <button
        type="button"
        className="wli-card__close"
        onClick={(e) => { e.stopPropagation(); /* no-op inside card */ }}
        tabIndex={-1}
        aria-hidden="true"
      />
      <header className="wli-card__head">
        <div className="wli-card__eyebrow">WEEKLY LEARNING CHAMPIONS</div>
        <h2 className="wli-card__title">🏆 Weekly Learning Champions</h2>
        <p className="wli-card__sub">
          ✨ A New Week Has Begun! Everyone starts from zero again. Every poll, every discussion, and every learning activity counts toward your new journey. Make this week your best one yet!
        </p>
      </header>

      <div className="wli-card__divider" />

      <div className="wli-card__top10" role="list" aria-label="Top 10 last week">
        {sorted.slice(0, 10).map((row, i) => (
          <Top10Row key={row.email || row.rank} row={row} idx={i} />
        ))}
      </div>

      <div className="wli-card__divider" />

      <div className="wli-card__cta">
        {caseKey === 'top10' ? (
          <p className="wli-card__congrats">
            🎉 <b>You made the Top 10 this week!</b> Tap "Start My Week" to see why — and what's ahead.
          </p>
        ) : (
          <p className="wli-card__congrats">
            {me?.weeklyRank
              ? `Your rank last week: #${me.weeklyRank}. Tap "Start My Week" to see personalized insights.`
              : 'Tap "Start My Week" to see personalized insights.'}
          </p>
        )}
        <button type="button" className="wli-card__btn" data-wli-action="start">
          Start My Week
        </button>
      </div>
    </div>
  );
}

function InsightsCard({ insights, caseKey }) {
  return (
    <div className="wli-card wli-card--back">
      <div className="wli-card__head">
        <div className="wli-card__eyebrow">
          {caseKey === 'top10' ? '✨ WHAT WENT RIGHT' :
           caseKey === 'close' ? '🌟 SO CLOSE' : '📈 KEEP GOING'}
        </div>
        <h2 className="wli-card__title">{insights.headline}</h2>
        <p className="wli-card__sub">{insights.sub}</p>
      </div>

      <div className="wli-card__divider" />

      <div className="wli-card__section">
        <div className="wli-card__section-eyebrow">✅ What Went Right</div>
        <ul className="wli-card__list wli-card__list--good">
          {insights.wentRight.map((line, i) => (
            <li key={i}><span className="wli-card__check wli-card__check--ok">✓</span>{line}</li>
          ))}
        </ul>
      </div>

      {caseKey === 'close' && (
        <>
          <div className="wli-card__section">
            <div className="wli-card__section-eyebrow">📈 Where You Lost Those Few Points</div>
            <ul className="wli-card__list wli-card__list--warn">
              {insights.missed.map((line, i) => (
                <li key={i}><span className="wli-card__check wli-card__check--warn">!</span>{line}</li>
              ))}
            </ul>
          </div>

          <div className="wli-card__section">
            <div className="wli-card__section-eyebrow">🎯 How You Could Have Reached the Top 10</div>
            <ul className="wli-card__list wli-card__list--good">
              {insights.recover.map((line, i) => (
                <li key={i}><span className="wli-card__check wli-card__check--ok">✓</span>{line}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {caseKey === 'top10' && (
        <div className="wli-card__section">
          <div className="wli-card__section-eyebrow">🚀 What Kept You Ahead in the Top 10 Race</div>
          <ul className="wli-card__list wli-card__list--good">
            {insights.ahead.map((line, i) => (
              <li key={i}><span className="wli-card__check wli-card__check--ok">✓</span>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {caseKey === 'other' && (
        <div className="wli-card__section">
          <div className="wli-card__section-eyebrow">📈 Where You Can Improve This Week</div>
          <ul className="wli-card__list wli-card__list--good">
            {insights.improve.map((line, i) => (
              <li key={i}><span className="wli-card__check wli-card__check--ok">✓</span>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="wli-card__divider" />

      <div className="wli-card__cta">
        <p className="wli-card__congrats">{insights.cta}</p>
        <button type="button" className="wli-card__btn" data-wli-action="done">Got it — Start My Week</button>
      </div>
    </div>
  );
}

export function WeeklyLearningInsightsPopup({ open, onClose, recap, me, caseKey, recapId, email }) {
  // Auto-flip after 10 seconds (per spec) for non-bottom50 cases.
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!open || !recap || caseKey === 'bottom50') return;
    const t = setTimeout(() => setFlipped(true), 10000);
    return () => { clearTimeout(t); setFlipped(false); };
  }, [open, recap, caseKey]);

  const insights = useMemo(() => {
    if (!recap || !me || !caseKey || caseKey === 'bottom50') return null;
    return buildInsights(me, caseKey);
  }, [recap, me, caseKey]);

  if (!recap || !caseKey || caseKey === 'bottom50') return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="wli-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wli-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <CelebrationLayer caseKey={caseKey} />
          <motion.div
            className={`wli-stack${flipped ? ' is-flipped' : ''}`}
            initial={{ y: 24, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.97, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <button
              type="button"
              className="wli-overlay__close"
              onClick={onClose}
              aria-label="Close"
            >×</button>
            <div className="wli-card-flip">
              <div className="wli-card-face wli-card-face--front">
                <ChampionCard recap={recap} me={me} caseKey={caseKey} />
              </div>
              <div className="wli-card-face wli-card-face--back">
                {insights && <InsightsCard insights={insights} caseKey={caseKey} />}
              </div>
            </div>
            <div className="wli-foot">
              <button
                type="button"
                className="wli-foot__btn"
                onClick={onClose}
              >
                {flipped ? 'Continue to Dashboard' : 'Skip to Dashboard'}
              </button>
              <div className="wli-foot__progress" aria-hidden="true">
                <div
                  className="wli-foot__progress-fill"
                  style={{ width: flipped ? '100%' : '0%' }}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ----- Dismissal flag helpers -----
export function wasInsightsDismissed(recapId) {
  if (!recapId) return true;
  try { return !!localStorage.getItem(`wli_dismissed_${recapId}`); }
  catch { return false; }
}

export function markInsightsDismissed(recapId) {
  if (!recapId) return;
  try { localStorage.setItem(`wli_dismissed_${recapId}`, '1'); }
  catch {}
}