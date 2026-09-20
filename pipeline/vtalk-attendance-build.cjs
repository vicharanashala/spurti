'use strict';
/**
 * vtalk-attendance-build.cjs
 *
 * Builds sakshi_spurti.vtalk_attendance from the zoom_attendance mirror —
 * one doc per (V-Talk session, resolvable student). The SP rubric
 * (sp-rubric-build-mirror.cjs, V-Talk pass) scores this collection on every
 * rebuild, so this builder is the only thing that has to run when new V-Talk
 * data arrives in the Zoom mirror. Safe to re-run: full rewrite per label.
 *
 * Resolution rules (strict — wrong-student credit is worse than no credit):
 *   1. row email matches a candidate email/alias           -> credited
 *   2. roll number (e.g. 24f3001996) inside display name
 *      matches a candidate email local part                -> credited
 *   3. normalized display name matches exactly ONE
 *      candidate name                                      -> credited
 *   ambiguous or unmatched names are skipped and counted.
 *
 * V-Talk 07 (14 Aug, meetingId 92262477413) is EXCLUDED: it ran inside
 * Spandan and is already scored as "Day 78 (14 Aug)" — including it here
 * would double-credit the same hour.
 *
 * Run: cd ~/spurti && node pipeline/vtalk-attendance-build.cjs
 */
const { MongoClient } = require('mongodb');
require('dotenv').config();

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set. Run from the repo root: cd ~/spurti && node pipeline/vtalk-attendance-build.cjs');
  process.exit(1);
}

const WINDOW_MIN = 60; // every synchronous session counts as one 60-min block (3600 goal)

// Known sessions; any OTHER zoom_meetings doc with a v-talk-ish topic is
// auto-included with a label parsed from the topic (or bare "V-Talk").
const KNOWN_LABELS = {
  98906641901: 'V-Talk 03', // Devyani Wankhede, 4 Jul (webinar)
  91675499012: 'V-Talk 04', // Dhivya Kannan, 14 Jul (webinar)
  94814083137: 'V-Talk 05', // Dr. Yayati Gupta, 25 Jul (meeting, real emails)
  92569888217: 'V-Talk 06', // Dr. M.S. Lakshmi Priya, 31 Jul (webinar)
};
const EXCLUDE = new Set([92262477413]); // V-Talk 07 = Spandan "Day 78 (14 Aug)"

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const ROLL_IN_NAME = /\b(\d{2}[a-z]{1,2}\d{6,7})\b/i;
const ROLL_IN_EMAIL = /^(\d{2}[a-z]{1,2}\d{6,7})@/i;

(async () => {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db('sakshi_spurti');

  // Roster: canonical email + aliases + names, from candidates (same source
  // the rubric uses for eligibility).
  const emailSet = new Set(); const rollMap = new Map(); const nameMap = new Map();
  for (const u of await db.collection('candidates')
    .find({ email: { $exists: true } }, { projection: { email: 1, emailAlt: 1, zoomEmail: 1, name: 1 } }).toArray()) {
    const canon = norm(u.email); if (!canon) continue;
    for (const e of [canon, norm(u.emailAlt), norm(u.zoomEmail)].filter(Boolean)) {
      emailSet.add(e);
      const rm = ROLL_IN_EMAIL.exec(e); if (rm) rollMap.set(rm[1].toLowerCase(), canon);
    }
    const n = norm(u.name);
    if (n) { if (!nameMap.has(n)) nameMap.set(n, new Set()); nameMap.get(n).add(canon); }
  }

  const meetings = await db.collection('zoom_meetings')
    .find({ topic: /v[-\s]?talk/i }).sort({ date: 1 }).toArray();

  const builtLabels = [];
  const docs = [];
  for (const m of meetings) {
    if (EXCLUDE.has(m.meetingId)) continue;
    let label = KNOWN_LABELS[m.meetingId];
    if (!label) {
      const num = /v[-\s]?talk\s*0*(\d+)/i.exec(m.topic || '');
      label = num ? `V-Talk ${String(num[1]).padStart(2, '0')}` : 'V-Talk';
    }
    builtLabels.push(label);

    const best = new Map(); // canon email -> {mins, name}
    let matched = 0, ambiguous = 0, unmatched = 0, total = 0;
    for (const p of await db.collection('zoom_attendance').find({ meetingId: m.meetingId }).toArray()) {
      total++;
      let e = norm(p.email);
      if (e && !emailSet.has(e)) { unmatched++; continue; } // host/guest, not a candidate
      if (!e) {
        const rm = ROLL_IN_NAME.exec(p.name || '');
        if (rm && rollMap.has(rm[1].toLowerCase())) e = rollMap.get(rm[1].toLowerCase());
        else {
          const cands = nameMap.get(norm(p.name));
          if (cands && cands.size === 1) e = [...cands][0];
          else { cands && cands.size > 1 ? ambiguous++ : unmatched++; continue; }
        }
      }
      matched++;
      const mins = Math.min(WINDOW_MIN, Math.round(p.duration || 0));
      const prev = best.get(e);
      if (!prev || mins > prev.mins) best.set(e, { mins, name: p.name || '' });
    }

    for (const [email, v] of best) {
      docs.push({ label, date: m.date, meetingId: m.meetingId, email, name: v.name,
        attendedMinutes: v.mins, windowMinutes: WINDOW_MIN, builtAt: new Date() });
    }
    console.log(`${label} (${m.date}) "${m.topic}": ${total} rows -> ${matched} credited` +
      ` (${best.size} unique students), ${ambiguous} ambiguous skipped, ${unmatched} unmatched`);
  }

  if (builtLabels.length) {
    const del = await db.collection('vtalk_attendance').deleteMany({ label: { $in: builtLabels } });
    const ins = docs.length ? await db.collection('vtalk_attendance').insertMany(docs) : { insertedCount: 0 };
    console.log(`vtalk_attendance: replaced ${del.deletedCount} -> inserted ${ins.insertedCount}`);
  } else {
    console.log('no V-Talk meetings found in zoom_meetings');
  }
  await client.close();
})();
