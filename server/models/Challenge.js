import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
  title: { type: String, required: true, index: true },
  description: { type: String, default: '' },
  type: {
    type: String,
    required: true,
    enum: ['attendance', 'poll_participation'],
    index: true
  },
  status: {
    type: String,
    enum: ['proposed', 'active', 'completed', 'archived'],
    default: 'proposed',
    index: true
  },
  rewardMultiplier: { type: Number, default: 2 },
  votingStartDate: { type: Date, required: true, index: true },
  votingEndDate: { type: Date, required: true, index: true },
  liveStartDate: { type: Date, default: null },
  liveEndDate: { type: Date, default: null },
  totalSpInvested: { type: Number, default: 0 },
  winnerEmails: { type: [String], default: [] }
}, { timestamps: true });

challengeSchema.index({ status: 1, votingEndDate: 1 });

export default mongoose.model('Challenge', challengeSchema);
