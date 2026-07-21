import mongoose from 'mongoose';
import { MONGO_URI, SESSION_LABELS } from './server/config.js';
import Student from './server/models/Student.js';
import AttendanceRecord from './server/models/AttendanceRecord.js';
import SPTransaction from './server/models/SPTransaction.js';

async function run() {
  await mongoose.connect(MONGO_URI);

  const email = 'test-freeze@example.com';
  // Delete existing records for this email
  await Student.deleteMany({ email });
  await AttendanceRecord.deleteMany({ email });
  await SPTransaction.deleteMany({ email });

  // Create student
  const student = await Student.create({
    name: 'Test Freeze Student',
    email,
    alternateEmail: '',
    internshipStartDate: new Date('2026-05-15T09:00:00'),
    status: 'active',
    totalSp: 100,
    highestSpEver: 100,
    streakFreezesAvailable: 3,
    streakProtectedSessions: []
  });

  // Create 10 qualified sessions and 1 missed session
  const sessions = SESSION_LABELS.slice(0, 11); // 11 sessions
  for (let i = 0; i < sessions.length; i++) {
    const label = sessions[i];
    const qualified = i < 10; // First 10 qualified, 11th missed
    
    // Create attendance record
    await AttendanceRecord.create({
      email,
      studentId: student._id,
      sessionLabel: label,
      attendedMinutes: qualified ? 120 : 0,
      totalSessionMinutes: 120,
      attendancePercentage: qualified ? 100 : 0,
      qualified
    });

    // Create SP transaction
    await SPTransaction.create({
      email,
      studentId: student._id,
      category: 'attendance',
      sessionLabel: label,
      deltaMode: 'absolute',
      deltaValue: qualified ? 10 : -5,
      appliedDelta: qualified ? 10 : -5,
      balanceAfter: qualified ? 100 + i * 10 : 100,
      reason: qualified ? `${label}: attended` : `${label}: missed`,
      dateTime: new Date()
    });
  }

  // Update totalSp to 100
  student.totalSp = 100;
  await student.save();

  console.log('Seeded test-freeze@example.com student successfully!');
  await mongoose.disconnect();
}

run().catch(console.error);
