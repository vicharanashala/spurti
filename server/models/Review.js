import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true, index: true },
  reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  reviewerEmail: { type: String, required: true },
  revieweeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  revieweeEmail: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  tags: [{ type: String }],
  isPublic: { type: Boolean, default: true },
  response: {
    text: { type: String, default: '' },
    respondedAt: { type: Date, default: null }
  },
  isVerified: { type: Boolean, default: true },
  helpfulCount: { type: Number, default: 0 }
}, { timestamps: true });

reviewSchema.index({ revieweeId: 1, createdAt: -1 });
reviewSchema.index({ serviceId: 1, reviewerId: 1 }, { unique: true });
reviewSchema.index({ rating: 1 });

export default mongoose.model('Review', reviewSchema);