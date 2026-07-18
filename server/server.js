import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { ALLOW_STUDENT_SEARCH, MONGO_URI, PORT, SAMAGAMA_AUTH_URL } from './config.js';
import Student from './models/Student.js';
import Session from './models/Session.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import PollRecord from './models/PollRecord.js';
import SPTransaction from './models/SPTransaction.js';
import SessionEvent from './models/SessionEvent.js';
import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from './services/levels.js';
import Season from './models/Season.js';
import StudentSeasonData from './models/StudentSeasonData.js';
import CouncilSuggestion from './models/CouncilSuggestion.js';
import RewardTrack from './models/RewardTrack.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';

// Survey triangulation pop-up. All driven by env so the form link / mode can
// change without a client rebuild (the client reads these via /api/config).
const SURVEY = {
  enabled: process.env.SURVEY_ENABLED === '1',
  formUrl: process.env.SURVEY_FORM_URL || '',          // .../viewform  (the published form)
  emailEntryId: process.env.SURVEY_EMAIL_ENTRY || '',  // e.g. entry.1234567890  (pre-fills email)
  // Mandatory survey: 'hard' = blocking modal the student cannot dismiss until
  // they submit. No SP reward — participation is required, not incentivised.
  enforcement: process.env.SURVEY_ENFORCEMENT || 'hard',
  // Auto-expiry. After this instant the modal stops showing (normal Spurti
  // resumes) with no redeploy. ISO 8601 incl. offset, e.g. 2026-06-30T23:59:59+05:30.
  deadline: process.env.SURVEY_DEADLINE || '',
  webhookSecret: process.env.SURVEY_WEBHOOK_SECRET || '', // shared secret for the Apps Script webhook
  // Apps Script web app that returns {emails:[...]} of actual submitters (private
  // sheet; secret-gated). Used to verify completion without trusting the client.
  responsesUrl: process.env.SURVEY_RESPONSES_URL || '',
  responsesSecret: process.env.SURVEY_RESPONSES_SECRET || ''
};

// Cached fetch of the submitted-email set from the Apps Script endpoint.
let _subs = { at: 0, set: null };
async function getSubmittedEmails() {
  if (!SURVEY.responsesUrl) return null;
  if (_subs.set && Date.now() - _subs.at < 60000) return _subs.set;   // 60s cache
  try {
    const u = SURVEY.responsesUrl + (SURVEY.responsesUrl.includes('?') ? '&' : '?') +
              'secret=' + encodeURIComponent(SURVEY.responsesSecret);
    const r = await fetch(u, { redirect: 'follow' });
    const j = await r.json();
    _subs = { at: Date.now(), set: new Set((j.emails || []).map(e => normalizeEmail(e))) };
    return _subs.set;
  } catch (err) {
    console.error('survey responses fetch failed:', err?.message);
    return _subs.set; // serve last good cache on failure
  }
}

// The survey is active only while enabled AND before its deadline (if set).
function surveyActive() {
  if (!SURVEY.enabled) return false;
  if (SURVEY.deadline) {
    const cutoff = Date.parse(SURVEY.deadline);
    if (!Number.isNaN(cutoff) && Date.now() > cutoff) return false;
  }
  return true;
}

const app = express();
const api = express.Router();
const liveViewers = new Map();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function maskEmail(email) {
  const [name, domain] = String(email || '').split('@');
  if (!name || !domain) return 'hidden email';
  const start = name.slice(0, Math.min(2, name.length));
  const end = name.length > 4 ? name.slice(-2) : '';
  return `${start}${'*'.repeat(Math.max(3, name.length - start.length - end.length))}${end}@${domain}`;
}

function publicStudent(student) {
  return {
    _id: String(student._id),
    name: student.name,
    maskedEmail: maskEmail(student.email),
    maskedAlternateEmail: student.alternateEmail ? maskEmail(student.alternateEmail) : '',
    status: student.status || 'active',
    totalSp: student.totalSp
  };
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header).split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return null;
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(Boolean));
}

