import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function InactiveTracker({ auth, loadStudent }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [batch, setBatch] = useState('');
  const [spMin, setSpMin] = useState('');
  const [spMax, setSpMax] = useState('');
  const [sortBy, setSortBy] = useState('name');

  const headers = {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  const loadInactive = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (batch) params.append('batch', batch);
      if (spMin) params.append('spMin', spMin);
      if (spMax) params.append('spMax', spMax);
      if (sortBy) params.append('sortBy', sortBy);

      const res = await fetch(`${API}/admin/inactive-students?${params.toString()}`, { headers });
      if (res.ok) {
        setStudents(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInactive();
  }, [batch, spMin, spMax, sortBy]);

  return (
    <section className="panel">
      <div className="panel-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2>🚨 Inactive Student Tracker</h2>
        <button className="secondary" onClick={loadInactive}>Refresh</button>
      </div>

      {/* Filters grid */}
      <div className="search-grid" style={{ marginTop: '10px' }}>
        <div className="filter-group">
          <label>Batch Start Date</label>
          <input type="date" value={batch} onChange={e => setBatch(e.target.value)} />
        </div>
        <div className="filter-group">
          <label>SP Range (Min - Max)</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input type="number" placeholder="Min" value={spMin} onChange={e => setSpMin(e.target.value)} style={{ width: '50%' }} />
            <input type="number" placeholder="Max" value={spMax} onChange={e => setSpMax(e.target.value)} style={{ width: '50%' }} />
          </div>
        </div>
        <div className="filter-group">
          <label>Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="name">Name</option>
            <option value="sp">SP Level</option>
            <option value="attendance">Overall Attendance</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '20px' }}>Loading inactive students...</p>
      ) : students.length === 0 ? (
        <p className="empty" style={{ textAlign: 'center', padding: '20px' }}>No inactive students found matching criteria.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>SP</th>
              <th>Avg Attendance</th>
              <th>Inactivity Reasons</th>
            </tr>
          </thead>
          <tbody>
            {students.map(s => (
              <tr key={s._id} onClick={() => loadStudent(s._id)} style={{ cursor: 'pointer' }}>
                <td><strong>{s.name}</strong></td>
                <td>{s.email}</td>
                <td>{s.totalSp} SP <span style={{ color: 'var(--muted)', fontSize: '11px' }}>({s.trophyLeague})</span></td>
                <td>{Math.round(s.stats.avgAttendance)}%</td>
                <td>
                  {s.reasons.missedLast3 && <span className="inactive-pill red" style={{ background: '#fee2e2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', marginRight: '5px', fontSize: '11px', fontWeight: 'bold' }}>Missed 3 Sessions</span>}
                  {s.reasons.noSpFor3Days && <span className="inactive-pill orange" style={{ background: '#ffedd5', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', marginRight: '5px', fontSize: '11px', fontWeight: 'bold' }}>No SP 3+ Days</span>}
                  {s.reasons.lowAttendance && <span className="inactive-pill slate" style={{ background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', marginRight: '5px', fontSize: '11px', fontWeight: 'bold' }}>Low Attendance (&lt;75%)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
