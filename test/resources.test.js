import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliseTag, normaliseTags, validateCreate, validateStars,
  wilsonLower, deriveUtility, deriveStatus, bumpResource,
  buildListQuery, buildMineQuery, summariseImpact,
  markDeleted, markRestored, AUTO_HIDE_REPORTS, validContextTypes
} from '../server/services/resources.js';

// ── normaliseTag ──────────────────────────────────────────────────────────
describe('normaliseTag', () => {
  test('lowercases, strips non-alnum/hyphen, re-hyphenates', () => {
    assert.equal(normaliseTag('Backprop!'), 'backprop');
    assert.equal(normaliseTag('Decision Tree'), 'decision-tree');
    assert.equal(normaliseTag('  HELLO-world  '), 'hello-world');
    assert.equal(normaliseTag('a__b--c'), 'a-b-c');
    assert.equal(normaliseTag('---foo---bar---'), 'foo-bar');
  });
  test('caps at 24 chars', () => {
    const long = 'a'.repeat(40);
    assert.equal(normaliseTag(long).length, 24);
  });
  test('returns empty for junk / null', () => {
    assert.equal(normaliseTag(null), '');
    assert.equal(normaliseTag(undefined), '');
    assert.equal(normaliseTag(''), '');
    assert.equal(normaliseTag('!!!'), '');
    assert.equal(normaliseTag(42), '');
  });
});

// ── normaliseTags ─────────────────────────────────────────────────────────
describe('normaliseTags', () => {
  test('dedupes and caps at 5', () => {
    const tags = normaliseTags(['Backprop', 'BACKPROP', 'decision-tree', 'decision tree', 'e', 'f', 'g', 'h', 'i']);
    assert.deepEqual(tags, ['backprop', 'decision-tree', 'e', 'f', 'g']);
  });
  test('drops empties', () => {
    assert.deepEqual(normaliseTags(['', null, 'foo', '!!!']), ['foo']);
  });
  test('non-array → empty', () => {
    assert.deepEqual(normaliseTags('not an array'), []);
    assert.deepEqual(normaliseTags(null), []);
  });
});

// ── validateCreate ────────────────────────────────────────────────────────
describe('validateCreate', () => {
  const ok = {
    type: 'link',
    url: 'https://example.com/x',
    title: 'Backprop explained',
    description: 'short',
    contextType: 'topic',
    contextRef: 'backprop',
    tags: ['neural-nets']
  };
  test('accepts a valid link', () => {
    const r = validateCreate(ok);
    assert.equal(r.ok, true);
    assert.equal(r.value.title, 'Backprop explained');
    assert.deepEqual(r.value.tags, ['neural-nets']);
  });
  test('rejects bad title length', () => {
    assert.equal(validateCreate({ ...ok, title: '' }).ok, false);
    assert.equal(validateCreate({ ...ok, title: 'a'.repeat(81) }).ok, false);
  });
  test('link without url fails; note with url fails', () => {
    assert.equal(validateCreate({ ...ok, url: '' }).ok, false);
    const noteUrl = validateCreate({ ...ok, type: 'note', url: 'https://x' });
    assert.equal(noteUrl.ok, false);
    assert.match(noteUrl.error, /url must be empty/);
  });
  test('video needs https url only', () => {
    const ok2 = validateCreate({ ...ok, type: 'video' });
    assert.equal(ok2.ok, true);
    assert.equal(validateCreate({ ...ok, type: 'video', url: 'ftp://x' }).ok, false);
  });
  test('contextType must be enum', () => {
    assert.equal(validateCreate({ ...ok, contextType: 'else' }).ok, false);
  });
  test('phase ref must be in allowed phases', () => {
    assert.equal(validateCreate({ ...ok, contextType: 'phase', contextRef: 'standup' }).ok, true);
    assert.equal(validateCreate({ ...ok, contextType: 'phase', contextRef: 'bogus' }).ok, false);
  });
  test('question ref must be 24-char hex', () => {
    assert.equal(validateCreate({ ...ok, contextType: 'question', contextRef: '507f1f77bcf86cd799439011' }).ok, true);
    assert.equal(validateCreate({ ...ok, contextType: 'question', contextRef: 'short' }).ok, false);
  });
  test('topic ref must match slug pattern', () => {
    assert.equal(validateCreate({ ...ok, contextType: 'topic', contextRef: 'backprop' }).ok, true);
    assert.equal(validateCreate({ ...ok, contextType: 'topic', contextRef: 'BIG-CAPS' }).ok, false);
  });
});

