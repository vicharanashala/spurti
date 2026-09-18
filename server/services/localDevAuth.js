// Local fixture authentication is deliberately opt-in and deliberately narrow.
// It is useful when developing student-only features without a Samagama server,
// but it must never alter production or shared-environment authentication.
export function localDevAuthEmail(env = process.env) {
  if (env.NODE_ENV !== 'development') return null;

  const email = String(env.LOCAL_DEV_AUTH_EMAIL || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
