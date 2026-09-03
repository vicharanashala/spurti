import mongoose from 'mongoose';

// Student-submitted report against a Resource. Two from distinct emails
// auto-hides the resource (handled in services/resources.js); admin can
// restore. Right now we do NOT add a per-resource `reportCount` denorm —
// counting is `countDocuments({resourceId, status:'open'})` at auto-hide
// time, fine at v1 volume.
const resourceReportSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  reason: { type: String, default: '', maxlength: 400 },
  status: { type: String, enum: ['open', 'dismissed', 'actioned', 'auto_hidden'], default: 'open', index: true },
  reviewedBy: { type: String, default: '' },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

// A student can report a resource only once while it's open. Re-reporting after
// admin restore creates a fresh report row.
resourceReportSchema.index({ resourceId: 1, email: 1, status: 1 }, { unique: true });

export default mongoose.model('ResourceReport', resourceReportSchema);
