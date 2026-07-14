import mongoose from 'mongoose';

const challengeLeaderboardSchema = new mongoose.Schema({
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true },
  progressPct: { type: Number, default: 0 },
  completionPct: { type: Number, default: 0 },
  spEarned: { type: Number, default: 0 },
  rank: { type: Number, index: true },
  lastUpdated: { type: Date, default: Date.now }
}, { timestamps: true });

challengeLeaderboardSchema.index({ challengeId: 1, rank: 1 });

export default mongoose.model('ChallengeLeaderboard', challengeLeaderboardSchema);
