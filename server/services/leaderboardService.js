import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import LeaderboardEntry from '../models/LeaderboardEntry.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import SkillPointLog from '../models/SkillPointLog.js';

// Helper to calculate the Monday of the current calendar week in IST
export function getMondayOfCurrentWeekIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);

  const day = istTime.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
  const diff = istTime.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday

  const mondayUTC = Date.UTC(istTime.getUTCFullYear(), istTime.getUTCMonth(), diff, 0, 0, 0, 0);

  // Return date in UTC representation of that IST moment
  return new Date(mondayUTC - istOffset);
}

// 1. calculateGlobalLeaderboard()
export async function calculateGlobalLeaderboard() {
  // Aggregate SPTransaction deltas per active student to get rawSP
  const aggregates = await Student.aggregate([
    { $match: { status: 'active' } },
    {
      $lookup: {
        from: 'sptransactions',
        localField: '_id',
        foreignField: 'studentId',
        as: 'txns'
      }
    },
    {
      $project: {
        _id: 1,
        email: 1,
        internshipStartDate: 1,
        totalSP: { $sum: '$txns.appliedDelta' }
      }
    }
  ]);

  // Sort descending by totalSP, tiebreaker: earlier join date, then email alphabetically
  aggregates.sort((a, b) => {
    if (b.totalSP !== a.totalSP) return b.totalSP - a.totalSP;
    const aTime = a.internshipStartDate ? new Date(a.internshipStartDate).getTime() : 0;
    const bTime = b.internshipStartDate ? new Date(b.internshipStartDate).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.email.localeCompare(b.email);
  });

  // Fetch existing ranks to calculate deltas
  const existingEntries = await LeaderboardEntry.find({
    leaderboardType: 'GLOBAL',
    skillCategory: null,
    weekStart: null
  });
  const existingRankMap = new Map();
  for (const entry of existingEntries) {
    existingRankMap.set(entry.studentId.toString(), entry.rank);
  }

  const now = new Date();
  const bulkOps = aggregates.map((item, index) => {
    const newRank = index + 1;
    const studentIdStr = item._id.toString();
    const previousRank = existingRankMap.has(studentIdStr) ? existingRankMap.get(studentIdStr) : null;
    const rankDelta = previousRank !== null ? (previousRank - newRank) : 0;

    return {
      updateOne: {
        filter: {
          studentId: item._id,
          leaderboardType: 'GLOBAL',
          skillCategory: null,
          weekStart: null
        },
        update: {
          $set: {
            rawSP: item.totalSP,
            normalizedScore: null,
            rank: newRank,
            previousRank,
            rankDelta,
            lastCalculatedAt: now
          }
        },
        upsert: true
      }
    };
  });

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps);
  }

  return bulkOps.length;
}

// 2. calculateWeeklyLeaderboard()
export async function calculateWeeklyLeaderboard() {
  const weekStart = getMondayOfCurrentWeekIST();
  const now = new Date();

  // Aggregate weekly transaction deltas for active students
  const aggregates = await Student.aggregate([
    { $match: { status: 'active' } },
    {
      $lookup: {
        from: 'sptransactions',
        let: { studentId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$studentId', '$$studentId'] },
                  { $gte: ['$createdAt', weekStart] },
                  { $lte: ['$createdAt', now] }
                ]
              }
            }
          }
        ],
        as: 'txns'
      }
    },
    {
      $project: {
        _id: 1,
        email: 1,
        totalSp: 1, // all-time SP for tiebreaker
        weeklySP: { $sum: '$txns.appliedDelta' }
      }
    }
  ]);

  // Sort descending by weeklySP, tiebreaker: higher total all-time SP, then email alphabetically
  aggregates.sort((a, b) => {
    if (b.weeklySP !== a.weeklySP) return b.weeklySP - a.weeklySP;
    if (b.totalSp !== a.totalSp) return b.totalSp - a.totalSp;
    return a.email.localeCompare(b.email);
  });

  // Fetch existing ranks to calculate deltas
  const existingEntries = await LeaderboardEntry.find({
    leaderboardType: 'WEEKLY',
    weekStart
  });
  const existingRankMap = new Map();
  for (const entry of existingEntries) {
    existingRankMap.set(entry.studentId.toString(), entry.rank);
  }

  const bulkOps = aggregates.map((item, index) => {
    const newRank = index + 1;
    const studentIdStr = item._id.toString();
    const previousRank = existingRankMap.has(studentIdStr) ? existingRankMap.get(studentIdStr) : null;
    const rankDelta = previousRank !== null ? (previousRank - newRank) : 0;

    return {
      updateOne: {
        filter: {
          studentId: item._id,
          leaderboardType: 'WEEKLY',
          weekStart
        },
        update: {
          $set: {
            rawSP: item.weeklySP,
            normalizedScore: null,
            rank: newRank,
            previousRank,
            rankDelta,
            lastCalculatedAt: now
          }
        },
        upsert: true
      }
    };
  });

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps);
  }

  return bulkOps.length;
}

