import mongoose from 'mongoose';

const guildInviteSchema = new mongoose.Schema({
  guildId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', required: true, index: true },
  invitedEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
  invitedByEmail: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending', index: true }
}, { timestamps: true });

guildInviteSchema.index({ guildId: 1, invitedEmail: 1, status: 1 });

export default mongoose.model('GuildInvite', guildInviteSchema);