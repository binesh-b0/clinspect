import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { isCookieHeaderName, maskCookieHeaderValue } from '../cookies.js';
import { getProxyOrigin, isPublicTargetUrl } from '../target.js';
import { isInkMouseInput, parseInkMouseInput } from './mouse.js';

const h = React.createElement;

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_OPTIONS = ['2xx', '3xx', '4xx', '5xx'];
const DETAIL_TABS = ['request', 'response'];
const SEARCH_FIELDS = ['all', 'path', 'status', 'method', 'time', 'host', 'port', 'headers', 'body'];
const FILTER_FOCUS_ORDER = ['query', 'field', 'method', 'status'];
const ROOT_PADDING_X = 1;
const TRAFFIC_LIST_WIDTH = 50;
const OFF_RECORDING_STATUS = {
  mode: 'off',
  path: null,
  state: 'off',
  error: null
};

const METHOD_COLORS = {
  GET: 'green',
  POST: 'cyan',
  PUT: 'yellow',
  PATCH: 'magenta',
  DELETE: 'red'
};

function getTerminalRows(terminalRows = process.stdout.rows) {
  return Number.isFinite(terminalRows) && terminalRows > 0
    ? Math.floor(terminalRows)
    : 24;
}

function truncate(value, maxLength) {
  const text = String(value ?? '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function pad(value, length) {
  return String(value).padEnd(length).slice(0, length);
}

function padLeft(value, length) {
  return String(value).padStart(length).slice(-length);
}

export function getRenderHeight(terminalRows = process.stdout.rows) {
  const rows = getTerminalRows(terminalRows);

  // Ink clears the whole terminal when rendered output is >= stdout.rows.
  // Keep one row free so routine UI updates use incremental line erases.
  return Math.max(1, rows - 1);
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function statusColor(statusCode) {
  if (statusCode >= 500) {
    return 'red';
  }

  if (statusCode >= 400) {
    return 'yellow';
  }

  if (statusCode >= 300) {
    return 'blue';
  }

  if (statusCode >= 200) {
    return 'green';
  }

  return 'gray';
}

function rowColor(log) {
  if (log.statusCode >= 400) {
    return statusColor(log.statusCode);
  }

  return METHOD_COLORS[log.method] ?? 'white';
}

function formatTrafficRow(log, selected = false) {
  const marker = selected ? '>' : ' ';
  const method = pad(log.method, 6);
  const status = String(log.statusCode ?? '---').padEnd(3);
  const path = pad(truncate(log.path, 15), 15);
  const duration = padLeft(`${log.responseTimeMs}ms`, 6);

  return `${marker} ${formatTime(log.timestamp)} ${method} ${status} ${path} ${duration}`;
}

function getRecordingStatus(trafficRecorder) {
  return trafficRecorder?.getStatus?.() ?? OFF_RECORDING_STATUS;
}

export function formatRecordingLabel(recordingStatus = OFF_RECORDING_STATUS) {
  if (recordingStatus.state === 'error') {
    return recordingStatus.path
      ? `rec error -> ${recordingStatus.path}`
      : 'rec error';
  }

  if (recordingStatus.mode === 'full' || recordingStatus.mode === 'partial') {
    if (recordingStatus.state === 'paused') {
      return `rec paused ${recordingStatus.mode} -> ${recordingStatus.path}`;
    }

    return `rec ${recordingStatus.mode} -> ${recordingStatus.path}`;
  }

  return 'rec off';
}

function basename(filePath = '') {
  const parts = String(filePath).split(/[\\/]/);

  return parts[parts.length - 1] || String(filePath);
}

function getDisplayHeaderValue(key, value, options = {}) {
  const publicTargetValue = getPublicTargetHeaderDisplayValue(key, value, options);

  if (publicTargetValue !== null) {
    return publicTargetValue;
  }

  if (!options.showCookieValues && isCookieHeaderName(key)) {
    return maskCookieHeaderValue(key, value);
  }

  return value;
}

function getPublicTargetUrl(options = {}) {
  if (!options.rewritePublicTargetRequestHeaders || !isPublicTargetUrl(options.publicTargetUrl)) {
    return null;
  }

  try {
    return new URL(options.publicTargetUrl);
  } catch {
    return null;
  }
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function getProxyOrigins(options = {}) {
  const origins = new Set();
  const proxyOrigin = normalizeOrigin(options.proxyOrigin);

  if (proxyOrigin) {
    origins.add(proxyOrigin);
  }

  if (options.requestHost) {
    const requestOrigin = normalizeOrigin(`http://${options.requestHost}`);

    if (requestOrigin) {
      origins.add(requestOrigin);
    }
  }

  return origins;
}

function rewritePublicTargetReferer(value, targetUrl, options = {}) {
  try {
    const refererUrl = new URL(String(value));

    if (!getProxyOrigins(options).has(refererUrl.origin)) {
      return value;
    }

    return `${targetUrl.origin}${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`;
  } catch {
    return value;
  }
}

function getPublicTargetHeaderDisplayValue(key, value, options = {}) {
  const targetUrl = getPublicTargetUrl(options);

  if (!targetUrl) {
    return null;
  }

  const normalizedKey = String(key ?? '').toLowerCase();

  if (normalizedKey === 'host') {
    return targetUrl.host;
  }

  if (normalizedKey !== 'referer') {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewritePublicTargetReferer(item, targetUrl, options));
  }

  return rewritePublicTargetReferer(value, targetUrl, options);
}

function headerValueLines(key, value, options = {}) {
  const displayValue = getDisplayHeaderValue(key, value, options);
  const values = Array.isArray(displayValue) ? displayValue : [displayValue];

  return values.map((item) => `${key}: ${String(item)}`);
}

function formatHeaders(headers, options = {}) {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return ['(none)'];
  }

  return entries.flatMap(([key, value]) => headerValueLines(key, value, options));
}

function formatPayloadBody(payload = {}) {
  const body = String(payload.body || '');
  const lines = body.length > 0 ? body.split('\n') : ['(empty)'];

  if (payload.truncated) {
    lines.push('[body truncated]');
  }

  return lines;
}

function headersToSearchText(headers = {}, options = {}) {
  return Object.entries(headers)
    .flatMap(([key, value]) => headerValueLines(key, value, options))
    .join('\n');
}

function normalizeFilterValues(values, allowedValues) {
  if (!values || values === 'all') {
    return [];
  }

  const list = Array.isArray(values) ? values : [values];
  const selected = new Set(list.filter((value) => allowedValues.includes(value)));

  return allowedValues.filter((value) => selected.has(value));
}

function formatSelectedValues(values) {
  return values.length === 0 ? 'all' : values.join(',');
}

function formatSearchFieldLabel(searchField) {
  return searchField === 'all' ? 'all fields' : searchField;
}

export function toggleFilterValue(values, value, allowedValues) {
  if (value === 'all') {
    return [];
  }

  const selected = new Set(normalizeFilterValues(values, allowedValues));

  if (selected.has(value)) {
    selected.delete(value);
  } else if (allowedValues.includes(value)) {
    selected.add(value);
  }

  return allowedValues.filter((allowedValue) => selected.has(allowedValue));
}

export function countActiveFilters(options = {}) {
  const methodFilters = normalizeFilterValues(options.methodFilters ?? options.methodFilter, METHOD_OPTIONS);
  const statusFilters = normalizeFilterValues(options.statusFilters ?? options.statusFilter, STATUS_OPTIONS);
  const hasSearch = Boolean(String(options.searchQuery ?? '').trim());

  return methodFilters.length + statusFilters.length + (hasSearch ? 1 : 0);
}

export function extractPortFromHost(host = '') {
  const value = String(host ?? '');

  if (!value) {
    return '';
  }

  if (value.startsWith('[')) {
    const match = value.match(/\]:(\d+)$/);

    return match?.[1] ?? '';
  }

  const parts = value.split(':');

  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function matchesMethodFilters(log, methodFilters) {
  if (methodFilters.length === 0) {
    return true;
  }

  return methodFilters.includes(log.method);
}

function matchesStatusFilters(log, statusFilters) {
  if (statusFilters.length === 0) {
    return true;
  }

  const statusCode = Number(log.statusCode);

  if (!Number.isInteger(statusCode)) {
    return false;
  }

  return statusFilters.some((statusFilter) => Math.floor(statusCode / 100) === Number(statusFilter[0]));
}

export function getSearchValues(log, searchField = 'all', options = {}) {
  const requestHeaders = log.request?.headers ?? {};
  const responseHeaders = log.response?.headers ?? {};
  const host = requestHeaders.host ?? '';
  const values = {
    all: [
      log.method,
      log.path,
      String(log.statusCode ?? ''),
      formatTime(log.timestamp),
      host,
      extractPortFromHost(host),
      headersToSearchText(requestHeaders, options),
      log.request?.body,
      headersToSearchText(responseHeaders, options),
      log.response?.body
    ],
    body: [
      log.request?.body,
      log.response?.body
    ],
    headers: [
      headersToSearchText(requestHeaders, options),
      headersToSearchText(responseHeaders, options)
    ],
    host: [host],
    method: [log.method],
    path: [log.path],
    port: [extractPortFromHost(host)],
    status: [String(log.statusCode ?? '')],
    time: [formatTime(log.timestamp)]
  };

  return values[searchField] ?? values.all;
}

function matchesSearch(log, searchQuery, searchField = 'all', options = {}) {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return getSearchValues(log, searchField, options)
    .some((value) => String(value ?? '').toLowerCase().includes(query));
}

export function filterLogs(logs, options = {}) {
  const methodFilters = normalizeFilterValues(options.methodFilters ?? options.methodFilter, METHOD_OPTIONS);
  const statusFilters = normalizeFilterValues(options.statusFilters ?? options.statusFilter, STATUS_OPTIONS);
  const searchQuery = options.searchQuery ?? '';
  const searchField = options.searchField ?? 'all';
  const showCookieValues = Boolean(options.showCookieValues);

  return logs.filter((log) => {
    return matchesMethodFilters(log, methodFilters) &&
      matchesStatusFilters(log, statusFilters) &&
      matchesSearch(log, searchQuery, searchField, { showCookieValues });
  });
}

export function cycleValue(values, currentValue, direction = 1) {
  const index = values.indexOf(currentValue);
  const currentIndex = index === -1 ? 0 : index;
  const nextIndex = (currentIndex + direction + values.length) % values.length;

  return values[nextIndex] ?? values[0];
}

export function getDetailLines(log, detailTab = 'request', options = {}) {
  if (!log) {
    return [];
  }

  const payload = detailTab === 'response' ? log.response : log.request;
  const title = detailTab === 'response' ? 'Response' : 'Request';
  const headerOptions = detailTab === 'request'
    ? {
      ...options,
      requestHost: payload.headers?.host,
      rewritePublicTargetRequestHeaders: true
    }
    : options;

  return [
    `${title} headers`,
    ...formatHeaders(payload.headers, headerOptions),
    '',
    `${title} body`,
    ...formatPayloadBody(payload)
  ];
}

export function getMaxScrollOffset(lines, visibleCount) {
  return Math.max(0, lines.length - Math.max(1, visibleCount));
}

export function getTrafficVisibleCount(bottomOffset, terminalRows = process.stdout.rows) {
  return Math.max(5, getTerminalRows(terminalRows) - bottomOffset);
}

export function getDetailVisibleCount(bottomOffset, terminalRows = process.stdout.rows) {
  return Math.max(4, getTerminalRows(terminalRows) - bottomOffset);
}

export function getPageStep(visibleCount, amount = 'page') {
  const pageSize = Math.max(1, Math.floor(Number(visibleCount) || 1));

  return amount === 'half' ? Math.max(1, Math.floor(pageSize / 2)) : pageSize;
}

export function clampScrollOffset(currentOffset, direction, maxScrollOffset) {
  const current = Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0;
  const delta = Number.isFinite(Number(direction)) ? Number(direction) : 0;
  const max = Number.isFinite(Number(maxScrollOffset)) ? Number(maxScrollOffset) : 0;

  return Math.min(
    Math.max(0, max),
    Math.max(0, current + delta)
  );
}

export function getBoundaryLogId(logs, boundary) {
  if (logs.length === 0) {
    return null;
  }

  return boundary === 'last' ? logs[logs.length - 1].id : logs[0].id;
}

const Header = React.memo(function Header({
  context = {},
  logsCount,
  recordingStatus,
  visibleCount,
  isPaused
}) {
  if (context.mode === 'replay') {
    const loadedSession = context.loadedSession ?? {};
    const metadata = loadedSession.metadata ?? {};
    const countText = visibleCount === logsCount
      ? `${logsCount} entries`
      : `${visibleCount}/${logsCount} entries`;
    const sourceText = metadata.sourceMode
      ? `source ${metadata.sourceMode}`
      : 'source unknown';
    const targetText = metadata.targetUrl
      ? `target ${metadata.targetUrl}`
      : 'target unknown';

    return h(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      h(Text, { color: 'cyan', bold: true }, 'clinspect'),
      h(
        Text,
        { color: 'gray', wrap: 'truncate' },
        `recorded session | ${basename(context.sessionPath)} | ${countText} | skipped ${loadedSession.skippedLines ?? 0}`
      ),
      h(Text, { color: 'gray', wrap: 'truncate' }, `${sourceText} | ${targetText}`)
    );
  }

  const mode = context.mode === 'live' ? 'live proxy' : 'demo mode';
  const target = context.targetUrl ?? 'mock traffic';
  const port = context.port ?? 8080;
  const captureState = isPaused ? 'paused' : 'capturing';
  const countText = visibleCount === logsCount
    ? `${logsCount} entries`
    : `${visibleCount}/${logsCount} entries`;
  const targetKind = isPublicTargetUrl(context.targetUrl) ? 'public target' : 'local target';
  const proxyOrigin = getProxyOrigin(port);
  const subtitle = context.mode === 'live'
    ? `${mode} | ${captureState} | ${targetKind} | proxy ${proxyOrigin} | ${countText} | ${formatRecordingLabel(recordingStatus)}`
    : `${mode} | ${captureState} | ${target} | ${countText} | ${formatRecordingLabel(recordingStatus)}`;

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'cyan', bold: true }, 'clinspect'),
    h(Text, { color: 'gray', wrap: 'truncate' }, subtitle),
    context.mode === 'live'
      ? h(Text, { color: 'gray', wrap: 'truncate' }, `target ${target}`)
      : null
  );
});

