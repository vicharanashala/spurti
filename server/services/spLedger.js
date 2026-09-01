/**
 * SP Ledger Service
 * Reads from SP_Transactions (append-only log) — no recomputation.
 * Student.totalSp is kept in sync via atomic updates when new transactions are added.
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import { maskEmail } from './sp.js';

/**
 * Get full ledger (all transactions) for a student, ordered by dateTime.
 * Returns running balance at each step.
 */
export async function getLedger(email) {
  const student = await Student.findOne({ email: email.toLowerCase() }).lean();
  if (!student) return null;

  const transactions = await SPTransaction.find({ email: email.toLowerCase() })
    .sort({ dateTime: 1 })
    .lean();

  let runningBalance = 0;
  const ledger = transactions.map(t => {
    runningBalance += Number(t.appliedDelta || 0);
    return {
      category: t.category,
      sessionLabel: t.sessionLabel,
      dateTime: t.dateTime,
      appliedDelta: t.appliedDelta,
      reason: t.reason,
      balanceAfter: runningBalance,
      createdAt: t.createdAt
    };
  });

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
 * Get all students summary.
 * Uses totalSp stored on Student (fast).
 */
export async function getAllStudentsSummary() {
  const students = await Student.find({}).lean();
  return students.map(s => ({
    email: s.email,
    name: s.name,
    totalSp: s.totalSp,
  }));
}

/**
 * Append a new transaction and update Student.totalSp atomically.
 */
export async function appendTransaction(email, category, sessionLabel, dateTime, delta, reason) {
  const dt = dateTime instanceof Date ? dateTime : new Date(dateTime);

  const student = await Student.findOneAndUpdate(
    { email: email.toLowerCase() },
    { $inc: { totalSp: delta } },
    { new: true }
  );
  if (!student) throw new Error(`Student not found: ${email}`);

  const [txn] = await SPTransaction.create([{
    email: email.toLowerCase(),
    studentId: student._id,
    category,
    sessionLabel,
    deltaMode: 'absolute',
    deltaValue: delta,
    appliedDelta: delta,
    balanceAfter: student.totalSp,
    reason,
    dateTime: dt
  }]);

  return txn;
}