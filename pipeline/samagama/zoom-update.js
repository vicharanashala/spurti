#!/usr/bin/env node
/**
 * zoom-update.js — the `#zoomupdate` pipeline.
 *
 * Fetches Zoom meeting / attendance / poll data for the host account over a
 * recent window and stores it in a DEDICATED `zoom_data` database. This DB is
 * the canonical raw store; user-facing fields (spPoints, engagement, etc.) are
 * computed FROM it on request, never the other way round.
 *
 * Idempotent: a meeting instance (by uuid) already ingested is skipped, EXCEPT
 * meetings whose IST date == today, which are re-synced (they may still be
 * growing). "Check what is present, only fetch what is missing."
 *
 *   Collections in zoom_data:
 *     meetings    { _id:uuid, meetingId, topic, date, startTime, endTime,
 *                   duration, participantsCount, pollQuestionCount, ingestedAt }
 *     attendance  { meetingUuid, meetingId, date, topic, email, name,
 *                   firstJoin, lastLeave, duration, segments,
 *                   intervals:[{join,leave,durationSec}] }        (uniq uuid+email)
 *     polls       { meetingUuid, meetingId, date, topic, email, name,
 *                   question, answer }                            (uniq uuid+email+question)
 *
 * Usage:
 *   node zoom-update.js                # default: last 7 days, host dled@iitrpr.ac.in
 *   node zoom-update.js --days 14
 *   node zoom-update.js --from 2026-05-15 --to 2026-05-25
 *   node zoom-update.js --host someone@domain   # override host
 *   node zoom-update.js --force        # re-sync even already-ingested meetings
 */

require('dotenv').config();
const axios = require('axios');
const { MongoClient } = require('mongodb');

const OAUTH_URL = 'https://zoom.us/oauth/token';
const API_BASE  = 'https://api.zoom.us/v2';
const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;

// zoom_data lives on the same mongod; derive its URI from MONGO_URI.
const ZOOM_DB_URI = (process.env.MONGO_URI || '')
  .replace(/\/chatengine(\?|$)/, '/zoom_data$1');

const DEFAULT_HOST = 'dled@iitrpr.ac.in';
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

// ---------- arg parsing ----------
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const FORCE = args.includes('--force');
const HOST  = arg('host', DEFAULT_HOST);

