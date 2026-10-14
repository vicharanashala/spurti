/* Certificate freeze — writes WRITE-ONCE `certificate_finals` rows for every
 * student on the eligibility list with a completedAllAt date.
 *
 * Design: HANDOFF_CERTIFICATE_DATA.md (agreed 21 Aug 2026). The live ledger
 * keeps accruing forever (attendance/polls are uncapped on the dashboard); the
 * certificate reads ONLY the frozen snapshot taken at the student's own
 * completedAllAt. Once a row exists it is NEVER updated or deleted — re-running
 * only adds newly-completed students, so the printed numbers can never drift.
 *
 * Per student, cut at completedAllAt (inclusive of that day):
 *   minutes        Σ attended minutes parsed from the dated attendance ledger
 *                  rows ("present X of Y min") — UNCAPPED, prints in full
 *   rawSp          Σ ledger appliedDelta to the cut — the "count" number
 *   cappedSp       the certificate SP. Since 2026-10-03 (spRule 'uncapped-v2')
 *                  it equals rawSp: every category counts in full up to the
 *                  cut and penalties are subtracted. The field keeps its old
 *                  name because Samagama's generator prints it. Rows frozen
 *                  before that used per-category caps (att/poll 600 ...).
 *                  level = floor(cappedSp/100), never above 25, shown "X/25"
 *   league         trophy-league band (same bands as the live app) on rawSp
 *   spaCompletedAt derived: timestamp of the 50th validated learn endorsement
 *                  (Samagama sends null; user ruling 2026-09-05)
 *   phase record   ViBe pcts, SPA learned/taught, project review status
 *   queryUnreviewedCount  info flag: answers still awaiting admin review —
 *                  the pre-freeze query-review gate (freeze such students only
 *                  after their review pass, or accept the flag knowingly)
 *
 * CERT_LOCKED students (certificate already issued) are frozen from their
 * locked ledger state and flagged certLocked:true.
 *
 * SELF-SUFFICIENT completedAllAt (added 2026-09-08): when Samagama's
 * eligibility row has completedAllAt null, it is derived here as
 * max(standupCompletedAt, projectCompletedAt, spaCompletedAtDerived,
 * vibeDate) where vibeDate uses the agreed fallback: a finished/100% course
 * with no completedAt takes the first date our mirror observed it (row
 * ObjectId timestamp). Rows carry completedAllAtSource ('samagama'|'derived')
 * and vibeFallbackUsed for audit. Students with any phase underivable are
 * skipped with a reason.
 *
 * PROJECT WAIT (added 2026-10-03): when the project review is completed but
 * the +500 project row is not in the ledger yet (the review lands in the
 * mirror after the last sp-refresh), the student is skipped and frozen on a
 * later run. Before this, 8 students were frozen without their project SP.
 *
 * SIGNED_FINAL / MANUAL (added 2026-10-05): signed certificates are never
 * re-frozen even if their row is removed; MANUAL adds agreed rows for students
 * outside the eligibility list (minutes override kept beside ledgerMinutes).
 *
 * LEDGER_ALIAS (added 2026-10-07): a student who rejoined on a new email keeps
 * the certificate email from the eligibility list, but SP is read from the
 * ledger of the account that holds the earned points.
 *
 * CRON-SAFE: insert-only + idempotent; meant to run 6-hourly after the
 * activity mirror so newly-completed students freeze automatically.
 * Samagama reads certificate_finals verbatim for certificate generation.
 *
 * DRY RUN by default (prints the table). APPLY=1 inserts missing rows only.
 */
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const ENV_FILE = [path.join(__dirname, '..', '.env'), path.join(process.cwd(), '.env')].find((p) => fs.existsSync(p));
for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
  const m = line.match(/^([A-Za-z_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const APPLY = process.env.APPLY === '1';

const SP_RULE = 'uncapped-v2'; // no category caps, penalties subtracted (2026-10-03)
const MAX_LEVEL = 25;
const CERT_LOCKED = new Set(['yaswanthreddythb@gmail.com']);
// Certificates already SIGNED from the row on file (Harshdeep, 4 Oct 2026): never
// write these again, even if their row is deleted — the signed copy is final.
const SIGNED_FINAL = new Set([
  'kartikkhatri8210@ce.du.ac.in', 'garvarora2611@gmail.com', 'kkp1882006@gmail.com',
]);
// Manual rows agreed with Samagama for students outside the eligibility list.
// `minutes` replaces the ledger sum; SP/level/league still come from the ledger.
const MANUAL = [
  { email: 'manyavalechaofficial@gmail.com', completedAllAt: '2026-08-14T02:08:59.579Z', minutes: 4149,
    note: 'Honours the 14 Aug completion acknowledgement (4,149 min incl. Zoom time outside stand-ups; ledger stand-up minutes 3,558). Agreed by Harshdeep 4 Oct 2026.' },
  // Acknowledged by Samagama's cron on the old journey total; honoured 13 Oct 2026
  // (Sakshi's decision, Manya precedent). minutes = ledger stand-ups from the
  // reinstatement date + the real stand-ups attended before it; legacy duplicate
  // May rows excluded. completedAllAt stays Samagama's.
  { email: 'bhoomikabanjara902@gmail.com', minutes: 3618,
    note: 'Honours the 22 Sep acknowledgement: ledger 3,421 + 197 min attended on Day 27-28 (16-17 Jun) before the 1 Jul reinstatement.' },
  { email: 'deepapooja2902@gmail.com', minutes: 3657,
    note: 'Honours the 30 Sep acknowledgement: ledger 3,548 + 109 min attended on Day 35 (25 Jun) before the 1 Jul reinstatement.' },
  { email: 'morduneytanmay@gmail.com', minutes: 4084,
    note: 'Honours the 10 Oct acknowledgement: ledger 2,558 + 1,526 min attended 27 May-16 Jun before the 1 Jul reinstatement (89 min of duplicate May rows excluded).' },
];
// Certificate email -> email whose SP ledger is used. Rohith N R rejoined on
// notrohith444 (2 Jul) after notrohith44 was excused; Harshdeep confirmed same
// person 6 Oct 2026. Activity + eligibility are on 444, SPA/project/quiz SP on 44
// (attendance/polls are duplicated on both, so only one ledger may be read).
const LEDGER_ALIAS = {
  'notrohith444@gmail.com': 'notrohith44@gmail.com',
  // Bhaagwat Sharma (14 Oct 2026): SCALE id deleted by IIT Ropar, Samagama moved his
  // account to the Thapar email; the certificate row carries Thapar, SP + minutes stay
  // on the SCALE ledger (rubric folds Thapar into SCALE via CANON_ALIAS).
  'bsharma_be24@thapar.edu': '25010733@scale.iitrpr.ac.in',
};
const SPA_GOOD = ['approved', 'audit_passed'];
const SPA_DONE_COUNT = 50; // spaCompletedAt = when the 50th validated learn landed
const MINUTES_GOAL = 3600;

// Same bands as server/services/levels.js (kept inline: this is a .cjs pipeline
// script and the app service is ESM).
const LEAGUE_BANDS = [
  [1500, Infinity, 'Legend'], [1400, 1499, 'Diamond I'], [1300, 1399, 'Diamond II'],
  [1200, 1299, 'Diamond III'], [1100, 1199, 'Platinum I'], [1000, 1099, 'Platinum II'],
  [900, 999, 'Platinum III'], [800, 899, 'Gold I'], [700, 799, 'Gold II'],
  [600, 699, 'Gold III'], [500, 599, 'Silver I'], [400, 499, 'Silver II'],
  [300, 399, 'Silver III'], [200, 299, 'Bronze I'], [100, 199, 'Bronze II'], [0, 99, 'Bronze III'],
];
const leagueBand = (sp) => { sp = Math.max(0, sp); for (const [lo, hi, n] of LEAGUE_BANDS) if (sp >= lo && sp <= hi) return n; return 'Bronze III'; };
const dstr = (d) => { if (!d) return null; const x = new Date(d); return isNaN(x) ? null : x.toISOString().slice(0, 10); };

(async () => {
  const conn = await MongoClient.connect(process.env.MONGO_URI);
  const sak = conn.db();
  const Finals = sak.collection('certificate_finals');
  await Finals.createIndex({ email: 1 }, { unique: true });
  const existing = new Set((await Finals.find({}, { projection: { email: 1 } }).toArray()).map((d) => d.email));

  // ALL eligible rows — completedAllAt is derived below when Samagama's is null
  // (their compute job can't see ViBe dateless-100% records or SPA roster
  // completion; ruling 2026-09-08: the freeze is self-sufficient).
  const elig = await sak.collection('act_certificate_eligibility')
    .find({ eligible: true }).toArray();
  // A MANUAL entry overrides `minutes` whether or not the student is already
  // on the eligibility list (2026-10-13: the acknowledged-but-below-3,600 cases
  // all have eligibility rows). completedAllAt stays Samagama's unless the
  // entry sets one. The existing certificate_finals row must be removed first:
  // this script is insert-only.
  for (const m of MANUAL) {
    const el = elig.find((e) => String(e.email).toLowerCase().trim() === m.email);
    if (el) { el.manual = m; if (m.completedAllAt) el.completedAllAt = m.completedAllAt; }
    else elig.push({ email: m.email, completedAllAt: m.completedAllAt, manual: m });
  }

  // userId -> email crosswalk (for the unreviewed-query flag), same sources as the rubric.
  const uidToEmail = new Map();
  for (const c of ['act_query_reviews', 'act_pull_requests', 'act_cs_faq', 'act_spa_rosters']) {
    for (const r of await sak.collection(c).find({ userId: { $ne: null }, email: { $ne: null } }, { projection: { userId: 1, email: 1 } }).toArray())
      uidToEmail.set(String(r.userId), String(r.email).toLowerCase().trim());
  }
  const unreviewedByEmail = new Map();
  for (const q of await sak.collection('act_query_reviews').find(
        { 'peer.submittedAnswerHistory.0': { $exists: true } },
        { projection: { userId: 1, 'peer.submittedAnswerHistory': 1, 'peer.review.action': 1 } }).toArray()) {
    if (q.peer?.review?.action) continue; // reviewed (any verdict) -> not pending
    const asker = String(q.userId);
    const seen = new Set();
    for (let uid of (q.peer.submittedAnswerHistory || [])) {
      uid = String(uid); if (uid === asker || seen.has(uid)) continue; seen.add(uid);
      const e = uidToEmail.get(uid); if (!e) continue;
      unreviewedByEmail.set(e, (unreviewedByEmail.get(e) || 0) + 1);
    }
  }

  const rows = [];
  for (const el of elig) {
    const email = String(el.email).toLowerCase().trim();
    if (SIGNED_FINAL.has(email) && !existing.has(email)) { console.log(`SKIP ${email}: certificate signed — row must not be re-frozen`); continue; }
    const student = await sak.collection('students').findOne({ email });
    if (!student) { console.log(`SKIP ${email}: no students row`); continue; }

    // ---- completedAllAt: Samagama's if set, else derived from the four phases.
    // ViBe fallback (agreed 2026-09-08): a finished/100% course with no
    // completedAt takes the first date OUR mirror observed it finished — the
    // row's ObjectId timestamp. Earliest provable date; SP is cut there.
    let completedAllAt = el.completedAllAt ? new Date(el.completedAllAt) : null;
    let completedAllAtSource = completedAllAt ? (el.manual?.completedAllAt ? 'manual' : 'samagama') : null;
    let vibeFallbackUsed = false;
    const vibeRows = await sak.collection('act_vibe_progress').find({ email }).toArray();
    // SPA completion (agreed with Harshdeep 13 Oct 2026): Samagama's completedAllAt
    // never included the SPA phase (spaCompletedAt null on every eligibility row),
    // so the cut is the LATER of their date and the SPA roster's completedAt (the
    // 50th answered question). Rows already frozen are untouched (insert-only);
    // the 10 certificates signed on the earlier cut stay as issued.
    const spaRoster = await sak.collection('act_spa_rosters').findOne({ email }, { projection: { completedAt: 1 } });
    const spaRosterDate = spaRoster?.completedAt && !isNaN(new Date(spaRoster.completedAt)) ? new Date(spaRoster.completedAt) : null;
    if (completedAllAt && completedAllAtSource === 'samagama' && spaRosterDate && spaRosterDate > completedAllAt) {
      completedAllAt = spaRosterDate;
      completedAllAtSource = 'samagama+spa';
    }
    if (!completedAllAt) {
      const spaLearnsEarly = (await sak.collection('act_spa_endorsements').find(
        { learnerEmail: email, status: { $in: SPA_GOOD } },
        { projection: { approvedAt: 1, createdAt: 1 } }).toArray())
        .map((e) => new Date(e.approvedAt || e.createdAt)).filter((d) => !isNaN(d)).sort((a, b) => a - b);
      const spaDate = spaRosterDate || (spaLearnsEarly.length >= SPA_DONE_COUNT ? spaLearnsEarly[SPA_DONE_COUNT - 1] : null);
      const needed = vibeRows.filter((v) => !v.exempt);
      let vibeDate = null;
      if (needed.length > 0 && needed.every((v) => v.finished || Math.round(v.completionPct || 0) >= 100)) {
        vibeDate = new Date(Math.max(...needed.map((v) => {
          if (v.completedAt && !isNaN(new Date(v.completedAt))) return new Date(v.completedAt).getTime();
          vibeFallbackUsed = true;
          return v._id.getTimestamp().getTime();
        })));
      }
      const standupDate = el.standupCompletedAt ? new Date(el.standupCompletedAt) : null;
      const projectDate = el.projectCompletedAt ? new Date(el.projectCompletedAt) : null;
      if (standupDate && projectDate && spaDate && vibeDate) {
        completedAllAt = new Date(Math.max(standupDate, projectDate, spaDate, vibeDate));
        completedAllAtSource = 'derived';
      } else {
        console.log(`SKIP ${email}: phases incomplete (standup=${!!standupDate} project=${!!projectDate} spa=${!!spaDate} vibe=${!!vibeDate})`);
        continue;
      }
    }
    const cutDay = dstr(completedAllAt);

    const ledgerEmail = LEDGER_ALIAS[email] || email;
    const txns = await sak.collection('sptransactions').find({ email: ledgerEmail }).toArray();
    const upto = txns.filter((t) => dstr(t.dateTime) <= cutDay);
    const byCat = {};
    let minutes = 0;
    for (const t of upto) {
      byCat[t.category] = (byCat[t.category] || 0) + (t.appliedDelta || 0);
      if (t.category === 'attendance') {
        const m = String(t.reason || '').match(/present (\d+) of \d+ min/);
        if (m) minutes += Number(m[1]);
      }
    }
    const ledgerMinutes = minutes;
    if (el.manual) minutes = el.manual.minutes;
    const rawSp = upto.reduce((a, t) => a + (t.appliedDelta || 0), 0);
    const cappedSp = rawSp; // uncapped-v2: see header
    const level = Math.min(MAX_LEVEL, Math.floor(Math.max(cappedSp, 0) / 100));

    // spaCompletedAt = 50th validated learn (approvedAt, fallback createdAt)
    const learns = (await sak.collection('act_spa_endorsements').find(
      { learnerEmail: email, status: { $in: SPA_GOOD } },
      { projection: { approvedAt: 1, createdAt: 1 } }).toArray())
      .map((e) => new Date(e.approvedAt || e.createdAt)).filter((d) => !isNaN(d)).sort((a, b) => a - b);
    const spaTaught = await sak.collection('act_spa_endorsements').countDocuments(
      { teacherEmail: email, status: { $in: SPA_GOOD } });
    const spaCompletedAtDerived = learns.length >= SPA_DONE_COUNT ? learns[SPA_DONE_COUNT - 1] : null;

    const vibe = {};
    for (const v of vibeRows)
      vibe[v.courseKey] = v.finished ? 100 : Math.round(v.completionPct || 0);
    const prRev = await sak.collection('act_pr_reviews').findOne({ email });
    // Project wait: review completed but the +500 not in the ledger yet -> next run.
    if (prRev?.reviewStatus === 'completed' && !(byCat.project > 0) && !existing.has(email) && !CERT_LOCKED.has(email)) {
      console.log(`WAIT ${email}: project review completed but project SP not in the ledger yet — will freeze on a later run`);
      continue;
    }

    rows.push({
      email, name: student.name,
      completedAllAt, completedAllAtSource, vibeFallbackUsed, frozenAt: new Date(),
      certLocked: CERT_LOCKED.has(email),
      minutes, minutesGoalMet: minutes >= MINUTES_GOAL,
      ...(el.manual ? { ledgerMinutes, manualNote: el.manual.note } : {}),
      ...(ledgerEmail !== email ? { ledgerEmail } : {}),
      rawSp, cappedSp, spRule: SP_RULE, level, levelDisplay: `${level}/${MAX_LEVEL}`, league: leagueBand(rawSp),
      perCategory: byCat,
      spaLearned: learns.length, spaTaught, spaCompletedAtDerived,
      vibe, projectStatus: prRev?.reviewStatus || null,
      queryUnreviewedCount: (unreviewedByEmail.get(email) || 0) + (ledgerEmail !== email ? (unreviewedByEmail.get(ledgerEmail) || 0) : 0),
      ledgerRowsAtCut: upto.length,
      alreadyFrozen: existing.has(email),
    });
  }

  rows.sort((a, b) => b.cappedSp - a.cappedSp);
  console.log('email(name) | cut | minutes | rawSp | capped | level | league | qUnrev | frozen?');
  for (const r of rows) {
    console.log(`${r.name.slice(0, 24).padEnd(24)} ${dstr(r.completedAllAt)} ${String(r.minutes).padStart(6)} ${String(r.rawSp).padStart(6)} ${String(r.cappedSp).padStart(6)}  L${r.levelDisplay.padEnd(6)} ${r.league.padEnd(12)} ${String(r.queryUnreviewedCount).padStart(3)} ${r.alreadyFrozen ? 'YES' : (r.certLocked ? 'lock' : '')}`);
  }
  const fresh = rows.filter((r) => !r.alreadyFrozen);
  const flagged = fresh.filter((r) => r.queryUnreviewedCount > 0);
  const derived = fresh.filter((r) => r.completedAllAtSource === 'derived');
  console.log(`\ncandidates: ${rows.length} | already frozen: ${rows.length - fresh.length} | to freeze: ${fresh.length} (derived completedAllAt: ${derived.length}, vibe fallback: ${derived.filter((r) => r.vibeFallbackUsed).length}) | with unreviewed query answers: ${flagged.length}`);

  if (!APPLY) { console.log('\nDRY RUN — nothing written. Set APPLY=1 to insert the missing rows (insert-only).'); await conn.close(); return; }

  let ins = 0;
  for (const r of fresh) {
    const { alreadyFrozen, ...doc } = r;
    try { await Finals.insertOne(doc); ins++; }
    catch (e) { if (e.code !== 11000) throw e; /* raced duplicate -> keep write-once */ }
  }
  console.log(`APPLIED -> ${ins} certificate_finals rows inserted (existing rows untouched).`);
  await conn.close();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
