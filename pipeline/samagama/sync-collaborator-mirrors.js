/**
 * sync-collaborator-mirrors.js — nightly read-only mirror of student
 * {email, name, status} into each collaborator's own MongoDB.
 *
 * Writes (as samagama_admin) into:
 *   rohit_spandan.candidates
 *   sakshi_spurti.candidates
 *   aditya_platform.candidates
 * Each doc: { email (unique key), name, status, mirroredAt }.
 *
 * Collaborators have readWrite only on their own DB, so this is the ONLY
 * writer — they read, never write (the nightly upsert re-asserts truth).
 *
 * `status` collapses the 10-step journey (mirror of routes/masterSheet.js
 * deriveMilestones) into one pipeline-stage string. Off-ramps (rejected,
 * excused) override the furthest milestone reached.
 *
 * Run:
 *   DRY_RUN=1 node sync-collaborator-mirrors.js   # counts + sample, no writes
 *   node sync-collaborator-mirrors.js             # live upsert into all 3 DBs
 *
 * Scheduled nightly at a random minute in 00:00–01:00 IST (18:30 UTC + jitter).
 */
const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '/var/samagama/server/.env' });

// Derive the host+creds base from MONGO_URI (strip the trailing /db?query) so the
// admin password lives ONLY in .env — never hardcoded here.
const BASE = (process.env.MONGO_URI || '').replace(/\/[^/?]*(\?.*)?$/, '');
if (!BASE) { console.error('Missing MONGO_URI in .env'); process.exit(1); }
const DRY_RUN = process.env.DRY_RUN === '1';

// Target collaborator DBs (each gets a `candidates` collection).
const TARGETS = ['rohit_spandan', 'sakshi_spurti', 'aditya_platform'];

// ---- status derivation (mirror of masterSheet.js deriveMilestones) ----------
// Ordered pipeline stages; we return the furthest one reached.
function deriveStatus(u, fr) {
  u = u || {};
  // off-ramps win outright
  if (u.applicationStatus === 'rejected') return 'rejected';
  if (u.excusedAt) return 'excused';

  const isVISE = !!u.physicalShortlisted;
  const hasInterview = !!(u.hasCompletedInterview || u.resultUnlocked || u.offerPdfSentAt);
  const optInDone = isVISE ? !!u.viseConfirmed : !!u.vinsOptIn;
  const nocUploaded = !!u.nocUploadedAt;
  const nocValid = u.nocValidity === true;
  const datesConfirmed = !!u.vinsDatesConfirmedAt;
  const offerLetter = !!(u.offerLetterSentAt || u.offerPdfSentAt || u.offerNotificationSentAt);
  const zoomDone = !!u.zoomEmail;
  const optInEffective = optInDone || datesConfirmed || nocUploaded || offerLetter;

  const cohortStart = new Date('2026-05-15T00:00:00+05:30');
  const startDate = u.vinsStartDate ? new Date(u.vinsStartDate) : cohortStart;
  const internshipStarted = offerLetter && zoomDone && new Date() >= startDate && !u.excusedAt;

  // furthest stage reached, walking backwards
  if (internshipStarted) return 'internship_started';
  if (u.offerAccepted === true) return 'offer_accepted';
  if (offerLetter) return 'offer_issued';
  if (nocUploaded && nocValid) return 'noc_approved';
  if (nocUploaded) return 'noc_uploaded';
  if (optInEffective) return 'opted_in';
  if (hasInterview) return 'interview_completed';
  return 'registered';
}

(async () => {
  const ce = await MongoClient.connect(`${BASE}/chatengine?authSource=admin`);
  const fr = await MongoClient.connect(`${BASE}/form_responses?authSource=admin`);

  // build a name fallback from form_responses (email -> fullName)
  const frNames = new Map();
  const frCur = fr.db().collection('responses').find(
    {}, { projection: { email: 1, emailAlt: 1, fullName: 1 } });
  for await (const r of frCur) {
    if (r.email) frNames.set(String(r.email).toLowerCase(), r.fullName);
    if (r.emailAlt) frNames.set(String(r.emailAlt).toLowerCase(), r.fullName);
  }

  // all real student accounts (exclude internal @vicharanashala.ai team mailboxes)
  const users = await ce.db().collection('users')
    .find({ email: { $exists: true, $ne: null, $not: /@vicharanashala\.ai$/i } })
    .project({
      email: 1, name: 1,
      applicationStatus: 1, excusedAt: 1, physicalShortlisted: 1, viseConfirmed: 1,
      hasCompletedInterview: 1, resultUnlocked: 1, vinsOptIn: 1,
      nocUploadedAt: 1, nocValidity: 1, vinsDatesConfirmedAt: 1, vinsStartDate: 1,
      offerLetterSentAt: 1, offerPdfSentAt: 1, offerNotificationSentAt: 1,
      offerAccepted: 1, zoomEmail: 1,
    }).toArray();

  const now = new Date();
  const rows = [];
  const counts = {};
  for (const u of users) {
    const email = String(u.email).toLowerCase();
    const name = (u.name && u.name.trim()) || frNames.get(email) || '';
    const status = deriveStatus(u, null);
    counts[status] = (counts[status] || 0) + 1;
    rows.push({ email, name, status, mirroredAt: now });
  }

  console.log(`Students to mirror: ${rows.length}`);
  console.log('Status breakdown:');
  Object.entries(counts).sort((a, b) => b[1] - a[1])
    .forEach(([s, n]) => console.log(`   ${s.padEnd(20)} ${n}`));
  console.log('\nSample (first 8):');
  rows.slice(0, 8).forEach(r => console.log(`   ${r.status.padEnd(20)} ${r.email}  (${r.name})`));

  if (DRY_RUN) {
    console.log('\nDRY_RUN — no writes.');
    await ce.close(); await fr.close();
    return;
  }

  for (const dbName of TARGETS) {
    const conn = await MongoClient.connect(`${BASE}/${dbName}?authSource=admin`);
    const coll = conn.db().collection('candidates');
    await coll.createIndex({ email: 1 }, { unique: true });
    const ops = rows.map(r => ({
      updateOne: { filter: { email: r.email }, update: { $set: r }, upsert: true },
    }));
    const res = await coll.bulkWrite(ops, { ordered: false });
    console.log(`${dbName}.candidates  upserted=${res.upsertedCount} modified=${res.modifiedCount} matched=${res.matchedCount}`);
    await conn.close();
  }

  await ce.close(); await fr.close();
  console.log('\nDone:', now.toISOString());
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
