/**
 * AdminAnalyticsPage.jsx
 * Wires up StudentSearch + AnalyticsDashboard for admins.
 * Route example: /spurti/admin/analytics  (guard this route with admin auth)
 */
import { useState } from 'react';
import useFetch from '../hooks/useFetch';
import StudentSearch from '../components/StudentSearch';
import AnalyticsDashboard from '../components/AnalyticsDashboard';

export default function AdminAnalyticsPage() {
  const [selected, setSelected] = useState(null);
  const { data, loading, error } = useFetch('/api/admin/analytics/latest', []);

  if (loading) return <Centered>Loading analytics…</Centered>;
  if (error)   return <Centered>Failed to load analytics: {error}</Centered>;

  const { students = [], transactions = [], sessions = [], attendanceRecords = [], pollRecords = [] } = data || {};

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <AnalyticsDashboard
        students={students}
        transactions={transactions}
        sessions={sessions}
        attendanceRecords={attendanceRecords}
        pollRecords={pollRecords}
      />

      <div style={{ height: 36 }} />

      <StudentSearch
        students={students}
        onSelect={setSelected}
        allowFullSearch={true}
      />

      {selected && (
        <div style={{ marginTop: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 12,
          background: '#fafafa', fontFamily: "'Segoe UI',Arial,sans-serif", fontSize: 13 }}>
          Selected: <b>{selected.name}</b> — {selected.email} — {selected.totalSp} SP
        </div>
      )}
    </div>
  );
}

function Centered({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', color: '#6b7280', fontFamily: "'Segoe UI',Arial,sans-serif", fontSize: 14 }}>
      {children}
    </div>
  );
}
