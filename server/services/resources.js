/**
 * Resource Exchange — pure-function service layer for the peer-shared learning
 * resource feature. See .spurti-plan/resource-exchange.md for the full design.
 *
 * PURE FUNCTIONS ONLY — no mongoose, no I/O, no fetch. Routes own side effects
 * (the unique indexes on ResourceSave/ResourceRating give us "save is
 * idempotent" without a check-then-write race; routes upsert, then call
 * bumpStatus/deriveUtility here).
 *
 * `service.test.js` exercises these in isolation; the route layer (Tier 2)
 * just wires HTTP to mongoose calls that invoke them.
 */

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 400;
const MAX_TAGS = 5;
const MAX_TAG_LEN = 24;
const WILSON_Z = 1.96;
const SAVE_WEIGHT = 2;
const RATING_WEIGHT = 20;          // tuned so a 100-rater resource at avg 4.7 beats small ones
const EFFECTIVE_MIN_SAVES = 15;
const EFFECTIVE_MIN_RATINGS = 15;

// ── validation ────────────────────────────────────────────────────────────

export const VALID_TYPES = ['link', 'video', 'note', 'code'];
const ALLOWED_CONTEXT_TYPES = ['topic', 'question', 'phase'];
const ALLOWED_PHASES = ['standup', 'vibe', 'spa', 'project'];
// Returns a copy so callers can't mutate the canonical enum.
export function validContextTypes() { return ALLOWED_CONTEXT_TYPES.slice(); }

// Normalise a free-text tag: lowercase, alnum + hyphen, ≤ 24 chars, trimmed.
// Returns '' for anything that normalises to nothing — callers filter empties.
// Numbers and booleans are treated as junk (we want free-text from humans).
export function normaliseTag(raw) {
  if (raw == null) return '';
  if (typeof raw !== 'string') return '';
  const s = raw.trim().toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TAG_LEN);
  return s;
}

// Normalise an array of tags: dedupe (case-insensitive), drop empties, cap at MAX_TAGS.
export function normaliseTags(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const t = normaliseTag(raw);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// Validate the full create-payload. Returns { ok: true } or { ok: false, error }.
// Pure — does no DB lookups; the question/phase ref existence check is the
// route's job (it has mongoose). Service validates shape only.
export function validateCreate(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'body required' };
  const { type, url, title, description, contextType, contextRef, tags } = input;
  if (!VALID_TYPES.includes(type)) return { ok: false, error: `type must be one of ${VALID_TYPES.join(',')}` };
  const cleanTitle = String(title || '').trim();
  if (cleanTitle.length < 1 || cleanTitle.length > MAX_TITLE) return { ok: false, error: `title length must be 1..${MAX_TITLE}` };
  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length > MAX_DESCRIPTION) return { ok: false, error: `description length must be 0..${MAX_DESCRIPTION}` };
  if (type === 'link' || type === 'video') {
    try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) throw new Error(); }
    catch { return { ok: false, error: 'url must be a valid http(s) URL' }; }
  } else if (url) {
    return { ok: false, error: `url must be empty for type=${type}` };
  }
  if (!ALLOWED_CONTEXT_TYPES.includes(contextType)) return { ok: false, error: `contextType must be one of ${ALLOWED_CONTEXT_TYPES.join(',')}` };
  const ref = String(contextRef || '').trim();
  if (!ref) return { ok: false, error: 'contextRef required' };
  if (contextType === 'phase' && !ALLOWED_PHASES.includes(ref)) return { ok: false, error: `phase must be one of ${ALLOWED_PHASES.join(',')}` };
  if (contextType === 'question' && !/^[a-f0-9]{24}$/.test(ref)) return { ok: false, error: 'question contextRef must be a 24-char hex ObjectId' };
  if (contextType === 'topic' && !/^[a-z0-9][a-z0-9-]{0,23}$/.test(ref)) return { ok: false, error: 'topic contextRef must match /^[a-z0-9][a-z0-9-]{0,23}$/' };
  return {
    ok: true,
    value: {
      type,
      url: (type === 'link' || type === 'video') ? url.trim() : '',
      title: cleanTitle,
      description: cleanDesc,
      contextType,
      contextRef: ref,
      tags: normaliseTags(tags)
    }
  };
}

export function validateStars(n) {
  const x = Number(n);
  if (!Number.isInteger(x) || x < 1 || x > 5) return { ok: false, error: 'stars must be integer 1..5' };
  return { ok: true, value: x };
}

// ── scoring ───────────────────────────────────────────────────────────────

