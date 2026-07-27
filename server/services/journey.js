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
import { buildVibeState } from './vibe.js';

export const SPA_TOTAL = 53;

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
  const vibe = {
    ladder: v.ladder,
    current: v.current,
    clearedCount: v.ladder.filter(l => l.cleared).length,
    totalCourses: v.ladder.length,
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

  return {
    eligible: true,
    name: student.name,
    totalSp: student.totalSp || 0,
    plan: {
      vibeBy: plan?.vibeBy || null,
      spaBy: plan?.spaBy || null,
      projectBy: plan?.projectBy || null
    },
    phaseSp: { standups: standups.sp, vibe: vibe.sp, spa: spa.sp, projects: projects.sp },
    standups, vibe, spa, projects
  };
}

// Upsert the student's self-declared plan dates. Only the three date fields are set.
export async function saveJourneyPlan(email, { vibeBy, spaBy, projectBy }) {
  const set = {};
  const parse = d => (d ? new Date(d) : null);
  set.vibeBy = parse(vibeBy);
  set.spaBy = parse(spaBy);
  set.projectBy = parse(projectBy);
  await JourneyPlan.updateOne({ email }, { $set: set }, { upsert: true });
}
