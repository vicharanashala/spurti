import mongoose from 'mongoose';

// E2 goal-card experiment telemetry (pre-reg 2026-09-07): one row per card
// impression, skip, or set. Append-only; read by the experiment readout scripts,
// never by the app itself.
const e2CardEventSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  arm: { type: String, enum: ['B', 'C'], required: true },
  event: { type: String, enum: ['impression', 'skip', 'set'], required: true },
  phase: { type: String, default: '' },  // standup | vibe | spa | project — what the card asked
  value: { type: String, default: '' }   // the chosen date, on 'set'
}, { timestamps: true });

e2CardEventSchema.index({ email: 1, event: 1, createdAt: 1 });

export default mongoose.model('E2CardEvent', e2CardEventSchema);
