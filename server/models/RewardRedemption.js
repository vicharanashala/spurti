import mongoose from 'mongoose';

// Tracks each reward a student redeems with their Spurti Points. Kept separate
// from SPTransaction (which just records the SP debit) so admins get a clean
// view of *what* was redeemed, not just the point movement.
const rewardRedemptionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  rewardId: { type: String, required: true },
  rewardName: { type: String, required: true },
  cost: { type: Number, required: true },
  status: { type: String, enum: ['requested', 'fulfilled', 'cancelled'], default: 'requested' },
  requestedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('RewardRedemption', rewardRedemptionSchema);