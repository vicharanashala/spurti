import mongoose from 'mongoose';

const quizAttemptSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
  score: { type: Number, required: true },
  answers: [{ type: Number, required: true }],
  appliedDelta: { type: Number, required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction', index: true }
}, { timestamps: true });

// Ensure a student can attempt a quiz only once
quizAttemptSchema.index({ studentId: 1, quizId: 1 }, { unique: true });

export default mongoose.model('QuizAttempt', quizAttemptSchema);
