import React from 'react';

export default function Analytics({ data }) {
  if (!data) return <section className="panel empty">Loading analytics...</section>;
  
  const maxHourly = Math.max(...data.users.hourly.map(r => r.uniqueUsers), 1);
  const maxWeekly = Math.max(...data.users.weekly.map(r => r.uniqueUsers), 1);

  return (
    <section className="panel">
      <h2>System Analytics</h2>

      <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <Chart title="Hourly active users" rows={data.users.hourly} max={maxHourly} />
        <Chart title="Weekly active users" rows={data.users.weekly} max={maxWeekly} />
      </div>

      <div className="analytics-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <section className="subpanel" style={{ border: '1px solid var(--line)', padding: '15px', borderRadius: '8px' }}>
          <h3>SP Points</h3>
          <div className="metric-grid small" style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
            <Metric label="Average" value={data.sp.average} />
            <Metric label="Median" value={data.sp.median} />
            <Metric label="Min" value={data.sp.min} />
            <Metric label="Max" value={data.sp.max} />
          </div>
          <table className="table">
            <thead><tr><th>Band</th><th>Students</th></tr></thead>
            <tbody>
              <tr><td>Below 100</td><td>{data.sp.bands.below100}</td></tr>
              <tr><td>100-149</td><td>{data.sp.bands.from100to149}</td></tr>
              <tr><td>150-199</td><td>{data.sp.bands.from150to199}</td></tr>
              <tr><td>200+</td><td>{data.sp.bands.from200plus}</td></tr>
            </tbody>
          </table>
        </section>

        <section className="subpanel" style={{ border: '1px solid var(--line)', padding: '15px', borderRadius: '8px' }}>
          <h3>SP by category</h3>
          <table className="table">
            <thead><tr><th>Category</th><th>Count</th><th>Net SP</th><th>Credits</th><th>Debits</th></tr></thead>
            <tbody>
              {data.sp.categoryTotals.map(row => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.count}</td>
                  <td style={{ fontWeight: 'bold' }}>{row.netSp} SP</td>
                  <td className="credit">{row.credits}</td>
                  <td className="debit">{row.debits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="subpanel" style={{ border: '1px solid var(--line)', padding: '15px', borderRadius: '8px' }}>
        <h3>Attendance by session</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Qualified</th>
              <th>Not qualified</th>
              <th>Qualified %</th>
              <th>Avg min</th>
              <th>Session min</th>
            </tr>
          </thead>
          <tbody>
            {data.attendance.sessions.map(row => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.qualified}</td>
                <td>{row.notQualified}</td>
                <td>{row.qualifiedPct}%</td>
                <td>{row.avgMinutes} min</td>
                <td>{row.sessionMinutes} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric" style={{ border: '1px solid var(--line)', padding: '8px 12px', borderRadius: '6px', textAlign: 'center', flex: 1 }}>
      <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>{label}</span>
      <strong style={{ display: 'block', fontSize: '18px', marginTop: '2px' }}>{value}</strong>
    </div>
  );
}

function Chart({ title, rows, max }) {
  return (
    <section className="subpanel" style={{ border: '1px solid var(--line)', padding: '15px', borderRadius: '8px' }}>
      <h3>{title}</h3>
      <div className="bars" style={{ marginTop: '10px' }}>
        {rows.length ? rows.map(row => (
          <div className="bar-row" key={row.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <span style={{ width: '120px', fontSize: '12px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{row.label}</span>
            <div style={{ flex: 1, height: '12px', background: '#f1f5f9', borderRadius: '6px', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', background: 'var(--primary)', width: `${Math.max(4, Math.round((row.uniqueUsers / max) * 100))}%`, borderRadius: '6px' }} />
            </div>
            <b style={{ width: '30px', fontSize: '12px', textAlign: 'right' }}>{row.uniqueUsers}</b>
          </div>
        )) : <p className="muted">No activity yet.</p>}
      </div>
    </section>
  );
}
