import SPTransaction from '../models/SPTransaction.js';
import Student from '../models/Student.js';
import WeeklyRecap from '../models/WeeklyRecap.js';
import { weekContaining } from './weeklyWindow.js';

// ============================================================
// Weekly Recap Finalizer
// Captures the previous week's Top 10 + Bottom 50 + per-student
// activity breakdown. Idempotent — running twice for the same week
// does nothing. Safe to call any time after Saturday 23:59 IST.
//
// "Previous week" = the week that contains the day BEFORE the
// current week's Monday. (If today is Monday before 06:00 IST,
// "previous week" is the same calendar week; if today is Tuesday,
// it's last calendar week.)
// ============================================================

function previousWeekStartIso(now = new Date()) {
  const current = weekContaining(now);
  // Walk back 7 days from the current week's Monday start.
  const prevStartMs = current.startMs - 7 * 86400000;
  const d = new Date(prevStartMs);
  const s = new Date(d.getTime() + 330 * 60_000); // IST shift
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, '0');
  const day = String(s.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Compute the AI Recovery Plan for a bottom-50 student.
// Pure function so it can be unit-tested and is deterministic.
function deriveWeeklyBadge(weeklySp, attendanceCount, pollCount, challengeCount) {
  // Simple banding so the leaderboard rows have a varied, readable tag.
  if (weeklySp >= 30) return 'Top Performer';
  if (attendanceCount >= 4) return 'Attendance Star';
  if (pollCount >= 4) return 'Poll Champion';
  if (challengeCount >= 1) return 'Challenge Solver';
  if (weeklySp >= 15) return 'Consistent';
  if (weeklySp >= 5)  return 'Active';
  return 'Starter';
}

export function deriveRecoveryPlan(priorWeek, priorCounts, cohortSize) {
  // Derive a Mon–Sat plan based on what they missed.
  // The plan is intentionally simple and qualitative so the popup
  // always feels achievable, never overwhelming.
  const plan = [
    { day: 'Monday',    tasks: ['Attend session', 'Complete poll'] },
    { day: 'Tuesday',   tasks: ['Attend session', 'Join discussion'] },
    { day: 'Wednesday', tasks: ['Attend session', 'Complete poll', 'Weekly challenge'] },
    { day: 'Thursday',  tasks: ['Attend session', 'Join discussion'] },
    { day: 'Friday',    tasks: ['Attend session', 'Complete poll', 'Learning module'] },
    { day: 'Saturday',  tasks: ['Attend session', 'Finalize challenge'] }
  ];

  const observations = [];

  if ((priorCounts.attendance || 0) <= 2) {
    observations.push('You missed most live sessions last week.');
  } else if ((priorCounts.attendance || 0) <= 4) {
    observations.push('Attendance was inconsistent last week.');
  }
  if ((priorCounts.poll || 0) === 0) {
    observations.push('Poll participation was 0% last week.');
  } else if ((priorCounts.poll || 0) < 4) {
    observations.push(`Poll participation was only ${Math.round(((priorCounts.poll || 0) / 5) * 100)}% last week.`);
  }
  if ((priorCounts.challenge || 0) === 0) {
    observations.push('The weekly challenge was not attempted.');
  }

  // Estimated outcome — pitched in the user's range so it feels
  // achievable and motivating, not demoralizing.
  const targetAttendancePct = 95;
  const targetPollPct = 100;
  // Conservative rank estimate: rank 30 of N (top ~2% for a 1500-student
  // cohort). The exact rank depends on the cohort — we just say "Top 30"
  // which is realistic for someone following the plan.
  const estimatedRank = cohortSize > 50 ? 'Top 30' : 'Top 5';

  return {
    plan,
    observations,
    targetAttendancePct,
    targetPollPct,
    estimatedRank,
    message: '✨ Small improvements every day create remarkable results.'
  };
}

// Public: finalize the previous week. Returns the recap or null if
// nothing to do (no activity last week / already finalized).
export async function finalizePreviousWeek({ force = false } = {}) {
  const weekStart = previousWeekStartIso();
  const existing = await WeeklyRecap.findOne({ weekStart });
  if (existing && !force) return existing;

  // Pull transactions in the previous week's window.
  const prevStartMs = new Date(weekStart).getTime() - 330 * 60_000; // back to UTC
  const prevEndMs = prevStartMs + 7 * 86400000 - 1;

  const txns = await SPTransaction.find({
    dateTime: { $gte: new Date(prevStartMs), $lte: new Date(prevEndMs) }
  })
    .select('email appliedDelta dateTime category sessionLabel')
    .lean();

  // Aggregate per-student.
  const byEmail = new Map();
  for (const t of txns) {
    if (!byEmail.has(t.email)) byEmail.set(t.email, { sp: 0, attendance: 0, poll: 0, challenge: 0 });
    const e = byEmail.get(t.email);
    e.sp += t.appliedDelta || 0;
    if (t.category === 'attendance') e.attendance += 1;
    else if (t.category === 'poll') e.poll += 1;
    else if (t.category === 'manual' && /challenge/i.test(t.sessionLabel || '')) e.challenge += 1;
  }

  const students = await Student.find({ status: { $ne: 'excused' } })
    .select('email name')
    .lean();

  const rows = students.map(s => {
    const e = byEmail.get(s.email) || { sp: 0, attendance: 0, poll: 0, challenge: 0 };
    return {
      email: s.email,
      name: s.name,
      weeklySp: Math.max(0, e.sp),
      attendanceCount: e.attendance,
      pollCount: e.poll,
      challengeCount: e.challenge,
      weeklyBadge: deriveWeeklyBadge(e.sp, e.attendance, e.poll, e.challenge),
      // Learning consistency = poll + attendance / expected (5 each)
      learningPct: Math.min(100, Math.round(((e.attendance + e.poll) / 10) * 100))
    };
  });
  rows.sort((a, b) => b.weeklySp - a.weeklySp || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i + 1; });

  const top10 = rows.slice(0, 10);
  const bottom50 = rows.slice(-50);

  // Compute weekEnd label.
  const endDate = new Date(prevStartMs + 6 * 86400000);
  const s = new Date(endDate.getTime() + 330 * 60_000);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, '0');
  const day = String(s.getUTCDate()).padStart(2, '0');
  const weekEnd = `${y}-${m}-${day}`;

  const recap = await WeeklyRecap.findOneAndUpdate(
    { weekStart },
    {
      weekStart,
      weekEnd,
      cohortSize: rows.length,
      top10,
      bottom50,
      allRanked: rows,
      finalizedAt: new Date()
    },
    { upsert: true, new: true }
  );

  return recap;
}

