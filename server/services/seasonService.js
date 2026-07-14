/**
 * Season Service
 *
 * Pure functions for computing season-relative SP, standings, and reward
 * eligibility. Values are DERIVED from existing data — the authoritative
 * source is Student.totalSp and the SPTransaction ledger.
 *
 * Season progress:
 *   earnedSp = current totalSp − baselineSp
 *
 * baselineSp = balanceAfter of the last SPTransaction with dateTime ≤ season.startDate.
 * If no such transaction exists, baselineSp = 0 (student had no history before season).
 */

import SeasonStanding from '../models/SeasonStanding.js';
import SeasonReward from '../models/SeasonReward.js';
import Season from '../models/Season.js';
import SPTransaction from '../models/SPTransaction.js';
import Student from '../models/Student.js';
import Session         from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import { leagueBand }  from './levels.js';

// ─── Active-season cache (30 s TTL) ────────────────────────────────────────

let _activeSeasonCache = { doc: null, at: 0 };
const CACHE_TTL_MS = 30_000;

export async function getActiveSeason() {
  const now = Date.now();
  if (_activeSeasonCache.doc && now - _activeSeasonCache.at < CACHE_TTL_MS) {
    return _activeSeasonCache.doc;
  }
  const { default: Season } = await import('../models/Season.js');
  const doc = await Season.findOne({ status: 'active' })
    .sort({ startDate: -1 })
    .lean();
  _activeSeasonCache = { doc, at: now };
  return doc;
}

export function invalidateSeasonCache() {
  _activeSeasonCache = { doc: null, at: 0 };
}

// ─── Baseline SP ────────────────────────────────────────────────────────────

/**
 * The student's totalSp as of the last transaction that occurred on or before
 * the season startDate. Used as the anchor for computing earned SP.
 */
export async function baselineSpFor(email, seasonStartDate) {
  const start = new Date(seasonStartDate);
  const tx = await SPTransaction.findOne({ email, dateTime: { $lte: start } })
    .sort({ dateTime: -1, createdAt: -1 })
    .lean();
  return tx ? Number(tx.balanceAfter || 0) : 0;
}

// ─── Qualified sessions within a season window ──────────────────────────────

/**
 * Count of sessions the student qualified for that fall inside [startDate, endDate].
 */
export async function qualifiedSessionsFor(email, startDate, endDate) {
  // Get session labels whose date falls within the season window
  const sessions = await Session.find({
    date: { $gte: startDate, $lte: endDate }
  }).select('label').lean();
  if (!sessions.length) return 0;
  const labels = sessions.map(s => s.label);
  return AttendanceRecord.countDocuments({ email, qualified: true, sessionLabel: { $in: labels } });
}

// ─── Recompute one student's standing for a season ──────────────────────────

export async function recomputeStanding(studentEmail, seasonId) {
  const { default: Season } = await import('../models/Season.js');
  const season = await Season.findById(seasonId).lean();
  if (!season) return null;

  const student = await Student.findOne({ email: studentEmail }).lean();
  if (!student) return null;

  const baseline          = await baselineSpFor(studentEmail, season.startDate);
  const currentSp         = Number(student.totalSp || 0);
  const earnedSp          = Math.max(0, currentSp - baseline);
  const qualifiedSessions = await qualifiedSessionsFor(studentEmail, season.startDate, season.endDate);
  const currentLeague     = leagueBand(currentSp);

  const existing = await SeasonStanding.findOne({ email: studentEmail, seasonId }).lean();
  // If current earnedSp exceeds previous peak, update peak league; else keep existing
  const peakLeague = (!existing || earnedSp > existing.earnedSp)
    ? currentLeague
    : (existing?.peakLeague || currentLeague);

  const standing = await SeasonStanding.findOneAndUpdate(
    { email: studentEmail, seasonId },
    {
      $set: {
        studentId:         student._id,
        baselineSp:        baseline,
        earnedSp:          earnedSp,
        peakLeague:        peakLeague,
        qualifiedSessions: qualifiedSessions ?? 0,
        claimedRewards:    existing?.claimedRewards   || [],
        finalRank:         existing?.finalRank         || null,
        finalPercentile:   existing?.finalPercentile   || null,
      }
    },
    { upsert: true, new: true, lean: true }
  );
  return standing;
}

// ─── Recompute all standings for a season ───────────────────────────────────

export async function recomputeAllStandings(seasonId) {
  const { default: Season } = await import('../models/Season.js');
  const season = await Season.findById(seasonId).lean();
  if (!season) return { updated: 0 };
  const students = await Student.find({ status: { $ne: 'excused' } }).lean();
  let updated = 0;
  for (const s of students) {
    await recomputeStanding(s.email, seasonId);
    updated++;
  }
  return { updated };
}

// ─── Student season context (for /api/me response extension) ────────────────

/**
 * Returns everything the client needs to render the season panel:
 *   { season, standing, rewards, eligibleRewards, myRank, cohortSize }
 */
