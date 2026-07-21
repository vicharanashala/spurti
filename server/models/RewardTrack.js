import mongoose from 'mongoose';

const rewardTrackSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  items: { type: [String], default: [] }, // E.g., ["Custom Badge", "Double SP Card", "Trophy League Booster"]
  votes: { type: [String], default: [] }, // emails of council members who voted for this track
  seasonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Season', required: true, index: true }
}, { timestamps: true });

export default mongoose.models.RewardTrack || mongoose.model('RewardTrack', rewardTrackSchema);
