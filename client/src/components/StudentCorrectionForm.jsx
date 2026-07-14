import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

/**
 * StudentCorrectionForm
 * Lets an authenticated student report an SP discrepancy for a specific session.
 * Sessions are loaded from /api/sessions. Proof is supplied as a URL (image or video).
 */
export function StudentCorrectionForm() {
  const [sessions, setSessions] = useState([]);
  const [sessionLabel, setSessionLabel] = useState('');
  const [category, setCategory] = useState('attendance');
  const [studentReason, setStudentReason] = useState('');
  const [studentComment, setStudentComment] = useState('');
  const [proofType, setProofType] = useState('image');
  const [proofUrl, setProofUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load available session labels from the backend on mount.
  useEffect(() => {
    fetch(`${API}/sessions`)
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        setSessions(data);
        if (data.length > 0) setSessionLabel(data[data.length - 1].label);
      })
      .catch(() => setError('Could not load sessions. Please refresh and try again.'));
  }, []);

  const resetForm = () => {
    setSessionLabel(sessions.length > 0 ? sessions[sessions.length - 1].label : '');
    setCategory('attendance');
    setStudentReason('');
    setStudentComment('');
    setProofType('image');
    setProofUrl('');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!sessionLabel) return setError('Please select a session.');
    if (!studentReason.trim()) return setError('Please describe the discrepancy you noticed.');
    if (!proofUrl.trim()) return setError('Please provide the URL of your proof.');

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/corrections/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionLabel,
          category,
          studentReason: studentReason.trim(),
          studentComment: studentComment.trim(),
          proofType,
          proofUrl: proofUrl.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Submission failed. Please try again.');
        return;
      }

      setSuccess(true);
      resetForm();
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="panel correction-form-panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">SP Discrepancy</p>
          <h2>Report a Correction</h2>
        </div>
      </div>

      <p className="correction-intro muted">
        If you believe your attendance or poll SP was recorded incorrectly, describe the issue
        below and attach media proof. An admin will review your request and respond within a few days.
      </p>

      {success && (
        <div className="correction-alert correction-alert--success" role="alert">
          ✅ Your correction request was submitted successfully! Admins will review it shortly.
        </div>
      )}

      {error && (
        <div className="correction-alert correction-alert--error" role="alert">
          ⚠️ {error}
        </div>
      )}

      <form className="correction-form" onSubmit={handleSubmit} noValidate>
        {/* Session selector */}
        <div className="correction-field">
          <label htmlFor="correction-session" className="correction-label">
            Session <span className="correction-required">*</span>
          </label>
          <select
            id="correction-session"
            className="correction-select"
            value={sessionLabel}
            onChange={e => setSessionLabel(e.target.value)}
            required
          >
            {sessions.length === 0 && (
              <option value="">Loading sessions…</option>
            )}
            {sessions.map(s => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Category radio */}
        <div className="correction-field">
          <span className="correction-label">
            Category <span className="correction-required">*</span>
          </span>
          <div className="correction-radio-group">
            {['attendance', 'poll'].map(cat => (
              <label key={cat} className={`correction-radio-label${category === cat ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="correction-category"
                  value={cat}
                  checked={category === cat}
                  onChange={() => setCategory(cat)}
                />
                {cat === 'attendance' ? '🗓 Attendance' : '📊 Poll'}
              </label>
            ))}
          </div>
        </div>

        {/* Reason textarea */}
        <div className="correction-field">
          <label htmlFor="correction-reason" className="correction-label">
            Describe the Discrepancy <span className="correction-required">*</span>
          </label>
          <textarea
            id="correction-reason"
            className="correction-textarea"
            rows={4}
            placeholder="e.g. I attended the full session on Day 20 but my attendance was not recorded. My camera was on throughout."
            value={studentReason}
            onChange={e => setStudentReason(e.target.value)}
            required
          />
        </div>

        {/* Additional comment textarea */}
        <div className="correction-field">
          <label htmlFor="correction-comment" className="correction-label">
            Additional Remarks <span className="correction-optional">(optional)</span>
          </label>
          <textarea
            id="correction-comment"
            className="correction-textarea"
            rows={2}
            placeholder="Any other context you'd like to add for the admin…"
            value={studentComment}
            onChange={e => setStudentComment(e.target.value)}
          />
        </div>

        {/* Proof type radio */}
        <div className="correction-field">
          <span className="correction-label">
            Proof Type <span className="correction-required">*</span>
          </span>
          <div className="correction-radio-group">
            {['image', 'video'].map(pt => (
              <label key={pt} className={`correction-radio-label${proofType === pt ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="correction-proof-type"
                  value={pt}
                  checked={proofType === pt}
                  onChange={() => setProofType(pt)}
                />
                {pt === 'image' ? '🖼 Image' : '🎥 Video'}
              </label>
            ))}
          </div>
        </div>

        {/* Proof URL input */}
        <div className="correction-field">
          <label htmlFor="correction-proof-url" className="correction-label">
            {proofType === 'image' ? 'Image' : 'Video'} Proof URL <span className="correction-required">*</span>
          </label>
          <input
            id="correction-proof-url"
            type="url"
            className="correction-input"
            placeholder={proofType === 'image'
              ? 'https://drive.google.com/file/d/…'
              : 'https://drive.google.com/file/d/…'}
            value={proofUrl}
            onChange={e => setProofUrl(e.target.value)}
            required
          />
          <span className="correction-hint muted">
            Upload your file to Google Drive or Dropbox and paste the shareable link here.
            Make sure "Anyone with the link" can view it.
          </span>
        </div>

        <div className="correction-actions">
          <button
            type="submit"
            className="primary correction-submit-btn"
            disabled={submitting || sessions.length === 0}
            id="correction-submit-btn"
          >
            {submitting ? 'Submitting…' : 'Submit Correction Request'}
          </button>
        </div>
      </form>
    </section>
  );
}

export default StudentCorrectionForm;
