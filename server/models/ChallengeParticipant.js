import mongoose from 'mongoose';

const challengeParticipantSchema = new mongoose.Schema({
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null },
  status: { type: String, enum: ['joined', 'left', 'completed'], default: 'joined', index: true },
  completedAt: { type: Date, default: null },
  rewardClaimed: { type: Boolean, default: false }
}, { timestamps: true });

challengeParticipantSchema.index({ challengeId: 1, email: 1 }, { unique: true });

export default mongoose.model('ChallengeParticipant', challengeParticipantSchema);
