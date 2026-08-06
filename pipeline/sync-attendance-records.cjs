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
const { MongoClient, ObjectId } = require('/var/samagama/server/node_modules/mongodb');
require('/var/samagama/server/node_modules/dotenv').config({ path: '/var/samagama/server/.env' });

const REASON_RE = /present (\d+) of (\d+) min \(([\d.]+)%\)/;

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('sakshi_spurti');

  const students = await db.collection('students').find({}, { projection: { _id: 1, email: 1 } }).toArray();
  const studentById = new Map(students.map(s => [s.email.toLowerCase().trim(), s._id]));

  const txns = await db.collection('sptransactions')
    .find({ category: 'attendance' })
    .toArray();

  let upserted = 0, skipped = 0;
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

    await db.collection('attendancerecords').updateOne(
      { email, sessionLabel },
      {
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
      { upsert: true }
    );
    upserted++;
  }

  console.log(`Done. upserted=${upserted} skipped=${skipped}`);

  // Verify for harsh007rana
  const check = await db.collection('attendancerecords')
    .find({ email: 'harsh007rana@gmail.com' })
    .sort({ sessionLabel: 1 })
    .toArray();
  console.log(`\nharsh007rana AttendanceRecord count: ${check.length}`);
  check.forEach(r => console.log(` ${r.sessionLabel} | qualified:${r.qualified} | mins:${r.attendedMinutes}/${r.totalSessionMinutes} (${r.attendancePercentage}%)`));

  await client.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
