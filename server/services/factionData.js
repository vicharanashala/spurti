/**
 * server/services/factionData.js
 *
 * Faction definitions and aggregation logic for Faction Wars.
 *
 * Factions are static, predefined, and shipped in code — no database model
 * for the faction catalogue.  The active war period is a weekly window
 * (Mon 00:00 → Sun 23:59) aligned with the weekly leaderboard's week logic.
 *
 * Architecture:
 *   - Faction points are derived by aggregating SPTransaction.appliedDelta
 *     per faction per period — no separate scoring model, no duplication.
 *   - Student.faction is the single source of membership truth.
 *   - All aggregation is read-only; nothing is cached or pre-computed.
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import Session from '../models/Session.js';

/* ── Static faction catalogue ───────────────────────────────────────────── */

export const FACTIONS = [
  {
    id:   'ares',
    name: 'Ares',
    color: '#dc2626',   // red
    bg:    '#fef2f2',
    emoji: '⚔️',
    desc:  'Strike first. Strike hard. No mercy.',
    role:  'Aggressors',
  },
  {
    id:   'athena',
    name: 'Athena',
    color: '#7c3aed',   // violet
    bg:    '#f5f3ff',
    emoji: '🦉',
    desc:  'Wisdom wins wars. Strategy over impulse.',
    role:  'Strategists',
  },
  {
    id:   'apollo',
    name: 'Apollo',
    color: '#f59e0b',   // amber
    bg:    '#fffbeb',
    emoji: '☀️',
    desc:  'Every day is a chance to outshine yesterday.',
    role:  'Trailblazers',
  },
  {
    id:   'artemis',
    name: 'Artemis',
    color: '#059669',   // emerald
    bg:    '#ecfdf5',
    emoji: '🏹',
    desc:  'Unwavering focus. Consistent as the tide.',
    role:  'Marksmen',
  },
];

export const FACTION_BY_ID = Object.fromEntries(FACTIONS.map(f => [f.id, f]));

/* ── Week boundary helpers (Mon-based, mirrors weeklyLeaderboard.js) ─────── */

function currentWeekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setHours(0, 0, 0, 0);
  mon.setDate(now.getDate() + diff);
  const nextMon = new Date(mon);
  nextMon.setDate(mon.getDate() + 7);
  return { weekStart: mon, weekEnd: nextMon };
}

function prevWeekRange() {
  const { weekStart } = currentWeekRange();
  const prevMon = new Date(weekStart);
  prevMon.setDate(weekStart.getDate() - 7);
  return { weekStart: prevMon, weekEnd: new Date(weekStart) };
}

/* ── Faction aggregation ─────────────────────────────────────────────────── */

async function buildFactionRows(emailSet) {
  // Map email → faction for every active student in the set.
  const students = await Student.find({
    email: { $in: [...emailSet] },
    faction: { $ne: null },
  }).select('email name faction totalSp').lean();

  const factionMembers = {};   // factionId → [{ email, name, totalSp }]
  for (const s of students) {
    if (!factionMembers[s.faction]) factionMembers[s.faction] = [];
    factionMembers[s.faction].push({
      email:    s.email,
      name:     s.name,
      totalSp:  s.totalSp,
    });
  }

  return { students, factionMembers };
}

/* ── Build a faction leaderboard for a given period ──────────────────────── */

