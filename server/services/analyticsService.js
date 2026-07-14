/**
 * Analytics Snapshot Service
 * Runs every 30 minutes via cron — computes and stores a snapshot.
 * Does NOT touch student SP, transactions, or any student-side data.
 * Only reads and records aggregate metrics.
 */

import Student from '../models/Student.js';
import Session from '../models/Session.js';
import SPTransaction from '../models/SPTransaction.js';
import SessionEvent from '../models/SessionEvent.js';
import AnalyticsSnapshot from '../models/AnalyticsSnapshot.js';

function compute_sp_distribution(students) {
  const buckets = { veryNegative: 0, negative: 0, neutral: 0, positive: 0, veryPositive: 0 };
  for (const s of students) {
    const sp = s.totalSp || 0;
    if (sp < -50) buckets.veryNegative++;
    else if (sp < -10) buckets.negative++;
    else if (sp <= 10) buckets.neutral++;
    else if (sp <= 50) buckets.positive++;
    else buckets.veryPositive++;
  }
  return buckets;
}

function compute_cohort_counts(students) {
  const counts = {};
  for (const s of students) {
    if (!s.internshipStartDate) continue;
    const dateKey = s.internshipStartDate.toISOString().split('T')[0];
    counts[dateKey] = (counts[dateKey] || 0) + 1;
  }
  return counts;
}

export async function computeSnapshot() {
  const now = new Date();
  const last30min = new Date(now.getTime() - 30 * 60 * 1000);

  const [
    allStudents,
    sessions,
    recentTransactions,
    recentEvents,
    lastSnapshot,
  ] = await Promise.all([
    Student.find({}).lean(),
    Session.find().sort({ endDateTime: 1 }).lean(),
    SPTransaction.find({ createdAt: { $gte: last30min } }).lean(),
    SessionEvent.find({ timestamp: { $gte: last30min } }).lean(),
    AnalyticsSnapshot.findOne({}).sort({ timestamp: -1 }).lean(),
  ]);

  const activeStudents = allStudents.filter(s => s.status === 'active');
  const yetToOnboard = allStudents.filter(s => s.status === 'yet to onboard');
  const excused = allStudents.filter(s => s.status === 'excused');

  const activeEmails = new Set(activeStudents.map(s => s.email.toLowerCase()));
  const activeRecentTx = recentTransactions.filter(t => activeEmails.has(t.email.toLowerCase()));

  const spValues = activeStudents.map(s => s.totalSp || 0);
  const totalSp = spValues.reduce((a, b) => a + b, 0);
  const avgSp = activeStudents.length ? Math.round(totalSp / activeStudents.length) : 0;
  const minSp = spValues.length ? Math.min(...spValues) : 0;
  const maxSp = spValues.length ? Math.max(...spValues) : 0;

  // sessions completed
  const completedSessions = sessions.filter(s => s.endDateTime && new Date(s.endDateTime) <= now);
  const currentSession = sessions.length ? sessions[sessions.length - 1]?.label || '' : '';

  // page views
  const pageViews = { admin: 0, record: 0, search: 0, intro: 0 };
  for (const e of recentEvents) {
    if (e.page === 'admin') pageViews.admin++;
    else if (e.page === 'record') pageViews.record++;
    else if (e.page === 'search') pageViews.search++;
    else if (e.page === 'intro') pageViews.intro++;
  }
  const uniqueUsers = new Set(recentEvents.map(e => e.email.toLowerCase())).size;

  // top gainers / losers last 30 min
  const deltaMap = {};
  for (const t of activeRecentTx) {
    const key = t.email.toLowerCase();
    deltaMap[key] = (deltaMap[key] || 0) + (t.delta || 0);
  }
  const emailToName = {};
  for (const s of activeStudents) {
    emailToName[s.email.toLowerCase()] = s.name;
  }
  const deltas = Object.entries(deltaMap)
    .map(([email, delta]) => ({ email, name: emailToName[email] || email, delta }))
    .sort((a, b) => b.delta - a.delta);
  const topGainers = deltas.slice(0, 10);
  const topLosers = [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 10);

  // red zone count
  const redZoneCount = activeStudents.filter(s =>
    s.totalSp !== undefined && s.totalSp < 100
  ).length;

  // Compute rankings & deltas
  const sortedActive = [...activeStudents].sort((a, b) => {
    const spA = Number(a.totalSp) || 0;
    const spB = Number(b.totalSp) || 0;
    if (spB !== spA) return spB - spA;
    return a.name.localeCompare(b.name);
  });

  const prevRankMap = {};
  if (lastSnapshot && lastSnapshot.studentRanks) {
    if (Array.isArray(lastSnapshot.studentRanks)) {
      for (const r of lastSnapshot.studentRanks) {
        if (r && r.email) {
          prevRankMap[r.email.toLowerCase()] = r.rank;
        }
      }
    } else if (lastSnapshot.studentRanks instanceof Map) {
      for (const [email, r] of lastSnapshot.studentRanks.entries()) {
        prevRankMap[email.toLowerCase()] = r;
      }
    } else {
      for (const [email, r] of Object.entries(lastSnapshot.studentRanks)) {
        prevRankMap[email.toLowerCase()] = r;
      }
    }
  }

  const studentRanks = [];
  const studentDeltas = [];

  sortedActive.forEach((s, index) => {
    const emailKey = s.email.toLowerCase();
    const currentRank = index + 1;
    studentRanks.push({ email: emailKey, rank: currentRank });

    let delta = 0;
    const prevRank = prevRankMap[emailKey];
    if (prevRank !== undefined && prevRank !== null) {
      delta = prevRank - currentRank;
    }
    studentDeltas.push({ email: emailKey, delta });
  });

  const snapshot = new AnalyticsSnapshot({
    timestamp: now,
    activeStudents: activeStudents.length,
    yetToOnboard: yetToOnboard.length,
    excused: excused.length,
    totalStudents: allStudents.length,
    avgSp,
    minSp,
    maxSp,
    totalSp,
    spDistribution: compute_sp_distribution(activeStudents),
    cohortCounts: compute_cohort_counts(activeStudents),
    totalTransactions: await SPTransaction.countDocuments(),
    newTransactionsLast30min: recentTransactions.length,
    sessionsCompleted: completedSessions.length,
    currentSession,
    pageViewsLast30min: pageViews,
    uniqueUsersLast30min: uniqueUsers,
    topGainersLast30min: topGainers,
    topLosersLast30min: topLosers,
    redZoneCount,
    studentRanks,
    studentDeltas,
    snapshotType: 'scheduled',
  });

  await snapshot.save();

  // Invalidate delta cache upon new snapshot creation
  cachedDeltas = null;
  lastCacheTime = 0;

  return snapshot;
}

