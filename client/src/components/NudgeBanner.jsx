import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function NudgeBanner({ studentId, studentEmail }) {
  const [nudges, setNudges] = useState([]);

  useEffect(() => {
    if (!studentId || !studentEmail) return;
    let active = true;
    fetch(`${API}/students/${studentId}/nudges`, { headers: { 'X-Student-Email': studentEmail } })
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (active) setNudges(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [studentId, studentEmail]);

  const dismiss = async (id) => {
    setNudges(prev => prev.filter(n => n._id !== id));
    try {
      await fetch(`${API}/nudges/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentEmail })
      });
    } catch {}
  };

  if (!nudges.length) return null;

  return (
    <div>
      {nudges.map(nudge => (
        <div key={nudge._id} style={styles.banner}>
          <span style={styles.icon}>⚠️</span>
          <p style={styles.message}>{nudge.message}</p>
          <button type="button" style={styles.dismiss} onClick={() => dismiss(nudge._id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}

const styles = {
  banner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: '#fff3cd',
    borderLeft: '4px solid #f59e0b',
    borderRadius: 6,
    padding: 16,
    color: '#92400e',
    marginBottom: 16
  },
  icon: { fontSize: 20, flexShrink: 0 },
  message: { flex: 1, margin: 0, lineHeight: 1.5 },
  dismiss: {
    flexShrink: 0,
    background: 'transparent',
    border: '1px solid #92400e',
    color: '#92400e',
    borderRadius: 6,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer'
  }
};
