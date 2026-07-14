import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SUNDAY_BONUS_CONFIG, calculateSundayBonus, calculateSundayPollBonus, calculateSundayBonusBreakdown } from '../services/sundayBonus.js';

test('awards 5 SP for Sunday attendance between 1 and 2 hours', () => {
  const config = { ...DEFAULT_SUNDAY_BONUS_CONFIG, partialBonusSp: 5, fullBonusSp: 10 };
  const result = calculateSundayBonus(90, 120, new Date('2026-07-05T10:00:00Z'), config);
  assert.equal(result.points, 5);
  assert.equal(result.tier, 'partial');
});

test('awards 10 SP for Sunday attendance of 2 hours or more', () => {
  const config = { ...DEFAULT_SUNDAY_BONUS_CONFIG, partialBonusSp: 5, fullBonusSp: 10 };
  const result = calculateSundayBonus(120, 120, new Date('2026-07-05T10:00:00Z'), config);
  assert.equal(result.points, 10);
  assert.equal(result.tier, 'full');
});

test('awards poll bonus for complete Sunday poll participation', () => {
  const config = { ...DEFAULT_SUNDAY_BONUS_CONFIG, fullPollBonusSp: 10, partialPollBonusSp: 5 };
  const result = calculateSundayPollBonus(8, 8, new Date('2026-07-05T10:00:00Z'), config);
  assert.equal(result.points, 10);
  assert.equal(result.tier, 'full');
});

test('combines attendance and poll rewards for the same Sunday class', () => {
  const config = { ...DEFAULT_SUNDAY_BONUS_CONFIG, partialBonusSp: 5, fullBonusSp: 10, fullPollBonusSp: 10, partialPollBonusSp: 5 };
  const result = calculateSundayBonusBreakdown(90, 120, 8, 8, new Date('2026-07-05T10:00:00Z'), config);
  assert.equal(result.attendancePoints, 5);
  assert.equal(result.pollPoints, 10);
  assert.equal(result.points, 15);
});

test('does not award bonus outside Sunday or below the threshold', () => {
  const config = { ...DEFAULT_SUNDAY_BONUS_CONFIG, partialBonusSp: 5, fullBonusSp: 10 };
  const outside = calculateSundayBonus(90, 120, new Date('2026-07-04T10:00:00Z'), config);
  const below = calculateSundayBonus(30, 120, new Date('2026-07-05T10:00:00Z'), config);
  assert.equal(outside.points, 0);
  assert.equal(below.points, 0);
});
