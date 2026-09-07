import mongoose from 'mongoose';

// A student's self-declared internship plan: target dates to finish each phase.
// Soft goals (no SP staked here — that lives in the commitment/ViBe tab). Hitting
// a planned date can later award a completion bonus. One plan per student.
const journeyPlanSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, unique: true, index: true },
  standupBy: { type: Date, default: null },   // reach 3600 cumulative Zoom minutes by
  vibeBy: { type: Date, default: null },      // finish all 3 ViBe courses by
  spaBy: { type: Date, default: null },       // solve all 53 SPA problems by
  projectBy: { type: Date, default: null },   // first / target project PR by
  // How much work REMAINED at the moment each goal was set (written once per set;
  // goals lock, so this is the state the commitment was made against). This is what
  // lets a future goal-attainment reward tell a goal set at 40% done from one set
  // at 95% done — without it, near-completion goal-setting is indistinguishable
  // from a real commitment after the fact.
  atSet: { type: mongoose.Schema.Types.Mixed, default: {}, minimize: false }
}, { timestamps: true });

export default mongoose.model('JourneyPlan', journeyPlanSchema);
