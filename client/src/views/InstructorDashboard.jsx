import React, { useEffect, useState, useRef } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

function authFetch(url, options = {}) {
  const token = localStorage.getItem('spurti_token') || '';
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function formatDaysAgo(dateStr) {
  if (!dateStr) return 'No activity';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

export default function InstructorDashboard({ onLogout }) {
  const [instructorEmail, setInstructorEmail] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  // Verify auth on mount
  useEffect(() => {
    const token = localStorage.getItem('spurti_token');
    const role = localStorage.getItem('spurti_role');
    if (!token || role !== 'instructor') {
      if (onLogout) onLogout();
      return;
    }
    const decoded = parseJwt(token);
    if (decoded && decoded.email) {
      setInstructorEmail(decoded.email);
    } else {
      setInstructorEmail('instructor@spurti.in');
    }
  }, [onLogout]);

  const handleLogout = () => {
    localStorage.removeItem('spurti_token');
    localStorage.removeItem('spurti_role');
    if (onLogout) onLogout();
  };

  return (
    <main className="page" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      {/* HEADER BAR */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: '16px',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        marginBottom: '20px'
      }}>
        <div>
          <p className="eyebrow" style={{ margin: 0 }}>Spurti Platform</p>
          <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700 }}>Instructor Dashboard</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '14px', color: 'var(--muted, #64748b)' }}>{instructorEmail}</span>
          <button className="secondary" onClick={handleLogout} style={{ fontSize: '13px', padding: '6px 12px' }}>
            Log out
          </button>
        </div>
      </header>

      {/* TAB NAVIGATION */}
      <nav style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '2px solid #e2e8f0', paddingBottom: '2px' }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'students', label: 'Students' },
          { id: 'sessions', label: 'Sessions' },
          { id: 'sp-controls', label: 'SP Controls' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? '3px solid #2563eb' : '3px solid transparent',
              color: activeTab === tab.id ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              marginBottom: '-2px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* TAB CONTENTS */}
      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'students' && <StudentsTab />}
      {activeTab === 'sessions' && <SessionsTab />}
      {activeTab === 'sp-controls' && <SpControlsTab />}
    </main>
  );
}

