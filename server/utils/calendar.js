import crypto from 'crypto';
import { randomUUID } from 'crypto';

function formatDateForICS(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

export function buildICS(sessions = []) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Spurti//Calendar Export//EN'
  ];
  for (const s of sessions) {
    const uid = s._id || randomUUID();
    const dtstart = formatDateForICS(s.startDateTime || s.date || s.endDateTime);
    const dtend = formatDateForICS(s.endDateTime || s.startDateTime || s.date);
    const summary = (s.label || 'Spurti Session')
      .replace(/\r|\n/g, ' ');
    const description = `Session: ${s.label || ''}`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    if (dtstart) lines.push(`DTSTART:${dtstart}`);
    if (dtend) lines.push(`DTEND:${dtend}`);
    lines.push(`SUMMARY:${escapeText(summary)}`);
    lines.push(`DESCRIPTION:${escapeText(description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeText(txt) {
  return String(txt || '').replace(/([\\,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
}

// Simple AES-256-CBC encryption for refresh tokens. Key must be 32 bytes.
export function encryptToken(plain, key) {
  if (!plain) return '';
  const k = Buffer.from(String(key || ''), 'utf8');
  if (k.length < 32) throw new Error('CALENDAR_ENCRYPTION_KEY must be at least 32 bytes');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', k.slice(0,32), iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, encrypted]).toString('base64');
}

export function decryptToken(cipherText, key) {
  if (!cipherText) return '';
  const k = Buffer.from(String(key || ''), 'utf8');
  const data = Buffer.from(cipherText, 'base64');
  const iv = data.slice(0, 16);
  const encrypted = data.slice(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', k.slice(0,32), iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
