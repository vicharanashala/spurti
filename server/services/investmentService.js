/**
 * SP Investment Vault Service
 *
 * Concurrency model:
 *   - startInvestment: atomic conditional debit on Student (filter includes
 *     `totalSp: { $gte: principal }`), then create record, then create
 *     SPTransaction. Each step has a compensating refund if the next fails.
 *   - resolveInvestment: atomic status flip `active -> completed|failed`,
 *     then atomic credit on Student. Idempotent — concurrent calls are safe.
 *
 * Logging discipline (grep-able tags, no silent failures):
 *   - investment_refund_failed_after_investment_create
 *   - investment_refund_failed_after_transaction_create
 *   - investment_credit_failed_after_resolution
 *   - investment_status_flip_failed
 *   - investment_resolution_failed
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import InvestmentRecord from '../models/InvestmentRecord.js';
import { INVESTMENT_PLANS, INVESTMENT_MIN_PRINCIPAL } from '../config.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function publicInvestment(record) {
  const bonus = record.status === 'completed'
    ? Math.round(record.principal * record.bonusRate)
    : 0;
  return {
    _id: String(record._id),
    planKey: record.planKey,
    principal: record.principal,
    bonusRate: record.bonusRate,
    durationDays: record.durationDays,
    startDate: record.startDate,
    endDate: record.endDate,
    status: record.status,
    resolvedAt: record.resolvedAt,
    attendedSessions: record.attendedSessions,
    requiredSessions: record.requiredSessions,
    bonus,
    totalReturn: record.status === 'completed' ? record.principal + bonus : 0
  };
}

export function getInvestmentPlans() {
  return Object.entries(INVESTMENT_PLANS).map(([key, plan]) => ({
    key,
    label: plan.label,
    durationDays: plan.durationDays,
    bonusRate: plan.bonusRate,
    attendanceRequirement: plan.attendanceRequirement,
    minPrincipal: INVESTMENT_MIN_PRINCIPAL
  }));
}

export async function startInvestment(emailRaw, planKey, principal) {
  const email = normalizeEmail(emailRaw);
  if (!email) return { error: 'INVALID_EMAIL' };
  const plan = INVESTMENT_PLANS[planKey];
  if (!plan) return { error: 'INVALID_PLAN' };
  const p = Number(principal);
  if (!Number.isFinite(p) || p < INVESTMENT_MIN_PRINCIPAL) {
    return { error: 'BELOW_MIN_PRINCIPAL', minPrincipal: INVESTMENT_MIN_PRINCIPAL };
  }

  // Max 1 concurrent investment per student.
  const existing = await InvestmentRecord.findOne({ email, status: 'active' });
  if (existing) return { error: 'ALREADY_ACTIVE', investment: publicInvestment(existing) };

  // Step 1: atomic conditional debit. The `totalSp: { $gte: p }` filter is
  // evaluated atomically by Mongo — no double-spend on concurrent requests.
  const updated = await Student.findOneAndUpdate(
    { email, status: { $ne: 'excused' }, totalSp: { $gte: p } },
    { $inc: { totalSp: -p } },
    { new: true }
  );
  if (!updated) return { error: 'INSUFFICIENT_BALANCE_OR_INACTIVE' };

  const now = new Date();
  const endDate = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

  // Step 2: create the InvestmentRecord. On failure → refund the debit.
  let record;
  try {
    record = await InvestmentRecord.create({
      email,
      studentId: updated._id,
      planKey,
      principal: p,
      bonusRate: plan.bonusRate,
      durationDays: plan.durationDays,
      attendanceRequirement: plan.attendanceRequirement,
      startDate: now,
      endDate,
      status: 'active'
    });
  } catch (err) {
    try {
      await Student.updateOne({ email }, { $inc: { totalSp: p } });
    } catch (refundErr) {
      console.error('investment_refund_failed_after_investment_create', {
        email, principal: p,
        error: err.message,
        refundError: refundErr.message
      });
    }
    return { error: 'INVESTMENT_RECORD_FAILED' };
  }

  // Step 3: create the debit SPTransaction. On failure → refund + delete record.
  let txn;
  try {
    txn = await SPTransaction.create({
      email,
      studentId: updated._id,
      category: 'manual',
      sessionLabel: `investment:${planKey}`,
      deltaMode: 'absolute',
      deltaValue: -p,
      appliedDelta: -p,
      balanceAfter: Number(updated.totalSp || 0),
      reason: `Locked ${p} SP into ${plan.label} vault (${plan.durationDays} days, ${Math.round(plan.bonusRate * 100)}% bonus).`,
      dateTime: now
    });
  } catch (err) {
    try {
      await Student.updateOne({ email }, { $inc: { totalSp: p } });
      await InvestmentRecord.deleteOne({ _id: record._id });
    } catch (refundErr) {
      console.error('investment_refund_failed_after_transaction_create', {
        email, principal: p, investmentId: String(record._id),
        error: err.message,
        refundError: refundErr.message
      });
    }
    return { error: 'TRANSACTION_CREATE_FAILED' };
  }

  await InvestmentRecord.updateOne({ _id: record._id }, { $push: { transactionIds: txn._id } });

  return {
    investment: publicInvestment(record),
    newBalance: Number(updated.totalSp),
    transaction: { _id: String(txn._id), balanceAfter: txn.balanceAfter }
  };
}

async function evaluateAttendance(record) {
  const sessions = await Session.find({
    endDateTime: { $gte: record.startDate, $lte: record.endDate }
  }).lean();
  const requiredSessions = sessions.length;
  let attendedSessions = 0;
  if (requiredSessions > 0) {
    attendedSessions = await AttendanceRecord.countDocuments({
      email: record.email,
      qualified: true,
      sessionLabel: { $in: sessions.map(s => s.label) }
    });
  }
  // No sessions in window = trivially satisfied (caller still gets original back).
  const ratio = requiredSessions > 0 ? attendedSessions / requiredSessions : 1;
  const success = ratio >= record.attendanceRequirement;
  return { success, attendedSessions, requiredSessions };
}

export async function resolveInvestment(record) {
  const plan = INVESTMENT_PLANS[record.planKey];
  if (!plan) return null;

  const { success, attendedSessions, requiredSessions } = await evaluateAttendance(record);
  const newStatus = success ? 'completed' : 'failed';

  // Atomic status flip — guards against concurrent resolution.
  let flipped;
  try {
    flipped = await InvestmentRecord.findOneAndUpdate(
      { _id: record._id, status: 'active' },
      { $set: { status: newStatus, resolvedAt: new Date(), attendedSessions, requiredSessions } },
      { new: true }
    );
  } catch (err) {
    console.error('investment_status_flip_failed', {
      investmentId: String(record._id), email: record.email,
      error: err.message
    });
    return null;
  }
  if (!flipped) return null; // already resolved by another call

  if (!success) {
    return { investment: publicInvestment(flipped), credit: 0 };
  }

  const bonus = Math.round(record.principal * record.bonusRate);
  const totalCredit = record.principal + bonus;

  const updated = await Student.findOneAndUpdate(
    { email: record.email },
    { $inc: { totalSp: totalCredit } },
    { new: true }
  );
  if (!updated) {
    console.error('investment_credit_failed_after_resolution', {
      email: record.email, principal: record.principal, bonus,
      investmentId: String(record._id),
      error: 'Student update returned null'
    });
    return { investment: publicInvestment(flipped), credit: 0, creditFailed: true };
  }

  let txn;
  try {
    txn = await SPTransaction.create({
      email: record.email,
      studentId: record.studentId,
      category: 'manual',
      sessionLabel: `investment:${record.planKey}`,
      deltaMode: 'absolute',
      deltaValue: totalCredit,
      appliedDelta: totalCredit,
      balanceAfter: Number(updated.totalSp),
      reason: `Vault matured: ${plan.label} returned ${record.principal} SP + ${bonus} SP bonus (${attendedSessions}/${requiredSessions} sessions attended).`,
      dateTime: new Date()
    });
  } catch (err) {
    console.error('investment_credit_failed_after_resolution', {
      email: record.email, principal: record.principal, bonus,
      investmentId: String(record._id),
      error: err.message
    });
    return { investment: publicInvestment(flipped), credit: totalCredit, creditFailed: true };
  }

  await InvestmentRecord.updateOne({ _id: record._id }, { $push: { transactionIds: txn._id } });

  return { investment: publicInvestment(flipped), credit: totalCredit, newBalance: Number(updated.totalSp) };
}

export async function resolveDueInvestmentsForStudent(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const due = await InvestmentRecord.find({
    email: normalized, status: 'active', endDate: { $lte: new Date() }
  });
  const results = [];
  for (const record of due) {
    const result = await resolveInvestment(record);
    if (result) results.push(result);
  }
  return results;
}

export async function resolveAllDueInvestments() {
  const due = await InvestmentRecord.find({
    status: 'active', endDate: { $lte: new Date() }
  });
  const results = [];
  for (const record of due) {
    try {
      const result = await resolveInvestment(record);
      if (result) results.push(result);
    } catch (err) {
      console.error('investment_resolution_failed', {
        investmentId: String(record._id), email: record.email,
        error: err.message
      });
    }
  }
  return results;
}

export async function getStudentInvestments(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const records = await InvestmentRecord.find({ email: normalized })
    .sort({ createdAt: -1 })
    .lean();
  return records.map(publicInvestment);
}

export async function getAllInvestments() {
  const records = await InvestmentRecord.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();
  return records.map(r => ({
    _id: String(r._id),
    email: r.email,
    planKey: r.planKey,
    principal: r.principal,
    bonusRate: r.bonusRate,
    durationDays: r.durationDays,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
    resolvedAt: r.resolvedAt,
    attendedSessions: r.attendedSessions,
    requiredSessions: r.requiredSessions,
    totalReturn: r.status === 'completed'
      ? r.principal + Math.round(r.principal * r.bonusRate)
      : 0
  }));
}