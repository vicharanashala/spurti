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
import User from './models/User.js';
import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from './services/levels.js';

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
  if (chatengineToken === 'mock-admin-token' || chatengineToken === 'vled-local-admin') {
    return { user: { email: 'dled@iitrpr.ac.in', name: 'Admin User' } };
  }
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
      surveyCompleted: Boolean(student.surveyCompleted)
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

async function adminGuard(req, res, next) {
  try {
    const email = await studentEmailFromRequest(req);
    if (!email) {
      const emailOk = normalizeEmail(req.headers['x-admin-email']) === ADMIN_EMAIL;
      const tokenOk = String(req.headers['x-admin-token'] || '') === ADMIN_TOKEN;
      if (emailOk && tokenOk) {
        req.adminEmail = ADMIN_EMAIL;
        return next();
      }
      return res.status(401).json({ error: 'Unauthorized: No active session' });
    }

    const user = await User.findOne({ email });
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    req.adminEmail = email;
    next();
  } catch (err) {
    console.error('adminGuard error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

  const user = await User.findOne({ email });
  const role = user?.role || 'student';

  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) {
    if (role === 'admin') {
      return res.json({
        authenticated: true,
        role: 'admin',
        user: { email, name: user.name || 'Admin' }
      });
    }
    return res.status(404).json({ authenticated: false, error: 'Student not found' });
  }
  if (student.status === 'excused') return res.json({ authenticated: true, role, ...excusedPayload(student) });
  res.json({ authenticated: true, role, profile: await studentPayload(student) });
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
  try {
    const timeRange = String(req.query.timeRange || 'overall'); // today, week, month, overall
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    const sortBy = String(req.query.sortBy || 'spEarned'); // spEarned, name, email
    const sortOrder = String(req.query.sortOrder || 'desc'); // asc, desc

    const skip = (page - 1) * limit;
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;

    let startTime = null;
    if (timeRange === 'today') {
      startTime = new Date(new Date(now.getTime() + istOffset).setUTCHours(0, 0, 0, 0) - istOffset);
    } else if (timeRange === 'week') {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (timeRange === 'month') {
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const matchStage = { status: 'active' };

    // We calculate total count of active students
    const totalStudents = await Student.countDocuments(matchStage);

    let aggregationPipeline = [];
    aggregationPipeline.push({ $match: matchStage });

    if (timeRange !== 'overall' && startTime) {
      // Lookup and sum transactions in time range
      aggregationPipeline.push({
        $lookup: {
          from: 'sptransactions',
          let: { studentEmail: '$email' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: [ '$email', '$$studentEmail' ] },
                    { $gte: [ '$dateTime', startTime ] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
                totalEarned: { $sum: '$appliedDelta' }
              }
            }
          ],
          as: 'transSum'
        }
      });
      aggregationPipeline.push({
        $addFields: {
          spEarned: {
            $ifNull: [ { $arrayElemAt: [ '$transSum.totalEarned', 0 ] }, 0 ]
          }
        }
      });
    } else {
      // For overall, spEarned is just totalSp
      aggregationPipeline.push({
        $addFields: {
          spEarned: '$totalSp'
        }
      });
    }

    // Sort stage
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = {};
    if (sortBy === 'name') {
      sortObj.name = sortDir;
    } else if (sortBy === 'email') {
      sortObj.email = sortDir;
    } else {
      sortObj.spEarned = sortDir;
    }
    // tie-breaker sorting
    sortObj.name = sortObj.name || 1;
    aggregationPipeline.push({ $sort: sortObj });

    // Skip & Limit
    aggregationPipeline.push({ $skip: skip });
    aggregationPipeline.push({ $limit: limit });

    const students = await Student.aggregate(aggregationPipeline);

    res.json({
      students: students.map((s, idx) => ({
        rank: skip + idx + 1,
        _id: String(s._id),
        name: s.name,
        email: s.email,
        totalSp: s.totalSp,
        spEarned: s.spEarned,
        level: s.level,
        trophyLeague: s.trophyLeague
      })),
      total: totalStudents,
      page,
      limit,
      totalPages: Math.ceil(totalStudents / limit)
    });
  } catch (err) {
    console.error('get admin leaderboard error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

api.get('/admin/active', adminGuard, async (_req, res) => {
  const now = new Date();
  const cutoff = now.getTime() - 60_000;
  const viewers = [];
  
  const adminUsers = await User.find({ role: 'admin' }).select('email').lean();
  const adminEmails = new Set(adminUsers.map(u => u.email.toLowerCase()));

  for (const [email, data] of liveViewers.entries()) {
    if (data.lastSeen.getTime() >= cutoff) {
      if (adminEmails.has(email.toLowerCase()) || (data.page && data.page.startsWith('admin'))) {
        continue;
      }
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
  const adminUsers = await User.find({ role: 'admin' }).select('email').lean();
  const adminEmails = new Set(adminUsers.map(u => u.email.toLowerCase()));

  const activeNow = [...liveViewers.entries()].filter(([email, v]) => 
    now.getTime() - v.lastSeen.getTime() <= 60_000 &&
    !adminEmails.has(email.toLowerCase()) &&
    !(v.page && v.page.startsWith('admin'))
  ).length;
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

function last24Hours(now) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

// ==========================================
// Admin Custom Seeding & Storage Helpers
// ==========================================
const BULK_NOTIF_FILE = path.join(process.cwd(), 'data', 'bulk_notifications.json');
function getBulkNotifications() {
  try {
    if (!fs.existsSync(BULK_NOTIF_FILE)) return [];
    return JSON.parse(fs.readFileSync(BULK_NOTIF_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}
function saveBulkNotification(log) {
  try {
    const logs = getBulkNotifications();
    logs.unshift(log);
    const dir = path.dirname(BULK_NOTIF_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(BULK_NOTIF_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch (e) {
    console.error(e);
  }
}

const GOALS_FILE = path.join(process.cwd(), 'data', 'goals.json');
function getGoals() {
  try {
    if (!fs.existsSync(GOALS_FILE)) {
      const defaults = [
        { id: 'g-1', title: 'Earn 100 SP this week', type: 'sp_earned', target: 100, timeframe: 'week' },
        { id: 'g-2', title: 'Attend 100% Zoom sessions', type: 'attendance_sessions', target: 100, timeframe: 'overall' }
      ];
      const dir = path.dirname(GOALS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(GOALS_FILE, JSON.stringify(defaults, null, 2), 'utf8');
      return defaults;
    }
    return JSON.parse(fs.readFileSync(GOALS_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}
function saveGoals(goals) {
  try {
    const dir = path.dirname(GOALS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(GOALS_FILE, JSON.stringify(goals, null, 2), 'utf8');
  } catch (e) {
    console.error(e);
  }
}

// ==========================================
// Admin Login Endpoint (Verifies against database)
// ==========================================
api.post('/admin/login', async (req, res) => {
  try {
    const { email, token } = req.body;
    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || user.role !== 'admin' || user.passwordHash !== token) {
      return res.status(403).json({ error: 'Invalid admin credentials' });
    }

    res.setHeader('Set-Cookie', 'chatengine_token=mock-admin-token; Path=/; HttpOnly');
    res.json({ success: true, user: { email: user.email, name: user.name } });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// Admin Search & Activity Endpoints
// ==========================================
api.get('/admin/student-search', adminGuard, async (req, res) => {
  try {
    const { name, spMin, spMax, attendanceMin, attendanceMax, batch, status } = req.query;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));

    const matchStage = {};
    if (name) {
      matchStage.name = { $regex: name.trim(), $options: 'i' };
    }
    if (spMin !== undefined || spMax !== undefined) {
      matchStage.totalSp = {};
      if (spMin !== undefined && spMin !== '') matchStage.totalSp.$gte = Number(spMin);
      if (spMax !== undefined && spMax !== '') matchStage.totalSp.$lte = Number(spMax);
      if (Object.keys(matchStage.totalSp).length === 0) delete matchStage.totalSp;
    }
    if (status) {
      matchStage.status = status;
    }
    if (batch) {
      const parts = batch.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d, 23, 59, 59, 999);
        matchStage.internshipStartDate = { $gte: start, $lte: end };
      }
    }

    const pipeline = [{ $match: matchStage }];

    pipeline.push({
      $lookup: {
        from: 'attendancerecords',
        let: { studentEmail: '$email' },
        pipeline: [
          { $match: { $expr: { $eq: [ '$email', '$$studentEmail' ] } } },
          {
            $group: {
              _id: null,
              avgPct: { $avg: '$attendancePercentage' },
              totalSessions: { $sum: 1 },
              qualifiedSessions: { $sum: { $cond: [ '$qualified', 1, 0 ] } }
            }
          }
        ],
        as: 'attendanceStats'
      }
    });

    pipeline.push({
      $addFields: {
        avgAttendance: {
          $ifNull: [ { $arrayElemAt: [ '$attendanceStats.avgPct', 0 ] }, 0 ]
        }
      }
    });

    if (attendanceMin !== undefined || attendanceMax !== undefined) {
      const attMatch = {};
      if (attendanceMin !== undefined && attendanceMin !== '') attMatch.avgAttendance = { $gte: Number(attendanceMin) };
      if (attendanceMax !== undefined && attendanceMax !== '') attMatch.avgAttendance = { $lte: Number(attendanceMax) };
      if (Object.keys(attMatch).length > 0) {
        pipeline.push({ $match: attMatch });
      }
    }

    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await Student.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    pipeline.push({ $sort: { name: 1 } });
    pipeline.push({ $skip: (page - 1) * limit });
    pipeline.push({ $limit: limit });

    const students = await Student.aggregate(pipeline);

    res.json({
      students: students.map(s => ({
        _id: String(s._id),
        name: s.name,
        email: s.email,
        alternateEmail: s.alternateEmail,
        totalSp: s.totalSp,
        internshipStartDate: s.internshipStartDate,
        status: s.status,
        avgAttendance: s.avgAttendance,
        level: s.level,
        trophyLeague: s.trophyLeague
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('student search error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.get('/admin/student-activity/:studentId', adminGuard, async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const emails = [student.email];
    if (student.alternateEmail) emails.push(student.alternateEmail);
    const queryEmails = emails.map(e => e.toLowerCase());

    const [transactions, attendances, polls] = await Promise.all([
      SPTransaction.find({ email: { $in: queryEmails } }).lean(),
      AttendanceRecord.find({ email: { $in: queryEmails } }).lean(),
      PollRecord.find({ email: { $in: queryEmails } }).lean()
    ]);

    const txEvents = transactions.map(tx => {
      const isPenalty = tx.appliedDelta < 0;
      return {
        type: isPenalty ? 'sp_penalty' : 'sp_earn',
        title: isPenalty ? `SP Penalty: ${tx.category}` : `SP Credited: ${tx.category}`,
        description: tx.reason,
        timestamp: tx.dateTime || tx.createdAt,
        sp: tx.appliedDelta,
        meta: { sessionLabel: tx.sessionLabel, category: tx.category }
      };
    });

    const attEvents = attendances.map(att => ({
      type: 'attendance',
      title: `Zoom Attendance: ${att.sessionLabel}`,
      description: `Attended ${att.attendedMinutes} of ${att.totalSessionMinutes} mins (${att.attendancePercentage}%). Status: ${att.qualified ? 'Qualified' : 'Not Qualified'}.`,
      timestamp: att.createdAt,
      sp: null,
      meta: { sessionLabel: att.sessionLabel, attendedMinutes: att.attendedMinutes, totalMinutes: att.totalSessionMinutes }
    }));

    const pollEvents = polls.map(p => ({
      type: 'poll',
      title: `Poll Participation: ${p.sessionLabel}`,
      description: `Attempted ${p.attemptedQuestions} of ${p.totalQuestions} questions (Missed ${p.missedQuestions}).`,
      timestamp: p.createdAt,
      sp: null,
      meta: { sessionLabel: p.sessionLabel, attempted: p.attemptedQuestions, total: p.totalQuestions }
    }));

    const allEvents = [
      ...txEvents,
      ...attEvents,
      ...pollEvents
    ];

    allEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      student: {
        _id: String(student._id),
        name: student.name,
        email: student.email,
        alternateEmail: student.alternateEmail,
        totalSp: student.totalSp,
        level: student.level,
        trophyLeague: student.trophyLeague,
        status: student.status
      },
      timeline: allEvents
    });
  } catch (err) {
    console.error('get student activity error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// Admin Inactive Student Tracker Endpoints
// ==========================================
api.get('/admin/inactive-students', adminGuard, async (req, res) => {
  try {
    const { batch, spMin, spMax, sortBy } = req.query;

    const students = await Student.find({ status: 'active' }).lean();
    
    // Get last 3 sessions
    const last3Sessions = await Session.find().sort({ endDateTime: -1 }).limit(3).lean();
    const sessionLabels = last3Sessions.map(s => s.label);

    // Group qualified attendance for the last 3 sessions by email
    const last3Attendance = await AttendanceRecord.find({
      sessionLabel: { $in: sessionLabels }
    }).lean();
    const last3AttendanceByEmail = new Map();
    for (const att of last3Attendance) {
      if (att.qualified) {
        const email = att.email.toLowerCase();
        if (!last3AttendanceByEmail.has(email)) last3AttendanceByEmail.set(email, new Set());
        last3AttendanceByEmail.get(email).add(att.sessionLabel);
      }
    }

    // Calculate overall average attendance percentage
    const overallAttendance = await AttendanceRecord.aggregate([
      {
        $group: {
          _id: "$email",
          avgPct: { $avg: "$attendancePercentage" }
        }
      }
    ]);
    const attendanceMap = new Map(overallAttendance.map(a => [a._id.toLowerCase(), a.avgPct]));

    // Calculate latest SP transaction date for each email
    const latestTransactions = await SPTransaction.aggregate([
      { $match: { appliedDelta: { $gt: 0 } } },
      { $sort: { dateTime: -1 } },
      {
        $group: {
          _id: "$email",
          latestDate: { $first: "$dateTime" }
        }
      }
    ]);
    const latestTxMap = new Map(latestTransactions.map(t => [t._id.toLowerCase(), t.latestDate]));

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    let inactiveStudents = [];
    for (const student of students) {
      const email = student.email.toLowerCase();
      
      const qualifiedCount = last3AttendanceByEmail.get(email)?.size || 0;
      const missedLast3 = (sessionLabels.length >= 3) && (qualifiedCount === 0);

      const latestSpDate = latestTxMap.get(email);
      const noSpFor3Days = !latestSpDate || (new Date(latestSpDate) < threeDaysAgo);

      const avgAttendance = attendanceMap.get(email) ?? 0;
      const lowAttendance = avgAttendance < 75;

      if (missedLast3 || noSpFor3Days || lowAttendance) {
        // Apply batch filter if specified
        if (batch) {
          const parts = batch.split('-');
          if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            const start = new Date(y, m, d, 0, 0, 0, 0);
            const end = new Date(y, m, d, 23, 59, 59, 999);
            if (student.internshipStartDate < start || student.internshipStartDate > end) {
              continue;
            }
          }
        }

        // Apply SP Min / Max filters
        if (spMin !== undefined && spMin !== '' && student.totalSp < Number(spMin)) continue;
        if (spMax !== undefined && spMax !== '' && student.totalSp > Number(spMax)) continue;

        inactiveStudents.push({
          _id: student._id,
          name: student.name,
          email: student.email,
          totalSp: student.totalSp,
          level: student.level,
          trophyLeague: student.trophyLeague,
          internshipStartDate: student.internshipStartDate,
          reasons: {
            missedLast3,
            noSpFor3Days,
            lowAttendance
          },
          stats: {
            lastSpDate: latestSpDate || null,
            avgAttendance
          }
        });
      }
    }

    // Sorting
    if (sortBy === 'sp') {
      inactiveStudents.sort((a, b) => a.totalSp - b.totalSp);
    } else if (sortBy === 'attendance') {
      inactiveStudents.sort((a, b) => a.stats.avgAttendance - b.stats.avgAttendance);
    } else {
      // Sort by name by default
      inactiveStudents.sort((a, b) => a.name.localeCompare(b.name));
    }

    res.json(inactiveStudents);
  } catch (err) {
    console.error('get inactive students error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// Admin Bulk Notifications Endpoints
// ==========================================
api.post('/admin/bulk-notifications', adminGuard, async (req, res) => {
  try {
    const { targetGroup, targetValue, message } = req.body;
    if (!targetGroup || !targetValue || !message) {
      return res.status(400).json({ error: 'Missing targetGroup, targetValue, or message' });
    }

    let recipients = [];
    const students = await Student.find({ status: 'active' }).lean();

    if (targetGroup === 'low-sp') {
      const threshold = Number(targetValue) || 100;
      recipients = students.filter(s => s.totalSp < threshold);
    } else if (targetGroup === 'batch') {
      const parts = targetValue.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const start = new Date(y, m, d, 0, 0, 0, 0);
        const end = new Date(y, m, d, 23, 59, 59, 999);
        recipients = students.filter(s => s.internshipStartDate >= start && s.internshipStartDate <= end);
      }
    } else if (targetGroup === 'missing-sessions') {
      const count = Number(targetValue) || 3;
      const sessions = await Session.find().sort({ endDateTime: -1 }).limit(count).lean();
      const sessionLabels = sessions.map(s => s.label);
      
      const atts = await AttendanceRecord.find({ sessionLabel: { $in: sessionLabels } }).lean();
      const qualifiedByEmail = new Map();
      for (const att of atts) {
        if (att.qualified) {
          const email = att.email.toLowerCase();
          if (!qualifiedByEmail.has(email)) qualifiedByEmail.set(email, new Set());
          qualifiedByEmail.get(email).add(att.sessionLabel);
        }
      }
      
      recipients = students.filter(s => {
        const qCount = qualifiedByEmail.get(s.email.toLowerCase())?.size || 0;
        return qCount === 0 && sessions.length >= count;
      });
    }

    const newLog = {
      id: 'notif-' + Date.now(),
      timestamp: new Date().toISOString(),
      adminEmail: req.adminEmail || 'admin@spurti.in',
      targetGroup,
      targetValue,
      message,
      recipientCount: recipients.length,
      recipients: recipients.map(r => ({ name: r.name, email: r.email }))
    };

    saveBulkNotification(newLog);

    res.json({
      success: true,
      log: newLog
    });
  } catch (err) {
    console.error('bulk notifications error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.get('/admin/bulk-notifications', adminGuard, async (req, res) => {
  res.json(getBulkNotifications());
});

// ==========================================
// Admin Goal Monitoring Endpoints
// ==========================================
api.get('/admin/goals', adminGuard, async (req, res) => {
  try {
    const goals = getGoals();
    const students = await Student.find({ status: 'active' }).lean();
    const totalCount = students.length;

    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;

    const calculatedGoals = [];

    for (const goal of goals) {
      const { type, target, timeframe } = goal;
      let startTime = null;
      if (timeframe === 'today') {
        startTime = new Date(new Date(now.getTime() + istOffset).setUTCHours(0, 0, 0, 0) - istOffset);
      } else if (timeframe === 'week') {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeframe === 'month') {
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      let achievedCount = 0;
      const achievers = [];

      if (type === 'sp_earned') {
        const match = { appliedDelta: { $gt: 0 } };
        if (startTime) match.dateTime = { $gte: startTime };
        
        const txs = await SPTransaction.aggregate([
          { $match: match },
          { $group: { _id: "$email", spEarned: { $sum: "$appliedDelta" } } }
        ]);
        const spMap = new Map(txs.map(t => [t._id.toLowerCase(), t.spEarned]));

        for (const s of students) {
          const email = s.email.toLowerCase();
          const earned = spMap.get(email) || 0;
          if (earned >= target) {
            achievedCount++;
            achievers.push({ name: s.name, email: s.email, value: `${earned} SP` });
          }
        }
      } else if (type === 'attendance_sessions') {
        const match = {};
        if (startTime) match.createdAt = { $gte: startTime };

        const atts = await AttendanceRecord.aggregate([
          { $match: match },
          { $group: { _id: "$email", avgPct: { $avg: "$attendancePercentage" } } }
        ]);
        const attMap = new Map(atts.map(a => [a._id.toLowerCase(), a.avgPct]));

        for (const s of students) {
          const email = s.email.toLowerCase();
          const avgAtt = attMap.get(email) ?? 0;
          if (avgAtt >= target) {
            achievedCount++;
            achievers.push({ name: s.name, email: s.email, value: `${Math.round(avgAtt)}%` });
          }
        }
      }

      calculatedGoals.push({
        ...goal,
        achievedCount,
        totalCount,
        achievers
      });
    }

    res.json(calculatedGoals);
  } catch (err) {
    console.error('get goals error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/admin/goals', adminGuard, async (req, res) => {
  try {
    const { title, type, target, timeframe } = req.body;
    if (!title || !type || !target || !timeframe) {
      return res.status(400).json({ error: 'Missing title, type, target, or timeframe' });
    }

    const goals = getGoals();
    const newGoal = {
      id: 'goal-' + Date.now(),
      title,
      type,
      target: Number(target),
      timeframe
    };
    goals.push(newGoal);
    saveGoals(goals);

    res.json({ success: true, goal: newGoal });
  } catch (err) {
    console.error('post goals error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

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


