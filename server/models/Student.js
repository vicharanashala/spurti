import mongoose from 'mongoose';

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  alternateEmail: { type: String, lowercase: true, trim: true, default: '', index: true },
  internshipStartDate: { type: Date, required: true, index: true },
  internshipEndDate: { type: Date, default: null },
  status: { type: String, enum: ['active', 'excused'], default: 'active', index: true },
  excusedAt: { type: Date, default: null },
  excusedReason: { type: String, default: '' },
  totalSp: { type: Number, default: 100, index: true },
  // Spurti Levels & Trophy Leagues — derived views over SP (see services/levels.js).
  highestSpEver: { type: Number, default: 100, index: true },
  level: { type: Number, default: 1 },
  trophyLeague: { type: String, default: 'Bronze II' },
  legendBadgeUnlocked: { type: Boolean, default: false },
  leaderboardGroup: { type: String, default: '', index: true },
  // Survey triangulation (perception follow-up). Set when the student submits
  // the dashboard pop-up Google Form — via the Apps Script webhook or the
  // "I've submitted" button. Drives whether the survey modal still shows.
  surveyCompleted: { type: Boolean, default: false, index: true },
  surveyCompletedAt: { type: Date, default: null },
  // Second perception pop-up ("poll2") — same mechanism as surveyCompleted, but an
  // independent flag so it never disturbs the first survey's completion state.
  poll2Completed: { type: Boolean, default: false, index: true },
  poll2CompletedAt: { type: Date, default: null },
  // Admin Notes (feature/admin-notes) — private notes admins keep on a student
  // (network issue, medical leave, follow-up). Never exposed to the student
  // (server.js strips it from /api/me).
  adminNote: { type: String, default: '' }
}, { timestamps: true });

studentSchema.index({ name: 'text', email: 'text', alternateEmail: 'text' });

export default mongoose.model('Student', studentSchema);
