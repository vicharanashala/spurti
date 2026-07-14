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
import SeasonStanding from './models/SeasonStanding.js';
import SeasonReward from './models/SeasonReward.js';
import {
  getActiveSeason, getStudentSeasonContext,
  seasonLeaderboard, claimReward,
  recomputeStanding, recomputeAllStandings,
  invalidateSeasonCache
} from './services/seasonService.js';
import { SESSION_SECRET } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';

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

app.use(cors());
app.use(express.json({ limit: '2mb' }));
// Catch corrupt / non-JSON bodies so one bad webhook doesn't crash the server
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    console.error('[JSON parse error]', err.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  return _next(err);
});

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

// Signed-cookie helpers for the search-login flow.
// /api/confirm issues `spurti_session` after the student proves email ownership,
// and studentEmailFromRequest accepts it as a fallback when the Samagama
// chatengine_token cookie is not present.
import crypto from 'crypto';

function signSessionCookie(email) {
  const value = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex').slice(0, 32);
  return `${value}.${sig}`;
}

function verifySessionCookie(signed) {
  if (!signed) return null;
  const dotIndex = signed.lastIndexOf('.');
  if (dotIndex < 1) return null;
  const email = signed.slice(0, dotIndex);
  const sig = signed.slice(dotIndex + 1);
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(email).digest('hex').slice(0, 32);
  // Constant-time comparison
  if (sig.length !== expected.length) return null;
  let mismatch = 0;
  for (let i = 0; i < sig.length; i++) mismatch |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0 ? email : null;
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
  // Path 1: Samagama SSO cookie (real production login)
  const data = await getSamagamaUser(cookies.chatengine_token);
  const samagamaEmail = data?.user?.email || data?.email;
  if (samagamaEmail) return normalizeEmail(samagamaEmail);
  // Path 2: signed local session cookie (search-login flow)
  const signed = verifySessionCookie(cookies.spurti_session);
  if (signed) return normalizeEmail(signed);
  return null;
}

// Samagama-only auth — used by /api/me so refresh always lands on the Landing
// page when the student hasn't completed the real SSO flow. The search-login
// `spurti_session` cookie is intentionally NOT accepted here; it is only used
// by post-login action endpoints (e.g. reward claim) that run after a fresh
// /api/confirm or /api/search exact-match login in the same session.
async function samagamaEmailFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const data = await getSamagamaUser(cookies.chatengine_token);
  const samagamaEmail = data?.user?.email || data?.email;
  return samagamaEmail ? normalizeEmail(samagamaEmail) : null;
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

// Temp debug route to test season context with a hardcoded student email
api.get('/config', (_req, res) => res.json({
  allowStudentSearch: ALLOW_STUDENT_SEARCH,
  survey: surveyPublic(SURVEY),
  poll2: surveyPublic(POLL2)
}));

api.get('/me', async (req, res) => {
  const email = await samagamaEmailFromRequest(req);
  if (!email) return res.status(401).json({ authenticated: false });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
  if (student.status === 'excused') return res.json({ authenticated: true, ...excusedPayload(student) });
  const seasonContext = await getStudentSeasonContext(email);
  const response = { authenticated: true, profile: await studentPayload(student), season: seasonContext };
  res.json(response);
});

