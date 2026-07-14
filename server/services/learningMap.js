/**
 * Learning Map service
 *
 * Weekly view over the Spurti progress system. The map is divided into 8
 * weekly boxes that align with each student's `internshipStartDate`. Each
 * box shows how much SP the student earned that week, attendance quality,
 * and the per-session tasks ("done" / "to-do" / "missed").
 *
 * DERIVED view only. Reads Student.totalSp / highestSpEver / level /
 * trophyLeague / legendBadgeUnlocked — same fields that drive levels.js
 * and the Trophy League bands. No schema changes.
 *
 * Per-week data is computed from:
 *   - SPTransaction (dateTime + appliedDelta) — SP earned that week.
 *   - AttendanceRecord (qualified flag, joined via Session.date).
 *   - PollRecord (attemptedQuestions / totalQuestions, joined via Session).
 *   - Session itself (which sessions are scheduled this week).
 *
 * Initial-seed transactions (category='initial') are placed in a pre-week-0
 * bucket so they don't inflate any given week's earnings.
 *
 * The 8-week box label uses a 7-day window starting on Week 1's first day
 * (= internshipStartDate). Week 1 spans [start, start + 7d), Week 2
 * spans [start + 7d, start + 14d), etc. Sessions outside the 8-week
 * window are clamped into the nearest week.
 *
 * Status:
 *   - 'locked'    — week starts strictly after "now"
 *   - 'current'   — the week that "now" falls inside
 *   - 'completed' — week has fully ended
 */

import { leagueBand, legendBadge, levelFor } from './levels.js';

export const WEEK_COUNT = 8;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Per-week "stage" labels for Spurti. Each week becomes a recognizable
// stage of an internship/learning journey — not a video-game territory.
const WEEK_STAGES = [
  { name: 'Foundations',     icon: '🌱', color: '#9bc995', lore: 'Showing up, learning the rhythm. Mistakes here are cheap — that is the point.' },
  { name: 'Momentum',        icon: '🛤', color: '#82a3a8', lore: 'Consistency starts to compound. The boring middle is where most people drop off.' },
  { name: 'Output',          icon: '🌳', color: '#7e8c3c', lore: 'Quality of work multiplies. People start quoting your decisions back to you.' },
  { name: 'Reputation',      icon: '🌉', color: '#b8c4cc', lore: 'Peers and mentors can name what you do in one sentence. That sentence matters.' },
  { name: 'Depth',           icon: '🔥', color: '#d18b62', lore: 'You stop asking what and start asking why. The hard problems become your default.' },
  { name: 'Leadership',      icon: '🏰', color: '#d4af37', lore: 'Others start looking at you before they decide. Your standards quietly set theirs.' },
  { name: 'Specialization',  icon: '🌆', color: '#5f9ea0', lore: 'You are the one they call for the difficult, ambiguous, or stuck bits.' },
  { name: 'Mastery',         icon: '🏔', color: '#a855f7', lore: 'You ship something that outlasts your time here. That is the only proof that mattered.' }
];

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtIso(d) {
  if (!d) return null;
  return d.toISOString();
}

/**
 * Build a sessionLabel -> { date, ... } lookup. Sessions without a usable
 * date are dropped (they can't be placed in any week).
 */
function buildSessionLookup(sessions = []) {
  const map = new Map();
  for (const s of sessions) {
    const d = toDate(s.startDateTime || s.date);
    if (!d) continue;
    map.set(s.label, { date: d, type: s.type || '' });
  }
  return map;
}

/**
 * Bin a date into a week index (0..7). Returns null if no startDate,
 * -1 if the date is before the start (counts as seed), or the index.
 */
function weekIndexFor(date, startDate) {
  if (!date || !startDate) return null;
  const delta = date.getTime() - startDate.getTime();
  if (delta < 0) return -1;
  const idx = Math.floor(delta / MS_PER_WEEK);
  if (idx >= WEEK_COUNT) return WEEK_COUNT - 1;
  return idx;
}

