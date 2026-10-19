// Pure helpers behind the dashboard visuals. No DOM, no React — importable from
// node:test (see test/progress.test.js), which also pins the league table below
// to server/services/levels.js so the two copies cannot drift apart.

// Every 100 SP is a league band; every 300 SP a tier. Mirrors LEAGUE_BANDS.
export const LEAGUES = [
  [0, 'Bronze III'], [100, 'Bronze II'], [200, 'Bronze I'],
  [300, 'Silver III'], [400, 'Silver II'], [500, 'Silver I'],
  [600, 'Gold III'], [700, 'Gold II'], [800, 'Gold I'],
  [900, 'Platinum III'], [1000, 'Platinum II'], [1100, 'Platinum I'],
  [1200, 'Diamond III'], [1300, 'Diamond II'], [1400, 'Diamond I'],
  [1500, 'Legend']
];

export const TIERS = [
  { key: 'bronze', name: 'Bronze', from: 0 },
  { key: 'silver', name: 'Silver', from: 300 },
  { key: 'gold', name: 'Gold', from: 600 },
  { key: 'platinum', name: 'Platinum', from: 900 },
  { key: 'diamond', name: 'Diamond', from: 1200 },
  { key: 'legend', name: 'Legend', from: 1500 }
];

const num = v => Number(v) || 0;

export function leagueName(sp) {
  const s = Math.max(0, num(sp));
  let name = LEAGUES[0][1];
  for (const [from, n] of LEAGUES) if (s >= from) name = n;
  return name;
}

export const leagueIndex = name => LEAGUES.findIndex(([, n]) => n === name);
export const tierKey = league => String(league || 'Bronze').split(' ')[0].toLowerCase();

// The next band above `sp`, or null once at Legend.
export function nextLeague(sp) {
  const s = Math.max(0, num(sp));
  const hit = LEAGUES.find(([from]) => from > s);
  return hit ? { name: hit[1], at: hit[0], toGo: hit[0] - s } : null;
}

// Six equal-width segments (Bronze..Legend) with how full each one is, and where
// along the whole track the student sits (0..1).
export function tierTrack(sp) {
  const s = Math.max(0, num(sp));
  const cur = Math.min(TIERS.length - 1, Math.floor(s / 300));
  const segments = TIERS.map((t, i) => {
    let fill = 0;
    if (i < cur) fill = 1;
    else if (i === cur) fill = i === TIERS.length - 1 ? 1 : (s - t.from) / 300;
    return { ...t, to: i === TIERS.length - 1 ? null : t.from + 300, fill };
  });
  const position = (cur + segments[cur].fill) / TIERS.length;
  return { segments, position, current: cur };
}

// Level = floor(highestSpEver / 100); how far through the current level.
export function levelProgress(highestSp) {
  const hs = Math.max(0, num(highestSp));
  const level = Math.floor(hs / 100);
  const into = hs - level * 100;
  return { level, nextLevel: level + 1, into, span: 100, pct: into, toNext: 100 - into };
}

