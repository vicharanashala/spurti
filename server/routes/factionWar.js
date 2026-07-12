/**
 * server/routes/factionWar.js
 *
 * GET /api/faction-war
 *
 * Returns the current Faction Wars standings: weekly SP per faction,
 * member counts, top contributors, qualified rate, and the calling
 * user's faction membership.
 *
 * Auth: same resolveStudentEmail() pattern used by /me, /wrapped,
 * /weekly-leaderboard, and /ghost-race.
 *
 * Read-only — no writes, no side effects.
 */

import express from 'express';

import { resolveStudentEmail } from '../auth.js';
import { getFactionWarData } from '../services/factionData.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const email = await resolveStudentEmail(req);
    if (!email) return res.status(401).json({ error: 'Unauthorized' });

    const data = await getFactionWarData(email);
    return res.json(data);
  } catch (err) {
    console.error('[faction-war]', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;