// Wilson 95% lower-bound for a binomial proportion. Same trick Reddit/Imgur use
// to keep small-N resources from floating to the top.
//   pos = ratingSum
//   n   = ratingCount
// Returns a number in [0, 1]. Multiply by 5 to get a 0..5 rating estimate.
export function wilsonLower(pos, n, z = WILSON_Z) {
  if (!n || n <= 0) return 0;
  const p = Math.max(0, Math.min(1, pos / n));
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return Math.max(0, centre - half);
}

// ponytail: saveCount*2 dominates until ratingCount is meaningful (≥5).
// Below that we ignore rating — small N can't be trusted, see plan §5.
export function deriveUtility({ saveCount, ratingCount, ratingSum }) {
  const s = Number(saveCount) || 0;
  const r = Number(ratingCount) || 0;
  const rs = Number(ratingSum) || 0;
  if (r < 5) return s * SAVE_WEIGHT;
  const avg = wilsonLower(rs, r) * 5;             // 0..5
  return s * SAVE_WEIGHT + r * avg * RATING_WEIGHT;
}

// ponytail: until v2 has a real impact signal (SP-delta on savers vs control),
// "effective" is gated by counts alone — counted-rather-than-measured.
export function deriveStatus({ ratingCount, saveCount, statusOverride }) {
  if (statusOverride === 'effective' || statusOverride === 'verified') return statusOverride;
  const r = Number(ratingCount) || 0;
  const s = Number(saveCount) || 0;
  if (r >= EFFECTIVE_MIN_RATINGS && s >= EFFECTIVE_MIN_SAVES) return 'verified'; // v2: change to 'effective' once effect > 0
  if (r >= 5 && s >= 5) return 'verified';
  return 'new';
}

// Bump a resource after a save/rate mutation. Pure — caller persists the doc.
// statusOverride (admin pin) takes precedence.
export function bumpResource(res) {
  if (!res) return res;
  const utility = deriveUtility(res);
  const status = deriveStatus(res);
  return { ...res, utility, status };
}

// ── listing / queries ─────────────────────────────────────────────────────

// Pure filter for "soft-deleted resources": callers chain .find({ deletedAt: null }).
export function notDeleted() { return { deletedAt: null }; }

// List options builder. Pure. Routes pass the result straight to mongoose.
export function buildListQuery({ q, contextType, sort = 'recent', limit = 50, cohort }) {
  const filter = { deletedAt: null };
  if (cohort) filter.cohort = cohort;
  if (contextType) filter.contextType = contextType;
  if (q) {
    const norm = normaliseTag(q);
    if (norm) filter.tags = norm;
  }
  const sortKey = sort === 'utility' ? 'utility'
                : sort === 'saves'    ? 'saveCount'
                /* recent */          : 'createdAt';
  const sort_ = { [sortKey]: -1, createdAt: -1 };
  const requested = Number(limit);
  const safeLimit = Number.isFinite(requested) ? requested : 50;
  return { filter, sort: sort_, limit: Math.min(200, Math.max(1, safeLimit)) };
}

// For "/mine" — restrict to a creator's email.
export function buildMineQuery(email) {
  return { filter: { 'createdBy.email': String(email).toLowerCase(), deletedAt: null }, sort: { createdAt: -1 }, limit: 200 };
}

// For Tier 4 "this question / this phase / this tag" contexts. Same shape as
// buildListQuery but specifically matches on BOTH contextType and contextRef,
// scoped to the caller's cohort. Sharing the cohort filter stops a standup-
// phase resource from a neighbouring cohort showing up.
export function buildContextQuery({ contextType, contextRef, cohort, limit = 12 }) {
  const filter = { contextType, contextRef, deletedAt: null };
  // Omit cohort from the filter when caller didn't supply one — otherwise the
  // null fallback would silently match docs whose cohort field is unset.
  if (cohort) filter.cohort = cohort;
  return {
    filter,
    sort: { utility: -1, createdAt: -1 },
    limit: Math.min(50, Math.max(1, Number(limit) || 12))
  };
}

// Impact summary for a creator. Input is the full list of their Resources.
export function summariseImpact(resources) {
  let totalSaves = 0, totalRaters = 0, utility = 0;
  const byStatus = { new: 0, verified: 0, effective: 0 };
  for (const r of resources) {
    totalSaves += Number(r.saveCount || 0);
    totalRaters += Number(r.ratingCount || 0);
    utility += Number(r.utility || 0);
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  }
  return {
    resources: resources.length,
    totalSaves,
    totalRaters,
    utility,
    byStatus
  };
}

// ── moderation ────────────────────────────────────────────────────────────

