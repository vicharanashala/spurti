/**
 * Attendance streaks — a DERIVED VIEW over AttendanceRecord, same spirit as
 * levels.js: a pure function, no DB, no side effects.
 *
 * Chronological order is supplied by the caller (the Session collection's
 * endDateTime, already the canonical sort key elsewhere in server.js) rather
 * than parsed from sessionLabel here, so this stays a plain data transform.
 */

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
