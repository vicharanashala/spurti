// Today's Quest — a daily motivation overlay. Completing a mission does NOT
// award SP; the web app never writes the ledger. Evaluation reads attendance,
// poll *attempts*, and existing query transactions. PollRecord has no reliable
// correctness field, so poll missions count attempts only.
//
// IST offset is the same +5:30 used in services/leaderboards.js. Kept local so
// tests can import this file's pure helpers without depending on that module.

import AttendanceRecord from '../models/AttendanceRecord.js';
import DailyQuest from '../models/DailyQuest.js';
import PollRecord from '../models/PollRecord.js';
import Session from '../models/Session.js';
import SPTransaction from '../models/SPTransaction.js';

const IST_MS = 5.5 * 3600 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_ATTEMPT_CAP = 5;

export const STALE_HINT = 'Missions update after session data is processed — usually a few times a day.';

export const QUEST_CATALOG = [
  {
    code: 'attend_90',
    icon: '🎯',
    title: "Attend 90%+ of today's session",
    description: "Be present for at least 90% of today's official session window.",
    unit: 'percent',
    defaultTarget: 90
  },
  {
    code: 'polls_attempt_5',
    icon: '🧠',
    title: "Attempt 5 of today's polls",
    description: "Attempt at least 5 poll questions in today's session.",
    unit: 'questions',
    defaultTarget: 5
  },
  {
    code: 'help_peer',
    icon: '🤝',
    title: 'Help one student',
    description: "Answer another intern's query so it is recorded in your SP Bank.",
    unit: 'helps',
    defaultTarget: 1
  },
  {
    code: 'learn_task',
    icon: '📚',
    title: "Complete today's learning task",
    description: "Show up or attempt today's session work (any attendance minutes or a poll attempt).",
    unit: 'tasks',
    defaultTarget: 1
  }
];

export function normalizeQuestEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function dayKeyIST(now = new Date()) {
  const ist = new Date(new Date(now).getTime() + IST_MS);
  return `${ist.getUTCFullYear()}-${pad2(ist.getUTCMonth() + 1)}-${pad2(ist.getUTCDate())}`;
}

