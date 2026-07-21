import cron from 'node-cron';
import {
  calculateAllLeaderboards,
  archiveWeeklyLeaderboard,
  calculateWeeklyLeaderboard,
  calculateCohortNormalizedLeaderboard
} from '../services/leaderboardService.js';
import LeaderboardEntry from '../models/LeaderboardEntry.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';

// Simulated notification sender (logs to console/logs as no model is present in workspace)
async function sendNotification(studentId, message) {
  console.log(`[NOTIFICATION] Sent to student ${studentId}: "${message}"`);
}

// 1. recalculateAllLeaderboards()
// Run via cron every 30 minutes
export async function handleRecalculateAllLeaderboards() {
  const startTime = new Date();
  console.log(`[LEADERBOARD JOBS] Starting scheduled recalculateAllLeaderboards at ${startTime.toISOString()}`);
  try {
    const summary = await calculateAllLeaderboards();
    const endTime = new Date();
    console.log(`[LEADERBOARD JOBS] Recalculate completed successfully at ${endTime.toISOString()}. Summary:`, summary);
  } catch (error) {
    console.error(`[LEADERBOARD JOBS] Recalculate failed:`, error);
  }
}

// 2. weeklyReset()
// Run via cron every Monday at 00:01 IST
export async function handleWeeklyReset() {
  const startTime = new Date();
  console.log(`[LEADERBOARD JOBS] Starting scheduled weeklyReset at ${startTime.toISOString()}`);
  try {
    // 1. Archive the previous week's leaderboard
    await archiveWeeklyLeaderboard();

    // 2. Start a fresh week by calculating the new weekly leaderboard (defaults to weekStart rawSP: 0)
    await calculateWeeklyLeaderboard();

    // 3. Send final rank notification to all students for the week just archived.
    // Query entries before they were deleted or read them from snapshot.
    // Since we delete them in archiveWeeklyLeaderboard, we should query them from the newly created snapshot or prior to deletion.
    // Let's retrieve the most recent snapshot for WEEKLY.
    // Wait, it is safer to fetch the entries from LeaderboardEntry BEFORE archive/reset, or query the snapshot.
    // Let's query from LeaderboardEntry right before archiving or fetch from snapshot.
    // Let's fetch from the LeaderboardSnapshot just created.
    const latestSnapshot = await LeaderboardSnapshot.findOne({
      leaderboardType: 'WEEKLY'
    }).sort({ createdAt: -1 }).populate('entries.studentId');

    if (latestSnapshot && latestSnapshot.entries) {
      console.log(`[LEADERBOARD JOBS] Sending rank notifications to ${latestSnapshot.entries.length} students...`);
      for (const entry of latestSnapshot.entries) {
        if (entry.studentId) {
          const message = `Weekly reset complete! Your final rank for the week of ${latestSnapshot.weekStart.toLocaleDateString()} was #${entry.rank} with ${entry.rawSP} SP.`;
          await sendNotification(entry.studentId._id, message);
        }
      }
    }

    const endTime = new Date();
    console.log(`[LEADERBOARD JOBS] Weekly reset completed successfully at ${endTime.toISOString()}`);
  } catch (error) {
    console.error(`[LEADERBOARD JOBS] Weekly reset failed:`, error);
  }
}

// 3. recalculateCohortOnJoin()
// Event-based trigger (called when a new student joins the system)
export async function recalculateCohortOnJoin() {
  console.log('[LEADERBOARD JOBS] Event triggered: recalculateCohortOnJoin');
  try {
    const startTime = Date.now();
    const count = await calculateCohortNormalizedLeaderboard();
    console.log(`[LEADERBOARD JOBS] Cohort-normalized recalculation on student join completed in ${Date.now() - startTime}ms. Updated ${count} entries.`);
  } catch (error) {
    console.error(`[LEADERBOARD JOBS] Cohort recalculation on join failed:`, error);
  }
}

// Initializer function to set up cron schedules
export function initLeaderboardJobs() {
  console.log('[LEADERBOARD JOBS] Initializing cron job schedules...');

  // Recalculate all leaderboards every 30 minutes
  // Pattern: '*/30 * * * *'
  cron.schedule('*/30 * * * *', handleRecalculateAllLeaderboards);
  console.log('[LEADERBOARD JOBS] Scheduled: recalculateAllLeaderboards (every 30 minutes)');

  // Weekly reset every Monday at 00:01 IST
  // Pattern: '1 0 * * 1' (Asia/Kolkata timezone)
  cron.schedule('1 0 * * 1', handleWeeklyReset, {
    timezone: 'Asia/Kolkata'
  });
  console.log('[LEADERBOARD JOBS] Scheduled: weeklyReset (every Monday at 00:01 IST)');
}
