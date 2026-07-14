/**
 * server/services/skillBadgeAdapter.js
 *
 * Adapter from the new flat-list StudentSkillTree system to the old
 * per-branch-title shape that existing API consumers (leaderboards,
 * GhostRace, weekly-leaderboard) expect on `skillTitles`.
 *
 * Why this exists:
 *   - Old system:  `SkillTreeUnlock` (per-unlock docs, 4 branches × 5
 *                  nodes, mastery-tree titles)
 *   - New system:  `StudentSkillTree` (one doc per student with
 *                  `unlockedNodes: string[]`, 4 branches × 3 tiers)
 *
 *   The frontend GhostRace/leaderboard consumers only display the
 *   title strings (e.g. "Iron Routine") next to a student's name. We
 *   don't want to rewrite the entire surface to use buildSkillBadges
 *   output, so this adapter translates: take the new flat list,
 *   return the same `{ branch: 'title' | null }` shape so old code
 *   keeps working.
 *
 * Branch mapping (old → new):
 *   consistency  → consistency   (streak / habit)
 *   curiosity    → depth         (chat / poll focus)
 *   momentum     → speed         (early / on-time)
 *   excellence   → community     (peer / pillar)
 *
 * Edit BRANCH_MAP below to change the mapping. Each old branch maps
 * to the new branch whose tier-3 label best matches the legacy mastery
 * title semantics ("Legend in the Making" → "Community Pillar" feels
 * like the closest cultural match for an "ultimate" excellence tier).
 */

import StudentSkillTree       from '../models/StudentSkillTree.js';
import { buildSkillBadges }   from './skillBadges.js';

export const BRANCH_MAP = {
  consistency: 'consistency',
  curiosity:   'depth',
  momentum:    'speed',
  excellence:  'community',
};

/**
 * unlockedNodesToLegacyTitles(unlockedNodes)
 *
 * Pure transform. Returns `{ consistency: 'Momentum Surge', ... }`
 * shaped like the old `getHighestTitlesPerBranch` output. Branches
 * with no unlocked nodes get `null`. Branches not in BRANCH_MAP get
 * `null`.
 */
export function unlockedNodesToLegacyTitles(unlockedNodes = []) {
  const badges = buildSkillBadges(unlockedNodes);
  const badgeByBranch = Object.fromEntries(
    badges.map((b) => [b.branch, b])
  );

  const out = {};
  for (const oldBranch of Object.keys(BRANCH_MAP)) {
    const newBranch = BRANCH_MAP[oldBranch];
    const badge = badgeByBranch[newBranch];
    out[oldBranch] = badge ? badge.label : null;
  }
  return out;
}

/**
 * batchLegacyTitlesByEmail(emails)
 *
 * Fetches StudentSkillTree docs for the given emails (deduped, lower-
 * cased) and returns a map `email → legacyTitlesObj` ready to drop
 * into existing response shapes. Emails with no doc get a stub with
 * all four branches null.
 *
 * @param {string[]} emails
 * @returns {Promise<Object<string, {consistency,curiosity,momentum,excellence}>>}
 */
export async function batchLegacyTitlesByEmail(emails = []) {
  const cleaned = [
    ...new Set(
      (emails || [])
        .filter(Boolean)
        .map((e) => String(e).toLowerCase().trim())
    ),
  ];

  const empty = {
    consistency: null, curiosity: null, momentum: null, excellence: null,
  };
  const out = {};
  for (const e of cleaned) out[e] = empty;

  if (!cleaned.length) return out;

  const docs = await StudentSkillTree
    .find({ email: { $in: cleaned } })
    .select('email unlockedNodes')
    .lean();

  for (const doc of docs) {
    out[doc.email] = unlockedNodesToLegacyTitles(doc.unlockedNodes || []);
  }

  return out;
}