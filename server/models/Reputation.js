import mongoose from 'mongoose';

const reputationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  trustScore: { type: Number, default: 50, min: 0, max: 100 },
  overallRating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  skillRatings: {
    type: Map,
    of: {
      rating: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
      totalScore: { type: Number, default: 0 }
    },
    default: {}
  },
  responseTime: {
    averageMinutes: { type: Number, default: 0 },
    count: { type: Number, default: 0 }
  },
  completionRate: { type: Number, default: 0, min: 0, max: 100 },
  qualityScore: { type: Number, default: 50, min: 0, max: 100 },
  reliabilityScore: { type: Number, default: 50, min: 0, max: 100 },
  disputeRate: { type: Number, default: 0, min: 0, max: 100 },
  totalTransactions: { type: Number, default: 0 },
  successfulTransactions: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  totalSpendings: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  isTopHelper: { type: Boolean, default: false },
  badges: [{
    id: { type: String },
    name: { type: String },
    icon: { type: String },
    earnedAt: { type: Date, default: Date.now }
  }],
  lastActiveAt: { type: Date, default: Date.now },
  streakDays: { type: Number, default: 0 }
}, { timestamps: true });

reputationSchema.index({ trustScore: -1 });
reputationSchema.index({ overallRating: -1 });
reputationSchema.index({ completionRate: -1 });
reputationSchema.index({ totalEarnings: -1 });
reputationSchema.index({ isTopHelper: 1, trustScore: -1 });

export default mongoose.model('Reputation', reputationSchema);