import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSessionStats,
  formatDuration,
  formatExitSummary
} from '../src/exit-summary.js';

const plainTheme = {
  bold: (value) => value,
  cyan: (value) => value
};

test('formatDuration produces compact elapsed time labels', () => {
  assert.equal(formatDuration(0, 42), '42ms');
  assert.equal(formatDuration(0, 1500), '2s');
  assert.equal(formatDuration(0, 65_000), '1m 5s');
  assert.equal(formatDuration(0, 3_660_000), '1h 1m');
  assert.equal(formatDuration(1000, 0), '0ms');
});

test('session stats aggregate status families and average response time', () => {
  const stats = createSessionStats();

  stats.record({ statusCode: 204, responseTimeMs: 10 });
  stats.record({ statusCode: 302, responseTimeMs: 20 });
  stats.record({ statusCode: 404, responseTimeMs: 30 });
  stats.record({ statusCode: 503, responseTimeMs: 40 });
  stats.record({ statusCode: 102, responseTimeMs: -1 });
  stats.record({ statusCode: null, responseTimeMs: 'bad' });

  assert.deepEqual(stats.snapshot(), {
    total: 6,
    statusCounts: {
      '2xx': 1,
      '3xx': 1,
      '4xx': 1,
      '5xx': 1,
      other: 2
    },
    averageResponseTimeMs: 25
  });
});

test('session stats report n/a average when no response times are recorded', () => {
  const stats = createSessionStats();

  assert.deepEqual(stats.snapshot(), {
    total: 0,
    statusCounts: {
      '2xx': 0,
      '3xx': 0,
      '4xx': 0,
      '5xx': 0,
      other: 0
    },
    averageResponseTimeMs: null
  });
});

test('formatExitSummary builds the goodbye message', () => {
  const stats = createSessionStats();

  stats.record({ statusCode: 200, responseTimeMs: 12 });
  stats.record({ statusCode: 500, responseTimeMs: 18 });

  assert.equal(formatExitSummary({
    startedAt: 0,
    endedAt: 2000,
    stats: stats.snapshot()
  }, { theme: plainTheme }), [
    'Good bye.',
    '',
    'Session summary',
    '  Runtime       2s',
    '  Requests      2',
    '  Status        2xx 1  3xx 0  4xx 0  5xx 1  other 0',
    '  Avg response  15ms'
  ].join('\n'));
});
