import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  label: { type: String, required: true, unique: true, index: true },
  date: { type: Date, required: true, index: true },
  startDateTime: { type: Date, default: null },
  endDateTime: { type: Date, required: true, index: true },
  totalMinutes: { type: Number, required: true },
  type: { type: String, default: '' },
  attendanceFile: { type: String, default: '' },
  pollFile: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.model('Session', sessionSchema);
