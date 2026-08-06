// Standup commitment — a WEEKLY, attendance-only pledge (polls stay as poll-points).
// The student pledges to attend ALL of this week's standups at a chosen attendance
// tier, with a confidence multiplier. "Keep-the-stake" economics: the stake is NOT
// debited (it represents the attendance points you earn that week); a HIT pays a
// +stake×mult bonus on top of your earned attendance, a MISS charges −0.5×stake×mult.
//
// Anti-mining: the tier floor is ≥81% and the pledge is the FULL week — you can't
// farm SP by pledging a low bar or a single session.
import Student from '../models/Student.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import Commitment from '../models/Commitment.js';
import { applySpDelta } from './vibe.js';

export const STANDUP = {
  sessionsPerWeek: 6,           // Y — standups scheduled per week (6/6)
  multipliers: [2, 3, 4],
  penaltyFactor: 0.5,
  // Two attendance tiers. Higher tier = higher bar (≥91%) and a larger stake cap,
  // to nudge students toward consistent 91–100% attendance.
  tiers: [
    { key: '81-90',  label: '81–90%',  floor: 81, stake: 20 },
    { key: '91-100', label: '91–100%', floor: 91, stake: 50 }
  ]
};

export const tierByKey = k => STANDUP.tiers.find(t => t.key === k);

// Current calendar week, Monday 00:00 → Sunday 23:59:59 (local server time).
function weekWindow(now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const dow = (start.getDay() + 6) % 7;           // 0 = Monday
  start.setDate(start.getDate() - dow);
  const end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23, 59, 59, 999);
  return { start, end };
}
const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export async function buildStandupState(student) {
  const email = student.email;
  const { start, end } = weekWindow();

  // Attendance already logged this week (informational — the demo settles by button).
  const wk = await AttendanceRecord.find({ email }).lean();
  const thisWeek = wk.filter(r => r.createdAt && new Date(r.createdAt) >= start && new Date(r.createdAt) <= end);
  const attendedThisWeek = thisWeek.filter(r => (r.attendedMinutes || 0) > 0).length;
  const avgPctThisWeek = attendedThisWeek
    ? Math.round(thisWeek.reduce((a, r) => a + (r.attendancePercentage || 0), 0) / attendedThisWeek)
    : null;

  const commits = await Commitment.find({ email, type: 'standup' }).sort({ createdAt: -1 }).lean();
  const active = commits.find(c => c.status === 'active') || null;
  const history = commits.filter(c => c.status !== 'active');
  const reserved = active ? active.reserved : 0;
  const available = Math.max(0, (student.totalSp || 0) - reserved);

  return {
    eligible: true,
    name: student.name,
    weekLabel: `${fmt(start)} – ${fmt(end)}`,
    deadline: end,
    sessionsThisWeek: STANDUP.sessionsPerWeek,
    attendedThisWeek, avgPctThisWeek,
    tiers: STANDUP.tiers, multipliers: STANDUP.multipliers, penaltyFactor: STANDUP.penaltyFactor,
    totalSp: student.totalSp || 0, available,
    active, history
  };
}

// Validate a standup pledge. Stake is FIXED at the tier cap (not chosen). Returns
// { errs, win, loss, stake, tier, deadline, label }.
export function validateStandup({ state, tierKey, multiplier }) {
  const errs = [];
  const tier = tierByKey(tierKey);
  if (!tier) errs.push('Pick an attendance tier.');
  if (!STANDUP.multipliers.includes(multiplier)) errs.push('Invalid confidence multiplier.');
  if (state.active) errs.push('You already have an active standup commitment this week.');

  const stake = tier ? tier.stake : 0;
  const win = stake * multiplier;
  const loss = STANDUP.penaltyFactor * stake * multiplier;
  // Keep-the-stake: nothing is debited now, but a MISS charges the penalty — so the
  // student must be able to cover the potential loss (SP never goes negative).
  if (loss > state.available) {
    errs.push(`You need ${loss} SP free to cover a possible miss (−${loss}); you have ${state.available}.`);
  }
  const label = tier ? `Attend all ${state.sessionsThisWeek} standups @ ${tier.label} (${multiplier}×)` : '';
  return { errs, win, loss, stake, tier, deadline: state.deadline, label };
}

export async function placeStandup(student, { tierKey, multiplier }) {
  const state = await buildStandupState(student);
  const v = validateStandup({ state, tierKey, multiplier: +multiplier });
  if (v.errs.length) return { error: v.errs.join(' ') };
  const { start, end } = weekWindow();
  await Commitment.create({
    email: student.email, type: 'standup', debited: false, reserved: 0,
    stake: v.stake, multiplier: +multiplier, potentialWin: v.win, potentialLoss: v.loss,
    tier: v.tier.key, tierFloor: v.tier.floor, sessionsTarget: state.sessionsThisWeek,
    weekStart: start, weekEnd: end, deadline: end, label: v.label, status: 'active'
  });
  return { ok: true };
}

// DEMO: resolve a standup commitment (no live weekly settlement cron yet). Keep-the-
// stake: a HIT credits +potentialWin, a MISS debits −potentialLoss. No prior debit to
// reconcile. In production this is judged automatically at week's end:
//   HIT  ⇔  sessions attended ≥ target  AND  average attendance % ≥ tier floor.
export async function settleStandupDemo(commitment, result) {
  const delta = result === 'won' ? commitment.potentialWin : -commitment.potentialLoss;
  await applySpDelta(commitment.email, delta,
    `Standup goal ${result === 'won' ? 'HIT' : 'MISS'}: ${commitment.label}`);
  await Commitment.updateOne({ _id: commitment._id },
    { $set: { status: result, resultDelta: delta, settledAt: new Date() } });
}
