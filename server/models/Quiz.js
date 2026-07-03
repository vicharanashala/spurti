import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswerIndex: { type: Number, required: true },
  explanation: { type: String, required: true }
}, { _id: false });

const quizSchema = new mongoose.Schema({
  sessionLabel: { type: String, required: true, index: true },
  transcript: { type: String, required: true },
  questions: { type: [questionSchema], required: true },
  startTime: { type: Date, required: true, index: true },
  notifiedAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: 15 }
}, { timestamps: true });

export default mongoose.model('Quiz', quizSchema);
