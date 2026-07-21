const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = ['Morning', 'Afternoon', 'Evening'];

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function parseMonthKey(value = '') {
  const raw = String(value || '').trim().slice(0, 3).toLowerCase();
  return MONTHS[raw] ?? null;
}

export function getSessionYear(student = {}) {
  const raw = student?.internshipStartDate;
  const date = raw instanceof Date ? raw : new Date(raw || Date.now());
  return Number.isFinite(date.getTime()) ? date.getFullYear() : new Date().getFullYear();
}

export function parseSessionDate(label, fallbackYear = new Date().getFullYear()) {
  const raw = String(label || '').trim();
  if (!raw) return null;

  const parenMatch = raw.match(/\((\d{1,2})\s+([A-Za-z]{3,})\)/i);
  const plainMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]{3,})/i);
  const match = parenMatch || plainMatch;

  if (!match) return null;

  const day = Number(match[1]);
  const month = parseMonthKey(match[2]);
  if (!Number.isInteger(day) || month === null) return null;

  const date = new Date(fallbackYear, month, day, 9, 0, 0);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function getSessionPeriod(label) {
  const raw = String(label || '').toLowerCase();
  if (raw.includes('morning')) return 'Morning';
  if (raw.includes('afternoon')) return 'Afternoon';
  if (raw.includes('evening')) return 'Evening';
  return 'Unknown';
}

