'use strict';
/**
 * sync-poll-records.js
 *
 * Populates/updates sakshi_spurti.pollrecords from sptransactions
 * (category='poll'). Mirrors what sync-attendance-records.js does
 * for attendancerecords. Safe to re-run (upsert by email+sessionLabel).
 *
 * Reason string format from sp-rubric-build:
 *   "Day 20 (8 Jun): answered 3 of 16 poll questions (18.8%) -> 0 SP."
 */
const { MongoClient } = require('/var/samagama/server/node_modules/mongodb');
require('/var/samagama/server/node_modules/dotenv').config({ path: '/var/samagama/server/.env' });

const POLL_RE = /answered (\d+) of (\d+) poll questions/;

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('sakshi_spurti');

  const students = await db.collection('students').find({}, { projection: { _id: 1, email: 1 } }).toArray();
  const studentById = new Map(students.map(s => [s.email.toLowerCase().trim(), s._id]));

  const txns = await db.collection('sptransactions')
    .find({ category: 'poll' })
    .toArray();

  let upserted = 0, skipped = 0;
  for (const tx of txns) {
    const email = (tx.email || '').toLowerCase().trim();
    if (!email) { skipped++; continue; }
    const sessionLabel = tx.sessionLabel || '';
    if (!sessionLabel) { skipped++; continue; }

    const m = POLL_RE.exec(tx.reason || '');
    const attemptedQuestions = m ? Number(m[1]) : 0;
    const totalQuestions = m ? Number(m[2]) : 0;
    const missedQuestions = Math.max(0, totalQuestions - attemptedQuestions);
    const studentId = studentById.get(email) || null;

    await db.collection('pollrecords').updateOne(
      { email, sessionLabel },
      {
        $set: {
          email,
          sessionLabel,
          totalQuestions,
          attemptedQuestions,
          missedQuestions,
          ...(studentId ? { studentId } : {}),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    upserted++;
  }

  console.log(`Done. upserted=${upserted} skipped=${skipped}`);

  // Verify for harsh007rana
  const check = await db.collection('pollrecords')
    .find({ email: 'harsh007rana@gmail.com' })
    .sort({ sessionLabel: 1 })
    .toArray();
  const totalQ = check.reduce((s, r) => s + r.totalQuestions, 0);
  const attempted = check.reduce((s, r) => s + r.attemptedQuestions, 0);
  console.log(`\nharsh007rana PollRecord count: ${check.length} | attempted: ${attempted}/${totalQ}`);
  check.forEach(r => console.log(` ${r.sessionLabel} | ${r.attemptedQuestions}/${r.totalQuestions}`));

  await client.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
