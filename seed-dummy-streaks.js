import mongoose from 'mongoose';
import Student from './server/models/Student.js';
import SPTransaction from './server/models/SPTransaction.js';
import AttendanceRecord from './server/models/AttendanceRecord.js';
import Session from './server/models/Session.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017/spurti-dummy-streaks';

async function seed() {
  console.log("Connecting to dummy streaks database...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  console.log("Cleaning up old dummy data...");
  await Student.deleteMany({});
  await SPTransaction.deleteMany({});
  await AttendanceRecord.deleteMany({});
  await Session.deleteMany({});

  console.log("Creating dummy sessions...");
  await Session.create([
    { label: '15 May Morning', totalMinutes: 100, date: new Date('2026-05-15'), endDateTime: new Date('2026-05-15T12:00:00Z') },
    { label: '15 May Evening', totalMinutes: 100, date: new Date('2026-05-15'), endDateTime: new Date('2026-05-15T18:00:00Z') },
    { label: '16 May Morning', totalMinutes: 100, date: new Date('2026-05-16'), endDateTime: new Date('2026-05-16T12:00:00Z') },
    { label: '16 May Evening', totalMinutes: 100, date: new Date('2026-05-16'), endDateTime: new Date('2026-05-16T18:00:00Z') },
    { label: '17 May Evening', totalMinutes: 100, date: new Date('2026-05-17'), endDateTime: new Date('2026-05-17T18:00:00Z') },
    { label: '18 May Morning', totalMinutes: 100, date: new Date('2026-05-18'), endDateTime: new Date('2026-05-18T12:00:00Z') }
  ]);

  console.log("Creating dummy students...");
  const swati = await Student.create({
    name: 'Swati Saha',
    email: 'swati@test-streaks.com',
    status: 'active',
    totalSp: 220,
    highestSpEver: 220,
    streakFreezesAvailable: 2,
    internshipStartDate: new Date('2026-05-15')
  });

  const kabir = await Student.create({
    name: 'Kabir Dev',
    email: 'kabir@test-streaks.com',
    status: 'active',
    totalSp: 45,
    highestSpEver: 45,
    streakFreezesAvailable: 1,
    internshipStartDate: new Date('2026-05-15')
  });

  console.log("Adding SP transactions...");
  await SPTransaction.create([
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'initial',
      deltaValue: 100,
      appliedDelta: 100,
      balanceAfter: 100,
      reason: 'Welcome bonus',
      dateTime: new Date('2026-05-14T12:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 120,
      sessionLabel: '15 May Morning',
      reason: 'Attended session',
      dateTime: new Date('2026-05-15T12:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 140,
      sessionLabel: '15 May Evening',
      reason: 'Attended session',
      dateTime: new Date('2026-05-15T18:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 160,
      sessionLabel: '16 May Morning',
      reason: 'Attended session',
      dateTime: new Date('2026-05-16T12:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 180,
      sessionLabel: '16 May Evening',
      reason: 'Attended session',
      dateTime: new Date('2026-05-16T18:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 200,
      sessionLabel: '17 May Evening',
      reason: 'Attended session',
      dateTime: new Date('2026-05-17T18:00:00Z')
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 220,
      sessionLabel: '18 May Morning',
      reason: 'Attended session',
      dateTime: new Date('2026-05-18T12:00:00Z')
    },
    {
      email: 'kabir@test-streaks.com',
      studentId: kabir._id,
      category: 'initial',
      deltaValue: 45,
      appliedDelta: 45,
      balanceAfter: 45,
      reason: 'Welcome bonus',
      dateTime: new Date()
    }
  ]);

  console.log("Adding attendance records...");
  // Swati: 6/6 qualified (active streak of 6, earns 1 perfect week spin!)
  await AttendanceRecord.create([
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '15 May Morning',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '15 May Evening',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '16 May Morning',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '16 May Evening',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '17 May Evening',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'swati@test-streaks.com',
      studentId: swati._id,
      sessionLabel: '18 May Morning',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    }
  ]);

  // Kabir: missed the 16 May Evening session (streak broken, but has 1 freeze to protect it)
  await AttendanceRecord.create([
    {
      email: 'kabir@test-streaks.com',
      studentId: kabir._id,
      sessionLabel: '15 May Morning',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'kabir@test-streaks.com',
      studentId: kabir._id,
      sessionLabel: '15 May Evening',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'kabir@test-streaks.com',
      studentId: kabir._id,
      sessionLabel: '16 May Morning',
      attendedMinutes: 100,
      totalSessionMinutes: 100,
      attendancePercentage: 100,
      qualified: true
    },
    {
      email: 'kabir@test-streaks.com',
      studentId: kabir._id,
      sessionLabel: '16 May Evening',
      attendedMinutes: 0,
      totalSessionMinutes: 100,
      attendancePercentage: 0,
      qualified: false
    }
  ]);

  console.log("\n🎉 Streaks database seeded successfully!");
  console.log("--------------------------------------------------");
  console.log("Swati (swati@test-streaks.com): STREAK ACTIVE (6 sessions, 2 freezes, 1 SPIN AVAILABLE)");
  console.log("Kabir (kabir@test-streaks.com): STREAK BROKEN (at 16 May Evening, 1 freeze available to save it)");
  console.log("--------------------------------------------------\n");
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