export async function getStudentSeasonContext(email) {
  const season = await getActiveSeason();
  if (!season) return { season: null, standing: null, rewards: [], eligibleRewards: [], myRank: null, cohortSize: 0 };

  let standing = await SeasonStanding.findOne({ email, seasonId: season._id }).lean();
  if (!standing) {
    standing = await recomputeStanding(email, season._id);
  }
  if (!standing) return { season, standing: null, rewards: [], eligibleRewards: [], myRank: null, cohortSize: 0 };

  const rewards = await SeasonReward.find({ seasonId: season._id })
    .sort({ order: 1 })
    .lean();

  // Compute rank within this season BEFORE the eligibility filter so rank-based
  // rewards can be included.
  const myEarnedSp = standing.earnedSp;
  const higherCount = await SeasonStanding.countDocuments({
    seasonId: season._id,
    earnedSp: { $gt: myEarnedSp }
  });
  const cohortSize = await SeasonStanding.countDocuments({ seasonId: season._id });
  const myRank = higherCount + 1;

  const eligibleRewards = rewards
    .filter(r => isRewardEligible(r, standing) || (r.goalType === 'rank' && myRank <= Number(r.goalValue)))
    .map(r => r.key);

  return { season, standing, rewards, eligibleRewards, myRank, cohortSize };
}

// ─── Reward eligibility ─────────────────────────────────────────────────────

function isRewardEligible(reward, standing) {
  if (!standing) return false;
  switch (reward.goalType) {
    case 'sp':
      return standing.earnedSp >= reward.goalValue;
    case 'rank':
      // goalValue = numeric rank ceiling; standing rank ≤ ceiling to qualify
      // Rank must be computed externally; for pre-filter use earnedSp heuristic
      return false; // resolved at query time — see eligibleRewardsForSeason
    case 'qualified_sessions':
      return standing.qualifiedSessions >= reward.goalValue;
    case 'league':
      return standing.peakLeague === reward.goalValue;
    default:
      return false;
  }
}

/**
 * Returns all rewards a student is eligible for (including rank-based),
 * given the student's rank in the season.
 */
export function eligibleRewardsForSeason(rewards, standing, myRank) {
  if (!standing) return [];
  return rewards
    .filter(r => {
      switch (r.goalType) {
        case 'sp':               return standing.earnedSp >= r.goalValue;
        case 'rank':             return myRank !== null && myRank <= r.goalValue;
        case 'qualified_sessions': return standing.qualifiedSessions >= r.goalValue;
        case 'league':           return standing.peakLeague === r.goalValue;
        default:                 return false;
      }
    })
    .map(r => r.key);
}

// ─── Season leaderboard ─────────────────────────────────────────────────────

export async function seasonLeaderboard(seasonId, { limit = 50, email = null } = {}) {
  const standings = await SeasonStanding.find({ seasonId })
    .sort({ earnedSp: -1 })
    .limit(limit)
    .lean();

  const rows = [];
  let myRank = null;

  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const student = await Student.findOne({ _id: s.studentId }).lean();
    if (!student) continue;
    if (s.email === email) myRank = i + 1;
    rows.push({
      rank:              i + 1,
      name:              student.name,
      maskedEmail:       maskEmail(student.email),
      earnedSp:          s.earnedSp,
      peakLeague:        s.peakLeague,
      isCurrentStudent:  s.email === email
    });
  }

  const cohortSize = await SeasonStanding.countDocuments({ seasonId });
  return { rows, myRank, cohortSize };
}

// ─── Claim a reward ─────────────────────────────────────────────────────────

export async function claimReward(email, rewardId) {
  const reward = await SeasonReward.findById(rewardId).lean();
  if (!reward) return { error: 'Reward not found' };

  const standing = await SeasonStanding.findOne({ email, seasonId: reward.seasonId }).lean();
  if (!standing) return { error: 'No season standing found' };

  if (standing.claimedRewards?.includes(reward.key)) {
    return { success: true, alreadyClaimed: true, spBonus: 0 };
  }

  // Re-check eligibility with rank if needed
  if (reward.goalType === 'rank') {
    const higherCount = await SeasonStanding.countDocuments({
      seasonId: reward.seasonId,
      earnedSp: { $gt: standing.earnedSp }
    });
    const myRank = higherCount + 1;
    if (myRank > reward.goalValue) return { error: 'Rank threshold not met' };
  } else if (!isRewardEligible(reward, standing)) {
    return { error: 'Not eligible for this reward yet' };
  }

  // Award spBonus via an SPTransaction so the ledger stays the source of truth.
  // The Student.totalSp is bumped and a manual transaction is recorded for audit.
  let awardedSp = 0;
  const bonus = Number(reward.spBonus || 0);
  if (bonus > 0) {
    const student = await Student.findOne({ email }).lean();
    if (student) {
      const newTotal = (student.totalSp || 0) + bonus;
      const season = await Season.findById(reward.seasonId).lean();
      const reason = `Season reward: ${reward.label}`;
      const tx = await SPTransaction.create({
        email,
        studentId: student._id,
        category: 'manual',
        sessionLabel: season ? `season:${season.number}` : 'season',
        deltaMode: 'absolute',
        deltaValue: bonus,
        appliedDelta: bonus,
        balanceAfter: newTotal,
        reason,
        dateTime: new Date()
      });
      await Student.updateOne({ _id: student._id }, { $set: { totalSp: newTotal } });
      awardedSp = bonus;
    }
  }

  await SeasonStanding.updateOne(
    { email, seasonId: reward.seasonId },
    { $addToSet: { claimedRewards: reward.key } }
  );

  return {
    success: true,
    alreadyClaimed: false,
    spBonus: awardedSp,
    rewardLabel: reward.label,
    rewardKey: reward.key
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function maskEmail(email) {
  const value = String(email || '').trim();
  const [name, domain] = value.split('@');
  if (!name || !domain) return 'hidden email';
  const start = name.slice(0, Math.min(2, name.length));
  const end   = name.length > 4 ? name.slice(-2) : '';
  return `${start}${'*'.repeat(Math.max(3, name.length - start.length - end.length))}${end}@${domain}`;
}