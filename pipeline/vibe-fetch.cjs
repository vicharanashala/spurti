// vibe-fetch.cjs — mirror ViBe course completion into sakshi_spurti.vibe_course_progress.
//
// Source: the ViBe public leaderboard endpoint, which is UNRELIABLE by history —
// public in June, 401-gated 1 Aug, open again 5 Aug, onboarding 503 on 21 Aug.
// Policy: pull whenever it answers; every successful pull upserts (email×courseKey)
// so the mirror keeps the freshest state even if the endpoint disappears again.
// Raw responses are archived under data/vibe-snapshots/<date>/ for reproducibility.
//
// Run:  cd ~/spurti && node pipeline/vibe-fetch.cjs
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const BASE = 'https://vibe-backend-production-239934307367.asia-south1.run.app/api/users/progress/courses';
// AI has TWO entry courses (either routes to MERN) — proper "AI done" = best of the two.
const COURSES = [
  { key: 'onboarding', courseId: '6a14258a4fa5339bade5d732', versionId: '6a14258a4fa5339bade5d733' },
  { key: 'ai_b',       courseId: '6a055c4c79eef782c2548388', versionId: '6a055c4c79eef782c2548389' },
  { key: 'ai_a',       courseId: '69c268f5d84bfe65c8598e91', versionId: '69c268f5d84bfe65c8598e92' },
  { key: 'mern',       courseId: '6a0ec8254658465536acb121', versionId: '6a0ec8254658465536acb122' }
];

(async () => {
  const conn = await MongoClient.connect(process.env.MONGO_URI);
  const col = conn.db().collection('vibe_course_progress');
  await col.createIndex({ email: 1, courseKey: 1 }, { unique: true });
  const snapDir = path.join(__dirname, '..', 'data', 'vibe-snapshots', new Date().toISOString().slice(0, 10));
  fs.mkdirSync(snapDir, { recursive: true });
  const now = new Date();

  for (const c of COURSES) {
    const url = `${BASE}/${c.courseId}/versions/${c.versionId}/leaderboard/no-auth`;
    let rows;
    try {
      const r = await fetch(url);
      if (!r.ok) { console.log(`${c.key}: HTTP ${r.status} — skipped (mirror keeps last good state)`); continue; }
      const j = await r.json();
      rows = j.data || (Array.isArray(j) ? j : []);
    } catch (e) { console.log(`${c.key}: fetch failed (${e.message}) — skipped`); continue; }
    fs.writeFileSync(path.join(snapDir, `${c.key}.json`), JSON.stringify(rows));

    let up = 0;
    for (const x of rows) {
      const email = String(x.email || '').toLowerCase().trim();
      if (!email) continue;
      const pct = Number(x.completionPercentage) || 0;
      await col.updateOne({ email, courseKey: c.key }, { $set: {
        courseId: c.courseId, versionId: c.versionId,
        completionPct: pct, finished: pct >= 100,
        enrolledAt: x.enrolledAt ? new Date(x.enrolledAt) : null,
        completedAt: x.completedAt ? new Date(x.completedAt) : null,
        userId: x.userId || null, rank: x.rank || null,
        _mirroredAt: now
      } }, { upsert: true });
      up++;
    }
    console.log(`${c.key}: ${rows.length} records, ${up} upserted`);
  }
  console.log('total docs in vibe_course_progress:', await col.countDocuments());
  await conn.close();
})();
