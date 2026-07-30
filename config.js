/**
 * Engagement / Progress Bands — configuration
 *
 * These are the only tunable knobs for the classifier. Nothing in
 * classifyBand.js or computeEngagement.js should hardcode a number —
 * everything that could plausibly need retuning by an admin/mentor
 * lives here instead.
 *
 * Band labels are copied verbatim from PRODUCT.md's
 * "Reward And Motivation Design" section:
 *   "Weekly progress bands such as Excellent, Active, Slowing Down,
 *   and Recovery."
 */

// Number of most-recent sessions considered the "current window"
// when classifying a student's band. The same number of sessions
// immediately before that is used as the "previous window" for
// Recovery detection.
const WINDOW_SIZE = 3;

// Canonical band names — use these constants everywhere instead of
// string literals, so a typo can't silently create a 5th "band".
const BANDS = {
  EXCELLENT: 'Excellent',
  ACTIVE: 'Active',
  SLOWING_DOWN: 'Slowing Down',
  RECOVERY: 'Recovery',
  INSUFFICIENT_DATA: 'Not enough data yet',
};

// Thresholds used by classifyBand.js.
// attendanceRate is fraction of sessions attended in the window (0–1).
// negativeSessionsAllowed is how many sessions in the window are
// allowed to have a negative net SP delta before it stops counting
// as "Active".
const THRESHOLDS = {
  EXCELLENT: {
    minAttendanceRate: 0.9,
    maxNegativeSessions: 0,
  },
  ACTIVE: {
    minAttendanceRate: 0.6,
    maxNegativeSessions: 1,
  },
  // "Slowing Down" is trend-based (declining across the window),
  // not a fixed threshold — see classifyBand.js for the comparison
  // logic. This flag just controls how strict "declining" means.
  SLOWING_DOWN: {
    // require at least this much drop in attendance rate OR net SP
    // delta between the first and last session in the window before
    // it's classified as declining, to avoid flagging normal noise.
    minDeclineMargin: 0.15,
  },
};

module.exports = {
  WINDOW_SIZE,
  BANDS,
  THRESHOLDS,
};
