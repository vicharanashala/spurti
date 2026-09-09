import test from 'node:test';
import assert from 'node:assert/strict';

import { localDevAuthEmail } from '../server/services/localDevAuth.js';

test('enables the local fixture identity only in development', () => {
  assert.equal(localDevAuthEmail({
    NODE_ENV: 'development',
    LOCAL_DEV_AUTH_EMAIL: ' Dev.Student@Spurti.Local '
  }), 'dev.student@spurti.local');
});

test('does not enable local fixture authentication without a valid email', () => {
  assert.equal(localDevAuthEmail({ NODE_ENV: 'development' }), null);
  assert.equal(localDevAuthEmail({ NODE_ENV: 'development', LOCAL_DEV_AUTH_EMAIL: 'not-an-email' }), null);
});

test('never enables local fixture authentication outside development', () => {
  assert.equal(localDevAuthEmail({
    NODE_ENV: 'production', LOCAL_DEV_AUTH_EMAIL: 'dev.student@spurti.local'
  }), null);
  assert.equal(localDevAuthEmail({
    NODE_ENV: 'staging', LOCAL_DEV_AUTH_EMAIL: 'dev.student@spurti.local'
  }), null);
});
