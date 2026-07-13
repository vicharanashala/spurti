import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import StudentDashboardPage from './pages/StudentDashboardPage';
import AdminAnalyticsPage from './pages/AdminAnalyticsPage';

export default function App() {
  return (
    <BrowserRouter basename="/spurti">
      <nav style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid #e5e7eb',
        fontFamily: "'Segoe UI',Arial,sans-serif", fontSize: 13 }}>
        <Link to="/dashboard" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>
          My Dashboard
        </Link>
        <Link to="/admin/analytics" style={{ color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}>
          Admin Analytics
        </Link>
      </nav>

      <Routes>
        <Route path="/dashboard" element={<StudentDashboardPage />} />
        <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
        <Route path="/" element={<StudentDashboardPage />} />
      </Routes>
    </BrowserRouter>
  );
}
