import mongoose from 'mongoose';

// One row per (resource, student) pair. Unique index makes saves
// naturally idempotent at the DB level — a double-click is a no-op,
// not a double-count.
const resourceSaveSchema = new mongoose.Schema({
  resourceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: false });

resourceSaveSchema.index({ resourceId: 1, email: 1 }, { unique: true });

export default mongoose.model('ResourceSave', resourceSaveSchema);
