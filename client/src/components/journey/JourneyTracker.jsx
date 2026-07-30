import React, { useEffect, useState } from 'react';

const WINDOWS = ['weekly', 'monthly', 'tenure'];

const BIOME = {
  weekly: { label: 'Week', biomeClass: 'journey-biome-weekly', beamColor: '#7CB342', name: 'Plains' },
  monthly: { label: 'Month', biomeClass: 'journey-biome-monthly', beamColor: '#8BC34A', name: 'Forest' },
  tenure: { label: 'Tenure', biomeClass: 'journey-biome-tenure', beamColor: '#CE93D8', name: 'Nether' }
};

function getBase() {
  return window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
}

function xpColor(pct) {
  if (pct >= 80) return '#5B9BD5';
  if (pct >= 60) return '#F5B342';
  if (pct >= 40) return '#C4695C';
  return '#6B6B6B';
}

export default function JourneyTracker({ email }) {
  const [activeWindow, setActiveWindow] = useState('weekly');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) return;
    setLoading(true);
    fetch(`${getBase()}/api/journey/${encodeURIComponent(email)}?window=${activeWindow}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [email, activeWindow]);

  const biome = BIOME[activeWindow];

  if (loading) {
    return (
      <div className="pulse-card" style={{ padding: 20, textAlign: 'center' }}>
        <p className="muted" style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10 }}>Loading journey...</p>
      </div>
    );
  }

  if (!data) return null;

  const { target, progress, checkpoints, range } = data;

  return (
    <div className={`pulse-card ${biome.biomeClass}`} style={{ position: 'relative', overflow: 'hidden', padding: 16 }}>
      <div className="journey-biome-bar" />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', fontWeight: 800, fontFamily: "'Press Start 2P', monospace" }}>
            {range.label}
          </div>
          <h3 style={{ margin: '4px 0 0', fontSize: 15 }}>Journey Tracker</h3>
        </div>
        <div className="journey-window-selector">
          {WINDOWS.map(w => {
            const b = BIOME[w];
            const isActive = activeWindow === w;
            return (
              <button key={w} onClick={() => setActiveWindow(w)}
                className={`journey-window-btn ${isActive ? 'active' : ''}`}
                style={{
                  '--btn-beam': b.beamColor
                }}
              >
                <span className="journey-window-dot" />
                <span>{b.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Waypoints */}
      <div className="journey-waypoint-row">
        {checkpoints.map((cp, i) => (
          <React.Fragment key={cp.checkpoint}>
            {i > 0 && (
              <div className="journey-waypoint-connector"
                style={{ background: cp.reached ? biome.beamColor : '#d9e1ec' }}
              />
            )}
            <div className={`journey-waypoint-item ${cp.reached ? 'reached' : ''}`}>
              <div className="journey-waypoint-pin"
                style={{
                  background: cp.reached ? biome.beamColor : '#d9e1ec',
                  borderColor: cp.reached ? biome.beamColor : '#b0b8c4',
                  boxShadow: cp.reached ? `0 0 0 3px ${biome.beamColor}22, inset 0 0 6px ${biome.beamColor}88` : 'none'
                }}
              >
                {cp.reached && <div className="journey-waypoint-check" />}
              </div>
              <span className="journey-waypoint-label">{cp.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* XP Bars */}
      <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
        <JourneyBar label="Overall" value={progress.overallPct} color={xpColor(progress.overallPct)} />
        <JourneyBar label="Attendance" value={progress.attendancePct} color={xpColor(progress.attendancePct)} />
        <JourneyBar label="Polls" value={progress.pollPct} color={xpColor(progress.pollPct)} />
      </div>

      {/* Footer */}
      <div className="journey-footer">
        <span>{progress.checkpointsReached}/{progress.totalCheckpoints} milestones</span>
        <span>Target: att {target.attendanceTargetPct}% · poll {target.pollTargetPct}%</span>
      </div>
    </div>
  );
}

function JourneyBar({ label, value, color }) {
  return (
    <div className="journey-bar-row">
      <span className="journey-bar-label">{label}</span>
      <div className="journey-bar-track">
        <div className="journey-bar-fill" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <span className="journey-bar-value" style={{ color }}>{value}%</span>
    </div>
  );
}
