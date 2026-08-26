import mongoose from 'mongoose';

// A programme notice shown on every student's dashboard until they press
// "Got it". Created by the team (admin route or mongosh); students never write.
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  postedAt: { type: Date, default: Date.now, index: true },
  // Empty = broadcast to everyone. Non-empty = only these (lowercased) emails see
  // the notice — the targeting that makes randomized-rollout experiments possible.
  audience: { type: [String], default: [] },
  // Deactivating hides the notice everywhere but keeps it and its acks for the
  // record — announcements are never deleted, so read-rates stay auditable.
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });

export default mongoose.model('Announcement', announcementSchema);
