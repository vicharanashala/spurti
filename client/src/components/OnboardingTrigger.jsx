import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import OnboardingModal from './OnboardingModal.jsx';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

const OnboardingTrigger = forwardRef(function OnboardingTrigger({ studentEmail, studentName }, ref) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!studentEmail) return;
    let active = true;
    fetch(`${API}/onboarding/${encodeURIComponent(studentEmail)}`)
      .then((res) => (res.ok ? res.json() : { completed: false }))
      .then((data) => {
        if (active && !data.completed) setOpen(true);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [studentEmail]);

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
  }), []);

  if (!open) return null;

  return (
    <OnboardingModal
      studentEmail={studentEmail}
      studentName={studentName}
      onComplete={() => setOpen(false)}
    />
  );
});

export default OnboardingTrigger;
