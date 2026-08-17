import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

// Pending nudges for the logged-in student. Auth is the same-origin session
// cookie — no email is sent to the server.
export default function NudgeBanner({ studentId }) {
  const [nudges, setNudges] = useState([]);

  useEffect(() => {
    if (!studentId) return;
    let active = true;
    fetch(`${API}/students/${studentId}/nudges`)
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (active) setNudges(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [studentId]);

  const dismiss = async (id) => {
    setNudges(prev => prev.filter(n => n._id !== id));
    try {
      await fetch(`${API}/nudges/${id}/dismiss`, { method: 'POST' });
    } catch {}
  };

  if (!nudges.length) return null;

  return (
    <div className="nudge-stack">
      {nudges.map(nudge => (
        <div key={nudge._id} className="nudge-banner">
          <span className="nudge-icon" aria-hidden="true">📣</span>
          <p className="nudge-message">{nudge.message}</p>
          <button type="button" className="nudge-dismiss" onClick={() => dismiss(nudge._id)}>Dismiss</button>
        </div>
      ))}
    </div>
  );
}
