import mongoose from 'mongoose';
import Session from '../models/Session.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import FlexibleDayRequest from '../models/FlexibleDayRequest.js';

/**
 * Returns IST Date components (Year, Month 0-11, Date 1-31, Day 0-6 Sun-Sat)
 */
function getIstDateParts(date = new Date()) {
  const d = new Date(date);
  const utcMs = d.getTime();
  const istMs = utcMs + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istMs);

  return {
    year: istDate.getUTCFullYear(),
    month: istDate.getUTCMonth(),
    dayOfMonth: istDate.getUTCDate(),
    dayOfWeek: istDate.getUTCDay(),
    timestamp: utcMs
  };
}

/**
 * 1. getNextUpcomingSession(cohortId)
 */
export async function getNextUpcomingSession(cohortId) {
  const now = new Date();
  const query = {
    $or: [
      { startDateTime: { $gt: now } },
      { date: { $gt: now } }
    ]
  };

  if (cohortId && mongoose.Types.ObjectId.isValid(cohortId)) {
    const cId = new mongoose.Types.ObjectId(cohortId);
    const hasCohort = await Session.countDocuments({ cohortId: cId });
    if (hasCohort > 0) {
      query.cohortId = cId;
    }
  }

  const nextSession = await Session.findOne(query)
    .sort({ startDateTime: 1, date: 1 })
    .lean();

  if (!nextSession) return null;

  const startDateTime = nextSession.startDateTime || nextSession.date;
  return {
    ...nextSession,
    startDateTime
  };
}

/**
 * 2. isWithinBlackoutPeriod(internshipEndDate)
 * Counts back 5 working days (Monday to Friday only) from internshipEndDate.
 * Returns true if today (IST) falls on or after the blackout start date.
 */
export function isWithinBlackoutPeriod(internshipEndDate) {
  if (!internshipEndDate) return false;

  const endDate = new Date(internshipEndDate);
  if (isNaN(endDate.getTime())) return false;

  // Working days count: Monday(1) to Friday(5)
  // Work backwards starting from endDate
  let curr = new Date(Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  ));

  let workingDaysCount = 0;
  let blackoutStartDate = null;

  while (workingDaysCount < 5) {
    const dayOfWeek = curr.getUTCDay(); // 0: Sun, 1: Mon, ..., 6: Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Mon-Fri
      workingDaysCount++;
      blackoutStartDate = new Date(curr);
    }
    // Move 1 day back
    curr.setUTCDate(curr.getUTCDate() - 1);
  }

  const todayParts = getIstDateParts(new Date());
  const todayStartIstUtc = Date.UTC(todayParts.year, todayParts.month, todayParts.dayOfMonth);

  const blackoutParts = getIstDateParts(blackoutStartDate);
  const blackoutStartIstUtc = Date.UTC(blackoutParts.year, blackoutParts.month, blackoutParts.dayOfMonth);

  return todayStartIstUtc >= blackoutStartIstUtc;
}

/**
 * 3. isRequestWindowOpen(sessionStartDateTime)
 * Return true if now (IST) <= sessionStartDateTime - 3 hours.
 */
export function isRequestWindowOpen(sessionStartDateTime) {
  if (!sessionStartDateTime) return false;
  const startMs = new Date(sessionStartDateTime).getTime();
  if (isNaN(startMs)) return false;

  const cutoffMs = startMs - (3 * 60 * 60 * 1000);
  const nowMs = Date.now();

  return nowMs <= cutoffMs;
}

/**
 * 4. deductSpForApproval(studentId, requestId, sessionLabel)
 * Runs a MongoDB session & transaction:
 * - Deducts 140 SP from student.totalSp
 * - Creates sptransaction
 * - Updates FlexibleDayRequest (spDeducted: true, spDeductedAt: now)
 */
export async function deductSpForApproval(studentId, requestId, sessionLabel) {
  const performDeduction = async (dbSession = null) => {
    const student = dbSession
      ? await Student.findById(studentId).session(dbSession)
      : await Student.findById(studentId);

    if (!student) {
      throw new Error('Student not found for SP deduction');
    }

    if ((student.totalSp || 0) < 140) {
      throw new Error(`Student has insufficient SP (${student.totalSp} SP < 140 SP requirement)`);
    }

    const newTotalSp = (student.totalSp || 0) - 140;
    student.totalSp = newTotalSp;

    if (dbSession) {
      await student.save({ session: dbSession });
    } else {
      await student.save();
    }

    const now = new Date();
    const txData = {
      email: student.email,
      studentId: student._id,
      category: 'flexible_day_spend',
      sessionLabel: sessionLabel || '',
      deltaMode: 'absolute',
      deltaValue: -140,
      appliedDelta: -140,
      balanceAfter: newTotalSp,
      reason: `Flexible Day approved: ${sessionLabel}`,
      dateTime: now
    };

    if (dbSession) {
      await SPTransaction.create([txData], { session: dbSession });
      await FlexibleDayRequest.findByIdAndUpdate(
        requestId,
        {
          spDeducted: true,
          spDeductedAt: now,
          status: 'APPROVED',
          respondedAt: now
        },
        { session: dbSession }
      );
    } else {
      await SPTransaction.create(txData);
      await FlexibleDayRequest.findByIdAndUpdate(
        requestId,
        {
          spDeducted: true,
          spDeductedAt: now,
          status: 'APPROVED',
          respondedAt: now
        }
      );
    }

    return { success: true, balanceAfter: newTotalSp };
  };

  let dbSession = null;
  try {
    dbSession = await mongoose.startSession();
    dbSession.startTransaction();
    const res = await performDeduction(dbSession);
    await dbSession.commitTransaction();
    dbSession.endSession();
    return res;
  } catch (err) {
    if (dbSession) {
      try { await dbSession.abortTransaction(); } catch {}
      try { dbSession.endSession(); } catch {}
    }

    // If standalone MongoDB does not support transactions, fall back to sequential execution
    if (err?.message?.includes('replica set') || err?.message?.includes('Transaction numbers')) {
      return await performDeduction(null);
    }

    throw err;
  }
}
