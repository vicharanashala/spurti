import mongoose from 'mongoose';

// A peer-shared learning resource, bound to a student-facing context
// (topic tag, poll-question id, or journey phase). One row per resource.
// Soft-delete via deletedAt; reports live in ResourceReport.
//
// The denormalised counters (ratingCount, ratingSum, saveCount) are kept on
// this row so list queries don't unwind ResourceSave/ResourceRating arrays.
// They are updated ONLY through services/resources.js, never by the route.
//
// `effect` is reserved (null in v1) for the future impact score: positive
// SP delta on savers vs non-savers post-engagement.
const resourceSchema = new mongoose.Schema({
  createdBy: {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    name: { type: String, required: true, trim: true }
  },
  type: { type: String, enum: ['link', 'video', 'note', 'code'], required: true },
  // Required when type ∈ {link, video}; empty string otherwise. Validated by
  // services/resources.js, not here, so the same model works in tests.
  url: { type: String, default: '' },
  title: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 400 },
  contextType: { type: String, enum: ['topic', 'question', 'phase'], required: true, index: true },
  contextRef: { type: String, required: true, index: true },
  tags: { type: [String], default: [] },
  cohort: { type: String, required: true, index: true }, // = creator's leaderboardGroup at create time
  ratingCount: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  saveCount: { type: Number, default: 0 },
  // Tier 10 — like/download counters. Mirrors PR #168's UX. Denormalised
  // on the resource row so list queries don't unwind the join tables.
  likeCount: { type: Number, default: 0 },
  downloadCount: { type: Number, default: 0 },
  // Tier 10 — structured category + file type. Optional on existing rows
  // (defaults to '' so pre-tier-10 documents remain valid). Admin can
  // curate by setting these on a resource via the admin API.
  category: { type: String, default: '', index: true },
  fileType: { type: String, default: '', index: true },
  status: { type: String, enum: ['new', 'verified', 'effective'], default: 'new', index: true },
  // Tier 10 — admin curation toggles. Set by POST /admin/resources/:id/verify|highlight|pin.
  // Denormalised booleans (not the existing status enum) so each can be
  // toggled independently and the admin monitor can show all three states.
  isVerified:    { type: Boolean, default: false, index: true },
  isHighlighted: { type: Boolean, default: false, index: true },
  isPinned:       { type: Boolean, default: false, index: true },
  utility: { type: Number, default: 0, index: true },
  effect: { type: Number, default: null }, // v1: always null. v2: SP-delta impact score.
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: String, default: '' },
  statusOverride: { type: String, enum: ['', 'verified', 'effective'], default: '' }, // admin pin
  // Origin of the resource. 'student' is the default for any resource created
  // through the student flow; 'admin' is assigned only by the authenticated
  // admin route, never trusted from the request body (see services/resources).
  source: { type: String, enum: ['student', 'admin'], default: 'student', index: true },
  // Sorted highest in the discover list when non-null. Set/unset by admin only.
  // Plan §pining-ux: pin UI itself is tier 8; the field is in the schema now so
  // the audit row can record a pin without a follow-up migration.
  pinnedAt: { type: Date, default: null, index: true },
  pinnedBy: { type: String, default: '' }
}, { timestamps: true });

resourceSchema.index({ cohort: 1, status: 1, utility: -1 });
resourceSchema.index({ cohort: 1, createdAt: -1 });
resourceSchema.index({ tags: 1 });
// Tier 10 — feed sort indexes for trending + downloads + likes
resourceSchema.index({ cohort: 1, likeCount: -1, createdAt: -1 });
resourceSchema.index({ cohort: 1, downloadCount: -1, createdAt: -1 });

export default mongoose.model('Resource', resourceSchema);
