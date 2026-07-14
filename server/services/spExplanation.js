/**
 * server/services/spExplanation.js
 *
 * Pure helper that turns any SPTransaction into a structured, human-readable
 * explanation of how it was scored. Built to close the feedback loop in
 * PRODUCT.md's "Awareness" pillar: students see a debit in the SpBank and
 * don't know why. This module tells them, in plain language.
 *
 * ZERO side effects. ZERO DB access. Pass in a transaction (and optionally
 * a session), get back an explanation object. Fully unit-testable without
 * Mongoose.
 *
 * Handles both rubrics currently in the production ledger:
 *   - New band rubric (pipeline/sp-rubric-build-mirror.cjs): produces
 *     deltas of 0/3/5/10 only. Reason text contains
 *     "present X of Y min (Z%) within official …" or
 *     "answered X of Y poll questions (Z%)".
 *   - Old CSV rubric (server/scripts/lib/ingestion.js): can produce
 *     deltas of -5 (attendance debit). Reason text contains
 *     "attended X/Y minutes (Z%). Required 75%, credited/debited …".
 *
 * Exhaustive tests in server/tests/sp-explanation.test.js.
 */

/**
 * @typedef {Object} Rubric
 * @property {string} rule    Identifier for the rubric that produced this txn
 * @property {Object} values  The specific numeric inputs/outputs of the rubric
 */

/**
 * @typedef {Object} Explanation
 * @property {string} category         Transaction category (attendance/poll/initial/manual)
 * @property {string} headline         One-line summary (shown as the panel title)
 * @property {string} detail           Multi-line body (the "what happened" explanation)
 * @property {string} recommendation   Actionable next-step (the "what to do differently")
 * @property {Object|null} rubric     Underlying rubric values; null for non-scored txns
 */

/** Reasons a transaction might NOT have a parseable rubric. */
const UNKNOWN = 'unknown';

// ── Regex patterns for the two rubric flavors ──────────────────────────

// New band rubric (pipeline): "<label> (<date>): present X of Y min (Z%) within … -> D SP."
const NEW_ATTENDANCE_RE = /present\s+(\d+)\s+of\s+(\d+)\s+min\s+\(([\d.]+)%\)/;

// New band rubric (poll): "<label> (<date>): answered X of Y poll questions (Z%) -> D SP."
const NEW_POLL_RE = /answered\s+(\d+)\s+of\s+(\d+)\s+poll\s+questions\s+\(([\d.]+)%\)/;

// Old CSV rubric (server/scripts/lib/ingestion.js):
//   "<label>: attended X/Y minutes (Z%). Required 75%, credited +5 SP."
//   "<label>: attended X/Y minutes (Z%). Required 75%, debited -5 SP."
const OLD_ATTENDANCE_RE = /attended\s+(\d+)\/(\d+)\s+minutes\s+\(([\d.]+)%\)/;

// ── Per-category explainers ─────────────────────────────────────────────

function explainAttendance(txn) {
  const delta = Number(txn.appliedDelta || 0);

  // Try the new band-rubric format first.
  let m = String(txn.reason || '').match(NEW_ATTENDANCE_RE);
  if (m) {
    const attended = Number(m[1]);
    const total = Number(m[2]);
    const pct = Number(m[3]);
    return buildAttendanceBandExplanation(attended, total, pct, delta);
  }

  // Fall back to the old CSV-rubric format (pre-mirror).
  m = String(txn.reason || '').match(OLD_ATTENDANCE_RE);
  if (m) {
    const attended = Number(m[1]);
    const total = Number(m[2]);
    const pct = Number(m[3]);
    return buildOldAttendanceExplanation(attended, total, pct, delta);
  }

  // Unparseable — give a generic but honest answer.
  return {
    category: 'attendance',
    headline: `Attendance adjustment — ${formatDelta(delta)}`,
    detail: txn.reason || 'No detail recorded for this transaction.',
    recommendation: 'Show up to the full 09:05-11:00 IST window to avoid attendance adjustments.',
    rubric: { rule: UNKNOWN, values: {} }
  };
}

function buildAttendanceBandExplanation(attended, total, pct, delta) {
  const band = bandFor(pct);
  return {
    category: 'attendance',
    headline: `Attendance ${band.label} band — ${formatDelta(delta)}`,
    detail: `You attended ${attended} of ${total} min (${pct.toFixed(1)}%) of the official session window. The attendance band rubric awards ${delta < 0 ? 'a debit when below 50%' : 'credit only above 50%'}.`,
    recommendation: recommendationForAttendanceBand(delta, band),
    rubric: {
      rule: 'attendance-band',
      values: {
        attended,
        totalMinutes: total,
        pct,
        band: band.label,
        bandLow: band.low,
        bandHigh: band.high,
        delta
      }
    }
  };
}

function buildOldAttendanceExplanation(attended, total, pct, delta) {
  const required = Math.round(total * 0.75);
  const shortBy = Math.max(0, required - attended);
  return {
    category: 'attendance',
    headline: delta < 0 ? `Attendance debit — ${formatDelta(delta)}` : `Attendance credit — ${formatDelta(delta)}`,
    detail: `You attended ${attended} of ${total} min (${pct.toFixed(1)}%). The old CSV rubric required ${required} min (75%) to qualify — you were ${shortBy} min short.`,
    recommendation: delta < 0
      ? 'The new band rubric would have given 0 SP instead of debiting — attend the full 09:05-11:00 IST window to avoid deductions going forward.'
      : 'You qualified under the old rubric. Stay for the full window to keep getting credit.',
    rubric: {
      rule: 'attendance-csv-75pct',
      values: { attended, totalMinutes: total, pct, required, shortBy, delta }
    }
  };
}