// ── validateStars ────────────────────────────────────────────────────────
describe('validateStars', () => {
  test('accepts 1..5 integer', () => {
    for (const n of [1, 2, 3, 4, 5]) assert.equal(validateStars(n).ok, true);
  });
  test('rejects 0, 6, fractions, NaN, null', () => {
    for (const n of [0, 6, 2.5, NaN, null]) assert.equal(validateStars(n).ok, false);
  });
});

// ── wilsonLower ──────────────────────────────────────────────────────────
describe('wilsonLower', () => {
  test('zero when n=0', () => {
    assert.equal(wilsonLower(0, 0), 0);
    assert.equal(wilsonLower(5, 0), 0);
  });
  test('lower bound ≤ raw mean', () => {
    for (const [pos, n] of [[1, 5], [10, 20], [100, 200], [47, 100]]) {
      assert.ok(wilsonLower(pos, n) <= pos / n, `wilson (${pos},${n}) > raw mean`);
    }
  });
  test('penalises tiny N more than big N at the same mean', () => {
    // 1/1 (5.0 raw mean) vs 100/200 (5.0 raw mean → 0.50)
    const tiny = wilsonLower(1, 1);     // ~0.21
    const large = wilsonLower(100, 200); // ~0.42
    assert.ok(large > tiny, `large (${large}) should beat tiny (${tiny})`);
  });
  // Numeric guards. Tolerance ±1e-3 to absorb IEEE-754 rounding without
  // letting a future "simplification" of the formula pass unnoticed.
  test('wilsonLower(1, 1) ≈ 0.2065 (deterministic guard)', () => {
    assert.ok(Math.abs(wilsonLower(1, 1) - 0.2065) < 1e-3,
      `expected ~0.2065, got ${wilsonLower(1, 1)}`);
  });
  test('wilsonLower(100, 200) ≈ 0.4314 (deterministic guard)', () => {
    // 100/200 raw mean = 0.5; Wilson 95% lower-bound pulls that down because
    // a 200-rater sample still has meaningful CI width. Locked in so the
    // formula can't be silently "simplified" later.
    assert.ok(Math.abs(wilsonLower(100, 200) - 0.4314) < 1e-3,
      `expected ~0.4314, got ${wilsonLower(100, 200)}`);
  });
  test('wilsonLower(0, n) = 0 for any n', () => {
    for (const n of [1, 5, 50, 500]) assert.equal(wilsonLower(0, n), 0);
  });
});

// ── deriveUtility (Wilson-aware) ─────────────────────────────────────────
describe('deriveUtility', () => {
  test('falls back to saves-only when ratingCount < 5', () => {
    assert.equal(deriveUtility({ saveCount: 0, ratingCount: 0, ratingSum: 0 }), 0);
    assert.equal(deriveUtility({ saveCount: 3, ratingCount: 4, ratingSum: 20 }), 6);
    assert.equal(deriveUtility({ saveCount: 5, ratingCount: 4, ratingSum: 20 }), 10);
  });
  test('100 ratings averaging 4.8 outranks 2 ratings of 5', () => {
    const big = deriveUtility({ saveCount: 0, ratingCount: 100, ratingSum: 480 });
    const tiny = deriveUtility({ saveCount: 0, ratingCount: 2, ratingSum: 10 });
    assert.ok(big > tiny * 10, `big (${Math.round(big)}) should dominate tiny (${Math.round(tiny)}) — diff was ${Math.round(big / tiny)}×`);
  });
  test('survives junk numbers', () => {
    assert.equal(deriveUtility({}), 0);
    assert.equal(deriveUtility({ saveCount: 'x', ratingCount: null, ratingSum: undefined }), 0);
  });
});

// ── deriveStatus ────────────────────────────────────────────────────────
describe('deriveStatus', () => {
  test("new at creation", () => {
    assert.equal(deriveStatus({ saveCount: 0, ratingCount: 0 }), 'new');
  });
  test("'verified' at 5+ saves+raters, never higher in v1", () => {
    // 15/15 sits at 'verified' in v1 — 'effective' would need effect > 0
    assert.equal(deriveStatus({ saveCount: 15, ratingCount: 15 }), 'verified');
    assert.equal(deriveStatus({ saveCount: 100, ratingCount: 100 }), 'verified');
  });
  test("below threshold stays 'new'", () => {
    assert.equal(deriveStatus({ saveCount: 4, ratingCount: 5 }), 'new');
    assert.equal(deriveStatus({ saveCount: 5, ratingCount: 4 }), 'new');
  });
  test("statusOverride (admin pin) wins", () => {
    assert.equal(deriveStatus({ saveCount: 0, ratingCount: 0, statusOverride: 'effective' }), 'effective');
    assert.equal(deriveStatus({ saveCount: 5, ratingCount: 5, statusOverride: 'verified' }), 'verified');
  });
});

