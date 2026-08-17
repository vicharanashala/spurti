/**
 * SP Service
 * Uses Student.totalSp (pre-computed, stored) and SP_Transactions (append-only log).
 * No recomputation from raw data — unless totalSp is missing (migration fallback).
 *
 * Session display is data-driven: it reads the student's real AttendanceRecord
 * docs (which carry the pipeline's actual session labels, e.g. "Day 12 (26 May)")
 * instead of iterating the stale hardcoded SESSION_LABELS from config.js.
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';

export function withSp(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;

  // If totalSp is already stored (post-migration), use it
  const totalSp = raw.totalSp ?? 100;
  const attendance = raw._attendance || []; // AttendanceRecord docs (pipeline labels)
  const txns = raw._txns || [];             // SPTransaction docs, pre-fetched if possible

  const sessions = {};
  for (const rec of attendance) {
    const minutes = Number(rec.attendedMinutes || 0);
    if (rec.sessionLabel) sessions[rec.sessionLabel] = (sessions[rec.sessionLabel] || 0) + minutes;
  }

  const totalMinutes = Object.values(sessions).reduce((sum, m) => sum + m, 0);
  const sessionsAttended = Object.keys(sessions).filter(label => Number(sessions[label]) > 0).length;
  const hasAttendance = totalMinutes > 0;

  // Per-session SP from the attendance transactions (authoritative appliedDelta).
  const spBySession = {};
  for (const t of txns) {
    if (t.category === 'attendance' && t.sessionLabel) {
      spBySession[t.sessionLabel] = (spBySession[t.sessionLabel] || 0) + Number(t.appliedDelta || 0);
    }
  }

  const sessionLedger = attendance.map(rec => {
    const minutes = Number(rec.attendedMinutes || 0);
    const fullMinutes = Number(rec.totalSessionMinutes || 0);
    const qualified = Boolean(rec.qualified);
    const sp = spBySession[rec.sessionLabel] ?? (qualified ? 5 : -5);
    const reason = qualified
      ? `Qualified (${Math.round(minutes)}/${fullMinutes} min) — earned +${sp} SP`
      : minutes > 0
        ? `Present ${Math.round(minutes)}/${fullMinutes} min — below threshold — 0 SP`
        : `Absent — 0 SP`;
    return { label: rec.sessionLabel, minutes, fullMinutes, qualified, attendedPartial: minutes > 0 && !qualified, sp, reason };
  });

  const pollTxns = txns.filter(t => t.category === 'poll');
  const pollSp = pollTxns.reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0);

  return {
    _id: String(raw._id || ''),
    name: raw.name,
    email: raw.email,
    alternateEmail: raw.alternateEmail,
    onboardingDate: raw.onboardingDate || null,
    sessions,
    totalMinutes,
    sessionsAttended,
    hasAttendance,
    activities: raw.activities || [],
    polls: raw.polls || [],
    activityItems: raw.activityItems || '',
    activityMatched: raw.activityMatched || '',
    sp: {
      initial: 100,
      attendance: sessionLedger.reduce((sum, item) => sum + item.sp, 0),
      activity: 0,
      poll: pollSp,
      total: totalSp,
      sessionLedger,
      pollLedger: raw.polls || [],
      activityReason: (raw.activities || []).length > 0
        ? (raw.activityMatched ? 'Game/activity participated and item matched' : 'Game/activity participated')
        : 'No game/activity participation found'
    }
  };
}

/**
 * withSpFromTxns — use when transactions and attendance are pre-fetched
 * Passes _txns and _attendance into withSp to avoid extra DB queries.
 */
export async function withSpFromTxns(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;
  const [txns, attendance] = await Promise.all([
    SPTransaction.find({ email: raw.email.toLowerCase() }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    AttendanceRecord.find({ email: raw.email.toLowerCase() }).sort({ sessionLabel: 1 }).lean()
  ]);
  return withSp({ ...raw, _txns: txns, _attendance: attendance });
}

export function publicStudent(studentDoc) {
  const student = withSp(studentDoc);
  return {
    _id: student._id,
    name: student.name,
    maskedEmail: maskEmail(student.email),
    maskedAlternateEmail: student.alternateEmail && student.alternateEmail !== student.email ? maskEmail(student.alternateEmail) : '',
    spPreview: student.sp.total,
    hasAttendance: student.hasAttendance
  };
}

export function summary(students) {
  const rows = students.map(s => ({ name: s.name, sp: { total: s.totalSp ?? 100 } }));
  const totalSp = rows.reduce((sum, student) => sum + student.sp.total, 0);
  return {
    students: rows.length,
    averageSp: rows.length ? Math.round(totalSp / rows.length) : 0,
    highestSp: rows.length ? Math.max(...rows.map(s => s.sp.total)) : 0,
    activityParticipants: 0,
    allSessions: 0,
    sessionLabels: []
  };
}

// ─── Helpers (unchanged) ───────────────────────────────────────────────

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmailLike(q) {
  return q.includes('@');
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}
