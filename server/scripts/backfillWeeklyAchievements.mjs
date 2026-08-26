// Mints podium cards for weeks that finished BEFORE achievements went live.
//
// The live build only ever awards the last completed week, so every earlier week
// of the internship has winners that were never recognised. This walks those
// weeks and awards them retrospectively, using the same ranking and podium rules
// as the live build (`rankRows` / `weeklyPodiumSpecs` in services/leaderboards.js)
// so the two cannot disagree about who placed.
//
//   node server/scripts/backfillWeeklyAchievements.mjs                  # report only
//   node server/scripts/backfillWeeklyAchievements.mjs --from 2026-06-01
//   node server/scripts/backfillWeeklyAchievements.mjs --apply
//
//   --from YYYY-MM-DD   first week to consider (default: the programme start —
//                       NOT the earliest transaction, which can be junk data).
//                       Snapped back to that week's Monday.
//   --to   YYYY-MM-DD   last week to consider (default: the last COMPLETED week —
//                       the week in progress is never awarded)
//   --board total|poll|…  restrict to one board
//   --min-participants N  a week needs this many people earning to count as a
//                       real programme week (default 25). Date fields are not
//                       trustworthy here; participation is.
//   --programme-start YYYY-MM-DD  hard floor, default 2026-05-15 (this cohort's
//                       actual start). Nothing before it is ever eligible, and
//                       --from cannot reach back past it.
//   --apply             actually write. Without it, nothing is written.
//
// Run from the repo root so .env is picked up. Safe to re-run: a placing that
// already has a holder is skipped, so this can never hand the same week's title
// to a second student.
//
// `earnedAt` is set to the END of the week in question, not now, so the cards
// sit in the student's timeline where they actually belong.

import 'dotenv/config';
import mongoose from 'mongoose';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import Achievement, { awardAchievements } from '../models/Achievement.js';
import {
  rankRows, weeklyPodiumSpecs, sumByStudentCat, weeklyTotal,
  weekStartIST, weekKey, weekLabel, CATS, WEEKLY_EXCLUDED_CATEGORIES, AWARD_EXCLUDED_BOARDS
} from '../services/leaderboards.js';

const WEEK = 7 * 86400000;
const IST_MS = 5.5 * 3600 * 1000;

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const APPLY = process.argv.includes('--apply');
const ONLY_BOARD = arg('--board');
// An explicit --board can still target an excluded one deliberately; the
// default list honours the exclusion.
const BOARDS = ONLY_BOARD ? [ONLY_BOARD]
  : ['total', ...CATS].filter((b) => !AWARD_EXCLUDED_BOARDS.includes(b));

const URI = process.env.MONGO_URI;
if (!URI) {
  console.error('MONGO_URI is not set. Run this from the repo root so .env is picked up.');
  process.exit(1);
}
await mongoose.connect(URI);

// The week in progress is never awarded — its standings can still move.
const lastCompleted = new Date(weekStartIST(new Date()).getTime() - WEEK);

const firstTx = await SPTransaction.find({}, { dateTime: 1 }).sort({ dateTime: 1 }).limit(1).lean();
if (!firstTx.length) { console.error('no SP transactions — nothing to backfill'); process.exit(1); }

// Where the programme really starts, decided by PARTICIPATION rather than by any
// date field. Both obvious date sources are corruptible and in fact corrupt: the
// ledger has a transaction dated 2006, and one student record carries
// internshipStartDate 2006-08-01 (a 2026 typo), so taking the earliest of either
// walked twenty years of empty weeks and offered a card for a phantom
// "Week of Jul 31 – Aug 6, 2006". A single stray row cannot fake a week that
// hundreds of people took part in, so the count is the trustworthy signal.
//
// Real weeks here run 870–1200 participants; the junk ones have 1, and the
// pre-launch trickle has 7–14. Anything under the threshold is not a week the
// programme ran, and no permanent public credential should be issued for it.
const MIN_PARTICIPANTS = Number(arg('--min-participants', 25));

const weekCounts = new Map(
  (await SPTransaction.aggregate([
    { $group: {
      _id: { $dateTrunc: { date: '$dateTime', unit: 'week', startOfWeek: 'monday', timezone: '+05:30' } },
      students: { $addToSet: '$studentId' }
    } },
    { $project: { n: { $size: '$students' } } },
    { $sort: { _id: 1 } }
  ])).map((r) => [r._id.getTime(), r.n])
);
const realWeeks = [...weekCounts.entries()].filter(([, n]) => n >= MIN_PARTICIPANTS).map(([t]) => t);
if (!realWeeks.length) {
  console.error(`no week has ${MIN_PARTICIPANTS}+ participants — lower --min-participants`);
  process.exit(1);
}
// The known programme start. This cohort began 15 May 2026 — a fact, not
// something to infer, so nothing before it is ever eligible however the data
// reads. The participation check above stays as a second line of defence for
// weeks that fall inside the programme but never really ran; pass
// --programme-start for a different cohort.
const PROGRAMME_START = new Date(`${arg('--programme-start', '2026-05-15')}T00:00:00+05:30`);
const hardFloor = weekStartIST(PROGRAMME_START);

const busiest = new Date(Math.min(...realWeeks));
const programmeStart = new Date(Math.max(hardFloor.getTime(), busiest.getTime()));

