/**
 * snapshot-analytics.js
 * Computes and stores one AnalyticsSnapshot every 30 minutes.
 * Run via cron: 0,30 * * * * cd /home/sakshi/spurti && node snapshot-analytics.js >> /var/log/snapshot-analytics.log 2>&1
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Student from './server/models/Student.js';
import Session from './server/models/Session.js';
import SPTransaction from './server/models/SPTransaction.js';
import SessionEvent from './server/models/SessionEvent.js';
import AnalyticsSnapshot from './server/models/AnalyticsSnapshot.js';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error('MONGO_URI not set (expected in .env)'); process.exit(1); }

function compute_sp_distribution(students) {
  const b = { veryNegative: 0, negative: 0, neutral: 0, positive: 0, veryPositive: 0 };
  for (const s of students) {
    const sp = s.totalSp ?? 0;
    if (sp < -50) b.veryNegative++;
    else if (sp < -10) b.negative++;
    else if (sp <= 10) b.neutral++;
    else if (sp <= 50) b.positive++;
    else b.veryPositive++;
  }
  return b;
}

function compute_cohort_counts(students) {
  const counts = {};
  for (const s of students) {
    if (!s.internshipStartDate) continue;
    const key = s.internshipStartDate.toISOString().split('T')[0];
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  const now = new Date();
  const last30min = new Date(now.getTime() - 30 * 60 * 1000);

  await mongoose.connect(MONGO_URI);

  const [allStudents, sessions, recentTx, recentEvents] = await Promise.all([
    Student.find({}).lean(),
    Session.find().sort({ endDateTime: 1 }).lean(),
    SPTransaction.find({ createdAt: { $gte: last30min } }).lean(),
    SessionEvent.find({ timestamp: { $gte: last30min } }).lean(),
  ]);

  const active = allStudents.filter(s => s.status === 'active');
  const yto = allStudents.filter(s => s.status === 'yet to onboard');
  const exc = allStudents.filter(s => s.status === 'excused');
  const activeEmails = new Set(active.map(s => s.email.toLowerCase()));
  const activeRecentTx = recentTx.filter(t => activeEmails.has(t.email.toLowerCase()));

  const spValues = active.map(s => s.totalSp ?? 0);
  const totalSp = spValues.reduce((a, b) => a + b, 0);
  const avgSp = active.length ? Math.round(totalSp / active.length) : 0;
  const minSp = spValues.length ? Math.min(...spValues) : 0;
  const maxSp = spValues.length ? Math.max(...spValues) : 0;

  const completedSessions = sessions.filter(s => s.endDateTime && new Date(s.endDateTime) <= now);
  const currentSession = sessions[sessions.length - 1]?.label || '';

  const pageViews = { admin: 0, record: 0, search: 0, intro: 0 };
  for (const e of recentEvents) {
    if (e.page === 'admin') pageViews.admin++;
    else if (e.page === 'record') pageViews.record++;
    else if (e.page === 'search') pageViews.search++;
    else if (e.page === 'intro') pageViews.intro++;
  }
  const uniqueUsers = new Set(recentEvents.map(e => e.email.toLowerCase())).size;

  const deltaMap = {};
  for (const t of activeRecentTx) {
    const key = t.email.toLowerCase();
    deltaMap[key] = (deltaMap[key] || 0) + (t.appliedDelta || 0);
  }
  const emailToName = {};
  for (const s of active) emailToName[s.email.toLowerCase()] = s.name;
  const deltas = Object.entries(deltaMap)
    .map(([email, delta]) => ({ email, name: emailToName[email] || email, delta }))
    .sort((a, b) => b.delta - a.delta);
  const topGainers = deltas.slice(0, 10);
  const topLosers = [...deltas].sort((a, b) => a.delta - b.delta).slice(0, 10);

  const redZoneCount = active.filter(s => s.totalSp !== undefined && s.totalSp < 100).length;

  await AnalyticsSnapshot.create({
    timestamp: now,
    activeStudents: active.length,
    yetToOnboard: yto.length,
    excused: exc.length,
    totalStudents: allStudents.length,
    avgSp,
    minSp,
    maxSp,
    totalSp,
    spDistribution: compute_sp_distribution(active),
    cohortCounts: compute_cohort_counts(active),
    totalTransactions: await SPTransaction.countDocuments(),
    newTransactionsLast30min: recentTx.length,
    sessionsCompleted: completedSessions.length,
    currentSession,
    pageViewsLast30min: pageViews,
    uniqueUsersLast30min: uniqueUsers,
    topGainersLast30min: topGainers,
    topLosersLast30min: topLosers,
    redZoneCount,
    snapshotType: 'scheduled',
  });

  console.log(`[${now.toISOString()}] Snapshot stored: active=${active.length} yto=${yto.length} avgSp=${avgSp} redZone=${redZoneCount}`);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error('Snapshot failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
