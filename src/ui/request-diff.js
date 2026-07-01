import React from 'react';
import { Box, Text } from 'ink';
import { maskCookieHeaders } from '../cookies.js';
import {
  BODY_LINE_MAX_LENGTH,
  SEARCH_MODES,
  WORD_MATCH_MODES,
  TEXTUAL_CONTENT_TYPE_PATTERNS,
  getTerminalRows,
  h,
  pad,
  truncate
} from './shared.js';
import {
  getContentType,
  getHeaderTokens,
  getSearchQueryWarning,
  matchesSearchValues
} from './traffic.js';
import { getEndpointRoutePattern } from './endpoints.js';
import {
  DEFAULT_KEY_BINDINGS,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';

export const REQUEST_DIFF_STACKED_WIDTH = 100;
export const REQUEST_DIFF_LAYOUT_MODES = Object.freeze(['auto', 'side-by-side', 'stacked']);
export const REQUEST_DIFF_FILTER_BAR_HEIGHT = 8;
export const DIFF_FILTER_FOCUS_ORDER = Object.freeze(['query', 'mode', 'words', 'case']);

const GROUP_TITLES = {
  request: 'Request',
  query: 'Query Params',
  requestHeaders: 'Request Headers',
  requestBody: 'Request Body',
  response: 'Response',
  responseHeaders: 'Response Headers',
  responseBody: 'Response Body'
};
const MISSING_VALUE = '(missing)';

function normalizeRequestDiffLayoutMode(mode = 'auto') {
  return REQUEST_DIFF_LAYOUT_MODES.includes(mode) ? mode : 'auto';
}

function createGroup(id) {
  return {
    changes: [],
    id,
    title: GROUP_TITLES[id] ?? id,
    warnings: []
  };
}

function sanitizeDiffText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '?');
}

function formatDiffValue(value) {
  if (value === undefined) {
    return MISSING_VALUE;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeDiffText(item)).join(' | ');
  }

  return sanitizeDiffText(value);
}

function addChange(group, label, leftValue, rightValue, options = {}) {
  const hasLeft = leftValue !== undefined;
  const hasRight = rightValue !== undefined;
  const kind = options.kind ?? (!hasLeft ? 'added' : (!hasRight ? 'removed' : 'changed'));

  group.changes.push({
    id: `${group.id}:${label}`,
    kind,
    label,
    leftValue: formatDiffValue(leftValue),
    fullLeftValue: formatDiffValue(options.fullLeftValue ?? leftValue),
    fullRightValue: formatDiffValue(options.fullRightValue ?? rightValue),
    rightValue: formatDiffValue(rightValue),
    warning: Boolean(options.warning)
  });
}

function addWarning(group, label, message) {
  group.warnings.push({
    id: `${group.id}:warning:${label}`,
    kind: 'warning',
    label,
    fullLeftValue: message,
    fullRightValue: message,
    leftValue: message,
    rightValue: message
  });
}

function compareScalar(group, label, leftValue, rightValue) {
  const leftText = leftValue === null || leftValue === undefined ? '' : String(leftValue);
  const rightText = rightValue === null || rightValue === undefined ? '' : String(rightValue);

  if (leftText !== rightText) {
    addChange(group, label, leftText, rightText);
  }
}

function sortedUnion(leftKeys, rightKeys) {
  return [...new Set([...leftKeys, ...rightKeys])].sort((first, second) => first.localeCompare(second));
}

function compareMaps(group, leftMap, rightMap) {
  for (const key of sortedUnion(Object.keys(leftMap), Object.keys(rightMap))) {
    if (!Object.hasOwn(leftMap, key)) {
      addChange(group, key, undefined, rightMap[key], { kind: 'added' });
      continue;
    }

    if (!Object.hasOwn(rightMap, key)) {
      addChange(group, key, leftMap[key], undefined, { kind: 'removed' });
      continue;
    }

    if (leftMap[key] !== rightMap[key]) {
      addChange(group, key, leftMap[key], rightMap[key]);
    }
  }
}

function parseRequestPath(path = '') {
  const rawPath = String(path ?? '');

  try {
    const parsed = new URL(rawPath, 'http://clinspect.local');
    const query = {};

    for (const [key, value] of parsed.searchParams.entries()) {
      if (Object.hasOwn(query, key)) {
        query[key] = Array.isArray(query[key])
          ? [...query[key], value]
          : [query[key], value];
      } else {
        query[key] = value;
      }
    }

    return {
      pathname: parsed.pathname || '/',
      query: Object.fromEntries(Object.entries(query).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(' | ') : String(value)
      ]))
    };
  } catch {
    const [pathname = rawPath, search = ''] = rawPath.split('?', 2);
    const query = {};

    for (const [key, value] of new URLSearchParams(search).entries()) {
      query[key] = Object.hasOwn(query, key) ? `${query[key]} | ${value}` : value;
    }

    return {
      pathname: pathname || '/',
      query
    };
  }
}

