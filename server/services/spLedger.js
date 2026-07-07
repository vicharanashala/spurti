/**
 * SP Ledger Service
 * Reads from SP_Transactions (append-only log) — no recomputation.
 * Student.totalSp is kept in sync via atomic updates when new transactions are added.
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

/**
 * Get full ledger (all transactions) for a student, ordered by sessionDatetime.
 * Returns running balance at each step.
 */
export async function getLedger(email) {
  const student = await Student.findOne({ email: email.toLowerCase() }).lean();
  if (!student) return null;

  const transactions = await SPTransaction.find({ email: email.toLowerCase() })
    .sort({ sessionDatetime: 1 })
    .lean();

  let runningBalance = 0;
  const ledger = transactions.map(t => {
    runningBalance += Number(t.delta || 0);
    return {
      category: t.category,
      sessionLabel: t.sessionLabel,
      sessionDatetime: t.sessionDatetime,
      delta: t.delta,
      reason: t.reason,
      balanceAfter: runningBalance,
      recordedAt: t.recordedAt
    };
  });

  // Initial tx (first entry) should show balance = 100, not 100+100=200
  if (ledger.length > 0 && ledger[0].category === 'initial') {
    ledger[0].balanceAfter = 100;
  }

  return {
    email: student.email,
    name: student.name,
    alternateEmail: student.alternateEmail,
    totalSp: student.totalSp,
    ledger
  };
}

/**
 * Get public student view — for search results and quick lookups.
 */
export async function getPublicStudent(email) {
  const student = await Student.findOne({ email: email.toLowerCase() }).lean();
  if (!student) return null;

  return {
    _id: String(student._id),
    name: student.name,
    maskedEmail: maskEmail(student.email),
    maskedAlternateEmail: student.alternateEmail ? maskEmail(student.alternateEmail) : '',
    totalSp: student.totalSp,
    hasAttendance: await SPTransaction.exists({ email: email.toLowerCase(), category: 'attendance' })
  };
}

/**
 * Get all students summary from transaction log.
 * Much faster than recomputing since totalSp is stored on Student.
 */
export async function getAllStudentsSummary() {
  const students = await Student.find({}).lean();
  return students.map(s => ({
    email: s.email,
    name: s.name,
    totalSp: s.totalSp,
    hasAttendance: s.sessions && Object.values(s.sessions).some(v => v > 0)
  }));
}

/**
 * Append a new transaction and update Student.totalSp atomically.
 * Use this when new data arrives (attendance, chat, poll, activity).
 */
export async function logTransaction(email, category, sessionLabel, dateTime, delta, reason, balanceAfter) {
  const dt = dateTime instanceof Date ? dateTime : new Date(dateTime);
  const [txn] = await SPTransaction.create([{
    email: email.toLowerCase(),
    category,
    sessionLabel,
    deltaMode: 'absolute',
    deltaValue: delta,
    appliedDelta: delta,
    balanceAfter,
    reason,
    dateTime: dt
  }]);
  return txn;
}

export async function appendTransaction(email, category, sessionLabel, dateTime, delta, reason, currentTotalSp) {
  const balanceAfter = (Number(currentTotalSp) || 0) + delta;

  // Atomic update of student totalSp
  await Student.updateOne(
    { email: email.toLowerCase() },
    { $inc: { totalSp: delta } }
  );

  return await logTransaction(email, category, sessionLabel, dateTime, delta, reason, balanceAfter);
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}