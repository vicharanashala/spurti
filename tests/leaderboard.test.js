import mongoose from 'mongoose';
import express from 'express';
import request from 'supertest';
import {
  getMondayOfCurrentWeekIST,
  calculateWeeklyLeaderboard,
  calculateSkillLeaderboard,
  calculateCohortNormalizedLeaderboard,
  calculateAllLeaderboards,
  archiveWeeklyLeaderboard
} from '../server/services/leaderboardService.js';
import leaderboardRouter from '../server/routes/leaderboard.js';

import Student from '../server/models/Student.js';
import SPTransaction from '../server/models/SPTransaction.js';
import SkillPointLog from '../server/models/SkillPointLog.js';
import LeaderboardEntry from '../server/models/LeaderboardEntry.js';
import LeaderboardSnapshot from '../server/models/LeaderboardSnapshot.js';

const MONGO_TEST_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';

const app = express();
app.use(express.json());
app.use('/api/leaderboard', leaderboardRouter);

beforeAll(async () => {
  await mongoose.connect(MONGO_TEST_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
});

describe('Weekly leaderboard calculation', () => {
  let studentA, studentB, studentC;

  beforeEach(async () => {
    await Student.deleteMany({ email: /@testweekly\.com$/ });
    await LeaderboardEntry.deleteMany({});
    await SPTransaction.deleteMany({ email: /@test/ });

    studentA = await Student.create({
      name: 'Weekly Student A',
      email: 'a@testweekly.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 100,
      status: 'active'
    });

    studentB = await Student.create({
      name: 'Weekly Student B',
      email: 'b@testweekly.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 200,
      status: 'active'
    });

    studentC = await Student.create({
      name: 'Weekly Student C',
      email: 'c@testweekly.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 50,
      status: 'active'
    });
  });

  test('Test that only SP from current week is counted', async () => {
    const weekStart = getMondayOfCurrentWeekIST();
    const currentWeekDate = new Date(weekStart.getTime() + 12 * 60 * 60 * 1000); // 12 hours after week start

    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'attendance',
      deltaValue: 30,
      appliedDelta: 30,
      balanceAfter: 130,
      reason: 'Test',
      dateTime: currentWeekDate,
      createdAt: currentWeekDate
    });

    await calculateWeeklyLeaderboard();

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'WEEKLY' });
    expect(entryA.rawSP).toBe(30);
  });

  test('Test that SP from previous week is excluded', async () => {
    const weekStart = getMondayOfCurrentWeekIST();
    const previousWeekDate = new Date(weekStart.getTime() - 48 * 60 * 60 * 1000); // 2 days before week start

    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'attendance',
      deltaValue: 50,
      appliedDelta: 50,
      balanceAfter: 150,
      reason: 'Old test',
      dateTime: previousWeekDate,
      createdAt: previousWeekDate
    });

    await calculateWeeklyLeaderboard();

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'WEEKLY' });
    expect(entryA.rawSP).toBe(0);
  });

  test('Test that students with zero weekly SP appear at bottom', async () => {
    const weekStart = getMondayOfCurrentWeekIST();
    const currentWeekDate = new Date(weekStart.getTime() + 10 * 60 * 60 * 1000);

    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 120,
      reason: 'Weekly activity',
      dateTime: currentWeekDate,
      createdAt: currentWeekDate
    });

    await calculateWeeklyLeaderboard();

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'WEEKLY' });
    const entryB = await LeaderboardEntry.findOne({ studentId: studentB._id, leaderboardType: 'WEEKLY' });

    expect(entryA.rank).toBeLessThan(entryB.rank);
    expect(entryB.rawSP).toBe(0);
  });

  test('Test weekly tiebreaker (higher all-time SP ranks higher)', async () => {
    const weekStart = getMondayOfCurrentWeekIST();
    const currentWeekDate = new Date(weekStart.getTime() + 10 * 60 * 60 * 1000);

    // Both get 20 weekly SP
    await SPTransaction.create({
      email: studentA.email,
      studentId: studentA._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 120,
      reason: 'Weekly activity',
      dateTime: currentWeekDate,
      createdAt: currentWeekDate
    });

    await SPTransaction.create({
      email: studentC.email,
      studentId: studentC._id,
      category: 'attendance',
      deltaValue: 20,
      appliedDelta: 20,
      balanceAfter: 70,
      reason: 'Weekly activity',
      dateTime: currentWeekDate,
      createdAt: currentWeekDate
    });

    // studentA totalSp = 100, studentC totalSp = 50
    await calculateWeeklyLeaderboard();

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'WEEKLY' });
    const entryC = await LeaderboardEntry.findOne({ studentId: studentC._id, leaderboardType: 'WEEKLY' });

    expect(entryA.rank).toBeLessThan(entryC.rank);
  });

  test('Test weekStart is always set to Monday 00:00:00 IST', () => {
    const weekStart = getMondayOfCurrentWeekIST();
    expect(weekStart).toBeInstanceOf(Date);
    expect(isNaN(weekStart.getTime())).toBe(false);

    // Verify IST Monday representation
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(weekStart.getTime() + istOffset);
    expect(istDate.getUTCDay()).toBe(1); // Monday
    expect(istDate.getUTCHours()).toBe(0);
    expect(istDate.getUTCMinutes()).toBe(0);
    expect(istDate.getUTCSeconds()).toBe(0);
  });
});

