import mongoose from 'mongoose';

// Per-student SPA (peer-teaching endorsement) progress for the SPA→SP module.
// Locally seeded with DUMMY values; in production these counts come from the
// `act_spa_*` collections in `sakshi_spurti`:
//   learnValidated = # endorsements RECEIVED with status in {approved, audit_passed}
//   teachValidated = # endorsements GIVEN     with status in {approved, audit_passed}
//   auditFail      = has a genuine audit_failure_* penalty (viva-failed on review)
//   fraud          = genuine fraud AFTER netting teacher_fraud_penalty vs
//                    fraud_penalty_reversal (test/reversed rows are NOT fraud)
//
// SP is credited AUTOMATICALLY as activity arrives — +5 per validated question
// learned, +8 per validated peer taught — via syncSpaSp(). The *Credited fields
// are watermarks of how many events have already been posted to the SP ledger,
// so re-syncs only post the delta (idempotent). No student "claim" step.
const spaProgressSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, unique: true },
  activity: { type: String, default: 'Activity 1: Linear Algebra' },
  learnValidated: { type: Number, default: 0 },     // good endorsements received (from mirror)
  teachValidated: { type: Number, default: 0 },     // good endorsements given (from mirror)
  learnCredited: { type: Number, default: 0 },       // learns already posted to the ledger
  teachCredited: { type: Number, default: 0 },       // teaches already posted to the ledger
  auditFail: { type: Boolean, default: false },      // → one-time -20% of current SP
  fraud: { type: Boolean, default: false },          // → one-time -50% of current SP
  auditPenaltyApplied: { type: Boolean, default: false },
  fraudPenaltyApplied: { type: Boolean, default: false },
  penaltyApplied: { type: Number, default: 0 },      // total SP removed by integrity penalties
  penaltyAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('SpaProgress', spaProgressSchema);