// Validate the student's Samagama session by forwarding their chatengine_token
// cookie to Samagama's internal auth endpoint. Returns the email on success.
async function getSamagamaUser(chatengineToken) {
  if (!chatengineToken) return null;
  try {
    const res = await fetch(SAMAGAMA_AUTH_URL, {
      headers: { cookie: `chatengine_token=${chatengineToken}` },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function studentEmailFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const data = await getSamagamaUser(cookies.chatengine_token);
  // Samagama's /api/auth/me nests the user as { user: { email, ... } };
  // fall back to a top-level email in case the shape ever flattens.
  const email = data?.user?.email || data?.email;
  if (!email) return null;
  return normalizeEmail(email);
}

async function rankFor(email) {
  const student = await Student.findOne({ email }).lean();
  if (!student || student.status === 'excused') return null;
  const better = await Student.countDocuments({
    status: { $ne: 'excused' },
    $or: [
      { totalSp: { $gt: student.totalSp } },
      { totalSp: student.totalSp, name: { $lt: student.name } }
    ]
  });
  const cohortSize = await Student.countDocuments({ status: { $ne: 'excused' } });
  return { rank: better + 1, cohortSize };
}

function excusedPayload(student) {
  return {
    excused: true,
    student: publicStudent(student),
    message: 'Your current internship account has been excused. Your previous Spurti record is preserved, and you may come back in the next cohort.'
  };
}

async function studentPayload(student) {
  const email = student.email;
  const activeFilter = { status: { $ne: 'excused' } };
  const [transactions, polls, attendance, rankInfo, leaderboard, allStudents] = await Promise.all([
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    PollRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    AttendanceRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    rankFor(email),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).limit(50).lean(),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).lean()
  ]);
  const allSp = allStudents.map(s => Number(s.totalSp || 0));
  const averageSp = allSp.length ? Math.round(allSp.reduce((sum, value) => sum + value, 0) / allSp.length) : 0;
  const top10Cutoff = allStudents[9]?.totalSp || null;
  const top50Cutoff = allStudents[49]?.totalSp || null;
  const currentIndex = allStudents.findIndex(s => s.email === email);
  const nextStudent = currentIndex > 0 ? allStudents[currentIndex - 1] : null;
  // Spurti Levels & Trophy Leagues — derived from existing SP (lifetime highest + current).
  const highestSpEver = Math.max(Number(student.highestSpEver) || 0, Number(student.totalSp) || 0);
  const myGroup = leaderboardGroup(student.internshipStartDate);
  const groupStudents = allStudents.filter(s => leaderboardGroup(s.internshipStartDate) === myGroup);
  const activeSeason = await Season.findOne({ isActive: true });
  let seasonSp = 0;
  let isEligibleForCouncil = false;
  let isCouncilMember = false;
  let studentCouncil = { activeSeason: null };

  if (activeSeason) {
    const seasonTxs = transactions.filter(t => t.dateTime >= activeSeason.startDate && t.appliedDelta > 0 && t.category !== 'initial');
    seasonSp = seasonTxs.reduce((sum, t) => sum + t.appliedDelta, 0);

    const seasonData = await StudentSeasonData.findOne({ studentId: student._id, seasonId: activeSeason._id });
    const endorsementsCount = seasonData ? (seasonData.matrixMysticsEndorsements || []).length : 0;
    const hasSpamPenalties = seasonData ? Boolean(seasonData.hasSpamPenalties) : false;
    const hasDisciplinaryActions = seasonData ? Boolean(seasonData.hasDisciplinaryActions) : false;

    isEligibleForCouncil = (seasonSp >= activeSeason.minSpRequired) &&
                           (endorsementsCount >= activeSeason.minEndorsementsRequired) &&
                           !hasSpamPenalties &&
                           !hasDisciplinaryActions;

    studentCouncil = {
      activeSeason,
      seasonSp,
      endorsementsCount,
      hasSpamPenalties,
      hasDisciplinaryActions,
      isNominated: seasonData ? Boolean(seasonData.isNominated) : false,
      nominationStatement: seasonData ? seasonData.nominationStatement : '',
      nominatedBy: seasonData ? seasonData.nominatedBy : null
    };
  }

  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (lastConcludedSeason) {
    const lastData = await StudentSeasonData.findOne({ studentId: student._id, seasonId: lastConcludedSeason._id });
    if (lastData && lastData.isElected) {
      isCouncilMember = true;
    }
    studentCouncil.electedInPreviousSeason = isCouncilMember;
  }

  const mapRow = (row, index) => ({
    rank: index + 1,
    name: row.name,
    maskedEmail: maskEmail(row.email),
    totalSp: row.totalSp,
    level: levelFor(Math.max(Number(row.highestSpEver) || 0, Number(row.totalSp) || 0)),
    isCurrentStudent: row.email === email
  });
  return {
    student: {
      _id: String(student._id),
      name: student.name,
      email: student.email,
      alternateEmail: student.alternateEmail,
      internshipStartDate: student.internshipStartDate,
      internshipEndDate: student.internshipEndDate,
      status: student.status || 'active',
      excusedAt: student.excusedAt,
      excusedReason: student.excusedReason,
      totalSp: student.totalSp,
      rank: rankInfo?.rank || null,
      cohortSize: rankInfo?.cohortSize || null,
      highestSpEver,
      level: levelFor(highestSpEver),
      trophyLeague: leagueBand(student.totalSp),
      legendBadgeUnlocked: legendBadge(highestSpEver),
      leaderboardGroup: myGroup,
      leaderboardGroupLabel: groupLabel(myGroup),
      surveyCompleted: Boolean(student.surveyCompleted),
      isEligibleForCouncil,
      isCouncilMember,
      studentCouncil
    },
    transactions,
    polls,
    attendance,
    cohort: {
      averageSp,
      top10Cutoff,
      top50Cutoff,
      pointsToTop50: top50Cutoff === null ? null : Math.max(0, top50Cutoff - student.totalSp + 1),
      pointsToNextRank: nextStudent ? Math.max(1, nextStudent.totalSp - student.totalSp + 1) : 0
    },
    leaderboard: leaderboard.map(mapRow),
    groupLeaderboard: groupStudents.slice(0, 50).map(mapRow)
  };
}

function isAdmin(req) {
  const emailOk = normalizeEmail(req.headers['x-admin-email']) === ADMIN_EMAIL;
  const tokenOk = String(req.headers['x-admin-token'] || '') === ADMIN_TOKEN;
  return emailOk && tokenOk;
}

function adminGuard(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

api.get('/health', (_req, res) => res.json({ status: 'ok' }));

api.get('/config', (_req, res) => res.json({
  allowStudentSearch: ALLOW_STUDENT_SEARCH,
  survey: {
    enabled: surveyActive(),
    formUrl: SURVEY.formUrl,
    emailEntryId: SURVEY.emailEntryId,
    enforcement: SURVEY.enforcement,
    deadline: SURVEY.deadline
  }
}));

api.get('/me', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ authenticated: false });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
  if (student.status === 'excused') return res.json({ authenticated: true, ...excusedPayload(student) });
  res.json({ authenticated: true, profile: await studentPayload(student) });
});

