/**
 * testGoals.js - Integration test script for the Weekly Goal Planner feature.
 *
 * Connects to MongoDB, inserts a test student, updates a weekly goal via simulated
 * API logic, and asserts the schema validation and database integrity.
 */

import mongoose from 'mongoose';
import { MONGO_URI } from '../config.js';
import Student from '../models/Student.js';

// Week helper mirroring server implementation
function getWeekLabel(date = new Date()) {
  const d = new Date(date);
  const first = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - first) / 86400000) + d.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

async function runTest() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected successfully!');

  const testEmail = 'test.student@example.com';
  
  // Clean up any old test record
  await Student.deleteOne({ email: testEmail });

  // 1. Create a test student
  console.log('Creating test student record...');
  const student = await Student.create({
    name: 'Test Student',
    email: testEmail,
    internshipStartDate: new Date(),
    totalSp: 150
  });
  console.log('Created Student:', student._id);

  // 2. Validate empty goals list
  if (student.weeklyGoals.length !== 0) {
    throw new Error('Expected empty weeklyGoals list on initial creation');
  }
  console.log('✓ Initial goals list is empty.');

  // 3. Simulate POST /api/goals save logic
  console.log('Simulating Weekly Goal creation...');
  const targetWeek = getWeekLabel();
  const goalData = {
    weekLabel: targetWeek,
    targetLeague: 'Gold I',
    focusArea: 'both',
    reflection: 'I will attend all sessions and solve polls.'
  };

  student.weeklyGoals.push(goalData);
  await student.save();
  console.log('✓ Goal saved in MongoDB.');

  // 4. Retrieve and Assert Goal
  const fetched = await Student.findOne({ email: testEmail });
  if (fetched.weeklyGoals.length !== 1) {
    throw new Error(`Expected 1 goal, found ${fetched.weeklyGoals.length}`);
  }

  const activeGoal = fetched.weeklyGoals[0];
  if (activeGoal.weekLabel !== targetWeek) {
    throw new Error(`Expected week ${targetWeek}, got ${activeGoal.weekLabel}`);
  }
  if (activeGoal.targetLeague !== 'Gold I') {
    throw new Error(`Expected Gold I league, got ${activeGoal.targetLeague}`);
  }
  if (activeGoal.focusArea !== 'both') {
    throw new Error(`Expected both focus, got ${activeGoal.focusArea}`);
  }
  if (activeGoal.reflection !== 'I will attend all sessions and solve polls.') {
    throw new Error(`Reflection mismatch: ${activeGoal.reflection}`);
  }

  console.log('✓ All database model validation assertions passed successfully!');

  // Clean up
  await Student.deleteOne({ email: testEmail });
  console.log('Cleanup completed.');
  await mongoose.connection.close();
  console.log('Test run finished successfully!');
}

runTest().catch((err) => {
  console.error('Test FAILED:', err?.message);
  mongoose.connection.close();
  process.exit(1);
});
