/**
 * AnalyticsDashboard.jsx — Feature 17
 * Admin analytics dashboard: stat cards + Pie/Bar/Line charts (recharts).
 * Props: students, transactions, sessions, attendanceRecords, pollRecords
 */
import { useMemo } from 'react';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from 'recharts';

const C = { indigo:'#4f46e5', violet:'#7c3aed', emerald:'#059669', amber:'#d97706', rose:'#e11d48', sky:'#0284c7', slate:'#475569' };

const LEAGUE_COLORS = {
  Legend:'#f59e0b','Diamond I':'#3b82f6','Diamond II':'#3b82f6','Diamond III':'#3b82f6',
  'Platinum I':'#8b5cf6','Platinum II':'#8b5cf6','Platinum III':'#8b5cf6',
  'Gold I':'#eab308','Gold II':'#eab308','Gold III':'#eab308',
  'Silver I':'#9ca3af','Silver II':'#9ca3af','Silver III':'#9ca3af',
  'Bronze I':'#a78bfa','Bronze II':'#a78bfa','Bronze III':'#a78bfa',
};

function Card({ title, value, sub, color, icon }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:'16px 18px',
      display:'flex', alignItems:'center', gap:14, boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
      <div style={{ width:44, height:44, borderRadius:12, background:color+'18',
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>{icon}</div>
      <div>
        <div style={{ fontSize:22, fontWeight:800, color }}>{value}</div>
        <div style={{ fontSize:12, fontWeight:600, color:'#374151', marginBottom:1 }}>{title}</div>
        {sub && <div style={{ fontSize:11, color:'#9ca3af' }}>{sub}</div>}
      </div>
    </div>
  );
}

function ChartBox({ title, children }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:14, padding:'18px 20px',
      boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
      <h3 style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:16,
        textTransform:'uppercase', letterSpacing:'.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

const riskLevel = s => { const sp = s.totalSp ?? 0; return sp < 50 ? 'critical' : sp < 100 ? 'at-risk' : 'healthy'; };
const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;
const toWeekKey = d => { const x = new Date(d); const day = x.getDay();
  const m = new Date(x); m.setDate(x.getDate() - ((day+6)%7));
  return m.toLocaleDateString('en-IN', { day:'2-digit', month:'short' }); };

export default function AnalyticsDashboard({ students = [], transactions = [], sessions = [],
  attendanceRecords = [], pollRecords = [] }) {

  const active = students.filter(s => s.status === 'active');
  const excused = students.filter(s => s.status === 'excused');
  const spValues = active.map(s => s.totalSp ?? 0);

  const avgSp = avg(spValues);
  const maxSp = spValues.length ? Math.max(...spValues) : 0;
  const minSp = spValues.length ? Math.min(...spValues) : 0;
  const atRisk = active.filter(s => riskLevel(s) !== 'healthy').length;
  const critical = active.filter(s => riskLevel(s) === 'critical').length;
  const topStudent = active.reduce((a, b) => ((a?.totalSp ?? 0) > (b?.totalSp ?? 0) ? a : b), active[0] || {});

  const avgAtt  = useMemo(() => avg(attendanceRecords.map(r => r.attendancePercentage || 0)), [attendanceRecords]);
  const avgPoll = useMemo(() => avg(pollRecords.map(r => r.totalQuestions > 0 ? (r.attemptedQuestions / r.totalQuestions) * 100 : 0)), [pollRecords]);

  const spBands = useMemo(() => {
    const bands = [
      { name:'600+',     min:600, max:Infinity, color:C.indigo },
      { name:'400–599',  min:400, max:599,      color:C.sky },
      { name:'200–399',  min:200, max:399,      color:C.emerald },
      { name:'100–199',  min:100, max:199,      color:C.amber },
      { name:'<100',     min:-Infinity, max:99,  color:C.rose },
    ];
    return bands.map(b => ({ name:b.name, color:b.color,
      value: active.filter(s => (s.totalSp ?? 0) >= b.min && (s.totalSp ?? 0) <= b.max).length }))
      .filter(b => b.value > 0);
  }, [active]);

  const statusPie = [
    { name:'Active',  value: active.length,  color:C.emerald },
    { name:'Excused', value: excused.length,  color:C.amber },
    { name:'At Risk', value: atRisk,          color:C.rose },
  ].filter(d => d.value > 0);

  const attendanceBar = useMemo(() => {
    const m = {};
    attendanceRecords.forEach(r => { if (!m[r.sessionLabel]) m[r.sessionLabel] = { total:0, count:0 };
      m[r.sessionLabel].total += r.attendancePercentage || 0; m[r.sessionLabel].count++; });
    return Object.entries(m).map(([label, {total,count}]) => ({
      label: label.length > 14 ? label.slice(0,12)+'…' : label, fullLabel: label,
      avgPct: Math.round(total / count) })).slice(-12);
  }, [attendanceRecords]);

  const pollBar = useMemo(() => {
    const m = {};
    pollRecords.forEach(r => { if (!m[r.sessionLabel]) m[r.sessionLabel] = { total:0, count:0 };
      const pct = r.totalQuestions > 0 ? (r.attemptedQuestions / r.totalQuestions) * 100 : 0;
      m[r.sessionLabel].total += pct; m[r.sessionLabel].count++; });
    return Object.entries(m).map(([label, {total,count}]) => ({
      label: label.length > 14 ? label.slice(0,12)+'…' : label, avgPct: Math.round(total / count) })).slice(-12);
  }, [pollRecords]);

  const spTrend = useMemo(() => {
    const m = {};
    transactions.forEach(t => { const k = toWeekKey(t.dateTime); m[k] = (m[k] || 0) + (t.appliedDelta || 0); });
    return Object.entries(m).map(([week, totalDelta]) => ({ week, totalDelta })).slice(-12);
  }, [transactions]);

  const riskStudents = useMemo(() =>
    active.filter(s => riskLevel(s) !== 'healthy').sort((a,b) => (a.totalSp??0)-(b.totalSp??0)).slice(0,8),
    [active]);

  const leagueBar = useMemo(() => {
    const ORDER = ['Legend','Diamond I','Diamond II','Diamond III','Platinum I','Platinum II','Platinum III',
      'Gold I','Gold II','Gold III','Silver I','Silver II','Silver III','Bronze I','Bronze II','Bronze III'];
    const counts = {};
    active.forEach(s => { if (s.trophyLeague) counts[s.trophyLeague] = (counts[s.trophyLeague]||0)+1; });
    return ORDER.filter(l => counts[l]).map(l => ({ label:l, count:counts[l], color:LEAGUE_COLORS[l] || '#9ca3af' }));
  }, [active]);

  const pctFmt = v => `${v}%`;

  return (
    <div style={{ fontFamily: "'Segoe UI',Arial,sans-serif", color:'#1f2937' }}>
      <h2 style={{ fontSize:20, fontWeight:800, color:C.indigo, marginBottom:4 }}>📊 Analytics Dashboard</h2>
      <p style={{ fontSize:12, color:'#9ca3af', marginBottom:22 }}>
        {active.length} active students across {sessions.length} sessions
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:12, marginBottom:24 }}>
        <Card title="Average SP"       value={avgSp}            sub="across active students"          color={C.indigo}  icon="⚡" />
        <Card title="Highest SP"       value={maxSp}            sub={topStudent?.name?.split(' ')[0]} color={C.violet}  icon="🏆" />
        <Card title="Lowest SP"        value={minSp}            sub="active students"                  color={C.rose}    icon="⚠️" />
        <Card title="Active Students"  value={active.length}    sub={`${excused.length} excused`}      color={C.emerald} icon="👤" />
        <Card title="Students at Risk" value={atRisk}            sub={`${critical} critical (<50 SP)`}  color={C.amber}   icon="🔴" />
        <Card title="Avg Attendance"   value={`${avgAtt}%`}     sub="across all sessions"              color={C.sky}     icon="📅" />
        <Card title="Avg Poll %"       value={`${avgPoll}%`}    sub="across all sessions"              color={C.slate}   icon="📝" />
        <Card title="Sessions"         value={sessions.length}  sub="total sessions tracked"           color={C.indigo}  icon="🎯" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <ChartBox title="SP Distribution Bands">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={spBands} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                labelLine={false} label={({name,percent}) => `${name} ${(percent*100).toFixed(0)}%`}>
                {spBands.map((d,i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RTooltip formatter={v => [`${v} students`,'']} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        <ChartBox title="Student Status Breakdown">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80}
                label={({name,value}) => `${name}: ${value}`}>
                {statusPie.map((d,i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <RTooltip formatter={v => [`${v} students`,'']} />
              <Legend iconType="circle" iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <ChartBox title="Avg Attendance % by Session">
          {attendanceBar.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={attendanceBar} margin={{ top:4, right:4, left:-18, bottom:40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize:10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tickFormatter={pctFmt} tick={{ fontSize:10 }} domain={[0,100]} />
                <RTooltip formatter={pctFmt} labelFormatter={(_, p) => p[0]?.payload?.fullLabel} />
                <Bar dataKey="avgPct" name="Avg %" radius={[4,4,0,0]}>
                  {attendanceBar.map((d,i) => <Cell key={i} fill={d.avgPct>=75?C.emerald:d.avgPct>=50?C.amber:C.rose} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        <ChartBox title="Avg Poll % by Session">
          {pollBar.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pollBar} margin={{ top:4, right:4, left:-18, bottom:40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize:10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tickFormatter={pctFmt} tick={{ fontSize:10 }} domain={[0,100]} />
                <RTooltip formatter={pctFmt} />
                <Bar dataKey="avgPct" name="Avg Poll %" radius={[4,4,0,0]}>
                  {pollBar.map((d,i) => <Cell key={i} fill={d.avgPct>=75?C.indigo:d.avgPct>=50?C.violet:C.rose} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        <ChartBox title="Weekly Net SP (All Students)">
          {spTrend.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={spTrend} margin={{ top:4, right:4, left:-12, bottom:40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="week" tick={{ fontSize:10 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize:10 }} />
                <RTooltip formatter={v => [`${v>=0?'+':''}${v} SP`,'Net SP']} />
                <Line type="monotone" dataKey="totalDelta" name="Net SP" stroke={C.indigo} strokeWidth={2}
                  dot={{ r:4, fill:C.indigo }} activeDot={{ r:6 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartBox>

        <ChartBox title="Trophy League Distribution">
          {leagueBar.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={leagueBar} layout="vertical" margin={{ top:4, right:20, left:80, bottom:4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis type="number" tick={{ fontSize:10 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize:10 }} width={76} />
                <RTooltip formatter={v => [`${v} students`,'']} />
                <Bar dataKey="count" name="Students" radius={[0,4,4,0]}>
                  {leagueBar.map((d,i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartBox>
      </div>

      {riskStudents.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #fecaca', borderRadius:14, padding:'18px 20px',
          boxShadow:'0 1px 4px rgba(0,0,0,.05)' }}>
          <h3 style={{ fontSize:13, fontWeight:700, color:C.rose, marginBottom:12,
            textTransform:'uppercase', letterSpacing:'.05em' }}>⚠️ Students at Risk (low SP)</h3>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'#fff5f5' }}>
              {['Name','Email','SP','Risk Level'].map(h =>
                <th key={h} style={{ padding:'7px 10px', border:'1px solid #fecaca', textAlign:'left',
                  fontWeight:600, color:'#374151' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {riskStudents.map((s,i) => {
                const risk = riskLevel(s);
                return (
                  <tr key={i}>
                    <td style={td}>{s.name}</td>
                    <td style={{ ...td, color:'#9ca3af' }}>{s.email}</td>
                    <td style={{ ...td, fontWeight:700, color: risk==='critical'?C.rose:C.amber }}>{s.totalSp ?? 0}</td>
                    <td style={td}>
                      <span style={{ padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:600,
                        background: risk==='critical'?'#fee2e2':'#fef9c3', color: risk==='critical'?'#b91c1c':'#a16207' }}>
                        {risk === 'critical' ? '🔴 Critical' : '🟡 At Risk'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {atRisk > 8 && <p style={{ fontSize:11, color:'#9ca3af', marginTop:8, textAlign:'right' }}>
            Showing 8 of {atRisk} at-risk students.</p>}
        </div>
      )}
    </div>
  );
}

const td = { padding:'7px 10px', border:'1px solid #fecaca' };
function Empty() {
  return <div style={{ textAlign:'center', color:'#d1d5db', fontSize:13, padding:'40px 0' }}>No data available yet.</div>;
}
