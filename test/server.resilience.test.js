// Boots the real Express app WITHOUT a database and checks that it degrades the way
// a production server must: a failing dependency costs one request an error, never
// a hang or a crash, and the protections around it actually engage.
//
// No Mongo is available here on purpose — with `bufferCommands` off every query
// fails instantly, which is exactly the "database is down / slow" case.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';

process.env.SPURTI_NO_START = '1';
process.env.ALLOW_STUDENT_SEARCH = 'true';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_TOKEN = 'test-admin-token';
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', false);

let samagamaCalls = 0;
let samagama;
let server;
let base;

before(async () => {
  // The server logs every 500 it swallows; here they are the point of the test, so
  // keep that noise out of the report (anything else still prints).
  const realError = console.error;
  console.error = (...args) => { if (!String(args[0]).startsWith('[error]')) realError(...args); };
  // A stand-in for Samagama's /api/auth/me that counts how often it is asked.
  samagama = http.createServer((req, res) => {
    samagamaCalls += 1;
    setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ user: { email: 'someone@example.com' } }));
    }, 20);
  });
  await new Promise(r => samagama.listen(0, '127.0.0.1', r));
  process.env.SAMAGAMA_AUTH_URL = `http://127.0.0.1:${samagama.address().port}/api/auth/me`;

  const { default: app } = await import('../server/server.js');
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  await new Promise(r => samagama.close(r));
});

const get = (path, headers = {}) => fetch(base + path, { headers });
const post = (path, body, headers = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('a failing database', () => {
  test('/health says degraded (503) so a probe can pull the instance from rotation', async () => {
    const res = await get('/api/health');
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: 'degraded', db: 'down' });
  });

  test('an async handler whose query fails answers 500 JSON instead of hanging', async () => {
    const res = await get('/api/search?q=abcd');
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error, 'Something went wrong. Please try again.');
    assert.ok(!JSON.stringify(body).includes('mongoose'), 'internal details are not leaked');
  });

  test('the server keeps serving after many failed requests', async () => {
    const results = await Promise.all(Array.from({ length: 50 }, () => get('/api/search?q=abcd')));
    assert.ok(results.every(r => r.status === 500));
    const cfg = await get('/api/config');
    assert.equal(cfg.status, 200);
  });
});

describe('request limits', () => {
  test('an oversized JSON body is rejected with 413, not buffered', async () => {
    const res = await post('/api/ping', { email: 'a@b.co', name: 'n', page: 'record', pad: 'x'.repeat(200_000) });
    assert.equal(res.status, 413);
  });

  test('malformed JSON is a 400, not a 500', async () => {
    const res = await post('/api/ping', '{not json');
    assert.equal(res.status, 400);
  });

  test('a ping needs email, name and page', async () => {
    assert.equal((await post('/api/ping', { email: 'a@b.co' })).status, 400);
  });

  test('a valid ping is accepted without touching the database', async () => {
    const res = await post('/api/ping', { email: 'ok@example.com', name: 'Ok', page: 'record' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('one address spamming pings is throttled with 429', async () => {
    const codes = [];
    for (let i = 0; i < 30; i++) codes.push((await post('/api/ping', { email: 'spam@example.com', name: 'Spam', page: 'record' })).status);
    assert.ok(codes.includes(429), 'expected a 429 after the per-address limit');
    assert.equal(codes[0], 200);
  });

  test('other addresses are unaffected by that throttle', async () => {
    assert.equal((await post('/api/ping', { email: 'fine@example.com', name: 'Fine', page: 'record' })).status, 200);
  });
});

describe('admin access', () => {
  test('no credentials, wrong token and wrong email are all refused', async () => {
    assert.equal((await get('/api/admin/stats')).status, 403);
    assert.equal((await get('/api/admin/stats', { 'x-admin-email': 'admin@example.com', 'x-admin-token': 'nope' })).status, 403);
    assert.equal((await get('/api/admin/stats', { 'x-admin-email': 'other@example.com', 'x-admin-token': 'test-admin-token' })).status, 403);
  });

  test('correct credentials get past the guard (then hit the dead database, i.e. 500 not 403)', async () => {
    const res = await get('/api/admin/stats', { 'x-admin-email': 'ADMIN@example.com ', 'x-admin-token': 'test-admin-token' });
    assert.equal(res.status, 500);
  });
});

describe('public verify endpoint', () => {
  test('is rate limited per address', async () => {
    const codes = new Set();
    for (let i = 0; i < 620; i++) codes.add((await get('/api/verify/SPRT-AAAA-AAAA')).status);
    assert.ok(codes.has(429), 'expected 429 once past the per-minute limit');
  });
});

describe('student sign-in lookups', () => {
  test('one dashboard load is one Samagama call, not one per API request', async () => {
    samagamaCalls = 0;
    const headers = { cookie: 'chatengine_token=token-one' };
    // a dashboard fires several calls at once; each needs the student's identity
    await Promise.all(['/api/me', '/api/journey/state', '/api/spa/state', '/api/trajectory/state', '/api/achievements', '/api/announcements']
      .map(p => get(p, headers)));
    await get('/api/me', headers);   // and again a moment later
    assert.equal(samagamaCalls, 1);
  });

  test('a different signed-in student is looked up separately', async () => {
    samagamaCalls = 0;
    await get('/api/me', { cookie: 'chatengine_token=token-two' });
    await get('/api/me', { cookie: 'chatengine_token=token-three' });
    assert.equal(samagamaCalls, 2);
  });

  test('no cookie means no lookup at all', async () => {
    samagamaCalls = 0;
    const res = await get('/api/me');
    assert.equal(res.status, 401);
    assert.equal(samagamaCalls, 0);
  });
});
