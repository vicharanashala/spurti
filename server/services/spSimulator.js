import mongoose from 'mongoose';

import Student from '../models/Student.js';
import { leagueBand, levelFor, legendBadge } from './levels.js';

export const SP_RULES = Object.freeze({
  attendance: 20,
  reflection: 10,
  poll: 5,
  commitment: 15
});

class SimulatorError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'SimulatorError';
    this.status = status;
  }
}

function fail(status, message) {
  throw new SimulatorError(status, message);
}

function normalizeActivityType(value) {
  return String(value || '').trim().toLowerCase();
}

function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validateActivities(activities) {
  if (!Array.isArray(activities)) fail(400, 'activities must be an array');

  return activities.map((activity, index) => {
    if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
      fail(400, `activities[${index}] must be an object`);
    }

    const type = normalizeActivityType(activity.type);
    if (!type) fail(400, `activities[${index}].type is required`);
    if (!(type in SP_RULES)) fail(400, `unknown activity type: ${type}`);

    const count = toFiniteNumber(activity.count);
    if (count === null) fail(400, `activities[${index}].count must be a finite number`);
    if (count < 0) fail(400, `activities[${index}].count must be greater than or equal to 0`);

    return { type, count };
  });
}

function currentLevelSnapshot(student) {
  const currentSP = Number(student.totalSp ?? 0) || 0;
  const currentHighest = Math.max(Number(student.highestSpEver ?? 0) || 0, currentSP);
  const currentLevel = levelFor(currentHighest);

  return {
    currentSP,
    currentHighest,
    currentLevel,
    currentTrophyLeague: leagueBand(currentSP),
    currentLegendBadgeUnlocked: legendBadge(currentHighest)
  };
}

export async function simulateSp(payload = {}) {
  const { studentId, activities } = payload;

  if (!studentId || typeof studentId !== 'string') {
    fail(400, 'studentId is required');
  }
  if (!mongoose.isValidObjectId(studentId)) {
    fail(400, 'studentId is invalid');
  }

  const student = await Student.findById(studentId).lean();
  if (!student) fail(404, 'Student not found');

  const normalizedActivities = validateActivities(activities);
  const current = currentLevelSnapshot(student);

  const breakdown = normalizedActivities.map(({ type, count }) => ({
    activity: type,
    count,
    sp: count * SP_RULES[type]
  }));

  const gain = breakdown.reduce((sum, item) => sum + item.sp, 0);
  const predictedSP = current.currentSP + gain;
  const predictedHighest = Math.max(current.currentHighest, predictedSP);

  return {
    studentId: String(student._id),
    currentSP: current.currentSP,
    predictedSP,
    gain,
    currentLevel: current.currentLevel,
    predictedLevel: levelFor(predictedHighest),
    currentTrophyLeague: current.currentTrophyLeague,
    predictedTrophyLeague: leagueBand(predictedSP),
    currentLegendBadgeUnlocked: current.currentLegendBadgeUnlocked,
    predictedLegendBadgeUnlocked: legendBadge(predictedHighest),
    breakdown
  };
}

export { SimulatorError };