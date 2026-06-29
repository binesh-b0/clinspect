import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTrafficRecorder } from '../src/recording/recorder.js';
import { StateStore } from '../src/store/state.js';

function fixedNow() {
  return new Date('2026-06-29T16:30:00.000Z');
}

function createLog(id, pathValue = `/${id}`) {
  const store = new StateStore({ bodyLimit: 100 });

  return store.addLog({
    id,
    timestamp: 123,
    method: 'get',
    path: pathValue,
    statusCode: 200,
    responseTimeMs: 10,
    request: {
      headers: { accept: 'application/json' },
      body: 'request'
    },
    response: {
      headers: { 'content-type': 'application/json' },
      body: 'response'
    }
  });
}

function createCookieLog(id = 'cookie') {
  const store = new StateStore({ bodyLimit: 100 });

  return store.addLog({
    id,
    timestamp: 123,
    method: 'get',
    path: '/cookie',
    statusCode: 200,
    responseTimeMs: 10,
    request: {
      headers: {
        authorization: 'Bearer raw',
        cookie: 'sid=abc; theme=dark'
      },
      body: ''
    },
    response: {
      headers: {
        'set-cookie': ['sid=abc; Path=/; HttpOnly', 'theme=dark; Path=/']
      },
      body: ''
    }
  });
}

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-recorder-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function readRecords(filePath) {
  const text = await readFile(filePath, 'utf8');

  return text.trim().split('\n').map((line) => JSON.parse(line));
}

test('createTrafficRecorder creates parent directories and writes valid NDJSON', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'nested', 'session.ndjson');
    const recorder = createTrafficRecorder({
      bodyLimit: 100,
      clinspectVersion: '1.2.3',
      mode: 'full',
      now: fixedNow,
      path: filePath,
      port: 8080,
      proxyOrigin: 'http://localhost:8080',
      sessionId: 'session-one',
      sourceMode: 'live',
      targetKind: 'local',
      targetUrl: 'http://localhost:3000/'
    });

    assert.equal(recorder.recordCapture(createLog('one')), true);
    await recorder.stop();

    const [session, record, sessionEnd] = await readRecords(filePath);

    assert.deepEqual(recorder.getStatus(), {
      mode: 'full',
      path: filePath,
      state: 'recording',
      error: null
    });
    assert.equal(session.type, 'session');
    assert.equal(session.schemaVersion, 2);
    assert.equal(session.sessionId, 'session-one');
    assert.equal(session.createdAt, '2026-06-29T16:30:00.000Z');
    assert.equal(session.clinspectVersion, '1.2.3');
    assert.equal(session.sourceMode, 'live');
    assert.equal(session.recordingMode, 'full');
    assert.equal(session.targetUrl, 'http://localhost:3000/');
    assert.equal(session.targetKind, 'local');
    assert.equal(session.proxyOrigin, 'http://localhost:8080');
    assert.equal(session.port, 8080);
    assert.equal(session.bodyLimit, 100);
    assert.equal(session.cookieValuePolicy, 'raw');
    assert.equal(record.type, 'traffic');
    assert.equal(record.schemaVersion, 2);
    assert.equal(record.sessionId, 'session-one');
    assert.equal(record.sequence, 1);
    assert.equal(record.recordedAt, '2026-06-29T16:30:00.000Z');
    assert.equal(record.recordingMode, 'full');
    assert.equal(record.interaction, 'capture');
    assert.equal(record.entry.id, 'one');
    assert.equal(record.entry.request.body, 'request');
    assert.equal(sessionEnd.type, 'session-end');
    assert.equal(sessionEnd.sessionId, 'session-one');
    assert.equal(sessionEnd.endedAt, '2026-06-29T16:30:00.000Z');
  });
});

