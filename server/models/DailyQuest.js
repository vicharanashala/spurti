import mongoose from 'mongoose';

const missionSchema = new mongoose.Schema({
  code: { type: String, required: true },
  icon: { type: String, default: '' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'complete'], default: 'pending' },
  completedAt: { type: Date, default: null },
  progress: { type: mongoose.Schema.Types.Mixed, default: {} },
  evidence: { type: mongoose.Schema.Types.Mixed, default: null }
}, { _id: false });

// One assignment per student per IST calendar day. missions[] is written once
// (exactly 3 codes) and never reshuffled; only status/progress are updated.
const dailyQuestSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', index: true },
  dayKey: { type: String, required: true, index: true },
  missions: { type: [missionSchema], default: [] },
  assignedAt: { type: Date, default: Date.now },
  evaluatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

dailyQuestSchema.index({ email: 1, dayKey: 1 }, { unique: true });
dailyQuestSchema.index({ studentId: 1, dayKey: -1 });

export default mongoose.model('DailyQuest', dailyQuestSchema);
