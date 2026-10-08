// Fills a throwaway DEMO database with a realistic cohort so a teacher can click
// through every tab: stars, steady attenders, strugglers, late joiners, excused
// students, plus sessions, attendance, polls, the SP ledger, SPA, ViBe, project
// reviews, commitments, announcements, activity events and leaderboards.
//
//   npm run seed:demo        (needs MONGO_URI to contain "demo" — it wipes what it touches)
//
// Deterministic: the same run always produces the same cohort.
import 'dotenv/config';
import mongoose from 'mongoose';
import Student from './models/Student.js';
import SPTransaction from './models/SPTransaction.js';
import Session from './models/Session.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import PollRecord from './models/PollRecord.js';
import SpaProgress from './models/SpaProgress.js';
import JourneyPlan from './models/JourneyPlan.js';
import Commitment from './models/Commitment.js';
import Announcement from './models/Announcement.js';
import AnnouncementAck from './models/AnnouncementAck.js';
import SessionEvent from './models/SessionEvent.js';
import Achievement from './models/Achievement.js';
import AchievementView from './models/AchievementView.js';
import BoardReign from './models/BoardReign.js';
import LeaderboardSnapshot from './models/LeaderboardSnapshot.js';
import TrajectorySnapshot from './models/TrajectorySnapshot.js';
import ShareEvent from './models/ShareEvent.js';
import { ActVibeProgress, ActPullRequest, ActPrReview } from './models/ActMirrors.js';
import { levelFor, leagueBand, leaderboardGroup } from './services/levels.js';
import { computeAndStoreLeaderboards } from './services/leaderboards.js';
import { computeAndStoreTrajectories } from './services/trajectory.js';

const URI = process.env.MONGO_URI;
if (!/demo/.test(URI || '')) { console.error('refusing: MONGO_URI must be a *demo* db'); process.exit(1); }
await mongoose.connect(URI);

// ── deterministic randomness ─────────────────────────────────────────────────
let seed = 20261008;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const between = (a, b) => a + rnd() * (b - a);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const DAY = 86400000;
const now = new Date();
const midnightUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const today = midnightUtc(now);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── archetypes: what each kind of student looks like to a teacher ────────────
// att = chance of showing up, full = chance they stay the whole session when they do,
// poll = average poll correctness, spa/query/project/vibe drive the other phases.
const A = {
  star:     { att: 0.97, full: 0.95, poll: 0.90, learn: [38, 50], teach: [18, 25], query: [20, 40], project: 1,   vibe: [90, 100], plan: true,  quiz: 0.85 },
  steady:   { att: 0.90, full: 0.80, poll: 0.75, learn: [22, 38], teach: [8, 16],  query: [8, 20],  project: 0.7, vibe: [60, 95],  plan: true,  quiz: 0.7 },
  average:  { att: 0.75, full: 0.55, poll: 0.60, learn: [8, 22],  teach: [2, 8],   query: [0, 8],   project: 0.3, vibe: [25, 65],  plan: false, quiz: 0.5 },
  improving:{ att: 0.80, full: 0.65, poll: 0.65, learn: [14, 30], teach: [4, 12],  query: [4, 14],  project: 0.4, vibe: [40, 80],  plan: true,  quiz: 0.6, ramp: true },
  fading:   { att: 0.60, full: 0.40, poll: 0.45, learn: [6, 18],  teach: [0, 5],   query: [0, 4],   project: 0.1, vibe: [15, 50],  plan: false, quiz: 0.35, fade: true },
  atrisk:   { att: 0.30, full: 0.20, poll: 0.25, learn: [0, 6],   teach: [0, 2],   query: [0, 0],   project: 0,   vibe: [0, 20],   plan: false, quiz: 0.15 },
  pollwiz:  { att: 0.85, full: 0.85, poll: 0.95, learn: [10, 25], teach: [3, 10],  query: [2, 10],  project: 0.4, vibe: [40, 75],  plan: true,  quiz: 0.9 },
  helper:   { att: 0.80, full: 0.70, poll: 0.60, learn: [12, 26], teach: [14, 25], query: [30, 40], project: 0.5, vibe: [45, 85],  plan: true,  quiz: 0.6 }
};

