import React, { useEffect, useState } from 'react';

const APP_BASE = window.location.pathname.startsWith('/spurti') ? '/spurti' : '';
const API = `${APP_BASE}/api`;

export default function StudentTimeline({ studentId, auth }) {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const fetchTimeline = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API}/admin/student-activity/${studentId}`, {
          headers: {
            'X-Admin-Email': auth.email,
            'X-Admin-Token': auth.token
          }
        });
        if (!res.ok) throw new Error('Failed to load student activity timeline.');
        const data = await res.json();
        if (active) {
          setTimeline(data.timeline || []);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchTimeline();
    return () => { active = false; };
  }, [studentId, auth]);

  if (loading) return <p style={{ padding: '20px', textAlign: 'center' }}>Loading timeline activity...</p>;
  if (error) return <p style={{ padding: '20px', textAlign: 'center', color: 'var(--red)' }}>{error}</p>;
  if (timeline.length === 0) return <p style={{ padding: '40px', textAlign: 'center', color: 'var(--muted)' }}>No activities logged yet for this student.</p>;

  return (
    <section className="timeline-container" style={{ padding: '15px 5px' }}>
      <div className="vertical-timeline" style={{ borderLeft: '3px solid var(--line)', marginLeft: '20px', paddingLeft: '20px', position: 'relative' }}>
        {timeline.map((event, index) => {
          let dotColor = '#94a3b8'; // Slate default
          let cardBorder = 'var(--line)';
          let isSp = event.sp !== null;

          if (event.type === 'sp_earn') {
            dotColor = 'var(--green)';
            cardBorder = '1px solid rgba(34, 197, 94, 0.2)';
          } else if (event.type === 'sp_penalty') {
            dotColor = 'var(--red)';
            cardBorder = '1px solid rgba(239, 68, 68, 0.2)';
          } else if (event.type === 'attendance') {
            dotColor = 'var(--primary)';
          } else if (event.type === 'poll') {
            dotColor = 'var(--amber)';
          }

          return (
            <div key={index} className="timeline-item" style={{ marginBottom: '24px', position: 'relative' }}>
              {/* Dot */}
              <div 
                className="timeline-dot" 
                style={{ 
                  width: '14px', 
                  height: '14px', 
                  borderRadius: '50%', 
                  background: dotColor, 
                  position: 'absolute', 
                  left: '-28px', 
                  top: '6px',
                  boxShadow: `0 0 8px ${dotColor}`
                }} 
              />
              
              {/* Card */}
              <div 
                className="timeline-card" 
                style={{ 
                  border: cardBorder, 
                  borderRadius: '8px', 
                  padding: '12px 15px', 
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>{event.title}</h3>
                  <small style={{ color: 'var(--muted)', fontSize: '11px' }}>{new Date(event.timestamp).toLocaleString()}</small>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#475569', lineHeight: '1.4' }}>{event.description}</p>
                
                {isSp && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center' }}>
                    <span 
                      style={{ 
                        fontSize: '11px', 
                        fontWeight: 'bold', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        background: event.sp >= 0 ? '#dcfce7' : '#fee2e2',
                        color: event.sp >= 0 ? '#15803d' : '#b91c1c'
                      }}
                    >
                      {event.sp >= 0 ? `+${event.sp}` : event.sp} SP
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
