import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  buildAuditEvent, appendAudit, captureContextChange, captureFieldChanges,
  buildUpdatePayload, AUDIT_KINDS, AUDIT_ACTOR_TYPES, AUDIT_HIDE_REASONS
} from '../server/services/audit.js';
import ResourceAuditEvent from '../server/models/ResourceAuditEvent.js';

const TEST_DB = `mongodb://127.0.0.1:27017/spurti_audit_test_${process.pid}`;

// Tiny valid ObjectId string for envelope-validation tests (no DB write).
const validObjectId = new mongoose.Types.ObjectId().toString();

// ── buildAuditEvent — pure envelope validation ──────────────────────────
describe('buildAuditEvent — envelope validation', () => {
  test('accepts a complete event', () => {
    const ev = buildAuditEvent({
      resourceId: validObjectId,
      actorType: 'admin',
      actorEmail: 'AdminB@iitrpr.ac.in',
      kind: 'resource.restored',
      payload: { reason: 'reviewed and confirmed valid' }
    });
    assert.equal(ev.actorType, 'admin');
    // actorEmail normalised: lowercased + trimmed
    assert.equal(ev.actorEmail, 'adminb@iitrpr.ac.in');
    assert.equal(ev.kind, 'resource.restored');
    assert.equal(ev.resourceId, validObjectId);
  });

  test('system events may omit actorEmail', () => {
    const ev = buildAuditEvent({
      resourceId: validObjectId,
      actorType: 'system',
      kind: 'resource.auto_hidden'
    });
    assert.equal(ev.actorEmail, null);
  });

  test('throws on invalid resourceId', () => {
    assert.throws(() => buildAuditEvent({
      resourceId: 'not-an-objectid',
      actorType: 'admin',
      kind: 'resource.deleted'
    }), /not a valid ObjectId/);
  });

  test('throws on unknown kind', () => {
    assert.throws(() => buildAuditEvent({
      resourceId: validObjectId, actorType: 'admin',
      kind: 'resource.something_made_up'
    }), /kind must be one of/);
  });

  test('throws on unknown actorType', () => {
    assert.throws(() => buildAuditEvent({
      resourceId: validObjectId, actorType: 'god', kind: 'resource.deleted'
    }), /actorType must be one of/);
  });

  test('throws on non-object payload (must be structured)', () => {
    assert.throws(() => buildAuditEvent({
      resourceId: validObjectId, actorType: 'student',
      kind: 'resource.reported', payload: 'just a sentence'
    }), /payload must be an object/);
    assert.throws(() => buildAuditEvent({
      resourceId: validObjectId, actorType: 'student',
      kind: 'resource.reported', payload: ['one', 'two']
    }), /payload must be an object/);
  });

  test('enforces the 10 valid kinds list (8 resource kinds + 2 feature-toggle kinds)', () => {
    // Tier 8 added resource.feature_enabled and resource.feature_disabled for
    // the admin feature toggle. The list is now 10.
    assert.equal(AUDIT_KINDS.length, 10);
    assert.ok(AUDIT_KINDS.includes('resource.created'));
    assert.ok(AUDIT_KINDS.includes('resource.auto_hidden'));
    assert.ok(AUDIT_KINDS.includes('resource.report_resolved'));
    assert.ok(AUDIT_KINDS.includes('resource.feature_enabled'));
    assert.ok(AUDIT_KINDS.includes('resource.feature_disabled'));
  });

  test('enforces the 3 valid actor types', () => {
    assert.deepEqual(AUDIT_ACTOR_TYPES.sort(), ['admin', 'student', 'system']);
  });
});

// ── captureContextChange — from → to correctness ──────────────────────
describe('captureContextChange — from → to for PATCH context', () => {
  test('returns null when patch doesn\'t touch context', () => {
    const before = { contextType: 'phase', contextRef: 'vibe' };
    assert.equal(captureContextChange(before, { title: 'new' }), null);
    assert.equal(captureContextChange(before, {}), null);
  });

  test('captures from→to when contextType changes', () => {
    const before = { contextType: 'phase', contextRef: 'vibe' };
    const patch  = { contextType: 'question', contextRef: '507f1f77bcf86cd799439011' };
    const c = captureContextChange(before, patch);
    assert.deepEqual(c.from, { contextType: 'phase', contextRef: 'vibe' });
    assert.deepEqual(c.to,   { contextType: 'question', contextRef: '507f1f77bcf86cd799439011' });
  });

  test('captures when only contextRef changes (same contextType)', () => {
    const before = { contextType: 'phase', contextRef: 'vibe' };
    const c = captureContextChange(before, { contextRef: 'standup' });
    assert.deepEqual(c.from, { contextType: 'phase', contextRef: 'vibe' });
    assert.deepEqual(c.to,   { contextType: 'phase', contextRef: 'standup' });
  });

  test('returns null when both fields present but unchanged', () => {
    const before = { contextType: 'phase', contextRef: 'vibe' };
    const c = captureContextChange(before, { contextType: 'phase', contextRef: 'vibe' });
    assert.equal(c, null);
  });
});

