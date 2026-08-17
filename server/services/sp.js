/**
 * SP Service
 * Uses Student.totalSp (pre-computed, stored) and SP_Transactions (append-only log).
 * No recomputation from raw data — unless totalSp is missing (migration fallback).
 */

import { SESSION_LABELS, SESSION_DURATIONS, SESSION_DATETIME_MAP, SESSION_THRESHOLDS_MINUTES, SESSION_THRESHOLDS_PCT } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import { normalizeEmail, maskEmail } from '../utils/email.js';

export function withSp(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;

  // If totalSp is already stored (post-migration), use it
  const totalSp = raw.totalSp ?? 100;
  const sessions = {};
  for (const label of SESSION_LABELS) {
    sessions[label] = sessionMinutes(raw, label);
  }

  const totalMinutes = SESSION_LABELS.reduce((sum, label) => sum + Number(sessions[label] || 0), 0);
  const sessionsAttended = SESSION_LABELS.filter(label => Number(sessions[label] || 0) > 0).length;
  const hasAttendance = totalMinutes > 0;

  // Build sessionLedger from transaction log (fast)
  const txnsBySession = {};
  const txns = raw._txns || [];  // passed in if pre-fetched, otherwise query
  for (const t of txns) {
    if (t.category === 'attendance') {
      if (!txnsBySession[t.sessionLabel]) txnsBySession[t.sessionLabel] = [];
      txnsBySession[t.sessionLabel].push(t);
    }
  }

  const sessionLedger = SESSION_LABELS.map(label => {
    const minutes = Number(sessions[label] || 0);
    const fullMinutes = SESSION_DURATIONS[label] || 0;
    const threshold = requiredMinutes(label);
    const qualified = minutes >= threshold;
    const attendedPartial = minutes > 0 && !qualified;
    const sp = qualified ? 5 : -5;
    const reason = qualified
      ? `Present for at least ${threshold} min (${Math.round(minutes)}/${fullMinutes} min) — earned +5 SP`
      : minutes > 0
        ? `Present for ${Math.round(minutes)} min (${Math.round((minutes/fullMinutes)*100)}% of ${fullMinutes}) — below ${threshold} min threshold — -5 SP applied`
        : `Absent — -5 SP applied`;
    return { label, minutes, fullMinutes, threshold, qualified, attendedPartial, sp, reason };
  });

  const onboardingDate = raw.onboardingDate ? new Date(raw.onboardingDate) : null;

  // Filter sessionLedger to only sessions on or after onboardingDate
  const filteredLedger = sessionLedger.filter(item => {
    if (!onboardingDate) return true;
    const label = item.label; // e.g. "15 May Morning"
    const sessionDate = SESSION_DATETIME_MAP[label]; // e.g. "2026-05-15T12:37:30"
    if (!sessionDate) return true;
    return new Date(sessionDate) >= onboardingDate;
  });

  const attendanceSp = filteredLedger.reduce((sum, item) => sum + item.sp, 0);

  // Poll SP from transaction log
  const pollTxns = (raw._txns || []).filter(t => t.category === 'poll');
  const pollSp = pollTxns.reduce((sum, t) => sum + Number(t.delta || 0), 0);

  const activitySp = 0;

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
      attendance: attendanceSp,
      activity: activitySp,
      poll: pollSp,
      total: totalSp,
      sessionLedger: filteredLedger,
      pollLedger: raw.polls || [],
      activityReason: (raw.activities || []).length > 0
        ? (raw.activityMatched ? 'Game/activity participated and item matched' : 'Game/activity participated')
        : 'No game/activity participation found'
    }
  };
}

/**
 * withSpFromTxns — use when transactions are pre-fetched
 * Passes _txns into withSp to avoid extra DB query
 */
export async function withSpFromTxns(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;
  const txns = await SPTransaction.find({ email: raw.email.toLowerCase() }).sort({ sessionDatetime: 1 }).lean();
  return withSp({ ...raw, _txns: txns });
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
  const activeRows = rows.filter(r => {
    const doc = students.find(s => (s.totalSp ?? 100) === r.sp.total);
    return doc && (doc.sessions && Object.values(doc.sessions).some(v => v > 0));
  });
  const totalSp = rows.reduce((sum, student) => sum + student.sp.total, 0);
  return {
    students: rows.length,
    averageSp: rows.length ? Math.round(totalSp / rows.length) : 0,
    highestSp: rows.length ? Math.max(...rows.map(s => s.sp.total)) : 0,
    activityParticipants: 0,
    allSessions: 0,
    sessionLabels: SESSION_LABELS
  };
}

// ─── Helpers (unchanged) ───────────────────────────────────────────────

export { normalizeEmail, maskEmail };
export { normalizeEmail as defaultNormalizeEmail };

export function isEmailLike(q) {
  return q.includes('@');
}

function sessionMinutes(raw, label) {
  if (raw.sessions instanceof Map) return Number(raw.sessions.get(label) || 0);
  return Number(raw.sessions?.[label] || 0);
}

function requiredMinutes(label) {
  if (label in SESSION_THRESHOLDS_MINUTES) return SESSION_THRESHOLDS_MINUTES[label];
  return Math.round((SESSION_DURATIONS[label] || 0) * SESSION_THRESHOLDS_PCT);
}

function hasActivity(raw) {
  return Array.isArray(raw.activities) && raw.activities.length > 0;
}

function hasMatchedActivity(raw) {
  return Array.isArray(raw.activities) && raw.activities.some(a => a.matched);
}