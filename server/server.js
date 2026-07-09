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
import Question from './models/Question.js';
import { leagueBand, levelFor, legendBadge, leaderboardGroup, groupLabel } from './services/levels.js';
import {
  getSpamReports,
  saveSpamReport,
  updateSpamReportStatus,
  getDuplicates,
  saveDuplicate,
  removeDuplicate,
  getModerationLogs,
  logModerationAction,
  removeSpamReportsForQuestion,
  removeSpamReportsForAnswer
} from './services/moderation.js';

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

async function awardSp(student, delta, category, reason, sessionLabel = '', dateTime = new Date()) {
  const email = student.email.toLowerCase();
  const updatedStudent = await Student.findOneAndUpdate(
    { _id: student._id },
    { $inc: { totalSp: delta } },
    { new: true }
  );
  if (!updatedStudent) {
    throw new Error('Student not found for SP update');
  }
  if (updatedStudent.totalSp > (updatedStudent.highestSpEver || 0)) {
    updatedStudent.highestSpEver = updatedStudent.totalSp;
    await updatedStudent.save();
  }
  const txn = await SPTransaction.create({
    email,
    studentId: student._id,
    category,
    sessionLabel,
    deltaMode: 'absolute',
    deltaValue: delta,
    appliedDelta: delta,
    balanceAfter: updatedStudent.totalSp,
    reason,
    dateTime
  });
  return txn;
}

async function checkAndAwardPerfectWeekBonus(student) {
  const emails = [student.email];
  if (student.alternateEmail) {
    emails.push(student.alternateEmail);
  }
  const transactions = await SPTransaction.find({
    email: { $in: emails.map(e => e.toLowerCase()) }
  }).sort({ dateTime: 1, createdAt: 1 }).lean();

  const dailySp = {};
  const existingBonusDates = new Set();

  for (const tx of transactions) {
    const isPerfectWeekBonus = tx.category === 'manual' && tx.reason && tx.reason.includes('Perfect Week Bonus');
    if (isPerfectWeekBonus) {
      const match = tx.reason.match(/ending (\d{4}-\d{2}-\d{2})/);
      if (match) {
        existingBonusDates.add(match[1]);
      }
      continue;
    }
    if (tx.category === 'initial') {
      continue;
    }
    const dateStr = getISTDateStr(tx.dateTime);
    if (dateStr) {
      dailySp[dateStr] = (dailySp[dateStr] || 0) + (tx.appliedDelta || 0);
    }
  }

  const startDateStr = getISTDateStr(student.internshipStartDate);
  const todayStr = getISTDateStr(new Date());

  if (!startDateStr || !todayStr) return { currentStreak: 0, bonusesAwarded: 0 };

  const start = new Date(startDateStr);
  const end = new Date(todayStr);

  const days = [];
  let curr = new Date(start);
  while (curr <= end) {
    const dateStr = curr.toISOString().split('T')[0];
    const spEarned = dailySp[dateStr] || 0;
    days.push({
      dateStr,
      success: spEarned >= 20
    });
    curr.setDate(curr.getDate() + 1);
  }

  let currentStreak = 0;
  let activeRuns = [];
  let currentRun = [];

  for (const day of days) {
    if (day.success) {
      currentRun.push(day.dateStr);
    } else {
      if (currentRun.length > 0) {
        activeRuns.push(currentRun);
        currentRun = [];
      }
    }
  }
  if (currentRun.length > 0) {
    activeRuns.push(currentRun);
  }

  let newlyAwardedCount = 0;
  for (const run of activeRuns) {
    const runLength = run.length;
    const numBonuses = Math.floor(runLength / 7);
    for (let i = 1; i <= numBonuses; i++) {
      const bonusDayIndex = i * 7 - 1;
      const bonusEndDateStr = run[bonusDayIndex];

      if (!existingBonusDates.has(bonusEndDateStr)) {
        await awardSp(
          student,
          5, // +5 SP Perfect Week Bonus
          'manual',
          `Perfect Week Bonus: 7 consecutive days ending ${bonusEndDateStr}`,
          '',
          new Date(bonusEndDateStr + 'T12:00:00Z')
        );
        existingBonusDates.add(bonusEndDateStr);
        newlyAwardedCount++;
      }
    }
  }

  if (days.length > 0) {
    const lastDay = days[days.length - 1];
    if (lastDay.success) {
      const lastRun = activeRuns[activeRuns.length - 1] || [];
      currentStreak = lastRun.length;
    } else if (days.length > 1) {
      const yesterday = days[days.length - 2];
      if (yesterday.success) {
        const lastRun = activeRuns.find(run => run.includes(yesterday.dateStr)) || [];
        currentStreak = lastRun.length;
      } else {
        currentStreak = 0;
      }
    } else {
      currentStreak = 0;
    }
  }

  const totalBonusesCount = existingBonusDates.size;

  return {
    currentStreak,
    bonusesAwarded: totalBonusesCount,
    newlyAwardedCount
  };
}

