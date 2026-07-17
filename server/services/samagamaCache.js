/**
 * server/services/samagamaCache.js
 *
 * In-memory cache for Samagama /api/auth/me lookups.
 *
 * Security model (verified per PR #31 security hardening checklist):
 *  1. Cache KEY is the exact chatengine_token cookie value (per-identity).
 *     No shared/global key — one user's cached entry cannot leak to another
 *     because the lookup key is the cookie itself, which the holder proves
 *     possession of.
 *  2. Cache VALUE is a MINIMAL projection — only { email, name } from the
 *     Samagama response. The full response body (which may contain internal
 *     flags, hashed tokens, etc.) is never stored. Whatever Samagama returns
 *     that we don't need for Spurti is dropped at the boundary.
 *  3. TTL is 60s — long enough to collapse the ~43k req/min auth poll
 *     burst during 9:05 IST peak (each student polls /survey/status every
 *     5s = ~12 req/min/student). Short enough that an account deactivation
 *     propagates within 1 minute.
 *  4. Explicit invalidation — invalidateSamagamaCache(token) is exported so
 *     any future logout endpoint, password-change flow, or admin-deactivation
 *     handler can immediately invalidate without waiting for TTL.
 *  5. Negative caching — bad-token lookups cache `null` for 60s so a flood
 *     of bad requests doesn't hammer Samagama (separate counter `negativeHits`
 *     makes a Samagama outage visible).
 *  6. Rate limit — `SAMAGAMA_RATE_PER_TOKEN_PER_MIN` caps how often any
 *     single token can trigger a fresh upstream call. This is a defense-
 *     in-depth layer on top of Samagama's own rate limit (since we cache
 *     successful results, the upstream is mainly hit on cache misses).
 *
 * Pure-ish: no I/O, but does use Date.now(). Trivially unit-testable.
 */

const MS_PER_MINUTE = 60_000;

/** TTL for cached auth results. Tuned for /survey/status polling (5s) × ~1791 students. */
export const SAMAGAMA_CACHE_TTL_MS = 60_000;

/** Per-token rate limit on upstream Samagama calls (defense in depth). */
export const SAMAGAMA_RATE_PER_TOKEN_PER_MIN = 30;

/**
 * Minimal cached payload. ONLY these two fields are ever stored.
 * Whatever else Samagama returns (role flags, hashed tokens, internal IDs,
 * session expiry, etc.) is discarded at the boundary.
 */
export function projectAuthPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw.user && typeof raw.user === 'object' ? raw.user : raw;
  const email = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
  const name  = typeof u.name  === 'string' ? u.name : '';
  if (!email) return null;
  return { email, name };
}

/** Internal cache + stats (module-scoped). The cache is per-process; in a
 *  multi-process deployment each worker has its own copy. That's fine for
 *  an auth cache — the worst case is one extra upstream call per worker
 *  per TTL window. */
const _cache = new Map();
const _rate = new Map(); // token -> [timestamps in last 60s]
const _stats = {
  hits: 0, misses: 0, negativeHits: 0, sets: 0, evictions: 0, rateLimited: 0, lastResetAt: Date.now()
};

/** Read a cached entry. Returns:
 *   - `undefined` if no entry (miss)
 *   - `null` if a cached "not found" entry exists (negative cache hit)
 *   - the projected payload `{ email, name }` on positive cache hit
 * Also updates stats. */
export function cacheGet(token, now = Date.now()) {
  const entry = _cache.get(token);
  if (!entry) {
    _stats.misses++;
    return undefined;
  }
  if (now - entry.at > SAMAGAMA_CACHE_TTL_MS) {
    _cache.delete(token);
    _stats.evictions++;
    _stats.misses++;
    return undefined;
  }
  _stats.hits++;
  if (entry.data === null) _stats.negativeHits++;
  return entry.data;
}

/** Write an entry. `data` may be the projected payload or `null` (negative). */
export function cacheSet(token, data, now = Date.now()) {
  _cache.set(token, { at: now, data });
  _stats.sets++;
}

/** Explicitly invalidate a token's cached entry. Use this from:
 *   - logout handlers
 *   - password-change flows (next time they log in, their session is invalidated)
 *   - admin-deactivation endpoints (an inactive student must not stay cached)
 * Returns true if an entry was removed, false if there was nothing to remove. */
export function invalidateSamagamaCache(token) {
  const had = _cache.delete(token);
  _rate.delete(token);
  return had;
}

/** Returns true if the token is within the per-token upstream-call rate limit.
 *  Counts upstream calls (cache misses or negative-cache writes) in the
 *  last 60s. Older than 60s are GC'd. */
export function isRateLimited(token, now = Date.now()) {
  const cutoff = now - MS_PER_MINUTE;
  let arr = _rate.get(token);
  if (!arr) { arr = []; _rate.set(token, arr); }
  // Drop old entries.
  while (arr.length > 0 && arr[0] < cutoff) arr.shift();
  if (arr.length >= SAMAGAMA_RATE_PER_TOKEN_PER_MIN) {
    _stats.rateLimited++;
    return true;
  }
  arr.push(now);
  return false;
}

/** Snapshot of stats for /api/admin/cache-stats. */
export function cacheStats() {
  const now = Date.now();
  let oldestAgeMs = 0;
  let newestAgeMs = 0;
  for (const [, entry] of _cache) {
    const age = now - entry.at;
    if (age > oldestAgeMs) oldestAgeMs = age;
    if (newestAgeMs === 0 || age < newestAgeMs) newestAgeMs = age;
  }
  return {
    hits: _stats.hits,
    misses: _stats.misses,
    negativeHits: _stats.negativeHits,
    sets: _stats.sets,
    evictions: _stats.evictions,
    rateLimited: _stats.rateLimited,
    lastResetAt: _stats.lastResetAt,
    entries: _cache.size,
    ttlMs: SAMAGAMA_CACHE_TTL_MS,
    oldestAgeMs,
    newestAgeMs,
    uptimeMs: now - _stats.lastResetAt
  };
}

/** Reset all stats (and timestamps) to zero. Used by `?reset=1`. */
export function cacheStatsReset(now = Date.now()) {
  _stats.hits = 0;
  _stats.misses = 0;
  _stats.negativeHits = 0;
  _stats.sets = 0;
  _stats.evictions = 0;
  _stats.rateLimited = 0;
  _stats.lastResetAt = now;
  // NOTE: does NOT clear the cache or rate-limit buckets — those are
  // operational state. Only the counters reset.
}

/** Test-only: fully wipe the cache + stats + rate buckets. */
export function _cacheWipeForTest() {
  _cache.clear();
  _rate.clear();
  cacheStatsReset();
}
