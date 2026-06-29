import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PORT, parseCliOptions, parsePort, parseTargetUrl } from '../src/cli/options.js';

test('parsePort accepts valid TCP ports', () => {
  assert.equal(parsePort('1'), 1);
  assert.equal(parsePort('8080'), 8080);
  assert.equal(parsePort('65535'), 65535);
});

test('parsePort rejects invalid ports', () => {
  assert.throws(() => parsePort('0'), /port must be an integer/);
  assert.throws(() => parsePort('65536'), /port must be an integer/);
  assert.throws(() => parsePort('abc'), /port must be an integer/);
});

test('parseTargetUrl accepts http and https URLs', () => {
  assert.equal(parseTargetUrl('http://localhost:3000'), 'http://localhost:3000/');
  assert.equal(parseTargetUrl('https://example.com/api'), 'https://example.com/api');
});

test('parseTargetUrl rejects missing or unsupported URLs', () => {
  assert.throws(() => parseTargetUrl('not-a-url'), /target must be a valid/);
  assert.throws(() => parseTargetUrl('ftp://example.com'), /target must be a valid/);
});

test('parseCliOptions defaults to demo mode without a target', () => {
  assert.deepEqual(parseCliOptions(['node', 'clinspect']), {
    mode: 'demo',
    port: DEFAULT_PORT,
    targetUrl: null
  });
});

test('parseCliOptions validates optional future live-mode context', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--target',
    'http://localhost:5173',
    '--port',
    '9090'
  ]), {
    mode: 'demo',
    port: 9090,
    targetUrl: 'http://localhost:5173/'
  });
});
