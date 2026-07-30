/**
 * sp-rubric-build.js — build (and optionally write) Spurti Points per the
 * 2026-06 "SP roaster" rubric, replacing Sakshi's older chat/penalty scheme
 * while she is on leave.
 *
 * SCOPE: implements rubric parts A (attendance) + B (poll participation) + the
 * base-100 credit. Part C (admin discretionary awards/deductions) is handled
 * via the admin SP Award panel (/admin/sp-award) — not by this script.
 * Parts D/E/F (ViBe milestones, Discourse trust, WhatsApp) are not yet wired
 * — they layer on later as feeds arrive.
 *
 * RULES (see docs / memory project_sp_scoring_rubric):
 *   - ROSTER-DRIVEN base: EVERY started intern gets base SP = 100 on their
 *     official start date — even if they never attended. A "started intern" is
 *     anyone who (a) has confirmed dates in chatengine (vinsStartDate set, not
 *     rejected/deleted), OR (b) attended a mandatory session while id-confirmed
 *     in the sakshi roster. Official start = vinsStartDate -> sakshi start ->
 *     program start. Mandatory attendance/poll (only sessions on/after the start
 *     date) is a BONUS on top; pre-start attendance does NOT count. Interns whose
 *     start is in the FUTURE earn 0 until it arrives (auto once the date passes).
 *   - Mandatory sessions only: topic matches /stand|orientation/i and NOT
 *     breakout/weekend/nptel/special/support; the day's FIRST such instance
 *     (>=10 attendees) sets the official window [09:05 IST, min(first-instance-end, 11:00 IST)].
 *   - Attendance (A): presence clipped STRICTLY to the official window
 *     (sessions open early for moderator prep — that time does NOT count),
 *     pct = clipped-minutes / window-minutes, tier 10/5/3/0 (>=90/75/50/<50).
 *     No penalty for absence. Per-session (each session tiered, summed).
 *   - Poll (B): participation% = answered / questions-launched in that same
 *     first instance, tier 10/5/3/0. Per session.
 *   - Identity: credit only id-confirmed students (Zoom login email matches a
 *     roster email or alt in chatengine.users / sakshi_spurti.students). Others
 *     are written to a set-aside file for manual alias resolution.
 *   - Staff/host/faculty accounts are excluded.
 *   - Gating is purely by DATE (vinsStartDate), NOT the status field (which is
 *     not auto-maintained): a student earns once their official start date has
 *     arrived. Credited students are marked status='active' (excused preserved)
 *     so the leaderboard reflects them. Future-start students earn 0.
 *
 * DATA SOURCES: zoom_data.meetings (session list), Zoom Reports API
 * (per-segment join/leave for strict clipping), zoom_data.polls (poll answers,
 * mirrored by #zoomupdate), chatengine.users + sakshi_spurti.students (roster).
 *
 * USAGE:
 *   node sp-rubric-build.js                 # DRY RUN: writes ledger CSV, no DB write
 *   APPLY=1 node sp-rubric-build.js         # also REPLACE sakshi_spurti points (backs up first)
 *   START_DATE=2026-05-15 OUT_DIR=/tmp ...  # optional overrides
 *
 * Requires ZOOM_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET + MONGO_URI in .env.
 */
require('dotenv').config();
const _ax = require('axios'); const axios = _ax.default || _ax;
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.MONGO_URI || '').replace(/\/[^/?]*(\?.*)?$/, '');
const { ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET } = process.env;
const START_DATE = process.env.START_DATE || '2026-05-15';
const PROGRAM_START = process.env.PROGRAM_START || '2026-05-15';
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const OUT_DIR = process.env.OUT_DIR || process.cwd();
const APPLY = process.env.APPLY === '1';

// 09:05 IST = 03:35 UTC. wEnd = min(first-instance-end, 11:00 IST). Per-day end overrides (IST) take precedence.
const WINDOW_END_OVERRIDE_IST = { '2026-05-22': '11:00' };
const GRACE_DATE = '2026-06-06'; // exceptional: 1 min join = full att + full poll
const STAFF = new Set([
  'dled@iitrpr.ac.in', 'prakash.hegade@gmail.com',
  'sudarshansudarshan@gmail.com', 'sudarshan@iitrpr.ac.in', 'rajankrsna@gmail.com',
]);

