import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true, index: true },
  subcategory: { type: String, default: '' },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard', 'expert'],
    default: 'medium'
  },
  estimatedDuration: { type: Number, required: true },
  deadline: { type: Date, default: null },
  status: {
    type: String,
    enum: ['open', 'assigned', 'in_progress', 'completed', 'cancelled', 'disputed'],
    default: 'open',
    index: true
  },
  priceType: {
    type: String,
    enum: ['fixed', 'negotiable', 'range'],
    default: 'fixed'
  },
  estimatedPrice: { type: Number, required: true },
  priceRangeMin: { type: Number, default: null },
  priceRangeMax: { type: Number, default: null },
  escrowAmount: { type: Number, default: 0 },
  escrowHeldAt: { type: Date, default: null },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  buyerEmail: { type: String, index: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
  providerEmail: { type: String, default: null },
  providerAcceptedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  urgency: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
  attachments: [{ type: String }],
  tags: [{ type: String }],
  viewCount: { type: Number, default: 0 },
  applicationCount: { type: Number, default: 0 },
  isAiRecommended: { type: Boolean, default: false },
  recommendedProviderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null }
}, { timestamps: true });

serviceSchema.index({ buyerId: 1, status: 1 });
serviceSchema.index({ providerId: 1, status: 1 });
serviceSchema.index({ category: 1, difficulty: 1, status: 1 });
serviceSchema.index({ createdAt: -1 });
serviceSchema.index({ deadline: 1, status: 1 });

export default mongoose.model('Service', serviceSchema);