export function getDiffEndpointShape(log = {}) {
  const method = String(log?.method ?? 'GET').toUpperCase();

  return `${method} ${getEndpointRoutePattern(log?.path ?? '/')}`;
}

export function getDiffCandidateLogIds(baseLog, logs = []) {
  if (!baseLog?.id) {
    return [];
  }

  const baseShape = getDiffEndpointShape(baseLog);

  return (logs ?? [])
    .filter((log) => log?.id && log.id !== baseLog.id && getDiffEndpointShape(log) === baseShape)
    .map((log) => log.id);
}

function normalizeHeaderMap(headers = {}, options = {}) {
  const sourceHeaders = options.showCookieValues ? headers : maskCookieHeaders(headers);
  const normalized = {};

  for (const [name, rawValue] of Object.entries(sourceHeaders ?? {})) {
    const key = String(name ?? '').toLowerCase();
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const formattedValue = values.map((item) => String(item ?? '')).join(' | ');

    if (Object.hasOwn(normalized, key)) {
      normalized[key] = `${normalized[key]} | ${formattedValue}`;
    } else {
      normalized[key] = formattedValue;
    }
  }

  return normalized;
}

function hasEncodedBody(headers = {}) {
  return getHeaderTokens(headers, 'content-encoding')
    .some((encoding) => encoding && encoding !== 'identity');
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

function isUrlEncodedContentType(contentType) {
  return contentType === 'application/x-www-form-urlencoded';
}

function looksLikeJsonBody(body) {
  const trimmed = String(body ?? '').trim();

  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function looksLikeUrlEncodedBody(body) {
  const trimmed = String(body ?? '').trim();

  return /^[^=\s&]+=[\s\S]*$/.test(trimmed) && !trimmed.includes('\n');
}

function appendPath(parentPath, key) {
  if (typeof key === 'number') {
    return `${parentPath}[${key}]`;
  }

  const textKey = String(key);

  if (/^[A-Za-z_$][\w$]*$/.test(textKey)) {
    return `${parentPath}.${textKey}`;
  }

  return `${parentPath}[${JSON.stringify(textKey)}]`;
}

function formatBodyFieldValue(value) {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return MISSING_VALUE;
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : JSON.stringify(value);
  }

  if (typeof value === 'object') {
    return Object.keys(value).length === 0 ? '{}' : JSON.stringify(value);
  }

  return String(value);
}

function flattenStructuredValue(value, path, fields) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      fields[path] = '[]';
      return;
    }

    value.forEach((item, index) => flattenStructuredValue(item, appendPath(path, index), fields));
    return;
  }

  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((first, second) => first.localeCompare(second));

    if (keys.length === 0) {
      fields[path] = '{}';
      return;
    }

    keys.forEach((key) => flattenStructuredValue(value[key], appendPath(path, key), fields));
    return;
  }

  fields[path] = formatBodyFieldValue(value);
}

function parseJsonFields(body) {
  const parsed = JSON.parse(String(body));
  const fields = {};

  flattenStructuredValue(parsed, '$', fields);
  return fields;
}

function parseUrlEncodedForm(body) {
  const params = new URLSearchParams(String(body));
  const result = {};
  let count = 0;

  for (const [key, value] of params.entries()) {
    count += 1;
    if (Object.hasOwn(result, key)) {
      result[key] = Array.isArray(result[key])
        ? [...result[key], value]
        : [result[key], value];
    } else {
      result[key] = value;
    }
  }

  return count > 0 ? result : null;
}

function parseFormFields(body) {
  const parsed = parseUrlEncodedForm(body);

  if (!parsed) {
    return null;
  }

  const fields = {};

  flattenStructuredValue(parsed, 'form', fields);
  return fields;
}

function tryParseBodyFields(payload = {}) {
  const body = String(payload.body ?? '');
  const contentType = getContentType(payload.headers);
  const trimmed = body.trim();

  if (!trimmed) {
    return null;
  }

  if (isJsonContentType(contentType) || looksLikeJsonBody(trimmed)) {
    try {
      return {
        fields: parseJsonFields(body),
        kind: 'json'
      };
    } catch {
      // Try the next structured shape.
    }
  }

  if (isUrlEncodedContentType(contentType) || looksLikeUrlEncodedBody(trimmed)) {
    try {
      const fields = parseFormFields(body);

      if (fields) {
        return {
          fields,
          kind: 'form'
        };
      }
    } catch {
      // Fall back to a summary row.
    }
  }

  return null;
}

