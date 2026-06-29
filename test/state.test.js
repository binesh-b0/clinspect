import assert from 'node:assert/strict';
import test from 'node:test';
import { StateStore, truncateTextBody } from '../src/store/state.js';

test('truncateTextBody caps long text and marks truncation', () => {
  assert.deepEqual(truncateTextBody('abcdef', 4), {
    body: 'abcd',
    truncated: true
  });

  assert.deepEqual(truncateTextBody('abc', 4), {
    body: 'abc',
    truncated: false
  });
});

test('StateStore emits immutable snapshots and normalizes bodies', () => {
  const store = new StateStore({ maxEntries: 5, bodyLimit: 5 });
  const added = [];
  const updates = [];

  store.on('add', (log) => added.push(log));
  store.on('update', (logs) => updates.push(logs));

  const returned = store.addLog({
    id: 'one',
    timestamp: 100,
    method: 'post',
    path: '/submit',
    statusCode: 201,
    responseTimeMs: 12,
    resend: {
      action: 'resend',
      sourceLogId: 'source-1',
      sourceMethod: 'get',
      sourcePath: '/original'
    },
    request: {
      headers: { 'content-type': 'application/json' },
      body: 'abcdef'
    },
    response: {
      headers: { 'set-cookie': ['sid=abc; Path=/', 'theme=dark; Path=/'], 'x-result': 'ok' },
      body: 'created'
    }
  });

  assert.equal(returned.method, 'POST');
  assert.deepEqual(returned.resend, {
    action: 'resend',
    sourceLogId: 'source-1',
    sourceMethod: 'GET',
    sourcePath: '/original'
  });
  assert.equal(returned.request.body, 'abcde');
  assert.equal(returned.request.truncated, true);
  assert.equal(returned.response.body, 'creat');
  assert.equal(returned.response.truncated, true);
  assert.deepEqual(returned.response.headers['set-cookie'], ['sid=abc; Path=/', 'theme=dark; Path=/']);

  updates[0][0].path = '/mutated';
  added[0].path = '/mutated-add';
  added[0].resend.sourcePath = '/mutated-source';
  added[0].response.headers['set-cookie'].push('mutated=true');
  assert.equal(store.getLogs()[0].path, '/submit');
  assert.equal(store.getLogs()[0].resend.sourcePath, '/original');
  assert.equal(added[0].request.body, 'abcde');
  assert.deepEqual(store.getLogs()[0].response.headers['set-cookie'], ['sid=abc; Path=/', 'theme=dark; Path=/']);
});

test('StateStore enforces a ring-buffer limit', () => {
  const store = new StateStore({ maxEntries: 2, bodyLimit: 50 });

  store.addLog({ id: 'one', path: '/one' });
  store.addLog({ id: 'two', path: '/two' });
  store.addLog({ id: 'three', path: '/three' });

  assert.deepEqual(store.getLogs().map((log) => log.id), ['two', 'three']);
});
