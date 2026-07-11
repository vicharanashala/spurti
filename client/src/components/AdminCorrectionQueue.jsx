import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

/**
 * AdminCorrectionQueue
 * Shows all pending SP correction requests in a review table.
 * Admins must type a comment before approving (with custom SP) or rejecting.
 *
 * Props:
 *   auth  { email, token }  — same auth object used by the rest of AdminView
 */
export function AdminCorrectionQueue({ auth }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Per-row state: adminComment, customSp, processing flag, and per-row error.
  const [rowState, setRowState] = useState({});

  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  };

  const loadQueue = async () => {
    setFetchError('');
    setLoading(true);
    try {
      const res = await fetch(`${API}/admin/corrections/pending`, {
        headers: { 'X-Admin-Email': auth.email, 'X-Admin-Token': auth.token }
      });
      if (!res.ok) throw new Error('Failed to load queue');
      const data = await res.json();
      setQueue(data);

      // Initialise per-row state for any new items.
      setRowState(prev => {
        const next = { ...prev };
        for (const item of data) {
          if (!next[item._id]) {
            next[item._id] = { adminComment: '', customSp: 5, processing: false, error: '' };
          }
        }
        return next;
      });
    } catch (err) {
      setFetchError(err.message || 'Could not load pending corrections.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateRowState = (id, patch) => {
    setRowState(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleAction = async (item, action) => {
    const row = rowState[item._id] || {};
    if (!row.adminComment || !row.adminComment.trim()) {
      updateRowState(item._id, { error: 'Please enter an Admin Comment before taking action.' });
      return;
    }

    updateRowState(item._id, { processing: true, error: '' });
    try {
      const res = await fetch(`${API}/admin/corrections/${item._id}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action,
          reviewedBy: auth.email,
          adminComment: row.adminComment.trim(),
          bonusSp: action === 'approved' ? Number(row.customSp) || 5 : undefined
        })
      });

      const data = await res.json();
      if (!res.ok) {
        updateRowState(item._id, { processing: false, error: data.error || 'Action failed.' });
        return;
      }

      // Remove processed item from active list instantly.
      setQueue(prev => prev.filter(q => q._id !== item._id));
    } catch {
      updateRowState(item._id, { processing: false, error: 'Network error. Please try again.' });
    }
  };

  if (loading) {
    return (
      <section className="panel">
        <p className="eyebrow">Correction Portal</p>
        <p className="muted">Loading pending requests…</p>
      </section>
    );
  }

  if (fetchError) {
    return (
      <section className="panel">
        <p className="eyebrow">Correction Portal</p>
        <p className="error">{fetchError}</p>
        <button className="secondary" onClick={loadQueue}>Retry</button>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <p className="eyebrow">Correction Portal</p>
          <h2>Pending Correction Requests</h2>
        </div>
        <button className="secondary" onClick={loadQueue} id="correction-queue-refresh-btn">
          ↻ Refresh
        </button>
      </div>

      {queue.length === 0 ? (
        <div className="correction-empty">
          <span>✅</span>
          <p>No pending correction requests. All caught up!</p>
        </div>
      ) : (
        <div className="matrix-wrap">
          <table className="table review-table correction-queue-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Session</th>
                <th>Category</th>
                <th>Reason & Comments</th>
                <th>Proof</th>
                <th>Submitted</th>
                <th>Admin Review</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((item, index) => {
                const row = rowState[item._id] || { adminComment: '', customSp: 5, processing: false, error: '' };
                return (
                  <tr key={item._id} className={row.processing ? 'correction-row--processing' : ''}>
                    {/* # */}
                    <td className="correction-idx">{index + 1}</td>

                    {/* Student email */}
                    <td>
                      <strong className="correction-email">{item.email}</strong>
                    </td>

                    {/* Session */}
                    <td>
                      <span className="correction-session-label">{item.sessionLabel}</span>
                    </td>

                    {/* Category badge */}
                    <td>
                      <span className={`correction-badge correction-badge--${item.category}`}>
                        {item.category === 'attendance' ? '🗓 Attendance' : '📊 Poll'}
                      </span>
                    </td>

                    {/* Reason + student comment */}
                    <td className="correction-reason-cell">
                      <p>{item.studentReason}</p>
                      {item.studentComment && (
                        <em className="correction-student-comment">
                          💬 {item.studentComment}
                        </em>
                      )}
                    </td>

                    {/* Proof link */}
                    <td>
                      <a
                        href={item.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="correction-proof-link"
                        id={`correction-proof-link-${item._id}`}
                      >
                        {item.proofType === 'image' ? '🖼 Open Image Proof' : '🎥 Open Video Proof'}
                      </a>
                    </td>

                    {/* Submitted at */}
                    <td>
                      <span className="correction-date">
                        {new Date(item.createdAt).toLocaleDateString('en-IN', {
                          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </td>

                    {/* Admin comment + SP input */}
                    <td className="correction-admin-input-cell">
                      <textarea
                        className="correction-textarea correction-textarea--compact"
                        rows={3}
                        placeholder="Admin remark (required)…"
                        value={row.adminComment}
                        onChange={e => updateRowState(item._id, { adminComment: e.target.value, error: '' })}
                        disabled={row.processing}
                        id={`correction-admin-comment-${item._id}`}
                      />
                      <div className="correction-sp-row">
                        <label htmlFor={`correction-sp-${item._id}`} className="correction-sp-label">
                          SP to Award:
                        </label>
                        <input
                          id={`correction-sp-${item._id}`}
                          type="number"
                          min="1"
                          max="100"
                          className="correction-sp-input"
                          value={row.customSp}
                          onChange={e => updateRowState(item._id, { customSp: e.target.value })}
                          disabled={row.processing}
                        />
                      </div>
                      {row.error && (
                        <p className="correction-row-error error">{row.error}</p>
                      )}
                    </td>

                    {/* Action buttons */}
                    <td>
                      <div className="review-actions correction-action-col">
                        <button
                          className="correction-approve-btn"
                          onClick={() => handleAction(item, 'approved')}
                          disabled={row.processing}
                          id={`correction-approve-${item._id}`}
                          title={`Approve and credit ${row.customSp || 5} SP`}
                        >
                          {row.processing ? '…' : `✅ Approve (+${row.customSp || 5} SP)`}
                        </button>
                        <button
                          className="correction-reject-btn"
                          onClick={() => handleAction(item, 'rejected')}
                          disabled={row.processing}
                          id={`correction-reject-${item._id}`}
                          title="Reject this request"
                        >
                          {row.processing ? '…' : '❌ Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AdminCorrectionQueue;
