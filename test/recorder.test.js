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
      mode: 'full',
      now: fixedNow,
      path: filePath
    });

    assert.equal(recorder.recordCapture(createLog('one')), true);
    await recorder.stop();

    const [record] = await readRecords(filePath);

    assert.deepEqual(recorder.getStatus(), {
      mode: 'full',
      path: filePath,
      state: 'recording',
      error: null
    });
    assert.equal(record.type, 'traffic');
    assert.equal(record.recordedAt, '2026-06-29T16:30:00.000Z');
    assert.equal(record.recordingMode, 'full');
    assert.equal(record.interaction, 'capture');
    assert.equal(record.entry.id, 'one');
    assert.equal(record.entry.request.body, 'request');
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

    assert.deepEqual(records.map((record) => record.interaction), ['capture', 'capture']);
    assert.deepEqual(records.map((record) => record.entry.id), ['one', 'two']);
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

    assert.deepEqual(records.map((record) => record.entry.id), ['one', 'three']);
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

    assert.deepEqual(records.map((record) => record.recordingMode), ['partial', 'partial']);
    assert.deepEqual(records.map((record) => record.interaction), ['inspect', 'inspect']);
    assert.deepEqual(records.map((record) => record.entry.id), ['one', 'two']);
  });
});
