import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import SessionEvent from '../models/SessionEvent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const dataDir = path.join(rootDir, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const rosterPath = path.join(dataDir, 'students-start-on-or-before-2026-05-25.csv');

const SESSIONS = [
  session('15 May Morning', '2026-05-15', 'morning', '2026-05-15T08:27:30', '2026-05-15T12:37:30', 250, '2026-05-15/15_may_attendance_M.csv', '2026-05-15/15 May - orientation poll report - morning.csv'),
  session('15 May Evening', '2026-05-15', 'evening', '2026-05-15T13:29:45', '2026-05-15T17:14:45', 225, '2026-05-15/15_may_attendance_E.csv', '2026-05-15/15 May - orientation poll report - evening.csv'),
  session('16 May Morning', '2026-05-16', 'morning', '2026-05-16T07:55:32', '2026-05-16T12:16:32', 261, '2026-05-16/16_may_attendance_M.csv', '2026-05-16/16 May - orientation poll report - morning.csv'),
  session('16 May Evening', '2026-05-16', 'evening', '2026-05-16T13:59:51', '2026-05-16T17:50:51', 231, '2026-05-16/16_may_attendance_E.csv', '2026-05-16/16 May - orientation poll report - evening.csv'),
  session('17 May Evening', '2026-05-17', 'evening', '2026-05-17T20:42:56', '2026-05-17T22:33:56', 111, '2026-05-17/participants_98521543113_2026_05_17.csv', '2026-05-17/poll_98521543113_2026_05_17.csv'),
  session('18 May Morning', '2026-05-18', 'morning', '2026-05-18T09:03:14', '2026-05-18T11:00:14', 117, '2026-05-18/18_May_Attendance.csv', '2026-05-18/poll_91446611702_2026_05_18.csv'),
  session('19 May Morning', '2026-05-19', 'morning', '2026-05-19T09:00:17', '2026-05-19T10:35:17', 95, '2026-05-19/19-05-2026 Attendance.csv', '2026-05-19/poll_91571551447_2026_05_19.csv'),
  session('20 May Morning', '2026-05-20', 'morning', '2026-05-20T09:04:23', '2026-05-20T11:04:39', 121, '2026-05-20/20_May_2026_attendance.csv', '2026-05-20/poll_93235054469_2026_05_20.csv'),
  session('21 May Morning', '2026-05-21', 'morning', '2026-05-21T09:00:00', '2026-05-21T11:00:00', 120, '2026-05-21/21_MAY_ATTENDANCE.csv', null),
  session('21 May Followup', '2026-05-21', 'followup', '2026-05-21T11:00:00', '2026-05-21T12:00:00', 60, '2026-05-21/21_MAY_ATTENDANCE2.csv', null),
  session('22 May Morning', '2026-05-22', 'morning', '2026-05-22T09:00:00', '2026-05-22T13:00:00', 240, '2026-05-22/22_may_attendance_morning.csv', '2026-05-22/Poll_22_May_Morning.csv'),
  session('22 May Afternoon', '2026-05-22', 'afternoon', '2026-05-22T14:00:00', '2026-05-22T16:20:00', 140, '2026-05-22/22_may_attendance_afternoon.csv', '2026-05-22/Poll_22_May_Afternoon.csv'),
  session('22 May Evening', '2026-05-22', 'evening', '2026-05-22T16:30:00', '2026-05-22T18:36:50', 127, '2026-05-22/22_may_attendance_evening.csv', '2026-05-22/Poll_22_May_Evening.csv')
];

function session(label, date, type, startDateTime, endDateTime, totalMinutes, attendanceFile, pollFile) {
  return { label, date, type, startDateTime, endDateTime, totalMinutes, attendanceFile, pollFile };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];
    if (quoted) {
      if (ch === '"' && next === '"') { value += '"'; i++; }
      else if (ch === '"') quoted = false;
      else value += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(value); value = ''; }
    else if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
    else if (ch !== '\r') value += ch;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

function parseRoster() {
  const rows = parseCsv(fs.readFileSync(rosterPath, 'utf8'));
  return rows.slice(1).filter(r => normalizeEmail(r[1])).map(r => ({
    name: String(r[0] || '').trim() || normalizeEmail(r[1]),
    email: normalizeEmail(r[1]),
    alternateEmail: normalizeEmail(r[2]),
    internshipStartDate: parseDate(r[3]) || new Date('2026-05-15T09:00:00'),
    internshipEndDate: parseDate(r[4])
  }));
}