const isMandatory = (t) => /stand|orientation/i.test(t) && !/breakout|weekend|nptel|special|support|non[- ]?mandatory/i.test(t);
const tier = (pct) => { pct = Math.min(100, pct); return pct >= 90 ? 10 : pct >= 75 ? 5 : pct >= 50 ? 3 : 0; };
const dstr = (d) => { if (!d) return null; const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); };
const minDate = (...xs) => { const v = xs.filter(Boolean).sort(); return v[0] || null; };
const istHHMM = (ms) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(11, 16);
const utcFromISTDate = (date, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return Date.parse(`${date}T00:00:00Z`) + ((h - 5) * 60 + (m - 30)) * 60000; };
const enc = (u) => encodeURIComponent(encodeURIComponent(u));
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const ddmon = (d) => { const [, m, dd] = d.split('-'); return (+dd) + ' ' + MON[+m - 1]; };
const dayLabel = (topic) => { const m = String(topic).match(/Day\s+([IVXLC0-9]+)/i); return m ? 'Day ' + m[1] : (/orientation/i.test(topic) ? 'Orientation' : topic); };

let _tok;
async function zoomToken() {
  if (_tok) return _tok;
  const basic = Buffer.from(`${ZOOM_CLIENT_ID}:${ZOOM_CLIENT_SECRET}`).toString('base64');
  const r = await axios.post('https://zoom.us/oauth/token', null, { params: { grant_type: 'account_credentials', account_id: ZOOM_ACCOUNT_ID }, headers: { Authorization: `Basic ${basic}` } });
  _tok = r.data.access_token; return _tok;
}
async function participants(uuid) {
  let out = [], npt = null;
  do {
    const t = await zoomToken();
    const r = await axios.get(`https://api.zoom.us/v2/report/meetings/${enc(uuid)}/participants`, { headers: { Authorization: `Bearer ${t}` }, params: { page_size: 300, ...(npt ? { next_page_token: npt } : {}) } });
    out = out.concat(r.data.participants || []); npt = r.data.next_page_token || null;
  } while (npt);
  return out;
}

