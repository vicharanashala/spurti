export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

export function parseDate(value) {
  const raw = String(value || '').trim();
  let m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    return new Date(Number(m[3]), months[m[2].slice(0, 3).toLowerCase()], Number(m[1]), 9, 0, 0);
  }
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 9, 0, 0);
  return null;
}

export function parseZoomDate(value, fallback) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) return fallback;
  let hour = Number(m[4]);
  if (m[7].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (m[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}