// Public: fetch the most recent finalized recap (or null).
export async function latestRecap() {
  return WeeklyRecap.findOne().sort({ weekStart: -1 }).lean();
}

// Public: fetch a specific week's recap.
export async function recapForWeek(weekStart) {
  return WeeklyRecap.findOne({ weekStart }).lean();
}

// Public: build the AI Recovery Plan payload for a specific student
// in the most recent recap. Returns null if student isn't in the
// bottom 50 of the latest recap, or if there's no recap yet.
export async function recoveryPlanFor(email) {
  const recap = await latestRecap();
  if (!recap) return null;
  const me = recap.bottom50.find(r => r.email === email);
  if (!me) return null;

  // Pull per-category counts for that student during that week.
  const prevStartMs = new Date(recap.weekStart).getTime() - 330 * 60_000;
  const prevEndMs = prevStartMs + 7 * 86400000 - 1;
  const txns = await SPTransaction.find({
    email,
    dateTime: { $gte: new Date(prevStartMs), $lte: new Date(prevEndMs) }
  }).select('category').lean();
  const counts = { attendance: 0, poll: 0, challenge: 0 };
  for (const t of txns) {
    if (t.category === 'attendance') counts.attendance += 1;
    else if (t.category === 'poll') counts.poll += 1;
    else if (t.category === 'manual' && /challenge/i.test(t.sessionLabel || '')) counts.challenge += 1;
  }
  const plan = deriveRecoveryPlan(recap.weekStart, counts, recap.cohortSize);
  return {
    weekStart: recap.weekStart,
    weekEnd: recap.weekEnd,
    prior: {
      weeklySp: me.weeklySp,
      attendance: counts.attendance,
      poll: counts.poll,
      challenge: counts.challenge
    },
    plan: plan.plan,
    observations: plan.observations,
    targetAttendancePct: plan.targetAttendancePct,
    targetPollPct: plan.targetPollPct,
    estimatedRank: plan.estimatedRank,
    message: plan.message
  };
}

