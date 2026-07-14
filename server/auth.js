/**
 * server/auth.js
 *
 * Shared auth helpers for routes that need to identify the current student.
 * Implemented identically to the version that used to live inline in
 * server.js — extracted to a module so route files (e.g.
 * routes/weeklyLeaderboard.js) can reuse the same auth pattern as /me,
 * /wrapped, etc.
 */
import { SAMAGAMA_AUTH_URL } from './config.js';

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

// Validate the student's Samagama session by forwarding their chatengine_token
// cookie to Samagama's internal auth endpoint. Returns the user object on success.
export async function getSamagamaUser(chatengineToken) {
  if (!chatengineToken) return null;
  try {
    const res = await fetch(SAMAGAMA_AUTH_URL, {
      headers: { cookie: `chatengine_token=${chatengineToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function studentEmailFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const data = await getSamagamaUser(cookies.chatengine_token);
  // Samagama's /api/auth/me nests the user as { user: { email, ... } };
  // fall back to a top-level email in case the shape ever flattens.
  const email = data?.user?.email || data?.email;
  if (!email) return null;
  return normalizeEmail(email);
}

// Dev helper: try ?asEmail= first, then a localhost-only dev cookie set by
// the search/confirm login flow, then real auth. NO localhost default —
// the user must explicitly request an impersonated student via ?asEmail=
// or complete the search/confirm flow. Returns the email string, or null
// if neither path produced one.
export async function resolveStudentEmail(req) {
  if (process.env.NODE_ENV !== 'production') {
    if (req.query.asEmail) return normalizeEmail(req.query.asEmail);
    // Honor the devStudentEmail cookie set by /search (exact match) or
    // /confirm in non-production. This lets the manual login UX drive
    // student-specific endpoints without a Samagama session cookie.
    const cookies = parseCookies(req.headers.cookie || '');
    if (cookies.devStudentEmail) return normalizeEmail(cookies.devStudentEmail);
  }
  return await studentEmailFromRequest(req);
}

// Set the devStudentEmail cookie on the response (localhost/non-prod only).
// httpOnly so the client JS can't tamper with it. By default this is a
// session cookie (no Max-Age), so it dies when the browser tab closes and
// a refresh re-prompts for credentials. Set DEV_COOKIE_MAX_AGE_SECONDS in
// .env to a positive number if you want a longer-lived cookie for testing.
export function setDevStudentCookie(res, email) {
  if (process.env.NODE_ENV === 'production') return;
  const value = encodeURIComponent(normalizeEmail(email));
  const maxAgeSec = Number(process.env.DEV_COOKIE_MAX_AGE_SECONDS) || 0;
  const attrs = [
    `devStudentEmail=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAgeSec > 0) attrs.push(`Max-Age=${maxAgeSec}`);
  res.setHeader('Set-Cookie', attrs.join('; '));
}

// Clear the devStudentEmail cookie (e.g. on logout).
export function clearDevStudentCookie(res) {
  res.setHeader(
    'Set-Cookie',
    'devStudentEmail=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  );
}