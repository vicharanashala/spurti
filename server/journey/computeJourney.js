import Session from '../models/Session.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import { resolveDateRange } from './dateRange.js';
import { getTarget } from './targets.js';

export async function computeJourney(email, student, window = 'weekly') {
  const range = resolveDateRange(window, student);
  if (!range) return null;

  const target = await getTarget(window);
  if (!target) return null;

  const sessions = await Session.find({
    endDateTime: { $gte: range.start, $lte: range.end }
  }).sort({ endDateTime: 1 }).lean();

  const sessionLabels = sessions.map(s => s.label);

  const [attendanceRecords, pollRecords] = await Promise.all([
    AttendanceRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean(),
    PollRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean()
  ]);

  const totalSessions = sessions.length;
  const qualifiedSessions = attendanceRecords.filter(a => a.qualified).length;
  const attendancePct = totalSessions ? Math.round((qualifiedSessions / totalSessions) * 100) : 0;

  const totalPollQ = pollRecords.reduce((s, p) => s + p.totalQuestions, 0);
  const attemptedPollQ = pollRecords.reduce((s, p) => s + p.attemptedQuestions, 0);
  const pollPct = totalPollQ ? Math.round((attemptedPollQ / totalPollQ) * 100) : 0;

  const wAtt = (target.attendanceWeight || 50) / 100;
  const wPoll = (target.pollWeight || 50) / 100;
  const overallPct = Math.round((attendancePct * wAtt) + (pollPct * wPoll));

  const elapsedMs = Date.now() - range.start.getTime();
  const totalMs = range.end.getTime() - range.start.getTime();
  const elapsedRatio = totalMs > 0 ? Math.min(1, Math.max(0, elapsedMs / totalMs)) : 0;
  const checkpointsReached = Math.min(target.checkpointCount, Math.max(0, Math.floor(elapsedRatio * target.checkpointCount)));

  const checkpoints = [];
  for (let i = 1; i <= target.checkpointCount; i++) {
    const pct = Math.round((i / target.checkpointCount) * 100);
    checkpoints.push({
      checkpoint: i,
      label: `${pct}%`,
      reached: i <= checkpointsReached,
      pctThrough: pct
    });
  }

  // Attendance breakdown per session
  const sessionDetails = sessions.map(s => {
    const att = attendanceRecords.find(a => a.sessionLabel === s.label);
    const poll = pollRecords.find(p => p.sessionLabel === s.label);
    return {
      label: s.label,
      date: s.endDateTime,
      attendedMinutes: att?.attendedMinutes || 0,
      totalMinutes: s.totalMinutes,
      qualified: att?.qualified || false,
      attendancePct: att?.attendancePercentage || 0,
      pollAttempted: poll?.attemptedQuestions || 0,
      pollTotal: poll?.totalQuestions || 0
    };
  });

  return {
    window,
    range: { start: range.start, end: range.end, label: range.label },
    target: {
      label: target.label,
      checkpointCount: target.checkpointCount,
      attendanceTargetPct: target.attendanceTargetPct,
      pollTargetPct: target.pollTargetPct
    },
    progress: {
      attendancePct,
      pollPct,
      overallPct,
      attendanceQualified: qualifiedSessions,
      attendanceTotal: totalSessions,
      pollAttempted: attemptedPollQ,
      pollTotal: totalPollQ,
      checkpointsReached,
      totalCheckpoints: target.checkpointCount
    },
    checkpoints,
    sessions: sessionDetails
  };
}
