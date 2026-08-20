import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import Achievement, { awardAchievements } from '../models/Achievement.js';
import BoardReign from '../models/BoardReign.js';
import { levelFor } from './levels.js';

const CAT_LABEL = { total: 'Overall', attendance: 'Best Attendance', poll: 'Poll Champions', spa: 'Top SPA', query: 'Top Query Answerers' };

// Achievement titles, one per board. The SAME title is used for all three podium
// places — the medal in the card's gold disc is what says which place it was.
const ACH_TITLE = {
  total: 'Cohort Champion',
  attendance: 'Attendance Ace',
  poll: 'Poll Champion',
  spa: 'Peer-Learning Champion',
  query: "Cohort's Go-To"
};
const PLACE_ICON = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Category boards beyond the "total" board. Combined SPA (learn + teach) is one
// category. `total` = sum of all categories in the window.
const CATS = ['attendance', 'poll', 'spa', 'query'];
const IST_MS = 5.5 * 3600 * 1000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Most recent Monday 00:00 IST, returned as the real UTC instant.
function weekStartIST(now) {
  const ist = new Date(now.getTime() + IST_MS);
  const daysSinceMon = (ist.getUTCDay() + 6) % 7; // Mon->0 ... Sun->6
  const monMidnightIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysSinceMon);
  return new Date(monMidnightIst - IST_MS);
}
// The week's Monday as an IST calendar date. A week starts at 00:00 IST, which
// is 18:30 UTC the evening BEFORE, so slicing the UTC instant would name every
// week after the preceding Sunday — "2026-08-02" for the week of Aug 3–9.
function weekKey(weekStartUtc) {
  return new Date(weekStartUtc.getTime() + IST_MS).toISOString().slice(0, 10);
}
function weekLabel(weekStartUtc) {
  const s = new Date(weekStartUtc.getTime() + IST_MS);
  const e = new Date(s.getTime() + 6 * 86400000);
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${MON[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}`
    : `${MON[s.getUTCMonth()]} ${s.getUTCDate()} – ${MON[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

// A placing shared by more than this many people isn't a placing.
const TIE_MAX = 3;

// Boards that mint no cards, weekly or reign, while their scoring is unsettled.
//
// `spa` is out for now: the scheme caps at 50 questions x5 + 30 peers x8 = 490
// SP and 110 students already sit on exactly that, so "top of Peer Learning" is
// a permanent mass tie and the weekly placings are decided by who reached the
// ceiling first rather than by who did most. TIE_MAX already stops it minting a
// reign; this stops the weekly cards too, until the scoring is reworked.
// Removing 'spa' from this list is all it takes to turn them back on.
export const AWARD_EXCLUDED_BOARDS = ['spa'];

// The weekly TOTAL board measures what a student did during that week, so the
// +100 `initial` joining grant is excluded: it is awarded for starting, not for
// anything done, and a student who joined mid-week would otherwise top the board
// on it alone — beating people who actually earned points. Found when a backfill
// dry run put a joining grant first with 100 SP and real poll work second on 40.
//
// All-time is deliberately unaffected: there the grant is a legitimate part of a
// lifetime total, and that board reads from `students.totalSp` anyway. The
// per-category weekly boards are unaffected too, since `initial` is not one of
// CATS. `manual` is still counted — discretionary SP is a real award for real
// work, unlike a joining bonus — but it is the next candidate if that changes.
export const WEEKLY_EXCLUDED_CATEGORIES = ['initial'];

export function weeklyTotal(row) {
  if (!row) return 0;
  let t = row.total;
  for (const c of WEEKLY_EXCLUDED_CATEGORIES) t -= (row.cat[c] || 0);
  return t;
}

const levelOfStudent = (s) => levelFor(Math.max(Number(s.highestSpEver) || 0, Number(s.totalSp) || 0));

// Sorted rows for a board. `tieAware` selects standard competition ("1224")
// ranking — equal SP shares a rank and the next distinct SP jumps past the tie
// (1,2,2,4). Display boards only use it once the feature is live; anything that
// AWARDS must always use it, or a tie silently hands one of the tied students
// a lower placing than the other.
export function rankRows(subset, valueOf, tieAware) {
  const sorted = subset
    .map((s) => ({ studentId: String(s._id), name: s.name || '', level: levelOfStudent(s), sp: Math.round(valueOf(String(s._id))) }))
    .sort((a, b) => b.sp - a.sp || a.name.localeCompare(b.name));
  if (!tieAware) return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
  let rank = 0, prevSp = null;
  return sorted.map((r, i) => {
    if (r.sp !== prevSp) { rank = i + 1; prevSp = r.sp; }
    return { ...r, rank };
  });
}

// The podium cards a single week's board earns. Shared by the live build and
// the backfill so the two cannot drift apart on what counts as a placing.
// `settled` closes placings that already have a holder.
export function weeklyPodiumSpecs({ rows, category, weekKey: wk, period, earnedAt, settled = new Set() }) {
  const out = [];
  for (const place of [1, 2, 3]) {
    const tied = rows.filter((r) => r.rank === place);
    // A placing needs a real score: the top of a table of zeroes is not a win.
    if (!tied.length || tied.length > TIE_MAX || tied[0].sp <= 0) continue;
    const achId = `rank:${category}:week:${wk}:${place}`;
    if (settled.has(achId)) continue;
    for (const r of tied) {
      out.push({
        filter: { studentId: r.studentId, achId },
        doc: {
          studentId: r.studentId, achId, kind: 'rank', board: category, place,
          icon: PLACE_ICON[place], title: ACH_TITLE[category],
          period, periodKey: wk, detail: `${r.sp} SP`, earnedAt
        }
      });
    }
  }
  return out;
}

export { weekStartIST, weekKey, weekLabel, CATS };

// Sum appliedDelta per (student, category) over a match window.
export async function sumByStudentCat(match) {
  const rows = await SPTransaction.aggregate([
    { $match: match },
    { $group: { _id: { sid: '$studentId', cat: '$category' }, sp: { $sum: '$appliedDelta' } } }
  ]);
  const m = new Map(); // sid -> { total, cat:{} }
  for (const r of rows) {
    const sid = r._id.sid ? String(r._id.sid) : null;
    if (!sid) continue;
    let o = m.get(sid); if (!o) { o = { total: 0, cat: {} }; m.set(sid, o); }
    o.cat[r._id.cat] = (o.cat[r._id.cat] || 0) + r.sp;
    o.total += r.sp;
  }
  return m;
}

export async function computeAndStoreLeaderboards() {
  const now = new Date();
  // Both changes this feature makes to the build — tie-aware ranks and minted
  // podium cards — become visible to the cohort the moment the sp-refresh cron
  // runs, so they wait on the same go-live switch as the tab (ACHIEVEMENTS_ENABLED).
  // With it off the build behaves exactly as it did before achievements existed:
  // unique 1,2,3… ranks and no cards. Read here, not at import, so the flag is
  // whatever the .env said when the process started, however it was started.
  const awardsOn = process.env.ACHIEVEMENTS_ENABLED === '1';
  // All-time boards are NOT awarded as plain podiums. They never settle while
  // the programme runs, so an unqualified "1st place, All-time" would be handed
  // to every successive leader in turn. They are handled as dated reigns
  // instead — see trackReigns below.
  const weekStart = weekStartIST(now);
  const label = weekLabel(weekStart);
  // The week the cards are for. The boards on screen still show the week in
  // progress; only the awarding waits for it to finish.
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const prevLabel = weekLabel(prevWeekStart);

  const students = await Student.find(
    { status: { $ne: 'excused' } },
    { name: 1, totalSp: 1, highestSpEver: 1, leaderboardGroup: 1 }
  ).lean();

  const weekMap = await sumByStudentCat({ dateTime: { $gte: weekStart } });
  const allMap = await sumByStudentCat({});

  // Tie-aware ranking only once the feature is live; see rankRows.
  const build = (subset, valueOf) => rankRows(subset, valueOf, awardsOn);

  const wTotal = (sid) => weeklyTotal(weekMap.get(sid));
  const wCat = (cat) => (sid) => (weekMap.get(sid)?.cat[cat]) || 0;
  const aCat = (cat) => (sid) => (allMap.get(sid)?.cat[cat]) || 0;
  const byId = new Map(students.map((s) => [String(s._id), s]));
  const aTotal = (sid) => Number(byId.get(sid)?.totalSp) || 0;

  const boards = [];
  const push = (window, category, scope, group, rows) => boards.push({
    boardKey: scope === 'group' ? `${window}:${category}:group:${group}` : `${window}:${category}:${scope}`,
    window, category, scope, group: group || null, weekStart, weekLabel: label, builtAt: now, rows
  });

  // Total boards (global)
  push('week', 'total', 'all', null, build(students, wTotal));
  push('all', 'total', 'all', null, build(students, aTotal));
  // Category boards (global), weekly + all-time
  for (const cat of CATS) {
    push('week', cat, 'all', null, build(students, wCat(cat)));
    push('all', cat, 'all', null, build(students, aCat(cat)));
  }
  // Total boards per onboarding group (weekly + all-time)
  const groups = [...new Set(students.map((s) => s.leaderboardGroup).filter(Boolean))];
  for (const g of groups) {
    const subset = students.filter((s) => s.leaderboardGroup === g);
    push('week', 'total', 'group', g, build(subset, wTotal));
    push('all', 'total', 'group', g, build(subset, aTotal));
  }

  // Persist: upsert each board; drop any stale group boards no longer present.
  const keys = new Set(boards.map((b) => b.boardKey));
  await Promise.all(boards.map((b) => LeaderboardSnapshot.updateOne({ boardKey: b.boardKey }, { $set: b }, { upsert: true })));
  if (keys.size) await LeaderboardSnapshot.deleteMany({ boardKey: { $nin: [...keys] } });

  // Award permanent podium achievements — 1st, 2nd and 3rd on each GLOBAL board.
  //
  // WEEKLY CARDS COME FROM THE LAST COMPLETED WEEK, NEVER THE ONE IN PROGRESS.
  // Awarding live looked idempotent but was not: the upsert is keyed on
  // (studentId, achId) and achId carries no student, so a different leader at
  // the next six-hourly run did not replace the previous one — they were handed
  // their own row. Monday's leader, Wednesday's and Sunday's would each end up
  // holding a permanent, independently verifiable "1st place, week of X" card
  // for the same board. Four runs a day meant up to 28 holders of one placing.
  // A finished week's standings cannot move, so awarding from them gives one
  // set of winners and makes re-running genuinely a no-op.
  //
  // Not awarded here (deliberate, v1 scope):
  //  · onboarding-group boards — they overlap the cohort-wide win and would more
  //    than double the weekly card volume for the least meaningful placing.
  //  · placings below 3rd — "7th on the Polls board this week" can be 7th out of
  //    a field of thirty, which isn't the same achievement as a podium.
  let ops = [];

  if (awardsOn) {
    const prevWeekMap = await sumByStudentCat({ dateTime: { $gte: prevWeekStart, $lt: weekStart } });
    const pTotal = (sid) => weeklyTotal(prevWeekMap.get(sid));
    const pCat = (cat) => (sid) => (prevWeekMap.get(sid)?.cat[cat]) || 0;
    const wk = weekKey(prevWeekStart);

    // Belt and braces against a placing being awarded twice with different
    // winners — a late backdated transaction could shift even a settled week's
    // standings. Once a placing has any holder it is closed, so ties (awarded
    // together in one batch) still work while a later challenger cannot claim
    // the same title.
    const already = await Achievement.find(
      { achId: { $regex: `^rank:[^:]+:week:${wk}:` } }, { achId: 1 }
    ).lean();
    const settled = new Set(already.map((a) => a.achId));

    const period = `Week of ${prevLabel}`;
    const awardable = [['total', pTotal], ...CATS.map((c) => [c, pCat(c)])]
      .filter(([category]) => !AWARD_EXCLUDED_BOARDS.includes(category));
    for (const [category, valueOf] of awardable) {
      ops.push(...weeklyPodiumSpecs({
        rows: rankRows(students, valueOf, true),
        category, weekKey: wk, period, earnedAt: now, settled
      }));
    }
  }

  if (ops.length) await awardAchievements(ops);

  const reigns = awardsOn ? await trackReigns(boards, now) : { changes: 0, minted: 0 };

  return {
    boards: boards.length, groups: groups.length, achievementOps: ops.length,
    weekStart, weekLabel: label, awardedWeek: awardsOn ? prevLabel : null,
    reigns, students: students.length
  };
}

const DAY = 86400000;
// How long the top spot must be held before it is worth a card. The build runs
// four times a day and early in a cohort the lead can change between runs, so
// without a floor a six-hour blip would mint a permanent credential.
const MIN_REIGN_MS = 7 * DAY;

function istDate(d) {
  const x = new Date(d.getTime() + IST_MS);
  return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
}
function istYear(d) { return new Date(d.getTime() + IST_MS).getUTCFullYear(); }
function reignPeriod(from, to) {
  return to
    ? `${istDate(from)} – ${istDate(to)} ${istYear(to)}`
    : `Since ${istDate(from)} ${istYear(from)}`;
}

// Keeps `boardreign` in step with who currently tops each all-time board, and
// mints a card once a reign has lasted long enough to mean something.
//
// Only 1st place has a reign: "reigning champion" is a real idea, while "was
// second for a while" is not, and the places below the top shuffle constantly.
async function trackReigns(boards, now) {
  let changes = 0;
  const ops = [];
  const closedAwarded = [];

  const reignable = boards.filter((x) => x.window === 'all' && x.scope === 'all'
    && !AWARD_EXCLUDED_BOARDS.includes(x.category));
  for (const b of reignable) {
    const tiedTop = b.rows.filter((r) => r.rank === 1 && r.sp > 0);
    // The same TIE_MAX rule the podium uses: a top shared by more than three
    // people is not a placing, and it is certainly not a reign. This is not
    // hypothetical here — the SPA scheme caps at 50 questions x5 + 30 peers x8 =
    // 490 SP, and 110 students sit on exactly that, so its all-time top is a
    // permanent 110-way tie. Without this the first build opened 110 reigns on
    // one board. When the top is that crowded nobody reigns: any open reign
    // closes and none is opened.
    const leaders = tiedTop.length > TIE_MAX ? [] : tiedTop;
    const open = await BoardReign.findOne({ board: b.category, to: null });

    // A tie keeps the sitting holder if they are still among the leaders —
    // being caught up with is not the same as being overtaken.
    const stillLeading = open && leaders.some((r) => r.studentId === open.studentId);

    if (open && !stillLeading) {
      open.to = now;
      await open.save();
      if (open.awarded) closedAwarded.push(open);
      changes += 1;
    }

    if (stillLeading) {
      const me = leaders.find((r) => r.studentId === open.studentId);
      open.sp = me.sp;
      open.peakSp = Math.max(open.peakSp || 0, me.sp);
      await open.save();
    } else if (leaders.length) {
      const sole = leaders[0];
      await BoardReign.create({
        board: b.category, studentId: sole.studentId, name: sole.name,
        from: now, to: null, sp: sole.sp, peakSp: sole.sp
      });
      changes += 1;
    }
  }

  // Mint for any reign — open or closed — that has now lasted long enough.
  const ripe = await BoardReign.find({ awarded: false });
  for (const rg of ripe) {
    const held = (rg.to ? rg.to.getTime() : now.getTime()) - rg.from.getTime();
    if (held < MIN_REIGN_MS) continue;
    const achId = `rank:${rg.board}:reign:${weekKey(rg.from)}:1`;
    ops.push({
      filter: { studentId: rg.studentId, achId },
      doc: {
        studentId: rg.studentId, achId, kind: 'rank', board: rg.board, place: 1,
        icon: PLACE_ICON[1], title: ACH_TITLE[rg.board],
        period: reignPeriod(rg.from, rg.to), periodKey: weekKey(rg.from),
        detail: `${rg.peakSp || rg.sp} SP`, earnedAt: rg.from
      }
    });
    rg.awarded = true;
    rg.achId = achId;
    await rg.save();
  }
  if (ops.length) await awardAchievements(ops);

  // A reign that ends after its card was minted: the card said "Since 12 Aug"
  // and must now read "12 Aug – 3 Sep". The already-posted PNG keeps the older
  // wording, which was true when it was posted; the verify page is the record
  // that stays current.
  for (const rg of closedAwarded) {
    await Achievement.updateOne(
      { studentId: rg.studentId, achId: rg.achId },
      { $set: { period: reignPeriod(rg.from, rg.to), detail: `${rg.peakSp || rg.sp} SP` } }
    );
  }

  return { changes, minted: ops.length, closed: closedAwarded.length };
}
