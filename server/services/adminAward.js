/**
 * server/services/adminAward.js
 *
 * Pure helpers for the admin quick SP award feature. Validates and
 * normalizes the award payload before it touches the database.
 *
 * Zero side effects, zero DB. Trivially unit-testable. Mirrors the
 * style of services/adminNote.js.
 */

/** Hard cap on award reason text length. */
export const AWARD_REASON_MAX_LENGTH = 500;

/** Hard cap on award percentage when deltaMode is 'percentage'. */
export const AWARD_PERCENTAGE_MAX = 100;

/**
 * @typedef {'absolute' | 'percentage'} DeltaMode
 *  - absolute: the delta is a fixed SP amount (e.g. +5 SP)
 *  - percentage: the delta is a % of the student's current balance
 *    (e.g. +10% of current balance)
 */

/**
 * Validate an admin award payload.
 *
 * Rules:
 *  - body must be an object
 *  - delta must be present and a positive integer (1..1_000_000 SP, or 1..100%)
 *  - reason must be a non-empty string within AWARD_REASON_MAX_LENGTH
 *  - deltaMode, if present, must be 'absolute' (default) or 'percentage'
 *
 * Returns: { ok: true, delta, reason, deltaMode } | { ok: false, error }
 */
export function validateAwardPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  if (!('delta' in body)) {
    return { ok: false, error: 'delta field is required' };
  }
  if (typeof body.delta !== 'number') {
    return { ok: false, error: 'delta must be a number' };
  }
  const delta = body.delta;
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
    return { ok: false, error: 'delta must be an integer' };
  }
  if (delta <= 0) {
    return { ok: false, error: 'delta must be a positive integer (use deduction flow for negative)' };
  }
  if (delta > 1_000_000) {
    return { ok: false, error: 'delta exceeds maximum award of 1,000,000 SP' };
  }
  if (!('reason' in body)) {
    return { ok: false, error: 'reason field is required' };
  }
  if (typeof body.reason !== 'string') {
    return { ok: false, error: 'reason must be a string' };
  }
  const trimmedReason = body.reason.trim();
  if (trimmedReason.length === 0) {
    return { ok: false, error: 'reason must not be empty' };
  }
  if (trimmedReason.length > AWARD_REASON_MAX_LENGTH) {
    return { ok: false, error: `reason exceeds max length of ${AWARD_REASON_MAX_LENGTH} characters` };
  }
  const deltaMode = body.deltaMode === 'percentage' ? 'percentage' : 'absolute';
  if (deltaMode === 'percentage' && delta > AWARD_PERCENTAGE_MAX) {
    return { ok: false, error: `percentage delta must be between 1 and ${AWARD_PERCENTAGE_MAX}` };
  }
  return { ok: true, delta, reason: trimmedReason, deltaMode };
}

/**
 * Compute the actual SP amount to apply given the validated payload and the
 * student's current balance. For 'percentage' mode, appliedDelta is the
 * percentage of currentBalance, rounded to the nearest integer (floor so
 * admins never accidentally over-credit).
 *
 * Returns the integer appliedDelta (always > 0; negative deductions are
 * not supported in this award flow — separate deduction endpoint should
 * be added if needed).
 */
export function computeAppliedDelta({ delta, deltaMode }, currentBalance) {
  const bal = Math.max(0, Number(currentBalance || 0));
  if (deltaMode === 'percentage') {
    // Floor so admins never over-credit. 10% of 145 = 14 SP, not 14.5.
    return Math.floor((bal * delta) / 100);
  }
  return delta;
}

/**
 * Build the reason text stored on the SPTransaction. Prefixes the mode
 * for audit clarity so future readers know whether +10 was fixed or 10%.
 *
 * Examples:
 *   - "Admin award (absolute): Great question on binary trees"
 *   - "Admin award (10% of balance): Outstanding presentation"
 */
export function buildAwardReason(deltaMode, delta, adminReason) {
  const prefix = deltaMode === 'percentage'
    ? `Admin award (${delta}% of balance)`
    : `Admin award (absolute)`;
  return `${prefix}: ${adminReason}`;
}