// [name, archetype, startOffsetDays (days before today)]
const ROSTER = [
  ['Aarav Mehta', 'star', 140], ['Ananya Iyer', 'star', 140], ['Rohan Kapoor', 'star', 125], ['Diya Nair', 'star', 110],
  ['Kabir Singh', 'steady', 140], ['Ishita Verma', 'steady', 140], ['Arjun Reddy', 'steady', 125], ['Meera Krishnan', 'steady', 125],
  ['Vihaan Gupta', 'steady', 110], ['Saanvi Patel', 'steady', 110], ['Aditya Joshi', 'steady', 95], ['Navya Rao', 'steady', 95],
  ['Priya Sharma', 'pollwiz', 140], ['Rahul Desai', 'pollwiz', 110], ['Tanvi Kulkarni', 'pollwiz', 80],
  ['Siddharth Bose', 'helper', 125], ['Lakshmi Menon', 'helper', 110], ['Harsh Vardhan', 'helper', 95],
  ['Neha Agarwal', 'improving', 125], ['Karan Malhotra', 'improving', 110], ['Pooja Bhatt', 'improving', 95], ['Yash Thakur', 'improving', 80],
  ['Riya Chatterjee', 'average', 140], ['Manav Saxena', 'average', 140], ['Sneha Pillai', 'average', 125], ['Dev Choudhary', 'average', 125],
  ['Isha Banerjee', 'average', 110], ['Nikhil Jain', 'average', 110], ['Anjali Mishra', 'average', 95], ['Varun Sethi', 'average', 95],
  ['Kavya Hegde', 'average', 80], ['Pranav Kaul', 'average', 80], ['Shreya Ghosh', 'average', 65], ['Omkar Patil', 'average', 65],
  ['Zoya Khan', 'fading', 140], ['Aman Tiwari', 'fading', 125], ['Bhavna Rathore', 'fading', 110], ['Chirag Mahajan', 'fading', 95],
  ['Deepa Venkatesh', 'atrisk', 125], ['Eshaan Bhatia', 'atrisk', 110], ['Farhan Qureshi', 'atrisk', 95], ['Gauri Naik', 'atrisk', 80],
  // recently joined — little history yet
  ['Hemant Yadav', 'steady', 28], ['Ira Sinha', 'average', 21], ['Jay Parekh', 'improving', 14], ['Kiara Dutta', 'steady', 10],
  ['Laksh Bajaj', 'average', 7], ['Mitali Shetty', 'star', 5],
  // excused — record preserved, out of the competition
  ['Nitin Kohli', 'average', 130], ['Ojas Phadke', 'fading', 100]
];
const EXCUSED = new Set(['Nitin Kohli', 'Ojas Phadke']);
const EXCUSE_REASON = { 'Nitin Kohli': 'Medical leave — approved by programme office', 'Ojas Phadke': 'Withdrew: joined a campus placement drive' };

const slug = (n) => n.toLowerCase().replace(/[^a-z]+/g, '.');
const emailOf = (n) => `${slug(n)}@demo.spurti.edu`;

// ── wipe ─────────────────────────────────────────────────────────────────────
console.log('wiping demo collections…');
await Promise.all([
  Student, SPTransaction, Session, AttendanceRecord, PollRecord, SpaProgress, JourneyPlan, Commitment,
  Announcement, AnnouncementAck, SessionEvent, Achievement, AchievementView, BoardReign, LeaderboardSnapshot,
  TrajectorySnapshot, ShareEvent, ActVibeProgress, ActPullRequest, ActPrReview
].map((m) => m.deleteMany({})));

