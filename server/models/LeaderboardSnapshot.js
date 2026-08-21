import mongoose from 'mongoose';

// One document per leaderboard "board" (window × category × scope). Rebuilt each
// sp-refresh by services/leaderboards.js. Rows hold the FULL sorted list so the
// API can return the top N AND locate the requesting student's own rank. No email
// is stored — student-facing boards show name + level only.
const rowSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  name: { type: String, required: true },
  sp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  rank: { type: Number, required: true }
}, { _id: false });

const leaderboardSnapshotSchema = new mongoose.Schema({
  boardKey: { type: String, required: true, unique: true }, // e.g. week:total:all, all:query:all, week:total:group:<g>
  window: { type: String, enum: ['week', 'all'], required: true },
  category: { type: String, enum: ['total', 'attendance', 'poll', 'spa', 'query'], required: true },
  scope: { type: String, enum: ['all', 'group'], required: true },
  group: { type: String, default: null },
  weekStart: { type: Date, default: null },
  weekLabel: { type: String, default: '' },
  builtAt: { type: Date, default: Date.now },
  rows: { type: [rowSchema], default: [] }
}, { timestamps: true });

export default mongoose.model('LeaderboardSnapshot', leaderboardSnapshotSchema);
