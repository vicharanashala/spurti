import mongoose from 'mongoose';

const seasonStandingSchema = new mongoose.Schema({
  email:   { type: String, required: true, lowercase: true, trim: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  seasonId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Season',  required: true, index: true },
  // Snapshot of totalSp at the moment the season started (season start date or first tx after it)
  baselineSp: { type: Number, default: 0 },
  // Current cumulative SP earned during this season (computed, not stored long-term —
  // recalculated from transactions; baselineSp is the anchor)
  earnedSp:    { type: Number, default: 0 },
  // Best league achieved during this season (mirrors trophyLeague at peak)
  peakLeague:  { type: String, default: 'Bronze III' },
  // Count of qualified sessions within the season date window
  qualifiedSessions: { type: Number, default: 0 },
  // Unique rewards claimed (list of reward keys)
  claimedRewards: { type: [String], default: [] },
  // Optional: rank at season end (filled when season transitions to 'ended')
  finalRank:   { type: Number, default: null },
  finalPercentile: { type: Number, default: null }
}, { timestamps: true });

// One standing per student per season
seasonStandingSchema.index({ email: 1, seasonId: 1 }, { unique: true });
seasonStandingSchema.index({ seasonId: 1, earnedSp: -1 });

export default mongoose.model('SeasonStanding', seasonStandingSchema);