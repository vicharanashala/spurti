/**
 * poll2-sheet-sync.cjs — reconcile poll2Completed against the actual Google Form
 * responses of the SECOND survey ("poll2"), read privately via its Apps Script
 * endpoint. Run by cron every 10 min while poll2 is open. Independent of the first
 * survey's survey-sheet-sync.cjs (different env + different flag).
 *
 *   - email in responses, flag false   -> set poll2Completed = true
 *   - email NOT in responses, flag true -> reset to false (popup reappears)
 *
 * Env (from ~/spurti/.env): MONGO_URI, POLL2_RESPONSES_URL, POLL2_RESPONSES_SECRET
 * Run from the repo root:  node poll2-sheet-sync.cjs
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const { MONGO_URI, POLL2_RESPONSES_URL: URL, POLL2_RESPONSES_SECRET: SECRET } = process.env;
const norm = s => String(s || '').trim().toLowerCase();
const stamp = () => new Date().toISOString();

(async () => {
  if (!MONGO_URI || !URL) { console.error(stamp(), 'poll2-sync: missing MONGO_URI or POLL2_RESPONSES_URL'); process.exit(1); }
  const u = URL + (URL.includes('?') ? '&' : '?') + 'secret=' + encodeURIComponent(SECRET || '');
  const resp = await fetch(u, { redirect: 'follow' });
  const body = await resp.json();
  const subs = new Set((body.emails || []).map(norm));
  if (!subs.size) { console.error(stamp(), 'poll2-sync: 0 emails returned — aborting (will not reset everyone)'); process.exit(1); }

  const cl = await MongoClient.connect(MONGO_URI);
  const col = cl.db().collection('students');
  let setTrue = 0, reset = 0;
  const cursor = col.find({}, { projection: { email: 1, alternateEmail: 1, poll2Completed: 1 } });
  for await (const s of cursor) {
    const inSheet = subs.has(norm(s.email)) || (s.alternateEmail && subs.has(norm(s.alternateEmail)));
    if (inSheet && !s.poll2Completed) {
      await col.updateOne({ _id: s._id }, { $set: { poll2Completed: true, poll2CompletedAt: new Date() } }); setTrue++;
    } else if (!inSheet && s.poll2Completed) {
      await col.updateOne({ _id: s._id }, { $set: { poll2Completed: false, poll2CompletedAt: null } }); reset++;
    }
  }
  console.log(stamp(), `poll2-sync: submitted=${subs.size} setTrue=${setTrue} reset=${reset}`);
  await cl.close();
})().catch(e => { console.error(stamp(), 'poll2-sync error:', e.message); process.exit(1); });