api.get('/search', async (req, res) => {
  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ exact: false, matches: [] });

  if (q.includes('@')) {
    const email = normalizeEmail(q);
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
    if (student?.status === 'excused') return res.json(excusedPayload(student));
    if (student) return res.json({ exact: true, profile: await studentPayload(student) });
  }

  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = await Student.find({
    $or: [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } },
      { alternateEmail: { $regex: escaped, $options: 'i' } }
    ]
  }).sort({ name: 1 }).limit(12).lean();

  res.json({ exact: false, matches: matches.map(publicStudent) });
});

api.post('/confirm', async (req, res) => {
  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  const { studentId, email } = req.body || {};
  const typed = normalizeEmail(email);
  const student = await Student.findById(studentId).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (typed !== normalizeEmail(student.email) && typed !== normalizeEmail(student.alternateEmail)) {
    return res.status(403).json({ error: 'Email did not match this record' });
  }
  if (student.status === 'excused') return res.json(excusedPayload(student));
  res.json(await studentPayload(student));
});

api.get('/leaderboard', async (req, res) => {
  const type = String(req.query.leaderboardType || 'overall');
  const filter = { status: { $ne: 'excused' } };
  if (type === 'my_onboarding_group' && req.query.group) filter.leaderboardGroup = String(req.query.group);
  const students = await Student.find(filter).sort({ totalSp: -1, name: 1 }).limit(50).lean();
  res.json(students.map((s, i) => ({
    rank: i + 1,
    name: s.name,
    maskedEmail: maskEmail(s.email),
    totalSp: s.totalSp,
    level: levelFor(Math.max(Number(s.highestSpEver) || 0, Number(s.totalSp) || 0)),
    trophyLeague: leagueBand(s.totalSp)
  })));
});

api.post('/ping', async (req, res) => {
  const { email, name, page } = req.body || {};
  const normalized = normalizeEmail(email);
  if (!normalized || !name || !page) return res.status(400).json({ error: 'email, name, page required' });
  // Telemetry is best-effort: an unknown page value (e.g. a new admin sub-page
  // not yet in the enum) must never crash the request or leak an unhandled
  // rejection. Drop the write and carry on.
  try {
    await SessionEvent.create({ email: normalized, name, event: 'page_view', page });
  } catch (err) {
    if (err?.name !== 'ValidationError') console.error('ping log failed:', err?.message);
  }
  if (page === 'record' || page.startsWith('admin')) {
    liveViewers.set(normalized, { name, page, lastSeen: new Date() });
  }
  res.json({ ok: true });
});

// --- Survey triangulation (mandatory perception follow-up) ---------------
// Mark a student's survey as completed. Idempotent; matches on primary or
// alternate email. No SP is awarded — the survey is mandatory, not rewarded.
async function markSurveyComplete(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const student = await Student.findOne({ $or: [{ email: normalized }, { alternateEmail: normalized }] });
  if (!student) return null;
  if (!student.surveyCompleted) {
    student.surveyCompleted = true;
    student.surveyCompletedAt = new Date();
    await student.save();
  }
  return student;
}

// NOTE: there is deliberately NO client-callable "mark complete" endpoint. The
// flag is set ONLY by a real Google submission (the webhook below) or the
// server-side sheet sync, so the modal cannot be dismissed by trust. The client
// can only READ status via /survey/status and dismiss when it returns completed.

// Completion check the modal polls and verifies on the "I've submitted" button.
// Session-authenticated; reflects only server-set (webhook/sync) completion.
api.get('/survey/status', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.json({ completed: false });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (student?.surveyCompleted) return res.json({ completed: true });
  // On-demand verification against the responses sheet (so the "I've submitted"
  // button confirms a genuine submission without waiting for the 10-min cron).
  const subs = await getSubmittedEmails();
  if (subs && student) {
    const e = normalizeEmail(student.email), a = normalizeEmail(student.alternateEmail);
    if (subs.has(e) || (a && subs.has(a))) {
      await markSurveyComplete(student.email);
      return res.json({ completed: true });
    }
  }
  res.json({ completed: false });
});

// Authoritative confirmation: the Google Form's Apps Script onFormSubmit
// trigger POSTs { email, secret } here. Secret-authenticated, not session.
api.post('/survey/webhook', async (req, res) => {
  if (!SURVEY.webhookSecret || String(req.body?.secret || '') !== SURVEY.webhookSecret) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  const student = await markSurveyComplete(req.body?.email);
  if (!student) return res.status(404).json({ ok: false, error: 'no match', email: normalizeEmail(req.body?.email) });
  res.json({ ok: true, email: student.email });
});