describe('Skill leaderboard calculation', () => {
  let studentA, studentB;

  beforeEach(async () => {
    await Student.deleteMany({ email: /@testskill\.com$/ });
    await SkillPointLog.deleteMany({});
    await LeaderboardEntry.deleteMany({});

    studentA = await Student.create({
      name: 'Skill Student A',
      email: 'a@testskill.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 100,
      status: 'active'
    });

    studentB = await Student.create({
      name: 'Skill Student B',
      email: 'b@testskill.com',
      internshipStartDate: new Date('2026-05-10'),
      totalSp: 100,
      status: 'active'
    });
  });

  test('Test that React SP does not appear on MERN leaderboard', async () => {
    await SkillPointLog.create({
      studentId: studentA._id,
      skillCategory: 'REACT',
      pointsDelta: 50,
      sourceType: 'COURSE_COMPLETION',
      awardedAt: new Date()
    });

    await calculateSkillLeaderboard('REACT');
    await calculateSkillLeaderboard('MERN');

    const reactEntry = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'SKILL', skillCategory: 'REACT' });
    const mernEntry = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'SKILL', skillCategory: 'MERN' });

    expect(reactEntry).not.toBeNull();
    expect(reactEntry.rawSP).toBe(50);
    expect(mernEntry).toBeNull();
  });

  test('Test that students with zero skill SP are excluded', async () => {
    await SkillPointLog.create({
      studentId: studentA._id,
      skillCategory: 'AI',
      pointsDelta: 30,
      sourceType: 'POLL',
      awardedAt: new Date()
    });

    await calculateSkillLeaderboard('AI');

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'SKILL', skillCategory: 'AI' });
    const entryB = await LeaderboardEntry.findOne({ studentId: studentB._id, leaderboardType: 'SKILL', skillCategory: 'AI' });

    expect(entryA).not.toBeNull();
    expect(entryB).toBeNull();
  });

  test('Test skill tiebreaker (earlier join date ranks higher)', async () => {
    // Both earn 40 SP in GITHUB
    await SkillPointLog.create([
      {
        studentId: studentA._id, // Joined 2026-05-01
        skillCategory: 'GITHUB',
        pointsDelta: 40,
        sourceType: 'COURSE_COMPLETION',
        awardedAt: new Date()
      },
      {
        studentId: studentB._id, // Joined 2026-05-10
        skillCategory: 'GITHUB',
        pointsDelta: 40,
        sourceType: 'COURSE_COMPLETION',
        awardedAt: new Date()
      }
    ]);

    await calculateSkillLeaderboard('GITHUB');

    const entryA = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'SKILL', skillCategory: 'GITHUB' });
    const entryB = await LeaderboardEntry.findOne({ studentId: studentB._id, leaderboardType: 'SKILL', skillCategory: 'GITHUB' });

    expect(entryA.rank).toBeLessThan(entryB.rank);
  });

  test('Test all 5 skill categories produce independent rankings', async () => {
    const categories = ['REACT', 'MERN', 'GITHUB', 'AI', 'ORIENTATION'];
    for (const cat of categories) {
      await SkillPointLog.create({
        studentId: studentA._id,
        skillCategory: cat,
        pointsDelta: 10,
        sourceType: 'MANUAL',
        awardedAt: new Date()
      });
      await calculateSkillLeaderboard(cat);
    }

    const entries = await LeaderboardEntry.find({ studentId: studentA._id, leaderboardType: 'SKILL' });
    expect(entries.length).toBe(5);
  });
});

