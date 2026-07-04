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
import Challenge from './models/Challenge.js';
import ChallengeParticipant from './models/ChallengeParticipant.js';
import ChallengeProgress from './models/ChallengeProgress.js';
import ChallengeLeaderboard from './models/ChallengeLeaderboard.js';
import ChallengeReward from './models/ChallengeReward.js';

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
  
  // Authoritative check and reward for any recently expired challenges
  await lazyCheckChallenges();

  const activeFilter = { status: { $ne: 'excused' } };
  const [transactions, polls, attendance, rankInfo, leaderboard, allStudents, challengeRewards, unseenRewards] = await Promise.all([
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    PollRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    AttendanceRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
    rankFor(email),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).limit(50).lean(),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).lean(),
    ChallengeReward.find({ email, type: 'badge' }).lean(),
    ChallengeReward.find({ email, isAcknowledged: false }).populate('challengeId', 'name colorTheme banner').lean()
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
    groupLeaderboard: groupStudents.slice(0, 50).map(mapRow),
    challengeBadges: challengeRewards.map(r => r.badge).filter(Boolean),
    unseenRewards
  };
}

async function rewardChallengeWinners(challengeId) {
  const challenge = await Challenge.findById(challengeId);
  if (!challenge || challenge.isRewarded) return;

  // Mark as rewarded immediately to prevent duplicate runs
  challenge.isRewarded = true;
  challenge.status = 'completed';
  await challenge.save();

  // Find all completions sorted by completedAt (earliest first)
  const completions = await ChallengeParticipant.find({ challengeId, status: 'completed' })
    .sort({ completedAt: 1, joinedAt: 1 })
    .lean();

  let topParticipants = [...completions];

  // If we don't have enough completions, get in-progress ones sorted by progressPct desc, lastUpdated asc
  if (topParticipants.length < 3) {
    const incomplete = await ChallengeParticipant.find({ challengeId, status: 'joined' }).lean();
    const progressList = await ChallengeProgress.find({ challengeId }).lean();
    const progressMap = new Map(progressList.map(p => [String(p.studentId), p]));

    const incompleteRanked = incomplete.map(p => {
      const prog = progressMap.get(String(p.studentId));
      return {
        ...p,
        completedTasks: prog?.completedTasks || 0,
        progressPct: prog?.progressPct || 0,
        lastUpdated: prog?.lastUpdated || p.joinedAt
      };
    });

    incompleteRanked.sort((a, b) => {
      if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;
      return new Date(a.lastUpdated) - new Date(b.lastUpdated);
    });

    topParticipants = [...topParticipants, ...incompleteRanked];
  }

  const rewardBonus = async (participant, type, spPoints) => {
    if (!participant || spPoints <= 0) return;
    const student = await Student.findById(participant.studentId);
    if (!student) return;

    const sessionLabel = challenge.name;
    const reason = `Challenge ${type === 'winner' ? 'Winner' : type === 'runner_up' ? 'Runner-Up' : 'Third Place'} Bonus: +${spPoints} SP for "${challenge.name}"`;

    const balanceAfter = student.totalSp + spPoints;
    await SPTransaction.create({
      email: student.email,
      studentId: student._id,
      category: 'challenge',
      sessionLabel,
      deltaMode: 'absolute',
      deltaValue: spPoints,
      appliedDelta: spPoints,
      balanceAfter,
      reason,
      dateTime: new Date()
    });

    student.totalSp = balanceAfter;
    if (balanceAfter > student.highestSpEver) {
      student.highestSpEver = balanceAfter;
    }
    await student.save();

    await ChallengeReward.create({
      challengeId,
      studentId: student._id,
      email: student.email,
      type,
      spPoints,
      isAcknowledged: false
    });
  };

  if (topParticipants[0]) await rewardBonus(topParticipants[0], 'winner', challenge.winnerBonus);
  if (topParticipants[1]) await rewardBonus(topParticipants[1], 'runner_up', challenge.runnerUpBonus);
  if (topParticipants[2]) await rewardBonus(topParticipants[2], 'third', challenge.thirdBonus);

  // Write to ChallengeLeaderboard
  await ChallengeLeaderboard.deleteMany({ challengeId });
  const standings = [];
  for (let i = 0; i < topParticipants.length; i++) {
    const p = topParticipants[i];
    const student = await Student.findById(p.studentId).lean();
    if (!student) continue;

    let spEarned = p.status === 'completed' ? challenge.spPoints : 0;
    if (i === 0 && challenge.winnerBonus > 0) spEarned += challenge.winnerBonus;
    if (i === 1 && challenge.runnerUpBonus > 0) spEarned += challenge.runnerUpBonus;
    if (i === 2 && challenge.thirdBonus > 0) spEarned += challenge.thirdBonus;

    standings.push({
      challengeId,
      studentId: p.studentId,
      email: p.email,
      name: student.name,
      progressPct: p.progressPct ?? (p.status === 'completed' ? 100 : 0),
      completionPct: p.status === 'completed' ? 100 : (p.progressPct ?? 0),
      spEarned,
      rank: i + 1,
      lastUpdated: new Date()
    });
  }

  if (standings.length > 0) {
    await ChallengeLeaderboard.insertMany(standings);
  }
}

