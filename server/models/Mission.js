import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  day: { type: Number, required: true },          // Which day of the mission (1-based)
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  evidenceRequired: { type: Boolean, default: false }
});

const triggerSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['sp_drop', 'missed_attendance', 'contest_fail', 'manual'],
    required: true
  },
  threshold: { type: Number, default: 0 }          // e.g. SP dropped by ≥ 20, missed ≥ 2 sessions
});

const missionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: {
    type: String,
    enum: ['learning', 'health', 'productivity', 'career', 'finance'],
    required: true,
    index: true
  },
  duration: {
    type: String,
    enum: ['1d', '3d', '7d', '30d'],
    default: '7d'
  },
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  spReward: { type: Number, default: 10 },
  reflectionSpBonus: { type: Number, default: 5 },
  tasks: [taskSchema],
  triggerConditions: [triggerSchema],
  isActive: { type: Boolean, default: false, index: true }
}, { timestamps: true });

missionSchema.index({ isActive: 1, category: 1 });

export default mongoose.model('Mission', missionSchema);
