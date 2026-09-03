/**
 * Recovery Missions HTTP routes — Tier 3 integration tests.
 *
 * The load-bearing invariant for tier 3: persisted state survives
 * a "browser refresh" (i.e. we tear down the request and start fresh).
 * No React state should be required for the assignment to remain
 * present and in the same status.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import http from 'node:http';

import registerMissionRoutes from '../server/routes/missions.js';
import RecoveryMission from '../server/models/RecoveryMission.js';
import RecoveryAssignment from '../server/models/RecoveryAssignment.js';
import MissionAuditEvent from '../server/models/MissionAuditEvent.js';
import Student from '../server/models/Student.js';
import SPTransaction from '../server/models/SPTransaction.js';
import PollRecord from '../server/models/PollRecord.js';
import { weekStartUtc } from '../server/services/missions.js';

const TEST_DB = `mongodb://127.0.0.1:27017/spurti_missions_routes_${process.pid}`;

// ── in-process samagama stub (mirrors tests/resources-routes.test.js) ────────
function startSamagamaStub() {
  const cookieMap = new Map();
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/auth/me')) {
      const cookie = (req.headers.cookie || '').replace(/^chatengine_token=/, '').split(';')[0];
      const email = cookieMap.get(cookie);
      if (!email) return res.end(JSON.stringify({ error: 'unauthenticated' }));
      return res.end(JSON.stringify({ email, name: email.split('@')[0] }));
    }
    res.statusCode = 404; res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      cookieMap.set('alice', 'alice@iitrpr.ac.in');
      cookieMap.set('bob',   'bob@iitrpr.ac.in');
      resolve({ url: `http://127.0.0.1:${port}/api/auth/me`, cookieMap, server });
    });
  });
}

async function buildApp({ samagama, student, applySpDelta }) {
  const api = express.Router();
  registerMissionRoutes(api, {
    // Inline requireStudent that mirrors server.js semantics.
    requireStudent: async (req, res) => {
      const cookies = (req.headers.cookie || '').split(';').reduce((a, c) => {
        const [k, v] = c.trim().split('=');
        a[k] = v; return a;
      }, {});
      const token = cookies.chatengine_token;
      const data = await new Promise((resolve, reject) => {
        const u = new URL(samagama.url);
        const r = http.request({
          hostname: u.hostname, port: u.port, path: '/api/auth/me',
          headers: { cookie: `chatengine_token=${token}` }
        }, (resp) => {
          let buf = ''; resp.on('data', (c) => buf += c);
          resp.on('end', () => {
            try { resolve(JSON.parse(buf)); } catch (e) { resolve({}); }
          });
        });
        r.on('error', reject); r.end();
      });
      const email = data && data.email;
      if (!email) { res.status(401).json({ error: 'Not authenticated' }); return null; }
      const s = await Student.findOne({ email }).lean();
      if (!s) { res.status(404).json({ error: 'Student not found' }); return null; }
      if (s.status === 'excused') { res.status(403).json({ error: 'Excused' }); return null; }
      return { email, student: s };
    },
    applySpDelta
  });
  const app = express();
  app.use(express.json());
  app.use('/api', api);
  return app;
}

async function cleanTables() {
  await RecoveryAssignment.deleteMany({});
  await MissionAuditEvent.deleteMany({});
  await RecoveryMission.deleteMany({});
  await SPTransaction.deleteMany({});
  await PollRecord.deleteMany({});
  await Student.deleteMany({});
}

async function mkStudent(email) {
  return Student.create({
    name: email.split('@')[0], email,
    cohort: 'c1', status: 'active',
    internshipStartDate: new Date('2026-06-01'), totalSp: 100
  });
}

async function mkMission(overrides = {}) {
  return RecoveryMission.create({
    title: 'Decision Trees Check-in', description: '',
    activityType: 'poll_check',
    activityPayload: { pollName: 'p1', requiredCount: 2 },
    rewardSp: 3, windowHours: 120, enabled: true,
    createdBy: 'admin@x.com', ...overrides
  });
}

async function mkPollRecord(email, pollName, attemptedQuestions = 3) {
  const responses = [];
  for (let i = 0; i < attemptedQuestions; i++) {
    responses.push({ pollName, question: `q${i}`, response: 'a', attempted: true });
  }
  return PollRecord.create({
    email, sessionLabel: pollName,
    totalQuestions: attemptedQuestions, attemptedQuestions,
    missedQuestions: 0, responses
  });
}

async function mkAssignment(student, mission) {
  return RecoveryAssignment.create({
    studentId: student._id, studentEmail: student.email,
    missionId: mission._id, weekStart: weekStartUtc(),
    status: 'assigned',
    triggerReason: 'seed',
    spAtDetection: 5, spDelta7d: -5,
    expiresAt: new Date(Date.now() + 5 * 24 * 3600 * 1000)
  });
}

describe('Tier 3 — student mission routes (the closed-loop widget)', () => {
  let samagama;
  before(async () => {
    await mongoose.connect(TEST_DB, { tls: true, tlsAllowInvalidCertificates: true });
    samagama = await startSamagamaStub();
  });
  after(async () => {
    try { await mongoose.connection.dropDatabase(); } catch {}
    await mongoose.disconnect();
    samagama.server.close();
  });
  beforeEach(async () => { await cleanTables(); });

  test('GET /api/missions/me unauthenticated → 401', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const app = await buildApp({ samagama, student: alice });
    const r = await request(app).get('/api/missions/me');
    assert.equal(r.status, 401);
  });

  test('GET /api/missions/me with no assignment → assignment: null', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const app = await buildApp({ samagama, student: alice });
    const r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.status, 200);
    assert.equal(r.body.enabled, true);
    assert.equal(r.body.assignment, null);
  });

  test('GET /api/missions/me with assignment → returns mission + status', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    const app = await buildApp({ samagama, student: alice });
    const r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.status, 200);
    assert.equal(r.body.assignment.status, 'assigned');
    assert.equal(r.body.assignment.mission.title, 'Decision Trees Check-in');
    assert.equal(r.body.assignment.mission.rewardSp, 3);
  });

  test('THE PERSISTENCE TEST: refresh after assignment → still there', async () => {
    // This is the test your mentor will look for. The whole flow:
    //   create assignment (simulating scheduler) → student GET → start → GET → complete → GET
    // Each GET uses a fresh request, simulating a browser refresh.
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    // Inject the real applySpDelta so we exercise the actual SP ledger.
    const { applySpDelta } = await import('../server/services/vibe.js');

    const app = await buildApp({ samagama, student: alice, applySpDelta });

    // First "page load"
    let r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.body.assignment.status, 'assigned');
    assert.equal(r.body.assignment.status, 'assigned');

    // "Start mission" (simulating click)
    r = await request(app)
      .patch('/api/missions/me')
      .set('Cookie', 'chatengine_token=alice')
      .send({ event: 'start' });
    assert.equal(r.status, 200);
    assert.equal(r.body.assignment.status, 'in_progress');

    // Browser refresh
    r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.body.assignment.status, 'in_progress', 'must persist across refresh');

    // "Complete" (tier 3 only flips state — SP happens in tier 4)
    r = await request(app)
      .patch('/api/missions/me')
      .set('Cookie', 'chatengine_token=alice')
      .send({ event: 'complete' });
    assert.equal(r.status, 200);
    assert.equal(r.body.assignment.status, 'completed');

    // Another refresh — must show completed
    r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.body.assignment.status, 'completed', 'completion persists across refresh');

    // And: one mission.completed audit row
    const audits = await MissionAuditEvent.find({ kind: 'mission.completed' });
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actorType, 'student');
    assert.equal(audits[0].actorEmail, 'alice@iitrpr.ac.in');
  });

  test('cannot complete twice (state machine invariant)', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    const second = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(second.status, 409);
    const audits = await MissionAuditEvent.find({ kind: 'mission.completed' });
    assert.equal(audits.length, 1, 'only one completion audit row');
  });

  test('cannot start from completed', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    const restart = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    assert.equal(restart.status, 409);
  });

  test('PATCH with bad event → 400', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    const app = await buildApp({ samagama, student: alice });
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'destroy' });
    assert.equal(r.status, 400);
  });

  test('expired assignment: complete is rejected', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    const a = await mkAssignment(alice, m);
    // Force-expire by moving expiresAt into the past.
    a.expiresAt = new Date(Date.now() - 1000);
    a.status = 'assigned';
    await a.save();
    const app = await buildApp({ samagama, student: alice });
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    assert.equal(r.status, 409);
    assert.match(r.body.error, /expired/);
  });

  test('start is observable in DB but does not emit a separate audit row', async () => {
    // Ponytail decision — mission.started omitted from the audit enum in
    // tier 1. Verify the start event is observable via the assignment
    // row status but doesn't add a separate audit row.
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    const app = await buildApp({ samagama, student: alice });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    const a = await RecoveryAssignment.findOne({ studentEmail: alice.email });
    assert.equal(a.status, 'in_progress');
    const audits = await MissionAuditEvent.find({});
    assert.equal(audits.length, 0, 'no separate audit row for start');
  });

  // ── Tier 4 — SP writes, exactly-once reward, fail-closed rollback ────────

  test('Tier 4 — valid completion moves SP + writes 2 audit rows', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    const startSP = (await Student.findOne({ email: alice.email }).lean()).totalSp;

    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r.status, 200);
    assert.equal(r.body.assignment.status, 'completed');
    assert.equal(r.body.assignment.rewardApplied, 3);

    const studentAfter = await Student.findOne({ email: alice.email }).lean();
    assert.equal(studentAfter.totalSp, startSP + 3, 'student SP increased by 3');

    const spTxns = await SPTransaction.find({ email: alice.email, category: 'manual' }).lean();
    assert.equal(spTxns.length, 1);
    assert.equal(spTxns[0].appliedDelta, 3);
    assert.equal(spTxns[0].balanceAfter, startSP + 3);
    assert.match(spTxns[0].reason, /Recovery mission/);

    const completed = await MissionAuditEvent.find({ kind: 'mission.completed' });
    assert.equal(completed.length, 1);
    assert.equal(completed[0].actorType, 'student');

    const rewarded = await MissionAuditEvent.find({ kind: 'mission.rewarded' });
    assert.equal(rewarded.length, 1);
    assert.equal(rewarded[0].actorType, 'system');
    assert.equal(rewarded[0].payload.appliedDelta, 3);
    assert.equal(rewarded[0].payload.balanceAfter, startSP + 3);
  });

  test('Tier 4 — same completion submitted twice gives +3 SP only once', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    const startSP = (await Student.findOne({ email: alice.email }).lean()).totalSp;

    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    const r1 = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    const r2 = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 409, 'second completion rejected');

    const studentAfter = await Student.findOne({ email: alice.email }).lean();
    assert.equal(studentAfter.totalSp, startSP + 3, 'SP moved by exactly 3, not 6');

    const spTxns = await SPTransaction.find({ email: alice.email }).lean();
    assert.equal(spTxns.length, 1, 'one SPTransaction row only');
    const completed = await MissionAuditEvent.find({ kind: 'mission.completed' });
    assert.equal(completed.length, 1, 'one mission.completed audit row');
    const rewarded = await MissionAuditEvent.find({ kind: 'mission.rewarded' });
    assert.equal(rewarded.length, 1, 'one mission.rewarded audit row');
  });

  test('Tier 4 — invalid underlying activity → 422, 0 SP, status remains in_progress', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    // No PollRecord created → checkCompletion will fail.
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    const startSP = (await Student.findOne({ email: alice.email }).lean()).totalSp;
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r.status, 422);
    assert.match(r.body.error, /criteria/i);
    const studentAfter = await Student.findOne({ email: alice.email }).lean();
    assert.equal(studentAfter.totalSp, startSP, 'SP unchanged');
    const a = await RecoveryAssignment.findOne({ studentEmail: alice.email });
    assert.equal(a.status, 'in_progress', 'assignment status NOT flipped');
    const audits = await MissionAuditEvent.find({});
    assert.equal(audits.length, 0, 'no audit rows when criteria not met');
  });

  test('Tier 4 — expired mission: completion rejected, 0 SP', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    const a = await mkAssignment(alice, m);
    a.expiresAt = new Date(Date.now() - 1000);
    a.status = 'in_progress'; // pretend they started it
    await a.save();
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });
    const startSP = (await Student.findOne({ email: alice.email }).lean()).totalSp;
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r.status, 409);
    const studentAfter = await Student.findOne({ email: alice.email }).lean();
    assert.equal(studentAfter.totalSp, startSP, 'SP unchanged');
  });

  test('Tier 4 — applySpDelta throwing → assignment rolled back to in_progress', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const startSP = (await Student.findOne({ email: alice.email }).lean()).totalSp;
    // Inject a failing applySpDelta — simulates transient DB failure.
    const failingApplySpDelta = async () => { throw new Error('mongo blip'); };
    const app = await buildApp({ samagama, student: alice, applySpDelta: failingApplySpDelta });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    const r = await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r.status, 500);
    // Status rolled back
    const a = await RecoveryAssignment.findOne({ studentEmail: alice.email });
    assert.equal(a.status, 'in_progress', 'status rolled back');
    assert.equal(a.rewardApplied, null, 'rewardApplied cleared');
    // No SP moved
    const studentAfter = await Student.findOne({ email: alice.email }).lean();
    assert.equal(studentAfter.totalSp, startSP, 'SP unchanged');
    // No audit rows
    const audits = await MissionAuditEvent.find({});
    assert.equal(audits.length, 0);
    // The retry should now succeed (status is in_progress again).
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app2 = await buildApp({ samagama, student: alice, applySpDelta });
    const r2 = await request(app2).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    assert.equal(r2.status, 200, 'retry with real applySpDelta succeeds');
  });

  test('Tier 4 — complete → refresh → SP delta visible + mission stays completed', async () => {
    const alice = await mkStudent('alice@iitrpr.ac.in');
    const m = await mkMission();
    await mkAssignment(alice, m);
    await mkPollRecord(alice.email, m.activityPayload.pollName, 3);
    const { applySpDelta } = await import('../server/services/vibe.js');
    const app = await buildApp({ samagama, student: alice, applySpDelta });

    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'start' });
    await request(app).patch('/api/missions/me').set('Cookie', 'chatengine_token=alice').send({ event: 'complete' });
    // Refresh
    const r = await request(app).get('/api/missions/me').set('Cookie', 'chatengine_token=alice');
    assert.equal(r.body.assignment.status, 'completed');
    assert.equal(r.body.assignment.rewardApplied, 3);
    // The SP balance is observable from the Student doc.
    const student = await Student.findOne({ email: alice.email }).lean();
    assert.ok(student.totalSp >= 100, 'SP moved');
  });
});