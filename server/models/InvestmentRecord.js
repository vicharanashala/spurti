import mongoose from 'mongoose';

const investmentRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  planKey: { type: String, required: true },
  principal: { type: Number, required: true },
  bonusRate: { type: Number, required: true },
  durationDays: { type: Number, required: true },
  attendanceRequirement: { type: Number, required: true },
  startDate: { type: Date, required: true, index: true },
  endDate: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['active', 'completed', 'failed', 'cancelled'],
    default: 'active',
    index: true
  },
  resolvedAt: { type: Date, default: null },
  attendedSessions: { type: Number, default: null },
  requiredSessions: { type: Number, default: null },
  transactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' }]
}, { timestamps: true });

investmentRecordSchema.index({ email: 1, status: 1 });
investmentRecordSchema.index({ endDate: 1, status: 1 });

export default mongoose.model('InvestmentRecord', investmentRecordSchema);
