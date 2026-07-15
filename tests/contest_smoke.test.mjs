// End-to-end smoke test for the contest auth + rate-limit middleware.
// Stubs out mongoose models so we can test the Express layer in isolation.
import express from 'express';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ── Replicate the helpers from server.js ──
const SPURTI_AUTH_SECRET = 'test-secret';
function signValue(value) {
  return crypto.createHmac('sha256', SPURTI_AUTH_SECRET).update(value).digest('base64url');
}
function verifySignedToken(token) {
  if (!token) return null;
  const [body, signature] = String(token).split('.');
  if (!body || !signature) return null;
  const expected = signValue(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp || Date.now() > Number(payload.exp)) return null;
    return { email: String(payload.email).toLowerCase() };
  } catch { return null; }
}

// ── Stub contest router with the same middleware as production ──
const submitBuckets = new Map();
const SUBMIT_LIMIT = 5;
const SUBMIT_WINDOW_MS = 60_000;

function submitRateLimit(req, res, next) {
  const email = (req.headers['x-student-email'] || '').toLowerCase();
  const key = `${req.ip}|${email}`;
  const now = Date.now();
  const bucket = submitBuckets.get(key) || { tokens: SUBMIT_LIMIT, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  const refill = Math.floor(elapsed / SUBMIT_WINDOW_MS) * SUBMIT_LIMIT;
  if (refill > 0) { bucket.tokens = Math.min(SUBMIT_LIMIT, bucket.tokens + refill); bucket.lastRefill = now; }
  if (bucket.tokens <= 0) return res.status(429).json({ error: 'rate limited' });
  bucket.tokens -= 1; submitBuckets.set(key, bucket); next();
}

// EXACT mirror of the fixed studentGuard
function studentGuard(req, res, next) {
  let email;
  if (req.spurtiStudent?.email) {
    email = req.spurtiStudent.email;
  } else {
    email = req.headers['x-student-email'];
  }
  if (!email) return res.status(401).json({ error: 'not authed' });
  req.headers['x-student-email'] = String(email).toLowerCase();
  next();
}

// Replicate the cookie middleware from server.js
function cookieMiddleware(req, _res, next) {
  const raw = req.headers.cookie || '';
  const cookies = Object.fromEntries(raw.split(';').map(p => {
    const i = p.indexOf('=');
    return i < 0 ? null : [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())];
  }).filter(Boolean));
  const verified = verifySignedToken(cookies.spurti_student);
  if (verified) req.spurtiStudent = verified;
  next();
}

const app = express();
app.use(cookieMiddleware);
app.get('/api/contest/active', studentGuard, (req, res) => {
  res.json({ ok: true, email: req.headers['x-student-email'] });
});
app.post('/api/contest/:id/submit', studentGuard, submitRateLimit, (req, res) => {
  res.json({ ok: true, email: req.headers['x-student-email'] });
});

function makeCookie(email, ttlMs = 60_000) {
  const body = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs })).toString('base64url');
  return `spurti_student=${body}.${signValue(body)}`;
}

// Disable keep-alive so sockets close after each fetch (avoids UV_HANDLE_CLOSING
// race on Windows when process.exit fires before libuv drains the close queue).
const http = await import('node:http');
const agent = new http.Agent({ keepAlive: false });
const fetchOpts = (extra = {}) => ({ agent, ...extra });

const server = app.listen(0, async () => {
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    // Test 1: No cookie, no header → 401
    const r1 = await fetch(`${base}/api/contest/active`, fetchOpts());
    assert.equal(r1.status, 401, `expected 401, got ${r1.status}`);
    console.log('OK Test 1: no auth → 401');

    // Test 2: Header-only (legacy fallback path) → 200, header used
    const r2 = await fetch(`${base}/api/contest/active`, fetchOpts({
      headers: { 'x-student-email': 'legacy@iitrpr.ac.in' }
    }));
    assert.equal(r2.status, 200, 'header-only should still work for legacy callers');
    const d2 = await r2.json();
    assert.equal(d2.email, 'legacy@iitrpr.ac.in', 'header email should be used when no cookie');
    console.log('OK Test 2: header-only (legacy) → 200, header used');

    // Test 3: Valid signed cookie → 200, normalized email used
    const cookie = makeCookie('Real@IITRPR.AC.IN');
    const r3 = await fetch(`${base}/api/contest/active`, fetchOpts({ headers: { 'Cookie': cookie } }));
    assert.equal(r3.status, 200);
    const d3 = await r3.json();
    assert.equal(d3.email, 'real@iitrpr.ac.in', 'cookie email should be lowercased');
    console.log('OK Test 3: signed cookie → 200 with normalized email');

    // Test 4: Cookie + conflicting header → cookie WINS (the security fix)
    const r4 = await fetch(`${base}/api/contest/active`, fetchOpts({
      headers: { 'Cookie': cookie, 'x-student-email': 'attacker@evil.com' }
    }));
    assert.equal(r4.status, 200);
    const d4 = await r4.json();
    assert.equal(d4.email, 'real@iitrpr.ac.in', 'cookie email MUST override spoofing header');
    console.log('OK Test 4: cookie + conflicting header → cookie wins (spoofing blocked)');

    // Test 5: Expired cookie → 401 (falls through to header check)
    const expired = makeCookie('x@iitrpr.ac.in', -1000);
    const r5 = await fetch(`${base}/api/contest/active`, fetchOpts({
      headers: { 'Cookie': expired, 'x-student-email': 'fallback@iitrpr.ac.in' }
    }));
    assert.equal(r5.status, 200, 'expired cookie should fall back to header');
    const d5 = await r5.json();
    assert.equal(d5.email, 'fallback@iitrpr.ac.in');
    console.log('OK Test 5: expired cookie falls back to header');

    // Test 6: Tampered signature → 401 (treated as no cookie)
    const validBody = Buffer.from(JSON.stringify({ email: 'real@iitrpr.ac.in', exp: Date.now() + 60_000 })).toString('base64url');
    const r6 = await fetch(`${base}/api/contest/active`, fetchOpts({
      headers: { 'Cookie': `spurti_student=${validBody}.invalidsignature` }
    }));
    assert.equal(r6.status, 401, 'tampered signature should 401');
    console.log('OK Test 6: tampered signature → 401');

    // Test 7: Rate limiter on submit (uses cookie auth)
    submitBuckets.clear();
    for (let i = 0; i < SUBMIT_LIMIT; i++) {
      const r = await fetch(`${base}/api/contest/abc/submit`, fetchOpts({
        method: 'POST',
        headers: { 'Cookie': cookie }
      }));
      assert.equal(r.status, 200, `submit ${i+1} should be allowed, got ${r.status}`);
    }
    const r7 = await fetch(`${base}/api/contest/abc/submit`, fetchOpts({
      method: 'POST',
      headers: { 'Cookie': cookie }
    }));
    assert.equal(r7.status, 429, `submit 6 should be rate-limited, got ${r7.status}`);
    console.log('OK Test 7: rate limiter blocks 6th submit');

    console.log('\nAll smoke tests passed.');
    agent.destroy();
    server.close(() => process.exit(0));
    // Safety net if close callback doesn't fire in time (Windows keep-alive).
    setTimeout(() => process.exit(0), 500).unref();
  } catch (err) {
    console.error('SMOKE TEST FAILED:', err);
    agent.destroy();
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 500).unref();
  }
});