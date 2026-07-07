/**
 * server/routes/ghostRace.js
 *
 * GET /api/ghost-race
 *
 * Returns this-week vs last-week SP comparison for the calling student.
 * Powers the "Race Your Ghost" overlay in the client.
 *
 * Response shape (matches client/src/GhostRace.jsx expectations):
 *   {
 *     today,                // 'Mon'..'Sun'
 *     weekOf,               // ISO date string, Monday of this week
 *     thisWeek: { totalSp, dailyMap, sessions[], sessionCount, sessionsQualified },
 *     ghost: {
 *       hasGhost, weekOf, totalSp, dailyMap, sessions[],
 *       status,             // 'ahead' | 'behind' | 'tied' | 'no-ghost'
 *       spDiff,             // positive = you're ahead of ghost at this point
 *       thisWindowSp,
 *       lastWindowSp,
 *       message,
 *     },
 *     personalBests: { bestWeeklySp, bestWeekOf, bestSession: {label, sp}, bestStreak },
 *   }
 *
 * Auth: same resolveStudentEmail helper used by /me, /wrapped, and
 * /weekly-leaderboard (chatengine_token passthrough -> SAMAGAMA_AUTH_URL
 * in prod; ?asEmail= or devStudentEmail cookie in non-prod).
 *
 * Pure read-only — no writes.
 */

import express from 'express';

import Student             from '../models/Student.js';
import Session             from '../models/Session.js';
import AttendanceRecord    from '../models/AttendanceRecord.js';
import SPTransaction       from '../models/SPTransaction.js';
import { resolveStudentEmail } from '../auth.js';

const router = express.Router();

