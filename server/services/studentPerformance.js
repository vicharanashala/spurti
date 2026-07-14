import Student from '../models/Student.js';
import SPTransaction from '../models/SPTransaction.js';
import AttendanceRecord from '../models/AttendanceRecord.js';
import PollRecord from '../models/PollRecord.js';
import { levelFor, leagueBand, legendBadge } from './levels.js';

export function aggregatePerformance({ student, transactions, attendance, polls, cohort }, granularity = 'weekly') {
  // 1. Daily buckets to find best performance day
  const dailyBuckets = {};
  for (const tx of transactions) {
    if (tx.category === 'initial') continue;
    const d = new Date(tx.dateTime);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!dailyBuckets[key]) {
      dailyBuckets[key] = {
        key,
        date: `${d.getDate()} ${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear()}`,
        points: 0
      };
    }
    dailyBuckets[key].points += tx.appliedDelta;
  }

  const dailyList = Object.values(dailyBuckets);
  let bestPerformanceDay = null;
  if (dailyList.length > 0) {
    dailyList.sort((a, b) => b.points - a.points);
    bestPerformanceDay = {
      date: dailyList[0].date,
      points: dailyList[0].points
    };
  }

  // 2. Consistency Score
  const qualifiedCount = attendance.filter(a => a.qualified).length;
  const attendanceRate = attendance.length ? qualifiedCount / attendance.length : 1.0;

  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const pollRate = pollTotal ? pollAttempted / pollTotal : 1.0;

  const consistencyScore = Math.round(((attendanceRate + pollRate) / 2) * 100);

  // 3. Achievement Markers
  const attendanceBySession = new Map(attendance.map(r => [r.sessionLabel, r]));
  const pollBySession = new Map(polls.map(r => [r.sessionLabel, r]));

  let highestSpEver = 0;
  let prevLevel = 0;
  let prevLeague = 'Bronze III';
  let prevLegend = false;
  let prevBadgesStr = '';
  const markers = [];

  const seenAttendance = [];
  const seenPolls = [];

  const averageSp = cohort?.averageSp || 0;
  const top50Cutoff = cohort?.top50Cutoff !== undefined && cohort?.top50Cutoff !== null ? cohort.top50Cutoff : null;

  for (const tx of transactions) {
    if (tx.sessionLabel) {
      const att = attendanceBySession.get(tx.sessionLabel);
      if (att && !seenAttendance.some(a => a.sessionLabel === tx.sessionLabel)) {
        seenAttendance.push(att);
      }
      const poll = pollBySession.get(tx.sessionLabel);
      if (poll && !seenPolls.some(p => p.sessionLabel === tx.sessionLabel)) {
        seenPolls.push(poll);
      }
    }

    highestSpEver = Math.max(highestSpEver, tx.balanceAfter);
    const level = levelFor(highestSpEver);
    const league = leagueBand(tx.balanceAfter);
    const legend = legendBadge(highestSpEver);

    const qualifiedPct = seenAttendance.length ? seenAttendance.filter(a => a.qualified).length / seenAttendance.length : 0;
    const pAttempted = seenPolls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
    const pTotal = seenPolls.reduce((sum, p) => sum + p.totalQuestions, 0);

    const currentBadges = [];
    if (top50Cutoff !== null && tx.balanceAfter >= top50Cutoff) currentBadges.push('Top 50');
    if (qualifiedPct >= 0.75) currentBadges.push('Consistent Attendee');
    if (pTotal && (pAttempted / pTotal) >= 0.75) currentBadges.push('Poll Champion');
    if (tx.balanceAfter >= averageSp) currentBadges.push('Above Average');
    if (currentBadges.length === 0) currentBadges.push('Getting Started');

    const badgesStr = [...currentBadges].sort().join(',');

    if (level > prevLevel) {
      markers.push({
        dateTime: tx.dateTime,
        type: 'level',
        value: level,
        label: `Reached Level ${level}`,
        reason: tx.reason
      });
      prevLevel = level;
    }

    if (league !== prevLeague) {
      markers.push({
        dateTime: tx.dateTime,
        type: 'league',
        value: league,
        label: `League: ${league}`,
        reason: tx.reason
      });
      prevLeague = league;
    }

    if (legend && !prevLegend) {
      markers.push({
        dateTime: tx.dateTime,
        type: 'legend',
        value: true,
        label: 'Unlocked Legend Badge',
        reason: tx.reason
      });
      prevLegend = true;
    }

    if (prevBadgesStr && badgesStr !== prevBadgesStr) {
      const prevBadgesSet = new Set(prevBadgesStr.split(','));
      for (const b of currentBadges) {
        if (!prevBadgesSet.has(b)) {
          markers.push({
            dateTime: tx.dateTime,
            type: 'badge',
            value: b,
            label: `Earned Badge: ${b}`,
            reason: tx.reason
          });
        }
      }
    }
    prevBadgesStr = badgesStr;
  }

  // 4. Bucketed Series
  const bucketGroups = {};
  for (const tx of transactions) {
    if (tx.category === 'initial') continue;

    const d = new Date(tx.dateTime);
    if (isNaN(d.getTime())) continue;
    let key, label;

    if (granularity === 'daily') {
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      label = `${day} ${d.toLocaleString('default', { month: 'short' })}`;
    } else if (granularity === 'weekly') {
      const dayOfWeek = d.getDay();
      const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      const y = monday.getFullYear();
      const m = monday.getMonth();
      const day = monday.getDate();
      key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      label = `W/o ${day} ${monday.toLocaleString('default', { month: 'short' })}`;
    } else { // monthly
      const y = d.getFullYear();
      const m = d.getMonth();
      key = `${y}-${String(m + 1).padStart(2, '0')}`;
      label = `${d.toLocaleString('default', { month: 'short' })} ${y}`;
    }

    if (!bucketGroups[key]) {
      bucketGroups[key] = {
        key,
        label,
        attendance: 0,
        poll: 0,
        bonus: 0,
        total: 0,
        activityCount: 0
      };
    }

    if (tx.category === 'attendance') {
      bucketGroups[key].attendance += tx.appliedDelta;
      bucketGroups[key].total += tx.appliedDelta;
      bucketGroups[key].activityCount += 1;
    } else if (tx.category === 'poll') {
      bucketGroups[key].poll += tx.appliedDelta;
      bucketGroups[key].total += tx.appliedDelta;
      bucketGroups[key].activityCount += 1;
    } else if (tx.category === 'manual') {
      bucketGroups[key].bonus += tx.appliedDelta;
      bucketGroups[key].total += tx.appliedDelta;
      bucketGroups[key].activityCount += 1;
    }
  }

  const series = Object.values(bucketGroups).sort((a, b) => a.key.localeCompare(b.key));

  // 5. Summary
  const summary = {
    attendance: 0,
    poll: 0,
    bonus: 0,
    total: 0,
    activityCount: 0
  };
  for (const b of series) {
    summary.attendance += b.attendance;
    summary.poll += b.poll;
    summary.bonus += b.bonus;
    summary.total += b.total;
    summary.activityCount += b.activityCount;
  }

  // 6. Trend
  let trend = 'Stable';
  if (series.length >= 2) {
    const half = Math.floor(series.length / 2);
    const firstHalf = series.slice(0, half);
    const secondHalf = series.slice(series.length - half);

    const sum1 = firstHalf.reduce((sum, b) => sum + b.total, 0);
    const sum2 = secondHalf.reduce((sum, b) => sum + b.total, 0);

    const diff = sum2 - sum1;
    if (diff > 5) {
      trend = 'Upward';
    } else if (diff < -5) {
      trend = 'Downward';
    } else {
      trend = 'Stable';
    }
  }

  return {
    series,
    summary,
    bestPerformanceDay,
    trend,
    consistencyScore,
    achievementMarkers: markers
  };
}

export async function buildPerformanceSeries(email, granularity = 'weekly') {
  const student = await Student.findOne({ $or: [{ email }, { alternateEmail: email }] }).lean();
  if (!student) return null;

  const emailFilter = student.email;
  const activeFilter = { status: { $ne: 'excused' } };
  const [transactions, polls, attendance, allStudents] = await Promise.all([
    SPTransaction.find({ email: emailFilter }).sort({ dateTime: 1, createdAt: 1 }).lean(),
    PollRecord.find({ email: emailFilter }).sort({ sessionLabel: 1 }).lean(),
    AttendanceRecord.find({ email: emailFilter }).sort({ sessionLabel: 1 }).lean(),
    Student.find(activeFilter).sort({ totalSp: -1, name: 1 }).lean()
  ]);

  const allSp = allStudents.map(s => Number(s.totalSp || 0));
  const averageSp = allSp.length ? Math.round(allSp.reduce((sum, value) => sum + value, 0) / allSp.length) : 0;
  const top50Cutoff = allStudents[49]?.totalSp || null;

  const cohort = { averageSp, top50Cutoff };

  return aggregatePerformance({ student, transactions, attendance, polls, cohort }, granularity);
}
