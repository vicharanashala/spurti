import React, { useState, useEffect } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function AllStudentsPanel({ stats, onStudent, auth }) {
  const [activeTab, setActiveTab] = useState('yetToOnboard');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const headers = {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  const loadList = async (status) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/students-by-status?status=${status}&limit=200`, { headers });
      if (res.ok) setList(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList(activeTab);
  }, [activeTab]);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>All Students</h2>
      </div>
      <div className="tab-bar" style={{ display: 'flex', borderBottom: '1px solid var(--line)', gap: '10px', marginBottom: '15px' }}>
        <button
          className={activeTab === 'yetToOnboard' ? 'active' : ''}
          onClick={() => { setActiveTab('yetToOnboard'); }}
          style={{ padding: '8px 16px', border: 'none', background: 'none', borderBottom: activeTab === 'yetToOnboard' ? '2px solid var(--primary)' : 'none', cursor: 'pointer', fontWeight: activeTab === 'yetToOnboard' ? 'bold' : 'normal' }}
        >
          Yet to Onboard ({stats?.yetToOnboard ?? 0})
        </button>
        <button
          className={activeTab === 'active' ? 'active' : ''}
          onClick={() => { setActiveTab('active'); }}
          style={{ padding: '8px 16px', border: 'none', background: 'none', borderBottom: activeTab === 'active' ? '2px solid var(--primary)' : 'none', cursor: 'pointer', fontWeight: activeTab === 'active' ? 'bold' : 'normal' }}
        >
          Active ({stats?.activeStudents ?? 0})
        </button>
        <button
          className={activeTab === 'excused' ? 'active' : ''}
          onClick={() => { setActiveTab('excused'); }}
          style={{ padding: '8px 16px', border: 'none', background: 'none', borderBottom: activeTab === 'excused' ? '2px solid var(--primary)' : 'none', cursor: 'pointer', fontWeight: activeTab === 'excused' ? 'bold' : 'normal' }}
        >
          Excused ({stats?.excusedStudents ?? 0})
        </button>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : list.length === 0 ? (
        <p className="empty">No students in this category.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>SP</th>
              <th>Start Date</th>
            </tr>
          </thead>
          <tbody>
            {list.map(s => (
              <tr key={s._id} onClick={() => onStudent(s._id)} style={{ cursor: 'pointer' }}>
                <td>{s.name}</td>
                <td>{s.email}</td>
                <td>{s.totalSp} SP</td>
                <td>{s.internshipStartDate ? new Date(s.internshipStartDate).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
