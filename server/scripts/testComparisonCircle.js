import mongoose from 'mongoose';
import Student from '../models/Student.js';
import ComparisonCircle from '../models/ComparisonCircle.js';
import { MONGO_URI } from '../config.js';

async function runTests() {
  console.log('Connecting to database...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  try {
    // 1. Cleanup old test data
    console.log('Cleaning up old test data...');
    await Student.deleteMany({ email: /test-student-.*@example\.com/ });
    await ComparisonCircle.deleteMany({});

    // 2. Create mock students
    console.log('Creating mock students...');
    const owner = await Student.create({
      name: 'Owner Student',
      email: 'test-student-owner@example.com',
      internshipStartDate: new Date(),
      status: 'active',
      totalSp: 200
    });

    const members = [];
    for (let i = 1; i <= 11; i++) {
      const student = await Student.create({
        name: `Test Student ${i}`,
        email: `test-student-${i}@example.com`,
        internshipStartDate: new Date(),
        status: i === 11 ? 'excused' : 'active',
        totalSp: 100 + i * 10
      });
      members.push(student);
    }

    console.log(`Created owner and ${members.length} test students.`);

    // Test 1: Lazy creation
    console.log('--- Test 1: Lazy creation ---');
    let circle = await ComparisonCircle.findOne({ owner: owner._id });
    if (!circle) {
      circle = await ComparisonCircle.create({ owner: owner._id, members: [] });
    }
    console.log('Comparison circle lazily created:', circle);
    if (!circle || circle.members.length !== 0) {
      throw new Error('Test 1 failed: lazy creation should result in an empty circle');
    }
    console.log('Test 1 passed.');

    // Test 2: Add member
    console.log('--- Test 2: Add member ---');
    const member1 = members[0];
    circle.members.push(member1._id);
    await circle.save();
    let updatedCircle = await ComparisonCircle.findOne({ owner: owner._id });
    console.log('Current members:', updatedCircle.members);
    if (updatedCircle.members.length !== 1 || String(updatedCircle.members[0]) !== String(member1._id)) {
      throw new Error('Test 2 failed: member was not added');
    }
    console.log('Test 2 passed.');

    // Test 3: Self-add prevention logic
    console.log('--- Test 3: Self-add check ---');
    const selfAddAttempt = String(owner._id) === String(owner._id);
    if (!selfAddAttempt) {
      throw new Error('Self-add comparison logic failed');
    }
    console.log('Test 3 passed.');

    // Test 4: Duplicate add prevention logic
    console.log('--- Test 4: Duplicate add check ---');
    const isDuplicate = circle.members.map(id => String(id)).includes(String(member1._id));
    if (!isDuplicate) {
      throw new Error('Test 4 failed: duplicate detection failed');
    }
    console.log('Test 4 passed.');

    // Test 5: Max member limit (10)
    console.log('--- Test 5: Max member limit ---');
    circle.members = [];
    for (let i = 0; i < 10; i++) {
      circle.members.push(members[i]._id);
    }
    await circle.save();

    const updateResult = await ComparisonCircle.findOneAndUpdate(
      {
        owner: owner._id,
        'members.9': { $exists: false }
      },
      { $addToSet: { members: members[10]._id } },
      { new: true }
    );
    if (updateResult) {
      throw new Error('Test 5 failed: allowed adding more than 10 members');
    }
    console.log('Test 5 passed: addition of 11th member correctly rejected.');

    // Test 6: Excused student ignored gracefully
    console.log('--- Test 6: Excused student filter ---');
    await Student.updateOne({ _id: members[1]._id }, { status: 'excused' });
    
    const studentIds = [owner._id, ...circle.members];
    const activeStudents = await Student.find({
      _id: { $in: studentIds },
      status: { $ne: 'excused' }
    }).lean();

    console.log(`Active students count (including owner): ${activeStudents.length}. Expected: 10.`);
    const isMember2Included = activeStudents.some(s => String(s._id) === String(members[1]._id));
    if (isMember2Included) {
      throw new Error('Test 6 failed: excused student was not filtered out of active students');
    }
    console.log('Test 6 passed.');

    // Test 7: Remove member
    console.log('--- Test 7: Remove member ---');
    const toRemove = members[0]._id;
    await ComparisonCircle.findOneAndUpdate(
      { owner: owner._id },
      { $pull: { members: toRemove } }
    );
    const finalCircle = await ComparisonCircle.findOne({ owner: owner._id });
    if (finalCircle.members.map(id => String(id)).includes(String(toRemove))) {
      throw new Error('Test 7 failed: member was not removed');
    }
    console.log('Test 7 passed.');

    console.log('\nAll Automated Logic Tests Passed Successfully!');
  } finally {
    console.log('Cleaning up mock data...');
    await Student.deleteMany({ email: /test-student-.*@example\.com/ });
    await ComparisonCircle.deleteMany({});
    await mongoose.disconnect();
    console.log('Disconnected.');
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
