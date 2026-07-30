import React, { useEffect, useState } from 'react';
import BlockIcon from './BlockIcon';

const BAND_ORDER = ['Slowing Down', 'Recovery', 'Active', 'Excellent'];

export default function StudentBandCard({ email }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!email) return;
    setData(null);
    setError(null);
    const base = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
    fetch(`${base}/api/engagement/${encodeURIComponent(email)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d ? setData(d) : setError('No engagement data'))
      .catch(() => setError('Failed to load'));
  }, [email]);

  if (error) return null;
  if (!data) {
    return (
      <div className="mc-spec-card">
        <div className="mc-loading">Loading band...</div>
      </div>
    );
  }

  const { band, reason, stats } = data;
  const currentAtt = stats?.avgAttendancePct ?? '—';
  const currentSp = stats?.avgSpPerSession ?? '—';

  return (
    <div className="mc-spec-card">
      <div className="mc-spec-header">
        <h3>Progress Band</h3>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          Att: {currentAtt}% &middot; SP/session: {currentSp}
        </span>
      </div>

      <div className="mc-spectrum">
        {BAND_ORDER.map((b, i) => {
          const isActive = b === band;
          return (
            <React.Fragment key={b}>
              {i > 0 && (
                <div className={`mc-spectrum-connector${isActive || BAND_ORDER.indexOf(band) >= i ? ' active' : ''}`} />
              )}
              <div className={`mc-spectrum-item${isActive ? ' active' : ''}`}>
                <BlockIcon band={b} size="sm" dimmed={!isActive} />
                <span className="mc-label">{b}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <p className="mc-spec-reason">{reason}</p>
    </div>
  );
}