const skipped = [...weekCounts.entries()].filter(([t, n]) => t < programmeStart.getTime());
if (skipped.length) {
  const reason = (t, n) => `${new Date(t).toISOString().slice(0, 10)} (${n}` +
    (t < hardFloor.getTime() ? ', pre-programme' : `, under ${MIN_PARTICIPANTS}`) + ')';
  // IST calendar date, not the UTC instant: 15 May 00:00 IST is 14 May 18:30 UTC,
  // so slicing the raw ISO string would report the start as the 14th.
  const istDay = (d) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
  console.log(`note: ${skipped.length} week(s) rejected before the programme start ` +
              `(${istDay(PROGRAMME_START)}) — ${skipped.map(([t, n]) => reason(t, n)).join(', ')}. ` +
              `Stray or mis-dated ledger rows; worth fixing separately.`);
}

const fromArg = arg('--from');
const toArg = arg('--to');
// An explicit --from can narrow the window but never reach back past the
// programme start; a card must never claim a week the internship did not run.
let from = weekStartIST(
  fromArg ? new Date(Math.max(new Date(`${fromArg}T00:00:00+05:30`).getTime(), programmeStart.getTime()))
          : programmeStart
);
let to = toArg ? weekStartIST(new Date(`${toArg}T00:00:00+05:30`)) : lastCompleted;
if (to > lastCompleted) {
  console.log(`--to is in the current week; clamped to the last completed week (${weekKey(lastCompleted)})`);
  to = lastCompleted;
}
if (from > to) { console.error('nothing to do: --from is after the last completed week'); process.exit(1); }

const students = await Student.find(
  { status: { $ne: 'excused' } },
  { name: 1, totalSp: 1, highestSpEver: 1 }
).lean();
const nameOf = new Map(students.map((s) => [String(s._id), s.name || String(s._id)]));

// Every placing already held, so a re-run — or a week the live build has since
// awarded — is skipped rather than duplicated.
const held = new Set(
  (await Achievement.find({ achId: { $regex: '^rank:[^:]+:week:' } }, { achId: 1 }).lean())
    .map((a) => a.achId)
);

console.log(`backfill ${weekKey(from)} … ${weekKey(to)}   boards: ${BOARDS.join(', ')}`);
console.log(`${students.length} non-excused students, ${held.size} weekly placings already held`);
console.log(`weekly Overall SP excludes: ${WEEKLY_EXCLUDED_CATEGORIES.join(', ')}`);
if (AWARD_EXCLUDED_BOARDS.length) console.log(`boards minting no cards: ${AWARD_EXCLUDED_BOARDS.join(', ')}`);
console.log(APPLY ? '\nMODE: APPLY — cards will be written\n' : '\nMODE: dry run — nothing will be written\n');

const all = [];
const perStudent = new Map();
let weeks = 0, emptyWeeks = 0;

for (let ws = new Date(from); ws <= to; ws = new Date(ws.getTime() + WEEK)) {
  const we = new Date(ws.getTime() + WEEK);
  const map = await sumByStudentCat({ dateTime: { $gte: ws, $lt: we } });
  const wk = weekKey(ws);
  const period = `Week of ${weekLabel(ws)}`;
  // End of the week in IST, which is when these were really earned.
  const earnedAt = new Date(we.getTime() - 1000);

  const specs = [];
  for (const category of BOARDS) {
    const valueOf = category === 'total'
      ? (sid) => weeklyTotal(map.get(sid))
      : (sid) => (map.get(sid)?.cat[category]) || 0;
    specs.push(...weeklyPodiumSpecs({
      rows: rankRows(students, valueOf, true),
      category, weekKey: wk, period, earnedAt, settled: held
    }));
  }

  weeks += 1;
  if (!specs.length) { emptyWeeks += 1; continue; }
  // A week inside the range can still be too thin to be a real programme week.
  const participants = weekCounts.get(ws.getTime()) || 0;
  if (participants < MIN_PARTICIPANTS) {
    console.log(`${period}  (${wk})  → skipped, only ${participants} participant(s)`);
    emptyWeeks += 1;
    continue;
  }

  console.log(`${period}  (${wk})  → ${specs.length} card${specs.length === 1 ? '' : 's'}`);
  for (const s of specs) {
    const [, cat, , , place] = s.doc.achId.split(':');
    console.log(`    ${place}. ${cat.padEnd(11)} ${nameOf.get(s.doc.studentId)}  ${s.doc.detail}`);
    perStudent.set(s.doc.studentId, (perStudent.get(s.doc.studentId) || 0) + 1);
    held.add(s.doc.achId);          // so a later week in this same run can't re-add it
  }
  all.push(...specs);
}

console.log(`\n${weeks} week(s) examined, ${emptyWeeks} with no qualifying placing`);
console.log(`${all.length} card(s) to mint across ${perStudent.size} student(s)`);

const top = [...perStudent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
if (top.length) {
  console.log('\nmost cards landing at once:');
  for (const [sid, n] of top) console.log(`    ${String(n).padStart(3)}  ${nameOf.get(sid)}`);
}

if (!all.length) {
  console.log('\nnothing to do.');
} else if (!APPLY) {
  console.log('\nre-run with --apply to write these.');
} else {
  await awardAchievements(all);
  console.log(`\nwrote ${all.length} card(s).`);
  const now = await Achievement.countDocuments({ achId: { $regex: '^rank:[^:]+:week:' } });
  console.log(`weekly rank cards in the collection: ${now}`);
}

await mongoose.disconnect();
