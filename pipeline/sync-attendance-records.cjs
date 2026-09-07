'use strict';
/**
 * sync-attendance-records.js
 *
 * Populates/updates sakshi_spurti.attendancerecords from sptransactions
 * (category='attendance'). sp-rubric-build writes accurate SP transactions
 * but never touches attendancerecords, so the Session Health widget in
 * Sakshi's app shows stale/missing data for sessions after May 27.
 *
 * For each attendance transaction, upserts an AttendanceRecord with:
 *   qualified = appliedDelta > 0  (student earned any attendance SP)
 *   attendedMinutes / totalSessionMinutes / attendancePercentage parsed
 *   from the reason string (format: "... present X of Y min (Z%) ...")
 *
 * Safe to re-run (upsert by email+sessionLabel).
 */
// Local modules and local .env. This used to reach into
// /var/samagama/server/... from when scoring lived on the samagama side; after
// the 2026-06-28 move the sakshi user cannot READ that .env, so dotenv loaded
// nothing, MONGO_URI came back undefined, and MongoClient.connect(undefined)
// died with "Cannot read properties of undefined (reading 'startsWith')" —
// which looks nothing like a permissions problem. Run from the repo root.
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

if (!process.env.MONGO_URI) {
  // Fail with something legible instead of the startsWith error above.
  console.error('MONGO_URI is not set. Run this from the repo root so .env is picked up:');
  console.error('  cd ~/spurti && node pipeline/sync-attendance-records.cjs');
  process.exit(1);
}

const REASON_RE = /present (\d+) of (\d+) min \(([\d.]+)%\)/;

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('sakshi_spurti');

  const students = await db.collection('students').find({}, { projection: { _id: 1, email: 1 } }).toArray();
  const studentById = new Map(students.map(s => [s.email.toLowerCase().trim(), s._id]));

  const txns = await db.collection('sptransactions')
    .find({ category: 'attendance' })
    .toArray();

  // Batched, not one await per row. This used to issue a separate round trip
  // for every attendance transaction — around 60,000 of them, sequentially,
  // which pushed the box's load average past 20 and would have tripped
  // sp-refresh's own MAX_LOAD guard and skipped the cycle. Same writes, same
  // upsert semantics, a few dozen round trips instead.
  const BATCH = 1000;
  let upserted = 0, skipped = 0, ops = [];

  const flush = async () => {
    if (!ops.length) return;
    const r = await db.collection('attendancerecords').bulkWrite(ops, { ordered: false });
    upserted += (r.upsertedCount || 0) + (r.modifiedCount || 0);
    ops = [];
  };

  for (const tx of txns) {
    const email = (tx.email || '').toLowerCase().trim();
    if (!email) { skipped++; continue; }
    const sessionLabel = tx.sessionLabel || '';
    if (!sessionLabel) { skipped++; continue; }

    const qualified = (tx.appliedDelta || 0) > 0;
    const m = REASON_RE.exec(tx.reason || '');
    const attendedMinutes = m ? Number(m[1]) : 0;
    const totalSessionMinutes = m ? Number(m[2]) : 1;
    const attendancePercentage = m ? Number(m[3]) : 0;
    const studentId = studentById.get(email) || null;

    ops.push({
      updateOne: {
        filter: { email, sessionLabel },
        update: {
          $set: {
            email,
            sessionLabel,
            qualified,
            attendedMinutes,
            totalSessionMinutes,
            attendancePercentage,
            ...(studentId ? { studentId } : {}),
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Done. written=${upserted} skipped=${skipped} of ${txns.length} attendance txns`);

  await client.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
