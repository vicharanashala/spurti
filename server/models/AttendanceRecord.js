import mongoose from 'mongoose';

const attendanceRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  sessionLabel: { type: String, required: true, index: true },
  attendedMinutes: { type: Number, default: 0, min: 0 },
  totalSessionMinutes: { type: Number, required: true, min: 1 },
  attendancePercentage: { type: Number, default: 0, min: 0, max: 100 },
  qualified: { type: Boolean, default: false },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' }
}, { timestamps: true });

attendanceRecordSchema.index({ email: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('AttendanceRecord', attendanceRecordSchema);
