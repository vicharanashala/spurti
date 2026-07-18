import { ROLLING_WINDOW_SIZE } from './config.js';

function simulateFetch(email) {
  const sessions = [
    { label: 'Day 1 (15 May)', date: new Date('2026-05-15T12:00Z'), totalMinutes: 120 },
    { label: 'Day 2 (16 May)', date: new Date('2026-05-16T12:00Z'), totalMinutes: 120 },
    { label: 'Day 3 (19 May)', date: new Date('2026-05-19T12:00Z'), totalMinutes: 90 },
    { label: 'Day 4 (20 May)', date: new Date('2026-05-20T12:00Z'), totalMinutes: 120 },
    { label: 'Day 5 (21 May)', date: new Date('2026-05-21T12:00Z'), totalMinutes: 80 },
    { label: 'Day 6 (22 May)', date: new Date('2026-05-22T12:00Z'), totalMinutes: 240 }
  ];

  const attendance = {
    'Day 1 (15 May)': 95,
    'Day 2 (16 May)': 88,
    'Day 3 (19 May)': 72,
    'Day 4 (20 May)': 65,
    'Day 5 (21 May)': 45,
    'Day 6 (22 May)': 30
  };

  const spDeltas = {
    'Day 1 (15 May)': 10,
    'Day 2 (16 May)': 10,
    'Day 3 (19 May)': 5,
    'Day 4 (20 May)': 5,
    'Day 5 (21 May)': 3,
    'Day 6 (22 May)': 0
  };

  const windowed = sessions.map(s => ({
    label: s.label,
    date: s.date,
    totalMinutes: s.totalMinutes,
    attendancePct: attendance[s.label] ?? null,
    spDelta: spDeltas[s.label] ?? 0
  }));

  const n = ROLLING_WINDOW_SIZE;
  const current = windowed.slice(-n);
  const previous = windowed.length > n ? windowed.slice(-n * 2, -n) : [];

  return { current, previous, all: windowed };
}

function printWindow(label, data) {
  console.log(`\n=== ${label} (${data.length} sessions, window size=${ROLLING_WINDOW_SIZE}) ===`);
  console.log('Session                  | Attend % | SP Delta');
  console.log('-------------------------|----------|---------');
  for (const s of data) {
    const att = s.attendancePct !== null ? String(s.attendancePct).padStart(5) + '%' : '  N/A  ';
    const sp = String(s.spDelta).padStart(3);
    console.log(`${s.label.padEnd(25)}| ${att}    |   ${sp}`);
  }
}

console.log('Fetching engagement data for student@example.com...\n');

const data = simulateFetch('student@example.com');

printWindow('PREVIOUS WINDOW', data.previous);
printWindow('CURRENT WINDOW', data.current);

console.log('\n--- Summary ---');
console.log(`Total sessions available: ${data.all.length}`);
console.log(`Previous window covers:  ${data.previous.map(s => s.label).join(', ') || '(none)'}`);
console.log(`Current window covers:   ${data.current.map(s => s.label).join(', ')}`);
