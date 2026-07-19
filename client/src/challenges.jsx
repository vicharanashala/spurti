/**
 * client/src/challenges.jsx
 *
 * Peer Challenge UI components for the Spurti frontend.
 *
 * STACK: React + vanilla CSS using project design tokens:
 *   --primary, --panel, --line, --muted, --green, --red, --amber, --shadow.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

function formatCountdown(totalSeconds) {
  if (totalSeconds <= 0) return 'Expired';
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function useCountdown(initialSeconds) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (seconds <= 0) return;
    const interval = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [seconds]);

  return seconds;
}

// ─── PEER SEARCH DEBOUNCE HOOK ──────────────────────────────────────────────
function useDebounce(fn, delay) {
  const timer = useRef(null);
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  return useCallback(
    (...args) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay]
  );
}

// ─── ACTIVE CHALLENGES WIDGET (Main Tab Screen) ──────────────────────────────
export function ActiveChallengesWidget({ onViewChallenge, onStartChallenge }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch(`${API}/challenges/mine`);
      if (!res.ok) throw new Error('Failed to load challenges');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenges();
    // Poll every 30 seconds for progress updates
    const interval = setInterval(fetchChallenges, 30000);
    return () => clearInterval(interval);
  }, [fetchChallenges]);

  const handleAction = async (id, action) => {
    try {
      const res = await fetch(`${API}/challenges/${id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const errJson = await res.json();
        alert(errJson.error || `Failed to ${action} challenge`);
        return;
      }
      fetchChallenges();
    } catch (err) {
      alert(`Network error trying to ${action} challenge.`);
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading your challenges...</div>;
  if (error) return <div className="error-panel" style={{ padding: 20, color: 'var(--red)' }}>Error: {error}</div>;

  const { profile, sentPending, receivedPending, active, history } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Balance overview header */}
      <div className="panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 20, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <span className="eyebrow" style={{ fontSize: 11, letterSpacing: '0.05em', color: 'var(--muted)', textTransform: 'uppercase' }}>Your SP Balance</span>
          <div style={{ display: 'flex', gap: 24, marginTop: 4 }}>
            <div>
              <strong style={{ fontSize: 24, fontWeight: 800 }}>{profile.totalSp}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>Total SP</span>
            </div>
            <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24 }}>
              <strong style={{ fontSize: 24, fontWeight: 800 }}>{profile.availableSp}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>Available SP</span>
            </div>
            {profile.lockedSp > 0 && (
              <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 24 }}>
                <strong style={{ fontSize: 24, fontWeight: 800, color: 'var(--amber)' }}>{profile.lockedSp}</strong>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>Locked in Escrow</span>
              </div>
            )}
          </div>
        </div>
        <button className="primary" onClick={onStartChallenge}>⚔️ Challenge a Peer</button>
      </div>

      {/* Received Pending Invites */}
      {receivedPending.length > 0 && (
        <section className="panel">
          <h2>Challenges Awaiting Your Response</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {receivedPending.map(c => (
              <div key={c._id} className="card" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{c.challengerName} challenged you</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    Topic: <strong style={{ color: 'var(--primary)' }}>{c.topic.replace('_', ' ')}</strong> · Wager: <strong>{c.betAmount} SP</strong>
                  </p>
                  <CountdownTimer label="Time to respond:" initialSeconds={c.respondTimeoutSec} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="secondary" style={{ padding: '6px 12px', minHeight: 'auto' }} onClick={() => handleAction(c._id, 'decline')}>Decline</button>
                  <button className="primary" style={{ padding: '6px 12px', minHeight: 'auto' }} onClick={() => handleAction(c._id, 'accept')}>Accept & Wager</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active Wagers */}
      <section className="panel">
        <h2>Active Challenges</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {active.length === 0 ? (
            <p className="empty" style={{ margin: 0, padding: '20px 0', textAlign: 'center', color: 'var(--muted)' }}>No active challenges. Challenge a peer to start one!</p>
          ) : (
            active.map(c => (
              <ActiveChallengeCard key={c._id} challenge={c} onView={() => onViewChallenge(c._id)} />
            ))
          )}
        </div>
      </section>

      {/* Sent Pending Invites */}
      {sentPending.length > 0 && (
        <section className="panel">
          <h2>Sent Challenge Invitations (Pending Opponent Response)</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {sentPending.map(c => (
              <div key={c._id} className="card" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>Sent to {c.opponentName}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--muted)' }}>
                    Topic: <strong style={{ color: 'var(--primary)' }}>{c.topic.replace('_', ' ')}</strong> · Wager: <strong>{c.betAmount} SP</strong>
                  </p>
                  <CountdownTimer label="Expires in:" initialSeconds={c.respondTimeoutSec} />
                </div>
                <button className="secondary" style={{ padding: '6px 12px', minHeight: 'auto', border: '1px solid var(--red)', color: 'var(--red)' }} onClick={() => handleAction(c._id, 'cancel')}>Cancel Request</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Settlement History */}
      <section className="panel">
        <h2>Challenge History</h2>
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          {history.length === 0 ? (
            <p className="empty" style={{ padding: '20px 0', textAlign: 'center', color: 'var(--muted)' }}>No settled challenges on record.</p>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>Date</th>
                  <th style={{ padding: '8px 12px' }}>Opponent</th>
                  <th style={{ padding: '8px 12px' }}>Topic</th>
                  <th style={{ padding: '8px 12px' }}>Wager</th>
                  <th style={{ padding: '8px 12px' }}>Outcome</th>
                  <th style={{ padding: '8px 12px' }}>Details / Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map(c => {
                  const isChallenger = c.challengerEmail === profile.email;
                  const opponentName = isChallenger ? c.opponentName : c.challengerName;
                  const outcome = c.status === 'completed'
                    ? (c.winnerId && c.winnerId.toString() === profile._id?.toString() || c.winnerId === profile._id ? 'Won' : 'Lost')
                    : c.status.toUpperCase();

                  const outcomeStyle = outcome === 'Won'
                    ? { color: 'var(--green)', fontWeight: 700 }
                    : outcome === 'Lost'
                      ? { color: 'var(--red)', fontWeight: 700 }
                      : { color: 'var(--muted)', fontWeight: 600 };

                  return (
                    <tr key={c._id} style={{ borderBottom: '1px solid var(--line)', cursor: 'pointer' }} onClick={() => onViewChallenge(c._id)}>
                      <td style={{ padding: '12px' }}>{new Date(c.settledAt || c.updatedAt).toLocaleDateString()}</td>
                      <td style={{ padding: '12px' }}><strong>{opponentName}</strong></td>
                      <td style={{ padding: '12px' }}>{c.topic.replace('_', ' ')}</td>
                      <td style={{ padding: '12px' }}>{c.betAmount} SP</td>
                      <td style={{ padding: '12px', ...outcomeStyle }}>{outcome}</td>
                      <td style={{ padding: '12px', fontSize: 12, color: 'var(--muted)' }}>{c.resultReason || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Explainer Link */}
      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <a href={`${APP_BASE}/challenge/how-it-works`} style={{ fontWeight: 700, color: 'var(--primary)', textDecoration: 'none' }}>
          How Peer Challenges Work →
        </a>
      </div>
    </div>
  );
}

// ─── ACTIVE CHALLENGE CARD COMPONENT ──────────────────────────────────────────
function ActiveChallengeCard({ challenge, onView }) {
  const { _id, opponentName, challengerName, topic, betAmount, liveProgress, endAtSec } = challenge;
  const isChallenger = true; // We resolve names based on active viewer context or display both

  return (
    <div className="card" onClick={onView} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 12, transition: 'box-shadow 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{challengerName} vs {opponentName}</h3>
          <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Topic: {topic.replace('_', ' ')} · Wager: {betAmount} SP</span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Ends in:</span>
          <strong style={{ fontSize: 13, color: 'var(--primary)' }}>
            <Countdown timerSeconds={endAtSec} />
          </strong>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 6 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>{challengerName} (Challenger)</span>
            <strong>{liveProgress.challenger}{topic === 'vibe_course' || topic === 'poll_accuracy' ? '%' : ' pts'}</strong>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${topic === 'vibe_course' || topic === 'poll_accuracy' ? liveProgress.challenger : (liveProgress.challenger / 50) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 3 }} />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>{opponentName} (Opponent)</span>
            <strong>{liveProgress.opponent}{topic === 'vibe_course' || topic === 'poll_accuracy' ? '%' : ' pts'}</strong>
          </div>
          <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${topic === 'vibe_course' || topic === 'poll_accuracy' ? liveProgress.opponent : (liveProgress.opponent / 50) * 100}%`, height: '100%', background: 'var(--amber)', borderRadius: 3 }} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--muted)' }}>
        <span>⚠️ Demo progress data — not yet connected to live course grades.</span>
        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>View Details →</span>
      </div>
    </div>
  );
}

// ─── COUNTDOWN COMPONENT ──────────────────────────────────────────────────────
function Countdown({ timerSeconds }) {
  const sec = useCountdown(timerSeconds);
  return <>{formatCountdown(sec)}</>;
}

function CountdownTimer({ label, initialSeconds }) {
  const sec = useCountdown(initialSeconds);
  return (
    <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, marginTop: 4 }}>
      {label} {formatCountdown(sec)}
    </div>
  );
}

// ─── CHALLENGE BROWSER (Create challenge form) ────────────────────────────────
export function ChallengeBrowser({ onClose, studentSp }) {
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [betAmount, setBetAmount] = useState(5);
  const [durationDays, setDurationDays] = useState(3);
  const [peerQuery, setPeerQuery] = useState('');
  const [peers, setPeers] = useState([]);
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lockedSp, setLockedSp] = useState(0);

  useEffect(() => {
    // Fetch topics
    fetch(`${API}/challenges/topics`)
      .then(res => res.json())
      .then(data => setTopics(data.topics || []))
      .catch(err => console.error(err));

    // Fetch locked SP to determine available SP
    fetch(`${API}/challenges/mine`)
      .then(res => res.json())
      .then(data => {
        setLockedSp(data.profile?.lockedSp || 0);
      })
      .catch(err => console.error(err));
  }, []);

  const availableSp = studentSp - lockedSp;

  const searchPeers = useCallback((q) => {
    if (q.length < 2) {
      setPeers([]);
      return;
    }
    setSearching(true);
    fetch(`${API}/challenges/peers?q=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then(data => setPeers(data.matches || []))
      .catch(err => console.error(err))
      .finally(() => setSearching(false));
  }, []);

  const debouncedSearch = useDebounce(searchPeers, 300);

  const handlePeerInput = (e) => {
    const val = e.target.value;
    setPeerQuery(val);
    setSelectedPeer(null);
    debouncedSearch(val);
  };

  const handleSelectPeer = (peer) => {
    if (peer.limitExceeded) return;
    setSelectedPeer(peer);
    setPeerQuery(peer.name);
    setPeers([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedTopic || !selectedPeer || betAmount < 1 || betAmount > availableSp) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/challenges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opponentEmail: selectedPeer.email,
          topic: selectedTopic.key,
          betAmount,
          durationDays
        })
      });

      if (!res.ok) {
        const json = await res.json();
        alert(json.error || 'Failed to issue challenge.');
      } else {
        alert(`Challenge invitation sent to ${selectedPeer.name}!`);
        onClose();
      }
    } catch (err) {
      alert('Error creating challenge invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2>Challenge a Peer</h2>
        <button className="secondary" onClick={onClose} style={{ minHeight: 'auto', padding: '4px 8px' }}>Close</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Step 1: Select Topic */}
        <div>
          <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>1. Select Topic</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {topics.map(t => (
              <div
                key={t.key}
                onClick={() => setSelectedTopic(t)}
                style={{
                  border: selectedTopic?.key === t.key ? '2px solid var(--primary)' : '1px solid var(--line)',
                  borderRadius: 8,
                  padding: 12,
                  cursor: 'pointer',
                  background: selectedTopic?.key === t.key ? '#f0f9ff' : 'var(--panel)',
                  transition: 'border-color 0.2s'
                }}
              >
                <strong style={{ display: 'block', fontSize: 13 }}>{t.label}</strong>
                <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginTop: 4, lineHeight: '1.3em' }}>{t.description}</span>
                <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600, display: 'block', marginTop: 8 }}>⚠️ Simulated Progress</span>
              </div>
            ))}
          </div>
        </div>

        {/* Step 2: Search Peer */}
        <div style={{ position: 'relative' }}>
          <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>2. Choose Opponent</label>
          <input
            type="text"
            placeholder="Search classmate by name or email"
            value={peerQuery}
            onChange={handlePeerInput}
            style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
          />
          {searching && <span style={{ position: 'absolute', right: 12, top: 38, fontSize: 12, color: 'var(--muted)' }}>Searching...</span>}

          {peers.length > 0 && (
            <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 6, padding: 0, margin: '4px 0 0 0', listStyle: 'none', maxHeight: 200, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
              {peers.map(p => (
                <li
                  key={p._id}
                  onClick={() => handleSelectPeer(p)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--line)',
                    cursor: p.limitExceeded ? 'not-allowed' : 'pointer',
                    opacity: p.limitExceeded ? 0.6 : 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <strong>{p.name}</strong> <span style={{ fontSize: 11, color: 'var(--muted)' }}>({p.email})</span>
                  </div>
                  {p.limitExceeded ? (
                    <span style={{ fontSize: 10, color: 'var(--red)', fontWeight: 600 }}>At Limit (3/3)</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>Select</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Step 3: Set Wager & Duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>3. Set Wager (SP)</label>
            <input
              type="number"
              min="1"
              max={availableSp}
              value={betAmount}
              onChange={e => setBetAmount(Math.max(1, Number(e.target.value)))}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 6 }}
            />
            <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, display: 'block' }}>Available: {availableSp} SP</span>
          </div>

          <div>
            <label style={{ fontWeight: 700, display: 'block', marginBottom: 8 }}>4. Duration (Days)</label>
            <input
              type="range"
              min="1"
              max="7"
              value={durationDays}
              onChange={e => setDurationDays(Number(e.target.value))}
              style={{ width: '100%', marginTop: 12 }}
            />
            <span style={{ fontSize: 12, fontWeight: 700, display: 'block', marginTop: 4 }}>{durationDays} Days</span>
          </div>
        </div>

        {/* Form Validation messages */}
        {betAmount > availableSp && (
          <div style={{ color: 'var(--red)', fontSize: 12, fontWeight: 600 }}>
            ❌ You cannot wager more SP than your available balance ({availableSp} SP).
          </div>
        )}

        {/* Review Submit */}
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="primary"
            disabled={submitting || !selectedTopic || !selectedPeer || betAmount < 1 || betAmount > availableSp}
          >
            {submitting ? 'Sending Request...' : 'Issue Challenge'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── CHALLENGE DETAIL ────────────────────────────────────────────────────────
export function ChallengeDetail({ challengeId, studentId, onBack }) {
  const [c, setC] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`${API}/challenges/${challengeId}`)
      .then(res => {
        if (!res.ok) throw new Error('Challenge not found');
        return res.json();
      })
      .then(data => {
        setC(data.challenge);
        setError(null);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [challengeId]);

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading details...</div>;
  if (error) return <div className="error-panel" style={{ padding: 20, color: 'var(--red)' }}>Error: {error}</div>;

  const isActive = c.status === 'active';
  const isHistory = ['completed', 'expired', 'declined', 'cancelled', 'void'].includes(c.status);

  const prog = isActive ? c.liveProgress : (isHistory ? c.progressFinal : c.progressSnapshot);

  return (
    <div className="panel" style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <button className="secondary" onClick={onBack} style={{ marginBottom: 16, minHeight: 'auto', padding: '6px 12px' }}>← Back</button>

      <div style={{ borderBottom: '1px solid var(--line)', paddingBottom: 16, marginBottom: 20 }}>
        <p className="eyebrow" style={{ color: 'var(--muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.05em' }}>P2P Challenge Wager</p>
        <h2 style={{ margin: '4px 0 0 0' }}>{c.challengerName} vs {c.opponentName}</h2>
        <span style={{ fontSize: 12, background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, display: 'inline-block', marginTop: 8, fontWeight: 700 }}>
          Status: {c.status.toUpperCase()}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Core parameters */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block' }}>Challenge Topic</span>
            <strong style={{ fontSize: 14 }}>{c.topic.replace('_', ' ')}</strong>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block' }}>Pot Wager Size</span>
            <strong style={{ fontSize: 14 }}>{c.betAmount} SP each ({c.betAmount * 2} SP total pot)</strong>
          </div>
        </div>

        {/* Dates */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block' }}>Start Date</span>
            <span style={{ fontSize: 13 }}>{c.startAt ? new Date(c.startAt).toLocaleString() : 'Not started yet'}</span>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', display: 'block' }}>End Date</span>
            <span style={{ fontSize: 13 }}>{c.endAt ? new Date(c.endAt).toLocaleString() : '—'}</span>
          </div>
        </div>

        {/* Progress details */}
        <div>
          <h3 style={{ fontSize: 14, margin: '0 0 12px 0', borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>Progress Progress</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#f8fafc', padding: 16, borderRadius: 8 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <strong>{c.challengerName}</strong>
                <span>{prog.challenger}{c.topic === 'vibe_course' || c.topic === 'poll_accuracy' ? '%' : ' pts'}</span>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${c.topic === 'vibe_course' || c.topic === 'poll_accuracy' ? prog.challenger : (prog.challenger / 50) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 4 }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <strong>{c.opponentName}</strong>
                <span>{prog.opponent}{c.topic === 'vibe_course' || c.topic === 'poll_accuracy' ? '%' : ' pts'}</span>
              </div>
              <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${c.topic === 'vibe_course' || c.topic === 'poll_accuracy' ? prog.opponent : (prog.opponent / 50) * 100}%`, height: '100%', background: 'var(--amber)', borderRadius: 4 }} />
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', margin: 0 }}>
              ⚠️ Simulated progress indicators. Actual Course and Poll grading tracking integration is currently pending.
            </p>
          </div>
        </div>

        {/* Settlement result */}
        {isHistory && (
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: 16, borderRadius: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--green)', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Resolution Outcome</span>
            <strong style={{ fontSize: 14, color: '#166534', display: 'block', marginTop: 4 }}>
              {c.resultReason || 'Challenge voided or tied.'}
            </strong>
          </div>
        )}

        {/* Audit Trail */}
        {c.auditTrail && c.auditTrail.length > 0 && (
          <div>
            <h3 style={{ fontSize: 13, margin: '0 0 10px 0', color: 'var(--muted)', textTransform: 'uppercase' }}>History & Audit Log</h3>
            <ul style={{ paddingLeft: 20, margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: '1.6em' }}>
              {c.auditTrail.map((log, i) => (
                <li key={i}>
                  <strong>{new Date(log.at).toLocaleString()}</strong> - {log.actor} ({log.action}): {log.detail}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
