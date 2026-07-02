import mongoose from 'mongoose';

const weeklyRecapSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  studentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  weekLabel: { type: String, required: true },
  weekStart: { type: Date, required: true, index: true },
  weekEnd: { type: Date, required: true },
  narrative: { type: String, required: true },
  dataSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  generatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

weeklyRecapSchema.index({ studentEmail: 1, weekLabel: 1 }, { unique: true });

export default mongoose.model('WeeklyRecap', weeklyRecapSchema);
