import mongoose from 'mongoose';
import { MONGO_URI, SESSION_LABELS } from '../config.js';
import Student from '../models/Student.js';
import User from '../models/User.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import Session from '../models/Session.js';
import SessionEvent from '../models/SessionEvent.js';

async function run() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);

  console.log('Clearing existing collections...');
  await Promise.all([
    Student.deleteMany({}),
    User.deleteMany({}),
    SPTransaction.deleteMany({}),
    AttendanceRecord.deleteMany({}),
    PollRecord.deleteMany({}),
    Session.deleteMany({}),
    SessionEvent.deleteMany({})
  ]);

  console.log('Seeding admin user...');
  const adminUser = await User.create({
    email: 'dled@iitrpr.ac.in',
    name: 'Admin User',
    passwordHash: 'vled-local-admin', // plaintext or simple token
    role: 'admin'
  });

  console.log('Seeding sessions...');
  const sessionsData = [
    { label: '15 May Morning', date: new Date('2026-05-15T09:00:00Z'), endDateTime: new Date('2026-05-15T12:00:00Z'), totalMinutes: 180 },
    { label: '15 May Evening', date: new Date('2026-05-15T15:00:00Z'), endDateTime: new Date('2026-05-15T18:00:00Z'), totalMinutes: 180 },
    { label: '16 May Morning', date: new Date('2026-05-16T09:00:00Z'), endDateTime: new Date('2026-05-16T12:00:00Z'), totalMinutes: 180 },
    { label: '16 May Evening', date: new Date('2026-05-16T15:00:00Z'), endDateTime: new Date('2026-05-16T18:00:00Z'), totalMinutes: 180 }
  ];
  await Session.insertMany(sessionsData);

  console.log('Seeding students...');
  const now = new Date();
  const startDate = new Date('2026-05-10T00:00:00Z');

  const alice = await Student.create({
    name: 'Alice Smith',
    email: 'alice@example.com',
    alternateEmail: 'alice.alt@example.com',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 350,
    highestSpEver: 350,
    level: 3,
    trophyLeague: 'Gold I',
    legendBadgeUnlocked: true,
    leaderboardGroup: 'Group A'
  });

  const bob = await Student.create({
    name: 'Bob Johnson',
    email: 'bob@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 180,
    highestSpEver: 180,
    level: 2,
    trophyLeague: 'Silver II',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group A'
  });

  const charlie = await Student.create({
    name: 'Charlie Brown',
    email: 'charlie@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 40,
    highestSpEver: 100,
    level: 1,
    trophyLeague: 'Bronze II',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group B'
  });

  const david = await Student.create({
    name: 'David Miller',
    email: 'david@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 65,
    highestSpEver: 100,
    level: 1,
    trophyLeague: 'Bronze I',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group B'
  });

  const eve = await Student.create({
    name: 'Eve Davis',
    email: 'eve@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 220,
    highestSpEver: 220,
    level: 2,
    trophyLeague: 'Bronze I',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group A'
  });

  const frank = await Student.create({
    name: 'Frank Wilson',
    email: 'frank@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 150,
    highestSpEver: 150,
    level: 1,
    trophyLeague: 'Bronze II',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group B'
  });

  const grace = await Student.create({
    name: 'Grace Taylor',
    email: 'grace@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 280,
    highestSpEver: 280,
    level: 2,
    trophyLeague: 'Bronze I',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group A'
  });

  const hank = await Student.create({
    name: 'Hank Thomas',
    email: 'hank@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 95,
    highestSpEver: 100,
    level: 1,
    trophyLeague: 'Bronze III',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group B'
  });

  const ivy = await Student.create({
    name: 'Ivy Moore',
    email: 'ivy@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 310,
    highestSpEver: 310,
    level: 3,
    trophyLeague: 'Silver III',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group A'
  });

  const jack = await Student.create({
    name: 'Jack Anderson',
    email: 'jack@example.com',
    alternateEmail: '',
    internshipStartDate: startDate,
    status: 'active',
    totalSp: 120,
    highestSpEver: 120,
    level: 1,
    trophyLeague: 'Bronze II',
    legendBadgeUnlocked: false,
    leaderboardGroup: 'Group B'
  });

  console.log('Seeding attendance & transactions...');
  const students = [alice, bob, charlie, david, eve, frank, grace, hank, ivy, jack];

  // Helper to add SP Transaction
  const addTx = async (student, category, delta, reason, label, daysAgo) => {
    const txDate = new Date();
    txDate.setDate(txDate.getDate() - daysAgo);
    return await SPTransaction.create({
      email: student.email,
      studentId: student._id,
      category,
      sessionLabel: label || '',
      deltaValue: delta,
      appliedDelta: delta,
      balanceAfter: student.totalSp,
      reason,
      dateTime: txDate
    });
  };

  // Seed SP Bank Transactions
  await addTx(alice, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(alice, 'attendance', 150, 'Attended S1, S2, S3, S4 (On-time)', '15 May Morning', 5);
  await addTx(alice, 'poll', 100, 'All polls answered correctly', '15 May Evening', 4);

  await addTx(bob, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(bob, 'attendance', 80, 'Attended S1, S2', '15 May Morning', 5);

  await addTx(charlie, 'initial', 100, 'Initial Onboarding SP', '', 10);
  charlie.totalSp -= 60;
  await charlie.save();
  await addTx(charlie, 'manual', -60, 'Low engagement penalty by admin', '', 3);

  await addTx(david, 'initial', 100, 'Initial Onboarding SP', '', 10);
  david.totalSp -= 35;
  await david.save();
  await addTx(david, 'manual', -35, 'Missed mandatory tasks penalty', '', 6);

  await addTx(eve, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(eve, 'attendance', 80, 'Attended S1, S2, S3', '15 May Morning', 5);
  await addTx(eve, 'poll', 40, 'Polls answered correctly', '15 May Evening', 4);

  await addTx(frank, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(frank, 'attendance', 30, 'Attended S1', '15 May Morning', 5);
  await addTx(frank, 'poll', 20, 'Polls answered correctly', '15 May Evening', 4);

  await addTx(grace, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(grace, 'attendance', 120, 'Attended S1, S2, S3', '15 May Morning', 5);
  await addTx(grace, 'poll', 60, 'Polls answered correctly', '15 May Evening', 4);

  await addTx(hank, 'initial', 100, 'Initial Onboarding SP', '', 10);
  hank.totalSp -= 5;
  await hank.save();
  await addTx(hank, 'manual', -5, 'Slight delay penalty', '', 3);

  await addTx(ivy, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(ivy, 'attendance', 150, 'Attended S1, S2, S3, S4 (On-time)', '15 May Morning', 5);
  await addTx(ivy, 'poll', 60, 'Polls answered correctly', '15 May Evening', 4);

  await addTx(jack, 'initial', 100, 'Initial Onboarding SP', '', 10);
  await addTx(jack, 'attendance', 20, 'Attended S1', '15 May Morning', 5);

  // Seed Attendance Records
  // S1, S2, S3, S4
  const sessions = ['15 May Morning', '15 May Evening', '16 May Morning', '16 May Evening'];
  
  // Alice attended all fully
  for (const s of sessions) {
    await AttendanceRecord.create({
      email: alice.email,
      studentId: alice._id,
      sessionLabel: s,
      attendedMinutes: 160,
      totalSessionMinutes: 180,
      attendancePercentage: 88,
      qualified: true
    });
  }

  // Bob qualified for 3
  for (let i = 0; i < 3; i++) {
    await AttendanceRecord.create({
      email: bob.email,
      studentId: bob._id,
      sessionLabel: sessions[i],
      attendedMinutes: 150,
      totalSessionMinutes: 180,
      attendancePercentage: 83,
      qualified: true
    });
  }
  await AttendanceRecord.create({
    email: bob.email,
    studentId: bob._id,
    sessionLabel: sessions[3],
    attendedMinutes: 0,
    totalSessionMinutes: 180,
    attendancePercentage: 0,
    qualified: false
  });

  // Charlie missed all (low attendance & consecutive missed sessions)
  for (const s of sessions) {
    await AttendanceRecord.create({
      email: charlie.email,
      studentId: charlie._id,
      sessionLabel: s,
      attendedMinutes: 10,
      totalSessionMinutes: 180,
      attendancePercentage: 5,
      qualified: false
    });
  }

  // David attended S1, missed S2, S3, S4 (consecutive missed last 3)
  await AttendanceRecord.create({
    email: david.email,
    studentId: david._id,
    sessionLabel: sessions[0],
    attendedMinutes: 160,
    totalSessionMinutes: 180,
    attendancePercentage: 88,
    qualified: true
  });
  for (let i = 1; i < 4; i++) {
    await AttendanceRecord.create({
      email: david.email,
      studentId: david._id,
      sessionLabel: sessions[i],
      attendedMinutes: 0,
      totalSessionMinutes: 180,
      attendancePercentage: 0,
      qualified: false
    });
  }

  // Eve qualified for 3
  for (let i = 0; i < 3; i++) {
    await AttendanceRecord.create({
      email: eve.email,
      studentId: eve._id,
      sessionLabel: sessions[i],
      attendedMinutes: 155,
      totalSessionMinutes: 180,
      attendancePercentage: 86,
      qualified: true
    });
  }
  await AttendanceRecord.create({
    email: eve.email,
    studentId: eve._id,
    sessionLabel: sessions[3],
    attendedMinutes: 0,
    totalSessionMinutes: 180,
    attendancePercentage: 0,
    qualified: false
  });

  // Frank qualified for 1, missed 3
  await AttendanceRecord.create({
    email: frank.email,
    studentId: frank._id,
    sessionLabel: sessions[0],
    attendedMinutes: 140,
    totalSessionMinutes: 180,
    attendancePercentage: 77,
    qualified: true
  });
  for (let i = 1; i < 4; i++) {
    await AttendanceRecord.create({
      email: frank.email,
      studentId: frank._id,
      sessionLabel: sessions[i],
      attendedMinutes: 20,
      totalSessionMinutes: 180,
      attendancePercentage: 11,
      qualified: false
    });
  }

  // Grace qualified for 3
  for (let i = 0; i < 3; i++) {
    await AttendanceRecord.create({
      email: grace.email,
      studentId: grace._id,
      sessionLabel: sessions[i],
      attendedMinutes: 165,
      totalSessionMinutes: 180,
      attendancePercentage: 91,
      qualified: true
    });
  }
  await AttendanceRecord.create({
    email: grace.email,
    studentId: grace._id,
    sessionLabel: sessions[3],
    attendedMinutes: 10,
    totalSessionMinutes: 180,
    attendancePercentage: 5,
    qualified: false
  });

  // Hank missed all
  for (const s of sessions) {
    await AttendanceRecord.create({
      email: hank.email,
      studentId: hank._id,
      sessionLabel: s,
      attendedMinutes: 5,
      totalSessionMinutes: 180,
      attendancePercentage: 2,
      qualified: false
    });
  }

  // Ivy qualified for 4
  for (const s of sessions) {
    await AttendanceRecord.create({
      email: ivy.email,
      studentId: ivy._id,
      sessionLabel: s,
      attendedMinutes: 170,
      totalSessionMinutes: 180,
      attendancePercentage: 94,
      qualified: true
    });
  }

  // Jack qualified for 1
  await AttendanceRecord.create({
    email: jack.email,
    studentId: jack._id,
    sessionLabel: sessions[0],
    attendedMinutes: 150,
    totalSessionMinutes: 180,
    attendancePercentage: 83,
    qualified: true
  });
  for (let i = 1; i < 4; i++) {
    await AttendanceRecord.create({
      email: jack.email,
      studentId: jack._id,
      sessionLabel: sessions[i],
      attendedMinutes: 0,
      totalSessionMinutes: 180,
      attendancePercentage: 0,
      qualified: false
    });
  }

  // Seed PollRecords
  for (const s of sessions) {
    await PollRecord.create({
      email: alice.email,
      studentId: alice._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 5,
      missedQuestions: 0
    });
    await PollRecord.create({
      email: bob.email,
      studentId: bob._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 4,
      missedQuestions: 1
    });
    await PollRecord.create({
      email: eve.email,
      studentId: eve._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 4,
      missedQuestions: 1
    });
    await PollRecord.create({
      email: frank.email,
      studentId: frank._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 3,
      missedQuestions: 2
    });
    await PollRecord.create({
      email: grace.email,
      studentId: grace._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 5,
      missedQuestions: 0
    });
    await PollRecord.create({
      email: ivy.email,
      studentId: ivy._id,
      sessionLabel: s,
      totalQuestions: 5,
      attemptedQuestions: 5,
      missedQuestions: 0
    });
  }

  // Seed live session events (some clicks)
  await SessionEvent.create({
    email: alice.email,
    name: alice.name,
    event: 'page_view',
    page: 'record',
    recordViewed: alice.email
  });
  await SessionEvent.create({
    email: bob.email,
    name: bob.name,
    event: 'page_view',
    page: 'intro'
  });
  await SessionEvent.create({
    email: eve.email,
    name: eve.name,
    event: 'page_view',
    page: 'intro'
  });
  await SessionEvent.create({
    email: grace.email,
    name: grace.name,
    event: 'page_view',
    page: 'record',
    recordViewed: grace.email
  });

  console.log('Database seeded successfully!');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Seeding error:', err);
  await mongoose.disconnect();
  process.exit(1);
});
