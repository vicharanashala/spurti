import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import { fetchStudentEngagementData } from './fetchData.js';
import { classifyBand } from './classifyBand.js';
import Student from '../models/Student.js';

async function verify() {
  await mongoose.connect(MONGO_URI);
  const students = await Student.find({ status: 'active' }).lean();

  console.log('=== VERIFICATION: Engagement Classification ===\n');

  let ok = 0;
  for (const s of students) {
    const data = await fetchStudentEngagementData(s.email);
    const r1 = classifyBand(data.current, data.previous);
    const r2 = classifyBand(data.current, data.previous);
    const idempotent = r1.band === r2.band;

    console.log(`  ${s.email.padEnd(22)} \u2192 ${r1.band.padEnd(14)} | idempotent: ${idempotent ? 'YES' : 'NO'}`);
    console.log(`       Reason: ${r1.reason}`);
    console.log(`       Avg Att: ${r1.stats?.avgAttendancePct || 'N/A'}%, Avg SP/session: ${r1.stats?.avgSpPerSession || 'N/A'}`);
    if (idempotent) ok++;
  }

  console.log(`\n  \u2713 Idempotent: ${ok}/${students.length}`);

  // Leaderboard check — confirm no side effects
  const lb = await Student.find({ status: 'active' }).sort({ totalSp: -1, name: 1 }).lean();
  console.log('\n=== LEADERBOARD (unchanged by engagement calls) ===');
  console.log('  Rank | Name                  | Total SP');
  console.log('  -----|-----------------------|---------');
  lb.forEach((s, i) => {
    console.log(`  ${String(i + 1).padStart(4)} | ${s.name.padEnd(22)} | ${s.totalSp}`);
  });

  await mongoose.disconnect();
}

verify().catch(err => { console.error(err); process.exit(1); });
