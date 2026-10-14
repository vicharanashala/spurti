import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { wrapAsync, wrapRouter } from '../server/lib/asyncRoutes.js';
import { errorHandler } from '../server/lib/errorHandler.js';

const tick = () => new Promise(r => setImmediate(r));

describe('wrapAsync', () => {
  test('a rejected async handler goes to next(err) instead of hanging or crashing', async () => {
    const boom = new Error('db down');
    let got;
    wrapAsync(async () => { throw boom; })({}, {}, e => { got = e; });
    await tick();
    assert.equal(got, boom);
  });

  test('a synchronous throw also reaches next(err)', () => {
    let got;
    wrapAsync(() => { throw new Error('sync'); })({}, {}, e => { got = e; });
    assert.equal(got.message, 'sync');
  });

  test('a healthy handler is untouched and next is not called', async () => {
    let nextCalled = false, sent = false;
    wrapAsync(async (_req, res) => { res.sent = true; sent = true; })({}, {}, () => { nextCalled = true; });
    await tick();
    assert.equal(sent, true);
    assert.equal(nextCalled, false);
  });

  test('non-functions (path strings, arrays) pass through unchanged', () => {
    assert.equal(wrapAsync('x'), 'x');
  });

  test('wrapRouter wraps every verb and keeps the path argument', async () => {
    const seen = [];
    const router = {
      get(path, ...h) { seen.push(['get', path, h]); },
      post(path, ...h) { seen.push(['post', path, h]); }
    };
    wrapRouter(router, ['get', 'post']);
    const errors = [];
    router.get('/a', async () => { throw new Error('a'); });
    router.post('/b', (_q, _s, n) => n(), async () => {});
    assert.equal(seen[0][1], '/a');
    assert.equal(seen[1][2].length, 2, 'middleware chain preserved');
    seen[0][2][0]({}, {}, e => errors.push(e));
    await tick();
    assert.equal(errors[0].message, 'a');
  });
});

describe('errorHandler with a wrapped router', () => {
  const start = async () => {
    const app = express();
    const api = wrapRouter(express.Router());
    api.get('/boom', async () => { throw new Error('mongo: secret connection detail'); });
    api.get('/ok', async (_q, res) => res.json({ ok: true }));
    app.use(express.json({ limit: '2mb' }));
    app.use('/api', api);
    app.use(errorHandler);
    const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
    return { server, base: `http://127.0.0.1:${server.address().port}/api` };
  };

  test('a rejected handler answers 500 JSON without leaking the error, and the server keeps serving', async () => {
    const { server, base } = await start();
    const origError = console.error; console.error = () => {};
    try {
      const bad = await fetch(`${base}/boom`);
      assert.equal(bad.status, 500);
      const body = await bad.json();
      assert.equal(body.error, 'Something went wrong. Please try again.');
      assert.ok(!JSON.stringify(body).includes('secret'));
      assert.equal((await fetch(`${base}/ok`)).status, 200);
    } finally { console.error = origError; server.close(); }
  });

  test('malformed JSON is a 400, not a 500', async () => {
    const { server, base } = await start();
    try {
      const res = await fetch(`${base}/ok`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error, 'Bad request.');
    } finally { server.close(); }
  });
});
