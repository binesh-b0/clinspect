import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mkdtemp, rm } from 'fs/promises';
import test from 'node:test';
import { StateStore, truncateTextBody } from '../src/store/state.js';

function createLog(id, options = {}) {
  return {
    id,
    method: options.method ?? 'GET',
    path: options.path ?? `/${id}`,
    statusCode: options.statusCode ?? 200,
    responseTimeMs: options.responseTimeMs ?? 10,
    request: {
      headers: {
        host: 'localhost:3000',
        'x-trace': id,
        ...(options.requestHeaders ?? {})
      },
      body: options.requestBody ?? `request-${id}`
    },
    response: {
      headers: {
        'content-type': 'application/json',
        ...(options.responseHeaders ?? {})
      },
      body: options.responseBody ?? `response-${id}`
    }
  };
}

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

test('StateStore history cache keeps all summaries and hydrates cold entries', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-history-'));

  try {
    const store = new StateStore({
      bodyLimit: 1000,
      historyCache: true,
      historyHotEntries: 2,
      historyRoot: directory
    });

    store.addLog(createLog('one'));
    store.addLog(createLog('two'));
    store.addLog(createLog('three'));
    store.addLog(createLog('four'));

    const logs = store.getLogs();

    assert.deepEqual(logs.map((log) => log.id), ['one', 'two', 'three', 'four']);
    assert.equal(logs[0].history.cold, true);
    assert.equal(logs[0].request.body, '');
    assert.equal(logs[3].history.cold, false);
    assert.equal(logs[3].response.body, 'response-four');

    const hydrated = store.getLogById('one');

    assert.equal(hydrated.request.headers['x-trace'], 'one');
    assert.equal(hydrated.response.body, 'response-one');
    assert.equal(hydrated.history.cold, false);
    assert.equal(store.getHistoryStatus().totalEntries, 4);
    assert.equal(store.getHistoryStatus().coldEntries, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('StateStore history cache touches hydrated entries through the LRU hot window', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-history-lru-'));

  try {
    const store = new StateStore({
      bodyLimit: 1000,
      historyCache: true,
      historyHotEntries: 2,
      historyRoot: directory
    });

    ['one', 'two', 'three'].forEach((id) => store.addLog(createLog(id)));
    assert.deepEqual(store.getLogs().map((log) => [log.id, log.history.cold]), [
      ['one', true],
      ['two', false],
      ['three', false]
    ]);

    store.getLogById('one');
    store.addLog(createLog('four'));

    assert.deepEqual(store.getLogs().map((log) => [log.id, log.history.cold]), [
      ['one', false],
      ['two', true],
      ['three', true],
      ['four', false]
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('StateStore clear removes current temp session and starts a fresh empty one', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-history-clear-'));

  try {
    const store = new StateStore({
      bodyLimit: 1000,
      historyCache: true,
      historyHotEntries: 2,
      historyRoot: directory
    });
    store.addLog(createLog('one'));
    const oldSessionPath = store.getHistoryStatus().sessionPath;

    assert.equal(fs.existsSync(oldSessionPath), true);
    store.clear();

    const status = store.getHistoryStatus();

    assert.deepEqual(store.getLogs(), []);
    assert.equal(fs.existsSync(oldSessionPath), false);
    assert.equal(fs.existsSync(status.sessionPath), true);

    store.addLog(createLog('two'));
    assert.deepEqual(store.getLogs().map((log) => log.id), ['two']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('StateStore restores temp history summaries and hydrates lazily', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-history-restore-'));

  try {
    const store = new StateStore({
      bodyLimit: 1000,
      historyCache: true,
      historyHotEntries: 1,
      historyRoot: directory,
      sourceMode: 'live',
      targetUrl: 'http://localhost:3000/'
    });
    store.addLog(createLog('one'));
    store.addLog(createLog('two'));
    const sessionPath = store.getHistoryStatus().sessionPath;
    store.close();

    const restored = StateStore.restoreTempSession(sessionPath, {
      bodyLimit: 1000,
      historyHotEntries: 1
    });
    const summaries = restored.getLogs();

    assert.deepEqual(summaries.map((log) => log.id), ['one', 'two']);
    assert.equal(summaries.every((log) => log.history.cold), true);
    assert.equal(restored.getHistoryStatus().restored, true);
    assert.equal(restored.getHistoryStatus().metadata.sourceMode, 'live');

    const hydrated = restored.getLogById('two');

    assert.equal(hydrated.response.body, 'response-two');
    assert.equal(restored.getLogs()[1].history.cold, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
