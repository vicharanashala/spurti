import React, { useState, useEffect } from 'react';

const API_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti/api' : '/api';

export function FlexibleDayStore({ studentProfile }) {
  const [eligibility, setEligibility] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const fetchEligibility = async () => {
    try {
      const res = await fetch(`${API_BASE}/student/flexible-day/eligibility`, {
        headers: studentProfile?.student?.email ? {
          'x-student-email': studentProfile.student.email
        } : {}
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to fetch eligibility');
      }
      const data = await res.json();
      setEligibility(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/student/flexible-day/history`, {
        headers: studentProfile?.student?.email ? {
          'x-student-email': studentProfile.student.email
        } : {}
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data);
    } catch {
      // Ignore background fetch error
    }
  };

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      await Promise.all([fetchEligibility(), fetchHistory()]);
      if (active) setLoading(false);
    }
    loadData();
    return () => { active = false; };
  }, [studentProfile]);

  const handleOpenModal = () => {
    setCheckboxChecked(false);
    setSubmitError(null);
    setSubmitSuccess(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (!submitting) {
      setModalOpen(false);
      setCheckboxChecked(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!checkboxChecked || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const res = await fetch(`${API_BASE}/student/flexible-day/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(studentProfile?.student?.email ? { 'x-student-email': studentProfile.student.email } : {})
        },
        body: JSON.stringify({ disclaimerAccepted: true })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSubmitSuccess('Request submitted. Instructor will respond within 24 hours.');
      setModalOpen(false);
      await Promise.all([fetchEligibility(), fetchHistory()]);
    } catch (err) {
      setSubmitError(err.message);
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

  const formatShortTime = (isoStr) => {
    if (!isoStr) return 'N/A';
    const d = new Date(isoStr);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    });
  };

  if (loading) {
    return (
      <div className="panel" style={{ padding: '20px', color: 'var(--muted)', borderRadius: '8px' }}>
        <p>Loading SP Store data...</p>
      </div>
    );
  }

  // BR-01: If totalSp < 300, option is not visible anywhere in the UI
  if (eligibility && eligibility.currentBalance < 300) {
    return null;
  }

  // BR-08: Once 2 requests used (approved or pending), option is permanently hidden
  if (eligibility && eligibility.remainingRequests === 0) {
    return (
      <div className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--primary)', marginBottom: '16px' }}>SP Store</h2>
        <div style={{ padding: '16px', background: '#f8fafc', border: '1px solid var(--line)', borderRadius: '6px', color: 'var(--muted)' }}>
          <p style={{ margin: 0 }}>You have reached the maximum limit of 2 flexible day requests for this internship period.</p>
        </div>

        {/* History Section still shown */}
        <RequestHistoryTable history={history} formatDate={formatDate} />
      </div>
    );
  }

  const isButtonActive = eligibility?.eligible === true;
  const disabledReason = eligibility?.reason || 'Option unavailable';
  const remaining = eligibility?.remainingRequests ?? 0;
  const nextSess = eligibility?.nextSession;

  return (
    <div className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--primary)', marginBottom: '4px' }}>SP Store</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Redeem your earned SP for flexible attendance benefits.</p>
      </div>

      {submitSuccess && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem' }}>
          {submitSuccess}
        </div>
      )}

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', marginBottom: '16px', fontSize: '0.9rem' }}>
          {error}
        </div>
      )}

      {/* Store Item Card Layout */}
      <div style={{ padding: '20px', background: '#fbfdff', borderRadius: '8px', border: '1px solid var(--line)', maxWidth: '480px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--text)', marginBottom: '4px' }}>Flexible Day Request</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '16px' }}>Take a day off from the next session</p>

        <div style={{ display: 'grid', gap: '8px', fontSize: '0.9rem', marginBottom: '20px', color: 'var(--muted)' }}>
          <div><strong style={{ color: 'var(--text)' }}>Cost:</strong> 140 SP</div>
          <div><strong style={{ color: 'var(--text)' }}>Remaining:</strong> {remaining} of 2</div>
          <div><strong style={{ color: 'var(--text)' }}>Next session:</strong> {nextSess ? `${nextSess.label} on ${formatDate(nextSess.startDateTime)}` : 'No upcoming sessions'}</div>
          <div><strong style={{ color: 'var(--text)' }}>Request window closes:</strong> {formatShortTime(eligibility?.requestWindowClosesAt)}</div>
        </div>

        {isButtonActive ? (
          <button
            onClick={handleOpenModal}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '750',
              cursor: 'pointer',
              fontSize: '0.95rem'
            }}
          >
            Request Day Off
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              disabled
              style={{
                width: '100%',
                padding: '10px 16px',
                background: '#cbd5e1',
                color: '#64748b',
                border: 'none',
                borderRadius: '6px',
                fontWeight: '750',
                cursor: 'not-allowed',
                fontSize: '0.95rem'
              }}
            >
              Request Day Off
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--red)', fontWeight: 600 }}>{disabledReason}</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.52)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px'
        }}>
          <div style={{
            background: 'var(--panel)', color: 'var(--text)', borderRadius: '8px',
            border: '1px solid var(--line)', width: '100%', maxWidth: '540px', padding: '24px',
            boxShadow: 'var(--shadow)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '16px', color: 'var(--primary)' }}>Request a Flexible Day</h3>

            <div style={{ fontSize: '0.9rem', color: 'var(--text)', marginBottom: '16px', lineHeight: '1.5' }}>
              <p style={{ marginBottom: '8px' }}>You are requesting a day off for:</p>
              <p style={{ fontWeight: '700', color: 'var(--primary-dark)' }}>{nextSess?.label} on {formatDate(nextSess?.startDateTime)}</p>
              <div style={{ marginTop: '12px', padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid var(--line)' }}>
                <p style={{ margin: '0 0 4px 0' }}>Cost: 140 SP (charged only if approved)</p>
                <p style={{ margin: '0 0 4px 0' }}>Remaining after approval: {(eligibility?.currentBalance || 0) - 140} SP</p>
                <p style={{ margin: 0 }}>Requests remaining after this: {remaining - 1} of 2</p>
              </div>
            </div>

            {/* Disclaimer Box */}
            <div style={{
              maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--line)',
              borderRadius: '6px', padding: '12px', background: '#f8fafc',
              fontSize: '0.825rem', color: 'var(--muted)', marginBottom: '16px', lineHeight: '1.4'
            }}>
              By submitting this request you acknowledge that:
              <ul style={{ paddingLeft: '18px', marginTop: '6px', marginBottom: 0 }}>
                <li>You are solely responsible for any work, assignments, or sessions missed on this day.</li>
                <li>The institution, program coordinators, and instructors bear no responsibility for any academic or professional consequences arising from your absence.</li>
                <li>This request is subject to instructor approval and is not guaranteed.</li>
                <li>SP will only be deducted upon approval.</li>
                <li>This request cannot be cancelled once submitted.</li>
              </ul>
            </div>

            {submitError && (
              <div style={{ padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', marginBottom: '12px', fontSize: '0.85rem' }}>
                {submitError}
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text)', marginBottom: '20px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checkboxChecked}
                onChange={(e) => setCheckboxChecked(e.target.checked)}
                disabled={submitting}
              />
              I have read and accept the above terms
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={handleCloseModal}
                disabled={submitting}
                style={{
                  padding: '8px 16px', background: '#e9f2f5', color: 'var(--primary-dark)',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem',
                  fontWeight: '750'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitRequest}
                disabled={!checkboxChecked || submitting}
                style={{
                  padding: '8px 16px',
                  background: checkboxChecked && !submitting ? 'var(--primary)' : '#cbd5e1',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: checkboxChecked && !submitting ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  fontWeight: '750'
                }}
              >
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request History Section */}
      <RequestHistoryTable history={history} formatDate={formatDate} />
    </div>
  );
}

function RequestHistoryTable({ history, formatDate }) {
  const getBadgeStyle = (status) => {
    switch (status) {
      case 'PENDING':
        return { background: '#fef9c3', color: '#854d0e', label: 'Pending' };
      case 'APPROVED':
        return { background: '#dcfce7', color: '#166534', label: 'Approved — 140 SP deducted' };
      case 'REJECTED':
        return { background: '#fee2e2', color: '#991b1b', label: 'Rejected' };
      case 'AUTO_EXPIRED':
        return { background: '#f3f4f6', color: '#374151', label: 'Expired — no response' };
      default:
        return { background: '#f3f4f6', color: '#374151', label: status };
    }
  };

  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--text)' }}>Request History</h3>
      {(!history || history.length === 0) ? (
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>No flexible day requests yet</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--muted)' }}>
                <th style={{ padding: '10px 12px' }}>Session</th>
                <th style={{ padding: '10px 12px' }}>Date</th>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Requested At</th>
                <th style={{ padding: '10px 12px' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => {
                const badge = getBadgeStyle(row.status);
                return (
                  <tr key={row.requestId} style={{ borderBottom: '1px solid #f1f5f9', color: 'var(--text)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--primary-dark)' }}>{row.sessionLabel}</td>
                    <td style={{ padding: '10px 12px' }}>{formatDate(row.sessionDate)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        background: badge.background,
                        color: badge.color
                      }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>{formatDate(row.requestedAt)}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--muted)' }}>{row.instructorNote || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FlexibleDayStore;
