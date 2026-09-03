import mongoose from 'mongoose';

/**
 * MissionAuditEvent — Tier 1 of Recovery Missions.
 *
 * SEPARATE from ResourceAuditEvent (intentional, see plan §audit-segregation):
 * Resource Exchange and Recovery Missions are independent features. Mixing
 * their events would pollute both admin monitors and the student-facing
 * timelines. Same envelope shape, different collection, same discipline.
 *
 * ponytail: not cryptographically tamper-resistant. Append-only contract
 * enforced at the application layer — no Mongoose update/delete path in
 * this codebase. If dispute resolution ever becomes load-bearing, add
 * a chained-hash column (mirroring what would be added to
 * ResourceAuditEvent). Same caveat as ResourceAuditEvent.
 *
 * Event envelope:
 *   assignmentId — the RecoveryAssignment this event is about (null for
 *                  template-level events; populated for per-assignment events)
 *   studentId    — the student involved (null for template-level events)
 *   actorType    — 'admin' | 'student' | 'system'
 *   actorEmail   — string | null
 *   kind         — see VALID_KINDS below (5 events, mission-specific)
 *   payload      — structured object
 *   at           — timestamp, indexed
 */
const VALID_KINDS = [
  'mission.assigned',     // scheduler created a RecoveryAssignment
  'mission.completed',    // student satisfied completion criteria; SP awarded
  'mission.expired',      // assignment window elapsed; no SP
  'mission.rewarded',     // SP delta actually written (separate from .completed
                           // so an SP-write failure is observable in isolation)
  'mission.template_changed'  // admin updated a template (rare; future-proofing)
];
// ponytail: the contract listed `mission.started` as a 5th event, but per
// the product-defining thread "started is necessary only if the UI tracks
// it" — v1 doesn't. Keep the enum locked at 4; adding events later is
// purely additive.
const VALID_ACTOR_TYPES = ['admin', 'student', 'system'];

const missionAuditEventSchema = new mongoose.Schema({
  assignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecoveryAssignment', default: null, index: true },
  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student',       default: null, index: true },
  actorType:    { type: String, enum: VALID_ACTOR_TYPES, required: true, index: true },
  actorEmail:   { type: String, default: null, lowercase: true, trim: true },
  kind:         { type: String, enum: VALID_KINDS, required: true, index: true },
  payload:      { type: mongoose.Schema.Types.Mixed, default: {} },
  at:           { type: Date, default: Date.now, index: true }
}, { timestamps: false, collection: 'missionauditevents' });

// Per-assignment timeline (newest first) — used by student widget +
// admin detail view.
missionAuditEventSchema.index({ assignmentId: 1, at: -1 });
// Per-student lifecycle (all assignments in time range).
missionAuditEventSchema.index({ studentId: 1, at: -1 });
// Admin monitor filters (by actor + kind in time range).
missionAuditEventSchema.index({ actorType: 1, kind: 1, at: -1 });

export const MISSION_AUDIT_KINDS = VALID_KINDS;
export const MISSION_AUDIT_ACTOR_TYPES = VALID_ACTOR_TYPES;

export default mongoose.model('MissionAuditEvent', missionAuditEventSchema);
