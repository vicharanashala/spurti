/**
 * ActivityHeatmap.jsx — Feature 10
 * GitHub-style daily activity heatmap.
 * Props: transactions, sessions, attendanceRecords, startDate, endDate
 */
import { useMemo, useState } from 'react';

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const toKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const getMonday = d => { const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - ((day + 6) % 7)); x.setHours(0,0,0,0); return x; };

const level = sp => sp <= 0 ? 0 : sp <= 3 ? 1 : sp <= 8 ? 2 : sp <= 15 ? 3 : 4;
const COLORS = ['#eef2ff','#c7d2fe','#818cf8','#4f46e5','#312e81'];
const LABELS = ['No activity','Low (1–3 SP)','Moderate (4–8 SP)','Good (9–15 SP)','Excellent (16+ SP)'];

export default function ActivityHeatmap({ transactions = [], attendanceRecords = [], sessions = [],
  startDate, endDate }) {

  const [tip, setTip] = useState(null);

  const sessionByDate = useMemo(() => {
    const m = {};
    sessions.forEach(s => { const k = toKey(s.date); (m[k] = m[k] || []).push(s.label); });
    return m;
  }, [sessions]);

  const spByDay = useMemo(() => {
    const m = {};
    transactions.forEach(t => { const k = toKey(t.dateTime); m[k] = (m[k] || 0) + (t.appliedDelta || 0); });
    return m;
  }, [transactions]);

  const today = new Date(); today.setHours(23,59,59,999);
  const end = endDate ? new Date(endDate) : today;
  const start = startDate ? getMonday(new Date(startDate)) : getMonday(addDays(end, -7*16+1));

  const weeks = useMemo(() => {
    const cols = []; let cur = new Date(start);
    while (cur <= end) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const day = addDays(cur, d);
        if (day > end) { week.push(null); continue; }
        const k = toKey(day);
        week.push({ date: day, key: k, sp: spByDay[k] || 0, sessions: sessionByDate[k] || [] });
      }
      cols.push(week);
      cur = addDays(cur, 7);
    }
    return cols;
  }, [start, end, spByDay, sessionByDate]);

  const monthLabels = useMemo(() => {
    const labels = []; let last = -1;
    weeks.forEach((week, wi) => {
      const first = week.find(Boolean);
      if (!first) return;
      const m = first.date.getMonth();
      if (m !== last) { labels.push({ wi, label: MONTH_NAMES[m] }); last = m; }
    });
    return labels;
  }, [weeks]);

  const CELL = 14, GAP = 3, STEP = CELL + GAP;

  const activeDays = Object.values(spByDay).filter(v => v > 0).length;
  const totalSp = Object.values(spByDay).reduce((a, b) => a + b, 0);
  const streak = useMemo(() => {
    let s = 0, d = new Date(today);
    while ((spByDay[toKey(d)] || 0) > 0) { s++; d = addDays(d, -1); }
    return s;
  }, [spByDay]);

  return (
    <div style={{ fontFamily: "'Segoe UI',Arial,sans-serif", color: '#1f2937', userSelect: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: '#4f46e5', margin: 0 }}>🟩 Activity Heatmap</h2>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6b7280' }}>
          <span><b style={{ color: '#1f2937' }}>{activeDays}</b> active days</span>
          <span><b style={{ color: '#1f2937' }}>{totalSp >= 0 ? '+' : ''}{totalSp}</b> SP</span>
          <span><b style={{ color: '#1f2937' }}>{streak}</b>-day streak</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div style={{ display: 'flex', marginLeft: 28, marginBottom: 4 }}>
            {weeks.map((_, wi) => {
              const ml = monthLabels.find(m => m.wi === wi);
              return <div key={wi} style={{ width: STEP, flexShrink: 0, fontSize: 10, color: '#6b7280' }}>{ml ? ml.label : ''}</div>;
            })}
          </div>
          <div style={{ display: 'flex' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 4 }}>
              {DAY_LABELS.map((d, i) => (
                <div key={d} style={{ height: CELL, fontSize: 9, color: '#9ca3af', lineHeight: `${CELL}px`,
                  textAlign: 'right', paddingRight: 2 }}>{i % 2 === 0 ? d : ''}</div>
              ))}
            </div>
            {weeks.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: GAP }}>
                {week.map((cell, di) => cell === null ? (
                  <div key={di} style={{ width: CELL, height: CELL }} />
                ) : (
                  <div key={di}
                    onMouseEnter={e => { const r = e.target.getBoundingClientRect();
                      setTip({ x: r.left + window.scrollX, y: r.top + window.scrollY, ...cell }); }}
                    onMouseLeave={() => setTip(null)}
                    style={{ width: CELL, height: CELL, borderRadius: 3, background: COLORS[level(cell.sp)],
                      cursor: cell.sessions.length || cell.sp ? 'pointer' : 'default',
                      border: cell.date.toDateString() === new Date().toDateString() ? '2px solid #4f46e5' : 'none',
                      transition: 'transform .1s' }}
                    onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.3)')}
                    onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 11, color: '#6b7280' }}>
        <span>Less</span>
        {COLORS.map((c, i) => (
          <div key={i} title={LABELS[i]} style={{ width: CELL, height: CELL, borderRadius: 3, background: c }} />
        ))}
        <span>More</span>
        <span style={{ marginLeft: 8 }}>SP per day</span>
      </div>

      {tip && (
        <div style={{ position: 'fixed', left: tip.x + CELL + 6, top: tip.y - 10, background: '#1f2937',
          color: '#fff', borderRadius: 8, padding: '8px 12px', fontSize: 12, pointerEvents: 'none',
          zIndex: 9999, minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,.25)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>
            {tip.date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
          <div style={{ color: tip.sp > 0 ? '#86efac' : tip.sp < 0 ? '#fca5a5' : '#9ca3af' }}>
            {tip.sp > 0 ? '+' : ''}{tip.sp} SP
          </div>
          {tip.sessions.length > 0 &&
            <div style={{ marginTop: 4, color: '#c7d2fe', fontSize: 11 }}>{tip.sessions.join(', ')}</div>}
        </div>
      )}
    </div>
  );
}
