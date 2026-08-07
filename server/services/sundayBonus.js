export const DEFAULT_SUNDAY_BONUS_CONFIG = {
  enabled: true,
  thresholdMinutes: 60,
  fullClassMinutes: 120,
  partialBonusSp: 5,
  fullBonusSp: 10,
  fullPollBonusSp: 10,
  partialPollBonusSp: 5,
  awardOnlyOncePerSession: true
};

export function calculateSundayBonus(attendedMinutes, totalSessionMinutes, dateTime, config = {}) {
  const resolved = { ...DEFAULT_SUNDAY_BONUS_CONFIG, ...config };
  const dt = dateTime instanceof Date ? dateTime : new Date(dateTime);

  if (!resolved.enabled || Number.isNaN(dt.getTime()) || dt.getDay() !== 0) {
    return { eligible: false, points: 0, tier: 'none', reason: 'Not a Sunday eligible class.' };
  }

  const attended = Number(attendedMinutes || 0);
  const thresholdMinutes = Number(resolved.thresholdMinutes || 0);
  const fullClassMinutes = Number(resolved.fullClassMinutes || thresholdMinutes);

  let attendancePoints = 0;
  let attendanceTier = 'none';
  let attendanceReason = '';

  if (attended >= fullClassMinutes) {
    attendancePoints = Number(resolved.fullBonusSp || 0);
    attendanceTier = 'full';
    attendanceReason = `Full Sunday class attendance bonus: +${resolved.fullBonusSp} SP.`;
  } else if (attended >= thresholdMinutes) {
    attendancePoints = Number(resolved.partialBonusSp || 0);
    attendanceTier = 'partial';
    attendanceReason = `Sunday attendance bonus: +${resolved.partialBonusSp} SP.`;
  }

  return {
    eligible: attendancePoints > 0,
    points: attendancePoints,
    tier: attendanceTier,
    reason: attendanceReason || 'Attendance below minimum threshold.'
  };
}

export function calculateSundayPollBonus(attemptedQuestions, totalQuestions, dateTime, config = {}) {
  const resolved = { ...DEFAULT_SUNDAY_BONUS_CONFIG, ...config };
  const dt = dateTime instanceof Date ? dateTime : new Date(dateTime);

  if (!resolved.enabled || Number.isNaN(dt.getTime()) || dt.getDay() !== 0 || !totalQuestions) {
    return { eligible: false, points: 0, tier: 'none', reason: 'No Sunday poll bonus available.' };
  }

  const attempted = Number(attemptedQuestions || 0);
  const total = Number(totalQuestions || 0);
  const ratio = total > 0 ? attempted / total : 0;

  if (ratio >= 1) {
    return { eligible: true, points: Number(resolved.fullPollBonusSp || 0), tier: 'full', reason: `Sunday poll bonus: answered all ${total} polls for +${resolved.fullPollBonusSp} SP.` };
  }

  if (ratio >= 0.75) {
    return { eligible: true, points: Number(resolved.partialPollBonusSp || 0), tier: 'partial', reason: `Sunday poll bonus: answered ${attempted}/${total} polls for +${resolved.partialPollBonusSp} SP.` };
  }

  return { eligible: false, points: 0, tier: 'none', reason: 'Poll participation below the Sunday bonus threshold.' };
}

export function calculateSundayBonusBreakdown(attendedMinutes, totalSessionMinutes, attemptedQuestions, totalQuestions, dateTime, config = {}) {
  const attendance = calculateSundayBonus(attendedMinutes, totalSessionMinutes, dateTime, config);
  const poll = calculateSundayPollBonus(attemptedQuestions, totalQuestions, dateTime, config);
  return {
    attendance,
    poll,
    eligible: attendance.eligible || poll.eligible,
    points: Number(attendance.points || 0) + Number(poll.points || 0),
    attendancePoints: Number(attendance.points || 0),
    pollPoints: Number(poll.points || 0),
    reason: [attendance.reason, poll.reason].filter(Boolean).join(' ')
  };
}
