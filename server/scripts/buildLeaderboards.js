// Recompute the cached weekly/all-time/category/cohort leaderboard boards and
// store them as LeaderboardSnapshot docs. Wire into sp-refresh (after sync-levels).
//   node server/scripts/buildLeaderboards.js
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import { computeAndStoreLeaderboards } from '../services/leaderboards.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  const r = await computeAndStoreLeaderboards();
  console.log('leaderboards rebuilt:', r);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