function getBodySummaryValues(payload = {}) {
  const body = String(payload.body ?? '');
  const contentType = getContentType(payload.headers);
  const encodings = getHeaderTokens(payload.headers, 'content-encoding');

  if (hasEncodedBody(payload.headers)) {
    const summary = `(compressed body not compared: ${encodings.join(', ')})`;

    return {
      display: summary,
      full: summary
    };
  }

  if (!isTextualContentType(contentType)) {
    const summary = `(binary body not compared: ${contentType || 'unknown content type'})`;

    return {
      display: summary,
      full: summary
    };
  }

  if (body.length === 0) {
    return {
      display: '(empty)',
      full: '(empty)'
    };
  }

  const full = sanitizeDiffText(body);
  const compact = full
    .replace(/\s+/g, ' ')
    .trim() || '(whitespace)';

  return {
    display: truncate(compact, BODY_LINE_MAX_LENGTH),
    full: full.trim() ? full : '(whitespace)'
  };
}

function comparePayload(group, leftPayload = {}, rightPayload = {}) {
  const compareSummary = () => {
    const leftSummary = getBodySummaryValues(leftPayload);
    const rightSummary = getBodySummaryValues(rightPayload);
    const leftBody = String(leftPayload.body ?? '');
    const rightBody = String(rightPayload.body ?? '');

    if (leftSummary.full !== rightSummary.full || leftBody !== rightBody) {
      addChange(group, 'body summary', leftSummary.display, rightSummary.display, {
        fullLeftValue: leftSummary.full,
        fullRightValue: rightSummary.full
      });
    }
  };

  if (leftPayload?.truncated || rightPayload?.truncated) {
    addWarning(group, 'partial diff', 'body was truncated; comparison may be partial');
  }

  if (hasEncodedBody(leftPayload.headers) || hasEncodedBody(rightPayload.headers)) {
    compareSummary();
    return;
  }

  const leftContentType = getContentType(leftPayload.headers);
  const rightContentType = getContentType(rightPayload.headers);
  const leftTextual = isTextualContentType(leftContentType);
  const rightTextual = isTextualContentType(rightContentType);

  if (!leftTextual || !rightTextual) {
    compareSummary();
    return;
  }

  const leftFields = tryParseBodyFields(leftPayload);
  const rightFields = tryParseBodyFields(rightPayload);

  if (leftFields && rightFields && leftFields.kind === rightFields.kind) {
    compareMaps(group, leftFields.fields, rightFields.fields);
    return;
  }

  const leftBody = String(leftPayload.body ?? '');
  const rightBody = String(rightPayload.body ?? '');

  if (leftBody !== rightBody) {
    compareSummary();
  }
}

function summarizeLog(log = {}) {
  const method = String(log.method ?? 'GET').toUpperCase();
  const path = String(log.path ?? '/');
  const status = log.statusCode === null || log.statusCode === undefined
    ? '---'
    : String(log.statusCode);

  return `${method} ${path} -> ${status}`;
}

export function createRequestDiff(leftLog, rightLog, options = {}) {
  const requestGroup = createGroup('request');
  const queryGroup = createGroup('query');
  const requestHeadersGroup = createGroup('requestHeaders');
  const requestBodyGroup = createGroup('requestBody');
  const responseGroup = createGroup('response');
  const responseHeadersGroup = createGroup('responseHeaders');
  const responseBodyGroup = createGroup('responseBody');
  const leftPath = parseRequestPath(leftLog?.path);
  const rightPath = parseRequestPath(rightLog?.path);

  compareScalar(requestGroup, 'method', leftLog?.method, rightLog?.method);
  compareScalar(requestGroup, 'path', leftPath.pathname, rightPath.pathname);
  compareMaps(queryGroup, leftPath.query, rightPath.query);
  compareMaps(
    requestHeadersGroup,
    normalizeHeaderMap(leftLog?.request?.headers, options),
    normalizeHeaderMap(rightLog?.request?.headers, options)
  );
  comparePayload(requestBodyGroup, leftLog?.request, rightLog?.request);
  compareScalar(responseGroup, 'status', leftLog?.statusCode, rightLog?.statusCode);
  compareMaps(
    responseHeadersGroup,
    normalizeHeaderMap(leftLog?.response?.headers, options),
    normalizeHeaderMap(rightLog?.response?.headers, options)
  );
  comparePayload(responseBodyGroup, leftLog?.response, rightLog?.response);

  const groups = [
    requestGroup,
    queryGroup,
    requestHeadersGroup,
    requestBodyGroup,
    responseGroup,
    responseHeadersGroup,
    responseBodyGroup
  ];
  const changeCount = groups.reduce((total, group) => total + group.changes.length, 0);

  return {
    changeCount,
    groups,
    leftLog,
    leftSummary: summarizeLog(leftLog),
    rightLog,
    rightSummary: summarizeLog(rightLog),
    warningCount: groups.reduce((total, group) => total + group.warnings.length, 0)
  };
}

