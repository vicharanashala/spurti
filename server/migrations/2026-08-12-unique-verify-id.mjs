// Makes verifyId unique.
//
// Must be run BEFORE deploying the code that relies on it. The collection
// already carries a NON-unique `verifyId_1` index from the first release, and
// Mongo refuses to redefine an index that keeps its name but changes its
// options (IndexKeySpecsConflict). Mongoose's auto-indexing swallows that
// failure at startup, so without this script the app would come up looking
// healthy with no unique index at all — the guarantee silently absent.
//
// Run from the repo root, which is where dotenv looks for .env:
//   node server/migrations/2026-08-12-unique-verify-id.mjs [--apply]
//
// Without --apply it only reports. Safe to re-run.

import 'dotenv/config';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGO_URI;
if (!URI) {
  console.error('MONGO_URI is not set. Run this from the repo root so .env is picked up,');
  console.error('or pass it explicitly: MONGO_URI=... node server/migrations/…');
  process.exit(1);
}

await mongoose.connect(URI);
const col = mongoose.connection.db.collection('achievements');
const say = (...a) => console.log(...a);

// 1. Duplicates must be dealt with first — a unique index cannot be built over
//    them, and the build failing is how you find out the hard way.
const dupes = await col.aggregate([
  { $match: { verifyId: { $type: 'string' } } },
  { $group: { _id: '$verifyId', n: { $sum: 1 }, ids: { $push: '$_id' } } },
  { $match: { n: { $gt: 1 } } }
]).toArray();

const total = await col.countDocuments();
const withCode = await col.countDocuments({ verifyId: { $type: 'string' } });
say(`achievements: ${total} rows, ${withCode} with a code, ${total - withCode} without`);

if (dupes.length) {
  say(`\n!! ${dupes.length} duplicate code(s) — these MUST be resolved before the index can be built:`);
  for (const d of dupes) say(`   ${d._id} used by ${d.n} rows: ${d.ids.join(', ')}`);
  say('\nRe-issuing a code invalidates any card already posted with it, so decide');
  say('deliberately which row keeps the code. Not doing that automatically.');
  await mongoose.disconnect();
  process.exit(1);
}
say('no duplicate codes — safe to build the unique index');

// 2. Swap the index.
const existing = await col.indexes();
const old = existing.find((i) => i.name === 'verifyId_1');
const alreadyRight = old && old.unique && old.partialFilterExpression;

if (alreadyRight) {
  say('\nunique partial index already in place — nothing to do');
} else if (!APPLY) {
  say(`\nwould drop ${old ? `existing index ${JSON.stringify(old.key)} (unique: ${!!old.unique})` : 'nothing'}`);
  say('would create { verifyId: 1 } unique, partial on $type:string');
  say('\nre-run with --apply to make the change');
} else {
  if (old) { await col.dropIndex('verifyId_1'); say('dropped old verifyId_1'); }
  await col.createIndex(
    { verifyId: 1 },
    { unique: true, partialFilterExpression: { verifyId: { $type: 'string' } }, name: 'verifyId_1' }
  );
  const now = (await col.indexes()).find((i) => i.name === 'verifyId_1');
  say(`created: ${JSON.stringify(now)}`);
}

// 3. Backfill periodKey on rows issued before the field existed. It is derived
//    from achId, which already encodes the window:
//      rank:poll:week:2026-08-03:1  -> 2026-08-03
//      rank:total:all:all:3 | ms:*  -> all
const stale = await col.find({ $or: [{ periodKey: { $exists: false } }, { periodKey: '' }] },
  { projection: { achId: 1 } }).toArray();
if (!stale.length) {
  say('\nperiodKey: nothing to backfill');
} else if (!APPLY) {
  say(`\nwould backfill periodKey on ${stale.length} row(s)`);
} else {
  const ops = stale.map((d) => {
    const m = /^rank:[^:]+:week:(\d{4}-\d{2}-\d{2}):/.exec(d.achId || '');
    return { updateOne: { filter: { _id: d._id }, update: { $set: { periodKey: m ? m[1] : 'all' } } } };
  });
  const res = await col.bulkWrite(ops, { ordered: false });
  say(`\nperiodKey backfilled on ${res.modifiedCount} row(s)`);
}

await mongoose.disconnect();
