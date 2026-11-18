import mongoose from 'mongoose';

// One row per decision a student makes on the research-consent screen. Rows are
// only ever added, never edited, so the history of every change is kept; a
// student's current choice is their newest row. Admin views never read this
// collection: the choice is hidden from programme staff and used only by the
// research export.
const researchConsentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  version: { type: String, required: true },          // which consent text the student saw
  records: { type: Boolean, required: true },          // A: platform records used for research
  surveys: { type: Boolean, required: true },          // B: survey answers used for research
  quotations: { type: Boolean, required: true },       // C: short anonymous quotations from written answers
  optedOut: { type: Boolean, required: true },         // true when A, B and C are all no
  decidedAt: { type: Date, required: true }
}, { timestamps: true });

researchConsentSchema.index({ studentId: 1, decidedAt: -1 });

export default mongoose.model('ResearchConsent', researchConsentSchema);
