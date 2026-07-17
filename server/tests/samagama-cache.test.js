/**
 * server/tests/samagama-cache.test.js
 *
 * Comprehensive tests for the Samagama auth cache + rate limiter service.
 * Covers the security model described in services/samagamaCache.js.
 *
 * Run: node --test server/tests/samagama-cache.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cacheGet,
  cacheSet,
  invalidateSamagamaCache,
  isRateLimited,
  cacheStats,
  cacheStatsReset,
  projectAuthPayload,
  SAMAGAMA_CACHE_TTL_MS,
  SAMAGAMA_RATE_PER_TOKEN_PER_MIN,
  _cacheWipeForTest
} from '../services/samagamaCache.js';

const TOK = 'chatengine_token_abc123';
const NOW = 1_700_000_000_000; // fixed clock for deterministic tests

test.beforeEach(() => { _cacheWipeForTest(); });

// ── projectAuthPayload (the data minimization boundary) ────────────────

test('projectAuthPayload: returns null for null input', () => {
  assert.equal(projectAuthPayload(null), null);
  assert.equal(projectAuthPayload(undefined), null);
});

test('projectAuthPayload: returns null for non-object input', () => {
  assert.equal(projectAuthPayload('hello'), null);
  assert.equal(projectAuthPayload(42), null);
});

test('projectAuthPayload: returns null if no email present', () => {
  assert.equal(projectAuthPayload({ user: { name: 'Alice' } }), null);
  assert.equal(projectAuthPayload({ name: 'Alice' }), null);
});

test('projectAuthPayload: extracts email from { user: { email, ... } }', () => {
  const r = projectAuthPayload({
    user: { email: '  Alice@Example.COM ', name: 'Alice', role: 'admin', internal_id: 999 }
  });
  assert.equal(r.email, 'alice@example.com');
  assert.equal(r.name, 'Alice');
  // Internal fields stripped — they never reach the cache.
  assert.equal(r.role, undefined);
  assert.equal(r.internal_id, undefined);
});

test('projectAuthPayload: extracts email from top-level { email, ... }', () => {
  const r = projectAuthPayload({ email: 'bob@x.com', password_hash: 'SECRET' });
  assert.equal(r.email, 'bob@x.com');
  assert.equal(r.password_hash, undefined);
});

test('projectAuthPayload: returns null if email is not a string', () => {
  assert.equal(projectAuthPayload({ email: 42 }), null);
  assert.equal(projectAuthPayload({ email: null }), null);
});

// ── cacheGet / cacheSet (basic TTL semantics) ──────────────────────────

test('cacheGet: returns undefined for never-seen token', () => {
  assert.equal(cacheGet('unknown', NOW), undefined);
});

test('cacheGet: returns cached payload for fresh entry', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  assert.deepEqual(cacheGet(TOK, NOW), { email: 'a@x.com', name: 'A' });
});

test('cacheGet: returns null for negative cache entry', () => {
  cacheSet(TOK, null, NOW);
  assert.equal(cacheGet(TOK, NOW), null);
});

test('cacheGet: returns undefined after TTL expires', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  // 1ms past TTL
  assert.equal(cacheGet(TOK, NOW + SAMAGAMA_CACHE_TTL_MS + 1), undefined);
});

test('cacheGet: still valid at exactly TTL', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  assert.deepEqual(cacheGet(TOK, NOW + SAMAGAMA_CACHE_TTL_MS), { email: 'a@x.com', name: 'A' });
});

// ── invalidateSamagamaCache (explicit invalidation hook) ───────────────

test('invalidateSamagamaCache: removes existing entry', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  assert.equal(invalidateSamagamaCache(TOK), true);
  assert.equal(cacheGet(TOK, NOW), undefined);
});

test('invalidateSamagamaCache: returns false when nothing to remove', () => {
  assert.equal(invalidateSamagamaCache('not-set'), false);
});

test('invalidateSamagamaCache: also clears per-token rate bucket', () => {
  // Burn the rate budget
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    assert.equal(isRateLimited(TOK, NOW + i), false);
  }
  // Next call should be rate-limited
  assert.equal(isRateLimited(TOK, NOW + SAMAGAMA_RATE_PER_TOKEN_PER_MIN + 1), true);
  // Invalidate clears the bucket
  invalidateSamagamaCache(TOK);
  // Should be un-rate-limited again
  assert.equal(isRateLimited(TOK, NOW + SAMAGAMA_RATE_PER_TOKEN_PER_MIN + 2), false);
});

// ── isRateLimited (per-token upstream-call cap) ──────────────────────

test('isRateLimited: allows first call', () => {
  assert.equal(isRateLimited(TOK, NOW), false);
});

test('isRateLimited: allows up to N calls per 60s window', () => {
  // Already 1 call from previous test? No — beforeEach wiped.
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    assert.equal(isRateLimited(TOK, NOW + i), false);
  }
});

test('isRateLimited: blocks the (N+1)th call within the window', () => {
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    isRateLimited(TOK, NOW + i);
  }
  assert.equal(isRateLimited(TOK, NOW + SAMAGAMA_RATE_PER_TOKEN_PER_MIN + 100), true);
});

test('isRateLimited: resets after 60s sliding window', () => {
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    isRateLimited(TOK, NOW + i);
  }
  // 60s + 1ms later, the oldest entry has fallen out of the window.
  assert.equal(isRateLimited(TOK, NOW + 60_000 + 1), false);
});

test('isRateLimited: separate tokens have independent budgets', () => {
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    isRateLimited(TOK, NOW + i);
  }
  // TOK is at the limit; a DIFFERENT token still has budget.
  assert.equal(isRateLimited('other_token', NOW), false);
});

// ── cacheStats / cacheStatsReset ───────────────────────────────────────

test('cacheStats: snapshot has all expected fields', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  cacheGet(TOK, NOW);
  cacheGet(TOK, NOW);
  cacheGet('miss_token', NOW);
  const s = cacheStats();
  assert.equal(s.hits, 2);
  assert.equal(s.misses, 1);
  assert.equal(s.entries, 1);
  assert.equal(s.ttlMs, SAMAGAMA_CACHE_TTL_MS);
  assert.ok(s.uptimeMs >= 0);
});

test('cacheStats: negativeHits only counted for null entries', () => {
  cacheSet(TOK, null, NOW);
  cacheGet(TOK, NOW);
  const otherTok = 'other';
  cacheSet(otherTok, { email: 'x@x.com' }, NOW);
  cacheGet(otherTok, NOW);
  const s = cacheStats();
  assert.equal(s.negativeHits, 1);
  assert.equal(s.hits, 2);
});

test('cacheStatsReset: zeros counters but keeps cache contents', () => {
  cacheSet(TOK, { email: 'a@x.com', name: 'A' }, NOW);
  cacheGet(TOK, NOW);
  cacheStatsReset(NOW);
  const s = cacheStats();
  assert.equal(s.hits, 0);
  assert.equal(s.misses, 0);
  assert.equal(s.entries, 1); // still there
  assert.deepEqual(cacheGet(TOK, NOW), { email: 'a@x.com', name: 'A' });
});

test('cacheStats: rateLimited counter increments when isRateLimited blocks', () => {
  for (let i = 0; i < SAMAGAMA_RATE_PER_TOKEN_PER_MIN; i++) {
    isRateLimited(TOK, NOW + i);
  }
  isRateLimited(TOK, NOW + SAMAGAMA_RATE_PER_TOKEN_PER_MIN + 1); // blocked
  const s = cacheStats();
  assert.equal(s.rateLimited, 1);
});

// ── Constants sanity ──────────────────────────────────────────────────

test('TTL is 60 seconds', () => {
  assert.equal(SAMAGAMA_CACHE_TTL_MS, 60_000);
});

test('Rate limit is 30 per minute per token', () => {
  assert.equal(SAMAGAMA_RATE_PER_TOKEN_PER_MIN, 30);
});