/* ==================== TAB 1: OVERVIEW ==================== */
function OverviewTab() {
  const [data, setData] = useState(null);
  const [atRiskData, setAtRiskData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchOverview() {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/instructor/overview`);
        if (!res.ok) throw new Error('Failed to load overview data');
        const json = await res.json();
        setData(json);

        if (json.atRiskCount > 0) {
          const atRiskRes = await authFetch(`${API}/instructor/at-risk`);
          if (atRiskRes.ok) {
            setAtRiskData(await atRiskRes.json());
          }
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchOverview();
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading overview statistics...</div>;
  if (error) return <div className="error" style={{ padding: '16px' }}>Error: {error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {/* 6 STAT CARDS IN 3x2 GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <StatCard title="Total Students" value={data.totalStudents} />
        <StatCard title="Active Students" value={data.activeStudents} />
        <StatCard title="Average SP" value={data.averageSp} />
        <StatCard title="Total Sessions" value={data.totalSessions} />
        <StatCard title="Avg Attendance Rate" value={`${data.averageAttendanceRate}%`} />
        <StatCard
          title="At-Risk Students"
          value={data.atRiskCount}
          highlightRed={data.atRiskCount > 0}
        />
      </div>

      {/* AT RISK ALERT PANEL */}
      {data.atRiskCount > 0 && atRiskData && atRiskData.students && (
        <section className="panel" style={{ padding: '20px', border: '1px solid #fecaca', background: '#fef2f2', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '18px', color: '#991b1b', marginTop: 0, marginBottom: '16px' }}>
            Students with no activity in the last 7 days ({atRiskData.count})
          </h2>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #fca5a5' }}>
                  <th style={{ padding: '8px' }}>Name</th>
                  <th style={{ padding: '8px' }}>Email</th>
                  <th style={{ padding: '8px' }}>Total SP</th>
                  <th style={{ padding: '8px' }}>Days Since Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {atRiskData.students.map(student => (
                  <tr key={student._id} style={{ borderBottom: '1px solid #fee2e2' }}>
                    <td style={{ padding: '8px', fontWeight: 600 }}>{student.name}</td>
                    <td style={{ padding: '8px' }}>{student.email}</td>
                    <td style={{ padding: '8px' }}>{student.totalSp}</td>
                    <td style={{ padding: '8px', color: '#dc2626', fontWeight: 600 }}>
                      {student.daysSinceLastTransaction === 999 ? 'No transactions logged' : `${student.daysSinceLastTransaction} days`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function StatCard({ title, value, highlightRed }) {
  return (
    <div style={{
      padding: '20px',
      borderRadius: '8px',
      border: highlightRed ? '1px solid #fca5a5' : '1px solid #e2e8f0',
      background: highlightRed ? '#fef2f2' : '#ffffff',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
    }}>
      <p style={{ margin: 0, fontSize: '13px', color: highlightRed ? '#991b1b' : '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
        {title}
      </p>
      <p style={{ margin: '8px 0 0 0', fontSize: '28px', fontWeight: 700, color: highlightRed ? '#dc2626' : '#0f172a' }}>
        {value}
      </p>
    </div>
  );
}

/* ==================== TAB 2: STUDENTS ==================== */
function StudentsTab() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('sp_desc');
  const [filter, setFilter] = useState('all');

  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    async function loadStudents() {
      try {
        setLoading(true);
        const url = `${API}/instructor/students?page=${page}&limit=50&search=${encodeURIComponent(debouncedSearch)}&sort=${sort}&filter=${filter}`;
        const res = await authFetch(url);
        if (!res.ok) throw new Error('Failed to load student list');
        const json = await res.json();
        setStudents(json.students);
        setTotal(json.total);
        setPages(json.pages);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadStudents();
  }, [page, debouncedSearch, sort, filter]);

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      {/* SEARCH, SORT, FILTER BAR */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by student name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', width: '300px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
        />

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="sp_desc">SP (High to Low)</option>
            <option value="sp_asc">SP (Low to High)</option>
            <option value="name_asc">Name (A-Z)</option>
            <option value="attendance_desc">Attendance (High to Low)</option>
          </select>

          <div style={{ display: 'flex', gap: '4px' }}>
            {['all', 'at_risk', 'excused'].map(fKey => (
              <button
                key={fKey}
                onClick={() => { setFilter(fKey); setPage(1); }}
                className={filter === fKey ? 'primary' : 'secondary'}
                style={{ fontSize: '13px', padding: '6px 12px', textTransform: 'capitalize' }}
              >
                {fKey.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center' }}>Loading students...</div>
      ) : error ? (
        <div className="error" style={{ padding: '16px' }}>Error: {error}</div>
      ) : students.length === 0 ? (
        <div style={{ padding: '30px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px' }}>
          No students match the selected filters.
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px' }}>Name</th>
                  <th style={{ padding: '10px 12px' }}>Email</th>
                  <th style={{ padding: '10px 12px' }}>Total SP</th>
                  <th style={{ padding: '10px 12px' }}>Attendance Rate</th>
                  <th style={{ padding: '10px 12px' }}>Last Active</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>At Risk</th>
                  <th style={{ padding: '10px 12px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map(student => (
                  <tr key={student._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{student.name}</td>
                    <td style={{ padding: '10px 12px' }}>{student.email}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{student.totalSp}</td>
                    <td style={{ padding: '10px 12px' }}>{student.attendanceRate}%</td>
                    <td style={{ padding: '10px 12px' }}>{formatDaysAgo(student.lastTransactionAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: student.status === 'active' ? '#dcfce7' : '#f1f5f9',
                        color: student.status === 'active' ? '#166534' : '#64748b'
                      }}>
                        {student.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#dc2626', fontWeight: 600 }}>
                      {student.isAtRisk ? 'Yes' : ''}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <button
                        className="secondary"
                        onClick={() => setSelectedStudentId(student._id)}
                        style={{ padding: '4px 10px', fontSize: '12px' }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PAGINATION CONTROLS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              Showing {students.length} of {total} students (Page {page} of {pages})
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="secondary"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ fontSize: '13px' }}
              >
                Previous
              </button>
              <button
                className="secondary"
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                style={{ fontSize: '13px' }}
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {/* STUDENT DETAIL MODAL */}
      {selectedStudentId && (
        <StudentDetailModal
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}
    </div>
  );
}

/* STUDENT DETAIL MODAL COMPONENT */
function StudentDetailModal({ studentId, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchDetail() {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/instructor/students/${studentId}`);
        if (!res.ok) throw new Error('Failed to load student details');
        setDetail(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [studentId]);

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '8px',
        maxWidth: '700px',
        width: '100%',
        maxHeight: '90vh',
        overflowY: 'auto',
        padding: '24px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
          <h2 style={{ margin: 0, fontSize: '20px' }}>Student Details</h2>
          <button className="secondary" onClick={onClose} style={{ padding: '4px 10px' }}>Close</button>
        </div>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center' }}>Loading student details...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : detail && (
          <div style={{ display: 'grid', gap: '20px' }}>
            {/* STUDENT SUMMARY INFO */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '14px' }}>
              <div><strong>Name:</strong> {detail.student.name}</div>
              <div><strong>Email:</strong> {detail.student.email}</div>
              <div><strong>Status:</strong> {detail.student.status}</div>
              <div><strong>Total SP:</strong> {detail.student.totalSp}</div>
              <div><strong>Attendance Rate:</strong> {detail.attendanceSummary.attendanceRate}%</div>
              <div><strong>Sessions Attended:</strong> {detail.attendanceSummary.attended} / {detail.attendanceSummary.totalSessions}</div>
            </div>

            {/* RECENT TRANSACTIONS */}
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Recent SP Transactions</h3>
              {detail.recentTransactions.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '13px' }}>No transactions recorded.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                      <th style={{ padding: '6px 8px' }}>Date</th>
                      <th style={{ padding: '6px 8px' }}>Category</th>
                      <th style={{ padding: '6px 8px' }}>Change</th>
                      <th style={{ padding: '6px 8px' }}>Balance</th>
                      <th style={{ padding: '6px 8px' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recentTransactions.map(tx => (
                      <tr key={tx._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px' }}>{new Date(tx.dateTime || tx.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: '6px 8px' }}>{tx.category}</td>
                        <td style={{ padding: '6px 8px', color: tx.appliedDelta >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                          {tx.appliedDelta >= 0 ? `+${tx.appliedDelta}` : tx.appliedDelta}
                        </td>
                        <td style={{ padding: '6px 8px' }}>{tx.balanceAfter}</td>
                        <td style={{ padding: '6px 8px' }}>{tx.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* SESSION BREAKDOWN */}
            <div>
              <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>Session Attendance Breakdown</h3>
              {detail.attendanceSummary.sessionBreakdown.length === 0 ? (
                <p style={{ color: '#64748b', fontSize: '13px' }}>No attendance records available.</p>
              ) : (
                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Session</th>
                        <th style={{ padding: '6px 8px' }}>Attendance %</th>
                        <th style={{ padding: '6px 8px' }}>Qualified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.attendanceSummary.sessionBreakdown.map((s, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 8px' }}>{s.label}</td>
                          <td style={{ padding: '6px 8px' }}>{s.attendancePercentage}%</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: s.qualified ? '#16a34a' : '#dc2626' }}>
                            {s.qualified ? 'Qualified' : 'Not Qualified'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== TAB 3: SESSIONS ==================== */
function SessionsTab() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchSessions() {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/instructor/sessions`);
        if (!res.ok) throw new Error('Failed to load session list');
        setSessions(await res.json());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  if (loading) return <div style={{ padding: '30px', textAlign: 'center' }}>Loading sessions...</div>;
  if (error) return <div className="error" style={{ padding: '16px' }}>Error: {error}</div>;

  return (
    <div style={{ display: 'grid', gap: '16px' }}>
      <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px' }}>Session Label</th>
              <th style={{ padding: '10px 12px' }}>Date</th>
              <th style={{ padding: '10px 12px' }}>Type</th>
              <th style={{ padding: '10px 12px' }}>Duration (min)</th>
              <th style={{ padding: '10px 12px' }}>Attendance Rate</th>
              <th style={{ padding: '10px 12px' }}>Qualified Students</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(session => (
              <tr key={session._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{session.label}</td>
                <td style={{ padding: '10px 12px' }}>{new Date(session.date).toLocaleDateString()}</td>
                <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{session.type || 'Standard'}</td>
                <td style={{ padding: '10px 12px' }}>{session.totalMinutes}</td>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{session.attendanceRate}%</td>
                <td style={{ padding: '10px 12px' }}>{session.qualifiedCount} / {session.totalStudents}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ==================== TAB 4: SP CONTROLS ==================== */
function SpControlsTab() {
  const [txLog, setTxLog] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txPages, setTxPages] = useState(1);
  const [txCategoryFilter, setTxCategoryFilter] = useState('');
  const [loadingTx, setLoadingTx] = useState(false);

  const loadTransactions = async () => {
    try {
      setLoadingTx(true);
      const url = `${API}/instructor/sp/transactions?page=${txPage}&limit=20${txCategoryFilter ? `&category=${txCategoryFilter}` : ''}`;
      const res = await authFetch(url);
      if (res.ok) {
        const json = await res.json();
        setTxLog(json.transactions);
        setTxPages(json.pages);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTx(false);
    }
  };

  useEffect(() => {
    loadTransactions();
  }, [txPage, txCategoryFilter]);

  return (
    <div style={{ display: 'grid', gap: '32px' }}>
      {/* SECTION A & B SIDE BY SIDE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        <AwardSpSection onSuccess={loadTransactions} />
        <DeductSpSection onSuccess={loadTransactions} />
      </div>

      {/* TRANSACTION LOG */}
      <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '18px', margin: 0 }}>Recent SP Transactions Log</h2>

          <div style={{ display: 'flex', gap: '8px' }}>
            {[
              { label: 'All', value: '' },
              { label: 'Awards', value: 'awards' },
              { label: 'Deductions', value: 'deductions' }
            ].map(f => (
              <button
                key={f.value}
                onClick={() => { setTxCategoryFilter(f.value); setTxPage(1); }}
                className={txCategoryFilter === f.value ? 'primary' : 'secondary'}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loadingTx ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading transaction log...</div>
        ) : txLog.length === 0 ? (
          <p style={{ color: '#64748b', fontSize: '14px' }}>No transactions recorded.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px' }}>Date</th>
                    <th style={{ padding: '8px' }}>Student Name</th>
                    <th style={{ padding: '8px' }}>Type</th>
                    <th style={{ padding: '8px' }}>Amount</th>
                    <th style={{ padding: '8px' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {txLog.map(tx => (
                    <tr key={tx._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>{new Date(tx.dateTime || tx.createdAt).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', fontWeight: 600 }}>{tx.studentName}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: tx.appliedDelta >= 0 ? '#dcfce7' : '#fee2e2',
                          color: tx.appliedDelta >= 0 ? '#166534' : '#991b1b'
                        }}>
                          {tx.appliedDelta >= 0 ? 'Award' : 'Deduction'}
                        </span>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 600, color: tx.appliedDelta >= 0 ? '#16a34a' : '#dc2626' }}>
                        {tx.appliedDelta >= 0 ? `+${tx.appliedDelta}` : tx.appliedDelta}
                      </td>
                      <td style={{ padding: '8px' }}>{tx.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button className="secondary" disabled={txPage <= 1} onClick={() => setTxPage(p => p - 1)} style={{ fontSize: '12px' }}>
                Previous
              </button>
              <button className="secondary" disabled={txPage >= txPages} onClick={() => setTxPage(p => p + 1)} style={{ fontSize: '12px' }}>
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* SECTION A: AWARD SP */
function AwardSpSection({ onSuccess }) {
  const [targetType, setTargetType] = useState('single');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (targetType === 'single' && !selectedStudent) {
      setMsg({ type: 'error', text: 'Please select a student.' });
      return;
    }
    if (!amount || amount < 1 || amount > 500) {
      setMsg({ type: 'error', text: 'Amount must be between 1 and 500.' });
      return;
    }
    if (!reason || reason.trim().length < 10) {
      setMsg({ type: 'error', text: 'Reason must be at least 10 characters long.' });
      return;
    }

    try {
      setLoading(true);
      const res = await authFetch(`${API}/instructor/sp/award`, {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          studentId: selectedStudent ? selectedStudent._id : undefined,
          amount: Number(amount),
          reason: reason.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to award SP');

      setMsg({ type: 'success', text: `SP awarded successfully (${data.count} transaction(s) created).` });
      setSelectedStudent(null);
      setAmount(10);
      setReason('');
      if (onSuccess) onSuccess();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px' }}>Award SP</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        {msg.text && (
          <div style={{
            padding: '10px',
            borderRadius: '6px',
            fontSize: '13px',
            background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: msg.type === 'error' ? '#dc2626' : '#166534',
            border: `1px solid ${msg.type === 'error' ? '#fee2e2' : '#bbf7d0'}`
          }}>
            {msg.text}
          </div>
        )}

        {/* TOGGLE */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => { setTargetType('single'); setSelectedStudent(null); }}
            className={targetType === 'single' ? 'primary' : 'secondary'}
            style={{ flex: 1, fontSize: '13px' }}
          >
            Single Student
          </button>
          <button
            type="button"
            onClick={() => { setTargetType('cohort'); setSelectedStudent(null); }}
            className={targetType === 'cohort' ? 'primary' : 'secondary'}
            style={{ flex: 1, fontSize: '13px' }}
          >
            Entire Cohort
          </button>
        </div>

        {targetType === 'single' && (
          <StudentSearchInput
            selectedStudent={selectedStudent}
            onSelect={setSelectedStudent}
            onClear={() => setSelectedStudent(null)}
          />
        )}

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Amount (1 - 500 SP)</label>
          <input
            type="number"
            min="1"
            max="500"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Reason (min 10 characters)</label>
          <textarea
            rows="3"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Provide reason for awarding SP..."
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
            required
          />
        </div>

        <button type="submit" className="primary" disabled={loading} style={{ cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Processing...' : 'Award SP'}
        </button>
      </form>
    </div>
  );
}

/* SECTION B: DEDUCT SP */
function DeductSpSection({ onSuccess }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleInitiateDeduct = (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (!selectedStudent) {
      setMsg({ type: 'error', text: 'Please select a student.' });
      return;
    }
    if (!amount || amount < 1 || amount > 200) {
      setMsg({ type: 'error', text: 'Amount must be between 1 and 200.' });
      return;
    }
    if (!reason || reason.trim().length < 20) {
      setMsg({ type: 'error', text: 'Detailed reason (minimum 20 characters) is required for deduction.' });
      return;
    }

    setShowConfirmModal(true);
  };

  const executeDeduction = async () => {
    setShowConfirmModal(false);
    try {
      setLoading(true);
      const res = await authFetch(`${API}/instructor/sp/deduct`, {
        method: 'POST',
        body: JSON.stringify({
          studentId: selectedStudent._id,
          amount: Number(amount),
          reason: reason.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deduct SP');

      setMsg({ type: 'success', text: `SP deducted successfully. Student's updated balance: ${data.updatedBalance} SP.` });
      setSelectedStudent(null);
      setAmount(10);
      setReason('');
      if (onSuccess) onSuccess();
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '20px', border: '1px solid #fecaca', background: '#fff5f5', borderRadius: '8px' }}>
      <h2 style={{ fontSize: '18px', color: '#991b1b', marginTop: 0, marginBottom: '16px' }}>Deduct SP</h2>

      <form onSubmit={handleInitiateDeduct} style={{ display: 'grid', gap: '14px' }}>
        {msg.text && (
          <div style={{
            padding: '10px',
            borderRadius: '6px',
            fontSize: '13px',
            background: msg.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: msg.type === 'error' ? '#dc2626' : '#166534',
            border: `1px solid ${msg.type === 'error' ? '#fee2e2' : '#bbf7d0'}`
          }}>
            {msg.text}
          </div>
        )}

        <StudentSearchInput
          selectedStudent={selectedStudent}
          onSelect={setSelectedStudent}
          onClear={() => setSelectedStudent(null)}
        />

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Amount (1 - 200 SP)</label>
          <input
            type="number"
            min="1"
            max="200"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            required
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Reason (min 20 characters)</label>
          <textarea
            rows="3"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Provide detailed reason for deduction (minimum 20 characters required)..."
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
            required
          />
        </div>

        <p style={{ margin: 0, fontSize: '12px', color: '#dc2626', fontWeight: 500 }}>
          Warning: SP deductions are logged and cannot be undone.
        </p>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            background: '#dc2626',
            color: '#ffffff',
            border: 'none',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Processing...' : 'Deduct SP'}
        </button>
      </form>

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{ background: '#ffffff', borderRadius: '8px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}>
            <h3 style={{ margin: 0, color: '#dc2626', fontSize: '18px' }}>Confirm SP Deduction</h3>
            <p style={{ fontSize: '14px', margin: '16px 0', lineHeight: 1.5 }}>
              You are about to deduct <strong>{amount} SP</strong> from <strong>{selectedStudent?.name}</strong>.
            </p>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
              <strong>Reason:</strong> {reason}
            </div>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 20px 0' }}>
              This action is logged permanently.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="secondary" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button
                onClick={executeDeduction}
                style={{ background: '#dc2626', color: '#ffffff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}
              >
                Confirm Deduction
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* LIVE SEARCH COMPONENT FOR STUDENT SELECT */
function StudentSearchInput({ selectedStudent, onSelect, onClear }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim() || selectedStudent) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await authFetch(`${API}/instructor/students?search=${encodeURIComponent(query.trim())}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.students || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, selectedStudent]);

  if (selectedStudent) {
    return (
      <div>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Selected Student</label>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          background: '#e0f2fe',
          border: '1px solid #bae6fd',
          borderRadius: '16px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#0369a1'
        }}>
          <span>{selectedStudent.name} ({selectedStudent.email})</span>
          <button
            type="button"
            onClick={onClear}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#0369a1' }}
          >
            X
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Select Student</label>
      <input
        type="text"
        placeholder="Type student name or email..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
      />
      {searching && <div style={{ position: 'absolute', right: '10px', top: '32px', fontSize: '12px', color: '#64748b' }}>Searching...</div>}

      {suggestions.length > 0 && (
        <ul style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          margin: '4px 0 0 0',
          padding: 0,
          listStyle: 'none',
          zIndex: 10,
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}>
          {suggestions.map(s => (
            <li
              key={s._id}
              onClick={() => { onSelect(s); setQuery(''); setSuggestions([]); }}
              style={{ padding: '8px 12px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '13px' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = '#ffffff'}
            >
              <strong>{s.name}</strong> ({s.email}) - {s.totalSp} SP
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
