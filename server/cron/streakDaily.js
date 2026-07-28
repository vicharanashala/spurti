/**
 * streakDaily.js — Daily cron script to process streaks for all active students.
 *
 * Run daily after the pipeline completes (e.g. 23:59 IST):
 *   node server/cron/streakDaily.js
 *
 * Options:
 *   DATE=2026-07-20   — process a specific date (default: yesterday)
 *   DRY_RUN=1         — log results without writing to DB
 *   BACKFILL=1        — process from each student's start date (one-time setup)
 *
 * Requires MONGO_URI in .env (same DB as the web app).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || '';
const DRY_RUN = process.env.DRY_RUN === '1';
const BACKFILL = process.env.BACKFILL === '1';

// Thresholds (must match server/config.js)
const STREAK_ATTENDANCE_THRESHOLD = 85;
const STREAK_POLL_THRESHOLD = 85;
const STREAK_INITIAL_HEARTS = 2;
const STREAK_CUTOFF_DATE = '2026-07-16';

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

function getStreakSpForDay(streakDay) {
  if (streakDay % 10 === 0) return 3 + (streakDay / 10) * 2;
  return streakDay <= 30 ? 1 : 2;
}

(async () => {
  if (!MONGO_URI) throw new Error('no MONGO_URI');

  const conn = await MongoClient.connect(MONGO_URI, { socketTimeoutMS: 600000 });
  const db = conn.db();

  // Target date: yesterday (IST-aware), skip Sunday
  const now = new Date();
  const istOffset = 5.5 * 3600 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const yesterdayIST = new Date(istNow.getTime() - 86400000);
  let defaultDate = yesterdayIST.toISOString().slice(0, 10);
  if (isSunday(defaultDate)) defaultDate = addDays(defaultDate, -1);
  const targetDate = process.env.DATE || defaultDate;

  if (isSunday(targetDate)) {
    console.log('Target date is Sunday — nothing to process.');
    await conn.close();
    return;
  }

  console.log(`Streak daily — target date: ${targetDate} (DRY_RUN=${DRY_RUN ? '1' : '0'} BACKFILL=${BACKFILL ? '1' : '0'})`);

  // Load all active students
  const students = await db.collection('students').find({ status: 'active' }).toArray();
  console.log(`Active students: ${students.length}`);

  const results = { processed: 0, qualified: 0, heartsUsed: 0, streaksBroken: 0, totalSpAwarded: 0, errors: 0 };

  for (const student of students) {
    const email = student.email;
    const studentId = student._id;
    const startDate = student.internshipStartDate ? new Date(student.internshipStartDate).toISOString().slice(0, 10) : targetDate;

    // Skip students who started before the streak cutoff
    if (startDate < STREAK_CUTOFF_DATE) continue;

    // Determine date range to process
    let datesToProcess = [];
    if (BACKFILL) {
      // Process from start date to target date, skip Sundays
      let d = startDate;
      while (d <= targetDate) {
        if (!isSunday(d)) datesToProcess.push(d);
        d = addDays(d, 1);
      }
    } else {
      datesToProcess = [targetDate];
    }

    // Get or create streak doc
    let streak = await db.collection('streaks').findOne({ email });
    if (!streak) {
      streak = {
        email,
        studentId,
        currentStreak: 0,
        longestStreak: 0,
        heartsRemaining: STREAK_INITIAL_HEARTS,
        heartsUsed: 0,
        lastQualifyingDate: '',
        lastProcessedDate: '',
        streakStartDate: null,
        totalStreakSp: 0,
        lastHeartUseDate: '',
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (!DRY_RUN) {
        await db.collection('streaks').insertOne(streak);
      }
    }

    for (const dateStr of datesToProcess) {
      // Idempotent: skip already processed
      if (streak.lastProcessedDate && dateStr <= streak.lastProcessedDate) continue;

      // Skip before start date
      if (dateStr < startDate) {
        streak.lastProcessedDate = dateStr;
        continue;
      }

      // Check qualification — multi-fallback strategy
      const dayStart = new Date(dateStr + 'T00:00:00.000Z');
      const dayEnd = new Date(dateStr + 'T23:59:59.999Z');

      let qualifies = false;
      try {
        // 1. Try sessions collection -> attendancerecords/pollrecords
        const sessionsOnDay = await db.collection('sessions').find({
          date: { $gte: dayStart, $lte: dayEnd }
        }).toArray();
        let usedPrimary = false;
        if (sessionsOnDay.length) {
          const sessionLabels = sessionsOnDay.map(s => s.label);
          const attRecords = await db.collection('attendancerecords').find({
            email, sessionLabel: { $in: sessionLabels }
          }).toArray();

          if (attRecords.length) {
            usedPrimary = true;
            for (const att of attRecords) {
              if ((att.attendancePercentage || 0) < STREAK_ATTENDANCE_THRESHOLD) continue;
              const poll = await db.collection('pollrecords').findOne({
                email, sessionLabel: att.sessionLabel
              });
              if (!poll) { qualifies = true; break; }
              const pollPct = poll.totalQuestions > 0
                ? Math.round(poll.attemptedQuestions / poll.totalQuestions * 100)
                : 0;
              if (pollPct >= STREAK_POLL_THRESHOLD) { qualifies = true; break; }
            }
          }
        }

        // 2. Fallback: sptransactions (appliedDelta >= 10 means >= 90%)
        if (!usedPrimary) {
          const attTxns = await db.collection('sptransactions').find({
            email, category: 'attendance', dateTime: { $gte: dayStart, $lte: dayEnd }
          }).toArray();
          const pollTxns = await db.collection('sptransactions').find({
            email, category: 'poll', dateTime: { $gte: dayStart, $lte: dayEnd }
          }).toArray();
          const hasStrongAtt = attTxns.some(t => t.appliedDelta >= 10);
          if (hasStrongAtt) {
            // If no polls ran that day, attendance alone qualifies
            qualifies = !pollTxns.length || pollTxns.some(t => t.appliedDelta >= 10);
          }
        }
      } catch (err) {
        console.error(`  Error checking ${email} on ${dateStr}:`, err.message);
        results.errors++;
        continue;
      }

      let sp = 0;
      let heartUsed = false;

      if (qualifies) {
        if (streak.currentStreak === 0) {
          streak.streakStartDate = new Date(dateStr + 'T00:00:00.000Z');
        }
        streak.currentStreak += 1;
        sp = getStreakSpForDay(streak.currentStreak);
        streak.totalStreakSp += sp;
        streak.lastQualifyingDate = dateStr;
        streak.history.push({ date: dateStr, sp, type: streak.currentStreak % 10 === 0 ? 'milestone' : 'daily' });

        if (!DRY_RUN) {
          // Create SP transaction
          const currentBalance = Number(student.totalSp) || 0;
          await db.collection('sptransactions').insertOne({
            email,
            studentId,
            category: 'streak',
            sessionLabel: `Streak Day ${streak.currentStreak}`,
            deltaMode: 'absolute',
            deltaValue: sp,
            appliedDelta: sp,
            balanceAfter: currentBalance + sp,
            reason: `Streak day ${streak.currentStreak}: ${sp} SP${streak.currentStreak % 10 === 0 ? ' (10th-day milestone!)' : ''}`,
            dateTime: new Date(dateStr + 'T23:59:00.000Z'),
            createdAt: new Date(),
            updatedAt: new Date()
          });
          // Update student totalSp
          await db.collection('students').updateOne(
            { _id: studentId },
            { $inc: { totalSp: sp } }
          );
        }

        results.qualified++;
        results.totalSpAwarded += sp;

      } else {
        // Not qualifying — check heart or break (nextWeekday skips Sundays)
        const expectedPrev = streak.lastQualifyingDate ? nextWeekday(streak.lastQualifyingDate) : dateStr;
        const isConsecutiveGap = !streak.lastQualifyingDate || dateStr <= expectedPrev;

        if (isConsecutiveGap && streak.heartsRemaining > 0 && !BACKFILL) {
          streak.heartsRemaining -= 1;
          streak.heartsUsed += 1;
          streak.lastHeartUseDate = dateStr;
          streak.lastQualifyingDate = dateStr;
          heartUsed = true;
          streak.history.push({ date: dateStr, sp: 0, type: 'heart_save' });
          results.heartsUsed++;
        } else if (streak.currentStreak > 0) {
          streak.currentStreak = 0;
          streak.streakStartDate = null;
          results.streaksBroken++;
        }
      }

      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }
      streak.lastProcessedDate = dateStr;
    }

    // Trim history
    if (streak.history.length > 365) streak.history = streak.history.slice(-365);
    streak.updatedAt = new Date();

    if (!DRY_RUN) {
      await db.collection('streaks').updateOne(
        { email },
        { $set: streak },
        { upsert: true }
      );
    }

    results.processed++;
  }

  console.log(`\nResults:`);
  console.log(`  Processed: ${results.processed}`);
  console.log(`  Qualified: ${results.qualified}`);
  console.log(`  Hearts used: ${results.heartsUsed}`);
  console.log(`  Streaks broken: ${results.streaksBroken}`);
  console.log(`  Total SP awarded: ${results.totalSpAwarded}`);
  console.log(`  Errors: ${results.errors}`);

  if (DRY_RUN) console.log('\nDRY RUN — no DB writes.');
  await conn.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