export function getRequestDiffRows(diff) {
  if (!diff) {
    return [{
      id: 'diff-empty',
      isFocusable: false,
      text: 'no diff open',
      type: 'empty'
    }];
  }

  const rows = [];

  for (const group of diff.groups ?? []) {
    const items = [...(group.warnings ?? []), ...(group.changes ?? [])];

    if (items.length === 0) {
      continue;
    }

    rows.push({
      groupId: group.id,
      id: `${group.id}:section`,
      isFocusable: false,
      text: `${group.title} (${group.changes.length})`,
      title: group.title,
      type: 'section'
    });

    for (const item of items) {
      rows.push({
        ...item,
        groupId: group.id,
        isFocusable: true,
        text: `${item.label}: ${item.leftValue} -> ${item.rightValue}`,
        type: item.kind === 'warning' ? 'warning' : 'change'
      });
    }
  }

  if (rows.length === 0) {
    return [{
      id: 'diff-no-changes',
      isFocusable: false,
      text: 'no differences',
      type: 'empty'
    }];
  }

  return rows;
}

function getRequestDiffRowSearchValues(row) {
  return [
    row?.groupId,
    row?.title,
    row?.label,
    row?.leftValue,
    row?.rightValue,
    row?.fullLeftValue,
    row?.fullRightValue,
    row?.text
  ]
    .filter((value) => value !== undefined && value !== null);
}

function requestDiffRowMatchesFilter(row, query, options = {}) {
  return matchesSearchValues(getRequestDiffRowSearchValues(row), query, options);
}

export function filterRequestDiffRows(rows = [], query = '', options = {}) {
  const normalizedQuery = String(query ?? '').trim();

  if (!normalizedQuery) {
    return rows;
  }

  const filteredRows = [];
  let currentSection = null;
  let currentSectionMatches = false;
  let currentMatches = [];

  const flushSection = () => {
    if (currentMatches.length > 0) {
      if (currentSection) {
        filteredRows.push({
          ...currentSection,
          id: `${currentSection.id}:filter`,
          text: `${currentSection.title ?? currentSection.text} (${currentMatches.length})`
        });
      }

      filteredRows.push(...currentMatches);
    }

    currentSection = null;
    currentSectionMatches = false;
    currentMatches = [];
  };

  for (const row of rows) {
    if (row?.type === 'section') {
      flushSection();
      currentSection = row;
      currentSectionMatches = requestDiffRowMatchesFilter(row, normalizedQuery, options);
      continue;
    }

    if (row?.isFocusable && (currentSectionMatches || requestDiffRowMatchesFilter(row, normalizedQuery, options))) {
      currentMatches.push(row);
    }
  }

  flushSection();

  if (filteredRows.length === 0) {
    return [{
      id: 'diff-filter-empty',
      isFocusable: false,
      text: `no diff matches for "${sanitizeDiffText(normalizedQuery)}"`,
      type: 'empty'
    }];
  }

  return filteredRows;
}

export function clampRequestDiffRowIndex(index, rows = []) {
  if (rows.length === 0) {
    return 0;
  }

  const safeIndex = Number.isFinite(index) ? Math.floor(index) : 0;

  return Math.max(0, Math.min(rows.length - 1, safeIndex));
}

function getFocusableRowIndices(rows = []) {
  return rows
    .map((row, index) => row?.isFocusable ? index : -1)
    .filter((index) => index >= 0);
}

function getRequestDiffFocusableCount(rows = []) {
  return rows.reduce((count, row) => count + (row?.isFocusable ? 1 : 0), 0);
}

export function getNextRequestDiffRowIndex(rows = [], currentIndex = 0, direction = 1) {
  const focusableIndices = getFocusableRowIndices(rows);

  if (focusableIndices.length === 0) {
    return clampRequestDiffRowIndex(currentIndex, rows);
  }

  const step = Number.isFinite(direction) ? Math.trunc(direction) : 0;
  const exactPosition = focusableIndices.indexOf(currentIndex);

  if (exactPosition === -1) {
    const nextPosition = focusableIndices.findIndex((index) => index > currentIndex);

    if (step < 0) {
      const previousIndices = focusableIndices.filter((index) => index < currentIndex);

      return previousIndices[previousIndices.length - 1] ?? focusableIndices[0];
    }

    return nextPosition === -1
      ? focusableIndices[focusableIndices.length - 1]
      : focusableIndices[nextPosition];
  }

  const nextPosition = Math.max(0, Math.min(focusableIndices.length - 1, exactPosition + step));

  return focusableIndices[nextPosition];
}

export function getBoundaryRequestDiffRowIndex(rows = [], boundary = 'top') {
  const focusableIndices = getFocusableRowIndices(rows);

  if (focusableIndices.length === 0) {
    return boundary === 'bottom' ? Math.max(0, rows.length - 1) : 0;
  }

  return boundary === 'bottom' ? focusableIndices[focusableIndices.length - 1] : focusableIndices[0];
}

export function getRequestDiffVisibleCount(bottomOffset = 15, terminalRows = process.stdout.rows) {
  return Math.max(6, getTerminalRows(terminalRows) - bottomOffset);
}

