import mongoose from 'mongoose';

const contestAttemptSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentName: { type: String, default: '' },
  contestId: { type: mongoose.Schema.Types.ObjectId, ref: 'Contest', required: true, index: true },
  attemptNumber: { type: Number, required: true },
  answers: [{ type: Number }], // Indices of chosen options
  score: { type: Number, required: true }, // Score as percentage (e.g. 80)
  passed: { type: Boolean, required: true },
  reflectionResponse: { type: String, default: '' },
  reflectionAwarded: { type: Boolean, default: false },
  earnedSp: { type: Number, default: 0 },
  spTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction', default: null },
  completedAt: { type: Date, default: Date.now }
}, { timestamps: true });

contestAttemptSchema.index({ studentEmail: 1, contestId: 1, attemptNumber: 1 });

export default mongoose.model('ContestAttempt', contestAttemptSchema);
