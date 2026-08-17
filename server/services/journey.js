// "My Journey" — the unified phase-by-phase progress + SP view (16 July cohort).
// Four phases: (1) Standups = Zoom attendance + Spandan polls, (2) ViBe = 3 courses,
// (3) SPA = Matrix Mystics 53 problems, (4) Projects = PRs.
//
// SP attribution per phase:
//   - Standups: ALREADY awarded (attendance + poll SPTransactions) — we just aggregate.
//   - ViBe:     net SP from settled commitments (+ the weekly floor) — from the ViBe module.
//   - SPA / Projects: rule TBD until Samagama data lands — shown as "coming soon" (sp = 0).
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import Commitment from '../models/Commitment.js';
import JourneyPlan from '../models/JourneyPlan.js';
import JourneyProgress from '../models/JourneyProgress.js';
import { buildVibeState, isVibeEligible } from './vibe.js';

export const SPA_TOTAL = 53;
export const STANDUP_MINUTES_TARGET = 3600;   // cumulative Zoom minutes (~120 min/week)

export async function buildJourneyState(student) {
  const email = student.email;

  // --- Phase 1: Standups (attendance + Spandan polls) — existing SP, aggregated ---
  const [att, polls, txns] = await Promise.all([
    AttendanceRecord.find({ email }).lean(),
    PollRecord.find({ email }).lean(),
    SPTransaction.find({ email }).lean()
  ]);
  const spByCat = cats => txns
    .filter(t => cats.includes(t.category))
    .reduce((a, t) => a + (t.appliedDelta || 0), 0);
  const standups = {
    zoomMinutes: att.reduce((a, r) => a + (r.attendedMinutes || 0), 0),
    sessionsAttended: att.filter(r => (r.attendedMinutes || 0) > 0).length,
    pollSessions: polls.length,
    pollsAttempted: polls.reduce((a, p) => a + (p.attemptedQuestions || 0), 0),
    pollsTotal: polls.reduce((a, p) => a + (p.totalQuestions || 0), 0),
    spAttendance: spByCat(['attendance']),
    spPolls: spByCat(['poll'])
  };
  standups.sp = standups.spAttendance + standups.spPolls;

  // --- Phase 2: ViBe (3 courses) — summarise the commitment module ---
  const v = await buildVibeState(student);
  const settled = await Commitment.find({ email, type: 'vibe', status: { $in: ['won', 'lost'] } }).lean();
  // Pre-16-July students never had the ViBe Onboarding course — show them AI + MERN only.
  const ladder = isVibeEligible(student) ? v.ladder : v.ladder.filter(l => l.key !== 'onboarding');
  const vibe = {
    ladder,
    current: v.current,
    clearedCount: ladder.filter(l => l.cleared).length,
    totalCourses: ladder.length,
    activeCommitment: v.active
      ? { course: v.active.course, goalPct: v.active.goalPct, deadline: v.active.deadline }
      : null,
    settledCount: settled.length,
    sp: settled.reduce((a, b) => a + (b.resultDelta || 0), 0)  // net SP from settled commitments
  };

  // --- Phase 3 & 4: SPA + Projects — PLACEHOLDER (Samagama data + SP rule TBD) ---
  const jp = (await JourneyProgress.findOne({ email }).lean()) || {};
  const spa = {
    solved: jp.spaSolved || 0,
    total: jp.spaTotal || SPA_TOTAL,
    spaPoints: jp.spaPoints || 0,
    sp: 0, pending: true              // SP rule decided once Samagama data arrives
  };
  const projects = {
    prsRaised: jp.prsRaised || 0,
    prsMerged: jp.prsMerged || 0,
    sp: 0, pending: true              // SP rule decided once Samagama data arrives
  };

  const plan = await JourneyPlan.findOne({ email }).lean();

  // Per-phase goal status + pace toward the student's target date. ViBe has live
  // completion %; SPA/Projects are pending (date countdown only until Samagama data).
  const vibeOverall = Math.round(vibe.ladder.reduce((a, l) => a + l.pct, 0) / (vibe.ladder.length || 1));
  const goals = {
    standup: phaseGoal({ targetDate: plan?.standupBy, current: standups.zoomMinutes, target: STANDUP_MINUTES_TARGET, unit: 'min', daysPerWeek: STANDUP_DAYS_PER_WEEK }),
    vibe: phaseGoal({ targetDate: plan?.vibeBy, current: vibeOverall, target: 100, unit: '%' }),
    spa: phaseGoal({ targetDate: plan?.spaBy, pending: true }),
    project: phaseGoal({ targetDate: plan?.projectBy, pending: true })
  };
  // Attach realistic date bounds so a target can't be set too soon (superficial) or
  // too far out (delayed). Standups is pace-capped at ~60 min per working day.
  const endDate = student.internshipEndDate || null;
  for (const [key, g] of Object.entries(goals)) Object.assign(g, goalBounds(key, g, endDate));

  return {
    eligible: true,
    name: student.name,
    totalSp: student.totalSp || 0,
    plan: {
      standupBy: plan?.standupBy || null,
      vibeBy: plan?.vibeBy || null,
      spaBy: plan?.spaBy || null,
      projectBy: plan?.projectBy || null
    },
    goals,
    phaseSp: { standups: standups.sp, vibe: vibe.sp, spa: spa.sp, projects: projects.sp },
    standups, vibe, spa, projects
  };
}

