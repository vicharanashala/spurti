import mongoose from 'mongoose';

const resourceReportSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  reason: { type: String, required: true },
  details: { type: String, default: '' }
}, { timestamps: true });

resourceReportSchema.index({ resourceId: 1, studentId: 1 }, { unique: true });

export default mongoose.model('ResourceReport', resourceReportSchema);
