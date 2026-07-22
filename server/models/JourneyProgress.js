import mongoose from 'mongoose';

// Per-student SPA + Projects progress. PLACEHOLDER source: seeded with dummy values
// locally so the My-Journey cards have numbers. In production these fields will be
// refreshed from Samagama (SPA solver counts / SPA points; project PRs raised &
// merged). The SP-award rule for these two phases is still TBD (decided once the
// real Samagama data shape is known) — that is why sp is not computed here yet.
const journeyProgressSchema = new mongoose.Schema({
  email: { type: String, lowercase: true, trim: true, required: true, unique: true, index: true },
  // SPA — Matrix Mystics (53 problems)
  spaSolved: { type: Number, default: 0 },
  spaTotal: { type: Number, default: 53 },
  spaPoints: { type: Number, default: 0 },   // existing "SPA points" (separate leaderboard currency)
  // Projects — PRs (from Samagama)
  prsRaised: { type: Number, default: 0 },
  prsMerged: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('JourneyProgress', journeyProgressSchema);
