import React from 'react';
import { Box, Text } from 'ink';
import {
  getTerminalRows,
  h,
  pad,
  padLeft,
  truncate
} from './shared.js';

const STATUS_FAMILIES = ['2xx', '3xx', '4xx', '5xx'];
const EMPTY_STATUS_COUNTS = Object.freeze({
  '2xx': 0,
  '3xx': 0,
  '4xx': 0,
  '5xx': 0,
  other: 0
});

function createEmptyStatusCounts() {
  return { ...EMPTY_STATUS_COUNTS };
}

function parseRequestPath(path = '') {
  const rawPath = String(path ?? '');

  try {
    const parsed = new URL(rawPath, 'http://clinspect.local');

    return parsed.pathname || '/';
  } catch {
    return rawPath.split('?', 2)[0] || '/';
  }
}

function isUuidPathSegment(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isIdLikePathSegment(value) {
  const text = String(value ?? '');

  return /^\d+$/.test(text) ||
    isUuidPathSegment(text) ||
    /^[0-9a-f]{12,}$/i.test(text) ||
    (text.length >= 12 && /\d/.test(text) && /^[A-Za-z0-9_-]+$/.test(text));
}

export function getEndpointRoutePattern(path = '') {
  const pathname = parseRequestPath(path)
    .replace(/\/+$/, '') || '/';

  if (pathname === '/') {
    return '/';
  }

  return `/${pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => isIdLikePathSegment(segment) ? ':id' : segment)
    .join('/')}`;
}

function getStatusFamily(statusCode) {
  const status = Number(statusCode);

  if (!Number.isInteger(status)) {
    return 'other';
  }

  const family = `${Math.floor(status / 100)}xx`;

  return STATUS_FAMILIES.includes(family) ? family : 'other';
}

function isErrorStatus(statusCode) {
  const status = Number(statusCode);

  return Number.isFinite(status) && status >= 400;
}

function createEndpointAccumulator(log = {}) {
  const method = String(log.method ?? 'GET').toUpperCase();
  const routePattern = getEndpointRoutePattern(log.path ?? '/');

  return {
    averageResponseTimeMs: null,
    count: 0,
    errorCount: 0,
    errorRate: 0,
    id: `${method} ${routePattern}`,
    method,
    routePattern,
    statusCounts: createEmptyStatusCounts(),
    totalResponseTimeMs: 0,
    responseTimeCount: 0
  };
}

function finalizeEndpointGroup(group) {
  return {
    averageResponseTimeMs: group.responseTimeCount === 0
      ? null
      : Math.round(group.totalResponseTimeMs / group.responseTimeCount),
    count: group.count,
    errorCount: group.errorCount,
    errorRate: group.count === 0 ? 0 : group.errorCount / group.count,
    method: group.method,
    routePattern: group.routePattern,
    statusCounts: { ...group.statusCounts }
  };
}

function compareEndpointGroups(left, right) {
  return right.errorCount - left.errorCount ||
    right.errorRate - left.errorRate ||
    right.count - left.count ||
    (right.averageResponseTimeMs ?? -1) - (left.averageResponseTimeMs ?? -1) ||
    `${left.method} ${left.routePattern}`.localeCompare(`${right.method} ${right.routePattern}`);
}

export function createEndpointGroups(logs = []) {
  const groups = new Map();

  for (const log of logs ?? []) {
    const seed = createEndpointAccumulator(log);
    const group = groups.get(seed.id) ?? seed;
    const statusFamily = getStatusFamily(log?.statusCode);
    const responseTimeMs = Number(log?.responseTimeMs);

    group.count += 1;
    group.statusCounts[statusFamily] += 1;

    if (isErrorStatus(log?.statusCode)) {
      group.errorCount += 1;
    }

    if (Number.isFinite(responseTimeMs) && responseTimeMs >= 0) {
      group.totalResponseTimeMs += responseTimeMs;
      group.responseTimeCount += 1;
    }

    groups.set(group.id, group);
  }

  return [...groups.values()]
    .map(finalizeEndpointGroup)
    .sort(compareEndpointGroups);
}

function formatErrorRate(value = 0) {
  const rate = Math.max(0, Number(value) || 0) * 100;

  if (rate === 0) {
    return '0%';
  }

  if (rate < 1) {
    return '<1%';
  }

  return `${Math.round(rate)}%`;
}

function formatAverageLatency(value) {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'n/a'
    : `${Math.round(Number(value))}ms`;
}

function getEndpointRowWidths(width = 80) {
  const safeWidth = Math.max(36, Math.floor(Number(width) || 80));
  const markerWidth = 2;
  const methodWidth = 6;
  const countWidth = 5;
  const statusWidth = 4;
  const otherStatusWidth = 5;
  const errorWidth = 6;
  const latencyWidth = 7;
  const gapWidth = 10;
  const fixedWidth = markerWidth + methodWidth + countWidth +
    (statusWidth * STATUS_FAMILIES.length) + otherStatusWidth + errorWidth + latencyWidth + gapWidth;
  const routeWidth = Math.max(8, safeWidth - fixedWidth);

  return {
    countWidth,
    errorWidth,
    latencyWidth,
    markerWidth,
    methodWidth,
    otherStatusWidth,
    routeWidth,
    statusWidth
  };
}

export function formatEndpointGroupRow(group = {}, options = {}) {
  const selected = Boolean(options.selected);
  const widths = getEndpointRowWidths(options.width);
  const statusCounts = {
    ...EMPTY_STATUS_COUNTS,
    ...(group.statusCounts ?? {})
  };
  const marker = pad(selected ? '>' : '', widths.markerWidth);
  const method = pad(group.method ?? 'GET', widths.methodWidth);
  const route = pad(truncate(group.routePattern ?? '/', widths.routeWidth), widths.routeWidth);
  const count = padLeft(String(group.count ?? 0), widths.countWidth);
  const errorRate = padLeft(formatErrorRate(group.errorRate), widths.errorWidth);
  const averageLatency = padLeft(formatAverageLatency(group.averageResponseTimeMs), widths.latencyWidth);

  return [
    marker,
    method,
    route,
    count,
    padLeft(statusCounts['2xx'], widths.statusWidth),
    padLeft(statusCounts['3xx'], widths.statusWidth),
    padLeft(statusCounts['4xx'], widths.statusWidth),
    padLeft(statusCounts['5xx'], widths.statusWidth),
    padLeft(statusCounts.other, widths.otherStatusWidth),
    errorRate,
    averageLatency
  ].join(' ');
}

function formatEndpointHeader(width = 80) {
  const widths = getEndpointRowWidths(width);

  return [
    pad('', widths.markerWidth),
    pad('meth', widths.methodWidth),
    pad('endpoint', widths.routeWidth),
    padLeft('req', widths.countWidth),
    padLeft('2xx', widths.statusWidth),
    padLeft('3xx', widths.statusWidth),
    padLeft('4xx', widths.statusWidth),
    padLeft('5xx', widths.statusWidth),
    padLeft('oth', widths.otherStatusWidth),
    padLeft('err', widths.errorWidth),
    padLeft('avg', widths.latencyWidth)
  ].join(' ');
}

function getEndpointVisibleCount(terminalRows = process.stdout.rows) {
  return Math.max(4, getTerminalRows(terminalRows) - 12);
}

function getEndpointVisibleStart(rows = [], focusedIndex = 0, visibleCount = 1) {
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const maxStart = Math.max(0, rows.length - safeVisibleCount);
  const safeFocusedIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(Number(focusedIndex) || 0)));

  return Math.max(0, Math.min(
    safeFocusedIndex - Math.floor(safeVisibleCount / 2),
    maxStart
  ));
}

