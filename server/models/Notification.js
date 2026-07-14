import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true },
  category: { 
    type: String, 
    enum: ['weeklyDigest', 'streakReminders', 'peerActivity', 'announcements'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ email: 1, createdAt: -1 });
notificationSchema.index({ email: 1, read: 1 });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
