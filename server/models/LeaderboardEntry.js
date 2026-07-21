import mongoose from 'mongoose';

const leaderboardEntrySchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
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
    validate: {
      validator: function(v) {
        if (this.leaderboardType === 'SKILL') {
          return ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'].includes(v);
        }
        return v === null || v === undefined;
      },
      message: 'skillCategory must be null unless leaderboardType is SKILL, and must be a valid skill category when leaderboardType is SKILL'
    }
  },
  weekStart: {
    type: Date,
    default: null,
    validate: {
      validator: function(v) {
        if (this.leaderboardType === 'WEEKLY') {
          return v instanceof Date && !isNaN(v.getTime());
        }
        return v === null || v === undefined;
      },
      message: 'weekStart is required and must be a valid date for WEEKLY leaderboard type, and must be null otherwise'
    }
  },
  rawSP: {
    type: Number,
    required: true,
    default: 0
  },
  normalizedScore: {
    type: Number,
    default: null,
    validate: {
      validator: function(v) {
        if (this.leaderboardType === 'COHORT_NORMALIZED') {
          return typeof v === 'number' && !isNaN(v);
        }
        return v === null || v === undefined;
      },
      message: 'normalizedScore is required and must be a number for COHORT_NORMALIZED leaderboard type, and must be null otherwise'
    }
  },
  rank: {
    type: Number,
    required: true
  },
  previousRank: {
    type: Number,
    default: null
  },
  rankDelta: {
    type: Number,
    default: 0
  },
  lastCalculatedAt: {
    type: Date,
    default: Date.now,
    required: true
  }
}, { timestamps: true });

// Compound indexes
leaderboardEntrySchema.index({ studentId: 1, leaderboardType: 1, skillCategory: 1 });
leaderboardEntrySchema.index({ leaderboardType: 1, weekStart: 1, rank: 1 });

export default mongoose.model('LeaderboardEntry', leaderboardEntrySchema);
