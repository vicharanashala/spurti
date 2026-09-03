import mongoose from 'mongoose';

/**
 * RecoveryMission — Tier 1 of Recovery Missions feature.
 *
 * The TEMPLATE side of the lifecycle. Admin-curated. Defines what an
 * intervention looks like: which activity type, what context string,
 * what SP reward on completion, and how long the student has to act.
 *
 * Distinct from a per-student assignment (RecoveryAssignment). A mission
 * template exists once; an assignment is created from a template when
 * the scheduler runs and decides a specific student needs support.
 *
 * ponytail: the `activityType` enum is locked to two values for v1:
 *   - 'poll_check'   — uses existing PollRecord (3 questions)
 *   - 'contribute'   — uses existing Resource Exchange (1 share)
 * The user's contract locked this; adding types later is an additive
 * schema change (no migration) but the novelty thesis depends on
 * keeping the surface narrow.
 *
 * The novelty is in the DETECTION + ADAPTIVE ASSIGNMENT, not in
 * supporting more activity types. Resist the urge to expand this enum.
 */
const recoveryMissionSchema = new mongoose.Schema({
  title:        { type: String, required: true, trim: true, maxlength: 120 },
  description:  { type: String, default: '', maxlength: 400 },
  // Activity the student must do. The `activityPayload` shape depends on
  // `activityType` and is interpreted by the student-side renderer:
  //   - poll_check  : { questionIds: [ObjectId, ObjectId, ObjectId] }
  //                   exactly N=3 IDs from existing PollRecord
  //   - contribute  : { contextType: 'phase'|'topic', contextRef: '<str>' }
  activityType:    { type: String, enum: ['poll_check', 'contribute'], required: true, index: true },
  activityPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  // SP awarded on successful completion. Hard ceiling 5 enforced below.
  rewardSp: { type: Number, required: true, min: 1, max: 5 },
  // Window (in hours) the assignment stays valid once issued.
  windowHours: { type: Number, default: 24 * 5, min: 1, max: 24 * 14 },
  // Lifecycle flags — admin can disable a template without deleting it.
  enabled: { type: Boolean, default: true, index: true },
  createdBy: { type: String, default: '' },   // admin email
}, { timestamps: true });

recoveryMissionSchema.index({ enabled: 1, createdAt: -1 });

export default mongoose.model('RecoveryMission', recoveryMissionSchema);