api.get('/search', async (req, res) => {
  if (!ALLOW_STUDENT_SEARCH) return res.status(403).json({ error: 'Student search is disabled. Please login from Samagama to view your Spurti Points.' });
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ exact: false, matches: [] });

  if (q.includes('@')) {
    const email = normalizeEmail(q);
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
    if (student?.status === 'excused') return res.json(excusedPayload(student));
    if (student) {
      const seasonContext = await getStudentSeasonContext(student.email);
      res.setHeader('Set-Cookie', `spurti_session=${encodeURIComponent(signSessionCookie(student.email))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
      return res.json({ exact: true, profile: await studentPayload(student), season: seasonContext });
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
  // Issue a signed local session cookie so subsequent authenticated calls
  // (e.g. /api/seasons/rewards/:id/claim) can identify the student without
  // needing a Samagama cookie.
  res.setHeader('Set-Cookie', `spurti_session=${encodeURIComponent(signSessionCookie(student.email))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  const seasonContext = await getStudentSeasonContext(student.email);
  res.json({ authenticated: true, profile: await studentPayload(student), season: seasonContext });
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

  // Authoritative confirmation: the Google Form's Apps Script onFormSubmit
  // trigger POSTs { email, secret } here. Secret-authenticated, not session.
  api.post(`${base}/webhook`, async (req, res) => {
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

// ─── Season routes ────────────────────────────────────────────────────────

// GET /api/seasons/current — active season + authenticated student's standing
api.get('/seasons/current', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });

  const { season, standing, rewards, eligibleRewards, myRank, cohortSize } =
    await getStudentSeasonContext(email);

  if (!season) {
    return res.json({ active: false, message: 'No active season' });
  }

  // Timeline: how far through the season are we?
  const now        = Date.now();
  const startMs    = new Date(season.startDate).getTime();
  const endMs      = new Date(season.endDate).getTime();
  const totalMs    = endMs - startMs;
  const elapsedMs  = Math.max(0, Math.min(now - startMs, totalMs));
  const pct        = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;

  res.json({
    active:    true,
    season: {
      _id:          String(season._id),
      name:         season.name,
      number:       season.number ?? null,
      startDate:    season.startDate,
      endDate:      season.endDate,
      status:       season.status,
      themeColor:   season.themeColor || '#176b87',
      description:  season.description || '',
    },
    standing: standing ? {
      earnedSp:           standing.earnedSp,
      baselineSp:         standing.baselineSp,
      peakLeague:         standing.peakLeague,
      qualifiedSessions:  standing.qualifiedSessions ?? 0,
      claimedRewards:     standing.claimedRewards || [],
    } : null,
    rewards: rewards.map(r => ({
      _id:         String(r._id),
      key:         r.key,
      label:       r.label,
      description: r.description || '',
      goalType:    r.goalType,
      goalValue:   r.goalValue,
      icon:        r.icon || '🏆',
      claimed:     standing?.claimedRewards?.includes(r.key) ?? false,
      eligible:    eligibleRewards.includes(r.key),
    })),
    progress: { pct, startDate: season.startDate, endDate: season.endDate, now },
    rank: myRank,
    cohortSize,
  });
});

// GET /api/seasons/leaderboard?limit=50 — season-scoped leaderboard
api.get('/seasons/leaderboard', async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const season = await getActiveSeason();
  if (!season) return res.json({ rows: [], myRank: null, cohortSize: 0 });
  const email = await studentEmailFromRequest(req);
  const { rows, myRank, cohortSize } = await seasonLeaderboard(season._id, { limit, email });
  res.json({ rows, myRank, cohortSize });
});

// POST /api/seasons/rewards/:rewardId/claim — claim a milestone reward
api.post('/seasons/rewards/:rewardId/claim', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ error: 'Not authenticated' });
  const result = await claimReward(email, req.params.rewardId);
  if (result.error) return res.status(400).json(result);
  res.json(result);
});

// Admin: list all seasons
api.get('/admin/seasons', adminGuard, async (_req, res) => {
  const seasons = await Season.find().sort({ startDate: -1 }).lean();
  res.json(seasons.map(s => ({
    _id:         String(s._id),
    name:        s.name,
    number:      s.number ?? null,
    startDate:   s.startDate,
    endDate:     s.endDate,
    status:      s.status,
    themeColor:  s.themeColor,
    description: s.description,
  })));
});

