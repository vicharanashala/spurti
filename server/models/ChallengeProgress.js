import mongoose from 'mongoose';

const challengeProgressSchema = new mongoose.Schema({
  challengeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Challenge', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  completedTasks: { type: Number, default: 0 },
  targetTasks: { type: Number, required: true },
  progressPct: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now },
  history: [{
    action: { type: String, required: true },
    value: { type: Number, default: 1 },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

challengeProgressSchema.index({ challengeId: 1, email: 1 }, { unique: true });

export default mongoose.model('ChallengeProgress', challengeProgressSchema);
