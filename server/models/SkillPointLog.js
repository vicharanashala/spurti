import mongoose from 'mongoose';

const skillPointLogSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  skillCategory: {
    type: String,
    enum: ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'],
    required: true,
    index: true
  },
  pointsDelta: {
    type: Number,
    required: true
  },
  sourceType: {
    type: String,
    enum: ['COURSE_COMPLETION', 'POLL', 'ATTENDANCE', 'MANUAL'],
    required: true
  },
  sourceRefId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },
  awardedAt: {
    type: Date,
    default: Date.now,
    required: true,
    index: true
  }
}, { timestamps: true });

// Compound index
skillPointLogSchema.index({ studentId: 1, skillCategory: 1 });

export default mongoose.model('SkillPointLog', skillPointLogSchema);