function explainPoll(txn) {
  const delta = Number(txn.appliedDelta || 0);
  const m = String(txn.reason || '').match(NEW_POLL_RE);
  if (!m) {
    return {
      category: 'poll',
      headline: `Poll adjustment — ${formatDelta(delta)}`,
      detail: txn.reason || 'No detail recorded for this transaction.',
      recommendation: 'Answer every poll that appears during the session — they pop up every 10-15 minutes.',
      rubric: { rule: UNKNOWN, values: {} }
    };
  }
  const answered = Number(m[1]);
  const total = Number(m[2]);
  const pct = Number(m[3]);
  const band = bandFor(pct);
  return {
    category: 'poll',
    headline: `Poll ${band.label} band — ${formatDelta(delta)}`,
    detail: `You answered ${answered} of ${total} poll questions (${pct.toFixed(1)}%). The poll band rubric requires 75% to earn any credit.`,
    recommendation: recommendationForPollBand(delta, band, answered, total),
    rubric: {
      rule: 'poll-band',
      values: {
        answered,
        totalQuestions: total,
        pct,
        band: band.label,
        bandLow: band.low,
        bandHigh: band.high,
        delta
      }
    }
  };
}

function explainInitial(txn) {
  return {
    category: 'initial',
    headline: `${formatDelta(txn.appliedDelta)} — initial credit`,
    detail: 'Every intern who starts the program receives +100 SP as their initial motivation balance. This is awarded automatically on your internship start date.',
    recommendation: 'No action needed — this is a one-time starting balance. The pipeline uses the date you joined the cohort.',
    rubric: null
  };
}

function explainManual(txn) {
  return {
    category: 'manual',
    headline: `${formatDelta(txn.appliedDelta)} — admin adjustment`,
    detail: txn.reason || 'Manual adjustment by an admin (e.g. misconduct deduction, participation bonus, or correction).',
    recommendation: 'Contact your admin if this looks wrong. Manual adjustments appear in your ledger but are not auto-reversible from the student side.',
    rubric: null
  };
}

// ── Registry ────────────────────────────────────────────────────────────

const EXPLANATORS = {
  attendance: explainAttendance,
  poll: explainPoll,
  initial: explainInitial,
  manual: explainManual
};

/**
 * Explain any SPTransaction. Returns null if the category is unknown
 * (e.g. future categories like 'tip' until they're added here).
 */
export function explainTransaction(txn) {
  if (!txn || !txn.category) return null;
  const fn = EXPLANATORS[txn.category];
  if (!fn) return null;
  return fn(txn);
}

/**
 * Explain a batch of transactions. Returns a plain OBJECT keyed by
 * transaction id (string). Plain object — not a Map — because the
 * JSON serializer would stringify Map as '{}'.
 *
 * Skips any transaction whose explainer returns null (unknown category).
 */
export function explainTransactions(txns) {
  const out = {};
  if (!Array.isArray(txns)) return out;
  for (const t of txns) {
    if (!t || t._id == null) continue;
    const e = explainTransaction(t);
    if (e) out[String(t._id)] = e;
  }
  return out;
}

// ── Internal helpers (exported only for tests) ─────────────────────────

/** Map a percentage to its band label + low/high thresholds. */
export function bandFor(pct) {
  if (pct >= 90) return { label: '90%+', low: 90, high: 100 };
  if (pct >= 75) return { label: '75-89%', low: 75, high: 89 };
  if (pct >= 50) return { label: '50-74%', low: 50, high: 74 };
  return { label: '<50%', low: 0, high: 49 };
}

/** Format a delta as "+5 SP" / "-5 SP" / "0 SP". */
export function formatDelta(delta) {
  const d = Number(delta || 0);
  if (d > 0) return `+${d} SP`;
  if (d < 0) return `${d} SP`;
  return '0 SP';
}

/** Recommendation text given the attendance delta + band. */
function recommendationForAttendanceBand(delta, band) {
  if (delta >= 10) return 'Full attendance credit. Keep showing up to the full 09:05-11:00 IST window — that\'s the only way to stay in the 90%+ band.';
  if (delta >= 5) return 'Partial credit. Join 10 minutes earlier or stay 10 minutes later to push above 90% next time.';
  if (delta >= 3) return 'Minimal credit. The 75% threshold requires about 90 of 120 minutes — set a recurring alarm at 08:55 to join with buffer.';
  if (delta === 0) return 'Below the 50% threshold — you didn\'t earn anything. Set a daily reminder at 09:00 and stay until 11:00 to easily clear 90%.';
  return 'Debited under the old rubric. The new band rubric would have given 0 SP instead of -5 — attend the full window to avoid deductions.';
}

/** Recommendation text given the poll delta + band + counts. */
function recommendationForPollBand(delta, band, answered, total) {
  if (delta >= 10) return 'Full poll credit. You answered nearly every question — keep doing that.';
  if (delta >= 5) return 'Partial credit. Polls appear every 10-15 min during the session — watch for the popup and click within 30 seconds.';
  if (delta >= 3) return 'Minimal credit. The 75% threshold means about 12 of 16 questions. Most polls only stay open for 30-60 seconds, so click immediately when you see the prompt.';
  if (delta === 0) return `No poll credit — you answered ${answered} of ${total}. Polls pop up at random times during the session; you cannot earn retroactive credit. Watch the Zoom chat for "[Poll]" lines.`;
  return 'Negative poll delta is rare under the current rubric. Check the reason text above for the specific penalty.';
}