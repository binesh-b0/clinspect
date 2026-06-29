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
    request: {
      headers: { 'content-type': 'application/json' },
      body: 'abcdef'
    },
    response: {
      headers: { 'x-result': 'ok' },
      body: 'created'
    }
  });

  assert.equal(returned.method, 'POST');
  assert.equal(returned.request.body, 'abcde');
  assert.equal(returned.request.truncated, true);
  assert.equal(returned.response.body, 'creat');
  assert.equal(returned.response.truncated, true);

  updates[0][0].path = '/mutated';
  added[0].path = '/mutated-add';
  assert.equal(store.getLogs()[0].path, '/submit');
  assert.equal(added[0].request.body, 'abcde');
});

test('StateStore enforces a ring-buffer limit', () => {
  const store = new StateStore({ maxEntries: 2, bodyLimit: 50 });

  store.addLog({ id: 'one', path: '/one' });
  store.addLog({ id: 'two', path: '/two' });
  store.addLog({ id: 'three', path: '/three' });

  assert.deepEqual(store.getLogs().map((log) => log.id), ['two', 'three']);
});
