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
import LeaderboardSnapshot from './models/LeaderboardSnapshot.js';
import Achievement from './models/Achievement.js';
import ShareEvent from './models/ShareEvent.js';
import AchievementView, { isBot, uaFamilyOf, viewerDayHash } from './models/AchievementView.js';
import BoardReign from './models/BoardReign.js';
import Announcement from './models/Announcement.js';
import AnnouncementAck from './models/AnnouncementAck.js';
import JourneyPlan from './models/JourneyPlan.js';
import E2CardEvent from './models/E2CardEvent.js';
import { buildAchievementState, verifyAchievement } from './services/achievements.js';
import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from './services/levels.js';
import Commitment from './models/Commitment.js';
import { isVibeEligible, buildVibeState, validateBet, settleBetDemo, applySpDelta, courseByKey } from './services/vibe.js';
import { buildStandupState, placeStandup, settleStandupDemo } from './services/standup.js';
import { buildJourneyState, saveJourneyPlan } from './services/journey.js';
import { buildSpaState } from './services/spa.js';
import { buildTrajectoryState } from './services/trajectory.js';
import { wrapRouter } from './lib/asyncRoutes.js';
import { TtlCache } from './lib/ttlCache.js';
import { BatchBuffer } from './lib/batchBuffer.js';
import { rateLimit } from './lib/rateLimit.js';
import { safeEqual } from './lib/safeEqual.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');
// Saved achievement cards live outside the repo tree's tracked files; they are
// regenerable, so losing them only costs the next share's og:image.
const CARD_DIR = process.env.CARD_DIR || path.join(rootDir, 'server', 'data', 'cards');

// Absolute origin for og: tags. PUBLIC_BASE_URL wins; otherwise trust the proxy
// headers nginx sets, since the app itself only ever sees http on a local port.
function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return String(process.env.PUBLIC_BASE_URL).replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  return `${String(proto).split(',')[0]}://${req.get('host')}`;
}
// Achievements ship dark: the tab is off for the cohort until ACHIEVEMENTS_ENABLED
// flips, while ACHIEVEMENTS_EMAILS lets named accounts preview it on the live site
// against real data. Sharing is a SEPARATE switch, so the tab can be visible with
// the Share/Download buttons still off (or pulled back later without a redeploy).
//   ACHIEVEMENTS_ENABLED=1
//   ACHIEVEMENTS_EMAILS=someone@example.com,other@example.com
//   ACHIEVEMENTS_SHARING=1
const ACH_ENABLED = process.env.ACHIEVEMENTS_ENABLED === '1';
const ACH_EMAILS = new Set(
  String(process.env.ACHIEVEMENTS_EMAILS || '').split(',').map(normalizeEmail).filter(Boolean)
);
const ACH_SHARING = process.env.ACHIEVEMENTS_SHARING === '1';

// A student sees the tab if the feature is on for everyone, or if either of their
// addresses is on the preview list. Sharing additionally needs its own switch —
// never the other way round, so there is no share button on a hidden tab.
function achievementsAccess(student) {
  const visible = ACH_ENABLED
    || ACH_EMAILS.has(normalizeEmail(student?.email || ''))
    || ACH_EMAILS.has(normalizeEmail(student?.alternateEmail || ''));
  return { visible, sharing: visible && ACH_SHARING };
}

// Admin auth is env-only — NO hardcoded fallback. A committed default would be a
// public credential (anyone reading the repo could authenticate). If either is
// unset, admin endpoints fail closed (see isAdmin) rather than accept a known value.
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (!ADMIN_EMAIL || !ADMIN_TOKEN) {
  console.warn('[security] ADMIN_EMAIL/ADMIN_TOKEN not set — admin endpoints are DISABLED until both are configured in .env');
}

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
const POLL3 = makeSurvey('POLL3', 'poll3Completed');
const SURVEYS = [SURVEY, POLL2, POLL3];

