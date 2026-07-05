import 'dotenv/config';
import nodemailer from 'nodemailer';

import Student from './models/Student.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import SPTransaction from './models/SPTransaction.js';
import PollRecord from './models/PollRecord.js';
import Nudge from './models/Nudge.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SP_DROP_THRESHOLD = 10;
const MISSED_SESSIONS_THRESHOLD = 2;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function joinParts(parts) {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function buildNudge(student, { missedCount, spBefore, spAfter, spDropped, noPolls }) {
  const parts = [];
  let reason = null;

  if (missedCount >= MISSED_SESSIONS_THRESHOLD) {
    parts.push(`you've missed ${missedCount} sessions this week`);
    reason = reason || 'missed_sessions';
  }
  if (spDropped) {
    parts.push(`your SP dropped from ${spBefore} to ${spAfter}`);
    reason = reason || 'sp_drop';
  }
  if (noPolls) {
    parts.push("you haven't attempted any polls this week");
    reason = reason || 'no_polls';
  }

  if (!parts.length) return null;

  const message = `Hey ${student.name}, ${joinParts(parts)}. Showing up tomorrow puts you back on track.`;
  return { reason, message };
}

export async function detectAtRiskStudents() {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS);
  const todayStart = startOfToday();

  const [students, attendance, transactions, polls] = await Promise.all([
    Student.find({ status: { $ne: 'excused' } }).lean(),
    AttendanceRecord.find({ createdAt: { $gte: cutoff } }).lean(),
    SPTransaction.find({ dateTime: { $gte: cutoff } }).sort({ dateTime: 1 }).lean(),
    PollRecord.find({ createdAt: { $gte: cutoff } }).lean()
  ]);

  const missedByEmail = {};
  for (const record of attendance) {
    if (record.qualified) continue;
    const key = record.email.toLowerCase();
    missedByEmail[key] = (missedByEmail[key] || 0) + 1;
  }

  const txByEmail = {};
  for (const tx of transactions) {
    const key = tx.email.toLowerCase();
    if (!txByEmail[key]) txByEmail[key] = [];
    txByEmail[key].push(tx);
  }

  const pollsAttemptedByEmail = {};
  for (const poll of polls) {
    const key = poll.email.toLowerCase();
    pollsAttemptedByEmail[key] = (pollsAttemptedByEmail[key] || 0) + (poll.attemptedQuestions || 0);
  }

  const generated = [];

  for (const student of students) {
    const email = student.email.toLowerCase();
    const missedCount = missedByEmail[email] || 0;

    const studentTx = txByEmail[email] || [];
    let spBefore = null;
    let spAfter = null;
    let spDropped = false;
    if (studentTx.length) {
      const first = studentTx[0];
      const last = studentTx[studentTx.length - 1];
      spBefore = first.balanceAfter - first.appliedDelta;
      spAfter = last.balanceAfter;
      spDropped = (spBefore - spAfter) > SP_DROP_THRESHOLD;
    }

    const noPolls = (pollsAttemptedByEmail[email] || 0) === 0;

    const built = buildNudge(student, { missedCount, spBefore, spAfter, spDropped, noPolls });
    if (!built) continue;

    const existing = await Nudge.findOne({
      studentId: student._id,
      status: 'pending',
      createdAt: { $gte: todayStart }
    }).lean();
    if (existing) continue;

    const nudge = await Nudge.create({
      studentId: student._id,
      studentEmail: student.email,
      studentName: student.name,
      reason: built.reason,
      message: built.message,
      channel: 'both',
      status: 'pending'
    });
    generated.push(nudge);
  }

  return generated;
}

function buildTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

export async function sendEmailNudge(nudge) {
  try {
    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: nudge.studentEmail,
      subject: 'A quick nudge from Spurti',
      text: nudge.message
    });
    nudge.status = 'sent';
    nudge.sentAt = new Date();
    await nudge.save();
    console.log(`Nudge email sent to ${nudge.studentEmail}`);
    return { success: true };
  } catch (err) {
    console.error(`Nudge email failed for ${nudge.studentEmail}:`, err.message);
    return { success: false, error: err.message };
  }
}