// ── sessions: weekday evening standups for the last 8 weeks, plus V-Talks ────
const sessions = [];
for (let d = 56; d >= 0; d--) {
  const day = new Date(today.getTime() - d * DAY);
  const dow = day.getUTCDay();
  if (dow === 0) continue;                       // no Sunday session
  const isVTalk = dow === 6;                     // Saturday = V-Talk
  const total = isVTalk ? 90 : pick([60, 60, 75, 90]);
  const end = new Date(day.getTime() + (isVTalk ? 12 : 17.5) * 3600000);   // UTC; evening ≈ 23:00 IST
  if (end > now) continue;                       // never invent a session in the future
  const label = `${String(day.getUTCDate()).padStart(2, '0')} ${MON[day.getUTCMonth()]} ${isVTalk ? 'V-Talk' : 'Evening'}`;
  sessions.push({
    label, date: day, startDateTime: new Date(end.getTime() - total * 60000), endDateTime: end,
    totalMinutes: total, type: isVTalk ? 'vtalk' : 'standup'
  });
}
await Session.insertMany(sessions);
console.log('sessions:', sessions.length);

// ── per student: roster, attendance, polls, ledger ───────────────────────────
const tier = (pct) => (pct >= 90 ? 10 : pct >= 75 ? 5 : pct >= 50 ? 3 : 0);
const students = [];
const allTxns = [];
const allAtt = [];
const allPolls = [];
const profiles = new Map();   // email -> extra state used later (project, vibe, ...)

