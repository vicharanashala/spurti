#!/usr/bin/env node
/**
 * zoom-ingest-all-transcripts.js
 *
 * Fetches AI Companion verbatim transcripts for every meeting in zoom_data.meetings
 * and upserts them into zoom_data.transcripts.
 *
 * Flow per meeting:
 *   1. GET /past_meetings/{meetingId}/instances  → get correct past-instance UUIDs
 *   2. For each UUID: GET /meetings/{enc2-uuid}/transcript  → download_url + metadata
 *   3. Download the transcript content (VTT/text) via download_url
 *   4. Parse into { startMs, endMs, speaker, text } lines
 *   5. Upsert into zoom_data.transcripts keyed by meetingUuid
 *
 * Usage:
 *   node zoom-ingest-all-transcripts.js            # skip already-ingested
 *   node zoom-ingest-all-transcripts.js --force    # re-fetch everything
 *   node zoom-ingest-all-transcripts.js --dry-run  # print only, no write
 */

require('dotenv').config({ path: '/var/samagama/server/.env' });
const axios  = require('axios');
const { MongoClient } = require('mongodb');

const ARGS    = process.argv.slice(2);
const FORCE   = ARGS.includes('--force');
const DRY_RUN = ARGS.includes('--dry-run');

const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
const ZOOM_DB_URI = (process.env.MONGO_URI || '').replace(/\/chatengine(\?|$)/, '/zoom_data$1');

// ── Zoom auth ────────────────────────────────────────────────────────────────
let _tok = null, _exp = 0;
async function token() {
  if (_tok && Date.now() < _exp) return _tok;
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const r = await axios.post('https://zoom.us/oauth/token', null, {
    params: { grant_type: 'account_credentials', account_id: ZOOM_ACCOUNT_ID },
    headers: { Authorization: `Basic ${basic}` }, timeout: 10000,
  });
  _tok = r.data.access_token;
  _exp = Date.now() + (Math.max(60, (r.data.expires_in || 3600) - 60) * 1000);
  return _tok;
}

async function apiGet(path) {
  const t = await token();
  const r = await axios.get('https://api.zoom.us/v2' + path, {
    headers: { Authorization: `Bearer ${t}` }, timeout: 20000,
  });
  return r.data;
}

// ── Transcript download + parser ─────────────────────────────────────────────
async function downloadTranscript(url) {
  const t = await token();
  const r = await axios.get(url, {
    headers: { Authorization: `Bearer ${t}` },
    timeout: 60000, maxRedirects: 5, responseType: 'text',
  });
  return r.data;
}

function parseTranscript(text) {
  // Normalise line endings
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalised.trim().startsWith('WEBVTT')) return parseVTT(normalised);
  return parsePlainText(normalised);
}

function parseVTT(vtt) {
  const lines = [];
  // Split on blank lines (one or more)
  const blocks = vtt.split(/\n{2,}/);
  for (const block of blocks) {
    const rows = block.trim().split('\n');
    if (rows.length < 2) continue;
    // Find the timestamp row (contains ' --> ')
    const tsIdx = rows.findIndex(r => r.includes(' --> '));
    if (tsIdx < 0) continue;
    const [s, e] = rows[tsIdx].split(' --> ');
    const startMs = vttMs(s.trim());
    const endMs   = vttMs(e.trim().split(' ')[0]);
    // Text is everything after the timestamp row
    const raw = rows.slice(tsIdx + 1).join(' ').trim();
    if (!raw) continue;
    const { speaker, text } = extractSpeaker(raw);
    if (text) lines.push({ startMs, endMs, speaker, text });
  }
  return lines;
}

function parsePlainText(text) {
  const lines = [];
  const segments = text.split(/\n(?=[A-Z][^\n:]{0,50}:)/);
  let ms = 0;
  for (const seg of segments) {
    const { speaker, text: t } = extractSpeaker(seg.trim());
    if (t) { lines.push({ startMs: ms, endMs: ms + 5000, speaker, text: t }); ms += 5000; }
  }
  return lines;
}

function vttMs(ts) {
  const p = ts.split(':');
  let h = 0, m = 0, s = 0;
  if (p.length === 3) { h = +p[0]; m = +p[1]; s = parseFloat(p[2]); }
  else { m = +p[0]; s = parseFloat(p[1]); }
  return Math.round((h * 3600 + m * 60 + s) * 1000);
}

