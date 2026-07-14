/**
 * seed-dummies.js
 *
 * Seeds 20 dummy students (@spurti.test) plus enough supporting data
 * (June 2026 sessions, SP transactions, attendance, polls) to populate
 * the weekly leaderboard and the monthly Wrapped story with realistic,
 * *distinct* content per dummy.
 *
 * IDs / emails are tagged with `dummy.` in their `name` field and the
 * `dummy@spurti.test` domain so `remove-dummies.js` can find them later
 * without touching real students.
 *
 * Run with:    node seed-dummies.js
 * Tear down:   node remove-dummies.js   (when you're done testing)
 *
 * NOTE: ChatRecord model is seeded too, so the "Community Star"
 * leaderboard category ("this week’s most positive chat reactions") has a
 * real winner. All other leaderboard categories and every Wrapped card get
 * distinct per-dummy data.
 */

import mongoose from 'mongoose';
import { MONGO_URI } from './server/config.js';

import Student          from './server/models/Student.js';
import Session          from './server/models/Session.js';
import SPTransaction    from './server/models/SPTransaction.js';
import AttendanceRecord from './server/models/AttendanceRecord.js';
import PollRecord       from './server/models/PollRecord.js';
import ChatRecord       from './server/models/ChatRecord.js';
import { leagueBand, levelFor } from './server/services/levels.js';

const DOMAIN = 'spurti.test';

/* ── dummy roster ────────────────────────────────── */
// Each entry: { email, baseName, totalSp, personality }
// `totalSp` is the LIFETIME balance the mock starts with.
// `personality` drives the shape of their June transactions / attendance.
const ROSTER = [
  { email: `dummy1@${DOMAIN}`,  totalSp: 100,  p: 'bronze_starter'   },
  { email: `dummy2@${DOMAIN}`,  totalSp: 250,  p: 'bronze_climber'  },
  { email: `dummy3@${DOMAIN}`,  totalSp: 380,  p: 'silver_avg'      },
  { email: `dummy4@${DOMAIN}`,  totalSp: 540,  p: 'silver_strong'   },
  { email: `dummy5@${DOMAIN}`,  totalSp: 720,  p: 'gold_rising'     },
  { email: `dummy6@${DOMAIN}`,  totalSp: 880,  p: 'gold_solid'      },
  { email: `dummy7@${DOMAIN}`,  totalSp: 1010, p: 'gold_big_gain'   },
  { email: `dummy8@${DOMAIN}`,  totalSp: 1150, p: 'platinum_steady' },
  { email: `dummy9@${DOMAIN}`,  totalSp: 1380, p: 'platinum_quest'  },
  { email: `dummy10@${DOMAIN}`, totalSp: 1620, p: 'legend_legend'   },
  { email: `dummy11@${DOMAIN}`, totalSp: 100,  p: 'newbie'          },
  { email: `dummy12@${DOMAIN}`, totalSp: 240,  p: 'comeback_kid'    },
  { email: `dummy13@${DOMAIN}`, totalSp: 380,  p: 'attendee_perfect' },
  { email: `dummy14@${DOMAIN}`, totalSp: 460,  p: 'poll_master'     },
  { email: `dummy15@${DOMAIN}`, totalSp: 540,  p: 'mixed_balanced'  },
  { email: `dummy16@${DOMAIN}`, totalSp: 720,  p: 'big_bonus_day'   },
  { email: `dummy17@${DOMAIN}`, totalSp: 180,  p: 'slump_recover'   },
  { email: `dummy18@${DOMAIN}`, totalSp: 320,  p: 'quiet_contrib'   },
  { email: `dummy19@${DOMAIN}`, totalSp: 880,  p: 'last_week_champ' },
  { email: `dummy20@${DOMAIN}`, totalSp: 200,  p: 'milestone_500'   },
];

/* ── personalities ───────────────────────────────── */
// Each returns `{ weeklySp, lastWeeklySp, attendAttrs, pollAttrs }`:
//   weeklySp:       SP earned in current week  (drives weekly leaderboard)
//   lastWeeklySp:   SP earned in previous week (drives "Most Improved")
//   attendAttrs:    [{ qualified: bool }] x 8   (June session attendance)
//   pollAttrs:      [{ attemptedQuestions, totalQuestions }] x 8