for (const [name, kind, offset] of ROSTER) {
  const a = A[kind];
  const email = emailOf(name);
  const start = new Date(today.getTime() - offset * DAY + 3.5 * 3600000);   // 09:00 IST
  const group = leaderboardGroup(start);
  const stu = await Student.create({
    name, email, status: EXCUSED.has(name) ? 'excused' : 'active',
    excusedAt: EXCUSED.has(name) ? new Date(today.getTime() - 12 * DAY) : null,
    excusedReason: EXCUSED.has(name) ? EXCUSE_REASON[name] : '',
    internshipStartDate: start,
    internshipEndDate: new Date(start.getTime() + 84 * DAY),
    leaderboardGroup: group,
    totalSp: 100, highestSpEver: 100,
    surveyCompleted: rnd() < 0.7, poll2Completed: rnd() < 0.5, poll3Completed: rnd() < 0.3
  });

  let balance = 0;
  let peak = 0;
  const txns = [];
  const add = (category, delta, reason, dateTime, sessionLabel = '') => {
    const applied = Math.max(delta, -balance);        // a balance never goes below zero
    balance += applied;
    peak = Math.max(peak, balance);
    txns.push({
      email, studentId: stu._id, category, sessionLabel, deltaMode: 'absolute',
      deltaValue: delta, appliedDelta: applied, balanceAfter: balance, reason, dateTime
    });
  };

  add('initial', 100, 'Welcome grant: +100 SP on your official start date', start);

  const mine = sessions.filter((s) => s.endDateTime > start);
  const span = Math.max(1, mine.length - 1);
  mine.forEach((s, i) => {
    const progress = i / span;                                  // 0 → 1 over the student's own time
    let pAtt = a.att;
    if (a.ramp) pAtt = 0.45 + 0.5 * progress;                   // improving: gets better
    if (a.fade) pAtt = 0.9 - 0.7 * progress;                    // fading: drops off
    let pFull = a.full * (a.ramp ? 0.6 + 0.4 * progress : a.fade ? 1 - 0.6 * progress : 1);
    const came = rnd() < pAtt;
    const share = came ? (rnd() < pFull ? between(0.9, 1) : between(0.35, 0.89)) : 0;
    const minutes = Math.round(s.totalMinutes * share);
    const pct = Math.round(share * 100);
    const when = s.endDateTime;

    allAtt.push({
      email, studentId: stu._id, sessionLabel: s.label, attendedMinutes: minutes,
      totalSessionMinutes: s.totalMinutes, attendancePercentage: pct, qualified: pct >= 75
    });
    const attSp = tier(pct);
    add('attendance', attSp,
      came ? `Attended ${minutes} of ${s.totalMinutes} min (${pct}%) of ${s.label} → ${attSp ? '+' + attSp : '0'} SP`
           : `Absent from ${s.label} → 0 SP`, when, s.label);

    if (s.type === 'standup' && came) {
      const totalQ = 5;
      const correctP = Math.min(1, Math.max(0.05, a.poll + between(-0.2, 0.2) + (a.ramp ? progress * 0.15 : 0) - (a.fade ? progress * 0.2 : 0)));
      const attempted = Math.max(1, Math.round(totalQ * Math.min(1, pAtt + 0.15) * (rnd() < 0.9 ? 1 : 0.6)));
      const correct = Math.min(attempted, Math.round(attempted * correctP));
      const responses = Array.from({ length: totalQ }, (_, q) => ({
        pollName: `${s.label} · Q${q + 1}`, question: `Question ${q + 1}`,
        response: q < attempted ? (q < correct ? 'Correct' : 'Incorrect') : '', attempted: q < attempted
      }));
      allPolls.push({
        email, studentId: stu._id, sessionLabel: s.label, totalQuestions: totalQ,
        attemptedQuestions: attempted, missedQuestions: totalQ - attempted, responses
      });
      const ppct = Math.round((correct / totalQ) * 100);
      const pollSp = tier(ppct);
      add('poll', pollSp, `Poll score ${correct}/${totalQ} (${ppct}%) in ${s.label} → ${pollSp ? '+' + pollSp : '0'} SP`, new Date(when.getTime() + 60000), s.label);
    }
  });

  // SPA, peer queries, one-off awards — spread over the student's time here
  const span2 = Math.max(1, (now - start) / DAY);
  const learn = Math.round(between(...a.learn) * Math.min(1, span2 / 90 + 0.2));
  const teach = Math.round(between(...a.teach) * Math.min(1, span2 / 90 + 0.2));
  const queries = Math.round(between(...a.query) * Math.min(1, span2 / 90 + 0.2));
  const at = (f) => new Date(start.getTime() + f * (now - start));
  if (learn) add('spa', Math.min(learn, 50) * 5, `${Math.min(learn, 50)} validated questions learned from peers (+5 each)`, at(0.7));
  if (teach) add('spa', Math.min(teach, 25) * 10, `${Math.min(teach, 25)} peers taught and validated (+10 each)`, at(0.75));
  if (queries) add('query', Math.min(queries * 5, 200), `Answered ${queries} peer queries (+5 each)`, at(0.85));
  if (kind === 'helper' || kind === 'star') add('manual', 25, 'Mentor award: helped organise the peer study circle', at(0.6));
  if (kind === 'fading' && rnd() < 0.6) add('manual', -10, 'Mentor adjustment: missed the agreed project check-in', at(0.8));

  let projectDone = false;
  if (rnd() < a.project && offset > 40) {
    projectDone = true;
    add('manual', 500, 'Project review completed by mentor: +500 SP', at(0.9));
  }

  txns.sort((x, y) => x.dateTime - y.dateTime);
  // re-derive balances in time order (rows were appended grouped, not chronological)
  balance = 0; peak = 0;
  for (const t of txns) {
    t.appliedDelta = Math.max(t.deltaValue, -balance);
    balance += t.appliedDelta; peak = Math.max(peak, balance);
    t.balanceAfter = balance;
  }

  allTxns.push(...txns);
  stu.totalSp = balance;
  stu.highestSpEver = peak;
  stu.level = levelFor(peak);
  stu.trophyLeague = leagueBand(balance);
  stu.legendBadgeUnlocked = peak >= 1500;
  await stu.save();
  students.push(stu);
  profiles.set(email, { kind, a, learn, teach, projectDone, offset, start });
}