export function formatFilterLabel(methodFilters, statusFilters, searchField, searchQuery) {
  const parts = [];

  if (methodFilters.length > 0) {
    parts.push(`method ${formatSelectedValues(methodFilters)}`);
  }

  if (statusFilters.length > 0) {
    parts.push(`status ${formatSelectedValues(statusFilters)}`);
  }

  if (searchQuery.trim()) {
    parts.push(`search "${truncate(searchQuery, 16)}" in ${formatSearchFieldLabel(searchField)}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'none';
}

const TrafficList = React.memo(function TrafficList({
  bottomOffset,
  emptyText,
  logs,
  totalCount,
  selectedIndex,
  isFocused,
  isFollowingLatest,
  methodFilters,
  statusFilters,
  searchField,
  searchQuery
}) {
  const visibleCount = getTrafficVisibleCount(bottomOffset);
  const startIndex = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    Math.max(0, logs.length - visibleCount)
  ));
  const visibleLogs = logs.slice(startIndex, startIndex + visibleCount);
  const filterLabel = formatFilterLabel(methodFilters, statusFilters, searchField, searchQuery);
  const noRowsText = totalCount === 0 ? emptyText : 'No matching traffic';

  return h(
    Box,
    {
      flexDirection: 'column',
      width: TRAFFIC_LIST_WIDTH,
      flexShrink: 0,
      borderStyle: 'single',
      borderColor: isFocused ? 'cyan' : 'gray',
      paddingX: 1,
      marginRight: 1
    },
    h(Text, { bold: true }, `Traffic ${isFocused ? 'focused' : 'idle'} | ${isFollowingLatest ? 'follow' : 'hold'}`),
    h(Text, { color: 'gray', wrap: 'truncate' }, `filters ${filterLabel}`),
    h(Text, { color: 'gray' }, '  time     meth   st  path            dur'),
    logs.length === 0
      ? h(Text, { color: 'gray', wrap: 'truncate' }, noRowsText)
      : visibleLogs.map((log, offset) => {
        const absoluteIndex = startIndex + offset;
        const selected = absoluteIndex === selectedIndex;
        const row = formatTrafficRow(log, selected);

        return h(
          Text,
          {
            key: log.id,
            bold: selected,
            backgroundColor: selected ? 'cyan' : undefined,
            color: selected ? 'black' : rowColor(log),
            wrap: 'truncate'
          },
          row
        );
      })
  );
});

const DetailPane = React.memo(function DetailPane({
  bottomOffset,
  log,
  isFocused,
  detailTab,
  scrollOffset,
  publicTargetUrl = null,
  proxyOrigin = null,
  showCookieValues = false
}) {
  if (!log) {
    return h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: isFocused ? 'cyan' : 'gray',
        paddingX: 1
      },
      h(Text, { color: 'gray' }, 'No request inspected')
    );
  }

  const visibleCount = getDetailVisibleCount(bottomOffset);
  const lines = getDetailLines(log, detailTab, {
    publicTargetUrl,
    proxyOrigin,
    showCookieValues
  });
  const maxScrollOffset = getMaxScrollOffset(lines, visibleCount);
  const safeScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleLines = lines.slice(safeScrollOffset, safeScrollOffset + visibleCount);
  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const summary = `${log.method} ${log.path} | ${timing}`;
  const tabLabel = `${detailTab === 'request' ? '[Request]' : ' Request '} ${detailTab === 'response' ? '[Response]' : ' Response '}`;
  const scrollLabel = maxScrollOffset === 0
    ? 'top'
    : `${safeScrollOffset + 1}-${Math.min(lines.length, safeScrollOffset + visibleCount)}/${lines.length}`;

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1,
      borderStyle: 'single',
      borderColor: isFocused ? 'cyan' : 'gray',
      paddingX: 1
    },
    h(Text, { bold: true, color: statusColor(log.statusCode), wrap: 'truncate' }, summary),
    h(Text, { color: 'gray', wrap: 'truncate' }, `${tabLabel} | scroll ${scrollLabel}`),
    ...visibleLines.map((line, index) => h(
      Text,
      {
        key: `${detailTab}-${safeScrollOffset + index}`,
        color: line.endsWith('headers') || line.endsWith('body') ? 'cyan' : undefined,
        bold: line.endsWith('headers') || line.endsWith('body'),
        wrap: 'truncate'
      },
      line
    ))
  );
});

function formatOptionToken(value, options = {}) {
  const displayValue = options.label ?? value;
  const label = options.selected ? `[${displayValue}]` : displayValue;

  return options.cursor ? `<${label}>` : ` ${label} `;
}

function formatOptionsLine(values, selectedValues, cursorIndex, isFocused) {
  return ['all', ...values]
    .map((value, index) => formatOptionToken(value, {
      cursor: isFocused && index === cursorIndex,
      label: value === 'all' ? 'any' : value,
      selected: value === 'all' ? selectedValues.length === 0 : selectedValues.includes(value)
    }))
    .join(' ');
}

function formatFieldLine(searchField, isFocused) {
  return SEARCH_FIELDS
    .map((value) => formatOptionToken(value, {
      cursor: isFocused && value === searchField,
      label: formatSearchFieldLabel(value),
      selected: value === searchField
    }))
    .join(' ');
}

function focusedMarker(row, filterFocus) {
  return row === filterFocus ? '>' : ' ';
}

const FilterBar = React.memo(function FilterBar({
  filterFocus,
  logsCount,
  methodFilters,
  methodOptionIndex,
  searchField,
  searchQuery,
  statusFilters,
  statusOptionIndex,
  visibleCount
}) {
  const query = searchQuery.length > 0 ? searchQuery : '(empty)';
  const activeFilters = countActiveFilters({
    methodFilters,
    statusFilters,
    searchQuery
  });

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: 'cyan',
      paddingX: 1,
      marginTop: 1
    },
    h(Text, { color: 'cyan', bold: true }, `Filters ${visibleCount}/${logsCount} matches | ${activeFilters} active`),
    h(Text, { wrap: 'truncate' }, `${focusedMarker('query', filterFocus)} query ${query}${filterFocus === 'query' ? '_' : ''}`),
    h(
      Text,
      { wrap: 'truncate' },
      `${focusedMarker('field', filterFocus)} field ${formatFieldLine(searchField, filterFocus === 'field')}`
    ),
    h(
      Text,
      { wrap: 'truncate' },
      `${focusedMarker('method', filterFocus)} method ${formatOptionsLine(METHOD_OPTIONS, methodFilters, methodOptionIndex, filterFocus === 'method')}`
    ),
    h(
      Text,
      { wrap: 'truncate' },
      `${focusedMarker('status', filterFocus)} status ${formatOptionsLine(STATUS_OPTIONS, statusFilters, statusOptionIndex, filterFocus === 'status')}`
    ),
    h(Text, { color: 'gray', wrap: 'truncate' }, 'up/down row | left/right option | space select | x clear filters | enter/esc close')
  );
});

export const HELP_SECTIONS = [
  {
    title: 'Navigation',
    rows: [
      ['j/k', 'move line'],
      ['up/down', 'move line'],
      ['[ / ]', 'move page'],
      ['PgUp/PgDn', 'move page'],
      ['Ctrl-u/d', 'move half page'],
      ['g/G', 'top / bottom'],
      ['tab', 'switch pane']
    ]
  },
  {
    title: 'Inspect',
    rows: [
      ['enter', 'inspect row'],
      ['r', 'request / response'],
      ['wheel', 'scroll hovered pane']
    ]
  },
  {
    title: 'Filters',
    rows: [
      ['/', 'text search'],
      ['m / s', 'method / status'],
      ['space', 'toggle option'],
      ['x', 'clear filters']
    ]
  },
  {
    title: 'Capture',
    rows: [
      ['p', 'pause capture'],
      ['P', 'start / pause recording'],
      ['S', 'stop recording']
    ]
  },
  {
    title: 'Session',
    rows: [
      ['f', 'follow latest'],
      ['c', 'clear logs'],
      ['h', 'help'],
      ['q', 'quit']
    ]
  }
];

function renderHelpSections(sections, width) {
  return sections.flatMap((section) => [
    h(Text, { key: `${section.title}-title`, bold: true, color: 'cyan' }, section.title),
    ...section.rows.map(([keys, description]) => h(
      Box,
      { key: `${section.title}-${keys}`, width },
      h(Text, { color: 'cyan' }, pad(keys, 12)),
      h(Text, { wrap: 'truncate' }, description)
    )),
    h(Text, { key: `${section.title}-space` }, '')
  ]);
}

const HelpModal = React.memo(function HelpModal() {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(34, Math.min(86, columns - 4));
  const useColumns = width >= 72;
  const contentWidth = Math.max(26, width - 6);
  const columnWidth = useColumns ? Math.floor((contentWidth - 2) / 2) : contentWidth;
  const leftSections = HELP_SECTIONS.filter((_, index) => index % 2 === 0);
  const rightSections = HELP_SECTIONS.filter((_, index) => index % 2 === 1);

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
      h(Text, { bold: true, color: 'cyan' }, 'Help'),
      h(Text, { color: 'gray' }, 'Essential key bindings'),
      h(Text, {}, ''),
      useColumns
        ? h(
          Box,
          { flexDirection: 'row' },
          h(Box, { flexDirection: 'column', width: columnWidth }, ...renderHelpSections(leftSections, columnWidth)),
          h(Box, { width: 2 }, h(Text, {}, '')),
          h(Box, { flexDirection: 'column', width: columnWidth }, ...renderHelpSections(rightSections, columnWidth))
        )
        : h(Box, { flexDirection: 'column' }, ...renderHelpSections(HELP_SECTIONS, contentWidth)),
      h(Text, { color: 'gray' }, 'esc/h/q close')
    )
  );
});

export function formatFooterText({
  isHelpOpen = false,
  isListFocused = true,
  isRawModeSupported = true
} = {}) {
  if (!isRawModeSupported) {
    return 'keyboard input unavailable in this shell | Ctrl-C or SIGTERM quit';
  }

  if (isHelpOpen) {
    return 'help | esc/h/q close';
  }

  if (isListFocused) {
    return 'j/k move  [/] page  enter inspect  tab details  P rec  S stop  h help  q quit';
  }

  return 'j/k scroll  [/] page  g/G top/bottom  r req/res  tab traffic  P rec  S stop  h help  q quit';
}

const Footer = React.memo(function Footer({
  isHelpOpen,
  isListFocused,
  isRawModeSupported
}) {
  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { color: 'gray', wrap: 'truncate' },
      formatFooterText({ isHelpOpen, isListFocused, isRawModeSupported })
    )
  );
});

export function getSelectedIndex(logs, selectedLogId) {
  if (logs.length === 0) {
    return -1;
  }

  const selectedIndex = logs.findIndex((log) => log.id === selectedLogId);

  return selectedIndex === -1 ? 0 : selectedIndex;
}

export function resolveSelectedLogId(logs, selectedLogId, options = {}) {
  if (logs.length === 0) {
    return null;
  }

  if (options.followLatest) {
    return logs[logs.length - 1].id;
  }

  if (logs.some((log) => log.id === selectedLogId)) {
    return selectedLogId;
  }

  return logs[0].id;
}

export function moveSelectedLogId(logs, selectedLogId, direction) {
  if (logs.length === 0) {
    return null;
  }

  const selectedIndex = getSelectedIndex(logs, selectedLogId);
  const nextIndex = Math.min(
    Math.max(0, logs.length - 1),
    Math.max(0, selectedIndex + direction)
  );

  return logs[nextIndex].id;
}

export function getMouseWheelTarget(column) {
  const value = Number(column);
  const trafficEndColumn = ROOT_PADDING_X + TRAFFIC_LIST_WIDTH;

  if (Number.isSafeInteger(value) && value > 0 && value <= trafficEndColumn) {
    return 'traffic';
  }

  return 'details';
}

export function getKeyboardAction(input = '', key = {}, options = {}) {
  const {
    filterFocus = 'query',
    isListFocused = true,
    isHelpOpen = false,
    isFilterOpen = false,
    isReplayMode = false,
    detailPageSize = 1,
    trafficPageSize = 1
  } = options;
  const value = input ?? '';
  const keyState = key ?? {};

  if (value === 'c' && keyState.ctrl) {
    return { type: 'quit' };
  }

  if (isHelpOpen) {
    if (keyState.escape || value === 'h' || value === 'q') {
      return { type: 'closeHelp' };
    }

    return { type: 'none' };
  }

  const mouseEvent = parseInkMouseInput(value);

  if (mouseEvent) {
    if (getMouseWheelTarget(mouseEvent.x) === 'traffic') {
      return { type: 'moveSelection', direction: mouseEvent.direction };
    }

    return { type: 'scrollDetails', direction: mouseEvent.direction };
  }

  if (isInkMouseInput(value)) {
    return { type: 'none' };
  }

  if (isFilterOpen) {
    if (keyState.escape || keyState.return) {
      return { type: 'finishSearch' };
    }

    if (value === 'x') {
      return { type: 'clearFilters' };
    }

    if (keyState.tab || keyState.downArrow) {
      return { type: 'cycleFilterFocus', direction: 1 };
    }

    if (keyState.upArrow) {
      return { type: 'cycleFilterFocus', direction: -1 };
    }

    if (keyState.rightArrow) {
      return { type: 'moveFilterOption', direction: 1 };
    }

    if (keyState.leftArrow) {
      return { type: 'moveFilterOption', direction: -1 };
    }

    if (value === ' ' && filterFocus !== 'query') {
      return { type: 'toggleFilterOption' };
    }

    if (keyState.backspace || keyState.delete) {
      return filterFocus === 'query'
        ? { type: 'backspaceSearch' }
        : { type: 'none' };
    }

    if (value && !keyState.ctrl && !keyState.meta && filterFocus === 'query') {
      return { type: 'appendSearch', value };
    }

    return { type: 'none' };
  }

  if (value === 'h') {
    return { type: 'openHelp' };
  }

  if (value === 'q') {
    return { type: 'quit' };
  }

  if (value === '/') {
    return { type: 'openFilter', focus: 'query' };
  }

  if (value === 'x') {
    return { type: 'clearFilters' };
  }

  if (value === 'c') {
    return { type: 'clearLogs' };
  }

  if (value === 'f') {
    return { type: 'followLatest' };
  }

  if (keyState.return) {
    return { type: 'inspectSelected' };
  }

  if (value === 'm') {
    return { type: 'openFilter', focus: 'method' };
  }

  if (value === 'p') {
    return isReplayMode ? { type: 'none' } : { type: 'togglePause' };
  }

  if (value === 'P') {
    return isReplayMode ? { type: 'none' } : { type: 'toggleRecordingPause' };
  }

  if (value === 'S') {
    return isReplayMode ? { type: 'none' } : { type: 'stopRecording' };
  }

  if (value === 'r') {
    return { type: 'toggleDetailTab' };
  }

  if (value === 's') {
    return { type: 'openFilter', focus: 'status' };
  }

  if (keyState.tab) {
    return { type: 'toggleFocus' };
  }

  if (keyState.upArrow || value === 'k') {
    return isListFocused
      ? { type: 'moveSelection', direction: -1 }
      : { type: 'scrollDetails', direction: -1 };
  }

  if (keyState.downArrow || value === 'j') {
    return isListFocused
      ? { type: 'moveSelection', direction: 1 }
      : { type: 'scrollDetails', direction: 1 };
  }

  if (keyState.pageUp || value === '[') {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
  }

  if (keyState.pageDown || value === ']') {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
  }

  if (value === 'u' && keyState.ctrl) {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
  }

  if (value === 'd' && keyState.ctrl) {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
  }

  if (value === 'g') {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'first' }
      : { type: 'scrollDetailsTo', boundary: 'top' };
  }

  if (value === 'G') {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'last' }
      : { type: 'scrollDetailsTo', boundary: 'bottom' };
  }

  return { type: 'none' };
}

function KeyboardControls({
  filterFocus,
  isListFocused,
  isHelpOpen,
  isFilterOpen,
  isReplayMode,
  detailPageSize,
  trafficPageSize,
  onAppendSearch,
  onBackspaceSearch,
  onClearFilters,
  onClearLogs,
  onCloseHelp,
  onCycleFilterFocus,
  onFinishSearch,
  onFollowLatest,
  onInspectSelected,
  onMoveSelectionTo,
  onMoveFilterOption,
  onMoveSelection,
  onOpenFilter,
  onOpenHelp,
  onQuit,
  onScrollDetails,
  onScrollDetailsTo,
  onStopRecording,
  onToggleFilterOption,
  onToggleDetailTab,
  onToggleFocus,
  onTogglePause,
  onToggleRecordingPause
}) {
  useInput((input, key) => {
    const action = getKeyboardAction(input, key, {
      filterFocus,
      isListFocused,
      isHelpOpen,
      isFilterOpen,
      isReplayMode,
      detailPageSize,
      trafficPageSize
    });

    switch (action.type) {
      case 'appendSearch':
        onAppendSearch(action.value);
        break;
      case 'backspaceSearch':
        onBackspaceSearch();
        break;
      case 'clearFilters':
        onClearFilters();
        break;
      case 'clearLogs':
        onClearLogs();
        break;
      case 'closeHelp':
        onCloseHelp();
        break;
      case 'cycleFilterFocus':
        onCycleFilterFocus(action.direction);
        break;
      case 'finishSearch':
        onFinishSearch();
        break;
      case 'followLatest':
        onFollowLatest();
        break;
      case 'inspectSelected':
        onInspectSelected();
        break;
      case 'moveFilterOption':
        onMoveFilterOption(action.direction);
        break;
      case 'moveSelection':
        onMoveSelection(action.direction);
        break;
      case 'moveSelectionTo':
        onMoveSelectionTo(action.boundary);
        break;
      case 'openFilter':
        onOpenFilter(action.focus);
        break;
      case 'openHelp':
        onOpenHelp();
        break;
      case 'quit':
        onQuit();
        break;
      case 'scrollDetails':
        onScrollDetails(action.direction);
        break;
      case 'scrollDetailsTo':
        onScrollDetailsTo(action.boundary);
        break;
      case 'stopRecording':
        onStopRecording();
        break;
      case 'toggleDetailTab':
        onToggleDetailTab();
        break;
      case 'toggleFilterOption':
        onToggleFilterOption();
        break;
      case 'toggleFocus':
        onToggleFocus();
        break;
      case 'togglePause':
        onTogglePause();
        break;
      case 'toggleRecordingPause':
        onToggleRecordingPause();
        break;
      default:
        break;
    }
  });

  return null;
}

export function App({
  stateStore,
  context = {},
  captureController = null,
  trafficRecorder = null,
  onQuit = () => {}
}) {
  const { isRawModeSupported } = useStdin();
  const renderHeight = getRenderHeight();
  const [logs, setLogs] = useState(() => stateStore.getLogs());
  const [recordingStatus, setRecordingStatus] = useState(() => getRecordingStatus(trafficRecorder));
  const [selectedLogId, setSelectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [inspectedLogId, setInspectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [isFollowingLatest, setIsFollowingLatest] = useState(false);
  const [isListFocused, setIsListFocused] = useState(true);
  const [isPaused, setIsPaused] = useState(() => captureController?.isPaused?.() ?? false);
  const [methodFilters, setMethodFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [searchField, setSearchField] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterFocus, setFilterFocus] = useState('query');
  const [methodOptionIndex, setMethodOptionIndex] = useState(0);
  const [statusOptionIndex, setStatusOptionIndex] = useState(0);
  const [detailTab, setDetailTab] = useState('request');
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const isReplayMode = context.mode === 'replay';
  const showCookieValues = Boolean(context.showCookieValues);
  const proxyOrigin = getProxyOrigin(context.port ?? 8080);
  const publicTargetUrl = context.mode === 'live' ? context.targetUrl : null;

  const filteredLogs = useMemo(() => filterLogs(logs, {
    methodFilters,
    searchField,
    searchQuery,
    showCookieValues,
    statusFilters
  }), [logs, methodFilters, searchField, searchQuery, showCookieValues, statusFilters]);

  useEffect(() => {
    const handleUpdate = (updatedLogs) => setLogs(updatedLogs);

    stateStore.on('update', handleUpdate);

    return () => stateStore.off('update', handleUpdate);
  }, [stateStore]);

  useEffect(() => {
    setRecordingStatus(getRecordingStatus(trafficRecorder));

    const handleRecordingStatus = (status) => setRecordingStatus(status);

    trafficRecorder?.on?.('status', handleRecordingStatus);

    return () => trafficRecorder?.off?.('status', handleRecordingStatus);
  }, [trafficRecorder]);

  useEffect(() => {
    const resolveOptions = { followLatest: isFollowingLatest };

    setSelectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
    setInspectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
  }, [filteredLogs, isFollowingLatest]);

  useEffect(() => {
    setDetailScrollOffset(0);
  }, [inspectedLogId, detailTab]);

  const selectedIndex = useMemo(() => getSelectedIndex(filteredLogs, selectedLogId), [filteredLogs, selectedLogId]);
  const selectedLog = useMemo(() => filteredLogs[selectedIndex] ?? null, [filteredLogs, selectedIndex]);
  const inspectedLog = useMemo(() => {
    return filteredLogs.find((log) => log.id === inspectedLogId) ?? selectedLog;
  }, [filteredLogs, inspectedLogId, selectedLog]);
  const detailLines = useMemo(
    () => getDetailLines(inspectedLog, detailTab, {
      publicTargetUrl,
      proxyOrigin,
      showCookieValues
    }),
    [detailTab, inspectedLog, publicTargetUrl, proxyOrigin, showCookieValues]
  );
  const bottomOffset = isFilterOpen ? 19 : 13;
  const trafficVisibleCount = getTrafficVisibleCount(bottomOffset);
  const detailVisibleCount = getDetailVisibleCount(bottomOffset);
  const maxDetailScrollOffset = getMaxScrollOffset(detailLines, detailVisibleCount);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : (isReplayMode ? 'No recorded traffic' : 'Waiting for traffic...');

  useEffect(() => {
    setDetailScrollOffset((current) => Math.min(current, maxDetailScrollOffset));
  }, [maxDetailScrollOffset]);

  const clearFilters = () => {
    setMethodFilters([]);
    setStatusFilters([]);
    setSearchField('all');
    setSearchQuery('');
    setFilterFocus('query');
    setMethodOptionIndex(0);
    setStatusOptionIndex(0);
    setIsFollowingLatest(false);
  };

  return h(
    Box,
    {
      flexDirection: 'column',
      height: renderHeight,
      paddingX: ROOT_PADDING_X
    },
    isRawModeSupported
      ? h(KeyboardControls, {
        filterFocus,
        isListFocused,
        isHelpOpen,
        isFilterOpen,
        isReplayMode,
        detailPageSize: detailVisibleCount,
        trafficPageSize: trafficVisibleCount,
        onAppendSearch: (value) => {
          setSearchQuery((current) => `${current}${value}`);
          setIsFollowingLatest(false);
        },
        onBackspaceSearch: () => {
          setSearchQuery((current) => current.slice(0, -1));
          setIsFollowingLatest(false);
        },
        onClearFilters: clearFilters,
        onClearLogs: () => {
          stateStore.clear();
          setSelectedLogId(null);
          setInspectedLogId(null);
          setIsFollowingLatest(false);
          setDetailScrollOffset(0);
        },
        onCloseHelp: () => setIsHelpOpen(false),
        onCycleFilterFocus: (direction) => {
          setFilterFocus((current) => cycleValue(FILTER_FOCUS_ORDER, current, direction));
          setIsFollowingLatest(false);
        },
        onFinishSearch: () => setIsFilterOpen(false),
        onQuit,
        onToggleFocus: () => setIsListFocused((current) => !current),
        onMoveFilterOption: (direction) => {
          if (filterFocus === 'field') {
            setSearchField((current) => cycleValue(SEARCH_FIELDS, current, direction));
          }

          if (filterFocus === 'method') {
            setMethodOptionIndex((current) => (current + direction + METHOD_OPTIONS.length + 1) % (METHOD_OPTIONS.length + 1));
          }

          if (filterFocus === 'status') {
            setStatusOptionIndex((current) => (current + direction + STATUS_OPTIONS.length + 1) % (STATUS_OPTIONS.length + 1));
          }

          setIsFollowingLatest(false);
        },
        onMoveSelection: (direction) => {
          setIsFollowingLatest(false);
          setSelectedLogId((currentId) => moveSelectedLogId(filteredLogs, currentId, direction));
        },
        onMoveSelectionTo: (boundary) => {
          setIsFollowingLatest(false);
          setSelectedLogId(getBoundaryLogId(filteredLogs, boundary));
        },
        onOpenFilter: (focus) => {
          setFilterFocus(focus);
          setIsFilterOpen(true);
          setIsFollowingLatest(false);
        },
        onOpenHelp: () => setIsHelpOpen(true),
        onScrollDetails: (direction) => {
          setDetailScrollOffset((current) => clampScrollOffset(current, direction, maxDetailScrollOffset));
        },
        onScrollDetailsTo: (boundary) => {
          setDetailScrollOffset(boundary === 'bottom' ? maxDetailScrollOffset : 0);
        },
        onStopRecording: () => {
          const result = trafficRecorder?.stopRecording?.();

          Promise.resolve(result)
            .catch(() => {})
            .finally(() => setRecordingStatus(getRecordingStatus(trafficRecorder)));
        },
        onFollowLatest: () => {
          setIsFollowingLatest(true);
          const latestLogId = resolveSelectedLogId(filteredLogs, selectedLogId, { followLatest: true });

          setSelectedLogId(latestLogId);
          setInspectedLogId(latestLogId);
        },
        onInspectSelected: () => {
          setInspectedLogId(selectedLog?.id ?? null);
          setDetailScrollOffset(0);
          if (selectedLog) {
            trafficRecorder?.recordInteraction?.(selectedLog, 'inspect');
          }
          setRecordingStatus(getRecordingStatus(trafficRecorder));
        },
        onToggleFilterOption: () => {
          if (filterFocus === 'field') {
            setSearchField((current) => cycleValue(SEARCH_FIELDS, current));
          }

          if (filterFocus === 'method') {
            const value = ['all', ...METHOD_OPTIONS][methodOptionIndex];
            setMethodFilters((current) => toggleFilterValue(current, value, METHOD_OPTIONS));
          }

          if (filterFocus === 'status') {
            const value = ['all', ...STATUS_OPTIONS][statusOptionIndex];
            setStatusFilters((current) => toggleFilterValue(current, value, STATUS_OPTIONS));
          }

          setIsFollowingLatest(false);
        },
        onToggleDetailTab: () => {
          setDetailTab((current) => cycleValue(DETAIL_TABS, current));
        },
        onTogglePause: () => {
          setIsPaused((current) => {
            const next = !current;
            captureController?.setPaused?.(next);
            return next;
          });
        },
        onToggleRecordingPause: () => {
          trafficRecorder?.togglePaused?.();
          setRecordingStatus(getRecordingStatus(trafficRecorder));
        }
      })
      : null,
    h(Header, {
      context,
      logsCount: logs.length,
      recordingStatus,
      visibleCount: filteredLogs.length,
      isPaused
    }),
    h(
      Box,
      { flexDirection: 'row', flexGrow: 1 },
      isHelpOpen
        ? h(HelpModal)
        : [
          h(TrafficList, {
            key: 'traffic',
            bottomOffset,
            emptyText,
            logs: filteredLogs,
            totalCount: logs.length,
            selectedIndex,
            isFocused: isListFocused,
            isFollowingLatest,
            methodFilters,
            searchField,
            statusFilters,
            searchQuery
          }),
          h(DetailPane, {
            key: 'details',
            bottomOffset,
            log: inspectedLog,
            isFocused: !isListFocused,
            detailTab,
            scrollOffset: detailScrollOffset,
            publicTargetUrl,
            proxyOrigin,
            showCookieValues
          })
        ]
    ),
    isFilterOpen
      ? h(FilterBar, {
        filterFocus,
        logsCount: logs.length,
        methodFilters,
        methodOptionIndex,
        searchField,
        searchQuery,
        statusFilters,
        statusOptionIndex,
        visibleCount: filteredLogs.length
      })
      : h(Footer, {
        isHelpOpen,
        isListFocused,
        isRawModeSupported
      })
  );
}
