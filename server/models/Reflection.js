import mongoose from 'mongoose';

const reflectionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  weekLabel: { type: String, required: true }, // e.g., "Week 1", "Week 2"
  weeklySpGoal: { type: Number, required: true },
  reflectionText: { type: String, default: '' },
  submitted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

reflectionSchema.index({ email: 1, weekLabel: 1 }, { unique: true });

export default mongoose.model('Reflection', reflectionSchema);