let cachedDeltas = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

export async function getRankDeltas() {
  const now = Date.now();
  if (cachedDeltas && (now - lastCacheTime < CACHE_TTL)) {
    return cachedDeltas;
  }

  const lastSnapshot = await AnalyticsSnapshot.findOne({}).sort({ timestamp: -1 }).lean();
  const deltas = {};
  if (lastSnapshot && lastSnapshot.studentDeltas) {
    const rawDeltas = lastSnapshot.studentDeltas;
    if (Array.isArray(rawDeltas)) {
      for (const entry of rawDeltas) {
        if (entry && entry.email) {
          deltas[entry.email.toLowerCase()] = entry.delta;
        }
      }
    } else if (rawDeltas instanceof Map) {
      for (const [email, val] of rawDeltas.entries()) {
        deltas[email.toLowerCase()] = val;
      }
    } else {
      for (const [email, val] of Object.entries(rawDeltas)) {
        deltas[email.toLowerCase()] = val;
      }
    }
  }
  cachedDeltas = deltas;
  lastCacheTime = now;
  return deltas;
}

export async function getRecentSnapshots(hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return AnalyticsSnapshot.find({ timestamp: { $gte: since } })
    .sort({ timestamp: 1 })
    .lean();
}

export async function pruneOldSnapshots(retentionDays = 90) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  return AnalyticsSnapshot.deleteMany({ timestamp: { $lt: cutoff } });
}
