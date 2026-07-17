/**
 * server/services/trajectory.js
 *
 * Pure helpers for the SP Trajectory and At-Risk features.
 *
 * Zero side effects, zero DB. Trivially unit-testable. Mirrors the style
 * of services/adminAward.js, services/excuse.js, services/pulse.js.
 *
 * Two responsibilities:
 *  1. computeMyPoints(transactions) -> the student's balance-over-time series
 *  2. computeCohortAverages(transactions, INITIAL_SP) -> per-session cohort avg
 *  3. computeAtRisk(students, attendanceRecords) -> sorted list of at-risk students
 *
 * Both endpoints (PR #14) use these helpers so the math is testable
 * without spinning up Mongoose.
 */

/** Initial Spurti Points credit every intern receives. Single source of truth. */
export const INITIAL_SP = 100;

/**
 * Compute the running-balance-over-time series for a single student.
 *
 * @param {Object[]} transactions - the student's SPTransaction list, ANY order
 * @returns {{ session: string, balance: number, at: Date }[]}
 *   Sorted by dateTime ascending. The first entry's balance is INITIAL_SP
 *   (because the very first +100 is the initial credit; running balance
 *   before that is 0 and we want the chart to start at the credit value).
 */
export function computeMyPoints(transactions) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  // Detect if the data has an explicit initial-credit entry: a "Start"
  // session with appliedDelta === INITIAL_SP. If so, we skip it (it's
  // already the starting point) and prepend a synthetic "Start" point.
  // If the data has no initial credit recorded, we still prepend "Start"
  // at INITIAL_SP so the chart begins at the student's actual starting
  // balance, then the deltas apply.
  const hasExplicitInitialCredit = transactions.length > 0 &&
    (transactions[0].sessionLabel || '').toLowerCase() === 'start' &&
    Number(transactions[0].appliedDelta || 0) === INITIAL_SP;

  // If the data has the initial credit, skip it; else use all txns.
  const deltas = hasExplicitInitialCredit
    ? transactions.slice(1)
    : transactions;

  // Sort by dateTime asc, fallback to createdAt
  const sorted = [...deltas].sort((a, b) => {
    const da = new Date(a.dateTime || a.createdAt).getTime();
    const db = new Date(b.dateTime || b.createdAt).getTime();
    return da - db;
  });

  let runningBalance = 0;
  const points = sorted.map(t => {
    runningBalance += Number(t.appliedDelta || 0);
    return {
      session: t.sessionLabel || 'Start',
      balance: runningBalance + INITIAL_SP,
      at: new Date(t.dateTime || t.createdAt)
    };
  });

  // Prepend the synthetic "Start" point at the student's starting balance.
  // The at is "before the first transaction" so the chart's leftmost
  // point represents the initial state.
  const earliestAt = points.length > 0
    ? new Date(points[0].at.getTime() - 1)
    : new Date();
  const startPoint = {
    session: 'Start',
    balance: INITIAL_SP,
    at: earliestAt
  };

  return [startPoint, ...points];
}

/**
 * Compute per-session cohort average balance.
 *
 * For each sessionLabel, average the running balance of all students
 * at the END of that session. If no students have transactions for a
 * session, that session is omitted.
 *
 * @param {Object[]} allTransactions  - ALL students' SPTransaction list
 * @returns {{ session: string, avgBalance: number }[]}
 *   Sorted by sessionLabel ascending (alphabetic; for true date order
 *   the caller should re-sort by session date if available).
 */
