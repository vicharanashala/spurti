import mongoose from 'mongoose';

const studyBuddyNotificationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  type: { type: String, enum: ['request', 'accepted', 'completed_goal', 'lost_streak'], required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true }
}, { timestamps: true });

export default mongoose.model('StudyBuddyNotification', studyBuddyNotificationSchema);