await SPTransaction.insertMany(allTxns, { ordered: false });
await AttendanceRecord.insertMany(allAtt, { ordered: false });
await PollRecord.insertMany(allPolls, { ordered: false });
console.log(`students: ${students.length}  ledger rows: ${allTxns.length}  attendance: ${allAtt.length}  polls: ${allPolls.length}`);

// ── SPA / ViBe / project / journey plans / commitments ───────────────────────
const spa = [], vibe = [], prs = [], reviews = [], plans = [], commits = [];
for (const stu of students) {
  const p = profiles.get(stu.email);
  const { a } = p;
  spa.push({
    email: stu.email, activity: 'Activity 1: Linear Algebra',
    learnValidated: p.learn, teachValidated: p.teach, learnCredited: Math.min(p.learn, 50), teachCredited: Math.min(p.teach, 25),
    // one visible integrity case so the teacher can see what a penalty looks like
    ...(stu.name === 'Farhan Qureshi' ? { auditFail: true, auditPenaltyApplied: true, penaltyApplied: 20, penaltyAt: new Date(today.getTime() - 9 * DAY) } : {})
  });
  for (const [key, lo, hi] of [['onboarding', a.vibe[0], a.vibe[1]], ['ai', a.vibe[0] * 0.8, a.vibe[1] * 0.9], ['mern', a.vibe[0] * 0.5, a.vibe[1] * 0.7]]) {
    const pct = Math.max(0, Math.min(100, Math.round(between(lo, hi))));
    vibe.push({ email: stu.email, courseKey: key, completionPct: pct, finished: pct >= 100, exempt: false, source: 'live_api', _mirroredAt: now });
  }
  if (p.projectDone || (p.a.project > 0.3 && rnd() < 0.5)) {
    prs.push({ email: stu.email, branchOrPrLinks: `https://github.com/demo-cohort/${slug(stu.name)}-project/pull/${1 + Math.floor(rnd() * 3)}\nhttps://github.com/demo-cohort/${slug(stu.name)}-project/pull/${4 + Math.floor(rnd() * 3)}` });
    reviews.push({ email: stu.email, reviewStatus: p.projectDone ? 'completed' : pick(['pending', 'in_review', 'changes_requested']), reviewedAt: p.projectDone ? new Date(today.getTime() - 5 * DAY) : null, resubmissionCount: Math.floor(rnd() * 3) });
  }
  if (a.plan && stu.status === 'active') {
    plans.push({
      email: stu.email,
      standupBy: new Date(today.getTime() + Math.round(between(10, 45)) * DAY),
      vibeBy: new Date(today.getTime() + Math.round(between(7, 40)) * DAY),
      spaBy: new Date(today.getTime() + Math.round(between(14, 50)) * DAY),
      projectBy: new Date(today.getTime() + Math.round(between(14, 45)) * DAY)
    });
  }
}
await SpaProgress.insertMany(spa);
await ActVibeProgress.insertMany(vibe);
if (prs.length) await ActPullRequest.insertMany(prs);
if (reviews.length) await ActPrReview.insertMany(reviews);
if (plans.length) await JourneyPlan.insertMany(plans);

