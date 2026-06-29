import chalk from 'chalk';

const STATUS_FAMILIES = ['2xx', '3xx', '4xx', '5xx'];

function toTimeMs(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'number') {
    return value;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatSeconds(totalSeconds) {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

export function formatDuration(startedAt, endedAt) {
  const elapsedMs = Math.max(0, Math.round(toTimeMs(endedAt) - toTimeMs(startedAt)));

  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  return formatSeconds(Math.round(elapsedMs / 1000));
}

function createEmptyCounts() {
  return {
    '2xx': 0,
    '3xx': 0,
    '4xx': 0,
    '5xx': 0,
    other: 0
  };
}

function getStatusFamily(statusCode) {
  const status = Number(statusCode);

  if (!Number.isInteger(status)) {
    return 'other';
  }

  const family = `${Math.floor(status / 100)}xx`;

  return STATUS_FAMILIES.includes(family) ? family : 'other';
}

export function createSessionStats() {
  const statusCounts = createEmptyCounts();
  let total = 0;
  let responseTimeTotal = 0;
  let responseTimeCount = 0;

  return {
    record(log = {}) {
      total += 1;
      statusCounts[getStatusFamily(log.statusCode)] += 1;

      const responseTimeMs = Number(log.responseTimeMs);

      if (Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
        responseTimeTotal += responseTimeMs;
        responseTimeCount += 1;
      }
    },
    snapshot() {
      return {
        total,
        statusCounts: { ...statusCounts },
        averageResponseTimeMs: responseTimeCount === 0
          ? null
          : Math.round(responseTimeTotal / responseTimeCount)
      };
    }
  };
}

function getTheme(theme) {
  return {
    bold: theme?.bold ?? ((value) => value),
    cyan: theme?.cyan ?? ((value) => value)
  };
}

function formatSummaryRow(label, value, theme) {
  return `  ${theme.bold(label.padEnd(13))} ${value}`;
}

export function formatExitSummary({ startedAt, endedAt, stats }, options = {}) {
  const theme = getTheme(options.theme ?? chalk);
  const statusCounts = {
    ...createEmptyCounts(),
    ...(stats?.statusCounts ?? {})
  };
  const averageResponse = stats?.averageResponseTimeMs === null || stats?.averageResponseTimeMs === undefined
    ? 'n/a'
    : `${stats.averageResponseTimeMs}ms`;

  return [
    theme.cyan('Good bye.'),
    '',
    theme.bold('Session summary'),
    formatSummaryRow('Runtime', formatDuration(startedAt, endedAt), theme),
    formatSummaryRow('Requests', String(stats?.total ?? 0), theme),
    formatSummaryRow(
      'Status',
      `2xx ${statusCounts['2xx']}  3xx ${statusCounts['3xx']}  4xx ${statusCounts['4xx']}  5xx ${statusCounts['5xx']}  other ${statusCounts.other}`,
      theme
    ),
    formatSummaryRow('Avg response', averageResponse, theme)
  ].join('\n');
}
