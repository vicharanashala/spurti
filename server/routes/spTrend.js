import express from 'express';
import { getSpTrend } from '../services/spTrend.js';

const router = express.Router();

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

// GET /api/weekly/sp-trend?email=...
// Returns:
//   trend         : weekly SP totals from program start (max 26 weeks)
//   heatmap       : per-category (attendance / poll / discussion / challenge)
//                   per-day (Mon-Sat) totals for the current IST week
//   summary       : delta, direction, bestDay, bestCategory, weakestCell,
//                   insight, consecutiveUpWeeks
//   studentName   : student's full name
router.get('/sp-trend', async (req, res) => {
  const email = normalizeEmail(req.query.email);
  if (!email) return res.status(400).json({ error: 'email required' });
  const data = await getSpTrend(email);
  if (!data) return res.json({ trend: [], heatmap: [], summary: null });
  res.json(data);
});

export default router;