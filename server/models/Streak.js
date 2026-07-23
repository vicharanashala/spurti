import mongoose from 'mongoose';

const streakSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  currentStreak: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  heartsRemaining: { type: Number, default: 2 },
  heartsUsed: { type: Number, default: 0 },
  lastQualifyingDate: { type: String, default: '' },
  lastProcessedDate: { type: String, default: '' },
  streakStartDate: { type: Date, default: null },
  totalStreakSp: { type: Number, default: 0 },
  lastHeartUseDate: { type: String, default: '' },
  history: [{
    date: { type: String },
    sp: { type: Number },
    type: { type: String, enum: ['daily', 'milestone', 'heart_save'] }
  }]
}, { timestamps: true });

streakSchema.index({ currentStreak: -1 });

export default mongoose.model('Streak', streakSchema);
