/**
 * StudentDashboardPage.jsx
 * Wires up WeeklyReport + ActivityHeatmap for the logged-in student.
 * Route example: /spurti/dashboard
 */
import useFetch from '../hooks/useFetch';
import WeeklyReport from '../components/WeeklyReport';
import ActivityHeatmap from '../components/ActivityHeatmap';

export default function StudentDashboardPage() {
  const { data: me, loading: meLoading } = useFetch('/api/me', []);

 const studentId = me?.profile?.student?._id;
  const { data: report, loading: reportLoading } = useFetch(
    studentId ? `/api/student/${studentId}/weekly-report` : null,
    [studentId]
  );

  if (meLoading) return <Centered>Loading…</Centered>;
  if (!me?.authenticated) return <Centered>Please open Spurti from your Samagama dashboard.</Centered>;
  if (reportLoading || !report) return <Centered>Loading your report…</Centered>;

  const { student, sessions, transactions, attendanceRecords, pollRecords } = report;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 16px' }}>
      <ActivityHeatmap
        transactions={transactions}
        sessions={sessions}
        attendanceRecords={attendanceRecords}
      />
      <div style={{ height: 32 }} />
      <WeeklyReport
        student={student}
        sessions={sessions}
        transactions={transactions}
        attendanceRecords={attendanceRecords}
        pollRecords={pollRecords}
      />
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