// Cached fetch of the submitted-email set from a survey's Apps Script endpoint.
async function getSubmittedEmails(cfg) {
  if (!cfg.responsesUrl) return null;
  if (cfg._subs.set && Date.now() - cfg._subs.at < 60000) return cfg._subs.set;   // 60s cache
  try {
    const u = cfg.responsesUrl + (cfg.responsesUrl.includes('?') ? '&' : '?') +
              'secret=' + encodeURIComponent(cfg.responsesSecret);
    const r = await fetch(u, { redirect: 'follow' });
    // Apps Script intermittently serves an HTML error/redirect page (esp. under
    // load) instead of JSON; parse defensively so it fails cleanly instead of
    // throwing an opaque "Unexpected token '<'".
    const body = await r.text();
    let j;
    try { j = JSON.parse(body); }
    catch { throw new Error(`non-JSON response (HTTP ${r.status}, ${body.length}B)`); }
    cfg._subs = { at: Date.now(), set: new Set((j.emails || []).map(e => normalizeEmail(e))) };
    return cfg._subs.set;
  } catch (err) {
    cfg._subs.at = Date.now(); // back off 60s on failure too — don't hammer Apps Script / spam logs
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
// One proxy hop (nginx) sits in front, so without this every request looks like
// it came from 127.0.0.1 and `req.ip` is the proxy rather than the visitor. The
// only thing that reads it is the verify-page viewer hash, which was therefore
// counting browser families instead of people. If the proxy ever stops setting
// X-Forwarded-For this falls back to the socket address, i.e. to today's
// behaviour — it cannot make things worse.
app.set('trust proxy', 1);
const api = express.Router();
// Every handler below may be async; without this a rejected promise leaves the
// request hanging and can crash the process (Express 4 does not catch it).
wrapRouter(api);
const liveViewers = new Map();
const LIVE_VIEWER_WINDOW_MS = 150_000;   // pings arrive every ~60s, so allow two missed beats
const LIVE_VIEWERS_MAX = 100_000;
// The verify page and its API are public (no login). Generous, because a shared
// campus address may sit behind many real visitors; this only stops one client
// from hammering the database.
const verifyLimit = rateLimit({ windowMs: 60_000, max: 600 });

app.use(cors());
// Only the card upload carries a large body (a PNG data URL). Everything else is a
// few hundred bytes, so a small default limit keeps a bad client from making the
// server buffer megabytes per request. The specific parser must come first: once
// a body is parsed the global one skips it.
const cardJson = express.json({ limit: '2mb' });
app.post(['/api/share/card', '/spurti/api/share/card'], cardJson);
app.use(express.json({ limit: '64kb' }));

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
//
// One dashboard load makes several API calls, each of which needs the student's
// identity. Validating each with Samagama would multiply the load on Samagama by
// the number of calls, at exactly the moment the most students are online. So the
// answer is cached per token for a short while, and concurrent lookups for the
// same token share one request. A signed-out token can therefore still work for up
// to SESSION_CACHE_TTL_MS; that is the trade for not falling over.
const SESSION_CACHE_TTL_MS = 60_000;
const sessionCache = new TtlCache({ maxKeys: 50_000, staleMs: 2 * 60_000 });
async function getSamagamaUser(chatengineToken) {
  if (!chatengineToken) return null;
  try {
    return await sessionCache.getOrLoad(chatengineToken, SESSION_CACHE_TTL_MS, async () => {
      const res = await fetch(SAMAGAMA_AUTH_URL, {
        headers: { cookie: `chatengine_token=${chatengineToken}` },
        signal: AbortSignal.timeout(5000)
      });
      if (res.status === 401 || res.status === 403) return null;   // a real "not signed in": cache it
      if (!res.ok) throw new Error(`Samagama auth HTTP ${res.status}`);   // an outage: do not cache it as "signed out"
      return await res.json();
    });
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

// The competitive set: everyone not excused.
const ACTIVE_FILTER = { status: { $ne: 'excused' } };
const BY_SP = { totalSp: -1, name: 1 };

// Rank = 1 + the number of students strictly ahead (more SP, or equal SP and an
// earlier name — the same order every board uses). One indexed count per request.
async function rankFor(student) {
  if (!student || student.status === 'excused') return null;
  const better = await Student.countDocuments({
    ...ACTIVE_FILTER,
    $or: [
      { totalSp: { $gt: student.totalSp } },
      { totalSp: student.totalSp, name: { $lt: student.name } }
    ]
  });
  return better + 1;
}

// The student ranked immediately above this one (for "N SP to pass the next student").
function studentAbove(student) {
  return Student.findOne({
    ...ACTIVE_FILTER,
    $or: [
      { totalSp: { $gt: student.totalSp } },
      { totalSp: student.totalSp, name: { $lt: student.name } }
    ]
  }).sort({ totalSp: 1, name: -1 }).select('totalSp').lean();
}

// Cohort-wide figures are identical for every student and only move when the
// pipeline reruns (a few times a day). Loading them per request meant reading the
// whole student collection twice for every dashboard view — fine at a few hundred
// students, fatal at tens of thousands. They are computed once a minute instead,
// shared by all requests, and a database blip serves the last good copy.
const COHORT_TTL_MS = 60_000;
const cohortCache = new TtlCache({ maxKeys: 500 });
const ROW_FIELDS = 'name email totalSp highestSpEver';

function loadCohortStats() {
  return cohortCache.getOrLoad('cohort', COHORT_TTL_MS, async () => {
    const [cohortSize, avg, tenth, fiftieth, top] = await Promise.all([
      Student.countDocuments(ACTIVE_FILTER),
      Student.aggregate([{ $match: ACTIVE_FILTER }, { $group: { _id: null, avg: { $avg: '$totalSp' } } }]),
      Student.find(ACTIVE_FILTER).sort(BY_SP).skip(9).limit(1).select('totalSp').lean(),
      Student.find(ACTIVE_FILTER).sort(BY_SP).skip(49).limit(1).select('totalSp').lean(),
      Student.find(ACTIVE_FILTER).sort(BY_SP).limit(50).select(ROW_FIELDS).lean()
    ]);
    return {
      cohortSize,
      averageSp: Math.round(avg[0]?.avg || 0),
      top10Cutoff: tenth[0]?.totalSp || null,
      top50Cutoff: fiftieth[0]?.totalSp || null,
      top
    };
  });
}

function loadGroupTop(group) {
  if (!group) return Promise.resolve([]);
  return cohortCache.getOrLoad(`group:${group}`, COHORT_TTL_MS, () =>
    Student.find({ ...ACTIVE_FILTER, leaderboardGroup: group }).sort(BY_SP).limit(50).select(ROW_FIELDS).lean());
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
  const myGroup = leaderboardGroup(student.internshipStartDate);
  // Per-student work: three small indexed reads, one indexed count, one indexed
  // lookup. Everything cohort-wide comes from the shared cache (see loadCohortStats).
  const [transactions, polls, attendance, rank, above, cohort, groupTop] = await Promise.all([
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    PollRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    AttendanceRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    rankFor(student),
    student.status === 'excused' ? null : studentAbove(student),
    loadCohortStats(),
    loadGroupTop(myGroup)
  ]);
  const rankInfo = rank ? { rank, cohortSize: cohort.cohortSize } : null;
  const { averageSp, top10Cutoff, top50Cutoff } = cohort;
  const leaderboard = cohort.top;
  const nextStudent = above;
  // Spurti Levels & Trophy Leagues — derived from existing SP (lifetime highest + current).
  const highestSpEver = Math.max(Number(student.highestSpEver) || 0, Number(student.totalSp) || 0);
  const groupStudents = groupTop;
  const mapRow = (row, index) => ({
    rank: index + 1,
    name: row.name,
    maskedEmail: maskEmail(row.email),
    totalSp: row.totalSp,
    level: levelFor(Math.max(Number(row.highestSpEver) || 0, Number(row.totalSp) || 0)),
    isCurrentStudent: row.email === email
  });
  // E2 goal card: arms B/C, window open, and no goal set yet — the moment a
  // journey goal exists the card's premise is gone and it stops for good.
  let e2Card = null;
  if ((student.e2Arm === 'B' || student.e2Arm === 'C') && e2WindowOpen()) {
    const plan = await JourneyPlan.findOne({ email: student.email }).lean();
    const hasGoal = plan && (plan.standupBy || plan.vibeBy || plan.spaBy || plan.projectBy);
    if (!hasGoal) e2Card = { arm: student.e2Arm, sp: student.e2Arm === 'C' ? 10 : 0 };
  }
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
      poll2Completed: Boolean(student.poll2Completed),
      poll3Completed: Boolean(student.poll3Completed),
      eligibleForVibeGoals: isVibeEligible(student),
      e2Card
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

// ── E2 goal-card experiment window (pre-reg 2026-09-07) ──────────────────────
// The card renders for arms B/C only between E2_START and E2_START + E2_DAYS.
// The gate lives server-side so a stale client build can never extend the
// experiment; arm assignment sits on the student doc (e2Arm), written once by
// pipeline/assign-arms-e2.mjs. Unset E2_START = experiment off everywhere.
const E2_START = process.env.E2_START ? new Date(process.env.E2_START) : null;
const E2_DAYS = Number(process.env.E2_DAYS || 7);
function e2WindowOpen() {
  if (!E2_START || Number.isNaN(E2_START.getTime())) return false;
  const now = Date.now();
  return now >= E2_START.getTime() && now < E2_START.getTime() + E2_DAYS * 86400000;
}

function isAdmin(req) {
  if (!ADMIN_EMAIL || !ADMIN_TOKEN) return false; // fail closed when admin creds aren't configured
  // Constant-time compares, so the token cannot be recovered from response timing.
  const emailOk = safeEqual(normalizeEmail(req.headers['x-admin-email']), ADMIN_EMAIL);
  const tokenOk = safeEqual(String(req.headers['x-admin-token'] || ''), ADMIN_TOKEN);
  return emailOk && tokenOk;
}

function adminGuard(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ error: 'Forbidden' });
  next();
}

// Reports the database too, so a load balancer or PM2 health probe can take an
// instance out of rotation when it has lost Mongo instead of serving 500s.
api.get('/health', (_req, res) => {
  const up = mongoose.connection.readyState === 1;
  res.status(up ? 200 : 503).json({ status: up ? 'ok' : 'degraded', db: up ? 'up' : 'down' });
});

api.get('/config', (_req, res) => res.json({
  allowStudentSearch: ALLOW_STUDENT_SEARCH,
  demoMode: DEMO_MODE,
  survey: surveyPublic(SURVEY),
  poll2: surveyPublic(POLL2),
  poll3: surveyPublic(POLL3)
}));

// ---- Demo mode (DEMO_MODE=1, local only): no login, pick any student -----------
const DEMO_MODE = process.env.DEMO_MODE === '1' && ALLOW_STUDENT_SEARCH;
api.get('/demo/students', async (_req, res) => {
  if (!DEMO_MODE) return res.status(404).json({ error: 'Not found' });
  const rows = await Student.find().sort({ totalSp: -1, name: 1 }).select('name email status totalSp highestSpEver').lean();
  res.json(rows.map(s => ({ _id: String(s._id), name: s.name, email: s.email, status: s.status, totalSp: s.totalSp, level: levelFor(Math.max(s.highestSpEver || 0, s.totalSp || 0)), trophyLeague: leagueBand(s.totalSp) })));
});
api.get('/demo/teacher', (_req, res) => {
  if (!DEMO_MODE || !ADMIN_EMAIL || !ADMIN_TOKEN) return res.status(404).json({ error: 'Not found' });
  res.json({ email: ADMIN_EMAIL, token: ADMIN_TOKEN });
});

api.get('/me', async (req, res) => {
  const email = await studentEmailFromRequest(req);
  if (!email) return res.status(401).json({ authenticated: false });
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return res.status(404).json({ authenticated: false, error: 'Student not found' });
  if (student.status === 'excused') return res.json({ authenticated: true, ...excusedPayload(student) });
  res.json({ authenticated: true, profile: await studentPayload(student) });
});

// ---- ViBe Goals (commitment-SP module; 16 July cohort onward) ----------------
// Which student is asking? In production (ALLOW_STUDENT_SEARCH=false) that is the
// signed-in Samagama user and nobody else: an `email` in the body or query string
// is ignored, otherwise anyone who knew an intern's address could read their
// journey or overwrite their goals. With search enabled (local development) the
// client-supplied email is still honoured, as it always was.
async function vibeStudent(req) {
  const claimed = ALLOW_STUDENT_SEARCH ? normalizeEmail(req.body?.email || req.query.email) : '';
  const email = claimed || await studentEmailFromRequest(req);
  if (!email) return null;
  return Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
}

api.get('/vibe/state', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!isVibeEligible(student)) return res.json({ eligible: false });
  res.json(await buildVibeState(student));
});

api.post('/vibe/bet', async (_req, res) => {
  // ON HOLD: ViBe commitments are paused — the ViBe completion feed (leaderboard API)
  // is unavailable, so bets can't be verified or settled. No new bets can be placed
  // (nothing is staked/debited) until the feed is restored.
  return res.status(403).json({ error: 'ViBe commitments are on hold and will be back up soon.' });
});

api.put('/vibe/bet/:id', async (_req, res) => {
  // ON HOLD: see POST /vibe/bet.
  return res.status(403).json({ error: 'ViBe commitments are on hold and will be back up soon.' });
});

// DEMO: resolve a bet (no live settlement cron locally). result = 'won' | 'lost'.
api.post('/vibe/bet/:id/settle', async (_req, res) => {
  // LOCKED DOWN (security): client-controlled self-settlement is removed. This route
  // trusted req.body.result (defaulting to "won") and granted SP with NO check against
  // real ViBe course completion — students could place a bet and instantly self-declare
  // a win to mint SP. There is no real completion feed (VibeProgress.pct was written by
  // settleBetDemo itself), so settlement cannot be verified yet; disabled until a
  // server-side/automatic settlement against real completion data is built.
  return res.status(403).json({ error: 'Bets are settled automatically, not on request. Self-settlement is disabled.' });
});

// ---- SPA → SP (peer-teaching endorsement points; ALL cohorts) ----------------
// DISPLAY ONLY: SP is scored + credited by the pipeline rubric; this just reads
// the `spaprogresses` summary + student total. Universal, no cohort gate.
api.get('/spa/state', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await buildSpaState(student));
});