export function isRequestDiffStackedLayout(terminalColumns = process.stdout.columns, layoutMode = 'auto') {
  const normalizedMode = normalizeRequestDiffLayoutMode(layoutMode);

  if (normalizedMode === 'stacked') {
    return true;
  }

  if (normalizedMode === 'side-by-side') {
    return false;
  }

  const columns = Number.isFinite(terminalColumns) && terminalColumns > 0
    ? Math.floor(terminalColumns)
    : 80;

  return columns < REQUEST_DIFF_STACKED_WIDTH;
}

export function getRequestDiffFocusablePosition(rows = [], focusedRow = 0) {
  const focusableIndices = getFocusableRowIndices(rows);

  if (focusableIndices.length === 0) {
    return {
      current: 0,
      total: 0
    };
  }

  const safeFocusedRow = clampRequestDiffRowIndex(focusedRow, rows);
  const exactPosition = focusableIndices.indexOf(safeFocusedRow);
  const current = exactPosition >= 0
    ? exactPosition + 1
    : Math.min(
      focusableIndices.length,
      Math.max(1, focusableIndices.filter((index) => index < safeFocusedRow).length + 1)
    );

  return {
    current,
    total: focusableIndices.length
  };
}

export function getRequestDiffPositionLabel(rows = [], focusedRow = 0) {
  const position = getRequestDiffFocusablePosition(rows, focusedRow);

  return `item ${position.current}/${position.total}`;
}

export function getRequestDiffHeaderText(diff, rows = getRequestDiffRows(diff), focusedRow = 0, layoutMode = 'auto') {
  const changeCount = diff?.changeCount ?? 0;
  const changeText = `${changeCount} ${changeCount === 1 ? 'change' : 'changes'}`;
  const layoutText = `${normalizeRequestDiffLayoutMode(layoutMode)} layout`;

  return `Request diff (experimental) | ${changeText} | ${getRequestDiffPositionLabel(rows, focusedRow)} | ${layoutText}`;
}

export function getRequestDiffSideBySideColumns(width = 80) {
  const safeWidth = Math.max(15, Math.floor(Number(width) || 80));
  const separatorWidth = 3;
  const minValueWidth = 4;
  const maxLabelWidth = safeWidth - separatorWidth - (minValueWidth * 2);
  const labelWidth = Math.max(
    4,
    Math.min(24, Math.max(10, Math.floor(safeWidth * 0.24)), maxLabelWidth)
  );
  const valueSpace = Math.max(minValueWidth * 2, safeWidth - labelWidth - separatorWidth);
  const leftWidth = Math.floor(valueSpace / 2);
  const rightWidth = valueSpace - leftWidth;

  return {
    labelWidth,
    leftWidth,
    rightWidth,
    separatorWidth,
    totalWidth: labelWidth + leftWidth + separatorWidth + rightWidth
  };
}

export function getRequestDiffFrameWidth(terminalColumns = process.stdout.columns) {
  const columns = Number.isFinite(terminalColumns) && terminalColumns > 0
    ? Math.floor(terminalColumns)
    : 80;

  return Math.max(42, columns - 4);
}

function wrapRequestDiffExpansionText(label, value, width, side) {
  const safeWidth = Math.max(8, Math.floor(Number(width) || 80));
  const prefix = `${label}: `;
  const continuationPrefix = ' '.repeat(prefix.length);
  const text = String(value ?? '').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
  const lines = [];
  let offset = 0;
  let firstLine = true;

  if (text.length === 0) {
    return [{
      side,
      text: truncate(prefix, safeWidth)
    }];
  }

  while (offset < text.length) {
    const linePrefix = firstLine ? prefix : continuationPrefix;
    const availableWidth = Math.max(1, safeWidth - linePrefix.length);
    const chunk = text.slice(offset, offset + availableWidth);

    lines.push({
      side,
      text: `${linePrefix}${chunk}`
    });
    offset += chunk.length;
    firstLine = false;
  }

  return lines;
}

export function getRequestDiffFocusedExpansionLines(row, width = 80) {
  if (!row?.isFocusable) {
    return [];
  }

  return [
    ...wrapRequestDiffExpansionText('field', row.fullLabel ?? row.label, width, 'field'),
    ...wrapRequestDiffExpansionText('A', row.fullLeftValue ?? row.leftValue, width, 'left'),
    ...wrapRequestDiffExpansionText('B', row.fullRightValue ?? row.rightValue, width, 'right')
  ];
}

export function getRequestDiffValueLines(row, width = 80) {
  return getRequestDiffFocusedExpansionLines(row, width);
}

export function clampRequestDiffValueScrollOffset(lines = [], scrollOffset = 0, visibleCount = 1) {
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const maxOffset = Math.max(0, lines.length - safeVisibleCount);
  const offset = Math.floor(Number(scrollOffset) || 0);

  return Math.max(0, Math.min(offset, maxOffset));
}