function parseDate(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
  return new Date(Number(m[3]), months[m[2].slice(0, 3).toLowerCase()], Number(m[1]), 9, 0, 0);
}

function parseZoomDate(value, fallback) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) return fallback;
  let hour = Number(m[4]);
  if (m[7].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (m[7].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), hour, Number(m[5]), Number(m[6]));
}

function parseAttendance(filePath, fallbackMinutes) {
  if (!filePath || !fs.existsSync(filePath)) return { totalMinutes: fallbackMinutes, endDateTime: null, rows: new Map() };
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  let totalMinutes = fallbackMinutes;
  let endDateTime = null;
  if (rows[0]?.some(c => /Duration/i.test(c))) {
    const durationIndex = rows[0].findIndex(c => /Duration/i.test(c));
    const endIndex = rows[0].findIndex(c => /End time/i.test(c));
    totalMinutes = Number(rows[1]?.[durationIndex]) || fallbackMinutes;
    endDateTime = parseZoomDate(rows[1]?.[endIndex], null);
  }
  const headerIndex = rows.findIndex(r => r.some(c => /Email/i.test(c)) && r.some(c => /duration/i.test(c)));
  const result = new Map();
  if (headerIndex >= 0) {
    const header = rows[headerIndex];
    const emailIndex = header.findIndex(c => /Email/i.test(c));
    const durationIndex = header.findIndex(c => /duration/i.test(c));
    for (const row of rows.slice(headerIndex + 1)) {
      const email = normalizeEmail(row[emailIndex]);
      if (!email) continue;
      result.set(email, Math.max(result.get(email) || 0, Number(row[durationIndex]) || 0));
    }
  }
  return { totalMinutes, endDateTime, rows: result };
}

function parsePoll(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return { totalQuestions: 0, byEmail: new Map() };
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  const pollQuestionCount = new Map();
  const pollNames = [];
  const launchedIndex = rows.findIndex(r => r[0] === 'Launched Polls');
  if (launchedIndex >= 0) {
    for (let i = launchedIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row[0] || !/^\d+$/.test(row[0])) break;
      pollQuestionCount.set(row[1], Number(row[2]) || 0);
      pollNames.push(row[1]);
    }
  }

  const byEmail = new Map();
  let totalQuestions = 0;
  for (const pollName of pollNames) {
    const titleIndex = rows.findIndex(r => r[0] === pollName);
    if (titleIndex < 0) continue;
    const header = rows[titleIndex + 1] || [];
    const emailIndex = header.findIndex(c => /Email Address/i.test(c));
    const firstQuestionIndex = header.findIndex(c => c && !['#', 'User Name', 'Email Address', 'Submitted Date and Time'].includes(c));
    const questionHeaders = header.slice(firstQuestionIndex).filter(Boolean);
    const questionCount = pollQuestionCount.get(pollName) || questionHeaders.length;
    totalQuestions += questionCount;
    for (let i = titleIndex + 2; i < rows.length; i++) {
      const row = rows[i];
      if (!row.length || !row[0]) break;
      if (!/^\d+$/.test(row[0])) break;
      const email = normalizeEmail(row[emailIndex]);
      if (!email) continue;
      if (!byEmail.has(email)) byEmail.set(email, []);
      const responses = byEmail.get(email);
      for (let q = 0; q < questionCount; q++) {
        const question = questionHeaders[q] || `${pollName} question ${q + 1}`;
        const response = String(row[firstQuestionIndex + q] || '').trim();
        responses.push({ pollName, question, response, attempted: Boolean(response) });
      }
    }
  }
  return { totalQuestions, byEmail };
}

function sessionApplies(student, sessionEnd) {
  return sessionEnd >= student.internshipStartDate;
}

async function addTransaction(student, category, sessionLabel, delta, reason, dateTime, balances) {
  const email = student.email;
  const prevBalance = balances.get(email) || 0;
  const balanceAfter = Math.max(0, prevBalance + delta);
  balances.set(email, balanceAfter);
  const transaction = await SPTransaction.create({
    email,
    studentId: student._id,
    category,
    sessionLabel,
    deltaMode: 'absolute',
    deltaValue: delta,
    appliedDelta: delta,
    balanceAfter,
    reason,
    dateTime
  });
  return transaction;
}

