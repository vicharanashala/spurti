import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { ALLOW_STUDENT_SEARCH, MONGO_URI, PORT, SPURTI_AUTH_SECRET, SPURTI_COOKIE_SECURE } from './config.js';
import Student from './models/Student.js';
import Session from './models/Session.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import ChatRecord from './models/ChatRecord.js';
import PollRecord from './models/PollRecord.js';
import SPTransaction from './models/SPTransaction.js';
import SessionEvent from './models/SessionEvent.js';
import ChatSPReview from './models/ChatSPReview.js';
import investmentEventRouter from './routes/investmentEvent.js';
import marketplaceRouter from './routes/marketplace.js';
import { recalculateStudentSp } from './scripts/lib/ingestion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const clientDist = path.join(rootDir, 'client', 'dist');
const ADMIN_EMAIL = normalizeEmail(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';
const STUDENT_COOKIE = 'spurti_student';

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

function signValue(value) {
  return crypto.createHmac('sha256', SPURTI_AUTH_SECRET).update(value).digest('base64url');
}

function verifySignedToken(token) {
  if (!SPURTI_AUTH_SECRET) return null;
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) return null;
  const expected = signValue(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.email || !payload.exp || Date.now() > Number(payload.exp)) return null;
    return { email: normalizeEmail(payload.email) };
  } catch {
    return null;
  }
}

