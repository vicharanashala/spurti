import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/spurti_dev';

const SPTransactionSchema = new mongoose.Schema({
  email: String,
  category: String,
  sessionLabel: String,
  deltaMode: String,
  appliedDelta: Number,
  balanceAfter: Number
}, { strict: false });

const SPTransaction = mongoose.model('SPTransaction', SPTransactionSchema);

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const result = await SPTransaction.updateMany(
    { deltaMode: 'percent' },
    { $set: { deltaMode: 'percentage' } }
  );

  console.log(`Matched: ${result.matchedCount}`);
  console.log(`Modified: ${result.modifiedCount}`);

  const remaining = await SPTransaction.countDocuments({ deltaMode: 'percent' });
  console.log(`Remaining with deltaMode='percent': ${remaining}`);

  await mongoose.disconnect();
  console.log('Done');
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});