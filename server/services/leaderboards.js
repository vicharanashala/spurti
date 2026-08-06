import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import { levelFor } from './levels.js';

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
function weekLabel(weekStartUtc) {
  const s = new Date(weekStartUtc.getTime() + IST_MS);
  const e = new Date(s.getTime() + 6 * 86400000);
  return s.getUTCMonth() === e.getUTCMonth()
    ? `${MON[s.getUTCMonth()]} ${s.getUTCDate()}–${e.getUTCDate()}`
    : `${MON[s.getUTCMonth()]} ${s.getUTCDate()} – ${MON[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

// Sum appliedDelta per (student, category) over a match window.
async function sumByStudentCat(match) {
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
  const weekStart = weekStartIST(now);
  const label = weekLabel(weekStart);

  const students = await Student.find(
    { status: { $ne: 'excused' } },
    { name: 1, totalSp: 1, highestSpEver: 1, leaderboardGroup: 1 }
  ).lean();

  const weekMap = await sumByStudentCat({ dateTime: { $gte: weekStart } });
  const allMap = await sumByStudentCat({});

  const levelOf = (s) => levelFor(Math.max(Number(s.highestSpEver) || 0, Number(s.totalSp) || 0));
  const build = (subset, valueOf) => subset
    .map((s) => ({ studentId: String(s._id), name: s.name || '', level: levelOf(s), sp: Math.round(valueOf(String(s._id))) }))
    .sort((a, b) => b.sp - a.sp || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const wTotal = (sid) => (weekMap.get(sid)?.total) || 0;
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
  await LeaderboardSnapshot.deleteMany({ boardKey: { $nin: [...keys] } });

  return { boards: boards.length, groups: groups.length, weekStart, weekLabel: label, students: students.length };
}
