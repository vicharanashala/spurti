import mongoose from 'mongoose';

/**
 * ResourceAuditEvent — append-only audit log for the Resource Exchange.
 *
 * ponytail: NOT cryptographically tamper-resistant. The "append-only" contract
 * is enforced at the application layer — there is no Mongoose update or delete
 * path in this codebase. A bad-faith actor with the Mongo connection string
 * could still mutate rows directly. If dispute resolution ever becomes
 * load-bearing, add a chained-hash column (see plan §audit-hash-tampering).
 *
 * Event envelope (all required):
 *   resourceId  — the Resource this event is about
 *   actorType   — 'admin' | 'student' | 'system'
 *   actorEmail  — string | null  (system events have no email)
 *   kind        — see VALID_KINDS below
 *   payload     — structured object, never a single human string
 *   createdAt   — timestamp, indexed
 *
 * Indexes are designed for the two queries the audit UI is allowed to make:
 *   1. "events for this resource, newest first"  (per-resource log)
 *   2. "events of this kind, by this actor, in time range"  (cross-resource)
 */
const VALID_KINDS = [
  'resource.created',
  'resource.updated',
  'resource.reported',
  'resource.auto_hidden',
  'resource.hidden',
  'resource.restored',
  'resource.deleted',
  'resource.report_resolved',
  // Tier 8 — feature-level toggle (admin disables / re-enables Resource Exchange).
  'resource.feature_enabled',
  'resource.feature_disabled',
  // Tier 10 — admin curation actions. Each is a one-shot toggle.
  'resource.verified',
  'resource.highlighted',
  'resource.pinned'
];
const VALID_ACTOR_TYPES = ['admin', 'student', 'system'];

const resourceAuditEventSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  actorType: { type: String, enum: VALID_ACTOR_TYPES, required: true, index: true },
  actorEmail: { type: String, default: null, lowercase: true, trim: true },
  kind: { type: String, enum: VALID_KINDS, required: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Renamed from `createdAt` to `at` to make the column name match the common
  // audit-log convention; avoids confusion with mongoose's built-in `createdAt`.
  at: { type: Date, default: Date.now, index: true }
}, { timestamps: false, collection: 'resourceauditevents' });

// Compound index: per-resource audit view, sorted newest-first.
resourceAuditEventSchema.index({ resourceId: 1, at: -1 });
// Compound index: cross-resource filter by actor + kind + time range.
resourceAuditEventSchema.index({ actorType: 1, kind: 1, at: -1 });

export const RESOURCE_AUDIT_KINDS = VALID_KINDS;
export const RESOURCE_AUDIT_ACTOR_TYPES = VALID_ACTOR_TYPES;

export default mongoose.model('ResourceAuditEvent', resourceAuditEventSchema);
