import React, { useEffect, useState } from 'react';
import BlockIcon from './BlockIcon';

const BAND_ORDER = ['Excellent', 'Active', 'Recovery', 'Slowing Down'];

export default function AdminBandGrid({ auth }) {
  const [groups, setGroups] = useState(null);
  const [summary, setSummary] = useState(null);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState(null);

  const headers = auth ? {
    'X-Admin-Email': auth.email,
    'X-Admin-Token': auth.token
  } : {};

  useEffect(() => {
    if (!auth) return;
    setLoading(true);
    const base = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
    const url = filter ? `${base}/api/admin/engagement/report?band=${encodeURIComponent(filter)}` : `${base}/api/admin/engagement/report`;
    fetch(url, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        if (filter) {
          setGroups({ [filter]: d.students || [] });
          setSummary({ [filter]: { count: d.count } });
          setTotal(d.count);
        } else {
          setGroups(d.groups || {});
          setSummary(d.summary || {});
          setTotal(d.total || 0);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [auth, filter]);

  if (!auth) {
    return <section className="panel"><p className="muted">Admin login required to view engagement report.</p></section>;
  }

  if (loading) {
    return (
      <section className="panel">
        <div className="mc-loading">Loading report...</div>
      </section>
    );
  }

  const filteredGroups = filter ? { [filter]: groups?.[filter] || [] } : groups || {};

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Engagement Report</h2>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>{total} students</span>
      </div>

      <div className="mc-filter-bar">
        <button className={`mc-filter-btn ${!filter ? 'active' : ''}`} onClick={() => setFilter('')}>All</button>
        {BAND_ORDER.map(band => (
          <button
            key={band}
            className={`mc-filter-btn ${filter === band ? 'active' : ''}`}
            onClick={() => setFilter(filter === band ? '' : band)}
          >
            {band}
          </button>
        ))}
      </div>

      <div className="mc-grid-wrap">
        {BAND_ORDER.map(band => {
          const students = filteredGroups[band];
          if (!students || students.length === 0) return null;
          return (
            <div key={band} className="mc-band-row">
              <h3>
                <BlockIcon band={band} size="sm" />
                {band}
                <span>{students.length} student{students.length !== 1 ? 's' : ''}</span>
              </h3>
              <div className="mc-grid">
                {students.map(s => (
                  <div
                    key={s.email}
                    className="mc-grid-item"
                    onMouseEnter={() => setHovered(s.email)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <BlockIcon band={s.band} size="sm" />
                    {hovered === s.email && (
                      <div className="mc-tooltip" style={{ bottom: 'calc(100% + 4px)' }}>
                        <strong>{s.name}</strong><br />
                        {s.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(filteredGroups).length === 0 && (
        <p className="muted" style={{ textAlign: 'center', padding: 20 }}>No students found in this band.</p>
      )}
    </section>
  );
}
