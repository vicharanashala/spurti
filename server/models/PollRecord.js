import mongoose from 'mongoose';

const responseItemSchema = new mongoose.Schema({
  question: { type: String, default: '' },
  answer: { type: String, default: '' }
}, { _id: false });

const pollRecordSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  sessionLabel: { type: String, required: true, index: true },
  responses: { type: [responseItemSchema], default: [] },
  totalQuestions: { type: Number, default: 0 },
  answeredCount: { type: Number, default: 0 },
  participatedFully: { type: Boolean, default: false }
}, { timestamps: true });

pollRecordSchema.index({ studentId: 1, sessionLabel: 1 }, { unique: true });

export default mongoose.model('PollRecord', pollRecordSchema);
