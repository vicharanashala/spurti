import mongoose from 'mongoose';
import OpenAI from 'openai';

import { MONGO_URI } from './config.js';
import Student from './models/Student.js';
import Session from './models/Session.js';
import AttendanceRecord from './models/AttendanceRecord.js';
import PollRecord from './models/PollRecord.js';
import SPTransaction from './models/SPTransaction.js';
import WeeklyRecap from './models/WeeklyRecap.js';

// Routed through Samagama's own OpenAI-compatible API gateway (samagama.in/platform),
// not OpenAI directly — same request/response shape, different backend model.
const RECAP_MODEL = process.env.RECAP_MODEL || 'MiniMaxAI/MiniMax-M2.7';
const RECAP_API_BASE_URL = process.env.RECAP_API_BASE_URL || 'https://samagama.in/platform/proxy/v1';

let _openai = null;
function openaiClient() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.RECAP_API_KEY, baseURL: RECAP_API_BASE_URL });
  return _openai;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    out[key] = value;
  }
  return out;
}

function startOfDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

function weekLabelFor(weekStart, weekEnd) {
  const lastDay = new Date(weekEnd);
  lastDay.setDate(lastDay.getDate() - 1);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(weekStart)} – ${fmt(lastDay)}`;
}

// AttendanceRecord/PollRecord only carry a sessionLabel, not a date, so the week
// boundary is resolved through Session.date (the authoritative session calendar)
// rather than each record's createdAt — records are often batch-ingested together
// via `npm run rebuild`, which would make createdAt useless for "this week" filters.
async function buildDataSnapshot(student, weekStart, weekEnd) {
  const email = student.email;
  const weekSessions = await Session.find({ date: { $gte: weekStart, $lt: weekEnd } }).sort({ date: 1 }).lean();
  const sessionLabels = weekSessions.map(s => s.label);

  const [attendance, polls, transactions, chatDocs] = await Promise.all([
    AttendanceRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean(),
    PollRecord.find({ email, sessionLabel: { $in: sessionLabels } }).lean(),
    SPTransaction.find({ email, dateTime: { $gte: weekStart, $lt: weekEnd } }).lean(),
    // No ChatRecord model/collection exists in this codebase yet (chat SP ingestion
    // is documented as a future step in HOW_TO_USE.md but isn't built). Querying the
    // raw collection name keeps this a harmless no-op until that lands, instead of
    // requiring a model for a collection that doesn't exist.
    mongoose.connection.db.collection('chatrecords')
      .find({ email, sessionLabel: { $in: sessionLabels } })
      .toArray()
      .catch(() => [])
  ]);

  const attendedLabels = new Set(attendance.filter(a => a.qualified).map(a => a.sessionLabel));
  const sessionsAttended = attendedLabels.size;
  const totalSessions = sessionLabels.length;
  const missedSessions = sessionLabels.filter(label => !attendedLabels.has(label));

  const spGained = transactions.filter(t => t.appliedDelta > 0).reduce((sum, t) => sum + t.appliedDelta, 0);
  const spLost = transactions.filter(t => t.appliedDelta < 0).reduce((sum, t) => sum + t.appliedDelta, 0);
  const netSp = spGained + spLost;

  const pollAttempted = polls.reduce((sum, p) => sum + p.attemptedQuestions, 0);
  const pollTotal = polls.reduce((sum, p) => sum + p.totalQuestions, 0);
  const pollAccuracy = pollTotal ? Math.round((pollAttempted / pollTotal) * 100) : null;

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  for (const doc of chatDocs) {
    if (doc.overallSentiment && sentimentCounts[doc.overallSentiment] !== undefined) {
      sentimentCounts[doc.overallSentiment] += 1;
    }
  }
  const chatSentiment = chatDocs.length
    ? Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return {
    studentName: student.name,
    sessionsAttended,
    totalSessions,
    spGained,
    spLost,
    netSp,
    pollAccuracy,
    chatSentiment,
    missedSessions,
    balanceAfter: student.totalSp
  };
}

// Templated stand-in used until RECAP_API_KEY is set, so the rest of the
// feature (route, caching, UI) is testable without API access.
function templatedNarrative(snapshot, firstName) {
  const attendanceLine = snapshot.totalSessions
    ? `You made it to ${snapshot.sessionsAttended} of ${snapshot.totalSessions} sessions this week.`
    : 'There were no sessions to attend this week.';
  // balanceAfter is the student's current live total, not their balance at the
  // end of this specific week (this endpoint can be asked about any past week),
  // so it's stated separately rather than as a result of the weekly delta.
  const spLine = snapshot.netSp > 0
    ? `You gained a net ${snapshot.netSp} Spurti Points this week.`
    : snapshot.netSp < 0
      ? `You lost a net ${Math.abs(snapshot.netSp)} Spurti Points this week.`
      : 'Your Spurti Points held steady this week.';
  const balanceLine = `Your current balance is ${snapshot.balanceAfter} SP.`;
  const pollLine = snapshot.pollAccuracy === null
    ? 'No polls came up this week.'
    : `You answered ${snapshot.pollAccuracy}% of poll questions.`;
  const suggestion = snapshot.missedSessions.length
    ? `Next week, try to catch the sessions you missed (${snapshot.missedSessions.join(', ')}) to keep your streak going.`
    : 'Next week, keep showing up consistently to build on this momentum.';
  return `${firstName}, here's your week: ${attendanceLine} ${spLine} ${balanceLine} ${pollLine} ${suggestion}`;
}