export function istRangeFromDayKey(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''));
  if (!match) return { start: null, end: null };
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - IST_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function inIstRange(dateTime, range) {
  if (!dateTime || !range?.start || !range?.end) return false;
  const t = new Date(dateTime).getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

export function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickThree(catalog, email, dayKey) {
  const list = Array.isArray(catalog) ? catalog.slice() : [];
  const rand = mulberry32(hash32(`${normalizeQuestEmail(email)}|${dayKey}`));
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list.slice(0, 3);
}

export function effectivePollTarget(totalQuestions) {
  const total = Number(totalQuestions) || 0;
  if (total > 0) return Math.min(POLL_ATTEMPT_CAP, total);
  return POLL_ATTEMPT_CAP;
}

export function sessionLabelsForDay(dayKey, sessions = [], txns = [], range) {
  const fromSessions = [...new Set(
    (sessions || [])
      .filter((s) => s?.date && dayKeyIST(s.date) === dayKey)
      .map((s) => s.label)
      .filter(Boolean)
  )];
  if (fromSessions.length) return fromSessions;
  return [...new Set(
    (txns || [])
      .filter((t) => t.sessionLabel && inIstRange(t.dateTime, range))
      .map((t) => t.sessionLabel)
  )];
}

function snapshotMission(entry) {
  return {
    code: entry.code,
    icon: entry.icon,
    title: entry.title,
    description: entry.description,
    status: 'pending',
    completedAt: null,
    progress: { current: 0, target: entry.defaultTarget, unit: entry.unit },
    evidence: null
  };
}

function labelsSet(facts) {
  return new Set(facts.sessionLabels || []);
}

function evaluateAttend90(facts) {
  const labels = labelsSet(facts);
  const rows = (facts.attendance || []).filter((r) => labels.has(r.sessionLabel));
  const current = rows.reduce((max, r) => Math.max(max, Number(r.attendancePercentage) || 0), 0);
  const hit = rows.find((r) => (Number(r.attendancePercentage) || 0) >= 90);
  return {
    complete: Boolean(hit),
    progress: { current, target: 90, unit: 'percent' },
    evidence: hit ? { sessionLabel: hit.sessionLabel, source: 'attendancerecords' } : null
  };
}

function evaluatePollsAttempt5(facts) {
  const labels = labelsSet(facts);
  const rows = (facts.polls || []).filter((r) => labels.has(r.sessionLabel));
  const attempted = rows.reduce((sum, r) => sum + (Number(r.attemptedQuestions) || 0), 0);
  const totalQuestions = rows.reduce((sum, r) => sum + (Number(r.totalQuestions) || 0), 0);
  const target = effectivePollTarget(totalQuestions);
  return {
    complete: attempted >= target && attempted > 0,
    progress: {
      current: attempted,
      target,
      unit: 'questions',
      note: 'Counted as attempts only.'
    },
    evidence: rows[0] ? { sessionLabel: rows[0].sessionLabel, source: 'pollrecords' } : null
  };
}

function evaluateHelpPeer(facts) {
  const helps = (facts.txns || []).filter((t) =>
    t.category === 'query' && Number(t.appliedDelta) > 0 && inIstRange(t.dateTime, facts.range)
  );
  return {
    complete: helps.length >= 1,
    progress: { current: helps.length, target: 1, unit: 'helps' },
    evidence: helps[0] ? { sessionLabel: helps[0].sessionLabel || '', source: 'sptransactions' } : null
  };
}

function evaluateLearnTask(facts) {
  const labels = labelsSet(facts);
  const attempted = (facts.polls || [])
    .filter((r) => labels.has(r.sessionLabel))
    .reduce((sum, r) => sum + (Number(r.attemptedQuestions) || 0), 0);
  const minutes = (facts.attendance || [])
    .filter((r) => labels.has(r.sessionLabel))
    .reduce((sum, r) => sum + (Number(r.attendedMinutes) || 0), 0);
  const complete = attempted >= 1 || minutes > 0;
  return {
    complete,
    progress: { current: complete ? 1 : 0, target: 1, unit: 'tasks' },
    evidence: { source: attempted >= 1 ? 'pollrecords' : (minutes > 0 ? 'attendancerecords' : '') }
  };
}

export function evaluateMission(code, facts) {
  if (code === 'attend_90') return evaluateAttend90(facts);
  if (code === 'polls_attempt_5') return evaluatePollsAttempt5(facts);
  if (code === 'help_peer') return evaluateHelpPeer(facts);
  if (code === 'learn_task') return evaluateLearnTask(facts);
  return {
    complete: false,
    progress: { current: 0, target: 0, unit: '' },
    evidence: null
  };
}

function plainMission(m) {
  return typeof m.toObject === 'function' ? m.toObject() : { ...m };
}

export function applyEvaluation(missions, facts) {
  const now = facts.now || new Date();
  return (missions || []).map((raw) => {
    const stored = plainMission(raw);
    if (stored.status === 'complete') {
      return {
        code: stored.code,
        icon: stored.icon,
        title: stored.title,
        description: stored.description,
        status: 'complete',
        completedAt: stored.completedAt,
        progress: stored.progress,
        evidence: stored.evidence
      };
    }
    const result = evaluateMission(stored.code, facts);
    if (result.complete) {
      return {
        code: stored.code,
        icon: stored.icon,
        title: stored.title,
        description: stored.description,
        status: 'complete',
        completedAt: now,
        progress: result.progress,
        evidence: result.evidence
      };
    }
    return {
      code: stored.code,
      icon: stored.icon,
      title: stored.title,
      description: stored.description,
      status: 'pending',
      completedAt: null,
      progress: result.progress,
      evidence: result.evidence
    };
  });
}

export function questHeadline(completed, total = 3) {
  if (completed === total) return `Today's Quest: ${completed}/${total} completed 🎉`;
  return `Today's Quest: ${completed}/${total} completed`;
}

function publicMissions(missions) {
  return (missions || []).map((m) => {
    const row = plainMission(m);
    return {
      code: row.code,
      icon: row.icon,
      title: row.title,
      description: row.description,
      status: row.status,
      completedAt: row.completedAt || null,
      progress: row.progress || { current: 0, target: 0, unit: '' }
    };
  });
}

export function toPublicQuest(doc) {
  const missions = publicMissions(doc.missions);
  const completed = missions.filter((m) => m.status === 'complete').length;
  return {
    dayKey: doc.dayKey,
    completed,
    total: 3,
    headline: questHeadline(completed, 3),
    staleHint: STALE_HINT,
    missions
  };
}

function missionsChanged(before, after) {
  return JSON.stringify(publicMissions(before)) !== JSON.stringify(publicMissions(after))
    || JSON.stringify((before || []).map((m) => plainMission(m).evidence))
      !== JSON.stringify((after || []).map((m) => m.evidence));
}

async function loadQuestFacts(email, dayKey, now) {
  const range = istRangeFromDayKey(dayKey);
  const pad = 12 * 60 * 60 * 1000;
  const [sessions, attendance, polls, txns] = await Promise.all([
    Session.find({
      date: { $gte: new Date(range.start.getTime() - pad), $lt: new Date(range.end.getTime() + pad) }
    }).select('label date').lean(),
    AttendanceRecord.find({ email }).lean(),
    PollRecord.find({ email }).lean(),
    SPTransaction.find({ email, dateTime: { $gte: range.start, $lt: range.end } }).lean()
  ]);
  return {
    now,
    dayKey,
    range,
    sessionLabels: sessionLabelsForDay(dayKey, sessions, txns, range),
    attendance,
    polls,
    txns
  };
}

export async function buildTodayQuest(student, now = new Date()) {
  const email = normalizeQuestEmail(student.email);
  const dayKey = dayKeyIST(now);
  let doc = await DailyQuest.findOne({ email, dayKey });
  if (!doc) {
    const missions = pickThree(QUEST_CATALOG, email, dayKey).map(snapshotMission);
    try {
      doc = await DailyQuest.create({
        email,
        studentId: student._id,
        dayKey,
        missions,
        assignedAt: now,
        evaluatedAt: now
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      doc = await DailyQuest.findOne({ email, dayKey });
    }
  }
  const facts = await loadQuestFacts(email, dayKey, now);
  const next = applyEvaluation(doc.missions, facts);
  if (missionsChanged(doc.missions, next)) {
    doc.missions = next;
    doc.evaluatedAt = now;
    doc.markModified('missions');
    await doc.save();
  }
  return toPublicQuest(doc);
}

