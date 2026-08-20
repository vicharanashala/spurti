'use strict';
/**
 * sync-poll-records.cjs
 *
 * Populates/updates sakshi_spurti.pollrecords from sptransactions
 * (category='poll'). The counterpart of sync-attendance-records.cjs.
 *
 * WHY THIS WAS REWRITTEN (2026-08-14). The old pipeline/sync-poll-records.js
 * was left behind by the 2026-06-28 move of scoring off the samagama side, in
 * three ways at once:
 *   1. it required modules by absolute path under /var/samagama/server/, which
 *      the sakshi user cannot read;
 *   2. it loaded .env from that same unreadable directory, so MONGO_URI came
 *      back undefined;
 *   3. it kept a .js extension in a repo whose package.json is
 *      "type": "module", so `require` is not even defined at parse time.
 * sync-attendance-records got all three fixed and was added to sp-refresh.sh.
 * This one did not, and nothing has written pollrecords since 2026-06-27 —
 * the day before that move. Run from the repo root.
 *
 *   DRY_RUN=1 node pipeline/sync-poll-records.cjs   # counts + sample, no writes
 *   node pipeline/sync-poll-records.cjs             # live
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set. Run this from the repo root so .env is picked up:');
  console.error('  cd ~/spurti && node pipeline/sync-poll-records.cjs');
  process.exit(1);
}

const DRY = process.env.DRY_RUN === '1';
// Zoom-era reason text, e.g.
//   "Day 20 (8 Jun): answered 3 of 16 poll questions (18.8%) -> 0 SP."
const POLL_RE = /answered (\d+) of (\d+) poll questions/;
// From this date poll SP comes from Spandan, whose reason string is
// correctness-based and carries no "answered X of Y", so participation has to
// come from the spandan_polls mirror instead.
const CUTOFF = process.env.SPANDAN_CUTOFF || '2026-07-16';

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('sakshi_spurti');

  const students = await db.collection('students')
    .find({}, { projection: { _id: 1, email: 1 } }).toArray();
  const studentById = new Map(
    students.filter(s => typeof s.email === 'string')
            .map(s => [s.email.toLowerCase().trim(), s._id]));

  // Spandan participation, keyed email|YYYY-MM-DD. `date` is stored as a string
  // in this mirror; normalise anyway so a Date would still join rather than
  // silently matching nothing.
  const asDay = (d) => (d instanceof Date ? d.toISOString() : String(d || '')).slice(0, 10);
  const spByEmailDate = new Map();
  let spandanDocs = 0;
  for (const sp of await db.collection('spandan_polls').find({}).toArray()) {
    const day = asDay(sp.date);
    if (day < CUTOFF) continue;
    spandanDocs++;
    for (const x of sp.students || []) {
      const e = String(x.email || '').toLowerCase().trim();
      if (!e) continue;
      spByEmailDate.set(e + '|' + day, {
        attempted: x.questionsAnswered || 0,
        total: sp.totalQuestions || 0,
      });
    }
  }

  const txns = await db.collection('sptransactions').find({ category: 'poll' }).toArray();
  console.log(`poll txns: ${txns.length} | spandan docs >= ${CUTOFF}: ${spandanDocs} | spandan keys: ${spByEmailDate.size}`);

  const ops = [];
  let skipped = 0, viaSpandan = 0, viaReason = 0, noSource = 0;
  for (const tx of txns) {
    const email = (tx.email || '').toLowerCase().trim();
    const sessionLabel = tx.sessionLabel || '';
    if (!email || !sessionLabel) { skipped++; continue; }

    const day = tx.dateTime ? asDay(tx.dateTime) : '';
    const spd = spByEmailDate.get(email + '|' + day);
    let attemptedQuestions, totalQuestions;
    if (spd) {
      attemptedQuestions = spd.attempted; totalQuestions = spd.total; viaSpandan++;
    } else {
      const m = POLL_RE.exec(tx.reason || '');
      if (m) { attemptedQuestions = Number(m[1]); totalQuestions = Number(m[2]); }
      else {
        // Fallback: try to extract "N of M" from reason string for any format variant.
        fallM = tx.reason && tx.reason.match(/(\d+)\s+of\s+(\d+)/i);
        if (fallM) { attemptedQuestions = Number(fallM[1]); totalQuestions = Number(fallM[2]); }
      }
      if (m || fallM) { viaReason++; }
      else { noSource++; continue; }
    }
    const studentId = studentById.get(email) || null;

    ops.push({ updateOne: {
      filter: { email, sessionLabel },
      update: {
        $set: {
          email, sessionLabel, totalQuestions, attemptedQuestions,
          missedQuestions: Math.max(0, totalQuestions - attemptedQuestions),
          ...(studentId ? { studentId } : {}),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      upsert: true } });
  }

  console.log(`mapped ${ops.length} | via spandan ${viaSpandan} | via reason ${viaReason} | neither ${noSource} | skipped ${skipped}`);

  if (DRY) {
    const before = await db.collection('pollrecords').countDocuments();
    const labels = (await db.collection('pollrecords').distinct('sessionLabel')).length;
    console.log(`DRY_RUN — pollrecords now ${before} rows / ${labels} labels. Nothing written.`);
    await client.close();
    return;
  }

  // bulkWrite in chunks; the old script awaited one updateOne per txn, which is
  // ~43k round trips.
  const chunk = 5000;
  for (let i = 0; i < ops.length; i += chunk) {
    await db.collection('pollrecords').bulkWrite(ops.slice(i, i + chunk), { ordered: false });
  }

  const after = await db.collection('pollrecords').countDocuments();
  const labels = (await db.collection('pollrecords').distinct('sessionLabel')).length;
  console.log(`Done. pollrecords: ${after} rows across ${labels} session labels.`);
  await client.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
