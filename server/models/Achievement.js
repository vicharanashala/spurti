import crypto from 'crypto';
import mongoose from 'mongoose';

// A permanent, once-earned achievement. Rank achievements (podium places on a
// leaderboard) are awarded by the leaderboard build; milestone ones (Legend,
// level, 3600-min club) are awarded on read off the student's own record.
//
// Each is stored ONCE PER BOARD PER PERIOD: a weekly win carries its week, so
// winning Polls in two different weeks is two achievements and two shareable
// cards, while the same week rebuilt six-hourly stays one. Every row gets a
// `verifyId` so the card's QR can resolve to it.
const achievementSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true },
  achId: { type: String, required: true },   // e.g. rank:poll:week:2026-08-03:1 | ms:legend
  kind: { type: String, enum: ['rank', 'milestone'], default: 'rank' },
  board: { type: String, default: '' },      // poll | attendance | spa | query | total (rank only)
  place: { type: Number, default: 0 },       // 1 | 2 | 3 (rank only)
  icon: { type: String, default: '🏆' },
  title: { type: String, required: true },   // e.g. "Poll Champion"
  period: { type: String, default: '' },     // "Week of Aug 3–9" | "All-time"
  // Sortable/groupable twin of `period`: the week's Monday as 2026-08-03, or
  // 'all'. `period` is display text and changes if the wording ever does, so
  // analysis groups on this instead of parsing achId.
  periodKey: { type: String, default: '', index: true },
  detail: { type: String, default: '' },     // stat line, e.g. "240 SP"
  verifyId: { type: String },                // public code, e.g. SPRT-4F2A-9C1D (indexed below)
  earnedAt: { type: Date, default: Date.now }
}, { timestamps: true });

achievementSchema.index({ studentId: 1, achId: 1 }, { unique: true });

// The verify code is PUBLIC — printed on the card, inside the QR, and in the
// posted caption — so it never needs to be secret, but two students must never
// share one: the verify page would credit the wrong person and the stored card
// PNG (named {verifyId}.png) would overwrite theirs. Randomness alone can only
// make that unlikely; this index is what makes it impossible. Partial, because
// a plain unique index treats every code-less row as a duplicate `null`.
achievementSchema.index(
  { verifyId: 1 },
  { unique: true, partialFilterExpression: { verifyId: { $type: 'string' } } }
);

// Crockford-ish alphabet: no I/L/O/U/0/1, so a code read off a printed card is
// unambiguous. 8 chars from 30 symbols = 6.56e11 combinations.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
// 256 is not a multiple of 30, so a plain `byte % 30` would make the first 16
// symbols 12.5% likelier than the rest. Redrawing the 16 bytes above the last
// whole multiple costs nothing and keeps every symbol equally likely.
const LIMIT = 256 - (256 % ALPHABET.length);   // 240

export function newVerifyId() {
  let s = '';
  while (s.length < 8) {
    for (const b of crypto.randomBytes(8 - s.length)) {
      if (b < LIMIT) s += ALPHABET[b % ALPHABET.length];
    }
  }
  return `SPRT-${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

const Achievement = mongoose.model('Achievement', achievementSchema);

// Awards a batch of achievements, re-rolling any code the unique index rejects.
// Each spec is { filter, doc } and is upserted with $setOnInsert, so an
// achievement already held keeps the code it was first issued.
//
// Two different duplicate-key errors can come back and they mean opposite
// things: one on studentId_1_achId_1 means the student already has this
// achievement (two builds raced — nothing to do), while one on verifyId_1 means
// the code clashed and must be re-rolled. Only the second is retried.
export async function awardAchievements(specs, attempts = 5) {
  let pending = specs.map((s) => ({ ...s, doc: { ...s.doc, verifyId: newVerifyId() } }));
  for (let i = 0; i < attempts && pending.length; i++) {
    const ops = pending.map((s) => ({
      updateOne: { filter: s.filter, update: { $setOnInsert: s.doc }, upsert: true }
    }));
    try {
      await Achievement.bulkWrite(ops, { ordered: false });
      return;
    } catch (err) {
      const writeErrors = err?.writeErrors || [];
      if (!writeErrors.length) throw err;
      const clashed = [];
      for (const we of writeErrors) {
        const info = we.err || we;
        if (info.code !== 11000) throw err;
        // Re-roll only the code clashes; the achId clash is a benign race.
        if (/verifyId/.test(info.errmsg || '')) clashed.push(pending[info.index]);
      }
      pending = clashed.map((s) => ({ ...s, doc: { ...s.doc, verifyId: newVerifyId() } }));
    }
  }
  if (pending.length) {
    throw new Error(`could not mint a unique verifyId after ${attempts} attempts`);
  }
}

export default Achievement;
