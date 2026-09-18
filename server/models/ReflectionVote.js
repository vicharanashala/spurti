import mongoose from 'mongoose';

const reflectionVoteSchema = new mongoose.Schema({
  voterEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  reflectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reflection', required: true, index: true },
  weekLabel: { type: String, required: true, trim: true, index: true },
  votedAt: { type: Date, default: Date.now }
}, { timestamps: true });

reflectionVoteSchema.index({ voterEmail: 1, weekLabel: 1 }, { unique: true });

export default mongoose.model('ReflectionVote', reflectionVoteSchema);
