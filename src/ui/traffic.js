import React from 'react';
import { Box, Text } from 'ink';
import { isCookieHeaderName, maskCookieHeaderValue } from '../cookies.js';
import { getProxyOrigin, isPublicTargetUrl } from '../target.js';
import {
  DEFAULT_TRAFFIC_LIST_DISPLAY,
  FALLBACK_TERMINAL_COLUMNS,
  FRAMEWORK_ASSET_PATH_MATCHERS,
  FRAMEWORK_NAMES,
  FRAMEWORK_SOURCE_MODULE_PATTERN,
  h,
  METHOD_COLORS,
  METHOD_OPTIONS,
  MIN_DETAIL_PANE_WIDTH,
  MIN_TRAFFIC_PANE_WIDTH,
  OFF_RECORDING_STATUS,
  PANE_WIDTH_TARGETS,
  ROOT_PADDING_X,
  SEARCH_FIELDS,
  STATIC_ASSET_CONTENT_TYPE_PATTERNS,
  STATIC_ASSET_EXTENSION_PATTERN,
  STATIC_ASSET_FILE_PATTERN,
  STATUS_OPTIONS,
  TRAFFIC_COLUMN_WIDTHS,
  TRAFFIC_DENSITY_COLUMNS,
  TRAFFIC_DENSITY_PRESETS,
  TRAFFIC_LIST_WIDTH,
  TRAFFIC_PANE_GAP,
  TRAFFIC_PATH_MODES,
  TRAFFIC_ROW_WIDTH,
  TRAFFIC_WIDTH_MODES,
  formatOptionToken,
  getTrafficVisibleCount,
  pad,
  padLeft,
  truncate
} from './shared.js';
import {
  DEFAULT_KEY_BINDINGS,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';

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

function normalizeTrafficColumns(columns = {}) {
  return {
    duration: columns.duration !== false,
    method: columns.method !== false,
    status: columns.status !== false,
    time: columns.time !== false
  };
}

function columnsEqual(left = {}, right = {}) {
  const normalizedLeft = normalizeTrafficColumns(left);
  const normalizedRight = normalizeTrafficColumns(right);

  return ['duration', 'method', 'status', 'time'].every((column) => (
    normalizedLeft[column] === normalizedRight[column]
  ));
}

function getTrafficDensityForColumns(columns = {}) {
  const normalizedColumns = normalizeTrafficColumns(columns);
  const preset = TRAFFIC_DENSITY_PRESETS.find((density) => (
    columnsEqual(normalizedColumns, TRAFFIC_DENSITY_COLUMNS[density])
  ));

  return preset ?? 'custom';
}

export function normalizeTrafficListDisplay(display = {}) {
  const density = TRAFFIC_DENSITY_PRESETS.includes(display.density)
    ? display.density
    : (display.density === 'custom' ? 'custom' : DEFAULT_TRAFFIC_LIST_DISPLAY.density);
  const pathMode = TRAFFIC_PATH_MODES.includes(display.pathMode)
    ? display.pathMode
    : DEFAULT_TRAFFIC_LIST_DISPLAY.pathMode;
  const widthMode = TRAFFIC_WIDTH_MODES.includes(display.widthMode)
    ? display.widthMode
    : DEFAULT_TRAFFIC_LIST_DISPLAY.widthMode;
  const widthTarget = PANE_WIDTH_TARGETS.includes(display.widthTarget)
    ? display.widthTarget
    : DEFAULT_TRAFFIC_LIST_DISPLAY.widthTarget;
  const columns = display.columns
    ? normalizeTrafficColumns(display.columns)
    : { ...TRAFFIC_DENSITY_COLUMNS[density === 'custom' ? DEFAULT_TRAFFIC_LIST_DISPLAY.density : density] };

  return {
    columns,
    density: getTrafficDensityForColumns(columns),
    pathMode,
    widthMode,
    widthTarget
  };
}

export function applyTrafficDensity(display = {}, density = DEFAULT_TRAFFIC_LIST_DISPLAY.density) {
  const nextDensity = TRAFFIC_DENSITY_PRESETS.includes(density)
    ? density
    : DEFAULT_TRAFFIC_LIST_DISPLAY.density;

  return normalizeTrafficListDisplay({
    ...display,
    columns: { ...TRAFFIC_DENSITY_COLUMNS[nextDensity] },
    density: nextDensity
  });
}

export function cycleTrafficPathMode(display = {}, direction = 1) {
  const normalized = normalizeTrafficListDisplay(display);

  return {
    ...normalized,
    pathMode: cycleValue(TRAFFIC_PATH_MODES, normalized.pathMode, direction)
  };
}

export function cycleTrafficDensity(display = {}, direction = 1) {
  const normalized = normalizeTrafficListDisplay(display);
  const currentIndex = TRAFFIC_DENSITY_PRESETS.includes(normalized.density)
    ? TRAFFIC_DENSITY_PRESETS.indexOf(normalized.density)
    : -1;
  const nextIndex = currentIndex === -1
    ? 0
    : (currentIndex + direction + TRAFFIC_DENSITY_PRESETS.length) % TRAFFIC_DENSITY_PRESETS.length;

  return applyTrafficDensity(normalized, TRAFFIC_DENSITY_PRESETS[nextIndex]);
}

export function cyclePaneWidthMode(display = {}, isListFocused = true, direction = 1) {
  const normalized = normalizeTrafficListDisplay(display);
  const widthTarget = isListFocused ? 'traffic' : 'details';
  const widthModeCycle = widthTarget === 'details'
    ? ['half', 'normal', 'wide', 'full']
    : TRAFFIC_WIDTH_MODES;
  const shouldSwitchTarget = normalized.widthMode !== 'normal' &&
    normalized.widthMode !== 'half' &&
    normalized.widthTarget !== widthTarget;
  const widthMode = shouldSwitchTarget
    ? 'half'
    : cycleValue(widthModeCycle, normalized.widthMode, direction);

  return {
    ...normalized,
    widthMode,
    widthTarget: widthMode === 'normal' || widthMode === 'half'
      ? DEFAULT_TRAFFIC_LIST_DISPLAY.widthTarget
      : widthTarget
  };
}

export function cycleTrafficWidthMode(display = {}, direction = 1) {
  return cyclePaneWidthMode(display, true, direction);
}

export function cycleDetailWidthMode(display = {}, direction = 1) {
  return cyclePaneWidthMode(display, false, direction);
}

export function toggleTrafficColumn(display = {}, column) {
  if (!Object.prototype.hasOwnProperty.call(TRAFFIC_COLUMN_WIDTHS, column)) {
    return normalizeTrafficListDisplay(display);
  }

  const normalized = normalizeTrafficListDisplay(display);
  const columns = {
    ...normalized.columns,
    [column]: !normalized.columns[column]
  };

  return normalizeTrafficListDisplay({
    ...normalized,
    columns
  });
}

export function formatPathForMode(value, maxLength, mode = 'smart') {
  const text = String(value ?? '');
  const width = Math.max(0, Math.floor(Number(maxLength) || 0));

  if (text.length <= width) {
    return text;
  }

  if (width <= 0) {
    return '';
  }

  if (width <= 3) {
    return text.slice(0, width);
  }

  if (mode === 'end') {
    return `...${text.slice(-(width - 3))}`;
  }

  if (mode === 'start') {
    return `${text.slice(0, width - 3)}...`;
  }

  const available = width - 3;
  const startLength = Math.ceil(available / 2);
  const endLength = Math.floor(available / 2);

  return `${text.slice(0, startLength)}...${text.slice(-endLength)}`;
}

function getTerminalColumns(terminalColumns = process.stdout.columns) {
  return Number.isFinite(terminalColumns) && terminalColumns > 0
    ? Math.floor(terminalColumns)
    : FALLBACK_TERMINAL_COLUMNS;
}

function createPaneLayout(trafficPaneWidth, detailPaneWidth, availableWidth) {
  const safeTrafficPaneWidth = Math.max(0, Math.floor(Number(trafficPaneWidth) || 0));
  const safeDetailPaneWidth = Math.max(0, Math.floor(Number(detailPaneWidth) || 0));
  const showTrafficPane = safeTrafficPaneWidth > 0;
  const showDetailPane = safeDetailPaneWidth > 0;
  const gapWidth = showTrafficPane && showDetailPane ? TRAFFIC_PANE_GAP : 0;

  return {
    availableWidth,
    detailPaneWidth: safeDetailPaneWidth,
    gapWidth,
    showDetailPane,
    showTrafficPane,
    trafficPaneWidth: safeTrafficPaneWidth
  };
}

export function getPaneLayout(display = {}, terminalColumns = process.stdout.columns) {
  const normalized = normalizeTrafficListDisplay(display);
  const availableWidth = Math.max(1, getTerminalColumns(terminalColumns) - (ROOT_PADDING_X * 2));
  const normalWidth = Math.min(TRAFFIC_LIST_WIDTH, availableWidth);

  if (normalized.widthMode === 'full') {
    return normalized.widthTarget === 'details'
      ? createPaneLayout(0, availableWidth, availableWidth)
      : createPaneLayout(availableWidth, 0, availableWidth);
  }

  if (normalized.widthMode === 'half') {
    if (availableWidth < MIN_TRAFFIC_PANE_WIDTH + MIN_DETAIL_PANE_WIDTH + TRAFFIC_PANE_GAP) {
      return createPaneLayout(0, availableWidth, availableWidth);
    }

    const splitWidth = availableWidth - TRAFFIC_PANE_GAP;
    const trafficPaneWidth = Math.floor(splitWidth / 2);
    const detailPaneWidth = splitWidth - trafficPaneWidth;

    return createPaneLayout(trafficPaneWidth, detailPaneWidth, availableWidth);
  }

  if (normalized.widthMode === 'wide' && normalized.widthTarget === 'traffic') {
    const desiredTrafficWidth = Math.floor((availableWidth - TRAFFIC_PANE_GAP) * 2 / 3);
    const maxTrafficWidthWithDetails = Math.max(
      normalWidth,
      availableWidth - MIN_DETAIL_PANE_WIDTH - TRAFFIC_PANE_GAP
    );
    const trafficPaneWidth = Math.max(
      normalWidth,
      Math.min(desiredTrafficWidth, maxTrafficWidthWithDetails, availableWidth)
    );
    const detailPaneWidth = trafficPaneWidth >= availableWidth
      ? 0
      : Math.max(0, availableWidth - trafficPaneWidth - TRAFFIC_PANE_GAP);

    return createPaneLayout(trafficPaneWidth, detailPaneWidth, availableWidth);
  }

  if (normalized.widthMode === 'wide' && normalized.widthTarget === 'details') {
    if (availableWidth < MIN_TRAFFIC_PANE_WIDTH + MIN_DETAIL_PANE_WIDTH + TRAFFIC_PANE_GAP) {
      return createPaneLayout(0, availableWidth, availableWidth);
    }

    const normalDetailWidth = normalWidth >= availableWidth
      ? 0
      : Math.max(0, availableWidth - normalWidth - TRAFFIC_PANE_GAP);
    const desiredDetailWidth = Math.ceil((availableWidth - TRAFFIC_PANE_GAP) * 2 / 3);
    const maxDetailWidthWithTraffic = availableWidth - MIN_TRAFFIC_PANE_WIDTH - TRAFFIC_PANE_GAP;
    const minimumWideDetailWidth = normalDetailWidth > 0
      ? Math.ceil((normalDetailWidth + Math.max(normalDetailWidth, maxDetailWidthWithTraffic)) / 2)
      : MIN_DETAIL_PANE_WIDTH;
    const detailPaneWidth = Math.max(
      MIN_DETAIL_PANE_WIDTH,
      Math.min(Math.max(desiredDetailWidth, minimumWideDetailWidth), maxDetailWidthWithTraffic, availableWidth)
    );
    const trafficPaneWidth = detailPaneWidth >= availableWidth
      ? 0
      : Math.max(0, availableWidth - detailPaneWidth - TRAFFIC_PANE_GAP);

    return createPaneLayout(trafficPaneWidth, detailPaneWidth, availableWidth);
  }

  const detailPaneWidth = normalWidth >= availableWidth
    ? 0
    : Math.max(0, availableWidth - normalWidth - TRAFFIC_PANE_GAP);

  return createPaneLayout(normalWidth, detailPaneWidth, availableWidth);
}

export function getTrafficPaneWidth(widthMode = DEFAULT_TRAFFIC_LIST_DISPLAY.widthMode, terminalColumns = process.stdout.columns) {
  return getPaneLayout({
    widthMode,
    widthTarget: 'traffic'
  }, terminalColumns).trafficPaneWidth;
}

export function getTrafficRowWidth(paneWidth = TRAFFIC_LIST_WIDTH) {
  return Math.max(4, Math.floor(Number(paneWidth) || TRAFFIC_LIST_WIDTH) - 5);
}

function getTrafficPathWidth(display = {}, rowWidth = TRAFFIC_ROW_WIDTH) {
  const { columns } = normalizeTrafficListDisplay(display);
  const nonPathWidth = 1 +
    (columns.time ? TRAFFIC_COLUMN_WIDTHS.time : 0) +
    (columns.method ? TRAFFIC_COLUMN_WIDTHS.method : 0) +
    (columns.status ? TRAFFIC_COLUMN_WIDTHS.status : 0) +
    (columns.duration ? TRAFFIC_COLUMN_WIDTHS.duration : 0);
  const tokenCount = 2 +
    (columns.time ? 1 : 0) +
    (columns.method ? 1 : 0) +
    (columns.status ? 1 : 0) +
    (columns.duration ? 1 : 0);
  const spaces = Math.max(0, tokenCount - 1);

  return Math.max(4, rowWidth - nonPathWidth - spaces);
}

export function formatTrafficHeader(display = {}, rowWidth = TRAFFIC_ROW_WIDTH) {
  const normalized = normalizeTrafficListDisplay(display);
  const { columns } = normalized;
  const pathWidth = getTrafficPathWidth(normalized, rowWidth);
  const tokens = [' '];

  if (columns.time) {
    tokens.push(pad('time', TRAFFIC_COLUMN_WIDTHS.time));
  }

  if (columns.method) {
    tokens.push(pad('meth', TRAFFIC_COLUMN_WIDTHS.method));
  }

  if (columns.status) {
    tokens.push(pad('st', TRAFFIC_COLUMN_WIDTHS.status));
  }

  tokens.push(pad('path', pathWidth));

  if (columns.duration) {
    tokens.push(pad('dur', TRAFFIC_COLUMN_WIDTHS.duration));
  }

  return tokens.join(' ');
}

export function formatTrafficRow(log, selected = false, display = {}, rowWidth = TRAFFIC_ROW_WIDTH) {
  const normalized = normalizeTrafficListDisplay(display);
  const { columns } = normalized;
  const pathWidth = getTrafficPathWidth(normalized, rowWidth);
  const tokens = [selected ? '>' : ' '];

  if (columns.time) {
    tokens.push(formatTime(log.timestamp));
  }

  if (columns.method) {
    tokens.push(pad(log.method, TRAFFIC_COLUMN_WIDTHS.method));
  }

  if (columns.status) {
    tokens.push(String(log.statusCode ?? '---').padEnd(TRAFFIC_COLUMN_WIDTHS.status));
  }

  tokens.push(pad(formatPathForMode(log.path, pathWidth, normalized.pathMode), pathWidth));

  if (columns.duration) {
    tokens.push(padLeft(`${log.responseTimeMs}ms`, TRAFFIC_COLUMN_WIDTHS.duration));
  }

  return tokens.join(' ');
}

export function getRecordingStatus(trafficRecorder) {
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

export function getDisplayHeaderValue(key, value, options = {}) {
  const publicTargetValue = getPublicTargetHeaderDisplayValue(key, value, options);

  if (publicTargetValue !== null) {
    return publicTargetValue;
  }

  if (!options.showCookieValues && isCookieHeaderName(key)) {
    return maskCookieHeaderValue(key, value);
  }

  return value;
}

export function getHeaderValue(headers = {}, key) {
  const normalizedKey = String(key ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([headerKey]) => String(headerKey).toLowerCase() === normalizedKey);

  if (!entry) {
    return '';
  }

  const value = entry[1];

  return Array.isArray(value) ? value.join(', ') : String(value);
}

export function getHeaderTokens(headers, key) {
  return getHeaderValue(headers, key)
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getContentType(headers = {}) {
  return normalizeContentType(getHeaderValue(headers, 'content-type'));
}

function normalizeContentType(value = '') {
  return String(value ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function headerValueLines(key, value, options = {}) {
  const displayValue = getDisplayHeaderValue(key, value, options);
  const values = Array.isArray(displayValue) ? displayValue : [displayValue];

  return values.map((item) => `${key}: ${String(item)}`);
}

function getLogPathname(log = {}) {
  const path = String(log.path ?? '');

  try {
    return new URL(path, 'http://clinspect.local').pathname;
  } catch {
    return path.split(/[?#]/)[0];
  }
}

function hasQueryParam(log = {}, key = '') {
  const path = String(log.path ?? '');

  try {
    return new URL(path, 'http://clinspect.local').searchParams.has(key);
  } catch {
    return new RegExp(`(?:^|[?&])${key}(?:=|&|$)`, 'i').test(path);
  }
}

function isStaticAssetContentType(contentType = '') {
  return STATIC_ASSET_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function getFrameworkPathMatch(pathname = '') {
  return FRAMEWORK_ASSET_PATH_MATCHERS.find((matcher) => (
    matcher.patterns.some((pattern) => pattern.test(pathname))
  )) ?? null;
}

function getSearchHeaderText(log = {}, side = 'request') {
  const key = side === 'request' ? 'requestHeaders' : 'responseHeaders';

  return String(log.search?.[key] ?? '');
}

function headerLineMatches(line = '', key = '') {
  const colonIndex = line.indexOf(':');

  if (colonIndex === -1) {
    return false;
  }

  return line.slice(0, colonIndex).trim().toLowerCase() === String(key).toLowerCase();
}

function getHeaderValueFromSearchText(text = '', key = '') {
  const line = String(text)
    .split(/\r?\n/)
    .find((item) => headerLineMatches(item, key));

  if (!line) {
    return '';
  }

  return line.slice(line.indexOf(':') + 1).trim();
}

function hasHeaderInSearchText(text = '', key = '') {
  return String(text)
    .split(/\r?\n/)
    .some((line) => headerLineMatches(line, key));
}

function getIndexedHeaderValue(log = {}, side = 'request', key = '') {
  const directValue = getHeaderValue(log[side]?.headers ?? {}, key);

  return directValue || getHeaderValueFromSearchText(getSearchHeaderText(log, side), key);
}

function hasIndexedHeader(log = {}, side = 'request', key = '') {
  const normalizedKey = String(key).toLowerCase();
  const headers = log[side]?.headers ?? {};
  const hasDirectHeader = Object.keys(headers)
    .some((headerKey) => headerKey.toLowerCase() === normalizedKey);

  return hasDirectHeader || hasHeaderInSearchText(getSearchHeaderText(log, side), key);
}

function isNextRscRequest(log = {}) {
  if (hasQueryParam(log, '_rsc')) {
    return true;
  }

  const responseContentType = normalizeContentType(
    log.search?.responseContentType ?? getHeaderValue(log.response?.headers ?? {}, 'content-type')
  );

  if (responseContentType === 'text/x-component') {
    return true;
  }

  const matchedPath = getIndexedHeaderValue(log, 'response', 'x-matched-path');

  if (String(matchedPath).trim().toLowerCase().endsWith('.rsc')) {
    return true;
  }

  return [
    'rsc',
    'next-router-prefetch',
    'next-router-state-tree',
    'next-router-segment-prefetch'
  ].some((header) => hasIndexedHeader(log, 'request', header));
}

export function classifyFrameworkAssetRequest(log = {}) {
  const method = String(log.method ?? 'GET').toUpperCase();

  if (method !== 'GET' && method !== 'HEAD') {
    return {
      framework: null,
      isAsset: false,
      reason: null
    };
  }

  const pathname = getLogPathname(log);

  if (!pathname) {
    return {
      framework: null,
      isAsset: false,
      reason: null
    };
  }

  const frameworkMatch = getFrameworkPathMatch(pathname);

  if (frameworkMatch) {
    return {
      framework: frameworkMatch.framework,
      isAsset: true,
      reason: 'framework-path'
    };
  }

  if (isNextRscRequest(log)) {
    return {
      framework: 'Next.js',
      isAsset: true,
      reason: 'next-rsc'
    };
  }

  if (FRAMEWORK_SOURCE_MODULE_PATTERN.test(pathname)) {
    return {
      framework: null,
      isAsset: true,
      reason: 'source-module'
    };
  }

  if (STATIC_ASSET_FILE_PATTERN.test(pathname)) {
    return {
      framework: null,
      isAsset: true,
      reason: 'static-file'
    };
  }

  if (STATIC_ASSET_EXTENSION_PATTERN.test(pathname)) {
    return {
      framework: null,
      isAsset: true,
      reason: 'extension'
    };
  }

  const responseContentType = normalizeContentType(
    log.search?.responseContentType ?? getHeaderValue(log.response?.headers ?? {}, 'content-type')
  );

  if (isStaticAssetContentType(responseContentType)) {
    return {
      framework: null,
      isAsset: true,
      reason: 'content-type'
    };
  }

  return {
    framework: null,
    isAsset: false,
    reason: null
  };
}

export function isFrameworkAssetRequest(log = {}) {
  return classifyFrameworkAssetRequest(log).isAsset;
}

export function summarizeFrameworkAssets(logs = []) {
  const frameworkCounts = new Map();
  let assetCount = 0;

  logs.forEach((log) => {
    const classification = classifyFrameworkAssetRequest(log);

    if (!classification.isAsset) {
      return;
    }

    assetCount += 1;

    if (classification.framework) {
      frameworkCounts.set(
        classification.framework,
        (frameworkCounts.get(classification.framework) ?? 0) + 1
      );
    }
  });

  const frameworks = FRAMEWORK_NAMES
    .map((framework) => ({
      count: frameworkCounts.get(framework) ?? 0,
      framework
    }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || FRAMEWORK_NAMES.indexOf(left.framework) - FRAMEWORK_NAMES.indexOf(right.framework));
  const topFramework = frameworks[0] ?? null;

  return {
    additionalFrameworkCount: Math.max(0, frameworks.length - 1),
    assetCount,
    framework: topFramework?.framework ?? null,
    frameworkCount: topFramework?.count ?? 0,
    frameworks
  };
}

export function formatFrameworkDetectionLabel(summary = {}) {
  const framework = summary.framework ?? null;

  if (!framework) {
    return '';
  }

  const additional = Number(summary.additionalFrameworkCount ?? 0);

  return `${framework}?${additional > 0 ? `+${additional}` : ''}`;
}


function headersToSearchText(headers = {}, options = {}) {
  return Object.entries(headers)
    .flatMap(([key, value]) => headerValueLines(key, value, options))
    .join('\n');
}

function getIndexedHeaderSearchText(log = {}, side = 'request', options = {}) {
  const search = log.search ?? null;

  if (!search) {
    return headersToSearchText(log[side]?.headers ?? {}, options);
  }

  const rawKey = side === 'request' ? 'requestHeaders' : 'responseHeaders';
  const maskedKey = side === 'request' ? 'requestHeadersMasked' : 'responseHeadersMasked';

  return options.showCookieValues
    ? (search[rawKey] ?? '')
    : (search[maskedKey] ?? search[rawKey] ?? '');
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

export function formatSearchFieldLabel(searchField) {
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
  const host = log.search?.host ?? requestHeaders.host ?? '';
  const port = log.search?.port ?? extractPortFromHost(host);
  const requestHeaderSearch = getIndexedHeaderSearchText(log, 'request', options);
  const responseHeaderSearch = getIndexedHeaderSearchText(log, 'response', options);
  const values = {
    all: [
      log.method,
      log.path,
      String(log.statusCode ?? ''),
      formatTime(log.timestamp),
      host,
      port,
      requestHeaderSearch,
      log.request?.body,
      responseHeaderSearch,
      log.response?.body
    ],
    body: [
      log.request?.body,
      log.response?.body
    ],
    headers: [
      requestHeaderSearch,
      responseHeaderSearch
    ],
    host: [host],
    method: [log.method],
    path: [log.path],
    port: [port],
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
  const hideFrameworkAssets = options.hideFrameworkAssets !== false;

  return logs.filter((log) => {
    return (!hideFrameworkAssets || !isFrameworkAssetRequest(log)) &&
      matchesMethodFilters(log, methodFilters) &&
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


export function getBoundaryLogId(logs, boundary) {
  if (logs.length === 0) {
    return null;
  }

  return boundary === 'last' ? logs[logs.length - 1].id : logs[0].id;
}


function formatStaticAssetsListLabel(summary = {}, hideFrameworkAssets = true) {
  const assetCount = Number(summary.assetCount ?? 0);
  const state = hideFrameworkAssets ? 'hidden' : 'shown';

  return assetCount > 0 ? `${assetCount} ${state}` : `framework ${state}`;
}

function formatStaticAssetsHeaderLabel(summary = {}, hideFrameworkAssets = true) {
  const assetCount = Number(summary.assetCount ?? 0);

  if (assetCount <= 0) {
    return '';
  }

  return hideFrameworkAssets ? `${assetCount} hidden` : 'shown';
}

function formatHeaderFrameworkSignals(summary = {}, hideFrameworkAssets = true) {
  return [
    formatFrameworkDetectionLabel(summary),
    formatStaticAssetsHeaderLabel(summary, hideFrameworkAssets)
  ].filter(Boolean);
}

export const Header = React.memo(function Header({
  context = {},
  frameworkSummary,
  hideFrameworkAssets,
  logsCount,
  recordingStatus,
  visibleCount,
  isPaused
}) {
  const frameworkSignals = formatHeaderFrameworkSignals(frameworkSummary, hideFrameworkAssets);

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
    const compactTargetText = [targetText, ...frameworkSignals].join(' | ');

    return h(
      Box,
      { flexDirection: 'column', marginBottom: 1 },
      h(Text, { color: 'cyan', bold: true }, 'clinspect'),
      h(
        Text,
        { color: 'gray', wrap: 'truncate' },
        [
          'recorded session',
          basename(context.sessionPath),
          countText,
          `skipped ${loadedSession.skippedLines ?? 0}`,
        ].join(' | ')
      ),
      h(Text, { color: 'gray', wrap: 'truncate' }, `${sourceText} | ${compactTargetText}`)
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
  const targetLine = [`target ${target}`, ...frameworkSignals].join(' | ');
  const subtitle = context.mode === 'live'
    ? [
      mode,
      captureState,
      targetKind,
      `proxy ${proxyOrigin}`,
      countText,
      formatRecordingLabel(recordingStatus)
    ].join(' | ')
    : [
      mode,
      captureState,
      target,
      countText,
      formatRecordingLabel(recordingStatus)
    ].join(' | ');

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'cyan', bold: true }, 'clinspect'),
    h(Text, { color: 'gray', wrap: 'truncate' }, subtitle),
    context.mode === 'live'
      ? h(Text, { color: 'gray', wrap: 'truncate' }, targetLine)
      : null
  );
});

export function formatFilterLabel(methodFilters, statusFilters, searchField, searchQuery, options = {}) {
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

  if (options.hideFrameworkAssets !== undefined) {
    parts.push(formatStaticAssetsListLabel(options.frameworkSummary, options.hideFrameworkAssets));
  }

  if (searchField === 'body' && searchQuery.trim() && Number(options.coldEntryCount ?? 0) > 0) {
    parts.push('cold bodies load on inspect');
  }

  return parts.length > 0 ? parts.join(' | ') : 'none';
}

export const TrafficList = React.memo(function TrafficList({
  bottomOffset,
  emptyText,
  logs,
  totalCount,
  selectedIndex,
  isFocused,
  isFollowingLatest,
  frameworkSummary,
  historyStatus,
  hideFrameworkAssets,
  listDisplay,
  methodFilters,
  marginRight = TRAFFIC_PANE_GAP,
  paneWidth = TRAFFIC_LIST_WIDTH,
  statusFilters,
  searchField,
  searchQuery
}) {
  const normalizedDisplay = normalizeTrafficListDisplay(listDisplay);
  const rowWidth = getTrafficRowWidth(paneWidth);
  const visibleCount = getTrafficVisibleCount(bottomOffset);
  const startIndex = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    Math.max(0, logs.length - visibleCount)
  ));
  const visibleLogs = logs.slice(startIndex, startIndex + visibleCount);
  const filterLabel = formatFilterLabel(methodFilters, statusFilters, searchField, searchQuery, {
    coldEntryCount: historyStatus?.coldEntries ?? 0,
    frameworkSummary,
    hideFrameworkAssets
  });
  const displayLabel = `${normalizedDisplay.density}/${normalizedDisplay.pathMode}`;
  const noRowsText = totalCount === 0 ? emptyText : 'No matching traffic';

  return h(
    Box,
    {
      flexDirection: 'column',
      width: paneWidth,
      flexShrink: 0,
      borderStyle: 'single',
      borderColor: isFocused ? 'cyan' : 'gray',
      paddingX: 1,
      marginRight
    },
    h(Text, { bold: true }, `Traffic ${isFocused ? 'focused' : 'idle'} | ${isFollowingLatest ? 'follow' : 'hold'}`),
    h(Text, { color: 'gray', wrap: 'truncate' }, `filters ${filterLabel} | view ${displayLabel}`),
    h(Text, { color: 'gray' }, formatTrafficHeader(normalizedDisplay, rowWidth)),
    logs.length === 0
      ? h(Text, { color: 'gray', wrap: 'truncate' }, noRowsText)
      : visibleLogs.map((log, offset) => {
        const absoluteIndex = startIndex + offset;
        const selected = absoluteIndex === selectedIndex;
        const row = formatTrafficRow(log, selected, normalizedDisplay, rowWidth);

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

export const FilterBar = React.memo(function FilterBar({
  filterFocus,
  historyStatus,
  keyBindings = DEFAULT_KEY_BINDINGS,
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
  const bodySearchColdHint = searchField === 'body' &&
    searchQuery.trim() &&
    Number(historyStatus?.coldEntries ?? 0) > 0
    ? `${historyStatus.coldEntries} cold entries: body text loads when inspected`
    : '';

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
    bodySearchColdHint
      ? h(Text, { color: 'yellow', wrap: 'truncate' }, bodySearchColdHint)
      : null,
    h(Text, { color: 'gray', wrap: 'truncate' }, `${getBindingPairLabel(keyBindings, 'filter.previousField', 'filter.nextField')} row | ${getBindingPairLabel(keyBindings, 'filter.previousOption', 'filter.nextOption')} option | ${getBindingLabel(keyBindings, 'filter.toggleOption', { limit: 1 })} select | ${getBindingLabel(keyBindings, 'filter.clear', { limit: 1 })} clear filters | ${getBindingLabel(keyBindings, 'filter.close', { limit: 2 })} close`)
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

export function getMouseWheelTarget(column, layoutOrTrafficPaneWidth = TRAFFIC_LIST_WIDTH, showTrafficPane = true) {
  const value = Number(column);
  const layout = typeof layoutOrTrafficPaneWidth === 'object' && layoutOrTrafficPaneWidth !== null
    ? layoutOrTrafficPaneWidth
    : {
      showTrafficPane,
      trafficPaneWidth: Math.max(0, Math.floor(Number(layoutOrTrafficPaneWidth) || TRAFFIC_LIST_WIDTH))
    };

  if (!layout.showTrafficPane) {
    return 'details';
  }

  const trafficEndColumn = ROOT_PADDING_X + Math.max(0, Math.floor(Number(layout.trafficPaneWidth) || 0));

  if (Number.isSafeInteger(value) && value > 0 && value <= trafficEndColumn) {
    return 'traffic';
  }

  return 'details';
}
