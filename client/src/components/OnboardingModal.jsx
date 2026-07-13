import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const STEPS = [
  {
    icon: 'SP',
    title: 'Welcome to Spurti',
    description: 'Spurti Points (SP) track how consistently you show up and participate throughout the program. Every session is a fresh opportunity to earn points and climb the leaderboard.',
    Visual: SpCounterVisual,
  },
  {
    icon: '%',
    title: 'How you earn SP',
    description: 'SP is earned based on how much of each session you attend and how many polls you answer. Stay for 90%+ of a session and earn +10 SP. Answer 90%+ of polls and earn another +10 SP. Partial effort still earns partial SP. No penalties for missing a session.',
    Visual: RulesTableVisual,
  },
  {
    icon: '#',
    title: 'Your rank matters',
    description: 'You are ranked against all students in your cohort. Your rank updates after every session. Consistent effort beats everything — SP compounds over time and small gains every day add up to a big rank difference by the end of the program.',
    Visual: LeaderboardVisual,
  },
  {
    icon: '!',
    title: 'We have got your back',
    description: 'If you start falling behind, you will get a personal nudge — in-app and by email — with exactly what to do next. The system watches your attendance and poll patterns so no one falls behind silently.',
    Visual: NudgeVisual,
  },
  {
    icon: 'Go',
    title: 'Ready to earn your first SP?',
    description: 'Stay for the full session and answer every poll — that is +20 SP in a single day. Even partial attendance earns you points. Show up consistently and your SP compounds fast.',
    Visual: SpSimulatorVisual,
  },
];

export default function OnboardingModal({ studentEmail, onComplete }) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('in');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPhase('out');
    const id = requestAnimationFrame(() => setPhase('in'));
    return () => cancelAnimationFrame(id);
  }, [step]);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const Visual = current.Visual;

  async function markComplete() {
    setSubmitting(true);
    try {
      await fetch(`${API}/onboarding/${encodeURIComponent(studentEmail)}/complete`, { method: 'POST' });
    } catch {
      // best-effort — the tour still closes even if the request fails
    } finally {
      setSubmitting(false);
      onComplete();
    }
  }

  function handleNext() {
    if (isLast) {
      markComplete();
    } else {
      setStep((s) => s + 1);
    }
  }

  function handlePrevious() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-wrapper">
        <div className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
          <div className="onboarding-header">
            <span className="onboarding-step-label">Step {step + 1} of {STEPS.length}</span>
            <h2 id="onboarding-title" className="onboarding-title">{current.title}</h2>
            <button type="button" className="onboarding-skip" onClick={markComplete} disabled={submitting}>
              Skip
            </button>
          </div>
          <div className="onboarding-progress-bar">
            <div className="onboarding-progress-bar-fill" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <div className="onboarding-body">
            <div key={step} className={`onboarding-step-content phase-${phase}`}>
              <div className="onboarding-icon-row">
                <div className="onboarding-icon-circle">{current.icon}</div>
              </div>
              <h3 className="onboarding-step-title">{current.title}</h3>
              <p className="onboarding-step-description">{current.description}</p>
              <Visual />
            </div>
          </div>
          <div className="onboarding-footer">
            <div className="onboarding-dots">
              {STEPS.map((_, i) => (
                <span key={i} className={`onboarding-dot ${i === step ? 'active' : ''}`} />
              ))}
            </div>
            <div className="onboarding-nav">
              {step > 0 && (
                <button type="button" className="onboarding-btn-secondary" onClick={handlePrevious}>
                  Previous
                </button>
              )}
              <button type="button" className="onboarding-btn-primary" onClick={handleNext} disabled={submitting}>
                {isLast ? "Let's go!" : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SpCounterVisual() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const duration = 1500;
    const start = performance.now();
    let raf;
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      setCount(Math.round(progress * 100));
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="onboarding-visual-card onboarding-sp-counter">
      <div className="onboarding-sp-counter-value">{count}</div>
      <div className="onboarding-sp-counter-caption">SP &middot; Your starting balance</div>
    </div>
  );
}

const RULE_ROWS = [
  { label: '90%+', sp: '+10 SP', bg: '#dcfce7', color: '#166534' },
  { label: '75–89%', sp: '+5 SP', bg: '#fef9c3', color: '#854d0e' },
  { label: '50–74%', sp: '+3 SP', bg: '#f1f5f9', color: '#475569' },
];

function RulesTableVisual() {
  return (
    <div className="onboarding-visual-card onboarding-rules-table">
      {['Attendance', 'Polls'].map((col) => (
        <div key={col} className="onboarding-rules-col">
          <div className="onboarding-rules-col-header">{col}</div>
          {RULE_ROWS.map((row) => (
            <div key={row.label} className="onboarding-rules-row">
              <span>{row.label}</span>
              <span className="onboarding-rules-badge" style={{ background: row.bg, color: row.color }}>{row.sp}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const LEADERBOARD_ROWS = [
  { rank: 1, name: 'Aisha Verma', sp: 420, cls: 'rank-1' },
  { rank: 2, name: 'Rohan Mehta', sp: 385, cls: 'rank-2' },
  { rank: 3, name: 'You', sp: 310, cls: 'rank-you' },
];

function LeaderboardVisual() {
  return (
    <div className="onboarding-visual-card">
      {LEADERBOARD_ROWS.map((row) => (
        <div key={row.rank} className={`onboarding-lb-row ${row.cls}`}>
          <span className="onboarding-lb-rank">{row.rank}</span>
          <span className="onboarding-lb-name">{row.name}</span>
          <span className="onboarding-lb-sp">{row.sp} SP</span>
        </div>
      ))}
    </div>
  );
}

function NudgeVisual() {
  return (
    <div className="onboarding-visual-card onboarding-nudge-visual">
      <div className="onboarding-nudge-banner">
        <span className="onboarding-nudge-icon">!</span>
        <span className="onboarding-nudge-text">
          Hey Priya, you missed 2 sessions this week. Showing up tomorrow puts you back on track.
        </span>
        <button type="button" className="onboarding-nudge-dismiss">Dismiss</button>
      </div>
    </div>
  );
}

function SpSimulatorVisual() {
  const [attendance, setAttendance] = useState(true);
  const [polls, setPolls] = useState(true);
  const total = (attendance ? 10 : 0) + (polls ? 10 : 0);

  return (
    <div className="onboarding-visual-card onboarding-simulator">
      <label className="onboarding-sim-row">
        <span>Attendance</span>
        <input type="checkbox" checked={attendance} onChange={() => setAttendance((v) => !v)} />
      </label>
      <label className="onboarding-sim-row">
        <span>Polls</span>
        <input type="checkbox" checked={polls} onChange={() => setPolls((v) => !v)} />
      </label>
      <div className="onboarding-sim-total">
        <strong>{total} SP</strong>
        <span>potential SP from this session</span>
      </div>
    </div>
  );
}
