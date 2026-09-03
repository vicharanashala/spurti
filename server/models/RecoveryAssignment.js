import mongoose from 'mongoose';

/**
 * RecoveryAssignment — Tier 1 of Recovery Missions.
 *
 * The INSTANCE side. One row per (student, week, mission). Created by
 * the scheduler (`scripts/runRecoveryMissions.js`) when the detection
 * function decides a student needs support.
 *
 * Lifecycle states:
 *   assigned   — student has been notified, hasn't started the activity yet
 *   in_progress — student opened the widget (UI signal; not authoritative)
 *   completed  — student satisfied `completeAssignment`; reward issued
 *   expired    — `windowHours` elapsed without completion; no reward
 *
 * The `closed loop` your mentor will look for depends on every state
 * transition emitting an audit row. See server/services/missions.js for
 * the audit-event wiring.
 *
 * Guardrails (enforced in `services/missions.js`, not at the schema
 * level so the schema stays generic if we add more mission types):
 *   - one assignment per (student, weekStart) — duplicate-prevented in the
 *     scheduler via a unique compound index
 *   - completion only writes if `status === 'assigned'|'in_progress'`
 *   - the same student cannot have a second `completed` row in the same
 *     week — unique compound on (studentId, weekStart, status=completed)
 *     is impossible to enforce at the schema level alone, so the service
 *     checks before inserting
 *
 * ponytail: the unique index is on (studentId, weekStart, missionId) so
 * re-running the scheduler for the same week is idempotent.
 */
const recoveryAssignmentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecoveryMission', required: true, index: true },
  // The week this assignment belongs to (Monday 00:00 UTC of that week).
  // Stored explicitly so weekly-cycle queries are cheap.
  weekStart: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['assigned', 'in_progress', 'completed', 'expired'],
    default: 'assigned',
    index: true
  },
  // Detection signal that triggered this assignment — what was the
  // student's recent-decline indicator? Stored so the admin monitor
  // can show "Trigger: 7-day SP delta -8" without re-running detection.
  triggerReason: { type: String, default: '' },
  // The student's SP at the moment of detection — useful for the admin
  // monitor and for proving the SP delta on completion.
  spAtDetection: { type: Number, default: 0 },
  // 7-day SP delta at detection (negative number = declined). Same use.
  spDelta7d: { type: Number, default: 0 },
  // Filled in when status flips to 'completed'. The actual SP delta was
  // applied at completion time; this column is just a denormalised echo
  // for the admin monitor (so it can show "+3" without a join).
  rewardApplied: { type: Number, default: null },
  completedAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

// Idempotent re-issue: re-running the scheduler for the same student/week
// cannot create a second row.
recoveryAssignmentSchema.index(
  { studentId: 1, weekStart: 1, missionId: 1 },
  { unique: true }
);
// Admin monitor query: "show me all assignments in the last 4 weeks by
// status, newest first".
recoveryAssignmentSchema.index({ status: 1, weekStart: -1 });
// Per-student recent-activity view.
recoveryAssignmentSchema.index({ studentId: 1, createdAt: -1 });

export default mongoose.model('RecoveryAssignment', recoveryAssignmentSchema);