describe('Cohort normalized leaderboard calculation', () => {
  let olderStudent, newerStudent;

  beforeEach(async () => {
    await Student.deleteMany({ email: /@testcohort\.com$/ });
    await LeaderboardEntry.deleteMany({});

    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    olderStudent = await Student.create({
      name: 'Older Student',
      email: 'older@testcohort.com',
      internshipStartDate: tenDaysAgo,
      totalSp: 150, // 150 SP / 10 days = 15.00
      status: 'active'
    });

    newerStudent = await Student.create({
      name: 'Newer Student',
      email: 'newer@testcohort.com',
      internshipStartDate: twoDaysAgo,
      totalSp: 100, // 100 SP / 2 days = 50.00
      status: 'active'
    });
  });

  test('Test normalized_score formula: SP / days_active', async () => {
    await calculateCohortNormalizedLeaderboard();

    const entryOlder = await LeaderboardEntry.findOne({ studentId: olderStudent._id, leaderboardType: 'COHORT_NORMALIZED' });
    expect(entryOlder.normalizedScore).toBeCloseTo(15.00, 1);
  });

  test('Test days_active minimum of 1 (student who joined today)', async () => {
    const todayStudent = await Student.create({
      name: 'Today Student',
      email: 'today@testcohort.com',
      internshipStartDate: new Date(),
      totalSp: 50,
      status: 'active'
    });

    await calculateCohortNormalizedLeaderboard();

    const entryToday = await LeaderboardEntry.findOne({ studentId: todayStudent._id, leaderboardType: 'COHORT_NORMALIZED' });
    expect(entryToday.normalizedScore).toBe(50);
  });

  test('Test that a newer student with high daily rate outranks older student with more raw SP', async () => {
    await calculateCohortNormalizedLeaderboard();

    const entryNewer = await LeaderboardEntry.findOne({ studentId: newerStudent._id, leaderboardType: 'COHORT_NORMALIZED' });
    const entryOlder = await LeaderboardEntry.findOne({ studentId: olderStudent._id, leaderboardType: 'COHORT_NORMALIZED' });

    expect(entryNewer.rank).toBeLessThan(entryOlder.rank);
  });

  test('Test cohort tiebreaker (higher raw SP ranks higher on equal normalized score)', async () => {
    const now = new Date();
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const studentX = await Student.create({
      name: 'Student X',
      email: 'x@testcohort.com',
      internshipStartDate: fourDaysAgo,
      totalSp: 200, // 200 / 4 = 50.00
      status: 'active'
    });

    // newerStudent has 100 SP / 2 days = 50.00
    await calculateCohortNormalizedLeaderboard();

    const entryX = await LeaderboardEntry.findOne({ studentId: studentX._id, leaderboardType: 'COHORT_NORMALIZED' });
    const entryNewer = await LeaderboardEntry.findOne({ studentId: newerStudent._id, leaderboardType: 'COHORT_NORMALIZED' });

    expect(entryX.normalizedScore).toBe(entryNewer.normalizedScore);
    expect(entryX.rank).toBeLessThan(entryNewer.rank); // Higher raw SP (200 > 100)
  });
});

