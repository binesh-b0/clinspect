import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cycleValue,
  filterLogs,
  getDetailLines,
  getMaxScrollOffset,
  getSelectedIndex,
  moveSelectedLogId,
  resolveSelectedLogId
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

test('filterLogs narrows by method, status family, and search text', () => {
  const traffic = [
    {
      id: 'one',
      method: 'GET',
      path: '/users',
      statusCode: 200,
      request: { headers: { accept: 'application/json' }, body: '' },
      response: { headers: { 'x-result': 'ok' }, body: 'Ada' }
    },
    {
      id: 'two',
      method: 'POST',
      path: '/sessions',
      statusCode: 500,
      request: { headers: { 'x-token': 'demo' }, body: 'email=demo@example.com' },
      response: { headers: { 'content-type': 'text/plain' }, body: 'Bad Gateway' }
    }
  ];

  assert.deepEqual(filterLogs(traffic, { methodFilter: 'POST' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { statusFilter: '5xx' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'ada' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'x-token' }).map((log) => log.id), ['two']);
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
