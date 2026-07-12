import mongoose from 'mongoose';

const skillTreeUnlockSchema = new mongoose.Schema({
  email:     { type: String, required: true, lowercase: true, trim: true, index: true },
  branch:    {
    type: String,
    required: true,
    enum: ['consistency', 'curiosity', 'momentum', 'excellence'],
  },
  nodeIndex: { type: Number, required: true, min: 0, max: 4 },
  unlockedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Compound unique index: a given student can unlock a given (branch, node)
// at most once. This is the safety net against double-spends in addition
// to the application-level check in /api/skill-tree/unlock.
skillTreeUnlockSchema.index(
  { email: 1, branch: 1, nodeIndex: 1 },
  { unique: true }
);

export default mongoose.model('SkillTreeUnlock', skillTreeUnlockSchema);