import Streak from '../models/Streak.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import { STREAK_ATTENDANCE_THRESHOLD, STREAK_POLL_THRESHOLD, STREAK_INITIAL_HEARTS, STREAK_CUTOFF_DATE } from '../config.js';

/**
 * Compute SP for a given streak day number.
 *
 * Days 1-30:  1 SP/day, with 10th-day milestones (5, 7, 9)
 * Days 31+:   2 SP/day, with 10th-day milestones continuing (11, 13, 15…)
 *
 * Milestone formula: 3 + (streakDay / 10) * 2
 */
export function getStreakSpForDay(streakDay) {
  if (streakDay % 10 === 0) {
    return 3 + (streakDay / 10) * 2;
  }
  return streakDay <= 30 ? 1 : 2;
}

/**
 * Check if a student qualifies for a streak day on a given date.
 * Qualifies if at least one session on that date has both:
 *   - attendancePercentage >= STREAK_ATTENDANCE_THRESHOLD
 *   - poll participation >= STREAK_POLL_THRESHOLD
 *
 * Strategy (multi-fallback):
 * 1. Find sessions by date from the `sessions` collection.
 * 2. Look up `attendancerecords` / `pollrecords` by session label
 *    (production DB — has the actual percentages).
 * 3. If those collections are empty (dev / pre-pipeline), fall back to
 *    `sptransactions` with category attendance/poll on the same date.
 *    appliedDelta >= 10 means >= 90% which satisfies the 85% threshold.
 */
export async function qualifiesForDate(email, dateStr) {
  const dayStart = new Date(dateStr + 'T00:00:00.000Z');
  const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

  // 1. Find sessions on this date
  const sessionsOnDay = await Session.find({
    date: { $gte: dayStart, $lte: dayEnd }
  }).lean();

  if (sessionsOnDay.length) {
    const sessionLabels = sessionsOnDay.map(s => s.label);

    const [attendanceRecords, pollRecords] = await Promise.all([
      AttendanceRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean(),
      PollRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean()
    ]);

    // Primary path: use actual percentages from attendancerecords / pollrecords
    if (attendanceRecords.length) {
      for (const att of attendanceRecords) {
        if (att.attendancePercentage < STREAK_ATTENDANCE_THRESHOLD) continue;
        const poll = pollRecords.find(p => p.sessionLabel === att.sessionLabel);
        if (!poll) {
          // No poll record for this session — attendance alone qualifies
          return true;
        }
        const pollPct = poll.totalQuestions > 0
          ? Math.round(poll.attemptedQuestions / poll.totalQuestions * 100) : 0;
        if (pollPct >= STREAK_POLL_THRESHOLD) return true;
      }
      return false;
    }
  }

  // 2. Fallback: check sptransactions (appliedDelta >= 10 means >= 90%)
  const [attTxns, pollTxns] = await Promise.all([
    SPTransaction.find({ email, category: 'attendance', dateTime: { $gte: dayStart, $lte: dayEnd } }).lean(),
    SPTransaction.find({ email, category: 'poll', dateTime: { $gte: dayStart, $lte: dayEnd } }).lean()
  ]);

  const hasStrongAttendance = attTxns.some(t => t.appliedDelta >= 10);
  if (!hasStrongAttendance) return false;
  // If no polls were run on this day, attendance alone qualifies
  if (!pollTxns.length) return true;
  return pollTxns.some(t => t.appliedDelta >= 10);
}

/**
 * Get or create a Streak document for a student.
 */
export async function getOrCreateStreak(email, studentId) {
  let streak = await Streak.findOne({ email });
  if (!streak) {
    streak = await Streak.create({
      email,
      studentId,
      heartsRemaining: STREAK_INITIAL_HEARTS,
      currentStreak: 0,
      longestStreak: 0,
      totalStreakSp: 0
    });
  }
  return streak;
}

/**
 * Add days to a YYYY-MM-DD date string.
 */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isSunday(dateStr) {
  return new Date(dateStr + 'T12:00:00.000Z').getUTCDay() === 0;
}

