import fs from 'fs';
import path from 'path';

import Student from '../../models/Student.js';
import Session from '../../models/Session.js';
import AttendanceRecord from '../../models/AttendanceRecord.js';
import PollRecord from '../../models/PollRecord.js';
import SPTransaction from '../../models/SPTransaction.js';
import { normalizeEmail } from '../../utils/email.js';
import { parseCsv, parseDate, parseZoomDate } from '../../utils/parse.js';

export const KNOWN_SESSIONS = [
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

export function session(label, date, type, startDateTime, endDateTime, totalMinutes, attendanceFile, pollFile) {
  return { label, date, type, startDateTime, endDateTime, totalMinutes, attendanceFile, pollFile };
}

export { normalizeEmail } from '../../utils/email.js';
export { parseCsv, parseDate, parseZoomDate } from '../../utils/parse.js';

export function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function headerIndex(headers, names) {
  const normalized = headers.map(h => String(h || '').trim().toLowerCase());
  for (const name of names) {
    const index = normalized.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

export function readStudents(csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (!rows.length) return [];
  const headers = rows[0];
  const nameIndex = headerIndex(headers, ['name', 'student name']);
  const emailIndex = headerIndex(headers, ['email', 'email address']);
  const altIndex = headerIndex(headers, ['emailAlt', 'alternateEmail', 'alternate email', 'email alt']);
  const startIndex = headerIndex(headers, ['internshipStartDate', 'internship start date', 'startDate']);
  const endIndex = headerIndex(headers, ['internshipEndDate', 'internship end date', 'endDate']);
  if (emailIndex < 0) throw new Error('CSV must contain an email column');
  return rows.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    name: String(row[nameIndex] || row[emailIndex] || '').trim(),
    email: normalizeEmail(row[emailIndex]),
    alternateEmail: altIndex >= 0 ? normalizeEmail(row[altIndex]) : '',
    internshipStartDate: startIndex >= 0 ? parseDate(row[startIndex]) : null,
    internshipEndDate: endIndex >= 0 ? parseDate(row[endIndex]) : null
  })).filter(row => row.email);
}