function extractSpeaker(raw) {
  const ci = raw.indexOf(':');
  if (ci > 0 && ci < 60) {
    const ps = raw.slice(0, ci).trim();
    if (/^[A-Za-z\s.\-']+$/.test(ps)) return { speaker: ps, text: raw.slice(ci + 1).trim() };
  }
  return { speaker: '', text: raw };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  const client = new MongoClient(ZOOM_DB_URI);
  await client.connect();
  const db = client.db('zoom_data');

  // Get unique meetingIds (deduplicated — DB has multiple rows per day sometimes)
  const allMeetings = await db.collection('meetings').find({}).sort({ date: 1 }).toArray();
  const seenMeetingIds = new Set();
  const meetings = allMeetings.filter(m => {
    if (seenMeetingIds.has(m.meetingId)) return false;
    seenMeetingIds.add(m.meetingId);
    return true;
  });
  console.log(`Unique meetingIds: ${meetings.length} (from ${allMeetings.length} total rows)`);

  const existingUuids = new Set(
    (await db.collection('transcripts').find({}, { projection: { _id: 1 } }).toArray()).map(t => t._id)
  );
  console.log(`Already ingested: ${existingUuids.size} transcripts`);

  let fetched = 0, skipped = 0, noTranscript = 0, errors = 0;

  for (const meeting of meetings) {
    const { meetingId, date, topic } = meeting;
    const label = `${date} ${topic?.slice(0, 40)}`;

    // Step 1: get correct past-instance UUIDs
    let instances;
    try {
      const r = await apiGet(`/past_meetings/${meetingId}/instances`);
      instances = r.meetings || [];
    } catch (e) {
      console.log(`  ERR   ${label} [past_meetings] ${e.response?.status} ${e.response?.data?.message || e.message}`);
      errors++;
      await delay(500);
      continue;
    }

    if (instances.length === 0) {
      console.log(`  NONE  ${label} (no past instances)`);
      noTranscript++;
      continue;
    }

    // Step 2: try each instance UUID for a transcript
    let found = false;
    for (const inst of instances) {
      const uuid = inst.uuid;

      if (!FORCE && existingUuids.has(uuid)) {
        console.log(`  SKIP  ${label} [${uuid.slice(0,8)}..] (already ingested)`);
        skipped++;
        found = true;
        break;
      }

      const enc2 = encodeURIComponent(encodeURIComponent(uuid));
      let transcriptMeta;
      try {
        transcriptMeta = await apiGet(`/meetings/${enc2}/transcript`);
      } catch (e) {
        if (e.response?.status === 404) continue; // this instance has no transcript
        console.log(`  ERR   ${label} [${uuid.slice(0,8)}..] ${e.response?.status} ${e.response?.data?.message}`);
        errors++;
        continue;
      }

      if (!transcriptMeta?.download_url || !transcriptMeta?.can_download) {
        continue;
      }

      if (DRY_RUN) {
        console.log(`  DRY   ${label} [${uuid.slice(0,8)}..] created:${transcriptMeta.transcript_created_time}`);
        fetched++;
        found = true;
        break;
      }

      // Step 3: download + parse
      let lines;
      try {
        const raw = await downloadTranscript(transcriptMeta.download_url);
        lines = parseTranscript(raw);
      } catch (e) {
        console.log(`  ERR   ${label} download failed: ${e.message}`);
        errors++;
        continue;
      }

      if (lines.length === 0) {
        console.log(`  EMPTY ${label} [${uuid.slice(0,8)}..] (0 lines parsed)`);
        noTranscript++;
        found = true;
        break;
      }

      // Step 4: upsert
      await db.collection('transcripts').replaceOne(
        { _id: uuid },
        {
          _id:                uuid,
          date,
          meetingId,
          topic,
          downloadUrl:        transcriptMeta.download_url,
          transcriptCreatedAt: new Date(transcriptMeta.transcript_created_time),
          lines,
          ingestedAt:         new Date(),
        },
        { upsert: true }
      );

      console.log(`  OK    ${label} [${uuid.slice(0,8)}..] (${lines.length} lines)`);
      fetched++;
      found = true;
      break; // use first instance with a transcript
    }

    if (!found) {
      console.log(`  NONE  ${label} (no transcript found in ${instances.length} instances)`);
      noTranscript++;
    }

    await delay(300);
  }

  console.log(`\nDone. Fetched: ${fetched} | Skipped: ${skipped} | No transcript: ${noTranscript} | Errors: ${errors}`);
  await client.close();
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

run().catch(e => { console.error(e.message); process.exit(1); });
