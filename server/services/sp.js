/**
 * SP Service — derived views over the current schema.
 *
 * B4-FIX: previous version referenced non-existent Student schema fields
 * (sessions, activities, polls, onboardingDate, _txns). This version guards
 * all deprecated field accesses defensively and fixes the withSpFromTxns sort
 * to use the correct 'dateTime' field (not 'sessionDatetime').
 *
 * These functions are utility helpers; the main runtime data assembly happens in
 * server.js → studentPayload(), which queries AttendanceRecord and PollRecord
 * directly. These helpers remain available for scripts and testing use.
 */

import { SESSION_LABELS, SESSION_DURATIONS, SESSION_DATETIME_MAP, SESSION_THRESHOLDS_MINUTES, SESSION_THRESHOLDS_PCT } from '../config.js';
import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';

// ─── Main View Builder ────────────────────────────────────────────────────────

/**
 * Build a derived SP view for a student document.
 * Works with both full Mongoose documents and plain objects.
 *
 * B4-FIX: all fields that no longer exist on the Student schema
 * (sessions, activities, polls, onboardingDate) are now guarded
 * with safe defaults so this function never throws on the current schema.
 */
export function withSp(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;

  // totalSp is stored directly on Student since schema migration.
  const totalSp = raw.totalSp ?? 100;

  // sessions is a legacy field; guard defensively — returns 0 per label if absent.
  const sessions = {};
  for (const label of SESSION_LABELS) {
    sessions[label] = sessionMinutes(raw, label);
  }

  const totalMinutes     = SESSION_LABELS.reduce((sum, label) => sum + Number(sessions[label] || 0), 0);
  const sessionsAttended = SESSION_LABELS.filter(label => Number(sessions[label] || 0) > 0).length;
  const hasAttendance    = totalMinutes > 0;

  // _txns may be pre-fetched by the caller; otherwise fall back to empty array.
  const txns = raw._txns || [];

  const sessionLedger = SESSION_LABELS.map(label => {
    const minutes     = Number(sessions[label] || 0);
    const fullMinutes = SESSION_DURATIONS[label] || 0;
    const threshold   = requiredMinutes(label);
    const qualified   = minutes >= threshold;
    const sp = qualified ? 5 : -5;
    const reason = qualified
      ? `Present for at least ${threshold} min (${Math.round(minutes)}/${fullMinutes} min) — earned +5 SP`
      : minutes > 0
        ? `Present for ${Math.round(minutes)} min (${Math.round((minutes / fullMinutes) * 100)}% of ${fullMinutes}) — below ${threshold} min threshold — -5 SP applied`
        : `Absent — -5 SP applied`;
    return { label, minutes, fullMinutes, threshold, qualified, attendedPartial: minutes > 0 && !qualified, sp, reason };
  });

  // onboardingDate is a legacy field; guard defensively.
  const onboardingDate = raw.onboardingDate ? new Date(raw.onboardingDate) : null;

  const filteredLedger = sessionLedger.filter(item => {
    if (!onboardingDate) return true;
    const sessionDate = SESSION_DATETIME_MAP[item.label];
    if (!sessionDate) return true;
    return new Date(sessionDate) >= onboardingDate;
  });

  const attendanceSp = filteredLedger.reduce((sum, item) => sum + item.sp, 0);

  // Poll SP from pre-fetched transactions; empty if _txns not supplied.
  const pollTxns = txns.filter(t => t.category === 'poll');
  const pollSp   = pollTxns.reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0); // B4-FIX: appliedDelta

  // Activity SP — placeholder, kept for future extensibility.
  const activitySp = 0; // Activity scoring not yet implemented in this cohort.

  return {
    _id:            String(raw._id || ''),
    name:           raw.name,
    email:          raw.email,
    alternateEmail: raw.alternateEmail,
    onboardingDate: raw.onboardingDate || null,
    sessions,
    totalMinutes,
    sessionsAttended,
    hasAttendance,
    activities:     raw.activities || [],      // B4-FIX: guarded default
    polls:          raw.polls || [],           // B4-FIX: guarded default
    activityItems:  raw.activityItems || '',
    activityMatched: raw.activityMatched || '',
    sp: {
      initial:       100,
      attendance:    attendanceSp,
      activity:      activitySp,
      poll:          pollSp,
      total:         totalSp,
      sessionLedger: filteredLedger,
      pollLedger:    raw.polls || [],
      activityReason: (raw.activities || []).length > 0
        ? (raw.activityMatched ? 'Game/activity participated and item matched' : 'Game/activity participated')
        : 'No game/activity participation found'
    }
  };
}