// ---- SP trajectory (You vs cohort vs onboarding-group; open to all students) --
// The student's own weekly line is built live from their ledger; the cohort/group
// reference lines come from the cached TrajectorySnapshot (buildTrajectories.js).
api.get('/trajectory/state', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await buildTrajectoryState(student));
});

// ---- Standup commitments (weekly, attendance-only; keep-the-stake) -----------
api.get('/standup/state', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!isVibeEligible(student)) return res.json({ eligible: false });
  res.json(await buildStandupState(student));
});

api.post('/standup/commit', async (_req, res) => {
  // PAUSED: standups moved to YouTube Live and the attendance module is being
  // reworked — no new standup commitments until the new attendance tracking lands.
  return res.status(403).json({ error: 'Standup commitments are paused while attendance is reworked for YouTube Live.' });
});

// DEMO: resolve a standup commitment (no live weekly settlement cron yet).
api.post('/standup/commit/:id/settle', async (_req, res) => {
  // LOCKED DOWN (security): same self-settlement exploit as /vibe/bet/:id/settle —
  // client-declared "won" minted SP with no verification. Disabled until server-side
  // settlement against real attendance/completion is built.
  return res.status(403).json({ error: 'Commitments are settled automatically, not on request. Self-settlement is disabled.' });
});

// ---- My Journey (phase-by-phase progress + SP; 16 July cohort onward) ---------
api.get('/journey/state', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await buildJourneyState(student));   // My Journey is universal (Phase 1); Commitments stays gated
});