// 3. calculateSkillLeaderboard(skillCategory)
export async function calculateSkillLeaderboard(skillCategory) {
  const catUpper = skillCategory.toUpperCase();

  // Aggregate SkillPointLog documents filtered by skillCategory for active students only
  const aggregates = await SkillPointLog.aggregate([
    { $match: { skillCategory: catUpper } },
    {
      $group: {
        _id: '$studentId',
        skillSP: { $sum: '$pointsDelta' }
      }
    },
    { $match: { skillSP: { $gt: 0 } } },
    {
      $lookup: {
        from: 'students',
        localField: '_id',
        foreignField: '_id',
        as: 'student'
      }
    },
    { $unwind: '$student' },
    { $match: { 'student.status': 'active' } },
    {
      $project: {
        _id: 1,
        email: '$student.email',
        internshipStartDate: '$student.internshipStartDate',
        skillSP: 1
      }
    }
  ]);

  // Sort descending by skillSP, tiebreaker: earlier join date, then email alphabetically
  aggregates.sort((a, b) => {
    if (b.skillSP !== a.skillSP) return b.skillSP - a.skillSP;
    const aTime = a.internshipStartDate ? new Date(a.internshipStartDate).getTime() : 0;
    const bTime = b.internshipStartDate ? new Date(b.internshipStartDate).getTime() : 0;
    if (aTime !== bTime) return aTime - bTime;
    return a.email.localeCompare(b.email);
  });

  // Fetch existing ranks to calculate deltas
  const existingEntries = await LeaderboardEntry.find({
    leaderboardType: 'SKILL',
    skillCategory: catUpper
  });
  const existingRankMap = new Map();
  for (const entry of existingEntries) {
    existingRankMap.set(entry.studentId.toString(), entry.rank);
  }

  const now = new Date();
  const bulkOps = aggregates.map((item, index) => {
    const newRank = index + 1;
    const studentIdStr = item._id.toString();
    const previousRank = existingRankMap.has(studentIdStr) ? existingRankMap.get(studentIdStr) : null;
    const rankDelta = previousRank !== null ? (previousRank - newRank) : 0;

    return {
      updateOne: {
        filter: {
          studentId: item._id,
          leaderboardType: 'SKILL',
          skillCategory: catUpper
        },
        update: {
          $set: {
            rawSP: item.skillSP,
            normalizedScore: null,
            rank: newRank,
            previousRank,
            rankDelta,
            lastCalculatedAt: now
          }
        },
        upsert: true
      }
    };
  });

  // If a student previously had a skill rank but now has 0 SP in the category,
  // we delete their LeaderboardEntry rather than keeping it at 0 SP.
  const activeStudentIds = aggregates.map(item => item._id);
  await LeaderboardEntry.deleteMany({
    leaderboardType: 'SKILL',
    skillCategory: catUpper,
    studentId: { $nin: activeStudentIds }
  });

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps);
  }

  return bulkOps.length;
}

