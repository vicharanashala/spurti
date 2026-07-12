// One-shot: list all dummy students + their sessions/SP totals.
// Re-uses server's mongoose models so connection + schema match exactly.
import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';

await mongoose.connect(MONGO_URI);
console.log('connected');

const students = await Student.find({ name: /^DUMMY / }).sort({ email: 1 }).lean();
console.log(`Found ${students.length} dummy students.`);
console.log('');

const rows = students.map(s => ({
  email: s.email,
  name: s.name,
  rollOrLevel: s.rollNumber ?? s.level ?? '-',
  level: s.level ?? '-',
  totalSp: s.totalSp ?? 0,
  onboardingGroup: s.leaderboardGroupLabel ?? s.onboardingGroup ?? '-',
  sp: s.spBalance ?? s.sp ?? '-',
}));
console.table(rows);

console.log('\n--- Emails only (one per line) ---');
for (const s of students) console.log(s.email);

await mongoose.disconnect();
