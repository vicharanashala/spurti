/**
 * spRules.js — SP scoring configuration
 *
 * All numeric constants that participate in Student Points (SP) calculations
 * are defined here. This module contains ONLY configuration values; no
 * business logic lives here.
 *
 * Import this module wherever SP deltas are computed so that rule changes
 * can be made in one place without touching business logic.
 */

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

/** SP balance credited to a student on initial onboarding. */
export const INITIAL_SP = 100;

// ---------------------------------------------------------------------------
// Attendance scoring
// ---------------------------------------------------------------------------

/**
 * Minimum fraction of session minutes a student must attend to qualify
 * for the attendance credit (e.g. 0.75 = 75%).
 */
export const ATTENDANCE_THRESHOLD = 0.75;

/** SP awarded when a student meets or exceeds ATTENDANCE_THRESHOLD. */
export const ATTENDANCE_SP_CREDIT = 5;

/** SP deducted when a student falls below ATTENDANCE_THRESHOLD. */
export const ATTENDANCE_SP_DEBIT = -5;

// ---------------------------------------------------------------------------
// Poll scoring
// ---------------------------------------------------------------------------

/** SP contributed per poll question that the student attempted. */
export const POLL_ATTEMPTED_SCORE = 1;

/** SP contributed per poll question that the student missed. */
export const POLL_MISSED_SCORE = -1;
