import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';
import { getProxyOrigin, isPublicTargetUrl } from '../target.js';

const h = React.createElement;

const METHOD_FILTERS = ['all', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_FILTERS = ['all', '2xx', '3xx', '4xx', '5xx'];
const DETAIL_TABS = ['request', 'response'];

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

function matchesStatusFilter(log, statusFilter) {
  if (statusFilter === 'all') {
    return true;
  }

  const statusCode = Number(log.statusCode);

  if (!Number.isInteger(statusCode)) {
    return false;
  }

  return Math.floor(statusCode / 100) === Number(statusFilter[0]);
}

function matchesSearch(log, searchQuery) {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  return [
    log.method,
    log.path,
    String(log.statusCode ?? ''),
    headersToSearchText(log.request?.headers),
    log.request?.body,
    headersToSearchText(log.response?.headers),
    log.response?.body
  ].some((value) => String(value ?? '').toLowerCase().includes(query));
}

export function filterLogs(logs, options = {}) {
  const methodFilter = options.methodFilter ?? 'all';
  const statusFilter = options.statusFilter ?? 'all';
  const searchQuery = options.searchQuery ?? '';

  return logs.filter((log) => {
    if (methodFilter !== 'all' && log.method !== methodFilter) {
      return false;
    }

    return matchesStatusFilter(log, statusFilter) && matchesSearch(log, searchQuery);
  });
}

export function cycleValue(values, currentValue) {
  const index = values.indexOf(currentValue);

  return values[(index + 1) % values.length] ?? values[0];
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

function Header({ context = {}, logsCount, visibleCount, isPaused }) {
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
}

function formatFilterLabel(methodFilter, statusFilter, searchQuery) {
  const filters = `${methodFilter}/${statusFilter}`;
  const search = searchQuery.trim() ? `/${truncate(searchQuery, 16)}` : '';

  return `${filters}${search}`;
}

function TrafficList({
  emptyText,
  logs,
  totalCount,
  selectedIndex,
  isFocused,
  isFollowingLatest,
  methodFilter,
  statusFilter,
  searchQuery
}) {
  const rows = process.stdout.rows || 24;
  const visibleCount = Math.max(5, rows - 13);
  const startIndex = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    Math.max(0, logs.length - visibleCount)
  ));
  const visibleLogs = logs.slice(startIndex, startIndex + visibleCount);
  const filterLabel = formatFilterLabel(methodFilter, statusFilter, searchQuery);
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
    h(Text, { color: 'gray' }, '  time     meth   st  path'),
    logs.length === 0
      ? h(Text, { color: 'gray', wrap: 'truncate' }, noRowsText)
      : visibleLogs.map((log, offset) => {
        const absoluteIndex = startIndex + offset;
        const selected = absoluteIndex === selectedIndex;
        const marker = selected ? '>' : ' ';
        const method = pad(log.method, 6);
        const status = String(log.statusCode ?? '---').padEnd(3);
        const row = `${marker} ${formatTime(log.timestamp)} ${method} ${status} ${truncate(log.path, 16)} ${log.responseTimeMs}ms`;

        return h(
          Text,
          {
            key: log.id,
            color: selected ? 'black' : rowColor(log),
            backgroundColor: selected ? 'cyan' : undefined,
            wrap: 'truncate'
          },
          row
        );
      })
  );
}

function DetailPane({ log, isFocused, detailTab, scrollOffset }) {
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
      h(Text, { color: 'gray' }, 'No request selected')
    );
  }

  const rows = process.stdout.rows || 24;
  const visibleCount = Math.max(4, rows - 13);
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
}

