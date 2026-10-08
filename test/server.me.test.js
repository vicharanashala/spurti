// /me is the dashboard's main call, made by every student on every load. These tests
// pin the property that lets it scale to a large cohort: it does per-student work only
// and never reads the whole student collection. Model queries are stubbed, so no
// database is involved; what is asserted is HOW the server queries, and what it returns.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import mongoose from 'mongoose';

process.env.SPURTI_NO_START = '1';
process.env.ALLOW_STUDENT_SEARCH = 'false';   // production mode: identity comes from the cookie only
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_TOKEN = 'test-admin-token';
mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', false);

// A chainable stand-in for a Mongoose query that records how it was built.
const calls = { studentFind: [], aggregate: 0, count: [], findOne: [] };
const query = (log, result) => {
  const q = { ops: {}, sort() { return q; }, select() { return q; },
    skip(n) { q.ops.skip = n; return q; }, limit(n) { q.ops.limit = n; return q; },
    lean() { return Promise.resolve(typeof result === 'function' ? result(q.ops) : result); },
    then(res, rej) { return q.lean().then(res, rej); } };
  log?.push(q.ops);
  return q;
};

const ME = {
  _id: 'abc123', name: 'Rohit Ram', email: 'rohit.ram@example.com', alternateEmail: '', status: 'active',
  totalSp: 1486, highestSpEver: 1486, internshipStartDate: new Date('2026-07-16T00:00:00Z'),
  internshipEndDate: new Date('2026-10-31T00:00:00Z'), leaderboardGroup: '2026-07-16_to_2026-07-31'
};
const TOP = [
  { name: 'A', email: 'a@x.co', totalSp: 2100, highestSpEver: 2100 },
  { name: 'B', email: 'b@x.co', totalSp: 1900, highestSpEver: 1900 },
  { name: 'Rohit Ram', email: 'rohit.ram@example.com', totalSp: 1486, highestSpEver: 1486 }
];

let samagamaCalls = 0, samagama, server, base;

before(async () => {
  const realError = console.error;
  console.error = (...a) => { if (!String(a[0]).startsWith('[error]')) realError(...a); };

  samagama = http.createServer((_req, res) => {
    samagamaCalls += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ user: { email: ME.email } }));
  });
  await new Promise(r => samagama.listen(0, '127.0.0.1', r));
  process.env.SAMAGAMA_AUTH_URL = `http://127.0.0.1:${samagama.address().port}/api/auth/me`;

  const { default: Student } = await import('../server/models/Student.js');
  const { default: SPTransaction } = await import('../server/models/SPTransaction.js');
  const { default: PollRecord } = await import('../server/models/PollRecord.js');
  const { default: AttendanceRecord } = await import('../server/models/AttendanceRecord.js');

  Student.findOne = (filter) => {
    calls.findOne.push(filter);
    // "who is just above me" carries a status filter; the identity lookup does not
    return query(null, filter.status ? { totalSp: 1500 } : ME);
  };
  Student.find = (filter) => query(calls.studentFind, ops => {
    if (ops.skip === 9) return [{ totalSp: 1700 }];
    if (ops.skip === 49) return [{ totalSp: 1200 }];
    return TOP;
  });
  Student.countDocuments = (filter = {}) => { calls.count.push(filter); return Promise.resolve(filter.$or ? 17 : 214); };
  Student.aggregate = () => { calls.aggregate += 1; return Promise.resolve([{ _id: null, avg: 864.4 }]); };
  SPTransaction.find = () => query(null, []);
  PollRecord.find = () => query(null, []);
  AttendanceRecord.find = () => query(null, []);

  const { default: app } = await import('../server/server.js');
  server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise(r => server.close(r));
  await new Promise(r => samagama.close(r));
});

const me = () => fetch(base + '/api/me', { headers: { cookie: 'chatengine_token=tok' } });

describe('GET /api/me', () => {
  test('returns the student with rank, cohort size and cohort figures', async () => {
    const res = await me();
    assert.equal(res.status, 200);
    const { profile } = await res.json();
    assert.equal(profile.student.name, 'Rohit Ram');
    assert.equal(profile.student.rank, 18, '17 ahead -> rank 18');
    assert.equal(profile.student.cohortSize, 214);
    assert.equal(profile.cohort.averageSp, 864);
    assert.equal(profile.cohort.top10Cutoff, 1700);
    assert.equal(profile.cohort.top50Cutoff, 1200);
    assert.equal(profile.cohort.pointsToTop50, 0, 'already above the top-50 cutoff');
    assert.equal(profile.cohort.pointsToNextRank, 15, 'next student has 1500; 1500 - 1486 + 1');
    assert.equal(profile.leaderboard.length, 3);
    assert.equal(profile.leaderboard[2].isCurrentStudent, true);
    assert.match(profile.leaderboard[0].maskedEmail, /\*\*\*/, 'emails are masked');
  });

  test('never reads the whole student collection: every Student.find is bounded to 50 rows or fewer', async () => {
    await me();
    const all = calls.studentFind;   // everything recorded since the first request loaded the cohort figures
    assert.ok(all.length >= 3, 'the cohort queries were actually recorded');
    assert.ok(all.every(ops => ops.limit !== undefined && ops.limit <= 50), JSON.stringify(all));
  });

  test('cohort figures are computed once and shared, not per request', async () => {
    const before = { aggregate: calls.aggregate, finds: calls.studentFind.length };
    await Promise.all(Array.from({ length: 25 }, me));
    assert.equal(calls.aggregate - before.aggregate, 0, 'no recompute inside the cache window');
    assert.equal(calls.studentFind.length - before.finds, 0);
  });

  test('the whole cohort load was a handful of queries in total', () => {
    assert.equal(calls.aggregate, 1);
    assert.ok(calls.studentFind.length <= 4, `expected at most 4 cohort finds, saw ${calls.studentFind.length}`);
  });

  test('each request adds only indexed per-student queries (two counts at most were needed once)', () => {
    // one rank count per request, plus the single cohort-size count — nothing that grows with the cohort
    const rankCounts = calls.count.filter(f => f.$or);
    const sizeCounts = calls.count.filter(f => !f.$or);
    assert.equal(sizeCounts.length, 1, 'cohort size is counted once, then cached');
    assert.ok(rankCounts.length >= 1);
  });

  test('all those requests cost one Samagama call between them', () => {
    assert.equal(samagamaCalls, 1);
  });

  test('a client-supplied email cannot pick another student when search is off', async () => {
    const res = await fetch(base + '/api/journey/state?email=victim@example.com');
    assert.equal(res.status, 404, 'no cookie -> no identity, the query-string email is ignored');
  });
});
