import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;
const MAX_CHARS = 500;

function safeJson(res) {
  return res.text().then(text => {
    try { return text ? JSON.parse(text) : {}; } catch { return { error: text || res.statusText }; }
  });
}

function countText(value) {
  return String(value || '').length;
}

function ReflectionWall() {
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState(null);
  const [myReflection, setMyReflection] = useState(null);
  const [reflections, setReflections] = useState([]);
  const [form, setForm] = useState({ learnedText: '' });
  const [errors, setErrors] = useState({});
  const [submitMessage, setSubmitMessage] = useState('');
  const [voteMessage, setVoteMessage] = useState('');
  const [apiError, setApiError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [votePendingId, setVotePendingId] = useState(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (myReflection) {
      setForm({ learnedText: myReflection.learnedText || '' });
    }
  }, [myReflection]);

  async function loadAll() {
    setLoading(true);
    setApiError('');
    setSubmitMessage('');
    setVoteMessage('');
    try {
      const [weekRes, meRes, listRes, resultsRes] = await Promise.all([
        fetch(`${API}/reflection/week`),
        fetch(`${API}/reflection/me`),
        fetch(`${API}/reflection/list`),
        fetch(`${API}/reflection/results`)
      ]);

      if (!weekRes.ok) {
        const body = await safeJson(weekRes);
        throw new Error(body.error || 'Unable to load reflection status.');
      }
      const weekData = await weekRes.json();
      setWeek(weekData);

      if (meRes.ok) {
        const myData = await meRes.json();
        setMyReflection(myData.reflection || null);
      } else if (meRes.status === 401) {
        setMyReflection(null);
      } else {
        const body = await safeJson(meRes);
        throw new Error(body.error || 'Unable to load your reflection.');
      }

      if (!listRes.ok) {
        const body = await safeJson(listRes);
        throw new Error(body.error || 'Unable to load reflections.');
      }
      const listData = await listRes.json();
      const reflectionsList = listData.reflections || [];
      const votedSet = new Set(listData.voted || []);
      setReflections(reflectionsList.map(r => ({ ...r, voted: votedSet.has(r.id) })));

      // resultsRes may be 200 with { available: true, winners: [...] } or { available: false }
      if (resultsRes && resultsRes.ok) {
        const resultsBody = await safeJson(resultsRes);
        if (resultsBody.available) {
          // mark winning reflections with student info
          const winnersMap = new Map((resultsBody.winners || []).map(w => [w.id, w]));
          setReflections(prev => prev.map(r => winnersMap.has(r.id) ? { ...r, winner: winnersMap.get(r.id) } : r));
        }
      }
    } catch (err) {
      setApiError(err.message || 'Something went wrong while loading reflection data.');
    } finally {
      setLoading(false);
    }
  }

  function validateForm() {
    const next = {};
    if (!form.learnedText || !form.learnedText.trim()) next.learnedText = 'This field is required.';
    if (form.learnedText.length > MAX_CHARS) next.learnedText = `Limit is ${MAX_CHARS} characters.`;
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submitReflection() {
    if (!validateForm()) return;
    setActionPending(true);
    setSubmitMessage('');
    setApiError('');
    try {
      const res = await fetch(`${API}/reflection/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnedText: form.learnedText.trim()
        })
      });
      const body = await safeJson(res);
      if (!res.ok) {
        throw new Error(body.error || 'Unable to submit reflection.');
      }
      setMyReflection(body.reflection || null);
      setSubmitMessage('Reflection submitted successfully.');
      await refreshReflections();
    } catch (err) {
      setApiError(err.message || 'Unable to submit reflection.');
    } finally {
      setActionPending(false);
    }
  }

  async function refreshReflections() {
    try {
      const res = await fetch(`${API}/reflection/list`);
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body.error || 'Unable to refresh reflections.');
      }
      const body = await res.json();
      const votedSet = new Set(body.voted || []);
      setReflections((body.reflections || []).map(r => ({ ...r, voted: votedSet.has(r.id) })));
    } catch (err) {
      setApiError(err.message || 'Unable to refresh reflections.');
    }
  }

  async function voteReflection(reflectionId) {
    // Optimistic switch UI: update local state immediately for responsiveness,
    // then call backend and reconcile with authoritative data.
    setVotePendingId(reflectionId);
    setVoteMessage('');
    setApiError('');

    // derive current voted id (only one allowed)
    const currentVoted = reflections.find(r => r.voted);
    const currentVotedId = currentVoted ? currentVoted.id : null;

    // Build optimistic reflections copy
    const nextReflections = reflections.map(r => {
      if (r.id === reflectionId) {
        // selecting the clicked one
        return { ...r, voted: true, appreciationCount: Number(r.appreciationCount || 0) + 1 };
      }
      if (r.id === currentVotedId) {
        // deselect the previously voted one
        return { ...r, voted: false, appreciationCount: Math.max(0, Number(r.appreciationCount || 0) - 1) };
      }
      return r;
    });

    // If clicking the already-selected reflection, toggle it off optimistically
    if (currentVotedId === reflectionId) {
      setReflections(reflections.map(r => r.id === reflectionId ? { ...r, voted: false, appreciationCount: Math.max(0, Number(r.appreciationCount || 0) - 1) } : r));
    } else {
      setReflections(nextReflections.map(r => ({ ...r })));
    }

    try {
      const res = await fetch(`${API}/reflection/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reflectionId })
      });
      const body = await safeJson(res);
      if (!res.ok) {
        throw new Error(body.error || 'Unable to toggle appreciation.');
      }

      // Backend succeeded. If it provided switchedFrom, we can update that item quickly,
      // otherwise refresh authoritative list to ensure counts are correct.
      if (body.switchedFrom) {
        setReflections(prev => prev.map(r => {
          if (r.id === reflectionId) return { ...r, voted: !!body.voted, appreciationCount: Number(r.appreciationCount || 0) + (body.voted ? 0 : 0) };
          if (r.id === body.switchedFrom) return { ...r, voted: false, appreciationCount: Math.max(0, Number(r.appreciationCount || 0) - 1) };
          return r;
        }));
        // ensure voted array matches
        setReflections(prev => prev.map(r => ({ ...r, voted: Boolean(r.voted) })));
      } else {
        // If backend didn't tell us the previous id, refresh authoritative state.
        await refreshReflections();
      }

      // If backend indicates the clicked reflection is now unvoted, ensure voted state cleared
      if (body.voted === false) {
        setReflections(prev => prev.map(r => r.id === reflectionId ? { ...r, voted: false } : r));
      }
    } catch (err) {
      // On error, revert optimistic changes by reloading authoritative state
      setApiError(err.message || 'Unable to toggle appreciation.');
      await refreshReflections();
    } finally {
      setVotePendingId(null);
    }
  }

  const phase = week?.phase || 'none';
  const canSubmit = phase === 'submission';
  const canVote = phase === 'voting';
  const showWall = phase !== 'none';

  return (
    <section className="panel reflection-panel">
      <div className="panel-head">
        <h2>Community Reflection Wall</h2>
      </div>
      {loading ? (
        <p className="muted">Loading reflection data…</p>
      ) : apiError ? (
        <div className="reflection-error"><p className="error">{apiError}</p></div>
      ) : (
        <>
          <div className="reflection-status">
            <strong>Current status:</strong> {phase === 'submission' ? 'Submission open' : phase === 'voting' ? 'Voting open' : phase === 'finalized' ? 'Finalized' : 'No reflection activity this week'}
            {week?.weekLabel ? <span> · Week: {week.weekLabel}</span> : null}
          </div>
          {showWall && phase !== 'none' ? null : (
            <div className="reflection-empty">
              <p>{phase === 'none' ? 'The Community Reflection Wall is not active right now. Check back when a reflection week begins.' : ''}</p>
            </div>
          )}

          {phase === 'submission' && (
            <section className="reflection-section reflection-submit">
              <div className="panel-head"><h3>{myReflection ? 'Update your reflection' : 'Write your reflection'}</h3></div>
              <p className="muted">Share what you learned, experienced, struggled with, or want to improve this week. Your reflection will appear anonymously.</p>
              <div className="reflection-form">
                <label className="reflection-field">
                  <span>Your reflection</span>
                  <textarea
                    value={form.learnedText}
                    onChange={e => setForm(prev => ({ ...prev, learnedText: e.target.value }))}
                    maxLength={MAX_CHARS}
                    rows={4}
                    placeholder="Share what you learned, experienced, struggled with, or want to improve this week..."
                  />
                  <div className="reflection-field-meta">
                    <span className={errors.learnedText ? 'error' : 'muted'}>{errors.learnedText || ''}</span>
                    <span className="reflection-counter">{countText(form.learnedText)}/{MAX_CHARS}</span>
                  </div>
                </label>
              </div>
              <div className="reflection-actions">
                <button className="primary" disabled={actionPending} onClick={submitReflection}>{actionPending ? 'Submitting…' : (myReflection ? 'Update reflection' : 'Submit reflection')}</button>
                {submitMessage && <span className="reflection-success">{submitMessage}</span>}
              </div>
            </section>
          )}

          {myReflection && phase !== 'submission' && (
            <section className="panel reflection-my-reflection">
              <div className="panel-head"><h3>Your reflection</h3></div>
              <div className="reflection-card">
                <p>{myReflection.learnedText}</p>
              </div>
            </section>
          )}

          <section className="panel reflection-wall-section">
            <div className="panel-head"><h3>Reflection Wall</h3></div>
            {reflections.length === 0 ? (
              <div className="reflection-empty"><p>There are no published reflections yet.</p></div>
            ) : (
              <div className="reflection-grid">
                {reflections.map(reflection => {
                  const paragraph = [reflection.learnedText, reflection.challengedText, reflection.improvementText].filter(Boolean).join(' ');
                  const voted = !!reflection.voted;
                  const isMine = myReflection && myReflection.id === reflection.id;
                  return (
                    <article key={reflection.id} className="reflection-card">
                          <div className="reflection-card-body">
                            <div>
                              <h4>{reflection.winner ? reflection.winner.student.name : 'Anonymous Student'}</h4>
                              <p>{paragraph}</p>
                            </div>
                          </div>
                      <div className="reflection-card-footer">
                        <button className={`vote-button ${voted ? 'voted' : ''}`} disabled={!canVote || votePendingId === reflection.id || isMine} onClick={() => voteReflection(reflection.id)}>
                          ⬆ {reflection.appreciationCount}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {voteMessage && <p className="reflection-success">{voteMessage}</p>}
            {phase === 'voting' && reflections.length > 0 && <p className="muted">Click Appreciate to send an anonymous appreciation for a reflection. You may only vote once per week.</p>}
            {phase === 'finalized' && <p className="muted">Voting is closed. The top reflections will be awarded after finalization.</p>}
          </section>
        </>
      )}
    </section>
  );
}

export default ReflectionWall;