api.put('/journey/plan', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });   // My Journey goals are universal (Phase 1)
  await saveJourneyPlan(student.email, req.body || {});
  res.json(await buildJourneyState(student));
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
  if (!DEMO_MODE && typed !== normalizeEmail(student.email) && typed !== normalizeEmail(student.alternateEmail)) {
    return res.status(403).json({ error: 'Email did not match this record' });
  }
  if (student.status === 'excused') return res.json(excusedPayload(student));
  res.json(await studentPayload(student));
});

api.get('/leaderboard', async (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
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

// Cached weekly/all-time/category/cohort boards (built by buildLeaderboards.js).
// window=week|all, category=total|attendance|poll|spa|query, scope=all|cohort.
// Returns the top 50 + the requesting student's own rank/SP (even if outside it).
api.get('/leaderboard/board', async (req, res) => {
  const student = await vibeStudent(req);
  const window = ['week', 'all', 'day'].includes(req.query.window) ? req.query.window : 'week';
  const category = ['total', 'attendance', 'poll', 'spa', 'query', 'quiz'].includes(req.query.category) ? req.query.category : 'total';
  // Cohort scope only exists for the 'total' board; category boards are global.
  const wantCohort = req.query.scope === 'cohort' && category === 'total' && student?.leaderboardGroup;
  const boardKey = wantCohort ? `${window}:total:group:${student.leaderboardGroup}` : `${window}:${category}:all`;
  const board = await LeaderboardSnapshot.findOne({ boardKey }).lean();
  if (!board) return res.json({ window, category, scope: wantCohort ? 'cohort' : 'all', weekLabel: '', builtAt: null, rows: [], me: null });
  const meId = student ? String(student._id) : null;
  const meRow = meId ? board.rows.find((r) => r.studentId === meId) : null;
  res.json({
    window: board.window, category: board.category, scope: wantCohort ? 'cohort' : 'all',
    weekLabel: board.weekLabel, builtAt: board.builtAt, total: board.rows.length,
    rows: board.rows.slice(0, 50),
    me: meRow ? { rank: meRow.rank, sp: meRow.sp } : null
  });
});

// A student's achievements, grouped one tile per board (plus milestones and the
// nearest locked one). Podium places are awarded by the leaderboard build;
// milestones are settled and persisted here on read.
// ---- Announcements (programme notices with read-tracking) --------------------
// Students see active notices on their dashboard; "Got it" writes one ack row
// per student per notice, which is what the team reads to know who has read what.
// A notice is visible to a student when its audience is empty (broadcast) or
// names either of their addresses. Centralized so list and ack can never disagree.
function announcementVisibleTo(ann, student) {
  if (!ann.audience || ann.audience.length === 0) return true;
  const mine = new Set([normalizeEmail(student.email), normalizeEmail(student.alternateEmail || '')]);
  return ann.audience.some(a => mine.has(normalizeEmail(a)));
}

api.get('/announcements', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const email = normalizeEmail(student.email);
  const list = (await Announcement.find({ active: true }).sort({ postedAt: -1 }).lean())
    .filter(a => announcementVisibleTo(a, student));
  const acked = new Set((await AnnouncementAck.find({ email }).select('announcementId').lean())
    .map(a => String(a.announcementId)));
  res.json({
    announcements: list.map(a => ({
      id: String(a._id), title: a.title, body: a.body, postedAt: a.postedAt,
      acked: acked.has(String(a._id))
    })),
    unread: list.filter(a => !acked.has(String(a._id))).length
  });
});

api.post('/announcements/:id/ack', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const ann = await Announcement.findOne({ _id: req.params.id, active: true }).lean();
  if (!ann || !announcementVisibleTo(ann, student)) return res.status(404).json({ error: 'Announcement not found' });
  // Upsert so a double-tap (or a stale open tab) can never duplicate or error.
  await AnnouncementAck.updateOne(
    { announcementId: ann._id, email: normalizeEmail(student.email) },
    { $setOnInsert: { ackedAt: new Date() } },
    { upsert: true });
  res.json({ ok: true });
});

// Admin: post a notice / toggle one / read the read-rates.
api.post('/admin/announcements', adminGuard, async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const body = String(req.body?.body || '').trim();
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' });
  // Optional targeting: audience = array of emails. Empty/omitted = broadcast.
  const audience = Array.isArray(req.body?.audience)
    ? [...new Set(req.body.audience.map(normalizeEmail).filter(Boolean))] : [];
  const ann = await Announcement.create({ title, body, audience });
  res.json({ ok: true, id: String(ann._id), audienceSize: audience.length || 'broadcast' });
});

api.post('/admin/announcements/:id', adminGuard, async (req, res) => {
  const ann = await Announcement.findByIdAndUpdate(req.params.id,
    { $set: { active: !!req.body?.active } }, { new: true }).lean();
  if (!ann) return res.status(404).json({ error: 'Announcement not found' });
  res.json({ ok: true, active: ann.active });
});

api.get('/admin/announcements', adminGuard, async (_req, res) => {
  const [list, activeStudents, ackCounts] = await Promise.all([
    Announcement.find({}).sort({ postedAt: -1 }).lean(),
    Student.countDocuments({ status: 'active' }),
    AnnouncementAck.aggregate([{ $group: { _id: '$announcementId', reads: { $sum: 1 } } }])
  ]);
  const readsBy = new Map(ackCounts.map(c => [String(c._id), c.reads]));
  res.json({
    activeStudents,
    announcements: list.map(a => {
      // Read-rate denominator: the targeted audience when one is set, else all actives.
      const denom = (a.audience && a.audience.length) ? a.audience.length : activeStudents;
      const reads = readsBy.get(String(a._id)) || 0;
      return {
        id: String(a._id), title: a.title, postedAt: a.postedAt, active: a.active,
        audienceSize: (a.audience && a.audience.length) || 'broadcast',
        reads, readPct: denom ? Math.round(reads / denom * 100) : 0
      };
    })
  });
});

api.get('/achievements', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  const access = achievementsAccess(student);
  // Nothing is computed or persisted for a student who cannot see the tab —
  // the milestone write in buildAchievementState only happens once it is on.
  if (!access.visible) return res.json({ ...access, groups: [], locked: [], counts: {} });
  res.json({
    ...access,
    student: { name: student.name, email: student.email, totalSp: student.totalSp, level: levelFor(Math.max(Number(student.highestSpEver) || 0, Number(student.totalSp) || 0)) },
    ...(await buildAchievementState(student))
  });
});

