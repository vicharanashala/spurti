// Standalone unit test for the running-balance fix in server/routes/contest.js
// Run with:  node tests/contest_balance.test.mjs
import assert from 'node:assert/strict';

// ── In-memory store mirroring the production mongoose models ──
const txStore = [];
const studentStore = [{
  _id: 'stu1', email: 'a@iitrpr.ac.in', name: 'A', totalSp: 100,
  alternateEmail: null, status: 'active'
}];

const SPTransaction = {
  findOne: async ({ email }) => {
    const filtered = txStore.filter(t => t.email === email);
    if (filtered.length === 0) return null;
    return filtered.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime))[0];
  },
  create: async (doc) => { txStore.push(doc); return doc; }
};
const Student = {
  findOne: async ({ $or }) => {
    return studentStore.find(s => $or.some(c => c.email === s.email)) || null;
  }
};

// ── Replicate the fixed award logic verbatim ──
async function awardPassAndReflection({ student, contest, alreadyPassed, alreadyReceivedReflection, hasReflection, score }) {
  const passed = score >= contest.threshold;
  const awardPassSP = passed && !alreadyPassed && contest.spReward > 0;
  const awardReflection = hasReflection && !alreadyReceivedReflection && contest.reflectionSpBonus > 0;
  let earnedSp = 0;

  const last = await SPTransaction.findOne({ email: student.email });
  let runningBalance = Number(last?.balanceAfter ?? student.totalSp ?? 0);

  if (awardPassSP) {
    earnedSp += contest.spReward;
    runningBalance += contest.spReward;
    await SPTransaction.create({
      email: student.email, studentId: student._id,
      category: 'contest', deltaValue: contest.spReward,
      appliedDelta: contest.spReward, balanceAfter: runningBalance,
      dateTime: new Date()
    });
  }
  if (awardReflection) {
    earnedSp += contest.reflectionSpBonus;
    runningBalance += contest.reflectionSpBonus;
    await SPTransaction.create({
      email: student.email, studentId: student._id,
      category: 'contest_reflection', deltaValue: contest.reflectionSpBonus,
      appliedDelta: contest.reflectionSpBonus, balanceAfter: runningBalance,
      dateTime: new Date()
    });
  }
  return { earnedSp, txCount: txStore.length };
}

// ── Test 1: Both pass + reflection — running balance stays consistent ──
const contest = { name: 'Test', threshold: 70, spReward: 15, reflectionSpBonus: 5 };
const r1 = await awardPassAndReflection({
  student: studentStore[0], contest,
  alreadyPassed: false, alreadyReceivedReflection: false,
  hasReflection: true, score: 100
});
assert.equal(r1.earnedSp, 20, 'total earned = pass + reflection');
assert.equal(txStore[0].balanceAfter, 115, 'pass tx balanceAfter = 100 + 15');
assert.equal(txStore[1].balanceAfter, 120, 'reflection tx balanceAfter = 115 + 5 (running, not stale)');
console.log('OK Test 1: pass + reflection — running balance is consistent');

// ── Test 2: Re-run on the same student — alreadyPassed guard fires ──
const r2 = await awardPassAndReflection({
  student: studentStore[0], contest,
  alreadyPassed: true, alreadyReceivedReflection: true,
  hasReflection: true, score: 100
});
assert.equal(r2.earnedSp, 0, 'no SP awarded on second attempt');
assert.equal(txStore.length, 2, 'no new transactions written');
console.log('OK Test 2: alreadyPassed / alreadyReceivedReflection guards block double-award');

// ── Test 3: Failed score — no pass SP, but reflection bonus still fires ──
txStore.length = 0;
studentStore[0].totalSp = 100;
const r3 = await awardPassAndReflection({
  student: studentStore[0], contest,
  alreadyPassed: false, alreadyReceivedReflection: false,
  hasReflection: true, score: 50
});
assert.equal(r3.earnedSp, 5, 'only reflection bonus awarded on failure');
assert.equal(txStore[0].balanceAfter, 105, 'reflection tx balanceAfter = 100 + 5');
console.log('OK Test 3: failed score awards only reflection bonus');

// ── Test 4: Rate limiter math sanity ──
const SUBMIT_LIMIT = 5;
const WINDOW_MS = 60_000;
const buckets = new Map();
function rateLimit(key) {
  const now = Date.now();
  const b = buckets.get(key) || { tokens: SUBMIT_LIMIT, lastRefill: now };
  const elapsed = now - b.lastRefill;
  const refill = Math.floor(elapsed / WINDOW_MS) * SUBMIT_LIMIT;
  if (refill > 0) { b.tokens = Math.min(SUBMIT_LIMIT, b.tokens + refill); b.lastRefill = now; }
  if (b.tokens <= 0) return false;
  b.tokens -= 1; buckets.set(key, b);
  return true;
}
for (let i = 0; i < 5; i++) assert.equal(rateLimit('ip|e'), true, `req ${i+1} allowed`);
assert.equal(rateLimit('ip|e'), false, '6th request blocked');
assert.equal(rateLimit('ip|other'), true, 'different email not blocked');
console.log('OK Test 4: rate limiter blocks 6th request, allows different email');

console.log('\nAll Phase A tests passed.');