function getSlowestEndpointLabel(groups = [], maxLength = 32) {
  const slowest = groups
    .filter((group) => group.averageResponseTimeMs !== null && group.averageResponseTimeMs !== undefined)
    .sort((left, right) => right.averageResponseTimeMs - left.averageResponseTimeMs)[0];

  if (!slowest) {
    return 'slowest n/a';
  }

  return `slowest ${truncate(`${slowest.method} ${slowest.routePattern}`, maxLength)} ${formatAverageLatency(slowest.averageResponseTimeMs)}`;
}

function getEndpointSummary(groups = [], totalLogs = 0, width = 80) {
  const requestCount = groups.reduce((total, group) => total + group.count, 0);
  const errorCount = groups.reduce((total, group) => total + group.errorCount, 0);
  const errorRate = requestCount === 0 ? 0 : errorCount / requestCount;
  const totalCount = Number.isFinite(Number(totalLogs)) && Number(totalLogs) > 0
    ? Number(totalLogs)
    : requestCount;
  const sourceText = totalCount === requestCount
    ? `${requestCount} visible requests`
    : `${requestCount}/${totalCount} visible requests`;
  const slowestMaxLength = Math.max(18, Math.min(40, width - 62));

  return `${groups.length} groups | ${sourceText} | ${errorCount} errors (${formatErrorRate(errorRate)}) | ${getSlowestEndpointLabel(groups, slowestMaxLength)}`;
}

function rowColor(group = {}, selected = false) {
  if (selected) {
    return 'black';
  }

  if (group.errorCount > 0) {
    return group.errorRate >= 0.5 ? 'red' : 'yellow';
  }

  return 'white';
}

export const EndpointGroupsModal = React.memo(function EndpointGroupsModal({
  focusedIndex = 0,
  groups = [],
  totalLogs = groups.length
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(42, Math.min(118, columns - 8));
  const contentWidth = Math.max(36, width - 6);
  const safeFocusedIndex = Math.max(0, Math.min(groups.length - 1, focusedIndex));
  const visibleCount = getEndpointVisibleCount();
  const startIndex = getEndpointVisibleStart(groups, safeFocusedIndex, visibleCount);
  const visibleGroups = groups.slice(startIndex, startIndex + visibleCount);
  const position = groups.length === 0
    ? 'none'
    : `${safeFocusedIndex + 1}/${groups.length}`;

  return h(
    Box,
    {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(Text, { color: 'cyan', bold: true }, 'Endpoint groups'),
      h(Text, { color: 'gray', wrap: 'truncate' }, getEndpointSummary(groups, totalLogs, contentWidth)),
      h(Text, { color: 'gray', wrap: 'truncate' }, `Current filtered traffic | sorted by impact | item ${position}`),
      h(Text, {}, ''),
      groups.length === 0
        ? h(Text, { color: 'gray' }, 'No visible traffic to group')
        : [
          h(Text, { key: 'endpoint-header', color: 'gray', wrap: 'truncate' }, formatEndpointHeader(contentWidth)),
          ...visibleGroups.map((group, index) => {
            const absoluteIndex = startIndex + index;
            const selected = absoluteIndex === safeFocusedIndex;

            return h(Text, {
              key: `${group.method} ${group.routePattern}`,
              backgroundColor: selected ? 'cyan' : undefined,
              color: rowColor(group, selected),
              wrap: 'truncate'
            }, formatEndpointGroupRow(group, {
              selected,
              width: contentWidth
            }));
          })
        ]
    )
  );
});
