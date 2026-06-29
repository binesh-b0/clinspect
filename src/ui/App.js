import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { isCookieHeaderName, maskCookieHeaderValue } from '../cookies.js';
import {
  createManualRequestDraft,
  MANUAL_REQUEST_AUTH_MODES,
  MANUAL_REQUEST_BODY_MODES,
  MANUAL_REQUEST_METHODS,
  isManagedManualRequestHeader,
  normalizeManualRequestDraft
} from '../engine/manual-request.js';
import { getProxyOrigin, isPublicTargetUrl } from '../target.js';
import { isInkMouseInput, parseInkMouseInput } from './mouse.js';

const h = React.createElement;

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_OPTIONS = ['2xx', '3xx', '4xx', '5xx'];
const DETAIL_TABS = ['request', 'response'];
const SEARCH_FIELDS = ['all', 'path', 'status', 'method', 'time', 'host', 'port', 'headers', 'body'];
const FILTER_FOCUS_ORDER = ['query', 'field', 'method', 'status'];
const COMPOSER_TABS = ['params', 'headers', 'body', 'auth', 'cookies', 'env', 'save'];
const COMPOSER_TAB_LABELS = {
  auth: 'Auth',
  body: 'Body',
  cookies: 'Cookies',
  env: 'Env',
  headers: 'Headers',
  params: 'Params',
  save: 'Save'
};
const COMPOSER_TAB_SHORTCUTS = new Map(COMPOSER_TABS.map((tab, index) => [String(index + 1), tab]));
const COMPOSER_RAIL_WIDTH = 22;
const API_KEY_PLACEMENTS = ['header', 'query'];
const MULTIPART_FIELD_TYPES = ['text', 'file'];
const ROOT_PADDING_X = 1;
const TRAFFIC_LIST_WIDTH = 50;
const BODY_LINE_MAX_LENGTH = 120;
const DETAIL_SEARCH_BAR_HEIGHT = 5;
const TEXTUAL_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /(?:^|[+/.-])json$/,
  /(?:^|[+/.-])xml$/,
  /(?:^|[+/.-])javascript$/,
  /(?:^|[+/.-])typescript$/,
  /(?:^|[+/.-])x-www-form-urlencoded$/,
  /(?:^|[+/.-])graphql$/
];
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

function getHeaderValue(headers = {}, key) {
  const normalizedKey = String(key ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([headerKey]) => String(headerKey).toLowerCase() === normalizedKey);

  if (!entry) {
    return '';
  }

  const value = entry[1];

  return Array.isArray(value) ? value.join(', ') : String(value);
}

function getHeaderTokens(headers, key) {
  return getHeaderValue(headers, key)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getContentType(headers = {}) {
  return getHeaderValue(headers, 'content-type')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function hasEncodedBody(headers = {}) {
  const encodings = getHeaderTokens(headers, 'content-encoding');

  return encodings.some((encoding) => encoding !== 'identity');
}

function isTextualContentType(contentType) {
  if (!contentType) {
    return true;
  }

  return TEXTUAL_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function isJsonContentType(contentType) {
  return /(?:^|[+/.-])json$/.test(contentType);
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

function formatHeaderDetailRows(headers, options = {}, idPrefix = 'headers') {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return [createDetailRow({
      id: `${idPrefix}-empty`,
      text: '(none)',
      type: 'header'
    })];
  }

  return entries.flatMap(([key, value], entryIndex) => {
    const displayValue = getDisplayHeaderValue(key, value, options);
    const values = Array.isArray(displayValue) ? displayValue : [displayValue];

    return values.flatMap((item, valueIndex) => {
      const prefix = `${key}: `;
      const safeValue = sanitizeTerminalText(item);
      const path = `headers.${key}`;
      const chunkLength = Math.max(20, BODY_LINE_MAX_LENGTH - prefix.length);
      const chunks = splitLongBodyLine(safeValue, chunkLength);

      return chunks.map((chunk, chunkIndex) => {
        const isContinuation = chunkIndex > 0;
        const continuationPrefix = ' '.repeat(prefix.length);
        const text = isContinuation ? `${continuationPrefix}${chunk}` : `${prefix}${chunk}`;

        return createDetailRow({
          id: `${idPrefix}-header-${entryIndex}-${valueIndex}-${chunkIndex}`,
          path,
          searchText: [text, path].join(' '),
          segments: isContinuation
            ? [
              { text: continuationPrefix, color: 'gray' },
              { text: chunk }
            ]
            : [
              { text: key, color: 'cyan' },
              { text: ': ', color: 'gray' },
              { text: chunk }
            ],
          text,
          type: 'header'
        });
      });
    });
  });
}

function createDetailRow(options = {}) {
  const segments = options.segments ?? [{ text: options.text ?? '' }];
  const text = options.text ?? segments.map((segment) => segment.text).join('');

  return {
    collapsible: false,
    id: options.id ?? `${options.type ?? 'row'}-${text}`,
    matchText: options.matchText ?? text,
    path: options.path ?? null,
    searchText: options.searchText ?? [text, options.path].filter(Boolean).join(' '),
    segments,
    text,
    type: options.type ?? 'body',
    ...options
  };
}

function createPlainDetailRows(lines, options = {}) {
  return lines.map((line, index) => createDetailRow({
    id: `${options.idPrefix ?? options.type ?? 'row'}-${index}`,
    path: options.path ?? null,
    text: line,
    type: options.type ?? 'body'
  }));
}

function sanitizeTerminalText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '\uFFFD');
}

function splitLongBodyLine(line, maxLength = BODY_LINE_MAX_LENGTH) {
  if (line.length <= maxLength) {
    return [line];
  }

  const chunks = [];

  for (let index = 0; index < line.length; index += maxLength) {
    chunks.push(line.slice(index, index + maxLength));
  }

  return chunks;
}

function splitBodyLines(value) {
  return sanitizeTerminalText(value)
    .split('\n')
    .flatMap((line) => splitLongBodyLine(line));
}

function jsonPathToString(pathParts = []) {
  if (pathParts.length === 0) {
    return '$';
  }

  return pathParts.reduce((path, part) => {
    if (typeof part === 'number') {
      return `${path}[${part}]`;
    }

    if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      return path ? `${path}.${part}` : part;
    }

    return `${path}${path ? '' : '$'}[${JSON.stringify(part)}]`;
  }, '');
}

function jsonNodeSummary(value) {
  if (Array.isArray(value)) {
    return `[...] ${value.length} items`;
  }

  if (value && typeof value === 'object') {
    return `{...} ${Object.keys(value).length} keys`;
  }

  return '';
}

function jsonContainerOpen(value) {
  return Array.isArray(value) ? '[' : '{';
}

function jsonContainerClose(value) {
  return Array.isArray(value) ? ']' : '}';
}

