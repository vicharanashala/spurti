// ViBe Commitment-SP module logic (16 July cohort onward).
// Config + eligibility + state builder + bet validation + demo settlement.
// Progress here comes from VibeProgress (dummy locally; ViBe API in production).
import Student from '../models/Student.js';
import VibeProgress from '../models/VibeProgress.js';
import Commitment from '../models/Commitment.js';
import SPTransaction from '../models/SPTransaction.js';

export const ELIGIBILITY_CUTOFF = new Date('2026-07-16T00:00:00.000Z');

// Progressive ladder order: Onboarding -> AI -> MERN.
export const COURSES = [
  { key: 'onboarding', name: 'Onboarding',          hours: 10, courseId: '6a14258a4fa5339bade5d732', versionId: '6a14258a4fa5339bade5d733' },
  { key: 'ai',         name: 'Fundamentals of AI',  hours: 6,  courseId: '6a055c4c79eef782c2548388', versionId: '6a055c4c79eef782c2548389' },
  { key: 'mern',       name: 'MERN Stack',          hours: 10, courseId: '6a0ec8254658465536acb121', versionId: '6a0ec8254658465536acb122' }
];

export const CONFIG = {
  stakeMin: 50, stakeMax: 200,
  multipliers: [2, 3, 4], // 1x dropped: under stake-debit, a 1x hit only returns the stake (net 0)
  penaltyFactor: 0.5,     // miss loses 0.5 * stake * multiplier
  maxBetDays: 3,          // deadline window 1–3 days
  floorHours: 1,          // 1 hour of content/week is mandatory
  floorSp: 10             // flat SP for hitting the weekly floor
};

export function isVibeEligible(student) {
  return Boolean(student?.internshipStartDate) &&
         new Date(student.internshipStartDate) >= ELIGIBILITY_CUTOFF;
}
export const courseByKey = k => COURSES.find(c => c.key === k);
export const floorPctFor = course => Math.round(CONFIG.floorHours / course.hours * 100);

function daysFromToday(deadline) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(deadline); d.setHours(0, 0, 0, 0);
  return Math.round((d - t) / 86400000);
}

// Build the full student-facing ViBe state.
export async function buildVibeState(student) {
  const email = student.email;
  const rows = await VibeProgress.find({ email }).lean();
  const prog = {};
  rows.forEach(r => { prog[r.course] = { pct: r.pct, week: r.weekHours, prior: !!r.priorCompleted }; });

  const ladder = COURSES.map(c => {
    const p = prog[c.key] || { pct: 0, week: 0, prior: false };
    const pct = p.prior ? 100 : p.pct;
    return { key: c.key, name: c.name, hours: c.hours, pct, prior: p.prior, cleared: p.prior || pct >= 100 };
  });
  const currentLadder = ladder.find(l => !l.cleared) || null;
  const currentCourse = currentLadder ? courseByKey(currentLadder.key) : null;

  const bets = await Commitment.find({ email, type: 'vibe' }).sort({ createdAt: -1 }).lean();
  const active = bets.find(b => b.status === 'active') || null;
  const history = bets.filter(b => b.status !== 'active');
  const reserved = active ? active.reserved : 0;
  const available = Math.max(0, (student.totalSp || 0) - reserved);

  const current = currentLadder ? {
    key: currentLadder.key,
    name: currentLadder.name,
    pct: currentLadder.pct,
    hours: currentLadder.hours,
    floorPct: floorPctFor(currentCourse),
    remaining: 100 - currentLadder.pct,
    weekHours: prog[currentLadder.key]?.week ?? 0
  } : null;

  return {
    eligible: true,
    name: student.name,
    totalSp: student.totalSp || 0,
    available, reserved,
    ladder, current,
    weeklyFloor: current
      ? { requiredHours: CONFIG.floorHours, doneHours: current.weekHours, met: current.weekHours >= CONFIG.floorHours, sp: CONFIG.floorSp }
      : null,
    active, history,
    config: CONFIG
  };
}

