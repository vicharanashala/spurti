import mongoose from 'mongoose';

/**
 * ResourceDownload — tier 10.
 *
 * One row per (resourceId, studentId). Tracks the first download only
 * (the denormalised count is the read path; subsequent downloads from
 * the same student do not increment). Unique compound index prevents
 * double-counting.
 */
const resourceDownloadSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  studentId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Student',  required: true, index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

resourceDownloadSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });

export default mongoose.model('ResourceDownload', resourceDownloadSchema);
