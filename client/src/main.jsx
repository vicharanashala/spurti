import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Forbidden from './pages/Forbidden.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [profile, setProfile] = useState(null);
  const [excused, setExcused] = useState(null);
  const [adminAuth, setAdminAuth] = useState(() => {
    const saved = localStorage.getItem('vled_admin_auth');
    return saved ? JSON.parse(saved) : null;
  });
  const [config, setConfig] = useState({ allowStudentSearch: true });
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [role, setRole] = useState(null); // 'student', 'admin', 'excused'

  const navigate = (toPath) => {
    window.history.pushState(null, '', toPath);
    setPath(toPath);
  };

  // Sync pathname on back/forward browser navigation
  useEffect(() => {
    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  // Telemetry ping for student activity
  useEffect(() => {
    if (role !== 'student' || !profile?.student) return;
    const send = () => fetch(`${API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: profile.student.email,
        name: profile.student.name,
        page: 'record',
        recordViewed: profile.student.email
      })
    }).catch(() => {});
    send();
    const id = setInterval(send, 30000);
    return () => clearInterval(id);
  }, [role, profile]);

  // Bootstrapping session check
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const configRes = await fetch(`${API}/config`);
        const nextConfig = configRes.ok ? await configRes.json() : { allowStudentSearch: true };
        if (!active) return;
        setConfig(nextConfig);

        const meRes = await fetch(`${API}/me`);
        if (meRes.ok && active) {
          const data = await meRes.json();
          if (data.authenticated) {
            setAuthenticated(true);
            setRole(data.role);
            if (data.role === 'admin') {
              // Stay as admin
            } else if (data.excused) {
              setExcused(data);
              setRole('excused');
            } else if (data.profile) {
              setProfile(data.profile);
              setRole('student');
            }
          }
        }
      } catch (err) {
        console.error('Session bootstrap failed', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
<main className="page login-page">
        <section className="panel auth-card">
          <p className="eyebrow">Spurti</p>
          <h1>Loading...</h1>
        </section>
      </main>

    );
  }

  // Routing Logic
  // Normalize path relative to base path
  const relativePath = APP_BASE ? path.replace(APP_BASE, '') : path;

  if (relativePath === '/dashboard/admin') {
    if (!authenticated) {
      navigate('/login');
      return null;
    }
    if (role !== 'admin') {
      return <Forbidden onBack={() => navigate('/')} />;
    }
    return (
      <AdminDashboard
        auth={adminAuth || { email: 'dled@iitrpr.ac.in', token: 'vled-local-admin' }}
        onBack={() => {
          navigate('/');
        }}
      />
    );
  }

  if (relativePath === '/dashboard') {
    if (!authenticated) {
      navigate('/login');
      return null;
    }
    if (role === 'excused' && excused) {
      return <ExcusedView data={excused} onBack={config.allowStudentSearch ? () => navigate('/') : null} />;
    }
    if (role === 'student' && profile) {
      return (
        <>
          <StudentDashboard profile={profile} onBack={config.allowStudentSearch ? () => navigate('/') : null} />
          <SurveyModal
            survey={config.survey}
            student={profile.student}
            statusPath="/survey/status"
            completedKey="surveyCompleted"
            onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, surveyCompleted: true } }))}
          />
          <SurveyModal
            survey={config.poll2}
            student={profile.student}
            statusPath="/poll2/status"
            completedKey="poll2Completed"
            onDone={() => setProfile(prev => ({ ...prev, student: { ...prev.student, poll2Completed: true } }))}
          />
        </>
      );
    }
    // If admin visits student dashboard, let's render student details if available, or just mock it.
    navigate('/');
    return null;
  }

  if (relativePath === '/login') {
    if (authenticated) {
      if (role === 'admin') navigate('/dashboard/admin');
      else navigate('/dashboard');
      return null;
    }
    return (
      <Login
        onAdmin={(stats, auth) => {
          localStorage.setItem('vled_admin_auth', JSON.stringify(auth));
          setAdminAuth(auth);
          setAuthenticated(true);
          setRole('admin');
          navigate('/dashboard/admin');
        }}
        onBack={() => navigate('/')}
      />
    );
  }

  // Default Route (Landing page)
  return (
    <Landing
      config={config}
      onStudent={(data) => {
        setAuthenticated(true);
        if (data?.excused) {
          setExcused(data);
          setProfile(null);
          setRole('excused');
        } else {
          setProfile(data);
          setExcused(null);
          setRole('student');
        }
        navigate('/dashboard');
      }}
      onAdminLoginRedirect={() => navigate('/login')}
    />
  );
}

function ExcusedView({ data, onBack }) {
  return (
    <main className="page login-page">
      <section className="panel auth-card">
        <p className="eyebrow">Spurti Account</p>
        <h1>{data.student?.name || 'Account excused'}</h1>
        <p className="lead">{data.message}</p>
        {onBack && <button className="secondary" onClick={onBack}>Back</button>}
      </section>
    </main>
  );
}

function SurveyModal({ survey, student, onDone, statusPath = '/survey/status', completedKey = 'surveyCompleted' }) {
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');
  const done = useRef(false);

  const enabled = survey?.enabled && survey.formUrl && student && !student[completedKey];

  async function verifyStatus(showNote) {
    if (done.current) return;
    if (showNote) { setChecking(true); setNote(''); }
    try {
      const r = await fetch(`${API}${statusPath}`);
      if (r.ok && (await r.json()).completed) { done.current = true; onDone(); return; }
      if (showNote) setNote("We haven't received your response yet. Please make sure you pressed Submit in the form above — this window closes on its own once your response is recorded.");
    } catch {
      if (showNote) setNote('Network error — please try again in a moment.');
    } finally {
      if (showNote) setChecking(false);
    }
  }

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => verifyStatus(false), 5000);
    return () => clearInterval(id);
  }, [enabled]);

  if (!enabled) return null;

  const hard = survey.enforcement !== 'soft';
  const email = student.email || '';
  const sep = survey.formUrl.includes('?') ? '&' : '?';
  let src = `${survey.formUrl}${sep}embedded=true`;
  if (survey.emailEntryId && email) {
    src += `&usp=pp_url&${encodeURIComponent(survey.emailEntryId)}=${encodeURIComponent(email)}`;
  }

  function handleIframeLoad() { verifyStatus(false); }

  return (
    <div className="survey-overlay" role="dialog" aria-modal="true" aria-labelledby="survey-title">
      <div className="survey-modal">
        <div className="survey-head">
          <h2 id="survey-title">One quick step — your feedback is required</h2>
          <p>
            Please complete and submit this short survey to continue to your Spurti
            dashboard. Just answer the questions and press <strong>Submit</strong>.
          </p>
        </div>
        <iframe title="Spurti feedback survey" src={src} className="survey-frame" onLoad={handleIframeLoad} />
        <div className="survey-actions">
          {!hard && <button type="button" className="survey-ghost" onClick={onDone}>Maybe later</button>}
          <button type="button" className="survey-primary" disabled={checking} onClick={() => verifyStatus(true)}>
            {checking ? 'Checking...' : "I've submitted — continue"}
          </button>
        </div>
        {note && <p className="survey-note">{note}</p>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
