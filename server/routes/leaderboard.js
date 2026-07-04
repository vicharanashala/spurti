import express from 'express';
import mongoose from 'mongoose';
import LeaderboardEntry from '../models/LeaderboardEntry.js';
import LeaderboardSnapshot from '../models/LeaderboardSnapshot.js';
import Student from '../models/Student.js';
import { calculateAllLeaderboards, getMondayOfCurrentWeekIST } from '../services/leaderboardService.js';

const router = express.Router();

// Simple adminGuard middleware using env variables
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in').trim().toLowerCase();
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'vled-local-admin';

function adminGuard(req, res, next) {
  const email = String(req.headers['x-admin-email'] || '').trim().toLowerCase();
  const token = String(req.headers['x-admin-token'] || '');
  if (email === ADMIN_EMAIL && token === ADMIN_TOKEN) {
    return next();
  }
  return res.status(403).json({ error: 'Forbidden' });
}

// In-memory rate limiting state for recalculation
let lastRecalculatedAt = 0;

// Helper to get Monday of any date in IST
function getMondayOfWeekIST(date) {
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(date.getTime() + istOffset);
  const day = istTime.getUTCDay();
  const diff = istTime.getUTCDate() - day + (day === 0 ? -6 : 1);
  const mondayUTC = Date.UTC(istTime.getUTCFullYear(), istTime.getUTCMonth(), diff, 0, 0, 0, 0);
  return new Date(mondayUTC - istOffset);
}

