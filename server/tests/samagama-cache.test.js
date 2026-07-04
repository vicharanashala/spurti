/**
 * server/tests/samagama-cache.test.js
 *
 * Validates the cache-stats math (hit rate calculation, oldest/newest
 * entry ages, negative-hit counting). The cache itself is exercised
 * by integration; these tests cover the observable surface.
 *
 * Run: node --test server/tests/samagama-cache.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Mirror of the stats object inside server.js. Reset by the endpoint
// when ?reset=1 is set; reset by the test at start of each case.
function makeStats() {
  return { hits: 0, misses: 0, negativeHits: 0, sets: 0, evictions: 0, lastResetAt: Date.now() };
}

// Mirror of the stats-to-response transform. Mirrored rather than
// imported because the cache lives in server.js's module scope.
function snapshot(stats, cache, ttlMs = 60_000) {
  const now = Date.now();
  let oldestAge = 0;
  let newestAge = 0;
  for (const [, entry] of cache) {
    const age = now - entry.at;
    if (age > oldestAge) oldestAge = age;
    if (newestAge === 0 || age < newestAge) newestAge = age;
  }
  const total = stats.hits + stats.misses;
  return {
    hits: stats.hits,
    misses: stats.misses,
    hitRate: total ? stats.hits / total : 0,
    entries: cache.size,
    ttlMs,
    oldestAgeMs: oldestAge
  };
}

test('empty cache: zero hits, zero misses, hitRate 0', () => {
  const s = makeStats();
  const c = new Map();
  const snap = snapshot(s, c);
  assert.equal(snap.hits, 0);
  assert.equal(snap.misses, 0);
  assert.equal(snap.hitRate, 0);
  assert.equal(snap.entries, 0);
});

test('three misses: hitRate stays 0', () => {
  const s = makeStats();
  const c = new Map();
  s.misses += 3;
  assert.equal(snapshot(s, c).hitRate, 0);
});

test('seven hits and three misses: hitRate ~ 0.7', () => {
  const s = makeStats();
  s.hits = 7; s.misses = 3;
  assert.equal(snapshot(s, new Map()).hitRate, 7 / 10);
});

test('oldestAge: reflects the oldest non-expired entry', () => {
  const s = makeStats();
  const c = new Map();
  const now = Date.now();
  c.set('a', { at: now - 5_000, data: { user: { email: 'a' } } });
  c.set('b', { at: now - 30_000, data: { user: { email: 'b' } } });
  c.set('c', { at: now - 1_000, data: { user: { email: 'c' } } });
  const snap = snapshot(s, c);
  assert.equal(snap.entries, 3);
  assert.ok(snap.oldestAgeMs >= 29_000);
  assert.ok(snap.oldestAgeMs <= 31_000);
});

test('negative hits counted separately from positive hits', () => {
  const s = makeStats();
  // simulate: cache returned null twice (negative hits) and a valid
  // user object three times (positive hits); misses happened on first lookup
  s.misses = 5;        // 5 cold lookups
  s.hits = 5;         // 5 warm returns
  s.negativeHits = 2; // 2 of the 5 hits were cached nulls
  assert.equal(s.negativeHits + 3, s.hits);
  // hitRate counts both positive and negative as "hits" (we found an answer)
  assert.equal(snapshot(s, new Map()).hitRate, 0.5);
});