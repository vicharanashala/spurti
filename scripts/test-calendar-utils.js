import { buildICS, encryptToken, decryptToken } from '../server/utils/calendar.js';

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(2); } }

// ICS generation
const sample = [{ _id: '1', label: 'Test Session', startDateTime: new Date('2026-08-10T10:00:00Z'), endDateTime: new Date('2026-08-10T11:00:00Z') }];
const ics = buildICS(sample);
assert(ics.includes('BEGIN:VCALENDAR'), 'ICS header present');
assert(ics.includes('BEGIN:VEVENT'), 'Event present');

// Encryption round-trip (use a 32-char key)
const key = '01234567890123456789012345678901';
const token = 'refresh-token-abc';
const enc = encryptToken(token, key);
const dec = decryptToken(enc, key);
assert(dec === token, 'encrypt/decrypt roundtrip');

console.log('All calendar utils tests passed');
