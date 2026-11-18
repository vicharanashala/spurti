// Standup streak: how many sessions in a row a student attended.
//
// A session the student has no record for still counts as missed, so the list of
// sessions comes from every attendance record, not just the student's own. Labels
// look like "12 Aug Morning" or "Day 64 (12 Aug) Evening"; they are ordered by date
// and then morning/afternoon/evening, the same rule the client uses for poll labels.
import AttendanceRecord from '../models/AttendanceRecord.js';

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const TOD = { morning: 0, afternoon: 1, evening: 2 };

export function sessionSortKey(label = '') {
  let day, mon;
  const paren = label.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) { day = +paren[1]; mon = paren[2]; }
  else {
    const lead = label.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (lead) { day = +lead[1]; mon = lead[2]; }
  }
  const m = mon ? MONTHS[mon.slice(0, 3).toLowerCase()] : undefined;
  if (m === undefined || !day) return -1;
  const todMatch = label.toLowerCase().match(/morning|afternoon|evening/);
  const tod = todMatch ? TOD[todMatch[0]] : 0;
  return ((m * 100 + day) * 10) + tod;
}

// sessionLabels: every session held (any order). attended: labels this student attended.
// current = attended sessions in a row counting back from the latest session held
// (0 if the latest one was missed); longest = the best run so far.
export function computeStreak(sessionLabels, attended) {
  const seen = attended instanceof Set ? attended : new Set(attended || []);
  const ordered = [...new Set(sessionLabels || [])]
    .filter(l => sessionSortKey(l) >= 0)
    .sort((a, b) => sessionSortKey(a) - sessionSortKey(b));
  let run = 0, longest = 0;
  for (const label of ordered) {
    run = seen.has(label) ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  return { current: run, longest };
}

// The session list changes only when the pipeline syncs, so read it at most every 10 minutes.
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, labels: null };

export async function allSessionLabels() {
  if (cache.labels && Date.now() - cache.at < TTL_MS) return cache.labels;
  const labels = await AttendanceRecord.distinct('sessionLabel');
  cache = { at: Date.now(), labels };
  return labels;
}

// attendance: the student's own AttendanceRecord rows (already loaded by the caller).
export async function streakFor(attendance) {
  const attended = new Set((attendance || []).filter(r => (r.attendedMinutes || 0) > 0).map(r => r.sessionLabel));
  return computeStreak(await allSessionLabels(), attended);
}