async function studentPayload(student) {
  const streakInfo = await checkAndAwardPerfectWeekBonus(student);
  const freshStudent = await Student.findById(student._id).lean();

  const email = freshStudent.email;
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
  const highestSpEver = Math.max(Number(freshStudent.highestSpEver) || 0, Number(freshStudent.totalSp) || 0);
  const myGroup = leaderboardGroup(freshStudent.internshipStartDate);
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
      _id: String(freshStudent._id),
      name: freshStudent.name,
      email: freshStudent.email,
      alternateEmail: freshStudent.alternateEmail,
      internshipStartDate: freshStudent.internshipStartDate,
      internshipEndDate: freshStudent.internshipEndDate,
      status: freshStudent.status || 'active',
      excusedAt: freshStudent.excusedAt,
      excusedReason: freshStudent.excusedReason,
      totalSp: freshStudent.totalSp,
      rank: rankInfo?.rank || null,
      cohortSize: rankInfo?.cohortSize || null,
      highestSpEver,
      level: levelFor(highestSpEver),
      trophyLeague: leagueBand(freshStudent.totalSp),
      legendBadgeUnlocked: legendBadge(highestSpEver),
      leaderboardGroup: myGroup,
      leaderboardGroupLabel: groupLabel(myGroup),
      surveyCompleted: Boolean(freshStudent.surveyCompleted),
      poll2Completed: Boolean(freshStudent.poll2Completed),
      streak: streakInfo.currentStreak,
      bonusesAwarded: streakInfo.bonusesAwarded
    },
    transactions,
    polls,
    attendance,
    cohort: {
      averageSp,
      top10Cutoff,
      top50Cutoff,
      pointsToTop50: top50Cutoff === null ? null : Math.max(0, top50Cutoff - freshStudent.totalSp + 1),
      pointsToNextRank: nextStudent ? Math.max(1, nextStudent.totalSp - freshStudent.totalSp + 1) : 0
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

// --- Motivation Dashboard Endpoints ---
function getISTDateStr(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  // Shift by 5.5 hours to IST
  const localTime = d.getTime() + 19800000;
  return new Date(localTime).toISOString().split('T')[0];
}

api.get('/growth-tree/:studentId', async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const streakInfo = await checkAndAwardPerfectWeekBonus(student);

    const emails = [student.email];
    if (student.alternateEmail) {
      emails.push(student.alternateEmail);
    }
    const transactions = await SPTransaction.find({
      email: { $in: emails.map(e => e.toLowerCase()) }
    }).sort({ dateTime: 1, createdAt: 1 }).lean();

    const dailySp = {};
    for (const tx of transactions) {
      const isPerfectWeekBonus = tx.category === 'manual' && tx.reason && tx.reason.includes('Perfect Week Bonus');
      if (isPerfectWeekBonus || tx.category === 'initial') {
        continue;
      }
      const dateStr = getISTDateStr(tx.dateTime);
      if (dateStr) {
        dailySp[dateStr] = (dailySp[dateStr] || 0) + (tx.appliedDelta || 0);
      }
    }

    const startDateStr = getISTDateStr(student.internshipStartDate);
    const todayStr = getISTDateStr(new Date());

    if (!startDateStr || !todayStr) {
      return res.status(400).json({ error: 'Invalid start date or current date' });
    }

    const start = new Date(startDateStr);
    const end = new Date(todayStr);

    let successfulDays = 0;
    let totalDays = 0;
    let curr = new Date(start);
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];
      const sp = dailySp[dateStr] || 0;
      if (sp >= 20) {
        successfulDays++;
      }
      totalDays++;
      curr.setDate(curr.getDate() + 1);
    }

    res.json({
      studentId: student._id,
      successfulDays,
      totalDays,
      growthStage: successfulDays,
      hasFlowers: successfulDays >= 7,
      hasFruits: successfulDays >= 30,
      streak: streakInfo.currentStreak,
      bonusesAwarded: streakInfo.bonusesAwarded
    });
  } catch (err) {
    console.error('growth-tree error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.get('/chain-calendar/:studentId', async (req, res) => {
  try {
    const student = await Student.findById(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const streakInfo = await checkAndAwardPerfectWeekBonus(student);

    const emails = [student.email];
    if (student.alternateEmail) {
      emails.push(student.alternateEmail);
    }
    const transactions = await SPTransaction.find({
      email: { $in: emails.map(e => e.toLowerCase()) }
    }).sort({ dateTime: 1, createdAt: 1 }).lean();

    const dailySp = {};
    for (const tx of transactions) {
      const isPerfectWeekBonus = tx.category === 'manual' && tx.reason && tx.reason.includes('Perfect Week Bonus');
      if (isPerfectWeekBonus || tx.category === 'initial') {
        continue;
      }
      const dateStr = getISTDateStr(tx.dateTime);
      if (dateStr) {
        dailySp[dateStr] = (dailySp[dateStr] || 0) + (tx.appliedDelta || 0);
      }
    }

    const startDateStr = getISTDateStr(student.internshipStartDate);
    const todayStr = getISTDateStr(new Date());

    if (!startDateStr || !todayStr) {
      return res.status(400).json({ error: 'Invalid start date or current date' });
    }

    const start = new Date(startDateStr);
    const end = new Date(todayStr);

    const calendarDays = [];
    let curr = new Date(start);
    while (curr <= end) {
      const dateStr = curr.toISOString().split('T')[0];
      const spEarned = dailySp[dateStr] || 0;
      calendarDays.push({
        date: dateStr,
        spEarned,
        success: spEarned >= 20
      });
      curr.setDate(curr.getDate() + 1);
    }

    res.json({
      studentId: student._id,
      calendarDays,
      streak: streakInfo.currentStreak,
      bonusesAwarded: streakInfo.bonusesAwarded
    });
  } catch (err) {
    console.error('chain-calendar error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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

// --- Doubt Discussion Endpoints ---
async function authGuard(req, res, next) {
  try {
    const adminOk = isAdmin(req);
    if (adminOk) {
      req.isAdmin = true;
      return next();
    }
    const email = await studentEmailFromRequest(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });
    const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] });
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (student.status === 'excused') return res.status(403).json({ error: 'Account excused' });
    req.student = student;
    req.isAdmin = false;
    next();
  } catch (err) {
    console.error('authGuard error:', err);
    res.status(500).json({ error: 'Authentication internal error' });
  }
}

api.get('/doubts', authGuard, async (req, res) => {
  try {
    const { q, tag, showSpam } = req.query;
    const filter = {};
    if (!req.isAdmin || showSpam !== 'true') {
      filter.isSpam = false;
    }
    if (tag) {
      filter.tags = tag;
    }
    if (q) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { tags: { $regex: escaped, $options: 'i' } }
      ];
    }
    const questions = await Question.find(filter).sort({ pinned: -1, createdAt: -1 }).lean();
    
    // Merge duplicate info
    const duplicates = getDuplicates();
    const questionsWithDups = questions.map(question => {
      const dup = duplicates.find(d => d.questionId === question._id.toString());
      return dup ? { ...question, duplicateInfo: dup } : question;
    });

    res.json(questionsWithDups);
  } catch (err) {
    console.error('get doubts error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.get('/doubts/:id', authGuard, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id).lean();
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.isSpam && !req.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const duplicates = getDuplicates();
    const dup = duplicates.find(d => d.questionId === question._id.toString());
    const questionWithDup = dup ? { ...question, duplicateInfo: dup } : question;
    res.json(questionWithDup);
  } catch (err) {
    console.error('get doubt detail error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can ask questions' });
    const { title, description, tags } = req.body || {};
    if (!title || !description) return res.status(400).json({ error: 'Title and description required' });

    const question = await Question.create({
      title,
      description,
      tags: tags || [],
      author: {
        email: req.student.email,
        name: req.student.name
      }
    });

    const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
    await awardSp(
      req.student,
      1,
      'manual',
      `Doubt Discussion: Asked a question (Title: "${shortTitle}")`
    );

    res.status(201).json(question);
  } catch (err) {
    console.error('create doubt error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/answers', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can answer questions' });
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: 'Answer body is required' });

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    if (question.isSpam) return res.status(400).json({ error: 'Cannot answer spam question' });

    question.answers.push({
      body,
      author: {
        email: req.student.email,
        name: req.student.name
      }
    });

    await question.save();
    res.status(201).json(question);
  } catch (err) {
    console.error('add answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.put('/doubts/:id/answers/:answerId', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can edit answers' });
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: 'Answer body is required' });

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const emailMatch = answer.author.email === req.student.email.toLowerCase() ||
                       (req.student.alternateEmail && answer.author.email === req.student.alternateEmail.toLowerCase());
    if (!emailMatch) {
      return res.status(403).json({ error: 'Cannot edit someone else\'s answer' });
    }

    answer.body = body;
    await question.save();
    res.json(question);
  } catch (err) {
    console.error('edit answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/answers/:answerId/comments', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can comment' });
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ error: 'Comment body is required' });

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    answer.comments.push({
      body,
      author: {
        email: req.student.email,
        name: req.student.name
      }
    });

    await question.save();
    res.status(201).json(question);
  } catch (err) {
    console.error('add comment error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/answers/:answerId/accept', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can accept answers' });

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const emailMatch = question.author.email === req.student.email.toLowerCase() ||
                       (req.student.alternateEmail && question.author.email === req.student.alternateEmail.toLowerCase());
    if (!emailMatch) {
      return res.status(403).json({ error: 'Only the question author can accept answers' });
    }

    const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;

    const prevAccepted = question.answers.find(a => a.isAccepted);
    if (prevAccepted) {
      if (prevAccepted._id.toString() === req.params.answerId) {
        return res.json(question);
      }
      prevAccepted.isAccepted = false;
      const prevContributor = await Student.findOne({
        $or: [{ email: prevAccepted.author.email }, { alternateEmail: prevAccepted.author.email }]
      });
      if (prevContributor) {
        await awardSp(
          prevContributor,
          -3,
          'manual',
          `Doubt Discussion: Answer unaccepted (Title: "${shortTitle}")`
        );
      }
    }

    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });
    answer.isAccepted = true;
    await question.save();

    const contributor = await Student.findOne({
      $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
    });
    if (contributor) {
      await awardSp(
        contributor,
        3,
        'manual',
        `Doubt Discussion: Answer accepted (Title: "${shortTitle}")`
      );
    }

    res.json(question);
  } catch (err) {
    console.error('accept answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/answers/:answerId/unaccept', authGuard, async (req, res) => {
  try {
    if (!req.student) return res.status(403).json({ error: 'Only students can unaccept answers' });

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const emailMatch = question.author.email === req.student.email.toLowerCase() ||
                       (req.student.alternateEmail && question.author.email === req.student.alternateEmail.toLowerCase());
    if (!emailMatch) {
      return res.status(403).json({ error: 'Only the question author can unaccept answers' });
    }

    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.isAccepted) {
      answer.isAccepted = false;
      await question.save();

      const contributor = await Student.findOne({
        $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
      });
      if (contributor) {
        const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
        await awardSp(
          contributor,
          -3,
          'manual',
          `Doubt Discussion: Answer unaccepted (Title: "${shortTitle}")`
        );
      }
    }

    res.json(question);
  } catch (err) {
    console.error('unaccept answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/pin', adminGuard, async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, { pinned: true }, { new: true });
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('pin question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/unpin', adminGuard, async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, { pinned: false }, { new: true });
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (err) {
    console.error('unpin question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/spam', adminGuard, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    if (!question.isSpam) {
      question.isSpam = true;
      await question.save();

      const author = await Student.findOne({
        $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
      });
      if (author) {
        const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
        await awardSp(
          author,
          -2,
          'manual',
          `Doubt Discussion: Spam penalty (Title: "${shortTitle}")`
        );
      }
    }
    res.json(question);
  } catch (err) {
    console.error('spam question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

api.post('/doubts/:id/unspam', adminGuard, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    if (question.isSpam) {
      question.isSpam = false;
      await question.save();

      const author = await Student.findOne({
        $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
      });
      if (author) {
        const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
        await awardSp(
          author,
          2,
          'manual',
          `Doubt Discussion: Spam penalty refunded (Title: "${shortTitle}")`
        );
      }
    }
    res.json(question);
  } catch (err) {
    console.error('unspam question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Student flag question as spam
api.post('/doubts/:id/report', authGuard, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Create report
    const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const newReport = {
      id: reportId,
      postId: question._id.toString(),
      postType: 'question',
      reportedBy: req.student ? req.student.email : req.headers['x-admin-email'] || 'anonymous',
      reason: reason || 'Spam / Inappropriate content',
      status: 'pending',
      createdAt: new Date().toISOString(),
      content: {
        title: question.title,
        description: question.description,
        authorName: question.author.name,
        authorEmail: question.author.email
      }
    };
    saveSpamReport(newReport);
    res.status(201).json({ success: true, report: newReport });
  } catch (err) {
    console.error('report question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Student flag answer as spam
api.post('/doubts/:id/answers/:answerId/report', authGuard, async (req, res) => {
  try {
    const { reason } = req.body || {};
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    const answer = question.answers.id(req.params.answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    // Create report
    const reportId = 'rep_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const newReport = {
      id: reportId,
      postId: answer._id.toString(),
      questionId: question._id.toString(),
      postType: 'answer',
      reportedBy: req.student ? req.student.email : req.headers['x-admin-email'] || 'anonymous',
      reason: reason || 'Spam / Inappropriate content',
      status: 'pending',
      createdAt: new Date().toISOString(),
      content: {
        body: answer.body,
        authorName: answer.author.name,
        authorEmail: answer.author.email,
        questionTitle: question.title
      }
    };
    saveSpamReport(newReport);
    res.status(201).json({ success: true, report: newReport });
  } catch (err) {
    console.error('report answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Admin Doubt Forum stats & lists
api.get('/admin/doubt-forum', adminGuard, async (req, res) => {
  try {
    // Return all questions, sorted newest first
    const questions = await Question.find({}).sort({ createdAt: -1 }).lean();
    const duplicates = getDuplicates();

    // Calculate most active helpers based on accepted answers
    const helperCounts = {};
    for (const q of questions) {
      for (const a of q.answers) {
        if (a.isAccepted) {
          const email = a.author.email.toLowerCase();
          if (!helperCounts[email]) {
            helperCounts[email] = {
              name: a.author.name,
              email: a.author.email,
              acceptedCount: 0
            };
          }
          helperCounts[email].acceptedCount++;
        }
      }
    }
    const activeHelpers = Object.values(helperCounts).sort((a, b) => b.acceptedCount - a.acceptedCount);

    res.json({
      questions,
      duplicates,
      activeHelpers
    });
  } catch (err) {
    console.error('get admin doubt forum details error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Mark question as duplicate
api.post('/admin/doubt-forum/duplicate', adminGuard, async (req, res) => {
  try {
    const { questionId, originalQuestionId } = req.body;
    if (!questionId || !originalQuestionId) {
      return res.status(400).json({ error: 'questionId and originalQuestionId required' });
    }

    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const originalQuestion = await Question.findById(originalQuestionId);
    if (!originalQuestion) return res.status(404).json({ error: 'Original question not found' });

    // Save duplicate link
    saveDuplicate({
      questionId: questionId.toString(),
      originalQuestionId: originalQuestionId.toString(),
      originalTitle: originalQuestion.title,
      markedBy: req.headers['x-admin-email'] || 'admin',
      markedAt: new Date().toISOString()
    });

    // Deduct 1 SP from duplicate author
    const author = await Student.findOne({
      $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
    });
    if (author) {
      const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
      await awardSp(
        author,
        -1,
        'manual',
        `Doubt Discussion: Question marked as duplicate (Title: "${shortTitle}")`
      );
    }

    logModerationAction(
      'mark_duplicate',
      req.headers['x-admin-email'] || 'admin',
      questionId,
      'question',
      `Question "${question.title}" marked as duplicate of "${originalQuestion.title}"`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('mark duplicate error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Unmark duplicate
api.delete('/admin/doubt-forum/duplicate/:id', adminGuard, async (req, res) => {
  try {
    const questionId = req.params.id;
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    removeDuplicate(questionId);

    // Refund 1 SP to author
    const author = await Student.findOne({
      $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
    });
    if (author) {
      const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
      await awardSp(
        author,
        1,
        'manual',
        `Doubt Discussion: Duplicate question status removed (Title: "${shortTitle}")`
      );
    }

    logModerationAction(
      'unmark_duplicate',
      req.headers['x-admin-email'] || 'admin',
      questionId,
      'question',
      `Question "${question.title}" unmarked as duplicate`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('unmark duplicate error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete a question
api.delete('/admin/doubt-forum/question/:id', adminGuard, async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // If not marked spam, revert the +1 SP they got
    if (!question.isSpam) {
      const author = await Student.findOne({
        $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
      });
      if (author) {
        const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
        await awardSp(
          author,
          -1,
          'manual',
          `Doubt Discussion: Question deleted (Title: "${shortTitle}")`
        );
      }
    }

    // Also deduct SP from any accepted answer author (revert helper SP)
    for (const ans of question.answers) {
      if (ans.isAccepted) {
        const helper = await Student.findOne({
          $or: [{ email: ans.author.email }, { alternateEmail: ans.author.email }]
        });
        if (helper) {
          const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
          await awardSp(
            helper,
            -3,
            'manual',
            `Doubt Discussion: Accepted answer deleted due to question deletion (Title: "${shortTitle}")`
          );
        }
      }
    }

    // Clean up duplicates if this question was duplicate
    removeDuplicate(req.params.id);

    // Clean up spam reports
    removeSpamReportsForQuestion(req.params.id);

    // Delete the question
    await Question.findByIdAndDelete(req.params.id);

    logModerationAction(
      'delete_question',
      req.headers['x-admin-email'] || 'admin',
      req.params.id,
      'question',
      `Question "${question.title}" deleted by admin`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('delete question error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete an answer
api.delete('/admin/doubt-forum/question/:id/answers/:answerId', adminGuard, async (req, res) => {
  try {
    const { id, answerId } = req.params;
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    // If accepted, deduct 3 SP from answer author
    if (answer.isAccepted) {
      const helper = await Student.findOne({
        $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
      });
      if (helper) {
        const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
        await awardSp(
          helper,
          -3,
          'manual',
          `Doubt Discussion: Accepted answer deleted by admin (Title: "${shortTitle}")`
        );
      }
    }

    // Remove from reports
    removeSpamReportsForAnswer(answerId);

    // Delete answer
    question.answers.pull(answerId);
    await question.save();

    logModerationAction(
      'delete_answer',
      req.headers['x-admin-email'] || 'admin',
      answerId,
      'answer',
      `Answer by "${answer.author.name}" under question "${question.title}" deleted by admin`
    );

    res.json({ success: true });
  } catch (err) {
    console.error('delete answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Mentor/admin accept answer override
api.post('/admin/doubt-forum/question/:id/answers/:answerId/approve', adminGuard, async (req, res) => {
  try {
    const { id, answerId } = req.params;
    const question = await Question.findById(id);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;

    // Unaccept previously accepted answer if any
    const prevAccepted = question.answers.find(a => a.isAccepted);
    if (prevAccepted) {
      if (prevAccepted._id.toString() === answerId) {
        return res.json(question);
      }
      prevAccepted.isAccepted = false;
      const prevContributor = await Student.findOne({
        $or: [{ email: prevAccepted.author.email }, { alternateEmail: prevAccepted.author.email }]
      });
      if (prevContributor) {
        await awardSp(
          prevContributor,
          -3,
          'manual',
          `Doubt Discussion: Answer unaccepted (Title: "${shortTitle}")`
        );
      }
    }

    answer.isAccepted = true;
    await question.save();

    // Award 3 SP to helper
    const contributor = await Student.findOne({
      $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
    });
    if (contributor) {
      await awardSp(
        contributor,
        3,
        'manual',
        `Doubt Discussion: Answer accepted by admin override (Title: "${shortTitle}")`
      );
    }

    logModerationAction(
      'approve_accepted_answer',
      req.headers['x-admin-email'] || 'admin',
      answerId,
      'answer',
      `Answer by "${answer.author.name}" accepted by admin override under question "${question.title}"`
    );

    res.json(question);
  } catch (err) {
    console.error('admin approve answer error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Admin get spam reports & logs
api.get('/admin/spam-reports', adminGuard, async (req, res) => {
  try {
    res.json({
      reports: getSpamReports(),
      logs: getModerationLogs()
    });
  } catch (err) {
    console.error('get spam reports error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Admin approve spam report (-2 SP penalty)
api.post('/admin/spam-reports/:id/approve', adminGuard, async (req, res) => {
  try {
    const reportId = req.params.id;
    const reports = getSpamReports();
    const report = reports.find(r => r.id === reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report.status !== 'pending') {
      return res.status(400).json({ error: 'Report already resolved' });
    }

    const adminEmail = req.headers['x-admin-email'] || 'admin';

    if (report.postType === 'question') {
      const question = await Question.findById(report.postId);
      if (question) {
        if (!question.isSpam) {
          question.isSpam = true;
          await question.save();

          // Deduct 2 SP from question author
          const author = await Student.findOne({
            $or: [{ email: question.author.email }, { alternateEmail: question.author.email }]
          });
          if (author) {
            const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
            await awardSp(
              author,
              -2,
              'manual',
              `Doubt Discussion: Spam penalty (Title: "${shortTitle}")`
            );
          }
        }
      }
    } else if (report.postType === 'answer') {
      const question = await Question.findById(report.questionId);
      if (question) {
        const answer = question.answers.id(report.postId);
        if (answer) {
          // Deduct 2 SP from answer author
          const author = await Student.findOne({
            $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
          });
          if (author) {
            const shortBody = answer.body.length > 50 ? answer.body.substring(0, 50) + '...' : answer.body;
            await awardSp(
              author,
              -2,
              'manual',
              `Doubt Discussion: Spam answer penalty (Body: "${shortBody}")`
            );
          }

          // If the answer was accepted, also deduct the 3 SP helper reward
          if (answer.isAccepted) {
            const helper = await Student.findOne({
              $or: [{ email: answer.author.email }, { alternateEmail: answer.author.email }]
            });
            if (helper) {
              const shortTitle = question.title.length > 50 ? question.title.substring(0, 50) + '...' : question.title;
              await awardSp(
                helper,
                -3,
                'manual',
                `Doubt Discussion: Answer unaccepted due to spam (Title: "${shortTitle}")`
              );
            }
          }

          // Remove answer
          question.answers.pull(report.postId);
          await question.save();
        }
      }
    }

    // Update status
    const updatedReport = updateSpamReportStatus(reportId, 'approved');

    // Log moderation action
    logModerationAction(
      'approve_spam',
      adminEmail,
      report.postId,
      report.postType,
      `Spam report for ${report.postType} approved. Author penalized -2 SP.`
    );

    res.json({ success: true, report: updatedReport });
  } catch (err) {
    console.error('approve spam error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Admin reject spam report
api.post('/admin/spam-reports/:id/reject', adminGuard, async (req, res) => {
  try {
    const reportId = req.params.id;
    const reports = getSpamReports();
    const report = reports.find(r => r.id === reportId);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (report.status !== 'pending') {
      return res.status(400).json({ error: 'Report already resolved' });
    }

    const adminEmail = req.headers['x-admin-email'] || 'admin';

    // Update status
    const updatedReport = updateSpamReportStatus(reportId, 'rejected');

    // Log moderation action
    logModerationAction(
      'reject_spam',
      adminEmail,
      report.postId,
      report.postType,
      `Spam report for ${report.postType} rejected.`
    );

    res.json({ success: true, report: updatedReport });
  } catch (err) {
    console.error('reject spam error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
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


