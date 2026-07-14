import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const COLORS = {
  primary: '#176b87',
  primaryDark: '#0f4d62',
  panel: '#ffffff',
  text: '#172033',
  muted: '#64748b',
  line: '#d9e1ec',
  green: '#12805c',
  red: '#b42318'
};

export default function WeeklyRecap({ studentId, studentEmail }) {
  const [recap, setRecap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (force = false) => {
    setLoading(true);
    setError('');
    try {
      // studentEmail proves ownership to the server (same model /api/confirm
      // uses) — the caller already had the profile via /me or /confirm, this
      // just re-asserts it so the recap endpoint isn't a bare-ID lookup.
      const params = new URLSearchParams();
      if (studentEmail) params.set('email', studentEmail);
      if (force) params.set('force', 'true');
      const qs = params.toString();
      const res = await fetch(`${API}/students/${studentId}/recap${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('Could not load your weekly recap.');
      setRecap(await res.json());
    } catch (err) {
      setError(err.message || 'Could not load your weekly recap.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (studentId) load(false);
  }, [studentId]);

  if (!studentId) return null;

  return (
    <section style={styles.card}>
      <div style={styles.head}>
        <h2 style={styles.title}>Your Week, Told</h2>
        {!loading && !error && (
          <button style={styles.regenerateButton} onClick={() => load(true)}>Regenerate</button>
        )}
      </div>

      {loading && <RecapSkeleton />}

      {!loading && error && (
        <div>
          <p style={styles.errorText}>{error}</p>
          <button style={styles.retryButton} onClick={() => load(false)}>Try again</button>
        </div>
      )}

      {!loading && !error && recap && (
        <>
          <p style={styles.narrative}>{recap.narrative}</p>
          <div style={styles.chipRow}>
            <StatChip
              label="Sessions Attended"
              value={`${recap.dataSnapshot?.sessionsAttended ?? 0}/${recap.dataSnapshot?.totalSessions ?? 0}`}
            />
            <StatChip
              label="SP Change"
              value={formatSigned(recap.dataSnapshot?.netSp)}
              color={netSpColor(recap.dataSnapshot?.netSp)}
            />
            <StatChip
              label="Poll Accuracy"
              value={recap.dataSnapshot?.pollAccuracy === null || recap.dataSnapshot?.pollAccuracy === undefined
                ? 'N/A'
                : `${recap.dataSnapshot.pollAccuracy}%`}
            />
          </div>
        </>
      )}
    </section>
  );
}

function StatChip({ label, value, color }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipLabel}>{label}</span>
      <strong style={{ ...styles.chipValue, color: color || COLORS.text }}>{value}</strong>
    </div>
  );
}

function RecapSkeleton() {
  return (
    <div>
      <div style={{ ...styles.skeletonLine, width: '100%' }} />
      <div style={{ ...styles.skeletonLine, width: '95%' }} />
      <div style={{ ...styles.skeletonLine, width: '80%' }} />
      <div style={styles.chipRow}>
        {[0, 1, 2].map(i => <div key={i} style={styles.skeletonChip} />)}
      </div>
    </div>
  );
}

function formatSigned(value) {
  if (value === undefined || value === null) return 'N/A';
  return value > 0 ? `+${value}` : `${value}`;
}

function netSpColor(value) {
  if (value === undefined || value === null) return COLORS.text;
  if (value > 0) return COLORS.green;
  if (value < 0) return COLORS.red;
  return COLORS.text;
}

const styles = {
  card: {
    background: COLORS.panel,
    border: `1px solid ${COLORS.line}`,
    borderRadius: 16,
    padding: '20px 24px',
    marginBottom: 20,
    boxShadow: '0 18px 60px rgba(23, 32, 51, 0.08)'
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  title: {
    margin: 0,
    fontSize: 20,
    color: COLORS.primaryDark
  },
  narrative: {
    fontSize: 16,
    lineHeight: 1.6,
    color: COLORS.text,
    margin: '0 0 16px'
  },
  chipRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap'
  },
  chip: {
    flex: '1 1 140px',
    background: '#fafdff',
    border: `1px solid ${COLORS.line}`,
    borderRadius: 12,
    padding: '10px 14px'
  },
  chipLabel: {
    display: 'block',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: '.04em',
    color: COLORS.muted,
    marginBottom: 4
  },
  chipValue: {
    display: 'block',
    fontSize: 22
  },
  regenerateButton: {
    background: '#e9f2f5',
    color: COLORS.primaryDark,
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  retryButton: {
    background: COLORS.primary,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '8px 14px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  errorText: {
    color: COLORS.red,
    fontWeight: 600,
    marginBottom: 8
  },
  skeletonLine: {
    height: 14,
    borderRadius: 6,
    background: 'linear-gradient(90deg, #eef2f7 25%, #f7f9fb 37%, #eef2f7 63%)',
    backgroundSize: '400% 100%',
    animation: 'weekly-recap-shimmer 1.4s ease infinite',
    marginBottom: 10
  },
  skeletonChip: {
    flex: '1 1 140px',
    height: 52,
    borderRadius: 12,
    background: 'linear-gradient(90deg, #eef2f7 25%, #f7f9fb 37%, #eef2f7 63%)',
    backgroundSize: '400% 100%',
    animation: 'weekly-recap-shimmer 1.4s ease infinite'
  }
};

if (typeof document !== 'undefined' && !document.getElementById('weekly-recap-shimmer-keyframes')) {
  const style = document.createElement('style');
  style.id = 'weekly-recap-shimmer-keyframes';
  style.textContent = `@keyframes weekly-recap-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }`;
  document.head.appendChild(style);
}