// ── bumpResource ─────────────────────────────────────────────────────────
describe('bumpResource', () => {
  test('attaches derived utility + status to the resource', () => {
    const r = bumpResource({ saveCount: 0, ratingCount: 0 });
    assert.equal(r.utility, 0);
    assert.equal(r.status, 'new');
  });
  test("preserves fields it doesn't touch", () => {
    const r = bumpResource({ saveCount: 6, ratingCount: 6, _id: 'x', title: 'hi' });
    assert.equal(r._id, 'x');
    assert.equal(r.title, 'hi');
    assert.ok(r.utility > 0);
    assert.equal(r.status, 'verified');
  });
  test('null in / out unchanged', () => {
    assert.equal(bumpResource(null), null);
  });
});

// ── buildListQuery ──────────────────────────────────────────────────────
describe('buildListQuery', () => {
  test('default sort is recent (createdAt desc)', () => {
    const q = buildListQuery({});
    assert.deepEqual(q.sort, { createdAt: -1 });
    assert.ok('deletedAt' in q.filter && q.filter.deletedAt === null);
  });
  test('utility sort puts utility first, breaks ties by recency', () => {
    const q = buildListQuery({ sort: 'utility' });
    assert.deepEqual(q.sort, { utility: -1, createdAt: -1 });
  });
  test('saves sort', () => {
    assert.deepEqual(buildListQuery({ sort: 'saves' }).sort, { saveCount: -1, createdAt: -1 });
  });
  test('q is normalised and applied to tags', () => {
    const q = buildListQuery({ q: 'Backprop!' });
    assert.equal(q.filter.tags, 'backprop');
  });
  test('limit clamped to [1, 200]', () => {
    assert.equal(buildListQuery({ limit: 10000 }).limit, 200);
    assert.equal(buildListQuery({ limit: 0 }).limit, 1);
    assert.equal(buildListQuery({ limit: -5 }).limit, 1);
    assert.equal(buildListQuery({ limit: 'abc' }).limit, 50);
  });
  test('cohort filter applied', () => {
    const q = buildListQuery({ cohort: '2026-06-01_to_2026-06-15' });
    assert.equal(q.filter.cohort, '2026-06-01_to_2026-06-15');
  });
});

// ── buildMineQuery ──────────────────────────────────────────────────────
describe('buildMineQuery', () => {
  test('lowercases email and scopes to creator', () => {
    const q = buildMineQuery('Harshitha@Example.COM');
    assert.equal(q.filter['createdBy.email'], 'harshitha@example.com');
    assert.ok(q.filter.deletedAt === null);
    assert.deepEqual(q.sort, { createdAt: -1 });
  });
});

// ── summariseImpact ────────────────────────────────────────────────────
describe('summariseImpact', () => {
  test('aggregates saves, raters, utility, by-status count', () => {
    const out = summariseImpact([
      { saveCount: 5, ratingCount: 4, utility: 10, status: 'new' },
      { saveCount: 10, ratingCount: 8, utility: 800, status: 'verified' },
      { saveCount: 30, ratingCount: 28, utility: 5000, status: 'effective' }
    ]);
    assert.equal(out.resources, 3);
    assert.equal(out.totalSaves, 45);
    assert.equal(out.totalRaters, 40);
    assert.equal(out.utility, 5810);
    assert.deepEqual(out.byStatus, { new: 1, verified: 1, effective: 1 });
  });
  test('empty list → zeros', () => {
    const out = summariseImpact([]);
    assert.equal(out.resources, 0);
    assert.equal(out.totalSaves, 0);
    assert.deepEqual(out.byStatus, { new: 0, verified: 0, effective: 0 });
  });
});

// ── markDeleted / markRestored ─────────────────────────────────────────
describe('markDeleted', () => {
  test('stamps deletedAt + deletedBy (lowercased)', () => {
    const r = markDeleted({ _id: 'x' }, 'Harshitha@x.com');
    assert.ok(r.deletedAt instanceof Date);
    assert.equal(r.deletedBy, 'harshitha@x.com');
  });
});