export function getRequestDiffValueScrollLabel(lines = [], scrollOffset = 0, visibleCount = 1) {
  if (!lines.length) {
    return 'line 0/0';
  }

  const safeOffset = clampRequestDiffValueScrollOffset(lines, scrollOffset, visibleCount);

  return `line ${safeOffset + 1}/${lines.length}`;
}

export function getRequestDiffVisibleStart(rows = [], focusedRow = 0, scrollOffset = 0, visibleCount = 1) {
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const maxStart = Math.max(0, rows.length - safeVisibleCount);
  const safeFocusedRow = clampRequestDiffRowIndex(focusedRow, rows);
  let start = Math.max(0, Math.min(Math.floor(Number(scrollOffset) || 0), maxStart));

  if (safeFocusedRow < start) {
    start = safeFocusedRow;
  } else if (safeFocusedRow >= start + safeVisibleCount) {
    start = Math.min(maxStart, safeFocusedRow - safeVisibleCount + 1);
  }

  return start;
}

function renderFixedText(key, width, text, props = {}) {
  const safeWidth = Math.max(1, Math.floor(Number(width) || 1));

  return h(
    Box,
    {
      key,
      flexShrink: 0,
      width: safeWidth
    },
    h(Text, {
      ...props,
      wrap: 'truncate'
    }, pad(truncate(text, safeWidth), safeWidth))
  );
}

function renderModalLine(key, width, text, props = {}) {
  return renderFixedText(key, width, text, props);
}

export function getRequestDiffFilterBoxLines({
  filterFocus = 'query',
  filterQuery = '',
  isFilterOpen = false,
  matchCase = false,
  openLabel = '/',
  rows = [],
  searchMode = 'words',
  totalRows = rows,
  width,
  wordMatchMode = 'and'
} = {}) {
  const sanitizedQuery = sanitizeDiffText(filterQuery ?? '');
  const matchCount = getRequestDiffFocusableCount(rows);
  const totalCount = Math.max(matchCount, getRequestDiffFocusableCount(totalRows));
  const normalizedSearchMode = SEARCH_MODES.includes(searchMode) ? searchMode : SEARCH_MODES[0];
  const normalizedWordMatchMode = WORD_MATCH_MODES.includes(wordMatchMode) ? wordMatchMode : WORD_MATCH_MODES[0];
  const normalizedFilterFocus = DIFF_FILTER_FOCUS_ORDER.includes(filterFocus) ? filterFocus : DIFF_FILTER_FOCUS_ORDER[0];
  const queryText = isFilterOpen
    ? `${sanitizedQuery}_`
    : (sanitizedQuery.trim() ? `"${sanitizedQuery.trim()}"` : '(empty)');
  const marker = (row) => isFilterOpen && normalizedFilterFocus === row ? '>' : ' ';
  const optionLine = (values, selected) => values
    .map((value) => value === selected ? `[${value}]` : value)
    .join(' ');
  const caseLine = matchCase ? 'ignore [match]' : '[ignore] match';
  const lines = [
    `Diff filter | matches ${matchCount}/${totalCount}`,
    `${marker('query')} query ${queryText}`,
    `${marker('mode')} mode ${optionLine(SEARCH_MODES, normalizedSearchMode)}`,
    `${marker('words')} words ${optionLine(WORD_MATCH_MODES, normalizedWordMatchMode)}`,
    `${marker('case')} case ${caseLine}`
  ];
  const warning = getSearchQueryWarning(sanitizedQuery, {
    matchCase,
    searchMode: normalizedSearchMode
  });
  const statusLine = warning || (isFilterOpen
    ? 'tab/down row  left/right/space change  enter/esc close  x clear'
    : `${openLabel} edit filter`);

  lines.push(statusLine);

  if (Number.isFinite(width) && width > 0) {
    const safeWidth = Math.floor(width);

    return lines.map((line) => truncate(line, safeWidth));
  }

  return lines;
}

export function getRequestDiffFilterBoxHeight(options = {}) {
  return REQUEST_DIFF_FILTER_BAR_HEIGHT;
}

export function shouldShowRequestDiffFilterBar({
  filterQuery = '',
  isFilterOpen = false
} = {}) {
  return Boolean(isFilterOpen || String(filterQuery ?? '').trim());
}

export function getRequestDiffBottomControlHeight(options = {}) {
  return shouldShowRequestDiffFilterBar(options) ? getRequestDiffFilterBoxHeight() : 0;
}

