/**
 * SP Service
 * Uses Student.totalSp (pre-computed, stored) and SP_Transactions (append-only log).
 * No recomputation from raw data — unless totalSp is missing (migration fallback).
 */

import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';

export function withSp(studentDoc, sessions = []) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;

  const totalSp = raw.totalSp ?? 100;

  // Build sessionLedger from actual Session collection
  const sessionLedger = sessions.map(s => {
    const label = s.label;
    const fullMinutes = s.totalMinutes || 0;
    const attendRec = (raw._attendance || []).find(a => a.sessionLabel === label);
    const minutes = attendRec ? Number(attendRec.attendedMinutes || 0) : 0;
    const threshold = Math.round(fullMinutes * 0.75);
    const qualified = minutes >= threshold && fullMinutes > 0;
    const attendedPartial = minutes > 0 && !qualified;
    const pct = fullMinutes ? Math.round((minutes / fullMinutes) * 100) : 0;
    const tierSp = pct >= 90 ? 10 : pct >= 75 ? 5 : pct >= 50 ? 3 : 0;
    const sp = qualified ? tierSp : 0;
    const reason = qualified
      ? `Present for at least ${threshold} min (${Math.round(minutes)}/${fullMinutes} min) — ${tierSp > 0 ? '+' + tierSp + ' SP' : '0 SP'}`
      : minutes > 0
        ? `Present for ${Math.round(minutes)} min (${Math.round((minutes/fullMinutes)*100)}% of ${fullMinutes}) — below ${threshold} min threshold — 0 SP`
        : `Absent — 0 SP`;
    return { label, minutes, fullMinutes, threshold, qualified, attendedPartial, sp, reason };
  });

  const totalMinutes = sessionLedger.reduce((sum, item) => sum + Number(item.minutes || 0), 0);
  const sessionsAttended = sessionLedger.filter(item => item.qualified).length;
  const hasAttendance = totalMinutes > 0;

  const attendanceSp = sessionLedger.reduce((sum, item) => sum + item.sp, 0);

  // Poll SP from transaction log — use appliedDelta, not delta
  const pollTxns = (raw._txns || []).filter(t => t.category === 'poll');
  const pollSp = pollTxns.reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0);

  const initialSp = (raw._txns || []).filter(t => t.category === 'initial').reduce((sum, t) => sum + Number(t.appliedDelta || 0), 0) || totalSp || 100;

  return {
    _id: String(raw._id || ''),
    name: raw.name,
    email: raw.email,
    alternateEmail: raw.alternateEmail,
    onboardingDate: raw.internshipStartDate || null,
    totalMinutes,
    sessionsAttended,
    hasAttendance,
    sp: {
      initial: initialSp,
      attendance: attendanceSp,
      poll: pollSp,
      total: totalSp,
      sessionLedger,
      pollLedger: raw.polls || [],
    }
  };
}

/**
 * withSpFromTxns — use when transactions are pre-fetched
 * Passes _txns and _attendance into withSp to avoid extra DB query
 */
export async function withSpFromTxns(studentDoc) {
  const raw = typeof studentDoc.toObject === 'function' ? studentDoc.toObject() : studentDoc;
  const [txns, attendance] = await Promise.all([
    SPTransaction.find({ email: raw.email.toLowerCase() }).sort({ dateTime: 1 }).lean(),
    AttendanceRecord.find({ email: raw.email.toLowerCase() }).lean()
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
    highestSp: rows.length ? rows.reduce((mx, s) => Math.max(mx, s.sp.total || 0), 0) : 0,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export function isEmailLike(q) {
  return q.includes('@');
}

export function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const visibleStart = name.slice(0, Math.min(2, name.length));
  const visibleEnd = name.length > 4 ? name.slice(-2) : '';
  return `${visibleStart}${'*'.repeat(Math.max(3, name.length - visibleStart.length - visibleEnd.length))}${visibleEnd}@${domain}`;
}