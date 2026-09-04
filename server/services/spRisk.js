// SP Risk Predictor — derived READ of the last 14 days of attendance, polls,
// and query activity. Never writes SP, students, or transactions.
//
// Scoring is explainable (weighted gaps vs the live 10/5/3/0 attendance/poll
// ladder and +5 query unit). Trophy League labels come from leagueBand() in
// levels.js — the same function the student payload uses.

import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import Session from '../models/Session.js';
import { leagueBand } from './levels.js';

export const WINDOW_DAYS = 14;
export const ATT_POLL_BAND_MAX = 10;   // top rung of the live attendance/poll ladder
export const QUERY_UNIT = 5;
export const QUERY_HEALTHY = 3;        // ≥3 distinct credited queries in the window = full query score
export const PROJECTED_GAIN_CAP = 80;  // do not over-promise recovery SP

const DAY_MS = 86400000;
const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

const WEIGHTS = {
  attendance: 0.35,
  pollParticipation: 0.25,
  pollQuality: 0.25,
  query: 0.15
};

export function windowBounds(now = new Date()) {
  const end = new Date(now);
  const start = new Date(end.getTime() - WINDOW_DAYS * DAY_MS);
  return { start, end };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPct(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Session labels look like "15 May Morning", "Day 10 (26 May)", "22 May Evening".
export function parseSessionLabelDate(label, now = new Date()) {
  const text = String(label || '');
  let day, mon;
  const paren = text.match(/\((\d{1,2})\s+([A-Za-z]+)\)/);
  if (paren) { day = +paren[1]; mon = paren[2]; }
  else {
    const lead = text.match(/^(\d{1,2})\s+([A-Za-z]+)/);
    if (lead) { day = +lead[1]; mon = lead[2]; }
  }
  const m = mon ? MONTHS[mon.slice(0, 3).toLowerCase()] : undefined;
  if (m === undefined || !day) return null;
  const year = now.getFullYear();
  const d = new Date(Date.UTC(year, m, day));
  // Labels omit the year; if the parsed date is far in the future, it was last year.
  if (d.getTime() - now.getTime() > 60 * DAY_MS) d.setUTCFullYear(year - 1);
  return d;
}

function firstTxnDate(txns, sessionLabel, category) {
  const hit = txns.find(t => t.sessionLabel === sessionLabel && (!category || t.category === category));
  return hit?.dateTime ? new Date(hit.dateTime) : null;
}

export function eventTime(record, { sessionsByLabel, txns, category, now }) {
  const label = record.sessionLabel;
  const sess = label ? sessionsByLabel.get(label) : null;
  if (sess?.date) return new Date(sess.date);
  if (sess?.endDateTime) return new Date(sess.endDateTime);
  const fromTxn = firstTxnDate(txns, label, category);
  if (fromTxn) return fromTxn;
  if (record.dateTime) return new Date(record.dateTime);
  const parsed = parseSessionLabelDate(label, now);
  if (parsed) return parsed;
  if (record.createdAt) return new Date(record.createdAt);
  return null;
}

function inWindow(date, start, end) {
  if (!date) return false;
  const t = date.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function bandMidpointPct(delta) {
  const d = num(delta);
  if (d >= 10) return 95;
  if (d >= 5) return 82;
  if (d >= 3) return 62;
  return 25;
}

export function attendancePercentage(records, attendanceTxns) {
  const withMinutes = records.filter(r => num(r.totalSessionMinutes) > 0);
  if (withMinutes.length) {
    const attended = withMinutes.reduce((a, r) => a + num(r.attendedMinutes), 0);
    const total = withMinutes.reduce((a, r) => a + num(r.totalSessionMinutes), 0);
    return total ? clampPct((attended / total) * 100) : 0;
  }
  if (records.length) {
    return clampPct(records.reduce((a, r) => a + num(r.attendancePercentage), 0) / records.length);
  }
  if (attendanceTxns.length) {
    return clampPct(attendanceTxns.reduce((a, t) => a + bandMidpointPct(t.appliedDelta), 0) / attendanceTxns.length);
  }
  return 0;
}

export function pollParticipationPercentage(polls) {
  const attempted = polls.reduce((a, p) => a + num(p.attemptedQuestions), 0);
  const total = polls.reduce((a, p) => a + num(p.totalQuestions), 0);
  if (total > 0) return clampPct((attempted / total) * 100);
  if (!polls.length) return 0;
  return 0;
}

export function pollQualityScore(pollTxns) {
  if (!pollTxns.length) return 0;
  const avg = pollTxns.reduce((a, t) => a + Math.max(0, Math.min(ATT_POLL_BAND_MAX, num(t.appliedDelta))), 0)
    / pollTxns.length;
  return clampPct((avg / ATT_POLL_BAND_MAX) * 100);
}

export function queryActivityCount(queryTxns) {
  return queryTxns.filter(t => num(t.appliedDelta) > 0).length;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function queryMetric(queryCount) {
  return clampPct((Math.min(QUERY_HEALTHY, queryCount) / QUERY_HEALTHY) * 100);
}

// Each factor's `points` is its share of the 0–100 risk score:
//   points = weight × (100 − metric)
// The four `points` values sum to `riskScore` (after 0.1 rounding).
export function riskBreakdown({ attendancePct, pollParticipationPct, pollQuality, queryCount }) {
  const queryScore = queryMetric(queryCount);
  const attendance = round1(WEIGHTS.attendance * (100 - attendancePct));
  const pollParticipation = round1(WEIGHTS.pollParticipation * (100 - pollParticipationPct));
  const pollQualityPoints = round1(WEIGHTS.pollQuality * (100 - pollQuality));
  const queryActivity = round1(WEIGHTS.query * (100 - queryScore));
  return {
    attendance: { weight: WEIGHTS.attendance, metric: attendancePct, points: attendance },
    pollParticipation: { weight: WEIGHTS.pollParticipation, metric: pollParticipationPct, points: pollParticipation },
    pollQuality: { weight: WEIGHTS.pollQuality, metric: pollQuality, points: pollQualityPoints },
    queryActivity: { weight: WEIGHTS.query, metric: queryScore, points: queryActivity }
  };
}

export function overallRiskScore(input) {
  const b = riskBreakdown(input);
  return clampPct(b.attendance.points + b.pollParticipation.points + b.pollQuality.points + b.queryActivity.points);
}

export function riskLevelFor(score) {
  if (score >= 65) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

function uniqueLabels(rows) {
  return new Set(rows.map(r => r.sessionLabel).filter(Boolean));
}

function spSum(txns) {
  return txns.reduce((a, t) => a + num(t.appliedDelta), 0);
}

export function projectedSpParts({
  attendanceSessions,
  pollSessions,
  attendanceSp,
  pollSp,
  queryCount
}) {
  const attCap = Math.max(attendanceSessions, 0) * ATT_POLL_BAND_MAX;
  const pollCap = Math.max(pollSessions, 0) * ATT_POLL_BAND_MAX;
  const attendance = Math.max(0, attCap - Math.max(0, attendanceSp));
  const poll = Math.max(0, pollCap - Math.max(0, pollSp));
  const query = Math.max(0, QUERY_HEALTHY - queryCount) * QUERY_UNIT;
  const empty = (!attendanceSessions && !pollSessions && queryCount === 0);
  const attendanceEst = attendance + (empty ? ATT_POLL_BAND_MAX : 0);
  const pollEst = poll + (empty ? ATT_POLL_BAND_MAX : 0);
  const queryEst = query + (empty && query === 0 ? QUERY_HEALTHY * QUERY_UNIT : 0);
  const raw = attendanceEst + pollEst + queryEst;
  const total = Math.min(PROJECTED_GAIN_CAP, Math.round(raw));
  return { attendance: attendanceEst, poll: pollEst, query: queryEst, total };
}

export function projectedSpGain(input) {
  return projectedSpParts(input).total;
}

export function leagueContext(currentSp, gain) {
  const sp = Math.max(0, num(currentSp));
  const trophyLeague = leagueBand(sp);
  const projectedSp = sp + Math.max(0, num(gain));
  const projectedLeague = leagueBand(projectedSp);
  let spToNextLeague = 0;
  let nextLeague = null;
  if (trophyLeague !== 'Legend') {
    for (let s = Math.floor(sp) + 1; s <= 1500; s++) {
      if (leagueBand(s) !== trophyLeague) {
        nextLeague = leagueBand(s);
        spToNextLeague = s - sp;
        break;
      }
    }
  }
  let spToLeagueFloor = 0;
  if (sp > 0) {
    let floor = Math.floor(sp);
    while (floor > 0 && leagueBand(floor - 1) === trophyLeague) floor -= 1;
    spToLeagueFloor = sp - floor;
  }
  return { trophyLeague, nextLeague, spToNextLeague, spToLeagueFloor, projectedLeague, projectedSp };
}

export function buildReasons({
  attendancePct, pollParticipationPct, pollQuality, queryCount,
  attendanceSessions, pollSessions, riskScore, riskLevel, league
}) {
  const reasons = [];
  if (attendanceSessions === 0) {
    reasons.push('No standup attendance is recorded in the last 14 days.');
  } else if (attendancePct < 50) {
    reasons.push(`Attendance is ${attendancePct}% over the last 14 days — below the 50% band, so those sessions earned 0 attendance SP.`);
  } else if (attendancePct < 75) {
    reasons.push(`Attendance is ${attendancePct}% over the last 14 days (50–74% band, +3 SP per session). Reaching 75% would lift that to +5.`);
  } else if (attendancePct < 90) {
    reasons.push(`Attendance is ${attendancePct}% over the last 14 days (75–89% band, +5 SP). 90%+ earns the full +10.`);
  }

  if (pollSessions === 0) {
    reasons.push('No session poll activity is recorded in the last 14 days.');
  } else {
    if (pollParticipationPct < 60) {
      reasons.push(`Poll participation is ${pollParticipationPct}% of questions in the window — missed questions cannot earn poll SP.`);
    }
    if (pollQuality < 50) {
      reasons.push(`Poll quality (correctness vs the day's top scorer, banded 10/5/3/0) scored ${pollQuality}/100 in the last 14 days.`);
    } else if (pollQuality < 80) {
      reasons.push(`Poll quality scored ${pollQuality}/100 — mid-band, not yet matching the day's top scorer.`);
    }
  }

  if (queryCount === 0) {
    reasons.push('No credited peer-query answers in the last 14 days (+5 SP each, lifetime cap 200).');
  } else if (queryCount < QUERY_HEALTHY) {
    reasons.push(`Only ${queryCount} credited peer-query answer${queryCount === 1 ? '' : 's'} in 14 days — below a healthy pace of ${QUERY_HEALTHY}.`);
  }

  if (league.trophyLeague !== 'Legend' && league.spToLeagueFloor < 30 && riskScore >= 35) {
    reasons.push(`You are ${league.spToLeagueFloor} SP above the floor of ${league.trophyLeague}; a quiet stretch can drop the Trophy League (Level never decreases).`);
  }

  if (!reasons.length) {
    reasons.push(`Last 14 days look steady (${riskLevel} risk). Keep the same attendance, poll, and query pace to hold ${league.trophyLeague}.`);
  }
  return reasons;
}

function withPriority(items) {
  const ranked = [...items].sort((a, b) => b.estimatedSp - a.estimatedSp || a.action.localeCompare(b.action));
  const labels = ['high', 'medium', 'low'];
  return items.map((item) => ({
    action: item.action,
    estimatedSp: item.estimatedSp,
    priority: labels[Math.min(ranked.findIndex(r => r === item), 2)]
  }));
}

export function buildRecoverySuggestions({
  attendancePct, pollParticipationPct, pollQuality, queryCount, parts, league
}) {
  const suggestions = [];
  if (attendancePct < 90) {
    suggestions.push({
      action: 'Join the next standups for the full official window (90%+ presence → +10 attendance SP each). Evening Spandan nights count attendance from poll correctness.',
      estimatedSp: parts.attendance
    });
  }
  if (pollParticipationPct < 90 || pollQuality < 80) {
    suggestions.push({
      action: 'Attempt every launched poll question and aim for correctness relative to that day’s top scorer (banded +10 / +5 / +3 / 0).',
      estimatedSp: parts.poll
    });
  }
  if (queryCount < QUERY_HEALTHY) {
    const n = QUERY_HEALTHY - queryCount;
    suggestions.push({
      action: `Answer ${n} more distinct peer quer${n === 1 ? 'y' : 'ies'} with a real, useful reply (+${QUERY_UNIT} SP each; self-answers and rejected answers do not count).`,
      estimatedSp: parts.query
    });
  }
  if (!suggestions.length) {
    suggestions.push({
      action: league.nextLeague
        ? `Stay at 90%+ attendance and top-band polls. ${league.spToNextLeague} SP more reaches ${league.nextLeague}.`
        : 'Stay at 90%+ attendance and top-band polls. You are in Legend.',
      estimatedSp: 0
    });
  }
  return withPriority(suggestions);
}

function sliceWindow({ attendance, polls, transactions, sessions, now }) {
  const { start, end } = windowBounds(now);
  const sessionsByLabel = new Map((sessions || []).map(s => [s.label, s]));
  const ctx = { sessionsByLabel, txns: transactions, now };

  const attRecords = attendance.filter(r => inWindow(eventTime(r, { ...ctx, category: 'attendance' }), start, end));
  const pollRecords = polls.filter(r => inWindow(eventTime(r, { ...ctx, category: 'poll' }), start, end));
  const txIn = transactions.filter(t => t.dateTime && inWindow(new Date(t.dateTime), start, end));
  const attendanceTxns = txIn.filter(t => t.category === 'attendance');
  const pollTxns = txIn.filter(t => t.category === 'poll');
  const queryTxns = txIn.filter(t => t.category === 'query');

  return { start, end, attRecords, pollRecords, attendanceTxns, pollTxns, queryTxns };
}

// Pure: used by tests and by buildRiskState. Does not touch Mongo.
export function computeRiskState({
  student,
  attendance = [],
  polls = [],
  transactions = [],
  sessions = [],
  now = new Date()
}) {
  const sliced = sliceWindow({ attendance, polls, transactions, sessions, now });
  const attendancePct = attendancePercentage(sliced.attRecords, sliced.attendanceTxns);
  const pollParticipationPct = pollParticipationPercentage(sliced.pollRecords);
  const pollQuality = pollQualityScore(sliced.pollTxns);
  const queryCount = queryActivityCount(sliced.queryTxns);
  const attendanceSessions = Math.max(uniqueLabels(sliced.attRecords).size, uniqueLabels(sliced.attendanceTxns).size);
  const pollSessions = Math.max(uniqueLabels(sliced.pollRecords).size, uniqueLabels(sliced.pollTxns).size);
  const attendanceSp = spSum(sliced.attendanceTxns);
  const pollSp = spSum(sliced.pollTxns);
  const breakdown = riskBreakdown({ attendancePct, pollParticipationPct, pollQuality, queryCount });
  const riskScore = overallRiskScore({ attendancePct, pollParticipationPct, pollQuality, queryCount });
  const riskLevel = riskLevelFor(riskScore);
  const parts = projectedSpParts({
    attendanceSessions, pollSessions, attendanceSp, pollSp, queryCount
  });
  const gain = parts.total;
  const currentSp = num(student.totalSp);
  const league = leagueContext(currentSp, gain);
  const reasons = buildReasons({
    attendancePct, pollParticipationPct, pollQuality, queryCount,
    attendanceSessions, pollSessions, riskScore, riskLevel, league
  });
  const recoverySuggestions = buildRecoverySuggestions({
    attendancePct, pollParticipationPct, pollQuality, queryCount, parts, league
  });

  const internStart = student.internshipStartDate ? new Date(student.internshipStartDate) : null;
  let daysAnalyzed = WINDOW_DAYS;
  if (internStart && internStart.getTime() > sliced.start.getTime()) {
    daysAnalyzed = Math.max(1, Math.ceil((sliced.end.getTime() - internStart.getTime()) / DAY_MS));
  }

  return {
    windowDays: WINDOW_DAYS,
    windowStart: sliced.start.toISOString(),
    windowEnd: sliced.end.toISOString(),
    currentSp,
    trophyLeague: league.trophyLeague,
    nextLeague: league.nextLeague,
    spToNextLeague: league.spToNextLeague,
    projectedLeague: league.projectedLeague,
    attendancePercentage: attendancePct,
    pollParticipationPercentage: pollParticipationPct,
    pollQualityScore: pollQuality,
    queryActivityCount: queryCount,
    riskScore,
    riskLevel,
    breakdown,
    daysAnalyzed,
    sessionsConsidered: attendanceSessions,
    pollsConsidered: pollSessions,
    queriesConsidered: sliced.queryTxns.length,
    reasons,
    recoverySuggestions,
    projectedSpGain: gain,
    metrics: {
      attendanceSessions,
      pollSessions,
      attendanceSp,
      pollSp,
      querySp: spSum(sliced.queryTxns.filter(t => num(t.appliedDelta) > 0))
    }
  };
}

export async function buildRiskState(student, now = new Date()) {
  const email = student.email;
  const [attendance, polls, transactions, sessions] = await Promise.all([
    AttendanceRecord.find({ email }).lean(),
    PollRecord.find({ email }).lean(),
    SPTransaction.find({ email }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    Session.find().lean()
  ]);
  return computeRiskState({ student, attendance, polls, transactions, sessions, now });
}