describe('API endpoints', () => {
  let sampleStudent;

  beforeEach(async () => {
    await Student.deleteMany({ email: /@testapi\.com$/ });
    await LeaderboardEntry.deleteMany({});
    await LeaderboardSnapshot.deleteMany({});

    sampleStudent = await Student.create({
      name: 'API Student',
      email: 'api@testapi.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 100,
      status: 'active'
    });

    await calculateAllLeaderboards();
  });

  test('Test GET /api/leaderboard/weekly returns correct weekStart metadata', async () => {
    const res = await request(app).get('/api/leaderboard/weekly');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.metadata).toHaveProperty('weekStart');
    expect(res.body.metadata).toHaveProperty('isCurrentWeek', true);
  });

  test('Test GET /api/leaderboard/skill/:category rejects invalid categories', async () => {
    const res = await request(app).get('/api/leaderboard/skill/invalid_category');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Invalid skill category/i);
  });

  test('Test GET /api/leaderboard/student/:studentId returns all 4 types', async () => {
    const res = await request(app).get(`/api/leaderboard/student/${sampleStudent._id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('global');
    expect(res.body.data).toHaveProperty('weekly');
    expect(res.body.data).toHaveProperty('cohort');
    expect(res.body.data).toHaveProperty('skills');
  });

  test('Test GET /api/leaderboard/weekly/archive returns snapshot for given week', async () => {
    const weekStart = getMondayOfCurrentWeekIST();
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);

    await LeaderboardSnapshot.create({
      leaderboardType: 'WEEKLY',
      skillCategory: null,
      weekStart,
      weekEnd,
      entries: [
        {
          studentId: sampleStudent._id,
          rank: 1,
          rawSP: 100
        }
      ]
    });

    const res = await request(app).get(`/api/leaderboard/weekly/archive?weekStart=${encodeURIComponent(weekStart.toISOString())}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.weekStart).toBe(weekStart.toISOString());
  });

  test('Test POST /api/leaderboard/recalculate is blocked for non-admin', async () => {
    const res = await request(app).post('/api/leaderboard/recalculate');
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  test('Test POST /api/leaderboard/recalculate rate limit (second call within 5 minutes returns 429)', async () => {
    const adminHeaders = {
      'x-admin-email': process.env.ADMIN_EMAIL || 'dled@iitrpr.ac.in',
      'x-admin-token': process.env.ADMIN_TOKEN || 'vled-local-admin'
    };

    // First call succeeds
    const firstRes = await request(app)
      .post('/api/leaderboard/recalculate')
      .set(adminHeaders);
    expect(firstRes.status).toBe(200);

    // Immediate second call should return 429
    const secondRes = await request(app)
      .post('/api/leaderboard/recalculate')
      .set(adminHeaders);
    expect(secondRes.status).toBe(429);
    expect(secondRes.body.error).toMatch(/rate-limited/i);
  });
});

describe('Weekly reset job', () => {
  let studentA;

  beforeEach(async () => {
    await Student.deleteMany({ email: /@testreset\.com$/ });
    await LeaderboardEntry.deleteMany({});
    await LeaderboardSnapshot.deleteMany({});

    studentA = await Student.create({
      name: 'Reset Student A',
      email: 'a@testreset.com',
      internshipStartDate: new Date('2026-05-01'),
      totalSp: 100,
      status: 'active'
    });

    await calculateWeeklyLeaderboard();
  });

  test('Test archiveWeeklyLeaderboard() creates snapshot before deletion', async () => {
    const initialWeeklyCount = await LeaderboardEntry.countDocuments({ leaderboardType: 'WEEKLY' });
    expect(initialWeeklyCount).toBeGreaterThan(0);

    await archiveWeeklyLeaderboard();

    const snapshotCount = await LeaderboardSnapshot.countDocuments({ leaderboardType: 'WEEKLY' });
    expect(snapshotCount).toBe(1);
  });

  test('Test weekly entries are deleted after snapshot created', async () => {
    await archiveWeeklyLeaderboard();

    const remainingWeeklyCount = await LeaderboardEntry.countDocuments({ leaderboardType: 'WEEKLY' });
    expect(remainingWeeklyCount).toBe(0);
  });

  test('Test new week starts with fresh entries after reset', async () => {
    await archiveWeeklyLeaderboard();
    await calculateWeeklyLeaderboard();

    const freshWeeklyCount = await LeaderboardEntry.countDocuments({ leaderboardType: 'WEEKLY' });
    expect(freshWeeklyCount).toBeGreaterThan(0);

    const freshEntry = await LeaderboardEntry.findOne({ studentId: studentA._id, leaderboardType: 'WEEKLY' });
    expect(freshEntry.rawSP).toBe(0);
  });
});
