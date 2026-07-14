/**
 * StudentSearch.jsx — Feature 15
 * Instant filterable student search with privacy masking, sort, and pagination.
 * Props: students, onSelect, allowFullSearch
 */
import { useState, useMemo, useRef } from 'react';

function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local.slice(0,2)}${'*'.repeat(Math.max(2, local.length - 2))}@${domain}`;
}

function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return (<>
    {text.slice(0, i)}
    <mark style={{ background: '#fef08a', color: '#1f2937', borderRadius: 2, padding: '0 1px' }}>
      {text.slice(i, i + q.length)}
    </mark>
    {text.slice(i + q.length)}
  </>);
}

function leagueStyle(l) {
  if (l === 'Legend') return { bg: '#fef08a', fg: '#713f12', border: '#ca8a04' };
  if (l?.startsWith('Diamond'))  return { bg: '#bfdbfe', fg: '#1e3a8a', border: '#3b82f6' };
  if (l?.startsWith('Platinum')) return { bg: '#e0e7ff', fg: '#3730a3', border: '#6366f1' };
  if (l?.startsWith('Gold'))     return { bg: '#fef9c3', fg: '#a16207', border: '#eab308' };
  if (l?.startsWith('Silver'))   return { bg: '#f3f4f6', fg: '#374151', border: '#9ca3af' };
  return { bg: '#fef2f2', fg: '#7f1d1d', border: '#fca5a5' };
}

const spColor = sp => sp >= 600 ? '#4f46e5' : sp >= 400 ? '#16a34a' : sp >= 200 ? '#ca8a04' : sp >= 100 ? '#374151' : '#dc2626';

export default function StudentSearch({ students = [], onSelect, allowFullSearch = false }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('sp');
  const [page, setPage] = useState(1);
  const inputRef = useRef(null);
  const PAGE_SIZE = 20;
  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    let list = students;
    if (statusFilter !== 'all') list = list.filter(s => s.status === statusFilter);
    if (q) {
      list = list.filter(s => {
        const nameMatch = s.name?.toLowerCase().includes(q);
        const emailMatch = allowFullSearch ? s.email?.toLowerCase().includes(q) : s.email?.toLowerCase() === q;
        const altMatch = allowFullSearch && s.alternateEmail?.toLowerCase().includes(q);
        return nameMatch || emailMatch || altMatch;
      });
    }
    if (sortBy === 'sp')   list = [...list].sort((a, b) => (b.totalSp || 0) - (a.totalSp || 0));
    if (sortBy === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return list;
  }, [students, q, statusFilter, sortBy, allowFullSearch]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const page_ = Math.min(page, totalPages);
  const visible = filtered.slice((page_ - 1) * PAGE_SIZE, page_ * PAGE_SIZE);

  const rankMap = useMemo(() => {
    const sorted = [...students].filter(s => s.status === 'active').sort((a, b) => (b.totalSp || 0) - (a.totalSp || 0));
    const m = {}; sorted.forEach((s, i) => (m[s.email] = i + 1)); return m;
  }, [students]);

  return (
    <div style={{ fontFamily: "'Segoe UI',Arial,sans-serif", color: '#1f2937' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#4f46e5', margin: '0 0 4px' }}>🔍 Search Students</h2>
        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          {students.length} students total — {students.filter(s => s.status === 'active').length} active
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 16, color: '#9ca3af', pointerEvents: 'none' }}>🔍</span>
          <input ref={inputRef} value={query}
            onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder="Search by name or email…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #d1d5db', borderRadius: 10,
              fontSize: 13, outline: 'none', background: '#fafafa', boxSizing: 'border-box' }}
            onFocus={e => (e.target.style.borderColor = '#4f46e5')}
            onBlur={e => (e.target.style.borderColor = '#d1d5db')} />
          {query && (
            <button onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          {['all','active','excused'].map(s => (
            <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
              style={{ padding: '7px 14px', borderRadius: 20, border: '1.5px solid',
                borderColor: statusFilter === s ? '#4f46e5' : '#d1d5db',
                background: statusFilter === s ? '#4f46e5' : '#fff',
                color: statusFilter === s ? '#fff' : '#374151',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{s}</button>
          ))}
        </div>

        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 12,
            background: '#fff', cursor: 'pointer' }}>
          <option value="sp">Sort: SP (High → Low)</option>
          <option value="name">Sort: Name (A → Z)</option>
        </select>
      </div>

      {q && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>
        {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{query}"</div>}

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9ca3af', fontSize: 14 }}>
          {q ? `No students match "${query}".` : 'No students found.'}
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 80px 100px',
            background: '#f9fafb', padding: '8px 14px', gap: 8, borderBottom: '1px solid #e5e7eb',
            fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span>#</span><span>Student</span><span>League</span>
            <span style={{ textAlign: 'right' }}>SP</span><span style={{ textAlign: 'center' }}>Status</span>
          </div>
          {visible.map((s, i) => {
            const rank = rankMap[s.email];
            const ls = leagueStyle(s.trophyLeague);
            return (
              <div key={s._id || s.email} onClick={() => onSelect?.(s)}
                style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 80px 100px', padding: '11px 14px',
                  gap: 8, alignItems: 'center', borderBottom: '1px solid #f3f4f6',
                  cursor: onSelect ? 'pointer' : 'default', background: '#fff' }}
                onMouseOver={e => (e.currentTarget.style.background = '#f0f0ff')}
                onMouseOut={e => (e.currentTarget.style.background = '#fff')}>
                <span style={{ fontSize: 12, color: rank <= 3 ? '#ca8a04' : '#9ca3af', fontWeight: rank <= 3 ? 700 : 400 }}>
                  {rank ? (rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : `#${rank}`) : '—'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {highlight(s.name || '(no name)', query)}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {allowFullSearch ? highlight(s.email || '', query) : maskEmail(s.email)}
                  </div>
                </div>
                <div>
                  {s.trophyLeague ? (
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10,
                      fontWeight: 700, background: ls.bg, color: ls.fg, border: `1px solid ${ls.border}`, whiteSpace: 'nowrap' }}>
                      {s.trophyLeague}
                    </span>
                  ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: spColor(s.totalSp || 0) }}>
                  {s.totalSp ?? 0}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    background: s.status === 'active' ? '#dcfce7' : '#f3f4f6',
                    color: s.status === 'active' ? '#15803d' : '#6b7280' }}>{s.status}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 14, alignItems: 'center' }}>
          <PgBtn onClick={() => setPage(1)} disabled={page_ === 1}>«</PgBtn>
          <PgBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page_ === 1}>‹</PgBtn>
          <span style={{ fontSize: 12, color: '#6b7280', padding: '0 8px' }}>
            Page {page_} of {totalPages} ({filtered.length} results)
          </span>
          <PgBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page_ === totalPages}>›</PgBtn>
          <PgBtn onClick={() => setPage(totalPages)} disabled={page_ === totalPages}>»</PgBtn>
        </div>
      )}
    </div>
  );
}

function PgBtn({ children, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
        background: disabled ? '#f9fafb' : '#fff', color: disabled ? '#d1d5db' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 13 }}>{children}</button>
  );
}
