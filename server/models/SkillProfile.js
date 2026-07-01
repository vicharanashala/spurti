import mongoose from 'mongoose';

const skillProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, unique: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  skills: [{
    name: { type: String, required: true },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], default: 'intermediate' },
    yearsExperience: { type: Number, default: 0 },
    endorsements: { type: Number, default: 0 },
    endorsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
    portfolioLinks: [{ type: String }],
    verified: { type: Boolean, default: false },
    verifiedBy: { type: String, default: null },
    verifiedAt: { type: Date, default: null }
  }],
  bio: { type: String, default: '', maxlength: 500 },
  languages: [{ type: String }],
  availability: {
    type: String,
    enum: ['available', 'busy', 'unavailable'],
    default: 'available'
  },
  preferredCategories: [{ type: String }],
  maxActiveServices: { type: Number, default: 3 },
  currentActiveServices: { type: Number, default: 0 },
  preferredPayment: { type: String, default: 'sp' },
  responseTimePreference: {
    minHours: { type: Number, default: 1 },
    maxHours: { type: Number, default: 24 }
  },
  teachingStyle: {
    type: String,
    enum: ['practical', 'theoretical', 'mixed', 'project_based'],
    default: 'mixed'
  },
  timezone: { type: String, default: 'Asia/Kolkata' },
  linkedin: { type: String, default: '' },
  github: { type: String, default: '' },
  website: { type: String, default: '' }
}, { timestamps: true });

skillProfileSchema.index({ 'skills.name': 1 });
skillProfileSchema.index({ availability: 1 });
skillProfileSchema.index({ preferredCategories: 1 });

export default mongoose.model('SkillProfile', skillProfileSchema);