// Validate a place/edit request against the locked rules. Returns { errs, win, loss, baselinePct }.
export function validateBet({ state, course, goalPct, stake, multiplier, deadline, ignoreActive = false }) {
  const errs = [];
  const c = courseByKey(course);
  if (!c) errs.push('Unknown course.');
  if (!state.current || state.current.key !== course) errs.push('You can only bet on your current course.');
  if (!ignoreActive && state.active) errs.push('You already have an active bet.');
  if (!CONFIG.multipliers.includes(multiplier)) errs.push('Invalid multiplier.');
  if (!(stake >= CONFIG.stakeMin && stake <= CONFIG.stakeMax)) errs.push(`Stake must be ${CONFIG.stakeMin}–${CONFIG.stakeMax} SP.`);

  const floorPct = c ? floorPctFor(c) : 0;
  const remaining = state.current ? state.current.remaining : 0;
  if (goalPct <= floorPct) errs.push(`Goal must beat the weekly floor (${floorPct}%).`);
  if (goalPct > remaining) errs.push(`Goal exceeds your remaining ${remaining}%.`);

  if (deadline !== undefined) {
    const days = daysFromToday(deadline);
    if (days < 1 || days > CONFIG.maxBetDays) errs.push(`Deadline must be 1–${CONFIG.maxBetDays} days out.`);
  }

  const loss = CONFIG.penaltyFactor * stake * multiplier;
  const win = stake * multiplier;
  // The stake is debited up-front; a miss debits the penalty on top. So you must
  // be able to cover BOTH (worst case = stake + loss). When editing, this bet's
  // already-debited stake and reserved penalty are unwound first.
  const avail = state.available + (ignoreActive && state.active ? state.active.reserved + state.active.stake : 0);
  const need = stake + loss;
  if (need > avail) {
    errs.push(`You need ${need} SP to place this (stake ${stake} + up to ${loss} loss); you have ${avail}.`);
  }
  return { errs, win, loss, baselinePct: state.current ? state.current.pct : 0 };
}

// Apply an SP change AND write a matching SP-Bank transaction so the student sees
// it. Stamps the entry after the latest one so the running balance stays ordered
// (dummy seed dates can be future-ish). Returns the new balance.
export async function applySpDelta(email, delta, reason) {
  const student = await Student.findOne({ email });
  const newTotal = (student.totalSp || 0) + delta;
  student.totalSp = newTotal;
  if (newTotal > (student.highestSpEver || 0)) student.highestSpEver = newTotal;
  await student.save();
  const last = await SPTransaction.findOne({ email }).sort({ dateTime: -1 }).lean();
  const when = new Date(Math.max(Date.now(), (last?.dateTime ? new Date(last.dateTime).getTime() + 60000 : 0)));
  await SPTransaction.create({
    email, studentId: student._id, category: 'manual', sessionLabel: '',
    deltaMode: 'absolute', deltaValue: delta, appliedDelta: delta, balanceAfter: newTotal, reason, dateTime: when
  });
  return newTotal;
}

// DEMO ONLY: resolve a bet (there is no live settlement cron locally). The stake
// was already debited at placement; here we apply the win (credit) or the miss
// penalty (debit), advance progress, and mark the bet.
export async function settleBetDemo(bet, result) {
  const course = courseByKey(bet.course);
  const label = `+${bet.goalPct}% ${course ? course.name : bet.course} (stake ${bet.stake} @ ${bet.multiplier}×)`;
  const delta = result === 'won' ? bet.potentialWin : -bet.potentialLoss;
  await applySpDelta(bet.email, delta, `ViBe goal ${result === 'won' ? 'HIT' : 'MISS'}: ${label}`);
  const newPct = result === 'won'
    ? Math.min(100, bet.baselinePct + bet.goalPct)
    : Math.min(100, bet.baselinePct + Math.floor(bet.goalPct * 0.6)); // fell short of goal
  await VibeProgress.updateOne({ email: bet.email, course: bet.course }, { $set: { pct: newPct } }, { upsert: true });
  await Commitment.updateOne({ _id: bet._id }, { $set: { status: result, resultDelta: delta, settledAt: new Date() } });
}
