// Replay Engine
const DAY_MS = 24 * 60 * 60 * 1000;
function safeNum(x, fallback = 0) { const n = Number(x); return Number.isFinite(n) ? n : fallback; }
function startOfWeek(d) { const out = new Date(d); out.setHours(0,0,0,0); out.setDate(d.getDate() - d.getDay()); return out; }
function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function dayName(idx) { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][idx]; }

function buildWeekSummary(profile, weekStart) {
  const weekEnd = weekStart.getTime() + 7 * DAY_MS;
  const attendance = Array.isArray(profile.attendance) ? profile.attendance : [];
  const polls = Array.isArray(profile.polls) ? profile.polls : [];
  const transactions = Array.isArray(profile.transactions) ? profile.transactions : [];

  const sessionsAttended = attendance.filter(a => {
    const t = a.dateTime || a.sessionDate;
    if (!t) return false;
    const ms = new Date(t).getTime();
    return ms >= weekStart.getTime() && ms < weekEnd;
  }).filter(a => a.qualified).length;

  let pollsAnswered = 0;
  for (const p of polls) {
    const t = p.dateTime;
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (ms >= weekStart.getTime() && ms < weekEnd) pollsAnswered += safeNum(p.attemptedQuestions, 0);
  }

  const dayBuckets = new Array(7).fill(0);
  let spEarned = 0;
  for (const tx of transactions) {
    const t = tx && tx.dateTime;
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (ms < weekStart.getTime() || ms >= weekEnd) continue;
    const v = safeNum(tx.appliedDelta, 0);
    if (v <= 0) continue;
    spEarned += v;
    const dayStart = new Date(t); dayStart.setHours(0,0,0,0);
    const dayIdx = Math.round((dayStart.getTime() - weekStart.getTime()) / DAY_MS);
    if (dayIdx >= 0 && dayIdx < 7) dayBuckets[dayIdx] += v;
  }
  let bestDaySp = 0, bestDayIdx = -1;
  for (let i = 0; i < 7; i++) {
    if (dayBuckets[i] > bestDaySp) { bestDaySp = dayBuckets[i]; bestDayIdx = i; }
  }

  let highestRank = null;
  for (const tx of transactions) {
    const t = tx && tx.dateTime;
    if (!t) continue;
    const ms = new Date(t).getTime();
    if (ms < weekStart.getTime() || ms >= weekEnd) continue;
    const inferred = safeNum(tx.rankAfter, null);
    if (inferred != null && (highestRank == null || inferred < highestRank)) highestRank = inferred;
  }

  let longest = 0, current = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart.getTime() + i * DAY_MS);
    const has = transactions.some(tx => {
      const t = tx && tx.dateTime;
      if (!t) return false;
      return new Date(t).toDateString() === day.toDateString() && safeNum(tx.appliedDelta, 0) > 0;
    });
    if (has) { current++; if (current > longest) longest = current; }
    else { current = 0; }
  }

  return {
    weekStartIso: isoDate(weekStart),
    sessionsAttended,
    pollsAnswered,
    spEarned,
    bestDayIdx,
    bestDayName: bestDayIdx >= 0 ? dayName(bestDayIdx) : '—',
    longestStreakInWeek: longest,
    highestRank
  };
}

export function buildWeeklyReplay(profile) {
  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * DAY_MS);
  weekStart.setHours(0,0,0,0);
  const current = buildWeekSummary(profile, weekStart);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
  const previous = buildWeekSummary(profile, prevWeekStart);

  const metrics = [
    { name: 'Attendance', delta: current.sessionsAttended - previous.sessionsAttended, base: previous.sessionsAttended },
    { name: 'Polls',      delta: current.pollsAnswered - previous.pollsAnswered,    base: previous.pollsAnswered },
    { name: 'SP',         delta: current.spEarned - previous.spEarned,            base: previous.spEarned }
  ];
  let mostImproved = 'Attendance';
  let bestGain = -Infinity;
  for (const m of metrics) {
    const pct = m.base > 0 ? m.delta / m.base : (m.delta > 0 ? 1 : 0);
    if (pct > bestGain) { bestGain = pct; mostImproved = m.name; }
  }
  if (bestGain <= 0) mostImproved = 'Attendance';
  return { ...current, previous, most_improved: mostImproved, most_improved_pct: Math.round(Math.max(0, bestGain) * 100) };
}

