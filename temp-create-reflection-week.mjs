import mongoose from 'mongoose';
import { MONGO_URI } from './server/config.js';
import ReflectionWeek from './server/models/ReflectionWeek.js';

const now = new Date();
const payload = {
  weekLabel: 'reflection-mvp-test-3',
  status: 'active',
  submissionStart: new Date(now.getTime() - 5 * 60 * 1000),
  submissionEnd: new Date(now.getTime() + 3 * 60 * 1000),
  votingStart: new Date(now.getTime() + 4 * 60 * 1000),
  votingEnd: new Date(now.getTime() + 5 * 60 * 1000),
  finalizedAt: new Date(now.getTime() + 1 * 60 * 1000)
};

async function main() {
  await mongoose.connect(MONGO_URI);

  const existing = await ReflectionWeek.findOne({ weekLabel: payload.weekLabel }).lean();
  const doc = existing
    ? await ReflectionWeek.findOneAndUpdate(
        { weekLabel: payload.weekLabel },
        { $set: payload },
        { new: true, runValidators: true }
      ).lean()
    : await ReflectionWeek.create(payload);

  console.log(JSON.stringify({
    _id: String(doc._id),
    weekLabel: doc.weekLabel,
    submissionStart: doc.submissionStart,
    submissionEnd: doc.submissionEnd,
    votingStart: doc.votingStart,
    votingEnd: doc.votingEnd,
    status: doc.status
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed to create reflection week:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