function nextWeekday(dateStr) {
  let next = addDays(dateStr, 1);
  while (isSunday(next)) next = addDays(next, 1);
  return next;
}

/**
 * Process a single day for a student's streak.
 * - If the day qualifies: increment streak, award SP.
 * - If the day doesn't qualify: check hearts to save streak or reset.
 *
 * Returns { processed: boolean, sp?: number, streak?: number, heartUsed?: boolean, streakBroken?: boolean }
 */
export async function processDay(email, dateStr, { backfill = false } = {}) {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student || student.status === 'excused') return { processed: false };

  // Sundays don't count for streaks (Mon–Sat only)
  if (isSunday(dateStr)) return { processed: false };

  // Only students whose internship started on/after the cutoff get streaks
  const cutoffStart = new Date(student.internshipStartDate).toISOString().slice(0, 10);
  if (cutoffStart < STREAK_CUTOFF_DATE) return { processed: false };

  const streak = await getOrCreateStreak(email, student._id);

  // Idempotent: skip if already processed this date
  if (streak.lastProcessedDate && dateStr <= streak.lastProcessedDate) {
    return { processed: false };
  }

  // Skip dates before internship start
  const startDate = student.internshipStartDate;
  if (startDate) {
    const startStr = new Date(startDate).toISOString().slice(0, 10);
    if (dateStr < startStr) {
      streak.lastProcessedDate = dateStr;
      await streak.save();
      return { processed: false };
    }
  }

  const qualifies = await qualifiesForDate(email, dateStr);

  let sp = 0;
  let heartUsed = false;
  let streakBroken = false;

  if (qualifies) {
    // Advance streak
    if (streak.currentStreak === 0) {
      streak.streakStartDate = new Date(dateStr + 'T00:00:00.000Z');
    }
    streak.currentStreak += 1;
    sp = getStreakSpForDay(streak.currentStreak);
    streak.totalStreakSp += sp;
    streak.lastQualifyingDate = dateStr;

    // Record in history
    const entryType = streak.currentStreak % 10 === 0 ? 'milestone' : 'daily';
    streak.history.push({ date: dateStr, sp, type: entryType });

    // Create SP transaction
    const currentBalance = Number(student.totalSp) || 0;
    const newBalance = currentBalance + sp;
    await SPTransaction.create({
      email,
      studentId: student._id,
      category: 'streak',
      sessionLabel: `Streak Day ${streak.currentStreak}`,
      deltaMode: 'absolute',
      deltaValue: sp,
      appliedDelta: sp,
      balanceAfter: newBalance,
      reason: `Streak day ${streak.currentStreak}: ${sp} SP${streak.currentStreak % 10 === 0 ? ' (10th-day milestone!)' : ''}`,
      dateTime: new Date(dateStr + 'T23:59:00.000Z')
    });

    // Update student SP
    await Student.updateOne({ _id: student._id }, { $inc: { totalSp: sp } });

  } else {
    // Day didn't qualify — check gap (nextWeekday skips Sundays)
    const expectedPrev = streak.lastQualifyingDate ? nextWeekday(streak.lastQualifyingDate) : dateStr;
    const isConsecutiveGap = !streak.lastQualifyingDate || dateStr <= expectedPrev;

    if (isConsecutiveGap && streak.heartsRemaining > 0 && !backfill) {
      // Use a heart to save the streak
      streak.heartsRemaining -= 1;
      streak.heartsUsed += 1;
      streak.lastHeartUseDate = dateStr;
      streak.lastQualifyingDate = dateStr;
      heartUsed = true;
      streak.history.push({ date: dateStr, sp: 0, type: 'heart_save' });

    } else if (!isConsecutiveGap || (streak.heartsRemaining === 0 && streak.currentStreak > 0)) {
      // Streak broken
      if (streak.currentStreak > 0) {
        streakBroken = true;
      }
      streak.currentStreak = 0;
      streak.streakStartDate = null;
    }
  }

  // Update longest streak
  if (streak.currentStreak > streak.longestStreak) {
    streak.longestStreak = streak.currentStreak;
  }

  streak.lastProcessedDate = dateStr;

  // Keep history manageable — retain last 365 entries
  if (streak.history.length > 365) {
    streak.history = streak.history.slice(-365);
  }

  await streak.save();

  return { processed: true, sp, streak: streak.currentStreak, heartUsed, streakBroken };
}

