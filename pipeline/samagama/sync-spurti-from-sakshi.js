/**
 * sync-spurti-from-sakshi.js — #updatespurti
 *
 * Make our SP ledger an exact MIRROR of Sakshi's authoritative ledger:
 * load everything she has, drop anything we have that she doesn't.
 *
 *   our chatengine.spledgers  :=  sakshi_spurti.sptransactions   (4 fields only)
 *     time        <- dateTime
 *     email       <- email          (PRIMARY email only — the unique key)
 *     description <- reason          (the "details")
 *     sp          <- appliedDelta    (normalized "+N" / "-N" string)
 *   User.spPoints = sum of appliedDelta per email (total computed by us).
 *
 * Strategy (per Sudarshan 2026-05-26): wipe our spledgers and reload hers.
 * Idempotent, no double-count, fixes the legacy CSV's 5:30 time shift, and
 * omits rows we had that she doesn't. SAFETY: aborts without touching anything
 * if her source returns implausibly few rows (guards against an empty read).
 *
 *   DRY_RUN=1  node sync-spurti-from-sakshi.js   # counts + sample, no writes
 *   node sync-spurti-from-sakshi.js              # live
 *
 * Cron: minute 30 of every even UTC hour (= every even IST hour, 00,02,...,22).
 */
require('/var/samagama/server/node_modules/dotenv').config({ path: '/var/samagama/server/.env' });
const { MongoClient } = require('/var/samagama/server/node_modules/mongodb');
const mongoose = require('/var/samagama/server/node_modules/mongoose');

const BASE = (process.env.MONGO_URI || '').replace(/\/[^/?]*(\?.*)?$/, '');
const DRY = process.env.DRY_RUN === '1';
const MIN_ROWS = 5000; // safety floor: her ledger is ~32k; refuse to wipe if far below
const normSp = (n) => { const v = parseInt(n, 10); return isNaN(v) ? null : (v >= 0 ? '+' + v : '' + v); };

(async () => {
  if (!BASE) throw new Error('no MONGO_URI');
  await mongoose.connect(process.env.MONGO_URI);
  const spledgers = mongoose.connection.db.collection('spledgers');
  const User = require('/var/samagama/server/models/User');
  const sak = await MongoClient.connect(`${BASE}/sakshi_spurti?authSource=admin`);
  const sptx = sak.db().collection('sptransactions');

  const src = await sptx.find({}, { projection: { email: 1, dateTime: 1, reason: 1, appliedDelta: 1 } }).toArray();
  const rows = [];
  const totals = new Map();
  let bad = 0;
  for (const t of src) {
    const email = String(t.email || '').toLowerCase().trim();
    const sp = normSp(t.appliedDelta);
    if (!email || sp === null || !t.dateTime) { bad++; continue; }
    rows.push({ time: new Date(t.dateTime), email, description: String(t.reason || ''), sp });
    totals.set(email, (totals.get(email) || 0) + parseInt(sp, 10));
  }
  const ourCount = await spledgers.countDocuments();
  console.log(`her sptransactions: ${src.length} | mapped rows: ${rows.length} | bad/skipped: ${bad} | distinct emails: ${totals.size}`);
  console.log(`our spledgers now: ${ourCount} (will be REPLACED by the ${rows.length} mapped rows)`);

  if (rows.length < MIN_ROWS) {
    console.error(`ABORT: source returned ${rows.length} rows (< ${MIN_ROWS}). Not wiping our ledger.`);
    await mongoose.disconnect(); await sak.close(); process.exit(1);
  }

  // spPoints preview
  console.log('spPoints (sum of her deltas) sample:');
  for (const [e, sum] of [...totals.entries()].slice(0, 4)) {
    const u = await User.findOne({ email: e }, { spPoints: 1 }).lean();
    console.log(`  ${e.padEnd(36)} current=${u ? u.spPoints : '(no user)'} -> ${sum}`);
  }

  if (DRY) { console.log(`\nDRY_RUN — would wipe ${ourCount} rows, insert ${rows.length}, recompute spPoints for ${totals.size} emails.`); await mongoose.disconnect(); await sak.close(); return; }

  // APPLY: wipe + reload (mirror)
  const del = await spledgers.deleteMany({});
  console.log(`wiped ${del.deletedCount} old rows`);
  for (let i = 0; i < rows.length; i += 2000) await spledgers.insertMany(rows.slice(i, i + 2000), { ordered: false });
  console.log(`inserted ${rows.length} rows from her ledger`);
  let upd = 0;
  for (const [email, sum] of totals) { const r = await User.updateOne({ email }, { $set: { spPoints: sum, spPointsUpdated: new Date() } }); if (r.matchedCount) upd++; }
  console.log(`recomputed spPoints for ${upd} matched users (of ${totals.size})`);
  await mongoose.disconnect(); await sak.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
