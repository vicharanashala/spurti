import mongoose from 'mongoose';
import Student from './server/models/Student.js';
import SPTransaction from './server/models/SPTransaction.js';
import Season from './server/models/Season.js';
import StudentSeasonData from './server/models/StudentSeasonData.js';

const MONGO_URI = 'mongodb://127.0.0.1:27017/spurti-dummy';

async function seed() {
  console.log("Connecting to dummy database...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected.");

  console.log("Cleaning up old dummy data...");
  await Student.deleteMany({});
  await SPTransaction.deleteMany({});
  await Season.deleteMany({});
  await StudentSeasonData.deleteMany({});

  console.log("Creating dummy students...");
  const alice = await Student.create({
    name: 'Alice Cooper',
    email: 'alice@test-council.com',
    status: 'active',
    totalSp: 600,
    highestSpEver: 600,
    internshipStartDate: new Date('2026-05-15')
  });

  const bob = await Student.create({
    name: 'Bob Marley',
    email: 'bob@test-council.com',
    status: 'active',
    totalSp: 300,
    highestSpEver: 300,
    internshipStartDate: new Date('2026-05-15')
  });

  const charlie = await Student.create({
    name: 'Charlie Chaplin',
    email: 'charlie@test-council.com',
    status: 'active',
    totalSp: 150,
    highestSpEver: 150,
    internshipStartDate: new Date('2026-05-15')
  });

  console.log("Adding SP transactions...");
  const now = new Date();
  await SPTransaction.create([
    {
      email: 'alice@test-council.com',
      studentId: alice._id,
      category: 'manual',
      deltaValue: 600,
      appliedDelta: 600,
      balanceAfter: 600,
      reason: 'Completed Advanced Coding Quest',
      dateTime: now
    },
    {
      email: 'bob@test-council.com',
      studentId: bob._id,
      category: 'manual',
      deltaValue: 300,
      appliedDelta: 300,
      balanceAfter: 300,
      reason: 'Completed Concurrency Quest',
      dateTime: now
    },
    {
      email: 'charlie@test-council.com',
      studentId: charlie._id,
      category: 'manual',
      deltaValue: 150,
      appliedDelta: 150,
      balanceAfter: 150,
      reason: 'Completed Basic HTML Quest',
      dateTime: now
    }
  ]);

  console.log("Starting active election season: Bronze Season...");
  const season = await Season.create({
    name: 'Bronze Season',
    maxSpCapForScore: 1000,
    councilSize: 2,
    minEndorsementsRequired: 40,
    minSpRequired: 100, // Easy to qualify for demonstration
    isActive: true,
    startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000)
  });

  console.log("Seeding student season data & endorsements...");
  // Alice has 42 endorsements, Bob has 8 (not eligible), Charlie has 12
  await StudentSeasonData.create([
    {
      studentId: alice._id,
      seasonId: season._id,
      matrixMysticsEndorsements: Array.from({ length: 42 }, (_, i) => i + 1),
      hasSpamPenalties: false,
      hasDisciplinaryActions: false
    },
    {
      studentId: bob._id,
      seasonId: season._id,
      matrixMysticsEndorsements: Array.from({ length: 8 }, (_, i) => i + 1),
      hasSpamPenalties: false,
      hasDisciplinaryActions: false
    },
    {
      studentId: charlie._id,
      seasonId: season._id,
      matrixMysticsEndorsements: Array.from({ length: 12 }, (_, i) => i + 1),
      hasSpamPenalties: false,
      hasDisciplinaryActions: false
    }
  ]);

  console.log("\n🎉 Seeding completed successfully!");
  console.log("--------------------------------------------------");
  console.log("Alice (alice@test-council.com): ELIGIBLE (600 SP, 42/40 MM)");
  console.log("Bob (bob@test-council.com): INELIGIBLE (300 SP, 8/40 MM - needs 40)");
  console.log("Charlie (charlie@test-council.com): INELIGIBLE (150 SP, 12/40 MM - needs 40)");
  console.log("--------------------------------------------------\n");
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