// 4. calculateCohortNormalizedLeaderboard()
export async function calculateCohortNormalizedLeaderboard() {
  const students = await Student.find({ status: 'active' }).lean();
  const now = new Date();

  const computed = students.map(student => {
    const joinDate = student.internshipStartDate ? new Date(student.internshipStartDate) : now;
    const msActive = now.getTime() - joinDate.getTime();
    const daysActive = Math.max(1, Math.round(msActive / (1000 * 60 * 60 * 24)));
    const rawSP = student.totalSp || 0;
    const normalizedScore = Number((rawSP / daysActive).toFixed(2));
    return {
      _id: student._id,
      email: student.email,
      rawSP,
      normalizedScore
    };
  });

  // Sort descending by normalizedScore, tiebreaker: higher raw SP, then email alphabetically
  computed.sort((a, b) => {
    if (b.normalizedScore !== a.normalizedScore) return b.normalizedScore - a.normalizedScore;
    if (b.rawSP !== a.rawSP) return b.rawSP - a.rawSP;
    return a.email.localeCompare(b.email);
  });

  // Fetch existing ranks to calculate deltas
  const existingEntries = await LeaderboardEntry.find({
    leaderboardType: 'COHORT_NORMALIZED'
  });
  const existingRankMap = new Map();
  for (const entry of existingEntries) {
    existingRankMap.set(entry.studentId.toString(), entry.rank);
  }

  const bulkOps = computed.map((item, index) => {
    const newRank = index + 1;
    const studentIdStr = item._id.toString();
    const previousRank = existingRankMap.has(studentIdStr) ? existingRankMap.get(studentIdStr) : null;
    const rankDelta = previousRank !== null ? (previousRank - newRank) : 0;

    return {
      updateOne: {
        filter: {
          studentId: item._id,
          leaderboardType: 'COHORT_NORMALIZED'
        },
        update: {
          $set: {
            rawSP: item.rawSP,
            normalizedScore: item.normalizedScore,
            rank: newRank,
            previousRank,
            rankDelta,
            lastCalculatedAt: now
          }
        },
        upsert: true
      }
    };
  });

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps);
  }

  return bulkOps.length;
}

// 5. calculateAllLeaderboards()
export async function calculateAllLeaderboards() {
  const summary = {};

  console.log('[LEADERBOARD SERVICE] Starting recalculation of all leaderboards...');
  
  // GLOBAL
  let start = Date.now();
  summary.GLOBAL = await calculateGlobalLeaderboard();
  console.log(`[LEADERBOARD SERVICE] Global recalculation completed in ${Date.now() - start}ms.`);

  // WEEKLY
  start = Date.now();
  summary.WEEKLY = await calculateWeeklyLeaderboard();
  console.log(`[LEADERBOARD SERVICE] Weekly recalculation completed in ${Date.now() - start}ms.`);

  // SKILL (5 categories)
  const skills = ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'];
  summary.SKILL = {};
  for (const cat of skills) {
    start = Date.now();
    summary.SKILL[cat] = await calculateSkillLeaderboard(cat);
    console.log(`[LEADERBOARD SERVICE] Skill (${cat}) recalculation completed in ${Date.now() - start}ms.`);
  }

  // COHORT NORMALIZED
  start = Date.now();
  summary.COHORT_NORMALIZED = await calculateCohortNormalizedLeaderboard();
  console.log(`[LEADERBOARD SERVICE] Cohort Normalized recalculation completed in ${Date.now() - start}ms.`);

  return summary;
}

// 6. archiveWeeklyLeaderboard()
export async function archiveWeeklyLeaderboard() {
  console.log('[LEADERBOARD SERVICE] Archiving weekly leaderboard...');
  const weekStart = getMondayOfCurrentWeekIST();
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000); // 1 sec before next Monday

  // Get current WEEKLY entries
  const weeklyEntries = await LeaderboardEntry.find({
    leaderboardType: 'WEEKLY',
    weekStart
  });

  if (weeklyEntries.length === 0) {
    console.log('[LEADERBOARD SERVICE] No weekly entries found to archive.');
    return;
  }

  // Format entries for snapshot
  const entries = weeklyEntries.map(e => ({
    studentId: e.studentId,
    rank: e.rank,
    rawSP: e.rawSP,
    normalizedScore: null
  }));

  // Create Snapshot
  const snapshot = await LeaderboardSnapshot.create({
    leaderboardType: 'WEEKLY',
    skillCategory: null,
    weekStart,
    weekEnd,
    entries
  });

  console.log(`[LEADERBOARD SERVICE] Saved weekly snapshot with ID: ${snapshot._id}`);

  // Delete old weekly entries
  const deleteResult = await LeaderboardEntry.deleteMany({
    leaderboardType: 'WEEKLY',
    weekStart
  });

  console.log(`[LEADERBOARD SERVICE] Deleted ${deleteResult.deletedCount} weekly leaderboard entries.`);
}
