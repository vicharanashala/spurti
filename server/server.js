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
import { normalizeEmail, maskEmail } from './utils/email.js';
import {
  searchQuerySchema,
  pingBodySchema,
  confirmBodySchema,
  leaderboardTypeSchema,
  validateQuery,
  validateBody
} from './utils/validators.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Survey triangulation pop-up(s). All driven by env so the form link / mode can
// change without a client rebuild (the client reads these via /api/config).
// One config per pop-up; `completedField` is the Student flag it drives, so each
// pop-up has an independent completion state. `SURVEY` is the original perception
// survey; `POLL2` is a second, identical pop-up on its own flag.
function makeSurvey(prefix, completedField) {
  return {
    key: completedField.replace(/Completed$/, ''),      // 'survey' | 'poll2'
    completedField,                                      // Student boolean flag
    completedAtField: completedField + 'At',             // Student timestamp field
    enabled: process.env[`${prefix}_ENABLED`] === '1',
    formUrl: process.env[`${prefix}_FORM_URL`] || '',          // .../viewform  (the published form)
    emailEntryId: process.env[`${prefix}_EMAIL_ENTRY`] || '',  // e.g. entry.1234567890  (pre-fills email)
    // Mandatory: 'hard' = blocking modal the student cannot dismiss until they
    // submit. No SP reward — participation is required, not incentivised.
    enforcement: process.env[`${prefix}_ENFORCEMENT`] || 'hard',
    // Auto-expiry. After this instant the modal stops showing (normal Spurti
    // resumes) with no redeploy. ISO 8601 incl. offset, e.g. 2026-06-30T23:59:59+05:30.
    deadline: process.env[`${prefix}_DEADLINE`] || '',
    webhookSecret: process.env[`${prefix}_WEBHOOK_SECRET`] || '', // shared secret for the Apps Script webhook
    // Apps Script web app that returns {emails:[...]} of actual submitters (private
    // sheet; secret-gated). Used to verify completion without trusting the client.
    responsesUrl: process.env[`${prefix}_RESPONSES_URL`] || '',
    responsesSecret: process.env[`${prefix}_RESPONSES_SECRET`] || '',
    _subs: { at: 0, set: null }                          // per-survey 60s cache
  };
}
const SURVEY = makeSurvey('SURVEY', 'surveyCompleted');
const POLL2 = makeSurvey('POLL2', 'poll2Completed');
const SURVEYS = [SURVEY, POLL2];

// Cached fetch of the submitted-email set from a survey's Apps Script endpoint.
async function getSubmittedEmails(cfg) {
  if (!cfg.responsesUrl) return null;
  if (cfg._subs.set && Date.now() - cfg._subs.at < 60000) return cfg._subs.set;   // 60s cache
  try {
    const u = cfg.responsesUrl + (cfg.responsesUrl.includes('?') ? '&' : '?') +
              'secret=' + encodeURIComponent(cfg.responsesSecret);
    const r = await fetch(u, { redirect: 'follow' });
    const j = await r.json();
    cfg._subs = { at: Date.now(), set: new Set((j.emails || []).map(e => normalizeEmail(e))) };
    return cfg._subs.set;
  } catch (err) {
    console.error(`${cfg.key} responses fetch failed:`, err?.message);
    return cfg._subs.set; // serve last good cache on failure
  }
}

// A survey is active only while enabled AND before its deadline (if set).
function surveyActive(cfg) {
  if (!cfg.enabled) return false;
  if (cfg.deadline) {
    const cutoff = Date.parse(cfg.deadline);
    if (!Number.isNaN(cutoff) && Date.now() > cutoff) return false;
  }
  return true;
}

// The env-driven public view of a survey the client needs (form + mode + gate).
function surveyPublic(cfg) {
  return {
    enabled: surveyActive(cfg),
    formUrl: cfg.formUrl,
    emailEntryId: cfg.emailEntryId,
    enforcement: cfg.enforcement,
    deadline: cfg.deadline
  };
}

const app = express();
const api = express.Router();
const liveViewers = new Map();
const LIVE_VIEWER_TTL_MS = 120_000; // 2 minutes

