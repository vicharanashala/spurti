import mongoose from 'mongoose';

const resourceDownloadSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true }
}, { timestamps: true });

export default mongoose.model('ResourceDownload', resourceDownloadSchema);
