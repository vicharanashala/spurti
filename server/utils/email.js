// Shared email helpers used across the server entry point and the SP service
// modules. Single source of truth — adding a new endpoint or service that
// needs email masking or normalization imports from here, not a copy.

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// Mask an email for display in the leaderboard / search results / public
// student payload. Keeps the first 2 chars and the last 2 (when the local
// part is > 4 chars long) of the local-part, replaces the middle with '*',
// and always preserves the domain so admins can still sanity-check identity.
export function maskEmail(email) {
  const [name, domain] = String(email || '').trim().split('@');
  if (!name || !domain) return 'hidden email';
  const start = name.slice(0, Math.min(2, name.length));
  const end = name.length > 4 ? name.slice(-2) : '';
  return `${start}${'*'.repeat(Math.max(3, name.length - start.length - end.length))}${end}@${domain}`;
}