/**
 * Fetch transactions for a student and build the withSp view in one step.
 * B4-FIX: sort now uses 'dateTime' (the actual schema field, not 'sessionDatetime').
 */
export async function withSpFromTxns(studentDoc) {
  const raw  = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;
  const txns = await SPTransaction.find({ email: raw.email.toLowerCase() })
    .sort({ dateTime: 1, createdAt: 1 })    // B4-FIX: dateTime (not sessionDatetime)
    .lean();
  return withSp({ ...raw, _txns: txns });
}

// ─── Public Student View ──────────────────────────────────────────────────────

/**
 * Minimal masked view for public search results.
 * Does not require authentication; email is partially hidden.
 */
export function publicStudent(studentDoc) {
  const student = withSp(studentDoc);
  return {
    _id:                  student._id,
    name:                 student.name,
    maskedEmail:          maskEmail(student.email),
    maskedAlternateEmail: student.alternateEmail && student.alternateEmail !== student.email
      ? maskEmail(student.alternateEmail)
      : '',
    spPreview:    student.sp.total,
    hasAttendance: student.hasAttendance
  };
}

// ─── Cohort Summary ───────────────────────────────────────────────────────────

/**
 * Lightweight cohort aggregate from an array of Student lean documents.
 * Uses totalSp stored on each student — no recomputation from transactions.
 *
 * B4-FIX: removed reference to doc.sessions (not in current Student schema).
 * Active-student filter now uses status field which IS on the schema.
 */
export function summary(students) {
  const rows = students.map(s => ({ name: s.name, sp: { total: s.totalSp ?? 100 }, status: s.status }));
  const totalSp = rows.reduce((sum, student) => sum + student.sp.total, 0);
  return {
    students:            rows.length,
    averageSp:           rows.length ? Math.round(totalSp / rows.length) : 0,
    highestSp:           rows.length ? Math.max(...rows.map(s => s.sp.total)) : 0,
    activityParticipants: 0,
    allSessions:         0,
    sessionLabels:       SESSION_LABELS
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmailLike(q) {
  return q.includes('@');
}

function sessionMinutes(raw, label) {
  // Guard: sessions is a legacy field not present on the current Student schema.
  if (raw.sessions instanceof Map) return Number(raw.sessions.get(label) || 0);
  return Number(raw.sessions?.[label] || 0);
}

function requiredMinutes(label) {
  if (label in SESSION_THRESHOLDS_MINUTES) return SESSION_THRESHOLDS_MINUTES[label];
  return Math.round((SESSION_DURATIONS[label] || 0) * SESSION_THRESHOLDS_PCT);
}

/**
 * Returns true if the student has participated in any activity.
 * B4-FIX: was unreachable dead code; now exported and documented for future use
 * when activity scoring is reintroduced.
 */
export function hasActivity(raw) {
  return Array.isArray(raw.activities) && raw.activities.length > 0;
}

/**
 * Returns true if the student participated AND had an activity item matched.
 * B4-FIX: was unreachable dead code; see hasActivity above.
 */
export function hasMatchedActivity(raw) {
  return Array.isArray(raw.activities) && raw.activities.some(a => a.matched);
}

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd   = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}