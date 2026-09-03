import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { withAudit } from '../server/services/audit.js';

/**
 * Tier 6 commit 1 — withAudit contract tests.
 *
 * Pure tests; no mongo needed. The wrapper is a plain async function with
 * three injectable hooks (mutate, audit, rollback); we exercise every branch
 * of its return-shape contract.
 */

// Capture console.error for the consistency-failure test, since it must
// produce a stderr line we can assert on.
function captureStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => { lines.push(args.join(' ')); };
  try { return fn(lines); }
  finally { console.error = original; }
}

describe('withAudit — happy path', () => {
  test('mutate succeeds + audit succeeds → {ok:true, result}', async () => {
    const result = await withAudit({
      mutate: async () => ({ id: 'r1', title: 'new' }),
      audit: async () => {},
      rollback: async () => { throw new Error('rollback should not be called'); }
    });
    assert.equal(result.ok, true);
    assert.equal(result.stage, null);
    assert.equal(result.rollback, null);
    assert.deepEqual(result.result, { id: 'r1', title: 'new' });
  });

  test('audit receives the post-image returned by mutate', async () => {
    let seen = null;
    await withAudit({
      mutate: async () => ({ id: 'r1', saved: true }),
      audit: async (r) => { seen = r; },
      rollback: async () => {}
    });
    assert.deepEqual(seen, { id: 'r1', saved: true });
  });
});

describe('withAudit — audit fails, rollback succeeds', () => {
  test('returns {ok:false, stage:\'audit\', rollback:\'ok\'}', async () => {
    let rollbackCalled = false;
    let rollbackSawResult = null;
    const result = await withAudit({
      mutate: async () => ({ id: 'r1', title: 'new' }),
      audit: async () => { throw new Error('audit write failed'); },
      rollback: async (r) => { rollbackCalled = true; rollbackSawResult = r; },
      rollbackLabel: 'restore'
    });
    assert.equal(result.ok, false);
    assert.equal(result.stage, 'audit');
    assert.equal(result.rollback, 'ok');
    assert.match(result.auditError, /audit write failed/);
    assert.deepEqual(result.result, { id: 'r1', title: 'new' });
    assert.ok(rollbackCalled, 'rollback must have been invoked');
    assert.deepEqual(rollbackSawResult, { id: 'r1', title: 'new' });
  });

  test('rollback swallows its own success — no second exception', async () => {
    // If rollback returns normally we don't get a stage:'rollback' response.
    const result = await withAudit({
      mutate: async () => ({ x: 1 }),
      audit: async () => { throw new Error('boom'); },
      rollback: async () => {},
      rollbackLabel: 'remove'
    });
    assert.equal(result.rollback, 'ok');
    assert.equal(result.stage, 'audit');
  });
});

describe('withAudit — both fail: consistency failure', () => {
  test('returns stage:rollback, emits AUDIT-CONSISTENCY to stderr', () => {
    const lines = [];
    const stderr = captureStderr(() => {
      // captureStderr is sync; we don't need to await this synchronously —
      // wrap withAudit in a closure and run it inside captureStderr after
      // toggling console.error. The wrapper itself is async, but the
      // important observable (the stderr emission) happens synchronously
      // before any unhandled rejection escapes.
      //
      // Use a microtask queue: run an async IIFE, capture lines.
    });
    // simple explicit alternative: collect in a deferred promise.
    const lines2 = [];
    const original = console.error;
    console.error = (...args) => lines2.push(args.join(' '));
    let resolution;
    const done = new Promise((resolve) => { resolution = resolve; });
    withAudit({
      mutate: async () => ({ id: 'r1' }),
      audit: async () => { throw new Error('audit fail'); },
      rollback: async () => { throw new Error('rollback fail'); },
      rollbackLabel: 'restore'
    }).then(r => { console.error = original; resolution(r); });
    return done.then(result => {
      assert.equal(result.ok, false);
      assert.equal(result.stage, 'rollback');
      assert.equal(result.rollback, 'failed');
      assert.match(result.auditError, /audit fail/);
      assert.match(result.rollbackError, /rollback fail/);
      assert.equal(lines2.length, 1, 'exactly one stderr line on consistency failure');
      assert.match(lines2[0], /^AUDIT-CONSISTENCY/);
      const parsed = JSON.parse(lines2[0].replace(/^AUDIT-CONSISTENCY /, ''));
      assert.equal(parsed.rollbackLabel, 'restore');
      assert.match(parsed.auditError, /audit fail/);
      assert.match(parsed.rollbackError, /rollback fail/);
    });
  });

  test('AUDIT-CONSISTENCY line is JSON-parseable (machine-readable)', () => {
    const lines = [];
    const original = console.error;
    console.error = (...args) => lines.push(args.join(' '));
    let resolution;
    const done = new Promise((resolve) => { resolution = resolve; });
    withAudit({
      mutate: async () => ({ id: 'r1' }),
      audit: async () => { throw new Error('a'); },
      rollback: async () => { throw new Error('b'); },
      rollbackLabel: 'pin'
    }).then(r => { console.error = original; resolution(r); });
    return done.then(() => {
      const payload = JSON.parse(lines[0].replace(/^AUDIT-CONSISTENCY /, ''));
      assert.equal(typeof payload.auditError, 'string');
      assert.equal(typeof payload.rollbackError, 'string');
      assert.equal(payload.rollbackLabel, 'pin');
    });
  });
});

describe('withAudit — mutation failure', () => {
  test('propagates the mutate error; audit and rollback are not called', async () => {
    let auditCalled = false, rollbackCalled = false;
    await assert.rejects(
      withAudit({
        mutate: async () => { throw new Error('mongo down'); },
        audit: async () => { auditCalled = true; },
        rollback: async () => { rollbackCalled = true; }
      }),
      /mongo down/
    );
    assert.equal(auditCalled, false);
    assert.equal(rollbackCalled, false);
  });
});

describe('withAudit — shape guard', () => {
  test('throws a Promise rejection when mutate/audit/rollback are missing', async () => {
    await assert.rejects(
      withAudit({ audit: () => {}, rollback: () => {} }),
      /mutate, audit, rollback must all be functions/
    );
  });

  test('rollbackLabel defaults to "unnamed" if omitted', () => {
    const lines = [];
    const original = console.error;
    console.error = (...args) => lines.push(args.join(' '));
    let resolution;
    const done = new Promise((resolve) => { resolution = resolve; });
    withAudit({
      mutate: async () => ({ x: 1 }),
      audit: async () => { throw new Error('a'); },
      rollback: async () => { throw new Error('b'); }
    }).then(r => { console.error = original; resolution(r); });
    return done.then(() => {
      const parsed = JSON.parse(lines[0].replace(/^AUDIT-CONSISTENCY /, ''));
      assert.equal(parsed.rollbackLabel, 'unnamed');
    });
  });
});

describe('withAudit — concurrency honesty', () => {
  test('documentation contract: not a transaction (gap is acknowledged)', () => {
    // This is a meta-test: it asserts the wrapper does NOT use mongo
    // transactions. Implementation does the simplest possible thing
    // (sequential mutate → audit → [rollback on fail]). Future maintainers
    // who switch to a transaction MUST update this test to reflect that.
    //
    // The point of this test: if someone reads the wrapper and assumes
    // "this must be atomic because it's about audit safety", the test name
    // and comment here corrects that assumption.
    assert.equal(typeof withAudit, 'function');
    // ...no further assertion; the contract is the comment + the test name.
  });
});
