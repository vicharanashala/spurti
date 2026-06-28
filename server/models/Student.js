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
  leaderboardGroup: { type: String, default: '', index: true }
}, { timestamps: true });

studentSchema.index({ name: 'text', email: 'text', alternateEmail: 'text' });

export default mongoose.model('Student', studentSchema);
