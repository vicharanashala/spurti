/**
 * sync-sakshi-zoom-mirror.js — read-only mirror of our Zoom data into Sakshi's DB.
 *
 * Copies the canonical raw `zoom_data` collections into `sakshi_spurti`, the
 * same access pattern as sync-collaborator-mirrors.js (which mirrors student
 * {email,name,status} into <collaborator>.candidates):
 *
 *   zoom_data.meetings    -> sakshi_spurti.zoom_meetings
 *   zoom_data.attendance  -> sakshi_spurti.zoom_attendance
 *   zoom_data.polls       -> sakshi_spurti.zoom_polls
 *
 * Sakshi has readWrite only on sakshi_spurti, so this (run as samagama_admin)
 * is the ONLY writer — she reads, never writes. Upsert-by-_id re-asserts truth
 * each run; zoom_data only grows / re-syncs today, so no stale-delete needed.
 *
 * Run:
 *   DRY_RUN=1 node sync-sakshi-zoom-mirror.js   # counts only, no writes
 *   node sync-sakshi-zoom-mirror.js             # live mirror into sakshi_spurti
 *
 * Scheduled daily at 19:00 IST (13:30 UTC) right after the #zoomupdate refresh
 * — see /etc/cron.d/sakshi-zoom and cron-sakshi-zoom.sh.
 */
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '/var/samagama/server/.env' });

// Derive host+creds base from MONGO_URI (strip trailing /db?query) so the admin
// password lives ONLY in .env — never hardcoded. Same idiom as the collab mirror.
const BASE = (process.env.MONGO_URI || '').replace(/\/[^/?]*(\?.*)?$/, '');
if (!BASE) { console.error('Missing MONGO_URI in .env'); process.exit(1); }
const DRY_RUN = process.env.DRY_RUN === '1';

// source collection -> destination collection in sakshi_spurti
const MAP = {
  meetings:   'zoom_meetings',
  attendance: 'zoom_attendance',
  polls:      'zoom_polls',
};
const BATCH = 1000;

(async () => {
  const src = await MongoClient.connect(`${BASE}/zoom_data?authSource=admin`);
  const dst = await MongoClient.connect(`${BASE}/sakshi_spurti?authSource=admin`);
  const now = new Date();

  for (const [srcColl, dstColl] of Object.entries(MAP)) {
    const total = await src.db().collection(srcColl).countDocuments();
    if (DRY_RUN) {
      const have = await dst.db().collection(dstColl).countDocuments().catch(() => 0);
      console.log(`${srcColl.padEnd(11)} -> sakshi_spurti.${dstColl.padEnd(16)} src=${total} (dst currently ${have})`);
      continue;
    }

    const out = dst.db().collection(dstColl);
    const cur = src.db().collection(srcColl).find({});
    let batch = [], upserted = 0, modified = 0;
    const flush = async () => {
      if (!batch.length) return;
      const res = await out.bulkWrite(batch, { ordered: false });
      upserted += res.upsertedCount; modified += res.modifiedCount;
      batch = [];
    };
    for await (const doc of cur) {
      doc.mirroredAt = now;
      batch.push({ replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true } });
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    console.log(`${srcColl.padEnd(11)} -> sakshi_spurti.${dstColl.padEnd(16)} src=${total} upserted=${upserted} modified=${modified}`);
  }

  await src.close(); await dst.close();
  console.log('Done:', now.toISOString());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