// Marks the tab as read. Deliberately NOT folded into GET /achievements: that
// fires on every dashboard load, whatever tab is showing, so letting it stamp
// would mean nothing was ever unseen and the badge could never appear.
api.post('/achievements/seen', async (req, res) => {
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!achievementsAccess(student).visible) return res.status(403).json({ error: 'Achievements are off' });
  await Student.updateOne({ _id: student._id }, { $set: { achievementsSeenAt: new Date() } });
  res.json({ ok: true });
});

// Public — this is what the QR on a shared card opens. No login, no PII beyond
// the recipient's name and what they won.
api.get('/verify/:code', verifyLimit, async (req, res) => {
  const result = await verifyAchievement(req.params.code, Student);
  if (!result) return res.status(404).json({ valid: false });
  res.json(result);
});

// Records that a card was looked at. Fire-and-forget: a credential page must
// never fail, or be slowed down, because analytics did.
//
// Deliberately not stored: the visitor's IP, any cookie, and the full referrer
// (only its host). These are members of the public who followed a link, not
// consented participants — see models/AchievementView.js. Set
// VERIFY_VIEW_LOG=0 to switch the whole thing off.
const VIEW_LOG_ON = process.env.VERIFY_VIEW_LOG !== '0';
function logAchievementView(req, code, result) {
  if (!VIEW_LOG_ON) return;
  const verifyId = String(code || '').trim().toUpperCase();
  const ua = req.get('user-agent') || '';
  // Read synchronously, with everything else off the request. `req.ip` is a
  // getter over the socket's remote address, and the socket is usually gone by
  // the time the await below resolves — reading it in there returned undefined
  // for 403 of the first 437 human views, so most of them recorded no hash at
  // all. Nothing off `req` may be read after the first await.
  const ip = req.ip;
  let ref = '';
  try { ref = req.get('referer') ? new URL(req.get('referer')).host : ''; } catch { ref = ''; }
  // The category is re-read here rather than added to verifyAchievement's
  // return value: that payload is public JSON, and studentId has no business
  // being in it just to make logging convenient.
  (async () => {
    const a = result ? await Achievement.findOne({ verifyId }, { achId: 1, studentId: 1, board: 1, kind: 1 }).lean() : null;
    await AchievementView.create({
      verifyId,
      achId: a?.achId || '',
      studentId: a?.studentId || '',
      board: a?.board || '',
      kind: a?.kind || '',
      found: !!result,
      ref,
      uaFamily: uaFamilyOf(ua),
      bot: isBot(ua),
      viewerDay: viewerDayHash(ip, ua)
    });
  })().catch(() => { /* never let logging break a credential page */ });
}

// The card is drawn in the browser, so the server never sees it unless the
// client hands it over. It's stored once per achievement purely so the verify
// page has an og:image — that's what makes a posted link show the card without
// the student uploading anything.
api.post('/share/card', async (req, res) => {
  const { achId, dataUrl } = req.body || {};
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!achievementsAccess(student).sharing) return res.status(403).json({ error: 'Sharing is off' });
  const ach = await Achievement.findOne({ studentId: String(student._id), achId }).lean();
  if (!ach || !ach.verifyId) return res.status(404).json({ error: 'Achievement not found' });

  const url = `${publicBaseUrl(req)}/spurti/cards/${ach.verifyId}.png`;
  const file = path.join(CARD_DIR, `${ach.verifyId}.png`);
  // Write once. Identity here is only the email in the request — the same weak
  // model the rest of the app uses — so allowing overwrites would let anyone
  // replace the picture that a student's public verify link previews.
  if (fs.existsSync(file)) return res.json({ url, stored: false });

  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) return res.status(400).json({ error: 'A PNG data URL is required' });
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 1_500_000) return res.status(413).json({ error: 'Card image too large' });

  fs.mkdirSync(CARD_DIR, { recursive: true });
  fs.writeFileSync(file, buf);
  res.json({ url, stored: true });
});

// Every share and download is logged so the admin can see who posts, how often,
// and which achievements are actually worth posting.
api.post('/share/track', async (req, res) => {
  const { achId, platform, captionEdited, captionChars } = req.body || {};
  if (!achId || !['linkedin', 'whatsapp', 'download', 'copy', 'native'].includes(platform)) {
    return res.status(400).json({ error: 'achId and a valid platform required' });
  }
  const student = await vibeStudent(req);
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (!achievementsAccess(student).sharing) return res.status(403).json({ error: 'Sharing is off' });
  const ach = await Achievement.findOne({ studentId: String(student._id), achId }).lean();
  if (!ach) return res.status(404).json({ error: 'Achievement not found' });
  await ShareEvent.create({
    studentId: String(student._id), email: student.email, name: student.name,
    achId, verifyId: ach.verifyId || '', title: ach.title,
    kind: ach.kind, board: ach.board, place: ach.place,
    period: ach.period, periodKey: ach.periodKey || '', earnedAt: ach.earnedAt || null,
    captionEdited: !!captionEdited, captionChars: Number(captionChars) || 0,
    platform
  });
  res.json({ ok: true });
});

// E2 goal-card telemetry: one row per impression / skip / set. Cookie-only auth
// on purpose (unlike vibeStudent): a client-supplied email must never let anyone
// write experiment rows for someone else. Log failures are swallowed — telemetry
// must not break the card.
api.post('/e2/card-event', async (req, res) => {
  const { event, phase, value } = req.body || {};
  if (!['impression', 'skip', 'set'].includes(event)) return res.status(400).json({ error: 'bad event' });
  const email = await studentEmailFromRequest(req);
  const student = email ? await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean() : null;
  if (!student || (student.e2Arm !== 'B' && student.e2Arm !== 'C')) {
    return res.status(403).json({ error: 'not in experiment' });
  }
  try {
    await E2CardEvent.create({
      email: student.email, arm: student.e2Arm, event,
      phase: String(phase || ''), value: String(value || '')
    });
  } catch (err) {
    console.error('e2 card-event log failed:', err?.message);
  }
  res.json({ ok: true });
});

// Page-view pings. Every open dashboard tab sends one on a timer, so at cohort scale
// this is the busiest write endpoint by far. Each ping used to be its own insert;
// they are now queued and written in batches, and the queue is bounded (oldest
// dropped) so a slow database can never turn analytics into a memory leak.
const PAGE_VALUES = new Set(SessionEvent.schema.path('page').enumValues);
const pingBuffer = new BatchBuffer(
  batch => SessionEvent.insertMany(batch, { ordered: false }),
  { intervalMs: 5000, batchSize: 1000, maxItems: 20_000, onError: (err, n) => console.error(`ping batch of ${n} lost:`, err?.message) }
);
// Per-address, generous: a legitimate tab pings about once a minute.
const pingLimit = rateLimit({ windowMs: 60_000, max: 20, keyFn: req => normalizeEmail(req.body?.email) || req.ip });