export function buildReplayHistory(profile, weeks) {
  if (!weeks) weeks = 6;
  const out = [];
  for (let i = 1; i <= weeks; i++) {
    const weekStart = new Date(Date.now() - (i * 7 + 6) * DAY_MS);
    weekStart.setHours(0,0,0,0);
    out.push(buildWeekSummary(profile, weekStart));
  }
  return out.reverse();
}

export function buildFinalJourney(profile) {
  const attendance = Array.isArray(profile.attendance) ? profile.attendance : [];
  const polls = Array.isArray(profile.polls) ? profile.polls : [];
  const transactions = Array.isArray(profile.transactions) ? profile.transactions : [];

  let startRank = 658;
  if (transactions.length > 0) {
    const sorted = [...transactions].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    const firstBal = safeNum(sorted[0].balanceAfter, 100);
    startRank = Math.max(1, Math.round(700 - firstBal * 0.5));
  }
  const currentRank = safeNum(profile.student && profile.student.rank, null);
  const endRank = currentRank != null ? currentRank : Math.max(1, startRank - 30);

  const totalSp = transactions.filter(t => safeNum(t.appliedDelta, 0) > 0).reduce((s, t) => s + safeNum(t.appliedDelta, 0), 0);
  const sessionsAttended = attendance.filter(a => a.qualified).length;
  let pollsAnswered = 0;
  for (const p of polls) pollsAnswered += safeNum(p.attemptedQuestions, 0);

  let bestWeek = null;
  for (let w = 0; w < 12; w++) {
    const ws = new Date(Date.now() - (w * 7 + 6) * DAY_MS);
    ws.setHours(0,0,0,0);
    const summary = buildWeekSummary(profile, ws);
    if (!bestWeek || summary.spEarned > bestWeek.spEarned) bestWeek = { weekStartIso: summary.weekStartIso, spEarned: summary.spEarned };
  }

  let longestStreak = 0, currentStreak = 0;
  for (let d = 0; d < 90; d++) {
    const day = new Date(Date.now() - d * DAY_MS);
    const has = transactions.some(t => {
      const td = t && t.dateTime;
      if (!td) return false;
      return new Date(td).toDateString() === day.toDateString() && safeNum(t.appliedDelta, 0) > 0;
    });
    if (has) { currentStreak++; if (currentStreak > longestStreak) longestStreak = currentStreak; }
    else currentStreak = 0;
  }

  let bestAchievement = 'Steady Contributor';
  if (longestStreak >= 30) bestAchievement = 'Consistency Champion';
  else if (totalSp >= 500) bestAchievement = 'SP Powerhouse';
  else if (endRank && endRank <= 10) bestAchievement = 'Top-10 Finisher';
  else if (pollsAnswered >= 100) bestAchievement = 'Poll Champion';
  else if (sessionsAttended >= 20) bestAchievement = 'Attendance Hero';

  return {
    startRank, endRank, totalSp, sessionsAttended, pollsAnswered,
    bestWeek, longestStreak, bestAchievement,
    personaEvolution: { from: 'Explorer', to: 'Contributor' }
  };
}

export function isFinalJourneyUnlocked(profile) {
  const transactions = Array.isArray(profile.transactions) ? profile.transactions : [];
  if (transactions.length === 0) return false;
  const validTxs = transactions.filter(t => t.dateTime);
  if (validTxs.length === 0) return false;
  const earliest = Math.min(...validTxs.map(t => new Date(t.dateTime).getTime()));
  const daysSinceStart = (Date.now() - earliest) / DAY_MS;
  const totalSp = transactions.filter(t => safeNum(t.appliedDelta, 0) > 0).reduce((s, t) => s + safeNum(t.appliedDelta, 0), 0);
  return daysSinceStart >= 42 || totalSp >= 300;
}