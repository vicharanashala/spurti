import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function BulkNotifications({ auth }) {
  const [targetGroup, setTargetGroup] = useState('low-sp');
  const [targetValue, setTargetValue] = useState('100');
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const headers = {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/bulk-notifications`, { headers });
      if (res.ok) setLogs(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const applyTemplate = (tmplText) => {
    setMessage(tmplText);
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!message.trim()) return alert('Message body cannot be empty.');
    if (!targetValue.trim()) return alert('Target value must be specified.');

    setSending(true);
    try {
      const res = await fetch(`${API}/admin/bulk-notifications`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ targetGroup, targetValue, message })
      });
      if (res.ok) {
        const data = await res.json();
        alert(`Notification dispatched successfully to ${data.log.recipientCount} students.`);
        setMessage('');
        fetchLogs();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to dispatch notification');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="moderation-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '15px' }}>
      <section className="panel">
        <h2>📢 Send Bulk Notification Reminders</h2>
        
        <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
          <div className="filter-group">
            <label>Target Student Group</label>
            <select value={targetGroup} onChange={e => {
              setTargetGroup(e.target.value);
              if (e.target.value === 'low-sp') setTargetValue('100');
              else if (e.target.value === 'missing-sessions') setTargetValue('3');
              else setTargetValue('');
            }} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}>
              <option value="low-sp">Students with Low SP</option>
              <option value="missing-sessions">Students Missing Consecutive Sessions</option>
              <option value="batch">Specific Batch (Start Date)</option>
            </select>
          </div>

          <div className="filter-group">
            <label>
              {targetGroup === 'low-sp' && 'SP Threshold Limit (Minimum SP to trigger)'}
              {targetGroup === 'missing-sessions' && 'Consecutive Missed Sessions (e.g. 3)'}
              {targetGroup === 'batch' && 'Batch Start Date (YYYY-MM-DD)'}
            </label>
            <input
              type={targetGroup === 'batch' ? 'date' : 'number'}
              value={targetValue}
              onChange={e => setTargetValue(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--line)' }}
            />
          </div>

          <div className="filter-group">
            <label>Message Templates (Click to apply)</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              <button type="button" className="template-btn" onClick={() => applyTemplate('Reminder: Earn 20 SP today to keep your streak!')}>
                Streak Alert 🔥
              </button>
              <button type="button" className="template-btn" onClick={() => applyTemplate('Warning: You have low attendance. Please attend the upcoming Zoom session.')}>
                Attendance warning ⚠️
              </button>
              <button type="button" className="template-btn" onClick={() => applyTemplate('Well done batch! Keep up the high engagement!')}>
                Kudos batch 👍
              </button>
            </div>
          </div>

          <div className="filter-group">
            <label>Message Body</label>
            <textarea
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Type your alert reminder here..."
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--line)', font: 'inherit', resize: 'vertical' }}
            />
          </div>

          <button type="submit" className="primary" disabled={sending} style={{ alignSelf: 'flex-start', padding: '10px 20px' }}>
            {sending ? 'Sending...' : 'Dispatch Reminder'}
          </button>
        </form>
      </section>

      <section className="panel" style={{ alignSelf: 'start' }}>
        <h2>📋 Dispatch Log History</h2>
        {loading ? (
          <p>Loading log history...</p>
        ) : logs.length === 0 ? (
          <p className="empty">No reminders sent yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '450px', overflowY: 'auto', marginTop: '10px' }}>
            {logs.map(log => (
              <div key={log.id} style={{ border: '1px solid var(--line)', padding: '10px', borderRadius: '6px', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--muted)', marginBottom: '4px' }}>
                  <strong>{log.targetGroup.toUpperCase()} ({log.targetValue})</strong>
                  <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <p style={{ margin: '4px 0', fontSize: '13px', fontWeight: 'bold' }}>{log.message}</p>
                <span style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 'bold' }}>Sent to {log.recipientCount} students</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