// ============================================================
// Weekly Goal Computation
// Picks one of three motivational buckets based on the student's
// position in last week's recap:
//   - 'close'   (rank 11-25)   → "X ranks away from Top 10"
//   - 'average' (rank 26-cohort-50) → "Keep growing"
//   - 'bottom'  (bottom 50)    → "Fresh Start"
// The same shape is used by the WeeklyGoalCard so the client can
// render whichever variant fits.
// ============================================================
export function deriveWeeklyGoal(me, recap) {
  if (!me || !recap) return null;
  const rank = me.rank;
  const cohort = recap.cohortSize || 1;

  // Bucket selection.
  let bucket;
  if (rank > cohort - 50) bucket = 'bottom';
  else if (rank <= 25) bucket = 'close';
  else bucket = 'average';

  // Targets depend on bucket — what they need to do this week to climb.
  // Counts are daily / weekly reference points. The card renders the
  // targets and the client overlays live progress.
  const targets = {
    close: [
      { id: 'attendance',  label: '100% Attendance',          perWeek: 5, perDay: 1 },
      { id: 'poll',        label: 'Complete every Daily Poll', perWeek: 5, perDay: 1 },
      { id: 'discussion',  label: 'Participate in Daily Discussions', perWeek: 5, perDay: 1 },
      { id: 'challenge',   label: "Complete this Week's Challenge", perWeek: 1, perDay: 0 }
    ],
    average: [
      { id: 'attendance',  label: '100% Attendance',           perWeek: 5, perDay: 1 },
      { id: 'poll',        label: 'Daily Poll Participation',  perWeek: 4, perDay: 1 },
      { id: 'discussion',  label: 'Join at least 3 Discussions', perWeek: 3, perDay: 0 },
      { id: 'challenge',   label: 'Complete Weekly Challenge', perWeek: 1, perDay: 0 }
    ],
    bottom: [
      { id: 'attendance',  label: 'Attend every session',     perWeek: 5, perDay: 1 },
      { id: 'poll',        label: 'Complete every Daily Poll', perWeek: 5, perDay: 1 },
      { id: 'discussion',  label: 'Join one Discussion every day', perWeek: 5, perDay: 1 },
      { id: 'challenge',   label: 'Complete the Weekly Challenge', perWeek: 1, perDay: 0 }
    ]
  }[bucket];

  // How many SP needed to climb + projected rank after the plan.
  // Conservative but motivating estimates.
  const spByTarget = { attendance: 12, poll: 8, discussion: 6, challenge: 10 };
  const requiredSp = targets.reduce((s, t) => s + (spByTarget[t.id] || 5), 0);

  const projectedRank = bucket === 'close' ? 'Top 10'
                      : bucket === 'average' ? 'Top 20'
                      : 'Top 30';

  const title = bucket === 'close' ? '🎯 Weekly Goal'
              : bucket === 'average' ? '🚀 Keep Growing'
              : '💙 Fresh Start';

  // The headline copy — uses the actual rank distance for 'close'.
  let headline;
  let subhead;
  if (bucket === 'close') {
    const ranksAway = rank - 10;
    headline = `You were only ${ranksAway} rank${ranksAway === 1 ? '' : 's'} away from becoming a Weekly Champion.`;
    subhead = "Stay consistent this week and you'll have a great chance of reaching the Top 10.";
  } else if (bucket === 'average') {
    headline = 'You made steady progress last week.';
    subhead = "Maintain your consistency and aim for the Top 20.";
  } else {
    headline = 'Every week is a new beginning.';
    subhead = 'Small daily improvements will help you move up quickly.';
  }

  return {
    bucket,
    title,
    headline,
    subhead,
    targets,
    requiredSp,
    projectedRank,
    priorRank: rank,
    priorWeeklySp: me.weeklySp
  };
}

