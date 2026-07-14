/**
 * server/services/pulse.js
 *
 * "5-Day Pulse" — student-facing engagement tracker.
 *
 * Pure, zero-DB, zero-side-effect. Computes a student's recent engagement
 * from their existing SPTransaction + AttendanceRecord history and answers
 * the three questions a student actually has:
 *
 *   1. "Am I on track this week?"  (5-day attendance + poll %)
 *   2. "What's my streak?"          (consecutive 7-day weeks with 90%+ both)
 *   3. "What do I earn if I keep going?"  (projected weekly SP)
 *
 * The mentor's "5-day 85% / weekly 90% / +20 daily / +10 bonus" rule is
 * implemented as constants so the whole rule lives in one place.
 *
 * Thresholds (from mentor feedback):
 *   - 5-day target:          85% both attendance and polls -> "On Track"
 *   - 5-day warning:        70% one of them -> "Recovering"
 *   - Weekly elite:         90% both attendance and polls for 7 days
 *                            -> "On a Streak" — daily = 20 SP, +10 weekly bonus
 *   - 5-day critical:       <50% one of them -> "Falling Behind"
 *                            -> recovery actions surfaced
 *
 * Recovery action policy:
 *   - 1 day missed in the last 5 -> "make it up" + "get excused" CTAs
 *   - 2+ days missed           -> "talk to your admin" + "get excused"
 *
 * Pure data: no Date.now() — caller passes `now`. Trivial to unit-test
 * with fixture data spanning multiple weeks.
 */

const MS_PER_DAY = 86_400_000;

// Thresholds (from mentor feedback) — single source of truth
export const THRESHOLD_DAILY_5DAY = 85;       // 5-day target
export const THRESHOLD_DAILY_5DAY_WARN = 70;  // below this, status drops
export const THRESHOLD_DAILY_5DAY_BAD = 50;   // below this, recovery
export const THRESHOLD_WEEKLY_STREAK = 90;    // 7-day elite
export const HIGH_PERF_DAILY_SP = 20;        // daily during a streak week
export const STREAK_BONUS_SP = 10;            // +10 per completed streak week

// ── Public: 5-day pulse ────────────────────────────────────────────────

/**
 * Compute last 5 days of attendance + poll metrics for one student.
 *
 * @param {Object}   args
 * @param {Date}     args.now           - current Date (caller passes)
 * @param {Date[]}   args.attendanceDates - timestamps of attendance rows
 * @param {Date[]}   args.pollDates     - timestamps of poll rows
 * @param {Object[]} args.sessions      - all sessions (to know which days had
 *                                       eligible sessions in the window)
 *
 * Returns:
 *   {
 *     daysTracked,                // integer 1..5
 *     daysWithSession,            // integer 0..5
 *     daysAttended,               // integer 0..5
 *     daysWithPoll,               // integer 0..5
 *     daysMissed,                 // integer 0..5 (eligible days missed)
 *     attendancePct,              // 0..100 (rounded)
 *     pollPct,                    // 0..100 (rounded)
 *   }
 *
 * If daysTracked == 0, all percentages are null. Caller should render
 * "Not enough data yet" in that case.
 */
export function computeFiveDayPulse({ now, attendanceDates, pollDates, sessions }) {
  const fiveDaysAgo = new Date(now.getTime() - 5 * MS_PER_DAY);

  // Eligible days = days in the window where at least one session existed.
  // We treat "eligible" as "had a session scheduled". A day with no session
  // does not count against attendance (everyone is "off" on holidays).
  const eligibleDates = (sessions || [])
    .map(s => new Date(s.date || s.startDateTime))
    .filter(d => !isNaN(d.getTime()) && d >= fiveDaysAgo && d <= now);
  const eligibleSet = new Set(eligibleDates.map(d => dateKey(d)));

  // Unique attended days. Poll attempts count as "the student was there"
  // (the rubric doesn't separate attendance from poll participation for
  // "did the student engage today" — a student who answered polls in
  // session is present for that day). Deduped by dateKey.
  const attendedSet = new Set(
    (attendanceDates || []).map(d => dateKey(new Date(d)))
  );
  const pollSet = new Set(
    (pollDates || []).map(d => dateKey(new Date(d)))
  );
  // Combined "present" set: attended OR polled
  const presentSet = new Set([...attendedSet, ...pollSet]);

  const allDays = new Set([...eligibleSet, ...presentSet]);
  const daysTracked = allDays.size;
  const daysWithSession = eligibleSet.size;
  const daysAttended = [...eligibleSet].filter(d => presentSet.has(d)).length;
  const daysWithPoll = [...eligibleSet].filter(d => pollSet.has(d)).length;
  const daysMissed = eligibleSet.size - daysAttended;

  const attendancePct = daysWithSession === 0
    ? null
    : Math.round((daysAttended / daysWithSession) * 100);
  const pollPct = daysWithSession === 0
    ? null
    : Math.round((daysWithPoll / daysWithSession) * 100);

  return {
    daysTracked,
    daysWithSession,
    daysAttended,
    daysWithPoll,
    daysMissed,
    attendancePct,
    pollPct
  };
}

