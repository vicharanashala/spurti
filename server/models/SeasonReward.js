import mongoose from 'mongoose';

const seasonRewardSchema = new mongoose.Schema({
  seasonId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true },
  key:         { type: String, required: true },   // e.g. "sp-50" | "top-10" | "full-attend"
  label:       { type: String, required: true },
  description: { type: String, default: '' },
  // Goal type determines how the standing is evaluated
  goalType: {
    type: String,
    enum: ['sp', 'rank', 'qualified_sessions', 'league'],
    required: true
  },
  // Threshold for the goal (SP target, rank ceiling, session count, league name)
  goalValue: { type: mongoose.Schema.Types.Mixed, required: true },
  // Display order within the season reward track
  order: { type: Number, default: 0 },
  // Emoji or icon name for the reward
  icon: { type: String, default: '🏆' },
  // Bonus SP awarded when this reward is claimed.
  // Defaults to 0 (purely a badge/achievement).
  spBonus: { type: Number, default: 0 }
}, { timestamps: true });

seasonRewardSchema.index({ seasonId: 1, order: 1 });

export default mongoose.model('SeasonReward', seasonRewardSchema);