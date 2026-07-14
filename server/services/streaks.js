/**
 * Spurti Attendance Streak Tracking.
 *
 * This is a DERIVED VIEW over the existing attendance data — a pure function, no DB,
 * no side effects. It computes the student's streak status from an already-fetched
 * array of their attendance records.
 */

import { SESSION_LABELS } from '../config.js';

export function computeStreak(attendanceRecords, protectedSessionLabels = []) {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      streakBrokenAt: null,
      isActive: false
    };
  }

  // Defensively sort the input chronologically based on SESSION_LABELS index.
  const sorted = [...attendanceRecords].sort((a, b) => {
    const idxA = SESSION_LABELS.indexOf(a.sessionLabel);
    const idxB = SESSION_LABELS.indexOf(b.sessionLabel);
    if (idxA !== -1 && idxB !== -1) {
      return idxA - idxB;
    }
    if (a.sessionLabel < b.sessionLabel) return -1;
    if (a.sessionLabel > b.sessionLabel) return 1;
    return 0;
  });

  let currentStreak = 0;
  let longestStreak = 0;
  let isActive = false;
  let streakBrokenAt = null;

  const protectedSet = new Set(protectedSessionLabels);

  for (const record of sorted) {
    if (record.qualified) {
      currentStreak++;
      isActive = true;
      streakBrokenAt = null;
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
      }
    } else if (protectedSet.has(record.sessionLabel)) {
      // Frozen session — does not break the streak, does not extend it either.
      // Skip entirely: currentStreak, isActive, longestStreak, streakBrokenAt unchanged.
      continue;
    } else {
      currentStreak = 0;
      isActive = false;
      streakBrokenAt = record.sessionLabel;
    }
  }

  return {
    currentStreak,
    longestStreak,
    streakBrokenAt,
    isActive
  };
}
