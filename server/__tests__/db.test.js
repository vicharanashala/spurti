import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSeedStudentDocs, shouldUseMemoryFallback } from '../db.js';

test('uses the in-memory MongoDB fallback when the default localhost URI is in use', () => {
  assert.equal(shouldUseMemoryFallback('mongodb://127.0.0.1:27017/analysis_summership', {}), true);
});

test('does not use the in-memory fallback when an explicit MongoDB URI is provided', () => {
  assert.equal(shouldUseMemoryFallback('mongodb://example.com:27017/app', { MONGO_URI: 'mongodb://example.com:27017/app' }), false);
});

test('builds normalized student seed documents from raw rows', () => {
  const docs = buildSeedStudentDocs([{ name: 'Ava', email: 'AVA@example.com', alternateEmail: 'ava.alt@example.com' }]);
  assert.equal(docs[0].email, 'ava@example.com');
  assert.equal(docs[0].alternateEmail, 'ava.alt@example.com');
  assert.equal(docs[0].status, 'active');
});
