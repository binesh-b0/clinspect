import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  copyTextToClipboard,
  createBodyExport,
  createExportFilename,
  createTrafficExport,
  resolveTrafficExportTarget,
  writeTrafficExportFile
} from '../src/export/traffic-export.js';
import { getDetailRows } from '../src/ui/App.js';

function createLog(overrides = {}) {
  return {
    id: 'one',
    method: 'GET',
    path: '/users?active=true',
    responseTimeMs: 34,
    statusCode: 200,
    timestamp: Date.UTC(2026, 5, 30, 10, 15, 20),
    request: {
      headers: {
        accept: 'application/json',
        cookie: 'sid=secret; theme=dark',
        host: 'localhost:8080',
        referer: 'http://localhost:8080/users?active=true'
      },
      body: '{"query":"ada"}',
      truncated: false
    },
    response: {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': ['sid=secret; Path=/', 'theme=dark; Path=/']
      },
      body: '{"items":[{"name":"Ada","active":true}],"total":1}',
      truncated: false
    },
    ...overrides
  };
}

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-export-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

test('export target resolution follows list focus, sections, headers, and structured body paths', () => {
  const log = createLog();
  const rows = getDetailRows(log, 'response');
  const headerIndex = rows.findIndex((row) => row.path === 'headers.content-type');
  const bodyTitleIndex = rows.findIndex((row) => row.id === 'response-body-title');
  const jsonPathIndex = rows.findIndex((row) => row.path === 'items[0].name');

  assert.deepEqual(
    resolveTrafficExportTarget({ log, isListFocused: true }),
    {
      detailTab: 'exchange',
      filenamePart: 'exchange',
      kind: 'exchange',
      label: 'exchange'
    }
  );
  assert.equal(resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'response',
    focusedRow: 0,
    isListFocused: false,
    log
  }).kind, 'headers');
  assert.deepEqual(resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'response',
    focusedRow: headerIndex,
    isListFocused: false,
    log
  }), {
    detailTab: 'response',
    filenamePart: 'response-header-content-type',
    headerName: 'content-type',
    kind: 'header',
    label: 'response header content-type'
  });
  assert.equal(resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'response',
    focusedRow: bodyTitleIndex,
    isListFocused: false,
    log
  }).kind, 'body');
  assert.deepEqual(resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'response',
    focusedRow: jsonPathIndex,
    isListFocused: false,
    log
  }), {
    detailTab: 'response',
    filenamePart: 'response-body-items[0].name',
    kind: 'body-field',
    label: 'response body items[0].name',
    path: 'items[0].name',
    rowText: '      name: "Ada"'
  });
});

test('focused query parameter rows export visible row text', () => {
  const log = createLog({
    path: '/users?filter[status]=active&ids[]=1&ids[]=2'
  });
  const rows = getDetailRows(log, 'request');
  const queryRowIndex = rows.findIndex((row) => row.text === 'filters.ids: [1, 2]');

  assert.deepEqual(resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'request',
    focusedRow: queryRowIndex,
    isListFocused: false,
    log
  }), {
    detailTab: 'request',
    filenamePart: 'request-row',
    kind: 'row',
    label: 'request row',
    rowText: 'filters.ids: [1, 2]'
  });
});

test('focused auth rows export only safe badge text', () => {
  const log = createLog({
    request: {
      headers: {
        authorization: 'Bearer opaque-secret-token',
        cookie: 'sid=session-secret'
      }
    },
    response: {
      headers: {
        'set-cookie': 'ts_refresh_token=response-refresh-secret; Path=/'
      },
      body: '',
      truncated: false
    }
  });
  const rows = getDetailRows(log, 'auth', { showCookieValues: true });
  const authRowIndex = rows.findIndex((row) => row.text === '[token cookie] response cookie ts_refresh_token');
  const target = resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'auth',
    focusedRow: authRowIndex,
    isListFocused: false,
    log
  });
  const exported = createTrafficExport({ log, target, secretPolicy: 'raw' });

  assert.deepEqual(target, {
    detailTab: 'auth',
    filenamePart: 'auth-row',
    kind: 'row',
    label: 'auth row',
    rowText: '[token cookie] response cookie ts_refresh_token'
  });
  assert.equal(exported.content, '[token cookie] response cookie ts_refresh_token');
  assert.equal(exported.content.includes('opaque-secret-token'), false);
  assert.equal(exported.content.includes('session-secret'), false);
  assert.equal(exported.content.includes('response-refresh-secret'), false);
});

