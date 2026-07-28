import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';

async function run() {
  console.log('Connecting to database:', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  const testStudents = [
    {
      name: 'Test Student 1',
      email: 'test.student1@vled.test',
      alternateEmail: 'test.student1.alt@vled.test',
      totalSp: 100,
      highestSpEver: 100,
      status: 'active',
      internshipStartDate: new Date()
    },
    {
      name: 'Test Student 2',
      email: 'test.student2@vled.test',
      alternateEmail: 'test.student2.alt@vled.test',
      totalSp: 120,
      highestSpEver: 120,
      status: 'active',
      internshipStartDate: new Date()
    },
    {
      name: 'Test Student 3',
      email: 'test.student3@vled.test',
      alternateEmail: 'test.student3.alt@vled.test',
      totalSp: 150,
      highestSpEver: 150,
      status: 'active',
      internshipStartDate: new Date()
    },
    {
      name: 'Test Student 4',
      email: 'test.student4@vled.test',
      alternateEmail: 'test.student4.alt@vled.test',
      totalSp: 80,
      highestSpEver: 80,
      status: 'active',
      internshipStartDate: new Date()
    },
    {
      name: 'Test Student 5',
      email: 'test.student5@vled.test',
      alternateEmail: 'test.student5.alt@vled.test',
      totalSp: 100,
      highestSpEver: 100,
      status: 'active',
      internshipStartDate: new Date()
    }
  ];

  console.log('Seeding dummy test students...');
  for (const s of testStudents) {
    const existing = await Student.findOne({ email: s.email });
    if (existing) {
      console.log(`Student ${s.email} already exists. Skipping.`);
    } else {
      await Student.create(s);
      console.log(`Created student: ${s.name} (${s.email})`);
    }
  }

  console.log('Seeding completed successfully!');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Seeding failed:', err);
  await mongoose.disconnect();
  process.exit(1);
});