// ── Public: weekly streak detection ─────────────────────────────────────

/**
 * Count consecutive 7-day weeks where the student hit >=90% BOTH
 * attendance and polls. Each "week" is a rolling 7-day window ending on
 * (now - 7*n days).
 *
 * @param {Object} args
 * @param {Date} args.now
 * @param {Date[]} args.attendanceDates
 * @param {Date[]} args.pollDates
 * @param {Object[]} args.sessions
 *
 * Returns:
 *   {
 *     currentStreak,        // integer — # of consecutive qualifying weeks
 *     bestStreak,           // integer — best ever (capped to currentStreak
 *                            // here, since we only have recent data; a more
 *                            // sophisticated impl would persist this)
 *     lastStreakWeekStart,  // Date | null — start of the most recent qualifying week
 *     nextStreakProgress,   // 0..1 — progress toward next qualifying week
 *   }
 */
export function computeWeeklyStreak({ now, attendanceDates, pollDates, sessions }) {
  let currentStreak = 0;
  let lastStreakWeekStart = null;
  let lastStreakWeekEnd = null;

  // Walk backward in 7-day steps from "this week" up to 26 weeks back
  // (half a year). Stop at the first non-qualifying week.
  for (let n = 0; n < 26; n++) {
    const weekEnd = new Date(now.getTime() - n * 7 * MS_PER_DAY);
    const weekStart = new Date(weekEnd.getTime() - 7 * MS_PER_DAY);

    const eligibleDates = (sessions || [])
      .map(s => new Date(s.date || s.startDateTime))
      .filter(d => !isNaN(d.getTime()) && d >= weekStart && d <= weekEnd);
    const eligibleSet = new Set(eligibleDates.map(d => dateKey(d)));
    // Require at least 5 days of data in the window before considering
    // it a "qualifying week". With < 5 days we can't tell if the student
    // is on a streak or just joined the program 2 days ago.
    if (eligibleSet.size < 5) {
      // Skip without breaking the streak. n=0 (current week not yet
      // populated) is a normal case; n>=1 with few sessions is also OK
      // (e.g. mid-program join, mid-term break).
      continue;
    }

    const attendedSet = new Set((attendanceDates || []).map(d => dateKey(new Date(d))));
    const pollSet = new Set((pollDates || []).map(d => dateKey(new Date(d))));
    const presentSet = new Set([...attendedSet, ...pollSet]);

    const daysAttended = [...eligibleSet].filter(d => presentSet.has(d)).length;
    const daysWithPoll = [...eligibleSet].filter(d => pollSet.has(d)).length;
    const attPct = (daysAttended / eligibleSet.size) * 100;
    const pollPct = (daysWithPoll / eligibleSet.size) * 100;

    if (attPct >= THRESHOLD_WEEKLY_STREAK && pollPct >= THRESHOLD_WEEKLY_STREAK) {
      currentStreak++;
      if (lastStreakWeekStart === null) {
        lastStreakWeekStart = weekStart;
        lastStreakWeekEnd = weekEnd;
      }
    } else if (n === 0) {
      // Current week not yet qualifying — that's OK, keep checking
      // previous weeks (the streak is intact, just not extended yet).
      continue;
    } else {
      // Past week broke the streak
      break;
    }
  }

  return {
    currentStreak,
    bestStreak: currentStreak, // no historical record; mirror current
    lastStreakWeekStart,
    lastStreakWeekEnd,
    // nextStreakProgress is left to the client (it knows the calendar)
    nextStreakProgress: null
  };
}

// ── Public: status classification ───────────────────────────────────────

/**
 * Returns one of: 'on-track' | 'recovering' | 'at-risk' | 'fallen-behind' | 'no-data'
 */
export function classifyStatus({ attendancePct, pollPct, daysMissed, daysTracked }) {
  if (!daysTracked) return 'no-data';
  if (attendancePct === null || pollPct === null) return 'no-data';
  // Simple 3-state model (from mentor):
  //   on-track:       both >= 85% (5-day target met)
  //   at-risk:        1 day missed OR either metric < 85% but >= 70%
  //   fallen-behind:  2+ days missed OR either metric < 70%
  const attLow = attendancePct < 70;
  const pollLow = pollPct < 70;
  if (daysMissed >= 2 || attLow || pollLow) return 'fallen-behind';
  if (daysMissed >= 1 || attendancePct < THRESHOLD_DAILY_5DAY || pollPct < THRESHOLD_DAILY_5DAY) return 'at-risk';
  return 'on-track';
}

// ── Public: projected weekly SP ───────────────────────────────────────

/**
 * Project how much SP the student will earn THIS WEEK at their current pace.
 *
 * Rules (from mentor):
 *  - If weekly streak is active (>=90% both for current week): each day
 *    earns 20 SP, plus +10 SP weekly bonus at week end.
 *  - Otherwise, project at their current band using the standard rubric
 *    (90+ = 10, 75-89 = 5, 50-74 = 3, <50 = 0). This is a *forecast*, not
 *    the actual SP calculation (which the pipeline does).
 */