// commitments: a mix of won, lost and one still running
const committers = students.filter((s) => s.status === 'active' && ['star', 'steady', 'improving', 'average'].includes(profiles.get(s.email).kind)).slice(0, 14);
committers.forEach((s, i) => {
  const type = i % 2 ? 'vibe' : 'standup';
  const stake = type === 'vibe' ? pick([50, 100, 150]) : pick([20, 50]);
  const mult = pick([2, 3, 4]);
  const status = i === 0 ? 'active' : pick(['won', 'won', 'lost']);
  const deadline = new Date(today.getTime() + (status === 'active' ? 3 : -(2 + i * 3)) * DAY);
  commits.push({
    email: s.email, type, stake, multiplier: mult, potentialWin: stake * mult, potentialLoss: stake * mult * 0.5,
    reserved: status === 'active' && type === 'vibe' ? stake * mult * 0.5 : 0, debited: type === 'vibe', deadline, status,
    resultDelta: status === 'won' ? stake * mult : status === 'lost' ? -stake * mult * 0.5 : 0,
    settledAt: status === 'active' ? null : deadline,
    label: type === 'vibe' ? 'Finish +20% of the AI course' : 'Attend every standup this week at 91%+',
    ...(type === 'vibe' ? { course: 'ai', goalPct: 20, baselinePct: 30 } : { tier: '91-100', tierFloor: 91, sessionsTarget: 6, weekStart: new Date(deadline.getTime() - 6 * DAY), weekEnd: deadline })
  });
});
await Commitment.insertMany(commits);

// ── announcements + read receipts ────────────────────────────────────────────
const active = students.filter((s) => s.status === 'active');
const ann = await Announcement.insertMany([
  { title: 'Welcome to Spurti — how SP works', body: 'Spurti Points (SP) reward taking part: standups, polls, peer teaching, answering queries and finishing your project review. SP is a participation signal, not marks. Open the FAQ tab for the full rules.', postedAt: new Date(today.getTime() - 40 * DAY) },
  { title: 'Project reviews close on Friday', body: 'Submit your project pull request before Friday 6 pm. Mentors review in submission order and completed reviews earn +500 SP.', postedAt: new Date(today.getTime() - 6 * DAY) },
  { title: 'V-Talk this Saturday: careers in AI', body: 'Guest speaker session, 90 minutes, attendance counts toward SP. Bring questions for the live poll.', postedAt: new Date(today.getTime() - 1 * DAY) },
  { title: '(Retired) Mid-term survey reminder', body: 'This notice has been deactivated and is kept only for the read-rate record.', postedAt: new Date(today.getTime() - 25 * DAY), active: false }
]);
const acks = [];
ann.forEach((n, i) => {
  const rate = [0.95, 0.7, 0.35, 0.8][i];
  for (const s of active) if (rnd() < rate) acks.push({ announcementId: n._id, email: s.email, ackedAt: new Date(n.postedAt.getTime() + between(0.1, 3) * DAY) });
});
await AnnouncementAck.insertMany(acks);

// ── dashboard activity for the Analytics / Live tabs (last 30 days) ──────────
const events = [];
for (const s of active) {
  const kind = profiles.get(s.email).kind;
  const days = { star: 22, pollwiz: 20, steady: 18, helper: 18, improving: 14, average: 9, fading: 4, atrisk: 2 }[kind];
  for (let k = 0; k < days; k++) {
    const t = new Date(now.getTime() - Math.floor(rnd() * 30) * DAY - between(0, 14) * 3600000);
    events.push({ email: s.email, name: s.name, event: 'page_view', page: pick(['search', 'record', 'record', 'intro']), recordViewed: s.name, timestamp: t });
  }
}
await SessionEvent.insertMany(events);

// ── derived data: leaderboards, podium cards, trajectory ─────────────────────
process.env.ACHIEVEMENTS_ENABLED = '1';
const lb = await computeAndStoreLeaderboards();
const tr = await computeAndStoreTrajectories();
console.log('leaderboards:', JSON.stringify(lb).slice(0, 200));
console.log('trajectory weeks:', tr?.weeks ?? 'ok');

const top = await Student.find({ status: 'active' }).sort({ totalSp: -1 }).limit(5).lean();
console.log('\nTop 5 right now:');
top.forEach((s, i) => console.log(`  ${i + 1}. ${s.name.padEnd(18)} ${String(s.totalSp).padStart(5)} SP  (${s.trophyLeague}, level ${levelFor(s.highestSpEver)})`));
console.log('\nDone. Excused students:', [...EXCUSED].join(', '));
await mongoose.disconnect();