api.get('/admin/stats', adminGuard, async (_req, res) => {
  const [yetToOnboard, excusedStudents, sessions, txns, activeStudents] = await Promise.all([
    Student.countDocuments({ status: 'yet to onboard' }),
    Student.countDocuments({ status: 'excused' }),
    Session.find().sort({ endDateTime: 1 }).lean(),
    SPTransaction.countDocuments(),
    Student.countDocuments({ status: 'active' })
  ]);
  res.json({ yetToOnboard, excusedStudents, activeStudents, sessions, transactions: txns });
});
api.get('/admin/students-by-status', adminGuard, async (req, res) => {
  const status = String(req.query.status || 'yet to onboard');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 200)));
  const students = await Student.find({ status }).sort({ name: 1 }).limit(limit).lean();
  res.json(students.map(s => ({
    _id: String(s._id),
    name: s.name,
    email: s.email,
    totalSp: s.totalSp,
    internshipStartDate: s.internshipStartDate
  })));
});


api.get('/admin/leaderboard', adminGuard, async (req, res) => {
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 50)));
  const students = await Student.find({ status: 'active' }).sort({ totalSp: -1, name: 1 }).limit(limit).lean();
  res.json(students.map((s, i) => ({
    rank: i + 1,
    _id: String(s._id),
    name: s.name,
    email: s.email,
    totalSp: s.totalSp
  })));
});

api.get('/admin/attendance', adminGuard, async (_req, res) => {
  const [sessions, students, records] = await Promise.all([
    Session.find().sort({ endDateTime: 1 }).lean(),
    Student.find({ status: 'active' }).sort({ name: 1 }).lean(),
    AttendanceRecord.find().lean()
  ]);
  const byStudent = new Map();
  for (const record of records) byStudent.set(`${record.email}|${record.sessionLabel}`, record);
  res.json({
    sessions: sessions.map(s => ({ label: s.label, totalMinutes: s.totalMinutes })),
    students: students.map(student => ({
      _id: String(student._id),
      name: student.name,
      email: student.email,
      totalSp: student.totalSp,
      cells: Object.fromEntries(sessions.map(session => {
        const record = byStudent.get(`${student.email}|${session.label}`);
        return [session.label, record ? {
          minutes: record.attendedMinutes,
          totalMinutes: record.totalSessionMinutes,
          qualified: record.qualified,
          percentage: record.attendancePercentage
        } : null];
      }))
    }))
  });
});

api.get('/admin/student/:id', adminGuard, async (req, res) => {
  const student = await Student.findById(req.params.id).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await studentPayload(student));
});

api.get('/admin/active', adminGuard, (_req, res) => {
  const now = new Date();
  const cutoff = now.getTime() - 60_000;
  const viewers = [];
  for (const [email, data] of liveViewers.entries()) {
    if (data.lastSeen.getTime() >= cutoff) {
      viewers.push({
        email,
        name: data.name,
        page: data.page,
        recordViewed: data.recordViewed,
        secondsAgo: Math.round((now.getTime() - data.lastSeen.getTime()) / 1000)
      });
    }
  }
  res.json(viewers);
});

