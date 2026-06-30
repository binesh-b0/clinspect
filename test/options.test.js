import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRecordingPath,
  DEFAULT_PORT,
  formatRecordingTimestamp,
  getCliHelpText,
  isHelpRequested,
  parseBodyLimit,
  parseCliOptions,
  parsePort,
  parseRecordMode,
  parseTargetUrl
} from '../src/cli/options.js';
import { DEFAULT_BODY_LIMIT } from '../src/store/state.js';

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

test('parseBodyLimit accepts bounded byte counts', () => {
  assert.equal(parseBodyLimit('0'), 0);
  assert.equal(parseBodyLimit('65536'), 65536);
  assert.throws(() => parseBodyLimit('-1'), /body-limit must be an integer/);
  assert.throws(() => parseBodyLimit('bad'), /body-limit must be an integer/);
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
    bodyLimit: DEFAULT_BODY_LIMIT,
    hideFrameworkAssets: true,
    mode: 'demo',
    openBrowser: false,
    port: DEFAULT_PORT,
    recording: {
      cookieValuePolicy: 'masked',
      mode: 'off',
      path: null
    },
    recordCookieValues: false,
    responseEncodingPolicy: 'readable',
    showCookieValues: false,
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
    bodyLimit: DEFAULT_BODY_LIMIT,
    hideFrameworkAssets: true,
    mode: 'live',
    openBrowser: false,
    port: 9090,
    recording: {
      cookieValuePolicy: 'masked',
      mode: 'off',
      path: null
    },
    recordCookieValues: false,
    responseEncodingPolicy: 'readable',
    showCookieValues: false,
    targetUrl: 'http://localhost:5173/'
  });
});

test('parseCliOptions supports body capture limit overrides', () => {
  assert.equal(parseCliOptions([
    'node',
    'clinspect',
    '--body-limit',
    '131072'
  ]).bodyLimit, 131072);
});

test('parseCliOptions supports preserving upstream response encoding', () => {
  assert.equal(parseCliOptions([
    'node',
    'clinspect',
    '--target',
    'https://example.com',
    '--preserve-encoding'
  ]).responseEncodingPolicy, 'preserve');
});

test('parseCliOptions enables browser open flag', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--target',
    'https://example.com',
    '--open'
  ]), {
    bodyLimit: DEFAULT_BODY_LIMIT,
    hideFrameworkAssets: true,
    mode: 'live',
    openBrowser: true,
    port: DEFAULT_PORT,
    recording: {
      cookieValuePolicy: 'masked',
      mode: 'off',
      path: null
    },
    recordCookieValues: false,
    responseEncodingPolicy: 'readable',
    showCookieValues: false,
    targetUrl: 'https://example.com/'
  });
});

test('parseCliOptions hides framework assets by default and can show them', () => {
  assert.equal(parseCliOptions(['node', 'clinspect']).hideFrameworkAssets, true);
  assert.equal(parseCliOptions(['node', 'clinspect', '--show-framework-assets']).hideFrameworkAssets, false);
});

test('parseCliOptions supports full and partial recording', () => {
  const fullOptions = parseCliOptions(['node', 'clinspect', '--record', 'full']);

  assert.equal(fullOptions.recording.mode, 'full');
  assert.equal(fullOptions.recording.cookieValuePolicy, 'raw');
  assert.equal(fullOptions.recordCookieValues, true);
  assert.match(fullOptions.recording.path, /^\.\/\.clinspect\/recordings\/clinspect-\d{8}-\d{6}\.ndjson$/);

  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--record',
    'partial',
    '--record-path',
    './captures/session.ndjson'
  ]).recording, {
    cookieValuePolicy: 'raw',
    mode: 'partial',
    path: './captures/session.ndjson'
  });

  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--record-path', './captures/session.ndjson']),
    /record-path requires --record/
  );
});

test('parseCliOptions supports cookie privacy flags', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--show-cookie-values'
  ]), {
    bodyLimit: DEFAULT_BODY_LIMIT,
    hideFrameworkAssets: true,
    mode: 'demo',
    openBrowser: false,
    port: DEFAULT_PORT,
    recording: {
      cookieValuePolicy: 'masked',
      mode: 'off',
      path: null
    },
    recordCookieValues: false,
    responseEncodingPolicy: 'readable',
    showCookieValues: true,
    targetUrl: null
  });

  const explicitRawRecording = parseCliOptions([
    'node',
    'clinspect',
    '--record',
    'full',
    '--record-cookie-values'
  ]);

  assert.equal(explicitRawRecording.recording.mode, 'full');
  assert.equal(explicitRawRecording.recording.cookieValuePolicy, 'raw');
  assert.equal(explicitRawRecording.recordCookieValues, true);

  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--record-cookie-values']),
    /record-cookie-values requires --record/
  );
});

test('parseCliOptions supports replay mode and rejects live or recording flags', () => {
  assert.deepEqual(parseCliOptions([
    'node',
    'clinspect',
    '--load',
    './captures/session.ndjson'
  ]), {
    bodyLimit: DEFAULT_BODY_LIMIT,
    hideFrameworkAssets: true,
    mode: 'replay',
    loadedSession: null,
    openBrowser: false,
    port: DEFAULT_PORT,
    recording: {
      cookieValuePolicy: 'masked',
      mode: 'off',
      path: null
    },
    recordCookieValues: false,
    responseEncodingPolicy: 'readable',
    sessionPath: './captures/session.ndjson',
    showCookieValues: false,
    targetUrl: null
  });

  assert.equal(parseCliOptions([
    'node',
    'clinspect',
    '--load',
    './captures/session.ndjson',
    '--show-cookie-values'
  ]).showCookieValues, true);

  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--target', 'http://localhost:3000']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--port', '9090']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--record', 'full']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--open']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--preserve-encoding']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--record-path', './out.ndjson']),
    /load cannot be combined/
  );
  assert.throws(
    () => parseCliOptions(['node', 'clinspect', '--load', './capture.ndjson', '--record-cookie-values']),
    /load cannot be combined/
  );
});

test('help helpers detect help requests and expose command help', () => {
  assert.equal(isHelpRequested(['node', 'clinspect', '--help']), true);
  assert.equal(isHelpRequested(['node', 'clinspect', '-h']), true);
  assert.equal(isHelpRequested(['node', 'clinspect']), false);

  const helpText = getCliHelpText();

  assert.match(helpText, /Usage: clinspect/);
  assert.match(helpText, /--body-limit <bytes>/);
  assert.match(helpText, /--load <path>/);
  assert.match(helpText, /--target <url>/);
  assert.match(helpText, /--port <number>/);
  assert.match(helpText, /--open/);
  assert.match(helpText, /--preserve-encoding/);
  assert.match(helpText, /--record <mode>/);
  assert.match(helpText, /--record-path <path>/);
  assert.match(helpText, /--show-framework-assets/);
  assert.match(helpText, /--show-cookie-values/);
  assert.match(helpText, /--record-cookie-values/);
});