export function projectWeeklySP(attendancePct, pollPct, currentStreak) {
  // Active streak: full bonus
  if (currentStreak >= 1) {
    return {
      daily: HIGH_PERF_DAILY_SP,
      weekly: HIGH_PERF_DAILY_SP * 6,  // 6 days × 20 = 120
      bonus: STREAK_BONUS_SP,
      total: HIGH_PERF_DAILY_SP * 6 + STREAK_BONUS_SP,
      onStreak: true
    };
  }

  // Project at current band
  const attBand = bandFor(attendancePct ?? 0);
  const pollBand = bandFor(pollPct ?? 0);
  const dailyPer = attBand + pollBand; // attendance + poll = up to 20
  // If attendance or polls = 0, project 0 for that side
  const safeAttBand = (attendancePct ?? 0) === 0 ? 0 : attBand;
  const safePollBand = (pollPct ?? 0) === 0 ? 0 : pollBand;
  return {
    daily: safeAttBand + safePollBand,
    weekly: (safeAttBand + safePollBand) * 6,
    bonus: 0,
    total: (safeAttBand + safePollBand) * 6,
    onStreak: false
  };
}

function bandFor(pct) {
  if (pct >= 90) return 10;
  if (pct >= 75) return 5;
  if (pct >= 50) return 3;
  return 0;
}

// ── Public: orchestrator ──────────────────────────────────────────────

/**
 * One-shot helper: combine all the above into a single payload the
 * route handler can attach to studentPayload().
 *
 * @param {Object} args
 * @param {Date} args.now
 * @param {Object[]} args.transactions  - student's full SPTransaction list
 * @param {Object[]} args.attendance    - student's AttendanceRecord list
 * @param {Object[]} args.polls        - student's PollRecord list
 * @param {Object[]} args.sessions     - all Session docs (for eligibility)
 */
export function computePulse({ now, transactions, attendance, polls, sessions }) {
  const attDates = (attendance || []).map(a => a.createdAt || a.dateTime);
  const pollDates = (polls || []).flatMap(p => {
    // PollRecord may have a single createdAt or per-question timestamps
    // (responses[]). Use the student's first answer as "did they poll today".
    const arr = Array.isArray(p.responses) ? p.responses : [];
    if (arr.length > 0) {
      return arr.filter(r => r.attempted).map(r => p.createdAt || p.dateTime || r.dateTime);
    }
    return p.createdAt || p.dateTime ? [p.createdAt || p.dateTime] : [];
  });
  // attendance rows have a createdAt field; SPTransaction rows have dateTime.
  // We accept both for the attendance side: a debit row of category=attendance
  // counts as evidence of attendance on that day.
  const attDatesFromTx = (transactions || [])
    .filter(t => t.category === 'attendance')
    .map(t => t.dateTime);
  const allAttDates = [...attDates, ...attDatesFromTx];

  const fiveDay = computeFiveDayPulse({
    now,
    attendanceDates: allAttDates,
    pollDates,
    sessions
  });

  const streak = computeWeeklyStreak({
    now,
    attendanceDates: allAttDates,
    pollDates,
    sessions
  });

  const status = classifyStatus({
    attendancePct: fiveDay.attendancePct,
    pollPct: fiveDay.pollPct,
    daysMissed: fiveDay.daysMissed,
    daysTracked: fiveDay.daysTracked
  });

  const projection = projectWeeklySP(
    fiveDay.attendancePct ?? 0,
    fiveDay.pollPct ?? 0,
    streak.currentStreak
  );

  // Recovery recommendation
  let recovery;
  if (status === 'fallen-behind') {
    recovery = {
      severity: 'critical',
      title: 'You\'re falling behind',
      message: `You missed ${fiveDay.daysMissed} eligible days in the last 5. Talk to your admin about being excused — or block your calendar for tomorrow's session.`,
      actions: ['contact-admin', 'get-excused']
    };
  } else if (status === 'at-risk' || fiveDay.daysMissed >= 1) {
    recovery = {
      severity: 'warning',
      title: 'You missed 1 day',
      message: 'One missed day in the last 5. You can make it up by joining tomorrow\'s full session + answering every poll.',
      actions: ['make-up', 'get-excused']
    };
  } else if (status === 'recovering') {
    recovery = {
      severity: 'info',
      title: 'You\'re close to on-track',
      message: 'Push one more day at >=85% both to flip to 🟢 On Track.',
      actions: ['show-tomorrow']
    };
  } else {
    recovery = null;
  }

  return {
    fiveDay,
    streak,
    status,
    projection,
    recovery,
    // Convenience flag for the UI: "is this student currently earning the
    // weekly bonus?" true if current week is on track (streak will grow).
    earningWeeklyBonus: streak.currentStreak >= 1
  };
}

// ── Internal helpers ───────────────────────────────────────────────────

function dateKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}