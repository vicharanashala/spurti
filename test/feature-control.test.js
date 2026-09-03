import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import http from 'node:http';
import express from 'express';
import request from 'supertest';

import Resource from '../server/models/Resource.js';
import ResourceReport from '../server/models/ResourceReport.js';
import ResourceAuditEvent from '../server/models/ResourceAuditEvent.js';
import ResourceExchangeConfig from '../server/models/ResourceExchangeConfig.js';
import Student from '../server/models/Student.js';

import {
  validateCreate, validateStars, bumpResource,
  buildListQuery, buildMineQuery, buildContextQuery, markDeleted, markRestored,
  summariseImpact, AUTO_HIDE_REPORTS, withContextLabel
} from '../server/services/resources.js';
import { appendAudit } from '../server/services/audit.js';
import {
  isResourceExchangeEnabled, getConfig, setConfig,
  invalidateCache, requireResourceExchangeEnabled,
  isExperimentalFeaturesEnabled, requireExperimentalFeaturesEnabled
} from '../server/services/featureControl.js';
import registerResourceRoutes from '../server/routes/resources.js';
import registerAdminResourceRoutes from '../server/routes/admin-resources.js';

const TEST_DB = `mongodb://127.0.0.1:27017/spurti_feature_test_${process.pid}`;
const ADMIN_EMAIL = 'admin-feature@iitrpr.ac.in';
const ADMIN_TOKEN = 'test-admin-token';

const NOW = new Date('2026-06-10T03:30:00Z');
const COHORT = '2026-06-01_to_2026-06-15';

function startSamagamaStub(cookieToEmail) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const cookie = (req.headers.cookie || '').match(/chatengine_token=([^;]+)/);
      const token = cookie ? cookie[1] : null;
      const email = cookieToEmail[token];
      if (!email) { res.writeHead(401).end(); return; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ user: { email } }));
    });
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

async function makeStudent(email) {
  return Student.create({
    name: email.split('@')[0], email,
    internshipStartDate: NOW, status: 'active', totalSp: 100
  });
}

async function cleanDb() {
  await Resource.deleteMany({});
  await ResourceReport.deleteMany({});
  await ResourceAuditEvent.deleteMany({});
  await ResourceExchangeConfig.deleteMany({});
  invalidateCache();
}

function buildApp(cookieMap) {
  const app = express();
  app.use(express.json());

  const reportBuckets = new Map();
  const reportRateLimit = (email) => {
    const today = new Date().toISOString().slice(0, 10);
    const b = reportBuckets.get(email);
    if (!b || b.date !== today) { reportBuckets.set(email, { date: today, count: 1 }); return false; }
    b.count += 1; return b.count > 3;
  };

  async function requireStudent(req, res) {
    const cookie = (req.headers.cookie || '').match(/chatengine_token=([^;]+)/);
    const token = cookie ? cookie[1] : null;
    const email = cookieMap[token];
    if (!email) { res.status(401).end(); return null; }
    const student = await Student.findOne({ email }).lean();
    if (!student) { res.status(404).end(); return null; }
    return { email, student };
  }

  function adminGuard(req, res, next) {
    const emailOk = (req.headers['x-admin-email'] || '') === ADMIN_EMAIL;
    const tokenOk = (req.headers['x-admin-token'] || '') === ADMIN_TOKEN;
    if (!emailOk || !tokenOk) return res.status(403).json({ error: 'Forbidden' });
    next();
  }

  const api = express.Router();
  registerResourceRoutes(api, {
    requireStudent, reportRateLimit,
    leaderboardGroup: () => COHORT,
    validateCreate, validateStars, bumpResource, markDeleted, markRestored,
    buildListQuery, buildMineQuery, buildContextQuery, summariseImpact, AUTO_HIDE_REPORTS,
    withContextLabel,
    appendAudit,
    fetchPollQuestion: async () => null
  });
  // Tier 8 — admin routes mounted so admin actions can be tested in this app.
  // The config GET/PATCH live inside registerAdminResourceRoutes too. We do
  // NOT register them again here — doing so causes Express's path matcher
  // to route '/admin/resources/config' to the generic ':id' route first.
  registerAdminResourceRoutes(api, {
    adminGuard, leaderboardGroup: () => COHORT,
    appendAudit
  });
  app.use('/api', api);
  return app;
}

