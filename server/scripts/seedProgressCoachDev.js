import mongoose from 'mongoose';

import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import VibeProgress from '../models/VibeProgress.js';
import SpaProgress from '../models/SpaProgress.js';
import JourneyPlan from '../models/JourneyPlan.js';
import { ActPullRequest, ActPrReview } from '../models/ActMirrors.js';
import { localDevAuthEmail } from '../services/localDevAuth.js';

const email = localDevAuthEmail();

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function seed() {
  if (!email) {
    throw new Error('Refusing to seed: set NODE_ENV=development and LOCAL_DEV_AUTH_EMAIL first.');
  }
  if (!email.endsWith('@spurti.local')) {
    throw new Error('Refusing to seed: LOCAL_DEV_AUTH_EMAIL must use the fictional @spurti.local domain.');
  }

  await mongoose.connect(MONGO_URI);
  try {
    if (mongoose.connection.name !== 'spurti_dev') {
      throw new Error('Refusing to seed: MONGO_URI must point to the dedicated spurti_dev database.');
    }

    // This reset is intentionally limited to the one fictional account, so the
    // command remains repeatable without touching any other local records.
    await Promise.all([
      AttendanceRecord.deleteMany({ email }),
      PollRecord.deleteMany({ email }),
      SPTransaction.deleteMany({ email }),
      VibeProgress.deleteMany({ email }),
      SpaProgress.deleteMany({ email }),
      JourneyPlan.deleteMany({ email }),
      ActPullRequest.deleteMany({ email }),
      ActPrReview.deleteMany({ email }),
      Student.deleteMany({ email })
    ]);

    const today = startOfToday();
    const student = await Student.create({
      name: 'Dev Student',
      email,
      internshipStartDate: addDays(today, -30),
      internshipEndDate: addDays(today, 30),
      status: 'active',
      totalSp: 420,
      highestSpEver: 420
    });

    await AttendanceRecord.create({
      email,
      studentId: student._id,
      sessionLabel: 'Development standup fixture',
      attendedMinutes: 3000,
      totalSessionMinutes: 3600,
      attendancePercentage: 83,
      qualified: true
    });
    await PollRecord.create({
      email,
      studentId: student._id,
      sessionLabel: 'Development standup fixture',
      totalQuestions: 40,
      attemptedQuestions: 33,
      missedQuestions: 7
    });
    await SPTransaction.insertMany([
      {
        email, studentId: student._id, category: 'initial', sessionLabel: 'Development fixture',
        deltaValue: 100, appliedDelta: 100, balanceAfter: 100,
        reason: 'Initial fictional development balance', dateTime: addDays(today, -30)
      },
      {
        email, studentId: student._id, category: 'attendance', sessionLabel: 'Development standup fixture',
        deltaValue: 250, appliedDelta: 250, balanceAfter: 350,
        reason: 'Fictional standup attendance', dateTime: addDays(today, -1)
      },
      {
        email, studentId: student._id, category: 'poll', sessionLabel: 'Development standup fixture',
        deltaValue: 40, appliedDelta: 40, balanceAfter: 390,
        reason: 'Fictional poll participation', dateTime: addDays(today, -1)
      },
      {
        email, studentId: student._id, category: 'spa', sessionLabel: 'Development SPA fixture',
        deltaValue: 30, appliedDelta: 30, balanceAfter: 420,
        reason: 'Fictional SPA progress', dateTime: today
      }
    ]);
    await VibeProgress.insertMany([
      { email, course: 'onboarding', pct: 100, weekHours: 2, priorCompleted: false },
      { email, course: 'ai', pct: 35, weekHours: 1, priorCompleted: false },
      { email, course: 'mern', pct: 0, weekHours: 0, priorCompleted: false }
    ]);
    await SpaProgress.create({
      email,
      learnValidated: 12,
      teachValidated: 3,
      learnCredited: 12,
      teachCredited: 3
    });
    await JourneyPlan.create({
      email,
      standupBy: addDays(today, 7),
      atSet: {
        standup: { remainingMin: 720, at: addDays(today, -7) }
      }
    });

    console.log('Seeded fictional Progress Coach fixture into spurti_dev.');
  } finally {
    await mongoose.disconnect();
  }
}

seed().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