function jsonValueType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function jsonValueText(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function jsonValueColor(value) {
  const type = jsonValueType(value);

  if (type === 'string') {
    return 'green';
  }

  if (type === 'number') {
    return 'yellow';
  }

  if (type === 'boolean') {
    return 'magenta';
  }

  if (type === 'null') {
    return 'gray';
  }

  return undefined;
}

function jsonLabelText(label, path) {
  if (path === '$') {
    return '$';
  }

  if (typeof label === 'number') {
    return `[${label}]`;
  }

  return String(label);
}

function formatJsonRows(value, options = {}, pathParts = [], label = null, depth = 0) {
  const rows = [];
  const path = jsonPathToString(pathParts);
  const indent = '  '.repeat(depth);
  const collapsedPaths = new Set(options.collapsedPaths ?? []);
  const isContainer = value && typeof value === 'object';
  const labelText = jsonLabelText(label, path);
  const prefix = path === '$' ? '' : `${labelText}: `;

  if (!isContainer) {
    const valueText = jsonValueText(value);

    rows.push(createDetailRow({
      id: `json-${path}`,
      matchText: `${prefix}${valueText}`,
      path,
      segments: [
        { text: indent },
        ...(path === '$' ? [] : [{ text: labelText, color: 'cyan' }, { text: ': ', color: 'gray' }]),
        { text: valueText, color: jsonValueColor(value) }
      ],
      type: `json-${jsonValueType(value)}`
    }));

    return rows;
  }

  const collapsed = collapsedPaths.has(path);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  const opener = jsonContainerOpen(value);
  const closer = jsonContainerClose(value);
  const summary = collapsed ? jsonNodeSummary(value) : `${opener} ${entries.length} ${Array.isArray(value) ? 'items' : 'keys'}`;

  rows.push(createDetailRow({
    collapsible: true,
    collapsed,
    id: `json-${path}`,
    matchText: `${prefix}${summary}`,
    path,
    segments: [
      { text: indent },
      { text: collapsed ? '> ' : 'v ', color: 'gray' },
      ...(path === '$'
        ? [{ text: '$', color: 'cyan' }, { text: ' ', color: 'gray' }]
        : [{ text: labelText, color: 'cyan' }, { text: ': ', color: 'gray' }]),
      { text: summary, color: collapsed ? 'gray' : undefined }
    ],
    type: Array.isArray(value) ? 'json-array' : 'json-object'
  }));

  if (collapsed) {
    return rows;
  }

  entries.forEach(([key, child]) => {
    rows.push(...formatJsonRows(
      child,
      options,
      [...pathParts, key],
      key,
      depth + 1
    ));
  });

  rows.push(createDetailRow({
    id: `json-${path}-close`,
    matchText: closer,
    path,
    segments: [
      { text: indent },
      { text: closer, color: 'gray' }
    ],
    type: 'json-punctuation'
  }));

  return rows;
}

function appendTruncationRow(rows, payload = {}) {
  if (!payload.truncated) {
    return rows;
  }

  return [
    ...rows,
    createDetailRow({
      id: 'body-truncated',
      segments: [{ text: '[body truncated]', color: 'yellow' }],
      type: 'warning'
    })
  ];
}

export function formatStructuredPayloadRows(payload = {}, options = {}) {
  const body = String(payload.body || '');
  const contentType = getContentType(payload.headers);
  let lines;

  if (body.length === 0) {
    lines = ['(empty)'];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-empty', type: 'body-empty' }), payload);
  } else if (hasEncodedBody(payload.headers)) {
    const encoding = getHeaderTokens(payload.headers, 'content-encoding').join(', ');
    lines = [`(compressed body not shown: ${encoding})`];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-compressed', type: 'warning' }), payload);
  } else if (!isTextualContentType(contentType)) {
    lines = [`(binary body omitted: ${contentType})`];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-binary', type: 'warning' }), payload);
  } else if (isJsonContentType(contentType)) {
    try {
      return appendTruncationRow(formatJsonRows(JSON.parse(body), options), payload);
    } catch {
      lines = splitBodyLines(body);
      return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-text', type: 'body' }), payload);
    }
  }

  lines = splitBodyLines(body);

  return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-text', type: 'body' }), payload);
}

function formatPayloadBody(payload = {}, options = {}) {
  return formatStructuredPayloadRows(payload, options).map((row) => row.text);
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

export function getDetailRows(log, detailTab = 'request', options = {}) {
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
    createDetailRow({
      id: `${detailTab}-headers-title`,
      segments: [{ text: `${title} headers`, color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...formatHeaderDetailRows(payload.headers, headerOptions, detailTab),
    createDetailRow({ id: `${detailTab}-spacer`, text: '', type: 'blank' }),
    createDetailRow({
      id: `${detailTab}-body-title`,
      segments: [{ text: `${title} body`, color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...formatStructuredPayloadRows(payload, options)
  ];
}

export function getDetailLines(log, detailTab = 'request', options = {}) {
  return getDetailRows(log, detailTab, options).map((row) => row.text);
}

export function parseDetailSearchQuery(query = '') {
  const value = String(query ?? '').trim();

  if (!value) {
    return {
      kind: 'empty',
      pattern: '',
      regex: null
    };
  }

  const regexMatch = value.match(/^\/(.+)\/([a-z]*)$/i);

  if (regexMatch) {
    try {
      return {
        kind: 'regex',
        pattern: regexMatch[1],
        regex: new RegExp(regexMatch[1], regexMatch[2].includes('i') ? 'i' : '')
      };
    } catch {
      return {
        kind: 'invalid',
        pattern: value,
        regex: null
      };
    }
  }

  return {
    kind: 'text',
    pattern: value.toLowerCase(),
    regex: null
  };
}

function getDetailRowSearchText(row = {}) {
  return [
    row.searchText,
    row.path,
    row.matchText,
    row.text
  ].filter(Boolean).join(' ');
}

export function findDetailMatches(rows = [], query = '') {
  const parsed = typeof query === 'string' ? parseDetailSearchQuery(query) : query;

  if (parsed.kind === 'empty' || parsed.kind === 'invalid') {
    return [];
  }

  return rows.reduce((matches, row, index) => {
    const searchText = getDetailRowSearchText(row);
    const matched = parsed.kind === 'regex'
      ? parsed.regex.test(searchText)
      : searchText.toLowerCase().includes(parsed.pattern);

    if (matched) {
      matches.push(index);
    }

    return matches;
  }, []);
}

export function getNextDetailMatchIndex(matches = [], currentIndex = 0, direction = 1) {
  if (matches.length === 0) {
    return 0;
  }

  const current = Number.isInteger(currentIndex) ? currentIndex : 0;

  return (current + direction + matches.length) % matches.length;
}

export function applyDetailMatches(rows = [], matches = [], activeMatchIndex = 0) {
  const matchSet = new Set(matches);
  const activeRowIndex = matches[activeMatchIndex] ?? -1;

  return rows.map((row, index) => ({
    ...row,
    isActiveMatch: index === activeRowIndex,
    isMatched: matchSet.has(index)
  }));
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

export function getDetailModalVisibleCount(bottomOffset = 10, terminalRows = process.stdout.rows) {
  return Math.max(8, getTerminalRows(terminalRows) - bottomOffset);
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

export function clampDetailRowIndex(rowIndex, rows) {
  const maxIndex = Math.max(0, rows.length - 1);
  const value = Number.isFinite(Number(rowIndex)) ? Number(rowIndex) : 0;

  return Math.min(maxIndex, Math.max(0, value));
}

export function getScrollOffsetForFocusedRow(focusedRow, currentOffset, visibleCount, maxScrollOffset) {
  const focus = Number.isFinite(Number(focusedRow)) ? Number(focusedRow) : 0;
  const current = Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0;
  const visible = Math.max(1, Number(visibleCount) || 1);
  const max = Math.max(0, Number(maxScrollOffset) || 0);

  if (focus < current) {
    return Math.max(0, focus);
  }

  if (focus >= current + visible) {
    return Math.min(max, focus - visible + 1);
  }

  return Math.min(max, Math.max(0, current));
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

function renderDetailRow(row, key) {
  if (row.isActiveMatch || row.isFocused) {
    return h(
      Text,
      {
        key,
        backgroundColor: row.isActiveMatch ? 'yellow' : 'cyan',
        color: 'black',
        bold: row.isActiveMatch || row.isFocused,
        wrap: 'truncate'
      },
      row.text
    );
  }

  if (row.isMatched) {
    return h(
      Text,
      {
        key,
        color: 'yellow',
        bold: true,
        wrap: 'truncate'
      },
      row.text
    );
  }

  return h(
    Text,
    {
      key,
      bold: row.type === 'section',
      wrap: 'truncate'
    },
    ...(row.segments ?? [{ text: row.text }]).map((segment, index) => h(
      Text,
      {
        key: `${key}-${index}`,
        color: segment.color,
        bold: segment.bold
      },
      segment.text
    ))
  );
}

const DetailViewport = React.memo(function DetailViewport({
  rows,
  scrollOffset,
  visibleCount,
  focusedRow,
  title,
  subtitle,
  borderColor,
  flexGrow = 1
}) {
  const maxScrollOffset = getMaxScrollOffset(rows, visibleCount);
  const safeScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleRows = rows
    .slice(safeScrollOffset, safeScrollOffset + visibleCount)
    .map((row, index) => ({
      ...row,
      isFocused: safeScrollOffset + index === focusedRow
    }));
  const scrollLabel = maxScrollOffset === 0
    ? 'top'
    : `${safeScrollOffset + 1}-${Math.min(rows.length, safeScrollOffset + visibleCount)}/${rows.length}`;

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow,
      borderStyle: 'single',
      borderColor,
      paddingX: 1
    },
    h(Text, { bold: true, wrap: 'truncate' }, title),
    h(Text, { color: 'gray', wrap: 'truncate' }, `${subtitle} | scroll ${scrollLabel}`),
    ...visibleRows.map((row, index) => renderDetailRow(row, `${row.id}-${safeScrollOffset + index}`))
  );
});

const DetailPane = React.memo(function DetailPane({
  bottomOffset,
  log,
  isFocused,
  detailTab,
  rows,
  focusedRow,
  scrollOffset,
  matchCount = 0,
  activeMatchIndex = 0
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
  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const summary = `${log.method} ${log.path} | ${timing}`;
  const tabLabel = `${detailTab === 'request' ? '[Request]' : ' Request '} ${detailTab === 'response' ? '[Response]' : ' Response '}`;
  const matchLabel = matchCount > 0 ? ` | match ${activeMatchIndex + 1}/${matchCount}` : '';

  return h(DetailViewport, {
    borderColor: isFocused ? 'cyan' : 'gray',
    focusedRow,
    rows,
    scrollOffset,
    title: summary,
    subtitle: `${tabLabel}${matchLabel}`,
    visibleCount
  });
});

const DetailModal = React.memo(function DetailModal({
  log,
  detailTab,
  rows,
  focusedRow,
  scrollOffset,
  visibleCount,
  matchCount,
  activeMatchIndex
}) {
  if (!log) {
    return h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1
      },
      h(Text, { color: 'gray' }, 'No request inspected')
    );
  }

  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const title = `Details ${detailTab} | ${log.method} ${log.path} | ${timing}`;
  const matchLabel = matchCount > 0 ? ` | match ${activeMatchIndex + 1}/${matchCount}` : '';
  const subtitle = 'esc/q close | r req/res | / find | n/N next/prev | enter collapse';

  return h(DetailViewport, {
    borderColor: 'cyan',
    focusedRow,
    rows,
    scrollOffset,
    title,
    subtitle: `${subtitle}${matchLabel}`,
    visibleCount,
    flexGrow: 1
  });
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

function createComposerTableRow(values = {}) {
  return {
    enabled: values.enabled !== false,
    key: String(values.key ?? ''),
    value: String(values.value ?? ''),
    secret: Boolean(values.secret),
    type: values.type === 'file' ? 'file' : 'text',
    filePath: String(values.filePath ?? '')
  };
}

function createComposerDraft(overrides = {}) {
  return createManualRequestDraft({
    collection: 'Default',
    url: '/',
    ...overrides
  });
}

export function createBlankComposerState(options = {}) {
  const draft = createComposerDraft({
    environment: options.environment ?? []
  });
  const composer = {
    activeTab: 'params',
    cursor: draft.url.length,
    draft,
    error: '',
    focusIndex: 1,
    isBodyEditorOpen: false,
    isConfirmOpen: false,
    isLibraryOpen: false,
    isOpen: true,
    isSending: false,
    libraryIndex: 0,
    revealSecrets: false,
    source: 'new'
  };

  return ensureComposerActiveTabRows(composer);
}

function parseCookieRows(cookieValue = '') {
  return String(cookieValue)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');

      return createComposerTableRow({
        key: separatorIndex === -1 ? part : part.slice(0, separatorIndex).trim(),
        value: separatorIndex === -1 ? '' : part.slice(separatorIndex + 1).trim(),
        secret: true
      });
    });
}

export function createComposerStateFromLog(log, options = {}) {
  const includeCookieHeaders = Boolean(options.includeCookieHeaders);
  const headers = [];
  const cookies = [];
  const url = String(log?.path || '/');

  for (const [name, value] of Object.entries(log?.request?.headers ?? {})) {
    if (isManagedManualRequestHeader(name)) {
      continue;
    }

    if (isCookieHeaderName(name)) {
      if (includeCookieHeaders) {
        cookies.push(...parseCookieRows(value));
      }

      continue;
    }

    headers.push(createComposerTableRow({
      key: name,
      value
    }));
  }

  return ensureComposerActiveTabRows({
    ...createBlankComposerState({
      environment: options.environment ?? []
    }),
    cursor: url.length,
    draft: createComposerDraft({
      body: {
        mode: String(log?.request?.body ?? '').length > 0 ? 'raw' : 'none',
        raw: String(log?.request?.body ?? ''),
        json: String(log?.request?.body ?? '')
      },
      cookies,
      environment: options.environment ?? [],
      headers,
      method: MANUAL_REQUEST_METHODS.includes(log?.method) ? log.method : 'GET',
      name: `${log?.method ?? 'GET'} ${url}`,
      url
    }),
    source: 'clone'
  });
}

function flattenRequestLibrary(library = {}) {
  return (library.requests ?? [])
    .slice()
    .sort((left, right) => {
      const collectionCompare = String(left.collection ?? 'Default').localeCompare(String(right.collection ?? 'Default'));

      if (collectionCompare !== 0) {
        return collectionCompare;
      }

      return String(left.name || left.url).localeCompare(String(right.name || right.url));
    });
}

function maskSecretValue(value, revealSecrets) {
  const text = String(value ?? '');

  if (revealSecrets || text.length === 0) {
    return text;
  }

  return '<secret>';
}

function getPathValue(source, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], source);
}

function setPathValue(source, pathParts, value) {
  const [key, ...rest] = pathParts;

  if (key === undefined) {
    return value;
  }

  if (Array.isArray(source)) {
    return source.map((item, index) => (
      index === Number(key) ? setPathValue(item, rest, value) : item
    ));
  }

  return {
    ...source,
    [key]: setPathValue(source?.[key], rest, value)
  };
}

function getComposerRowDescriptors(rows, table, revealSecrets, options = {}) {
  return rows.flatMap((row, index) => {
    const descriptors = [
      {
        kind: 'toggle',
        label: 'on',
        path: [table, index, 'enabled'],
        rowIndex: index,
        table
      }
    ];

    if (options.includeType) {
      descriptors.push({
        kind: 'option',
        label: 'type',
        options: MULTIPART_FIELD_TYPES,
        path: [table, index, 'type'],
        rowIndex: index,
        table
      });
    }

    descriptors.push(
      {
        kind: 'text',
        label: 'key',
        path: [table, index, 'key'],
        rowIndex: index,
        table
      },
      {
        kind: 'text',
        label: row.type === 'file' ? 'file' : 'value',
        path: [table, index, row.type === 'file' ? 'filePath' : 'value'],
        rowIndex: index,
        secret: options.secretValues || row.secret,
        table
      }
    );

    if (options.includeSecret) {
      descriptors.push({
        kind: 'toggle',
        label: 'secret',
        path: [table, index, 'secret'],
        rowIndex: index,
        table
      });
    }

    return descriptors.map((descriptor) => ({
      ...descriptor,
      revealSecrets
    }));
  });
}

export function getComposerFieldDescriptors(composer) {
  const draft = composer.draft;
  const descriptors = [
    {
      kind: 'option',
      label: 'method',
      options: MANUAL_REQUEST_METHODS,
      path: ['method']
    },
    {
      kind: 'text',
      label: 'url',
      path: ['url']
    }
  ];

  if (composer.activeTab === 'params') {
    descriptors.push(...getComposerRowDescriptors(draft.params, 'params', composer.revealSecrets));
  }

  if (composer.activeTab === 'headers') {
    descriptors.push(...getComposerRowDescriptors(draft.headers, 'headers', composer.revealSecrets));
  }

  if (composer.activeTab === 'cookies') {
    descriptors.push(...getComposerRowDescriptors(draft.cookies, 'cookies', composer.revealSecrets, { secretValues: true }));
  }

  if (composer.activeTab === 'env') {
    descriptors.push(...getComposerRowDescriptors(draft.environment, 'environment', composer.revealSecrets, { includeSecret: true }));
  }

  if (composer.activeTab === 'body') {
    descriptors.push({
      kind: 'option',
      label: 'body mode',
      options: MANUAL_REQUEST_BODY_MODES,
      path: ['body', 'mode']
    });

    if (draft.body.mode === 'raw') {
      descriptors.push({
        kind: 'text',
        label: 'raw body',
        multiline: true,
        path: ['body', 'raw']
      });
    }

    if (draft.body.mode === 'json') {
      descriptors.push({
        kind: 'text',
        label: 'json body',
        multiline: true,
        path: ['body', 'json']
      });
    }

    if (draft.body.mode === 'form-urlencoded') {
      descriptors.push(...getComposerRowDescriptors(draft.formFields, 'formFields', composer.revealSecrets));
    }

    if (draft.body.mode === 'multipart') {
      descriptors.push(...getComposerRowDescriptors(draft.multipartFields, 'multipartFields', composer.revealSecrets, { includeType: true }));
    }
  }

  if (composer.activeTab === 'auth') {
    descriptors.push({
      kind: 'option',
      label: 'auth mode',
      options: MANUAL_REQUEST_AUTH_MODES,
      path: ['auth', 'mode']
    });

    if (draft.auth.mode === 'bearer') {
      descriptors.push({
        kind: 'text',
        label: 'token',
        path: ['auth', 'bearerToken'],
        secret: true
      });
    }

    if (draft.auth.mode === 'basic') {
      descriptors.push(
        {
          kind: 'text',
          label: 'username',
          path: ['auth', 'username']
        },
        {
          kind: 'text',
          label: 'password',
          path: ['auth', 'password'],
          secret: true
        }
      );
    }

    if (draft.auth.mode === 'apiKey') {
      descriptors.push(
        {
          kind: 'text',
          label: 'key',
          path: ['auth', 'apiKey', 'key']
        },
        {
          kind: 'text',
          label: 'value',
          path: ['auth', 'apiKey', 'value'],
          secret: true
        },
        {
          kind: 'option',
          label: 'add to',
          options: API_KEY_PLACEMENTS,
          path: ['auth', 'apiKey', 'placement']
        }
      );
    }
  }

  if (composer.activeTab === 'save') {
    descriptors.push(
      {
        kind: 'text',
        label: 'name',
        path: ['name']
      },
      {
        kind: 'text',
        label: 'collection',
        path: ['collection']
      }
    );
  }

  return descriptors;
}

function getComposerTableForTab(composer, tab = composer.activeTab) {
  if (tab === 'params') {
    return 'params';
  }

  if (tab === 'headers') {
    return 'headers';
  }

  if (tab === 'cookies') {
    return 'cookies';
  }

  if (tab === 'env') {
    return 'environment';
  }

  if (tab === 'body' && composer.draft.body.mode === 'form-urlencoded') {
    return 'formFields';
  }

  if (tab === 'body' && composer.draft.body.mode === 'multipart') {
    return 'multipartFields';
  }

  return null;
}

function createComposerRowForTable(table) {
  return createComposerTableRow({
    type: table === 'multipartFields' ? 'text' : undefined,
    secret: table === 'cookies'
  });
}

export function ensureComposerActiveTabRows(composer) {
  const table = getComposerTableForTab(composer);

  if (!table) {
    return composer;
  }

  const rows = getPathValue(composer.draft, [table]) ?? [];

  if (rows.length > 0) {
    return composer;
  }

  return {
    ...composer,
    draft: setPathValue(composer.draft, [table], [createComposerRowForTable(table)])
  };
}

function getDefaultComposerFocusIndex(composer) {
  const descriptors = getComposerFieldDescriptors(composer);
  const sectionDescriptors = descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .slice(2);
  const preferred = sectionDescriptors.find(({ descriptor }) => descriptor.kind === 'text') ?? sectionDescriptors[0];

  return preferred?.index ?? Math.min(1, Math.max(0, descriptors.length - 1));
}

function getComposerCursorForFocus(composer, focusIndex) {
  const descriptor = getComposerFieldDescriptors(composer)[focusIndex];

  if (descriptor?.kind !== 'text') {
    return 0;
  }

  return String(getPathValue(composer.draft, descriptor.path) ?? '').length;
}

function getComposerTabFromShortcut(value) {
  return COMPOSER_TAB_SHORTCUTS.get(String(value ?? '')) ?? null;
}

function resolveComposerTab(tabOrIndex) {
  if (typeof tabOrIndex === 'number') {
    return COMPOSER_TABS[tabOrIndex - 1] ?? null;
  }

  const shortcutTab = getComposerTabFromShortcut(tabOrIndex);

  if (shortcutTab) {
    return shortcutTab;
  }

  return COMPOSER_TABS.includes(tabOrIndex) ? tabOrIndex : null;
}

export function selectComposerTab(composer, tabOrIndex) {
  const activeTab = resolveComposerTab(tabOrIndex);

  if (!activeTab) {
    return composer;
  }

  const withTab = ensureComposerActiveTabRows({
    ...composer,
    activeTab,
    isBodyEditorOpen: false,
    isConfirmOpen: false,
    isLibraryOpen: false
  });
  const focusIndex = getDefaultComposerFocusIndex(withTab);

  return {
    ...withTab,
    cursor: getComposerCursorForFocus(withTab, focusIndex),
    focusIndex
  };
}

function getFocusedComposerDescriptor(composer) {
  const descriptors = getComposerFieldDescriptors(composer);
  const index = Math.max(0, Math.min(descriptors.length - 1, composer.focusIndex));

  return descriptors[index] ?? descriptors[0] ?? null;
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

const DetailSearchBar = React.memo(function DetailSearchBar({
  activeMatchIndex,
  matchCount,
  query
}) {
  const displayQuery = query.length > 0 ? query : '(empty)';
  const parsed = parseDetailSearchQuery(query);
  const mode = parsed.kind === 'regex'
    ? 'regex'
    : (parsed.kind === 'invalid' ? 'invalid regex' : 'text/path');
  const matchLabel = query.trim().length === 0
    ? 'no query'
    : `${matchCount} matches${matchCount > 0 ? ` | active ${activeMatchIndex + 1}` : ''}`;

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: parsed.kind === 'invalid' ? 'yellow' : 'cyan',
      paddingX: 1,
      marginTop: 1
    },
    h(Text, { color: parsed.kind === 'invalid' ? 'yellow' : 'cyan', bold: true }, `Detail search | ${mode} | ${matchLabel}`),
    h(Text, { wrap: 'truncate' }, `query ${displayQuery}_`),
    h(Text, { color: 'gray', wrap: 'truncate' }, 'type text/path or /regex/ | backspace edit | enter/esc close, then n/N next/prev')
  );
});

function getComposerDisplayValue(value, descriptor, composer, isFocused) {
  if (descriptor?.kind === 'toggle') {
    return value ? 'on' : 'off';
  }

  if (descriptor?.kind === 'option') {
    return descriptor.options
      .map((option) => formatOptionToken(option, {
        cursor: option === value,
        selected: option === value
      }))
      .join(' ');
  }

  const text = descriptor?.secret
    ? maskSecretValue(value, composer.revealSecrets)
    : String(value ?? '');
  const displayText = text.length > 0 ? text : '(empty)';

  return `${truncate(displayText.replace(/\n/g, '\\n'), 90)}${isFocused ? '_' : ''}`;
}

function getEnabledComposerRows(rows = []) {
  return rows.filter((row) => row.enabled !== false && String(row.key ?? '').trim());
}

function formatComposerPreviewRows(rows = [], options = {}) {
  const enabledRows = getEnabledComposerRows(rows);
  const emptyText = options.emptyText ?? '(none)';

  if (enabledRows.length === 0) {
    return [emptyText];
  }

  return enabledRows.slice(0, 6).map((row) => {
    const value = row.type === 'file' ? row.filePath : row.value;
    const displayValue = options.secretValues || row.secret
      ? maskSecretValue(value, options.revealSecrets)
      : value;

    return `${row.key}: ${displayValue}`;
  });
}

function getComposerPreviewBodySummary(draft) {
  const mode = draft.body?.mode ?? 'none';

  if (mode === 'none') {
    return 'none';
  }

  if (mode === 'raw') {
    return `raw ${draft.body.raw.length} chars`;
  }

  if (mode === 'json') {
    return `json ${draft.body.json.length} chars`;
  }

  if (mode === 'form-urlencoded') {
    return `form-urlencoded ${getEnabledComposerRows(draft.formFields).length} fields`;
  }

  if (mode === 'multipart') {
    return `multipart ${getEnabledComposerRows(draft.multipartFields).length} fields`;
  }

  return mode;
}

function getComposerPreviewAuthSummary(auth = {}) {
  if (auth.mode === 'apiKey') {
    return `api key in ${auth.apiKey?.placement ?? 'header'}`;
  }

  return auth.mode ?? 'none';
}

function renderComposerPreview(composer) {
  const draft = composer.draft;
  const params = formatComposerPreviewRows(draft.params, { revealSecrets: composer.revealSecrets });
  const headers = formatComposerPreviewRows(draft.headers, { revealSecrets: composer.revealSecrets });
  const cookies = formatComposerPreviewRows(draft.cookies, {
    revealSecrets: composer.revealSecrets,
    secretValues: true
  });

  return [
    h(Text, { key: 'preview-title', color: 'cyan', bold: true }, 'Preview request'),
    h(Text, { key: 'preview-request', wrap: 'truncate' }, `${draft.method} ${draft.url || '/'}`),
    h(Text, { key: 'preview-auth', wrap: 'truncate' }, `auth ${getComposerPreviewAuthSummary(draft.auth)} | body ${getComposerPreviewBodySummary(draft)}`),
    h(Text, { key: 'preview-space-1' }, ''),
    h(Text, { key: 'preview-params-title', color: 'gray' }, 'Params'),
    ...params.map((row, index) => h(Text, { key: `preview-param-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-headers-title', color: 'gray' }, 'Headers'),
    ...headers.map((row, index) => h(Text, { key: `preview-header-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-cookies-title', color: 'gray' }, 'Cookies'),
    ...cookies.map((row, index) => h(Text, { key: `preview-cookie-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-space-2' }, ''),
    h(Text, { key: 'preview-confirm', color: 'yellow', bold: true }, 'Send this request?'),
    h(Text, { key: 'preview-help', color: 'gray' }, 'enter/y send | esc/n edit')
  ];
}

function renderComposerDescriptor(composer, descriptor, index) {
  const value = getPathValue(composer.draft, descriptor.path);
  const isFocused = index === composer.focusIndex;

  return h(
    Box,
    { key: `${descriptor.path.join('.')}-${index}` },
    h(Text, { color: isFocused ? 'cyan' : 'gray' }, isFocused ? '>' : ' '),
    h(Text, { color: isFocused ? 'cyan' : 'gray' }, ` ${pad(descriptor.label, 12)}`),
    h(Text, { wrap: 'truncate' }, getComposerDisplayValue(value, descriptor, composer, isFocused))
  );
}

function renderComposerTableEmpty(activeTab) {
  return h(Text, { color: 'gray' }, `${COMPOSER_TAB_LABELS[activeTab]} has no rows.`);
}

function renderComposerTabBody(composer) {
  if (composer.isBodyEditorOpen) {
    const descriptor = getFocusedComposerDescriptor(composer);
    const value = descriptor?.kind === 'text'
      ? String(getPathValue(composer.draft, descriptor.path) ?? '')
      : '';
    const lines = value.length > 0 ? value.split('\n') : [''];

    return [
      h(Text, { key: 'editor-title', color: 'cyan', bold: true }, 'Body editor'),
      ...lines.slice(0, 14).map((line, index) => h(
        Text,
        { key: `editor-${index}`, wrap: 'truncate' },
        `${padLeft(index + 1, 3)} ${line}${index === lines.length - 1 ? '_' : ''}`
      )),
      h(Text, { key: 'editor-help', color: 'gray' }, 'enter newline | esc back to Body tab | Ctrl-C quit')
    ];
  }

  const descriptors = getComposerFieldDescriptors(composer);
  const tabDescriptors = descriptors.slice(2);

  if (tabDescriptors.length === 0) {
    return [renderComposerTableEmpty(composer.activeTab)];
  }

  return tabDescriptors.map((descriptor, index) => renderComposerDescriptor(composer, descriptor, index + 2));
}

function renderComposerLibrary(composer, library) {
  const requests = flattenRequestLibrary(library);
  const selectedIndex = Math.max(0, Math.min(requests.length - 1, composer.libraryIndex));

  return [
    h(Text, { key: 'library-title', color: 'cyan', bold: true }, 'Saved requests'),
    library.warning ? h(Text, { key: 'library-warning', color: 'yellow', wrap: 'truncate' }, library.warning) : null,
    requests.length === 0
      ? h(Text, { key: 'library-empty', color: 'gray' }, 'No saved requests. Compose a request and press s to save it.')
      : requests.slice(0, 18).map((request, index) => {
        const selected = index === selectedIndex;

        return h(
          Text,
          {
            key: request.id,
            backgroundColor: selected ? 'cyan' : undefined,
            color: selected ? 'black' : undefined,
            wrap: 'truncate'
          },
          `${selected ? '>' : ' '} ${pad(request.collection ?? 'Default', 14)} ${pad(request.method, 7)} ${request.name || request.url}`
        );
      }),
    h(Text, { key: 'library-help', color: 'gray' }, 'j/k move | enter open | esc/l close')
  ].filter(Boolean);
}

function getComposerTabShortcut(tab) {
  const index = COMPOSER_TABS.indexOf(tab);

  return index === -1 ? '' : String(index + 1);
}

function formatComposerAuthSummary(auth = {}) {
  return auth.mode === 'apiKey' ? 'api key' : (auth.mode ?? 'none');
}

function getComposerTabSummary(composer, tab) {
  const draft = composer.draft;

  if (tab === 'params') {
    return String(draft.params.length);
  }

  if (tab === 'headers') {
    return String(draft.headers.length);
  }

  if (tab === 'body') {
    return draft.body.mode;
  }

  if (tab === 'auth') {
    return formatComposerAuthSummary(draft.auth);
  }

  if (tab === 'cookies') {
    return String(draft.cookies.length);
  }

  if (tab === 'env') {
    return String(draft.environment.length);
  }

  return draft.collection || 'Default';
}

export function getComposerSectionRows(composer, library = {}) {
  return [
    ...COMPOSER_TABS.map((tab) => ({
      active: !composer.isLibraryOpen && tab === composer.activeTab,
      key: getComposerTabShortcut(tab),
      label: COMPOSER_TAB_LABELS[tab],
      summary: getComposerTabSummary(composer, tab),
      tab
    })),
    {
      active: Boolean(composer.isLibraryOpen),
      key: 'l',
      label: 'Library',
      summary: String(flattenRequestLibrary(library).length),
      tab: 'library'
    }
  ];
}

function renderComposerSectionRail(composer, library) {
  return h(
    Box,
    {
      flexDirection: 'column',
      flexShrink: 0,
      marginRight: 2,
      width: COMPOSER_RAIL_WIDTH
    },
    h(Text, { color: 'cyan', bold: true }, 'Sections'),
    h(Text, { color: 'gray' }, '1-7 jump'),
    h(Text, {}, ''),
    ...getComposerSectionRows(composer, library).map((item) => {
      const text = `${item.active ? '>' : ' '} ${pad(item.key, 2)} ${pad(item.label, 8)} ${truncate(item.summary, 8)}`;

      return h(
        Text,
        {
          key: item.tab,
          backgroundColor: item.active ? 'cyan' : undefined,
          color: item.active ? 'black' : (item.key === 'l' ? 'gray' : undefined),
          wrap: 'truncate'
        },
        text
      );
    })
  );
}

const RequestComposerPanel = React.memo(function RequestComposerPanel({
  composer,
  library,
  targetUrl
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(72, columns - 4);
  const title = composer.source === 'clone' ? 'Clone request' : 'New request';
  const statusText = composer.isSending
    ? 'sending...'
    : (composer.error || 'ready');
  const statusColor = composer.error ? 'yellow' : (composer.isSending ? 'cyan' : 'gray');
  const descriptors = getComposerFieldDescriptors(composer);
  const sectionTitle = composer.isLibraryOpen
    ? 'Library'
    : `${getComposerTabShortcut(composer.activeTab)} ${COMPOSER_TAB_LABELS[composer.activeTab]}`;
  const isTextFocused = getFocusedComposerDescriptor(composer)?.kind === 'text';
  const helpText = composer.isConfirmOpen
    ? 'preview | enter/y send | esc/n edit'
    : (isTextFocused
      ? 'typing | backspace delete | tab next | enter preview | esc close | 1-7 sections'
      : '1-7 sections | [/] section | tab fields | enter preview | a add | d delete | s save | l library | R reveal | esc close');

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1
    },
    h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: composer.error ? 'yellow' : 'cyan',
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(Text, { color: composer.error ? 'yellow' : 'cyan', bold: true }, title),
      h(Text, { color: 'gray', wrap: 'truncate' }, `target ${targetUrl ?? '(not configured)'}`),
      h(Text, {}, ''),
      h(
        Box,
        { flexDirection: 'row', flexGrow: 1 },
        renderComposerSectionRail(composer, library),
        h(
          Box,
          { flexDirection: 'column', flexGrow: 1 },
          composer.isLibraryOpen
            ? renderComposerLibrary(composer, library)
            : (composer.isConfirmOpen
              ? renderComposerPreview(composer)
              : [
              h(Text, { key: 'request-line', color: 'gray' }, 'Request'),
              renderComposerDescriptor(composer, descriptors[0], 0),
              renderComposerDescriptor(composer, descriptors[1], 1),
              h(Text, { key: 'tabs-space' }, ''),
              h(Text, { key: 'section-title', color: 'cyan', bold: true }, sectionTitle),
              ...renderComposerTabBody(composer)
            ])
        )
      ),
      h(Text, {}, ''),
      h(Text, { color: statusColor, wrap: 'truncate' }, statusText),
      h(Text, { color: 'gray', wrap: 'truncate' }, helpText)
    )
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
      ['o', 'open details modal'],
      ['/', 'find in details'],
      ['n / N', 'next / previous match'],
      ['wheel', 'scroll hovered pane']
    ]
  },
  {
    title: 'Compose',
    rows: [
      ['n', 'new request'],
      ['e', 'clone request'],
      ['l', 'saved requests'],
      ['1 params', 'open params'],
      ['3 body', 'open body'],
      ['4 auth', 'open auth'],
      ['[ / ]', 'previous / next section'],
      ['a/d', 'add / delete row'],
      ['space', 'enable / disable row'],
      ['R', 'reveal / mask secrets'],
      ['enter', 'preview request'],
      ['enter/y', 'confirm send'],
      ['esc', 'close composer']
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
  isComposerConfirmOpen = false,
  isComposerOpen = false,
  isComposerTextFocused = false,
  isDetailModalOpen = false,
  isDetailSearchActive = false,
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

  if (isComposerOpen) {
    if (isComposerConfirmOpen) {
      return 'preview  enter/y send  esc/n edit';
    }

    return isComposerTextFocused
      ? 'typing  backspace delete  tab next  enter preview  esc close  1-7 sections'
      : 'composer  1-7 sections  tab fields  enter preview  a add  d delete  s save  l library  R reveal  esc close';
  }

  if (isDetailSearchActive && !isListFocused) {
    return isDetailModalOpen
      ? 'detail search active  / edit  n/N match  j/k scroll  enter collapse  esc/q close'
      : 'detail search active  / edit  n/N match  j/k scroll  enter collapse  o big  tab traffic  q quit';
  }

  if (isListFocused) {
    return 'j/k move  [/] page  enter inspect  n new  e clone  l library  tab details  P/S rec  h help  q quit';
  }

  return 'j/k scroll  [/] page  r req/res  / find  n/N match  e clone  l library  tab traffic  P/S rec  h help';
}

const Footer = React.memo(function Footer({
  isComposerConfirmOpen,
  isComposerOpen,
  isComposerTextFocused,
  isDetailModalOpen,
  isDetailSearchActive,
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
      formatFooterText({
        isComposerConfirmOpen,
        isComposerOpen,
        isComposerTextFocused,
        isDetailModalOpen,
        isDetailSearchActive,
        isHelpOpen,
        isListFocused,
        isRawModeSupported
      })
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

function isBackspaceInput(value, keyState = {}) {
  return Boolean(keyState.backspace || keyState.delete || value === '\u007F' || value === '\b');
}

function isDeleteInput(value, _keyState = {}) {
  return value === '\u001B[3~';
}

export function getKeyboardAction(input = '', key = {}, options = {}) {
  const {
    filterFocus = 'query',
    isListFocused = true,
    isHelpOpen = false,
    isFilterOpen = false,
    isDetailSearchOpen = false,
    isDetailModalOpen = false,
    isReplayMode = false,
    isLiveMode = false,
    isComposerOpen = false,
    isComposerSending = false,
    isComposerConfirmOpen = false,
    isComposerBodyEditorOpen = false,
    isComposerLibraryOpen = false,
    isComposerTextFocused = false,
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

  if (isComposerOpen) {
    if (parseInkMouseInput(value) || isInkMouseInput(value)) {
      return { type: 'none' };
    }

    if (isComposerSending) {
      return { type: 'none' };
    }

    if (isComposerConfirmOpen) {
      if (keyState.return || value === 'y' || value === 'Y') {
        return { type: 'sendComposer' };
      }

      if (keyState.escape || value === 'n' || value === 'N') {
        return { type: 'closeComposerPreview' };
      }

      return { type: 'none' };
    }

    if (isComposerLibraryOpen) {
      const shortcutTab = getComposerTabFromShortcut(value);

      if (shortcutTab) {
        return { type: 'selectComposerTab', tab: shortcutTab };
      }

      if (keyState.escape || value === 'l') {
        return { type: 'closeComposerLibrary' };
      }

      if (keyState.return) {
        return { type: 'loadComposerLibraryRequest' };
      }

      if (keyState.upArrow || value === 'k') {
        return { type: 'moveComposerLibrary', direction: -1 };
      }

      if (keyState.downArrow || value === 'j') {
        return { type: 'moveComposerLibrary', direction: 1 };
      }

      return { type: 'none' };
    }

    if (isComposerBodyEditorOpen) {
      if (keyState.escape) {
        return { type: 'closeComposerBodyEditor' };
      }

      if (keyState.return) {
        return { type: 'insertComposerText', value: '\n' };
      }

      if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
        return { type: isDeleteInput(value, keyState) ? 'deleteComposerText' : 'backspaceComposerText' };
      }

      if (keyState.leftArrow || keyState.rightArrow) {
        return { type: 'moveComposerCursor', direction: keyState.leftArrow ? -1 : 1 };
      }

      if (keyState.home || keyState.end) {
        return { type: 'moveComposerCursorTo', boundary: keyState.home ? 'start' : 'end' };
      }

      if (value && !keyState.ctrl && !keyState.meta) {
        return { type: 'insertComposerText', value };
      }

      return { type: 'none' };
    }

    if (keyState.escape) {
      return { type: 'closeComposer' };
    }

    if (keyState.return) {
      return { type: 'previewComposerSend' };
    }

    if (value === '[') {
      return { type: 'cycleComposerTab', direction: -1 };
    }

    if (value === ']') {
      return { type: 'cycleComposerTab', direction: 1 };
    }

    if (!isComposerTextFocused && getComposerTabFromShortcut(value)) {
      return { type: 'selectComposerTab', tab: getComposerTabFromShortcut(value) };
    }

    if (keyState.shiftTab || (keyState.shift && keyState.tab)) {
      return { type: 'cycleComposerFocus', direction: -1 };
    }

    if (keyState.tab || keyState.downArrow) {
      return { type: 'cycleComposerFocus', direction: 1 };
    }

    if (keyState.upArrow) {
      return { type: 'cycleComposerFocus', direction: -1 };
    }

    if (value === 'a' && !isComposerTextFocused) {
      return { type: 'addComposerRow' };
    }

    if (value === 'd' && !isComposerTextFocused) {
      return { type: 'deleteComposerRow' };
    }

    if (value === ' ' && !isComposerTextFocused) {
      return { type: 'toggleComposerField' };
    }

    if (value === 's' && !isComposerTextFocused) {
      return { type: 'saveComposerRequest' };
    }

    if (value === 'l' && !isComposerTextFocused) {
      return { type: 'openComposerLibrary' };
    }

    if (value === 'R' && !isComposerTextFocused) {
      return { type: 'toggleComposerReveal' };
    }

    if (value === 'o' && !isComposerTextFocused) {
      return { type: 'openComposerBodyEditor' };
    }

    if (keyState.leftArrow || keyState.rightArrow) {
      return { type: 'moveComposerHorizontal', direction: keyState.leftArrow ? -1 : 1 };
    }

    if (keyState.home || keyState.end) {
      return { type: 'moveComposerCursorTo', boundary: keyState.home ? 'start' : 'end' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return { type: isDeleteInput(value, keyState) ? 'deleteComposerText' : 'backspaceComposerText' };
    }

    if (value && !keyState.ctrl && !keyState.meta) {
      return { type: 'insertComposerText', value };
    }

    return { type: 'none' };
  }

  if (isDetailSearchOpen) {
    if (keyState.escape || keyState.return) {
      return { type: 'finishDetailSearch' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return { type: 'backspaceDetailSearch' };
    }

    if (value && !keyState.ctrl && !keyState.meta) {
      return { type: 'appendDetailSearch', value };
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

  if (isDetailModalOpen) {
    if (keyState.escape || value === 'q') {
      return { type: 'closeDetailModal' };
    }

    if (value === '/') {
      return { type: 'openDetailSearch' };
    }

    if (value === 'n') {
      return { type: 'moveDetailMatch', direction: 1 };
    }

    if (value === 'N') {
      return { type: 'moveDetailMatch', direction: -1 };
    }

    if (value === 'r') {
      return { type: 'toggleDetailTab' };
    }

    if (keyState.return) {
      return { type: 'toggleDetailNode' };
    }

    if (keyState.upArrow || value === 'k') {
      return { type: 'scrollDetails', direction: -1 };
    }

    if (keyState.downArrow || value === 'j') {
      return { type: 'scrollDetails', direction: 1 };
    }

    if (keyState.pageUp || value === '[') {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
    }

    if (keyState.pageDown || value === ']') {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
    }

    if (value === 'u' && keyState.ctrl) {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
    }

    if (value === 'd' && keyState.ctrl) {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
    }

    if (value === 'g') {
      return { type: 'scrollDetailsTo', boundary: 'top' };
    }

    if (value === 'G') {
      return { type: 'scrollDetailsTo', boundary: 'bottom' };
    }

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

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
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

  if (value === 'n' && isLiveMode && isListFocused) {
    return { type: 'openComposer', mode: 'blank' };
  }

  if (value === 'e' && isLiveMode) {
    return { type: 'openComposer', mode: 'clone' };
  }

  if (value === 'l' && isLiveMode) {
    return { type: 'openComposerLibrary' };
  }

  if (value === 'q') {
    return { type: 'quit' };
  }

  if (value === '/') {
    return isListFocused
      ? { type: 'openFilter', focus: 'query' }
      : { type: 'openDetailSearch' };
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

  if (value === 'o') {
    return { type: 'openDetailModal' };
  }

  if (keyState.return) {
    return isListFocused ? { type: 'inspectSelected' } : { type: 'toggleDetailNode' };
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

  if (value === 'n' && !isListFocused) {
    return { type: 'moveDetailMatch', direction: 1 };
  }

  if (value === 'N' && !isListFocused) {
    return { type: 'moveDetailMatch', direction: -1 };
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
  isDetailSearchOpen,
  isDetailModalOpen,
  isReplayMode,
  isLiveMode,
  isComposerOpen,
  isComposerSending,
  isComposerConfirmOpen,
  isComposerBodyEditorOpen,
  isComposerLibraryOpen,
  isComposerTextFocused,
  detailPageSize,
  trafficPageSize,
  onAddComposerRow,
  onAppendSearch,
  onAppendDetailSearch,
  onBackspaceComposerText,
  onBackspaceSearch,
  onBackspaceDetailSearch,
  onCloseComposerBodyEditor,
  onCloseComposerLibrary,
  onCloseComposerPreview,
  onClearFilters,
  onClearLogs,
  onCloseDetailModal,
  onCloseComposer,
  onCloseHelp,
  onCycleComposerFocus,
  onCycleComposerTab,
  onDeleteComposerRow,
  onDeleteComposerText,
  onCycleFilterFocus,
  onFinishDetailSearch,
  onFinishSearch,
  onFollowLatest,
  onInsertComposerText,
  onInspectSelected,
  onLoadComposerLibraryRequest,
  onMoveDetailMatch,
  onMoveSelectionTo,
  onMoveFilterOption,
  onMoveSelection,
  onMoveComposerCursor,
  onMoveComposerCursorTo,
  onMoveComposerHorizontal,
  onMoveComposerLibrary,
  onOpenDetailModal,
  onOpenDetailSearch,
  onOpenComposer,
  onOpenComposerBodyEditor,
  onOpenComposerLibrary,
  onOpenFilter,
  onOpenHelp,
  onPreviewComposerSend,
  onQuit,
  onSaveComposerRequest,
  onScrollDetails,
  onScrollDetailsTo,
  onSendComposer,
  onSelectComposerTab,
  onStopRecording,
  onToggleComposerField,
  onToggleComposerReveal,
  onToggleDetailNode,
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
      isDetailSearchOpen,
      isDetailModalOpen,
      isReplayMode,
      isLiveMode,
      isComposerOpen,
      isComposerSending,
      isComposerConfirmOpen,
      isComposerBodyEditorOpen,
      isComposerLibraryOpen,
      isComposerTextFocused,
      detailPageSize,
      trafficPageSize
    });

    switch (action.type) {
      case 'addComposerRow':
        onAddComposerRow();
        break;
      case 'backspaceComposerText':
        onBackspaceComposerText();
        break;
      case 'appendSearch':
        onAppendSearch(action.value);
        break;
      case 'appendDetailSearch':
        onAppendDetailSearch(action.value);
        break;
      case 'backspaceSearch':
        onBackspaceSearch();
        break;
      case 'backspaceDetailSearch':
        onBackspaceDetailSearch();
        break;
      case 'closeComposerBodyEditor':
        onCloseComposerBodyEditor();
        break;
      case 'closeComposerLibrary':
        onCloseComposerLibrary();
        break;
      case 'closeComposerPreview':
        onCloseComposerPreview();
        break;
      case 'clearFilters':
        onClearFilters();
        break;
      case 'clearLogs':
        onClearLogs();
        break;
      case 'closeDetailModal':
        onCloseDetailModal();
        break;
      case 'closeComposer':
        onCloseComposer();
        break;
      case 'closeHelp':
        onCloseHelp();
        break;
      case 'cycleComposerFocus':
        onCycleComposerFocus(action.direction);
        break;
      case 'cycleComposerTab':
        onCycleComposerTab(action.direction);
        break;
      case 'deleteComposerRow':
        onDeleteComposerRow();
        break;
      case 'deleteComposerText':
        onDeleteComposerText();
        break;
      case 'cycleFilterFocus':
        onCycleFilterFocus(action.direction);
        break;
      case 'finishSearch':
        onFinishSearch();
        break;
      case 'finishDetailSearch':
        onFinishDetailSearch();
        break;
      case 'followLatest':
        onFollowLatest();
        break;
      case 'insertComposerText':
        onInsertComposerText(action.value);
        break;
      case 'inspectSelected':
        onInspectSelected();
        break;
      case 'loadComposerLibraryRequest':
        onLoadComposerLibraryRequest();
        break;
      case 'moveFilterOption':
        onMoveFilterOption(action.direction);
        break;
      case 'moveDetailMatch':
        onMoveDetailMatch(action.direction);
        break;
      case 'moveSelection':
        onMoveSelection(action.direction);
        break;
      case 'moveComposerCursor':
        onMoveComposerCursor(action.direction);
        break;
      case 'moveComposerCursorTo':
        onMoveComposerCursorTo(action.boundary);
        break;
      case 'moveComposerHorizontal':
        onMoveComposerHorizontal(action.direction);
        break;
      case 'moveComposerLibrary':
        onMoveComposerLibrary(action.direction);
        break;
      case 'moveSelectionTo':
        onMoveSelectionTo(action.boundary);
        break;
      case 'openFilter':
        onOpenFilter(action.focus);
        break;
      case 'openDetailModal':
        onOpenDetailModal();
        break;
      case 'openDetailSearch':
        onOpenDetailSearch();
        break;
      case 'openComposer':
        onOpenComposer(action.mode);
        break;
      case 'openComposerBodyEditor':
        onOpenComposerBodyEditor();
        break;
      case 'openComposerLibrary':
        onOpenComposerLibrary();
        break;
      case 'openHelp':
        onOpenHelp();
        break;
      case 'previewComposerSend':
        onPreviewComposerSend();
        break;
      case 'quit':
        onQuit();
        break;
      case 'saveComposerRequest':
        onSaveComposerRequest();
        break;
      case 'scrollDetails':
        onScrollDetails(action.direction);
        break;
      case 'scrollDetailsTo':
        onScrollDetailsTo(action.boundary);
        break;
      case 'sendComposer':
        onSendComposer();
        break;
      case 'selectComposerTab':
        onSelectComposerTab(action.tab);
        break;
      case 'stopRecording':
        onStopRecording();
        break;
      case 'toggleDetailTab':
        onToggleDetailTab();
        break;
      case 'toggleComposerField':
        onToggleComposerField();
        break;
      case 'toggleComposerReveal':
        onToggleComposerReveal();
        break;
      case 'toggleDetailNode':
        onToggleDetailNode();
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

function clampComposerFocus(composer) {
  const descriptors = getComposerFieldDescriptors(composer);

  return {
    ...composer,
    focusIndex: Math.max(0, Math.min(descriptors.length - 1, composer.focusIndex))
  };
}

function updateComposerDraftPath(composer, pathParts, updater) {
  const currentValue = getPathValue(composer.draft, pathParts);
  const nextValue = typeof updater === 'function' ? updater(currentValue) : updater;

  return clampComposerFocus({
    ...composer,
    draft: setPathValue(composer.draft, pathParts, nextValue),
    error: ''
  });
}

function getFocusedTextDescriptor(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  return descriptor?.kind === 'text' ? descriptor : null;
}

function insertComposerText(composer, value) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));
  const nextText = `${text.slice(0, cursor)}${value}${text.slice(cursor)}`;

  return {
    ...updateComposerDraftPath(composer, descriptor.path, nextText),
    cursor: cursor + value.length
  };
}

function backspaceComposerText(composer) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));

  if (cursor === 0) {
    return composer;
  }

  return {
    ...updateComposerDraftPath(composer, descriptor.path, `${text.slice(0, cursor - 1)}${text.slice(cursor)}`),
    cursor: cursor - 1
  };
}

function deleteComposerText(composer) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));

  if (cursor >= text.length) {
    return composer;
  }

  return updateComposerDraftPath(composer, descriptor.path, `${text.slice(0, cursor)}${text.slice(cursor + 1)}`);
}

function moveComposerCursor(composer, direction) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');

  return {
    ...composer,
    cursor: Math.max(0, Math.min(text.length, composer.cursor + direction))
  };
}

function moveComposerCursorTo(composer, boundary) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');

  return {
    ...composer,
    cursor: boundary === 'end' ? text.length : 0
  };
}

function cycleFocusedComposerOption(composer, direction) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (descriptor?.kind !== 'option') {
    return moveComposerCursor(composer, direction);
  }

  return ensureComposerActiveTabRows(updateComposerDraftPath(composer, descriptor.path, (currentValue) => (
    cycleValue(descriptor.options, currentValue, direction)
  )));
}

function toggleFocusedComposerField(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (descriptor?.kind !== 'toggle') {
    return composer;
  }

  return updateComposerDraftPath(composer, descriptor.path, (currentValue) => !currentValue);
}

function getComposerTableForActiveTab(composer) {
  return getComposerTableForTab(composer);
}

function addComposerRow(composer) {
  const table = getComposerTableForActiveTab(composer);

  if (!table) {
    return composer;
  }

  const row = createComposerTableRow({
    type: table === 'multipartFields' ? 'text' : undefined,
    secret: table === 'cookies'
  });
  const rows = getPathValue(composer.draft, [table]) ?? [];
  const nextComposer = {
    ...composer,
    draft: setPathValue(composer.draft, [table], [...rows, row]),
    error: ''
  };
  const descriptors = getComposerFieldDescriptors(nextComposer);
  const focusIndex = descriptors.findIndex((descriptor) => (
    descriptor.table === table &&
      descriptor.rowIndex === rows.length &&
      descriptor.kind === 'text' &&
      descriptor.label === 'key'
  ));

  return clampComposerFocus({
    ...nextComposer,
    cursor: 0,
    focusIndex: focusIndex === -1 ? getComposerFieldDescriptors(composer).length : focusIndex
  });
}

function deleteComposerRow(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (!descriptor?.table || descriptor.rowIndex === undefined) {
    return composer;
  }

  const rows = getPathValue(composer.draft, [descriptor.table]) ?? [];

  return clampComposerFocus({
    ...composer,
    draft: setPathValue(composer.draft, [descriptor.table], rows.filter((_, index) => index !== descriptor.rowIndex)),
    error: ''
  });
}

function cycleComposerTab(composer, direction) {
  return selectComposerTab(composer, cycleValue(COMPOSER_TABS, composer.activeTab, direction));
}

function moveComposerFocus(composer, direction) {
  const descriptors = getComposerFieldDescriptors(composer);
  const nextIndex = (composer.focusIndex + direction + descriptors.length) % descriptors.length;
  const descriptor = descriptors[nextIndex];
  const value = descriptor?.kind === 'text' ? String(getPathValue(composer.draft, descriptor.path) ?? '') : '';

  return {
    ...composer,
    cursor: value.length,
    focusIndex: nextIndex
  };
}

export function App({
  stateStore,
  context = {},
  captureController = null,
  manualRequestStore = null,
  manualRequestSender = null,
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
  const [focusedDetailRow, setFocusedDetailRow] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [isDetailSearchOpen, setIsDetailSearchOpen] = useState(false);
  const [detailMatchIndex, setDetailMatchIndex] = useState(0);
  const [collapsedDetailPaths, setCollapsedDetailPaths] = useState([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [manualLibrary, setManualLibrary] = useState(() => manualRequestStore?.getLibrary?.() ?? {
    schemaVersion: 1,
    requests: [],
    environment: [],
    warning: null
  });
  const [composer, setComposer] = useState(() => ({
    ...createBlankComposerState({
      environment: manualRequestStore?.getLibrary?.().environment ?? []
    }),
    isOpen: false
  }));
  const isReplayMode = context.mode === 'replay';
  const isLiveMode = context.mode === 'live';
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
    setFocusedDetailRow(0);
    setDetailMatchIndex(0);
  }, [inspectedLogId, detailTab]);

  const selectedIndex = useMemo(() => getSelectedIndex(filteredLogs, selectedLogId), [filteredLogs, selectedLogId]);
  const selectedLog = useMemo(() => filteredLogs[selectedIndex] ?? null, [filteredLogs, selectedIndex]);
  const inspectedLog = useMemo(() => {
    return filteredLogs.find((log) => log.id === inspectedLogId) ?? selectedLog;
  }, [filteredLogs, inspectedLogId, selectedLog]);
  const rawDetailRows = useMemo(
    () => getDetailRows(inspectedLog, detailTab, {
      collapsedPaths: collapsedDetailPaths,
      publicTargetUrl,
      proxyOrigin,
      showCookieValues
    }),
    [collapsedDetailPaths, detailTab, inspectedLog, publicTargetUrl, proxyOrigin, showCookieValues]
  );
  const detailMatches = useMemo(
    () => findDetailMatches(rawDetailRows, detailSearchQuery),
    [detailSearchQuery, rawDetailRows]
  );
  const detailRows = useMemo(
    () => applyDetailMatches(rawDetailRows, detailMatches, detailMatchIndex),
    [detailMatchIndex, detailMatches, rawDetailRows]
  );
  const bottomOffset = isFilterOpen ? 19 : (isDetailSearchOpen ? 13 + DETAIL_SEARCH_BAR_HEIGHT : 13);
  const trafficVisibleCount = getTrafficVisibleCount(bottomOffset);
  const detailVisibleCount = getDetailVisibleCount(bottomOffset);
  const detailModalVisibleCount = getDetailModalVisibleCount(isDetailSearchOpen ? 11 + DETAIL_SEARCH_BAR_HEIGHT : 11);
  const activeDetailVisibleCount = isDetailModalOpen ? detailModalVisibleCount : detailVisibleCount;
  const maxDetailScrollOffset = getMaxScrollOffset(detailRows, activeDetailVisibleCount);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : (isReplayMode ? 'No recorded traffic' : 'Waiting for traffic...');

  useEffect(() => {
    setDetailScrollOffset((current) => Math.min(current, maxDetailScrollOffset));
  }, [maxDetailScrollOffset]);

  useEffect(() => {
    setFocusedDetailRow((current) => clampDetailRowIndex(current, detailRows));
  }, [detailRows]);

  useEffect(() => {
    setDetailMatchIndex((current) => detailMatches.length === 0
      ? 0
      : Math.min(current, detailMatches.length - 1));
  }, [detailMatches]);

  useEffect(() => {
    if (!detailSearchQuery.trim() || detailMatches.length === 0) {
      return;
    }

    const activeRow = detailMatches[Math.min(detailMatchIndex, detailMatches.length - 1)];

    setFocusedDetailRow(activeRow);
    setDetailScrollOffset((current) => getScrollOffsetForFocusedRow(
      activeRow,
      current,
      activeDetailVisibleCount,
      maxDetailScrollOffset
    ));
  }, [activeDetailVisibleCount, detailMatchIndex, detailMatches, detailSearchQuery, maxDetailScrollOffset]);

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

  const focusDetailRowAt = (rowIndex) => {
    const safeRowIndex = clampDetailRowIndex(rowIndex, detailRows);

    setFocusedDetailRow(safeRowIndex);
    setDetailScrollOffset((current) => getScrollOffsetForFocusedRow(
      safeRowIndex,
      current,
      activeDetailVisibleCount,
      maxDetailScrollOffset
    ));
  };

  const moveDetailFocus = (direction) => {
    focusDetailRowAt(focusedDetailRow + direction);
  };

  const moveDetailMatch = (direction) => {
    if (detailMatches.length === 0) {
      return;
    }

    const nextMatchIndex = getNextDetailMatchIndex(detailMatches, detailMatchIndex, direction);

    setDetailMatchIndex(nextMatchIndex);
    focusDetailRowAt(detailMatches[nextMatchIndex]);
  };

  const toggleFocusedDetailNode = () => {
    const row = detailRows[focusedDetailRow] ?? detailRows[detailScrollOffset];

    if (!row?.collapsible || !row.path) {
      return;
    }

    setCollapsedDetailPaths((current) => {
      return current.includes(row.path)
        ? current.filter((path) => path !== row.path)
        : [...current, row.path];
    });
  };

  const openComposer = (mode) => {
    if (!isLiveMode) {
      return;
    }

    setComposer(mode === 'clone' && selectedLog
      ? createComposerStateFromLog(selectedLog, {
        environment: manualLibrary.environment,
        includeCookieHeaders: showCookieValues
      })
      : createBlankComposerState({ environment: manualLibrary.environment }));
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
  };

  const openComposerLibrary = () => {
    if (!isLiveMode) {
      return;
    }

    setManualLibrary(manualRequestStore?.getLibrary?.() ?? manualLibrary);
    setComposer((current) => ({
      ...(current.isOpen ? current : createBlankComposerState({ environment: manualLibrary.environment })),
      isConfirmOpen: false,
      isLibraryOpen: true,
      isOpen: true,
      isSending: false,
      libraryIndex: 0
    }));
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
  };

  const saveComposerRequest = () => {
    if (!composer.isOpen) {
      return;
    }

    const draft = normalizeManualRequestDraft({
      ...composer.draft,
      collection: composer.draft.collection || 'Default',
      name: composer.draft.name || `${composer.draft.method} ${composer.draft.url}`
    });

    try {
      const nextLibrary = manualRequestStore?.saveDraft?.(draft, {
        environment: composer.draft.environment
      }) ?? {
        ...manualLibrary,
        environment: composer.draft.environment,
        requests: [
          ...manualLibrary.requests.filter((request) => request.id !== draft.id),
          {
            ...draft,
            updatedAt: new Date().toISOString()
          }
        ],
        warning: null
      };

      setManualLibrary(nextLibrary);
      setComposer((current) => ({
        ...current,
        draft,
        error: '',
        status: `saved ${draft.name || draft.url}`
      }));
    } catch (error) {
      setComposer((current) => ({
        ...current,
        error: error?.message ?? String(error)
      }));
    }
  };

  const loadComposerLibraryRequest = () => {
    const requests = flattenRequestLibrary(manualLibrary);
    const selectedRequest = requests[Math.max(0, Math.min(requests.length - 1, composer.libraryIndex))];

    if (!selectedRequest) {
      return;
    }

    setComposer(() => {
      const draft = normalizeManualRequestDraft({
        ...selectedRequest,
        environment: manualLibrary.environment
      });

      return ensureComposerActiveTabRows({
        ...createBlankComposerState({ environment: manualLibrary.environment }),
        cursor: draft.url.length,
        draft,
        isLibraryOpen: false,
        source: 'library'
      });
    });
  };

  const sendComposer = () => {
    if (!composer.isOpen || composer.isSending || !isLiveMode || typeof manualRequestSender !== 'function') {
      return;
    }

    setComposer((current) => ({
      ...current,
      error: '',
      isConfirmOpen: false,
      isSending: true
    }));

    Promise.resolve()
      .then(() => manualRequestSender(composer.draft))
      .then((logEntry) => {
        const addedLog = stateStore.addLog(logEntry);

        clearFilters();
        setSelectedLogId(addedLog.id);
        setInspectedLogId(addedLog.id);
        setIsFollowingLatest(false);
        setIsListFocused(false);
        setDetailTab('response');
        setDetailScrollOffset(0);
        setFocusedDetailRow(0);
        setComposer((current) => ({
          ...current,
          isConfirmOpen: false,
          isOpen: false,
          isSending: false
        }));
      })
      .catch((error) => {
        setComposer((current) => ({
          ...current,
          error: error?.message ?? String(error),
          isConfirmOpen: false,
          isSending: false
        }));
      });
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
        isDetailSearchOpen,
        isDetailModalOpen,
        isReplayMode,
        isLiveMode,
        isComposerOpen: composer.isOpen,
        isComposerSending: composer.isSending,
        isComposerConfirmOpen: composer.isConfirmOpen,
        isComposerBodyEditorOpen: composer.isBodyEditorOpen,
        isComposerLibraryOpen: composer.isLibraryOpen,
        isComposerTextFocused: getFocusedComposerDescriptor(composer)?.kind === 'text',
        detailPageSize: activeDetailVisibleCount,
        trafficPageSize: trafficVisibleCount,
        onAddComposerRow: () => setComposer(addComposerRow),
        onAppendDetailSearch: (value) => {
          setDetailSearchQuery((current) => `${current}${value}`);
          setDetailMatchIndex(0);
        },
        onAppendSearch: (value) => {
          setSearchQuery((current) => `${current}${value}`);
          setIsFollowingLatest(false);
        },
        onBackspaceDetailSearch: () => {
          setDetailSearchQuery((current) => current.slice(0, -1));
          setDetailMatchIndex(0);
        },
        onBackspaceComposerText: () => setComposer(backspaceComposerText),
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
          setFocusedDetailRow(0);
        },
        onCloseDetailModal: () => setIsDetailModalOpen(false),
        onCloseComposer: () => {
          setComposer((current) => ({
            ...current,
            isBodyEditorOpen: false,
            isConfirmOpen: false,
            isLibraryOpen: false,
            isOpen: false,
            isSending: false
          }));
        },
        onCloseComposerBodyEditor: () => {
          setComposer((current) => ({
            ...current,
            isBodyEditorOpen: false
          }));
        },
        onCloseComposerLibrary: () => {
          setComposer((current) => ({
            ...current,
            isLibraryOpen: false
          }));
        },
        onCloseComposerPreview: () => {
          setComposer((current) => ({
            ...current,
            isConfirmOpen: false
          }));
        },
        onCloseHelp: () => setIsHelpOpen(false),
        onCycleComposerFocus: (direction) => setComposer((current) => moveComposerFocus(current, direction)),
        onCycleComposerTab: (direction) => setComposer((current) => cycleComposerTab(current, direction)),
        onDeleteComposerRow: () => setComposer(deleteComposerRow),
        onDeleteComposerText: () => setComposer(deleteComposerText),
        onCycleFilterFocus: (direction) => {
          setFilterFocus((current) => cycleValue(FILTER_FOCUS_ORDER, current, direction));
          setIsFollowingLatest(false);
        },
        onFinishDetailSearch: () => setIsDetailSearchOpen(false),
        onFinishSearch: () => setIsFilterOpen(false),
        onQuit,
        onInsertComposerText: (value) => setComposer((current) => insertComposerText(current, value)),
        onLoadComposerLibraryRequest: loadComposerLibraryRequest,
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
        onMoveComposerCursor: (direction) => setComposer((current) => moveComposerCursor(current, direction)),
        onMoveComposerCursorTo: (boundary) => setComposer((current) => moveComposerCursorTo(current, boundary)),
        onMoveComposerHorizontal: (direction) => setComposer((current) => cycleFocusedComposerOption(current, direction)),
        onMoveComposerLibrary: (direction) => {
          setComposer((current) => {
            const requests = flattenRequestLibrary(manualLibrary);
            const maxIndex = Math.max(0, requests.length - 1);

            return {
              ...current,
              libraryIndex: Math.max(0, Math.min(maxIndex, current.libraryIndex + direction))
            };
          });
        },
        onMoveDetailMatch: moveDetailMatch,
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
          setIsDetailSearchOpen(false);
          setIsFollowingLatest(false);
        },
        onOpenDetailModal: () => {
          if (inspectedLog) {
            setIsDetailModalOpen(true);
            setIsListFocused(false);
            setIsFilterOpen(false);
          }
        },
        onOpenDetailSearch: () => {
          setIsDetailSearchOpen(true);
          setIsFilterOpen(false);
          setIsListFocused(false);
        },
        onOpenComposer: openComposer,
        onOpenComposerBodyEditor: () => {
          setComposer((current) => {
            const descriptor = getFocusedComposerDescriptor(current);

            if (current.activeTab !== 'body' || descriptor?.kind !== 'text') {
              return current;
            }

            return {
              ...current,
              cursor: String(getPathValue(current.draft, descriptor.path) ?? '').length,
              isBodyEditorOpen: true
            };
          });
        },
        onOpenComposerLibrary: openComposerLibrary,
        onOpenHelp: () => setIsHelpOpen(true),
        onPreviewComposerSend: () => {
          setComposer((current) => ({
            ...current,
            error: '',
            isBodyEditorOpen: false,
            isConfirmOpen: true,
            isLibraryOpen: false
          }));
        },
        onSaveComposerRequest: saveComposerRequest,
        onSelectComposerTab: (tab) => setComposer((current) => selectComposerTab(current, tab)),
        onScrollDetails: (direction) => {
          moveDetailFocus(direction);
        },
        onScrollDetailsTo: (boundary) => {
          const rowIndex = boundary === 'bottom' ? Math.max(0, detailRows.length - 1) : 0;
          focusDetailRowAt(rowIndex);
        },
        onSendComposer: sendComposer,
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
          setFocusedDetailRow(0);
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
        onToggleComposerField: () => setComposer(toggleFocusedComposerField),
        onToggleComposerReveal: () => {
          setComposer((current) => ({
            ...current,
            revealSecrets: !current.revealSecrets
          }));
        },
        onToggleDetailNode: toggleFocusedDetailNode,
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
        : (composer.isOpen
          ? h(RequestComposerPanel, {
            composer,
            library: manualLibrary,
            targetUrl: context.targetUrl
          })
          : (isDetailModalOpen
          ? h(DetailModal, {
            activeMatchIndex: detailMatchIndex,
            detailTab,
            focusedRow: focusedDetailRow,
            log: inspectedLog,
            matchCount: detailMatches.length,
            rows: detailRows,
            scrollOffset: detailScrollOffset,
            visibleCount: detailModalVisibleCount
          })
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
            focusedRow: focusedDetailRow,
            rows: detailRows,
            scrollOffset: detailScrollOffset,
            matchCount: detailMatches.length,
            activeMatchIndex: detailMatchIndex
          })
        ]))
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
        : (isDetailSearchOpen
          ? h(DetailSearchBar, {
          activeMatchIndex: detailMatchIndex,
          matchCount: detailMatches.length,
          query: detailSearchQuery
        })
          : h(Footer, {
          isComposerConfirmOpen: composer.isConfirmOpen,
          isComposerOpen: composer.isOpen,
          isComposerTextFocused: getFocusedComposerDescriptor(composer)?.kind === 'text',
          isDetailModalOpen,
          isDetailSearchActive: detailSearchQuery.trim().length > 0,
          isHelpOpen,
          isListFocused: isDetailModalOpen ? false : isListFocused,
          isRawModeSupported
        }))
  );
}