function cleanStaleViewers() {
  const now = Date.now();
  for (const [email, data] of liveViewers.entries()) {
    if (now - data.lastSeen > LIVE_VIEWER_TTL_MS) liveViewers.delete(email);
  }
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://samagama.in,https://www.samagama.in')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`Origin ${origin} not allowed by CORS policy`));
  },
  credentials: true
}));

import rateLimit from 'express-rate-limit';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Search rate limit exceeded.' }
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Admin endpoint rate limit exceeded.' }
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Webhook rate limit exceeded.' }
});

app.use('/api', generalLimiter);
app.use('/spurti/api', generalLimiter);
app.use(express.json({ limit: '2mb' }));

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

function buildRecovery(totalSp, transactions, attendance) {
  const RECOVERY_THRESHOLD = 80;
  const TARGET_SP = 20;

  if (totalSp >= RECOVERY_THRESHOLD) return null;

  const recentAttendance = (attendance || []).slice(-3);

  const categoryLosses = {};
  for (const rec of recentAttendance) {
    if (!rec.qualified) {
      categoryLosses['attendance'] = (categoryLosses['attendance'] || 0) + 1;
    }
  }

  for (const rec of recentAttendance) {
    if (rec.missedQuestions > 0) {
      categoryLosses['poll'] = (categoryLosses['poll'] || 0) + (rec.missedQuestions > 0 ? 1 : 0);
    }
  }

  const sortedCategories = Object.entries(categoryLosses)
    .sort(([, a], [, b]) => b - a)
    .map(([cat]) => cat);

  const taskTemplates = {
    attendance: {
      icon: '✅',
      label: 'Attend Next Session Fully',
      description: 'Be present for the full session window (9:05 IST to end) to earn +10 SP',
      category: 'attendance',
      targetSp: 10,
      action: 'Attend your next session and stay for the full duration'
    },
    poll: {
      icon: '📊',
      label: 'Answer Every Poll Question',
      description: 'Answer all poll questions in the next session to earn +10 SP',
      category: 'poll',
      targetSp: 10,
      action: 'Pay attention to every poll in your next session'
    }
  };

  const tasks = [];
  const seen = new Set();

  for (const cat of sortedCategories) {
    if (seen.has(cat)) continue;
    if (tasks.length >= 3) break;
    const template = taskTemplates[cat];
    if (template) {
      tasks.push({ ...template, status: 'active' });
      seen.add(cat);
    }
  }

  if (tasks.length === 0 && totalSp < RECOVERY_THRESHOLD) {
    tasks.push({
      icon: '📚',
      label: 'Attend Next Session',
      description: 'Attend your next session to start recovering SP',
      category: 'attendance',
      targetSp: 10,
      action: 'Be present in your next scheduled session'
    });
  }

  const earnedFromTasks = tasks.reduce((sum, t) => sum + t.targetSp, 0);

  return {
    isActive: true,
    currentSp: totalSp,
    threshold: RECOVERY_THRESHOLD,
    targetSp: TARGET_SP,
    spGap: RECOVERY_THRESHOLD - totalSp,
    progress: Math.round(Math.max(0, ((totalSp - 0) / RECOVERY_THRESHOLD) * 100)),
    tasks
  };
}

