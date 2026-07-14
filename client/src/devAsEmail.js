// Resolves the dev impersonation email used by overlay components.
// In dev (localhost / 127.0.0.1), if `?asEmail=...` is on the URL it is
// returned; otherwise empty string (no localhost fallback — the user must
// log in normally via the search/confirm flow). Returns '' in production.
export function getDevAsEmail() {
  const host = window.location.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') return '';
  const fromUrl = new URLSearchParams(window.location.search).get('asEmail');
  return fromUrl && fromUrl.trim() ? fromUrl.trim() : '';
}
