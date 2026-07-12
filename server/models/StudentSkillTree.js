/**
 * server/models/StudentSkillTree.js
 *
 * Flat-list Skill Tree, additive to the existing per-unlock
 * `SkillTreeUnlock.js` collection. Coexists for now:
 *   - SkillTreeUnlock   → document-per-unlock, 5-node mastery tree
 *                        (consistency / curiosity / momentum / excellence)
 *   - StudentSkillTree  → one document per student with `unlockedNodes: string[]`
 *                        (3-tier display tree: consistency / depth / speed / community)
 *
 * The two systems are intentionally separate because they have different
 * unlock rules, different branch taxonomies, and different display
 * semantics. Future consolidation (Prompt 5+) can merge if needed.
 *
 * Node IDs follow the spec in services/skillBadges.js:
 *   c1-c3 = consistency tier 1..3
 *   d1-d3 = depth       tier 1..3
 *   s1-s3 = speed       tier 1..3
 *   m1-m3 = community   tier 1..3
 */

import mongoose from 'mongoose';

const studentSkillTreeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },
    unlockedNodes: {
      type: [String],
      default: [],
      // Cheap shape guard: 2-char IDs from the 12-node map.
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.every(
            (n) =>
              typeof n === 'string' &&
              /^[cdms][1-3]$/.test(n)
          ),
        message:
          'unlockedNodes must be an array of node IDs matching /^[cdms][1-3]$/',
      },
    },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// (email is already indexed via `unique: true` in the field def above,
// which creates the unique index mongoose needs. No extra index needed
// for batch-by-email lookups — MongoDB will use the unique index.)

export default mongoose.model('StudentSkillTree', studentSkillTreeSchema);