import React, { useEffect, useState } from 'react';

const BREAKDOWN_ROWS = [
  ['attendance', 'Attendance'],
  ['pollParticipation', 'Poll participation'],
  ['pollQuality', 'Poll quality'],
  ['queryActivity', 'Query activity']
];

export function SpRiskPanel({ api, email }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const r = await fetch(`${api}/risk/state?email=${encodeURIComponent(email)}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Could not load SP risk.');
        if (active) { setData(j); setError(null); }
      } catch (err) {
        if (active) setError(err.message || 'Could not load SP risk.');
      }
    })();
    return () => { active = false; };
  }, [api, email]);

  if (error) {
    return (
      <section className="sp-risk">
        <p className="eyebrow">SP Risk</p>
        <p className="error">{error}</p>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="sp-risk">
        <p className="muted">Loading your SP risk…</p>
      </section>
    );
  }

  const level = String(data.riskLevel || 'Low');
  const suggestions = (data.recoverySuggestions || []).slice(0, 3);
  const breakdown = data.breakdown || {};
  const days = data.daysAnalyzed || 14;

  // No sessions, polls or queries landed in the window, so the score would read
  // High purely from absent data — say so instead of blaming the student.
  if (!hasActivity(data)) {
    return (
      <section className="sp-risk">
        <div className="sp-risk-head">
          <div>
            <p className="eyebrow">SP Risk Predictor</p>
            <h2>Last {days} days</h2>
          </div>
          <span className="sp-risk-badge">Not enough data yet</span>
        </div>
        <p className="muted">
          No attendance, poll or peer-query activity is recorded in this window yet, so there is
          nothing to score. Your risk level appears once the next session, poll or credited query lands.
        </p>
      </section>
    );
  }

  return (
    <section className="sp-risk">
      <div className="sp-risk-head">
        <div>
          <p className="eyebrow">SP Risk Predictor</p>
          <h2>Last {days} days</h2>
        </div>
        <span className={`sp-risk-badge risk-${level.toLowerCase()}`}>{level} risk</span>
      </div>

      <div className="level-tiles sp-risk-tiles">
        <div className="level-tile">
          <span>Current SP</span>
          <strong>{data.currentSp}</strong>
          <em>live balance</em>
        </div>
        <div className={`level-tile league tier-${String(data.trophyLeague || 'Bronze').split(' ')[0].toLowerCase()}`}>
          <span>Trophy League</span>
          <strong>{data.trophyLeague || '—'}</strong>
          <em>from current SP</em>
        </div>
        <div className="level-tile">
          <span>Risk Level</span>
          <strong>{level}</strong>
          <em>Low / Medium / High</em>
        </div>
        <div className="level-tile">
          <span>Risk Score</span>
          <strong>{data.riskScore}</strong>
          <em>0 is safest, 100 is highest risk</em>
        </div>
      </div>

      <p className="muted sp-risk-meta">
        Recovery outlook: <b>+{Number(data.projectedSpGain) || 0} SP</b> is realistically within reach
        {data.projectedLeague && data.projectedLeague !== data.trophyLeague
          ? <> — enough to reach <b>{data.projectedLeague}</b></>
          : null}.
        {data.nextLeague
          ? ` ${data.spToNextLeague} SP more reaches ${data.nextLeague}.`
          : ' You are in the top league.'}
      </p>

      <h3 className="sp-risk-sub">Why am I at risk?</h3>
      <p className="muted sp-risk-meta">
        Each bar is that factor’s share of the {data.riskScore} risk score
        {data.sessionsConsidered != null ? ` · ${data.sessionsConsidered} session${data.sessionsConsidered === 1 ? '' : 's'}` : ''}
        {data.pollsConsidered != null ? ` · ${data.pollsConsidered} poll${data.pollsConsidered === 1 ? '' : 's'}` : ''}
        {data.queriesConsidered != null ? ` · ${data.queriesConsidered} quer${data.queriesConsidered === 1 ? 'y' : 'ies'}` : ''}
        {' '}in this window.
      </p>
      <div className="bars sp-risk-bars">
        {BREAKDOWN_ROWS.map(([key, label]) => {
          const row = breakdown[key] || {};
          const points = Number(row.points) || 0;
          const metric = row.metric;
          const width = Math.max(0, Math.min(100, points));
          return (
            <div className="bar-row" key={key}>
              <span>{label}</span>
              <div><i style={{ width: `${width}%` }} /></div>
              <b>{points}</b>
            </div>
          );
        })}
      </div>
      {Array.isArray(data.reasons) && data.reasons.length > 0 && (
        <ul className="sp-risk-reasons">
          {data.reasons.map((reason, i) => <li key={i}>{reason}</li>)}
        </ul>
      )}

      <h3 className="sp-risk-sub">Recovery plan</h3>
      {suggestions.length === 0 ? (
        <p className="muted">No recovery actions right now.</p>
      ) : (
        <div className="sp-risk-plan">
          {suggestions.map((s, i) => (
            <article className={`sp-risk-action priority-${String(s.priority || 'medium').toLowerCase()}`} key={i}>
              <header>
                <span className={`jr-pill ${priorityPill(s.priority)}`}>{s.priority || 'medium'}</span>
                <strong className="sp-risk-sp">+{Number(s.estimatedSp) || 0} SP</strong>
              </header>
              <p>{s.action}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function hasActivity(data) {
  return (Number(data.sessionsConsidered) || 0) > 0
    || (Number(data.pollsConsidered) || 0) > 0
    || (Number(data.queriesConsidered) || 0) > 0;
}

function priorityPill(priority) {
  const p = String(priority || '').toLowerCase();
  if (p === 'high') return 'amber';
  if (p === 'low') return 'green';
  return '';
}
