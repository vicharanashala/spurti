import React, { useState, useEffect } from 'react';

export default function PerformanceGraph({ profile, API }) {
  const [granularity, setGranularity] = useState('weekly');
  const [performance, setPerformance] = useState(profile?.performance || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(null);

  // Fetch performance series when granularity changes, unless it's initial weekly state
  useEffect(() => {
    if (granularity === 'weekly' && profile?.performance && !performance) {
      setPerformance(profile.performance);
      return;
    }
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const headers = {};
        if (profile?.student?.email) {
          headers['X-Student-Email'] = profile.student.email;
        }
        const res = await fetch(`${API}/me/performance?granularity=${granularity}`, { headers });
        if (!res.ok) throw new Error('Failed to load performance data');
        const data = await res.json();
        if (active) setPerformance(data);
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [granularity, profile, API]);

  if (loading) {
    return (
      <div className="pulse-card wide-pulse performance-card loading">
        <span>Performance progress</span>
        <div className="performance-loading">Loading performance metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pulse-card wide-pulse performance-card error">
        <span>Performance progress</span>
        <div className="performance-error">Error: {error}</div>
      </div>
    );
  }

  const series = performance?.series || [];
  if (!series.length) {
    return (
      <div className="pulse-card wide-pulse performance-card empty">
        <span>Performance progress</span>
        <p className="muted">No activity yet.</p>
      </div>
    );
  }

  // Aggregate achievements into the buckets
  const achievementMarkers = performance?.achievementMarkers || [];
  const isMarkerInBucket = (markerDate, bucketKey) => {
    const d = new Date(markerDate);
    if (isNaN(d.getTime())) return false;
    if (granularity === 'daily') {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return key === bucketKey;
    } else if (granularity === 'weekly') {
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
      return key === bucketKey;
    } else {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return key === bucketKey;
    }
  };

  const seriesWithMarkers = series.map(b => ({
    ...b,
    markers: achievementMarkers.filter(m => isMarkerInBucket(m.dateTime, b.key))
  }));

  // Graph Layout coordinates
  const svgWidth = 600;
  const svgHeight = 280;
  const paddingX = 45;
  const paddingY = 40;
  const chartWidth = svgWidth - 2 * paddingX;
  const chartHeight = svgHeight - 2 * paddingY;

  // Compute scale boundaries
  const allVals = series.flatMap(b => [b.attendance, b.poll, b.bonus]);
  const minVal = Math.min(...allVals, 0);
  const maxVal = Math.max(...allVals, 1);

  const getX = (index) => {
    if (series.length <= 1) return paddingX + chartWidth / 2;
    return paddingX + (index * chartWidth) / (series.length - 1);
  };

  const getY = (val) => {
    return paddingY + chartHeight - ((val - minVal) * chartHeight) / (maxVal - minVal);
  };

  // Generate path coordinates
  const getLinePath = (key) => {
    if (series.length === 0) return '';
    return series.map((b, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(b[key])}`).join(' ');
  };

  const attendancePath = getLinePath('attendance');
  const pollPath = getLinePath('poll');
  const bonusPath = getLinePath('bonus');

  // Tooltip details
  const activeBucket = activeIndex !== null ? seriesWithMarkers[activeIndex] : null;

  return (
    <>
      <div className="pulse-card wide-pulse performance-card">
        <div className="performance-header">
          <span>Performance progress</span>
          <nav className="tabs performance-tabs" role="tablist">
            {[
              ['daily', 'Daily'],
              ['weekly', 'Weekly'],
              ['monthly', 'Monthly']
            ].map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={granularity === key}
                className={granularity === key ? 'active' : ''}
                onClick={() => {
                  setGranularity(key);
                  setActiveIndex(null);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="graph-wrapper" style={{ position: 'relative' }}>
          <svg
            width="100%"
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            role="img"
            aria-label={`Performance progress graph. Showing attendance and poll points for selected period. X-axis shows dates, Y-axis shows SP values ranging from ${minVal} to ${maxVal}.`}
            className="performance-svg"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
              const val = minVal + pct * (maxVal - minVal);
              const y = getY(val);
              return (
                <g key={idx} className="grid-line-group">
                  <line
                    x1={paddingX}
                    y1={y}
                    x2={svgWidth - paddingX}
                    y2={y}
                    stroke="var(--line)"
                    strokeWidth="1"
                    strokeDasharray={val === 0 ? 'none' : '4,4'}
                  />
                  <text
                    x={paddingX - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="10"
                    fill="var(--muted)"
                  >
                    {Math.round(val)}
                  </text>
                </g>
              );
            })}

            {/* X Axis Labels */}
            {series.map((b, i) => {
              // Render labels periodically if there are too many to fit
              const step = Math.max(1, Math.round(series.length / 8));
              if (i % step !== 0 && i !== series.length - 1) return null;
              return (
                <text
                  key={b.key}
                  x={getX(i)}
                  y={svgHeight - paddingY + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {b.label}
                </text>
              );
            })}

            {/* Paths */}
            {/* Bonus SP Line (dotted, green) */}
            {bonusPath && (
              <path
                d={bonusPath}
                fill="none"
                stroke="var(--green)"
                strokeWidth="1.5"
                strokeDasharray="2,3"
                className="line-bonus"
              />
            )}

            {/* Poll SP Line (dashed, orange) */}
            {pollPath && (
              <path
                d={pollPath}
                fill="none"
                stroke="var(--amber)"
                strokeWidth="2.5"
                strokeDasharray="6,4"
                className="line-poll"
              />
            )}

            {/* Attendance SP Line (solid, blue) */}
            {attendancePath && (
              <path
                d={attendancePath}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                className="line-attendance"
              />
            )}

            {/* Interactive points */}
            {seriesWithMarkers.map((b, i) => {
              const hasMilestone = b.markers && b.markers.length > 0;
              return (
                <g key={b.key} className="points-group">
                  {/* Highlight vertical section when active */}
                  {activeIndex === i && (
                    <line
                      x1={getX(i)}
                      y1={paddingY}
                      x2={getX(i)}
                      y2={svgHeight - paddingY}
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      strokeDasharray="3,3"
                    />
                  )}

                  {/* Attendance point - Circle */}
                  <circle
                    cx={getX(i)}
                    cy={getY(b.attendance)}
                    r={activeIndex === i ? 6 : 4}
                    fill="var(--primary)"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />

                  {/* Poll point - Square */}
                  <rect
                    x={getX(i) - (activeIndex === i ? 5 : 3.5)}
                    y={getY(b.poll) - (activeIndex === i ? 5 : 3.5)}
                    width={activeIndex === i ? 10 : 7}
                    height={activeIndex === i ? 10 : 7}
                    fill="var(--amber)"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />

                  {/* Bonus point - Diamond */}
                  <polygon
                    points={`${getX(i)},${getY(b.bonus) - (activeIndex === i ? 6 : 4.5)} ${getX(i) + (activeIndex === i ? 5 : 3.5)},${getY(b.bonus)} ${getX(i)},${getY(b.bonus) + (activeIndex === i ? 6 : 4.5)} ${getX(i) - (activeIndex === i ? 5 : 3.5)},${getY(b.bonus)}`}
                    fill="var(--green)"
                    stroke="#ffffff"
                    strokeWidth="1"
                  />

                  {/* Achievement marker indicator at top */}
                  {hasMilestone && (
                    <g className="milestone-star">
                      <circle
                        cx={getX(i)}
                        cy={paddingY - 14}
                        r="9"
                        fill="var(--amber)"
                      />
                      <text
                        x={getX(i)}
                        y={paddingY - 11}
                        textAnchor="middle"
                        fontSize="9"
                        fill="#ffffff"
                        fontWeight="bold"
                      >
                        ★
                      </text>
                    </g>
                  )}

                  {/* Focus/hover slice overlay */}
                  <rect
                    x={getX(i) - (chartWidth / Math.max(1, series.length - 1)) / 2}
                    y={paddingY - 10}
                    width={chartWidth / Math.max(1, series.length - 1)}
                    height={chartHeight + 20}
                    fill="transparent"
                    tabIndex={0}
                    onFocus={() => setActiveIndex(i)}
                    onBlur={() => setActiveIndex(null)}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                    style={{ outline: 'none', cursor: 'pointer' }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Hover / Keyboard Tooltip */}
          {activeBucket && (
            <div
              className="graph-tooltip"
              style={{
                position: 'absolute',
                top: `${paddingY}px`,
                left: `${getX(activeIndex) > svgWidth / 2 ? getX(activeIndex) - 190 : getX(activeIndex) + 15}px`,
                pointerEvents: 'none'
              }}
            >
              <div className="tooltip-title">{activeBucket.label}</div>
              <div className="tooltip-row">
                <span className="dot attendance"></span> Attendance SP: <b>{activeBucket.attendance > 0 ? `+${activeBucket.attendance}` : activeBucket.attendance}</b>
              </div>
              <div className="tooltip-row">
                <span className="dot poll"></span> Poll SP: <b>{activeBucket.poll > 0 ? `+${activeBucket.poll}` : activeBucket.poll}</b>
              </div>
              <div className="tooltip-row">
                <span className="dot bonus"></span> Bonus SP: <b>{activeBucket.bonus > 0 ? `+${activeBucket.bonus}` : activeBucket.bonus}</b>
              </div>
              <div className="tooltip-row divider">
                Total SP: <b>{activeBucket.total > 0 ? `+${activeBucket.total}` : activeBucket.total}</b>
              </div>
              <div className="tooltip-row">
                Activities: <b>{activeBucket.activityCount} completed</b>
              </div>

              {activeBucket.markers && activeBucket.markers.length > 0 && (
                <div className="tooltip-achievements">
                  <div className="ach-title">Achievements:</div>
                  {activeBucket.markers.map((m, idx) => (
                    <div key={idx} className="ach-item">
                      {m.type === 'level' && '🏅'}
                      {m.type === 'league' && '🏆'}
                      {m.type === 'legend' && '👑'}
                      {m.type === 'badge' && '⭐'}
                      {' '}{m.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Graph Legend */}
        <div className="graph-legend">
          <span className="legend-item"><span className="legend-line attendance-line"></span> Attendance SP (Solid, Circle)</span>
          <span className="legend-item"><span className="legend-line poll-line"></span> Poll SP (Dashed, Square)</span>
          <span className="legend-item"><span className="legend-line bonus-line"></span> Bonus SP (Dotted, Diamond)</span>
          {achievementMarkers.length > 0 && (
            <span className="legend-item"><span className="legend-star">★</span> Achievement Milestone</span>
          )}
        </div>
      </div>

      {/* Performance Summary Cards rendered as direct siblings of StudentPulse grid */}
      <div className="pulse-card">
        <span>Period Attendance SP</span>
        <strong>{performance.summary.attendance > 0 ? `+${performance.summary.attendance}` : performance.summary.attendance}</strong>
        <p className="muted">{granularity === 'daily' ? 'Sum of daily' : granularity === 'weekly' ? 'Sum of weekly' : 'Sum of monthly'} attendance SP</p>
      </div>
      <div className="pulse-card">
        <span>Period Poll SP</span>
        <strong>{performance.summary.poll > 0 ? `+${performance.summary.poll}` : performance.summary.poll}</strong>
        <p className="muted">{granularity === 'daily' ? 'Sum of daily' : granularity === 'weekly' ? 'Sum of weekly' : 'Sum of monthly'} poll SP</p>
      </div>
      <div className="pulse-card">
        <span>Period Bonus SP</span>
        <strong>{performance.summary.bonus > 0 ? `+${performance.summary.bonus}` : performance.summary.bonus}</strong>
        <p className="muted">{granularity === 'daily' ? 'Sum of daily' : granularity === 'weekly' ? 'Sum of weekly' : 'Sum of monthly'} bonus SP</p>
      </div>
      <div className="pulse-card">
        <span>Period Total SP</span>
        <strong>{performance.summary.total > 0 ? `+${performance.summary.total}` : performance.summary.total}</strong>
        <p className="muted">Total earned in selection</p>
      </div>
      <div className="pulse-card">
        <span>Best Day</span>
        <strong>{performance.bestPerformanceDay ? `${performance.bestPerformanceDay.points} SP` : '—'}</strong>
        <p className="muted">{performance.bestPerformanceDay ? performance.bestPerformanceDay.date : 'No active days'}</p>
      </div>
      <div className="pulse-card">
        <span>Trend</span>
        <strong>{performance.trend}</strong>
        <p className="muted">Period-over-period</p>
      </div>
      <div className="pulse-card">
        <span>Consistency</span>
        <strong>{performance.consistencyScore}%</strong>
        <p className="muted">Overall qualified rate</p>
      </div>
    </>
  );
}
