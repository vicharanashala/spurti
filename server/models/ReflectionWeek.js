import mongoose from 'mongoose';

const reflectionWeekSchema = new mongoose.Schema({
  weekLabel: { type: String, required: true, unique: true, trim: true, index: true },
  submissionStart: { type: Date, required: true },
  submissionEnd: { type: Date, required: true },
  votingStart: { type: Date, required: true },
  votingEnd: { type: Date, required: true },
  status: { type: String, enum: ['active', 'voting', 'finalized'], required: true, index: true },
  finalizedAt: { type: Date, default: null }
}, { timestamps: true });

export default mongoose.model('ReflectionWeek', reflectionWeekSchema);
