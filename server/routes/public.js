import express from 'express';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import SPTransaction from '../models/SPTransaction.js';

const router = express.Router();

let cache = { data: null, cachedAt: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

router.get('/stats', async (_req, res) => {
  try {
    if (cache.data && Date.now() - cache.cachedAt < CACHE_TTL) {
      return res.json(cache.data);
    }

    const [totalStudents, totalSessions, spAgg] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      Session.countDocuments(),
      SPTransaction.aggregate([
        { $match: { appliedDelta: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$appliedDelta' } } }
      ])
    ]);

    const data = {
      totalStudents,
      totalSessions,
      totalSpAwarded: spAgg.length ? spAgg[0].total : 0,
      activeCohort: 'Summership 2026'
    };

    cache = { data, cachedAt: Date.now() };
    res.json(data);
  } catch (err) {
    console.error('public/stats error:', err?.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
