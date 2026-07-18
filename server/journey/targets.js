import JourneyTarget from '../models/JourneyTarget.js';

export const DEFAULT_TARGETS = {
  weekly: { window: 'weekly', label: 'This Week', checkpointCount: 5, attendanceTargetPct: 80, pollTargetPct: 75, attendanceWeight: 50, pollWeight: 50 },
  monthly: { window: 'monthly', label: 'This Month', checkpointCount: 4, attendanceTargetPct: 85, pollTargetPct: 80, attendanceWeight: 50, pollWeight: 50 },
  tenure: { window: 'tenure', label: 'Full Internship', checkpointCount: 8, attendanceTargetPct: 75, pollTargetPct: 70, attendanceWeight: 50, pollWeight: 50 }
};

export async function getTarget(window) {
  const db = await JourneyTarget.findOne({ window, active: true }).lean();
  return db || DEFAULT_TARGETS[window] || null;
}

export async function getAllTargets() {
  const db = await JourneyTarget.find({ active: true }).lean();
  const merged = {};
  for (const key of Object.keys(DEFAULT_TARGETS)) {
    const dbEntry = db.find(t => t.window === key);
    merged[key] = dbEntry || DEFAULT_TARGETS[key];
  }
  return merged;
}

export async function upsertTarget(window, data) {
  return JourneyTarget.findOneAndUpdate(
    { window },
    { $set: { ...data, window } },
    { upsert: true, new: true, lean: true }
  );
}
