import Achievement, { awardAchievements } from '../models/Achievement.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { levelFor } from './levels.js';

// Milestones are earned off a student's own always-increasing record, so unlike
// podium places nothing awards them on a schedule — they're settled on read and
// persisted, which is what gives each one a verifyId the shared card can point at.
const LEVEL_MILESTONES = [25, 20, 15, 10, 5];
const ATTENDANCE_GOAL_MIN = 3600;
const PLACE_ICON = { 1: '🥇', 2: '🥈', 3: '🥉' };

export const BOARD_META = {
  total: { label: 'Overall SP', icon: '🏆' },
  // Not a calendar: Apple prints a fixed date on 📅 (17 July, after the day iCal
  // was announced) and every other platform prints its own, so the tile carried
  // a date that meant nothing. These icons only face the Achievements tab —
  // the shared card uses the persisted per-place medal from leaderboards.js.
  attendance: { label: 'Attendance', icon: '⏳' },
  poll: { label: 'Polls', icon: '🎯' },
  spa: { label: 'Peer Learning', icon: '🤝' },
  query: { label: 'Queries', icon: '💬' }
};

async function attendedMinutes(email) {
  const rows = await AttendanceRecord.aggregate([
    { $match: { email } },
    { $group: { _id: null, m: { $sum: '$attendedMinutes' } } }
  ]);
  return rows[0]?.m || 0;
}

// The milestones a student has reached, plus the nearest one they haven't —
// the locked entry is what turns the tab from a trophy shelf into a goal list.
function milestoneSpecs(student, mins) {
  const hi = Math.max(Number(student.highestSpEver) || 0, Number(student.totalSp) || 0);
  const level = levelFor(hi);
  const specs = [];

  specs.push({
    achId: 'ms:legend', icon: '🎖️', title: 'Legend', period: 'All-time',
    earned: student.legendBadgeUnlocked || hi >= 1500,
    detail: 'Crossed 1,500 SP',
    remaining: `${Math.max(0, 1500 - hi)} SP to go`
  });

  const reached = LEVEL_MILESTONES.find((m) => level >= m);
  const next = [...LEVEL_MILESTONES].reverse().find((m) => level < m);
  if (reached) {
    specs.push({
      achId: `ms:level:${reached}`, icon: '⭐', title: `Reached Level ${reached}`,
      period: 'All-time', earned: true, detail: `${reached * 100}+ Spurti Points`
    });
  }
  if (next && (!reached || next !== reached)) {
    specs.push({
      achId: `ms:level:${next}`, icon: '⭐', title: `Reach Level ${next}`, period: 'All-time',
      earned: false, detail: `${next * 100} Spurti Points`, remaining: `${next * 100 - hi} SP to go`
    });
  }

  specs.push({
    achId: 'ms:club3600', icon: '⏱️', title: '3,600-Minute Club', period: 'All-time',
    earned: mins >= ATTENDANCE_GOAL_MIN,
    detail: 'Standup attendance goal completed',
    remaining: `${Math.round(mins).toLocaleString('en-IN')} of ${ATTENDANCE_GOAL_MIN.toLocaleString('en-IN')} minutes`
  });

  return specs;
}

// Persist any newly-earned milestone (idempotent), then return the student's
// achievements grouped one entry per board — the tab shows a single tile per
// board and opens it to reveal every week they took it.
export async function buildAchievementState(student) {
  const sid = String(student._id);
  const mins = await attendedMinutes(student.email);
  const specs = milestoneSpecs(student, mins);

  const toPersist = specs.filter((s) => s.earned);
  if (toPersist.length) {
    await awardAchievements(toPersist.map((s) => ({
      filter: { studentId: sid, achId: s.achId },
      doc: {
        studentId: sid, achId: s.achId, kind: 'milestone', board: '', place: 0,
        icon: s.icon, title: s.title, period: s.period, periodKey: 'all',
        detail: s.detail, earnedAt: new Date()
      }
    })));
  }

  const rows = await Achievement.find({ studentId: sid }).sort({ earnedAt: -1 }).lean();
  const card = (a) => ({
    achId: a.achId, kind: a.kind, board: a.board, place: a.place, icon: a.icon,
    title: a.title, period: a.period, detail: a.detail, verifyId: a.verifyId, earnedAt: a.earnedAt
  });

  // One group per board (rank) or per milestone. `best` drives the tile face;
  // `items` is everything inside it, newest first.
  const groups = new Map();
  for (const a of rows) {
    const key = a.kind === 'rank' ? `board:${a.board}` : a.achId;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        kind: a.kind,
        label: a.kind === 'rank' ? (BOARD_META[a.board]?.label || a.board) : a.title,
        icon: a.kind === 'rank' ? (BOARD_META[a.board]?.icon || '🏆') : a.icon,
        title: a.title,
        bestPlace: a.kind === 'rank' ? a.place : 0,
        items: []
      };
      groups.set(key, g);
    }
    if (a.kind === 'rank' && a.place < g.bestPlace) {
      g.bestPlace = a.place;
      if (PLACE_ICON[a.place]) g.icon = PLACE_ICON[a.place];
    }
    g.items.push(card(a));
  }

  const locked = specs.filter((s) => !s.earned).map((s) => ({
    key: s.achId, kind: 'locked', label: s.title, icon: s.icon,
    title: s.title, detail: s.detail, remaining: s.remaining
  }));

  const all = [...groups.values()];
  const earnedCount = rows.length;
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  return {
    groups: all,
    locked,
    counts: {
      earned: earnedCount,
      thisWeek: rows.filter((a) => new Date(a.earnedAt) >= weekAgo).length,
      boards: all.filter((g) => g.kind === 'rank').length
    }
  };
}

// Public, unauthenticated lookup behind the QR on a shared card. Deliberately
// narrow: the name, what was won and when. No SP, no email, no rank history.
export async function verifyAchievement(code, Student) {
  const verifyId = String(code || '').trim().toUpperCase();
  if (!/^SPRT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(verifyId)) return null;
  const a = await Achievement.findOne({ verifyId }).lean();
  if (!a) return null;
  const s = await Student.findById(a.studentId, { name: 1 }).lean();
  if (!s) return null;
  return {
    valid: true,
    name: s.name || '',
    title: a.title,
    period: a.period,
    place: a.place || null,
    icon: a.icon,
    programme: 'VLED Summership Internship · IIT Ropar',
    earnedAt: a.earnedAt,
    verifyId
  };
}
