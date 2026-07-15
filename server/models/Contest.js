import mongoose from 'mongoose';

const mcqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: Number, required: true }, // Index of the correct option (0, 1, 2...)
  timeLimit: { type: Number, default: 20 } // Time limit in seconds for Time Attack
});

const contestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  transcript: { type: String, default: '' },
  questions: [mcqSchema],
  scrambledWords: [{ type: String }], // Key words for word scramble mini-game
  reflectionPrompt: { type: String, default: 'What is your main takeaway from this session?' },
  reflectionSpBonus: { type: Number, default: 5 },
  threshold: { type: Number, default: 70 }, // Passing percentage (e.g. 70)
  spReward: { type: Number, default: 15 }, // SP reward for passing the quiz
  maxAttempts: { type: Number, default: 0 }, // 0 or null means unlimited
  isActive: { type: Boolean, default: false },
  startDate: { type: Date, default: null },
  endDate: { type: Date, default: null }
}, { timestamps: true });

contestSchema.index({ isActive: 1 });

export default mongoose.model('Contest', contestSchema);
