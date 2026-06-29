import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { getProxyOrigin, isPublicTargetUrl } from '../target.js';

const h = React.createElement;

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_OPTIONS = ['2xx', '3xx', '4xx', '5xx'];
const DETAIL_TABS = ['request', 'response'];
const SEARCH_FIELDS = ['all', 'path', 'status', 'method', 'time', 'host', 'port', 'headers', 'body'];
const FILTER_FOCUS_ORDER = ['query', 'field', 'method', 'status'];

const METHOD_COLORS = {
  GET: 'green',
  POST: 'cyan',
  PUT: 'yellow',
  PATCH: 'magenta',
  DELETE: 'red'
};

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
  const rows = Number.isFinite(terminalRows) && terminalRows > 0
    ? Math.floor(terminalRows)
    : 24;

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

function formatHeaders(headers) {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return ['(none)'];
  }

  return entries.map(([key, value]) => `${key}: ${value}`);
}

function formatPayloadBody(payload = {}) {
  const body = String(payload.body || '');
  const lines = body.length > 0 ? body.split('\n') : ['(empty)'];

  if (payload.truncated) {
    lines.push('[body truncated]');
  }

  return lines;
}

function headersToSearchText(headers = {}) {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
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

export function getSearchValues(log, searchField = 'all') {
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
      headersToSearchText(requestHeaders),
      log.request?.body,
      headersToSearchText(responseHeaders),
      log.response?.body
    ],
    body: [
      log.request?.body,
      log.response?.body
    ],
    headers: [
      headersToSearchText(requestHeaders),
      headersToSearchText(responseHeaders)
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

function matchesSearch(log, searchQuery, searchField = 'all') {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return getSearchValues(log, searchField)
    .some((value) => String(value ?? '').toLowerCase().includes(query));
}

export function filterLogs(logs, options = {}) {
  const methodFilters = normalizeFilterValues(options.methodFilters ?? options.methodFilter, METHOD_OPTIONS);
  const statusFilters = normalizeFilterValues(options.statusFilters ?? options.statusFilter, STATUS_OPTIONS);
  const searchQuery = options.searchQuery ?? '';
  const searchField = options.searchField ?? 'all';

  return logs.filter((log) => {
    return matchesMethodFilters(log, methodFilters) &&
      matchesStatusFilters(log, statusFilters) &&
      matchesSearch(log, searchQuery, searchField);
  });
}

export function cycleValue(values, currentValue, direction = 1) {
  const index = values.indexOf(currentValue);
  const currentIndex = index === -1 ? 0 : index;
  const nextIndex = (currentIndex + direction + values.length) % values.length;

  return values[nextIndex] ?? values[0];
}

export function getDetailLines(log, detailTab = 'request') {
  if (!log) {
    return [];
  }

  const payload = detailTab === 'response' ? log.response : log.request;
  const title = detailTab === 'response' ? 'Response' : 'Request';

  return [
    `${title} headers`,
    ...formatHeaders(payload.headers),
    '',
    `${title} body`,
    ...formatPayloadBody(payload)
  ];
}

export function getMaxScrollOffset(lines, visibleCount) {
  return Math.max(0, lines.length - Math.max(1, visibleCount));
}

const Header = React.memo(function Header({ context = {}, logsCount, visibleCount, isPaused }) {
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
    ? `${mode} | ${captureState} | ${targetKind} | proxy ${proxyOrigin} | ${countText}`
    : `${mode} | ${captureState} | ${target} | ${countText}`;

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
  const rows = process.stdout.rows || 24;
  const visibleCount = Math.max(5, rows - bottomOffset);
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
      width: 50,
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

const DetailPane = React.memo(function DetailPane({ bottomOffset, log, isFocused, detailTab, scrollOffset }) {
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

  const rows = process.stdout.rows || 24;
  const visibleCount = Math.max(4, rows - bottomOffset);
  const lines = getDetailLines(log, detailTab);
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

const Footer = React.memo(function Footer({
  isListFocused,
  isRawModeSupported,
  isFollowingLatest,
  isPaused,
  methodFilters,
  searchField,
  searchQuery,
  statusFilters
}) {
  const activeFilters = countActiveFilters({ methodFilters, statusFilters, searchQuery });
  const filterSummary = activeFilters > 0
    ? ` | filters ${activeFilters} (${formatFilterLabel(methodFilters, statusFilters, searchField, searchQuery)}) | x clear filters`
    : '';
  const navigationHelp = isListFocused ? 'up/down move | enter inspect' : 'up/down scroll';
  const text = isRawModeSupported
    ? `${navigationHelp} | tab ${isListFocused ? 'details' : 'traffic'} | r req/res | p ${isPaused ? 'resume' : 'pause'} | m methods | s statuses | / filter | c clear logs | f latest | q quit${filterSummary}`
    : 'keyboard input unavailable in this shell | Ctrl-C or SIGTERM quit';

  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { color: 'gray', wrap: 'truncate' },
      text
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

function KeyboardControls({
  filterFocus,
  isListFocused,
  isFilterOpen,
  onAppendSearch,
  onBackspaceSearch,
  onClearFilters,
  onClearLogs,
  onCycleFilterFocus,
  onFinishSearch,
  onFollowLatest,
  onInspectSelected,
  onMoveFilterOption,
  onMoveSelection,
  onOpenFilter,
  onQuit,
  onScrollDetails,
  onToggleFilterOption,
  onToggleDetailTab,
  onToggleFocus,
  onTogglePause
}) {
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      onQuit();
      return;
    }

    if (isFilterOpen) {
      if (key.escape || key.return) {
        onFinishSearch();
        return;
      }

      if (input === 'x') {
        onClearFilters();
        return;
      }

      if (key.tab || key.downArrow) {
        onCycleFilterFocus(1);
        return;
      }

      if (key.upArrow) {
        onCycleFilterFocus(-1);
        return;
      }

      if (key.rightArrow) {
        onMoveFilterOption(1);
        return;
      }

      if (key.leftArrow) {
        onMoveFilterOption(-1);
        return;
      }

      if (input === ' ' && filterFocus !== 'query') {
        onToggleFilterOption();
        return;
      }

      if (key.backspace || key.delete) {
        if (filterFocus === 'query') {
          onBackspaceSearch();
        }
        return;
      }

      if (input && !key.ctrl && !key.meta && filterFocus === 'query') {
        onAppendSearch(input);
      }

      return;
    }

    if (input === 'q') {
      onQuit();
      return;
    }

    if (input === '/') {
      onOpenFilter('query');
      return;
    }

    if (input === 'x') {
      onClearFilters();
      return;
    }

    if (input === 'c') {
      onClearLogs();
      return;
    }

    if (input === 'f') {
      onFollowLatest();
      return;
    }

    if (key.return) {
      onInspectSelected();
      return;
    }

    if (input === 'm') {
      onOpenFilter('method');
      return;
    }

    if (input === 'p') {
      onTogglePause();
      return;
    }

    if (input === 'r') {
      onToggleDetailTab();
      return;
    }

    if (input === 's') {
      onOpenFilter('status');
      return;
    }

    if (key.tab) {
      onToggleFocus();
      return;
    }

    if (key.upArrow) {
      if (isListFocused) {
        onMoveSelection(-1);
      } else {
        onScrollDetails(-1);
      }
    }

    if (key.downArrow) {
      if (isListFocused) {
        onMoveSelection(1);
      } else {
        onScrollDetails(1);
      }
    }

    if (key.pageUp && !isListFocused) {
      onScrollDetails(-5);
    }

    if (key.pageDown && !isListFocused) {
      onScrollDetails(5);
    }
  });

  return null;
}

export function App({
  stateStore,
  context = {},
  captureController = null,
  onQuit = () => {}
}) {
  const { isRawModeSupported } = useStdin();
  const renderHeight = getRenderHeight();
  const [logs, setLogs] = useState(() => stateStore.getLogs());
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

  const filteredLogs = useMemo(() => filterLogs(logs, {
    methodFilters,
    searchField,
    statusFilters,
    searchQuery
  }), [logs, methodFilters, searchField, statusFilters, searchQuery]);

  useEffect(() => {
    const handleUpdate = (updatedLogs) => setLogs(updatedLogs);

    stateStore.on('update', handleUpdate);

    return () => stateStore.off('update', handleUpdate);
  }, [stateStore]);

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
  const detailLines = useMemo(() => getDetailLines(inspectedLog, detailTab), [inspectedLog, detailTab]);
  const bottomOffset = isFilterOpen ? 19 : 13;
  const detailVisibleCount = Math.max(4, (process.stdout.rows || 24) - bottomOffset);
  const maxDetailScrollOffset = getMaxScrollOffset(detailLines, detailVisibleCount);
  const proxyOrigin = getProxyOrigin(context.port ?? 8080);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : 'Waiting for traffic...';

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
      paddingX: 1
    },
    isRawModeSupported
      ? h(KeyboardControls, {
        filterFocus,
        isListFocused,
        isFilterOpen,
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
        onOpenFilter: (focus) => {
          setFilterFocus(focus);
          setIsFilterOpen(true);
          setIsFollowingLatest(false);
        },
        onScrollDetails: (direction) => {
          setDetailScrollOffset((current) => Math.min(
            maxDetailScrollOffset,
            Math.max(0, current + direction)
          ));
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
        }
      })
      : null,
    h(Header, {
      context,
      logsCount: logs.length,
      visibleCount: filteredLogs.length,
      isPaused
    }),
    h(
      Box,
      { flexDirection: 'row', flexGrow: 1 },
      h(TrafficList, {
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
        bottomOffset,
        log: inspectedLog,
        isFocused: !isListFocused,
        detailTab,
        scrollOffset: detailScrollOffset
      })
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
        isListFocused,
        isRawModeSupported,
        isFollowingLatest,
        isPaused,
        methodFilters,
        searchField,
        searchQuery,
        statusFilters
      })
  );
}
