/**
 * server/services/adminNote.js
 *
 * Pure helpers for the admin-note feature. No DB access, no side effects.
 * Validates and normalizes the note payload before it touches the database.
 *
 * The boundary is enforced in one place: every PUT request goes through
 * validateNoteUpdate(), which either returns a cleaned note string or a
 * 400-worthy error. This keeps the endpoint thin and the rules unit-testable
 * without spinning up Mongoose.
 */

/** Hard cap on note length. Mirrors the textarea maxLength in the client. */
export const NOTE_MAX_LENGTH = 2000;

/**
 * Validate + normalize a note update payload.
 *
 * Rules:
 *  - input must be an object
 *  - note must be present (string OR empty string is allowed; empty clears)
 *  - trimmed length must be <= NOTE_MAX_LENGTH
 *  - result is the trimmed string (or '' if user typed only whitespace and
 *    we choose to treat it as "clear" — current behavior is to keep as-is)
 *
 * Returns: { ok: true, note: string } | { ok: false, error: string }
 */
export function validateNoteUpdate(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  if (!('note' in body)) {
    return { ok: false, error: 'note field is required' };
  }
  if (typeof body.note !== 'string') {
    return { ok: false, error: 'note must be a string' };
  }
  const trimmed = body.note.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: `note exceeds max length of ${NOTE_MAX_LENGTH} characters` };
  }
  return { ok: true, note: body.note };
}

/**
 * Format a timestamp for the "Last edited: …" UI line. Returns 'Never edited'
 * for null / invalid input so the UI never shows "Invalid Date".
 */
export function formatLastEdited(date) {
  if (!date) return 'Never edited';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'Never edited';
  // Stable, locale-independent format: YYYY-MM-DD HH:mm
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}