async function buildFactionStandings(weekStart, weekEnd, currentEmail) {
  // Collect all SP transactions in the window grouped by email.
  const txAgg = await SPTransaction.aggregate([
    { $match: { dateTime: { $gte: weekStart, $lt: weekEnd } } },
    { $group: { _id: '$email', periodSp: { $sum: '$appliedDelta' } } },
  ]);
  const txMap = Object.fromEntries(txAgg.map(r => [r._id, r.periodSp]));

  // Collect attendance-qualified count per email in the window.
  const sessions = await Session.find({
    endDateTime: { $gte: weekStart, $lt: weekEnd },
  }).select('label').lean();
  const labels = sessions.map(s => s.label);
  const attRecords = labels.length
    ? await AttendanceRecord.find({ sessionLabel: { $in: labels } }).lean()
    : [];
  const attByEmail = {};
  for (const r of attRecords) {
    if (!attByEmail[r.email]) attByEmail[r.email] = { q: 0, t: 0 };
    attByEmail[r.email].t += 1;
    if (r.qualified) attByEmail[r.email].q += 1;
  }

  // Get all active students with a faction assignment.
  const allActive = await Student.find({
    status:  'active',
    faction: { $ne: null },
  }).select('email name faction totalSp').lean();

  const currentFaction = currentEmail
    ? (await Student.findOne({ email: currentEmail }).select('faction').lean())?.faction
    : null;

  const byFaction = {};
  for (const s of allActive) {
    const fid = s.faction;
    if (!byFaction[fid]) {
      byFaction[fid] = {
        faction:       fid,
        members:       [],
        weeklySp:      0,
        seasonSp:      0,
        qualifiedRate: 0,
      };
    }
    byFaction[fid].members.push({
      name:        s.name,
      email:       s.email,
      weeklySp:    txMap[s.email] || 0,
      qualified:   attByEmail[s.email]?.q || 0,
      sessions:    attByEmail[s.email]?.t || 0,
    });
    byFaction[fid].weeklySp += txMap[s.email] || 0;
    byFaction[fid].seasonSp += Number(s.totalSp) || 0;
  }

  // Compute qualified rate across the window.
  for (const fid of Object.keys(byFaction)) {
    const allMembers = byFaction[fid].members;
    const totals = allMembers.reduce(
      (acc, m) => ({ q: acc.q + m.qualified, t: acc.t + m.sessions }),
      { q: 0, t: 0 }
    );
    byFaction[fid].qualifiedRate = totals.t > 0
      ? Math.round((totals.q / totals.t) * 100)
      : 0;
    byFaction[fid].memberCount = allMembers.length;
    // Sort members by weekly SP.
    byFaction[fid].members.sort((a, b) => b.weeklySp - a.weeklySp);
    // Top contributors (top 5).
    byFaction[fid].topContributors = byFaction[fid].members.slice(0, 5);
  }

  // Sort factions by weeklySp descending.
  const sorted = Object.values(byFaction).sort((a, b) => b.weeklySp - a.weeklySp);

  return sorted.map((f, i) => ({
    rank:          i + 1,
    factionId:     f.faction,
    factionMeta:   FACTION_BY_ID[f.faction] || null,
    weeklySp:      f.weeklySp,
    seasonSp:      f.seasonSp,
    memberCount:   f.memberCount,
    qualifiedRate: f.qualifiedRate,
    isCurrentUserFaction: f.faction === currentFaction,
    topContributors: f.topContributors,
  }));
}

/* ── Full standings payload ──────────────────────────────────────────────── */

export async function getFactionWarData(currentEmail) {
  const { weekStart, weekEnd } = currentWeekRange();
  const { weekStart: prevStart, weekEnd: prevEnd } = prevWeekRange();

  const [thisWeek, lastWeek, seasonTotals] = await Promise.all([
    buildFactionStandings(weekStart, weekEnd, currentEmail),
    buildFactionStandings(prevStart, prevEnd, null),   // previous period, no user context needed
    buildFactionStandings(
      // Season start: first day of the current war (always Mon).
      // For now, the season = current calendar month.
      (() => {
        const d = new Date();
        return new Date(d.getFullYear(), d.getMonth(), 1);
      })(),
      new Date(),
      currentEmail
    ),
  ]);

  // Weekly improvement (this week vs last week).
  const improved = {};
  for (const f of thisWeek) {
    const prev = lastWeek.find(l => l.factionId === f.factionId);
    improved[f.factionId] = prev
      ? f.weeklySp - prev.weeklySp
      : f.weeklySp;
  }

  return {
    warLabel: 'Weekly War',
    weekOf:   weekStart.toISOString().slice(0, 10),
    seasonOf: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                .toISOString().slice(0, 10),
    standings: thisWeek.map(f => ({
      ...f,
      weeklyDelta: improved[f.factionId] ?? f.weeklySp,
    })),
    myFactionId: (await Student.findOne({ email: currentEmail }).select('faction').lean())?.faction ?? null,
  };
}