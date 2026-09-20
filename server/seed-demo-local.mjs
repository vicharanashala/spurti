// Seeds a throwaway local DB so the Achievements tab can be looked at.
// Never point this at the real database — it wipes the collections it touches.
import mongoose from 'mongoose';
import Student from './models/Student.js';
import Achievement, { newVerifyId } from './models/Achievement.js';
import AttendanceRecord from './models/AttendanceRecord.js';

const URI = process.env.MONGO_URI;
if (!/demo/.test(URI || '')) { console.error('refusing: MONGO_URI must be a *demo* db'); process.exit(1); }
await mongoose.connect(URI);

await Promise.all([Student.deleteMany({}), Achievement.deleteMany({}), AttendanceRecord.deleteMany({})]);

const s = await Student.create({
  name: 'Priya Sharma', email: 'priya.demo@example.com', status: 'active',
  totalSp: 1240, highestSpEver: 1240, onboardingDate: new Date('2026-05-15T03:30:00Z'), internshipStartDate: new Date('2026-05-15T03:30:00Z'),
  leaderboardGroup: '2026-05-15_to_2026-05-31'
});
await AttendanceRecord.create({ email: s.email, sessionLabel: 'demo', attendedMinutes: 2940, totalSessionMinutes: 3600, qualified: true });

const sid = String(s._id);
const rows = [
  ['rank:poll:week:2026-08-03:1', 'rank', 'poll', 1, '🥇', 'Poll Champion', 'Week of Aug 3–9', '240 SP', '2026-08-09'],
  ['rank:poll:week:2026-07-27:2', 'rank', 'poll', 2, '🥈', 'Poll Champion', 'Week of Jul 27 – Aug 2', '190 SP', '2026-08-02'],
  ['rank:poll:week:2026-07-20:1', 'rank', 'poll', 1, '🥇', 'Poll Champion', 'Week of Jul 20–26', '230 SP', '2026-07-26'],
  ['rank:total:all:all:3',        'rank', 'total', 3, '🥉', 'Cohort Champion', 'All-time', '1,240 SP', '2026-08-08'],
  ['rank:spa:week:2026-08-03:2',  'rank', 'spa', 2, '🥈', 'Peer-Learning Champion', 'Week of Aug 3–9', '48 SP', '2026-08-09'],
  ['rank:attendance:all:all:1',   'rank', 'attendance', 1, '🥇', 'Attendance Ace', 'All-time', '410 SP', '2026-07-30'],
  ['ms:level:10', 'milestone', '', 0, '⭐', 'Reached Level 10', 'All-time', '1,000+ Spurti Points', '2026-07-19']
];
await Achievement.insertMany(rows.map(([achId, kind, board, place, icon, title, period, detail, at]) => ({
  studentId: sid, achId, kind, board, place, icon, title, period, detail,
  verifyId: newVerifyId(), earnedAt: new Date(at)
})));

const all = await Achievement.find({ studentId: sid }).lean();
console.log('seeded student:', s.email);
console.log('achievements:', all.length);
console.log('a verify code to try:', all[0].verifyId);
await mongoose.disconnect();
