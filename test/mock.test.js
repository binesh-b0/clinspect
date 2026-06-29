import assert from 'node:assert/strict';
import test from 'node:test';
import { createMockLogEntry, seedMockTraffic, startMockTrafficFeed } from '../src/engine/proxy.js';
import { StateStore } from '../src/store/state.js';

test('createMockLogEntry returns the inspector log shape', () => {
  const log = createMockLogEntry(4, {
    bodyLimit: 40,
    timestamp: 12345
  });

  assert.equal(log.id, 'mock-0005');
  assert.equal(log.timestamp, 12345);
  assert.equal(typeof log.method, 'string');
  assert.equal(typeof log.path, 'string');
  assert.equal(typeof log.responseTimeMs, 'number');
  assert.equal(log.request.body.length <= 40, true);
  assert.equal(log.response.body.length <= 40, true);
  assert.equal(typeof log.request.truncated, 'boolean');
  assert.equal(typeof log.response.truncated, 'boolean');
});

test('seedMockTraffic adds deterministic seed entries', () => {
  const store = new StateStore({ maxEntries: 10, bodyLimit: 80 });
  const logs = seedMockTraffic(store, {
    count: 3,
    now: 10000,
    bodyLimit: 80
  });

  assert.equal(logs.length, 3);
  assert.deepEqual(logs.map((log) => log.id), ['mock-0001', 'mock-0002', 'mock-0003']);
  assert.deepEqual(logs.map((log) => log.timestamp), [5500, 7000, 8500]);
});

test('startMockTrafficFeed seeds immediately and can stop', () => {
  const store = new StateStore({ maxEntries: 10, bodyLimit: 80 });
  const feed = startMockTrafficFeed(store, {
    seedCount: 2,
    intervalMs: 10000,
    bodyLimit: 80
  });

  assert.equal(store.getLogs().length, 2);
  feed.stop();
});
