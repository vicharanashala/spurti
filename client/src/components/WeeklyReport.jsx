/**
 * WeeklyReport.jsx  —  Feature 7
 * Per-student weekly report with PDF download.
 * Props: student, sessions, transactions, attendanceRecords, pollRecords
 */
import { useState, useMemo } from 'react';

function getWeekRange(offset = 0) {
  const now  = new Date();
  const day  = now.getDay();
  const mon  = new Date(now);
  mon.setDate(now.getDate() - ((day + 6) % 7) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun  = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

const fmt = d =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const pctColor = p =>
  p >= 90 ? '#16a34a' : p >= 75 ? '#ca8a04' : p >= 50 ? '#f97316' : '#dc2626';

function avg(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function StatCard({ value, label, color }) {
  return (
    <div style={{ flex: 1, minWidth: 90, border: '1px solid #e5e7eb', borderRadius: 10,
      padding: '12px 14px', textAlign: 'center', background: '#fafafa' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#1f2937' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{label}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase',
        letterSpacing: '.06em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e5e7eb' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

const TD = { padding: '7px 10px', border: '1px solid #e5e7eb', fontSize: 13 };
const TH = { ...TD, background: '#f3f4f6', fontWeight: 600, fontSize: 12 };

export default function WeeklyReport({ student = {}, sessions = [], transactions = [],
  attendanceRecords = [], pollRecords = [] }) {

  const [weekOffset, setWeekOffset] = useState(0);
  const { start, end } = useMemo(() => getWeekRange(weekOffset), [weekOffset]);

  const weekSessions   = useMemo(() => sessions.filter(s => { const d = new Date(s.date); return d >= start && d <= end; }), [sessions, start, end]);
  const weekTx         = useMemo(() => transactions.filter(t => { const d = new Date(t.dateTime); return d >= start && d <= end; }), [transactions, start, end]);
  const weekAttendance = useMemo(() => attendanceRecords.filter(r => weekSessions.some(s => s.label === r.sessionLabel)), [attendanceRecords, weekSessions]);
  const weekPolls      = useMemo(() => pollRecords.filter(r => weekSessions.some(s => s.label === r.sessionLabel)), [pollRecords, weekSessions]);

  const spGained   = weekTx.filter(t => t.appliedDelta > 0).reduce((a, t) => a + t.appliedDelta, 0);
  const spLost     = weekTx.filter(t => t.appliedDelta < 0).reduce((a, t) => a + t.appliedDelta, 0);
  const netSp      = spGained + spLost;
  const qualified  = weekAttendance.filter(r => r.qualified).length;
  const consistency = weekSessions.length ? Math.round((qualified / weekSessions.length) * 100) : null;
  const avgAtt     = avg(weekAttendance.map(r => r.attendancePercentage || 0));
  const avgPoll    = avg(weekPolls.map(r => r.totalQuestions > 0 ? Math.round((r.attemptedQuestions / r.totalQuestions) * 100) : 0));

  const suggestions = [];
  if (avgAtt !== null && avgAtt < 75) suggestions.push(`Average attendance this week was ${avgAtt}% — below the 75% SP threshold. Try joining sessions on time and staying for the full window.`);
  if (avgPoll !== null && avgPoll < 75) suggestions.push(`Poll attempt rate was ${avgPoll}%. Answering every poll question is the easiest way to keep SP climbing.`);
  if (netSp < 0) suggestions.push(`Net SP this week: ${netSp}. Consistent attendance and full poll participation will recover this next week.`);
  if (consistency !== null && consistency < 60) suggestions.push(`You qualified for attendance SP in ${qualified} of ${weekSessions.length} session(s). Aim for 75%+ in every session to stay in the earning band.`);
  if (!suggestions.length) suggestions.push('Excellent week! Keep attending on time, attempting every poll, and engaging in chat to stay at the top.');

  // Build printable HTML string for PDF
  const buildPrintHTML = () => `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Spurti Weekly Report — ${student.name || ''}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;padding:32px;font-size:13px}
h1{font-size:20px;color:#4f46e5;text-align:center;margin-bottom:4px}
.sub{text-align:center;color:#6b7280;font-size:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #4f46e5}
.sec-title{font-size:11px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.06em;
  margin-bottom:8px;padding-bottom:3px;border-bottom:1px solid #e5e7eb;margin-top:20px}
.cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.card{flex:1;min-width:90px;border:1px solid #e5e7eb;border-radius:8px;padding:10px;text-align:center}
.card-val{font-size:20px;font-weight:700}
.card-lbl{font-size:10px;color:#6b7280;margin-top:2px}
table{width:100%;border-collapse:collapse}
th,td{padding:6px 10px;border:1px solid #e5e7eb;text-align:left}
th{background:#f3f4f6;font-weight:600;font-size:11px}
ul{list-style:disc;padding-left:18px}li{margin-bottom:6px;line-height:1.5}
</style></head><body>
<h1>📊 Spurti Weekly Report</h1>
<div class="sub"><strong>${student.name || 'Student'}</strong> • ${student.email || ''}<br/>
Week: ${fmt(start)} – ${fmt(end)}</div>

<div class="sec-title">SP Summary</div>
<div class="cards">
  <div class="card"><div class="card-val" style="color:#16a34a">+${spGained}</div><div class="card-lbl">Gained</div></div>
  <div class="card"><div class="card-val" style="color:#dc2626">${spLost}</div><div class="card-lbl">Lost</div></div>
  <div class="card"><div class="card-val" style="color:${netSp>=0?'#16a34a':'#dc2626'}">${netSp>=0?'+':''}${netSp}</div><div class="card-lbl">Net SP</div></div>
  <div class="card"><div class="card-val" style="color:#4f46e5">${student.totalSp ?? '—'}</div><div class="card-lbl">Balance</div></div>
</div>

<div class="sec-title">Attendance</div>
${weekAttendance.length === 0 ? '<p style="color:#9ca3af">No attendance data this week.</p>' :
  `<table><thead><tr><th>Session</th><th>Minutes</th><th>%</th><th>Status</th></tr></thead><tbody>
  ${weekAttendance.map(r => `<tr>
    <td>${r.sessionLabel}</td><td>${r.attendedMinutes ?? '—'} min</td>
    <td style="color:${pctColor(r.attendancePercentage)};font-weight:600">${(r.attendancePercentage||0).toFixed(0)}%</td>
    <td>${r.qualified ? '✓ Qualified' : '✗ Below threshold'}</td>
  </tr>`).join('')}
  </tbody></table>`}

<div class="sec-title">Poll Performance</div>
${weekPolls.length === 0 ? '<p style="color:#9ca3af">No poll data this week.</p>' :
  `<table><thead><tr><th>Session</th><th>Attempted</th><th>Total</th><th>%</th></tr></thead><tbody>
  ${weekPolls.map(r => { const p = r.totalQuestions > 0 ? Math.round(r.attemptedQuestions/r.totalQuestions*100) : 0;
    return `<tr><td>${r.sessionLabel}</td><td>${r.attemptedQuestions}</td><td>${r.totalQuestions}</td>
    <td style="color:${pctColor(p)};font-weight:600">${p}%</td></tr>`;}).join('')}
  </tbody></table>`}

<div class="sec-title">Consistency</div>
<div class="cards">
  <div class="card"><div class="card-val">${weekSessions.length}</div><div class="card-lbl">Sessions</div></div>
  <div class="card"><div class="card-val" style="color:${pctColor(consistency??0)}">${qualified}</div><div class="card-lbl">Qualified</div></div>
  <div class="card"><div class="card-val" style="color:${pctColor(consistency??0)}">${consistency!==null?consistency+'%':'—'}</div><div class="card-lbl">Consistency</div></div>
  <div class="card"><div class="card-val" style="color:${pctColor(avgAtt??0)}">${avgAtt!==null?avgAtt+'%':'—'}</div><div class="card-lbl">Avg Att.</div></div>
</div>

<div class="sec-title">Suggestions</div>
<ul>${suggestions.map(s => `<li>${s}</li>`).join('')}</ul>
</body></html>`;

  return (
    <div style={{ fontFamily: "'Segoe UI',Arial,sans-serif", color: '#1f2937', maxWidth: 740, margin: '0 auto' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 19, fontWeight: 700, color: '#4f46e5', margin: 0 }}>📊 Weekly Report</h2>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{fmt(start)} – {fmt(end)}</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn onClick={() => setWeekOffset(w => w - 1)}>← Prev</Btn>
          <Btn active={weekOffset === 0} onClick={() => setWeekOffset(0)}>This Week</Btn>
          <Btn disabled={weekOffset === 0} onClick={() => setWeekOffset(w => Math.min(w + 1, 0))}>Next →</Btn>
          <Btn primary onClick={() => {
            const w = window.open('', '_blank');
            w.document.write(buildPrintHTML());
            w.document.close();
            setTimeout(() => w.print(), 400);
          }}>⬇ Download PDF</Btn>
        </div>
      </div>

      {/* Student banner */}
      <div style={{ background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', borderRadius: 12,
        padding: '14px 20px', color: '#fff', marginBottom: 18,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{student.name || 'Student'}</div>
          <div style={{ fontSize: 11, opacity: .75 }}>{student.email}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{student.totalSp ?? '—'} SP</div>
          <div style={{ fontSize: 11, opacity: .65 }}>Current Balance</div>
        </div>
      </div>

      {weekSessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 15 }}>
          No sessions found for this week.
        </div>
      ) : (<>
        <Section title="SP Summary">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StatCard value={`+${spGained}`} label="Gained"   color="#16a34a" />
            <StatCard value={spLost}          label="Lost"     color="#dc2626" />
            <StatCard value={`${netSp >= 0 ? '+' : ''}${netSp}`} label="Net SP"
              color={netSp >= 0 ? '#16a34a' : '#dc2626'} />
            <StatCard value={student.totalSp ?? '—'} label="Balance" color="#4f46e5" />
          </div>
        </Section>

        <Section title="Attendance">
          {weekAttendance.length === 0
            ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No attendance data this week.</p>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Session','Minutes','%','Status'].map(h =>
                  <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>{weekAttendance.map((r, i) =>
                  <tr key={i}>
                    <td style={TD}>{r.sessionLabel}</td>
                    <td style={TD}>{r.attendedMinutes ?? '—'} min</td>
                    <td style={{ ...TD, color: pctColor(r.attendancePercentage), fontWeight: 600 }}>
                      {(r.attendancePercentage || 0).toFixed(0)}%</td>
                    <td style={TD}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                        background: r.qualified ? '#dcfce7' : '#fee2e2',
                        color: r.qualified ? '#15803d' : '#b91c1c' }}>
                        {r.qualified ? '✓ Qualified' : '✗ Below threshold'}
                      </span>
                    </td>
                  </tr>)}
                </tbody>
              </table>}
        </Section>

        <Section title="Poll Performance">
          {weekPolls.length === 0
            ? <p style={{ color: '#9ca3af', fontSize: 13 }}>No poll data this week.</p>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Session','Attempted','Total','%'].map(h =>
                  <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>{weekPolls.map((r, i) => {
                  const p = r.totalQuestions > 0
                    ? Math.round(r.attemptedQuestions / r.totalQuestions * 100) : 0;
                  return <tr key={i}>
                    <td style={TD}>{r.sessionLabel}</td>
                    <td style={TD}>{r.attemptedQuestions}</td>
                    <td style={TD}>{r.totalQuestions}</td>
                    <td style={{ ...TD, color: pctColor(p), fontWeight: 600 }}>{p}%</td>
                  </tr>;})}
                </tbody>
              </table>}
        </Section>

        <Section title="Consistency">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <StatCard value={weekSessions.length} label="Sessions" />
            <StatCard value={qualified}           label="Qualified"    color={pctColor(consistency ?? 0)} />
            <StatCard value={consistency !== null ? `${consistency}%` : '—'} label="Consistency" color={pctColor(consistency ?? 0)} />
            <StatCard value={avgAtt !== null ? `${avgAtt}%` : '—'}   label="Avg Att."    color={pctColor(avgAtt ?? 0)} />
            <StatCard value={avgPoll !== null ? `${avgPoll}%` : '—'} label="Avg Poll %"  color={pctColor(avgPoll ?? 0)} />
          </div>
        </Section>

        <Section title="💡 Suggestions">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {suggestions.map((s, i) =>
              <li key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 13, lineHeight: 1.6 }}>
                <span style={{ color: '#4f46e5', fontWeight: 700, minWidth: 16 }}>
                  {netSp >= 0 ? '✓' : '→'}
                </span>
                <span>{s}</span>
              </li>)}
          </ul>
        </Section>
      </>)}
    </div>
  );
}

function Btn({ children, onClick, disabled, active, primary }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
      border: '1.5px solid', opacity: disabled ? 0.4 : 1,
      borderColor: primary ? '#4f46e5' : active ? '#4f46e5' : '#d1d5db',
      background: primary ? '#4f46e5' : active ? '#4f46e5' : '#fff',
      color: (primary || active) ? '#fff' : '#374151',
    }}>{children}</button>
  );
}
