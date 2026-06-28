/**
 * sync-levels.cjs — Spurti Levels & Trophy Leagues backfill + sync.
 *
 * IDEMPOTENT. First run = one-time migration. Every later run = a sync that
 * picks up whatever SP changed since. Never lowers highestSpEver. It only adds
 * the derived fields to the existing students collection — it does NOT touch SP
 * transactions, balances, or any scoring logic.
 *
 * Derived per spec (services/levels.js is the canonical source; mirrored here so
 * this can run standalone as plain CommonJS without the ESM server build):
 *   highestSpEver = max(stored highestSpEver, max ledger balanceAfter, totalSp)
 *   level         = floor(highestSpEver / 100)            (never decreases)
 *   trophyLeague  = band(currentSp)                        (current performance)
 *   legendBadge   = highestSpEver >= 1500                  (permanent once true)
 *   leaderboardGroup = biweekly window from internshipStartDate
 *
 * USAGE
 *   node sync-levels.cjs                  # uses MONGO_URI from .env (production)
 *   MONGO_URI=mongodb://127.0.0.1:27017/analysis_summership_banded node sync-levels.cjs
 *   DEMO=1 ... node sync-levels.cjs       # also upsert a demo high-tier student (local only)
 *
 * PRODUCTION: run this once after `git pull` (migration), then add it as the LAST
 * step of the nightly SP pipeline/cron so derived fields stay fresh. No edits to
 * existing scoring scripts are needed.
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analysis_summership';
const DEMO = process.env.DEMO === '1';

const LEAGUE_BANDS = [
  [1500, Infinity, 'Legend'], [1400, 1499, 'Diamond I'], [1300, 1399, 'Diamond II'],
  [1200, 1299, 'Diamond III'], [1100, 1199, 'Platinum I'], [1000, 1099, 'Platinum II'],
  [900, 999, 'Platinum III'], [800, 899, 'Gold I'], [700, 799, 'Gold II'],
  [600, 699, 'Gold III'], [500, 599, 'Silver I'], [400, 499, 'Silver II'],
  [300, 399, 'Silver III'], [200, 299, 'Bronze I'], [100, 199, 'Bronze II'], [0, 99, 'Bronze III'],
];
const leagueBand = (sp) => { sp = Math.max(0, Number(sp) || 0); for (const [lo, hi, n] of LEAGUE_BANDS) if (sp >= lo && sp <= hi) return n; return 'Bronze III'; };
const levelFor = (h) => Math.floor(Math.max(0, Number(h) || 0) / 100);
const legendBadge = (h) => (Number(h) || 0) >= 1500;
function leaderboardGroup(date) {
  if (!date) return '';
  const d = new Date(date); if (isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate(), mm = String(m + 1).padStart(2, '0');
  if (day <= 15) return `${y}-${mm}-01_to_${y}-${mm}-15`;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return `${y}-${mm}-16_to_${y}-${mm}-${String(last).padStart(2, '0')}`;
}

(async () => {
  const c = new MongoClient(URI);
  await c.connect();
  const db = c.db();
  console.log(`sync-levels -> ${db.databaseName}`);
  const students = db.collection('students');
  const tx = db.collection('sptransactions');

  // max historical running balance per student, in one pass
  const maxByEmail = new Map();
  for (const r of await tx.aggregate([{ $group: { _id: '$email', maxBal: { $max: '$balanceAfter' } } }]).toArray()) {
    maxByEmail.set(r._id, Number(r.maxBal) || 0);
  }

  const all = await students.find({}).toArray();
  const ops = [];
  for (const s of all) {
    const high = Math.max(Number(s.highestSpEver) || 0, maxByEmail.get(s.email) || 0, Number(s.totalSp) || 0);
    ops.push({ updateOne: { filter: { _id: s._id }, update: { $set: {
      highestSpEver: high,
      level: levelFor(high),
      trophyLeague: leagueBand(s.totalSp),
      legendBadgeUnlocked: legendBadge(high),
      leaderboardGroup: leaderboardGroup(s.internshipStartDate),
    } } } });
  }
  const result = ops.length ? await students.bulkWrite(ops) : { modifiedCount: 0 };
  console.log(`students processed: ${ops.length}, modified: ${result.modifiedCount}`);

  if (DEMO) {
    const email = 'demo.legend@samagama.in';
    const start = new Date('2026-06-04T03:30:00.000Z'); // -> group 2026-06-01_to_2026-06-15
    const high = 1620;
    await students.deleteOne({ email });
    await tx.deleteMany({ email });
    const sid = new ObjectId();
    await students.insertOne({
      _id: sid, name: 'Demo Legend (test)', email, alternateEmail: '',
      internshipStartDate: start, internshipEndDate: null, status: 'active',
      totalSp: high, highestSpEver: high, level: levelFor(high),
      trophyLeague: leagueBand(high), legendBadgeUnlocked: legendBadge(high),
      leaderboardGroup: leaderboardGroup(start), createdAt: new Date(), updatedAt: new Date(), __v: 0,
    });
    const mk = (cat, delta, bal, reason, dt) => ({
      _id: new ObjectId(), email, studentId: sid, category: cat, sessionLabel: '',
      deltaMode: 'absolute', deltaValue: delta, appliedDelta: delta, balanceAfter: bal,
      reason, dateTime: dt, createdAt: new Date(), updatedAt: new Date(), __v: 0,
    });
    await tx.insertMany([
      mk('initial', 100, 100, 'Initial Spurti Points credited by system on onboarding.', start),
      mk('manual', 1520, 1620, 'Demo award to showcase Legend tier rendering.', new Date('2026-06-20T09:00:00.000Z')),
    ]);
    console.log(`DEMO student upserted: ${email} (SP ${high}, Level ${levelFor(high)}, Legend)`);
  }

  await c.close();
})().catch(e => { console.error('FAILED:', e); process.exit(1); });