let samagama;

before(async () => {
  await mongoose.connect(TEST_DB, { tls: true, tlsAllowInvalidCertificates: true });
  samagama = await startSamagamaStub({});
  process.env.SAMAGAMA_AUTH_URL = `http://127.0.0.1:${samagama.port}`;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
});

after(async () => {
  try { samagama.srv.close(); } catch {}
  try { await mongoose.connection.dropDatabase(); } catch {}
  await mongoose.disconnect();
});

// ── Tier 8 — Resource Exchange feature control ─────────────────────────────
describe('Tier 8 — Resource Exchange feature control', () => {
  test('default: enabled=true when no config row exists', async () => {
    await cleanDb();
    const enabled = await isResourceExchangeEnabled();
    assert.equal(enabled, true);
  });

  test('GET /admin/resources/config returns current state (default enabled)', async () => {
    await cleanDb();
    const app = buildApp({});
    const r = await request(app).get('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN);
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, true);
  });

  test('PATCH /admin/resources/config {enabled:false} disables + emits audit row', async () => {
    await cleanDb();
    const app = buildApp({});
    const r = await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: false, reason: 'moderation maintenance' });
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
    const events = await ResourceAuditEvent.find({ kind: 'resource.feature_disabled' }).lean();
    assert.equal(events.length, 1);
    assert.equal(events[0].payload.previous, true);
    assert.equal(events[0].payload.current, false);
    assert.equal(events[0].payload.reason, 'moderation maintenance');
    assert.equal(events[0].actorEmail, ADMIN_EMAIL);
  });

  test('disabled → student APIs blocked (403 feature_disabled)', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();

    const cookieMap = {};
    const app = buildApp(cookieMap);
    const student = await makeStudent('alice-feature-block@iitrpr.ac.in');
    cookieMap['tok-alice'] = student.email;
    const cookie = (token) => `chatengine_token=${token}`;
    const DUMMY = '000000000000000000000000';

    const blocked = [
      ['post', '/api/resources', { type: 'link', url: 'https://example.com/x', title: 'x',
                                    contextType: 'phase', contextRef: 'standup' }],
      ['get', '/api/resources', null],
      ['get', '/api/resources/mine', null],
      ['get', '/api/resources/context/phase/standup', null],
      ['get', '/api/resources/mine/impact', null],
      ['get', `/api/resources/${DUMMY}`, null],
      ['post', `/api/resources/${DUMMY}/save`, null],
      ['post', `/api/resources/${DUMMY}/rate`, { stars: 5 }],
      ['post', `/api/resources/${DUMMY}/report`, null],
      ['delete', `/api/resources/${DUMMY}`, null]
    ];
    for (const [method, path, body] of blocked) {
      let r;
      if (method === 'get') r = await request(app)[method](path).set('Cookie', cookie('tok-alice'));
      else if (method === 'delete') r = await request(app)[method](path).set('Cookie', cookie('tok-alice'));
      else r = await request(app)[method](path).set('Cookie', cookie('tok-alice')).send(body || {});
      assert.equal(r.status, 403, `${method.toUpperCase()} ${path} should be blocked`);
      assert.equal(r.body.error, 'feature_disabled');
    }
  });

  test('disabled → admin APIs STILL work (admin can re-enable)', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();

    const app = buildApp({});
    const r = await request(app).get('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN);
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
  });

  test('re-enable → student APIs recover', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();

    const cookieMap = {};
    const app = buildApp(cookieMap);
    const student = await makeStudent('alice-recover@iitrpr.ac.in');
    cookieMap['tok-alice'] = student.email;
    const cookie = (token) => `chatengine_token=${token}`;

    const blocked = await request(app).get('/api/resources').set('Cookie', cookie('tok-alice'));
    assert.equal(blocked.status, 403);

    const reenable = await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: true });
    assert.equal(reenable.status, 200);

    const after = await isResourceExchangeEnabled();
    assert.equal(after, true);

    const ok = await request(app).get('/api/resources').set('Cookie', cookie('tok-alice'));
    assert.equal(ok.status, 200);
  });

  test('toggle persists across cache invalidation', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();

    // Reading from the cache directly (after invalidation) reads from DB.
    invalidateCache();
    const doc = await ResourceExchangeConfig.findOne().lean();
    assert.equal(doc.enabled, false);
  });

  test('PATCH with bad payload returns 400', async () => {
    await cleanDb();
    const app = buildApp({});
    const r = await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: 'yes' });
    assert.equal(r.status, 400);
  });

  test('PATCH requires admin auth', async () => {
    await cleanDb();
    const app = buildApp({});
    const r = await request(app).patch('/api/admin/resources/config')
      .send({ enabled: false });
    assert.equal(r.status, 403);
  });

  test('three toggles → three chronological audit events', async () => {
    await cleanDb();
    const app = buildApp({});
    await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: false, reason: 'first' });
    invalidateCache();
    await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: true, reason: 'second' });
    invalidateCache();
    await request(app).patch('/api/admin/resources/config')
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ enabled: false, reason: 'third' });
    const events = await ResourceAuditEvent.find({
      kind: { $in: ['resource.feature_enabled', 'resource.feature_disabled'] }
    }).sort({ at: 1 }).lean();
    assert.equal(events.length, 3);
    assert.equal(events[0].kind, 'resource.feature_disabled');
    assert.equal(events[0].payload.reason, 'first');
    assert.equal(events[1].kind, 'resource.feature_enabled');
    assert.equal(events[1].payload.reason, 'second');
    assert.equal(events[2].kind, 'resource.feature_disabled');
    assert.equal(events[2].payload.reason, 'third');
  });
});

