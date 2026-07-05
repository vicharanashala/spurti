import mongoose from 'mongoose';

const nudgeSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  studentEmail: { type: String, required: true, lowercase: true, trim: true },
  studentName: { type: String, required: true },
  reason: { type: String, enum: ['missed_sessions', 'sp_drop', 'no_polls', 'rank_drop'], required: true },
  message: { type: String, required: true },
  channel: { type: String, enum: ['inapp', 'email', 'both'], required: true },
  status: { type: String, enum: ['pending', 'sent', 'dismissed'], default: 'pending', index: true },
  sentAt: { type: Date, default: null },
  dismissedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

nudgeSchema.index({ studentId: 1, status: 1 });

export default mongoose.model('Nudge', nudgeSchema);
