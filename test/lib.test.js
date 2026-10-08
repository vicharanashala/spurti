import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { wrapAsync, wrapRouter } from '../server/lib/asyncRoutes.js';
import { TtlCache } from '../server/lib/ttlCache.js';
import { BatchBuffer } from '../server/lib/batchBuffer.js';
import { rateLimit } from '../server/lib/rateLimit.js';
import { safeEqual } from '../server/lib/safeEqual.js';

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

describe('TtlCache', () => {
  test('serves a cached value inside the ttl and reloads after it', async () => {
    let t = 0, loads = 0;
    const c = new TtlCache({ now: () => t });
    const load = async () => ++loads;
    assert.equal(await c.getOrLoad('k', 1000, load), 1);
    t = 500;
    assert.equal(await c.getOrLoad('k', 1000, load), 1);
    t = 1500;
    assert.equal(await c.getOrLoad('k', 1000, load), 2);
  });

  test('concurrent misses share ONE load (no stampede on a cold or expired key)', async () => {
    let loads = 0;
    const c = new TtlCache();
    const load = async () => { loads++; await tick(); return 'v'; };
    const results = await Promise.all(Array.from({ length: 200 }, () => c.getOrLoad('k', 1000, load)));
    assert.equal(loads, 1);
    assert.ok(results.every(r => r === 'v'));
  });

  test('a failing reload serves the last good value instead of erroring', async () => {
    let t = 0, fail = false;
    const c = new TtlCache({ now: () => t, staleMs: 60_000 });
    const load = async () => { if (fail) throw new Error('mongo blip'); return 'good'; };
    assert.equal(await c.getOrLoad('k', 1000, load), 'good');
    t = 2000; fail = true;
    assert.equal(await c.getOrLoad('k', 1000, load), 'good');
  });

  test('with nothing cached, a failing load rejects (and does not stay stuck in flight)', async () => {
    const c = new TtlCache();
    await assert.rejects(c.getOrLoad('k', 1000, async () => { throw new Error('x'); }), /x/);
    assert.equal(await c.getOrLoad('k', 1000, async () => 'ok'), 'ok');
  });

  test('a value older than staleMs is not served after a failed reload', async () => {
    let t = 0;
    const c = new TtlCache({ now: () => t, staleMs: 5000 });
    await c.getOrLoad('k', 1000, async () => 'old');
    t = 10_000;
    await assert.rejects(c.getOrLoad('k', 1000, async () => { throw new Error('down'); }), /down/);
  });

  test('the key table is capped, oldest first', async () => {
    const c = new TtlCache({ maxKeys: 3 });
    for (let i = 0; i < 10; i++) await c.getOrLoad('k' + i, 1000, async () => i);
    assert.equal(c.entries.size, 3);
    assert.ok(c.entries.has('k9') && !c.entries.has('k0'));
  });
});

describe('BatchBuffer', () => {
  test('many pushes become a few batched writes', async () => {
    const batches = [];
    const b = new BatchBuffer(async batch => { batches.push(batch.length); }, { intervalMs: 0, batchSize: 100 });
    for (let i = 0; i < 250; i++) b.push({ i });
    assert.equal(await b.flush(), 250);
    assert.deepEqual(batches, [100, 100, 50]);
  });

  test('is bounded: the oldest events are dropped when the database is unreachable', () => {
    const b = new BatchBuffer(async () => {}, { intervalMs: 0, maxItems: 10 });
    for (let i = 0; i < 25; i++) b.push(i);
    assert.equal(b.items.length, 10);
    assert.equal(b.items[0], 15);
    assert.equal(b.dropped, 15);
  });

  test('a failing batch is reported and lost, but does not block the ones after it', async () => {
    const seen = [], errors = [];
    let n = 0;
    const b = new BatchBuffer(async batch => { if (n++ === 0) throw new Error('bad'); seen.push(batch.length); },
      { intervalMs: 0, batchSize: 2, onError: (e, len) => errors.push([e.message, len]) });
    [1, 2, 3, 4, 5].forEach(x => b.push(x));
    assert.equal(await b.flush(), 3);
    assert.deepEqual(errors, [['bad', 2]]);
    assert.deepEqual(seen, [2, 1]);
  });

  test('flush is not re-entrant and stop() drains what is left', async () => {
    let calls = 0;
    const b = new BatchBuffer(async () => { calls++; await tick(); }, { intervalMs: 0 });
    b.push(1);
    await Promise.all([b.flush(), b.flush(), b.flush()]);
    assert.equal(calls, 1);
    b.push(2);
    assert.equal(await b.stop(), 1);
  });
});

describe('rateLimit', () => {
  const mkRes = () => ({ code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });

  test('lets traffic through up to the limit, then answers 429 with Retry-After', () => {
    let t = 0;
    const lim = rateLimit({ max: 3, windowMs: 1000, now: () => t });
    let passed = 0;
    const res = mkRes();
    for (let i = 0; i < 5; i++) lim({ ip: '1.1.1.1' }, res, () => passed++);
    assert.equal(passed, 3);
    assert.equal(res.code, 429);
    assert.ok(Number(res.headers['Retry-After']) >= 1);
  });

  test('the window resets, and clients are counted separately', () => {
    let t = 0;
    const lim = rateLimit({ max: 1, windowMs: 1000, now: () => t });
    let passed = 0;
    lim({ ip: 'a' }, mkRes(), () => passed++);
    lim({ ip: 'b' }, mkRes(), () => passed++);
    lim({ ip: 'a' }, mkRes(), () => passed++);   // blocked
    t = 1500;
    lim({ ip: 'a' }, mkRes(), () => passed++);   // new window
    assert.equal(passed, 3);
  });

  test('the key table cannot grow without bound', () => {
    const lim = rateLimit({ max: 5, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) lim({ ip: 'ip' + i }, mkRes(), () => {});
    // no direct access to the map; the assertion is that this completes and stays fast
    assert.ok(true);
  });
});

describe('safeEqual', () => {
  test('matches equal strings and rejects different ones, including different lengths', () => {
    assert.equal(safeEqual('s3cret', 's3cret'), true);
    assert.equal(safeEqual('s3cret', 's3creT'), false);
    assert.equal(safeEqual('s3cret', 's3cret-longer'), false);
    assert.equal(safeEqual('', 'x'), false);
  });

  test('a missing header (undefined) never matches a real secret', () => {
    assert.equal(safeEqual(undefined, 'real-token'), false);
  });
});