export function parseAttendance(filePath, fallbackMinutes = 0) {
  if (!filePath || !fs.existsSync(filePath)) return { totalMinutes: fallbackMinutes, startDateTime: null, endDateTime: null, rows: new Map() };
  const rows = parseCsv(fs.readFileSync(filePath, 'utf8'));
  let totalMinutes = fallbackMinutes;
  let startDateTime = null;
  let endDateTime = null;
  if (rows[0]?.some(c => /Duration/i.test(c))) {
    const durationIndex = rows[0].findIndex(c => /Duration/i.test(c));
    const startIndex = rows[0].findIndex(c => /Start time/i.test(c));
    const endIndex = rows[0].findIndex(c => /End time/i.test(c));
    totalMinutes = Number(rows[1]?.[durationIndex]) || fallbackMinutes;
    startDateTime = parseZoomDate(rows[1]?.[startIndex], null);
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
  return { totalMinutes, startDateTime, endDateTime, rows: result };
}

export function parsePoll(filePath) {
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
      if (!row.length || !row[0] || !/^\d+$/.test(row[0])) break;
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

export function sessionApplies(student, sessionEnd) {
  if (student.status === 'excused') return false;
  return sessionEnd >= student.internshipStartDate;
}

export async function ensureInitialTransaction(student, stats = {}) {
  const exists = await SPTransaction.exists({ email: student.email, category: 'initial' });
  if (exists) { stats.skippedExistingTransactions = (stats.skippedExistingTransactions || 0) + 1; return null; }
  const transaction = await SPTransaction.create({
    email: student.email,
    studentId: student._id,
    category: 'initial',
    sessionLabel: '',
    deltaMode: 'absolute',
    deltaValue: 100,
    appliedDelta: 100,
    balanceAfter: 100,
    reason: 'Initial Spurti Points credited by system on onboarding.',
    dateTime: student.internshipStartDate
  });
  stats.initialTransactions = (stats.initialTransactions || 0) + 1;
  return transaction;
}

export async function createTransactionOnce(student, category, sessionLabel, delta, reason, dateTime, stats = {}) {
  const exists = await SPTransaction.exists({ email: student.email, category, sessionLabel });
  if (exists) { stats.skippedExistingTransactions = (stats.skippedExistingTransactions || 0) + 1; return null; }
  const last = await SPTransaction.findOne({ email: student.email }).sort({ dateTime: -1, createdAt: -1 }).lean();
  const balanceAfter = Number(last?.balanceAfter ?? student.totalSp ?? 0) + delta;
  const transaction = await SPTransaction.create({
    email: student.email,
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

export async function recalculateStudentSp(studentOrEmail) {
  const email = typeof studentOrEmail === 'string' ? normalizeEmail(studentOrEmail) : studentOrEmail.email;
  const txns = await SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 });
  let balance = 0;
  for (const txn of txns) {
    balance += Number(txn.appliedDelta || 0);
    if (txn.balanceAfter !== balance) {
      txn.balanceAfter = balance;
      await txn.save();
    }
  }
  await Student.updateOne({ email }, { $set: { totalSp: balance } });
  return balance;
}

export async function upsertSession(config, parsedAttendance = null) {
  const startDateTime = parsedAttendance?.startDateTime || new Date(config.startDateTime);
  const endDateTime = parsedAttendance?.endDateTime || new Date(config.endDateTime);
  const totalMinutes = parsedAttendance?.totalMinutes || Number(config.totalMinutes || 0);
  return Session.findOneAndUpdate(
    { label: config.label },
    {
      $set: {
        label: config.label,
        date: new Date(`${config.date}T00:00:00`),
        startDateTime,
        endDateTime,
        totalMinutes,
        type: config.type || '',
        attendanceFile: config.attendanceFile || '',
        pollFile: config.pollFile || ''
      }
    },
    { upsert: true, new: true }
  );
}

export function buildNameIndex(students) {
  const byName = new Map();
  for (const student of students) {
    const key = normalizeName(student.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(student);
  }
  return byName;
}

export async function applySessionForStudents(config, students, rootDir, stats = {}) {
  const attendancePath = config.attendanceFile ? path.resolve(rootDir, config.attendanceFile) : null;
  const pollPath = config.pollFile ? path.resolve(rootDir, config.pollFile) : null;

  const parsedAttendance = parseAttendance(attendancePath, Number(config.totalMinutes || 0));
  const sessionDoc = await upsertSession(config, parsedAttendance);
  const endDateTime = sessionDoc.endDateTime;
  const totalMinutes = Number(sessionDoc.totalMinutes || 0);
  const parsedPoll = parsePoll(pollPath);
  const touchedEmails = new Set();

  for (const student of students) {
    if (!sessionApplies(student, endDateTime)) continue;
    touchedEmails.add(student.email);

    if (attendancePath) {
      const minutes = parsedAttendance.rows.get(student.email) || parsedAttendance.rows.get(student.alternateEmail) || 0;
      const pct = totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0;
      const qualified = totalMinutes > 0 && minutes / totalMinutes >= 0.75;
      const delta = qualified ? 5 : -5;
      const reason = qualified
        ? `${config.label}: attended ${minutes}/${totalMinutes} minutes (${pct}%). Required 75%, credited +5 SP.`
        : `${config.label}: attended ${minutes}/${totalMinutes} minutes (${pct}%). Required 75%, debited -5 SP.`;
      const tx = await createTransactionOnce(student, 'attendance', config.label, delta, reason, endDateTime, stats);
      if (tx) {
        await AttendanceRecord.findOneAndUpdate(
          { email: student.email, sessionLabel: config.label },
          { $set: { email: student.email, studentId: student._id, sessionLabel: config.label, attendedMinutes: minutes, totalSessionMinutes: totalMinutes, attendancePercentage: pct, qualified, transactionId: tx._id } },
          { upsert: true }
        );
        stats.attendanceBackfilled = (stats.attendanceBackfilled || 0) + 1;
      }
    }

    if (parsedPoll.totalQuestions > 0) {
      const responses = parsedPoll.byEmail.get(student.email) || parsedPoll.byEmail.get(student.alternateEmail) || [];
      const attempted = responses.filter(r => r.attempted).length;
      const missed = Math.max(0, parsedPoll.totalQuestions - attempted);
      const delta = attempted - missed;
      const reason = `${config.label}: attempted ${attempted}/${parsedPoll.totalQuestions} poll questions. +${attempted} for attempted, -${missed} for missed = ${delta} SP.`;
      const tx = await createTransactionOnce(student, 'poll', config.label, delta, reason, endDateTime, stats);
      if (tx) {
        await PollRecord.findOneAndUpdate(
          { email: student.email, sessionLabel: config.label },
          { $set: { email: student.email, studentId: student._id, sessionLabel: config.label, totalQuestions: parsedPoll.totalQuestions, attemptedQuestions: attempted, missedQuestions: missed, responses, transactionId: tx._id } },
          { upsert: true }
        );
        stats.pollsBackfilled = (stats.pollsBackfilled || 0) + 1;
      }
    }
  }

  for (const email of touchedEmails) await recalculateStudentSp(email);
  return stats;
}