api.post('/ping', pingLimit, async (req, res) => {
  const { email, name, page } = req.body || {};
  const normalized = normalizeEmail(email).slice(0, 254);
  if (!normalized || !name || !page) return res.status(400).json({ error: 'email, name, page required' });
  const cleanName = String(name).slice(0, 120);
  const cleanPage = String(page).slice(0, 40);
  // Telemetry is best-effort: an unknown page value (e.g. a new admin sub-page
  // not yet in the enum) is simply not recorded.
  if (PAGE_VALUES.has(cleanPage)) {
    pingBuffer.push({ email: normalized, name: cleanName, event: 'page_view', page: cleanPage, timestamp: new Date() });
  }
  if (cleanPage === 'record' || cleanPage.startsWith('admin')) {
    if (liveViewers.size < LIVE_VIEWERS_MAX || liveViewers.has(normalized)) {
      liveViewers.set(normalized, { name: cleanName, page: cleanPage, lastSeen: new Date() });
    }
  }
  res.json({ ok: true });
});

// Forget viewers who have stopped pinging, so the live table tracks the people
// actually online rather than everyone who ever visited.
setInterval(() => {
  const cutoff = Date.now() - LIVE_VIEWER_WINDOW_MS;
  for (const [key, v] of liveViewers) if (v.lastSeen.getTime() < cutoff) liveViewers.delete(key);
}, 60_000).unref();

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
registerSurveyRoutes('/poll3', POLL3);

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
  res.json(await adminCache.getOrLoad('attendance', ADMIN_TTL_MS, buildAttendanceGrid));
});

async function buildAttendanceGrid() {
  const [sessions, students, records] = await Promise.all([
    Session.find().sort({ endDateTime: 1 }).lean(),
    Student.find({ status: 'active' }).select('name email totalSp').sort({ name: 1 }).lean(),
    AttendanceRecord.find().select('email sessionLabel attendedMinutes totalSessionMinutes qualified attendancePercentage').lean()
  ]);
  const byStudent = new Map();
  for (const record of records) byStudent.set(`${record.email}|${record.sessionLabel}`, record);
  return {
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
  };
}

api.get('/admin/student/:id', adminGuard, async (req, res) => {
  const student = await Student.findById(req.params.id).lean();
  if (!student) return res.status(404).json({ error: 'Student not found' });
  res.json(await studentPayload(student));
});