async function lazyCheckChallenges() {
  try {
    const now = new Date();
    // Auto-activate upcoming challenges
    await Challenge.updateMany(
      { status: 'upcoming', startDate: { $lte: now } },
      { $set: { status: 'active' } }
    );
    
    // Process expired active challenges
    const expired = await Challenge.find({
      status: 'active',
      endDate: { $lte: now },
      isRewarded: false
    });

    for (const ch of expired) {
      await rewardChallengeWinners(ch._id);
    }
  } catch (err) {
    console.error('lazyCheckChallenges failed:', err?.message);
  }
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

  const categoryTotals = ['initial', 'attendance', 'poll', 'manual', 'challenge'].map(category => {
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

// --- Challenge Student APIs ---

// 1. Get active and upcoming challenges
api.get('/challenges', authenticateStudent, async (req, res) => {
  try {
    await lazyCheckChallenges();
    const challenges = await Challenge.find({ status: { $ne: 'completed' } }).sort({ startDate: 1 }).lean();
    
    const participations = await ChallengeParticipant.find({
      studentId: req.student._id,
      challengeId: { $in: challenges.map(c => c._id) }
    }).lean();
    
    const partMap = new Map(participations.map(p => [String(p.challengeId), p]));
    
    const progressList = await ChallengeProgress.find({
      studentId: req.student._id,
      challengeId: { $in: challenges.map(c => c._id) }
    }).lean();
    const progMap = new Map(progressList.map(p => [String(p.challengeId), p]));

    const results = challenges.map(ch => {
      const part = partMap.get(String(ch._id));
      const prog = progMap.get(String(ch._id));
      return {
        ...ch,
        enrollmentStatus: part ? part.status : 'not_joined',
        completedTasks: prog ? prog.completedTasks : 0,
        progressPct: prog ? prog.progressPct : 0
      };
    });

    res.json({ challenges: results });
  } catch (error) {
    console.error('Failed to get challenges:', error);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

// 2. Get completed challenges for history view
api.get('/challenges/completed', authenticateStudent, async (req, res) => {
  try {
    await lazyCheckChallenges();
    const participations = await ChallengeParticipant.find({
      studentId: req.student._id,
      status: 'completed'
    }).populate('challengeId').sort({ completedAt: -1 }).lean();

    const rewards = await ChallengeReward.find({
      studentId: req.student._id,
      challengeId: { $in: participations.map(p => p.challengeId?._id).filter(Boolean) }
    }).lean();
    
    const rewardsMap = new Map();
    for (const r of rewards) {
      const key = `${r.challengeId}|${r.type}`;
      rewardsMap.set(key, r);
    }

    const results = participations.map(p => {
      const ch = p.challengeId || {};
      const winReward = rewardsMap.get(`${ch._id}|winner`);
      const ruReward = rewardsMap.get(`${ch._id}|runner_up`);
      const tReward = rewardsMap.get(`${ch._id}|third`);
      
      let badgeAwarded = ch.rewardBadge || '';
      let bonusSp = 0;
      let placement = 'Participant';

      if (winReward) { placement = 'Winner 🥇'; bonusSp = winReward.spPoints; }
      else if (ruReward) { placement = 'Runner-up 🥈'; bonusSp = ruReward.spPoints; }
      else if (tReward) { placement = 'Third Place 🥉'; bonusSp = tReward.spPoints; }

      return {
        _id: p._id,
        challengeId: ch._id,
        name: ch.name,
        type: ch.type,
        banner: ch.banner,
        completedAt: p.completedAt,
        spEarned: ch.spPoints + bonusSp,
        badgeAwarded,
        placement,
        colorTheme: ch.colorTheme
      };
    });

    res.json({ completedChallenges: results });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch completed challenges' });
  }
});

// 3. Get specific challenge details, leaderboard, and progress
api.get('/challenges/:id', authenticateStudent, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id).lean();
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const [participant, progress, totalParticipants] = await Promise.all([
      ChallengeParticipant.findOne({ challengeId: challenge._id, studentId: req.student._id }).lean(),
      ChallengeProgress.findOne({ challengeId: challenge._id, studentId: req.student._id }).lean(),
      ChallengeParticipant.countDocuments({ challengeId: challenge._id, status: { $ne: 'left' } })
    ]);

    let leaderboard = [];
    if (challenge.status === 'completed') {
      leaderboard = await ChallengeLeaderboard.find({ challengeId: challenge._id }).sort({ rank: 1 }).lean();
    } else {
      const allParts = await ChallengeParticipant.find({ challengeId: challenge._id, status: { $ne: 'left' } }).lean();
      const allProgress = await ChallengeProgress.find({ challengeId: challenge._id }).lean();
      const progMap = new Map(allProgress.map(p => [String(p.studentId), p]));
      
      const students = await Student.find({ _id: { $in: allParts.map(p => p.studentId) } }).lean();
      const studentMap = new Map(students.map(s => [String(s._id), s]));

      const ranked = allParts.map(p => {
        const prog = progMap.get(String(p.studentId));
        const student = studentMap.get(String(p.studentId));
        return {
          studentId: p.studentId,
          email: p.email,
          name: student ? student.name : 'Unknown Student',
          progressPct: prog ? prog.progressPct : 0,
          completionPct: p.status === 'completed' ? 100 : (prog ? prog.progressPct : 0),
          lastUpdated: prog ? prog.lastUpdated : p.joinedAt,
          joinedAt: p.joinedAt,
          status: p.status
        };
      });

      const completedMap = new Map(allParts.map(p => [String(p.studentId), p.completedAt]));
      
      ranked.sort((a, b) => {
        const aComp = a.status === 'completed';
        const bComp = b.status === 'completed';
        if (aComp && !bComp) return -1;
        if (!aComp && bComp) return 1;
        if (aComp && bComp) {
          const aTime = completedMap.get(String(a.studentId)) || a.joinedAt;
          const bTime = completedMap.get(String(b.studentId)) || b.joinedAt;
          return new Date(aTime) - new Date(bTime);
        }
        if (b.progressPct !== a.progressPct) return b.progressPct - a.progressPct;
        return new Date(a.lastUpdated) - new Date(b.lastUpdated);
      });

      leaderboard = ranked.map((r, i) => ({
        studentId: r.studentId,
        email: r.email,
        name: r.name,
        progressPct: r.progressPct,
        completionPct: r.completionPct,
        spEarned: r.status === 'completed' ? challenge.spPoints : 0,
        rank: i + 1
      }));
    }

    const feed = [];
    const allProgressLogs = await ChallengeProgress.find({ challengeId: challenge._id })
      .populate('studentId', 'name')
      .lean();
    
    for (const p of allProgressLogs) {
      const studentName = p.studentId?.name || 'A student';
      for (const log of (p.history || [])) {
        let actionMsg = 'completed a task';
        if (log.action === 'quiz_complete') actionMsg = 'completed a quiz';
        else if (log.action === 'assignment_submit') actionMsg = 'submitted an assignment';
        else if (log.action === 'attendance_mark') actionMsg = 'marked attendance';
        else if (log.action === 'study_goal_complete') actionMsg = 'completed a study goal';
        else if (log.action === 'weekly_goal_complete') actionMsg = 'completed weekly goal';
        else if (log.action === 'study_session_finish') actionMsg = 'finished a study session';
        else if (log.action === 'reflection_upload') actionMsg = 'uploaded a reflection';

        feed.push({
          name: studentName,
          message: actionMsg,
          timestamp: log.timestamp || p.updatedAt
        });
      }
    }

    const joins = await ChallengeParticipant.find({ challengeId: challenge._id, status: { $ne: 'left' } })
      .populate('studentId', 'name')
      .limit(20)
      .lean();
    for (const j of joins) {
      feed.push({
        name: j.studentId?.name || 'A student',
        message: 'joined the challenge',
        timestamp: j.joinedAt
      });
    }

    feed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recentFeed = feed.slice(0, 25);

    res.json({
      challenge,
      enrollmentStatus: participant ? participant.status : 'not_joined',
      progress: progress ? {
        completedTasks: progress.completedTasks,
        targetTasks: progress.targetTasks,
        progressPct: progress.progressPct,
        history: progress.history
      } : null,
      totalParticipants,
      leaderboard: leaderboard.slice(0, 50),
      myRank: leaderboard.find(x => String(x.studentId) === String(req.student._id))?.rank || null,
      activityFeed: recentFeed
    });
  } catch (error) {
    console.error('Challenge details failed:', error);
    res.status(500).json({ error: 'Failed to fetch challenge details' });
  }
});

// 4. Join a challenge
api.post('/challenges/:id/join', authenticateStudent, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });
    
    if (challenge.status === 'completed' || challenge.endDate < new Date()) {
      return res.status(400).json({ error: 'This challenge has already completed.' });
    }
    if (challenge.status === 'paused') {
      return res.status(400).json({ error: 'This challenge is paused by administrator.' });
    }

    if (challenge.maxParticipants) {
      const activeCount = await ChallengeParticipant.countDocuments({ challengeId: challenge._id, status: 'joined' });
      if (activeCount >= challenge.maxParticipants) {
        return res.status(400).json({ error: 'Challenge is full. Maximum participant limit reached.' });
      }
    }

    let participant = await ChallengeParticipant.findOne({
      challengeId: challenge._id,
      studentId: req.student._id
    });

    if (participant) {
      if (participant.status === 'joined' || participant.status === 'completed') {
        return res.status(400).json({ error: 'You are already in this challenge.' });
      }
      participant.status = 'joined';
      participant.joinedAt = new Date();
      participant.leftAt = null;
      await participant.save();
    } else {
      participant = await ChallengeParticipant.create({
        challengeId: challenge._id,
        studentId: req.student._id,
        email: req.student.email,
        status: 'joined',
        joinedAt: new Date()
      });
    }

    await ChallengeProgress.findOneAndUpdate(
      { challengeId: challenge._id, studentId: req.student._id },
      {
        email: req.student.email,
        completedTasks: 0,
        targetTasks: challenge.tasksRequired,
        progressPct: 0,
        history: [],
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, participant });
  } catch (error) {
    console.error('Join challenge failed:', error);
    res.status(500).json({ error: 'Failed to join challenge' });
  }
});

