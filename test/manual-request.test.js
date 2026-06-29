import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import {
  buildManualFetchRequest,
  createManualRequestDraft,
  createManualRequestDraftFromLog,
  normalizeManualResendMetadata,
  normalizeManualRequestPath,
  parseManualRequestHeaders,
  resolveManualRequestUrl,
  sendManualRequest,
  serializeManualRequestHeaders,
  validateManualRequest
} from '../src/engine/manual-request.js';

async function startServer(handler) {
  const server = http.createServer(handler);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  return {
    server,
    url: `http://127.0.0.1:${address.port}`
  };
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

test('manual request helpers normalize paths and reject unsupported inputs', () => {
  assert.equal(normalizeManualRequestPath(''), '/');
  assert.equal(normalizeManualRequestPath('api/users'), '/api/users');
  assert.equal(normalizeManualRequestPath('/api/users?x=1'), '/api/users?x=1');
  assert.equal(resolveManualRequestUrl('http://example.test/base/', 'api/users'), 'http://example.test/api/users');
  assert.throws(() => normalizeManualRequestPath('https://example.com/api'), /absolute URLs/);
  assert.throws(() => normalizeManualRequestPath('//example.com/api'), /absolute URLs/);
  assert.throws(() => normalizeManualRequestPath('\\example.com\\api'), /absolute URLs/);
  assert.throws(() => normalizeManualRequestPath('/\\example.com/api'), /absolute URLs/);
  assert.throws(
    () => validateManualRequest({ method: 'GET', path: '/search', body: 'not allowed' }),
    /GET requests cannot include a body/
  );
  assert.deepEqual(parseManualRequestHeaders('X-Trace: 1 | Accept: application/json'), {
    'X-Trace': '1',
    Accept: 'application/json'
  });
  assert.equal(
    serializeManualRequestHeaders({ 'X-Trace': '1', Accept: 'application/json' }),
    'X-Trace: 1 | Accept: application/json'
  );
  assert.throws(() => parseManualRequestHeaders('not a header'), /invalid header/);
  assert.throws(() => parseManualRequestHeaders('Host: example.test'), /managed by the client/);
  assert.throws(() => parseManualRequestHeaders('Accept-Encoding: gzip'), /managed by the client/);
});

test('captured request to draft preserves resend-safe request fields', () => {
  const plan = createManualRequestDraftFromLog({
    id: 'source-1',
    method: 'POST',
    path: '/api/sessions?existing=1',
    request: {
      headers: {
        accept: 'application/json',
        'accept-encoding': 'gzip, br',
        authorization: 'Bearer token',
        'content-length': '15',
        'content-type': 'application/json',
        cookie: 'session=secret; theme=dark',
        host: 'example.test',
        'x-trace': 'abc'
      },
      body: '{"email":"demo"}'
    }
  }, {
    action: 'resend',
    environment: [{ key: 'baseUrl', value: 'http://example.test' }]
  });

  assert.equal(plan.draft.method, 'POST');
  assert.equal(plan.draft.url, '/api/sessions?existing=1');
  assert.equal(plan.draft.body.mode, 'json');
  assert.equal(plan.draft.body.json, '{"email":"demo"}');
  assert.deepEqual(plan.draft.headers.map((row) => [row.key, row.value, row.secret]), [
    ['accept', 'application/json', false],
    ['authorization', 'Bearer token', true],
    ['content-type', 'application/json', false],
    ['x-trace', 'abc', false]
  ]);
  assert.deepEqual(plan.draft.cookies.map((row) => [row.enabled, row.key, row.value, row.secret]), [
    [true, 'session', 'secret', true],
    [true, 'theme', 'dark', true]
  ]);
  assert.deepEqual(plan.draft.environment.map((row) => [row.key, row.value]), [
    ['baseUrl', 'http://example.test']
  ]);
  assert.equal(plan.resend.action, 'resend');
  assert.equal(plan.resend.sourceLogId, 'source-1');
  assert.equal(plan.resend.sourceMethod, 'POST');
  assert.equal(plan.resend.sourcePath, '/api/sessions?existing=1');
  assert.equal(plan.requiresConfirmation, true);
  assert.deepEqual(plan.blockers, []);
  assert.ok(plan.warnings.some((warning) => warning.includes('cookies included')));
  assert.ok(plan.warnings.some((warning) => warning.includes('auth-like header')));
});

test('captured request to draft infers form and sniffed JSON bodies', () => {
  const formPlan = createManualRequestDraftFromLog({
    method: 'POST',
    path: '/login',
    request: {
      headers: {
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'email=demo%40example.com&remember=true'
    }
  });

  assert.equal(formPlan.draft.body.mode, 'form-urlencoded');
  assert.deepEqual(formPlan.draft.formFields.map((row) => [row.key, row.value]), [
    ['email', 'demo@example.com'],
    ['remember', 'true']
  ]);

  const sniffedJsonPlan = createManualRequestDraftFromLog({
    method: 'PATCH',
    path: '/profile',
    request: {
      headers: {
        'content-type': 'text/plain'
      },
      body: '{"name":"Ada"}'
    }
  });

  assert.equal(sniffedJsonPlan.draft.body.mode, 'json');
  assert.equal(sniffedJsonPlan.draft.body.json, '{"name":"Ada"}');
});

test('captured safe GET resend does not require confirmation', () => {
  const plan = createManualRequestDraftFromLog({
    id: 'source-get',
    method: 'GET',
    path: '/food',
    request: {
      headers: {
        'accept-encoding': 'gzip, br',
        host: 'example.test'
      },
      body: ''
    }
  }, { action: 'resend' });

  assert.equal(plan.draft.method, 'GET');
  assert.equal(plan.draft.headers.length, 0);
  assert.equal(plan.requiresConfirmation, false);
  assert.deepEqual(plan.blockers, []);
  assert.deepEqual(plan.warnings, []);
});

test('captured request to draft blocks unsafe exact resend cases', () => {
  const redacted = createManualRequestDraftFromLog({
    id: 'source-2',
    method: 'GET',
    path: '/account',
    request: {
      headers: {
        cookie: 'session=<redacted>'
      },
      body: ''
    }
  }, { action: 'resend' });

  assert.equal(redacted.draft.cookies[0].enabled, false);
  assert.ok(redacted.blockers.some((warning) => warning.includes('redacted')));
  assert.equal(redacted.requiresConfirmation, true);

  const truncated = createManualRequestDraftFromLog({
    id: 'source-3',
    method: 'POST',
    path: '/upload',
    request: {
      headers: {},
      body: 'partial',
      truncated: true
    }
  }, { action: 'resend' });

  assert.ok(truncated.blockers.some((warning) => warning.includes('truncated')));

  const getWithBody = createManualRequestDraftFromLog({
    id: 'source-4',
    method: 'GET',
    path: '/search',
    request: {
      headers: {},
      body: 'q=demo'
    }
  }, { action: 'resend' });

  assert.ok(getWithBody.blockers.some((warning) => warning.includes('GET request has a captured body')));
});

test('manual resend metadata is sanitized', () => {
  assert.deepEqual(normalizeManualResendMetadata({
    action: 'edit-resend',
    sourceLogId: 123,
    sourceMethod: 'post',
    sourcePath: '/api'
  }), {
    action: 'edit-resend',
    sourceLogId: '123',
    sourceMethod: 'POST',
    sourcePath: '/api'
  });
  assert.equal(normalizeManualResendMetadata({ action: 'clone' }), null);
});

test('buildManualFetchRequest supports absolute URLs, params, cookies, auth, and variables', async () => {
  const request = await buildManualFetchRequest(createManualRequestDraft({
    auth: {
      mode: 'bearer',
      bearerToken: '{{token}}'
    },
    cookies: [
      { key: 'session', value: '{{session}}' }
    ],
    headers: [
      { key: 'X-Trace', value: '{{trace}}' }
    ],
    method: 'POST',
    params: [
      { key: 'q', value: 'one' },
      { enabled: false, key: 'skip', value: 'yes' }
    ],
    url: 'https://api.example.test/search?existing=1',
    environment: [
      { key: 'token', value: 'secret' },
      { key: 'session', value: 'cookie-secret' },
      { key: 'trace', value: 'abc' }
    ],
    body: {
      mode: 'raw',
      raw: 'hello {{trace}}'
    }
  }), {});

  assert.equal(request.url, 'https://api.example.test/search?existing=1&q=one');
  assert.equal(request.logPath, 'https://api.example.test/search?existing=1&q=one');
  assert.equal(request.headers.Authorization, 'Bearer secret');
  assert.equal(request.headers.Cookie, 'session=cookie-secret');
  assert.equal(request.headers['X-Trace'], 'abc');
  assert.equal(request.headers['content-type'], 'text/plain; charset=utf-8');
  assert.equal(request.logHeaders.host, 'api.example.test');
  assert.equal(request.logBody, 'hello abc');
});

test('buildManualFetchRequest validates conflicts and body modes', async () => {
  await assert.rejects(
    () => buildManualFetchRequest({
      headers: [{ key: 'Cookie', value: 'a=b' }],
      cookies: [{ key: 'other', value: 'value' }],
      url: '/test'
    }, { targetUrl: 'http://example.test' }),
    /Cookie header conflicts/
  );
  await assert.rejects(
    () => buildManualFetchRequest({
      auth: { mode: 'apiKey', apiKey: { key: 'api_key', value: 'secret', placement: 'query' } },
      params: [{ key: 'api_key', value: 'existing' }],
      url: '/test'
    }, { targetUrl: 'http://example.test' }),
    /query param api_key conflicts/
  );
  await assert.rejects(
    () => buildManualFetchRequest({
      body: { mode: 'json', json: '{bad' },
      method: 'POST',
      url: '/test'
    }, { targetUrl: 'http://example.test' }),
    /JSON/
  );

  const formRequest = await buildManualFetchRequest({
    body: { mode: 'form-urlencoded' },
    formFields: [
      { key: 'email', value: 'demo@example.com' },
      { key: 'remember', value: 'true' }
    ],
    method: 'POST',
    url: '/login'
  }, { targetUrl: 'http://example.test/base' });

  assert.equal(formRequest.url, 'http://example.test/login');
  assert.equal(formRequest.body, 'email=demo%40example.com&remember=true');
  assert.equal(formRequest.headers['content-type'], 'application/x-www-form-urlencoded; charset=utf-8');
});

test('buildManualFetchRequest supports multipart text and file fields with log summaries', async () => {
  const request = await buildManualFetchRequest({
    body: { mode: 'multipart' },
    method: 'POST',
    multipartFields: [
      { key: 'title', value: 'Report' },
      { key: 'upload', type: 'file', filePath: '/tmp/report.txt' }
    ],
    url: '/upload'
  }, {
    fileReader: async () => Buffer.from('file-body'),
    targetUrl: 'http://example.test'
  });

  assert.equal(request.url, 'http://example.test/upload');
  assert.equal(request.body.constructor.name, 'FormData');
  assert.match(request.logBody, /field title=Report/);
  assert.match(request.logBody, /file upload=@\/tmp\/report.txt \(9 bytes\)/);
});

test('sendManualRequest sends a request and returns a traffic log entry', async () => {
  const upstream = await startServer((req, res) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      res.statusCode = 202;
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-manual', 'yes');
      res.end(JSON.stringify({
        body,
        contentType: req.headers['content-type'],
        header: req.headers['x-manual-request'],
        method: req.method,
        path: req.url
      }));
    });
  });
  const clockValues = [1000, 1042];
  const now = () => clockValues.shift() ?? 1042;

  try {
    const log = await sendManualRequest({
      body: 'hello',
      bodyLimit: 1000,
      headers: 'X-Manual-Request: yes | Content-Type: application/json | Accept: application/json',
      method: 'POST',
      now,
      path: 'api/send?x=1',
      resend: {
        action: 'edit-resend',
        sourceLogId: 'source-1',
        sourceMethod: 'post',
        sourcePath: '/api/original'
      },
      targetUrl: upstream.url
    });

    assert.match(log.id, /^manual-/);
    assert.equal(log.timestamp, 1000);
    assert.equal(log.method, 'POST');
    assert.equal(log.path, '/api/send?x=1');
    assert.equal(log.statusCode, 202);
    assert.equal(log.responseTimeMs, 42);
    assert.equal(log.request.headers.Accept, 'application/json');
    assert.equal(log.request.headers['Content-Type'], 'application/json');
    assert.equal(log.request.headers['X-Manual-Request'], 'yes');
    assert.equal(log.request.body, 'hello');
    assert.deepEqual(log.resend, {
      action: 'edit-resend',
      sourceLogId: 'source-1',
      sourceMethod: 'POST',
      sourcePath: '/api/original'
    });
    assert.equal(log.response.headers['x-manual'], 'yes');
    assert.match(log.response.body, /"contentType":"application\/json"/);
    assert.match(log.response.body, /"header":"yes"/);
    assert.match(log.response.body, /"path":"\/api\/send\?x=1"/);
  } finally {
    await closeServer(upstream.server);
  }
});

test('sendManualRequest returns a visible 502-style log for network failures', async () => {
  const log = await sendManualRequest({
    fetchImpl: () => Promise.reject(new Error('connection refused')),
    method: 'POST',
    path: '/fail',
    body: 'body',
    targetUrl: 'http://127.0.0.1:1'
  });

  assert.equal(log.method, 'POST');
  assert.equal(log.path, '/fail');
  assert.equal(log.statusCode, 502);
  assert.equal(log.request.body, 'body');
  assert.match(log.response.body, /manual request failed/);
  assert.match(log.response.body, /connection refused/);
});
