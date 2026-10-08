// Small in-process cache for values that are expensive to compute and identical
// for everyone (cohort cutoffs, leaderboard tops, admin analytics).
//
//  - Concurrent misses for one key share a single load ("single flight"), so a
//    burst of requests after expiry costs one database round trip, not one each.
//  - If a reload fails, the last good value keeps being served (up to staleMs),
//    so a database blip degrades to slightly old numbers rather than an error.
//  - The number of keys is capped, oldest first, so a key derived from user input
//    can never grow memory without bound.
export class TtlCache {
  constructor({ maxKeys = 500, staleMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.maxKeys = maxKeys;
    this.staleMs = staleMs;
    this.now = now;
    this.entries = new Map();   // key -> { value, at, ttl }
    this.inflight = new Map();  // key -> Promise
  }

  async getOrLoad(key, ttlMs, loader) {
    const hit = this.entries.get(key);
    const t = this.now();
    if (hit && t - hit.at < ttlMs) return hit.value;

    if (this.inflight.has(key)) return this.inflight.get(key);

    const p = (async () => {
      try {
        const value = await loader();
        this.set(key, value);
        return value;
      } catch (err) {
        const old = this.entries.get(key);
        if (old && this.now() - old.at < this.staleMs) return old.value;
        throw err;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, at: this.now() });
    while (this.entries.size > this.maxKeys) this.entries.delete(this.entries.keys().next().value);
  }

  clear() { this.entries.clear(); }
}
