/**
 * remove-dummies.js
 *
 * Removes every record created by seed-dummies.js:
 *   - 20 Student docs on @spurti.test
 *   - all SPTransaction / AttendanceRecord / PollRecord tied to those emails
 *
 * SAFE — touches ONLY rows whose email is on @spurti.test (real students
 * use @vitstudent.ac.in, @gmail.com, etc., so they are untouched).
 *
 * Run with:  node remove-dummies.js
 */

import mongoose from 'mongoose';
import { MONGO_URI } from './server/config.js';

import Student          from './server/models/Student.js';
import SPTransaction    from './server/models/SPTransaction.js';
import AttendanceRecord from './server/models/AttendanceRecord.js';
import PollRecord       from './server/models/PollRecord.js';
import ChatRecord       from './server/models/ChatRecord.js';

const DUMMY_DOMAIN = '@spurti.test';
// Match any email ending in @spurti.test (case-insensitive on the local-part side too)
const filter = { email: { $regex: /@spurti\.test$/i } };

async function run() {
  await mongoose.connect(MONGO_URI);

  const studentCount    = await Student.countDocuments(filter);
  const txCount         = await SPTransaction.countDocuments(filter);
  const attCount        = await AttendanceRecord.countDocuments(filter);
  const pollCount       = await PollRecord.countDocuments(filter);
  const chatCount       = await ChatRecord.countDocuments(filter);

  console.log('─'.repeat(56));
  console.log(`About to delete (scoped to ${DUMMY_DOMAIN}):`);
  console.log(`  Students:           ${studentCount}`);
  console.log(`  SP Transactions:    ${txCount}`);
  console.log(`  Attendance Records: ${attCount}`);
  console.log(`  Poll Records:       ${pollCount}`);
  console.log(`  Chat Records:       ${chatCount}`);
  if (studentCount + txCount + attCount + pollCount + chatCount === 0) {
    console.log('Nothing to remove — DB is already clean.');
    console.log('─'.repeat(56));
    await mongoose.disconnect();
    return;
  }

  const [sR, tR, aR, pR, cR] = await Promise.all([
    Student.deleteMany(filter),
    SPTransaction.deleteMany(filter),
    AttendanceRecord.deleteMany(filter),
    PollRecord.deleteMany(filter),
    ChatRecord.deleteMany(filter),
  ]);

  console.log('Deleted:');
  console.log(`  Students:           ${sR.deletedCount}`);
  console.log(`  SP Transactions:    ${tR.deletedCount}`);
  console.log(`  Attendance Records: ${aR.deletedCount}`);
  console.log(`  Poll Records:       ${pR.deletedCount}`);
  console.log(`  Chat Records:       ${cR.deletedCount}`);
  console.log('─'.repeat(56));
  console.log('All clear. Real students untouched.');

  await mongoose.disconnect();
}

run().catch(async err => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});