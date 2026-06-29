import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createManualRequestStore,
  loadManualRequestLibrary,
  saveManualRequestLibrary
} from '../src/engine/manual-request-store.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'clinspect-requests-'));

  try {
    await fn(dir);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

test('manual request library starts empty when missing', async () => {
  await withTempDir(async (dir) => {
    const library = loadManualRequestLibrary(path.join(dir, 'missing.json'));

    assert.deepEqual(library.requests, []);
    assert.deepEqual(library.environment, []);
    assert.equal(library.warning, null);
  });
});

test('manual request library round-trips requests, environment, and secret flags', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, '.clinspect', 'requests.json');
    const saved = saveManualRequestLibrary(filePath, {
      requests: [
        {
          id: 'req-1',
          name: 'Login',
          collection: 'Auth',
          method: 'POST',
          url: '/login',
          body: { mode: 'json', json: '{"email":"demo@example.com"}' }
        }
      ],
      environment: [
        { key: 'token', value: 'secret', secret: true }
      ]
    });
    const loaded = loadManualRequestLibrary(filePath);
    const text = await readFile(filePath, 'utf8');

    assert.equal(saved.requests[0].name, 'Login');
    assert.equal(loaded.requests[0].collection, 'Auth');
    assert.equal(loaded.environment[0].secret, true);
    assert.match(text, /"schemaVersion": 1/);
  });
});

test('manual request store saves drafts and recovers from corrupt files', async () => {
  await withTempDir(async (dir) => {
    const filePath = path.join(dir, 'requests.json');

    await writeFile(filePath, '{not-json', 'utf8');

    const corrupt = loadManualRequestLibrary(filePath);

    assert.match(corrupt.warning, /Could not load/);

    const store = createManualRequestStore({ path: filePath });
    const nextLibrary = store.saveDraft({
      id: 'req-2',
      name: 'Ping',
      method: 'GET',
      url: '/ping'
    }, {
      environment: [{ key: 'baseUrl', value: 'http://example.test' }]
    });

    assert.equal(nextLibrary.warning, null);
    assert.equal(nextLibrary.requests[0].name, 'Ping');
    assert.equal(nextLibrary.environment[0].key, 'baseUrl');
  });
});