/* ── Week boundary helpers (Mon 00:00 → Sun 23:59) ──── */
function weekStart(date = new Date()) {
  const d   = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

function currentWeek() {
  const start = weekStart();
  const end   = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

function lastWeek() {
  const thisStart = weekStart();
  const end   = new Date(thisStart);
  const start = new Date(thisStart);
  start.setDate(thisStart.getDate() - 7);
  return { start, end };
}

/* ── Day-key helpers ────────────────────────────────── */
const DAY_KEYS  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_INDEX = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 };

function dayKey(date) {
  // JS getDay: 0=Sun,1=Mon,...,6=Sat. Map to our Mon-first order.
  const keys = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  return keys[new Date(date).getDay()];
}

function todayKey() {
  return dayKey(new Date());
}

/* ── Daily SP map ───────────────────────────────────── */
function buildDailyMap(transactions) {
  const m = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
  for (const t of transactions) {
    const k = dayKey(t.dateTime);
    m[k] = (m[k] || 0) + (t.appliedDelta || 0);
  }
  return m;
}

/* ── Sum daily SP up to and including `targetDay` ──── */
// Used to compare "this week so far" vs "last week at same point"
function sumUpToDay(dailyMap, targetDay) {
  const cutoff = DAY_INDEX[targetDay];
  if (cutoff === undefined) return 0;
  return DAY_KEYS.slice(0, cutoff + 1)
    .reduce((s, d) => s + (dailyMap[d] || 0), 0);
}

/* ── Ghost motivational message ────────────────────── */
function ghostMessage(status, spDiff, today) {
  const late = ['Thu','Fri','Sat','Sun'].includes(today);
  if (status === 'no-ghost')
    return "No ghost yet \u2014 race begins after your first full week! \uD83D\uDC7B";
  if (status === 'tied')
    return "Perfectly tied with your ghost. One session tips the balance. \uD83D\uDC7B";
  if (status === 'ahead') {
    if (spDiff >= 20)
      return `You're crushing your ghost by ${spDiff} SP. Unstoppable. \uD83D\uDC7B\uD83D\uDD25`;
    if (spDiff >= 10)
      return `${spDiff} SP ahead of your ghost. Keep the pressure on. \uD83D\uDC7B`;
    return `${spDiff} SP ahead of your ghost. Don't let it catch up. \uD83D\uDC7B`;
  }
  // behind
  if (late && Math.abs(spDiff) > 15)
    return `Ghost is ${Math.abs(spDiff)} SP ahead. Still time to close the gap. \uD83D\uDC7B`;
  if (Math.abs(spDiff) <= 5)
    return `Ghost is only ${Math.abs(spDiff)} SP ahead. You can catch it today. \uD83D\uDC7B`;
  return `Ghost earned ${Math.abs(spDiff)} more SP at this point last week. Chase it. \uD83D\uDC7B`;
}

/* ── Best weekly SP (all-time) ──────────────────────── */
// Groups all transactions by ISO week (Mon-based epoch weeks).
// EPOCH_MON: Jan 5 1970 was the first Monday-aligned week boundary.
// Bucket = floor((dateTime - EPOCH_MON) / WEEK_MS).
async function computeBestWeek(email) {
  const WEEK_MS   = 7 * 24 * 60 * 60 * 1000;
  const EPOCH_MON = 4 * 24 * 60 * 60 * 1000; // Jan 5 1970 in ms epoch

  const agg = await SPTransaction.aggregate([
    { $match: { email } },
    { $addFields: {
        weekBucket: {
          $floor: {
            $divide: [
              { $subtract: [
                  { $toLong: '$dateTime' },
                  EPOCH_MON,
              ]},
              WEEK_MS,
            ],
          },
        },
    }},
    { $group: {
        _id: '$weekBucket',
        totalSp:   { $sum: '$appliedDelta' },
        firstDate: { $min: '$dateTime' },
    }},
    { $sort: { totalSp: -1 } },
    { $limit: 1 },
  ]);

  if (!agg.length) return { bestWeeklySp: 0, bestWeekOf: null };
  const monDate = weekStart(new Date(agg[0].firstDate));
  return {
    bestWeeklySp: agg[0].totalSp,
    bestWeekOf:   monDate.toISOString().slice(0, 10),
  };
}

/* ── Best session SP (all-time) ─────────────────────── */
async function computeBestSession(email) {
  const agg = await SPTransaction.aggregate([
    { $match: {
        email,
        sessionLabel: { $exists: true, $ne: null, $ne: '' },
    }},
    { $group: {
        _id: '$sessionLabel',
        sp:  { $sum: '$appliedDelta' },
    }},
    { $sort: { sp: -1 } },
    { $limit: 1 },
  ]);
  if (!agg.length) return { label: null, sp: 0 };
  return { label: agg[0]._id, sp: agg[0].sp };
}

/* ── Main route ──────────────────────────────────────── */
router.get('/', async (req, res) => {
  try {
    /* Auth — same pattern as /me, /wrapped, weekly-leaderboard. */
    const email = await resolveStudentEmail(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const student = await Student.findOne({ email }).lean();
    if (!student)  return res.status(404).json({ error: 'Not found' });
    if (student.status === 'excused')
      return res.status(403).json({ error: 'Excused' });

    const { start: thisStart, end: thisEnd } = currentWeek();
    const { start: lastStart, end: lastEnd } = lastWeek();
    const today = todayKey();

    /* Parallel fetch */
    const [thisTx, lastTx, thisSessions, lastSessions] = await Promise.all([
      SPTransaction.find({
        email,
        dateTime: { $gte: thisStart, $lt: thisEnd },
      }).lean(),
      SPTransaction.find({
        email,
        dateTime: { $gte: lastStart, $lt: lastEnd },
      }).lean(),
      Session.find({
        endDateTime: { $gte: thisStart, $lt: thisEnd },
      }).lean(),
      Session.find({
        endDateTime: { $gte: lastStart, $lt: lastEnd },
      }).lean(),
    ]);

    /* Only fetch attendance records for THIS student's sessions in both
       windows — keeps the record set small. */
    const allLabels = [
      ...thisSessions.map(s => s.label),
      ...lastSessions.map(s => s.label),
    ];
    const attendance = allLabels.length
      ? await AttendanceRecord.find({
          email,
          sessionLabel: { $in: allLabels },
        }).lean()
      : [];
    const attByLabel = Object.fromEntries(
      attendance.map(r => [r.sessionLabel, r])
    );

    /* Daily maps */
    const thisDailyMap = buildDailyMap(thisTx);
    const lastDailyMap = buildDailyMap(lastTx);

    /* Total SP for each week */
    const thisWeekTotal = thisTx
      .reduce((s, t) => s + (t.appliedDelta || 0), 0);
    const lastWeekTotal = lastTx
      .reduce((s, t) => s + (t.appliedDelta || 0), 0);

    /* Comparable window: this week so far vs last week at same day */
    const thisWindowSp = sumUpToDay(thisDailyMap, today);
    const lastWindowSp = sumUpToDay(lastDailyMap, today);

    /* Ghost status */
    const hasGhost = lastTx.length > 0;
    let ghostStatus = 'no-ghost';
    let spDiff = 0;
    if (hasGhost) {
      spDiff = thisWindowSp - lastWindowSp;
      if (spDiff > 0)      ghostStatus = 'ahead';
      else if (spDiff < 0) ghostStatus = 'behind';
      else                 ghostStatus = 'tied';
    }

    /* Per-session rollups */
    const buildSessionRows = (sessions, txSet, attSet) =>
      sessions.map(s => ({
        label:     s.label,
        qualified: !!(attSet[s.label]?.qualified),
        sp: txSet
          .filter(t => t.sessionLabel === s.label)
          .reduce((sum, t) => sum + (t.appliedDelta || 0), 0),
      }));

    const thisSessionData = buildSessionRows(thisSessions, thisTx, attByLabel);
    const lastSessionData = buildSessionRows(lastSessions, lastTx, attByLabel);

    /* Personal bests (parallel) */
    const [bestWeek, bestSession] = await Promise.all([
      computeBestWeek(email),
      computeBestSession(email),
    ]);

    /* Streak — best effort; if progress.js disappears the field is null. */
    let bestStreak = null;
    try {
      const { computeStreak } = await import('../services/progress.js');
      const now = new Date();
      const allSessions = await Session
        .find().sort({ endDateTime: 1 }).lean();
      const applicable = allSessions.filter(s =>
        new Date(s.endDateTime) <= now &&
        new Date(s.endDateTime) >= new Date(student.internshipStartDate)
      );
      const allAtt = await AttendanceRecord.find({ email }).lean();
      const allAttMap = Object.fromEntries(
        allAtt.map(r => [r.sessionLabel, r])
      );
      const flags = applicable.map(s =>
        !!allAttMap[s.label]?.qualified
      );
      ({ longestStreak: bestStreak } = computeStreak(flags));
    } catch (_) { /* progress.js absent — skip */ }

    return res.json({
      today,
      weekOf: thisStart.toISOString().slice(0, 10),

      thisWeek: {
        totalSp:          thisWeekTotal,
        dailyMap:         thisDailyMap,
        sessions:         thisSessionData,
        sessionCount:     thisSessions.length,
        sessionsQualified: thisSessionData.filter(s => s.qualified).length,
      },

      ghost: {
        hasGhost,
        weekOf:        lastStart.toISOString().slice(0, 10),
        totalSp:       lastWeekTotal,
        dailyMap:      lastDailyMap,
        sessions:      lastSessionData,
        status:        ghostStatus,
        spDiff,
        thisWindowSp,
        lastWindowSp,
        message:       ghostMessage(ghostStatus, spDiff, today),
      },

      personalBests: {
        bestWeeklySp:  bestWeek.bestWeeklySp,
        bestWeekOf:    bestWeek.bestWeekOf,
        bestSession,
        bestStreak,
      },
    });
  } catch (err) {
    console.error('[ghostRace]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