export const DiffFilterBar = React.memo(function DiffFilterBar({
  filterFocus = 'query',
  filterQuery = '',
  isFilterOpen = false,
  keyBindings = DEFAULT_KEY_BINDINGS,
  matchCase = false,
  rows = [],
  searchMode = 'words',
  totalRows = rows,
  wordMatchMode = 'and'
}) {
  const width = getRequestDiffFrameWidth();
  const contentWidth = Math.max(34, width - 4);
  const warning = getSearchQueryWarning(filterQuery, { matchCase, searchMode });
  const lines = getRequestDiffFilterBoxLines({
    filterFocus,
    filterQuery,
    isFilterOpen,
    matchCase,
    openLabel: getBindingLabel(keyBindings, 'diff.openFilter', { limit: 1 }),
    rows,
    searchMode,
    totalRows,
    width: contentWidth,
    wordMatchMode
  });

  return h(
    Box,
    {
      alignItems: 'flex-start',
      flexDirection: 'column'
    },
    h(
      Box,
      {
        borderStyle: 'single',
        borderColor: isFilterOpen ? 'cyan' : 'gray',
        flexDirection: 'column',
        paddingX: 1,
        width
      },
      ...lines.map((line, index) => renderModalLine(`diff-filter-bar:${index}`, contentWidth, line, {
        color: index === 0
          ? 'cyan'
          : (warning && index === lines.length - 1 ? 'yellow' : (isFilterOpen ? 'white' : 'gray'))
      }))
    )
  );
});

function getValueColor(row, side) {
  if (row.type === 'warning') {
    return 'yellow';
  }

  if (row.kind === 'added') {
    return side === 'right' ? 'green' : 'gray';
  }

  if (row.kind === 'removed') {
    return side === 'left' ? 'red' : 'gray';
  }

  return 'yellow';
}

function renderStackedRow(row, key, width, isFocused) {
  if (row.type === 'section') {
    return renderModalLine(key, width, row.text, { bold: true, color: 'cyan' });
  }

  if (row.type === 'empty') {
    return renderModalLine(key, width, row.text, { color: 'gray' });
  }

  const labelColor = row.type === 'warning' ? 'yellow' : 'cyan';
  const valueWidth = Math.max(20, width - 4);

  return h(
    Box,
    {
      key,
      flexDirection: 'column',
      width
    },
    h(Text, {
      bold: isFocused,
      color: labelColor,
      wrap: 'truncate'
    }, truncate(`${isFocused ? '>' : ' '} ${row.label}`, width)),
    h(Text, {
      color: getValueColor(row, 'left'),
      wrap: 'truncate'
    }, `  A ${truncate(row.leftValue, valueWidth)}`),
    h(Text, {
      color: getValueColor(row, 'right'),
      wrap: 'truncate'
    }, `  B ${truncate(row.rightValue, valueWidth)}`)
  );
}

function renderSideBySideRow(row, key, width, isFocused) {
  if (row.type === 'section') {
    return renderModalLine(key, width, row.text, { bold: true, color: 'cyan' });
  }

  if (row.type === 'empty') {
    return renderModalLine(key, width, row.text, { color: 'gray' });
  }

  const columns = getRequestDiffSideBySideColumns(width);
  const labelColor = row.type === 'warning' ? 'yellow' : 'cyan';

  return h(
    Box,
    {
      key,
      flexDirection: 'row',
      width
    },
    renderFixedText(`${key}:label`, columns.labelWidth, `${isFocused ? '>' : ' '} ${row.label}`, {
      bold: isFocused,
      color: labelColor
    }),
    renderFixedText(`${key}:left`, columns.leftWidth, row.leftValue, {
      color: getValueColor(row, 'left')
    }),
    renderFixedText(`${key}:separator`, columns.separatorWidth, ' | ', {
      color: 'gray'
    }),
    renderFixedText(`${key}:right`, columns.rightWidth, row.rightValue, {
      color: getValueColor(row, 'right')
    })
  );
}

function getExpansionColor(row, side) {
  if (side === 'meta') {
    return 'gray';
  }

  if (side === 'field') {
    return row.type === 'warning' ? 'yellow' : 'cyan';
  }

  return getValueColor(row, side);
}

function renderDiffValueLine(line, key, width, row) {
  return renderModalLine(key, width, line.text, {
    color: getExpansionColor(row, line.side)
  });
}

