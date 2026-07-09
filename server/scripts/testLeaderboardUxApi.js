import mongoose from 'mongoose';
import { spawn } from 'child_process';
import Student from '../models/Student.js';
import ComparisonCircle from '../models/ComparisonCircle.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import { MONGO_URI } from '../config.js';

const PORT = 5299;
const BASE_URL = `http://localhost:${PORT}/api`;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Connecting to database for seeding...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to Database.');

  let serverProcess;
  try {
    // 1. Cleanup old test data
    console.log('Cleaning up old test data...');
    await Student.deleteMany({ email: /test-ux-.*@example\.com/ });
    await ComparisonCircle.deleteMany({});
    await AttendanceRecord.deleteMany({ email: /test-ux-.*@example\.com/ });
    await PollRecord.deleteMany({ email: /test-ux-.*@example\.com/ });

    // 2. Create mock students
    console.log('Creating mock students with different attributes...');
    const owner = await Student.create({
      name: 'Owner Student',
      email: 'test-ux-owner@example.com',
      internshipStartDate: new Date(),
      status: 'active',
      totalSp: 500,
      highestSpEver: 500
    });

    // Student A: High SP (Legend), Consistent Attendee, Poll Champion
    const studentA = await Student.create({
      name: 'Alice Legend',
      email: 'test-ux-a@example.com',
      internshipStartDate: new Date(),
      status: 'active',
      totalSp: 1600,
      highestSpEver: 1600
    });

    // Add attendance to Alice (100% qualified)
    for (let i = 1; i <= 5; i++) {
      await AttendanceRecord.create({
        email: studentA.email,
        sessionLabel: `Session ${i}`,
        attendedMinutes: 60,
        totalSessionMinutes: 60,
        qualified: true
      });
    }

    // Add polls to Alice (100% attempted)
    await PollRecord.create({
      email: studentA.email,
      sessionLabel: 'Session 1',
      attemptedQuestions: 10,
      totalQuestions: 10
    });

    // Student B: Mid SP (Above average), Low attendance, Low polls
    const studentB = await Student.create({
      name: 'Bob Average',
      email: 'test-ux-b@example.com',
      internshipStartDate: new Date(),
      status: 'active',
      totalSp: 600,
      highestSpEver: 600
    });

    // Add attendance to Bob (under 75% qualified)
    await AttendanceRecord.create({
      email: studentB.email,
      sessionLabel: 'Session 1',
      attendedMinutes: 10,
      totalSessionMinutes: 60,
      qualified: false
    });

    // Student C: Low SP (Below average)
    const studentC = await Student.create({
      name: 'Charlie Starter',
      email: 'test-ux-c@example.com',
      internshipStartDate: new Date(),
      status: 'active',
      totalSp: 100,
      highestSpEver: 100
    });

    // Student D: Excused Student
    const studentD = await Student.create({
      name: 'David Excused',
      email: 'test-ux-d@example.com',
      internshipStartDate: new Date(),
      status: 'excused',
      totalSp: 400,
      highestSpEver: 400
    });

    // Other students to set maximum limit test
    const extraStudents = [];
    for (let i = 1; i <= 60; i++) {
      const extra = await Student.create({
        name: `Extra Student ${i}`,
        email: `test-ux-extra-${i}@example.com`,
        internshipStartDate: new Date(),
        status: 'active',
        totalSp: 200,
        highestSpEver: 200
      });
      extraStudents.push(extra);
    }

    console.log('Seeding complete. Disconnecting db client...');
    await mongoose.disconnect();

    // 3. Start Express server on test port
    console.log(`Starting test server on port ${PORT}...`);
    // Wait dynamically for server to boot
    const serverOnline = new Promise((resolve, reject) => {
      let resolved = false;
      serverProcess = spawn('node', ['server/server.js'], {
        cwd: process.cwd(),
        shell: true,
        env: {
          ...process.env,
          PORT: PORT,
          ENABLE_DEV_AUTH: 'true'
        }
      });

      serverProcess.stdout.on('data', (data) => {
        const msg = data.toString();
        console.log('Server Stdout:', msg.trim());
        if (msg.includes('Spurti app running')) {
          resolved = true;
          resolve();
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error('Server Stderr:', data.toString().trim());
      });

      serverProcess.on('exit', (code, signal) => {
        console.log(`Server process exited. Code: ${code}, Signal: ${signal}`);
        if (!resolved) {
          reject(new Error(`Server exited unexpectedly with code ${code}`));
        }
      });
    });

    await serverOnline;
    console.log('Server is online and ready for testing.');

    // Helper fetch utility with Owner auth header
    const request = async (path, options = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        'x-mock-email': owner.email,
        ...(options.headers || {})
      };
      const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
      const data = await res.json();
      return { status: res.status, ok: res.ok, data };
    };

    console.log('\n--- Test 1: Fetch initial comparison circle ---');
    const { status: s1, data: d1 } = await request('/comparison-circle');
    console.log('Status:', s1);
    console.log('Owner Name:', d1.owner?.name);
    console.log('Members count:', d1.members?.length);
    console.log('Leaderboard count:', d1.leaderboard?.length);
    if (s1 !== 200 || d1.members.length !== 0 || d1.leaderboard.length !== 1) {
      throw new Error('Test 1 failed: Initial circle should be empty (only owner in leaderboard)');
    }
    // Verify owner's badges
    const ownerRow = d1.leaderboard[0];
    console.log('Owner Row Badges:', ownerRow.badges);
    if (!ownerRow.badges.includes('Top 50') || !ownerRow.badges.includes('Above Average')) {
      throw new Error('Test 1 failed: Owner should have Top 50 and Above Average badges');
    }
    console.log('Test 1 passed.');

    console.log('\n--- Test 2: Add member Alice (Legend + Consistent Attendee + Poll Champion) ---');
    const { status: s2, data: d2 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: studentA._id })
    });
    console.log('Status:', s2, 'Message:', d2.message);
    if (s2 !== 200 || !d2.success) {
      throw new Error('Test 2 failed: Could not add Alice');
    }
    console.log('Test 2 passed.');

    console.log('\n--- Test 3: Add member Bob (Above Average) ---');
    const { status: s3, data: d3 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: studentB._id })
    });
    console.log('Status:', s3, 'Message:', d3.message);
    if (s3 !== 200) {
      throw new Error('Test 3 failed: Could not add Bob');
    }
    console.log('Test 3 passed.');

    console.log('\n--- Test 4: Add member Charlie (Below Average) ---');
    const { status: s4, data: d4 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: studentC._id })
    });
    console.log('Status:', s4, 'Message:', d4.message);
    if (s4 !== 200) {
      throw new Error('Test 4 failed: Could not add Charlie');
    }
    console.log('Test 4 passed.');

    console.log('\n--- Test 5: Verify comparison leaderboard and badges ---');
    const { status: s5, data: d5 } = await request('/comparison-circle');
    console.log('Status:', s5);
    console.log('Members count:', d5.members.length, '(Expected: 3)');
    console.log('Leaderboard length:', d5.leaderboard.length, '(Expected: 4)');
    if (d5.members.length !== 3 || d5.leaderboard.length !== 4) {
      throw new Error('Test 5 failed: Incorrect counts');
    }

    // Verify ordering and badges
    // Alice (1600 SP) -> Bob (600 SP) -> Owner (500 SP) -> Charlie (100 SP)
    const aliceRow = d5.leaderboard[0];
    const bobRow = d5.leaderboard[1];
    const ownerRowUx = d5.leaderboard[2];
    const charlieRow = d5.leaderboard[3];

    console.log('Leaderboard rows validation:');
    console.log(`1. ${aliceRow.name}: ${aliceRow.totalSp} SP, Rank ${aliceRow.rank}, Badges: ${aliceRow.badges.join(', ')}`);
    console.log(`2. ${bobRow.name}: ${bobRow.totalSp} SP, Rank ${bobRow.rank}, Badges: ${bobRow.badges.join(', ')}`);
    console.log(`3. ${ownerRowUx.name}: ${ownerRowUx.totalSp} SP, Rank ${ownerRowUx.rank}, Badges: ${ownerRowUx.badges.join(', ')}`);
    console.log(`4. ${charlieRow.name}: ${charlieRow.totalSp} SP, Rank ${charlieRow.rank}, Badges: ${charlieRow.badges.join(', ')}`);

    if (aliceRow.name !== 'Alice Legend' || aliceRow.rank !== 1 || !aliceRow.badges.includes('Legend') || !aliceRow.badges.includes('Consistent Attendee') || !aliceRow.badges.includes('Poll Champion')) {
      throw new Error('Test 5 failed: Alice details/badges incorrect');
    }
    if (bobRow.name !== 'Bob Average' || bobRow.rank !== 2 || !bobRow.badges.includes('Above Average')) {
      throw new Error('Test 5 failed: Bob details/badges incorrect');
    }
    if (ownerRowUx.name !== 'Owner Student' || ownerRowUx.rank !== 3 || !ownerRowUx.badges.includes('Above Average')) {
      throw new Error('Test 5 failed: Owner details/badges incorrect');
    }
    if (charlieRow.name !== 'Charlie Starter' || charlieRow.rank !== 4 || !charlieRow.badges.includes('Getting Started')) {
      throw new Error('Test 5 failed: Charlie details/badges incorrect');
    }
    console.log('Test 5 passed.');

    console.log('\n--- Test 6: Validation: Self-add rejection ---');
    const { status: s6, data: d6 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: owner._id })
    });
    console.log('Status:', s6, 'Error Message:', d6.error);
    if (s6 !== 400 || !d6.error.includes('yourself')) {
      throw new Error('Test 6 failed: Should prevent self-add');
    }
    console.log('Test 6 passed.');

    console.log('\n--- Test 7: Validation: Duplicate add rejection ---');
    const { status: s7, data: d7 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: studentA._id })
    });
    console.log('Status:', s7, 'Error Message:', d7.error);
    if (s7 !== 400 || !d7.error.includes('already in your comparison circle')) {
      throw new Error('Test 7 failed: Should prevent duplicate add');
    }
    console.log('Test 7 passed.');

    console.log('\n--- Test 8: Validation: Excused student rejection ---');
    const { status: s8, data: d8 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: studentD._id })
    });
    console.log('Status:', s8, 'Error Message:', d8.error);
    if (s8 !== 404) {
      throw new Error('Test 8 failed: Should return 404 for excused student');
    }
    console.log('Test 8 passed.');

    console.log('\n--- Test 9: Validation: Enforcing maximum member limit (10) ---');
    // Currently we have Bob, Charlie in circle (we removed Alice? No, Alice is still in circle. So we have Alice, Bob, Charlie = 3 members).
    // Let's add extra students to fill up to 10 members.
    // 3 + 7 = 10 members.
    for (let i = 0; i < 7; i++) {
      const res = await request('/comparison-circle/members', {
        method: 'POST',
        body: JSON.stringify({ studentId: extraStudents[i]._id })
      });
      if (res.status !== 200) throw new Error(`Failed to add extra student ${i}`);
    }

    // Try adding the 11th member
    const { status: s9, data: d9 } = await request('/comparison-circle/members', {
      method: 'POST',
      body: JSON.stringify({ studentId: extraStudents[7]._id })
    });
    console.log('Status (11th member add):', s9, 'Error Message:', d9.error);
    if (s9 !== 400 || !d9.error.includes('full')) {
      throw new Error('Test 9 failed: Should reject 11th member addition');
    }
    console.log('Test 9 passed.');

    console.log('\n--- Test 10: Remove member ---');
    const { status: s10, data: d10 } = await request(`/comparison-circle/members/${studentA._id}`, {
      method: 'DELETE'
    });
    console.log('Status:', s10, 'Message:', d10.message);
    if (s10 !== 200) {
      throw new Error('Test 10 failed: Could not remove Alice');
    }
    // Verify Alice is no longer in the circle
    const { data: d10Verify } = await request('/comparison-circle');
    const hasAlice = d10Verify.leaderboard.some(row => row._id === String(studentA._id));
    console.log('Is Alice in leaderboard after removal?', hasAlice);
    if (hasAlice) {
      throw new Error('Test 10 failed: Alice was not removed from comparison circle');
    }
    console.log('Test 10 passed.');

    console.log('\nAll Backend Route Integration Tests Passed Successfully!');
  } finally {
    if (serverProcess) {
      console.log('Killing test server process...');
      serverProcess.kill();
    }
    
    // Connect to database to cleanup mock data
    console.log('Connecting to database to clean up mock data...');
    const conn = await mongoose.connect(MONGO_URI);
    await Student.deleteMany({ email: /test-ux-.*@example\.com/ });
    await ComparisonCircle.deleteMany({});
    await AttendanceRecord.deleteMany({ email: /test-ux-.*@example\.com/ });
    await PollRecord.deleteMany({ email: /test-ux-.*@example\.com/ });
    await mongoose.disconnect();
    console.log('Cleanup finished. Disconnected.');
  }
}

runTests().catch(err => {
  console.error('UX API Test suite failed:', err);
  process.exit(1);
});