async function run() {
  await mongoose.connect(MONGO_URI);

  await Promise.all([
    // Student.deleteMany({}), // SKIPPED - students already seeded
    Session.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    PollRecord.deleteMany({}),
    SPTransaction.deleteMany({}),
    SessionEvent.deleteMany({})
  ]);

  const roster = parseRoster();
  // await Student.insertMany(roster); // SKIPPED - students already seeded
  const students = await Student.find().sort({ name: 1 });
  const byEmail = new Map();
  const byAltEmail = new Map();
  const byName = new Map();
  for (const student of students) {
    byEmail.set(student.email, student);
    if (student.alternateEmail) byAltEmail.set(student.alternateEmail, student);
    const key = normalizeName(student.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }

  const balances = new Map();
  for (const student of students) {
    await addTransaction(student, 'initial', '', 100, 'Initial Spurti Points credited by system on onboarding.', student.internshipStartDate, balances);
  }

  for (const sessionConfig of SESSIONS) {
    const attendancePath = sessionConfig.attendanceFile ? path.join(uploadsDir, sessionConfig.attendanceFile) : null;
    const parsedAttendance = parseAttendance(attendancePath, sessionConfig.totalMinutes);
    const endDateTime = parsedAttendance.endDateTime || new Date(sessionConfig.endDateTime);
    const totalMinutes = parsedAttendance.totalMinutes || sessionConfig.totalMinutes;

    await Session.create({
      ...sessionConfig,
      date: new Date(`${sessionConfig.date}T00:00:00`),
      startDateTime: new Date(sessionConfig.startDateTime),
      endDateTime,
      totalMinutes
    });

    const pollPath = sessionConfig.pollFile ? path.join(uploadsDir, sessionConfig.pollFile) : null;
    const parsedPoll = parsePoll(pollPath);

    for (const student of students) {
      if (!sessionApplies(student, endDateTime)) continue;

      const minutes = parsedAttendance.rows.get(student.email) || parsedAttendance.rows.get(student.alternateEmail) || 0;
      const pct = totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0;
      const qualified = totalMinutes > 0 && minutes / totalMinutes >= 0.75;
      const attendanceDelta = qualified ? 5 : -5;
      const attendanceReason = qualified
        ? `${sessionConfig.label}: attended ${minutes}/${totalMinutes} minutes (${pct}%). Required 75%, credited +5 SP.`
        : `${sessionConfig.label}: attended ${minutes}/${totalMinutes} minutes (${pct}%). Required 75%, debited -5 SP.`;
      const attendanceTx = await addTransaction(student, 'attendance', sessionConfig.label, attendanceDelta, attendanceReason, endDateTime, balances);
      await AttendanceRecord.create({
        email: student.email,
        studentId: student._id,
        sessionLabel: sessionConfig.label,
        attendedMinutes: minutes,
        totalSessionMinutes: totalMinutes,
        attendancePercentage: pct,
        qualified,
        transactionId: attendanceTx._id
      });

      const responses = parsedPoll.byEmail.get(student.email) || parsedPoll.byEmail.get(student.alternateEmail) || [];
      if (parsedPoll.totalQuestions > 0) {
        const attempted = responses.filter(r => r.attempted).length;
        const missed = Math.max(0, parsedPoll.totalQuestions - attempted);
        const pollDelta = attempted - missed;
        const pollReason = `${sessionConfig.label}: attempted ${attempted}/${parsedPoll.totalQuestions} poll questions. +${attempted} for attempted, -${missed} for missed = ${pollDelta} SP.`;
        const pollTx = await addTransaction(student, 'poll', sessionConfig.label, pollDelta, pollReason, endDateTime, balances);
        await PollRecord.create({
          email: student.email,
          studentId: student._id,
          sessionLabel: sessionConfig.label,
          totalQuestions: parsedPoll.totalQuestions,
          attemptedQuestions: attempted,
          missedQuestions: missed,
          responses,
          transactionId: pollTx._id
        });
      }
    }
  }

  for (const student of students) {
    await Student.updateOne({ _id: student._id }, { $set: { totalSp: balances.get(student.email) || 100 } });
  }

  console.log(`Rebuilt ${students.length} students`);
  console.log(`Sessions: ${await Session.countDocuments()}`);
  console.log(`Attendance records: ${await AttendanceRecord.countDocuments()}`);
  console.log(`Poll records: ${await PollRecord.countDocuments()}`);
  console.log(`SP transactions: ${await SPTransaction.countDocuments()}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