export function formatSessionDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Unknown';
  const weekday = date.toLocaleDateString(undefined, { weekday: 'long' });
  const dayLabel = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${weekday} • ${dayLabel}`;
}

export function formatTimeOfDay(label) {
  const period = getSessionPeriod(label);
  return period === 'Unknown' ? 'Session' : period;
}

function getWeekdayName(date) {
  return DAY_LABELS[date.getDay()] || 'Unknown';
}

function computeStreak(records) {
  const attended = records.map((record) => safeNumber(record.attendedMinutes) > 0);
  if (!attended.length) return { longest: 0, current: 0 };

  let longest = 0;
  let current = 0;
  let running = 0;

  for (const isAttended of attended) {
    if (isAttended) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  for (let index = attended.length - 1; index >= 0; index -= 1) {
    if (attended[index]) current += 1;
    else break;
  }

  return { longest, current };
}

function buildHeatmapRows(records) {
  if (!records.length) return [];

  const ordered = [...records].sort((a, b) => new Date(a.sessionDate) - new Date(b.sessionDate));
  const weekStarts = new Map();
  for (const record of ordered) {
    const date = record.sessionDate;
    const day = date.getDay();
    const diff = (day + 6) % 7;
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - diff);
    const key = `${start.getFullYear()}-${start.getMonth() + 1}-${start.getDate()}`;
    if (!weekStarts.has(key)) weekStarts.set(key, Array.from({ length: 7 }, () => ({ pct: 0, total: 0 })));
    const bucket = weekStarts.get(key);
    const bucketIndex = day;
    bucket[bucketIndex].total += 1;
    bucket[bucketIndex].pct += safeNumber(record.attendancePercentage);
  }

  return [...weekStarts.entries()].map(([key, cells]) => {
    const base = new Date(key.replace(/-/g, '/'));
    const weekLabel = base.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const normalizedCells = cells.map((cell) => ({
      percentage: cell.total ? Math.round(cell.pct / cell.total) : 0,
      total: cell.total
    }));

    return {
      key,
      weekLabel,
      cells: normalizedCells
    };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

function getConsistencyLabel(score) {
  if (score >= 85) return 'Very Consistent';
  if (score >= 70) return 'Consistent';
  if (score >= 50) return 'Building Rhythm';
  return 'Needs More Consistency';
}

function buildRecommendations(weekdayStats, periodStats, totalSessions, attendancePct, currentStreak) {
  const recommendations = [];
  const worstDay = [...weekdayStats].sort((a, b) => a.attendancePct - b.attendancePct)[0];
  const bestDay = [...weekdayStats].sort((a, b) => b.attendancePct - a.attendancePct)[0];
  const strongestPeriod = [...periodStats].sort((a, b) => b.attendancePct - a.attendancePct)[0];

  if (worstDay && worstDay.attendancePct < 100) {
    recommendations.push(`Attend more ${worstDay.name} sessions.`);
  }

  if (strongestPeriod && strongestPeriod.name !== 'Unknown' && strongestPeriod.attendancePct >= 75) {
    recommendations.push(`Maintain your ${strongestPeriod.name.toLowerCase()} consistency.`);
  }

  if (bestDay && bestDay.name) {
    recommendations.push(`Keep your ${bestDay.name} routine strong.`);
  }

  if (totalSessions && attendancePct < 100 && currentStreak < totalSessions) {
    recommendations.push('Attend one more session this week to improve consistency.');
  }

  if (periodStats.some((period) => period.name === 'Evening' && period.attendancePct < 50)) {
    recommendations.push('Improve evening attendance to lift your overall learning consistency.');
  }

  return recommendations.slice(0, 4);
}

function buildPatternSummary(weekdayStats, periodStats, attendancePct, sessionsAttended, sessionsMissed, historicalTrend) {
  const summary = [];
  const bestDay = [...weekdayStats].sort((a, b) => b.attendancePct - a.attendancePct)[0];
  const worstDay = [...weekdayStats].sort((a, b) => a.attendancePct - b.attendancePct)[0];
  const strongestPeriod = [...periodStats].sort((a, b) => b.attendancePct - a.attendancePct)[0];

  if (bestDay) summary.push(`You usually attend ${bestDay.name} sessions.`);
  if (worstDay) summary.push(`Attendance drops on ${worstDay.name}.`);
  if (strongestPeriod && strongestPeriod.name !== 'Unknown') summary.push(`You are more consistent during ${strongestPeriod.name.toLowerCase()} sessions.`);
  if (periodStats.some((period) => period.name === 'Evening' && period.attendancePct < 50)) summary.push('You frequently miss evening sessions.');
  if (historicalTrend > 0) summary.push('Your attendance has improved over time.');

  if (!summary.length) {
    summary.push('No attendance history is available yet.');
  }

  const validSummary = summary
    .filter(Boolean)
    .slice(0, 5);

  return validSummary;
}

export function calculateLearningInsights(attendanceRecords = [], student = {}) {
  const records = Array.isArray(attendanceRecords) ? attendanceRecords : [];
  const year = getSessionYear(student);
  const enriched = records
    .map((record) => {
      const label = String(record?.sessionLabel || '');
      const date = parseSessionDate(label, year) || new Date(record?.createdAt || Date.now());
      const attendedMinutes = safeNumber(record?.attendedMinutes);
      const totalMinutes = safeNumber(record?.totalSessionMinutes);
      return {
        ...record,
        sessionDate: date,
        sessionLabel: label,
        attendedMinutes,
        totalMinutes,
        attendancePercentage: safeNumber(record?.attendancePercentage),
        qualified: Boolean(record?.qualified),
        isAttended: attendedMinutes > 0,
        weekday: getWeekdayName(date),
        period: getSessionPeriod(label)
      };
    })
    .sort((a, b) => a.sessionDate - b.sessionDate);

  const totalSessions = enriched.length;
  const sessionsAttended = enriched.filter((record) => record.isAttended).length;
  const sessionsMissed = Math.max(0, totalSessions - sessionsAttended);
  const totalMinutes = enriched.reduce((sum, record) => sum + record.attendedMinutes, 0);
  const averageMinutes = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;
  const attendancePct = totalSessions ? Math.round((sessionsAttended / totalSessions) * 100) : 0;

  const weekdayMap = new Map();
  for (const record of enriched) {
    if (!weekdayMap.has(record.weekday)) {
      weekdayMap.set(record.weekday, {
        name: record.weekday,
        totalSessions: 0,
        sessionsAttended: 0,
        sessionsMissed: 0,
        attendancePct: 0,
        totalMinutes: 0,
        averageMinutes: 0
      });
    }
    const bucket = weekdayMap.get(record.weekday);
    bucket.totalSessions += 1;
    bucket.totalMinutes += record.attendedMinutes;
    if (record.isAttended) bucket.sessionsAttended += 1;
    else bucket.sessionsMissed += 1;
  }

  const weekdayStats = [...weekdayMap.values()].map((day) => ({
    ...day,
    attendancePct: day.totalSessions ? Math.round((day.sessionsAttended / day.totalSessions) * 100) : 0,
    averageMinutes: day.totalSessions ? Math.round(day.totalMinutes / day.totalSessions) : 0
  }));

  const bestDay = [...weekdayStats].sort((a, b) => b.attendancePct - a.attendancePct || b.totalMinutes - a.totalMinutes)[0] || null;
  const worstDay = [...weekdayStats].sort((a, b) => a.attendancePct - b.attendancePct || a.totalMinutes - b.totalMinutes)[0] || null;

  const periodMap = new Map();
  for (const period of PERIODS) {
    periodMap.set(period, {
      name: period,
      totalSessions: 0,
      sessionsAttended: 0,
      sessionsMissed: 0,
      attendancePct: 0,
      averageMinutes: 0,
      totalMinutes: 0
    });
  }

  for (const record of enriched) {
    const bucket = periodMap.get(record.period) || periodMap.get('Unknown');
    if (!bucket) continue;
    bucket.totalSessions += 1;
    bucket.totalMinutes += record.attendedMinutes;
    if (record.isAttended) bucket.sessionsAttended += 1;
    else bucket.sessionsMissed += 1;
  }

  const periodStats = [...periodMap.values()]
    .filter((period) => period.name !== 'Unknown')
    .map((period) => ({
      ...period,
      attendancePct: period.totalSessions ? Math.round((period.sessionsAttended / period.totalSessions) * 100) : 0,
      averageMinutes: period.totalSessions ? Math.round(period.totalMinutes / period.totalSessions) : 0
    }));

  const strongestPeriod = [...periodStats].sort((a, b) => b.attendancePct - a.attendancePct || b.averageMinutes - a.averageMinutes)[0] || null;
  const bestPeriod = strongestPeriod;
  const worstPeriod = [...periodStats].sort((a, b) => a.attendancePct - b.attendancePct || a.averageMinutes - b.averageMinutes)[0] || null;

  const recentWindowSize = Math.min(10, totalSessions);
  const recentRecords = enriched.slice(-recentWindowSize);
  const recentAttended = recentRecords.filter((record) => record.isAttended).length;
  const recentAttendancePct = recentWindowSize ? Math.round((recentAttended / recentWindowSize) * 100) : 0;

  const last5 = enriched.slice(-5);
  const prev5 = enriched.slice(-10, -5);
  const last5Pct = last5.length ? Math.round((last5.filter((r) => r.isAttended).length / last5.length) * 100) : 0;
  const prev5Pct = prev5.length ? Math.round((prev5.filter((r) => r.isAttended).length / prev5.length) * 100) : 0;
  const recentMomentum = last5Pct - prev5Pct;

  const trendSeries = enriched.map((record, index) => ({
    index,
    sessionPct: record.attendancePercentage || (record.isAttended ? 100 : 0)
  }));
  const earliestHalf = trendSeries.slice(0, Math.max(1, Math.ceil(trendSeries.length / 2)));
  const latestHalf = trendSeries.slice(Math.max(0, Math.floor(trendSeries.length / 2)));
  const earliestAverage = earliestHalf.length ? Math.round(earliestHalf.reduce((sum, row) => sum + row.sessionPct, 0) / earliestHalf.length) : 0;
  const latestAverage = latestHalf.length ? Math.round(latestHalf.reduce((sum, row) => sum + row.sessionPct, 0) / latestHalf.length) : 0;
  const historicalTrend = latestAverage - earliestAverage;

  const streaks = computeStreak(enriched);

  const recentStreakScore = (streaks.current / Math.max(1, recentWindowSize)) * 15;
  const longestStreakScore = (streaks.longest / Math.max(1, totalSessions)) * 5;

  const rawScore =
    (recentAttendancePct * 0.45) +
    (attendancePct * 0.25) +
    recentStreakScore +
    longestStreakScore +
    (Math.max(0, recentMomentum) / 100) * 10;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const sessionHistory = enriched.map((record) => ({
    ...record,
    label: record.sessionLabel,
    weekday: record.weekday,
    formattedDate: formatSessionDate(record.sessionDate),
    timeOfDay: formatTimeOfDay(record.sessionLabel)
  }));

  const summary = {
    totalSessions,
    sessionsAttended,
    sessionsMissed,
    attendancePct,
    recentAttendancePct,
    recentWindowSize,
    recentMomentum,
    averageMinutes,
    longestStreak: streaks.longest,
    currentStreak: streaks.current,
    weekdayStats: [...weekdayStats].sort((a, b) => DAY_LABELS.indexOf(a.name) - DAY_LABELS.indexOf(b.name)),
    periodStats: [...periodStats].sort((a, b) => PERIODS.indexOf(a.name) - PERIODS.indexOf(b.name)),
    bestDay,
    worstDay,
    bestPeriod,
    worstPeriod,
    strongestPeriod,
    sessionHistory,
    historicalTrend,
    heatmapRows: buildHeatmapRows(enriched),
    patternSummary: buildPatternSummary(weekdayStats, periodStats, attendancePct, sessionsAttended, sessionsMissed, historicalTrend),
    consistencyScore: score,
    consistencyLabel: getConsistencyLabel(score),
    recommendations: buildRecommendations(weekdayStats, periodStats, totalSessions, attendancePct, streaks.current)
  };

  return summary;
}