// Resource Exchange ---- contextLabel ------------------------------------------
// Resolve a stored contextRef into a single human-readable string for the SPA.
// Phase refs (e.g. "standup") become "Standups"; topic refs stay as the tag
// itself ("backprop"); poll-question refs become the PollRecord's question
// text up to a length cap. If the poll record was deleted, falls back to
// "Poll" rather than showing a raw id to students.
// Pure data → string; callers that need poll lookups pass a fetcher.
const PHASE_LABELS = { standup: 'Standups', vibe: 'ViBe Goals', spa: 'SPA', project: 'Project' };

export async function buildContextLabel(resource, fetchPollQuestion) {
  const t = resource.contextType;
  const ref = String(resource.contextRef || '');
  if (!ref) return '';
  if (t === 'topic') return `#${ref}`;
  if (t === 'phase') return PHASE_LABELS[ref] || ref;
  if (t === 'question') {
    try {
      const q = await fetchPollQuestion(ref);
      if (!q) return 'Poll';
      const trimmed = String(q).replace(/\s+/g, ' ').trim();
      return trimmed.length > 60 ? trimmed.slice(0, 57) + '…' : trimmed;
    } catch {
      return 'Poll';
    }
  }
  return ref;
}

// Helper for the routes: build the label and shallow-clone the resource with
// the new field added. Used by GET list, GET by id, POST list-with-create.
// Keep this in the service so the SPA never sees raw ids.
export async function withContextLabel(resource, fetchPollQuestion) {
  if (!resource) return resource;
  const label = await buildContextLabel(resource, fetchPollQuestion);
  return { ...resource, contextLabel: label };
}

// Decide whether a new report should auto-hide the resource.
// ponytail: threshold = 2 distinct reporters. Increase when abuse shows up; this is
// a knob, not a spec — keep it in code so it's grep-able when the day comes.
export const AUTO_HIDE_REPORTS = 2;

// Treat a creator-deleted resource.
export function markDeleted(res, by) {
  return { ...res, deletedAt: new Date(), deletedBy: String(by || '').toLowerCase() };
}

// Restore a soft-deleted resource. Pure primitive: clears deletion state and
// re-derives utility + status from current counts, so callers can't ship a
// stale status by forgetting to call bumpResource after. Returns null on null.
export function markRestored(res) {
  if (!res) return res;
  const { deletedAt, deletedBy, ...rest } = res;
  const { utility, status } = bumpRestoredFields(rest);
  return { ...rest, utility, status };
}

// Internal: compute utility + status the same way bumpResource does, but on a
// resource whose deleted-state fields have already been stripped. Kept as a
// separate function so markRestored's contract (no reset of unrelated fields)
// stays obvious at the call site.
function bumpRestoredFields(res) {
  const out = bumpResource(res);
  return { utility: out.utility, status: out.status };
}

// ── Tier 10 — structured categories + file types + feed sort + escapeRegex ──
//
// PR #168 ships a closed enum of categories + file types. We mirror the
// shape (admin-curated enum) but the values are open-string by default
// to keep the existing tag-based workflow working. The validateCreate
// path stays unchanged.
export const VALID_CATEGORIES = [
  '', 'Programming', 'DSA', 'Java', 'Python', 'React', 'Node',
  'Machine Learning', 'Operating System', 'DBMS', 'Computer Networks',
  'Mathematics', 'Interview Preparation', 'Placement', 'Others'
];
export const VALID_FILE_TYPES = [
  '', 'PDF', 'PPT', 'Notes', 'Google Drive', 'YouTube', 'GitHub',
  'Article', 'Documentation', 'ZIP', 'Others'
];

// Escape user input before it becomes a regex. PR #168 ships this; we
// adopt it as a defensive measure even though our current search uses
// Mongo's $regex with bounded inputs. Cheap, prevents future bugs.
export function escapeRegex(s) {
  return String(s == null ? '' : s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Tier 10 feed sort. Same shape as PR #168. Sort is the only knob; the
// route layer picks based on ?feed= query param.
export const FEED_SORTS = {
  latest:    { createdAt: -1 },
  trending:  { likeCount: -1, createdAt: -1 },
  downloads: { downloadCount: -1, createdAt: -1 }
};
// Default cap raised from 50 → 50 unchanged. New: pagination params.
export const RESOURCE_PAGE_SIZE = 50;
export const RESOURCE_PAGE_MAX  = 100;

// Pure: parse + clamp page/limit query params. Returns a safe
// (skip, limit, page) tuple. No DB access.
export function parsePagination({ page, limit } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(RESOURCE_PAGE_MAX, Math.max(1, parseInt(limit, 10) || RESOURCE_PAGE_SIZE));
  return { page: p, limit: l, skip: (p - 1) * l };
}
