/**
 * server/services/excuse.js
 *
 * Pure helpers for the admin excuse-flow feature. Validates the excuse
 * payload and builds the reason text that lands on Student.excusedReason.
 *
 * Zero side effects, zero DB. Trivially unit-testable. Mirrors the style
 * of services/adminAward.js and services/adminNote.js.
 */

/** Hard cap on excuse reason text length. */
export const EXCUSE_REASON_MAX_LENGTH = 500;

/**
 * @typedef {Object} ExcusePayload
 * @property {string} reason   Why the student is being excused (shown in /api/me)
 */

/**
 * Validate an excuse payload.
 *
 * Rules:
 *  - body must be an object
 *  - reason must be present and a non-empty string
 *  - reason must be within EXCUSE_REASON_MAX_LENGTH
 *
 * Returns: { ok: true, reason: string } | { ok: false, error: string }
 */
export function validateExcusePayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  if (!('reason' in body)) {
    return { ok: false, error: 'reason field is required' };
  }
  if (typeof body.reason !== 'string') {
    return { ok: false, error: 'reason must be a string' };
  }
  const trimmed = body.reason.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'reason must not be empty' };
  }
  if (trimmed.length > EXCUSE_REASON_MAX_LENGTH) {
    return { ok: false, error: `reason exceeds max length of ${EXCUSE_REASON_MAX_LENGTH} characters` };
  }
  return { ok: true, reason: trimmed };
}

/**
 * Decide which Student fields to set given an action ('excuse' | 'activate')
 * and the validated reason. Returns a $set patch ready for findOneAndUpdate.
 *
 * - excuse:  sets status='excused', excusedAt=now, excusedReason=reason
 * - activate: sets status='active', excusedAt=null, excusedReason=''
 *
 * Centralizes the rule so the endpoint and any future admin tool agree.
 */
export function buildExcusePatch(action, reason) {
  if (action === 'excuse') {
    return {
      status: 'excused',
      excusedAt: new Date(),
      excusedReason: reason
    };
  }
  if (action === 'activate') {
    return {
      status: 'active',
      excusedAt: null,
      excusedReason: ''
    };
  }
  throw new Error(`unknown action: ${action}`);
}

/**
 * Format an excuse patch + student summary into the API response shape.
 * Pure — caller passes in the after-update student doc.
 */
export function buildExcuseResponse(action, student) {
  return {
    ok: true,
    action,
    student: {
      _id: String(student._id),
      name: student.name,
      status: student.status,
      excusedAt: student.excusedAt,
      excusedReason: student.excusedReason
    }
  };
}