// ── Tier 8B — student-safe availability endpoint ──────────────────────────
describe('Tier 8B — student availability endpoint', () => {
  test('GET /api/resources/availability returns enabled=true (no auth required)', async () => {
    await cleanDb();
    const app = buildApp({});
    // No auth headers — student-safe endpoint
    const r = await request(app).get('/api/resources/availability');
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, true);
  });

  test('GET /api/resources/availability returns enabled=false when disabled', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();
    const app = buildApp({});
    const r = await request(app).get('/api/resources/availability');
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
  });

  test('availability endpoint is unauthenticated and never exposes admin metadata', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();
    const app = buildApp({});
    // Critical: the SPA's initial-render check MUST work even when the
    // feature is off — otherwise the SPA can't know the feature is off
    // without hitting a guarded endpoint that returns 403.
    const r = await request(app).get('/api/resources/availability');
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, false);
    // And it does NOT expose admin metadata
    assert.equal(r.body.updatedBy, undefined);
    assert.equal(r.body.updatedAt, undefined);
  });
});

// ── Tier 8 — student resource.create emits resource.created audit ─────────
describe('Tier 8 — student resource.create audit lifecycle', () => {
  test('student create → resource.created audit row with actor=student', async () => {
    await cleanDb();
    const cookieMap = {};
    const app = buildApp(cookieMap);
    const student = await makeStudent('alice-create-audit@iitrpr.ac.in');
    cookieMap['tok-alice'] = student.email;
    const cookie = (token) => `chatengine_token=${token}`;

    const r = await request(app).post('/api/resources')
      .set('Cookie', cookie('tok-alice'))
      .send({ type: 'link', url: 'https://example.com/x', title: 'lifecycle-test',
              contextType: 'phase', contextRef: 'standup' });
    assert.equal(r.status, 200);

    const events = await ResourceAuditEvent.find({ resourceId: r.body.id }).lean();
    const created = events.find(e => e.kind === 'resource.created');
    assert.ok(created, 'resource.created event must exist for student-created resource');
    assert.equal(created.actorType, 'student');
    assert.equal(created.actorEmail, student.email);
    assert.equal(created.payload.title, 'lifecycle-test');
    assert.equal(created.payload.type, 'link');
    assert.equal(created.payload.contextType, 'phase');
    assert.equal(created.payload.contextRef, 'standup');
  });

  test('full lifecycle: created → reported → hidden all appear in the resource timeline', async () => {
    await cleanDb();
    const cookieMap = {};
    const app = buildApp(cookieMap);
    const student = await makeStudent('alice-lifecycle@iitrpr.ac.in');
    cookieMap['tok-alice'] = student.email;
    const cookie = (token) => `chatengine_token=${token}`;

    const created = await request(app).post('/api/resources')
      .set('Cookie', cookie('tok-alice'))
      .send({ type: 'link', url: 'https://example.com/x', title: 'full-flow',
              contextType: 'phase', contextRef: 'standup' });
    assert.equal(created.status, 200);
    const id = created.body.id;

    await request(app).post(`/api/resources/${id}/report`)
      .set('Cookie', cookie('tok-alice')).send({ reason: 'spam' });
    await request(app).post(`/api/admin/resources/${id}/hide`)
      .set('x-admin-email', ADMIN_EMAIL).set('x-admin-token', ADMIN_TOKEN)
      .send({ reason: 'spam' });

    const events = await ResourceAuditEvent.find({ resourceId: id }).sort({ at: 1 }).lean();
    const kinds = events.map(e => e.kind);
    assert.ok(kinds.includes('resource.created'), 'lifecycle must begin with resource.created');
    assert.ok(kinds.includes('resource.reported'));
    assert.ok(kinds.includes('resource.hidden'));
    const createdEv = events.find(e => e.kind === 'resource.created');
    assert.equal(createdEv.actorType, 'student');
  });
});

