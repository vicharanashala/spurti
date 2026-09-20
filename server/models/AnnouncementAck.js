import mongoose from 'mongoose';

// One row per student per announcement, written when they press "Got it".
// This is the read-tracking the team looks at: acks ÷ active students.
// An explicit button beats a passive "seen" stamp here — it distinguishes
// "the dashboard rendered it" from "the student says they read it".
const announcementAckSchema = new mongoose.Schema({
  announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', required: true },
  email: { type: String, required: true },
  ackedAt: { type: Date, default: Date.now }
});

announcementAckSchema.index({ announcementId: 1, email: 1 }, { unique: true });
announcementAckSchema.index({ email: 1 });

export default mongoose.model('AnnouncementAck', announcementAckSchema);