describe('markRestored', () => {
  test('strips deletedAt + deletedBy, keeps everything else', () => {
    const r = markRestored({ _id: 'x', title: 'hi', deletedAt: new Date(), deletedBy: 'me@x' });
    assert.equal(r.deletedAt, undefined);
    assert.equal(r.deletedBy, undefined);
    assert.equal(r._id, 'x');
    assert.equal(r.title, 'hi');
  });
  test('re-derives utility + status from current counts (no stale status)', () => {
    // deleted-resource had saveCount=0/ratingCount=0 when soft-deleted; even
    // though it's been deleted, restore recomputes fresh.
    const r = markRestored({ saveCount: 6, ratingCount: 6, title: 'hi', deletedAt: new Date() });
    assert.ok(r.utility > 0, 'utility must be freshly derived');
    assert.equal(r.status, 'verified', 'status must reflect current counts, not pre-delete');
  });
  test('null in / out unchanged', () => {
    assert.equal(markRestored(null), null);
  });
});

// ── AUTO_HIDE_REPORTS export sanity ────────────────────────────────────
describe('AUTO_HIDE_REPORTS + validContextTypes', () => {
  test('constant matches plan §10 (≥ 2)', () => {
    assert.ok(AUTO_HIDE_REPORTS >= 2, 'auto-hide threshold too low');
  });
  test('validContextTypes returns the 3 enum values, not the placeholder', () => {
    assert.deepEqual(validContextTypes(), ['topic', 'question', 'phase']);
  });

  // ── Tier 10 — escapeRegex + parsePagination + feed enums ──────────────────
  test('T10: escapeRegex neutralises regex metacharacters', async () => {
    const { escapeRegex, parsePagination, FEED_SORTS, RESOURCE_PAGE_SIZE, RESOURCE_PAGE_MAX,
      VALID_CATEGORIES, VALID_FILE_TYPES } = await import('../server/services/resources.js');
    // Metacharacters that would crash or inject if unescaped
    const dirty = 'a.b*c+d?e^f${g}h(i)j|k[l]m\\n';
    const safe = escapeRegex(dirty);
    // The safe version must be a valid regex that matches the original
    // literally (no metacharacter interpretation)
    const re = new RegExp('^' + safe + '$');
    assert.ok(re.test(dirty));
    // And the unsafe raw metachars (e.g. 'a.b*') do NOT match safe
    // (because 'a.b*' means 'a' + 0+ 'b' which matches 'a' alone)
    const greedy = new RegExp('^a.b*$');
    assert.ok(greedy.test('ab'));  // unsafe version matches shorter strings
    // Sanity: empty / null input → empty string
    assert.equal(escapeRegex(''), '');
    assert.equal(escapeRegex(null), '');
  });

  test('T10: parsePagination clamps + floors + defaults', async () => {
    const { parsePagination, RESOURCE_PAGE_SIZE, RESOURCE_PAGE_MAX } = await import('../server/services/resources.js');
    // defaults
    assert.equal(parsePagination({}).page, 1);
    assert.equal(parsePagination({}).limit, RESOURCE_PAGE_SIZE);
    assert.equal(parsePagination({}).skip, 0);
    // custom values
    assert.equal(parsePagination({ page: 3, limit: 25 }).page, 3);
    assert.equal(parsePagination({ page: 3, limit: 25 }).skip, 50);
    // floor (page<1 → 1, limit<1 → RESOURCE_PAGE_SIZE)
    assert.equal(parsePagination({ page: -5, limit: 0 }).page, 1);
    assert.equal(parsePagination({ page: -5, limit: 0 }).limit, RESOURCE_PAGE_SIZE);
    // cap (limit>MAX → MAX)
    assert.equal(parsePagination({ limit: 999 }).limit, RESOURCE_PAGE_MAX);
  });

  test('T10: FEED_SORTS has the three feeds PR #168 advertises', async () => {
    const { FEED_SORTS } = await import('../server/services/resources.js');
    assert.ok(FEED_SORTS.latest);
    assert.ok(FEED_SORTS.trending);
    assert.ok(FEED_SORTS.downloads);
    // trending sorts by likeCount
    assert.ok(FEED_SORTS.trending.likeCount === -1);
    // downloads sorts by downloadCount
    assert.ok(FEED_SORTS.downloads.downloadCount === -1);
  });

  test('T10: VALID_CATEGORIES / VALID_FILE_TYPES cover the curated set', async () => {
    const { VALID_CATEGORIES, VALID_FILE_TYPES } = await import('../server/services/resources.js');
    // Empty string is allowed (= "uncategorised") so pre-tier-10 rows
    // remain valid
    assert.equal(VALID_CATEGORIES[0], '');
    assert.equal(VALID_FILE_TYPES[0], '');
    // Spot-check a few categories + types from PR #168's enum
    assert.ok(VALID_CATEGORIES.includes('Programming'));
    assert.ok(VALID_CATEGORIES.includes('DSA'));
    assert.ok(VALID_FILE_TYPES.includes('PDF'));
    assert.ok(VALID_FILE_TYPES.includes('YouTube'));
  });
});
