import mongoose from 'mongoose';

const attendanceRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  sessionLabel: { type: String, required: true, index: true },
  attendedMinutes: { type: Number, default: 0 },
  totalSessionMinutes: { type: Number, required: true },
  attendancePercentage: { type: Number, default: 0 },
  qualified: { type: Boolean, default: false },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' },
  sundayBonusEligible: { type: Boolean, default: false },
  sundayBonusPoints: { type: Number, default: 0 },
  sundayBonusTier: { type: String, default: 'none' },
  sundayBonusAttendancePoints: { type: Number, default: 0 },
  sundayBonusPollPoints: { type: Number, default: 0 },
  sundayBonusAttendanceMinutes: { type: Number, default: 0 },
  sundayBonusPollsAttempted: { type: Number, default: 0 },
  sundayBonusPollsTotal: { type: Number, default: 0 }
}, { timestamps: true });

attendanceRecordSchema.index({ email: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('AttendanceRecord', attendanceRecordSchema);