export function initials(name) {
  const words = String(name || '').split(/\s+/).filter(w => /^[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map(w => Array.from(w)[0].toUpperCase());
  return letters.join('') || '?';
}

// Stable 0-359 hue from a name, so a student's avatar colour never changes.
export function hueFor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

// ---- Session labels ---------------------------------------------------------
// Labels come in two formats — "15 May Morning" and "Day 10 (26 May)". Parse the
// real session date (+ time-of-day) into a comparable number so we can sort
// chronologically; unknown labels return -1. Higher = more recent. (Moved here
// from main.jsx unchanged so it can be tested.)
const POLL_MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const POLL_TOD = { morning: 0, afternoon: 1, evening: 2 };

export function pollSortKey(label = '') {
  let day, mon;
  const paren = label.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) { day = +paren[1]; mon = paren[2]; }
  else {
    const lead = label.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (lead) { day = +lead[1]; mon = lead[2]; }
  }
  const m = mon ? POLL_MONTHS[mon.slice(0, 3).toLowerCase()] : undefined;
  if (m === undefined || !day) return -1;
  const todMatch = label.toLowerCase().match(/morning|afternoon|evening/);
  const tod = todMatch ? POLL_TOD[todMatch[0]] : 0;
  return ((m * 100 + day) * 10) + tod;
}

// The last `n` sessions this student has a record for, oldest first. "Attended" is
// attendedMinutes > 0 — the same definition the Standups card already uses.
export function recentSessionDots(attendance, n = 12) {
  return [...(attendance || [])]
    .filter(r => r && r.sessionLabel)
    .sort((a, b) => pollSortKey(a.sessionLabel) - pollSortKey(b.sessionLabel))
    .slice(-n)
    .map(r => ({ label: r.sessionLabel, minutes: num(r.attendedMinutes), attended: num(r.attendedMinutes) > 0 }));
}

// ---- "Your points went up" ---------------------------------------------------
export const snapshotOf = student => ({
  sp: num(student?.totalSp),
  level: num(student?.level),
  league: String(student?.trophyLeague || '')
});

// Compare what this device last saw with what the student has now.
//   league > level > sp. Nothing to celebrate on a first visit (no `prev`), when
//   points are equal, or when they fell — a penalty or a ledger rebuild must never
//   be answered with confetti.
export function celebration(prev, cur) {
  const none = { kind: null, delta: 0, from: cur?.sp ?? 0, to: cur?.sp ?? 0 };
  if (!prev || typeof prev.sp !== 'number' || !cur) return none;
  const delta = cur.sp - prev.sp;
  if (!(delta > 0)) return none;
  const base = { delta, from: prev.sp, to: cur.sp };
  if (leagueIndex(cur.league) > leagueIndex(prev.league) && leagueIndex(prev.league) >= 0) {
    return { kind: 'league', ...base, league: cur.league };
  }
  if (cur.level > num(prev.level)) return { kind: 'level', ...base, level: cur.level };
  return { kind: 'sp', ...base };
}

// Traffic-light colour for a completion percentage: under 10% red, 10% up to
// (not including) 50% amber, 50% and over -> null, meaning "use the normal colour".
export function progressTone(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  if (n < 10) return '#ef4444';
  if (n < 50) return '#f59e0b';
  return null;
}

// ---- Pace: is the student where they should be BY NOW? -----------------------
// Colour comes from actual progress relative to the progress expected today, so a
// student on day 3 with 120 of the 180 minutes they should have is fine, while the
// same 4% overall could be red on day 60. The 10% / 50% cut-offs (progressTone)
// are applied to that ratio.
export const STANDUP_MIN_PER_DAY = 60;     // mirrors server/services/journey.js
export const STANDUP_TARGET_MIN = 3600;

const localDay = (d) => { const x = new Date(d); return new Date(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };  // start dates are stored at UTC midnight
const today0 = (now) => { const x = new Date(now); return new Date(x.getFullYear(), x.getMonth(), x.getDate()); };

// Working days (Mon-Sat, Sunday off - the same 6/week the goal maths uses) from the
// start date through today, inclusive: the start date is "day 1".
export function workingDaysSince(start, now = new Date()) {
  if (!start) return 0;
  const from = localDay(start); const to = today0(now);
  let n = 0;
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) n += 1;
  return n;
}

// Where the student should be by now, in percent (0-100), or null when there is no
// honest baseline. standup: 60 min per working day. Others: a straight line from the
// start date to the student's own goal date (a passed goal date means "should be done");
// with no goal date, the internship end date; with neither, null (no colour signal).
export function expectedPct({ track, start, end, goalDate, now = new Date() }) {
  if (!start) return null;
  if (track === 'standup') {
    return Math.min(100, (workingDaysSince(start, now) * STANDUP_MIN_PER_DAY / STANDUP_TARGET_MIN) * 100);
  }
  const to = goalDate || end;
  if (!to) return null;
  const from = localDay(start).getTime(); const t = localDay(to).getTime(); const n = today0(now).getTime();
  if (t <= from) return null;
  return Math.max(0, Math.min(100, ((n - from) / (t - from)) * 100));
}

// Colour for "actual% done vs expected% by today", or null for the normal colour.
export function paceTone(actualPct, expected) {
  if (expected == null || !(expected > 0)) return null;
  return progressTone((Number(actualPct) || 0) / expected * 100);
}