test('recording writes raw cookie values by default', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'raw-default-cookies.ndjson');
    const recorder = createTrafficRecorder({
      mode: 'full',
      now: fixedNow,
      path: filePath,
      sessionId: 'raw-default-session'
    });

    assert.equal(recorder.recordCapture(createCookieLog()), true);
    await recorder.stop();

    const [session, record] = await readRecords(filePath);

    assert.equal(session.cookieValuePolicy, 'raw');
    assert.equal(record.entry.request.headers.cookie, 'sid=abc; theme=dark');
    assert.equal(record.entry.request.headers.authorization, 'Bearer raw');
    assert.deepEqual(record.entry.response.headers['set-cookie'], [
      'sid=abc; Path=/; HttpOnly',
      'theme=dark; Path=/'
    ]);
  });
});

test('recording can explicitly mask cookie values', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'masked-cookies.ndjson');
    const recorder = createTrafficRecorder({
      cookieValuePolicy: 'masked',
      mode: 'full',
      now: fixedNow,
      path: filePath,
      sessionId: 'masked-session'
    });

    assert.equal(recorder.recordCapture(createCookieLog()), true);
    await recorder.stop();

    const [session, record] = await readRecords(filePath);

    assert.equal(session.cookieValuePolicy, 'masked');
    assert.equal(record.entry.request.headers.cookie, 'sid=<redacted>; theme=<redacted>');
    assert.deepEqual(record.entry.response.headers['set-cookie'], [
      'sid=<redacted>; Path=/; HttpOnly',
      'theme=<redacted>; Path=/'
    ]);
  });
});

test('full recording writes every StateStore add event', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'full.ndjson');
    const store = new StateStore({ bodyLimit: 100 });
    const recorder = createTrafficRecorder({
      mode: 'full',
      now: fixedNow,
      path: filePath
    });

    store.on('add', (log) => recorder.recordCapture(log));
    store.addLog({ id: 'one', path: '/one' });
    store.addLog({ id: 'two', path: '/two' });
    await recorder.stop();

    const records = await readRecords(filePath);

    const trafficRecords = records.filter((record) => record.type === 'traffic');

    assert.deepEqual(trafficRecords.map((record) => record.interaction), ['capture', 'capture']);
    assert.deepEqual(trafficRecords.map((record) => record.sequence), [1, 2]);
    assert.deepEqual(trafficRecords.map((record) => record.entry.id), ['one', 'two']);
  });
});

test('full recording can pause disk writes without stopping capture state', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'paused-full.ndjson');
    const recorder = createTrafficRecorder({
      mode: 'full',
      now: fixedNow,
      path: filePath
    });

    assert.equal(recorder.recordCapture(createLog('one')), true);
    assert.equal(recorder.setPaused(true), true);
    assert.equal(recorder.getStatus().state, 'paused');
    assert.equal(recorder.recordCapture(createLog('two')), false);
    assert.equal(recorder.togglePaused(), false);
    assert.equal(recorder.getStatus().state, 'recording');
    assert.equal(recorder.recordCapture(createLog('three')), true);
    await recorder.stop();

    const records = await readRecords(filePath);

    assert.deepEqual(
      records.filter((record) => record.type === 'traffic').map((record) => record.entry.id),
      ['one', 'three']
    );
  });
});

test('partial recording writes inspected entries once', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'partial.ndjson');
    const recorder = createTrafficRecorder({
      mode: 'partial',
      now: fixedNow,
      path: filePath
    });
    const one = createLog('one');
    const two = createLog('two');

    assert.equal(recorder.recordCapture(one), false);
    assert.equal(recorder.recordInteraction(one, 'hover'), false);
    assert.equal(recorder.setPaused(true), true);
    assert.equal(recorder.recordInteraction(one, 'inspect'), false);
    assert.equal(recorder.setPaused(false), false);
    assert.equal(recorder.recordInteraction(one, 'inspect'), true);
    assert.equal(recorder.recordInteraction(one, 'inspect'), false);
    assert.equal(recorder.recordInteraction(two, 'inspect'), true);
    await recorder.stop();

    const records = await readRecords(filePath);

    const trafficRecords = records.filter((record) => record.type === 'traffic');

    assert.deepEqual(trafficRecords.map((record) => record.recordingMode), ['partial', 'partial']);
    assert.deepEqual(trafficRecords.map((record) => record.interaction), ['inspect', 'inspect']);
    assert.deepEqual(trafficRecords.map((record) => record.entry.id), ['one', 'two']);
  });
});
