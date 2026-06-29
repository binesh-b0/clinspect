import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveFilters,
  cycleValue,
  extractPortFromHost,
  filterLogs,
  formatFilterLabel,
  formatRecordingLabel,
  getDetailLines,
  getMaxScrollOffset,
  getMouseWheelTarget,
  getRenderHeight,
  getSelectedIndex,
  getSearchValues,
  moveSelectedLogId,
  resolveSelectedLogId,
  toggleFilterValue
} from '../src/ui/App.js';

const logs = [
  { id: 'one' },
  { id: 'two' },
  { id: 'three' }
];

test('resolveSelectedLogId follows latest only when follow mode is enabled', () => {
  assert.equal(resolveSelectedLogId(logs, 'one', { followLatest: true }), 'three');
  assert.equal(resolveSelectedLogId([...logs, { id: 'four' }], 'two', { followLatest: false }), 'two');
});

test('resolveSelectedLogId holds stable selection across appended traffic', () => {
  const updatedLogs = [...logs, { id: 'four' }, { id: 'five' }];

  assert.equal(resolveSelectedLogId(updatedLogs, 'two'), 'two');
});

test('resolveSelectedLogId falls back to first surviving item when selected item was trimmed', () => {
  const trimmedLogs = [
    { id: 'three' },
    { id: 'four' },
    { id: 'five' }
  ];

  assert.equal(resolveSelectedLogId(trimmedLogs, 'two'), 'three');
});

test('moveSelectedLogId moves relative to stable selected id', () => {
  assert.equal(moveSelectedLogId(logs, 'two', -1), 'one');
  assert.equal(moveSelectedLogId(logs, 'two', 1), 'three');
  assert.equal(moveSelectedLogId(logs, 'three', 1), 'three');
  assert.equal(moveSelectedLogId(logs, 'one', -1), 'one');
});

test('getSelectedIndex resolves missing selections to the first row', () => {
  assert.equal(getSelectedIndex(logs, 'two'), 1);
  assert.equal(getSelectedIndex(logs, 'missing'), 0);
  assert.equal(getSelectedIndex([], 'missing'), -1);
});

test('mouse wheel routing maps the fixed traffic pane by terminal column', () => {
  assert.equal(getMouseWheelTarget(1), 'traffic');
  assert.equal(getMouseWheelTarget(51), 'traffic');
  assert.equal(getMouseWheelTarget(52), 'details');
  assert.equal(getMouseWheelTarget(120), 'details');
});

test('getRenderHeight keeps one terminal row free for Ink updates', () => {
  assert.equal(getRenderHeight(40), 39);
  assert.equal(getRenderHeight(2), 1);
  assert.equal(getRenderHeight(undefined), 23);
});

