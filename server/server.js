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
import challengeRouter from './routes/challenges.js';
import { runSettleChallengesJob } from './jobs/settle-challenges.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');

// --- In-Memory Offline/Demo Mode Mock Database ---
global.isOfflineMode = false;
global.offlineStudents = [
  {
    _id: '64f7b60e653198e3b56a1111',
    name: 'Nitesh Verma',
    email: 'nitesh@verify.com',
    alternateEmail: 'nitesh.alt@verify.com',
    totalSp: 150,
    highestSpEver: 150,
    status: 'active',
    internshipStartDate: new Date(),
    surveyCompleted: false
  },
  {
    _id: '64f7b60e653198e3b56a2222',
    name: 'Challenger Peer',
    email: 's1@verify.com',
    alternateEmail: 's1.alt@verify.com',
    totalSp: 100,
    highestSpEver: 100,
    status: 'active',
    internshipStartDate: new Date(),
    surveyCompleted: false
  },
  {
    _id: '64f7b60e653198e3b56a3333',
    name: 'Opponent Peer',
    email: 's2@verify.com',
    alternateEmail: 's2.alt@verify.com',
    totalSp: 120,
    highestSpEver: 120,
    status: 'active',
    internshipStartDate: new Date(),
    surveyCompleted: false
  },
  {
    _id: '64f7b60e653198e3b56a4444',
    name: 'Excused Peer',
    email: 's3@verify.com',
    alternateEmail: 's3.alt@verify.com',
    totalSp: 80,
    highestSpEver: 80,
    status: 'excused',
    internshipStartDate: new Date(),
    surveyCompleted: false
  }
];
global.offlineChallenges = [];
global.offlineTransactions = [
  {
    _id: '64f7b60e653198e3b56a9991',
    email: 'nitesh@verify.com',
    category: 'initial',
    dateTime: new Date(Date.now() - 5*24*3600*1000),
    appliedDelta: 100,
    description: 'Initial Onboarding Points'
  },
  {
    _id: '64f7b60e653198e3b56a9992',
    email: 'nitesh@verify.com',
    category: 'attendance',
    dateTime: new Date(Date.now() - 2*24*3600*1000),
    appliedDelta: 50,
    description: 'Session Attendance Bonus'
  }
];
// B1-FIX: defaults are null — admin access is denied unless .env provides real values.
// Copilot review: using null prevents empty/missing headers (which evaluate to '') from matching.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ? normalizeEmail(process.env.ADMIN_EMAIL) : null;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;

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
// N7-FIX: evict stale viewer entries every 5 min to prevent unbounded Map growth.
setInterval(() => {
  const stale = Date.now() - 60_000;
  for (const [email, data] of liveViewers.entries()) {
    if (data.lastSeen.getTime() < stale) liveViewers.delete(email);
  }
}, 5 * 60 * 1000).unref?.();

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
  if (global.isOfflineMode) {
    req.vibeData = { vibeOnbPct: 90, vibeAiPct: 80, vibeMernPct: 75 };
    return 'nitesh@verify.com';
  }
  const cookies = parseCookies(req.headers.cookie || '');
  const data = await getSamagamaUser(cookies.chatengine_token);
  // Samagama's /api/auth/me nests the user as { user: { email, ... } };
  // fall back to a top-level email in case the shape ever flattens.
  const email = data?.user?.email || data?.email;
  if (!email) return null;
  // Read ViBe completion percentages from Samagama's user object if exposed.
  // These live in chatengine.users (vibeOnbPct/vibeAiPct/vibeMernPct) and may
  // be forwarded by Samagama's /api/auth/me. We read them here (read-only) so
  // Spurti never touches chatengine directly. If absent they remain null.
  req.vibeData = {
    vibeOnbPct:  data?.user?.vibeOnbPct  ?? data?.vibeOnbPct  ?? null,
    vibeAiPct:   data?.user?.vibeAiPct   ?? data?.vibeAiPct   ?? null,
    vibeMernPct: data?.user?.vibeMernPct ?? data?.vibeMernPct ?? null
  };
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
  if (global.isOfflineMode) {
    const email = student.email;
    const transactions = global.offlineTransactions.filter(t => t.email === email);
    const myRank = email === 'nitesh@verify.com' ? 1 : (email === 's2@verify.com' ? 2 : 3);
    const myGroup = leaderboardGroup(student.internshipStartDate);
    const mapRow = (row, index) => ({
      rank: index + 1,
      name: row.name,
      maskedEmail: maskEmail(row.email),
      totalSp: row.totalSp,
      level: levelFor(Math.max(Number(row.highestSpEver) || 0, Number(row.totalSp) || 0)),
      isCurrentStudent: row.email === email
    });
    const leaderboardRows = global.offlineStudents.filter(s => s.status !== 'excused').map(mapRow);
    
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
        rank: myRank,
        cohortSize: 3,
        highestSpEver: student.highestSpEver,
        level: levelFor(student.highestSpEver),
        trophyLeague: leagueBand(student.totalSp),
        legendBadgeUnlocked: legendBadge(student.highestSpEver),
        leaderboardGroup: myGroup,
        leaderboardGroupLabel: groupLabel(myGroup),
        surveyCompleted: Boolean(student.surveyCompleted)
      },
      transactions,
      polls: [],
      attendance: [],
      cohort: {
        averageSp: 123,
        top50AvgSp: 135,
        top10Cutoff: 150,
        top50Cutoff: 120,
        pointsToTop50: 0,
        pointsToNextRank: 0
      },
      leaderboard: leaderboardRows,
      groupLeaderboard: leaderboardRows
    };
  }

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
  // Top 50% avg SP: allStudents is already sorted SP DESC, so the first ceil(N/2) are the top half.
  const top50HalfCount = Math.ceil(allStudents.length / 2);
  const top50Half = allStudents.slice(0, top50HalfCount);
  const top50AvgSp = top50Half.length
    ? Math.round(top50Half.reduce((sum, s) => sum + Number(s.totalSp || 0), 0) / top50Half.length)
    : 0;
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
      top50AvgSp,
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
  const email = req.headers['x-admin-email'];
  const token = req.headers['x-admin-token'];
  // Verify configuration is set and headers are supplied (blocking unauthenticated empty headers)
  if (!ADMIN_EMAIL || !ADMIN_TOKEN || !email || !token) return false;
  return normalizeEmail(email) === ADMIN_EMAIL && String(token) === ADMIN_TOKEN;
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
  if (global.isOfflineMode) {
    const student = global.offlineStudents.find(s => s.email === email);
    if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
    const payload = await studentPayload(student);
    payload.vibeCourse = { onboarding: 90, aiFundamentals: 80, mernStack: 75 };
    return res.json({ authenticated: true, profile: payload });
  }
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
  if (student.status === 'excused') return res.json({ authenticated: true, ...excusedPayload(student) });
  const payload = await studentPayload(student);
  // Attach ViBe course percentages sourced read-only from Samagama's auth
  // response. Null values mean Samagama hasn't exposed the field yet.
  const vibeData = req.vibeData;
  payload.vibeCourse = {
    onboarding:    vibeData?.vibeOnbPct  ?? null,
    aiFundamentals: vibeData?.vibeAiPct  ?? null,
    mernStack:     vibeData?.vibeMernPct ?? null
  };
  res.json({ authenticated: true, profile: payload });
});