// Admin: create a new season
api.post('/admin/seasons', adminGuard, async (req, res) => {
  const { name, startDate, endDate, themeColor, number, description } = req.body || {};
  if (!name || !startDate || !endDate) {
    return res.status(400).json({ error: 'name, startDate, endDate are required' });
  }
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end <= start) return res.status(400).json({ error: 'endDate must be after startDate' });
  const season = await Season.create({ name, startDate: start, endDate: end,
    themeColor: themeColor || '#176b87', number: number || null, description: description || '' });
  invalidateSeasonCache();
  res.json({ _id: String(season._id), name: season.name, startDate: season.startDate,
    endDate: season.endDate, status: season.status, themeColor: season.themeColor });
});

// Admin: update a season
api.patch('/admin/seasons/:id', adminGuard, async (req, res) => {
  const allowed = ['name', 'startDate', 'endDate', 'themeColor', 'number', 'description'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  if (updates.startDate) updates.startDate = new Date(updates.startDate);
  if (updates.endDate)   updates.endDate   = new Date(updates.endDate);
  if (updates.startDate && updates.endDate && updates.endDate <= updates.startDate) {
    return res.status(400).json({ error: 'endDate must be after startDate' });
  }
  const season = await Season.findByIdAndUpdate(req.params.id, updates, { new: true }).lean();
  if (!season) return res.status(404).json({ error: 'Season not found' });
  invalidateSeasonCache();
  res.json({ _id: String(season._id), name: season.name, startDate: season.startDate,
    endDate: season.endDate, status: season.status, themeColor: season.themeColor });
});

// Admin: recompute standings for a season
api.post('/admin/seasons/:id/recompute', adminGuard, async (req, res) => {
  const result = await recomputeAllStandings(req.params.id);
  res.json(result);
});

// Admin: claim stats for a season — per-reward claim counts + per-student claim list
api.get('/admin/seasons/:id/claims', adminGuard, async (req, res) => {
  const seasonId = req.params.id;
  const [rewards, standings] = await Promise.all([
    SeasonReward.find({ seasonId }).sort({ order: 1 }).lean(),
    SeasonStanding.find({ seasonId, claimedRewards: { $exists: true, $not: { $size: 0 } } })
      .select({ email: 1, name: 1, earnedSp: 1, claimedRewards: 1 })
      .lean()
  ]);

  // Per-reward claim counts
  const byReward = rewards.map(r => {
    const count = standings.filter(s => (s.claimedRewards || []).includes(r.key)).length;
    return {
      key: r.key,
      label: r.label,
      icon: r.icon,
      spBonus: r.spBonus || 0,
      claimCount: count,
    };
  });

  // Per-student claim rollup
  const students = standings.map(s => ({
    email: s.email,
    name: s.name,
    earnedSp: s.earnedSp,
    claimed: s.claimedRewards || []
  }));

  // Sort students by most-claimed first
  students.sort((a, b) => b.claimed.length - a.claimed.length);

  res.json({
    cohortSize: await SeasonStanding.countDocuments({ seasonId }),
    claimsByReward: byReward,
    studentsWithClaims: students
  });
});

// Admin: add rewards to a season
api.post('/admin/seasons/:id/rewards', adminGuard, async (req, res) => {
  const { rewards } = req.body || {};
  if (!Array.isArray(rewards) || !rewards.length) {
    return res.status(400).json({ error: 'rewards array required' });
  }
  const docs = rewards.map(r => ({
    seasonId:    req.params.id,
    key:         r.key,
    label:       r.label,
    description: r.description || '',
    goalType:    r.goalType,
    goalValue:   r.goalValue,
    order:       r.order ?? 0,
    icon:        r.icon || '🏆',
    spBonus:     Number(r.spBonus || 0),
  }));
  const created = await SeasonReward.insertMany(docs);
  res.json(created.map(r => ({ _id: String(r._id), key: r.key, label: r.label })));
});

// Admin: list rewards for a season
api.get('/admin/seasons/:id/rewards', adminGuard, async (req, res) => {
  const rewards = await SeasonReward.find({ seasonId: req.params.id }).sort({ order: 1 }).lean();
  res.json(rewards);
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


