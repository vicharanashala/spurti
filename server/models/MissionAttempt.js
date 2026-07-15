import mongoose from 'mongoose';

const taskProgressSchema = new mongoose.Schema({
  taskIndex: { type: Number, required: true },
  completed: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  evidenceNote: { type: String, default: '' }
});

const missionAttemptSchema = new mongoose.Schema({
  studentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentName: { type: String, default: '' },
  missionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mission', required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'failed', 'abandoned'],
    default: 'active',
    index: true
  },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  dueAt: { type: Date, required: true },
  taskProgress: [taskProgressSchema],
  reflection: { type: String, default: '' },
  earnedSp: { type: Number, default: 0 },
  streak: { type: Number, default: 0 },           // consecutive days with ≥1 task completed
  spTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction', default: null }
}, { timestamps: true });

missionAttemptSchema.index({ studentEmail: 1, missionId: 1 });
missionAttemptSchema.index({ status: 1, dueAt: 1 });

export default mongoose.model('MissionAttempt', missionAttemptSchema);
