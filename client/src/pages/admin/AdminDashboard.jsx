import React, { useState, useEffect } from 'react';
import Tabs from '../../components/Tabs.jsx';
import SpBank from '../../components/SpBank.jsx';
import AdminLayout from '../../layouts/AdminLayout.jsx';
import AdminLeaderboard from './AdminLeaderboard.jsx';
import AdminAttendance from './AdminAttendance.jsx';
import LiveAnalytics from './LiveAnalytics.jsx';
import Analytics from './Analytics.jsx';
import AllStudentsPanel from './AllStudentsPanel.jsx';
import InactiveTracker from './InactiveTracker.jsx';
import BulkNotifications from './BulkNotifications.jsx';
import GoalMonitoring from './GoalMonitoring.jsx';
import StudentTimeline from './StudentTimeline.jsx';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function AdminDashboard({ auth, onBack }) {
  const [tab, setTab] = useState('leaderboard');
  const [stats, setStats] = useState(null);
  
  // Leaderboard specific states
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardTimeRange, setLeaderboardTimeRange] = useState('overall');
  const [leaderboardSortBy, setLeaderboardSortBy] = useState('spEarned');
  const [leaderboardSortOrder, setLeaderboardSortOrder] = useState('desc');
  const [leaderboardLimit, setLeaderboardLimit] = useState(50);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(1);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);

  // Other views states
  const [attendance, setAttendance] = useState(null);
  const [active, setActive] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Modal student detail profile states
  const [studentProfile, setStudentProfile] = useState(null);
  const [modalTab, setModalTab] = useState('bank');

  const headers = {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  // Telemetry ping tracking admin session activity
  useEffect(() => {
    if (!auth?.email) return;
    const doPing = (page) => fetch(`${API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: auth.email, name: auth.email, page })
    }).catch(() => {});

    doPing('admin-analytics');
    const id = setInterval(() => doPing('admin-live'), 30000);
    return () => clearInterval(id);
  }, [auth]);

  const fetchStats = async () => {
    try {
      const r = await fetch(`${API}/admin/stats`, { headers });
      if (r.ok) setStats(await r.json());
    } catch (e) {
      console.error(e);
    }
  };

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch(
        `${API}/admin/leaderboard?timeRange=${leaderboardTimeRange}&page=${leaderboardPage}&limit=${leaderboardLimit}&sortBy=${leaderboardSortBy}&sortOrder=${leaderboardSortOrder}`,
        { headers }
      );
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.students || []);
        setLeaderboardTotal(data.total || 0);
        setLeaderboardTotalPages(data.totalPages || 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const loadAttendance = async () => {
    try {
      const res = await fetch(`${API}/admin/attendance`, { headers });
      if (res.ok) setAttendance(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadActive = async () => {
    try {
      const res = await fetch(`${API}/admin/active`, { headers });
      if (res.ok) setActive(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadAnalytics = async () => {
    try {
      const res = await fetch(`${API}/admin/analytics`, { headers });
      if (res.ok) setAnalytics(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const loadStudent = async (id) => {
    try {
      const res = await fetch(`${API}/admin/student/${id}`, { headers });
      if (res.ok) {
        setStudentProfile(await res.json());
        setModalTab('bank');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (tab === 'leaderboard') {
      loadLeaderboard();
    }
  }, [tab, leaderboardTimeRange, leaderboardPage, leaderboardLimit, leaderboardSortBy, leaderboardSortOrder]);

  useEffect(() => {
    if (tab === 'attendance' && !attendance) loadAttendance();
    if (tab === 'live') {
      loadActive();
      const id = setInterval(loadActive, 10000);
      return () => clearInterval(id);
    }
    if (tab === 'analytics' && !analytics) loadAnalytics();
  }, [tab]);

  const tabsConfig = [
    ['leaderboard', 'Leaderboard'],
    ['attendance', 'Attendance'],
    ['live', 'Live Viewers'],
    ['analytics', 'Analytics'],
    ['students', 'All Students'],
    ['inactive', 'Inactive Tracker'],
    ['notifications', 'Bulk Notifications'],
    ['goals', 'Goal Monitoring']
  ];

  return (
    <AdminLayout stats={stats} admin={auth} onBack={onBack}>
      <Tabs tab={tab} setTab={setTab} tabs={tabsConfig} />
      
      <div style={{ marginTop: '20px' }}>
        {tab === 'leaderboard' && (
          <AdminLeaderboard
            leaderboard={leaderboard}
            leaderboardLoading={leaderboardLoading}
            leaderboardTimeRange={leaderboardTimeRange}
            setLeaderboardTimeRange={setLeaderboardTimeRange}
            leaderboardSortBy={leaderboardSortBy}
            setLeaderboardSortBy={setLeaderboardSortBy}
            leaderboardSortOrder={leaderboardSortOrder}
            setLeaderboardSortOrder={setLeaderboardSortOrder}
            leaderboardLimit={leaderboardLimit}
            setLeaderboardLimit={setLeaderboardLimit}
            leaderboardPage={leaderboardPage}
            setLeaderboardPage={setLeaderboardPage}
            leaderboardTotalPages={leaderboardTotalPages}
            leaderboardTotal={leaderboardTotal}
            loadStudent={loadStudent}
          />
        )}
        
        {tab === 'attendance' && <AdminAttendance data={attendance} onStudent={loadStudent} />}
        {tab === 'live' && <LiveAnalytics active={active} />}
        {tab === 'analytics' && <Analytics data={analytics} />}
        {tab === 'students' && <AllStudentsPanel stats={stats} onStudent={loadStudent} auth={auth} />}
        {tab === 'inactive' && <InactiveTracker auth={auth} loadStudent={loadStudent} />}
        {tab === 'notifications' && <BulkNotifications auth={auth} />}
        {tab === 'goals' && <GoalMonitoring auth={auth} />}
      </div>

      {studentProfile && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setStudentProfile(null)}>
          <section className="modal wide" style={{ maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-head" style={{ flexShrink: 0 }}>
              <h2>{studentProfile.student.name}</h2>
              <button className="icon" onClick={() => setStudentProfile(null)}>x</button>
            </div>

            {/* Quick Metrics */}
            <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '15px', marginTop: '10px' }}>
              <div className="info" style={{ padding: '8px 12px', margin: 0, border: '1px solid var(--line)', borderRadius: '6px', background: '#f8fafc' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 'bold' }}>Total SP</span>
                <strong style={{ display: 'block', fontSize: '18px', color: 'var(--primary)', marginTop: '2px' }}>{studentProfile.student.totalSp}</strong>
              </div>
              <div className="info" style={{ padding: '8px 12px', margin: 0, border: '1px solid var(--line)', borderRadius: '6px', background: '#f8fafc' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 'bold' }}>Level</span>
                <strong style={{ display: 'block', fontSize: '18px', color: 'var(--green)', marginTop: '2px' }}>Level {studentProfile.student.level}</strong>
              </div>
              <div className="info" style={{ padding: '8px 12px', margin: 0, border: '1px solid var(--line)', borderRadius: '6px', background: '#f8fafc' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 'bold' }}>Trophy League</span>
                <strong style={{ display: 'block', fontSize: '18px', color: 'var(--amber)', marginTop: '2px' }}>{studentProfile.student.trophyLeague}</strong>
              </div>
              <div className="info" style={{ padding: '8px 12px', margin: 0, border: '1px solid var(--line)', borderRadius: '6px', background: '#f8fafc' }}>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 'bold' }}>Internship Status</span>
                <strong style={{ display: 'block', fontSize: '18px', color: studentProfile.student.status === 'active' ? 'var(--green)' : 'var(--red)', marginTop: '2px' }}>
                  {studentProfile.student.status.toUpperCase()}
                </strong>
              </div>
            </div>

            {/* Modal Tabs */}
            <div style={{ flexShrink: 0 }}>
              <Tabs tab={modalTab} setTab={setModalTab} tabs={[['bank', 'SP Bank Statement'], ['timeline', 'Activity Timeline']]} />
            </div>

            {/* Modal Content */}
            <div style={{ flex: '1 1 auto', overflowY: 'auto', minHeight: 0 }}>
              {modalTab === 'bank' && <SpBank transactions={studentProfile.transactions} />}
              {modalTab === 'timeline' && <StudentTimeline studentId={studentProfile.student._id} auth={auth} />}
            </div>
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
