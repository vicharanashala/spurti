/**
 * Recovery Missions service — Tier 1.
 *
 * Pure-function helpers live here. The scheduler (Tier 2) and the
 * student-facing completion route (Tier 4) are the only callers; they
 * are responsible for persisting rows via the mongoose models.
 *
 * The novelty thesis depends on detection being *adaptive* — i.e. it
 * uses each student's own recent baseline, not cohort ranking alone.
 * `selectRecoveryCandidates` is the load-bearing function for that.
 *
 * ponytail: scoring is intentionally simple — sum a few heuristics into
 * a decline score, sort descending, take top N. If we ever need ML or
 * richer modelling, this becomes a real surface; right now it's a
 * transparent ranking so the admin monitor can explain "why this student".
 */
import RecoveryMission from '../models/RecoveryMission.js';
import RecoveryAssignment from '../models/RecoveryAssignment.js';
import MissionAuditEvent from '../models/MissionAuditEvent.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

// ── pure helpers ────────────────────────────────────────────────────────────

// Compute the Monday 00:00 UTC that bounds the given Date's ISO week.
export function weekStartUtc(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0=Sun..6=Sat. We want Monday. Shift by (day === 0 ? -6 : 1 - day).
  const day = x.getUTCDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  x.setUTCDate(x.getUTCDate() + offsetToMonday);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

export function addHours(d, n) {
  return new Date(d.getTime() + n * 3600 * 1000);
}

// Given a sequence of SP-transaction-shaped rows (sorted desc by dateTime),
// compute the 7-day SP delta for the given window-end.
// Rows: { email, deltaValue, dateTime } — we don't depend on mongoose here
// so this is unit-testable without a DB.
export function spDeltaSince(transactions, windowEnd, windowMs = 7 * 24 * 3600 * 1000) {
  const start = new Date(windowEnd.getTime() - windowMs);
  let delta = 0;
  for (const t of transactions) {
    const ts = t.dateTime instanceof Date ? t.dateTime : new Date(t.dateTime);
    if (ts > windowEnd || ts <= start) continue;
    delta += Number(t.deltaValue || 0);
  }
  return delta;
}

// ── detection ──────────────────────────────────────────────────────────────

// Input shape:
//   students: [{ _id, email, cohort, totalSp, recentTxns: [txnRow...] }]
//   now: Date (the scheduler's clock at detection time)
//   options: { baselineDays = 14, windowDays = 7, scoreThreshold = 6,
//              maxCandidates = 50 }
//
// Output: [{ studentId, email, score, spDelta7d, recentSp, baseline14d, cohort }]
// — sorted by score descending.
//
// ponytail: cohort-position signal is intentionally NOT the primary
// trigger. Per the user's product contract, "students in the bottom
// quartile" can be actively improving, while "above the bottom quartile
// but suddenly dropped" is the real signal. Score = decline severity +
// absolute drop + (light) cohort penalty — so the result is "this student
// really fell behind" not "this student is in the bottom 25%".
export function selectRecoveryCandidates(students, now = new Date(), options = {}) {
  const {
    baselineDays = 14,
    windowDays = 7,
    scoreThreshold = 6,
    maxCandidates = 50
  } = options;

  const baselineMs = baselineDays * 24 * 3600 * 1000;
  const windowMs = windowDays * 24 * 3600 * 1000;

  const candidates = [];
  for (const s of students) {
    const txns = s.recentTxns || [];
    // baseline (prior 14 days excluding last 7)
    const baselineStart = new Date(now.getTime() - (baselineMs + windowMs));
    const baselineEnd = new Date(now.getTime() - windowMs);
    let baselineSp = 0;
    for (const t of txns) {
      const ts = t.dateTime instanceof Date ? t.dateTime : new Date(t.dateTime);
      if (ts > baselineEnd || ts <= baselineStart) continue;
      baselineSp += Number(t.deltaValue || 0);
    }
    // recent (last 7 days)
    const recentSp = spDeltaSince(txns, now, windowMs);
    const spDelta7d = recentSp;

    // Eligibility gates — mirrors the user's contract:
    //   1. sufficient recent activity (baselineSp > 0 means we've seen this
    //      student do real work recently, so we can compare)
    //   2. 7-day SP delta below their baseline
    //   3. (optional cohort position) — only as a soft supporting signal,
    //      never as a hard cutoff
    if (baselineSp <= 0) continue;
    const recentPerDay = recentSp / windowDays;
    const baselinePerDay = baselineSp / baselineDays;
    const declinePerDay = baselinePerDay - recentPerDay; // positive = decline

    // Score: weighted combination. The "per-day" framing means a student
    // who used to do 5 SP/day and now does 1 SP/day scores 4*5=20 (big
    // decline), while a student who went from 0.5 to 0.1 scores 0.4 (small
    // decline, won't pass threshold).
    let score = declinePerDay * 5;
    // Absolute SP drop, capped — protects students whose recent activity
    // was high-volume and dropped sharply.
    const absDrop = Math.max(0, baselineSp - recentSp);
    score += Math.min(absDrop, 10);
    // Cohort signal — soft multiplier only. Students in the bottom 25%
    // of their cohort get a tiny bump, but it's never the sole reason.
    if (typeof s.cohortRank === 'number' && s.cohortRank <= 0.25) score += 1;

    if (score < scoreThreshold) continue;

    candidates.push({
      studentId: s._id,
      email: s.email,
      cohort: s.cohort,
      score,
      spDelta7d,
      recentSp,
      baseline14d: baselineSp,
      declinePerDay
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCandidates);
}

// ── intervention selection ─────────────────────────────────────────────────
//
// Given a list of mission templates and the candidate's engagement
// context, pick the most relevant enabled template.
//
// v1 strategy: pick the first ENABLED template. The novelty is in the
// DETECTION (adaptive scoring) and the AUDIT (closed loop), not in
// picking.
//
// ponytail: `recoveryContext` is the tier-3+ hook. The abstraction was
// preserved in tier 2 (per the product-defining thread) but is unused
// at this tier because v1 doesn't have a meaningful signal to feed it.
// Tier 3+ can fill it (e.g. { topic: 'Decision Trees', kind: 'poll_drop' })
// and tier 3+ will implement the smarter matcher that uses it. The
// signature is stable, the implementation is intentionally simple here.
export function selectIntervention(candidate, templates, recoveryContext = null) {
  if (!templates || templates.length === 0) return null;
  for (const t of templates) {
    if (t && t.enabled) return t;
  }
  return null;
}

// ── completion criteria ────────────────────────────────────────────────────

// Given the mission template + the student's recent activity, decide
// whether the student has satisfied the mission's criteria.
//
// For 'poll_check' (v1): the student must have answered at least N=2 of
// the 3 specified polls within the assignment's window.
//   Returns { ok: boolean, satisfied: number, total: number, reason: string }
//
// For 'contribute': the student must have shared 1 resource in the
//   assignment's contextType/contextRef within the assignment's window.
//
// The function is pure — the route layer provides the recent-activity
// data it needs to evaluate against.
export function checkCompletion(template, assignment, recentActivity) {
  if (template.activityType === 'poll_check') {
    const payload = template.activityPayload || {};
    const requiredCount = Number(payload.requiredCount || 0);
    if (requiredCount < 1) {
      return { ok: false, satisfied: 0, total: 0, reason: 'invalid template (need requiredCount ≥ 1)' };
    }
    // recentActivity.pollAnswers is an array of placeholders; we count
    // its length as the number of attempted questions in the assigned
    // poll. The route layer builds it from PollRecord.attemptedQuestions.
    const satisfied = (recentActivity.pollAnswers || []).length;
    const ok = satisfied >= requiredCount;
    return {
      ok, satisfied, total: requiredCount,
      reason: ok ? `poll_check ${satisfied}/${requiredCount} met` : `${satisfied}/${requiredCount} answered`
    };
  }
  if (template.activityType === 'contribute') {
    const requiredContext = template.activityPayload || {};
    const shares = recentActivity.contributions || [];
    const matching = shares.filter(s =>
      s.contextType === requiredContext.contextType &&
      s.contextRef === requiredContext.contextRef
    );
    const ok = matching.length >= 1;
    return {
      ok,
      satisfied: Math.min(matching.length, 1),
      total: 1,
      reason: ok ? 'contribute met' : 'no contribution in target context'
    };
  }
  return { ok: false, satisfied: 0, total: 0, reason: 'unknown activityType' };
}

// ── guardrails (enforced at the service layer, not the schema) ──────────────

// The 6 guardrails from the user's contract, made testable as pure
// functions over a candidate assignment row + the proposed transition.
//
// Returns { allowed: boolean, reason?: string }
export function validateCompletionAttempt(assignment, template, studentHasAnotherCompletedThisWeek) {
  if (!assignment) return { allowed: false, reason: 'assignment not found' };
  if (assignment.status === 'completed') return { allowed: false, reason: 'already completed' };
  if (assignment.status === 'expired')    return { allowed: false, reason: 'window expired' };
  if (new Date() > new Date(assignment.expiresAt)) {
    return { allowed: false, reason: 'window expired (clock)' };
  }
  if (studentHasAnotherCompletedThisWeek) {
    return { allowed: false, reason: 'already completed one this week' };
  }
  if (!template.enabled) return { allowed: false, reason: 'template disabled' };
  if (template.rewardSp < 1 || template.rewardSp > 5) {
    return { allowed: false, reason: 'template rewardSp out of range' };
  }
  return { allowed: true };
}

// ── persistence glue (tier 2 — NO SP writes, NO completion logic) ───────────
//
// ponytail: tier 2 ships ONLY the assignment-creation path. SP, completion,
// and audit-on-reward all live in tier 4. The clean separation means a
// failure in tier 4 (SP write) cannot break tier 2's idempotency guarantee.

// Build the trigger-reason string from a candidate. Pure helper.
export function formatTriggerReason(candidate) {
  const sign = candidate.spDelta7d > 0 ? '+' : '';
  return `7d delta=${sign}${candidate.spDelta7d}; baseline=${candidate.baseline14d}; recent=${candidate.recentSp}; score=${candidate.score.toFixed(1)}`;
}

// Tier 2's main write path. Returns:
//   { status: 'created' | 'duplicate' | 'skipped', assignmentId, reason }
// Idempotent — the unique index makes re-runs a no-op. The audit row is
// written only on first creation.
export async function createAssignment({
  candidate,
  mission,
  weekStart,
  template,            // the mission template (used for rewardSp + windowHours)
  mode = 'apply'       // 'plan' | 'apply' — tier 2 dry-run support
}) {
  if (mode !== 'apply') {
    // Dry-run / plan mode — never touch the DB. The scheduler prints these.
    return { status: 'plan', assignmentId: null, reason: 'dry-run' };
  }
  if (!candidate || !mission) {
    return { status: 'skipped', assignmentId: null, reason: 'missing candidate or mission' };
  }

  // Re-check: did we already create one for this student/week? The unique
  // index prevents duplicates but checking first lets us return the
  // existing id cleanly without a duplicate-key round-trip.
  const existing = await RecoveryAssignment.findOne({
    studentId: candidate.studentId,
    weekStart,
    missionId: mission._id
  }).lean();
  if (existing) {
    return { status: 'duplicate', assignmentId: existing._id, reason: 'already assigned this week' };
  }

  // The expiry window is template-driven, not hard-coded.
  const expiresAt = addHours(weekStart, template.windowHours || 24 * 5);

  let created;
  try {
    created = await RecoveryAssignment.create({
      studentId: candidate.studentId,
      studentEmail: candidate.email,
      missionId: mission._id,
      weekStart,
      status: 'assigned',
      triggerReason: formatTriggerReason(candidate),
      spAtDetection: candidate.recentSp ?? 0,
      spDelta7d: candidate.spDelta7d ?? 0,
      expiresAt
    });
  } catch (err) {
    // Race: another scheduler run created it between our findOne and our
    // create. The unique index guarantees we won't get a duplicate; we
    // surface this as 'duplicate' rather than failing the whole batch.
    if (err && err.code === 11000) {
      return { status: 'duplicate', assignmentId: null, reason: 'raced with another run' };
    }
    throw err;
  }

  // One audit row per assignment. NO SP row yet — that's tier 4.
  await MissionAuditEvent.create({
    assignmentId: created._id,
    studentId: candidate.studentId,
    actorType: 'system',
    actorEmail: null,
    kind: 'mission.assigned',
    payload: {
      missionId: String(mission._id),
      missionTitle: mission.title,
      activityType: mission.activityType,
      weekStart: weekStart.toISOString(),
      triggerReason: created.triggerReason
    }
  });

  return { status: 'created', assignmentId: created._id, reason: 'assigned' };
}

// ── data loading for the scheduler ───────────────────────────────────────────
//
// ponytail: tier 2 only. No other consumers. If a future tier needs a
// different window or shape, give it its own loader — don't grow this one.

// Load all active students + their SP-transactions in the recent window.
// Returns the shape `selectRecoveryCandidates` expects:
//   [{ _id, email, cohort, cohortRank, totalSp, recentTxns: [...] }]
// `cohortRank` is computed against the cohort's totalSp distribution (a
// simple percentile — no leaderboard round-trip needed).
//
// windowDays — how many days back of SP transactions to fetch per student
//              (must be ≥ baselineDays + windowDays inside the detection
//              function). Tier 2 fetches 21 days to safely cover the 14-day
//              baseline + 7-day recent window.
export async function loadStudentsWithRecentTxns({ windowDays = 21, now = new Date() } = {}) {
  const since = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);

  const students = await Student.find({ status: { $in: ['active', 'yet to onboard'] } }).lean();
  if (students.length === 0) return [];

  const studentIds = students.map(s => s._id);
  const txns = await SPTransaction.find({
    studentId: { $in: studentIds },
    dateTime: { $gte: since }
  }).sort({ dateTime: -1 }).lean();

  // Group txns by studentId for fast lookup.
  const txnsByStudent = new Map();
  for (const t of txns) {
    const key = String(t.studentId);
    if (!txnsByStudent.has(key)) txnsByStudent.set(key, []);
    txnsByStudent.get(key).push({
      deltaValue: t.deltaValue,
      dateTime: t.dateTime
    });
  }

  // Compute cohort-rank (percentile within cohort) for each student.
  // Group by cohort, sort desc by totalSp, give each student its rank
  // (0 = top, 1 = bottom). We use this as a soft signal in scoring.
  const byCohort = new Map();
  for (const s of students) {
    const c = s.cohort || '_';
    if (!byCohort.has(c)) byCohort.set(c, []);
    byCohort.get(c).push(s);
  }
  const rankById = new Map();
  for (const [, group] of byCohort) {
    group.sort((a, b) => (b.totalSp || 0) - (a.totalSp || 0));
    group.forEach((s, i) => {
      // rank as fraction: top = 0, bottom ≈ 1
      rankById.set(String(s._id), group.length === 1 ? 0.5 : i / (group.length - 1));
    });
  }

  return students.map(s => ({
    _id: s._id,
    email: s.email,
    cohort: s.cohort,
    cohortRank: rankById.get(String(s._id)),
    totalSp: s.totalSp,
    recentTxns: txnsByStudent.get(String(s._id)) || []
  }));
}
