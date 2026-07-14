/**
 * server/services/skillBadges.js
 * Pure utility — no DB access, no side effects.
 * Converts raw unlockedNodes arrays into display badges.
 *
 * Used by: server.js (studentPayload), leaderboard routes,
 * weeklyLeaderboard route, factionWars route, and any
 * other place that needs to show skills publicly.
 */

/* Branch display metadata */
export const BRANCH_META = {
  consistency: { emoji: '🔥', label: 'Consistency', short: 'CON' },
  depth:       { emoji: '📚', label: 'Deep Learner', short: 'DEP' },
  speed:       { emoji: '⚡', label: 'Early Bird',   short: 'SPD' },
  community:   { emoji: '🤝', label: 'Community',    short: 'COM' },
};

/**
 * Node → branch + tier mapping.
 * Keeps this file decoupled from the full SKILL_TREE_BRANCHES
 * config in skillTree.js. If you add branches, add them here.
 */
const NODE_BRANCH_TIER = {
  c1: { branch: 'consistency', tier: 1, isUltimate: false,
        label: 'Streak Vision' },
  c2: { branch: 'consistency', tier: 2, isUltimate: false,
        label: 'Fast Freeze' },
  c3: { branch: 'consistency', tier: 3, isUltimate: true,
        label: 'Momentum Surge' },
  d1: { branch: 'depth', tier: 1, isUltimate: false,
        label: 'Chat Amplifier' },
  d2: { branch: 'depth', tier: 2, isUltimate: false,
        label: 'Poll Focus' },
  d3: { branch: 'depth', tier: 3, isUltimate: true,
        label: 'Full Presence' },
  s1: { branch: 'speed', tier: 1, isUltimate: false,
        label: 'Early Joiner' },
  s2: { branch: 'speed', tier: 2, isUltimate: false,
        label: 'On-Time Streak' },
  s3: { branch: 'speed', tier: 3, isUltimate: true,
        label: 'Speed Master' },
  m1: { branch: 'community', tier: 1, isUltimate: false,
        label: 'Peer Vision' },
  m2: { branch: 'community', tier: 2, isUltimate: false,
        label: 'Give & Gain' },
  m3: { branch: 'community', tier: 3, isUltimate: true,
        label: 'Community Pillar' },
};

/**
 * buildSkillBadges(unlockedNodes)
 *
 * @param {string[]} unlockedNodes  — array of node IDs e.g. ['c1','c2','d1']
 * @returns {Array} badges — one per branch, highest tier only.
 *
 * Example output:
 * [
 *   { branch:'consistency', emoji:'🔥', tier:2, isUltimate:false,
 *     label:'Fast Freeze', display:'🔥T2' },
 *   { branch:'depth', emoji:'📚', tier:1, isUltimate:false,
 *     label:'Chat Amplifier', display:'📚T1' },
 * ]
 */
export function buildSkillBadges(unlockedNodes = []) {
  if (!Array.isArray(unlockedNodes) || !unlockedNodes.length)
    return [];

  // Find highest tier per branch
  const highestByBranch = {};
  for (const nodeId of unlockedNodes) {
    const info = NODE_BRANCH_TIER[nodeId];
    if (!info) continue;
    const { branch, tier } = info;
    if (!highestByBranch[branch] ||
        tier > highestByBranch[branch].tier) {
      highestByBranch[branch] = { ...info, nodeId };
    }
  }

  // Convert to display badges, sorted by branch order
  const branchOrder = ['consistency', 'depth', 'speed', 'community'];
  return branchOrder
    .filter(b => highestByBranch[b])
    .map(b => {
      const info = highestByBranch[b];
      const meta = BRANCH_META[b];
      return {
        branch:      b,
        emoji:       meta.emoji,
        branchLabel: meta.label,
        tier:        info.tier,
        label:       info.label,
        isUltimate:  info.isUltimate,
        display:     `${meta.emoji}T${info.tier}${info.isUltimate ? '⭐' : ''}`,
      };
    });
}

/**
 * batchSkillMap(skillTreeDocs)
 *
 * Converts an array of StudentSkillTree documents into a
 * Map of email → badges array. Use this in routes that
 * need to show skills for many students at once (leaderboards).
 *
 * @param {Object[]} skillTreeDocs — lean StudentSkillTree docs
 * @returns {Object} { [email]: badge[] }
 */
export function batchSkillMap(skillTreeDocs = []) {
  const map = {};
  for (const doc of skillTreeDocs) {
    if (doc.email) {
      map[doc.email] = buildSkillBadges(doc.unlockedNodes || []);
    }
  }
  return map;
}