import React, { useMemo } from 'react';
import { calculateLearningInsights } from './learningInsightsUtils.js';

const DAY_ORDER = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const BAR_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function Metric({ label, value, detail }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function formatPercent(value) {
  return `${value}%`;
}

function getHeatColor(pct) {
  const alpha = Math.max(0.18, pct / 100);
  return `rgba(56, 161, 105, ${alpha})`;
}

function buildWeekdayBarStats(weekdayStats = []) {
  const statsByDay = new Map(weekdayStats.map((row) => [row.name, row]));
  return BAR_DAY_ORDER.map((day) => {
    const row = statsByDay.get(day) || { name: day, totalSessions: 0, sessionsAttended: 0, attendancePct: 0 };
    return {
      ...row,
      name: day,
      totalSessions: row.totalSessions || 0,
      sessionsAttended: row.sessionsAttended || 0,
      attendancePct: row.attendancePct || 0
    };
  });
}

function LearningInsights({ profile }) {
  const attendance = Array.isArray(profile?.attendance) ? profile.attendance : [];
  const data = useMemo(() => calculateLearningInsights(attendance, profile?.student || {}), [attendance, profile?.student]);
  const weekdayBarStats = useMemo(() => buildWeekdayBarStats(data.weekdayStats), [data.weekdayStats]);

  if (!data.totalSessions) {
    return (
      <section className="panel">
        <div className="panel-head">
          <h2>Learning Insights</h2>
        </div>
        <p className="muted">No attendance history is available yet.</p>
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Learning Insights">
      <div className="panel-head">
        <h2>Learning Insights</h2>
      </div>

      <div className="metric-grid">
        <Metric
          label="Best Attendance Day"
          value={data.bestDay?.name || '—'}
          detail={data.bestDay ? formatPercent(data.bestDay.attendancePct) : '—'}
        />
        <Metric
          label="Worst Attendance Day"
          value={data.worstDay?.name || '—'}
          detail={data.worstDay ? formatPercent(data.worstDay.attendancePct) : '—'}
        />
        <Metric
          label="Best Time of Day"
          value={data.bestPeriod?.name || '—'}
          detail={data.bestPeriod ? formatPercent(data.bestPeriod.attendancePct) : '—'}
        />
        <Metric
          label="Worst Time of Day"
          value={data.worstPeriod?.name || '—'}
          detail={data.worstPeriod ? formatPercent(data.worstPeriod.attendancePct) : '—'}
        />
        <Metric label="Longest Attendance Streak" value={data.longestStreak} detail="sessions in a row" />
        <Metric label="Current Attendance Streak" value={data.currentStreak} detail="sessions in a row" />
      </div>

      <div className="analytics-grid">
        <section className="subpanel">
          <h3>Attendance Heatmap</h3>
          <div className="heatmap" role="img" aria-label="Weekly attendance heatmap">
            <div className="heatmap-head">
              <span>Week</span>
              {DAY_ORDER.map((day) => <span key={day}>{day.slice(0, 3)}</span>)}
            </div>
            {data.heatmapRows.map((week) => (
              <div className="heatmap-row" key={week.key}>
                <span>{week.weekLabel}</span>
                {week.cells.map((cell, index) => (
                  <div
                    key={`${week.key}-${DAY_ORDER[index]}`}
                    className="heatmap-cell"
                    style={{ backgroundColor: getHeatColor(cell.percentage), opacity: cell.total ? 1 : 0.22 }}
                    title={`${DAY_ORDER[index]}: ${cell.percentage}%`}
                  >
                    {cell.total ? `${cell.percentage}%` : '—'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section className="subpanel">
          <h3>Weekday Attendance Bar Chart</h3>
          <div className="weekday-bar-chart" role="img" aria-label="Weekday attendance percentage bar chart">
            {weekdayBarStats.map((row) => (
              <div
                className={`weekday-bar${row.totalSessions ? '' : ' is-empty'}`}
                key={row.name}
                title={row.totalSessions ? `${row.name}: ${formatPercent(row.attendancePct)} (${row.sessionsAttended}/${row.totalSessions})` : `${row.name}: no sessions`}
              >
                <div className="weekday-bar-label">
                  <strong>{row.name.slice(0, 3)}</strong>
                  <span>{row.totalSessions ? `${row.sessionsAttended}/${row.totalSessions} sessions` : 'No sessions'}</span>
                </div>
                <div className="weekday-bar-track">
                  <div className="weekday-bar-fill" style={{ width: `${row.totalSessions ? Math.max(0, row.attendancePct) : 0}%` }} />
                </div>
                <div className="weekday-bar-value">{row.totalSessions ? formatPercent(row.attendancePct) : '—'}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="subpanel">
        <h3>Weekday Attendance Analysis</h3>
        <table className="table" aria-label="Weekday attendance analysis">
          <thead>
            <tr>
              <th>Weekday</th>
              <th>Total</th>
              <th>Attended</th>
              <th>Missed</th>
              <th>Attendance %</th>
              <th>Minutes</th>
              <th>Avg Minutes</th>
            </tr>
          </thead>
          <tbody>
            {data.weekdayStats.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.totalSessions}</td>
                <td>{row.sessionsAttended}</td>
                <td>{row.sessionsMissed}</td>
                <td>{formatPercent(row.attendancePct)}</td>
                <td>{row.totalMinutes}</td>
                <td>{row.averageMinutes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="analytics-grid">
        <section className="subpanel">
          <h3>Time-of-Day Analysis</h3>
          <table className="table" aria-label="Time-of-day attendance analysis">
            <thead>
              <tr>
                <th>Period</th>
                <th>Attendance %</th>
                <th>Avg Minutes</th>
                <th>Attended</th>
                <th>Missed</th>
              </tr>
            </thead>
            <tbody>
              {data.periodStats.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatPercent(row.attendancePct)}</td>
                  <td>{row.averageMinutes}</td>
                  <td>{row.sessionsAttended}</td>
                  <td>{row.sessionsMissed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="subpanel">
          <h3>Consistency Score</h3>
          <div className="progress-bar" aria-label="Consistency score progress bar">
            <div className="progress-bar-fill" style={{ width: `${data.consistencyScore}%` }} />
          </div>
          <p className="muted"><strong>{data.consistencyScore} / 100</strong></p>
          <p className="muted">{data.consistencyLabel}</p>
        </section>
      </div>

      <div className="analytics-grid">
        <section className="subpanel">
          <h3>Learning Pattern Summary</h3>
          <ul className="next-list">
            {data.patternSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="subpanel">
          <h3>Recommendations</h3>
          <ul className="next-list">
            {data.recommendations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
    </section>
  );
}

export default LearningInsights;
