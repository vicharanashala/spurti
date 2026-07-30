import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import SPTransaction from '../models/SPTransaction.js';

const students = [
  {
    name: 'Ananya Sharma', email: 'ananya@test.com',
    status: 'active', totalSp: 180, sessions: [
      { label: 'Day 1 (15 May)', attendancePct: 98, spDelta: 10 },
      { label: 'Day 2 (16 May)', attendancePct: 95, spDelta: 10 },
      { label: 'Day 3 (19 May)', attendancePct: 92, spDelta: 10 },
      { label: 'Day 4 (20 May)', attendancePct: 96, spDelta: 10 },
      { label: 'Day 5 (21 May)', attendancePct: 91, spDelta: 10 },
      { label: 'Day 6 (22 May)', attendancePct: 94, spDelta: 10 }
    ]
  },
  {
    name: 'Rahul Verma', email: 'rahul@test.com',
    status: 'active', totalSp: 140, sessions: [
      { label: 'Day 1 (15 May)', attendancePct: 85, spDelta: 5 },
      { label: 'Day 2 (16 May)', attendancePct: 80, spDelta: 5 },
      { label: 'Day 3 (19 May)', attendancePct: 78, spDelta: 5 },
      { label: 'Day 4 (20 May)', attendancePct: 82, spDelta: 5 },
      { label: 'Day 5 (21 May)', attendancePct: 76, spDelta: 5 },
      { label: 'Day 6 (22 May)', attendancePct: 79, spDelta: 5 }
    ]
  },
  {
    name: 'Priya Patel', email: 'priya@test.com',
    status: 'active', totalSp: 118, sessions: [
      { label: 'Day 1 (15 May)', attendancePct: 92, spDelta: 10 },
      { label: 'Day 2 (16 May)', attendancePct: 85, spDelta: 5 },
      { label: 'Day 3 (19 May)', attendancePct: 70, spDelta: 3 },
      { label: 'Day 4 (20 May)', attendancePct: 55, spDelta: 3 },
      { label: 'Day 5 (21 May)', attendancePct: 40, spDelta: 0 },
      { label: 'Day 6 (22 May)', attendancePct: 25, spDelta: 0 }
    ]
  },
  {
    name: 'Arjun Nair', email: 'arjun@test.com',
    status: 'active', totalSp: 126, sessions: [
      { label: 'Day 1 (15 May)', attendancePct: 40, spDelta: 0 },
      { label: 'Day 2 (16 May)', attendancePct: 50, spDelta: 3 },
      { label: 'Day 3 (19 May)', attendancePct: 45, spDelta: 0 },
      { label: 'Day 4 (20 May)', attendancePct: 78, spDelta: 5 },
      { label: 'Day 5 (21 May)', attendancePct: 85, spDelta: 5 },
      { label: 'Day 6 (22 May)', attendancePct: 92, spDelta: 10 }
    ]
  }
];

const sessionDefs = [
  { label: 'Day 1 (15 May)', date: new Date('2026-05-15'), endDateTime: new Date('2026-05-15T12:00Z'), totalMinutes: 120 },
  { label: 'Day 2 (16 May)', date: new Date('2026-05-16'), endDateTime: new Date('2026-05-16T12:00Z'), totalMinutes: 120 },
  { label: 'Day 3 (19 May)', date: new Date('2026-05-19'), endDateTime: new Date('2026-05-19T12:00Z'), totalMinutes: 90 },
  { label: 'Day 4 (20 May)', date: new Date('2026-05-20'), endDateTime: new Date('2026-05-20T12:00Z'), totalMinutes: 120 },
  { label: 'Day 5 (21 May)', date: new Date('2026-05-21'), endDateTime: new Date('2026-05-21T12:00Z'), totalMinutes: 80 },
  { label: 'Day 6 (22 May)', date: new Date('2026-05-22'), endDateTime: new Date('2026-05-22T12:00Z'), totalMinutes: 240 }
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  await Promise.all([
    Student.deleteMany({}),
    Session.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    SPTransaction.deleteMany({})
  ]);
  console.log('Cleared existing data');

  const sessions = await Session.insertMany(sessionDefs);
  console.log(`Inserted ${sessions.length} sessions`);

  for (const studentData of students) {
    const student = await Student.create({
      name: studentData.name,
      email: studentData.email,
      internshipStartDate: new Date('2026-05-15'),
      internshipEndDate: new Date('2026-08-15'),
      status: 'active',
      totalSp: studentData.totalSp
    });

    let balance = 100;
    await SPTransaction.create({
      email: student.email, studentId: student._id,
      category: 'initial', sessionLabel: '',
      deltaMode: 'absolute', deltaValue: 100, appliedDelta: 100,
      balanceAfter: 100, reason: 'Initial SP credit',
      dateTime: new Date('2026-05-15')
    });

    for (const sess of studentData.sessions) {
      balance += sess.spDelta;
      const attSess = sessions.find(s => s.label === sess.label);
      await AttendanceRecord.create({
        email: student.email, studentId: student._id,
        sessionLabel: sess.label,
        attendedMinutes: Math.round(sess.attendancePct / 100 * (attSess?.totalMinutes || 120)),
        totalSessionMinutes: attSess?.totalMinutes || 120,
        attendancePercentage: sess.attendancePct,
        qualified: sess.attendancePct >= 75
      });
      await SPTransaction.create({
        email: student.email, studentId: student._id,
        category: 'attendance', sessionLabel: sess.label,
        deltaMode: 'absolute', deltaValue: sess.spDelta, appliedDelta: sess.spDelta,
        balanceAfter: balance, reason: `Attendance SP for ${sess.label}`,
        dateTime: attSess?.endDateTime || new Date('2026-05-15')
      });
    }
    console.log(`  ${studentData.name.padEnd(16)} (${studentData.email})  — totalSp: ${studentData.totalSp}, sessions: ${studentData.sessions.length}`);
  }

  console.log('\nDone! 4 demo students seeded.');
  console.log('Search at http://localhost:5290 by name or email.');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
