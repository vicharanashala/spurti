import mongoose from 'mongoose';

const preferenceSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  categories: {
    weeklyDigest: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    },
    streakReminders: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    },
    peerActivity: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    },
    announcements: {
      inApp: { type: Boolean, default: true },
      email: { type: Boolean, default: false }
    }
  }
}, { timestamps: true });

export default mongoose.models.NotificationPreference || mongoose.model('NotificationPreference', preferenceSchema);
