import mongoose from 'mongoose';

// A student's self-declared internship plan: target dates to finish each phase.
// Soft goals (no SP staked here — that lives in the commitment/ViBe tab). Hitting
// a planned date can later award a completion bonus. One plan per student.
const journeyPlanSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, unique: true, index: true },
  vibeBy: { type: Date, default: null },      // finish all 3 ViBe courses by
  spaBy: { type: Date, default: null },       // solve all 53 SPA problems by
  projectBy: { type: Date, default: null }    // first / target project PR by
}, { timestamps: true });

export default mongoose.model('JourneyPlan', journeyPlanSchema);