api.get('/admin/active', adminGuard, (_req, res) => {
  const now = new Date();
  const cutoff = now.getTime() - LIVE_VIEWER_WINDOW_MS;
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

// The analytics and attendance views read large collections. Computed once per
// TTL and shared, so several admins (or one admin mashing refresh) cost one pass
// over the data rather than one each, and a database blip serves the last result.
const adminCache = new TtlCache({ maxKeys: 20, staleMs: 30 * 60_000 });
const ADMIN_TTL_MS = 2 * 60_000;

api.get('/admin/analytics', adminGuard, async (_req, res) => {
  res.json(await adminCache.getOrLoad('analytics', ADMIN_TTL_MS, buildAnalytics));
});

async function buildAnalytics() {
  const now = new Date();
  const lastHour = new Date(now.getTime() - 60 * 60 * 1000);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [allStudents, sessions, attendance, transactions, events, shares, achievements, views, reigns] = await Promise.all([
    // Only the fields this report reads: at tens of thousands of students and
    // millions of ledger rows, whole documents would not fit in memory.
    Student.find().select('email status totalSp').lean(),
    Session.find().sort({ endDateTime: 1 }).lean(),
    AttendanceRecord.find().select('email sessionLabel qualified attendedMinutes').lean(),
    SPTransaction.find().select('email category appliedDelta').lean(),
    SessionEvent.find({ timestamp: { $gte: last30Days } }).select('email timestamp').lean(),
    ShareEvent.find().lean(),
    // The full rows, not a count: per-category share rates need the cards HELD
    // in each category as their denominator.
    Achievement.find({}, { achId: 1, kind: 1, board: 1, place: 1, studentId: 1, earnedAt: 1 }).lean(),
    AchievementView.find({}, { bot: 1, board: 1, kind: 1, ref: 1, viewerDay: 1, found: 1 }).lean(),
    BoardReign.find().sort({ from: -1 }).lean()
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

  const activeNow = [...liveViewers.values()].filter(v => now.getTime() - v.lastSeen.getTime() <= LIVE_VIEWER_WINDOW_MS).length;
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

  return {
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
    },
    sharing: shareSummary(shares, achievements, views, last7Days),
    reigns: reignSummary(reigns),
    pipeline: pipelineHealth()
  };
}

const BOARD_LABEL = {
  total: 'Overall SP', attendance: 'Attendance', poll: 'Polls',
  spa: 'Peer Learning', query: 'Queries', '': 'Milestones'
};
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Who shares their achievement cards, which categories travel, and whether any
// of it reaches anyone.
//
// The headline is `shareRatePct` — of the cards students actually hold, how
// many were ever posted. A raw share count flatters itself: it rises simply
// because more cards get minted. The per-category rates work the same way,
// dividing shares by the cards HELD in that category, which is the only way
// "Polls gets shared more than Attendance" means anything when the two mint at
// different volumes.
function shareSummary(shares, achievements, views, since) {
  const byStudent = new Map();
  const byPlatform = {};
  const sharedAch = new Set();
  const latencies = [];
  let edited = 0;

  // Cards HELD per category — the denominator for every rate below.
  const cat = new Map();
  const bucket = (key, label) => {
    if (!cat.has(key)) cat.set(key, { key, label, held: 0, shares: 0, sharedCards: new Set(), views: 0 });
    return cat.get(key);
  };
  for (const a of achievements) {
    const key = a.kind === 'rank' ? a.board : 'milestone';
    bucket(key, key === 'milestone' ? 'Milestones' : (BOARD_LABEL[a.board] || a.board)).held += 1;
  }

  const byPlace = {
    1: { shares: 0, held: 0, cards: new Set() },
    2: { shares: 0, held: 0, cards: new Set() },
    3: { shares: 0, held: 0, cards: new Set() }
  };
  for (const a of achievements) if (a.place >= 1 && a.place <= 3) byPlace[a.place].held += 1;

  for (const s of shares) {
    byPlatform[s.platform] = (byPlatform[s.platform] || 0) + 1;
    sharedAch.add(`${s.studentId}:${s.achId}`);
    if (s.captionEdited) edited += 1;
    if (s.earnedAt) latencies.push((new Date(s.at) - new Date(s.earnedAt)) / 3600000);
    if (s.place >= 1 && s.place <= 3) {
      byPlace[s.place].shares += 1;
      byPlace[s.place].cards.add(`${s.studentId}:${s.achId}`);
    }

    const key = s.kind === 'rank' ? s.board : 'milestone';
    const b = bucket(key, key === 'milestone' ? 'Milestones' : (BOARD_LABEL[s.board] || s.board));
    b.shares += 1;
    b.sharedCards.add(`${s.studentId}:${s.achId}`);

    let row = byStudent.get(s.studentId);
    if (!row) { row = { name: s.name, email: s.email, shares: 0, achievements: new Set(), last: s.at }; byStudent.set(s.studentId, row); }
    row.shares += 1;
    row.achievements.add(s.achId);
    if (s.at > row.last) row.last = s.at;
  }

  // Reach. Crawler hits are excluded everywhere: LinkedIn fetches every posted
  // URL to build its preview, so counting bots would mean counting our own
  // og:image tags as an audience.
  const human = views.filter((v) => !v.bot);
  // A hit on a code that matches nothing is a mistyped or probed URL, not
  // someone looking at a card. Counted separately so it can't inflate reach.
  const real = human.filter((v) => v.found);
  for (const v of real) {
    const key = v.kind === 'rank' ? v.board : 'milestone';
    if (v.kind) bucket(key, key === 'milestone' ? 'Milestones' : (BOARD_LABEL[v.board] || v.board)).views += 1;
  }
  const byRef = {};
  for (const v of real) if (v.ref) byRef[v.ref] = (byRef[v.ref] || 0) + 1;

  const categories = [...cat.values()]
    .map((c) => ({
      key: c.key, label: c.label, held: c.held, shares: c.shares,
      sharedCards: c.sharedCards.size,
      shareRatePct: c.held ? Math.round((c.sharedCards.size / c.held) * 100) : 0,
      views: c.views
    }))
    .sort((a, b) => b.shareRatePct - a.shareRatePct || b.shares - a.shares);

  const latencyHrs = median(latencies);
  return {
    totalShares: shares.length,
    sharers: byStudent.size,
    last7Days: shares.filter((s) => s.at >= since).length,
    achievementsHeld: achievements.length,
    achievementsShared: sharedAch.size,
    shareRatePct: achievements.length ? Math.round((sharedAch.size / achievements.length) * 100) : 0,
    captionEditedPct: shares.length ? Math.round((edited / shares.length) * 100) : 0,
    medianHoursToShare: latencyHrs === null ? null : Math.round(latencyHrs * 10) / 10,
    byPlatform,
    categories,
    // Rate is distinct cards shared over cards held, exactly as the category
    // table does it. Dividing by share ACTIONS would let one card shared twice
    // report 200%, which is a number no reader can interpret.
    byPlace: [1, 2, 3].map((p) => ({
      place: p, held: byPlace[p].held, shares: byPlace[p].shares, sharedCards: byPlace[p].cards.size,
      shareRatePct: byPlace[p].held ? Math.round((byPlace[p].cards.size / byPlace[p].held) * 100) : 0
    })),
    reach: {
      views: real.length,
      botViews: views.length - human.length,
      uniqueViewerDays: new Set(real.map((v) => v.viewerDay).filter(Boolean)).size,
      notFound: human.length - real.length,
      viewsPerShare: shares.length ? Math.round((real.length / shares.length) * 10) / 10 : 0,
      byRef: Object.entries(byRef).map(([ref, count]) => ({ ref, count })).sort((a, b) => b.count - a.count).slice(0, 8)
    },
    topSharers: [...byStudent.values()]
      .map((r) => ({ name: r.name, email: r.email, shares: r.shares, achievements: r.achievements.size, last: r.last }))
      .sort((a, b) => b.shares - a.shares).slice(0, 15)
  };
}

// Who has held the top of each board and for how long. Short reigns are kept
// even though they never earn a card — the churn is the interesting part.
function reignSummary(reigns) {
  const DAY = 86400000;
  const rows = reigns.map((r) => ({
    board: BOARD_LABEL[r.board] || r.board,
    name: r.name, studentId: r.studentId,
    from: r.from, to: r.to,
    days: Math.max(0, Math.round((((r.to ? new Date(r.to) : new Date()) - new Date(r.from)) / DAY) * 10) / 10),
    sp: r.peakSp || r.sp,
    awarded: !!r.awarded,
    current: !r.to
  }));
  const byBoard = {};
  for (const r of rows) byBoard[r.board] = (byBoard[r.board] || 0) + 1;
  return {
    total: rows.length,
    current: rows.filter((r) => r.current),
    changesByBoard: Object.entries(byBoard).map(([board, n]) => ({ board, n })).sort((a, b) => b.n - a.n),
    medianDays: median(rows.filter((r) => !r.current).map((r) => r.days)),
    history: rows.slice(0, 40)
  };
}

// Pipeline health, written by sp-refresh.sh's run_step (logs/step-health.tsv:
// name \t status \t lastRun \t consecutiveFailures \t lastOk). Surfaced on the
// admin dashboard because a failing step that only writes to a log file is a
// step nobody notices — sync-attendance-records failed 31 runs over eight days
// exactly that way.
const STEP_HEALTH_FILE = process.env.STEP_HEALTH_FILE || path.join(rootDir, 'logs', 'step-health.tsv');
function pipelineHealth() {
  try {
    if (!fs.existsSync(STEP_HEALTH_FILE)) return { available: false, steps: [] };
    const steps = fs.readFileSync(STEP_HEALTH_FILE, 'utf8').split('\n')
      .map((l) => l.split('\t'))
      .filter((c) => c.length >= 4 && c[0])
      .map(([name, status, lastRun, fails, lastOk]) => ({
        name, status, lastRun, lastOk: lastOk || null,
        consecutiveFailures: Number(fails) || 0
      }))
      .sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.name.localeCompare(b.name));
    return {
      available: true,
      failing: steps.filter((s) => s.status !== 'ok').length,
      alerting: steps.filter((s) => s.consecutiveFailures >= 2).length,
      steps
    };
  } catch {
    return { available: false, steps: [] };
  }
}

function last24Hours(now) {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000);
}

app.use('/api', api);
app.use('/spurti/api', api);

// Saved achievement cards, served as plain files so LinkedIn's crawler can
// fetch the og:image without a login.
app.use('/spurti/cards', express.static(CARD_DIR, { maxAge: '30d' }));
app.use('/cards', express.static(CARD_DIR, { maxAge: '30d' }));

// The verify page is server-rendered ONLY to the extent of its meta tags: when a
// student posts the link, LinkedIn/WhatsApp fetch it, read og:image, and show
// the achievement card in the post itself — no upload, no download. The SPA
// still boots from the same HTML and renders the page for humans.
// The built index.html is read once and re-read only if the file changes (a new
// deploy), instead of a synchronous disk read on every verify-page hit. A card
// that goes viral on LinkedIn sends a burst of these, and each blocking read
// stalls every other request on the same process.
let indexHtmlCache = { mtimeMs: 0, html: '' };
function indexHtml() {
  const file = path.join(clientDist, 'index.html');
  const { mtimeMs } = fs.statSync(file);
  if (mtimeMs !== indexHtmlCache.mtimeMs) indexHtmlCache = { mtimeMs, html: fs.readFileSync(file, 'utf8') };
  return indexHtmlCache.html;
}

async function verifyPageHtml(req, code) {
  // The bundle is built with a relative base, so "./assets/x.js" would resolve
  // against /spurti/verify/<code>/ and 404. This page is two levels deep, so the
  // asset paths have to be absolute.
  const mount = req.path.startsWith('/spurti') ? '/spurti' : '';
  const html = indexHtml().replace(/(src|href)="\.\/assets\//g, `$1="${mount}/assets/`);
  const result = await verifyAchievement(code, Student);
  const base = publicBaseUrl(req);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const title = result ? `${result.title} — ${result.name}` : 'Spurti — achievement not found';
  const desc = result
    ? `${result.period} · ${result.programme}. Verified Spurti achievement.`
    : 'This code does not match any achievement issued by Spurti.';
  const img = result && fs.existsSync(path.join(CARD_DIR, `${result.verifyId}.png`))
    ? `${base}/spurti/cards/${result.verifyId}.png`
    : '';
  const tags = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(`${base}/spurti/verify/${code}`)}">`,
    `<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">`,
    img ? `<meta property="og:image" content="${esc(img)}">` : '',
    img ? `<meta property="og:image:width" content="1080">` : '',
    img ? `<meta property="og:image:height" content="1350">` : '',
    `<title>${esc(title)}</title>`
  ].filter(Boolean).join('\n  ');
  // `found` drives the status code: a credential page that answers 200 for a
  // code nobody was ever issued would let a made-up link look live to anything
  // that only checks the status (crawlers, link unfurlers, a sceptical reader).
  return { found: !!result, html: html.replace(/<title>.*?<\/title>/i, '').replace('</head>', `  ${tags}\n</head>`) };
}

if (fs.existsSync(clientDist)) {
  // Vite fingerprints everything under /assets, so those files can be cached for a
  // year; index.html (and anything else) must be revalidated so a new build shows up.
  const staticOpts = {
    index: false,
    setHeaders: (res, file) => {
      res.setHeader('Cache-Control', /[\\/]assets[\\/]/.test(file)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache');
    }
  };
  app.use('/spurti', express.static(clientDist, staticOpts));
  app.use(express.static(clientDist, staticOpts));
  app.get(['/spurti/verify/:code', '/verify/:code'], verifyLimit, async (req, res) => {
    try {
      const { found, html } = await verifyPageHtml(req, req.params.code);
      // Logged here and NOT on /api/verify: a human loads this page and then
      // the SPA fetches the API, so counting both would double every real view.
      // A crawler only ever hits this route, which is what the bot flag is for.
      logAchievementView(req, req.params.code, found);
      res.status(found ? 200 : 404).type('html').send(html);
    } catch {
      res.sendFile(path.join(clientDist, 'index.html'));
    }
  });
  app.get('/spurti/*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('*', (_req, res) => res.status(404).send('Build the client first with npm run build.'));
}

// Anything that reaches here is a failure no handler dealt with (a rejected query,
// a malformed or oversized body). One request gets an error; the process carries on.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err?.status || err?.statusCode || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}:`, err?.stack || err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : 'Bad request.' });
});

// Fill the in-process caches once at boot so the first teacher/student to open the
// dashboard gets a cached answer instead of paying for the cohort-wide queries.
// Best effort: a failure here only means the first real request loads it instead.
async function warmCaches() {
  const t0 = Date.now();
  const jobs = {
    cohort: loadCohortStats(),
    attendance: adminCache.getOrLoad('attendance', ADMIN_TTL_MS, buildAttendanceGrid),
    analytics: adminCache.getOrLoad('analytics', ADMIN_TTL_MS, buildAnalytics)
  };
  const names = Object.keys(jobs);
  const results = await Promise.allSettled(Object.values(jobs));
  const ok = names.filter((_, i) => results[i].status === 'fulfilled');
  console.log(`[cache] warmed ${ok.join(', ') || 'nothing'} in ${Date.now() - t0}ms`);
  results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`[cache] ${names[i]} not warmed:`, r.reason?.message); });
}