// 5. Leave a challenge (only if not started yet)
api.post('/challenges/:id/leave', authenticateStudent, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    if (challenge.startDate <= new Date()) {
      return res.status(400).json({ error: 'You cannot leave a challenge that has already started.' });
    }

    const participant = await ChallengeParticipant.findOne({
      challengeId: challenge._id,
      studentId: req.student._id
    });

    if (!participant || participant.status === 'left') {
      return res.status(400).json({ error: 'You are not enrolled in this challenge.' });
    }

    participant.status = 'left';
    participant.leftAt = new Date();
    await participant.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to leave challenge' });
  }
});

// 6. Acknowledge reward (confirms celebration is seen)
api.post('/challenges/rewards/:rewardId/ack', authenticateStudent, async (req, res) => {
  try {
    const reward = await ChallengeReward.findOne({
      _id: req.params.rewardId,
      studentId: req.student._id
    });
    if (!reward) return res.status(404).json({ error: 'Reward not found or unauthorized' });

    reward.isAcknowledged = true;
    await reward.save();

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to acknowledge reward' });
  }
});

// 7. Activity Trigger API (Simulation Tool for Automatic Progress Updates)
api.post('/activities/trigger', authenticateStudent, async (req, res) => {
  try {
    const { eventType } = req.body || {};
    const validEvents = ['quiz_complete', 'assignment_submit', 'attendance_mark', 'study_goal_complete', 'weekly_goal_complete', 'study_session_finish', 'reflection_upload'];
    if (!eventType || !validEvents.includes(eventType)) {
      return res.status(400).json({ error: 'Invalid event type' });
    }

    const now = new Date();
    const joined = await ChallengeParticipant.find({
      studentId: req.student._id,
      status: 'joined'
    }).lean();

    const challengeIds = joined.map(p => p.challengeId);
    
    const activeChallenges = await Challenge.find({
      _id: { $in: challengeIds },
      status: 'active',
      startDate: { $lte: now },
      endDate: { $gte: now },
      'completionCriteria.eventType': eventType
    });

    const updates = [];

    for (const ch of activeChallenges) {
      const progress = await ChallengeProgress.findOne({
        challengeId: ch._id,
        studentId: req.student._id
      });
      if (!progress || progress.completedTasks >= ch.tasksRequired) continue;

      progress.completedTasks += 1;
      progress.progressPct = Math.min(100, Math.round((progress.completedTasks / ch.tasksRequired) * 100));
      progress.history.push({
        action: eventType,
        value: 1,
        timestamp: new Date()
      });
      progress.lastUpdated = new Date();
      await progress.save();

      updates.push({
        challengeName: ch.name,
        completedTasks: progress.completedTasks,
        targetTasks: ch.tasksRequired,
        progressPct: progress.progressPct
      });

      if (progress.completedTasks === ch.tasksRequired) {
        await ChallengeParticipant.updateOne(
          { challengeId: ch._id, studentId: req.student._id },
          { $set: { status: 'completed', completedAt: new Date() } }
        );

        if (ch.spPoints > 0) {
          const sessionLabel = ch.name;
          const reason = `Challenge Completion: +${ch.spPoints} SP for completing "${ch.name}"`;
          const balanceAfter = req.student.totalSp + ch.spPoints;

          await SPTransaction.create({
            email: req.student.email,
            studentId: req.student._id,
            category: 'challenge',
            sessionLabel,
            deltaMode: 'absolute',
            deltaValue: ch.spPoints,
            appliedDelta: ch.spPoints,
            balanceAfter,
            reason,
            dateTime: new Date()
          });

          await ChallengeReward.create({
            challengeId: ch._id,
            studentId: req.student._id,
            email: req.student.email,
            type: 'completion',
            spPoints: ch.spPoints,
            isAcknowledged: false
          });

          req.student.totalSp = balanceAfter;
          if (balanceAfter > req.student.highestSpEver) {
            req.student.highestSpEver = balanceAfter;
          }
          await req.student.save();
        }

        if (ch.rewardBadge) {
          await ChallengeReward.create({
            challengeId: ch._id,
            studentId: req.student._id,
            email: req.student.email,
            type: 'badge',
            badge: ch.rewardBadge,
            isAcknowledged: false
          });
        }
      }
    }

    res.json({ success: true, updates });
  } catch (error) {
    console.error('Failed to trigger activity event:', error);
    res.status(500).json({ error: 'Failed to process activity event' });
  }
});

