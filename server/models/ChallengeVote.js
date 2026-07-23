import mongoose from 'mongoose';

const challengeVoteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
  spInvested: { type: Number, required: true },
  status: { type: String, enum: ['active', 'withdrawn'], default: 'active', index: true },
  withdrawnAt: { type: Date, default: null }
}, { timestamps: true });

challengeVoteSchema.index({ email: 1, challengeId: 1, status: 1 }, { unique: true });

export default mongoose.model('ChallengeVote', challengeVoteSchema);