// ── captureFieldChanges — diff only the listed fields ────────────────
describe('captureFieldChanges — only emit changes', () => {
  const before = { title: 'old', description: 'd', url: 'https://a', tags: ['x', 'y'], type: 'link' };

  test('returns empty when nothing changed', () => {
    assert.deepEqual(captureFieldChanges(before, before), {});
  });

  test('emits changed field with from→to', () => {
    const out = captureFieldChanges(before, { ...before, title: 'new' });
    assert.deepEqual(out.title, { from: 'old', to: 'new' });
  });

  test('does not emit unchanged tracked fields', () => {
    const out = captureFieldChanges(before, { ...before, title: 'new' });
    assert.equal(out.description, undefined);
    assert.equal(out.url, undefined);
  });

  test('compares tags as sorted arrays (order-independent)', () => {
    // Same set of tags in different order = no change.
    const out = captureFieldChanges(before, { ...before, tags: ['y', 'x'] });
    assert.equal(out.tags, undefined);
  });

  test('emits tag diff when the set truly changed', () => {
    const out = captureFieldChanges(before, { ...before, tags: ['x', 'z'] });
    assert.deepEqual(out.tags, { from: ['x', 'y'], to: ['x', 'z'] });
  });
});

// ── buildUpdatePayload — single-shape for PATCH audit rows ────────────
describe('buildUpdatePayload — composes a structured PATCH payload', () => {
  test('combines field changes + context change + reason', () => {
    const fields = { title: { from: 'a', to: 'b' } };
    const ctx = { from: { contextType: 'phase', contextRef: 'vibe' },
                  to:   { contextType: 'phase', contextRef: 'standup' } };
    const p = buildUpdatePayload(fields, ctx, { reason: 'wrong_phase' });
    assert.deepEqual(p.changes.title, { from: 'a', to: 'b' });
    assert.deepEqual(p.changes.context, ctx);
    assert.equal(p.reason, 'wrong_phase');
  });

  test('omits empty changes when only context changed', () => {
    const ctx = { from: { contextType: 'phase', contextRef: 'vibe' },
                  to:   { contextType: 'phase', contextRef: 'standup' } };
    const p = buildUpdatePayload({}, ctx);
    assert.deepEqual(p, { changes: { context: ctx } });
  });
});

// ── appendAudit — actually writes + reads back, proving the contract ─
describe('appendAudit — DB round-trip', () => {
  before(async () => {
    await mongoose.connect(TEST_DB, { tls: true, tlsAllowInvalidCertificates: true });
    await ResourceAuditEvent.deleteMany({});
  });

  after(async () => {
    try { await mongoose.connection.dropDatabase(); } catch {}
    await mongoose.disconnect();
  });

  test('writes the event, reads it back exactly as structured', async () => {
    const saved = await appendAudit({
      resourceId: validObjectId,
      actorType: 'admin',
      actorEmail: 'AdminB@iitrpr.ac.in',
      kind: 'resource.restored',
      payload: { reason: 'reviewed and confirmed valid', previousStatus: 'hidden' }
    });
    const fromDb = await ResourceAuditEvent.findById(saved._id).lean();
    assert.equal(fromDb.resourceId.toString(), validObjectId);
    assert.equal(fromDb.actorEmail, 'adminb@iitrpr.ac.in');  // normalised
    assert.equal(fromDb.kind, 'resource.restored');
    assert.deepEqual(fromDb.payload, { reason: 'reviewed and confirmed valid', previousStatus: 'hidden' });
    assert.ok(fromDb.at instanceof Date);
  });

  test('system event persists without actorEmail', async () => {
    const saved = await appendAudit({
      resourceId: validObjectId,
      actorType: 'system',
      kind: 'resource.auto_hidden',
      payload: { trigger: 'report_threshold', reportCount: 3 }
    });
    const fromDb = await ResourceAuditEvent.findById(saved._id).lean();
    assert.equal(fromDb.actorType, 'system');
    assert.equal(fromDb.actorEmail, null);
    assert.deepEqual(fromDb.payload, { trigger: 'report_threshold', reportCount: 3 });
  });

  test('multiple events per resourceId sort newest-first', async () => {
    const id = new mongoose.Types.ObjectId().toString();
    await ResourceAuditEvent.deleteMany({ resourceId: id });
    await appendAudit({ resourceId: id, actorType: 'student', kind: 'resource.created', payload: {} });
    await new Promise(r => setTimeout(r, 5));
    await appendAudit({ resourceId: id, actorType: 'admin', kind: 'resource.hidden', payload: { reason: 'spam' } });
    await new Promise(r => setTimeout(r, 5));
    await appendAudit({ resourceId: id, actorType: 'admin', kind: 'resource.restored', payload: { reason: 'reviewed ok' } });
    const rows = await ResourceAuditEvent.find({ resourceId: id }).sort({ at: -1 }).lean();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].kind, 'resource.restored');
    assert.equal(rows[1].kind, 'resource.hidden');
    assert.equal(rows[2].kind, 'resource.created');
  });
});

// ── hide-reasons enum sanity (the audit UI dropdown source) ───────────
describe('AUDIT_HIDE_REASONS — admin UI dropdown is exhaustive', () => {
  test('covers the documented reasons', () => {
    // If you add a reason to the UI, add it here too — both sides read from
    // this constant, which is what keeps the dropdown and the validator in
    // sync. Frontend test should mirror this; see AdminView intent.
    for (const r of ['incorrect_information', 'duplicate', 'outdated',
                     'inappropriate', 'wrong_topic', 'copyright_concern', 'spam', 'other']) {
      assert.ok(AUDIT_HIDE_REASONS.includes(r), `missing reason: ${r}`);
    }
  });
});
