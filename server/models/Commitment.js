import mongoose from 'mongoose';

// A commitment (formerly VibeBet) — a stake-a-goal pledge in ANY internship phase.
// One shared collection; `type` selects the phase and which fields apply. One active
// commitment per (email, type). Two economic modes:
//   - debited (ViBe): the stake is debited at placement, returned ×multiplier on a HIT.
//   - keep   (Standup): the stake is NOT debited; a HIT pays a +stake×mult bonus on top
//     of the attendance points earned that week, a MISS charges −0.5×stake×mult.
const commitmentSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, index: true },
  type: { type: String, enum: ['vibe', 'standup'], required: true, index: true },

  // shared economics
  stake: { type: Number, required: true },            // 20 / 50 (standup tiers) or 50–200 (vibe)
  multiplier: { type: Number, required: true },       // 2 | 3 | 4
  potentialWin: { type: Number, required: true },     // stake * multiplier
  potentialLoss: { type: Number, required: true },    // 0.5 * stake * multiplier
  reserved: { type: Number, default: 0 },             // SP reserved while active (vibe = loss; standup = 0)
  debited: { type: Boolean, default: false },         // was the stake debited at placement (vibe true)
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'won', 'lost'], default: 'active', index: true },
  resultDelta: { type: Number, default: 0 },
  settledAt: { type: Date, default: null },
  label: { type: String, default: '' },               // human summary (for history)

  // ViBe-specific
  course: { type: String, default: '' },              // course key
  goalPct: { type: Number, default: 0 },              // raise completion by this many %
  baselinePct: { type: Number, default: 0 },          // completion % at commit time

  // Standup-specific
  tier: { type: String, default: '' },                // '81-90' | '91-100'
  tierFloor: { type: Number, default: 0 },            // min average attendance % to hit (81 | 91)
  sessionsTarget: { type: Number, default: 0 },       // sessions to attend this week (full week Y)
  weekStart: { type: Date, default: null },
  weekEnd: { type: Date, default: null }
}, { timestamps: true });

commitmentSchema.index({ email: 1, type: 1, status: 1 });

export default mongoose.model('Commitment', commitmentSchema);
