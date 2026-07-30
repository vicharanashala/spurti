import { ROLLING_WINDOW_SIZE } from './config.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import SPTransaction from '../models/SPTransaction.js';
import Session from '../models/Session.js';

export async function fetchStudentEngagementData(email) {
  const [sessions, attendanceRecords, spTransactions] = await Promise.all([
    Session.find().sort({ endDateTime: 1 }).lean(),
    AttendanceRecord.find({ email }).lean(),
    SPTransaction.find({ email, category: { $ne: 'initial' } }).sort({ dateTime: 1 }).lean()
  ]);

  const attendanceByLabel = {};
  for (const rec of attendanceRecords) {
    attendanceByLabel[rec.sessionLabel] = rec.attendancePercentage;
  }

  const spByLabel = {};
  for (const txn of spTransactions) {
    if (!spByLabel[txn.sessionLabel]) spByLabel[txn.sessionLabel] = 0;
    spByLabel[txn.sessionLabel] += txn.appliedDelta;
  }

  const windowed = sessions.map(s => ({
    label: s.label,
    date: s.endDateTime,
    totalMinutes: s.totalMinutes,
    attendancePct: attendanceByLabel[s.label] ?? null,
    spDelta: spByLabel[s.label] ?? 0
  }));

  const n = ROLLING_WINDOW_SIZE;
  const current = windowed.slice(-n);
  const previous = windowed.length > n ? windowed.slice(-n * 2, -n) : [];

  return { current, previous, all: windowed };
}
