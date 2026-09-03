import mongoose from 'mongoose';

/**
 * ResourceLike — tier 10.
 *
 * One row per (resourceId, studentId). Unique compound index prevents
 * double-likes. The denormalised likeCount on the Resource row is
 * the read path; this collection is the source of truth.
 */
const resourceLikeSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student',  required: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

resourceLikeSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });

export default mongoose.model('ResourceLike', resourceLikeSchema);
