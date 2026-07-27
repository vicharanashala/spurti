// Seed DUMMY 16-July-cohort students so the ViBe Goals tab can be demoed locally.
// Idempotent: upserts by email (all end in @dummy.test) and resets their ViBe rows.
// Existing real students (all onboarded < 16 Jul) stay ineligible and untouched.
//
//   node server/scripts/seedVibeDummy.js
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import VibeProgress from '../models/VibeProgress.js';
import Commitment from '../models/Commitment.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import JourneyProgress from '../models/JourneyProgress.js';
import JourneyPlan from '../models/JourneyPlan.js';

const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

// Build a small SP ledger that ends exactly at `sp`, so the SP Bank has rows.
function ledgerFor(email, sp, startDay) {
  const rows = []; let bal = 0;
  const push = (category, delta, reason, label, day) => {
    bal += delta;
    rows.push({ email, category, sessionLabel: label, deltaMode: 'absolute',
      deltaValue: delta, appliedDelta: delta, balanceAfter: bal, reason, dateTime: D(2026, 7, day) });
  };
  // insert in strict chronological order so the running balance stays monotonic
  push('initial', 100, 'Welcome bonus on joining Summership', '', startDay);
  push('attendance', 10, 'Attendance credit — evening session', `${startDay + 1} Jul Evening`, startDay + 1);
  push('poll', 5, 'Poll participation', `${startDay + 1} Jul Evening`, startDay + 1);
  push('attendance', 10, 'Attendance credit — evening session', `${startDay + 2} Jul Evening`, startDay + 2);
  push('attendance', 10, 'Attendance credit — evening session', `${startDay + 3} Jul Evening`, startDay + 3);
  const diff = sp - bal;                        // final adjustment to land exactly on totalSp
  if (diff !== 0) push('manual', diff, diff > 0 ? 'Instructor award' : 'Attendance shortfall adjustment', '', startDay + 3);
  return rows;
}

// Build dummy Standup evidence (Zoom attendance + Spandan poll rows) so the Journey
// "Standups" card shows real numbers. std = { sessions, minutes, pollsAttempted, pollsTotal }.
// One AttendanceRecord + one PollRecord per session (PollRecord is a per-session
// aggregate, unique on email+sessionLabel), with the poll questions spread evenly.
function standupRecordsFor(email, studentId, std, startDay) {
  const att = [], polls = [];
  const spread = (total, n, i) => Math.floor(total / n) + (i < total % n ? 1 : 0);
  for (let i = 0; i < std.sessions; i++) {
    const label = `${startDay + i} Jul Evening`;
    att.push({ email, studentId, sessionLabel: label, attendedMinutes: std.minutes,
      totalSessionMinutes: 90, attendancePercentage: Math.round(std.minutes / 90 * 100), qualified: std.minutes >= 68 });
    const tot = spread(std.pollsTotal, std.sessions, i);
    const done = Math.min(tot, spread(std.pollsAttempted, std.sessions, i));
    polls.push({ email, studentId, sessionLabel: label, totalQuestions: tot,
      attemptedQuestions: done, missedQuestions: tot - done, responses: [] });
  }
  return { att, polls };
}

// name, email, start, sp, prog (per ViBe course), std (standups), spa/proj (placeholder), plan
const DUMMY = [
  { name: 'Aadhya Rao (dummy)',  email: 'aadhya.vibe@dummy.test', start: D(2026,7,16), sp: 300,
    prog: { onboarding:{pct:100}, ai:{pct:40, weekHours:1.5}, mern:{pct:0} },
    std: { sessions:5, minutes:82, pollsAttempted:8, pollsTotal:10 },
    spa: { spaSolved:18, spaPoints:220 }, proj: { prsRaised:2, prsMerged:1 },
    plan: { vibeBy: D(2026,8,20), spaBy: D(2026,9,5), projectBy: D(2026,8,28) } },
  { name: 'Vihaan Menon (dummy)', email: 'vihaan.vibe@dummy.test', start: D(2026,7,17), sp: 150,
    prog: { onboarding:{pct:100}, ai:{pct:10, weekHours:0.5}, mern:{pct:0} },
    std: { sessions:3, minutes:64, pollsAttempted:3, pollsTotal:8 },
    spa: { spaSolved:6, spaPoints:70 }, proj: { prsRaised:0, prsMerged:0 },
    plan: { vibeBy: D(2026,9,1), spaBy: null, projectBy: null } },
  { name: 'Diya Nair (dummy)',    email: 'diya.vibe@dummy.test',   start: D(2026,7,18), sp: 120,
    prog: { onboarding:{pct:60, weekHours:1.2}, ai:{pct:0}, mern:{pct:0} },
    std: { sessions:4, minutes:78, pollsAttempted:5, pollsTotal:6 },
    spa: { spaSolved:2, spaPoints:20 }, proj: { prsRaised:0, prsMerged:0 },
    plan: { vibeBy: null, spaBy: null, projectBy: null } },
  { name: 'Arjun Iyer (dummy)',   email: 'arjun.vibe@dummy.test',  start: D(2026,7,20), sp: 500,
    prog: { onboarding:{pct:100}, ai:{pct:100}, mern:{pct:20, weekHours:2} },
    std: { sessions:6, minutes:88, pollsAttempted:11, pollsTotal:12 },
    spa: { spaSolved:41, spaPoints:530 }, proj: { prsRaised:5, prsMerged:4 },
    plan: { vibeBy: D(2026,8,10), spaBy: D(2026,8,25), projectBy: D(2026,8,15) } },
  { name: 'Kabir Shah (dummy)',   email: 'kabir.vibe@dummy.test',  start: D(2026,7,22), sp: 200,
    prog: { onboarding:{pct:100}, ai:{prior:true}, mern:{pct:5, weekHours:1} },
    std: { sessions:2, minutes:71, pollsAttempted:2, pollsTotal:4 },
    spa: { spaSolved:9, spaPoints:110 }, proj: { prsRaised:1, prsMerged:0 },
    plan: { vibeBy: D(2026,8,31), spaBy: D(2026,9,10), projectBy: null } }
];

