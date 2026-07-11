import mongoose from 'mongoose';

const missionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },
  duration: { type: Number, default: 30 }, // Estimated duration in minutes
  deadline: { type: String, default: '' }, // Optional deadline time or date
  category: {
    type: String,
    enum: [
      'coding',
      'dsa',
      'reading',
      'assignment',
      'project',
      'research',
      'communication',
      'interview_prep',
      'ai',
      'other'
    ],
    default: 'other'
  },
  completed: { type: Boolean, default: false, index: true },
  completedAt: { type: Date, default: null },
  order: { type: Number, default: 0 },
  date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD
  qualityScore: { type: Number, default: null }, // Evaluated by AI (0-100)
  qualityEvaluation: {
    specificity: { type: Number, default: null },
    actionability: { type: Number, default: null },
    learningValue: { type: Number, default: null },
    difficulty: { type: Number, default: null },
    clarity: { type: Number, default: null },
    estimatedEffort: { type: Number, default: null },
    reasoning: { type: String, default: '' }
  },
  spEarned: { type: Number, default: 0 }
}, { timestamps: true });

// Compound index for fast queries of a student's missions on a specific day
missionSchema.index({ email: 1, date: 1 });

export default mongoose.model('Mission', missionSchema);