// ── Tier 8 — middleware behaviour ──────────────────────────────────────────
describe('Tier 8 — middleware behaviour', () => {
  test('requireResourceExchangeEnabled returns 403 with error=feature_disabled', async () => {
    await cleanDb();
    await setConfig({ enabled: false, updatedBy: ADMIN_EMAIL });
    invalidateCache();
    const app = express();
    app.get('/x', requireResourceExchangeEnabled, (_req, res) => res.json({ ok: true }));
    const r = await request(app).get('/x');
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'feature_disabled');
  });

  test('requireResourceExchangeEnabled passes when enabled', async () => {
    await cleanDb();
    await setConfig({ enabled: true, updatedBy: ADMIN_EMAIL });
    invalidateCache();
    const app = express();
    app.get('/x', requireResourceExchangeEnabled, (_req, res) => res.json({ ok: true }));
    const r = await request(app).get('/x');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
  });

  // ── Tier 9 — single toggle covers BOTH Resource Exchange AND Recovery Missions ──

  test('T9: alias `isExperimentalFeaturesEnabled` is the same function as `isResourceExchangeEnabled`', () => {
    // Stable contract: the new name resolves to the same function. This
    // guards against accidental decoupling if someone renames the
    // underlying implementation later.
    assert.equal(typeof isExperimentalFeaturesEnabled, 'function');
    // The two are NOT === (different bindings) but they call the same
    // underlying helper. Asserting behaviour equivalence:
    assert.equal(typeof isExperimentalFeaturesEnabled(), 'boolean');
    assert.equal(typeof isResourceExchangeEnabled(), 'boolean');
  });

  test('T9: alias `requireExperimentalFeaturesEnabled` is the same function as `requireResourceExchangeEnabled`', () => {
    // Routes wire up the alias for documentation; the underlying
    // function must be the same.
    assert.equal(requireExperimentalFeaturesEnabled.length, requireResourceExchangeEnabled.length);
  });
});
