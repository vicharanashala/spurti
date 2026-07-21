import mongoose from 'mongoose';
import { MONGO_URI } from '../server/config.js';
import Student from '../server/models/Student.js';
import LeaderboardEntry from '../server/models/LeaderboardEntry.js';

// SECTION 4 - Leaderboard Type Definitions (Configuration)
export const LEADERBOARD_TYPES_CONFIG = [
  {
    type: 'GLOBAL',
    displayName: 'Global All-Time Leaderboard',
    description: 'Ranks all active students by their total accumulated Spurti Points (SP) since the beginning of the program.',
    resetSchedule: 'Never',
    sortRule: 'rawSP DESC, internshipStartDate ASC, email ASC'
  },
  {
    type: 'WEEKLY',
    displayName: 'Weekly Leaderboard',
    description: 'Ranks students by SP earned during the current calendar week only (Monday 00:00 to Sunday 23:59 IST) to maintain high short-term engagement.',
    resetSchedule: 'Every Sunday at 23:59:59 IST / Monday 00:00:00 IST',
    sortRule: 'rawSP DESC, totalSp DESC, email ASC'
  },
  {
    type: 'SKILL',
    displayName: 'Skill-Based Leaderboard',
    description: 'Separate leaderboards per skill category (React, MERN, GitHub, AI, Orientation) allowing students to showcase specialized expertise.',
    resetSchedule: 'Never',
    sortRule: 'rawSP DESC, totalSp DESC, email ASC'
  },
  {
    type: 'COHORT_NORMALIZED',
    displayName: 'Cohort-Normalized Leaderboard',
    description: 'Adjusts rankings dynamically (total_sp / days_active) so later cohort joiners are not penalized for having fewer days to earn SP.',
    resetSchedule: 'Recalculated on demand / hourly',
    sortRule: 'normalizedScore DESC, totalSp DESC, email ASC'
  }
];

// Helper to calculate the Monday of the current calendar week in IST
function getMondayOfCurrentWeekIST() {
  const now = new Date(); // e.g. 2026-07-04T22:21:53+05:30
  // IST offset is +5:30 (19800000 ms)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istDate = new Date(utcTime + istOffset);

  const day = istDate.getDay(); // 0 is Sunday, 1 is Monday, etc.
  const diff = istDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday

  const mondayIST = new Date(utcTime + istOffset);
  mondayIST.setDate(diff);
  mondayIST.setHours(0, 0, 0, 0);

  // Return date in UTC representation of that IST moment
  return new Date(mondayIST.getTime() - istOffset);
}

// 10 Mock Student profiles with varied join dates and SP breakdown
const mockStudentData = [
  {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@spurti.edu',
    joinedDaysAgo: 1, // Normalized Leaderboard Advantage
    rawSP: 100,
    weeklySP: 50,
    skills: { REACT: 60, GITHUB: 40 }
  },
  {
    name: 'Diya Patel',
    email: 'diya.patel@spurti.edu',
    joinedDaysAgo: 30, // Raw SP Advantage but normalized penalty
    rawSP: 150,
    weeklySP: 20,
    skills: { MERN: 90, AI: 40, REACT: 20 }
  },
  {
    name: 'Kabir Mehta',
    email: 'kabir.mehta@spurti.edu',
    joinedDaysAgo: 10,
    rawSP: 120,
    weeklySP: 0, // Ranked at bottom of weekly
    skills: { GITHUB: 70, ORIENTATION: 50 }
  },
  {
    name: 'Isha Iyer',
    email: 'isha.iyer@spurti.edu',
    joinedDaysAgo: 5,
    rawSP: 100,
    weeklySP: 80, // High weekly performance
    skills: { REACT: 80, MERN: 20 }
  },
  {
    name: 'Rohan Gupta',
    email: 'rohan.gupta@spurti.edu',
    joinedDaysAgo: 15,
    rawSP: 150,
    weeklySP: 10,
    skills: { MERN: 80, GITHUB: 70 }
  },
  {
    name: 'Ananya Sen',
    email: 'ananya.sen@spurti.edu',
    joinedDaysAgo: 2,
    rawSP: 80,
    weeklySP: 40,
    skills: { AI: 80 }
  },
  {
    name: 'Aditya Rao',
    email: 'aditya.rao@spurti.edu',
    joinedDaysAgo: 20,
    rawSP: 160, // Highest overall raw SP
    weeklySP: 15,
    skills: { ORIENTATION: 100, GITHUB: 60 }
  },
  {
    name: 'Meera Nair',
    email: 'meera.nair@spurti.edu',
    joinedDaysAgo: 8,
    rawSP: 112,
    weeklySP: 0, // Tied for 0 weekly SP
    skills: { REACT: 50, GITHUB: 30, AI: 32 }
  },
  {
    name: 'Dev Kapoor',
    email: 'dev.kapoor@spurti.edu',
    joinedDaysAgo: 12,
    rawSP: 132,
    weeklySP: 30,
    skills: { MERN: 60, REACT: 40, AI: 32 }
  },
  {
    name: 'Sanya Verma',
    email: 'sanya.verma@spurti.edu',
    joinedDaysAgo: 3,
    rawSP: 90,
    weeklySP: 25,
    skills: { AI: 90 }
  }
];

