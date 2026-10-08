/**
 * Attendance streaks — a DERIVED VIEW over AttendanceRecord, same spirit as
 * levels.js: a pure function, no DB, no side effects.
 *
 * Chronological order is supplied by the caller rather than parsed from
 * sessionLabel inside computeStreak, so that stays a plain data transform.
 * orderSessionLabels() builds that order from the student's own attendance
 * ledger rows. It deliberately does NOT use the sessions collection: in
 * production that collection stopped growing after the May sessions, while the
 * pipeline keeps writing attendance for every later session, so ordering by it
 * would silently freeze the streak at May.
 */

const TOD = { morning: 0, afternoon: 1, evening: 2 };
const todOf = label => {
  const m = String(label || '').toLowerCase().match(/morning|afternoon|evening/);
  return m ? TOD[m[0]] : 0;
};

// attendanceTxns: sptransactions rows (category 'attendance') for one student,
// each carrying sessionLabel + dateTime. Returns labels oldest -> newest; two
// sessions on the same day (same dateTime) are split by morning/afternoon/evening.
export function orderSessionLabels(attendanceTxns) {
  const when = new Map();
  for (const t of attendanceTxns || []) {
    if (!t || !t.sessionLabel || !t.dateTime) continue;
    const ms = new Date(t.dateTime).getTime();
    if (Number.isNaN(ms)) continue;
    if (!when.has(t.sessionLabel) || ms < when.get(t.sessionLabel)) when.set(t.sessionLabel, ms);
  }
  return [...when.keys()].sort((a, b) =>
    when.get(a) - when.get(b) || todOf(a) - todOf(b) || (a < b ? -1 : a > b ? 1 : 0));
}

// current = consecutive attended sessions ending at the most recent session
// in the record; longest = the best run the student has ever had.
// "Attended" matches journey.js's existing `sessionsAttended` definition
// (attendedMinutes > 0), not `qualified`, so this streak never contradicts
// the sessions-attended count already shown next to it in My Journey.
export function computeStreak(attendanceRows, orderedSessionLabels) {
  const attendedByLabel = new Map(
    (attendanceRows || [])
      .filter(r => r && r.sessionLabel)
      .map(r => [r.sessionLabel, (r.attendedMinutes || 0) > 0])
  );

  // Only walk sessions this student has a record for at all. A session held
  // before the student joined never got them an AttendanceRecord row, so it
  // must not count as a miss and break a streak they couldn't have kept.
  const labels = (orderedSessionLabels || []).filter(l => attendedByLabel.has(l));

  let longest = 0, run = 0;
  for (const label of labels) {
    if (attendedByLabel.get(label)) { run += 1; longest = Math.max(longest, run); }
    else run = 0;
  }
  return { current: run, longest };
}
