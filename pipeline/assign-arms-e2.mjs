// E2 goal-card arm assignment — run ON the prod server at launch, AFTER the code
// deploy and BEFORE setting E2_START:
//   cd ~/spurti && set -a && . ./.env && set +a && node pipeline/assign-arms-e2.mjs
// Snapshots the eligible population (active, internshipStartDate >= 2026-07-16,
// no journeyplans row), stratifies engagement x level-distance exactly like E1,
// assigns A/B/C with seeded RNG (deterministic: same snapshot -> same arms),
// WRITES e2Arm onto each student doc (the /api/me card gate reads it), and saves
// the full CSV server-side (has emails — never leaves the server).
// Pre-reg: research/05_experiments/goal_card_e2/preregistration.md
import mongoose from 'mongoose';

const SEED = 20260907;
const URI = process.env.MONGO_URI;
if (!URI) { console.error('no MONGO_URI'); process.exit(1); }
await mongoose.connect(URI);
const db = mongoose.connection.db;

// mulberry32 — small deterministic PRNG; Math.random is not reproducible.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

const setters = new Set((await db.collection('journeyplans').find({}, { projection: { email: 1 } }).toArray())
  .map(p => String(p.email).toLowerCase().trim()));

const studs = await db.collection('students').find(
  { status: 'active', internshipStartDate: { $gte: new Date('2026-07-16') } },
  { projection: { email: 1, totalSp: 1, highestSpEver: 1 } }).toArray();

const pop = studs
  .map(s => ({ email: String(s.email).toLowerCase().trim(), totalSp: s.totalSp || 0, h: Math.max(s.highestSpEver || 0, s.totalSp || 0) }))
  .filter(s => !setters.has(s.email));

// strata: engagement x distance-to-next-level (identical to E1 for comparability)
const stratumOf = s => {
  const eng = s.totalSp <= 100 ? 'floor' : 'earner';
  const r = s.h % 100;
  const dist = r >= 70 ? 'near' : r >= 30 ? 'mid' : 'far';
  return `${eng}|${dist}`;
};
const strata = new Map();
for (const s of pop) {
  const k = stratumOf(s);
  if (!strata.has(k)) strata.set(k, []);
  strata.get(k).push(s);
}

// within each stratum: deterministic order, seeded Fisher-Yates, then A/B/C in turn
const rows = [];
for (const [k, list] of [...strata.entries()].sort()) {
  list.sort((a, b) => a.email < b.email ? -1 : 1);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  list.forEach((s, i) => rows.push({ email: s.email, stratum: k, arm: ['A', 'B', 'C'][i % 3] }));
}

const stamp = new Date().toISOString().slice(0, 10);
const csv = 'email,stratum,arm\n' + rows.map(r => `${r.email},${r.stratum},${r.arm}`).join('\n');
const fs = await import('fs');
const out = `${process.env.HOME}/spurti/e2_assignment_${stamp}.csv`;
fs.writeFileSync(out, csv);

// Stamp arms onto the student docs — the server's /api/me gate reads e2Arm.
for (const arm of ['A', 'B', 'C']) {
  const emails = rows.filter(r => r.arm === arm).map(r => r.email);
  const res = await db.collection('students').updateMany(
    { email: { $in: emails } }, { $set: { e2Arm: arm } });
  console.log(`arm ${arm}: ${emails.length} assigned, ${res.modifiedCount} student docs stamped`);
}

console.log(`population ${rows.length}`);
for (const [k, list] of [...strata.entries()].sort()) console.log(`  stratum ${k}: ${list.length}`);
console.log(`assignment CSV (KEEP SERVER-SIDE, has emails): ${out}`);
await mongoose.disconnect();