test('focused cache rows export only safe analysis text', () => {
  const log = createLog({
    path: '/api/me',
    request: {
      headers: {
        authorization: 'Bearer opaque-secret-token'
      }
    },
    response: {
      headers: {
        age: '5',
        'cache-control': 'public, max-age=120',
        'set-cookie': 'sid=response-secret; Path=/'
      },
      body: '',
      truncated: false
    }
  });
  const rows = getDetailRows(log, 'cache', { showCookieValues: true });
  const issueRowIndex = rows.findIndex((row) => row.text === 'possible issue: authenticated or dynamic response allows public caching');
  const target = resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'cache',
    focusedRow: issueRowIndex,
    isListFocused: false,
    log
  });
  const exported = createTrafficExport({ log, target, secretPolicy: 'raw' });

  assert.deepEqual(target, {
    detailTab: 'cache',
    filenamePart: 'cache-row',
    kind: 'row',
    label: 'cache row',
    rowText: 'possible issue: authenticated or dynamic response allows public caching'
  });
  assert.equal(exported.content, 'possible issue: authenticated or dynamic response allows public caching');
  assert.equal(exported.content.includes('opaque-secret-token'), false);
  assert.equal(exported.content.includes('response-secret'), false);
});

test('masked exports match UI masking and public target header display while raw exports keep captured values', () => {
  const log = createLog();
  const rows = getDetailRows(log, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  });
  const target = resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'request',
    focusedRow: 0,
    isListFocused: false,
    log
  });
  const context = {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  };
  const masked = createTrafficExport({
    context,
    log,
    secretPolicy: 'masked',
    target
  });
  const raw = createTrafficExport({
    context,
    log,
    secretPolicy: 'raw',
    target
  });

  assert.equal(masked.content.includes('host: example.com'), true);
  assert.equal(masked.content.includes('referer: https://example.com/users?active=true'), true);
  assert.equal(masked.content.includes('cookie: sid=<redacted>; theme=<redacted>'), true);
  assert.equal(masked.content.includes('secret'), false);
  assert.equal(raw.content.includes('host: localhost:8080'), true);
  assert.equal(raw.content.includes('referer: http://localhost:8080/users?active=true'), true);
  assert.equal(raw.content.includes('cookie: sid=secret; theme=dark'), true);
});

test('exports choose appropriate body formats and full exchanges remain text', () => {
  const json = createTrafficExport({
    log: createLog(),
    target: { detailTab: 'response', kind: 'body' }
  });
  const ndjson = createTrafficExport({
    log: createLog({
      response: {
        headers: { 'content-type': 'application/x-ndjson' },
        body: '{"id":1}\n{"id":2}',
        truncated: false
      }
    }),
    target: { detailTab: 'response', kind: 'body' }
  });
  const html = createTrafficExport({
    log: createLog({
      response: {
        headers: { 'content-type': 'text/html' },
        body: '<!doctype html><html><body>Ada</body></html>',
        truncated: false
      }
    }),
    target: { detailTab: 'response', kind: 'body' }
  });
  const xml = createTrafficExport({
    log: createLog({
      response: {
        headers: { 'content-type': 'application/xml' },
        body: '<root><name>Ada</name></root>',
        truncated: false
      }
    }),
    target: { detailTab: 'response', kind: 'body' }
  });
  const exchange = createTrafficExport({
    log: createLog(),
    target: { kind: 'exchange' }
  });

  assert.equal(json.extension, 'json');
  assert.equal(json.content.includes('"total": 1'), true);
  assert.equal(ndjson.extension, 'jsonl');
  assert.equal(ndjson.content, '{"id":1}\n{"id":2}');
  assert.equal(html.extension, 'html');
  assert.equal(xml.extension, 'xml');
  assert.equal(exchange.extension, 'txt');
  assert.equal(exchange.content.includes('Request headers'), true);
  assert.equal(exchange.content.includes('Response body'), true);
});

