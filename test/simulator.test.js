import test from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateSp,
  nextMilestones,
} from '../server/services/simulator.js';

test('calculates projected SP correctly', () => {
  const result = simulateSp(
    { currentSp: 420, highestSpEver: 420 },
    {
      sessions: 5,
      attendancePct: 90,
      pollPct: 75,
      additionalSpaLearn: 2,
      additionalSpaTeach: 1,
      additionalQueries: 3,
    }
  );

  assert.equal(result.gains.attendance, 50);
  assert.equal(result.gains.polls, 25);
  assert.equal(result.gains.spaLearn, 10);
  assert.equal(result.gains.spaTeach, 10);
  assert.equal(result.gains.queries, 15);
  assert.equal(result.gains.total, 110);

  assert.equal(result.projected.sp, 530);
  assert.equal(result.projected.level, 5);
  assert.equal(result.projected.league, 'Silver I');
});

test('applies attendance tier boundaries correctly', () => {
  assert.equal(
    simulateSp(
      { currentSp: 0, highestSpEver: 0 },
      { sessions: 1, attendancePct: 90 }
    ).gains.attendance,
    10
  );

  assert.equal(
    simulateSp(
      { currentSp: 0, highestSpEver: 0 },
      { sessions: 1, attendancePct: 75 }
    ).gains.attendance,
    5
  );

  assert.equal(
    simulateSp(
      { currentSp: 0, highestSpEver: 0 },
      { sessions: 1, attendancePct: 50 }
    ).gains.attendance,
    3
  );

  assert.equal(
    simulateSp(
      { currentSp: 0, highestSpEver: 0 },
      { sessions: 1, attendancePct: 49 }
    ).gains.attendance,
    0
  );
});

test('does not exceed SPA caps', () => {
  const result = simulateSp(
    {
      currentSp: 0,
      highestSpEver: 0,
      spaLearn: 49,
      spaTeach: 24,
    },
    {
      additionalSpaLearn: 10,
      additionalSpaTeach: 10,
    }
  );

  assert.equal(result.applied.spaLearn, 1);
  assert.equal(result.gains.spaLearn, 5);

  assert.equal(result.applied.spaTeach, 1);
  assert.equal(result.gains.spaTeach, 10);
});

test('does not exceed query SP cap', () => {
  const result = simulateSp(
    {
      currentSp: 0,
      highestSpEver: 0,
      querySp: 195,
    },
    {
      additionalQueries: 10,
    }
  );

  assert.equal(result.applied.queries, 1);
  assert.equal(result.gains.queries, 5);
});

test('level uses highest SP ever', () => {
  const result = simulateSp(
    { currentSp: 420, highestSpEver: 550 },
    { additionalQueries: 1 }
  );

  assert.equal(result.current.level, 5);
  assert.equal(result.projected.level, 5);
});

test('projected level increases when SP crosses milestone', () => {
  const result = simulateSp(
    { currentSp: 490, highestSpEver: 490 },
    { additionalQueries: 2 }
  );

  assert.equal(result.projected.sp, 500);
  assert.equal(result.projected.level, 5);
});

test('league is based on projected current SP', () => {
  const result = simulateSp(
    { currentSp: 490, highestSpEver: 490 },
    { additionalQueries: 2 }
  );

  assert.equal(result.projected.league, 'Silver I');
});

test('next milestones are calculated correctly', () => {
  assert.deepEqual(nextMilestones(420), [
    { target: 500, remaining: 80 },
    { target: 600, remaining: 180 },
    { target: 700, remaining: 280 },
  ]);
});

test('zero inputs produce no SP gain', () => {
  const result = simulateSp(
    { currentSp: 420, highestSpEver: 420 },
    {}
  );

  assert.equal(result.gains.total, 0);
  assert.equal(result.projected.sp, 420);
});

test('does not mutate input objects', () => {
  const studentState = {
    currentSp: 420,
    highestSpEver: 420,
    spaLearn: 10,
    spaTeach: 5,
    querySp: 20,
  };

  const inputs = {
    sessions: 2,
    attendancePct: 90,
    pollPct: 90,
    additionalSpaLearn: 2,
    additionalSpaTeach: 1,
    additionalQueries: 3,
  };

  const originalStudentState = structuredClone(studentState);
  const originalInputs = structuredClone(inputs);

  simulateSp(studentState, inputs);

  assert.deepEqual(studentState, originalStudentState);
  assert.deepEqual(inputs, originalInputs);
});
