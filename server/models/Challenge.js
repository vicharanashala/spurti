import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  banner: { type: String, default: '' }, // Gradient css or emoji
  type: {
    type: String,
    enum: ['Daily', 'Weekly', 'Monthly', 'Subject', 'Quiz', 'Coding', 'Attendance', 'Study Hours', 'Custom'],
    required: true
  },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'upcoming'],
    default: 'upcoming',
    index: true
  },
  maxParticipants: { type: Number, default: null },
  eligibilityRules: { type: String, default: '' },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Easy' },
  tasksRequired: { type: Number, default: 1 },
  completionCriteria: {
    eventType: { type: String, required: true }, // e.g. 'quiz_complete', 'assignment_submit', 'attendance_mark', etc.
    details: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  rewardBadge: { type: String, default: '' },
  spPoints: { type: Number, default: 0 },
  winnerBonus: { type: Number, default: 0 },
  runnerUpBonus: { type: Number, default: 0 },
  thirdBonus: { type: Number, default: 0 },
  colorTheme: { type: String, default: 'linear-gradient(135deg, #176b87, #0f4d62)' },
  isRewarded: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Challenge', challengeSchema);