test('focused structured body rows export JSON values and plain rows fall back to visible text', () => {
  const log = createLog();
  const rows = getDetailRows(log, 'response');
  const jsonPathIndex = rows.findIndex((row) => row.path === 'items[0].name');
  const target = resolveTrafficExportTarget({
    detailRows: rows,
    detailTab: 'response',
    focusedRow: jsonPathIndex,
    isListFocused: false,
    log
  });
  const field = createTrafficExport({ log, target });
  const textLog = createLog({
    response: {
      headers: { 'content-type': 'text/plain' },
      body: 'first line\nsecond line',
      truncated: false
    }
  });
  const textRows = getDetailRows(textLog, 'response');
  const textRowIndex = textRows.findIndex((row) => row.text === 'first line');
  const textTarget = resolveTrafficExportTarget({
    detailRows: textRows,
    detailTab: 'response',
    focusedRow: textRowIndex,
    isListFocused: false,
    log: textLog
  });
  const textField = createTrafficExport({ log: textLog, target: textTarget });

  assert.equal(field.extension, 'json');
  assert.equal(field.content, '"Ada"');
  assert.equal(textTarget.kind, 'row');
  assert.equal(textField.extension, 'txt');
  assert.equal(textField.content, 'first line');
});

test('body exports omit compressed and binary payloads using terminal-safe messages', () => {
  assert.deepEqual(createBodyExport({
    headers: {
      'content-encoding': 'br',
      'content-type': 'text/html'
    },
    body: '\u0000binary',
    truncated: true
  }), {
    content: '(compressed body not shown: br)\n[body truncated]',
    extension: 'txt',
    mediaType: 'text/plain'
  });
  assert.deepEqual(createBodyExport({
    headers: { 'content-type': 'image/png' },
    body: 'png bytes',
    truncated: false
  }), {
    content: '(binary body omitted: image/png)',
    extension: 'txt',
    mediaType: 'text/plain'
  });
});

test('download export writes atomically under the export directory with deterministic filenames', async () => {
  await withTempDir(async (directory) => {
    const exportData = createTrafficExport({
      log: createLog(),
      target: { detailTab: 'response', kind: 'body' }
    });
    const result = writeTrafficExportFile(exportData, {
      directory,
      now: new Date(2026, 5, 30, 10, 15, 20)
    });
    const text = await readFile(result.path, 'utf8');

    assert.equal(result.filename, 'clinspect-20260630-101520-GET-200-users-response-body.json');
    assert.equal(createExportFilename(exportData, {
      now: new Date(2026, 5, 30, 10, 15, 20)
    }), result.filename);
    assert.equal(text.endsWith('\n'), true);
    assert.equal(text.includes('"items"'), true);
  });
});

test('clipboard copy tries platform commands before OSC52 fallback', () => {
  const calls = [];
  const commandResult = copyTextToClipboard('hello', {
    platform: 'darwin',
    spawnSync(command, args, options) {
      calls.push([command, args, options.input]);

      return { status: 0 };
    },
    stdout: { write() {} }
  });
  const writes = [];
  const oscResult = copyTextToClipboard('hello', {
    platform: 'linux',
    spawnSync(command, args, options) {
      calls.push([command, args, options.input]);

      return { status: 1 };
    },
    stdout: {
      write(value) {
        writes.push(String(value));
      }
    }
  });

  assert.deepEqual(commandResult, { method: 'pbcopy', ok: true });
  assert.deepEqual(calls[0], ['pbcopy', [], 'hello']);
  assert.deepEqual(oscResult, { method: 'osc52', ok: true });
  assert.equal(writes[0], '\u001B]52;c;aGVsbG8=\u0007');
});
