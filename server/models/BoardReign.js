import mongoose from 'mongoose';

// Who has held the top of each all-time board, and for how long.
//
// An all-time board never settles while the programme runs, so "1st place,
// All-time" cannot be awarded honestly — every successive leader would hold an
// unqualified claim to the same title. A reign fixes the claim by dating it:
// "top of the Overall board, 12 Aug – 3 Sep" is true of each holder, the spans
// don't overlap, and nothing has to be revoked when someone is overtaken.
//
// This collection is the record of leadership itself, kept whether or not a
// reign ever earns a card — so a lead held for six hours still shows up in the
// history even though it is too brief to commemorate. That makes it the only
// place the programme's leadership churn is captured.
const boardReignSchema = new mongoose.Schema({
  board: { type: String, required: true, index: true },   // total|attendance|poll|spa|query
  studentId: { type: String, required: true, index: true },
  name: { type: String, default: '' },
  from: { type: Date, required: true },
  to: { type: Date, default: null },                      // null = still reigning
  sp: { type: Number, default: 0 },                       // their SP on this board, kept current
  peakSp: { type: Number, default: 0 },
  awarded: { type: Boolean, default: false },             // has it earned a card yet
  achId: { type: String, default: '' }
}, { timestamps: true });

// Finding the open reign for a board is the hot path on every build.
boardReignSchema.index({ board: 1, to: 1 });
boardReignSchema.index(
  { board: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { to: null } }
);

export default mongoose.model('BoardReign', boardReignSchema);
