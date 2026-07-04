import mongoose from 'mongoose';

const challengeRewardSchema = new mongoose.Schema({
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  type: { type: String, enum: ['winner', 'runner_up', 'third', 'completion', 'badge'], required: true },
  spPoints: { type: Number, default: 0 },
  badge: { type: String, default: '' },
  awardedAt: { type: Date, default: Date.now },
  isAcknowledged: { type: Boolean, default: false, index: true }
}, { timestamps: true });

export default mongoose.model('ChallengeReward', challengeRewardSchema);
