/**
 * runRecoveryMissions.js — Tier 2 scheduler.
 *
 * Standalone script run weekly by an external scheduler (cron, GitHub
 * Actions, etc.). Idempotent. Supports --dry-run for mentor demos.
 *
 * Usage:
 *   node server/scripts/runRecoveryMissions.js            (apply)
 *   node server/scripts/runRecoveryMissions.js --dry-run  (no writes)
 *
 * Hard contract: in --dry-run mode the script NEVER writes to MongoDB.
 * The `mode` flag flows through every code path; createAssignment short-
 * circuits before any insert when mode !== 'apply'.
 *
 * ponytail: no node-cron dependency — this is a plain CLI script invoked
 * by whatever scheduler you already run. Matches the operational model
 * of scripts/seed.js and scripts/ingestSession.js.
 */
import { fileURLToPath } from 'url';
import path from 'path';
import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import RecoveryMission from '../models/RecoveryMission.js';
import RecoveryAssignment from '../models/RecoveryAssignment.js';
import MissionAuditEvent from '../models/MissionAuditEvent.js';
import {
  weekStartUtc, addDays,
  selectRecoveryCandidates, selectIntervention,
  createAssignment,
  loadStudentsWithRecentTxns
} from '../services/missions.js';
// Tier 9: scheduler respects the experimental-features toggle. If admin
// has disabled the feature, the scheduler is a no-op (same as --dry-run).
import { isExperimentalFeaturesEnabled, invalidateCache } from '../services/featureControl.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── argument parsing ────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const mode = dryRun ? 'plan' : 'apply';

// Future-proofing hook: --week YYYY-MM-DD lets ops backfill a missed week.
// Optional — when omitted we use the current week.
const weekArgIdx = argv.indexOf('--week');
const explicitWeek = weekArgIdx > -1 ? new Date(argv[weekArgIdx + 1] + 'T00:00:00Z') : null;

// ── main ───────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(MONGO_URI);
  // Tier 9 — honour the experimental-features toggle. If admin has
  // disabled the feature, the scheduler exits cleanly without scanning
  // or assigning anything. This is the safe default: a disabled
  // feature must not have new assignments generated.
  invalidateCache();  // ensure we read the current value, not a stale cache
  const enabled = await isExperimentalFeaturesEnabled();
  if (!enabled) {
    console.log('Recovery Mission Run (SKIPPED — experimental features are disabled)');
    return;
  }
  const now = new Date();
  const weekStart = explicitWeek || weekStartUtc(now);

  const students = await loadStudentsWithRecentTxns({ windowDays: 21, now });
  const candidates = selectRecoveryCandidates(students, now);
  // Filter to ones that don't already have an assignment this week.
  const existing = await RecoveryAssignment.find({
    weekStart,
    status: { $in: ['assigned', 'in_progress', 'completed'] }
  }).select({ studentId: 1, _id: 1 }).lean();
  const assignedIds = new Set(existing.map(e => String(e.studentId)));

  const templates = await RecoveryMission.find({ enabled: true }).lean();
  let eligible = 0, skipped = 0;
  const lines = [];
  const createdIds = [];

  for (const candidate of candidates) {
    if (assignedIds.has(String(candidate.studentId))) {
      skipped += 1;
      lines.push(`  [skip] ${candidate.email} — already assigned this week`);
      continue;
    }
    const mission = selectIntervention(candidate, templates, null);
    if (!mission) {
      skipped += 1;
      lines.push(`  [skip] ${candidate.email} — no enabled template`);
      continue;
    }
    eligible += 1;
    const result = await createAssignment({
      candidate,
      mission,
      weekStart,
      template: mission,
      mode
    });
    if (result.status === 'created') {
      createdIds.push(result.assignmentId);
      lines.push(`  ${candidate.email} → ${mission.title}`);
    } else if (result.status === 'duplicate') {
      skipped += 1;
      lines.push(`  [skip-dupe] ${candidate.email} — raced with another run`);
    } else if (result.status === 'plan') {
      lines.push(`  ${candidate.email} → ${mission.title}  (dry-run)`);
    } else {
      skipped += 1;
      lines.push(`  [skip] ${candidate.email} — ${result.reason}`);
    }
  }

  // ── report ─────────────────────────────────────────────────────────────
  const modeLabel = dryRun ? 'DRY RUN' : 'APPLIED';
  console.log('');
  console.log(`Recovery Mission Run (${modeLabel})`);
  console.log('─────────────────────────');
  console.log(`Week: ${weekStart.toISOString().slice(0, 10)}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Eligible: ${eligible}`);
  console.log(`Already assigned: ${assignedIds.size}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Assignments ${dryRun ? 'would be created' : 'created'}: ${dryRun ? eligible : createdIds.length}`);
  for (const l of lines) console.log(l);
  console.log('');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(() => {
    // Disconnect + exit INSIDE .then, NOT inside .finally. The pattern of
    // scripts/seed.js / scripts/ingestSession.js is to await disconnect
    // inside run() and let node exit naturally. .finally() chains onto
    // .catch().then() and runs even after .catch()'s process.exit(1) —
    // which in our case means the finally's disconnect never has a chance
    // to run, but the success-path finally's disconnect can keep the
    // event loop alive on some node versions. Exiting explicitly is the
    // simplest fix.
    return mongoose.disconnect();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('shutdown error:', err);
    process.exit(1);
  });
