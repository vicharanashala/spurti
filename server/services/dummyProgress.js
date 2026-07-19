/**
 * server/services/dummyProgress.js
 *
 * A deterministic progress simulator for Spurti Peer Challenges.
 * Given a challengeId, studentId, topic, and elapsedFractionOfWindow (0 to 1),
 * it returns a reproducible progress score.
 *
 * This keeps screenshots, page refreshes, and settlement checks completely
 * reproducible because the random seed is derived directly from the
 * combination of challengeId and studentId.
 */

function getSeededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  let seed = Math.abs(hash) || 12345;
  return function() {
    // Standard LCG PRNG
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Simulates a student's progress for a challenge.
 *
 * @param {string} challengeId - The ID of the challenge
 * @param {string} studentId - The ID of the student
 * @param {string} topic - 'vibe_course' | 'matrix_questions' | 'poll_accuracy'
 * @param {number} elapsedFraction - Value between 0.0 and 1.0 (clamped)
 * @returns {number} The simulated progress metric
 */
export function getSimulatedProgress(challengeId, studentId, topic, elapsedFraction) {
  // Clamp elapsed fraction to [0, 1]
  const f = Math.max(0, Math.min(1, elapsedFraction));

  // Create a unique deterministic seed string for this specific student's challenge run
  const seedStr = `${challengeId}-${studentId}-${topic}`;
  const random = getSeededRandom(seedStr);

  // Generate deterministic start and end points for the student's progress
  const randStart = random();
  const randEnd = random();

  if (topic === 'vibe_course') {
    // Progress is a completion percentage (0 - 100%)
    const startVal = 5 + Math.floor(randStart * 20); // 5% to 25%
    const endVal = 60 + Math.floor(randEnd * 40);    // 60% to 100%
    const currentVal = startVal + f * (endVal - startVal);
    return Math.round(currentVal);
  }

  if (topic === 'matrix_questions') {
    // Progress is a score out of 50 questions
    const startVal = Math.floor(randStart * 8);      // 0 to 8
    const endVal = 30 + Math.floor(randEnd * 20);    // 30 to 50
    const currentVal = startVal + f * (endVal - startVal);
    return Math.round(currentVal);
  }

  if (topic === 'poll_accuracy') {
    // Progress is a poll answer accuracy percentage (e.g. 50% to 100%)
    const startVal = 55 + Math.floor(randStart * 15); // 55% to 70%
    const endVal = 75 + Math.floor(randEnd * 25);    // 75% to 100%
    const currentVal = startVal + f * (endVal - startVal);
    return Math.round(currentVal);
  }

  return 0;
}