// 1. GET /api/leaderboard/global
router.get('/global', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const matchStage = { leaderboardType: 'GLOBAL' };

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' }
    ];

    if (search) {
      pipeline.push({
        $match: { 'student.name': { $regex: search, $options: 'i' } }
      });
    }

    // Count query
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await LeaderboardEntry.aggregate(countPipeline);
    const total = countResult[0] ? countResult[0].total : 0;

    // Sort & Paginate
    pipeline.push(
      { $sort: { rank: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    );

    const entries = await LeaderboardEntry.aggregate(pipeline);

    const data = entries.map(e => ({
      studentId: e.studentId,
      name: e.student.name,
      totalSP: e.rawSP,
      rank: e.rank,
      rankDelta: e.rankDelta,
      joinDate: e.student.internshipStartDate
    }));

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. GET /api/leaderboard/weekly
router.get('/weekly', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const search = req.query.search ? String(req.query.search).trim() : '';
    
    let targetWeekDate = new Date();
    if (req.query.week) {
      const parsed = Date.parse(req.query.week);
      if (!isNaN(parsed)) targetWeekDate = new Date(parsed);
    }

    const weekStart = getMondayOfWeekIST(targetWeekDate);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);
    const currentWeekStart = getMondayOfCurrentWeekIST();

    const isCurrentWeek = weekStart.getTime() === currentWeekStart.getTime();

    if (isCurrentWeek) {
      const pipeline = [
        { $match: { leaderboardType: 'WEEKLY', weekStart } },
        {
          $lookup: {
            from: 'students',
            localField: 'studentId',
            foreignField: '_id',
            as: 'student'
          }
        },
        { $unwind: '$student' }
      ];

      if (search) {
        pipeline.push({
          $match: { 'student.name': { $regex: search, $options: 'i' } }
        });
      }

      const countResult = await LeaderboardEntry.aggregate([...pipeline, { $count: 'total' }]);
      const total = countResult[0] ? countResult[0].total : 0;

      pipeline.push(
        { $sort: { rank: 1 } },
        { $skip: (page - 1) * limit },
        { $limit: limit }
      );

      const entries = await LeaderboardEntry.aggregate(pipeline);
      const data = entries.map(e => ({
        studentId: e.studentId,
        name: e.student.name,
        weekSP: e.rawSP,
        rank: e.rank,
        rankDelta: e.rankDelta
      }));

      res.json({
        success: true,
        metadata: { weekStart, weekEnd, isCurrentWeek: true },
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } else {
      // Historical week browsing: read from snapshot
      const snapshot = await LeaderboardSnapshot.findOne({
        leaderboardType: 'WEEKLY',
        weekStart
      }).populate({
        path: 'entries.studentId',
        select: 'name email'
      });

      if (!snapshot) {
        return res.json({
          success: true,
          metadata: { weekStart, weekEnd, isCurrentWeek: false },
          data: [],
          pagination: { page, limit, total: 0, pages: 0 }
        });
      }

      let entries = snapshot.entries || [];
      if (search) {
        const regex = new RegExp(search, 'i');
        entries = entries.filter(e => e.studentId && regex.test(e.studentId.name));
      }

      const total = entries.length;
      const paginatedEntries = entries.slice((page - 1) * limit, page * limit);

      const data = paginatedEntries.map(e => ({
        studentId: e.studentId ? e.studentId._id : null,
        name: e.studentId ? e.studentId.name : 'Unknown Student',
        weekSP: e.rawSP,
        rank: e.rank,
        rankDelta: 0
      }));

      res.json({
        success: true,
        metadata: { weekStart, weekEnd, isCurrentWeek: false },
        data,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. GET /api/leaderboard/skill/:category
const SKILL_DISPLAY_NAMES = {
  REACT: 'React Development',
  MERN: 'MERN Stack',
  GITHUB: 'GitHub & Version Control',
  AI: 'Artificial Intelligence',
  ORIENTATION: 'Orientation & Culture'
};

router.get('/skill/:category', async (req, res) => {
  try {
    const categoryInput = String(req.params.category).toUpperCase();
    if (!SKILL_DISPLAY_NAMES[categoryInput]) {
      return res.status(400).json({
        success: false,
        error: 'Invalid skill category. Must be one of: react, mern, github, ai, orientation'
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const pipeline = [
      { $match: { leaderboardType: 'SKILL', skillCategory: categoryInput } },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' }
    ];

    if (search) {
      pipeline.push({
        $match: { 'student.name': { $regex: search, $options: 'i' } }
      });
    }

    const countResult = await LeaderboardEntry.aggregate([...pipeline, { $count: 'total' }]);
    const total = countResult[0] ? countResult[0].total : 0;

    pipeline.push(
      { $sort: { rank: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    );

    const entries = await LeaderboardEntry.aggregate(pipeline);
    const data = entries.map(e => ({
      studentId: e.studentId,
      name: e.student.name,
      skillSP: e.rawSP,
      rank: e.rank,
      rankDelta: e.rankDelta
    }));

    res.json({
      success: true,
      metadata: {
        categoryKey: categoryInput,
        categoryDisplayName: SKILL_DISPLAY_NAMES[categoryInput]
      },
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. GET /api/leaderboard/cohort
router.get('/cohort', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 50);
    const search = req.query.search ? String(req.query.search).trim() : '';

    const pipeline = [
      { $match: { leaderboardType: 'COHORT_NORMALIZED' } },
      {
        $lookup: {
          from: 'students',
          localField: 'studentId',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: '$student' }
    ];

    if (search) {
      pipeline.push({
        $match: { 'student.name': { $regex: search, $options: 'i' } }
      });
    }

    const countResult = await LeaderboardEntry.aggregate([...pipeline, { $count: 'total' }]);
    const total = countResult[0] ? countResult[0].total : 0;

    pipeline.push(
      { $sort: { rank: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    );

    const entries = await LeaderboardEntry.aggregate(pipeline);
    const now = new Date();

    const data = entries.map(e => {
      const joinDate = e.student.internshipStartDate ? new Date(e.student.internshipStartDate) : now;
      const msActive = now.getTime() - joinDate.getTime();
      const daysActive = Math.max(1, Math.round(msActive / (1000 * 60 * 60 * 24)));

      return {
        studentId: e.studentId,
        name: e.student.name,
        rawSP: e.rawSP,
        normalizedScore: e.normalizedScore,
        rank: e.rank,
        rankDelta: e.rankDelta,
        daysActive,
        joinDate
      };
    });

    res.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 5. GET /api/leaderboard/student/:studentId
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid Student ID' });
    }

    const entries = await LeaderboardEntry.find({ studentId }).lean();

    const global = entries.find(e => e.leaderboardType === 'GLOBAL') || null;
    const weekly = entries.find(e => e.leaderboardType === 'WEEKLY') || null;
    const cohort = entries.find(e => e.leaderboardType === 'COHORT_NORMALIZED') || null;
    
    const skills = {};
    entries.filter(e => e.leaderboardType === 'SKILL').forEach(e => {
      skills[e.skillCategory] = {
        skillSP: e.rawSP,
        rank: e.rank,
        rankDelta: e.rankDelta
      };
    });

    res.json({
      success: true,
      data: {
        studentId,
        global: global ? { rawSP: global.rawSP, rank: global.rank, rankDelta: global.rankDelta } : null,
        weekly: weekly ? { weeklySP: weekly.rawSP, rank: weekly.rank, rankDelta: weekly.rankDelta } : null,
        cohort: cohort ? { rawSP: cohort.rawSP, normalizedScore: cohort.normalizedScore, rank: cohort.rank, rankDelta: cohort.rankDelta } : null,
        skills
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 6. GET /api/leaderboard/weekly/archive
router.get('/weekly/archive', async (req, res) => {
  try {
    const { weekStart } = req.query;
    if (!weekStart) {
      return res.status(400).json({ success: false, error: 'weekStart query parameter is required' });
    }

    const parsed = Date.parse(weekStart);
    if (isNaN(parsed)) {
      return res.status(400).json({ success: false, error: 'weekStart must be a valid ISO date' });
    }

    const parsedDate = new Date(parsed);
    const snapshot = await LeaderboardSnapshot.findOne({
      leaderboardType: 'WEEKLY',
      weekStart: parsedDate
    }).populate({
      path: 'entries.studentId',
      select: 'name email'
    });

    if (!snapshot) {
      return res.status(404).json({ success: false, error: 'No snapshot found for the specified weekStart date' });
    }

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 7. POST /api/leaderboard/recalculate (admin only)
router.post('/recalculate', adminGuard, async (req, res) => {
  try {
    const now = Date.now();
    // 5 minutes rate limiting
    if (now - lastRecalculatedAt < 5 * 60 * 1000) {
      const remainingSeconds = Math.ceil((5 * 60 * 1000 - (now - lastRecalculatedAt)) / 1000);
      return res.status(429).json({
        success: false,
        error: `Recalculation is rate-limited. Please try again in ${remainingSeconds} seconds.`
      });
    }

    lastRecalculatedAt = now;
    const summary = await calculateAllLeaderboards();

    res.json({
      success: true,
      message: 'Recalculation of all leaderboards completed successfully',
      summary
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