function Footer({
  isListFocused,
  isRawModeSupported,
  isFollowingLatest,
  isPaused,
  isSearchEditing,
  searchQuery
}) {
  const text = isRawModeSupported
    ? `up/down ${isListFocused ? 'inspect' : 'scroll'} | tab ${isListFocused ? 'traffic' : 'details'} | r req/res | p ${isPaused ? 'resume' : 'pause'} | m method | s status | / search ${isSearchEditing ? `[${searchQuery}]` : ''} | c clear | f latest | q quit`
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
}

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
  isListFocused,
  isSearchEditing,
  onAppendSearch,
  onBackspaceSearch,
  onClearLogs,
  onCycleMethod,
  onCycleStatus,
  onFinishSearch,
  onFollowLatest,
  onMoveSelection,
  onQuit,
  onScrollDetails,
  onStartSearch,
  onToggleDetailTab,
  onToggleFocus,
  onTogglePause
}) {
  useInput((input, key) => {
    if (input === 'c' && key.ctrl) {
      onQuit();
      return;
    }

    if (isSearchEditing) {
      if (key.escape || key.return) {
        onFinishSearch();
        return;
      }

      if (key.backspace || key.delete) {
        onBackspaceSearch();
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        onAppendSearch(input);
      }

      return;
    }

    if (input === 'q') {
      onQuit();
      return;
    }

    if (input === '/') {
      onStartSearch();
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

    if (input === 'm') {
      onCycleMethod();
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
      onCycleStatus();
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
  const [logs, setLogs] = useState(() => stateStore.getLogs());
  const [selectedLogId, setSelectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [isFollowingLatest, setIsFollowingLatest] = useState(false);
  const [isListFocused, setIsListFocused] = useState(true);
  const [isPaused, setIsPaused] = useState(() => captureController?.isPaused?.() ?? false);
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchEditing, setIsSearchEditing] = useState(false);
  const [detailTab, setDetailTab] = useState('request');
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);

  const filteredLogs = useMemo(() => filterLogs(logs, {
    methodFilter,
    statusFilter,
    searchQuery
  }), [logs, methodFilter, statusFilter, searchQuery]);

  useEffect(() => {
    const handleUpdate = (updatedLogs) => setLogs(updatedLogs);

    stateStore.on('update', handleUpdate);

    return () => stateStore.off('update', handleUpdate);
  }, [stateStore]);

  useEffect(() => {
    setSelectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, {
      followLatest: isFollowingLatest
    }));
  }, [filteredLogs, isFollowingLatest]);

  useEffect(() => {
    setDetailScrollOffset(0);
  }, [selectedLogId, detailTab]);

  const selectedIndex = useMemo(() => getSelectedIndex(filteredLogs, selectedLogId), [filteredLogs, selectedLogId]);
  const selectedLog = useMemo(() => filteredLogs[selectedIndex] ?? null, [filteredLogs, selectedIndex]);
  const detailLines = useMemo(() => getDetailLines(selectedLog, detailTab), [selectedLog, detailTab]);
  const detailVisibleCount = Math.max(4, (process.stdout.rows || 24) - 13);
  const maxDetailScrollOffset = getMaxScrollOffset(detailLines, detailVisibleCount);
  const proxyOrigin = getProxyOrigin(context.port ?? 8080);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : 'Waiting for traffic...';

  useEffect(() => {
    setDetailScrollOffset((current) => Math.min(current, maxDetailScrollOffset));
  }, [maxDetailScrollOffset]);

  return h(
    Box,
    {
      flexDirection: 'column',
      height: process.stdout.rows || 24,
      paddingX: 1
    },
    isRawModeSupported
      ? h(KeyboardControls, {
        isListFocused,
        isSearchEditing,
        onAppendSearch: (value) => {
          setSearchQuery((current) => `${current}${value}`);
          setIsFollowingLatest(false);
        },
        onBackspaceSearch: () => {
          setSearchQuery((current) => current.slice(0, -1));
          setIsFollowingLatest(false);
        },
        onClearLogs: () => {
          stateStore.clear();
          setSelectedLogId(null);
          setIsFollowingLatest(false);
          setDetailScrollOffset(0);
        },
        onCycleMethod: () => {
          setMethodFilter((current) => cycleValue(METHOD_FILTERS, current));
          setIsFollowingLatest(false);
        },
        onCycleStatus: () => {
          setStatusFilter((current) => cycleValue(STATUS_FILTERS, current));
          setIsFollowingLatest(false);
        },
        onFinishSearch: () => setIsSearchEditing(false),
        onQuit,
        onToggleFocus: () => setIsListFocused((current) => !current),
        onMoveSelection: (direction) => {
          setIsFollowingLatest(false);
          setSelectedLogId((currentId) => moveSelectedLogId(filteredLogs, currentId, direction));
        },
        onScrollDetails: (direction) => {
          setDetailScrollOffset((current) => Math.min(
            maxDetailScrollOffset,
            Math.max(0, current + direction)
          ));
        },
        onStartSearch: () => {
          setIsSearchEditing(true);
          setIsFollowingLatest(false);
        },
        onFollowLatest: () => {
          setIsFollowingLatest(true);
          setSelectedLogId(resolveSelectedLogId(filteredLogs, selectedLogId, { followLatest: true }));
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
        emptyText,
        logs: filteredLogs,
        totalCount: logs.length,
        selectedIndex,
        isFocused: isListFocused,
        isFollowingLatest,
        methodFilter,
        statusFilter,
        searchQuery
      }),
      h(DetailPane, {
        log: selectedLog,
        isFocused: !isListFocused,
        detailTab,
        scrollOffset: detailScrollOffset
      })
    ),
    h(Footer, {
      isListFocused,
      isRawModeSupported,
      isFollowingLatest,
      isPaused,
      isSearchEditing,
      searchQuery
    })
  );
}
