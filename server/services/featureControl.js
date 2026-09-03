/**
 * Feature Control service — tier 8 + tier 9.
 *
 * Server-side toggle for the SPURTHI **experimental features** (currently
 * Resource Exchange + Recovery Missions). One global boolean. When admin
 * sets enabled=false, every student-facing experimental route returns
 * 403 with {error: 'feature_disabled'}; the SPA hides the affected UI
 * cleanly; the admin can re-enable from the same Control Center card.
 *
 * Why one toggle covers both features: they share the same product
 * framing (experimental, admin-governed, designed to be turned off
 * during moderation maintenance) and the same admin UX. Per-feature
 * toggles would multiply the surface area without adding control.
 *
 * Admin routes bypass this guard entirely (otherwise the admin could
 * disable and then lose the ability to re-enable).
 *
 * ponytail: function names kept stable across tier 8→9. New aliases
 * (`isExperimentalFeaturesEnabled`, `requireExperimentalFeaturesEnabled`)
 * exist for documentation; the underlying behaviour is the same single
 * boolean.
 */
import ResourceExchangeConfig from '../models/ResourceExchangeConfig.js';

// In-process cache. Reads happen on every student request, so we cache for
// a short window to keep toggle latency in the "feel instant" range.
let cache = { value: null, fetchedAt: 0 };
const CACHE_TTL_MS = 60 * 1000;

export async function isResourceExchangeEnabled() {
  const now = Date.now();
  if (cache.value !== null && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.value.enabled;
  }
  const doc = await ResourceExchangeConfig.findOne().lean();
  if (!doc) {
    // No row in collection yet — default behaviour is enabled.
    cache = { value: { enabled: true, updatedAt: null, updatedBy: '' }, fetchedAt: now };
    return true;
  }
  cache = { value: doc, fetchedAt: now };
  return doc.enabled;
}

export async function getConfig() {
  const now = Date.now();
  if (cache.value !== null && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.value;
  }
  const doc = await ResourceExchangeConfig.findOne().lean();
  if (!doc) {
    cache = { value: { enabled: true, updatedAt: null, updatedBy: '' }, fetchedAt: now };
    return cache.value;
  }
  cache = { value: doc, fetchedAt: now };
  return doc;
}

export function invalidateCache() {
  cache = { value: null, fetchedAt: 0 };
}

// Express middleware for student routes. If disabled, return 403 with the
// canonical error code so the SPA can handle it cleanly.
//
// Note: this is intentionally NOT async-error-aware beyond the try/catch —
// a DB outage here should bubble up as a 500 (the SPA will show a generic
// error) rather than silently pass.
export async function requireResourceExchangeEnabled(req, res, next) {
  try {
    const enabled = await isResourceExchangeEnabled();
    if (!enabled) {
      return res.status(403).json({ error: 'feature_disabled', message: 'Resource Exchange is temporarily unavailable' });
    }
    next();
  } catch (e) {
    next(e);
  }
}

// ponytail: the names `isResourceExchangeEnabled` and
// `requireResourceExchangeEnabled` are kept for backwards compatibility
// with the tier-8 admin/resources routes that already call them.
// Tier-9 adds aliases with the new semantic name so mission routes can
// be wired to a guard whose intent is self-documenting.
export const isExperimentalFeaturesEnabled = isResourceExchangeEnabled;
export const requireExperimentalFeaturesEnabled = requireResourceExchangeEnabled;

// Admin write path: persist the new state + invalidate the cache. Caller
// is responsible for the audit row (kept separate so this service doesn't
// depend on services/audit.js).
export async function setConfig({ enabled, updatedBy }) {
  const previous = await getConfig();
  let doc = await ResourceExchangeConfig.findOne();
  if (!doc) {
    doc = await ResourceExchangeConfig.create({
      enabled, updatedAt: new Date(), updatedBy: updatedBy || ''
    });
  } else {
    doc.enabled = enabled;
    doc.updatedAt = new Date();
    doc.updatedBy = updatedBy || '';
    await doc.save();
  }
  invalidateCache();
  return { previous, current: { enabled, updatedAt: doc.updatedAt, updatedBy: doc.updatedBy } };
}
