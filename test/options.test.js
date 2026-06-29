import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRecordingPath,
  DEFAULT_PORT,
  formatRecordingTimestamp,
  getCliHelpText,
  isHelpRequested,
  parseCliOptions,
  parsePort,
  parseRecordMode,
  parseTargetUrl
} from '../src/cli/options.js';

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

test('recording option helpers validate modes and format default paths', () => {
  assert.equal(parseRecordMode('full'), 'full');
  assert.equal(parseRecordMode('partial'), 'partial');
  assert.throws(() => parseRecordMode('all'), /record must be one of/);
  assert.equal(formatRecordingTimestamp(new Date(2026, 5, 29, 16, 30, 5)), '20260629-163005');
  assert.equal(
    createDefaultRecordingPath(new Date(2026, 5, 29, 16, 30, 5)),
    './.clinspect/recordings/clinspect-20260629-163005.ndjson'
  );
});

test('parseCliOptions defaults to demo mode without a target', () => {
  assert.deepEqual(parseCliOptions(['node', 'clinspect']), {
    mode: 'demo',
    openBrowser: false,
    port: DEFAULT_PORT,
    recording: {
      mode: 'off',
      path: null
    },
    targetUrl: null
  });
});

test('parseCliOptions uses live mode when a target is provided', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--target',
    'http://localhost:5173',
    '--port',
    '9090'
  ]), {
    mode: 'live',
    openBrowser: false,
    port: 9090,
    recording: {
      mode: 'off',
      path: null
    },
    targetUrl: 'http://localhost:5173/'
  });
});

test('parseCliOptions enables browser open flag', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--target',
    'https://example.com',
    '--open'
  ]), {
    mode: 'live',
    openBrowser: true,
    port: DEFAULT_PORT,
    recording: {
      mode: 'off',
      path: null
    },
    targetUrl: 'https://example.com/'
  });
});

test('parseCliOptions supports full and partial recording', () => {
  const fullOptions = parseCliOptions(['node', 'clinspect', '--record', 'full']);

  assert.equal(fullOptions.recording.mode, 'full');
  assert.match(fullOptions.recording.path, /^\.\/\.clinspect\/recordings\/clinspect-\d{8}-\d{6}\.ndjson$/);

  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--record',
    'partial',
    '--record-path',
    './captures/session.ndjson'
  ]).recording, {
    mode: 'partial',
    path: './captures/session.ndjson'
  });

  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--record-path', './captures/session.ndjson']),
    /record-path requires --record/
  );
});

test('help helpers detect help requests and expose command help', () => {
  assert.equal(isHelpRequested(['node', 'clinspect', '--help']), true);
  assert.equal(isHelpRequested(['node', 'clinspect', '-h']), true);
  assert.equal(isHelpRequested(['node', 'clinspect']), false);

  const helpText = getCliHelpText();

  assert.match(helpText, /Usage: clinspect/);
  assert.match(helpText, /--target <url>/);
  assert.match(helpText, /--port <number>/);
  assert.match(helpText, /--open/);
  assert.match(helpText, /--record <mode>/);
  assert.match(helpText, /--record-path <path>/);
});