const DAY_MS = 86400000;
const IST_MS = 5.5 * 3600 * 1000;
const startOfToday = () => {
  const ist = new Date(Date.now() + IST_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_MS);
};
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
// IST date-only string (yyyy-mm-dd) — matches how <input type="date"> works and
// avoids UTC/local off-by-one between the picker min/max and server validation.
const ymd = d => { const x = new Date(new Date(d).getTime() + IST_MS); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`; };
export const STANDUP_MIN_PER_DAY = 60;      // one 60-min standup per working day
export const STANDUP_DAYS_PER_WEEK = 6;     // 6 working days per week

// Realistic [minDate, maxDate] for a goal. Standups are pace-capped (can't beat
// 60 min/working-day over 6 working days/week); other phases just need a small buffer
// so it isn't "tomorrow". Upper bound = internship end if known, else 60 days past min.
function goalBounds(key, goal, endDate) {
  const today = startOfToday();
  let minDate;
  if (key === 'standup' && goal.remaining > 0) {
    const workDays = Math.ceil(goal.remaining / STANDUP_MIN_PER_DAY);
    minDate = addDays(today, Math.ceil((workDays * 7) / STANDUP_DAYS_PER_WEEK));   // working → calendar days
  } else {
    minDate = addDays(today, key === 'project' ? 3 : 7);
  }
  const end = endDate ? new Date(endDate) : null;
  const maxDate = end && end.getTime() > minDate.getTime() ? end : addDays(minDate, 60);
  return { minDate: ymd(minDate), maxDate: ymd(maxDate), paceHint: key === 'standup' ? '≈60 min per working day' : null };
}

// Goal status + pace for one phase. `current`/`target` are in `unit` (e.g. min, %).
// none | active | achieved | missed. pending = progress data not available yet.
function phaseGoal({ targetDate, current = null, target = null, unit = '%', pending = false, daysPerWeek = null }) {
  const t = targetDate ? new Date(targetDate) : null;
  const today = startOfToday();
  const known = !pending && current != null && target != null;
  const complete = known && current >= target;
  let status = 'none';
  // Already at/over target -> 'achieved' even if no target date was ever set, so
  // the client hides the goal-setting UI (can't set a goal on a done phase).
  if (complete) status = 'achieved';
  else if (t) status = t.getTime() < today.getTime() ? 'missed' : 'active';
  const daysLeft = t ? Math.max(0, Math.round((t.getTime() - today.getTime()) / DAY_MS)) : null;
  const progressPct = known ? Math.min(100, Math.round((current / target) * 100)) : null;
  const remaining = known ? Math.max(0, target - current) : null;
  // Pace to stay on track. For a phase with working days (standups), pace is per
  // WORKING day over the working days left; otherwise per calendar day.
  let perDay = null, perDayUnit = 'day';
  if (status === 'active' && remaining != null && daysLeft > 0) {
    if (daysPerWeek) {
      const workDaysLeft = Math.max(1, Math.round((daysLeft * daysPerWeek) / 7));
      perDay = Math.ceil(remaining / workDaysLeft);
      perDayUnit = 'working day';
    } else {
      perDay = Math.ceil(remaining / daysLeft);
    }
  }
  return {
    targetDate: t, hasTarget: !!t, status, unit,
    current: known ? current : null, target: known ? target : null,
    progressPct, remaining, remainingPct: progressPct == null ? null : Math.max(0, 100 - progressPct),
    daysLeft, perDay, perDayUnit, pending: !!pending
  };
}

// Upsert the plan dates — but LOCK a phase once its target is set and still in the
// future (a commitment device: no moving the goalpost). A phase only becomes settable
// again when its date has passed (missed). Only fields present in `incoming` are touched.
export async function saveJourneyPlan(email, incoming = {}) {
  const existing = await JourneyPlan.findOne({ email }).lean();
  const today = startOfToday();
  // Can't set a standup goal once the 3600-min target is already met (achieved).
  let standupDone = false;
  if (incoming.standupBy) {
    const att = await AttendanceRecord.find({ email }).lean();
    standupDone = att.reduce((a, r) => a + (r.attendedMinutes || 0), 0) >= STANDUP_MINUTES_TARGET;
  }
  const set = {};
  for (const f of ['standupBy', 'vibeBy', 'spaBy', 'projectBy']) {
    const cur = existing?.[f] ? new Date(existing[f]) : null;
    const locked = cur && cur.getTime() >= today.getTime();   // active future target → locked
    if (locked) continue;
    if (f === 'standupBy' && standupDone) continue;           // already achieved → not settable
    if (Object.prototype.hasOwnProperty.call(incoming, f)) set[f] = incoming[f] ? new Date(incoming[f]) : null;
  }
  if (Object.keys(set).length) await JourneyPlan.updateOne({ email }, { $set: set }, { upsert: true });
}
