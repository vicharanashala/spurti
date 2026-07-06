import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true, lowercase: true, trim: true },
  category: { 
    type: String, 
    enum: ['weeklyDigest', 'streakReminders', 'peerActivity', 'announcements'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true }
}, { timestamps: true });

export default mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