function attrsFromName(name) {
  const n = String(name).match(/^DUMMY (\w+)/)?.[1] || 'One';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function profileFor(personality, totalSp) {
  switch (personality) {
    case 'bronze_starter':
      return {
        weeklySp: 35, lastWeeklySp: 18,
        att: [0,1,1,0,1,1,0,0].map(q => ({ qualified: !!q })),
        polls: lowPolls(),
      };
    case 'bronze_climber':
      return {
        weeklySp: 55, lastWeeklySp: 25,
        att: [1,0,1,1,1,1,0,0].map(q => ({ qualified: !!q })),
        polls: lowPolls(),
      };
    case 'silver_avg':
      return {
        weeklySp: 95, lastWeeklySp: 70,
        att: [1,1,1,0,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'silver_strong':
      return {
        weeklySp: 130, lastWeeklySp: 90,
        att: [1,1,1,1,1,0,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'gold_rising':
      return {
        weeklySp: 175, lastWeeklySp: 140,
        att: [1,1,1,1,0,1,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'gold_solid':
      return {
        weeklySp: 220, lastWeeklySp: 180,
        att: [1,1,1,1,1,1,0,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'gold_big_gain':
      return {
        weeklySp: 310, lastWeeklySp: 150,
        att: [1,1,1,1,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'platinum_steady':
      return {
        weeklySp: 250, lastWeeklySp: 220,
        att: [1,1,1,1,1,1,1,0].map(q => ({ qualified: !!q })),
        polls: highPolls(),
      };
    case 'platinum_quest':
      return {
        weeklySp: 340, lastWeeklySp: 260,
        att: [1,1,1,1,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: highPolls(),
      };
    case 'legend_legend':      // top dog — wins Weekly Champion by a lot
      return {
        weeklySp: 420, lastWeeklySp: 350,
        att: [1,1,1,1,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: highPolls(),
      };
    case 'newbie':             // joined this week → very small numbers, joinedThisMonth true
      return {
        weeklySp: 10, lastWeeklySp: 0,
        att: [0,0,0,0,0,0,0,0].map(q => ({ qualified: !!q })),
        polls: lowPolls(),
      };
    case 'comeback_kid':       // last week < 40%, this week ≥ 60% → "Biggest Comeback"
      return {
        weeklySp: 200, lastWeeklySp: 80,
        att: [0,0,0,0,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'attendee_perfect':   // 100% qualification → "Most Consistent"
      return {
        weeklySp: 105, lastWeeklySp: 100,
        att: [1,1,1,1,1,1,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'poll_master':        // ~95% attempted → standout on Poll Card
      return {
        weeklySp: 165, lastWeeklySp: 110,
        att: [1,1,0,1,1,1,1,0].map(q => ({ qualified: !!q })),
        polls: highPolls(),
      };
    case 'mixed_balanced':
      return {
        weeklySp: 125, lastWeeklySp: 105,
        att: [1,0,1,1,1,0,1,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'big_bonus_day':      // big manual award on a single best session
      return {
        weeklySp: 240, lastWeeklySp: 130,
        att: [1,0,1,0,1,1,0,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'slump_recover':
      return {
        weeklySp: 45, lastWeeklySp: 5,
        att: [1,0,1,0,1,0,1,0].map(q => ({ qualified: !!q })),
        polls: lowPolls(),
      };
    case 'quiet_contrib':      // solid bronze, decent attendance
      return {
        weeklySp: 85, lastWeeklySp: 70,
        att: [1,1,0,0,1,1,1,0].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'last_week_champ':    // won last week big, smaller this week
      return {
        weeklySp: 30, lastWeeklySp: 380,
        att: [0,1,0,1,0,1,0,0].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    case 'milestone_500':      // crosses lifetime 500 this month (Lifetime Card delta)
      return {
        weeklySp: 110, lastWeeklySp: 90,
        att: [1,1,0,1,1,1,0,1].map(q => ({ qualified: !!q })),
        polls: midPolls(),
      };
    default:
      return {
        weeklySp: 0, lastWeeklySp: 0,
        att: Array(8).fill({ qualified: false }),
        polls: lowPolls(),
      };
  }
}

function lowPolls()  { return Array(8).fill({ attempted: 3, total: 5 }); }
function midPolls()  { return Array(8).fill({ attempted: 4, total: 5 }); }
function highPolls() { return Array(8).fill({ attempted: 5, total: 5 }); }

/* ── date helpers ────────────────────────────────── */

// First day (00:00 IST = 18:30Z the day before) of the given YYYY-MM
function juneMonthRange() {
  const start = new Date('2026-06-01T00:00:00+05:30');  // June 1, 2026 IST
  const end   = new Date('2026-07-01T00:00:00+05:30');  // exclusive
  return { start, end };
}

// 8 weekday sessions spaced through June 2026 (Mon/Wed/Fri evenings)
function juneSessions() {
  // hard-coded labels so SPTransaction.sessionLabel matches cleanly
  const dates = [
    '2026-06-01T18:00:00+05:30',  // Mon  week 1
    '2026-06-03T18:00:00+05:30',
    '2026-06-05T18:00:00+05:30',
    '2026-06-08T18:00:00+05:30',  // Mon  week 2
    '2026-06-10T18:00:00+05:30',
    '2026-06-12T18:00:00+05:30',
    '2026-06-15T18:00:00+05:30',  // Mon  week 3
    '2026-06-17T18:00:00+05:30',
  ];
  return dates.map((iso, i) => {
    const start = new Date(iso);
    const end   = new Date(new Date(iso).getTime() + 60 * 60 * 1000);
    return {
      label:          `JUNE-2026-S${i + 1}`,
      date:           start,
      startDateTime:  start,
      endDateTime:    end,
      totalMinutes:   60,
      type:           'mock',
    };
  });
}

// Current week (this Mon → next Mon) and last week boundaries, server-local TZ
function weekRanges() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun..6=Sat
  const diffToMon = day === 0 ? -6 : 1 - day;
  const thisMon = new Date(now);
  thisMon.setHours(0, 0, 0, 0);
  thisMon.setDate(now.getDate() + diffToMon);
  const nextMon = new Date(thisMon);
  nextMon.setDate(thisMon.getDate() + 7);
  const lastMon = new Date(thisMon);
  lastMon.setDate(thisMon.getDate() - 7);
  return { thisStart: thisMon, thisEnd: nextMon, lastStart: lastMon, lastEnd: thisMon };
}

/* ── main ────────────────────────────────────────── */
async function run() {
  await mongoose.connect(MONGO_URI);

  const { start: juneStart, end: juneEnd } = juneMonthRange();
  const sessions = juneSessions();
  const { thisStart, lastStart, lastEnd } = weekRanges();
  const weekLabelsThis = ['WLW-CURR-1', 'WLW-CURR-2'];          // 2 sessions this week
  const weekLabelsLast = ['WLW-PREV-1', 'WLW-PREV-2'];          // 2 sessions last week

  /* wipe existing dummies (idempotent re-run) */
  const emails = ROSTER.map(r => r.email);
  await Student.deleteMany({ email: { $in: emails } });
  await SPTransaction.deleteMany({ email: { $in: emails } });
  await AttendanceRecord.deleteMany({ email: { $in: emails } });
  await PollRecord.deleteMany({ email: { $in: emails } });
  await ChatRecord.deleteMany({ email: { $in: emails } });

  // Build student docs
  const students = ROSTER.map(r => {
    const realName = `DUMMY ${attrsFromName(r.email.split('@')[0])} (dummy)`;
    return {
      name:                realName,            // name flagged with "(dummy)"
      email:               r.email,
      alternateEmail:      '',
      internshipStartDate: new Date('2026-05-20T09:00:00+05:30'),
      internshipEndDate:   new Date('2026-07-31T09:00:00+05:30'),
      status:              'active',
      totalSp:             r.totalSp,
      highestSpEver:       r.totalSp,
      level:               levelFor(r.totalSp),
      trophyLeague:        leagueBand(r.totalSp),
      legendBadgeUnlocked: false,
      leaderboardGroup:    '2026-05-16_to_2026-05-31',
    };
  });
  const inserted = await Student.insertMany(students);
  const idByEmail = Object.fromEntries(inserted.map(s => [s.email, s._id]));

  // Insert June sessions (only if not already present)
  for (const s of sessions) {
    const exists = await Session.findOne({ label: s.label }).lean();
    if (!exists) await Session.create(s);
  }

  // Insert the synthetic week-window Session docs so that
  // weekly-leaderboard.js (which derives labels from the Session collection
  // by endDateTime) actually picks up the WLW-CURR-* / WLW-PREV-* labels.
  // Without these, "thisWeekLabels" is empty -> chatMap / attThis are empty
  // -> mostConsistent / biggestComeback / communityStar all resolve to null.
  //
  // weeklyLeaderboard.js defines this week as [thisMon, thisMon+7d).
  // Place each synthetic session near the middle of its target window so the
  // endDateTime definitely lands in [Mon, +Mon).
  const weekSessions = [
    { label: 'WLW-PREV-1', when: new Date(lastStart.getTime() + 1 * 86400000) },  // Tue last week
    { label: 'WLW-PREV-2', when: new Date(lastStart.getTime() + 3 * 86400000) },  // Thu last week
    { label: 'WLW-CURR-1', when: new Date(thisStart.getTime() + 2 * 86400000) },  // Wed this week
    { label: 'WLW-CURR-2', when: new Date(thisStart.getTime() + 4 * 86400000) },  // Fri this week
  ].map(w => {
    const start = w.when;
    const end   = new Date(start.getTime() + 60 * 60 * 1000);
    return {
      label:         w.label,
      date:          start,
      startDateTime: start,
      endDateTime:   end,
      totalMinutes:  60,
      type:          'mock-weekly',
    };
  });
  for (const w of weekSessions) {
    const exists = await Session.findOne({ label: w.label }).lean();
    if (!exists) await Session.create(w);
  }

  /* ── June activity: attendance + polls + transactions per dummy ── */
  const txDocs = [];
  const attDocs = [];
  const pollDocs = [];
  const chatDocs = [];

  for (const r of ROSTER) {
    const studentId = idByEmail[r.email];
    const prof = profileFor(r.p, r.totalSp);

    // Attendance + polls for each of 8 June sessions
    sessions.forEach((sess, idx) => {
      const att = prof.att[idx];
      attDocs.push({
        email:               r.email,
        studentId,
        sessionLabel:        sess.label,
        attendedMinutes:     att.qualified ? 60 : 30,
        totalSessionMinutes: 60,
        attendancePercentage: att.qualified ? 100 : 50,
        qualified:           att.qualified,
      });

      const p = prof.polls[idx];
      pollDocs.push({
        email:                r.email,
        studentId,
        sessionLabel:         sess.label,
        totalQuestions:       p.total,
        attemptedQuestions:   p.attempted,
        missedQuestions:      p.total - p.attempted,
      });

      // SP transaction for each June session
      // Allocate the dummy's monthly SP delta across sessions weighted by attendance
      const sessionSp = Math.round(prof.weeklySp * 0.25); // ~4 weeks worth per month
      if (att.qualified) {
        txDocs.push({
          email:         r.email,
          studentId,
          category:      'attendance',
          sessionLabel:  sess.label,
          deltaMode:     'absolute',
          deltaValue:    sessionSp,
          appliedDelta:  sessionSp,
          balanceAfter:  0,
          reason:        'Session attendance (dummy)',
          dateTime:      sess.endDateTime,
        });
      }
      // Per-session poll SP (smaller)
      if (p.attempted >= 3) {
        const pollSp = Math.round(p.attempted * 2);
        txDocs.push({
          email:         r.email,
          studentId,
          category:      'poll',
          sessionLabel:  sess.label,
          deltaMode:     'absolute',
          deltaValue:    pollSp,
          appliedDelta:  pollSp,
          balanceAfter:  0,
          reason:        'Poll participation (dummy)',
          dateTime:      sess.endDateTime,
        });
      }
    });

    // "Big bonus day" gets one juicy manual award on the middle June session
    if (r.p === 'big_bonus_day') {
      txDocs.push({
        email:         r.email,
        studentId,
        category:      'manual',
        sessionLabel:  sessions[4].label,
        deltaMode:     'absolute',
        deltaValue:    120,
        appliedDelta:  120,
        balanceAfter:  0,
        reason:        'Outstanding project demo (dummy)',
        dateTime:      sessions[4].endDateTime,
      });
    }

    // "Manual award" appears for several personalities so the Wrapped
    // category-breakdown card has variation.
    if (['platinum_quest', 'gold_big_gain', 'poll_master', 'mixed_balanced'].includes(r.p)) {
      txDocs.push({
        email:         r.email,
        studentId,
        category:      'manual',
        sessionLabel:  sessions[6].label,
        deltaMode:     'absolute',
        deltaValue:    40,
        appliedDelta:  40,
        balanceAfter:  0,
        reason:        'Mentor recognition (dummy)',
        dateTime:      sessions[6].endDateTime,
      });
    }

    /* ── Weekly leaderboard window ───────────────── */
    // 1 synthetic session this week + 1 last week, plus transactions
    for (const label of weekLabelsThis) {
      txDocs.push({
        email:         r.email,
        studentId,
        category:      'attendance',
        sessionLabel:  label,
        deltaMode:     'absolute',
        deltaValue:    prof.weeklySp,
        appliedDelta:  prof.weeklySp,
        balanceAfter:  0,
        reason:        'Weekly session (dummy)',
        dateTime:      new Date(thisStart.getTime() + 60 * 60 * 1000),
      });
    }
    for (const label of weekLabelsLast) {
      txDocs.push({
        email:         r.email,
        studentId,
        category:      'attendance',
        sessionLabel:  label,
        deltaMode:     'absolute',
        deltaValue:    prof.lastWeeklySp,
        appliedDelta:  prof.lastWeeklySp,
        balanceAfter:  0,
        reason:        'Weekly session (dummy)',
        dateTime:      new Date(lastStart.getTime() + 60 * 60 * 1000),
      });
    }

    /* ── Chat activity this week (drives "Community Star" category) ── */
    // 2 dummies are set up to win the category outright. Others get a small
    // base of positive reactions so the leaderboard has variation (not just
    // two zeros and two winners).
    let chatPositive;
    let chatMessages;
    switch (r.p) {
      case 'platinum_quest':   chatPositive = 18; chatMessages = 42; break;
      case 'poll_master':       chatPositive = 14; chatMessages = 38; break;
      case 'gold_big_gain':     chatPositive = 11; chatMessages = 30; break;
      case 'mixed_balanced':    chatPositive =  9; chatMessages = 28; break;
      case 'silver_strong':     chatPositive =  7; chatMessages = 22; break;
      case 'last_week_champ':   chatPositive =  6; chatMessages = 20; break;
      case 'attendee_perfect':  chatPositive =  5; chatMessages = 18; break;
      case 'quiet_contrib':     chatPositive =  4; chatMessages = 14; break;
      case 'gold_solid':        chatPositive =  3; chatMessages = 12; break;
      case 'platinum_steady':   chatPositive =  3; chatMessages = 11; break;
      case 'gold_rising':       chatPositive =  2; chatMessages = 10; break;
      case 'comeback_kid':      chatPositive =  2; chatMessages =  9; break;
      case 'bronze_climber':    chatPositive =  1; chatMessages =  7; break;
      case 'silver_avg':        chatPositive =  1; chatMessages =  6; break;
      default:                  chatPositive =  0; chatMessages =  4;
    }
    // Spread the positive counts across the two synthetic "this week" sessions.
    const split1 = Math.ceil(chatPositive * 0.6);
    const split2 = chatPositive - split1;
    for (const [label, pos] of [[weekLabelsThis[0], split1], [weekLabelsThis[1], split2]]) {
      if (pos > 0 || chatMessages > 0) {
        chatDocs.push({
          email:         r.email,
          studentId,
          sessionLabel:  label,
          positiveCount: pos,
          messageCount:  Math.max(pos, Math.ceil(chatMessages / 2)),
        });
      }
    }
  }

  // balanceAfter isn't actively queried for display, but the model requires it.
  // Recompute it cheaply: walk this dummy's sorted tx list and apply.
  // (Belt-and-braces — won't break anything if user re-runs.)
  const balances = {};
  for (const t of txDocs) {
    balances[t.email] = (balances[t.email] || 0) + t.appliedDelta;
    t.balanceAfter = balances[t.email];
  }

  // Insert dummy-only AttendanceRecord rows for the synthetic weekly labels
  // so "Most Consistent" / "Biggest Comeback" categories resolve correctly.
  // Real students have no AttendanceRecord for these synthetic labels, so the
  // per-dummy winners of these categories come purely from this dataset.
  const weeklyAttDocs = [];
  for (const r of ROSTER) {
    const studentId = idByEmail[r.email];
    const prof = profileFor(r.p, r.totalSp);
    // Take last 2 att flags from the June profile (re-uses existing behavior).
    const lastTwo = prof.att.slice(-2).map(a => !!a.qualified);
    weeklyAttDocs.push({
      email:                r.email,
      studentId,
      sessionLabel:         'WLW-CURR-1',
      attendedMinutes:      lastTwo[0] ? 60 : 30,
      totalSessionMinutes:  60,
      attendancePercentage: lastTwo[0] ? 100 : 50,
      qualified:            lastTwo[0],
    });
    weeklyAttDocs.push({
      email:                r.email,
      studentId,
      sessionLabel:         'WLW-CURR-2',
      attendedMinutes:      lastTwo[1] ? 60 : 30,
      totalSessionMinutes:  60,
      attendancePercentage: lastTwo[1] ? 100 : 50,
      qualified:            lastTwo[1],
    });
    // Last-week attendance is derived so 'comeback_kid' (prior <40% / this >=60%)
    // and 'attendee_perfect' (always 100%) categories resolve correctly.
    // Heuristic: 80% of dummies got last-week attendance same as this-week
    // (steady state); the 'comeback_kid' personality specifically had a low
    // prior week (1/2 = 50% — close to <40%) — so push to 1/2 = 50% (still >40%).
    // Use 0/2 for last week to guarantee <40%, and use the same this-week
    // pattern for everyone else (steady).
    const lastTwoPrev = (r.p === 'comeback_kid') ? [false, false] : lastTwo;
    weeklyAttDocs.push({
      email:                r.email,
      studentId,
      sessionLabel:         'WLW-PREV-1',
      attendedMinutes:      lastTwoPrev[0] ? 60 : 30,
      totalSessionMinutes:  60,
      attendancePercentage: lastTwoPrev[0] ? 100 : 50,
      qualified:            lastTwoPrev[0],
    });
    weeklyAttDocs.push({
      email:                r.email,
      studentId,
      sessionLabel:         'WLW-PREV-2',
      attendedMinutes:      lastTwoPrev[1] ? 60 : 30,
      totalSessionMinutes:  60,
      attendancePercentage: lastTwoPrev[1] ? 100 : 50,
      qualified:            lastTwoPrev[1],
    });
  }
  await AttendanceRecord.insertMany(weeklyAttDocs);

  await AttendanceRecord.insertMany(attDocs);
  await PollRecord.insertMany(pollDocs);
  await SPTransaction.insertMany(txDocs);
  if (chatDocs.length) await ChatRecord.insertMany(chatDocs);

  console.log('─'.repeat(56));
  console.log('Seeded 20 dummies at @spurti.test');
  console.log('Sessions inserted:', sessions.length);
  console.log('Attendance records:', attDocs.length);
  console.log('Poll records:     ', pollDocs.length);
  console.log('Chat records:     ', chatDocs.length);
  console.log('SP transactions:  ', txDocs.length);
  console.log('Tear down later with:  node remove-dummies.js');
  console.log('─'.repeat(56));

  await mongoose.disconnect();
}

run().catch(async err => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});