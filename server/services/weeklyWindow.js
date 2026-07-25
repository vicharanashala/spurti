// ============================================================
// Weekly Window Service
// Defines the weekly competition window used by the desktop
// Weekly Leaderboard:
//   Monday 06:00 IST  ->  Saturday 23:59 IST
//   Sunday            ->  "Calculating Weekly Champions..."
//   Sunday 23:59 IST  ->  next Monday 06:00 IST (still previous week)
//
// All timestamps are normalized to Asia/Kolkata (IST, UTC+5:30)
// since the IIT Ropar internship is India-based.
// ============================================================

const IST_OFFSET_MIN = 330; // 5h30m

// Returns a Date in UTC that represents the given IST wall clock.
function istToUtc(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30));
}

// Format a Date as an IST date key like "2026-07-21".
function istDateKey(d) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// "Now" expressed in IST wall-clock components.
function nowIstParts(d = new Date()) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0=Sun ... 6=Sat
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

// Determine the *competition week* a given moment falls into.
// A week is anchored on Monday 06:00 IST and ends Saturday 23:59 IST.
// Sunday is a "calculating" day that still belongs to the previous week.
export function weekContaining(d = new Date()) {
  const parts = nowIstParts(d);
  // Use noon IST to avoid edge cases around the 6:00 boundary.
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  let weekday = shifted.getUTCDay(); // 0=Sun ... 6=Sat
  let day = shifted.getUTCDate();
  let month = shifted.getUTCMonth() + 1;
  let year = shifted.getUTCFullYear();

  // Sunday (0): the visible "results" still belong to last week.
  // Saturday after 23:59 IST has technically ended; treat as next week's start at that instant.
  if (weekday === 0) {
    // Roll back to the Monday of the *previous* week.
    day -= 6;
  } else if (weekday >= 2) {
    // Tue..Sat: anchor on this week's Monday.
    day -= (weekday - 1);
  } else if (weekday === 1) {
    // Monday: depends on time. Before 06:00 → previous week; otherwise this week.
    if (parts.hour < 6) day -= 7;
  }
  // Normalize the rolled-back date.
  const mondayUtc = istToUtc(year, month, day, 6, 0);
  const saturdayUtc = new Date(mondayUtc.getTime() + (5 * 24 + 17) * 3600 * 1000 + 59 * 60_000);
  // The week "label" is the Monday's IST date key.
  const label = istDateKey(mondayUtc);
  return {
    label, // e.g. "2026-07-20"
    startIso: mondayUtc.toISOString(),
    endIso: saturdayUtc.toISOString(),
    startMs: mondayUtc.getTime(),
    endMs: saturdayUtc.getTime()
  };
}

// What "phase" are we in for a given moment?
//   'pre-start'   — Monday before 06:00 (rare — usually first launch)
//   'live'       — Mon 06:00 → Sat 23:59
//   'calculating'— Sunday (results are being finalized)
export function weekPhase(d = new Date()) {
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const weekday = shifted.getUTCDay(); // 0..6
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();

  if (weekday === 0) return 'calculating';
  if (weekday === 1 && (hour < 6 || (hour === 6 && minute < 0))) return 'pre-start';
  if (weekday === 6 && hour === 23 && minute >= 59) return 'live'; // last minute
  return 'live';
}

// Countdown to Saturday 23:59 IST (or to next Monday 06:00 if currently calculating).
export function nextDeadline(d = new Date()) {
  const w = weekContaining(d);
  const phase = weekPhase(d);
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const weekday = shifted.getUTCDay();
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  if (phase === 'live' || phase === 'pre-start') {
    // Saturday of the same week at 23:59 IST.
    const daysFromMon = weekday === 0 ? 6 : weekday === 1 ? 5 : 6 - weekday + (weekday === 6 ? 0 : 0);
    // Easier: just take endMs from weekContaining.
    return { ms: w.endMs, iso: w.endIso, phase };
  }
  // calculating → next Monday 06:00 IST
  const nextMondayShifted = new Date(Date.UTC(year, month - 1, day + (weekday === 0 ? 1 : 8 - weekday), 6, 0));
  const utc = new Date(nextMondayShifted.getTime() - IST_OFFSET_MIN * 60_000);
  return { ms: utc.getTime(), iso: utc.toISOString(), phase };
}

// Human-readable week label, e.g. "Week of Jul 20 – Jul 25".
export function formatWeekLabel(week) {
  const startIst = new Date(new Date(week.startIso).getTime() + IST_OFFSET_MIN * 60_000);
  const endIst = new Date(new Date(week.endIso).getTime() + IST_OFFSET_MIN * 60_000);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(startIst)} – ${fmt(endIst)}`;
}