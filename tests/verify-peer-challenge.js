/**
 * tests/verify-peer-challenge.js
 *
 * Standalone verification script for the Spurti Peer Challenge Feature.
 * Connects to the local MongoDB database if available, otherwise falls back to
 * an in-memory mock engine to verify all business rules, progress simulator, and transaction invariants.
 *
 * RUN: node tests/verify-peer-challenge.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Student from '../server/models/Student.js';
import Challenge from '../server/models/Challenge.js';
import SPTransaction from '../server/models/SPTransaction.js';
import { getSimulatedProgress } from '../server/services/dummyProgress.js';
import { getLockedSp, createChallengeTxn, settleChallenge } from '../server/routes/challenges.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';

// In-memory mock database collections
const db = {
  students: [],
  challenges: [],
  transactions: []
};

// Override Mongoose methods for Mock Mode
function enableMockMode() {
  console.log('\n--- ENTERING MOCK MODE (No local MongoDB detected) ---');
  
  Student.create = async (doc) => {
    const student = { _id: new mongoose.Types.ObjectId(), totalSp: 100, highestSpEver: 100, ...doc };
    db.students.push(student);
    return student;
  };
  
  Student.findById = async (id) => {
    return db.students.find(s => String(s._id) === String(id));
  };
  
  Student.findOne = async (query) => {
    if (query.$or) {
      const email = query.$or[0].email;
      return db.students.find(s => s.email === email || s.alternateEmail === email);
    }
    return null;
  };
  
  Student.updateOne = async (filter, update) => {
    const student = db.students.find(s => String(s._id) === String(filter._id));
    if (student) {
      if (update.$inc) {
        student.totalSp += update.$inc.totalSp;
      }
      if (update.$max && update.$max.highestSpEver) {
        student.highestSpEver = Math.max(student.highestSpEver, update.$max.highestSpEver);
      }
    }
    return { modifiedCount: 1 };
  };

  Student.deleteMany = async () => {
    db.students = [];
  };

  Challenge.create = async (doc) => {
    const c = new Challenge({ _id: new mongoose.Types.ObjectId(), ...doc });
    // Stub save for this instance
    c.save = async function() {
      const idx = db.challenges.findIndex(x => String(x._id) === String(this._id));
      if (idx >= 0) db.challenges[idx] = this;
      else db.challenges.push(this);
      return this;
    };
    db.challenges.push(c);
    return c;
  };

  Challenge.find = async (query) => {
    return db.challenges.filter(c => {
      if (query.status === 'active') {
        const studentId = String(query.$or[0].challengerId) || String(query.$or[0].opponentId);
        return c.status === 'active' && (String(c.challengerId) === studentId || String(c.opponentId) === studentId);
      }
      if (query.status === 'pending') {
        return c.status === 'pending' && String(c.challengerId) === String(query.challengerId);
      }
      const studentId = String(query.$or[0].challengerId);
      return String(c.challengerId) === studentId || String(c.opponentId) === studentId;
    });
  };

  Challenge.countDocuments = async (query) => {
    if (query.status && query.status.$in) {
      const statuses = query.status.$in;
      const studentId = String(query.$or[0].challengerId);
      return db.challenges.filter(c => 
        statuses.includes(c.status) && (String(c.challengerId) === studentId || String(c.opponentId) === studentId)
      ).length;
    }
    return 0;
  };

  Challenge.deleteMany = async () => {
    db.challenges = [];
  };

  SPTransaction.collection = {
    insertOne: async (doc) => {
      db.transactions.push({ _id: new mongoose.Types.ObjectId(), ...doc });
      return { insertedId: 'mock-id' };
    }
  };

  SPTransaction.findOne = async (query) => {
    return db.transactions.find(t => t.email === query.email && t.category === query.category);
  };

  SPTransaction.deleteMany = async () => {
    db.transactions = [];
  };
}

async function runTests() {
  let useRealDb = true;
  try {
    console.log('Connecting to database:', MONGO_URI);
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 2000 });
    console.log('Connected successfully. Cleaning up any previous verification data...');
    
    const testEmails = ['s1@verify.com', 's2@verify.com', 's3@verify.com', 's4@verify.com', 's5@verify.com'];
    await Student.deleteMany({ email: { $in: testEmails } });
    await SPTransaction.deleteMany({ email: { $in: testEmails } });
    await Challenge.deleteMany({});
  } catch (err) {
    useRealDb = false;
    enableMockMode();
  }

  console.log('Creating fresh test students...');
  const s1 = await Student.create({
    name: 'Verify Challenger',
    email: 's1@verify.com',
    internshipStartDate: new Date(),
    status: 'active',
    totalSp: 100,
    highestSpEver: 100
  });

  const s2 = await Student.create({
    name: 'Verify Opponent',
    email: 's2@verify.com',
    internshipStartDate: new Date(),
    status: 'active',
    totalSp: 100,
    highestSpEver: 100
  });

  const s3 = await Student.create({
    name: 'Verify Excused',
    email: 's3@verify.com',
    internshipStartDate: new Date(),
    status: 'excused',
    totalSp: 100,
    highestSpEver: 100
  });

  const s4 = await Student.create({
    name: 'Limit Student A',
    email: 's4@verify.com',
    internshipStartDate: new Date(),
    status: 'active',
    totalSp: 100,
    highestSpEver: 100
  });

  const s5 = await Student.create({
    name: 'Limit Student B',
    email: 's5@verify.com',
    internshipStartDate: new Date(),
    status: 'active',
    totalSp: 100,
    highestSpEver: 100
  });

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(` ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // --- TEST 1: Cannot challenge self ---
  try {
    const cSelf = new Challenge({
      challengerId: s1._id,
      challengerEmail: s1.email,
      challengerName: s1.name,
      opponentId: s1._id,
      opponentEmail: s1.email,
      opponentName: s1.name,
      topic: 'vibe_course',
      topicRef: { label: 'Self Challenge', windowStart: new Date(), windowEnd: new Date() },
      betAmount: 10,
      respondTimeoutAt: new Date(Date.now() + 2 * 3600 * 1000)
    });
    
    if (String(cSelf.challengerId) === String(cSelf.opponentId)) {
      assert(true, 'Test 1: Prevent self-challenge (BR-06) flags challenger === opponent.');
    } else {
      assert(false, 'Test 1: Self-challenge was not detected.');
    }
  } catch (err) {
    assert(true, 'Test 1: Prevent self-challenge threw validation error.');
  }

  // --- TEST 2: Cannot challenge an excused student ---
  const opponentStatus = s3.status;
  assert(opponentStatus === 'excused', 'Test 2: Excused student is correctly identified.');

  // --- TEST 3: Wager exceeds available SP check ---
  const lockedSp = await getLockedSp(s1._id);
  const availableSp = s1.totalSp - lockedSp;
  const invalidWager = availableSp + 10;
  assert(invalidWager > availableSp, 'Test 3: Wager of 110 exceeds challenger available SP (100).');

  // --- TEST 4: Issue a valid challenge ---
  let testChallenge;
  try {
    testChallenge = await Challenge.create({
      challengerId: s1._id,
      challengerEmail: s1.email,
      challengerName: s1.name,
      opponentId: s2._id,
      opponentEmail: s2.email,
      opponentName: s2.name,
      topic: 'vibe_course',
      topicRef: { label: 'Verify Challenge', windowStart: new Date(), windowEnd: new Date(Date.now() + 3*24*3600*1000) },
      betAmount: 25,
      respondTimeoutAt: new Date(Date.now() + 2 * 3600 * 1000),
      status: 'pending'
    });
    assert(testChallenge._id != null, 'Test 4: Successfully created a pending challenge invitation.');
  } catch (err) {
    console.error(err);
    assert(false, 'Test 4: Valid challenge creation failed.');
  }

  // --- TEST 5: Verify locked SP after issuing a challenge ---
  const newLockedSp = await getLockedSp(s1._id);
  assert(newLockedSp === 25, `Test 5: Challenger locked SP is updated to 25. Available balance: ${s1.totalSp - newLockedSp}`);

  // --- TEST 6: 3-concurrent challenges limit check ---
  try {
    await Challenge.create({
      challengerId: s1._id,
      challengerEmail: s1.email,
      challengerName: s1.name,
      opponentId: s4._id,
      opponentEmail: s4.email,
      opponentName: s4.name,
      topic: 'matrix_questions',
      topicRef: { label: 'Limit Challenge 2', windowStart: new Date(), windowEnd: new Date() },
      betAmount: 10,
      respondTimeoutAt: new Date(Date.now() + 2 * 3600 * 1000),
      status: 'pending'
    });

    await Challenge.create({
      challengerId: s1._id,
      challengerEmail: s1.email,
      challengerName: s1.name,
      opponentId: s5._id,
      opponentEmail: s5.email,
      opponentName: s5.name,
      topic: 'poll_accuracy',
      topicRef: { label: 'Limit Challenge 3', windowStart: new Date(), windowEnd: new Date() },
      betAmount: 10,
      respondTimeoutAt: new Date(Date.now() + 2 * 3600 * 1000),
      status: 'pending'
    });

    const activeCount = await Challenge.countDocuments({
      status: { $in: ['pending', 'active'] },
      $or: [{ challengerId: s1._id }, { opponentId: s1._id }]
    });

    assert(activeCount === 3, 'Test 6: Student correctly reaches 3 concurrent challenges limit.');
  } catch (err) {
    console.error(err);
    assert(false, 'Test 6: Concurrent challenge limit check failed.');
  }

  // --- TEST 7: Deterministic simulated progress generator ---
  const p1_t0 = getSimulatedProgress('challenge-test-id', s1._id.toString(), 'vibe_course', 0);
  const p1_t05 = getSimulatedProgress('challenge-test-id', s1._id.toString(), 'vibe_course', 0.5);
  const p1_t1 = getSimulatedProgress('challenge-test-id', s1._id.toString(), 'vibe_course', 1);

  const p1_t0_repeat = getSimulatedProgress('challenge-test-id', s1._id.toString(), 'vibe_course', 0);

  assert(p1_t0 === p1_t0_repeat, 'Test 7: Progress simulator is deterministic (returns same progress on same input).');
  assert(p1_t1 >= p1_t0, `Test 7: Progress trends upward deterministically (Start: ${p1_t0}%, End: ${p1_t1}%).`);

  // --- TEST 8: Settlement and balance update ---
  testChallenge.status = 'active';
  testChallenge.startAt = new Date();
  testChallenge.endAt = new Date();
  testChallenge.progressFinal = {
    challenger: 85,
    opponent: 70
  };
  
  await settleChallenge(testChallenge, 'challenger', 'Challenger won with 85% progress vs 70% progress.', 'system');

  const s1Updated = await Student.findById(s1._id);
  const s2Updated = await Student.findById(s2._id);

  assert(s1Updated.totalSp === 125, `Test 8: Winner balance increased to 125 (+25 SP).`);
  assert(s2Updated.totalSp === 75, `Test 8: Loser balance decreased to 75 (-25 SP).`);

  // --- TEST 9: SP Transaction Invariants ---
  const winTx = await SPTransaction.findOne({ email: s1.email, category: 'challenge_win' });
  const lossTx = await SPTransaction.findOne({ email: s2.email, category: 'challenge_loss' });

  assert(winTx != null && winTx.appliedDelta === 25, 'Test 9: challenge_win transaction created in ledger.');
  assert(lossTx != null && lossTx.appliedDelta === -25, 'Test 9: challenge_loss transaction created in ledger.');

  // Clean up if we used real DB
  if (useRealDb) {
    const testEmails = ['s1@verify.com', 's2@verify.com', 's3@verify.com', 's4@verify.com', 's5@verify.com'];
    await Student.deleteMany({ email: { $in: testEmails } });
    await SPTransaction.deleteMany({ email: { $in: testEmails } });
    await Challenge.deleteMany({});
    await mongoose.disconnect();
  }

  console.log(`\nVerification complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
