/**
 * Resource Exchange HTTP routes. Extracted from server.js so the route
 * surface is importable for integration tests. The handlers moved verbatim;
 * behavior is unchanged.
 *
 * Wiring in server.js:
 *   import resourcesRouter from './routes/resources.js';
 *   resourcesRouter(api, {
 *     requireStudent, reportRateLimit, reportBuckets,
 *     leaderboardGroup, bumpResource, markDeleted, markRestored,
 *     validateCreate, validateStars, buildListQuery, buildMineQuery,
 *     summariseImpact, AUTO_HIDE_REPORTS
 *   });
 *
 * Tests can `import resourcesRouter` and pass it their own context (mocked
 * auth, in-memory samagama stub, etc) without booting server.js.
 */
import Resource from '../models/Resource.js';
import ResourceLike from '../models/ResourceLike.js';
import ResourceDownload from '../models/ResourceDownload.js';
import ResourceSave from '../models/ResourceSave.js';
import ResourceRating from '../models/ResourceRating.js';
import ResourceReport from '../models/ResourceReport.js';
import PollRecord from '../models/PollRecord.js';
import { withAudit, appendAudit } from '../services/audit.js';
import { requireResourceExchangeEnabled, isResourceExchangeEnabled } from '../services/featureControl.js';

export default function register(api, ctx) {
  const {
    requireStudent,
    reportRateLimit,
    leaderboardGroup,
    validateCreate,
    validateStars,
    buildListQuery,
    buildMineQuery,
    buildContextQuery,
    bumpResource,
    markDeleted,
    markRestored,
    summariseImpact,
    AUTO_HIDE_REPORTS,
    withContextLabel
  } = ctx;

  // Dependency-injection for tests. Production callers (server.js) don't pass
  // appendAudit and we fall through to the real one from services/audit.js.
  // Tests inject a throwing stub for the rollback-failure cases.
  const _appendAudit = ctx.appendAudit || appendAudit;

  // Tier 8B — student-safe availability endpoint. Always accessible (no
  // requireResourceExchangeEnabled guard) so the SPA can render the right
  // initial state. Returns only `{enabled}` — no admin metadata, no
  // audit, no timestamps. The SPA uses this for the tab decision; 403 on
  // any other resource API is the runtime source-of-truth fallback.
  api.get('/resources/availability', async (_req, res) => {
    res.json({ enabled: await isResourceExchangeEnabled() });
  });

  // Tier 8 — every student route is guarded by requireResourceExchangeEnabled.
  // Tier 8 also closes the audit lifecycle gap: student resource.create
  // emits resource.created (actor=student), wrapped with withAudit so audit
  // failure rolls back the create.
  api.post('/resources', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const v = validateCreate(req.body || {});
    if (!v.ok) return res.status(400).json({ error: v.error });
    let created = null;
    const out = await withAudit({
      rollbackLabel: 'student-create-resource',
      mutate: async () => {
        created = await Resource.create({
          ...v.value,
          createdBy: { email: c.email, name: c.student.name },
          cohort: leaderboardGroup(c.student.internshipStartDate)
        });
        const bumped = bumpResource(created.toObject());
        Object.assign(created, bumped);
        await created.save();
        return { doc: created.toObject() };
      },
      audit: async ({ doc }) => {
        await _appendAudit({
          resourceId: doc._id, actorType: 'student', actorEmail: c.email,
          kind: 'resource.created',
          payload: {
            title: doc.title, type: doc.type,
            contextType: doc.contextType, contextRef: doc.contextRef
          }
        });
      },
      rollback: async ({ doc }) => {
        // Hard delete the orphan so it never surfaces in lists / mine.
        try { await Resource.deleteOne({ _id: doc._id }); } catch {}
      }
    });
    if (!out.ok) {
      return res.status(500).json({ error: 'audit write failed — resource not persisted' });
    }
    res.json({ id: String(out.result.doc._id), utility: out.result.doc.utility, status: out.result.doc.status });
  });

  api.get('/resources', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    // Tier 10 — feed param picks the sort; defaults to 'latest' which
    // matches PR #168. Pagination is opt-in via ?page / ?limit.
    const feed = String(req.query.feed || 'latest');
    const sort = FEED_SORTS[feed] || FEED_SORTS.latest;
    const { page, limit, skip } = parsePagination({
      page: req.query.page, limit: req.query.limit
    });
    const cohort = leaderboardGroup(c.student.internshipStartDate);
    const filter = { deletedAt: null, cohort };

    // my_uploads is a special feed: scope to the caller's createdBy.email
    // rather than the cohort sort. Bypasses FEED_SORTS.
    if (feed === 'my_uploads') {
      const [total, rows] = await Promise.all([
        Resource.countDocuments({ ...filter, 'createdBy.email': c.email }),
        Resource.find({ ...filter, 'createdBy.email': c.email })
          .sort({ createdAt: -1 }).skip(skip).limit(limit).lean()
      ]);
      const labelled = await labelRows(rows);
      return res.json({ rows: labelled, total, page, hasMore: skip + rows.length < total });
    }

    // category / fileType filters (PR #168 parity)
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.fileType) filter.fileType = String(req.query.fileType);

    // Search via $regex — escape user input to prevent regex injection
    // (PR #168 hardening; we adopt it as a defensive measure even though
    // our current search uses bounded inputs).
    if (req.query.search && String(req.query.search).trim()) {
      const re = escapeRegex(String(req.query.search).trim());
      filter.$or = [
        { title:       { $regex: re, $options: 'i' } },
        { description: { $regex: re, $options: 'i' } },
        { tags:        { $regex: re, $options: 'i' } }
      ];
    }

    const [total, rows] = await Promise.all([
      Resource.countDocuments(filter),
      Resource.find(filter).sort(sort).skip(skip).limit(limit).lean()
    ]);
    const labelled = await labelRows(rows);
    res.json({ rows: labelled, total, page, hasMore: skip + rows.length < total });
  });

  api.get('/resources/mine', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const q = buildMineQuery(c.email);
    const rows = await Resource.find(q.filter).sort(q.sort).limit(q.limit).lean();
    const labelled = await labelRows(rows);
    const impact = summariseImpact(rows);
    res.json({ rows: labelled, ...impact });
  });

  // Tier 11 — student "saved by me" feed. Joins ResourceSave to Resource so
  // we can return the same labelled row shape as /resources, plus the
  // original saved timestamp (so newest-first is meaningful). Cohort-scoped
  // like /resources — a save to an out-of-cohort resource is filtered out
  // at the resource match (the save row exists, but the joined Resource
  // doesn't pass the cohort filter).
  api.get('/resources/saved', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const cohort = leaderboardGroup(c.student.internshipStartDate);
    const saves = await ResourceSave.find({ email: c.email })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    if (saves.length === 0) {
      return res.json({ rows: [], total: 0, page: 1, hasMore: false });
    }
    const ids = saves.map(s => s.resourceId);
    const rows = await Resource.find({
      _id: { $in: ids },
      deletedAt: null,
      cohort
    }).lean();
    // Preserve the save-order; labelRows gives us the human context.
    const byId = new Map(rows.map(r => [String(r._id), r]));
    const ordered = saves
      .map(s => byId.get(String(s.resourceId)))
      .filter(Boolean);
    const labelled = await labelRows(ordered);
    res.json({
      rows: labelled,
      total: labelled.length,
      page: 1,
      hasMore: false
    });
  });

  // Tier 11 — cohort-wide stats for the Discover pulse strip. Cheap
  // aggregations on the cohort filter; no per-row work. Bounded: even a
  // 1000-resource cohort returns well under a 100KB response.
  api.get('/resources/stats', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const cohort = leaderboardGroup(c.student.internshipStartDate);
    const baseFilter = { deletedAt: null, cohort };
    const [totalResources, saveAgg, ratingAgg, byContextAgg, tagAgg] = await Promise.all([
      Resource.countDocuments(baseFilter),
      ResourceSave.aggregate([
        // Join saves to their resource so we can cohort-scope without
        // trusting client-side filtering.
        { $lookup: { from: 'resources', localField: 'resourceId', foreignField: '_id', as: 'r' } },
        { $unwind: '$r' },
        { $match: { 'r.deletedAt': null, 'r.cohort': cohort } },
        { $count: 'n' }
      ]),
      ResourceRating.aggregate([
        { $lookup: { from: 'resources', localField: 'resourceId', foreignField: '_id', as: 'r' } },
        { $unwind: '$r' },
        { $match: { 'r.deletedAt': null, 'r.cohort': cohort } },
        { $group: { _id: '$email' } },
        { $count: 'n' }
      ]),
      Resource.aggregate([
        { $match: baseFilter },
        { $group: { _id: '$contextType', n: { $sum: 1 } } },
        { $sort: { n: -1 } }
      ]),
      Resource.aggregate([
        { $match: { ...baseFilter, tags: { $exists: true, $ne: [] } } },
        { $unwind: '$tags' },
        { $group: { _id: '$tags', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
        { $limit: 8 }
      ])
    ]);
    const totalSaves = saveAgg[0]?.n || 0;
    const totalRaters = ratingAgg[0]?.n || 0;
    const byContextType = Object.fromEntries(
      byContextAgg.map(row => [row._id, row.n])
    );
    const topTags = tagAgg.map(row => ({ tag: row._id, count: row.n }));
    res.json({ totalResources, totalSaves, totalRaters, byContextType, topTags });
  });

  // Tier 4 — fetch resources attached to a specific context. Used by the
  // existing learning surfaces (phase cards in MyJourney today; poll cards
  // when poll UI lands). Returns labelled rows plus a small `total` so the
  // SPA can show a "see all" link only when there are more than the limit.
  api.get('/resources/context/:type/:ref', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const contextType = String(req.params.type);
    const contextRef = String(req.params.ref);
    // Reuse the create-side validator for the shape; route layer is still
    // the only place we trust the caller's identity.
    const shape = validateCreate({ type: 'link', url: 'https://x', title: 'x', contextType, contextRef });
    if (!shape.ok) return res.status(400).json({ error: shape.error });
    const q = buildContextQuery({
      contextType, contextRef,
      cohort: leaderboardGroup(c.student.internshipStartDate),
      limit: req.query.limit
    });
    const rows = await Resource.find(q.filter).sort(q.sort).limit(q.limit).lean();
    const labelled = await labelRows(rows);
    res.json({ rows: labelled, total: labelled.length });
  });

  // ponytail: N+1 avoidance for contextLabel.
  // Phase/topic refs cost 0 DB calls (string map / prefix). Question refs
  // are batched into a single PollRecord.find({_id:{$in:[...]}}) so listing
  // 50 resources with 50 distinct question contexts is O(1) DB calls,
  // not O(N). The in-process `pollCache` skips re-fetching the same id
  // across this request (hot topics, etc.) — also O(1) per repeat.
  const pollCache = new Map();
  async function labelRows(rows) {
    const questionIds = Array.from(new Set(
      rows.filter(r => r.contextType === 'question').map(r => String(r.contextRef))
    )).filter(id => !pollCache.has(id));
    if (questionIds.length) {
      try {
        const docs = await PollRecord.find(
          { _id: { $in: questionIds } },
          { questionText: 1 }
        ).lean();
        for (const d of docs) pollCache.set(String(d._id), d.questionText || null);
        for (const id of questionIds) {
          if (!pollCache.has(id)) pollCache.set(id, null);   // mark missing so we don't refetch
        }
      } catch {
        for (const id of questionIds) pollCache.set(id, null);
      }
    }
    return Promise.all(rows.map(r => withContextLabel(r, async (id) => pollCache.get(String(id)))));
  }

  api.get('/resources/mine/impact', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const q = buildMineQuery(c.email);
    const rows = await Resource.find(q.filter).sort(q.sort).limit(q.limit).lean();
    res.json(summariseImpact(rows));
  });

  api.get('/resources/:id', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findOne({ _id: req.params.id, deletedAt: null }).lean();
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.cohort !== leaderboardGroup(c.student.internshipStartDate)) {
      return res.status(404).json({ error: 'Not found' });
    }
    // Single-row get still goes through labelRows (1 row = 1 question at most),
    // so the batched path covers it without a special case.
    const [labelled] = await labelRows([r]);
    res.json(labelled);
  });

  api.post('/resources/:id/save', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findOne({ _id: req.params.id, deletedAt: null });
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.cohort !== leaderboardGroup(c.student.internshipStartDate)) {
      return res.status(404).json({ error: 'Not found' });
    }
    let inserted = false;
    try {
      await ResourceSave.create({ resourceId: r._id, email: c.email });
      inserted = true;
      r.saveCount += 1;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    const bumped = bumpResource(r.toObject());
    r.utility = bumped.utility; r.status = bumped.status;
    await r.save();
    res.json({ saved: inserted, saveCount: r.saveCount });
  });

  api.post('/resources/:id/rate', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const v = validateStars(req.body?.stars);
    if (!v.ok) return res.status(400).json({ error: v.error });
    const r = await Resource.findOne({ _id: req.params.id, deletedAt: null });
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.cohort !== leaderboardGroup(c.student.internshipStartDate)) {
      return res.status(404).json({ error: 'Not found' });
    }
    let prev = null;
    const existing = await ResourceRating.findOne({ resourceId: r._id, email: c.email }).lean();
    if (existing) prev = existing.stars;
    try {
      await ResourceRating.updateOne(
        { resourceId: r._id, email: c.email },
        { $set: { stars: v.value, createdAt: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
    if (prev === null) {
      r.ratingCount += 1;
      r.ratingSum += v.value;
    } else {
      r.ratingSum = r.ratingSum - prev + v.value;
    }
    const bumped = bumpResource(r.toObject());
    r.utility = bumped.utility; r.status = bumped.status;
    await r.save();
    res.json({
      avg: r.ratingCount ? +(r.ratingSum / r.ratingCount).toFixed(2) : 0,
      ratingCount: r.ratingCount
    });
  });

  // Tier 10 — like / unlike (atomic, idempotent via unique compound
  // index on ResourceLike). One row per (resourceId, studentId).
  api.post('/resources/:id/like', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findById(req.params.id);
    if (!r || r.deletedAt) return res.status(404).json({ error: 'resource not found' });
    let created = false;
    try {
      await ResourceLike.create({ resourceId: r._id, studentId: c.student._id });
      created = true;
    } catch (err) {
      if (err?.code !== 11000) throw err;  // duplicate-key = already liked
    }
    if (created) {
      r.likeCount += 1;
      await r.save();
    }
    res.json({ likeCount: r.likeCount, likedByMe: true });
  });

  api.post('/resources/:id/unlike', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findById(req.params.id);
    if (!r || r.deletedAt) return res.status(404).json({ error: 'resource not found' });
    const result = await ResourceLike.deleteOne({ resourceId: r._id, studentId: c.student._id });
    if (result.deletedCount > 0) {
      r.likeCount = Math.max(0, r.likeCount - 1);
      await r.save();
    }
    res.json({ likeCount: r.likeCount, likedByMe: false });
  });

  // Tier 10 — download counter. One row per (resourceId, studentId);
  // subsequent downloads from the same student do NOT increment.
  api.post('/resources/:id/download', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findById(req.params.id);
    if (!r || r.deletedAt) return res.status(404).json({ error: 'resource not found' });
    let counted = false;
    try {
      await ResourceDownload.create({ resourceId: r._id, studentId: c.student._id });
      counted = true;
    } catch (err) {
      if (err?.code !== 11000) throw err;  // duplicate-key = already counted
    }
    if (counted) {
      r.downloadCount += 1;
      await r.save();
    }
    res.json({ downloadCount: r.downloadCount, countedByMe: counted, url: r.url });
  });

  api.post('/resources/:id/report', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    if (reportRateLimit(c.email)) return res.status(429).json({ error: 'Report rate limit exceeded' });
    const r = await Resource.findOne({ _id: req.params.id });
    if (!r) return res.status(404).json({ error: 'Not found' });

    // Tier 6 commit 2 — the report creation is fail-closed: audit must
    // succeed or the report is rolled back. The auto-hide that MAY follow
    // is the asymmetric exception (system actor, no rollback). See the
    // comment block on the systemPath branch below.
    const reasonText = String(req.body?.reason || '').slice(0, 400);

    // Step 1: create the report (fail-closed via withAudit).
    let createdReport = null;
    const created = await withAudit({
      rollbackLabel: 'student-report',
      mutate: async () => {
        let ins = false;
        try {
          createdReport = await ResourceReport.create({
            resourceId: r._id, email: c.email, reason: reasonText
          });
          ins = true;
        } catch (err) {
          if (err?.code !== 11000) throw err;   // duplicate report = no-op
        }
        return { inserted: ins, report: createdReport };
      },
      audit: async ({ report }) => {
        if (!report) return;
        await _appendAudit({
          resourceId: r._id, actorType: 'student', actorEmail: c.email,
          kind: 'resource.reported',
          payload: { reason: reasonText }
        });
      },
      rollback: async ({ report }) => {
        if (!report) return;
        try { await ResourceReport.deleteOne({ _id: report._id }); } catch {}
      }
    });
    if (!created.ok) {
      return res.status(500).json({ error: 'audit write failed — report not persisted' });
    }
    const inserted = created.result.inserted;
    if (!inserted) return res.json({ ok: true, reported: false });

    // Step 2: auto-hide if the threshold was just crossed.
    // DELIBERATELY ASYMMETRIC: the audit log gap here is logged + retried
    // inline. The resource MUST stay hidden even if audit logging fails —
    // student-visible garbage is the bigger harm. See tier 5 / 6 plan.
    const openReports = await ResourceReport.countDocuments({ resourceId: r._id, status: 'open' });
    if (openReports >= AUTO_HIDE_REPORTS && !r.deletedAt) {
      const muted = markDeleted(r, 'system');
      r.deletedAt = muted.deletedAt; r.deletedBy = muted.deletedBy;
      await r.save();
      try {
        await _appendAudit({
          resourceId: r._id, actorType: 'system', actorEmail: null,
          kind: 'resource.auto_hidden',
          payload: { trigger: 'report_threshold', reportCount: openReports }
        });
      } catch (auditErr) {
        // Asymmetric: log + retry once. The hide stays.
        const warn = { resourceId: r._id, error: auditErr?.message };
        console.error('AUDIT-CONSISTENCY', JSON.stringify({
          rollbackLabel: 'student-report-auto-hidden',
          auditError: warn.error,
          note: 'auto-hide audit write failed; retrying once'
        }));
        try {
          await _appendAudit({
            resourceId: r._id, actorType: 'system', actorEmail: null,
            kind: 'resource.auto_hidden',
            payload: { trigger: 'report_threshold', reportCount: openReports }
          });
        } catch (retryErr) {
          console.error('AUDIT-CONSISTENCY', JSON.stringify({
            rollbackLabel: 'student-report-auto-hidden',
            auditError: retryErr?.message,
            note: 'auto-hide audit FAILED PERMANENTLY; hide kept, audit gap is permanent'
          }));
        }
      }
    }
    res.json({ ok: true, reported: true });
  });

  api.delete('/resources/:id', requireResourceExchangeEnabled, async (req, res) => {
    const c = await requireStudent(req, res);
    if (!c) return;
    const r = await Resource.findById(req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.createdBy?.email !== c.email) {
      return res.status(403).json({ error: 'Only the owner can delete this resource' });
    }
    if (!r.deletedAt) {
      const muted = markDeleted(r, c.email);
      r.deletedAt = muted.deletedAt; r.deletedBy = muted.deletedBy;
      await r.save();
    }
    res.json({ ok: true, deletedAt: r.deletedAt });
  });
}
