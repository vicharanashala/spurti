import mongoose from 'mongoose';

const cohortSchema = new mongoose.Schema({
  name: { type: String, required: true },
  cohortType: { type: String, enum: ['summership', 'wintership', 'seasonal'], required: true, index: true },
  year: { type: Number, required: true, index: true },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null, index: true },
  studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  sessionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isActive: { type: Boolean, default: true, index: true }
}, { timestamps: true });

export default mongoose.model('Cohort', cohortSchema);
