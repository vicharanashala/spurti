import SPTransaction from '../models/SPTransaction.js';
import Student from '../models/Student.js';
import { weekContaining } from './weeklyWindow.js';

// ============================================================
// SP Trend Aggregator
// Builds the data for the Student SP Trend UI:
//   - trend:     weekly SP totals from the start of the student's program
//   - heatmap:   per-category (attendance / poll / discussion / challenge)
//                per-day (Mon-Sat) totals for the current week
//   - summary:   delta, direction, bestDay, bestCategory, weakestCell,
//                insight, consecutiveUpWeeks
// Pure read — no side effects.
// ============================================================

const IST_OFFSET_MIN = 330;

function istDayKey(d) {
  const s = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, '0')}-${String(s.getUTCDate()).padStart(2, '0')}`;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function bucketWeekStart(date) {
  // Monday 00:00 IST is the start of a week for our purposes.
  const d = new Date(date.getTime() + IST_OFFSET_MIN * 60_000);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ... 6=Sat
  // Treat Sun (0) as the end of the prior week — push to the previous Monday.
  const offset = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - offset);
  return istDayKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0) - IST_OFFSET_MIN * 60_000));
}

// Five summary lines, picked deterministically so the same data
// surfaces the same line — but a different trend shape picks a
// different line. Always returns one (never blank).
const SUMMARY_LINES = {
  bestInRecent:    'Best performance in the last 5 weeks.',
  bouncingBack:    'Bouncing back — keep the rhythm.',
  consistent:      'Maintained a consistent learning rhythm.',
  steadyProgress:  'Steady progress over recent weeks.',
  quartile:        'Building a steady weekly rhythm.'
};

function pickSummary(trend, summary) {
  if (summary.consecutiveUpWeeks >= 3) return SUMMARY_LINES.bestInRecent;
  // Detect a bounce: the week before last was lower than the week before that.
  if (trend.length >= 3) {
    const t = trend.map(p => p.sp);
    const last = t[t.length - 1];
    const prev = t[t.length - 2];
    const before = t[t.length - 3];
    if (last > before && before < prev && summary.direction === 'up') {
      return SUMMARY_LINES.bouncingBack;
    }
  }
  // Stable ±2 for the trailing window of ≥5 weeks.
  if (trend.length >= 5) {
    const tail = trend.slice(-5).map(p => p.sp);
    const range = Math.max(...tail) - Math.min(...tail);
    if (range <= 2) return SUMMARY_LINES.consistent;
  }
  if (summary.direction === 'up') return SUMMARY_LINES.steadyProgress;
  return SUMMARY_LINES.quartile;
}

export async function getSpTrend(email) {
  if (!email) return null;
  const student = await Student.findOne({ email }).select('internshipStartDate name').lean();
  if (!student) return null;

  const startMs = student.internshipStartDate
    ? new Date(student.internshipStartDate).getTime()
    : Date.now() - 90 * 86400_000;

  // Pull every transaction for this student since program start.
  const txns = await SPTransaction.find({
    email,
    dateTime: { $gte: new Date(startMs) }
  })
    .select('appliedDelta category dateTime')
    .lean();

  // Bucket by week.
  const weekMap = new Map();
  for (const t of txns) {
    const wk = bucketWeekStart(t.dateTime);
    weekMap.set(wk, (weekMap.get(wk) || 0) + Math.max(0, t.appliedDelta || 0));
  }

  // Fill missing weeks with 0 so the trend line is continuous.
  const currentMs = Date.now();
  const trend = [];
  // Iterate week by week from start to current.
  let cursorMs = startMs;
  let idx = 1;
  let lastRealSp = 0;
  let prevSp = 0;
  let prevPrevSp = 0;
  let consecutiveUpWeeks = 0;
  let hadTickingActivity = false;
  while (cursorMs <= currentMs) {
    const wk = bucketWeekStart(new Date(cursorMs));
    const sp = weekMap.get(wk) || 0;
    if (sp > 0) hadTickingActivity = true;
    trend.push({ weekStart: wk, sp, weekLabel: `W${idx}` });
    // Update consecutive-up counter.
    if (idx >= 2) {
      if (sp > prevSp) {
        consecutiveUpWeeks = (consecutiveUpWeeks || 0) + 1;
      } else if (sp === prevSp) {
        // No change.
      } else {
        consecutiveUpWeeks = 0;
      }
    }
    prevPrevSp = prevSp;
    prevSp = sp;
    lastRealSp = sp;
    cursorMs += 7 * 86400_000;
    idx += 1;
  }
  // Truncate to the last 26 weeks (a half-year) for cleaner visuals.
  const visualTrend = trend.slice(-26);

  // Heatmap for the current week: Mon-Sat per category.
  const currentWeek = weekContaining();
  const startWeekMs = currentWeek.startMs;
  const endWeekMs = startWeekMs + 7 * 86400_000;
  const weekTxns = txns.filter(t => {
    const ms = t.dateTime.getTime();
    return ms >= startWeekMs && ms < endWeekMs;
  });
  const heatmap = ['attendance', 'poll', 'discussion', 'challenge'].map(category => {
    const days = [];
    for (let dayIdx = 0; dayIdx < 6; dayIdx++) {
      const dayStart = startWeekMs + dayIdx * 86400_000;
      const dayEnd = dayStart + 86400_000;
      const sp = weekTxns.filter(t => {
        if (t.category !== category) return false;
        const ms = t.dateTime.getTime();
        return ms >= dayStart && ms < dayEnd;
      }).reduce((s, t) => s + Math.max(0, t.appliedDelta || 0), 0);
      days.push({
        date: istDayKey(new Date(dayStart - IST_OFFSET_MIN * 60_000)),
        weekday: WEEKDAY_FULL[dayIdx],
        weekdayShort: WEEKDAY_LABELS[dayIdx],
        sp,
        dayIdx
      });
    }
    return { category, days };
  });

  // Derive summary.
  const last = visualTrend.length > 0 ? visualTrend[visualTrend.length - 1].sp : 0;
  const prev = visualTrend.length > 1 ? visualTrend[visualTrend.length - 2].sp : 0;
  const delta = last - prev;
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  // Find best day + best category for this week (excluding zeros).
  const totals = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0 };
  const categoryTotals = { attendance: 0, poll: 0, discussion: 0, challenge: 0 };
  for (const row of heatmap) {
    categoryTotals[row.category] = row.days.reduce((s, d) => s + d.sp, 0);
    for (const d of row.days) totals[d.weekdayShort] += d.sp;
  }
  let bestDay = null;
  let bestDaySp = 0;
  for (const [day, sp] of Object.entries(totals)) {
    if (sp > bestDaySp) { bestDay = day; bestDaySp = sp; }
  }
  let bestCategory = null;
  let bestCategorySp = 0;
  for (const [cat, sp] of Object.entries(categoryTotals)) {
    if (sp > bestCategorySp) { bestCategory = cat; bestCategorySp = sp; }
  }

  // Find weakest cell — for each category, find the day with the
  // lowest SP below the category's median. This is the "clickable
  // weak cell" — students can improve even if they participated but
  // performed below average.
  const weakestCells = [];
  for (const row of heatmap) {
    const values = row.days.map(d => d.sp);
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    row.days.forEach(d => {
      if (d.sp < median) {
        weakestCells.push({
          category: row.category,
          weekday: d.weekday,
          weekdayShort: d.weekdayShort,
          dayIdx: d.dayIdx,
          sp: d.sp
        });
      }
    });
  }
  // Sort weakest cells ascending by SP, then by category / weekday.
  weakestCells.sort((a, b) => a.sp - b.sp);
  const weakestCell = weakestCells[0] || null;

  const summary = {
    delta,
    direction,
    bestDay,
    bestCategory,
    weakestCell,
    insight: '',
    consecutiveUpWeeks: hadTickingActivity ? consecutiveUpWeeks : 0
  };
  summary.insight = pickSummary(visualTrend, summary);

  return {
    email,
    trend: visualTrend,
    heatmap,
    summary,
    studentName: student.name
  };
}