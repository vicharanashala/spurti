import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function GoalMonitoring({ auth }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  
  const [title, setTitle] = useState('');
  const [type, setType] = useState('sp_earned');
  const [target, setTarget] = useState('100');
  const [timeframe, setTimeframe] = useState('week');

  const headers = {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/goals`, { headers });
      if (res.ok) setGoals(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleCreateGoal = async (e) => {
    e.preventDefault();
    if (!title.trim() || !target.trim()) return alert('Please enter goal title and target.');

    setCreating(true);
    try {
      const res = await fetch(`${API}/admin/goals`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title, type, target, timeframe })
      });
      if (res.ok) {
        setTitle('');
        fetchGoals();
        alert('Goal created successfully.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="moderation-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '15px' }}>
      <section className="panel">
        <h2>🎯 Goals Progress Tracking</h2>
        
        {loading ? (
          <p style={{ textAlign: 'center', padding: '20px' }}>Loading custom goals...</p>
        ) : goals.length === 0 ? (
          <p className="empty" style={{ textAlign: 'center', padding: '20px' }}>No custom goals defined yet.</p>
        ) : (
          <div className="goals-grid" style={{ marginTop: '15px' }}>
            {goals.map(g => {
              const percentage = g.totalCount > 0 ? Math.round((g.achievedCount / g.totalCount) * 100) : 0;
              return (
                <div key={g.id} className="goal-card" style={{ border: '1px solid var(--line)', padding: '15px', borderRadius: '8px', background: '#fff', marginBottom: '15px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <h3 style={{ margin: '0 0 6px 0', fontSize: '15px' }}>{g.title}</h3>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 'bold' }}>
                    Target: {g.target} {g.type === 'sp_earned' ? 'SP' : '% avg Attendance'} &bull; Timeframe: {g.timeframe}
                  </span>
                  
                  <div className="goal-progress-container" style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', marginTop: '10px', overflow: 'hidden', position: 'relative' }}>
                    <div className="goal-progress-fill" style={{ width: `${percentage}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginTop: '6px' }}>
                    <span style={{ color: 'var(--primary)' }}>{g.achievedCount} / {g.totalCount} Achieved</span>
                    <span>{percentage}%</span>
                  </div>

                  <details style={{ marginTop: '10px', fontSize: '12px', borderTop: '1px solid var(--line)', paddingTop: '6px' }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>View Achievers List</summary>
                    <ul style={{ margin: '6px 0 0 0', paddingLeft: '20px', maxHeight: '120px', overflowY: 'auto' }}>
                      {g.achievers.map((ach, ai) => (
                        <li key={ai} style={{ marginBottom: '2px' }}>
                          {ach.name} <small style={{ color: 'var(--muted)' }}>({ach.value})</small>
                        </li>
                      ))}
                      {g.achievers.length === 0 && <li style={{ listStyle: 'none', marginLeft: '-20px', color: 'var(--muted)' }}>No achievers yet.</li>}
                    </ul>
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel" style={{ alignSelf: 'start' }}>
        <h2>Define New Custom Goal</h2>
        
        <form onSubmit={handleCreateGoal} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
          <div className="filter-group">
            <label>Goal Title</label>
            <input
              type="text"
              placeholder="e.g. Earn 100 SP this week"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}
            />
          </div>

          <div className="filter-group">
            <label>Goal Type</label>
            <select value={type} onChange={e => {
              setType(e.target.value);
              if (e.target.value === 'sp_earned') setTarget('100');
              else setTarget('90');
            }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <option value="sp_earned">Earn SP points</option>
              <option value="attendance_sessions">Average attendance percentage</option>
            </select>
          </div>

          <div className="filter-group">
            <label>
              {type === 'sp_earned' ? 'Target SP Points' : 'Target Attendance % (e.g. 90)'}
            </label>
            <input
              type="number"
              value={target}
              onChange={e => setTarget(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}
            />
          </div>

          <div className="filter-group">
            <label>Timeframe window</label>
            <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="overall">Overall Course</option>
            </select>
          </div>

          <button type="submit" className="primary" disabled={creating} style={{ padding: '10px', marginTop: '5px' }}>
            {creating ? 'Creating...' : 'Create Goal'}
          </button>
        </form>
      </section>
    </div>
  );
}