/**
 * Process all active students for a given date.
 * Used by the daily cron job.
 */
export async function processAllStudents(dateStr, { backfill = false } = {}) {
  if (isSunday(dateStr)) return { processed: 0, qualified: 0, heartsUsed: 0, streaksBroken: 0, totalSpAwarded: 0 };
  const students = await Student.find({ status: 'active' }).lean();
  const results = { processed: 0, qualified: 0, heartsUsed: 0, streaksBroken: 0, totalSpAwarded: 0 };

  for (const student of students) {
    const result = await processDay(student.email, dateStr, { backfill });
    if (result.processed) {
      results.processed++;
      if (result.sp > 0) {
        results.qualified++;
        results.totalSpAwarded += result.sp;
      }
      if (result.heartUsed) results.heartsUsed++;
      if (result.streakBroken) results.streaksBroken++;
    }
  }

  return results;
}

/**
 * Manually claim daily streak SP from the dashboard.
 * Processes yesterday (since today's sessions may not be complete yet).
 * Idempotent — safe to call multiple times.
 */
export async function claimDailyStreak(email) {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) throw new Error('Student not found');
  if (student.status === 'excused') throw new Error('Student account is excused');

  const today = new Date().toISOString().slice(0, 10);
  let yesterday = addDays(today, -1);
  if (isSunday(yesterday)) yesterday = addDays(yesterday, -1);

  // Try to process yesterday first (full day data available)
  const streak = await getOrCreateStreak(email, student._id);

  // If yesterday was already processed, try today
  const targetDate = (streak.lastProcessedDate >= yesterday) ? today : yesterday;
  const result = await processDay(email, targetDate);

  if (!result.processed) {
    return {
      claimed: false,
      message: `Already processed up to ${streak.lastProcessedDate}`,
      streak: streak.currentStreak,
      heartsRemaining: streak.heartsRemaining,
      totalStreakSp: streak.totalStreakSp
    };
  }

  return {
    claimed: true,
    date: targetDate,
    sp: result.sp,
    streak: result.streak,
    heartUsed: result.heartUsed,
    streakBroken: result.streakBroken,
    heartsRemaining: streak.heartsRemaining,
    totalStreakSp: streak.totalStreakSp
  };
}

/**
 * Get streak status for a student (for dashboard display).
 */
export async function getStreakStatus(email) {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return null;

  const streak = await getOrCreateStreak(email, student._id);

  // Check if today qualifies
  const today = new Date().toISOString().slice(0, 10);
  const todayQualifies = await qualifiesForDate(email, today);

  // Next milestone info
  const nextMilestone = Math.ceil((streak.currentStreak + 1) / 10) * 10;
  const nextMilestoneSp = getStreakSpForDay(nextMilestone);
  const daysToMilestone = nextMilestone - streak.currentStreak;

  // Yesterday info (skip Sunday)
  let yesterday = addDays(today, -1);
  if (isSunday(yesterday)) yesterday = addDays(yesterday, -1);
  const yesterdayQualifies = streak.lastQualifyingDate === yesterday;

  return {
    currentStreak: streak.currentStreak,
    longestStreak: streak.longestStreak,
    heartsRemaining: streak.heartsRemaining,
    heartsUsed: streak.heartsUsed,
    totalStreakSp: streak.totalStreakSp,
    lastQualifyingDate: streak.lastQualifyingDate,
    streakStartDate: streak.streakStartDate,
    todayQualifies,
    yesterdayQualifies,
    nextMilestone: {
      day: nextMilestone,
      sp: nextMilestoneSp,
      daysRemaining: daysToMilestone
    },
    recentHistory: streak.history.slice(-10)
  };
}
