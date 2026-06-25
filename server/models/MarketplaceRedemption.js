import mongoose from 'mongoose';

const marketplaceRedemptionSchema = new mongoose.Schema({
  petId:        { type: String, required: true },           // e.g. 'dragon'
  petName:      { type: String, required: true },           // e.g. 'Dragon'
  petEmoji:     { type: String, required: true },           // e.g. '🐉'
  spCost:       { type: Number, required: true },
  email:        { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  studentName:  { type: String, required: true },
  transactionId:{ type: mongoose.Schema.Types.ObjectId, ref: 'SPTransaction' }
}, { timestamps: true });

marketplaceRedemptionSchema.index({ email: 1, petId: 1 });
marketplaceRedemptionSchema.index({ createdAt: -1 });

export default mongoose.model('MarketplaceRedemption', marketplaceRedemptionSchema);
