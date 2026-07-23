// Seed sample proposed challenges for the Upvote Challenge system.
// Idempotent — skips if challenges already exist.
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Challenge from '../models/Challenge.js';

const SAMPLE_CHALLENGES = [
  {
    title: 'Perfect Attendance Week',
    description: 'Attend every session this week without missing a single one. Perfect attendance earns you the reward!',
    type: 'attendance',
    rewardMultiplier: 3,
    votingStartDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),    // tomorrow
    votingEndDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),      // 7 days voting
  },
  {
    title: 'Poll Master',
    description: 'Attempt every single poll question for the week. Show your engagement by answering all polls completely.',
    type: 'poll_participation',
    rewardMultiplier: 2,
    votingStartDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    votingEndDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  },
  {
    title: 'Engagement Champion',
    description: 'Maintain perfect attendance throughout the week to qualify as an Engagement Champion.',
    type: 'attendance',
    rewardMultiplier: 4,
    votingStartDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    votingEndDate: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
  }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const existing = await Challenge.countDocuments();
  if (existing > 0) {
    console.log(`Found ${existing} existing challenges — skipping seed.`);
    await mongoose.disconnect();
    return;
  }

  await Challenge.insertMany(SAMPLE_CHALLENGES);
  console.log(`Inserted ${SAMPLE_CHALLENGES.length} sample challenges.`);
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
