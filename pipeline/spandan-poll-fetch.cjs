'use strict';
/**
 * spandan-poll-fetch.cjs
 *
 * Pulls ended poll sessions from the Spandan Research Session Export API and
 * mirrors the qualifying ones into `spandan_polls` (one doc per session, keyed
 * by roomId). This REPLACES the retired Zoom poll source for SP dates on/after
 * the cutoff. It is purely additive/non-destructive: it never touches
 * sptransactions, students, or any existing collection.
 *
 * Qualifying session = name matches /^Day N/ (the numbered classroom evening
 * sessions) AND date >= CUTOFF. Non-Day sessions (FDP events, "19th July
 * Evening Session" Sunday makeup) and pre-cutoff days are skipped.
 *
 * Incremental: stores the API's nextCursor in `spandan_sync` and passes it as
 * ?since= on the next run, so a scheduled job never misses or double-counts.
 *
 * Env (from .env): MONGO_URI, SPANDAN_RESEARCH_KEY
 * Flags:
 *   FULL=1  ignore the stored cursor and re-pull from the beginning (backfill)
 *   DRY=1   print what would be written; touch nothing
 *
 * Scoring itself lives in the rubric (sp-rubric-build-mirror.cjs), not here:
 * per day, top scorer = 100%, others = pointsEarned / dayTop * 100, banded
 * 10/5/3/0. This script just stores the raw session results + a convenience
 * `topPoints` for that computation.
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

const BASE = 'https://spandan.fun/spandan/api/research/sessions';
const CUTOFF = '2026-07-16';            // first full-cohort evening session (Day 53)
const DAY_RE = /^Day\s+(\d+)\b/i;       // only numbered "Day N ..." sessions count
const PAGE = 1000;

const { MONGO_URI, SPANDAN_RESEARCH_KEY } = process.env;
const FULL = process.env.FULL === '1';
const DRY = process.env.DRY === '1';

const lc = (s) => String(s || '').toLowerCase().trim();

async function fetchPage(since) {
  const url = new URL(BASE);
  url.searchParams.set('preset', 'evening');
  url.searchParams.set('limit', String(PAGE));
  if (since) url.searchParams.set('since', since);
  const r = await fetch(url, { headers: { 'X-Research-Key': SPANDAN_RESEARCH_KEY } });
  if (!r.ok) throw new Error(`Spandan API ${r.status}: ${await r.text().catch(() => '')}`);
  return r.json();
}

(async () => {
  if (!MONGO_URI) { console.error('missing MONGO_URI'); process.exit(1); }
  if (!SPANDAN_RESEARCH_KEY) { console.error('missing SPANDAN_RESEARCH_KEY'); process.exit(1); }

  const client = await MongoClient.connect(MONGO_URI);
  const db = client.db();                // db name comes from the URI
  const sync = db.collection('spandan_sync');
  const polls = db.collection('spandan_polls');

  let since = null;
  if (!FULL) {
    const cur = await sync.findOne({ _id: 'cursor' });
    since = cur ? cur.value : null;
  }
  console.log(`spandan-poll-fetch: ${FULL ? 'FULL backfill' : since ? `since ${since}` : 'first run (all)'}${DRY ? ' [DRY]' : ''}`);

  let kept = 0, seen = 0, lastCursor = since;
  while (true) {
    const data = await fetchPage(since);
    seen += data.count;
    for (const s of data.sessions) {
      const m = DAY_RE.exec(s.name || '');
      if (!m) continue;                  // not a numbered Day session
      if (s.date < CUTOFF) continue;     // pre-switchover
      const students = (s.students || []).map((x) => ({
        email: lc(x.studentEmail),
        pointsEarned: x.pointsEarned || 0,
        questionsAnswered: x.questionsAnswered || 0,
      })).filter((x) => x.email);
      const topPoints = students.reduce((mx, x) => Math.max(mx, x.pointsEarned), 0);
      const doc = {
        roomId: s.roomId,
        name: s.name,
        dayNumber: Number(m[1]),
        date: s.date,
        endedAt: new Date(s.endedAt),
        totalQuestions: s.totalQuestions || 0,
        maxPoints: s.maxPoints || 0,
        topPoints,
        studentCount: students.length,
        students,
        updatedAt: new Date(),
      };
      if (DRY) {
        console.log(`  KEEP ${doc.date} Day ${doc.dayNumber} | Q${doc.totalQuestions} max${doc.maxPoints} top${topPoints} | ${doc.studentCount} students`);
      } else {
        await polls.updateOne({ roomId: doc.roomId }, { $set: doc, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      }
      kept++;
    }
    lastCursor = data.nextCursor || lastCursor;
    if (!DRY && lastCursor) await sync.updateOne({ _id: 'cursor' }, { $set: { value: lastCursor, updatedAt: new Date() } }, { upsert: true });
    if (data.count < PAGE) break;        // last page
    since = data.nextCursor;
  }

  console.log(`Done. scanned ${seen} evening session(s), kept ${kept} Day-N session(s) >= ${CUTOFF}. cursor=${lastCursor}${DRY ? ' (not saved)' : ''}`);
  await client.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
