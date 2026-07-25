import mongoose from 'mongoose';

// WeeklyRecap — archived snapshot of a week's results, populated by the
// Monday-06:00-IST finalizer. One document per (date, kind).
// Used by the Weekly Champions + AI Recovery popups to celebrate
// outcomes and offer guidance for the upcoming week.
const recapEntrySchema = new mongoose.Schema({
  rank:       { type: Number, required: true },
  email:      { type: String, required: true, lowercase: true, trim: true },
  name:       { type: String, required: true },
  weeklySp:   { type: Number, default: 0 },
  // Best weekly badge the student earned (rendered next to their row)
  weeklyBadge: { type: String, default: '' },
  // Activity breakdown for that week — used by the AI Recovery Plan
  attendanceCount: { type: Number, default: 0 },
  pollCount:       { type: Number, default: 0 },
  challengeCount:  { type: Number, default: 0 },
  learningPct:     { type: Number, default: 0 }   // 0..100, session-attendance share
}, { _id: false });

const weeklyRecapSchema = new mongoose.Schema({
  // Monday's IST date key, e.g. "2026-07-13" — identifies the
  // *week that just ended* (the week starting on this Monday).
  weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  weekEnd:   { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  // Cohort snapshot at the moment of finalization
  cohortSize: { type: Number, default: 0 },
  // Top 10 winners
  top10:       { type: [recapEntrySchema], default: [] },
  // Bottom 50 (rendered for the AI Recovery coach — full N=50 list)
  bottom50:   { type: [recapEntrySchema], default: [] },
  // Full ranking saved for any future debug/replay
  allRanked:  { type: [recapEntrySchema], default: [] },
  finalizedAt: { type: Date, default: Date.now }
}, { timestamps: true });

weeklyRecapSchema.index({ weekStart: 1 }, { unique: true });

export default mongoose.model('WeeklyRecap', weeklyRecapSchema);