async function seed() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);

  const mockEmails = mockStudentData.map(s => s.email);

  // Clean existing mock entries & students to ensure idempotency
  await Student.deleteMany({ email: { $in: mockEmails } });
  const existingStudents = await Student.find({ email: { $in: mockEmails } });
  const existingStudentIds = existingStudents.map(s => s._id);
  await LeaderboardEntry.deleteMany({ studentId: { $in: existingStudentIds } });

  console.log('Seeding mock students...');
  const studentDocs = [];
  const now = new Date();

  for (const s of mockStudentData) {
    const joinDate = new Date();
    joinDate.setDate(now.getDate() - s.joinedDaysAgo);

    const student = new Student({
      name: s.name,
      email: s.email,
      alternateEmail: s.email.replace('@', '_alt@'),
      internshipStartDate: joinDate,
      totalSp: s.rawSP,
      highestSpEver: s.rawSP,
      status: 'active'
    });
    const saved = await student.save();
    studentDocs.push({ ...s, dbStudent: saved, joinDate });
  }

  const currentMonday = getMondayOfCurrentWeekIST();
  console.log(`Current Week Start (Monday 00:00 IST equivalent): ${currentMonday.toISOString()}`);

  const allEntries = [];

  // 1. GLOBAL LEADERBOARD ENTRIES
  // Sort: rawSP DESC, internshipStartDate ASC, email ASC
  const globalSorted = [...studentDocs].sort((a, b) => {
    if (b.rawSP !== a.rawSP) return b.rawSP - a.rawSP;
    if (a.joinDate.getTime() !== b.joinDate.getTime()) return a.joinDate.getTime() - b.joinDate.getTime();
    return a.email.localeCompare(b.email);
  });

  globalSorted.forEach((item, index) => {
    const rank = index + 1;
    // Introduce varied rank deltas
    // e.g. Student 1 moved up, Student 2 moved down, Student 3 stayed same
    let rankDelta = 0;
    if (rank % 3 === 1) rankDelta = 2; // Moved up 2 spots
    else if (rank % 3 === 2) rankDelta = -1; // Moved down 1 spot
    const previousRank = rankDelta !== 0 ? rank + rankDelta : rank;

    allEntries.push({
      studentId: item.dbStudent._id,
      leaderboardType: 'GLOBAL',
      skillCategory: null,
      weekStart: null,
      rawSP: item.rawSP,
      normalizedScore: null,
      rank,
      previousRank,
      rankDelta: -rankDelta, // rankDelta = previousRank - rank (positive = moved up, negative = moved down)
      lastCalculatedAt: now
    });
  });

  // 2. WEEKLY LEADERBOARD ENTRIES
  // Sort: weeklySP DESC, totalSp DESC, email ASC
  const weeklySorted = [...studentDocs].sort((a, b) => {
    if (b.weeklySP !== a.weeklySP) return b.weeklySP - a.weeklySP;
    if (b.rawSP !== a.rawSP) return b.rawSP - a.rawSP;
    return a.email.localeCompare(b.email);
  });

  weeklySorted.forEach((item, index) => {
    const rank = index + 1;
    let rankDelta = 0;
    if (rank % 2 === 0) rankDelta = 1;
    else rankDelta = -1;
    const previousRank = rank + rankDelta;

    allEntries.push({
      studentId: item.dbStudent._id,
      leaderboardType: 'WEEKLY',
      skillCategory: null,
      weekStart: currentMonday,
      rawSP: item.weeklySP,
      normalizedScore: null,
      rank,
      previousRank,
      rankDelta: -rankDelta,
      lastCalculatedAt: now
    });
  });

  // 3. COHORT-NORMALIZED LEADERBOARD ENTRIES
  // Formula: normalizedScore = rawSP / daysActive (min 1)
  // Sort: normalizedScore DESC, totalSp DESC, email ASC
  const cohortSorted = studentDocs.map(item => {
    const daysActive = Math.max(1, Math.round((now.getTime() - item.joinDate.getTime()) / (1000 * 60 * 60 * 24)));
    const normalizedScore = Math.round((item.rawSP / daysActive) * 100) / 100;
    return { ...item, daysActive, normalizedScore };
  }).sort((a, b) => {
    if (b.normalizedScore !== a.normalizedScore) return b.normalizedScore - a.normalizedScore;
    if (b.rawSP !== a.rawSP) return b.rawSP - a.rawSP;
    return a.email.localeCompare(b.email);
  });

  cohortSorted.forEach((item, index) => {
    const rank = index + 1;
    let rankDelta = 0;
    if (rank === 1) rankDelta = 0;
    else if (rank % 2 === 0) rankDelta = 2;
    else rankDelta = -2;
    const previousRank = rank + rankDelta;

    allEntries.push({
      studentId: item.dbStudent._id,
      leaderboardType: 'COHORT_NORMALIZED',
      skillCategory: null,
      weekStart: null,
      rawSP: item.rawSP,
      normalizedScore: item.normalizedScore,
      rank,
      previousRank,
      rankDelta: -rankDelta,
      lastCalculatedAt: now
    });
  });

  // 4. SKILL-BASED LEADERBOARD ENTRIES
  // Categories: REACT, MERN, GITHUB, AI, ORIENTATION
  const categories = ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'];
  for (const cat of categories) {
    const skillSorted = studentDocs
      .filter(item => item.skills[cat] > 0)
      .map(item => ({ ...item, skillSP: item.skills[cat] }))
      .sort((a, b) => {
        if (b.skillSP !== a.skillSP) return b.skillSP - a.skillSP;
        if (b.rawSP !== a.rawSP) return b.rawSP - a.rawSP;
        return a.email.localeCompare(b.email);
      });

    skillSorted.forEach((item, index) => {
      const rank = index + 1;
      let rankDelta = index % 2 === 0 ? 1 : -1;
      if (index === 0) rankDelta = 0;
      const previousRank = rank + rankDelta;

      allEntries.push({
        studentId: item.dbStudent._id,
        leaderboardType: 'SKILL',
        skillCategory: cat,
        weekStart: null,
        rawSP: item.skillSP,
        normalizedScore: null,
        rank,
        previousRank,
        rankDelta: -rankDelta,
        lastCalculatedAt: now
      });
    });
  }

  console.log(`Inserting ${allEntries.length} LeaderboardEntry documents...`);
  await LeaderboardEntry.insertMany(allEntries);

  console.log('Seeding completed successfully!');
  await mongoose.disconnect();
}

seed().catch(async (err) => {
  console.error('Seeding failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
export { seed };
