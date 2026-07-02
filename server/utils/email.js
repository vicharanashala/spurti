export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd = name.length > 4 ? name.slice(-2) : '';
  const maskLength = Math.max(3, name.length - visibleStart.length - visibleEnd.length);
  return `${visibleStart}${'*'.repeat(maskLength)}${visibleEnd}@${domain}`;
}