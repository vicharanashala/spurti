import mongoose from 'mongoose';

const resourceLikeSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true }
}, { timestamps: true });

resourceLikeSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });

export default mongoose.model('ResourceLike', resourceLikeSchema);
