import assert from 'assert';
import { aggregatePerformance } from './studentPerformance.js';

console.log('Running studentPerformance tests...');

// Mock student and transactions data
const mockStudent = {
  email: 'student@example.com',
  name: 'Test Student',
  totalSp: 450,
  highestSpEver: 450,
  status: 'active'
};

const mockTransactions = [
  {
    category: 'initial',
    appliedDelta: 100,
    balanceAfter: 100,
    dateTime: new Date('2026-05-10T09:00:00Z'),
    reason: 'Initial points'
  },
  {
    category: 'attendance',
    appliedDelta: 50,
    balanceAfter: 150,
    dateTime: new Date('2026-05-15T10:00:00Z'),
    sessionLabel: 'Session 1',
    reason: 'Attended session 1'
  },
  {
    category: 'poll',
    appliedDelta: 20,
    balanceAfter: 170,
    dateTime: new Date('2026-05-15T11:00:00Z'),
    sessionLabel: 'Session 1',
    reason: 'Poll response'
  },
  {
    category: 'attendance',
    appliedDelta: 50,
    balanceAfter: 220,
    dateTime: new Date('2026-05-22T10:00:00Z'),
    sessionLabel: 'Session 2',
    reason: 'Attended session 2'
  },
  {
    category: 'manual',
    appliedDelta: 10,
    balanceAfter: 230,
    dateTime: new Date('2026-05-23T12:00:00Z'),
    reason: 'Bonus points'
  }
];

const mockAttendance = [
  { sessionLabel: 'Session 1', qualified: true },
  { sessionLabel: 'Session 2', qualified: true }
];

const mockPolls = [
  { sessionLabel: 'Session 1', attemptedQuestions: 5, totalQuestions: 5 }
];

const mockCohort = {
  averageSp: 200,
  top50Cutoff: 300
};

// Test 1: Weekly Granularity
function testWeeklyGranularity() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');

  assert.ok(result);
  assert.strictEqual(result.series.length, 2); // Week of May 11 (Mon) and Week of May 18 (Mon)
  
  // Excludes initial onboarding points
  const week1 = result.series[0];
  assert.strictEqual(week1.attendance, 50);
  assert.strictEqual(week1.poll, 20);
  assert.strictEqual(week1.bonus, 0);
  assert.strictEqual(week1.total, 70);
  assert.strictEqual(week1.activityCount, 2);

  const week2 = result.series[1];
  assert.strictEqual(week2.attendance, 50);
  assert.strictEqual(week2.poll, 0);
  assert.strictEqual(week2.bonus, 10);
  assert.strictEqual(week2.total, 60);
  assert.strictEqual(week2.activityCount, 2);

  console.log('✓ Weekly granularity tests passed.');
}

// Test 2: Daily Granularity
function testDailyGranularity() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'daily');

  // Days: 2026-05-15 (att: 50, poll: 20), 2026-05-22 (att: 50), 2026-05-23 (bonus: 10)
  assert.strictEqual(result.series.length, 3);
  
  const day1 = result.series[0];
  assert.strictEqual(day1.key, '2026-05-15');
  assert.strictEqual(day1.total, 70);

  const day2 = result.series[1];
  assert.strictEqual(day2.key, '2026-05-22');
  assert.strictEqual(day2.total, 50);

  const day3 = result.series[2];
  assert.strictEqual(day3.key, '2026-05-23');
  assert.strictEqual(day3.total, 10);

  console.log('✓ Daily granularity tests passed.');
}

// Test 3: Monthly Granularity
function testMonthlyGranularity() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'monthly');

  assert.strictEqual(result.series.length, 1);
  const month = result.series[0];
  assert.strictEqual(month.key, '2026-05');
  assert.strictEqual(month.attendance, 100);
  assert.strictEqual(month.poll, 20);
  assert.strictEqual(month.bonus, 10);
  assert.strictEqual(month.total, 130);

  console.log('✓ Monthly granularity tests passed.');
}

// Test 4: Best Performance Day
function testBestPerformanceDay() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');

  assert.ok(result.bestPerformanceDay);
  assert.strictEqual(result.bestPerformanceDay.points, 70); // 15 May has 50 + 20 = 70
  
  console.log('✓ Best performance day tests passed.');
}