async function studentPayload(student) {
  const email = student.email;
  const activeFilter = { status: { $ne: 'excused' } };
  const myGroup = leaderboardGroup(student.internshipStartDate);

  const [transactions, polls, attendance, rankInfo, leaderboard, groupStudents, statsResult, top10CutoffResult, top50CutoffResult] = await Promise.all([
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    PollRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    AttendanceRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    rankFor(email),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).limit(50).lean(),
    myGroup
      ? Student.find({ ...activeFilter, leaderboardGroup: myGroup }).sort({ totalSp: -1, name: 1 }).limit(50).lean()
      : Promise.resolve([]),
    Student.aggregate([
      { $match: activeFilter },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSp: { $sum: { $ifNull: ['$totalSp', 0] } }
        }
      }
    ]),
    Student.find(activeFilter).sort({ totalSp: -1 }).skip(9).select('totalSp').lean(),
    Student.find(activeFilter).sort({ totalSp: -1 }).skip(49).select('totalSp').lean()
  ]);

  const stats = statsResult[0] || { count: 0, totalSp: 0 };
  const averageSp = stats.count ? Math.round(stats.totalSp / stats.count) : 0;
  const top10Cutoff = top10CutoffResult[0]?.totalSp ?? null;
  const top50Cutoff = top50CutoffResult[0]?.totalSp ?? null;

  const highestSpEver = Math.max(Number(student.highestSpEver) || 0, Number(student.totalSp) || 0);

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
      poll2Completed: Boolean(student.poll2Completed)
    },
    transactions,
    polls,
    attendance,
    cohort: {
      averageSp,
      top10Cutoff,
      top50Cutoff,
      pointsToTop50: top50Cutoff === null ? null : Math.max(0, top50Cutoff - student.totalSp + 1),
      pointsToNextRank: 0
    },
    leaderboard: leaderboard.map(mapRow),
    groupLeaderboard: groupStudents.map(mapRow),
    recovery: buildRecovery(student.totalSp, transactions, attendance)
  };
}

function isAdmin(req) {
  if (!ADMIN_EMAIL || !ADMIN_TOKEN) return false;
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
  survey: surveyPublic(SURVEY),
  poll2: surveyPublic(POLL2)
}));

api.get('/me', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ authenticated: false });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
  if (student.status === 'excused') return res.json({ authenticated: true, ...excusedPayload(student) });
  res.json({ authenticated: true, profile: await studentPayload(student) });
});

