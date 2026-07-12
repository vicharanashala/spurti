/**
 * Spurti Skill Tree — pure-function view layer.
 *
 * Skill Points (SP) earned = floor(student.highestSpEver / 100).
 * Skill Points spent  = count of unlocked nodes.
 * Skill Points available = earned - spent.
 *
 * The tree is purely cosmetic: unlocking a node grants a title/badge and
 * does NOT modify SP, level, trophy league, streaks, arena tier, or any
 * other system. This module does not touch the database and has no side
 * effects — it just shapes data for the API and UI.
 *
 * Branches and node titles are fixed by product spec. Reordering or
 * renaming requires a migration on the SkillTreeUnlock collection.
 */

export const SKILL_TREE = {
  consistency: [
    { title: 'Steady Starter' },
    { title: 'Habit Builder' },
    { title: 'Iron Routine' },
    { title: 'Unshakeable' },
    { title: 'Consistency Master' },
  ],
  curiosity: [
    { title: 'Curious Mind' },
    { title: 'Question Seeker' },
    { title: 'Deep Diver' },
    { title: 'Relentless Learner' },
    { title: 'Curiosity Master' },
  ],
  momentum: [
    { title: 'First Spark' },
    { title: 'Building Heat' },
    { title: 'On Fire' },
    { title: 'Unstoppable' },
    { title: 'Momentum Master' },
  ],
  excellence: [
    { title: 'Rising Star' },
    { title: 'High Achiever' },
    { title: 'Elite Performer' },
    { title: 'Legend in the Making' },
    { title: 'Excellence Master' },
  ],
};

export const SKILL_TREE_BRANCHES = Object.keys(SKILL_TREE);

/**
 * Skill Points earned from lifetime SP. Pure read-only; never writes.
 */
export function skillPointsEarned(highestSpEver) {
  return Math.floor(Math.max(0, Number(highestSpEver) || 0) / 100);
}

/**
 * Given the array of already-unlocked node indexes for one branch
 * (e.g. [0, 1]), returns the highest unlocked title string for that
 * branch (e.g. 'Habit Builder'), or null if no nodes are unlocked.
 *
 * Used by the social layer: badges shown next to the student's name
 * on the leaderboard, ghost-race header, wrapped cover, admin table,
 * and their own profile header. Pure read; no DB access.
 */
export function getHighestTitlesPerBranch(unlockedByBranch) {
  const out = {};
  for (const branch of SKILL_TREE_BRANCHES) {
    const unlocked = Array.isArray(unlockedByBranch?.[branch])
      ? unlockedByBranch[branch].map(Number)
      : [];
    if (unlocked.length === 0) {
      out[branch] = null;
      continue;
    }
    const highestIdx = Math.max(...unlocked);
    const node = SKILL_TREE[branch][highestIdx];
    out[branch] = node ? node.title : null;
  }
  return out;
}

/**
 * Given the array of already-unlocked node indexes for one branch
 * (e.g. [0, 1]), returns the index that can be unlocked next (2 in
 * that example), or null if the branch is fully unlocked.
 */
export function nextUnlockableIndex(unlockedNodeIndexesForBranch) {
  const unlocked = new Set((unlockedNodeIndexesForBranch || []).map(Number));
  for (let i = 0; i < 5; i++) {
    if (!unlocked.has(i)) return i;
  }
  return null;
}

/**
 * Build the full skill-tree view for the UI.
 *
 * unlockedByBranch:
 *   { consistency: [0,1], curiosity: [], momentum: [0], excellence: [] }
 *
 * Returns:
 *   {
 *     pointsEarned, pointsSpent, pointsAvailable,
 *     branches: {
 *       consistency: { nodes: [{ index, title, unlocked, isNextUnlockable }, ...] },
 *       ...
 *     }
 *   }
 *
 * `isNextUnlockable` is true ONLY for the single node per branch that
 * `nextUnlockableIndex` returns, AND only if pointsAvailable > 0. If
 * pointsAvailable is 0 (or negative) no node is highlighted as
 * unlockable even if it would be next in its branch.
 */
export function buildSkillTreeView(highestSpEver, unlockedByBranch) {
  const pointsEarned = skillPointsEarned(highestSpEver);

  const branchesOut = {};
  let pointsSpent = 0;

  for (const branch of SKILL_TREE_BRANCHES) {
    const unlocked = Array.isArray(unlockedByBranch?.[branch])
      ? unlockedByBranch[branch].map(Number)
      : [];
    pointsSpent += unlocked.length;
    const nextIdx = nextUnlockableIndex(unlocked);

    branchesOut[branch] = {
      nodes: SKILL_TREE[branch].map((node, idx) => ({
        index: idx,
        title: node.title,
        unlocked: unlocked.includes(idx),
        // Default false; corrected below once we know pointsAvailable.
        isNextUnlockable: false,
      })),
    };

    // Highlight the next unlockable node, but only if the student has
    // an unspent point available. This prevents showing a "click to
    // unlock" affordance the server would reject.
    if (nextIdx !== null && branchesOut[branch].nodes[nextIdx]) {
      branchesOut[branch].nodes[nextIdx].isNextUnlockable = false; // set below
    }
  }

  const pointsAvailable = Math.max(0, pointsEarned - pointsSpent);

  // Second pass: now that pointsAvailable is known, mark the single
  // next-unlockable node per branch (only when pointsAvailable > 0).
  for (const branch of SKILL_TREE_BRANCHES) {
    const nextIdx = nextUnlockableIndex(
      (unlockedByBranch?.[branch] || []).map(Number)
    );
    if (nextIdx !== null && pointsAvailable > 0) {
      branchesOut[branch].nodes[nextIdx].isNextUnlockable = true;
    }
  }

  return {
    pointsEarned,
    pointsSpent,
    pointsAvailable,
    branches: branchesOut,
  };
}