// --- Challenge Admin APIs ---

// 1. Create challenge (Admin only)
api.post('/challenges', adminGuard, async (req, res) => {
  try {
    const {
      name, description, banner, type, startDate, endDate, maxParticipants,
      eligibilityRules, difficulty, tasksRequired, completionCriteria, rewardBadge,
      spPoints, winnerBonus, runnerUpBonus, thirdBonus, colorTheme
    } = req.body || {};

    if (!name || !type || !startDate || !endDate || !completionCriteria?.eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const challenge = await Challenge.create({
      name,
      description: description || '',
      banner: banner || '🏆',
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      maxParticipants: maxParticipants ? Number(maxParticipants) : null,
      eligibilityRules: eligibilityRules || '',
      difficulty: difficulty || 'Easy',
      tasksRequired: tasksRequired ? Number(tasksRequired) : 1,
      completionCriteria,
      rewardBadge: rewardBadge || '',
      spPoints: spPoints ? Number(spPoints) : 0,
      winnerBonus: winnerBonus ? Number(winnerBonus) : 0,
      runnerUpBonus: runnerUpBonus ? Number(runnerUpBonus) : 0,
      thirdBonus: thirdBonus ? Number(thirdBonus) : 0,
      colorTheme: colorTheme || 'linear-gradient(135deg, #176b87, #0f4d62)',
      status: 'upcoming',
      isRewarded: false
    });

    res.json({ success: true, challenge });
  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

// 2. Update/Edit challenge details (Admin only)
api.put('/challenges/:id', adminGuard, async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    const fields = [
      'name', 'description', 'banner', 'type', 'startDate', 'endDate', 'maxParticipants',
      'eligibilityRules', 'difficulty', 'tasksRequired', 'completionCriteria', 'rewardBadge',
      'spPoints', 'winnerBonus', 'runnerUpBonus', 'thirdBonus', 'colorTheme', 'status'
    ];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        if (f === 'startDate' || f === 'endDate') challenge[f] = new Date(req.body[f]);
        else challenge[f] = req.body[f];
      }
    }

    await challenge.save();
    res.json({ success: true, challenge });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update challenge' });
  }
});