let server = null;
let shuttingDown = false;
async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  const force = setTimeout(() => process.exit(code || 1), 10_000);   // never hang on the way out
  force.unref();
  try {
    if (server) await new Promise(resolve => server.close(resolve));   // stop taking new connections
    await pingBuffer.stop();                                           // write out queued page views
    await mongoose.connection.close();
  } catch (err) {
    console.error('shutdown error:', err?.message);
  }
  process.exit(code);
}

// Starts the server unless SPURTI_NO_START=1. The tests set that so they can import
// the configured app without connecting to Mongo or claiming a port. It is an
// explicit opt-out rather than "was this file run directly?" on purpose: under PM2
// or any wrapper process.argv[1] is not this file, and the app must still start.
if (process.env.SPURTI_NO_START !== '1') {
  // A rejected promise nobody handled is logged, not fatal. An uncaught exception
  // leaves the process in an unknown state, so log it, flush what we can and exit
  // for the supervisor (PM2) to restart cleanly.
  process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
  process.on('uncaughtException', (err) => { console.error('[uncaughtException]', err); shutdown(1); });
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGINT', () => shutdown(0));

  // Pool size caps concurrent Mongo work per process; the timeouts turn a stalled
  // database into fast, contained errors instead of requests that pile up forever.
  mongoose.connect(MONGO_URI, {
    maxPoolSize: Number(process.env.MONGO_POOL_SIZE || 50),
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000
  }).then(() => {
    server = app.listen(PORT, () => console.log(`Spurti app running at http://localhost:${PORT}/`));
    warmCaches();
    // Keep-alive longer than nginx's, so a proxied connection is never closed under it.
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 66_000;
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export default app;
