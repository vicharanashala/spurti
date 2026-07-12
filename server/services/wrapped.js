/**
 * server/services/wrapped.js
 * Pure assembly — no DB access, no side effects.
 * Route does all DB queries and passes pre-fetched data in.
 */

export function buildWrappedStory({
  month, monthLabel, joinedThisMonth,
  transactions, attendanceInMonth,
  sessionsInMonth, pollsInMonth,
  student, streakInfo, progressInfo,
}) {
  // SP earned / deducted
  const totalEarned = transactions
    .filter(t => (t.appliedDelta || 0) > 0)
    .reduce((s, t) => s + t.appliedDelta, 0);
  const totalDeducted = transactions
    .filter(t => (t.appliedDelta || 0) < 0)
    .reduce((s, t) => s + t.appliedDelta, 0);
  const netChange = totalEarned + totalDeducted;

  // Category breakdown
  const byCategory = cat =>
    transactions
      .filter(t => t.category === cat)
      .reduce((s, t) => s + (t.appliedDelta || 0), 0);

  // Attendance
  const sessionsHeld = sessionsInMonth.length;
  const sessionsAttended = attendanceInMonth
    .filter(r => r.qualified).length;
  const qualifiedRate = sessionsHeld > 0
    ? Math.round((sessionsAttended / sessionsHeld) * 100) : null;

  // Best session
  const spBySession = {};
  for (const t of transactions) {
    if (!t.sessionLabel) continue;
    spBySession[t.sessionLabel] =
      (spBySession[t.sessionLabel] || 0) + (t.appliedDelta || 0);
  }
  const labels = sessionsInMonth.map(s => s.label);
  let bestSession = null, bestSp = -Infinity;
  for (const label of labels) {
    const sp = spBySession[label] || 0;
    if (sp > bestSp) { bestSp = sp; bestSession = label; }
  }
  if (bestSession !== null && bestSp <= 0) bestSession = null;

  // Poll performance
  const pollsWithData = pollsInMonth.filter(
    p => typeof p.totalQuestions === 'number' &&
    p.totalQuestions > 0
  );
  const pollsCount = pollsWithData.length;
  const avgAttemptedRate = pollsCount > 0
    ? Math.round(
      pollsWithData.reduce(
        (s, p) => s + p.attemptedQuestions / p.totalQuestions, 0
      ) / pollsCount * 100
    )
    : null;

  const cards = [
    { type: 'intro', monthLabel, joinedThisMonth },
    { type: 'sp-earned', totalEarned, totalDeducted, netChange },
    { type: 'category-breakdown',
      attendance: byCategory('attendance'),
      poll: byCategory('poll'),
      manual: byCategory('manual') },
    { type: 'attendance', sessionsAttended,
      sessionsHeld, qualifiedRate },
    { type: 'best-session',
      label: bestSession,
      spEarned: bestSession !== null ? bestSp : null },
    { type: 'poll-performance', avgAttemptedRate, pollsCount },
    { type: 'current-standing',
      level: student.level ?? null,
      trophyLeague: student.trophyLeague ?? null,
      legendBadgeUnlocked: student.legendBadgeUnlocked ?? false,
      currentStreak: streakInfo?.currentStreak ?? null,
      longestStreak: streakInfo?.longestStreak ?? null,
      progressBand: progressInfo?.band ?? null },
    { type: 'lifetime',
      totalSp: student.totalSp || 0,
      memberSinceLabel: student.internshipStartDate
        ? new Date(student.internshipStartDate)
          .toLocaleDateString('en-IN',
            { month: 'long', year: 'numeric' })
        : '—' },
  ];

  return { month, monthLabel, joinedThisMonth, cards };
}