api.get('/admin/analytics', adminGuard, async (_req, res) => {
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allStudents, sessions, attendance, transactions, events] = await Promise.all([
    Student.find().lean(),
    Session.find().sort({ endDateTime: 1 }).lean(),
    AttendanceRecord.find().lean(),
    SPTransaction.find().lean(),
    SessionEvent.find({ timestamp: { $gte: last30Days } }).lean()
  ]);
  const statusCounts = { active: 0, 'yet to onboard': 0, excused: 0 };
  for (const s of allStudents) { if (s.status in statusCounts) statusCounts[s.status]++; }
  const activeStudents = allStudents.filter(s => s.status === 'active');
  const activeEmails = new Set(activeStudents.map(student => student.email));
  const activeAttendance = attendance.filter(row => activeEmails.has(row.email));
  const activeTransactions = transactions.filter(row => activeEmails.has(row.email));
  const activeEvents = events.filter(row => activeEmails.has(row.email));

  const uniqueSince = (date) => new Set(activeEvents.filter(e => e.timestamp >= date).map(e => e.email)).size;
  const bucket = (date, mode) => {
    const d = new Date(date);
    if (mode === 'hour') return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:00`;
    if (mode === 'week') {
      const first = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil((((d - first) / 86400000) + first.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  };
  const series = (mode, from) => {
    const map = new Map();
    for (const ev of activeEvents.filter(e => e.timestamp >= from)) {
      const key = bucket(ev.timestamp, mode);
      if (!map.has(key)) map.set(key, { label: key, events: 0, emails: new Set() });
      const row = map.get(key);
      row.events += 1;
      row.emails.add(ev.email);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label)).map(r => ({ label: r.label, events: r.events, uniqueUsers: r.emails.size }));
  };

  const activeNow = [...liveViewers.values()].filter(v => now.getTime() - v.lastSeen.getTime() <= 60_000).length;
  const spValues = activeStudents.map(s => Number(s.totalSp || 0)).sort((a, b) => a - b);
  const avgSp = spValues.length ? Math.round(spValues.reduce((a, b) => a + b, 0) / spValues.length) : 0;
  const medianSp = spValues.length ? spValues[Math.floor(spValues.length / 2)] : 0;
  const spBands = {
    below100: spValues.filter(v => v < 100).length,
    from100to149: spValues.filter(v => v >= 100 && v < 150).length,
    from150to199: spValues.filter(v => v >= 150 && v < 200).length,
    from200plus: spValues.filter(v => v >= 200).length
  };

  const attendanceBySession = sessions.map(session => {
    const rows = activeAttendance.filter(a => a.sessionLabel === session.label);
    const qualified = rows.filter(r => r.qualified).length;
    const totalMinutes = rows.reduce((sum, r) => sum + Number(r.attendedMinutes || 0), 0);
    return {
      label: session.label,
      totalStudents: rows.length,
      qualified,
      notQualified: rows.length - qualified,
      qualifiedPct: rows.length ? Math.round((qualified / rows.length) * 100) : 0,
      avgMinutes: rows.length ? Math.round(totalMinutes / rows.length) : 0,
      sessionMinutes: session.totalMinutes
    };
  });

  const categoryTotals = ['initial', 'attendance', 'poll', 'manual'].map(category => {
    const rows = activeTransactions.filter(t => t.category === category);
    return {
      category,
      count: rows.length,
      netSp: rows.reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0),
      credits: rows.filter(t => t.appliedDelta > 0).length,
      debits: rows.filter(t => t.appliedDelta < 0).length
    };
  });
  const attendanceDebits = activeTransactions.filter(t => t.category === 'attendance' && t.appliedDelta < 0);
  const pollDebits = activeTransactions.filter(t => t.category === 'poll' && t.appliedDelta < 0);
  const inactiveToday = activeStudents.length - new Set(activeEvents.filter(e => e.timestamp >= todayStart).map(e => e.email)).size;
  const lowSp = activeStudents.filter(s => Number(s.totalSp || 0) < 100).length;
  const topDrops = Object.values(attendanceDebits.concat(pollDebits).reduce((acc, txn) => {
    if (!acc[txn.email]) acc[txn.email] = { email: txn.email, debitCount: 0, debitSp: 0 };
    acc[txn.email].debitCount += 1;
    acc[txn.email].debitSp += Math.abs(Number(txn.appliedDelta || 0));
    return acc;
  }, {})).sort((a, b) => b.debitSp - a.debitSp).slice(0, 10);

  res.json({
    live: { activeNow },
    users: {
      activeLastHour: uniqueSince(lastHour),
      activeToday: uniqueSince(todayStart),
      activeLast7Days: uniqueSince(last7Days),
      activeLast30Days: uniqueSince(last30Days),
      hourly: series('hour', last24Hours(now)),
      weekly: series('week', last30Days),
      monthly: series('month', last30Days)
    },
    attendance: {
      sessions: attendanceBySession,
      overallQualifiedPct: activeAttendance.length ? Math.round((activeAttendance.filter(a => a.qualified).length / activeAttendance.length) * 100) : 0
    },
    sp: {
      students: activeStudents.length,
      statusCounts,
      average: avgSp,
      median: medianSp,
      min: spValues[0] || 0,
      max: spValues[spValues.length - 1] || 0,
      bands: spBands,
      categoryTotals
    },
    alerts: {
      lowSp,
      inactiveToday,
      attendanceDebits: attendanceDebits.length,
      pollDebits: pollDebits.length,
      topDrops
    }
  });
});

// ==========================================
// STUDENT COUNCIL FEATURE ENDPOINTS
// ==========================================

api.get('/student-council/status', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  
  const payload = await studentPayload(student);
  res.json(payload.student.studentCouncil);
});

api.post('/student-council/nomination/refine-statement', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const { statement } = req.body;
  if (!statement || typeof statement !== 'string') return res.status(400).json({ error: 'statement is required' });
  try {
    let refined = statement.trim();
    refined = refined.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
    if (!refined.endsWith('.')) refined += '.';
    
    const prefix = "I am highly motivated to serve on the Student Council. My goal is to collaborate with peers, address community feedback, and help make our learning environment and quests even more engaging. ";
    res.json({ refined: prefix + refined });
  } catch (err) {
    console.error("Local statement refinement failed:", err);
    res.status(500).json({ error: "Failed to refine statement: " + err.message });
  }
});

api.post('/student-council/nominate', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const currentStudent = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
  if (!currentStudent) return res.status(404).json({ error: 'Student not found' });

  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.status(400).json({ error: 'No active election season.' });

  const { nomineeEmail, statement } = req.body;
  if (!statement || typeof statement !== 'string') return res.status(400).json({ error: 'statement is required' });

  let nominee = currentStudent;
  if (nomineeEmail && normalizeEmail(nomineeEmail) !== email) {
    nominee = await Student.findOne({ $or: [{ email: normalizeEmail(nomineeEmail) }, { alternateEmail: normalizeEmail(nomineeEmail) }] });
    if (!nominee) return res.status(404).json({ error: 'Nominee not found.' });
  }

  const transactions = await SPTransaction.find({ email: nominee.email }).lean();
  const seasonTxs = transactions.filter(t => t.dateTime >= activeSeason.startDate && t.appliedDelta > 0 && t.category !== 'initial');
  const seasonSp = seasonTxs.reduce((sum, t) => sum + t.appliedDelta, 0);

  let seasonData = await StudentSeasonData.findOne({ studentId: nominee._id, seasonId: activeSeason._id });
  const endorsementsCount = seasonData ? (seasonData.matrixMysticsEndorsements || []).length : 0;
  const hasSpamPenalties = seasonData ? Boolean(seasonData.hasSpamPenalties) : false;
  const hasDisciplinaryActions = seasonData ? Boolean(seasonData.hasDisciplinaryActions) : false;

  const isEligible = (seasonSp >= activeSeason.minSpRequired) &&
                     (endorsementsCount >= activeSeason.minEndorsementsRequired) &&
                     !hasSpamPenalties &&
                     !hasDisciplinaryActions;

  if (!isEligible) {
    return res.status(400).json({ error: 'Nominee does not meet eligibility requirements (check SP, Matrix Mystics question endorsements, or penalties).' });
  }

  if (!seasonData) {
    seasonData = new StudentSeasonData({ studentId: nominee._id, seasonId: activeSeason._id });
  }

  seasonData.isNominated = true;
  seasonData.nominationStatement = statement.trim();
  if (nominee._id.toString() !== currentStudent._id.toString()) {
    seasonData.nominatedBy = email;
  } else {
    seasonData.nominatedBy = null;
  }

  await seasonData.save();
  res.json({ success: true, message: 'Nomination submitted successfully.' });
});

api.post('/student-council/vote', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });

  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.status(400).json({ error: 'No active election season.' });

  const { nomineeId } = req.body;
  if (!nomineeId) return res.status(400).json({ error: 'nomineeId is required.' });

  const alreadyVoted = await StudentSeasonData.exists({ seasonId: activeSeason._id, votes: email });
  if (alreadyVoted) {
    return res.status(400).json({ error: 'You have already voted in this election.' });
  }

  const nomineeData = await StudentSeasonData.findOne({ _id: nomineeId, seasonId: activeSeason._id });
  if (!nomineeData || !nomineeData.isNominated) {
    return res.status(404).json({ error: 'Nominee not found or not active.' });
  }

  const nomineeStudent = await Student.findById(nomineeData.studentId).lean();
  if (nomineeStudent && (normalizeEmail(nomineeStudent.email) === email || normalizeEmail(nomineeStudent.alternateEmail) === email)) {
    return res.status(400).json({ error: 'You cannot vote for yourself.' });
  }

  nomineeData.votes.push(email);
  await nomineeData.save();
  res.json({ success: true, message: 'Vote cast successfully.' });
});

api.get('/student-council/nominees', async (req, res) => {
  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.json([]);

  const nominees = await StudentSeasonData.find({ seasonId: activeSeason._id, isNominated: true }).populate('studentId').lean();
  
  res.json(nominees.map(n => {
    return {
      _id: String(n._id),
      studentId: String(n.studentId?._id),
      name: n.studentId?.name || 'Anonymous',
      maskedEmail: maskEmail(n.studentId?.email || ''),
      nominationStatement: n.nominationStatement,
      votesCount: (n.votes || []).length,
      seasonSp: 0,
      endorsementsCount: (n.matrixMysticsEndorsements || []).length
    };
  }));
});

api.get('/student-council/members', async (req, res) => {
  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.json({ seasonName: '', members: [] });

  const members = await StudentSeasonData.find({ seasonId: lastConcludedSeason._id, isElected: true }).populate('studentId').lean();
  
  res.json({
    seasonName: lastConcludedSeason.name,
    members: members.map(m => ({
      _id: String(m.studentId?._id),
      name: m.studentId?.name || 'Anonymous',
      maskedEmail: maskEmail(m.studentId?.email || ''),
      level: levelFor(Math.max(Number(m.studentId?.highestSpEver) || 0, Number(m.studentId?.totalSp) || 0)),
      totalSp: m.studentId?.totalSp || 0,
      nominationStatement: m.nominationStatement,
      certificateDate: lastConcludedSeason.endDate
    }))
  });
});

api.post('/student-council/suggestions', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.status(400).json({ error: 'No active council.' });

  const isMember = await StudentSeasonData.exists({ studentId: student._id, seasonId: lastConcludedSeason._id, isElected: true });
  if (!isMember) return res.status(403).json({ error: 'Only elected Student Council members can suggest.' });

  const { type, content } = req.body;
  if (!type || !content) return res.status(400).json({ error: 'type and content are required.' });

  const suggestion = await CouncilSuggestion.create({
    studentId: student._id,
    seasonId: lastConcludedSeason._id,
    type,
    content
  });

  res.json(suggestion);
});

api.post('/student-council/suggestions/:id/upvote', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.status(400).json({ error: 'No active council.' });

  const isMember = await StudentSeasonData.exists({ studentId: student._id, seasonId: lastConcludedSeason._id, isElected: true });
  if (!isMember) return res.status(403).json({ error: 'Only elected Student Council members can vote.' });

  const suggestion = await CouncilSuggestion.findById(req.params.id);
  if (!suggestion) return res.status(404).json({ error: 'Suggestion not found.' });

  if (suggestion.votes.includes(email)) {
    suggestion.votes = suggestion.votes.filter(e => e !== email);
  } else {
    suggestion.votes.push(email);
  }
  await suggestion.save();
  res.json(suggestion);
});

api.get('/student-council/suggestions', async (req, res) => {
  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.json([]);
  const list = await CouncilSuggestion.find({ seasonId: lastConcludedSeason._id }).populate('studentId').lean();
  res.json(list.map(s => ({
    _id: String(s._id),
    type: s.type,
    content: s.content,
    studentName: s.studentId?.name || 'Anonymous',
    votesCount: (s.votes || []).length,
    voted: req.query.email ? s.votes.includes(normalizeEmail(req.query.email)) : false
  })));
});

api.get('/student-council/reward-tracks', async (req, res) => {
  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.json([]);
  const tracks = await RewardTrack.find({ seasonId: lastConcludedSeason._id }).lean();
  res.json(tracks.map(t => ({
    _id: String(t._id),
    name: t.name,
    description: t.description,
    items: t.items,
    votesCount: (t.votes || []).length,
    voted: req.query.email ? t.votes.includes(normalizeEmail(req.query.email)) : false
  })));
});

api.post('/student-council/reward-tracks/:id/vote', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Unauthorized' });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.status(400).json({ error: 'No active council.' });

  const isMember = await StudentSeasonData.exists({ studentId: student._id, seasonId: lastConcludedSeason._id, isElected: true });
  if (!isMember) return res.status(403).json({ error: 'Only elected Student Council members can vote.' });

  const track = await RewardTrack.findById(req.params.id);
  if (!track) return res.status(404).json({ error: 'Track not found.' });

  if (track.votes.includes(email)) {
    track.votes = track.votes.filter(e => e !== email);
  } else {
    track.votes.push(email);
  }
  await track.save();
  res.json(track);
});

// Admin Student Council endpoints
api.post('/admin/student-council/season/start', adminGuard, async (req, res) => {
  const { name, maxSpCapForScore, councilSize, minEndorsementsRequired, minSpRequired } = req.body;
  if (!name) return res.status(400).json({ error: 'Season name is required.' });

  await Season.updateMany({ isActive: true }, { $set: { isActive: false, endDate: new Date() } });

  const season = await Season.create({
    name,
    maxSpCapForScore: maxSpCapForScore || 1000,
    councilSize: councilSize || 5,
    minEndorsementsRequired: minEndorsementsRequired || 40,
    minSpRequired: minSpRequired || 500,
    isActive: true
  });

  await RewardTrack.create([
    {
      name: 'Alpha Track',
      description: 'Focuses on visual badges and direct SP boosts.',
      items: ['Digital Leader Badge', '+30 SP Boost Card', 'Featured profile slot'],
      seasonId: season._id
    },
    {
      name: 'Beta Track',
      description: 'Focuses on streak protection and mystery bonuses.',
      items: ['2x Streak Freezes', 'Bonus Spin Wheel Coupon', 'Custom frame styling'],
      seasonId: season._id
    }
  ]);

  res.json(season);
});

api.post('/admin/student-council/season/config', adminGuard, async (req, res) => {
  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.status(404).json({ error: 'No active season.' });

  const { maxSpCapForScore, councilSize, minEndorsementsRequired, minSpRequired } = req.body;
  if (maxSpCapForScore !== undefined) activeSeason.maxSpCapForScore = maxSpCapForScore;
  if (councilSize !== undefined) activeSeason.councilSize = councilSize;
  if (minEndorsementsRequired !== undefined) activeSeason.minEndorsementsRequired = minEndorsementsRequired;
  if (minSpRequired !== undefined) activeSeason.minSpRequired = minSpRequired;

  await activeSeason.save();
  res.json(activeSeason);
});

api.post('/admin/student-council/student-data', adminGuard, async (req, res) => {
  const { studentId, matrixMysticsEndorsements, hasSpamPenalties, hasDisciplinaryActions } = req.body;
  if (!studentId) return res.status(400).json({ error: 'studentId is required.' });

  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.status(400).json({ error: 'No active season.' });

  let data = await StudentSeasonData.findOne({ studentId, seasonId: activeSeason._id });
  if (!data) {
    data = new StudentSeasonData({ studentId, seasonId: activeSeason._id });
  }

  if (matrixMysticsEndorsements !== undefined) data.matrixMysticsEndorsements = matrixMysticsEndorsements;
  if (hasSpamPenalties !== undefined) data.hasSpamPenalties = hasSpamPenalties;
  if (hasDisciplinaryActions !== undefined) data.hasDisciplinaryActions = hasDisciplinaryActions;

  await data.save();
  res.json(data);
});

api.post('/admin/student-council/conclude', adminGuard, async (req, res) => {
  const activeSeason = await Season.findOne({ isActive: true });
  if (!activeSeason) return res.status(404).json({ error: 'No active season to conclude.' });

  const nominees = await StudentSeasonData.find({ seasonId: activeSeason._id, isNominated: true }).populate('studentId');
  if (!nominees.length) {
    activeSeason.isActive = false;
    activeSeason.endDate = new Date();
    await activeSeason.save();
    return res.json({ success: true, message: 'Season ended with no nominees.', elected: [] });
  }

  const maxVotes = Math.max(1, ...nominees.map(n => (n.votes || []).length));
  const cap = activeSeason.maxSpCapForScore;

  const scoredNominees = [];
  for (const n of nominees) {
    if (!n.studentId) continue;
    const txs = await SPTransaction.find({ email: n.studentId.email, dateTime: { $gte: activeSeason.startDate } }).lean();
    const seasonTxs = txs.filter(t => t.appliedDelta > 0 && t.category !== 'initial');
    const seasonSp = seasonTxs.reduce((sum, t) => sum + t.appliedDelta, 0);

    const votesCount = (n.votes || []).length;
    const endorsementsCount = (n.matrixMysticsEndorsements || []).length;

    const spScore = (Math.min(seasonSp, cap) / cap) * 60;
    const endorsementsScore = (endorsementsCount / 53) * 20;
    const votesScore = (votesCount / maxVotes) * 20;
    
    n.councilScore = Math.round(spScore + endorsementsScore + votesScore);
    scoredNominees.push(n);
  }

  scoredNominees.sort((a, b) => b.councilScore - a.councilScore);
  const electCount = Math.min(scoredNominees.length, activeSeason.councilSize);
  const elected = scoredNominees.slice(0, electCount);

  for (let i = 0; i < scoredNominees.length; i++) {
    const isElected = i < electCount;
    const nomineeData = scoredNominees[i];
    nomineeData.isElected = isElected;
    await nomineeData.save();

    if (isElected && nomineeData.studentId) {
      await Student.updateOne({ _id: nomineeData.studentId._id }, { $inc: { totalSp: 50 } });
      await SPTransaction.create({
        email: nomineeData.studentId.email,
        studentId: nomineeData.studentId._id,
        category: 'manual',
        deltaValue: 50,
        appliedDelta: 50,
        balanceAfter: (nomineeData.studentId.totalSp || 0) + 50,
        reason: `Elected to Student Council - ${activeSeason.name} Bonus SP`,
        dateTime: new Date()
      });
    }
  }

  activeSeason.isActive = false;
  activeSeason.endDate = new Date();
  await activeSeason.save();

  res.json({
    success: true,
    message: `Season concluded. Elected ${elected.length} council members.`,
    elected: elected.map(e => ({ name: e.studentId?.name, email: e.studentId?.email, score: e.councilScore }))
  });
});

api.post('/admin/student-council/invalidate-nomination', adminGuard, async (req, res) => {
  const { nomineeId } = req.body;
  const data = await StudentSeasonData.findByIdAndUpdate(nomineeId, { $set: { isNominated: false } }, { new: true });
  if (!data) return res.status(404).json({ error: 'Nomination not found.' });
  res.json({ success: true, data });
});

api.post('/admin/student-council/invalidate-vote', adminGuard, async (req, res) => {
  const { nomineeId, voterEmail } = req.body;
  const data = await StudentSeasonData.findById(nomineeId);
  if (!data) return res.status(404).json({ error: 'Nominee not found.' });
  
  data.votes = data.votes.filter(v => v !== normalizeEmail(voterEmail));
  await data.save();
  res.json({ success: true, votesCount: data.votes.length });
});

api.get('/admin/student-council/insights', adminGuard, async (req, res) => {
  const lastConcludedSeason = await Season.findOne({ isActive: false }).sort({ endDate: -1 });
  if (!lastConcludedSeason) return res.status(400).json({ error: 'No concluded season with council feedback.' });

  const suggestions = await CouncilSuggestion.find({ seasonId: lastConcludedSeason._id }).populate('studentId').lean();
  if (suggestions.length === 0) return res.json({ insights: 'No suggestions submitted yet by this season\'s council.' });

  try {
    const weeklyQuests = suggestions.filter(s => s.type === 'weeklyQuest');
    const communityChallenges = suggestions.filter(s => s.type === 'communityChallenge');
    const feedback = suggestions.filter(s => s.type === 'structuredFeedback');
    const platformImprovements = suggestions.filter(s => s.type === 'platformImprovement');

    let report = `### 📋 Student Council Advisory & Suggestions Report (Offline Summary)\n\n`;
    report += `This report lists and categorizes the submissions from the Student Council representatives for the concluded season: **${lastConcludedSeason.name}**.\n\n`;

    if (weeklyQuests.length > 0) {
      report += `#### 🎮 Suggested Weekly Quests & Challenges:\n`;
      weeklyQuests.forEach(s => {
        report += `- **${s.studentId?.name || 'Anonymous'}:** "${s.content}"\n`;
      });
      report += `\n`;
    }

    if (communityChallenges.length > 0) {
      report += `#### 🏆 Suggested Community Challenges:\n`;
      communityChallenges.forEach(s => {
        report += `- **${s.studentId?.name || 'Anonymous'}:** "${s.content}"\n`;
      });
      report += `\n`;
    }

    if (platformImprovements.length > 0) {
      report += `#### 🛠 Recommended Platform Improvements:\n`;
      platformImprovements.forEach(s => {
        report += `- **${s.studentId?.name || 'Anonymous'}:** "${s.content}"\n`;
      });
      report += `\n`;
    }

    if (feedback.length > 0) {
      report += `#### 💬 General Advisory Feedback:\n`;
      feedback.forEach(s => {
        report += `- **${s.studentId?.name || 'Anonymous'}:** "${s.content}"\n`;
      });
      report += `\n`;
    }

    report += `#### 💡 Recommended Next Action Items for Admins:\n`;
    report += `1. Review the proposed weekly quest templates above and integrate them into the upcoming cycle.\n`;
    report += `2. Assess feasibility of suggested platform enhancements.\n`;
    report += `3. Schedule a cohort-wide sync if any critical general feedback requires immediate resolution.`;

    res.json({ insights: report });
  } catch (err) {
    console.error("Local Insights generation failed:", err);
    res.status(500).json({ error: "Failed to generate local insights: " + err.message });
  }
});

function last24Hours(now) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

app.use('/api', api);
app.use('/spurti/api', api);

if (fs.existsSync(clientDist)) {
  app.use('/spurti', express.static(clientDist));
  app.use(express.static(clientDist));
  app.get('/spurti/*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(404).send('Build the client first with npm run build.'));
}

mongoose.connect(MONGO_URI).then(() => {
  app.listen(PORT, () => console.log(`Spurti app running at http://localhost:${PORT}/`));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});