/**
 * Build the task list for a single session entry inside a week. Three
 * categories: 'done' (already accomplished), 'todo' (still possible this
 * week), 'missed' (no longer reachable — only shown for completed weeks).
 *
 * Each task has:
 *   { status, kind, text, detail? }
 *
 * kind: 'attendance' | 'poll' | 'sp'
 */
function buildSessionTasks({ sessionDate, attendance, poll, spEarned, weekStatus }) {
  const tasks = [];
  const now = new Date();
  const isPast = sessionDate && sessionDate.getTime() < now.getTime();

  // Attendance task — always present for sessions in a week
  if (attendance) {
    const pct = Math.round(Number(attendance.attendancePercentage || 0));
    if (attendance.qualified) {
      tasks.push({
        status: 'done',
        kind: 'attendance',
        text: `Qualified attendance (${pct}% of session)`,
        detail: `${attendance.attendedMinutes || 0} / ${attendance.totalSessionMinutes || 0} min`
      });
    } else {
      // Session already happened but didn't qualify
      if (weekStatus === 'completed' || isPast) {
        tasks.push({
          status: 'missed',
          kind: 'attendance',
          text: `Didn't qualify for attendance (${pct}%)`,
          detail: `Need ${Math.max(0, 75 - pct)}% more to qualify`
        });
      } else {
        tasks.push({
          status: 'todo',
          kind: 'attendance',
          text: `Reach 75% attendance to qualify`,
          detail: `Currently ${pct}%`
        });
      }
    }
  } else {
    // No attendance record yet — depends on whether the session has happened
    if (weekStatus === 'completed' || isPast) {
      tasks.push({ status: 'missed', kind: 'attendance', text: 'No attendance recorded', detail: 'Session has already ended' });
    } else {
      tasks.push({ status: 'todo', kind: 'attendance', text: 'Attend this session', detail: 'Reach 75% to qualify for SP' });
    }
  }

  // Poll task — only if the session typically has a poll. We assume any
  // session can have a poll (sessions.pollFile is opt-in on the admin side).
  if (poll) {
    const attempted = Number(poll.attempted || 0);
    const total = Number(poll.total || 0);
    const missed = Number(poll.missed || Math.max(0, total - attempted));
    if (attempted >= total && total > 0) {
      tasks.push({
        status: 'done',
        kind: 'poll',
        text: `Answered the poll (${attempted}/${total})`,
        detail: missed === 0 ? 'All questions answered' : `Missed ${missed} question${missed === 1 ? '' : 's'}`
      });
    } else if (attempted > 0) {
      if (weekStatus === 'completed' || isPast) {
        tasks.push({
          status: 'missed',
          kind: 'poll',
          text: `Poll partially answered (${attempted}/${total})`,
          detail: `Missed ${missed} question${missed === 1 ? '' : 's'}`
        });
      } else {
        tasks.push({
          status: 'todo',
          kind: 'poll',
          text: `Finish the poll (${attempted}/${total} done)`,
          detail: `${missed} question${missed === 1 ? '' : 's'} left`
        });
      }
    } else {
      if (weekStatus === 'completed' || isPast) {
        tasks.push({ status: 'missed', kind: 'poll', text: 'Poll not attempted', detail: `${total} question${total === 1 ? '' : 's'} missed` });
      } else {
        tasks.push({ status: 'todo', kind: 'poll', text: 'Answer the poll', detail: `${total} question${total === 1 ? '' : 's'}` });
      }
    }
  }

  // SP earned for this session — informational only, always 'done' if > 0
  if (spEarned > 0) {
    tasks.push({ status: 'done', kind: 'sp', text: `+${spEarned} SP earned`, detail: '' });
  }

  return tasks;
}