function istDate(d) {            // Date -> 'YYYY-MM-DD' in IST
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function todayIST() { return istDate(new Date()); }

let FROM = arg('from', null), TO = arg('to', null);
if (!FROM || !TO) {
  const days = parseInt(arg('days', '7'), 10);
  const now = new Date();
  TO   = istDate(now);
  FROM = istDate(new Date(now.getTime() - days * 86400000));
}

// ---------- Zoom auth + api ----------
let _tok = null, _exp = 0;
async function token() {
  if (_tok && Date.now() < _exp) return _tok;
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const r = await axios.post(OAUTH_URL, null, {
    params: { grant_type: 'account_credentials', account_id: ZOOM_ACCOUNT_ID },
    headers: { Authorization: `Basic ${basic}` }, timeout: 10000,
  });
  _tok = r.data.access_token;
  _exp = Date.now() + (Math.max(60, (r.data.expires_in || 3600) - 60) * 1000);
  return _tok;
}
async function api(path, params = {}) {
  const t = await token();
  const r = await axios.get(API_BASE + path, {
    headers: { Authorization: `Bearer ${t}` }, params, timeout: 30000,
  });
  return r.data;
}
async function pages(path, key, params = {}) {
  const out = []; let npt = null;
  do {
    const p = { page_size: 300, ...params };
    if (npt) p.next_page_token = npt;
    const d = await api(path, p);
    if (Array.isArray(d[key])) out.push(...d[key]);
    npt = d.next_page_token || null;
  } while (npt);
  return out;
}
const encUuid = (u) => /^[\/]|\/\//.test(String(u))
  ? encodeURIComponent(encodeURIComponent(u))
  : encodeURIComponent(u);

// ---------- ingestion ----------
async function run() {
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET)
    throw new Error('Zoom S2S env vars missing');
  if (!ZOOM_DB_URI) throw new Error('Could not derive zoom_data URI from MONGO_URI');

  const client = await MongoClient.connect(ZOOM_DB_URI);
  const db = client.db();
  const Meetings   = db.collection('meetings');
  const Attendance = db.collection('attendance');
  const Polls      = db.collection('polls');

  await Meetings.createIndex({ date: 1 });
  await Attendance.createIndex({ meetingUuid: 1, email: 1 }, { unique: true });
  await Attendance.createIndex({ email: 1, date: 1 });
  await Polls.createIndex({ meetingUuid: 1, email: 1, question: 1 }, { unique: true });
  await Polls.createIndex({ email: 1, date: 1 });

  console.log(`[zoomupdate] host=${HOST} window=${FROM}..${TO} force=${FORCE}`);

  // List meetings in the window. Reports API caps range at 1 month.
  const meetings = await pages(
    `/report/users/${encodeURIComponent(HOST)}/meetings`, 'meetings',
    { from: FROM, to: TO, type: 'past' });
  console.log(`[zoomupdate] ${meetings.length} meeting instance(s) in window`);

  const today = todayIST();
  let ingested = 0, skipped = 0;
  const summary = [];

  for (const m of meetings) {
    const uuid = m.uuid;
    const date = istDate(m.start_time);
    const existing = await Meetings.findOne({ _id: uuid });
    const isToday = date === today;

    if (existing && !FORCE && !isToday) { skipped++; continue; }

    // participants
    let parts = [];
    try { parts = await pages(`/report/meetings/${encUuid(uuid)}/participants`, 'participants',
      { include_fields: 'registrant_id' }); }
    catch (e) { console.log(`  ! participants ${uuid}: ${e.response?.data?.message || e.message}`); }

    // aggregate per email (sum segments).
    // NOTE: the Reports participants `duration` field is in SECONDS
    // (the meeting-level duration, by contrast, is in minutes).
    const byEmail = new Map();
    for (const p of parts) {
      const email = String(p.user_email || '').toLowerCase().trim();
      const keyId = email || ('noemail:' + (p.name || p.id || Math.random()));
      const cur = byEmail.get(keyId) || {
        email, name: p.name || '', durationSec: 0, segments: 0,
        firstJoin: null, lastLeave: null, intervals: [],
      };
      cur.durationSec += Number(p.duration || 0);
      cur.segments += 1;
      const jt = p.join_time ? new Date(p.join_time) : null;
      const lt = p.leave_time ? new Date(p.leave_time) : null;
      if (jt && (!cur.firstJoin || jt < cur.firstJoin)) cur.firstJoin = jt;
      if (lt && (!cur.lastLeave || lt > cur.lastLeave)) cur.lastLeave = lt;
      // Persist each join/leave segment so attendance can be clipped to a
      // session's strict official window (e.g. 09:00 start), which the
      // summed firstJoin/lastLeave/duration alone can't support once a
      // participant has gaps. durationSec is this segment's length.
      if (jt || lt) cur.intervals.push({ join: jt, leave: lt, durationSec: Number(p.duration || 0) });
      if (!cur.name && p.name) cur.name = p.name;
      byEmail.set(keyId, cur);
    }

    // polls
    let pollRows = [];
    try { const pr = await api(`/report/meetings/${encUuid(uuid)}/polls`); pollRows = pr.questions || []; }
    catch (e) { console.log(`  ! polls ${uuid}: ${e.response?.data?.message || e.message}`); }

    const distinctQ = new Set();
    const pollOps = [];
    for (const row of pollRows) {
      const email = String(row.email || '').toLowerCase().trim();
      const name  = row.name || '';
      for (const qd of (row.question_details || [])) {
        if (!qd.question) continue;
        distinctQ.add(qd.question);
        pollOps.push({
          updateOne: {
            filter: { meetingUuid: uuid, email, question: qd.question },
            update: { $set: {
              meetingUuid: uuid, meetingId: m.id, date, topic: m.topic,
              email, name, question: qd.question, answer: qd.answer || '',
            } },
            upsert: true,
          },
        });
      }
    }

    // write attendance
    const attOps = [];
    for (const [, v] of byEmail) {
      attOps.push({
        updateOne: {
          filter: { meetingUuid: uuid, email: v.email },
          update: { $set: {
            meetingUuid: uuid, meetingId: m.id, date, topic: m.topic,
            email: v.email, name: v.name,
            duration: Math.round(v.durationSec / 60),   // minutes (canonical)
            durationSec: v.durationSec, segments: v.segments,
            firstJoin: v.firstJoin, lastLeave: v.lastLeave,
            // Per-segment join/leave intervals (sorted by join) for strict
            // official-window attendance clipping. `segments` stays the count.
            intervals: (v.intervals || []).slice().sort((a, b) =>
              (a.join ? a.join.getTime() : 0) - (b.join ? b.join.getTime() : 0)),
          } },
          upsert: true,
        },
      });
    }

    if (attOps.length)  await Attendance.bulkWrite(attOps, { ordered: false });
    if (pollOps.length) await Polls.bulkWrite(pollOps, { ordered: false });

    await Meetings.updateOne({ _id: uuid }, { $set: {
      _id: uuid, meetingId: m.id, topic: m.topic, date,
      startTime: m.start_time ? new Date(m.start_time) : null,
      endTime:   m.end_time   ? new Date(m.end_time)   : null,
      duration:  Number(m.duration || 0),
      participantsCount: byEmail.size,
      pollQuestionCount: distinctQ.size,
      ingestedAt: new Date(),
    } }, { upsert: true });

    ingested++;
    summary.push({ date, topic: m.topic, attendees: byEmail.size, polls: distinctQ.size, reSync: !!existing });
    console.log(`  + ${date} "${m.topic}" — ${byEmail.size} attendees, ${distinctQ.size} poll Qs${existing ? ' (re-sync)' : ''}`);
  }

  console.log(`\n[zoomupdate] done. ingested/updated=${ingested}, skipped(already present)=${skipped}`);
  console.table(summary);
  await client.close();

  // #zoomupdate also refreshes Sakshi's read-only mirror of this data into
  // sakshi_spurti.zoom_* — so her DB is updated EVERY time #zoomupdate runs
  // (cron or manual). Isolated: a mirror failure does not fail the ingest,
  // which already committed above. Set SKIP_SAKSHI_MIRROR=1 to skip.
  if (process.env.SKIP_SAKSHI_MIRROR !== '1') {
    try {
      const { execFileSync } = require('child_process');
      const path = require('path');
      console.log('\n[zoomupdate] mirroring zoom_data -> sakshi_spurti ...');
      execFileSync(process.execPath, [path.join(__dirname, 'sync-sakshi-zoom-mirror.js')], { stdio: 'inherit' });
    } catch (e) {
      console.error('[zoomupdate] sakshi mirror FAILED (zoom_data ingest still succeeded):', e.message);
    }
  }

  // Fetch verbatim AI Companion transcripts for any new meetings just ingested.
  // Non-fatal: transcripts may still be processing; the 13:00 IST catchup cron retries.
  if (process.env.SKIP_TRANSCRIPT_INGEST !== '1') {
    try {
      const { execFileSync } = require('child_process');
      const path = require('path');
      console.log('\n[zoomupdate] ingesting verbatim transcripts ...');
      execFileSync(process.execPath, [path.join(__dirname, 'zoom-ingest-all-transcripts.js')], { stdio: 'inherit' });
    } catch (e) {
      console.error('[zoomupdate] transcript ingest FAILED (attendance/poll ingest still succeeded):', e.message);
    }
  }
}

run().catch((e) => { console.error('[zoomupdate] FATAL:', e.message); process.exit(1); });
