import mongoose from 'mongoose';

const dailyMissionSummarySchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
  totalTasks: { type: Number, default: 0 },
  completedTasks: { type: Number, default: 0 },
  baseSpEarned: { type: Number, default: 0 },
  bonusSpEarned: { type: Number, default: 0 },
  qualityAverage: { type: Number, default: 0 },
  coachFeedback: { type: String, default: '' },
  coachFeedbackGeneratedAt: { type: Date, default: null }
}, { timestamps: true });

// Ensure unique summary per student per day
dailyMissionSummarySchema.index({ email: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyMissionSummary', dailyMissionSummarySchema);
