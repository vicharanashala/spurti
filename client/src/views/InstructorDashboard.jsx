import React, { useCallback, useEffect, useState, useRef } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

function authFetch(url, options = {}) {
  const token = localStorage.getItem('spurti_token') || '';
  const headers = {
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
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
          { id: 'sp-controls', label: 'SP Controls' },
          { id: 'upload-data', label: 'Upload Data' },
          { id: 'flexible-days', label: 'Flexible Days' }
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
      {activeTab === 'upload-data' && <UploadDataTab />}
      {activeTab === 'flexible-days' && <FlexibleDaysTab />}
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

/* ==================== TAB 5: UPLOAD DATA ==================== */
function UploadDataTab() {
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');

  // Stable identity needed so useEffect dependency array does not trigger on every render
  const fetchHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await authFetch(`${API}/instructor/upload/history`);
      if (!res.ok) throw new Error('Failed to load upload history');
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleUploadSuccess = () => {
    setSuccessBanner('Upload complete. Data is now live.');
    // Auto-dismiss after 5 s so a stale success message cannot persist across a failed re-upload
    setTimeout(() => setSuccessBanner(''), 5000);
    fetchHistory();
  };

  return (
    <div style={{ display: 'grid', gap: '24px' }}>
      {successBanner && (
        <div style={{
          padding: '12px 16px',
          background: '#dcfce7',
          color: '#166534',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          fontWeight: 600,
          fontSize: '14px'
        }}>
          {successBanner}
        </div>
      )}

      {/* UPLOAD HISTORY TABLE */}
      <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
        <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px' }}>Upload History</h2>

        {loadingHistory ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Loading upload history...</div>
        ) : historyError ? (
          <div className="error" style={{ padding: '12px' }}>Error: {historyError}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '10px 12px' }}>Session</th>
                  <th style={{ padding: '10px 12px' }}>Date</th>
                  <th style={{ padding: '10px 12px' }}>Attendance</th>
                  <th style={{ padding: '10px 12px' }}>Poll</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => (
                  <tr key={item.sessionId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.sessionLabel}</td>
                    <td style={{ padding: '10px 12px' }}>{new Date(item.date).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: item.attendanceUploaded ? '#dcfce7' : '#fee2e2',
                        color: item.attendanceUploaded ? '#166534' : '#991b1b'
                      }}>
                        {item.attendanceUploaded ? `Uploaded (${item.attendanceCount})` : 'Not uploaded'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: item.pollUploaded ? '#dcfce7' : '#fee2e2',
                        color: item.pollUploaded ? '#166534' : '#991b1b'
                      }}>
                        {item.pollUploaded ? `Uploaded (${item.pollCount})` : 'Not uploaded'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* UPLOAD CARDS SIDE BY SIDE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        <UploadAttendanceCard sessions={history} onSuccess={handleUploadSuccess} />
        <UploadPollCard sessions={history} onSuccess={handleUploadSuccess} />
      </div>
    </div>
  );
}

function UploadAttendanceCard({ sessions, onSuccess }) {
  const [sessionId, setSessionId] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const fileInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSummary(null);

    if (!sessionId) {
      setError('Please select a session');
      return;
    }
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await authFetch(`${API}/instructor/upload/attendance`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        let errorMsg = 'Failed to upload attendance file';
        try { const d = await res.json(); errorMsg = d.error || errorMsg; } catch (_) {}
        throw new Error(errorMsg);
      }
      const data = await res.json();

      setSummary(data);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px' }}>Upload Attendance CSV</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Select Session</label>
          <select
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            required
          >
            <option value="">-- Choose Session --</option>
            {sessions.map(s => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionLabel} ({new Date(s.date).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Attendance CSV File</label>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={e => {
              setFile(e.target.files[0] || null);
              setSummary(null);
              setError('');
            }}
            style={{ width: '100%', padding: '6px' }}
            required
          />
          {file && (
            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
              Selected file: {file.name}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}>
            {error}
          </div>
        )}

        <button type="submit" className="primary" disabled={uploading} style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading...' : 'Upload Attendance'}
        </button>
      </form>

      {summary && (
        <div style={{ marginTop: '16px', padding: '14px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '14px' }}>
            Inserted: {summary.inserted} | Skipped: {summary.skipped} | Not matched: {summary.notFound}
          </p>
          {summary.skippedEmails && summary.skippedEmails.length > 0 && (
            <div>
              <strong style={{ color: '#991b1b' }}>Unmatched Emails ({summary.skippedEmails.length}):</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', color: '#64748b', maxHeight: '120px', overflowY: 'auto' }}>
                {summary.skippedEmails.map(email => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UploadPollCard({ sessions, onSuccess }) {
  const [sessionId, setSessionId] = useState('');
  const [file, setFile] = useState(null);
  const [detectedQuestions, setDetectedQuestions] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0] || null;
    setFile(selectedFile);
    setSummary(null);
    setError('');
    setDetectedQuestions([]);

    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result || '';
        const firstLine = text.split(/\r\n|\n/)[0] || '';
        const cols = firstLine.split(',').map(c => c.replace(/^["']|["']$/g, '').trim());
        const qCols = cols.filter(c => /^Q\d+:/i.test(c));
        setDetectedQuestions(qCols);
      };
      reader.readAsText(selectedFile.slice(0, 4096));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSummary(null);

    if (!sessionId) {
      setError('Please select a session');
      return;
    }
    if (!file) {
      setError('Please select a CSV file');
      return;
    }

    const formData = new FormData();
    formData.append('sessionId', sessionId);
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await authFetch(`${API}/instructor/upload/poll`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        let errorMsg = 'Failed to upload poll file';
        try { const d = await res.json(); errorMsg = d.error || errorMsg; } catch (_) {}
        throw new Error(errorMsg);
      }
      const data = await res.json();

      setSummary(data);
      setFile(null);
      setDetectedQuestions([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
      <h2 style={{ fontSize: '18px', marginTop: 0, marginBottom: '16px' }}>Upload Poll CSV</h2>

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '14px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Select Session</label>
          <select
            value={sessionId}
            onChange={e => setSessionId(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
            required
          >
            <option value="">-- Choose Session --</option>
            {sessions.map(s => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.sessionLabel} ({new Date(s.date).toLocaleDateString()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Poll CSV File</label>
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ width: '100%', padding: '6px' }}
            required
          />
          {file && (
            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
              Selected file: {file.name}
            </div>
          )}
        </div>

        {detectedQuestions.length > 0 && (
          <div style={{ padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px', color: '#1e40af' }}>
            Detected {detectedQuestions.length} poll question(s): {detectedQuestions.join(', ')}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fee2e2' }}>
            {error}
          </div>
        )}

        <button type="submit" className="primary" disabled={uploading} style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
          {uploading ? 'Uploading...' : 'Upload Poll Results'}
        </button>
      </form>

      {summary && (
        <div style={{ marginTop: '16px', padding: '14px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}>
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '14px' }}>
            Inserted: {summary.inserted} | Skipped: {summary.skipped} | Not matched: {summary.notFound}
          </p>
          {summary.skippedEmails && summary.skippedEmails.length > 0 && (
            <div>
              <strong style={{ color: '#991b1b' }}>Unmatched Emails ({summary.skippedEmails.length}):</strong>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px', color: '#64748b', maxHeight: '120px', overflowY: 'auto' }}>
                {summary.skippedEmails.map(email => (
                  <li key={email}>{email}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ==================== TAB 6: FLEXIBLE DAYS ==================== */
function FlexibleDaysTab() {
  const [requests, setRequests] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const fetchPending = useCallback(async () => {
    try {
      setError('');
      const res = await authFetch(`${API}/instructor/flexible-day/pending`);
      if (!res.ok) throw new Error('Failed to load pending requests');
      const json = await res.json();
      setRequests(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      setError('');
      const res = await authFetch(`${API}/instructor/flexible-day/history`);
      if (!res.ok) throw new Error('Failed to load history requests');
      const json = await res.json();
      setHistory(json);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
    fetchHistory();
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fetchPending, fetchHistory]);

  const showToastMsg = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleApproveConfirm = async () => {
    if (!approveModal || submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/instructor/flexible-day/${approveModal.requestId}/approve`, {
        method: 'PUT'
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to approve request');
      }
      setRequests(prev => prev.filter(r => r.requestId !== approveModal.requestId));
      showToastMsg('Request approved. 140 SP deducted.');
      setApproveModal(null);
      fetchHistory();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModal || submitting) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`${API}/instructor/flexible-day/${rejectModal.requestId}/reject`, {
        method: 'PUT',
        body: JSON.stringify({ note: rejectNote })
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to reject request');
      }
      setRequests(prev => prev.filter(r => r.requestId !== rejectModal.requestId));
      showToastMsg('Request rejected.');
      setRejectModal(null);
      setRejectNote('');
      fetchHistory();
    } catch (err) {
      alert(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCountdown = (expiresAtIso) => {
    if (!expiresAtIso) return { text: 'N/A', isUrgent: false };
    const expMs = new Date(expiresAtIso).getTime();
    const diffMs = expMs - nowMs;
    if (diffMs <= 0) return { text: 'Expired', isUrgent: true };

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const isUrgent = diffMs < (60 * 60 * 1000); // less than 1h

    return {
      text: `Expires in ${hours}h ${mins}m`,
      isUrgent
    };
  };

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading pending flexible day requests...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Flexible Day Requests</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Review and respond to student requests for next session absence.
          </p>
        </div>
      </div>

      {toast && (
        <div style={{ padding: '12px 16px', background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '14px', fontWeight: 500 }}>
          {toast}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', background: '#f8fafc', borderRadius: '8px', border: '1px border #e2e8f0', color: '#64748b' }}>
          No pending flexible day requests
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {requests.map(req => {
            const countdown = getCountdown(req.expiresAt);
            return (
              <div
                key={req.requestId}
                style={{
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#0f172a' }}>{req.studentName}</h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>{req.studentEmail}</p>
                </div>

                <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155', background: '#f8fafc', padding: '10px', borderRadius: '6px' }}>
                  <div><strong>Current SP:</strong> {req.studentTotalSp} SP</div>
                  <div><strong>Requesting off:</strong> {req.sessionLabel}</div>
                  <div><strong>Session date:</strong> {formatDate(req.sessionDate)}</div>
                  <div><strong>Requested at:</strong> {formatDaysAgo(req.requestedAt)}</div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 600 }}>
                  <span style={{ color: countdown.isUrgent ? '#dc2626' : '#2563eb' }}>
                    {countdown.text}
                  </span>
                  {req.disclaimerAccepted && (
                    <span style={{ color: '#16a34a', background: '#f0fdf4', padding: '2px 6px', borderRadius: '4px' }}>
                      Terms Accepted
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                  <button
                    onClick={() => setApproveModal(req)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#16a34a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => {
                      setRejectModal(req);
                      setRejectNote('');
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    Reject
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Approve Modal */}
      {approveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', maxWidth: '440px', width: '100%', border: '1px solid #cbd5e1' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600 }}>Approve Request</h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '14px', color: '#334155', lineHeight: 1.5 }}>
              Approve this request? <strong>140 SP</strong> will be deducted from <strong>{approveModal.studentName}</strong>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setApproveModal(null)}
                disabled={submitting}
                className="secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleApproveConfirm}
                disabled={submitting}
                style={{ padding: '8px 16px', background: '#16a34a', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
              >
                {submitting ? 'Approving...' : 'Confirm Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div style={{ background: '#ffffff', padding: '24px', borderRadius: '8px', maxWidth: '440px', width: '100%', border: '1px solid #cbd5e1' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 600 }}>Reject Request</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155' }}>
              Reject flexible day request for <strong>{rejectModal.studentName}</strong>? No SP will be deducted.
            </p>
            <label style={{ display: 'block', fontSize: '13px', color: '#475569', marginBottom: '6px', fontWeight: 500 }}>
              Reason for rejection (optional):
            </label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', marginBottom: '20px', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setRejectModal(null)}
                disabled={submitting}
                className="secondary"
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={submitting}
                style={{ padding: '8px 16px', background: '#dc2626', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '13px' }}
              >
                {submitting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision History Log */}
      <div className="panel" style={{ padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '32px' }}>
        <h3 style={{ fontSize: '16px', marginTop: 0, marginBottom: '16px' }}>Decision & Expiry History</h3>

        {loadingHistory ? (
          <div style={{ padding: '10px', textAlign: 'center', fontSize: '14px', color: '#64748b' }}>Loading history log...</div>
        ) : history.length === 0 ? (
          <div style={{ padding: '10px', textAlign: 'center', fontSize: '14px', color: '#64748b', fontStyle: 'italic' }}>No past decisions logged yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: '10px 12px' }}>Student</th>
                  <th style={{ padding: '10px 12px' }}>Session</th>
                  <th style={{ padding: '10px 12px' }}>Requested At</th>
                  <th style={{ padding: '10px 12px' }}>Resolved At</th>
                  <th style={{ padding: '10px 12px' }}>Decision</th>
                  <th style={{ padding: '10px 12px' }}>Note / Refund Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map(item => {
                  let statusBg = '#f3f4f6';
                  let statusColor = '#374151';
                  if (item.status === 'APPROVED') {
                    statusBg = '#dcfce7';
                    statusColor = '#166534';
                  } else if (item.status === 'REJECTED') {
                    statusBg = '#fee2e2';
                    statusColor = '#991b1b';
                  }

                  return (
                    <tr key={item.requestId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{item.studentName}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{item.studentEmail}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ fontWeight: 600 }}>{item.sessionLabel}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{formatDate(item.sessionDate)}</div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>{formatDate(item.requestedAt)}</td>
                      <td style={{ padding: '10px 12px' }}>{formatDate(item.respondedAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: statusBg,
                          color: statusColor
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>
                        {item.status === 'APPROVED' ? 'Approved (140 SP deducted)' : item.instructorNote || 'No reason specified'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