async function main() {
  await mongoose.connect(MONGO_URI);
  const emails = DUMMY.map(d => d.email);
  await Promise.all([
    Commitment.deleteMany({ email: { $in: emails } }),
    VibeProgress.deleteMany({ email: { $in: emails } }),
    SPTransaction.deleteMany({ email: { $in: emails } }),
    AttendanceRecord.deleteMany({ email: { $in: emails } }),
    PollRecord.deleteMany({ email: { $in: emails } }),
    JourneyProgress.deleteMany({ email: { $in: emails } }),
    JourneyPlan.deleteMany({ email: { $in: emails } })
  ]);

  for (const d of DUMMY) {
    await Student.updateOne(
      { email: d.email },
      { $set: {
          name: d.name, email: d.email, internshipStartDate: d.start,
          status: 'active', totalSp: d.sp, highestSpEver: d.sp,
          level: 1, trophyLeague: 'Bronze II', leaderboardGroup: '2026-07-16'
        } },
      { upsert: true }
    );
    const stu = await Student.findOne({ email: d.email }).lean();
    for (const [course, p] of Object.entries(d.prog)) {
      await VibeProgress.updateOne(
        { email: d.email, course },
        { $set: { pct: p.pct ?? 0, weekHours: p.weekHours ?? 0, priorCompleted: !!p.prior } },
        { upsert: true }
      );
    }
    await SPTransaction.insertMany(ledgerFor(d.email, d.sp, d.start.getUTCDate()));

    // Standups — attendance + poll evidence for the Journey card
    const { att, polls } = standupRecordsFor(d.email, stu._id, d.std, d.start.getUTCDate());
    if (att.length) await AttendanceRecord.insertMany(att);
    if (polls.length) await PollRecord.insertMany(polls);

    // SPA + Projects placeholder progress, and the self-declared plan
    await JourneyProgress.updateOne({ email: d.email },
      { $set: { spaSolved: d.spa.spaSolved, spaTotal: 53, spaPoints: d.spa.spaPoints,
                prsRaised: d.proj.prsRaised, prsMerged: d.proj.prsMerged } }, { upsert: true });
    await JourneyPlan.updateOne({ email: d.email },
      { $set: { vibeBy: d.plan.vibeBy, spaBy: d.plan.spaBy, projectBy: d.plan.projectBy } }, { upsert: true });
  }

  // A little settled history so the "Past" tables aren't empty.
  await Commitment.create({
    email: 'aadhya.vibe@dummy.test', type: 'vibe', debited: true,
    course: 'ai', goalPct: 20, baselinePct: 20,
    deadline: D(2026,7,18), stake: 100, multiplier: 2,
    potentialWin: 200, potentialLoss: 100, reserved: 0,
    label: '+20% Fundamentals of AI (stake 100 @ 2×)',
    status: 'won', resultDelta: 200, settledAt: D(2026,7,18)
  });
  // A settled standup commitment for Arjun (keep-the-stake: HIT credited the +150 bonus).
  await Commitment.create({
    email: 'arjun.vibe@dummy.test', type: 'standup', debited: false, reserved: 0,
    stake: 50, multiplier: 3, potentialWin: 150, potentialLoss: 75,
    tier: '91-100', tierFloor: 91, sessionsTarget: 6,
    label: 'Attend all 6 standups @ 91–100% (3×)',
    deadline: D(2026,7,19), status: 'won', resultDelta: 150, settledAt: D(2026,7,19)
  });

  console.log(`Seeded ${DUMMY.length} dummy 16-July students:`);
  DUMMY.forEach(d => console.log(`  ${d.email}  (start ${d.start.toISOString().slice(0,10)}, ${d.sp} SP)`));
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
