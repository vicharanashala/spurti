import mongoose from 'mongoose';

// One row per (resource, student) — re-rating overwrites stars. Unique index.
const resourceRatingSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  stars: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

resourceRatingSchema.index({ resourceId: 1, email: 1 }, { unique: true });

export default mongoose.model('ResourceRating', resourceRatingSchema);
