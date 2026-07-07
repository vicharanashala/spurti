import express from 'express';

import Student from '../models/Student.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import ChatRecord from '../models/ChatRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import { studentEmailFromRequest, resolveStudentEmail } from '../auth.js';

const router = express.Router();

function maskEmail(email = '') {
 const [local, domain] = email.split('@');
 if (!local) return email;
 return local.slice(0, 2) + '***@' + (domain || '');
}

/* ── week boundaries (Mon 00:00 → Sun 23:59) ────── */
function currentWeekRange() {
 const now = new Date();
 const day = now.getDay(); // 0=Sun..6=Sat
 const diff = day === 0 ? -6 : 1 - day; // offset to Monday
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

/* ── league assignment ───────────────────────────── */
function assignLeagues(rankedRows) {
 const n = rankedRows.length;
 const gold = Math.max(1, Math.floor(n * 0.25));
 const silv = Math.max(gold + 1, Math.floor(n * 0.60));
 return rankedRows.map((row, i) => ({
 ...row,
 league: i < gold ? 'gold' : i < silv ? 'silver' : 'bronze',
 }));
}

/* ── main route ──────────────────────────────────── */
router.get('/', async (req, res) => {
 try {
 /* auth — use the same Samagama-validated pattern as /me and /wrapped.
 In dev (?asEmail=…) the impersonation must beat the real auth check so
 the browser can preview the weekly leaderboard without a Samagama cookie.
 On localhost with no real auth we fall back to dummy1. */
 const email = await resolveStudentEmail(req);
 if (!email) return res.status(401).json({ error: 'Unauthorized' });

 const me = await Student.findOne({ email }).lean();
 if (!me) return res.status(404).json({ error: 'Not found' });
 if (me.status === 'excused')
 return res.status(403).json({ error: 'Excused' });

 const { weekStart, weekEnd } = currentWeekRange();
 const { weekStart: prevStart, weekEnd: prevEnd } = prevWeekRange();

 /* fetch all data in one round-trip */
 const [
 thisWeekTx, lastWeekTx,
 thisWeekSessions, allStudents,
 ] = await Promise.all([
 SPTransaction.aggregate([
 { $match: { dateTime: { $gte: weekStart, $lt: weekEnd } } },
 { $group: { _id: '$email',
 periodSp: { $sum: '$appliedDelta' } } },
 ]),
 SPTransaction.aggregate([
 { $match: { dateTime: { $gte: prevStart, $lt: prevEnd } } },
 { $group: { _id: '$email',
 periodSp: { $sum: '$appliedDelta' } } },
 ]),
 Session.find({
 endDateTime: { $gte: weekStart, $lt: weekEnd },
 }).lean(),
 Student.find({ status: 'active' }).lean(),
 ]);

 const studentMap = Object.fromEntries(
 allStudents.map(s => [s.email, s])
 );
 const thisWeekSpMap = Object.fromEntries(
 thisWeekTx.map(r => [r._id, r.periodSp])
 );
 const lastWeekSpMap = Object.fromEntries(
 lastWeekTx.map(r => [r._id, r.periodSp])
 );

 /* attendance + chat for this week's sessions */
 const weekLabels = thisWeekSessions.map(s => s.label);
 const [thisWeekAtt, thisWeekChat,
 lastWeekSessions] = await Promise.all([
 weekLabels.length
 ? AttendanceRecord.find({
 sessionLabel: { $in: weekLabels },
 }).lean()
 : Promise.resolve([]),
 weekLabels.length
 ? ChatRecord.find({
 sessionLabel: { $in: weekLabels },
 }).lean()
 : Promise.resolve([]),
 Session.find({
 endDateTime: { $gte: prevStart, $lt: prevEnd },
 }).lean(),
 ]);

 const prevLabels = lastWeekSessions.map(s => s.label);
 const lastWeekAtt = prevLabels.length
 ? await AttendanceRecord.find({
 sessionLabel: { $in: prevLabels },
 }).lean()
 : [];

 /* attendance maps: email → { qualified, total } */
 function buildAttMap(records) {
 const m = {};
 for (const r of records) {
 if (!m[r.email]) m[r.email] = { q: 0, t: 0 };
 m[r.email].t += 1;
 if (r.qualified) m[r.email].q += 1;
 }
 return m;
 }
 const thisAttMap = buildAttMap(thisWeekAtt);
 const prevAttMap = buildAttMap(lastWeekAtt);

 /* chat map: email → sum positiveCount */
 const chatMap = {};
 for (const c of thisWeekChat) {
 chatMap[c.email] = (chatMap[c.email] || 0) +
 (c.positiveCount || 0);
 }

 /* ── Build ranked rows ─────────────────────── */
 const rows = allStudents
 .map(s => ({
 email: s.email,
 name: s.name,
 maskedEmail: maskEmail(s.email),
 periodSp: thisWeekSpMap[s.email] || 0,
 lastPeriodSp: lastWeekSpMap[s.email] || 0,
 totalSp: s.totalSp || 0,
 level: s.level ?? null,
 trophyLeague: s.trophyLeague ?? null,
 attThis: thisAttMap[s.email] || { q: 0, t: 0 },
 attPrev: prevAttMap[s.email] || { q: 0, t: 0 },
 chatScore: chatMap[s.email] || 0,
 isCurrentStudent: s.email === me.email,
 }))
 .sort((a, b) => b.periodSp - a.periodSp)
 .map((row, i) => ({ ...row, rank: i + 1 }));

 const withLeagues = assignLeagues(rows);

 /* ── Category winners ──────────────────────── */
 function winner(arr, scoreFn) {
 if (!arr.length) return null;
 const scored = arr
 .map(r => ({ ...r, _score: scoreFn(r) }))
 .filter(r => r._score > 0)
 .sort((a, b) => b._score - a._score);
 if (!scored.length) return null;
 const w = scored[0];
 return {
 name: w.name,
 maskedEmail: w.maskedEmail,
 trophyLeague: w.trophyLeague,
 score: w._score,
 isCurrentStudent: w.isCurrentStudent,
 };
 }

 const categoryWinners = {
 weeklyChampion: winner(withLeagues,
 r => r.periodSp),
 mostConsistent: winner(
 withLeagues.filter(r => r.attThis.t > 0),
 r => r.attThis.q / r.attThis.t),
 mostImproved: winner(
 withLeagues.filter(r => r.lastPeriodSp > 0),
 r => r.periodSp - r.lastPeriodSp),
 biggestComeback: winner(
 withLeagues.filter(r =>
 r.attPrev.t > 0 && r.attThis.t > 0 &&
 (r.attPrev.q / r.attPrev.t) < 0.40 &&
 (r.attThis.q / r.attThis.t) >= 0.60
 ),
 r => (r.attThis.q / r.attThis.t) -
 (r.attPrev.q / r.attPrev.t)),
 communityStar: winner(withLeagues,
 r => r.chatScore),
 };

 /* ── Split into leagues ────────────────────── */
 const leagueRows = row => ({
 rank: row.rank,
 name: row.name,
 maskedEmail: row.maskedEmail,
 periodSp: row.periodSp,
 totalSp: row.totalSp,
 level: row.level,
 trophyLeague: row.trophyLeague,
 league: row.league,
 isCurrentStudent: row.isCurrentStudent,
 });

 const leagues = {
 gold: withLeagues.filter(r => r.league === 'gold')
 .map(leagueRows),
 silver: withLeagues.filter(r => r.league === 'silver')
 .map(leagueRows),
 bronze: withLeagues.filter(r => r.league === 'bronze')
 .map(leagueRows),
 };

 const myRow = withLeagues.find(r => r.email === me.email);

 return res.json({
 weekOf: weekStart.toISOString().slice(0, 10),
 totalActive: allStudents.length,
 leagues,
 categoryWinners,
 yourLeague: myRow?.league ?? null,
 yourRank: myRow?.rank ?? null,
 yourPeriodSp: myRow?.periodSp ?? 0,
 });
 } catch (err) {
 console.error('[weeklyLeaderboard]', err);
 return res.status(500).json({ error: 'Server error' });
 }
});

export default router;