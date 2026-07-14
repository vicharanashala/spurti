import mongoose from 'mongoose';

const guildSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  icon: { type: String, default: '⚔️' },        // emoji emblem
  color: { type: String, default: '#176b87' },  // hex theme colour
  description: { type: String, default: '' },
  motto: { type: String, default: '' },
  inviteCode: { type: String, unique: true, sparse: true, index: true }, // 6-char, lowercase alphanumeric
  ownerEmail: { type: String, required: true, lowercase: true, trim: true },
  maxMembers: { type: Number, default: 12, min: 2, max: 50 }, // hard cap on roster size
  dissolved: { type: Boolean, default: false },
  dissolvedAt: { type: Date, default: null }
}, { timestamps: true });

guildSchema.index({ dissolved: 1 });

export default mongoose.model('Guild', guildSchema);