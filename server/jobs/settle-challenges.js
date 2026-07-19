import Challenge from '../models/Challenge.js';
import { settleChallenge } from '../routes/challenges.js';
import { getSimulatedProgress } from '../services/dummyProgress.js';

/**
 * Runs the check for pending challenge timeouts.
 * Challenges that have exceeded the 2-hour response window without a response
 * are marked as 'expired'.
 */
export async function expirePendingChallenges() {
  const now = new Date();
  const expiredCount = await Challenge.updateMany(
    {
      status: 'pending',
      respondTimeoutAt: { $lt: now }
    },
    {
      $set: { status: 'expired' },
      $push: {
        auditTrail: {
          at: now,
          actor: 'system',
          action: 'expire',
          detail: 'Auto-expired: 2-hour response window exceeded.'
        }
      }
    }
  );

  if (expiredCount.modifiedCount > 0) {
    console.log(`[Job:expire] Auto-expired ${expiredCount.modifiedCount} pending challenges.`);
  }
}

/**
 * Runs the check for active challenges that have reached their completion deadline.
 * Triggers deterministic progress scoring and settles wagers accordingly.
 */
export async function resolveEndedChallenges() {
  const now = new Date();

  // Find all active challenges where endAt is in the past
  const endedChallenges = await Challenge.find({
    status: 'active',
    endAt: { $lt: now }
  });

  if (endedChallenges.length === 0) return;

  console.log(`[Job:resolve] Found ${endedChallenges.length} ended active challenges to resolve.`);

  for (const c of endedChallenges) {
    try {
      // 1. Capture final simulated progress values
      const challengerProg = getSimulatedProgress(c._id, c.challengerId, c.topic, 1);
      const opponentProg = getSimulatedProgress(c._id, c.opponentId, c.topic, 1);

      c.progressFinal = {
        challenger: challengerProg,
        opponent: opponentProg
      };

      // 2. Decide outcome
      if (challengerProg > opponentProg) {
        await settleChallenge(
          c,
          'challenger',
          `Challenger won with progress: Challenger ${challengerProg} vs Opponent ${opponentProg}.`,
          'auto'
        );
      } else if (opponentProg > challengerProg) {
        await settleChallenge(
          c,
          'opponent',
          `Opponent won with progress: Opponent ${opponentProg} vs Challenger ${challengerProg}.`,
          'auto'
        );
      } else {
        // Tie voids the challenge
        await settleChallenge(
          c,
          'void',
          `Challenge ended in a tie: Challenger ${challengerProg} vs Opponent ${opponentProg}. Wagers returned.`,
          'auto'
        );
      }
    } catch (err) {
      console.error(`[Job:resolve] Failed to settle challenge ${c._id}:`, err.message);
    }
  }
}

/**
 * Combined runner function for background scheduler
 */
export async function runSettleChallengesJob() {
  try {
    await expirePendingChallenges();
    await resolveEndedChallenges();
  } catch (err) {
    console.error('[Job:settle-challenges] Error running background jobs:', err.message);
  }
}
