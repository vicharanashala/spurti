import mongoose from 'mongoose';

const marketplaceTransactionSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', index: true },
  type: {
    type: String,
    enum: ['escrow_hold', 'escrow_release', 'escrow_refund', 'service_payment', 'service_reward', 'dispute_refund', 'dispute_penalty', 'bonus'],
    required: true,
    index: true
  },
  category: { type: String, default: 'marketplace' },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  reason: { type: String, required: true },
  counterpartyEmail: { type: String, default: '' },
  counterpartyServiceRole: { type: String, enum: ['buyer', 'provider', 'system'], default: 'buyer' },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'completed',
    index: true
  },
  escrowId: { type: String, default: null },
  disputeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dispute', default: null },
  dateTime: { type: Date, required: true, index: true }
}, { timestamps: true });

marketplaceTransactionSchema.index({ email: 1, dateTime: -1 });
marketplaceTransactionSchema.index({ serviceId: 1, type: 1 });
marketplaceTransactionSchema.index({ studentId: 1, category: 1 });

export default mongoose.model('MarketplaceTransaction', marketplaceTransactionSchema);