api.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (global.isOfflineMode) {
    if (q.length < 2) return res.json({ exact: false, matches: [] });
    if (q.includes('@')) {
      const email = normalizeEmail(q);
      const student = global.offlineStudents.find(s => s.email === email || s.alternateEmail === email);
      if (student) {
        const payload = await studentPayload(student);
        payload.vibeCourse = { onboarding: null, aiFundamentals: null, mernStack: null };
        return res.json({ exact: true, profile: payload });
      }
    }
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = global.offlineStudents.filter(s => 
      s.name.toLowerCase().includes(q.toLowerCase()) || 
      s.email.toLowerCase().includes(q.toLowerCase())
    );
    return res.json({ exact: false, matches: matches.map(publicStudent) });
  }

  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  if (q.length < 2) return res.json({ exact: false, matches: [] });
  try {
    if (q.includes('@')) {
      const email = normalizeEmail(q);
      const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
      if (student?.status === 'excused') return res.json(excusedPayload(student));
      // ViBe data is not available for search results (no auth token to forward)
      if (student) {
        const payload = await studentPayload(student);
        payload.vibeCourse = { onboarding: null, aiFundamentals: null, mernStack: null };
        return res.json({ exact: true, profile: payload });
      }
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
  } catch (err) {
    console.error('search error:', err?.message);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

api.post('/confirm', async (req, res) => {
  const { studentId, email } = req.body || {};
  const typed = normalizeEmail(email);

  if (global.isOfflineMode) {
    const student = global.offlineStudents.find(s => String(s._id) === String(studentId));
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (typed !== normalizeEmail(student.email) && typed !== normalizeEmail(student.alternateEmail)) {
      return res.status(403).json({ error: 'Email did not match this record' });
    }
    const payload = await studentPayload(student);
    payload.vibeCourse = { onboarding: null, aiFundamentals: null, mernStack: null };
    return res.json(payload);
  }

  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  try {
    const student = await Student.findById(studentId).lean();
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (typed !== normalizeEmail(student.email) && typed !== normalizeEmail(student.alternateEmail)) {
      return res.status(403).json({ error: 'Email did not match this record' });
    }
    if (student.status === 'excused') return res.json(excusedPayload(student));
    // ViBe data is not available for confirm path (no auth token to forward)
    const payload = await studentPayload(student);
    payload.vibeCourse = { onboarding: null, aiFundamentals: null, mernStack: null };
    res.json(payload);
  } catch (err) {
    console.error('confirm error:', err?.message);
    res.status(500).json({ error: 'Confirmation failed. Please try again.' });
  }
});

api.get('/leaderboard', async (req, res) => {
  if (global.isOfflineMode) {
    const mapRow = (s, i) => ({
      rank: i + 1,
      name: s.name,
      maskedEmail: maskEmail(s.email),
      totalSp: s.totalSp,
      level: levelFor(Math.max(Number(s.highestSpEver) || 0, Number(s.totalSp) || 0)),
      trophyLeague: leagueBand(s.totalSp)
    });
    const matches = global.offlineStudents.filter(s => s.status !== 'excused').map(mapRow);
    return res.json(matches);
  }

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
  
  if (global.isOfflineMode) {
    if (page === 'record' || page.startsWith('admin')) {
      liveViewers.set(normalized, { name, page, lastSeen: new Date() });
    }
    return res.json({ ok: true });
  }

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
    if (mode === 'hour') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:00`;
    if (mode === 'week') {
      const first = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil((((d - first) / 86400000) + first.getDay() + 1) / 7);
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

function last24Hours(now) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

// ── P2P Challenge routes ────────────────────────────────────────────────────
// Mounted on both path prefixes so Samagama-proxied requests work identically.
api.use('/challenges', challengeRouter);

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

  // ── P2P Challenge background jobs ──────────────────────────────────────────
  // runSettleChallengesJob → every 5 minutes (handles expiry and settlements)
  setInterval(() => runSettleChallengesJob().catch(e => console.error('[Job:settle-challenges]', e.message)), 5 * 60 * 1000).unref?.();
  console.log('P2P Challenge background jobs scheduled.');
}).catch((error) => {
  console.warn('⚠️ MongoDB connection failed. Starting server in Offline/Demo mode on port:', PORT);
  console.warn(error.message);
  app.listen(PORT, () => console.log(`Spurti app running in DEMO mode at http://localhost:${PORT}/`));
});