export const RequestDiffModal = React.memo(function RequestDiffModal({
  diff,
  focusedRow = 0,
  isValueOpen = false,
  keyBindings = DEFAULT_KEY_BINDINGS,
  layoutMode = 'auto',
  rows = getRequestDiffRows(diff),
  scrollOffset = 0,
  valueScrollOffset = 0,
  visibleCount = getRequestDiffVisibleCount()
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = getRequestDiffFrameWidth(columns);
  const contentWidth = Math.max(34, width - 4);
  const normalizedLayoutMode = normalizeRequestDiffLayoutMode(layoutMode);
  const stacked = isRequestDiffStackedLayout(columns, normalizedLayoutMode);
  const focusedVisibleRow = rows[focusedRow];
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const valueLines = isValueOpen ? getRequestDiffValueLines(focusedVisibleRow, contentWidth) : [];
  const safeValueScrollOffset = clampRequestDiffValueScrollOffset(valueLines, valueScrollOffset, safeVisibleCount);
  const visibleStart = getRequestDiffVisibleStart(rows, focusedRow, scrollOffset, safeVisibleCount);
  const visibleRows = rows.slice(visibleStart, visibleStart + safeVisibleCount);
  const changeLabel = getBindingPairLabel(keyBindings, 'diff.nextChange', 'diff.previousChange');
  const pageLabel = getBindingPairLabel(keyBindings, 'diff.pageUp', 'diff.pageDown', { separator: ' / ' });
  const toggleLayoutLabel = getBindingLabel(keyBindings, 'diff.toggleLayout', { limit: 1 });
  const filterLabel = getBindingLabel(keyBindings, 'diff.openFilter', { limit: 1 });
  const openValueLabel = getBindingLabel(keyBindings, 'diff.openFocusedRow', { limit: 1 });
  const closeLabel = getBindingLabel(keyBindings, 'diff.close', { limit: 2 });
  const valueScrollLabel = getBindingPairLabel(keyBindings, 'diffValue.scrollDown', 'diffValue.scrollUp');
  const valuePageLabel = getBindingPairLabel(keyBindings, 'diffValue.pageUp', 'diffValue.pageDown', { separator: ' / ' });
  const valueBoundaryLabel = getBindingPairLabel(keyBindings, 'diffValue.top', 'diffValue.bottom');
  const valueCloseLabel = getBindingLabel(keyBindings, 'diffValue.close', { limit: 3 });
  const renderRow = stacked ? renderStackedRow : renderSideBySideRow;
  const headerText = getRequestDiffHeaderText(diff, rows, focusedRow, normalizedLayoutMode);
  const renderedRows = isValueOpen ? [] : visibleRows.map((row, index) => {
    const absoluteIndex = visibleStart + index;
    const isFocused = absoluteIndex === focusedRow;

    return renderRow(row, row.id, contentWidth, isFocused);
  });
  const visibleValueLines = valueLines.slice(safeValueScrollOffset, safeValueScrollOffset + safeVisibleCount);
  const renderedValueRows = visibleValueLines.map((line, index) => renderDiffValueLine(
    line,
    `diff-value:${safeValueScrollOffset + index}`,
    contentWidth,
    focusedVisibleRow
  ));
  const renderedBodyRows = isValueOpen ? renderedValueRows : renderedRows;
  const fillerRowCount = Math.max(0, safeVisibleCount - renderedBodyRows.length);
  const fillerRows = Array.from({ length: fillerRowCount }, (_, index) => renderModalLine(
    `diff-filler:${index}`,
    contentWidth,
    ''
  ));
  const headerColumns = getRequestDiffSideBySideColumns(contentWidth);
  const hintText = isValueOpen
    ? `full row | ${getRequestDiffValueScrollLabel(valueLines, safeValueScrollOffset, safeVisibleCount)}  ${valueScrollLabel} scroll  ${valuePageLabel} page  ${valueBoundaryLabel} top/bottom  ${valueCloseLabel} back`
    : `${changeLabel} change  ${pageLabel} page  ${toggleLayoutLabel} layout  ${filterLabel} filter  ${openValueLabel} full row  ${closeLabel} close`;

  return h(
    Box,
    {
      flexGrow: 1,
      justifyContent: 'flex-start',
      alignItems: 'center'
    },
    h(
      Box,
      {
        borderStyle: 'single',
        borderColor: 'cyan',
        flexDirection: 'column',
        paddingX: 1,
        paddingY: 1,
        width
      },
      renderModalLine('diff-header', contentWidth, headerText, { bold: true, color: 'cyan' }),
      renderModalLine('diff-left-summary', contentWidth, `A ${diff?.leftSummary ?? ''}`, { color: 'gray' }),
      renderModalLine('diff-right-summary', contentWidth, `B ${diff?.rightSummary ?? ''}`, { color: 'gray' }),
      renderModalLine('diff-hints', contentWidth, hintText, { color: 'gray' }),
      renderModalLine('diff-spacer', contentWidth, ''),
      isValueOpen
        ? renderModalLine('diff-value-heading', contentWidth, 'full focused row', { color: 'gray' })
        : (stacked
        ? renderModalLine('diff-stacked-heading', contentWidth, 'stacked view', { color: 'gray' })
        : h(
          Box,
          { flexDirection: 'row', width: contentWidth },
          renderFixedText('diff-field-heading', headerColumns.labelWidth, 'field', { color: 'gray' }),
          renderFixedText('diff-left-heading', headerColumns.leftWidth, 'A', { color: 'gray' }),
          renderFixedText('diff-heading-separator', headerColumns.separatorWidth, ' | ', { color: 'gray' }),
          renderFixedText('diff-right-heading', headerColumns.rightWidth, 'B', { color: 'gray' })
        )),
      ...renderedBodyRows,
      ...fillerRows
    )
  );
});