// Public: build the goal payload for any student (used by the recap
// endpoint so the WeeklyGoalCard can render even if the student
// wasn't in the bottom 50).
export async function goalFor(email) {
  const recap = await latestRecap();
  if (!recap) return null;
  const allRanked = recap.allRanked || [];
  const me = allRanked.find(r => r.email === email);
  if (!me) return null;
  const goal = deriveWeeklyGoal(me, recap);
  return {
    weekStart: recap.weekStart,
    weekEnd: recap.weekEnd,
    ...goal
  };
}

// ============================================================
// Live Weekly Progress (current week only)
// Pulls this-week transaction counts and attendance + poll
// participation for the student so the WeeklyGoalCard can show
// real-time progress.
// ============================================================

export async function liveProgressFor(email) {
  if (!email) return null;
  const week = weekContaining();
  const startMs = week.startMs;
  const endMs = week.endMs;

  // Per-category counts this week (from SPTransaction)
  const txns = await SPTransaction.find({
    email,
    dateTime: { $gte: new Date(startMs), $lte: new Date(endMs) }
  }).select('category sessionLabel dateTime').lean();

  let attendance = 0, poll = 0, challenge = 0;
  // Track daily attendance for streak calculation
  const attendanceDays = new Set();
  const IST_OFFSET_MIN = 330;
  for (const t of txns) {
    if (t.category === 'attendance') {
      attendance += 1;
      const s = new Date(t.dateTime.getTime() + IST_OFFSET_MIN * 60_000);
      attendanceDays.add(`${s.getUTCFullYear()}-${s.getUTCMonth() + 1}-${s.getUTCDate()}`);
    }
    else if (t.category === 'poll') poll += 1;
    else if (t.category === 'manual' && /challenge/i.test(t.sessionLabel || '')) challenge += 1;
  }

  // Discussion participation — for now we approximate from any manual
  // SP that isn't an attendance/poll/challenge (closest stand-in until
  // a dedicated discussion endpoint exists). When the chat SP layer
  // is added, this can switch to read from chatrecords.
  const discussion = txns.filter(t =>
    t.category === 'manual' && !/challenge/i.test(t.sessionLabel || '')
  ).length;

  // Weekly SP so far
  const spAgg = await SPTransaction.aggregate([
    { $match: {
        email,
        dateTime: { $gte: new Date(startMs), $lte: new Date(endMs) }
    } },
    { $group: { _id: null, total: { $sum: '$appliedDelta' } } }
  ]);
  const weeklySp = spAgg[0]?.total || 0;

  // Streak (consecutive days with attendance)
  let streak = 0;
  let dayCursor = Date.now();
  for (;;) {
    const s = new Date(dayCursor + IST_OFFSET_MIN * 60_000);
    const k = `${s.getUTCFullYear()}-${s.getUTCMonth() + 1}-${s.getUTCDate()}`;
    if (attendanceDays.has(k)) {
      streak += 1;
      dayCursor -= 86400000;
    } else break;
    if (streak > 30) break;
  }

  return {
    weekStart: week.startMs,
    attendance,
    poll,
    discussion,
    challenge,
    streak,
    weeklySp,
    attendanceDays: attendanceDays.size
  };
}