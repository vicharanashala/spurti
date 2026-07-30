// Recompute the cohort + onboarding-group average SP trajectories and store the
// 'latest' TrajectorySnapshot. Run periodically (wire into the analytics cron in prod).
//   node server/scripts/buildTrajectories.js
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import { computeAndStoreTrajectories } from '../services/trajectory.js';

async function main() {
  await mongoose.connect(MONGO_URI);
  const r = await computeAndStoreTrajectories();
  console.log('trajectory snapshot rebuilt:', r);
  await mongoose.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
