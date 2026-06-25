import mongoose from 'mongoose';

const sessionEventSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  event: { type: String, enum: ['page_view', 'page_stay', 'page_close'], required: true },
  page: { type: String, enum: ['intro', 'search', 'record', 'admin', 'admin-analytics', 'admin-attendance', 'admin-leaderboard', 'admin-sp-review', 'admin-live', 'admin-students', 'admin-investment', 'marketplace'], required: true },
  recordViewed: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

sessionEventSchema.index({ email: 1, timestamp: -1 });
sessionEventSchema.index({ timestamp: -1 });
sessionEventSchema.index({ page: 1, timestamp: -1 });

export default mongoose.model('SessionEvent', sessionEventSchema);