/**
 * Compute the learning map view for a student.
 *
 * @param {Object} student
 * @param {Object} [opts]
 * @param {Array}  [opts.transactions]
 * @param {Array}  [opts.attendance]
 * @param {Array}  [opts.polls]
 * @param {Array}  [opts.sessions]
 *
 * Returns:
 *   {
 *     startDate, endDate,
 *     currentSp, peakSp, level, league, legendUnlocked,
 *     weeks: [
 *       {
 *         weekNumber, startDate, endDate, label, subLabel, icon, color, lore,
 *         spEarned, attendanceQualified, attendanceTotal,
 *         sessions: [
 *           { label, date, type, attendance, poll, sp, tasks: [{ status, kind, text, detail }] }
 *         ],
 *         doneCount, todoCount, missedCount,
 *         status: 'locked' | 'current' | 'completed'
 *       } * 8
 *     ],
 *     current, next, completedCount, totalCount, seedSp, weekCount
 *   }
 */
export function computeLearningMap(student, opts = {}) {
  const totalSp = Math.max(0, Number(student?.totalSp || 0));
  const peakSp  = Math.max(totalSp, Number(student?.highestSpEver || 0));
  const level   = Number(student?.level || levelFor(peakSp));
  const league  = String(student?.trophyLeague || leagueBand(totalSp));
  const legendUnlocked = Boolean(student?.legendBadgeUnlocked || legendBadge(peakSp));

  const startDate = toDate(student?.internshipStartDate);
  const now = new Date();

  // Build the 8-week skeleton.
  const weeks = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    const ws = startDate ? new Date(startDate.getTime() + i * MS_PER_WEEK) : null;
    const we = startDate ? new Date(startDate.getTime() + (i + 1) * MS_PER_WEEK) : null;
    const stage = WEEK_STAGES[i] || { name: `Week ${i + 1}`, icon: '📅', color: '#888', lore: '' };
    weeks.push({
      weekNumber: i + 1,
      startDate:  fmtIso(ws),
      endDate:    fmtIso(we),
      label:      stage.name,
      subLabel:   `Week ${i + 1}` + (ws && we ? ` · ${fmtDate(ws)} – ${fmtDate(new Date(we.getTime() - MS_PER_DAY))}` : ''),
      icon:       stage.icon,
      color:      stage.color,
      lore:       stage.lore,
      spEarned:   0,
      attendanceQualified: 0,
      attendanceTotal: 0,
      sessions:   [],
      doneCount:  0,
      todoCount:  0,
      missedCount: 0,
      status:     'locked'
    });
  }

  // Status: completed / current / locked.
  if (startDate) {
    const nowIdx = weekIndexFor(now, startDate);
    for (const w of weeks) {
      if (nowIdx === null) w.status = 'locked';
      else if (w.weekNumber - 1 < nowIdx) w.status = 'completed';
      else if (w.weekNumber - 1 === nowIdx) w.status = 'current';
      else w.status = 'locked';
    }
  }

  // Index sessions by week — even if the student has no attendance/poll
  // record for them yet, we want the UI to surface "this session is
  // scheduled, here's what you need to do".
  const sessLookup = buildSessionLookup(opts.sessions);
  const sessionsByWeek = Array.from({ length: WEEK_COUNT }, () => []);
  for (const [label, info] of sessLookup.entries()) {
    if (!startDate) continue;
    const idx = weekIndexFor(info.date, startDate);
    if (idx === null || idx < 0) continue;
    const target = idx >= WEEK_COUNT ? WEEK_COUNT - 1 : idx;
    const week = weeks[target];
    if (!week) continue;
    week.sessions.push({
      label,
      date: fmtIso(info.date),
      type: info.type,
      attendance: null,
      poll: null,
      sp: 0,
      tasks: []
    });
  }
  // Sort each week's sessions by date ascending.
  for (const w of weeks) w.sessions.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  // Bin transactions by week + by session within the week.
  const txList = Array.isArray(opts.transactions) ? opts.transactions : [];
  let seedSp = 0;
  for (const tx of txList) {
    const txDate = toDate(tx.dateTime || tx.createdAt);
    const isInitial = tx.category === 'initial';
    const delta = Number(tx.appliedDelta || 0);
    const txSession = tx.sessionLabel || '';

    if (isInitial) {
      seedSp += delta;
      continue;
    }

    const idx = startDate ? weekIndexFor(txDate, startDate) : null;
    if (idx === null || idx < 0) {
      seedSp += delta;
      continue;
    }
    const w = weeks[idx];
    if (!w) continue;
    w.spEarned += delta;
    // If this transaction is tied to a session in this week, attach the SP.
    if (txSession) {
      const sessionEntry = w.sessions.find(s => s.label === txSession);
      if (sessionEntry) sessionEntry.sp += delta;
    }
  }

  // Bin attendance by week + by session within the week.
  const attList = Array.isArray(opts.attendance) ? opts.attendance : [];
  for (const a of attList) {
    const lookup = sessLookup.get(a.sessionLabel);
    if (!startDate || !lookup) continue;
    const idx = weekIndexFor(lookup.date, startDate);
    if (idx === null || idx < 0 || idx >= WEEK_COUNT) continue;
    const w = weeks[idx];
    if (!w) continue;
    w.attendanceTotal += 1;
    if (a.qualified) w.attendanceQualified += 1;
    const sessionEntry = w.sessions.find(s => s.label === a.sessionLabel);
    if (sessionEntry) {
      sessionEntry.attendance = {
        qualified: Boolean(a.qualified),
        attendancePercentage: Number(a.attendancePercentage || 0),
        attendedMinutes: Number(a.attendedMinutes || 0),
        totalSessionMinutes: Number(a.totalSessionMinutes || lookup.totalMinutes || 0)
      };
    }
  }

  // Bin polls by week + by session within the week.
  const pollList = Array.isArray(opts.polls) ? opts.polls : [];
  for (const p of pollList) {
    const lookup = sessLookup.get(p.sessionLabel);
    if (!startDate || !lookup) continue;
    const idx = weekIndexFor(lookup.date, startDate);
    if (idx === null || idx < 0 || idx >= WEEK_COUNT) continue;
    const w = weeks[idx];
    if (!w) continue;
    const sessionEntry = w.sessions.find(s => s.label === p.sessionLabel);
    if (sessionEntry) {
      sessionEntry.poll = {
        total: Number(p.totalQuestions || 0),
        attempted: Number(p.attemptedQuestions || 0),
        missed: Number(p.missedQuestions || 0)
      };
    }
  }

  // Build task lists per session per week, then aggregate counts.
  for (const w of weeks) {
    for (const s of w.sessions) {
      s.tasks = buildSessionTasks({
        sessionDate: toDate(s.date),
        attendance: s.attendance,
        poll: s.poll,
        spEarned: s.sp,
        weekStatus: w.status
      });
      for (const t of s.tasks) {
        if (t.status === 'done')   w.doneCount  += 1;
        if (t.status === 'todo')   w.todoCount  += 1;
        if (t.status === 'missed') w.missedCount += 1;
      }
    }
  }

  const current = weeks.find(w => w.status === 'current') || null;
  const next = weeks.find(w => w.status === 'locked') || null;
  const completedCount = weeks.filter(w => w.status === 'completed').length;
  const totalCount = weeks.length;

  const lastWeek = weeks[weeks.length - 1];
  const lastWeekEndDisplay = lastWeek?.endDate
    ? fmtDate(new Date(new Date(lastWeek.endDate).getTime() - MS_PER_DAY))
    : '';

  return {
    startDate: fmtIso(startDate),
    endDate:   lastWeekEndDisplay,
    currentSp: totalSp,
    peakSp,
    level,
    league,
    legendUnlocked,
    weeks,
    current,
    next,
    completedCount,
    totalCount,
    seedSp,
    weekCount: WEEK_COUNT
  };
}

export default computeLearningMap;