test('filterLogs narrows by method, status family, and search text', () => {
  const timestamp = 1700000000000;
  const traffic = [
    {
      id: 'one',
      method: 'GET',
      path: '/users',
      statusCode: 200,
      timestamp,
      request: { headers: { accept: 'application/json', host: 'localhost:8080' }, body: '' },
      response: { headers: { 'x-result': 'ok' }, body: 'Ada' }
    },
    {
      id: 'two',
      method: 'POST',
      path: '/sessions',
      statusCode: 500,
      timestamp,
      request: { headers: { host: 'localhost:9090', 'x-token': 'demo' }, body: 'email=demo@example.com' },
      response: { headers: { 'content-type': 'text/plain' }, body: 'Bad Gateway' }
    }
  ];
  const timeValue = getSearchValues(traffic[0], 'time')[0];

  assert.deepEqual(filterLogs(traffic, { methodFilter: 'POST' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { statusFilter: '5xx' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'ada' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'x-token' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'path', searchQuery: 'sessions' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'status', searchQuery: '500' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'port', searchQuery: '8080' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'time', searchQuery: timeValue }).map((log) => log.id), ['one', 'two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'body', searchQuery: 'gateway' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { methodFilters: ['GET', 'POST'] }).map((log) => log.id), ['one', 'two']);
  assert.deepEqual(filterLogs(traffic, { methodFilters: ['GET'], statusFilters: ['2xx'] }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { statusFilters: ['2xx', '5xx'] }).map((log) => log.id), ['one', 'two']);
});

test('filter value helpers support multi-select and clearing', () => {
  const methods = ['GET', 'POST', 'PATCH'];

  assert.deepEqual(toggleFilterValue([], 'GET', methods), ['GET']);
  assert.deepEqual(toggleFilterValue(['GET'], 'POST', methods), ['GET', 'POST']);
  assert.deepEqual(toggleFilterValue(['GET', 'POST'], 'GET', methods), ['POST']);
  assert.deepEqual(toggleFilterValue(['GET', 'POST'], 'all', methods), []);
  assert.equal(countActiveFilters({
    methodFilters: ['GET', 'POST'],
    statusFilters: ['5xx'],
    searchQuery: 'error'
  }), 4);
  assert.equal(countActiveFilters({
    methodFilters: [],
    statusFilters: [],
    searchQuery: ''
  }), 0);
  assert.equal(formatFilterLabel([], [], 'all', 'id'), 'search "id" in all fields');
  assert.equal(formatFilterLabel(['GET', 'POST'], ['2xx'], 'path', 'users'), 'method GET,POST | status 2xx | search "users" in path');
  assert.equal(formatFilterLabel([], [], 'all', ''), 'none');
});

test('formatRecordingLabel exposes recording and pause states', () => {
  assert.equal(formatRecordingLabel(), 'rec off');
  assert.equal(formatRecordingLabel({
    mode: 'full',
    path: './capture.ndjson',
    state: 'recording',
    error: null
  }), 'rec full -> ./capture.ndjson');
  assert.equal(formatRecordingLabel({
    mode: 'partial',
    path: './capture.ndjson',
    state: 'paused',
    error: null
  }), 'rec paused partial -> ./capture.ndjson');
  assert.equal(formatRecordingLabel({
    mode: 'full',
    path: './capture.ndjson',
    state: 'error',
    error: 'disk full'
  }), 'rec error -> ./capture.ndjson');
});

test('search helpers expose scoped values', () => {
  const log = {
    method: 'GET',
    path: '/reports',
    statusCode: 204,
    timestamp: 1700000000000,
    request: {
      headers: { host: '[::1]:8080', accept: 'application/json' },
      body: 'request'
    },
    response: {
      headers: { 'x-result': 'empty' },
      body: 'response'
    }
  };

  assert.equal(extractPortFromHost('localhost:3000'), '3000');
  assert.equal(extractPortFromHost('[::1]:8080'), '8080');
  assert.equal(extractPortFromHost('example.com'), '');
  assert.deepEqual(getSearchValues(log, 'path'), ['/reports']);
  assert.deepEqual(getSearchValues(log, 'status'), ['204']);
  assert.deepEqual(getSearchValues(log, 'port'), ['8080']);
  assert.equal(getSearchValues(log, 'headers').some((value) => value.includes('x-result: empty')), true);
});

test('cookie headers are masked in details and search by default', () => {
  const log = {
    method: 'GET',
    path: '/cookie',
    statusCode: 200,
    timestamp: 1700000000000,
    request: {
      headers: {
        cookie: 'sid=secret; theme=dark',
        host: 'localhost:8080'
      },
      body: ''
    },
    response: {
      headers: {
        'set-cookie': ['sid=secret; Path=/; HttpOnly', 'theme=dark; Path=/']
      },
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request').slice(0, 3), [
    'Request headers',
    'cookie: sid=<redacted>; theme=<redacted>',
    'host: localhost:8080'
  ]);
  assert.deepEqual(getDetailLines(log, 'response').slice(0, 3), [
    'Response headers',
    'set-cookie: sid=<redacted>; Path=/; HttpOnly',
    'set-cookie: theme=<redacted>; Path=/'
  ]);
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'sid'
  }), [log]);
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'secret'
  }), []);
});

test('cookie headers can be shown and searched raw when enabled', () => {
  const log = {
    method: 'GET',
    path: '/cookie',
    statusCode: 200,
    timestamp: 1700000000000,
    request: {
      headers: {
        cookie: 'sid=secret'
      },
      body: ''
    },
    response: {
      headers: {
        'set-cookie': ['sid=secret; Path=/']
      },
      body: ''
    }
  };

  assert.equal(
    getDetailLines(log, 'request', { showCookieValues: true })[1],
    'cookie: sid=secret'
  );
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'secret',
    showCookieValues: true
  }), [log]);
});

test('public target request details display target host and referer', () => {
  const log = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'http://localhost:8080/some/path?x=1#section'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: https://example.com/some/path?x=1#section'
  ]);
  assert.equal(log.request.headers.host, 'localhost:8080');
  assert.equal(log.request.headers.referer, 'http://localhost:8080/some/path?x=1#section');
});

test('local target request details display original proxy headers', () => {
  const log = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'http://localhost:8080/local'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request', {
    publicTargetUrl: 'http://localhost:3000/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: localhost:8080',
    'referer: http://localhost:8080/local'
  ]);
});

test('public target request details preserve third-party and malformed referers', () => {
  const thirdPartyLog = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'https://other.example/path'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };
  const malformedLog = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'not a url'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(thirdPartyLog, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: https://other.example/path'
  ]);
  assert.deepEqual(getDetailLines(malformedLog, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: not a url'
  ]);
});

test('detail helpers build scrollable request and response lines', () => {
  const log = {
    request: {
      headers: { accept: 'application/json' },
      body: 'request line 1\nrequest line 2',
      truncated: false
    },
    response: {
      headers: {},
      body: 'response body',
      truncated: true
    }
  };

  assert.deepEqual(cycleValue(['request', 'response'], 'request'), 'response');
  assert.deepEqual(cycleValue(['request', 'response'], 'response'), 'request');
  assert.deepEqual(cycleValue(['request', 'response'], 'request', -1), 'response');
  assert.deepEqual(getDetailLines(log, 'request'), [
    'Request headers',
    'accept: application/json',
    '',
    'Request body',
    'request line 1',
    'request line 2'
  ]);
  assert.deepEqual(getDetailLines(log, 'response'), [
    'Response headers',
    '(none)',
    '',
    'Response body',
    'response body',
    '[body truncated]'
  ]);
  assert.equal(getMaxScrollOffset(getDetailLines(log, 'request'), 4), 2);
});