function setStudentCookie(res, email) {
  const body = Buffer.from(JSON.stringify({
    email: normalizeEmail(email),
    exp: Date.now() + 24 * 60 * 60 * 1000
  })).toString('base64url');
  const value = `${body}.${signValue(body)}`;
  const secure = SPURTI_COOKIE_SECURE ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${STUDENT_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
}

function clearStudentCookie(res) {
  res.setHeader('Set-Cookie', `${STUDENT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function studentFromCookie(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySignedToken(cookies[STUDENT_COOKIE]);
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
  const [transactions, chats, polls, attendance, rankInfo, leaderboard, allStudents] = await Promise.all([
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    ChatRecord.find({ email }).sort({ sessionLabel: 1 }).lean(),
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
      cohortSize: rankInfo?.cohortSize || null
    },
    transactions,
    chats,
    polls,
    attendance,
    cohort: {
      averageSp,
      top10Cutoff,
      top50Cutoff,
      pointsToTop50: top50Cutoff === null ? null : Math.max(0, top50Cutoff - student.totalSp + 1),
      pointsToNextRank: nextStudent ? Math.max(1, nextStudent.totalSp - student.totalSp + 1) : 0
    },
    leaderboard: leaderboard.map((row, index) => ({
      rank: index + 1,
      name: row.name,
      maskedEmail: maskEmail(row.email),
      totalSp: row.totalSp,
      isCurrentStudent: row.email === email
    }))
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

api.get('/config', (_req, res) => res.json({ allowStudentSearch: ALLOW_STUDENT_SEARCH }));

async function authHandoff(req, res) {
  const verified = verifySignedToken(req.query.token);
  if (!verified) return res.status(401).send('Invalid or expired Spurti login link.');
  const student = await Student.findOne({ $or: [{ email: verified.email }, { alternateEmail: verified.email }] }).lean();
  if (!student) return res.status(404).send('No Spurti record was found for this Samagama account.');
  if (student.status === 'excused') return res.status(403).send('Your current internship account has been excused. Your previous Spurti record is preserved, and you may come back in the next cohort.');
  setStudentCookie(res, student.email);
  res.redirect(req.path.startsWith('/spurti') || req.baseUrl.startsWith('/spurti') ? '/spurti/' : '/');
}

api.get('/auth', authHandoff);

api.get('/me', async (req, res) => {
  const verified = studentFromCookie(req);
  if (!verified) return res.status(401).json({ authenticated: false });
  const student = await Student.findOne({ email: verified.email }).lean();
  if (!student) {
    clearStudentCookie(res);
    return res.status(404).json({ authenticated: false, error: 'Student not found' });
  }
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
  // Set the student cookie so marketplace (and other authenticated endpoints) work
  setStudentCookie(res, student.email);
  res.json(await studentPayload(student));
});

api.get('/leaderboard', async (_req, res) => {
  const students = await Student.find({ status: { $ne: 'excused' } }).sort({ totalSp: -1, name: 1 }).limit(50).lean();
  res.json(students.map((s, i) => ({ rank: i + 1, name: s.name, maskedEmail: maskEmail(s.email), totalSp: s.totalSp })));
});

api.post('/ping', async (req, res) => {
  const { email, name, page } = req.body || {};
  const normalized = normalizeEmail(email);
  if (!normalized || !name || !page) return res.status(400).json({ error: 'email, name, page required' });
  await SessionEvent.create({ email: normalized, name, event: 'page_view', page });
  if (page === 'record' || page.startsWith('admin')) {
    liveViewers.set(normalized, { name, page, lastSeen: new Date() });
  }
  res.json({ ok: true });
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

api.get('/admin/chat-sp-reviews', adminGuard, async (req, res) => {
  const status = String(req.query.status || 'pending');
  const query = status === 'all' ? {} : { status };
  const reviews = await ChatSPReview.find(query).sort({ dateTime: 1, createdAt: 1 }).limit(500).lean();
  const enriched = reviews.map(r => {
    const isPct = r.isPercent || false;
    const displayDelta = isPct ? String(r.delta) + '%' : String(r.delta);
    return { ...r, displayDelta, isPercent: isPct };
  });
  res.json(enriched);
});

api.post('/admin/chat-sp-reviews/:id/reject', adminGuard, async (req, res) => {
  const review = await ChatSPReview.findById(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  if (review.status !== 'pending') return res.status(409).json({ error: `Review is already ${review.status}` });
  review.status = 'rejected';
  review.reviewedBy = normalizeEmail(req.headers['x-admin-email']);
  review.reviewedAt = new Date();
  await review.save();
  res.json(review);
});

api.post('/admin/chat-sp-reviews/:id/accept', adminGuard, async (req, res) => {
  const review = await ChatSPReview.findById(req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  if (review.status !== 'pending') return res.status(409).json({ error: `Review is already ${review.status}` });

  const email = normalizeEmail(req.body?.studentEmail || review.studentEmail);
  const isPercent = review.isPercent || false;
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'A matched student email is required before accepting.' });

  // Calculate delta: if percent-based, compute from current balance
  let delta = Number(req.body?.delta ?? review.delta);
  if (isPercent) {
    const last = await SPTransaction.findOne({ email }).sort({ dateTime: -1, createdAt: -1 }).lean();
    const currentBalance = Number(last?.balanceAfter ?? 0);
    delta = Math.round(currentBalance * delta / 100);
  }
  if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'A non-zero SP delta is required.' });

  const student = await Student.findOne({ email });
  if (!student) return res.status(404).json({ error: 'Student not found' });
  if (student.status === 'excused') return res.status(409).json({ error: 'Cannot apply new SP to an excused student.' });

  const last = await SPTransaction.findOne({ email }).sort({ dateTime: -1, createdAt: -1 }).lean();
  const transaction = await SPTransaction.create({
    email,
    studentId: student._id,
    category: 'chat_manual_award',
    sessionLabel: review.sessionLabel,
    deltaMode: review.isPercent ? 'percentage' : 'absolute',
    deltaValue: Number(req.body?.delta ?? review.delta),
    appliedDelta: delta,
    balanceAfter: Number(last?.balanceAfter ?? student.totalSp ?? 0) + delta,
    reason: String(req.body?.reason || review.reason || '').trim() || `Manual chat SP by ${review.issuedByName}.`,
    dateTime: review.dateTime
  });

  review.status = 'accepted';
  review.reviewedBy = normalizeEmail(req.headers['x-admin-email']);
  review.reviewedAt = new Date();
  review.studentEmail = email;
  review.studentId = student._id;
  review.delta = delta;
  review.reason = String(req.body?.reason || review.reason || '').trim() || review.reason;
  review.transactionId = transaction._id;
  await review.save();
  await recalculateStudentSp(email);
  res.json({ review, transaction });
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

  const categoryTotals = ['initial', 'attendance', 'poll', 'chat', 'manual'].map(category => {
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

// Mount sub-routers on the api Router BEFORE registering it on the app,
// so /api/marketplace/* and /api/investment-event/* are handled correctly.
api.use('/marketplace', marketplaceRouter);
api.use('/investment-event', investmentEventRouter);

app.use('/api', api);
app.use('/spurti/api', api);
app.get('/spurti/auth', authHandoff);

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


