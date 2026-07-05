import mongoose from 'mongoose';

const spTransactionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  category: {
    type: String,
    required: true,
    index: true
  },
  sessionLabel: { type: String, default: '', index: true },
  deltaMode: { type: String, enum: ['absolute', 'percentage'], default: 'absolute' },
  deltaValue: { type: Number, default: 0 },
  appliedDelta: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reason: { type: String, required: true },
  dateTime: { type: Date, required: true, index: true }
}, { timestamps: true });

spTransactionSchema.index({ email: 1, dateTime: 1, createdAt: 1 });
spTransactionSchema.index({ sessionLabel: 1, category: 1 });

export default mongoose.model('SPTransaction', spTransactionSchema, 'sptransactions');
