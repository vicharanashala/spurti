/**
 * Tier 2 route integration tests — REAL MongoDB, REAL router, REAL models.
 *
 * What this tests:
 *   - The HTTP contract for the 11 Resource Exchange endpoints
 *   - Auth boundaries (student-only, owner-only)
 *   - Admin moderation (admin-only)
 *   - Cohort scoping
 *   - Save/rating idempotency at the DB layer (unique indexes!)
 *   - Report rate limiting
 *
 * What this does NOT test (already proven by tests/resources.test.js):
 *   - Validation rules, Wilson scoring, status tier thresholds
 *
 * Wiring:
 *   - Real local mongod on 127.0.0.1:27017, test DB = spurti_test_<pid>
 *   - Real express app, real service layer, real models, real router from
 *     server/routes/resources.js — only samagama auth is stubbed via a
 *     tiny local HTTP server that answers {user:{email}} given a cookie
 *   - supertest drives the API end-to-end
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import request from 'supertest';
import http from 'node:http';

import { leaderboardGroup } from '../server/services/levels.js';
import {
  validateCreate, validateStars, bumpResource,
  buildListQuery, buildMineQuery, buildContextQuery, markDeleted, markRestored,
  summariseImpact, AUTO_HIDE_REPORTS, withContextLabel
} from '../server/services/resources.js';
import { appendAudit } from '../server/services/audit.js';
import registerResourceRoutes from '../server/routes/resources.js';
import registerAdminResourceRoutes from '../server/routes/admin-resources.js';

import Resource from '../server/models/Resource.js';
import ResourceSave from '../server/models/ResourceSave.js';
import ResourceRating from '../server/models/ResourceRating.js';
import ResourceReport from '../server/models/ResourceReport.js';
import ResourceAuditEvent from '../server/models/ResourceAuditEvent.js';
import Student from '../server/models/Student.js';

// ── per-test ephemeral samagama stub ──────────────────────────────────────
// Returns the cookie's user email as {user:{email}}. Listens on a free port.
function startSamagamaStub(cookieToEmail) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cookie = (req.headers.cookie || '').match(/chatengine_token=([^;]+)/);
      const token = cookie ? cookie[1] : null;
      const email = cookieToEmail[token];
      if (!email) { res.writeHead(401).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ user: { email } }));
    });
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      resolve({ srv, url: `http://127.0.0.1:${port}/api/auth/me` });
    });
  });
}

// ── app builder: same shape as server.js, but cookie → samagama configurable
function buildApp({ samagamaUrl }) {
  const app = express();
  app.use(express.json());

  const reportBuckets = new Map();
  const REPORT_LIMIT_PER_DAY = 3;
  const reportRateLimit = (email) => {
    const today = new Date().toISOString().slice(0, 10);
    const b = reportBuckets.get(email);
    if (!b || b.date !== today) { reportBuckets.set(email, { date: today, count: 1 }); return false; }
    b.count += 1;
    return b.count > REPORT_LIMIT_PER_DAY;
  };

  async function studentEmailFromRequest(req) {
    const cookie = (req.headers.cookie || '').match(/chatengine_token=([^;]+)/);
    if (!cookie) return null;
    try {
      const r = await fetch(samagamaUrl, { headers: { cookie: `chatengine_token=${cookie[1]}` } });
      if (!r.ok) return null;
      const j = await r.json();
      const email = j?.user?.email || j?.email;
      return email ? String(email).trim().toLowerCase() : null;
    } catch { return null; }
  }
  async function requireStudent(req, res) {
    const email = await studentEmailFromRequest(req);
    if (!email) { res.status(401).json({ error: 'Not authenticated' }); return null; }
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
    if (!student) { res.status(404).json({ error: 'Student not found' }); return null; }
    if (student.status === 'excused') { res.status(403).json({ error: 'Excused student' }); return null; }
    return { email, student };
  }
  function adminGuard(req, res, next) {
    const emailOk = (req.headers['x-admin-email'] || '') === process.env.ADMIN_EMAIL;
    const tokenOk = (req.headers['x-admin-token'] || '') === process.env.ADMIN_TOKEN;
    if (!emailOk || !tokenOk) return res.status(403).json({ error: 'Forbidden' });
    next();
  }

  const api = express.Router();
  registerResourceRoutes(api, {
    requireStudent, reportRateLimit, leaderboardGroup,
    validateCreate, validateStars, bumpResource, markDeleted, markRestored,
    buildListQuery, buildMineQuery, buildContextQuery, summariseImpact, AUTO_HIDE_REPORTS,
    withContextLabel
  });
  // Tier 6 — admin routes now go through ./routes/admin-resources.js with
  // the fail-closed withAudit wrapper. The default `appendAudit` is the
  // real one so the existing tier 2 tests prove audit rows are visible
  // after real requests. Tests for the audit-failure rollback path build
  // their own app with a throwing stub.
  registerAdminResourceRoutes(api, {
    adminGuard, leaderboardGroup,
    appendAudit: appendAudit
  });
  app.use('/api', api);
  return { app, reportBuckets };
}

// ── fixtures ──────────────────────────────────────────────────────────────
const NOW = new Date('2026-06-10T03:30:00Z');                  // mid-month → cohort 06-01_to_06-15
const COHORT = '2026-06-01_to_2026-06-15';

async function makeStudent(email, name) {
  return Student.create({
    name, email, internshipStartDate: NOW, status: 'active', totalSp: 100
  });
}

const validBody = (over = {}) => ({
  type: 'link', url: 'https://example.com/x',
  title: 'Backprop explained', contextType: 'topic',
  contextRef: 'backprop', ...over
});

// ── shared lifecycle ─────────────────────────────────────────────────────
describe('Resource Exchange route integration (real MongoDB)', () => {
  const TEST_DB = `mongodb://127.0.0.1:27017/spurti_test_${process.pid}`;
  let cookieMap;
  let samagama;
  let app;

  before(async () => {
    // Local mongod on this machine (homebrew) is configured SSL-only by
    // default. Tests force TLS + accept the self-signed cert — this is
    // TEST-ONLY configuration; the running app's MONGO_URI is unchanged.
    await mongoose.connect(TEST_DB, {
      tls: true,
      tlsAllowInvalidCertificates: true
    });
    cookieMap = {};
    samagama = await startSamagamaStub(cookieMap);
    process.env.SAMAGAMA_AUTH_URL = samagama.url;
    process.env.ADMIN_EMAIL = 'admin@iitrpr.ac.in';
    process.env.ADMIN_TOKEN = 'test-admin-token';
    app = buildApp({ samagamaUrl: samagama.url }).app;
  });

  after(async () => {
    try { samagama.srv.close(); } catch {}
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Resource.deleteMany({});
    await ResourceSave.deleteMany({});
    await ResourceRating.deleteMany({});
    await ResourceReport.deleteMany({});
    await Student.deleteMany({});
  });

  // tiny helper: install a student + return their cookie token
  async function asStudent(email, name) {
    const s = await makeStudent(email, name || email.split('@')[0]);
    const token = `tok_${s._id}`;
    cookieMap[token] = s.email;
    return { student: s, token };
  }
  const cookie = (token) => `chatengine_token=${token}`;

  // ── AUTH ────────────────────────────────────────────────────────────────
  test('auth: unauthenticated request rejected', async () => {
    const r = await request(app).post('/api/resources').send(validBody());
    assert.equal(r.status, 401);
  });

  test('auth: authenticated student can create + read back what they created', async () => {
    const { token } = await asStudent('harshu167@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody({ title: 'hello' }));
    assert.equal(create.status, 200);
    assert.ok(create.body.id);
    assert.equal(create.body.utility, 0);
    assert.equal(create.body.status, 'new');

    const get = await request(app).get(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(token));
    assert.equal(get.status, 200);
    assert.equal(get.body.title, 'hello');

    const list = await request(app).get('/api/resources').set('Cookie', cookie(token));
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 1);
  });

  // ── COHORT SCOPING ────────────────────────────────────────────────────
  test('cohort: cross-cohort resource is not exposed to other-cohort student', async () => {
    // create alice in the default NOW cohort (06-01_to_06-15)
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody({ title: 'alice-resource' }));
    assert.equal(create.status, 200);

    // bob is in a DIFFERENT cohort (next month)
    const bobDate = new Date('2026-07-10T03:30:00Z');
    const bob = await Student.create({ name: 'bob', email: 'bob@iitrpr.ac.in', internshipStartDate: bobDate, status: 'active', totalSp: 100 });
    const bobToken = `tok_${bob._id}`;
    cookieMap[bobToken] = bob.email;

    const get = await request(app).get(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(bobToken));
    assert.equal(get.status, 404, 'bob should see 404, not 403 (no info leak about existence)');
    const list = await request(app).get('/api/resources').set('Cookie', cookie(bobToken));
    assert.equal(list.body.total, 0, 'bob should see no alice-cohort resources');
  });

  // ── OWNER-ONLY DELETE ─────────────────────────────────────────────────
  test('delete: owner succeeds', async () => {
    const { token, student } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody({ title: 'to-delete' }));
    const del = await request(app).delete(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(token));
    assert.equal(del.status, 200);
    // subsequent read returns 404 (soft-deleted)
    const read = await request(app).get(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(token));
    assert.equal(read.status, 404);
  });

  test('delete: non-owner rejected', async () => {
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody());
    const m = await asStudent('mallory@iitrpr.ac.in');
    const del = await request(app).delete(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(m.token));
    assert.equal(del.status, 403, 'non-owner must be 403, not 401/404');
    // alice's resource still readable
    const read = await request(app).get(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(a.token));
    assert.equal(read.status, 200);
  });

  // ── ADMIN ENDPOINTS ───────────────────────────────────────────────────
  test('admin: student cannot access admin endpoint (no x-admin-* headers)', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const r = await request(app).get('/api/admin/resources').set('Cookie', cookie(token));
    assert.equal(r.status, 403, 'student must NOT access admin endpoint via cookie alone');
  });

  test('admin: with bad admin headers → 403', async () => {
    const r = await request(app).get('/api/admin/resources')
      .set('x-admin-email', 'wrong@x').set('x-admin-token', 'wrong');
    assert.equal(r.status, 403);
  });

  // ── RESTORE ───────────────────────────────────────────────────────────
  test('restore: admin restores a soft-deleted resource + status is recomputed', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody());
    // owner deletes it
    await request(app).delete(`/api/resources/${create.body.id}`).set('Cookie', cookie(token));
    // bump counts (pretend deltas happened while it was down? — soft delete doesn't lose save history)
    // admin restores
    const restore = await request(app).post(`/api/admin/resources/${create.body.id}/restore`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(restore.status, 200);
    assert.equal(restore.body.restored, true);
    // status recomputed from current counts (ratingCount=0, saveCount=0 → 'new')
    assert.equal(restore.body.status, 'new');
    // resource becomes readable again
    const read = await request(app).get(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(token));
    assert.equal(read.status, 200);
  });

  // ── SAVE IDEMPOTENCY (real DB) ────────────────────────────────────────
  test('save: first save succeeds, repeat does not create another row', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody());
    const id = create.body.id;

    const s1 = await request(app).post(`/api/resources/${id}/save`).set('Cookie', cookie(token));
    const s2 = await request(app).post(`/api/resources/${id}/save`).set('Cookie', cookie(token));
    const s3 = await request(app).post(`/api/resources/${id}/save`).set('Cookie', cookie(token));

    assert.equal(s1.body.saved, true);  assert.equal(s1.body.saveCount, 1);
    assert.equal(s2.body.saved, false); assert.equal(s2.body.saveCount, 1);
    assert.equal(s3.body.saved, false); assert.equal(s3.body.saveCount, 1);

    // and the underlying collection has exactly one row for this (resource, alice)
    const rows = await ResourceSave.find({ resourceId: id, email: 'alice@iitrpr.ac.in' }).lean();
    assert.equal(rows.length, 1, 'unique index must keep saves to exactly one row');
  });

  // ── RATING IDEMPOTENCY (real DB) ─────────────────────────────────────
  test('rate: first rating succeeds, repeat updates (count stays 1)', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody());
    const id = create.body.id;

    const r1 = await request(app).post(`/api/resources/${id}/rate`)
      .set('Cookie', cookie(token)).send({ stars: 2 });
    const r2 = await request(app).post(`/api/resources/${id}/rate`)
      .set('Cookie', cookie(token)).send({ stars: 5 });
    const r3 = await request(app).post(`/api/resources/${id}/rate`)
      .set('Cookie', cookie(token)).send({ stars: 1 });

    assert.equal(r1.body.ratingCount, 1);
    assert.equal(r1.body.avg, 2);
    assert.equal(r2.body.ratingCount, 1);
    assert.equal(r2.body.avg, 5);                  // 2→5 overwrites
    assert.equal(r3.body.ratingCount, 1);
    assert.equal(r3.body.avg, 1);                  // 5→1 overwrites

    // unique index keeps it to one row
    const rows = await ResourceRating.find({ resourceId: id, email: 'alice@iitrpr.ac.in' }).lean();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].stars, 1);                 // last write wins
  });

  // ── INVALID RATING ───────────────────────────────────────────────────
  test('rate: invalid stars rejected (no DB write)', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody());
    const bad = await request(app).post(`/api/resources/${create.body.id}/rate`)
      .set('Cookie', cookie(token)).send({ stars: 9 });
    assert.equal(bad.status, 400);
    const count = await ResourceRating.countDocuments({});
    assert.equal(count, 0, 'rejected rating must not touch DB');
  });

  // ── REPORT + RATE LIMIT (real DB + service rateLimit) ────────────────
  test('report: 3 reports from same email succeed, 4th hits rate limit', async () => {
    // alice creates 4 resources
    const { token: aliceTok } = await asStudent('alice@iitrpr.ac.in');
    const ids = [];
    for (let i = 0; i < 4; i++) {
      const c = await request(app).post('/api/resources')
        .set('Cookie', cookie(aliceTok)).send(validBody({ title: `r${i}` }));
      ids.push(c.body.id);
    }
    // One reporter reports 4 distinct resources. Limit is 3/day/email, so the 4th must be 429.
    const r = await asStudent('mallory@iitrpr.ac.in');
    const statuses = [];
    for (const id of ids) {
      const res = await request(app).post(`/api/resources/${id}/report`)
        .set('Cookie', cookie(r.token)).send({ reason: 'spam' });
      statuses.push(res.status);
    }
    assert.deepEqual(statuses, [200, 200, 200, 429],
      `expected [200,200,200,429], got [${statuses.join(',')}]`);
  });

  // ── TIER 4 — context-bound list ──────────────────────────────────────────
  test('context: returns only resources for that contextType+contextRef, in cohort', async () => {
    const a = await asStudent('alice@iitrpr.ac.in');
    // alice creates 3 phase=vibe and 1 phase=standup
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const r = await request(app).post('/api/resources')
        .set('Cookie', cookie(a.token)).send(validBody({ title: `vibe-${i}`, contextType: 'phase', contextRef: 'vibe' }));
      ids.push(r.body.id);
    }
    const other = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody({ title: 'standup', contextType: 'phase', contextRef: 'standup' }));
    // alice fetches phase=vibe context
    const list = await request(app).get('/api/resources/context/phase/vibe')
      .set('Cookie', cookie(a.token));
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 3, 'should be exactly the 3 vibe resources');
    assert.ok(list.body.rows.every(r => r.contextRef === 'vibe'));
  });

  test('context: cohort scoping — different-cohort resource is NOT exposed', async () => {
    // alice (cohort A) creates one vibe resource
    const a = await asStudent('alice@iitrpr.ac.in');
    const r = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody({ title: 'alice-vibe', contextType: 'phase', contextRef: 'vibe' }));
    // bob is in cohort B
    const bobDate = new Date('2026-07-10T03:30:00Z');
    const bob = await Student.create({ name: 'bob', email: 'bob@iitrpr.ac.in', internshipStartDate: bobDate, status: 'active', totalSp: 100 });
    const bobToken = `tok_${bob._id}`; cookieMap[bobToken] = bob.email;
    const list = await request(app).get('/api/resources/context/phase/vibe').set('Cookie', cookie(bobToken));
    assert.equal(list.status, 200);
    assert.equal(list.body.total, 0, 'bob (different cohort) sees no vibe resources');
    // alice still sees hers
    const aliceList = await request(app).get('/api/resources/context/phase/vibe').set('Cookie', cookie(a.token));
    assert.equal(aliceList.body.total, 1);
  });

  test('context: invalid shape returns 400 (re-uses create validator)', async () => {
    const a = await asStudent('alice@iitrpr.ac.in');
    const bad = await request(app).get('/api/resources/context/nonsense/x')
      .set('Cookie', cookie(a.token));
    assert.equal(bad.status, 400, 'unknown contextType must be 400');
    assert.match(bad.body.error, /contextType must be one of/);
    // 24-hex mismatch for question context
    const badQ = await request(app).get('/api/resources/context/question/nothex')
      .set('Cookie', cookie(a.token));
    assert.equal(badQ.status, 400);
  });

  test('context: unauthenticated request is rejected', async () => {
    const r = await request(app).get('/api/resources/context/phase/vibe');
    assert.equal(r.status, 401);
  });

  // ── TIER 11 — saved-by-me + cohort-pulse endpoints ──────────────────────
  // Both go through the same auth + feature gate as the rest of the file.
  // We piggy-back on existing helpers (asStudent, validBody) to cover
  // auth boundaries + cohort scoping in one shot each.

  test('saved: unauthenticated request is rejected', async () => {
    const r = await request(app).get('/api/resources/saved');
    assert.equal(r.status, 401);
  });

  test('saved: student sees only their own saves', async () => {
    const a = await asStudent('alice@iitrpr.ac.in');
    const b = await asStudent('bob@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody({ title: 'shared-note' }));
    const id = create.body.id;
    // alice and bob both save; alice must see her save only.
    await request(app).post(`/api/resources/${id}/save`).set('Cookie', cookie(a.token));
    await request(app).post(`/api/resources/${id}/save`).set('Cookie', cookie(b.token));
    const aliceSeen = await request(app).get('/api/resources/saved').set('Cookie', cookie(a.token));
    assert.equal(aliceSeen.status, 200);
    assert.equal(aliceSeen.body.total, 1);
    assert.equal(aliceSeen.body.rows[0].title, 'shared-note');
    const bobSeen = await request(app).get('/api/resources/saved').set('Cookie', cookie(b.token));
    assert.equal(bobSeen.body.total, 1);
  });

  test('saved: empty returns a clean empty envelope (no 500)', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const r = await request(app).get('/api/resources/saved').set('Cookie', cookie(token));
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { rows: [], total: 0, page: 1, hasMore: false });
  });

  test('stats: unauthenticated request is rejected', async () => {
    const r = await request(app).get('/api/resources/stats');
    assert.equal(r.status, 401);
  });

  test('stats: counts resources + byContextType + topTags + raters', async () => {
    const a = await asStudent('alice@iitrpr.ac.in');
    // alice creates 3 resources with distinct (type, tag, context) to exercise
    // every count path. bob saves one of them so totalSaves=1.
    const tags = ['neural-nets', 'gradient', 'neural-nets'];
    for (const [i, tag] of tags.entries()) {
      const create = await request(app).post('/api/resources')
        .set('Cookie', cookie(a.token))
        .send(validBody({
          title: `r-${i}`,
          contextType: i === 2 ? 'phase' : 'topic',
          contextRef: i === 2 ? 'standup' : tag,
          tags: [tag]
        }));
      if (i === 0) {
        // bob saves + rates resource 0
        const b = await asStudent('bob@iitrpr.ac.in');
        await request(app).post(`/api/resources/${create.body.id}/save`).set('Cookie', cookie(b.token));
        await request(app).post(`/api/resources/${create.body.id}/rate`)
          .set('Cookie', cookie(b.token)).send({ stars: 5 });
      }
    }
    const r = await request(app).get('/api/resources/stats').set('Cookie', cookie(a.token));
    assert.equal(r.status, 200);
    assert.equal(r.body.totalResources, 3, '3 resources in cohort');
    assert.equal(r.body.totalSaves, 1, '1 save from bob');
    assert.equal(r.body.totalRaters, 1, 'bob is the 1 rater');
    assert.equal(r.body.byContextType.topic, 2);
    assert.equal(r.body.byContextType.phase, 1);
    // 'neural-nets' has 2 uses, 'gradient' has 1 — desc order
    const tagsOut = r.body.topTags.map(t => t.tag);
    assert.equal(tagsOut[0], 'neural-nets');
    assert.equal(r.body.topTags.find(t => t.tag === 'neural-nets').count, 2);
    assert.ok(r.body.topTags.length <= 8);
  });

  test('stats: cohort scoping — other-cohort resources + saves are NOT counted', async () => {
    // alice (cohort A) creates + saves 2 resources
    const a = await asStudent('alice@iitrpr.ac.in');
    await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'a1' }));
    await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'a2' }));
    // bob (cohort B) gets stats — should see 0
    const bobDate = new Date('2026-07-10T03:30:00Z');
    const bob = await Student.create({
      name: 'bob', email: 'bob@iitrpr.ac.in',
      internshipStartDate: bobDate, status: 'active', totalSp: 100
    });
    const bobToken = `tok_${bob._id}`;
    cookieMap[bobToken] = bob.email;
    const bobStats = await request(app).get('/api/resources/stats').set('Cookie', cookie(bobToken));
    assert.equal(bobStats.body.totalResources, 0, 'bob (different cohort) sees no resources');
    assert.equal(bobStats.body.totalSaves, 0);
    // alice still sees her own
    const aliceStats = await request(app).get('/api/resources/stats').set('Cookie', cookie(a.token));
    assert.equal(aliceStats.body.totalResources, 2);
  });

  // ── ADMIN RESTORE preserves status recomputation ─────────────────────
  test('restore: status upgrades from "new" → "verified" after counts are bumped (DB-verified)', async () => {
    const { token } = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources')
      .set('Cookie', cookie(token)).send(validBody());
    const id = create.body.id;
    // delete → restore while at 0 counts → status 'new'
    await request(app).delete(`/api/resources/${id}`).set('Cookie', cookie(token));
    const r1 = await request(app).post(`/api/admin/resources/${id}/restore`)
      .set('x-admin-email', process.env.ADMIN_EMAIL).set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(r1.body.status, 'new');
    // now simulate 6 saves + 6 ratings (manually), delete, restore
    // we'll just bump the doc via mongoose direct to keep the test sharp
    await Resource.updateOne({ _id: id }, { $set: { saveCount: 6, ratingCount: 6, ratingSum: 30 } });
    await request(app).delete(`/api/resources/${id}`).set('Cookie', cookie(token));
    const r2 = await request(app).post(`/api/admin/resources/${id}/restore`)
      .set('x-admin-email', process.env.ADMIN_EMAIL).set('x-admin-token', process.env.ADMIN_TOKEN);
    // restore re-derived utility + status from FRESH counts
    assert.equal(r2.body.status, 'verified', 'status must recompute from current counts after restore');
  });

  // ── TIER 6 — audit-event visibility tests ─────────────────────────────────
  // These tests prove that AFTER a real admin or student request succeeds,
  // an actual ResourceAuditEvent row exists in the DB with the structured
  // payload the service contract requires. This is the gate you specifically
  // asked for: not "did appendAudit get called" but "is the audit record real".

  async function fetchAuditForResource(resourceId) {
    return ResourceAuditEvent.find({ resourceId }).sort({ at: -1 }).lean();
  }

  test('admin delete → resource.deleted audit row exists with reason', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'thing-to-delete' }));
    await request(app).delete(`/api/resources/${create.body.id}`)
      .set('Cookie', cookie(a.token));   // owner-delete first
    const del = await request(app).delete(`/api/admin/resources/${create.body.id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'wrong topic' });
    assert.equal(del.status, 200);
    const events = await fetchAuditForResource(create.body.id);
    const adminDelete = events.find(e => e.kind === 'resource.deleted' && e.actorType === 'admin');
    assert.ok(adminDelete, 'admin resource.deleted event must exist');
    assert.equal(adminDelete.payload.reason, 'wrong topic');
    assert.equal(adminDelete.actorEmail, process.env.ADMIN_EMAIL);
  });

  test('admin restore → resource.restored audit row exists with previousStatus', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).delete(`/api/resources/${id}`).set('Cookie', cookie(a.token));
    const restore = await request(app).post(`/api/admin/resources/${id}/restore`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(restore.status, 200);
    const events = await fetchAuditForResource(id);
    const r = events.find(e => e.kind === 'resource.restored');
    assert.ok(r);
    assert.equal(r.actorType, 'admin');
    assert.equal(r.payload.previousStatus, 'new');
  });

  test('admin update → resource.updated audit row carries from→to for context + title', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'old', contextType: 'phase', contextRef: 'standup' }));
    const id = create.body.id;
    const patch = await request(app).patch(`/api/admin/resources/${id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({
        title: 'new',
        contextType: 'phase',
        contextRef: 'vibe',
        reason: 'moved phase'
      });
    assert.equal(patch.status, 200);
    const events = await fetchAuditForResource(id);
    const u = events.find(e => e.kind === 'resource.updated');
    assert.ok(u);
    assert.equal(u.actorType, 'admin');
    assert.equal(u.payload.changes.context.from.contextRef, 'standup');
    assert.equal(u.payload.changes.context.to.contextRef, 'vibe');
    assert.deepEqual(u.payload.changes.title, { from: 'old', to: 'new' });
    assert.equal(u.payload.reason, 'moved phase');
  });

  test('admin update with context but unchanged title emits only context', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'X', contextType: 'phase', contextRef: 'standup' }));
    const id = create.body.id;
    await request(app).patch(`/api/admin/resources/${id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ title: 'X', contextType: 'phase', contextRef: 'vibe', reason: 'moved' });
    const events = await fetchAuditForResource(id);
    const u = events.find(e => e.kind === 'resource.updated');
    assert.ok(u);
    assert.ok(u.payload.changes.context, 'context change present');
    assert.equal(u.payload.changes.title, undefined, 'title unchanged → omitted');
  });

  test('admin update with invalid context → 400, NO audit row written', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ contextType: 'phase', contextRef: 'standup' }));
    const id = create.body.id;
    const bad = await request(app).patch(`/api/admin/resources/${id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ contextType: 'topic', contextRef: '!!!' });   // bad slug
    assert.equal(bad.status, 400);
    const events = await fetchAuditForResource(id);
    assert.equal(events.find(e => e.kind === 'resource.updated'), undefined,
      'no audit row for failed PATCH');
  });

  test('admin create → resource.created + source forced to admin (body ignored)', async () => {
    await ResourceAuditEvent.deleteMany({});
    const created = await request(app).post('/api/admin/resources')
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({
        type: 'link', url: 'https://example.com/official', title: 'Official lecture notes',
        description: 'faculty-curated',
        contextType: 'phase', contextRef: 'standup',
        cohort: COHORT,
        source: 'student'                  // attempt to bypass — server must override
      });
    assert.equal(created.status, 200);
    const id = created.body.id;
    const persistedDoc = await Resource.findById(id).lean();
    assert.equal(persistedDoc.source, 'admin', 'server forced source to admin');
    assert.equal(persistedDoc.cohort, COHORT);
    const events = await fetchAuditForResource(id);
    const c = events.find(e => e.kind === 'resource.created');
    assert.ok(c);
    assert.equal(c.actorType, 'admin');
    assert.equal(c.payload.source, 'admin');
    assert.equal(c.payload.title, 'Official lecture notes');
  });

  test('admin hide → resource.hidden audit row with reason', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    const hide = await request(app).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'spam' });
    assert.equal(hide.status, 200);
    const events = await fetchAuditForResource(id);
    const h = events.find(e => e.kind === 'resource.hidden');
    assert.ok(h);
    assert.equal(h.actorType, 'admin');
    assert.equal(h.payload.reason, 'spam');
  });

  test('student report → resource.reported audit row + (if threshold) resource.auto_hidden', async () => {
    await ResourceAuditEvent.deleteMany({});
    const b = await asStudent('bob-t6-r1@iitrpr.ac.in');
    const c = await asStudent('charlie-t6-r1@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(b.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(b.token)).send({ reason: 'first' });
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(c.token)).send({ reason: 'second' });
    const events = await fetchAuditForResource(id);
    assert.equal(events.filter(e => e.kind === 'resource.reported').length, 2);
    assert.equal(events.filter(e => e.kind === 'resource.auto_hidden').length, 1);
    const a2 = events.find(e => e.kind === 'resource.auto_hidden');
    assert.equal(a2.actorType, 'system');
    assert.equal(a2.payload.trigger, 'report_threshold');
    assert.equal(a2.payload.reportCount, 2);
  });

  test('admin resolve report → resource.report_resolved audit row', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(a.token)).send({ reason: 'spam' });
    const reportDoc = await ResourceReport.findOne({ resourceId: id });
    const resolve = await request(app).post(`/api/admin/resource-reports/${reportDoc._id}/resolve`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ action: 'dismissed', reason: 'reviewed ok' });
    assert.equal(resolve.status, 200);
    const events = await fetchAuditForResource(id);
    const ev = events.find(e => e.kind === 'resource.report_resolved');
    assert.ok(ev);
    assert.equal(ev.actorType, 'admin');
    assert.equal(ev.payload.status, 'dismissed');
    assert.equal(ev.payload.reason, 'reviewed ok');
  });

  // ── Tier 7 — atomic auto_hide on resolve ─────────────────────────────────
  test('admin resolve with auto_hide → resource actually hidden + BOTH audit rows', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-ah@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(a.token)).send({ reason: 'spam' });
    const reportDoc = await ResourceReport.findOne({ resourceId: id });

    const resolve = await request(app).post(`/api/admin/resource-reports/${reportDoc._id}/resolve`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ action: 'auto_hide', hideReason: 'spam', reason: 'reviewed ok' });
    assert.equal(resolve.status, 200);
    assert.equal(resolve.body.action, 'auto_hide');

    // Resource actually hidden (student-visible state changed).
    const after = await Resource.findById(id).lean();
    assert.ok(after.deletedAt, 'resource must be hidden after auto_hide');

    // BOTH audit rows persisted in the same operation.
    const events = await fetchAuditForResource(id);
    const resolveEv = events.find(e => e.kind === 'resource.report_resolved');
    const hideEv = events.find(e => e.kind === 'resource.hidden');
    assert.ok(resolveEv, 'resource.report_resolved event must exist');
    assert.ok(hideEv, 'resource.hidden event must exist');
    assert.equal(resolveEv.payload.status, 'auto_hide');
    assert.equal(hideEv.payload.reason, 'spam');
    assert.equal(hideEv.payload.source, 'auto_hide-via-resolve');
  });

  test('admin resolve with auto_hide + audit fail → BOTH report and resource rolled back', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-rb@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(a.token)).send({ reason: 'spam' });
    const reportDoc = await ResourceReport.findOne({ resourceId: id });

    // Use the fail-audit app so the resolve fails atomically.
    const failApp = buildAdminAppFailAudit();
    const resolve = await request(failApp).post(`/api/admin/resource-reports/${reportDoc._id}/resolve`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ action: 'auto_hide', hideReason: 'spam' });
    assert.equal(resolve.status, 500, 'auto_hide must fail-closed when audit fails');

    // Report still open.
    const afterReport = await ResourceReport.findById(reportDoc._id).lean();
    assert.equal(afterReport.status, 'open', 'report must be rolled back to open');
    // Resource still visible.
    const afterResource = await Resource.findById(id).lean();
    assert.equal(afterResource.deletedAt, null, 'resource must NOT be hidden when audit fails');
  });

  // ── Tier 7 — read-only admin endpoints ────────────────────────────────────
  test('GET /admin/resources/:id returns full detail incl. source, counters', async () => {
    await ResourceAuditEvent.deleteMany({});
    const created = await request(app).post('/api/admin/resources')
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ type: 'link', url: 'https://example.com/x', title: 'detail-test',
              contextType: 'phase', contextRef: 'standup', cohort: COHORT });
    const id = created.body.id;
    const detail = await request(app).get(`/api/admin/resources/${id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.title, 'detail-test');
    assert.equal(detail.body.source, 'admin');
    assert.equal(detail.body.cohort, COHORT);
    assert.ok(detail.body.createdBy);
    assert.equal(typeof detail.body.saveCount, 'number');
  });

  test('GET /admin/resources/:id/audit returns the events for this resource', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-detail@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'spam' });
    const audit = await request(app).get(`/api/admin/resources/${id}/audit`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.body.events));
    // Admin hide is the audit event for this resource; student-created
    // resources do NOT emit resource.created (out of tier-6 scope).
    assert.ok(audit.body.events.find(e => e.kind === 'resource.hidden'),
      'admin-hide event must appear in the per-resource timeline');
  });

  test('GET /admin/audit?actor= filters by actor', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-actor@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    // student-create event (actor = alice)
    await request(app).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'spam' });
    // actor=admin → only the admin's event
    const adminOnly = await request(app).get(`/api/admin/audit?actor=${process.env.ADMIN_EMAIL}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(adminOnly.status, 200);
    assert.ok(adminOnly.body.events.length >= 1);
    adminOnly.body.events.forEach(e => assert.equal(e.actorType, 'admin'));
  });

  test('GET /admin/audit?kind= filters by event kind', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-kind@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'spam' });
    const onlyHidden = await request(app).get(`/api/admin/audit?kind=resource.hidden`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(onlyHidden.status, 200);
    onlyHidden.body.events.forEach(e => assert.equal(e.kind, 'resource.hidden'));
  });

  test('GET /admin/reports returns reports list (open first)', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice-t7-reports@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(a.token)).send({ reason: 'spam' });
    const reports = await request(app).get(`/api/admin/reports`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(reports.status, 200);
    assert.ok(Array.isArray(reports.body.rows));
    assert.ok(reports.body.rows.length >= 1);
    const openRow = reports.body.rows.find(r => r.resourceId.toString() === id && r.status === 'open');
    assert.ok(openRow, 'open report row must be present');
  });

  // ── Tier 6 — fail-closed tests ────────────────────────────────────────────
  // Build minimal admin/student apps that share the test DB but pass a
  // throwing `appendAudit` to the routes. This proves the rollback path
  // without needing in-memory model stubs.
  function buildAdminAppFailAudit() {
    const app2 = express();
    app2.use(express.json());
    const api2 = express.Router();
    function adminGuard(req, res, next) {
      const emailOk = (req.headers['x-admin-email'] || '') === process.env.ADMIN_EMAIL;
      const tokenOk = (req.headers['x-admin-token'] || '') === process.env.ADMIN_TOKEN;
      if (!emailOk || !tokenOk) return res.status(403).json({ error: 'Forbidden' });
      next();
    }
    registerAdminResourceRoutes(api2, {
      adminGuard, leaderboardGroup,
      appendAudit: async () => { throw new Error('audit failed (test stub)'); }
    });
    app2.use('/api', api2);
    return app2;
  }
  function buildStudentAppFailAudit() {
    const app2 = express();
    app2.use(express.json());
    const api2 = express.Router();
    // Hand-rolled requireStudent: parses cookie → samagama-stub.
    app2.use((req, res, next) => {
      const cookie = (req.headers.cookie || '').match(/chatengine_token=([^;]+)/);
      req.studentEmail = cookie ? cookieMap[cookie[1]] : null;
      next();
    });
    registerResourceRoutes(api2, {
      requireStudent: async (req, res) => {
        const email = req.studentEmail;
        if (!email) { res.status(401).end(); return null; }
        const s = await Student.findOne({ email }).lean();
        if (!s) { res.status(404).end(); return null; }
        return { email, student: s };
      },
      reportRateLimit: () => false,
      leaderboardGroup,
      validateCreate, validateStars, bumpResource, markDeleted, markRestored,
      buildListQuery, buildMineQuery, buildContextQuery, summariseImpact, AUTO_HIDE_REPORTS,
      withContextLabel,
      appendAudit: async () => { throw new Error('audit failed (test stub)'); }
    });
    app2.use('/api', api2);
    return app2;
  }

  test('admin create + audit fail → orphan hard-deleted, 500 returned', async () => {
    await ResourceAuditEvent.deleteMany({});
    const failApp = buildAdminAppFailAudit();
    const created = await request(failApp).post('/api/admin/resources')
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({
        type: 'link', url: 'https://example.com/x', title: 'orphan-attempt',
        contextType: 'phase', contextRef: 'vibe', cohort: '2026-08-01_to_2026-08-15'
      });
    assert.equal(created.status, 500, 'admin create must fail-closed when audit fails');
    const count = await Resource.countDocuments({});
    assert.equal(count, 0, 'orphan resource must be hard-deleted when audit fails');
    const audits = await ResourceAuditEvent.countDocuments({});
    assert.equal(audits, 0);
  });

  test('admin edit + audit fail → resource restored to pre-image', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token))
      .send(validBody({ title: 'pre-image-title', contextType: 'phase', contextRef: 'standup' }));
    const id = create.body.id;
    const failApp = buildAdminAppFailAudit();
    const patch = await request(failApp).patch(`/api/admin/resources/${id}`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ title: 'mutation-attempt' });
    assert.equal(patch.status, 500);
    const after = await Resource.findById(id).lean();
    assert.equal(after.title, 'pre-image-title');
    assert.equal(after.contextRef, 'standup');
  });

  test('admin restore + audit fail → resource remains deleted', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    await request(app).delete(`/api/resources/${id}`).set('Cookie', cookie(a.token));
    const failApp = buildAdminAppFailAudit();
    const restore = await request(failApp).post(`/api/admin/resources/${id}/restore`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN);
    assert.equal(restore.status, 500);
    const after = await Resource.findById(id).lean();
    assert.ok(after.deletedAt, 'resource should remain deleted after failed restore');
  });

  test('admin hide + audit fail → resource remains visible', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    const create = await request(app).post('/api/resources').set('Cookie', cookie(a.token)).send(validBody());
    const id = create.body.id;
    const failApp = buildAdminAppFailAudit();
    const hide = await request(failApp).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', process.env.ADMIN_EMAIL)
      .set('x-admin-token', process.env.ADMIN_TOKEN)
      .send({ reason: 'spam' });
    assert.equal(hide.status, 500);
    const after = await Resource.findById(id).lean();
    assert.equal(after.deletedAt, null, 'resource must NOT be hidden when audit fails');
  });

  test('student report + audit fail → report row rolled back, 500 returned', async () => {
    await ResourceAuditEvent.deleteMany({});
    const a = await asStudent('alice@iitrpr.ac.in');
    // Create the resource via the regular app (so the create audit can succeed).
    // Tier 8 closes the audit lifecycle gap: student create emits resource.created.
    const created = await request(app).post('/api/resources')
      .set('Cookie', cookie(a.token)).send(validBody());
    assert.equal(created.status, 200);
    const id = created.body.id;
    // Now attempt the report on the failing app — audit must throw,
    // route must 500, the report row must be rolled back.
    const failApp = buildStudentAppFailAudit();
    const report = await request(failApp).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie(a.token)).send({ reason: 'spam' });
    assert.equal(report.status, 500, 'student report must fail-closed when audit fails');
    const reportRows = await ResourceReport.countDocuments({ resourceId: id });
    assert.equal(reportRows, 0, 'rolled back: no orphan ResourceReport should remain');
    const auditRows = await ResourceAuditEvent.countDocuments({ resourceId: id });
    assert.equal(auditRows, 1, 'only the create audit row remains; the report audit row was rolled back');
  });
});
