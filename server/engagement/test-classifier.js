import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import { fetchStudentEngagementData } from './fetchData.js';
import { classifyBand } from './classifyBand.js';

const emails = [
  'ananya@test.com',
  'rahul@test.com',
  'priya@test.com',
  'arjun@test.com'
];

function printWindow(data) {
  for (const s of data) {
    const att = s.attendancePct !== null ? String(s.attendancePct).padStart(5) + '%' : '  N/A  ';
    const sp = String(s.spDelta).padStart(3);
    console.log(`  ${s.label.padEnd(20)}| ${att}    | ${sp}`);
  }
}

async function main() {
  await mongoose.connect(MONGO_URI);

  for (const email of emails) {
    const data = await fetchStudentEngagementData(email);
    const result = classifyBand(data.current, data.previous);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`${email}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`\nPrevious window (${data.previous.length} sessions):`);
    printWindow(data.previous);
    console.log(`\nCurrent window  (${data.current.length} sessions):`);
    printWindow(data.current);
    console.log(`\n  → Band: ${result.band}`);
    console.log(`  → Reason: ${result.reason}`);
    if (result.stats) {
      console.log(`  → Avg Attendance: ${result.stats.avgAttendancePct}%`);
      console.log(`  → Avg SP/session: ${result.stats.avgSpPerSession}`);
    }
  }

  await mongoose.disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
