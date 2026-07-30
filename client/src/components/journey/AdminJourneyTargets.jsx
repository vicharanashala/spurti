import React, { useEffect, useState } from 'react';

const WINDOWS = ['weekly', 'monthly', 'tenure'];
const FIELD_META = {
  label: { label: 'Label', type: 'text' },
  checkpointCount: { label: 'Checkpoints', type: 'number', min: 1, max: 10 },
  attendanceTargetPct: { label: 'Att Target %', type: 'number', min: 0, max: 100 },
  pollTargetPct: { label: 'Poll Target %', type: 'number', min: 0, max: 100 },
  attendanceWeight: { label: 'Att Weight %', type: 'number', min: 0, max: 100 },
  pollWeight: { label: 'Poll Weight %', type: 'number', min: 0, max: 100 }
};

function getBase() {
  return window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
}

export default function AdminJourneyTargets({ auth }) {
  const [targets, setTargets] = useState(null);
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const headers = auth ? { 'X-Admin-Email': auth.email, 'X-Admin-Token': auth.token } : {};

  useEffect(() => {
    if (!auth) return;
    fetch(`${getBase()}/api/admin/journey/targets`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => setTargets(d));
  }, [auth]);

  if (!auth) return <section className="panel"><p className="muted">Admin login required.</p></section>;
  if (!targets) return <section className="panel"><p>Loading targets...</p></section>;

  const startEdit = (window) => setEdit({ window, ...targets[window] });

  const save = async () => {
    if (!edit) return;
    setSaving(true); setMsg('');
    try {
      const r = await fetch(`${getBase()}/api/admin/journey/targets/${edit.window}`, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: edit.label, checkpointCount: Number(edit.checkpointCount),
          attendanceTargetPct: Number(edit.attendanceTargetPct), pollTargetPct: Number(edit.pollTargetPct),
          attendanceWeight: Number(edit.attendanceWeight), pollWeight: Number(edit.pollWeight)
        })
      });
      if (!r.ok) throw new Error('Save failed');
      const updated = await r.json();
      setTargets(prev => ({ ...prev, [edit.window]: updated }));
      setMsg('Saved successfully');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  return (
    <section className="panel">
      <h2>Journey Targets</h2>
      {msg && <p style={{ color: msg.includes('Error') ? 'var(--red)' : 'var(--green)', fontWeight: 700, marginBottom: 12 }}>{msg}</p>}
      <div style={{ display: 'grid', gap: 14 }}>
        {WINDOWS.map(w => {
          const t = targets[w];
          const isEditing = edit?.window === w;
          return (
            <div key={w} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 14, background: isEditing ? '#f8faff' : '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 14, letterSpacing: '0.05em' }}>{w}</h3>
                {!isEditing && <button className="secondary" onClick={() => startEdit(w)}>Edit</button>}
              </div>
              {!isEditing ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, fontSize: 13 }}>
                  <div><span style={{ color: 'var(--muted)' }}>Label</span><br/><strong>{t.label}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Checkpoints</span><br/><strong>{t.checkpointCount}</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Att</span><br/><strong>{t.attendanceTargetPct}%</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Poll</span><br/><strong>{t.pollTargetPct}%</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Att Wt</span><br/><strong>{t.attendanceWeight}%</strong></div>
                  <div><span style={{ color: 'var(--muted)' }}>Poll Wt</span><br/><strong>{t.pollWeight}%</strong></div>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {Object.entries(FIELD_META).map(([key, meta]) => (
                      <div key={key}>
                        <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase' }}>{meta.label}</label>
                        <input
                          type={meta.type} min={meta.min} max={meta.max}
                          value={edit[key]}
                          onChange={e => setEdit(prev => ({ ...prev, [key]: e.target.value }))}
                          style={{ marginTop: 4 }}
                        />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button className="primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : 'Save'}</button>
                    <button className="secondary" onClick={() => setEdit(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
