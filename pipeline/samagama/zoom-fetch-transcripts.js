#!/usr/bin/env node
/**
 * zoom-fetch-transcripts.js — ingest Zoom AI Companion meeting summaries into
 * zoom_data.summaries for meetings already in zoom_data.meetings.
 *
 * Uses GET /meetings/{uuid}/meeting_summary (scope: meeting:read:summary:admin).
 * No cloud recording required — AI Companion generates these automatically when
 * auto_start_meeting_summary: true is set on the meeting.
 *
 * Idempotent: meetings already stored are skipped, EXCEPT today's (summary may
 * still be generating). Use --force to re-fetch everything.
 *
 *   Collection in zoom_data:
 *     summaries  { _id: meetingUuid, meetingId, date, topic,
 *                  overview:     "<paragraph>",
 *                  details:      [{ label, summary }],
 *                  nextSteps:    ["<action item>", ...],
 *                  summaryContent: "<full markdown>",
 *                  summaryDocUrl:  "<zoom docs link>",
 *                  summaryCreatedTime, summaryLastModifiedTime,
 *                  ingestedAt }
 *
 * Usage:
 *   node zoom-fetch-transcripts.js              # default: last 7 days
 *   node zoom-fetch-transcripts.js --days 14
 *   node zoom-fetch-transcripts.js --from 2026-05-15 --to 2026-06-19
 *   node zoom-fetch-transcripts.js --force      # re-fetch even already-stored
 */

require('dotenv').config({ path: '/var/samagama/server/.env' });
const axios = require('axios');
const { MongoClient } = require('mongodb');

const OAUTH_URL = 'https://zoom.us/oauth/token';
const API_BASE  = 'https://api.zoom.us/v2';
const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;

const ZOOM_DB_URI = (process.env.MONGO_URI || '')
  .replace(/\/chatengine(\?|$)/, '/zoom_data$1');

const IST_OFFSET_MS = 5.5 * 3600 * 1000;
function istDate(d) { return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10); }
function todayIST() { return istDate(new Date()); }

const args = process.argv.slice(2);
function arg(name, def) { const i = args.indexOf('--' + name); return i >= 0 && args[i+1] ? args[i+1] : def; }
const FORCE = args.includes('--force');

let FROM = arg('from', null), TO = arg('to', null);
if (!FROM || !TO) {
  const days = parseInt(arg('days', '7'), 10);
  const now = new Date();
  TO   = istDate(now);
  FROM = istDate(new Date(now.getTime() - days * 86400000));
}

// ---------- Zoom auth ----------
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

async function apiGet(path) {
  const t = await token();
  const r = await axios.get(API_BASE + path, {
    headers: { Authorization: `Bearer ${t}` }, timeout: 30000,
  });
  return r.data;
}

// ---------- main ----------
async function run() {
  if (!ZOOM_ACCOUNT_ID || !ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET)
    throw new Error('Zoom S2S env vars missing');
  if (!ZOOM_DB_URI) throw new Error('Could not derive zoom_data URI from MONGO_URI');

  const client = await MongoClient.connect(ZOOM_DB_URI);
  const db = client.db();
  const Meetings  = db.collection('meetings');
  const Summaries = db.collection('summaries');

  await Summaries.createIndex({ date: 1 });

  const today = todayIST();
  console.log(`[zoom-summaries] window=${FROM}..${TO} force=${FORCE}`);

  const meetings = await Meetings.find({ date: { $gte: FROM, $lte: TO } }).toArray();
  console.log(`[zoom-summaries] ${meetings.length} meeting(s) in window`);

  let fetched = 0, skipped = 0, noSummary = 0, errors = 0;

  for (const m of meetings) {
    const uuid = m._id;
    const isToday = m.date === today;

    const existing = await Summaries.findOne({ _id: uuid });
    if (existing && !FORCE && !isToday) { skipped++; continue; }

    const enc = /^[\/]|\/\//.test(String(uuid))
      ? encodeURIComponent(encodeURIComponent(uuid))
      : encodeURIComponent(uuid);

    let summary;
    try {
      summary = await apiGet(`/meetings/${enc}/meeting_summary`);
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) { noSummary++; continue; }
      console.error(`  ! summary API ${uuid}: ${e.response?.data?.message || e.message}`);
      errors++;
      continue;
    }

    await Summaries.updateOne(
      { _id: uuid },
      { $set: {
        _id:                      uuid,
        meetingId:                m.meetingId,
        date:                     m.date,
        topic:                    m.topic,
        overview:                 summary.summary_overview       || '',
        details:                  summary.summary_details        || [],
        nextSteps:                summary.next_steps             || [],
        summaryContent:           summary.summary_content        || '',
        summaryDocUrl:            summary.summary_doc_url        || '',
        summaryCreatedTime:       summary.summary_created_time   ? new Date(summary.summary_created_time) : null,
        summaryLastModifiedTime:  summary.summary_last_modified_time ? new Date(summary.summary_last_modified_time) : null,
        ingestedAt:               new Date(),
      } },
      { upsert: true }
    );

    fetched++;
    const detailCount = (summary.summary_details || []).length;
    const nextCount   = (summary.next_steps || []).length;
    console.log(`  + ${m.date} "${m.topic}" — ${detailCount} sections, ${nextCount} next steps`);
  }

  console.log(`\n[zoom-summaries] done. fetched=${fetched} skipped=${skipped} no-summary=${noSummary} errors=${errors}`);
  await client.close();
}

run().catch(e => { console.error('[zoom-summaries] FATAL:', e.message); process.exit(1); });
