/**
 * SP Ledger Service
 * Reads from SPTransaction (append-only log) using the CURRENT schema fields:
 *   appliedDelta, balanceAfter, dateTime, sessionLabel, category, reason.
 * Student.totalSp is kept in sync via atomic $inc when new transactions are added.
 *
 * B3-FIX: previous version referenced non-existent fields (delta, sessionDatetime,
 * recordedAt, ingestedFrom). All field names now match SPTransaction schema exactly.
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

// ─── Public Ledger ────────────────────────────────────────────────────────────

/**
 * Get the full SP history for a student, ordered chronologically.
 * Each entry carries the running balance at that point.
 */
export async function getLedger(email) {
  const student = await Student.findOne({ email: email.toLowerCase() }).lean();
  if (!student) return null;

  const transactions = await SPTransaction.find({ email: email.toLowerCase() })
    .sort({ dateTime: 1, createdAt: 1 })   // B3-FIX: dateTime (not sessionDatetime)
    .lean();

  const ledger = transactions.map(t => ({
    category:      t.category,
    sessionLabel:  t.sessionLabel,
    dateTime:      t.dateTime,             // B3-FIX: dateTime (not sessionDatetime)
    appliedDelta:  t.appliedDelta,         // B3-FIX: appliedDelta (not delta)
    reason:        t.reason,
    balanceAfter:  t.balanceAfter          // stored on every transaction
  }));

  return {
    email:          student.email,
    name:           student.name,
    alternateEmail: student.alternateEmail,
    totalSp:        student.totalSp,
    ledger
  };
}

// ─── Public Student Summary ───────────────────────────────────────────────────

/**
 * Minimal public view used for search results and quick lookups.
 * Email is masked; full profile requires authentication.
 */
export async function getPublicStudent(email) {
  const normalized = email.toLowerCase();
  const student = await Student.findOne({ email: normalized }).lean();
  if (!student) return null;

  return {
    _id:                  String(student._id),
    name:                 student.name,
    maskedEmail:          maskEmail(student.email),
    maskedAlternateEmail: student.alternateEmail ? maskEmail(student.alternateEmail) : '',
    totalSp:              student.totalSp,
    status:               student.status,
    hasAttendance:        await SPTransaction.exists({ email: normalized, category: 'attendance' }) !== null
  };
}

// ─── Bulk Summary ─────────────────────────────────────────────────────────────

/**
 * Returns a lightweight summary of all students from the Student collection.
 * totalSp is pre-computed; no per-student transaction queries needed.
 */
export async function getAllStudentsSummary() {
  const students = await Student.find({}).lean();
  return students.map(s => ({
    email:   s.email,
    name:    s.name,
    totalSp: s.totalSp,
    status:  s.status
  }));
}

// ─── Transaction Append ───────────────────────────────────────────────────────

/**
 * Append a new SP transaction and atomically update Student.totalSp.
 *
 * B3-FIX: previous version used `sessionDatetime`, `delta`, `recordedAt`, and
 * `ingestedFrom` — none of which exist on the SPTransaction schema. This version
 * uses the correct schema fields and computes balanceAfter from the student's
 * stored totalSp before applying the delta.
 *
 * @param {string} email
 * @param {'attendance'|'poll'|'manual'} category
 * @param {string} sessionLabel
 * @param {number} delta - signed SP change (positive = credit, negative = debit)
 * @param {string} reason
 * @returns {Promise<import('mongoose').Document>} the created SPTransaction
 */
export async function appendTransaction(email, category, sessionLabel, delta, reason) {
  const normalized = email.toLowerCase();

  // B3-FIX: Atomic increment and retrieve the updated student record in one step to ensure balanceAfter consistency under concurrency
  const student = await Student.findOneAndUpdate(
    { email: normalized },
    { $inc: { totalSp: delta } },
    { new: true }
  );
  if (!student) throw new Error(`appendTransaction: student not found for email ${normalized}`);

  const balanceAfter = student.totalSp;

  const [txn] = await SPTransaction.create([{
    email:        normalized,
    studentId:    student._id,
    category,
    sessionLabel: sessionLabel || '',
    deltaMode:    'absolute',
    deltaValue:   delta,
    appliedDelta: delta,
    balanceAfter,
    reason,
    dateTime:     new Date()              // B3-FIX: dateTime (not sessionDatetime / recordedAt)
  }]);

  return txn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd   = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}