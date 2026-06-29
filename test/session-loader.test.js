import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadRecordedSession } from '../src/recording/session-loader.js';

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-session-loader-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function trafficRecord(id, pathValue = `/${id}`) {
  return {
    type: 'traffic',
    entry: {
      id,
      timestamp: 123,
      method: 'get',
      path: pathValue,
      statusCode: 200,
      responseTimeMs: 12,
      request: {
        headers: { accept: 'application/json' },
        body: 'request'
      },
      response: {
        headers: { 'content-type': 'application/json' },
        body: 'response'
      }
    }
  };
}

test('loadRecordedSession reads session metadata and traffic records', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'session.ndjson');

    await writeFile(filePath, [
      JSON.stringify({
        type: 'session',
        schemaVersion: 1,
        sessionId: 'session-one',
        sourceMode: 'live',
        targetUrl: 'http://localhost:3000/'
      }),
      JSON.stringify(trafficRecord('one')),
      JSON.stringify({
        type: 'session-end',
        endedAt: '2026-06-29T16:45:00.000Z'
      })
    ].join('\n'));

    const loaded = loadRecordedSession(filePath);

    assert.equal(loaded.metadata.sessionId, 'session-one');
    assert.equal(loaded.metadata.sourceFilename, 'session.ndjson');
    assert.equal(loaded.metadata.targetUrl, 'http://localhost:3000/');
    assert.equal(loaded.endedAt, '2026-06-29T16:45:00.000Z');
    assert.equal(loaded.skippedLines, 0);
    assert.equal(loaded.totalEntries, 1);
    assert.equal(loaded.entries[0].id, 'one');
    assert.equal(loaded.entries[0].method, 'GET');
  });
});

test('loadRecordedSession supports old traffic-only records and skips invalid lines', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'legacy.ndjson');

    await writeFile(filePath, [
      JSON.stringify(trafficRecord('same')),
      'not json',
      JSON.stringify({ type: 'unknown' }),
      JSON.stringify({ type: 'traffic', entry: {} }),
      JSON.stringify({ id: 'same', method: 'post', path: '/legacy' })
    ].join('\n'));

    const loaded = loadRecordedSession(filePath);

    assert.equal(loaded.metadata.schemaVersion, null);
    assert.equal(loaded.metadata.sourceFilename, 'legacy.ndjson');
    assert.equal(loaded.skippedLines, 3);
    assert.deepEqual(loaded.entries.map((entry) => entry.id), ['same', 'same-replay-2']);
    assert.deepEqual(loaded.entries.map((entry) => entry.method), ['GET', 'POST']);
  });
});

test('loadRecordedSession loads more than one hundred records', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'large.ndjson');
    const records = Array.from({ length: 105 }, (_, index) => {
      return JSON.stringify(trafficRecord(`entry-${index + 1}`));
    });

    await writeFile(filePath, records.join('\n'));

    const loaded = loadRecordedSession(filePath);

    assert.equal(loaded.totalEntries, 105);
    assert.equal(loaded.entries[0].id, 'entry-1');
    assert.equal(loaded.entries[104].id, 'entry-105');
  });
});

test('loadRecordedSession masks raw cookie headers by default and can opt into raw values', async () => {
  await withTempDir(async (directory) => {
    const filePath = path.join(directory, 'cookies.ndjson');

    await writeFile(filePath, [
      JSON.stringify({
        id: 'cookie',
        timestamp: 123,
        method: 'get',
        path: '/cookie',
        request: {
          headers: {
            cookie: 'sid=secret; theme=dark'
          },
          body: ''
        },
        response: {
          headers: {
            'set-cookie': ['sid=secret; Path=/; HttpOnly']
          },
          body: ''
        }
      })
    ].join('\n'));

    const masked = loadRecordedSession(filePath);
    const raw = loadRecordedSession(filePath, { showCookieValues: true });

    assert.equal(masked.entries[0].request.headers.cookie, 'sid=<redacted>; theme=<redacted>');
    assert.deepEqual(masked.entries[0].response.headers['set-cookie'], [
      'sid=<redacted>; Path=/; HttpOnly'
    ]);
    assert.equal(raw.entries[0].request.headers.cookie, 'sid=secret; theme=dark');
    assert.deepEqual(raw.entries[0].response.headers['set-cookie'], [
      'sid=secret; Path=/; HttpOnly'
    ]);
  });
});
