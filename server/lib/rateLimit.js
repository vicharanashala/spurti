// Fixed-window, in-memory rate limiter. Keyed by whatever `keyFn` returns (IP by
// default). Memory is bounded: expired windows are swept and the key table is
// capped, so it cannot be used to exhaust memory.
//
// It is deliberately generous and per process. It exists to stop one client from
// hammering an unauthenticated or write endpoint, not to meter normal use — many
// students can share one campus NAT address, so never key a limit that gates
// signed-in students on IP alone.
export function rateLimit({ windowMs = 60_000, max = 60, maxKeys = 50_000, keyFn = req => req.ip, now = () => Date.now() } = {}) {
  const hits = new Map(); // key -> { count, resetAt }
  let lastSweep = now();

  return function limiter(req, res, next) {
    const t = now();
    if (t - lastSweep > windowMs) {
      for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
      lastSweep = t;
    }
    const key = keyFn(req) || 'anon';
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      if (!entry && hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - t) / 1000))));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    next();
  };
}