// Test 5: Consistency Score
function testConsistencyScore() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');

  // Qualified attendance: 2/2 = 1.0
  // Attempted polls: 5/5 = 1.0
  // Average = 1.0 => 100%
  assert.strictEqual(result.consistencyScore, 100);

  // Partial consistency
  const partialAttendance = [
    { sessionLabel: 'Session 1', qualified: true },
    { sessionLabel: 'Session 2', qualified: false }
  ]; // 50%
  const partialPolls = [
    { sessionLabel: 'Session 1', attemptedQuestions: 3, totalQuestions: 6 }
  ]; // 50%

  const partialResult = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: partialAttendance,
    polls: partialPolls,
    cohort: mockCohort
  }, 'weekly');

  assert.strictEqual(partialResult.consistencyScore, 50);

  console.log('✓ Consistency score tests passed.');
}

// Test 6: Achievement Markers
function testAchievementMarkers() {
  const result = aggregatePerformance({
    student: mockStudent,
    transactions: mockTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');

  // Chronologically:
  // - tx 0: Initial points (100 SP). Level 1 (since 100/100 = 1), League: Bronze II (since 100 >= 100)
  // - tx 1: Attended session 1 (150 SP). Level 1, League: Bronze II
  // - tx 2: Poll response (170 SP). Level 1, League: Bronze II
  // - tx 3: Attended session 2 (220 SP). Level 2 (220 SP), League: Bronze I (220 >= 200)
  // - tx 4: Bonus points (230 SP). Level 2, League: Bronze I
  
  const levels = result.achievementMarkers.filter(m => m.type === 'level');
  assert.strictEqual(levels.length, 2);
  assert.strictEqual(levels[0].value, 1);
  assert.strictEqual(levels[1].value, 2);

  const leagues = result.achievementMarkers.filter(m => m.type === 'league');
  assert.ok(leagues.length >= 2);
  assert.strictEqual(leagues[0].value, 'Bronze II');
  
  console.log('✓ Achievement markers tests passed.');
}

// Test 7: Trend Calculation
function testTrend() {
  // Let's create transactions where sum2 > sum1 (Upward)
  const upTransactions = [
    { category: 'attendance', appliedDelta: 10, balanceAfter: 110, dateTime: new Date('2026-05-15T10:00:00Z') },
    { category: 'attendance', appliedDelta: 50, balanceAfter: 160, dateTime: new Date('2026-05-22T10:00:00Z') }
  ];
  
  const upResult = aggregatePerformance({
    student: mockStudent,
    transactions: upTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');
  assert.strictEqual(upResult.trend, 'Upward');

  // Let's create transactions where sum2 < sum1 (Downward)
  const downTransactions = [
    { category: 'attendance', appliedDelta: 50, balanceAfter: 150, dateTime: new Date('2026-05-15T10:00:00Z') },
    { category: 'attendance', appliedDelta: 10, balanceAfter: 160, dateTime: new Date('2026-05-22T10:00:00Z') }
  ];
  
  const downResult = aggregatePerformance({
    student: mockStudent,
    transactions: downTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');
  assert.strictEqual(downResult.trend, 'Downward');

  // Stable (within dead-zone +/- 5 SP)
  const stableTransactions = [
    { category: 'attendance', appliedDelta: 20, balanceAfter: 120, dateTime: new Date('2026-05-15T10:00:00Z') },
    { category: 'attendance', appliedDelta: 22, balanceAfter: 142, dateTime: new Date('2026-05-22T10:00:00Z') }
  ];
  
  const stableResult = aggregatePerformance({
    student: mockStudent,
    transactions: stableTransactions,
    attendance: mockAttendance,
    polls: mockPolls,
    cohort: mockCohort
  }, 'weekly');
  assert.strictEqual(stableResult.trend, 'Stable');

  console.log('✓ Trend calculation tests passed.');
}

// Run all tests
testWeeklyGranularity();
testDailyGranularity();
testMonthlyGranularity();
testBestPerformanceDay();
testConsistencyScore();
testAchievementMarkers();
testTrend();

console.log('All performance aggregation tests completed successfully.');
