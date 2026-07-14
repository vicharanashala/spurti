import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true, index: true },
  date: { type: Date, required: true, index: true },
  startDateTime: { type: Date, default: null },
  endDateTime: { type: Date, required: true, index: true },
  totalMinutes: { type: Number, required: true },
  type: { type: String, default: '' },
  attendanceFile: { type: String, default: '' },
  pollFile: { type: String, default: '' },
  instructorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Instructor', default: null, index: true },
  cohortId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cohort', default: null, index: true }
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