async function writeNarrative(snapshot) {
  const firstName = String(snapshot.studentName || '').split(' ')[0] || snapshot.studentName;

  if (!process.env.RECAP_API_KEY) {
    return templatedNarrative(snapshot, firstName);
  }

  const prompt = `Write a 4-5 sentence encouraging, specific, human-toned weekly recap for ${firstName}, a student in an internship motivation program called Spurti. Use only these stats from their week — do not invent details:

- Sessions attended: ${snapshot.sessionsAttended} of ${snapshot.totalSessions}
- Missed sessions: ${snapshot.missedSessions.length ? snapshot.missedSessions.join(', ') : 'none'}
- Spurti Points gained: +${snapshot.spGained}
- Spurti Points lost: ${snapshot.spLost}
- Net SP change this week: ${snapshot.netSp}
- Current SP balance: ${snapshot.balanceAfter}
- Poll accuracy: ${snapshot.pollAccuracy === null ? 'no polls this week' : `${snapshot.pollAccuracy}%`}
- Chat sentiment: ${snapshot.chatSentiment || 'not tracked this week'}

Address them by first name. Be warm, specific, and grounded in the numbers above — avoid generic filler. Do not use bullet points or headers, write flowing prose. End with exactly one concrete, actionable suggestion for next week.`;

  // MiniMax M2.7 is a reasoning model — it spends tokens on an internal
  // `reasoning` chain before writing the final answer into `content`. Testing
  // against the live gateway showed ~1800 completion tokens used for this
  // prompt (mostly reasoning); tighter budgets (400, 1500) left `content: null`
  // with finish_reason "length" because reasoning alone consumed the budget.
  const completion = await openaiClient().chat.completions.create({
    model: RECAP_MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }]
  });

  const message = completion.choices[0]?.message;
  return (message?.content || '').trim();
}

// Exported for use by the /api/students/:id/recap route. Assumes mongoose is
// already connected (the API server owns that connection); the CLI entrypoint
// below connects/disconnects on its own when this file is run directly.
export async function generateWeeklyRecap({ email, week, force = false }) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const student = await Student.findOne({ email: normalizedEmail });
  if (!student) throw new Error(`No student found for email ${email}`);

  const weekStart = startOfDay(week);
  if (Number.isNaN(weekStart.getTime())) throw new Error(`Invalid week date: ${week}`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekLabel = weekLabelFor(weekStart, weekEnd);

  if (!force) {
    const existing = await WeeklyRecap.findOne({ studentEmail: student.email, weekLabel }).lean();
    if (existing) return existing;
  }

  const dataSnapshot = await buildDataSnapshot(student, weekStart, weekEnd);
  const narrative = await writeNarrative(dataSnapshot);

  const recap = await WeeklyRecap.findOneAndUpdate(
    { studentEmail: student.email, weekLabel },
    {
      studentId: student._id,
      studentEmail: student.email,
      weekLabel,
      weekStart,
      weekEnd,
      narrative,
      dataSnapshot,
      generatedAt: new Date()
    },
    { upsert: true, new: true }
  ).lean();

  console.log(`Weekly recap for ${student.name} (${weekLabel}):\n${narrative}`);
  return recap;
}

function usage() {
  console.error('Usage: node server/generateWeeklyRecap.js --email student@example.com --week 2026-06-23');
  console.error('--week takes the ISO date (YYYY-MM-DD) of the Monday starting that week.');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.email || !options.week) {
    usage();
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);
  try {
    await generateWeeklyRecap({ email: options.email, week: options.week, force: true });
  } finally {
    await mongoose.disconnect();
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