api.get('/search', searchLimiter, async (req, res) => {
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

api.post('/confirm', validateBody(confirmBodySchema), async (req, res) => {
  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  const { studentId, email } = req.validatedBody;
  const typed = normalizeEmail(email);
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

api.post('/ping', validateBody(pingBodySchema), async (req, res) => {
  const { email, name, page } = req.validatedBody;
  const normalized = normalizeEmail(email);
  try {
    await SessionEvent.create({ email: normalized, name, event: 'page_view', page });
  } catch (err) {
    if (err?.name !== 'ValidationError') console.error('ping log failed:', err?.message);
  }
  if (page === 'record' || page.startsWith('admin')) {
    cleanStaleViewers();
    liveViewers.set(normalized, { name, page, lastSeen: Date.now() });
  }
  res.json({ ok: true });
});

// --- Survey triangulation (mandatory perception follow-up) ---------------
// Mark a student's survey as completed for the given survey config. Idempotent;
// matches on primary or alternate email. No SP is awarded — mandatory, not rewarded.
async function markSurveyComplete(email, cfg) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const student = await Student.findOne({ $or: [{ email: normalized }, { alternateEmail: normalized }] });
  if (!student) return null;
  if (!student[cfg.completedField]) {
    student[cfg.completedField] = true;
    student[cfg.completedAtField] = new Date();
    await student.save();
  }
  return student;
}

// NOTE: there is deliberately NO client-callable "mark complete" endpoint. The
// flag is set ONLY by a real Google submission (the webhook below) or the
// server-side sheet sync, so the modal cannot be dismissed by trust. The client
// can only READ status via <base>/status and dismiss when it returns completed.
//
// Registers /<base>/status + /<base>/webhook for one survey config, so the
// original survey and poll2 share identical, independent route logic.
function registerSurveyRoutes(base, cfg) {
  // Completion check the modal polls and verifies on the "I've submitted" button.
  // Session-authenticated; reflects only server-set (webhook/sync) completion.
  api.get(`${base}/status`, async (req, res) => {
    const email = await studentEmailFromRequest(req);
    if (!email) return res.json({ completed: false });
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
    if (student?.[cfg.completedField]) return res.json({ completed: true });
    // On-demand verification against the responses sheet (so the "I've submitted"
    // button confirms a genuine submission without waiting for the 10-min cron).
    const subs = await getSubmittedEmails(cfg);
    if (subs && student) {
      const e = normalizeEmail(student.email), a = normalizeEmail(student.alternateEmail);
      if (subs.has(e) || (a && subs.has(a))) {
        await markSurveyComplete(student.email, cfg);
        return res.json({ completed: true });
      }
    }
    res.json({ completed: false });
  });

<  // Authoritative confirmation: the Google Form's Apps Script onFormSubmit
  // trigger POSTs { email, secret } here. Secret-authenticated, not session.
  // webhookLimiter (from PR #6's security commit) protects against abuse
  // from a misbehaving Apps Script.
  api.post(`${base}/webhook`, webhookLimiter, async (req, res) => {
    if (!cfg.webhookSecret || String(req.body?.secret || '') !== cfg.webhookSecret) {
      return res.status(403).json({ ok: false, error: 'forbidden' });
    }
    const student = await markSurveyComplete(req.body?.email, cfg);
    if (!student) return res.status(404).json({ ok: false, error: 'no match', email: normalizeEmail(req.body?.email) });
    res.json({ ok: true, email: student.email });
  });
}
registerSurveyRoutes('/survey', SURVEY);
registerSurveyRoutes('/poll2', POLL2);

api.get('/admin/stats', adminLimiter, adminGuard, async (_req, res) => {
  const [yetToOnboard, excusedStudents, sessions, txns, activeStudents] = await Promise.all([
    Student.countDocuments({ status: 'yet to onboard' }),
    Student.countDocuments({ status: 'excused' }),
    Session.find().sort({ endDateTime: 1 }).lean(),
    SPTransaction.countDocuments(),
    Student.countDocuments({ status: 'active' })
  ]);
  res.json({ yetToOnboard, excusedStudents, activeStudents, sessions, transactions: txns });
});
api.get('/admin/students-by-status', adminLimiter, adminGuard, async (req, res) => {
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


api.get('/admin/leaderboard', adminLimiter, adminGuard, async (req, res) => {
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

api.get('/admin/attendance', adminLimiter, adminGuard, async (_req, res) => {
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

api.get('/admin/student/:id', adminLimiter, adminGuard, async (req, res) => {
  const student = await Student.findById(req.params.id).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await studentPayload(student));
});

api.get('/admin/active', adminLimiter, adminGuard, (_req, res) => {
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

api.get('/admin/integrity-check', adminLimiter, adminGuard, async (_req, res) => {
  const issues = await SPTransaction.aggregate([
    {
      $group: {
        _id: '$email',
        computedBalance: { $sum: '$appliedDelta' },
        transactions: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: 'email',
        pipeline: [{ $project: { email: 1, totalSp: 1, name: 1 } }],
        as: 'student'
      }
    },
    { $unwind: { path: '$student', preserveNullAndEmpty: false } },
    {
      $match: {
        $expr: { $ne: ['$computedBalance', '$student.totalSp'] }
      }
    },
    {
      $project: {
        _id: 0,
        email: '$_id',
        name: '$student.name',
        storedTotalSp: '$student.totalSp',
        computedBalance: 1,
        discrepancy: { $subtract: ['$student.totalSp', '$computedBalance'] },
        transactions: 1
      }
    },
    { $sort: { discrepancy: -1 } }
  ]);

  const negativeSp = await Student.find({ totalSp: { $lt: 0 } })
    .select('email name totalSp')
    .lean();

  const deltaModeIssues = await SPTransaction.countDocuments({ deltaMode: 'percent' });

  res.json({
    clean: issues.length === 0 && negativeSp.length === 0,
    checkedAt: new Date().toISOString(),
    summary: {
      totalIssues: issues.length,
      studentsWithNegativeSp: negativeSp.length,
      deltaModeIssues,
      totalStudentsChecked: (await Student.countDocuments({ status: 'active' }))
    },
    balanceDiscrepancies: issues,
    negativeSpStudents: negativeSp,
    deltaModeFixNeeded: deltaModeIssues > 0
      ? `Run: db.sptransactions.updateMany({deltaMode:'percent'},{$set:{deltaMode:'percentage'}})`
      : null
  });
});

api.get('/admin/analytics', adminLimiter, adminGuard, async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

  const [
    statusCountsRaw,
    spStats,
    spMedianResult,
    sessions,
    attendanceBySession,
    categoryTotals,
    topDropsRaw,
    topGainersRaw,
    todayTopGainersRaw,
    activeNow,
    lastHourUnique,
    todayUniqueEmails,
    yesterdayUnique,
    last7dUnique,
    last30dUnique,
    hourlySeries,
    weeklySeries,
    monthlySeries
  ] = await Promise.all([
    Student.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Student.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalSp: { $sum: { $ifNull: ['$totalSp', 0] } },
          min: { $min: { $ifNull: ['$totalSp', 0] } },
          max: { $max: { $ifNull: ['$totalSp', 0] } },
          below100: { $sum: { $cond: [{ $lt: [{ $ifNull: ['$totalSp', 0] }, 100] }, 1, 0] } },
          from100to149: { $sum: { $cond: [{ $and: [{ $gte: [{ $ifNull: ['$totalSp', 0] }, 0] }, { $lt: [{ $ifNull: ['$totalSp', 0] }, 150] }] }, 1, 0] } },
          from150to199: { $sum: { $cond: [{ $and: [{ $gte: [{ $ifNull: ['$totalSp', 0] }, 150] }, { $lt: [{ $ifNull: ['$totalSp', 0] }, 200] }] }, 1, 0] } },
          from200plus: { $sum: { $cond: [{ $gte: [{ $ifNull: ['$totalSp', 0] }, 200] }, 1, 0] } }
        }
      }
    ]),
    Student.aggregate([
      { $match: { status: 'active' } },
      { $setWindowFields: { output: { $percentile: [{ input: '$totalSp', p: [0.5] }] } } }
    ]),
    Session.find().sort({ endDateTime: 1 }).lean(),
    AttendanceRecord.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'email',
          foreignField: 'email',
          pipeline: [{ $match: { status: 'active' } }, { $project: { _id: 1 } }],
          as: 'student'
        }
      },
      { $match: { 'student._id': { $ne: null } } },
      {
        $group: {
          _id: '$sessionLabel',
          totalStudents: { $sum: 1 },
          qualified: { $sum: { $cond: ['$qualified', 1, 0] } },
          totalMinutes: { $sum: { $ifNull: ['$attendedMinutes', 0] } }
        }
      }
    ]),
    SPTransaction.aggregate([
      {
        $lookup: {
          from: 'students',
          localField: 'email',
          foreignField: 'email',
          pipeline: [{ $match: { status: 'active' } }, { $project: { _id: 1 } }],
          as: 'student'
        }
      },
      { $match: { 'student._id': { $ne: null } } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          netSp: { $sum: '$appliedDelta' },
          credits: { $sum: { $cond: [{ $gt: ['$appliedDelta', 0] }, 1, 0] } },
          debits: { $sum: { $cond: [{ $lt: ['$appliedDelta', 0] }, 1, 0] } }
        }
      }
    ]),
    SPTransaction.aggregate([
      { $match: { category: { $in: ['attendance', 'poll'] }, appliedDelta: { $lt: 0 } } },
      {
        $lookup: {
          from: 'students',
          localField: 'email',
          foreignField: 'email',
          pipeline: [{ $match: { status: 'active' } }, { $project: { _id: 1, name: 1 } }],
          as: 'student'
        }
      },
      { $match: { 'student._id': { $ne: null } } },
      {
        $group: {
          _id: '$email',
          debitCount: { $sum: 1 },
          debitSp: { $sum: { $abs: '$appliedDelta' } }
        }
      },
      { $sort: { debitSp: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'email',
          pipeline: [{ $project: { name: 1 } }],
          as: 'student'
        }
      },
      { $unwind: '$student' },
      { $project: { _id: 0, email: '$_id', name: '$student.name', debitCount: 1, debitSp: 1 } }
    ]),
    SPTransaction.aggregate([
      { $match: { createdAt: { $gte: last7Days }, appliedDelta: { $gt: 0 } } },
      {
        $lookup: {
          from: 'students',
          localField: 'email',
          foreignField: 'email',
          pipeline: [{ $match: { status: 'active' } }, { $project: { name: 1 } }],
          as: 'student'
        }
      },
      { $match: { 'student._id': { $ne: null } } },
      { $group: { _id: '$email', gainedSp: { $sum: '$appliedDelta' } } },
      { $sort: { gainedSp: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'email',
          pipeline: [{ $project: { name: 1 } }],
          as: 'student'
        }
      },
      { $unwind: '$student' },
      { $project: { _id: 0, email: '$_id', name: '$student.name', gainedSp: 1 } }
    ]),
    SPTransaction.aggregate([
      { $match: { createdAt: { $gte: last24h }, appliedDelta: { $gt: 0 } } },
      {
        $lookup: {
          from: 'students',
          localField: 'email',
          foreignField: 'email',
          pipeline: [{ $match: { status: 'active' } }, { $project: { name: 1 } }],
          as: 'student'
        }
      },
      { $match: { 'student._id': { $ne: null } } },
      { $group: { _id: '$email', gainedSp: { $sum: '$appliedDelta' } } },
      { $sort: { gainedSp: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: 'email',
          pipeline: [{ $project: { name: 1 } }],
          as: 'student'
        }
      },
      { $unwind: '$student' },
      { $project: { _id: 0, email: '$_id', name: '$student.name', gainedSp: 1 } }
    ]),
    Promise.resolve([...liveViewers.values()].filter(v => now.getTime() - v.lastSeen.getTime() <= 60_000).length),
    SessionEvent.distinct('email', { timestamp: { $gte: lastHour } }),
    SessionEvent.distinct('email', { timestamp: { $gte: todayStart, $lt: todayEnd } }),
    SessionEvent.distinct('email', { timestamp: { $gte: yesterdayStart, $lt: todayStart } }),
    SessionEvent.distinct('email', { timestamp: { $gte: last7Days } }),
    SessionEvent.distinct('email', { timestamp: { $gte: last30Days } }),
    SessionEvent.aggregate([
      { $match: { timestamp: { $gte: last24h } } },
      {
        $group: {
          _id: {
            hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$timestamp' } },
            email: '$email'
          },
          emailCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.hour',
          uniqueUsers: { $sum: 1 },
          events: { $sum: '$emailCount' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, label: '$_id', uniqueUsers: 1, events: 1 } }
    ]),
    SessionEvent.aggregate([
      { $match: { timestamp: { $gte: last30Days } } },
      {
        $group: {
          _id: {
            week: { $dateToString: { format: '%Y-W%V', date: '$timestamp' } },
            email: '$email'
          },
          emailCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.week',
          uniqueUsers: { $sum: 1 },
          events: { $sum: '$emailCount' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, label: '$_id', uniqueUsers: 1, events: 1 } }
    ]),
    SessionEvent.aggregate([
      { $match: { timestamp: { $gte: last30Days } } },
      {
        $group: {
          _id: {
            month: { $dateToString: { format: '%Y-%m', date: '$timestamp' } },
            email: '$email'
          },
          emailCount: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.month',
          uniqueUsers: { $sum: 1 },
          events: { $sum: '$emailCount' }
        }
      },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, label: '$_id', uniqueUsers: 1, events: 1 } }
    ])
  ]);

  const statusCounts = { active: 0, 'yet to onboard': 0, excused: 0 };
  for (const r of statusCountsRaw) {
    if (r._id in statusCounts) statusCounts[r._id] = r.count;
  }

  const sp = spStats[0] || { count: 0, totalSp: 0, min: 0, max: 0, below100: 0, from100to149: 0, from150to199: 0, from200plus: 0 };
  const activeCount = sp.count;
  const avgSp = activeCount ? Math.round(sp.totalSp / activeCount) : 0;
  const medianSp = spMedianResult[0]?.percentile?.[0] ?? 0;
  const inactiveToday = activeCount - todayUniqueEmails.length;

  const sessionMap = new Map(attendanceBySession.map(r => [r._id, r]));
  const catMap = new Map(categoryTotals.map(r => [r._id, r]));
  const overallQualified = attendanceBySession.reduce((sum, r) => sum + r.qualified, 0);
  const overallTotal = attendanceBySession.reduce((sum, r) => sum + r.totalStudents, 0);

  const categoryTotalsResult = ['initial', 'attendance', 'poll', 'manual'].map(cat => {
    const r = catMap.get(cat) || { count: 0, netSp: 0, credits: 0, debits: 0 };
    return { category: cat, count: r.count, netSp: r.netSp, credits: r.credits, debits: r.debits };
  });

  const attendanceBySessionResult = sessions.map(session => {
    const r = sessionMap.get(session.label) || { totalStudents: 0, qualified: 0, totalMinutes: 0 };
    return {
      label: session.label,
      totalStudents: r.totalStudents,
      qualified: r.qualified,
      notQualified: r.totalStudents - r.qualified,
      qualifiedPct: r.totalStudents ? Math.round((r.qualified / r.totalStudents) * 100) : 0,
      avgMinutes: r.totalStudents ? Math.round(r.totalMinutes / r.totalStudents) : 0,
      sessionMinutes: session.totalMinutes
    };
  });

  const attDebits = categoryTotals.find(c => c._id === 'attendance')?.debits || 0;
  const pollDebits = categoryTotals.find(c => c._id === 'poll')?.debits || 0;

  const topGainersFormatted = topGainersRaw.map(g => ({ email: g.email, name: g.name, gainedSp: g.gainedSp }));
  const todayTopGainersFormatted = todayTopGainersRaw.map(g => ({ email: g.email, name: g.name, gainedSp: g.gainedSp }));

  const trends = {
    activeTodayDelta: yesterdayUnique.length > 0 ? Math.round(((todayUniqueEmails.length - yesterdayUnique.length) / yesterdayUnique.length) * 100) : 0,
    activeLast7dDelta: last7dUnique.length,
    qualifiedPct: overallTotal ? Math.round((overallQualified / overallTotal) * 100) : 0,
    avgSpDelta: 0,
    inactiveToday,
    activeNow
  };

  const spBandsDetailed = [
    { band: '0-49', label: '0–49', color: '#ef4444' },
    { band: '50-99', label: '50–99', color: '#f97316' },
    { band: '100-149', label: '100–149', color: '#eab308' },
    { band: '150-199', label: '150–199', color: '#22c55e' },
    { band: '200-249', label: '200–249', color: '#10b981' },
    { band: '250-299', label: '250–299', color: '#06b6d4' },
    { band: '300-399', label: '300–399', color: '#3b82f6' },
    { band: '400-499', label: '400–499', color: '#6366f1' },
    { band: '500-799', label: '500–799', color: '#8b5cf6' },
    { band: '800+', label: '800+', color: '#a855f7' }
  ];

  res.json({
    live: { activeNow },
    users: {
      activeLastHour: lastHourUnique.length,
      activeToday: todayUniqueEmails.length,
      activeYesterday: yesterdayUnique.length,
      activeLast7Days: last7dUnique.length,
      activeLast30Days: last30dUnique.length,
      hourly: hourlySeries,
      weekly: weeklySeries,
      monthly: monthlySeries
    },
    attendance: {
      sessions: attendanceBySessionResult,
      overallQualifiedPct: overallTotal ? Math.round((overallQualified / overallTotal) * 100) : 0
    },
    sp: {
      students: activeCount,
      statusCounts,
      average: avgSp,
      median: medianSp,
      min: sp.min,
      max: sp.max,
      bands: {
        below100: sp.below100,
        from100to149: sp.from100to149,
        from150to199: sp.from150to199,
        from200plus: sp.from200plus
      },
      bandsDetailed: spBandsDetailed,
      categoryTotals: categoryTotalsResult
    },
    alerts: {
      lowSp: sp.below100,
      inactiveToday,
      attendanceDebits: attDebits,
      pollDebits: pollDebits,
      topDrops: topDropsRaw,
      topGainers: topGainersFormatted,
      todayTopGainers: todayTopGainersFormatted
    },
    trends,
    meta: {
      fetchedAt: new Date().toISOString()
    }
  });
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


