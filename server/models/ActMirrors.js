import mongoose from 'mongoose';

// READ-ONLY views over the Samagama activity mirrors (`act_*` collections),
// written by the admin-side 6-hourly sync — the app must never write them.
// Schemas are intentionally loose (strict:false): the mirror owns the shape.

const loose = extra => new mongoose.Schema(
  { email: { type: String, lowercase: true, trim: true, index: true }, ...extra },
  { strict: false, autoIndex: false }
);

// Per-student per-course ViBe completion, fetched from the live ViBe API
// (source:'live_api'): courseKey 'onboarding'|'ai'|'mern', completionPct 0–100,
// finished, exempt (credited from a prior program), _mirroredAt.
export const ActVibeProgress = mongoose.model(
  'ActVibeProgress', loose({ courseKey: String, completionPct: Number }), 'act_vibe_progress');

// One doc per student: the project PR submission form (branchOrPrLinks free text,
// GitHub commit links, reflection answers).
export const ActPullRequest = mongoose.model(
  'ActPullRequest', loose({ branchOrPrLinks: String }), 'act_pull_requests');

// One doc per student: admin review of the PR submission
// (reviewStatus e.g. 'completed', reviewedAt, resubmissionCount).
export const ActPrReview = mongoose.model(
  'ActPrReview', loose({ reviewStatus: String }), 'act_pr_reviews');