export function computeCohortAverages(allTransactions) {
  if (!Array.isArray(allTransactions) || allTransactions.length === 0) return [];

  // Group transactions by email
  const byEmail = new Map();
  for (const t of allTransactions) {
    const e = String(t.email || '').toLowerCase();
    if (!byEmail.has(e)) byEmail.set(e, []);
    byEmail.get(e).push(t);
  }

  // Per student: per session, take the END-OF-SESSION running balance.
  // Then average across all students. This is the right semantic for
  // "cohort average at the end of Day N".
  const sessionEndBalances = new Map(); // session -> [endBalance, ...]
  for (const [, txns] of byEmail) {
    const sorted = [...txns].sort((a, b) => {
      const da = new Date(a.dateTime || a.createdAt).getTime();
      const db = new Date(b.dateTime || b.createdAt).getTime();
      return da - db;
    });
    let runningBalance = 0;
    let lastSessionLabel = null;
    let lastSessionBalance = 0;
    for (const t of sorted) {
      runningBalance += Number(t.appliedDelta || 0);
      const lbl = t.sessionLabel || 'Start';
      if (lbl !== lastSessionLabel) {
        // Save the previous session's end balance (if any)
        if (lastSessionLabel !== null) {
          if (!sessionEndBalances.has(lastSessionLabel)) sessionEndBalances.set(lastSessionLabel, []);
          sessionEndBalances.get(lastSessionLabel).push(lastSessionBalance);
        }
        lastSessionLabel = lbl;
        lastSessionBalance = runningBalance;
      } else {
        lastSessionBalance = runningBalance;
      }
    }
    // Don't forget the last session for this student
    if (lastSessionLabel !== null) {
      if (!sessionEndBalances.has(lastSessionLabel)) sessionEndBalances.set(lastSessionLabel, []);
      sessionEndBalances.get(lastSessionLabel).push(lastSessionBalance);
    }
  }

  const out = [];
  for (const [session, vals] of [...sessionEndBalances.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const sum = vals.reduce((s, v) => s + v, 0);
    out.push({
      session,
      avgBalance: vals.length ? Math.round(sum / vals.length) : 0
    });
  }
  return out;
}

/**
 * Build the full trajectory payload (my points + cohort averages).
 * Convenience wrapper for the route handler.
 */
export function buildTrajectoryPayload(studentTransactions, allTransactions) {
  return {
    myPoints: computeMyPoints(studentTransactions),
    cohortAverages: computeCohortAverages(allTransactions)
  };
}

/**
 * Compute the at-risk list. A student is "at risk" if they have missed
 * (i.e. `qualified: false`) CONSECUTIVE_MISS_THRESHOLD OR MORE sessions
 * in a row, ending with the most recent session.
 *
 * @param {Object[]} students       - Student docs
 * @param {Object[]} attendance    - AttendanceRecord docs (any order)
 * @param {Object}  [opts]
 * @param {number}  [opts.threshold=2]   - # consecutive missed sessions
 * @param {number}  [opts.windowSize=5]  - max # recent sessions to inspect
 * @returns {Array<{email, name, totalSp, consecutiveMissed, lastSession, lastActive}>}
 *   Sorted by consecutiveMissed desc (severity).
 */
export function computeAtRisk(students, attendance, opts = {}) {
  const threshold = opts.threshold ?? 2;
  const windowSize = opts.windowSize ?? 5;

  if (!Array.isArray(students) || !Array.isArray(attendance)) return [];

  // Group attendance by email, SORT BY dateTime asc (NOT sessionLabel
  // alphabetical — that's a bug in the original PR).
  const byStudent = new Map();
  for (const rec of attendance) {
    if (!byStudent.has(rec.email)) byStudent.set(rec.email, []);
    byStudent.get(rec.email).push(rec);
  }
  for (const [, recs] of byStudent) {
    recs.sort((a, b) => {
      const da = new Date(a.dateTime || a.createdAt || 0).getTime();
      const db = new Date(b.dateTime || b.createdAt || 0).getTime();
      return da - db;
    });
  }

  const atRisk = [];
  for (const student of students) {
    if (student.status === 'excused') continue;
    const recs = byStudent.get(student.email) || [];
    if (recs.length < threshold) continue;

    // Walk BACKWARD from the most recent record. Count consecutive
    // un-qualified ones. Stop at the first qualified (or windowSize).
    let consecutive = 0;
    const startIdx = Math.max(0, recs.length - windowSize);
    for (let i = recs.length - 1; i >= startIdx; i--) {
      if (!recs[i].qualified) consecutive++;
      else break;
    }

    if (consecutive >= threshold) {
      const lastRec = recs[recs.length - 1];
      atRisk.push({
        email: student.email,
        name: student.name,
        totalSp: student.totalSp,
        consecutiveMissed: consecutive,
        lastSession: lastRec?.sessionLabel || '—',
        lastActive: lastRec?.qualified ? (lastRec.dateTime || null) : null
      });
    }
  }

  atRisk.sort((a, b) => b.consecutiveMissed - a.consecutiveMissed);
  return atRisk;
}