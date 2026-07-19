/**
 * seeds/challengeTypes.seed.js
 *
 * Seeds the ChallengeType collection with the 5 predefined P2P challenge
 * type definitions that match the Spurti P2P Challenge specification.
 *
 * Usage:
 *   node seeds/challengeTypes.seed.js
 *
 * This script is idempotent: it clears the ChallengeType collection before
 * inserting, so it is safe to re-run after spec updates.
 *
 * Prerequisites:
 *   - MongoDB must be running and accessible at MONGO_URI (from .env).
 *   - All Mongoose models must be importable (ES module project).
 *
 * Run from the project root:
 *   node seeds/challengeTypes.seed.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import ChallengeType from '../server/models/ChallengeType.js';

// ─── MongoDB connection ────────────────────────────────────────────────────────

const MONGO_URI =
  process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';

// ─── Seed data ────────────────────────────────────────────────────────────────

const CHALLENGE_TYPE_SEEDS = [
  // ── 1. Orientation Course Completion ──────────────────────────────────────
  {
    slug: 'orientation_completion',
    displayName: 'Orientation Course Completion',
    description:
      'Challenge your peer to finish the Orientation course before you do. ' +
      'First to complete all required modules and pass the final assessment wins.',
    windowType: 'OPEN_ENDED',
    winCondition:
      'The student whose course completion timestamp is strictly earlier (after ' +
      'the challenge was accepted) wins. If only one student completes the ' +
      'Orientation course within 30 days of the challenge being accepted, ' +
      'that student wins.',
    tieCondition:
      'If both students complete the course at the same second, or if neither ' +
      'student completes the course within 30 days of acceptance, the challenge ' +
      'is cancelled and both wagers are returned in full.',
    validCompletionRule:
      'A completion is valid only if: (1) the student reaches 100% module ' +
      'progress on the Orientation course, (2) the final assessment is passed ' +
      '(not merely submitted), and (3) the completion timestamp is strictly ' +
      'after the challenge was accepted. Admin-granted or bypassed completions ' +
      'do not count.',
  },

  // ── 2. AI Course Completion ───────────────────────────────────────────────
  {
    slug: 'ai_completion',
    displayName: 'AI Course Completion',
    description:
      'Race your peer to finish the AI Fundamentals course. Complete all modules ' +
      'and pass the final assessment first to win the wager.',
    windowType: 'OPEN_ENDED',
    winCondition:
      'The student whose AI course completion timestamp is strictly earlier ' +
      '(after the challenge was accepted) wins. If only one student completes ' +
      'within 30 days of acceptance, that student wins.',
    tieCondition:
      'Identical completion timestamps (to the second) or neither student ' +
      'completing within 30 days results in cancellation and a full wager ' +
      'refund to both students.',
    validCompletionRule:
      'A completion is valid only if: (1) the student reaches 100% module ' +
      'progress on the AI Fundamentals course, (2) the final assessment score ' +
      'meets or exceeds the passing threshold, and (3) the completion timestamp ' +
      'is strictly after the challenge was accepted. Admin overrides, progress ' +
      'resets followed by re-completion, and proxy completions do not count.',
  },

  // ── 3. MERN Stack Course Completion ───────────────────────────────────────
  {
    slug: 'mern_completion',
    displayName: 'MERN Stack Course Completion',
    description:
      'Finish the MERN Stack course before your opponent does. All modules must ' +
      'be completed and the final assessment passed to win.',
    windowType: 'OPEN_ENDED',
    winCondition:
      'The student whose MERN Stack course completion timestamp is strictly ' +
      'earlier (after the challenge was accepted) wins. If only one student ' +
      'completes within 30 days of acceptance, that student wins.',
    tieCondition:
      'Identical completion timestamps or neither student completing within 30 ' +
      'days results in cancellation and a full wager refund to both students.',
    validCompletionRule:
      'A completion is valid only if: (1) the student reaches 100% module ' +
      'progress on the MERN Stack course, (2) the final assessment is passed, ' +
      'and (3) the completion timestamp is strictly after the challenge was ' +
      'accepted. Admin-granted completions and bypassed assessments do not count.',
  },

  // ── 4. Poll Streak ────────────────────────────────────────────────────────
  {
    slug: 'poll_streak',
    displayName: 'Poll Streak',
    description:
      'Answer more live polls than your opponent over the next 7 days. Each ' +
      'poll session counts once — highest total wins the wager.',
    windowType: 'FIXED_7_DAY',
    winCondition:
      'The student with the higher count of deduplicated poll responses across ' +
      'unique session IDs within the 7-day active window wins. The count is ' +
      'evaluated exactly when the 7-day window expires.',
    tieCondition:
      'If both students have an identical deduplicated poll response count at ' +
      'the close of the 7-day window, the challenge is a tie and both wagers ' +
      'are returned in full.',
    validCompletionRule:
      'A poll response is valid if: (1) the response timestamp falls within the ' +
      '7-day active window, (2) the session ID is unique per student within this ' +
      "challenge's window (first response per session only — duplicate responses " +
      'in the same session are ignored), and (3) the poll belongs to a scheduled ' +
      'live session (not a practice or demo poll). Responses received after the ' +
      '7-day window closes are not counted.',
  },

  // ── 5. Class Attendance Race ──────────────────────────────────────────────
  {
    slug: 'attendance_race',
    displayName: 'Class Attendance Race',
    description:
      'Attend more live class sessions than your opponent over the next 7 days. ' +
      'Presence must meet the minimum threshold — most sessions attended wins.',
    windowType: 'FIXED_7_DAY',
    winCondition:
      'The student with the higher count of qualifying attendance records ' +
      '(present + at least 75% of session duration attended) across unique ' +
      'session IDs within the 7-day active window wins, evaluated at the ' +
      'close of the window.',
    tieCondition:
      'Equal qualifying attendance counts at window close results in a tie; ' +
      'both wagers are returned in full.',
    validCompletionRule:
      'An attendance record is valid if: (1) present=true, (2) the student ' +
      'attended at least 75% of the session duration, (3) the session started ' +
      'within the 7-day active window, and (4) the attendance record was ' +
      'processed within the window end time plus a 2-hour grace period for ' +
      'processing lag. Late-processed records outside the grace period and ' +
      'manual attendance overrides applied after window close are not counted.',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log(`✅ Connected to ${MONGO_URI}`);

  console.log('🗑  Clearing ChallengeType collection...');
  const deleteResult = await ChallengeType.deleteMany({});
  console.log(`   Removed ${deleteResult.deletedCount} existing document(s).`);

  console.log('📥 Inserting 5 challenge type documents...');
  const inserted = await ChallengeType.insertMany(CHALLENGE_TYPE_SEEDS);
  console.log(`✅ Inserted ${inserted.length} challenge type(s):`);
  for (const doc of inserted) {
    console.log(`   • [${doc.slug}] ${doc.displayName} (windowType: ${doc.windowType})`);
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB.');
  console.log('✅ Challenge type seed complete.');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
