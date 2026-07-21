import mongoose from 'mongoose';

const snapshotEntrySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true
  },
  rank: {
    type: Number,
    required: true
  },
  rawSP: {
    type: Number,
    required: true
  },
  normalizedScore: {
    type: Number,
    default: null
  }
}, { _id: false });

const leaderboardSnapshotSchema = new mongoose.Schema({
  leaderboardType: {
    type: String,
    required: true,
    enum: ['GLOBAL', 'WEEKLY', 'SKILL', 'COHORT_NORMALIZED'],
    index: true
  },
  skillCategory: {
    type: String,
    enum: ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'],
    default: null,
    index: true
  },
  weekStart: {
    type: Date,
    required: true,
    index: true
  },
  weekEnd: {
    type: Date,
    required: true
  },
  entries: [snapshotEntrySchema]
}, { timestamps: { createdAt: true, updatedAt: false } });

export default mongoose.model('LeaderboardSnapshot', leaderboardSnapshotSchema);
