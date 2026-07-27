import mongoose from 'mongoose';

// Per-student ViBe course progress. In production this is refreshed from the ViBe
// leaderboard API (completionPercentage). Here it is seeded with DUMMY values so
// the module can run locally without the live snapshot cron.
const vibeProgressSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, index: true },
  course: { type: String, required: true },          // 'onboarding' | 'ai' | 'mern'
  pct: { type: Number, default: 0 },                 // completionPercentage 0–100 (from ViBe)
  weekHours: { type: Number, default: 0 },           // content-hours done this week (for the floor)
  priorCompleted: { type: Boolean, default: false }  // credited from a prior program (sheet crosswalk)
}, { timestamps: true });

vibeProgressSchema.index({ email: 1, course: 1 }, { unique: true });

export default mongoose.model('VibeProgress', vibeProgressSchema);
