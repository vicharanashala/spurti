import mongoose from 'mongoose';

const pollResponseSchema = new mongoose.Schema({
  pollName: { type: String, default: '' },
  question: { type: String, default: '' },
  response: { type: String, default: '' },
  attempted: { type: Boolean, default: false }
}, { _id: false });

const pollRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  sessionLabel: { type: String, required: true, index: true },
  totalQuestions: { type: Number, default: 0 },
  attemptedQuestions: { type: Number, default: 0 },
  missedQuestions: { type: Number, default: 0 },
  responses: { type: [pollResponseSchema], default: [] },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' }
}, { timestamps: true });

pollRecordSchema.pre('save', function (next) {
  this.missedQuestions = Math.max(0, this.totalQuestions - this.attemptedQuestions);
  next();
});

pollRecordSchema.index({ email: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('PollRecord', pollRecordSchema);