(async () => {
  if (!BASE) throw new Error('no MONGO_URI');
  const conn = await MongoClient.connect(`${BASE}/?authSource=admin`);
  const zoom = conn.db('zoom_data'), sak = conn.db('sakshi_spurti'), ce = conn.db('chatengine');

  // 1. roster + interns. A "started intern" (gets base 100) is anyone who EITHER
  //    (a) has confirmed dates in chatengine (vinsStartDate set, not rejected/
  //    deleted), OR (b) attended a mandatory session while id-confirmed in the
  //    sakshi roster. Official start = vinsStartDate -> sakshi start -> program.
  const sakBy = new Map(); const rosterIds = new Set(); const excusedSet = new Set();
  for (const s of await sak.collection('students').find({}, { projection: { email: 1, alternateEmail: 1, internshipStartDate: 1, status: 1 } }).toArray()) {
    const d = dstr(s.internshipStartDate);
    for (const e of [s.email, s.alternateEmail].filter(Boolean)) { const k = String(e).toLowerCase().trim(); rosterIds.add(k); if (d) sakBy.set(k, d); if (s.status === 'excused') excusedSet.add(k); }
  }
  const vinsBy = new Map(); const rejectedSet = new Set(); const internCanon = new Map(); const emailToCanon = new Map(); const nameBy = new Map();
  for (const u of await ce.collection('users').find({ email: { $exists: true } }, { projection: { email: 1, emailAlt: 1, zoomEmail: 1, name: 1, vinsStartDate: 1, applicationStatus: 1, deletedAt: 1 } }).toArray()) {
    const canon = String(u.email || '').toLowerCase().trim(); if (!canon) continue;
    const emails = [canon, u.emailAlt && String(u.emailAlt).toLowerCase().trim(), u.zoomEmail && String(u.zoomEmail).toLowerCase().trim()].filter(Boolean);
    const d = dstr(u.vinsStartDate);
    for (const e of emails) { rosterIds.add(e); if (d) vinsBy.set(e, d); }
    if (u.applicationStatus === 'rejected' || u.deletedAt) { for (const e of emails) rejectedSet.add(e); continue; }
    if (d) { internCanon.set(canon, emails); for (const e of emails) emailToCanon.set(e, canon); nameBy.set(canon, u.name || canon); }
  }

  // 2. mandatory first-instance per day + official window
  const meetings = await zoom.collection('meetings').find({ date: { $gte: START_DATE } }).sort({ date: 1, startTime: 1 }).toArray();
  const byDate = {}; for (const m of meetings) (byDate[m.date] = byDate[m.date] || []).push(m);
  const sessions = [];
  for (const date of Object.keys(byDate).sort()) {
    const first = byDate[date].filter((m) => isMandatory(m.topic) && (m.participantsCount || 0) >= 10).sort((a, b) => new Date(a.startTime) - new Date(b.startTime))[0];
    if (!first) continue;
    const wStart = utcFromISTDate(date, '09:05');
    const wEnd = WINDOW_END_OVERRIDE_IST[date] ? utcFromISTDate(date, WINDOW_END_OVERRIDE_IST[date]) : Math.min(new Date(first.endTime).getTime(), utcFromISTDate(date, '11:00'));
    sessions.push({ date, uuid: first._id, topic: first.topic, wStart, wEnd, label: dayLabel(first.topic) });
  }

  // 3. per-student per-session attendance (A) + poll (B)
  const students = new Map(); // email -> { name, firstAtt, rows:[{date,order,cat,delta,reason}] }
  const touch = (email, name) => { const e = email.toLowerCase().trim(); if (!students.has(e)) students.set(e, { name: name || e, firstAtt: null, rows: [] }); const o = students.get(e); if (name && !name.includes('@')) o.name = name; return o; };
  for (const s of sessions) {
    const winMin = Math.round((s.wEnd - s.wStart) / 60000);
    // attendance via Zoom API segments, clipped to window
    const segByEmail = new Map();
    for (const p of await participants(s.uuid)) {
      const e = String(p.user_email || '').toLowerCase().trim(); if (!e) continue;
      if (!segByEmail.has(e)) segByEmail.set(e, { name: p.name || '', secs: 0 });
      if (p.join_time && p.leave_time) { const a = Math.max(Date.parse(p.join_time), s.wStart), b = Math.min(Date.parse(p.leave_time), s.wEnd); if (b > a) segByEmail.get(e).secs += (b - a) / 1000; }
      if (!segByEmail.get(e).name && p.name) segByEmail.get(e).name = p.name;
    }
    for (const [e, v] of segByEmail) {
      const mins = (s.date === GRACE_DATE && v.secs > 0) ? winMin : Math.min(winMin, Math.round(v.secs / 60)); const pct = winMin ? Math.round(mins / winMin * 1000) / 10 : 0; const d = tier(pct);
      touch(e, v.name).rows.push({ date: s.date, order: 1, cat: 'attendance', delta: d, reason: `${s.label} (${ddmon(s.date)}): present ${mins} of ${winMin} min (${pct}%) within official ${istHHMM(s.wStart)}-${istHHMM(s.wEnd)} IST window -> ${d > 0 ? '+' : ''}${d} SP.` });
      const o = students.get(e); if (!o.firstAtt || s.date < o.firstAtt) o.firstAtt = s.date;
    }
    // poll participation via zoom_data.polls for the same instance
    const polls = await zoom.collection('polls').find({ meetingUuid: s.uuid }).toArray();
    const totalQ = new Set(polls.map((p) => p.question)).size;
    if (totalQ > 0) {
      const ans = new Map(); for (const p of polls) { const e = String(p.email || '').toLowerCase().trim(); if (!e) continue; if (!ans.has(e)) ans.set(e, new Set()); if (p.answer && String(p.answer).trim()) ans.get(e).add(p.question); }
      const present = new Set([...segByEmail.keys(), ...ans.keys()]);
      for (const e of present) {
        const a = (s.date === GRACE_DATE && segByEmail.has(e)) ? totalQ : (ans.get(e) || new Set()).size; const pct = Math.round(a / totalQ * 1000) / 10; const d = tier(pct);
        touch(e).rows.push({ date: s.date, order: 2, cat: 'poll', delta: d, reason: `${s.label} (${ddmon(s.date)}): answered ${a} of ${totalQ} poll questions (${pct}%) -> ${d > 0 ? '+' : ''}${d} SP.` });
      }
    }
  }

  // 4. assemble ledger, ROSTER-DRIVEN union: base 100 to every started intern.
  const ledger = []; const setAside = []; const finalBal = new Map(); const zeroOut = []; const nameByCanon = new Map();
  const candidates = new Map(); // identity email -> { start, emails:[..], name }
  // (a) confirmed chatengine interns (incl. those who never attended)
  for (const [canon, emails] of internCanon) candidates.set(canon, { start: vinsBy.get(canon) || PROGRAM_START, emails, name: nameBy.get(canon) || canon });
  // (b) mandatory attendees id-confirmed in the roster (e.g. sakshi-only), not rejected
  for (const email of students.keys()) {
    if (STAFF.has(email) || rejectedSet.has(email)) continue;
    const canon = emailToCanon.get(email) || email;
    if (candidates.has(canon)) continue;
    if (!rosterIds.has(email)) continue; // not id-confirmed -> set-aside
    candidates.set(canon, { start: vinsBy.get(email) || sakBy.get(email) || PROGRAM_START, emails: [email], name: students.get(email).name });
  }
  const matched = new Set();
  for (const [cand, info] of candidates) {
    if (STAFF.has(cand)) continue;
    for (const e of info.emails) matched.add(e);
    if (info.start > TODAY) { zeroOut.push(cand); continue; } // start not yet arrived -> 0
    const best = new Map();
    for (const e of info.emails) { const o = students.get(e); if (!o) continue; if (info.name === cand && o.name && !o.name.includes('@')) info.name = o.name; for (const r of o.rows) { if (r.date < info.start) continue; const k = r.date + '|' + r.cat; const cur = best.get(k); if (!cur || r.delta > cur.delta) best.set(k, r); } }
    const rows = [{ date: info.start, order: 0, cat: 'initial', delta: 100, reason: `Base Spurti Points (100) credited on internship start date ${info.start}.` }, ...best.values()];
    rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order);
    let bal = 0; for (const r of rows) { bal += r.delta; ledger.push({ email: cand, name: info.name, ...r, balanceAfter: bal }); }
    finalBal.set(cand, bal); nameByCanon.set(cand, info.name);
  }
  for (const [e, o] of students) { if (STAFF.has(e) || matched.has(e) || emailToCanon.has(e)) continue; setAside.push({ email: e, name: o.name, rows: o.rows.length }); }

  // 5. output CSV(s)
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15) + 'Z';
  const ledgerCsv = path.join(OUT_DIR, `sp_ledger_${ts}.csv`);
  fs.writeFileSync(ledgerCsv, 'email,name,date,category,applied_delta,balance_after,reason\n' +
    ledger.map((r) => ['"' + r.email + '"', '"' + String(r.name).replace(/"/g, '') + '"', r.date, r.cat, r.delta, r.balanceAfter, '"' + r.reason.replace(/"/g, '') + '"'].join(',')).join('\n'));
  const asideCsv = path.join(OUT_DIR, `sp_set_aside_${ts}.csv`);
  fs.writeFileSync(asideCsv, 'email,name,attended_rows\n' + setAside.map((r) => ['"' + r.email + '"', '"' + String(r.name).replace(/"/g, '') + '"', r.rows].join(',')).join('\n'));
  console.log(`sessions: ${sessions.length} | started interns (base100): ${finalBal.size} | txns: ${ledger.length} | future-start zeroed: ${zeroOut.length} | non-intern attendees set-aside: ${setAside.length}`);
  console.log(`sum balances: ${[...finalBal.values()].reduce((a, b) => a + b, 0)}`);
  console.log(`ledger CSV : ${ledgerCsv}`);
  console.log(`set-aside  : ${asideCsv}`);

  if (!APPLY) { console.log('\nDRY RUN — no DB write. Set APPLY=1 to replace sakshi_spurti points.'); await conn.close(); return; }

  // 6. APPLY: reconnect fresh — the original connection can go stale during the
  //    long Zoom-fetch phase ("stream has been aborted" on the big backup read).
  await conn.close().catch(() => {});
  const wconn = await MongoClient.connect(`${BASE}/?authSource=admin`, { socketTimeoutMS: 600000 });
  const wsak = wconn.db('sakshi_spurti');
  const backupDir = path.join(OUT_DIR, `sp_backup_${ts}`); fs.mkdirSync(backupDir, { recursive: true });
  for (const coll of ['sptransactions', 'students']) fs.writeFileSync(path.join(backupDir, `${coll}.json`), JSON.stringify(await wsak.collection(coll).find({}).toArray()));
  console.log(`\nbackup written: ${backupDir}`);
  const Students = wsak.collection('students'), Tx = wsak.collection('sptransactions');
  const emails = [...finalBal.keys()];
  // upsert student docs (name, totalSp, internshipStartDate)
  const sBulk = [];
  for (const [email, bal] of finalBal) {
    const start = ledger.find((r) => r.email === email && r.cat === 'initial').date;
    const name = nameByCanon.get(email) || email;
    const st = excusedSet.has(email) ? 'excused' : 'active'; // started intern -> active (preserve excused)
    sBulk.push({ updateOne: { filter: { email }, update: { $set: { name, totalSp: bal, internshipStartDate: new Date(start + 'T00:00:00.000Z'), status: st }, $setOnInsert: { alternateEmail: '', internshipEndDate: null } }, upsert: true } });
  }
  for (let i = 0; i < sBulk.length; i += 1000) await Students.bulkWrite(sBulk.slice(i, i + 1000), { ordered: false });
  const idMap = new Map(); for (const s of await Students.find({ email: { $in: emails } }, { projection: { email: 1 } }).toArray()) idMap.set(s.email, s._id);
  // replace transactions
  let del = 0; for (let i = 0; i < emails.length; i += 500) { const r = await Tx.deleteMany({ email: { $in: emails.slice(i, i + 500) } }); del += r.deletedCount; }
  const docs = ledger.map((r) => { const idx = r.reason.indexOf(': '); return { email: r.email, studentId: idMap.get(r.email), category: r.cat, sessionLabel: r.cat === 'initial' ? '' : (idx > 0 ? r.reason.slice(0, idx) : ''), deltaMode: 'absolute', deltaValue: r.delta, appliedDelta: r.delta, balanceAfter: r.balanceAfter, reason: r.reason, dateTime: new Date(r.date + (r.cat === 'initial' ? 'T00:00:00.000Z' : 'T09:00:00.000Z')), createdAt: new Date(), updatedAt: new Date() }; });
  let ins = 0; for (let i = 0; i < docs.length; i += 2000) { await Tx.insertMany(docs.slice(i, i + 2000), { ordered: false }); ins += Math.min(2000, docs.length - i); }
  console.log(`APPLIED -> students upserted ${sBulk.length}, old txns deleted ${del}, new txns inserted ${ins}`);
  // zero students who attended but are future-start or yet-to-onboard (meter not started)
  if (zeroOut.length) {
    let zdel = 0; for (let i = 0; i < zeroOut.length; i += 500) { const r = await Tx.deleteMany({ email: { $in: zeroOut.slice(i, i + 500) } }); zdel += r.deletedCount; }
    for (let i = 0; i < zeroOut.length; i += 1000) await Students.bulkWrite(zeroOut.slice(i, i + 1000).map((email) => ({ updateOne: { filter: { email }, update: { $set: { totalSp: 0 } } } })), { ordered: false });
    console.log(`ZEROED -> ${zeroOut.length} future-start/yet-to-onboard students (txns deleted ${zdel}, totalSp=0)`);
  }
  await wconn.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
