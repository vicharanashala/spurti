import 'dotenv/config';
import nodemailer from 'nodemailer';

import Student from './models/Student.js';
import Session from './models/Session.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import PollRecord from './models/PollRecord.js';
import Nudge from './models/Nudge.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
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

function buildNudge(student, { missedLabels, noPolls }) {
  const parts = [];
  let reason = null;

  if (missedLabels.length >= MISSED_SESSIONS_THRESHOLD) {
    const labelSummary = missedLabels.slice(0, 3).join(', ') + (missedLabels.length > 3 ? `, and ${missedLabels.length - 3} more` : '');
    parts.push(`you've missed ${missedLabels.length} sessions this week (${labelSummary})`);
    reason = reason || 'missed_sessions';
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

  // Mandatory sessions that actually happened in the window define what "missed"
  // means. A student "misses" a session when they have no *qualified* attendance
  // record for it (absent, or present without qualifying).
  const [students, sessions] = await Promise.all([
    Student.find({ status: { $ne: 'excused' } }).lean(),
    Session.find({ date: { $gte: cutoff } }).lean()
  ]);
  const sessionLabels = sessions.map(s => s.label);
  if (!sessionLabels.length) return [];

  const [attendance, polls] = await Promise.all([
    AttendanceRecord.find({ sessionLabel: { $in: sessionLabels }, qualified: true }).lean(),
    PollRecord.find({ sessionLabel: { $in: sessionLabels } }).lean()
  ]);

  const qualifiedByEmail = {};
  for (const record of attendance) {
    const key = record.email.toLowerCase();
    if (!qualifiedByEmail[key]) qualifiedByEmail[key] = new Set();
    qualifiedByEmail[key].add(record.sessionLabel);
  }

  const pollsAttemptedByEmail = {};
  for (const poll of polls) {
    const key = poll.email.toLowerCase();
    pollsAttemptedByEmail[key] = (pollsAttemptedByEmail[key] || 0) + (poll.attemptedQuestions || 0);
  }

  const generated = [];

  for (const student of students) {
    const email = student.email.toLowerCase();
    const qualified = qualifiedByEmail[email] || new Set();
    const missedLabels = sessionLabels.filter(label => !qualified.has(label));
    const noPolls = (pollsAttemptedByEmail[email] || 0) === 0;

    const built = buildNudge(student, { missedLabels, noPolls });
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
  if (!process.env.SMTP_HOST) {
    // No SMTP configured — leave the nudge for the in-app banner only.
    return { success: false, skipped: true, error: 'SMTP not configured' };
  }
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