// 3. Delete challenge (Admin only)
api.delete('/challenges/:id', adminGuard, async (req, res) => {
  try {
    const challengeId = req.params.id;
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    await Promise.all([
      Challenge.deleteOne({ _id: challengeId }),
      ChallengeParticipant.deleteMany({ challengeId }),
      ChallengeProgress.deleteMany({ challengeId }),
      ChallengeLeaderboard.deleteMany({ challengeId }),
      ChallengeReward.deleteMany({ challengeId })
    ]);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete challenge' });
  }
});

// 4. Force Reward Winners (Admin only)
api.post('/challenges/:id/reward', adminGuard, async (req, res) => {
  try {
    const challengeId = req.params.id;
    const challenge = await Challenge.findById(challengeId);
    if (!challenge) return res.status(404).json({ error: 'Challenge not found' });

    if (challenge.isRewarded) {
      return res.status(400).json({ error: 'This challenge has already been rewarded.' });
    }

    await rewardChallengeWinners(challengeId);
    res.json({ success: true });
  } catch (error) {
    console.error('Manual reward winners failed:', error);
    res.status(500).json({ error: 'Failed to reward winners' });
  }
});

// 5. View Participants and Progress (Admin only)
api.get('/admin/challenges/:id/participants', adminGuard, async (req, res) => {
  try {
    const challengeId = req.params.id;
    const participants = await ChallengeParticipant.find({ challengeId, status: { $ne: 'left' } }).lean();
    const progressList = await ChallengeProgress.find({ challengeId }).lean();
    const progressMap = new Map(progressList.map(p => [String(p.studentId), p]));
    
    const students = await Student.find({ _id: { $in: participants.map(p => p.studentId) } }).lean();
    const studentMap = new Map(students.map(s => [String(s._id), s]));

    const result = participants.map(p => {
      const prog = progressMap.get(String(p.studentId));
      const student = studentMap.get(String(p.studentId));
      return {
        _id: p._id,
        studentId: p.studentId,
        email: p.email,
        name: student ? student.name : 'Unknown student',
        status: p.status,
        joinedAt: p.joinedAt,
        completedAt: p.completedAt,
        completedTasks: prog ? prog.completedTasks : 0,
        progressPct: prog ? prog.progressPct : 0
      };
    });

    res.json({ participants: result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch challenge participants' });
  }
});

// 6. View Challenge Analytics (Admin only)
api.get('/admin/challenges/analytics', adminGuard, async (req, res) => {
  try {
    const [challenges, participants, progressLogs, rewards, studentsCount] = await Promise.all([
      Challenge.find().lean(),
      ChallengeParticipant.find({ status: { $ne: 'left' } }).lean(),
      ChallengeProgress.find().lean(),
      ChallengeReward.find().lean(),
      Student.countDocuments({ status: 'active' })
    ]);

    const activeChallenges = challenges.filter(c => c.status === 'active').length;
    const totalCompletions = participants.filter(p => p.status === 'completed').length;
    const totalParticipationCount = participants.length;

    const participationRate = studentsCount > 0 ? Math.round((totalParticipationCount / studentsCount) * 100) : 0;
    
    const totalProgPct = progressLogs.reduce((sum, p) => sum + p.progressPct, 0);
    const averageProgress = totalParticipationCount > 0 ? Math.round(totalProgPct / totalParticipationCount) : 0;

    const challengeCounts = {};
    for (const p of participants) {
      challengeCounts[p.challengeId] = (challengeCounts[p.challengeId] || 0) + 1;
    }
    let mostPopularId = null;
    let maxCount = 0;
    for (const [id, count] of Object.entries(challengeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostPopularId = id;
      }
    }
    const mostPopular = mostPopularId ? challenges.find(c => String(c._id) === mostPopularId)?.name : 'None';

    const totalSpAwarded = rewards.reduce((sum, r) => sum + r.spPoints, 0);
    const standardRewards = rewards.filter(r => r.type === 'completion').reduce((sum, r) => sum + r.spPoints, 0);
    const bonusRewards = rewards.filter(r => ['winner', 'runner_up', 'third'].includes(r.type)).reduce((sum, r) => sum + r.spPoints, 0);

    res.json({
      activeChallenges,
      totalCompletions,
      participationRate,
      completionRate: totalParticipationCount > 0 ? Math.round((totalCompletions / totalParticipationCount) * 100) : 0,
      averageProgress,
      mostPopularChallenge: mostPopular,
      rewardDistribution: {
        totalSpAwarded,
        standardRewards,
        bonusRewards
      }
    });
  } catch (error) {
    console.error('Analytics aggregation failed:', error);
    res.status(500).json({ error: 'Failed to fetch challenge analytics' });
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


