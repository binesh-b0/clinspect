import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdin } from 'ink';

const h = React.createElement;

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

function formatHeaders(headers) {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return ['(none)'];
  }

  return entries.slice(0, 5).map(([key, value]) => `${key}: ${value}`);
}

function previewBody(payload, maxLines = 7) {
  const lines = String(payload.body || '(empty)').split('\n');
  const preview = lines.slice(0, maxLines);

  if (payload.truncated) {
    preview.push('[body truncated]');
  } else if (lines.length > maxLines) {
    preview.push('[preview shortened]');
  }

  return preview;
}

function Header({ context = {}, logsCount }) {
  const target = context.targetUrl ?? 'mock traffic';
  const port = context.port ?? 8080;
  const subtitle = `demo mode | port ${port} | ${target} | ${logsCount} entries`;

  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'cyan', bold: true }, 'clinspect'),
    h(Text, { color: 'gray' }, subtitle)
  );
}

function TrafficList({ logs, selectedIndex, isFocused, isFollowingLatest }) {
  const rows = process.stdout.rows || 24;
  const visibleCount = Math.max(5, rows - 11);
  const startIndex = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    Math.max(0, logs.length - visibleCount)
  ));
  const visibleLogs = logs.slice(startIndex, startIndex + visibleCount);

  return h(
    Box,
    {
      flexDirection: 'column',
      width: 48,
      flexShrink: 0,
      borderStyle: 'single',
      borderColor: isFocused ? 'cyan' : 'gray',
      paddingX: 1,
      marginRight: 1
    },
    h(Text, { bold: true }, `Traffic ${isFocused ? 'focused' : 'idle'} | ${isFollowingLatest ? 'follow latest' : 'hold'}`),
    h(Text, { color: 'gray' }, '  time     meth   st  path'),
    logs.length === 0
      ? h(Text, { color: 'gray' }, 'Waiting for traffic...')
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
            color: selected ? 'black' : METHOD_COLORS[log.method] ?? 'white',
            backgroundColor: selected ? 'cyan' : undefined,
            wrap: 'truncate'
          },
          row
        );
      })
  );
}

function DetailSection({ title, headers, payload }) {
  return h(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    h(Text, { color: 'cyan', bold: true }, title),
    ...formatHeaders(headers).map((line) => h(Text, { key: `${title}-${line}`, color: 'gray', wrap: 'truncate' }, line)),
    ...previewBody(payload).map((line, index) => h(Text, { key: `${title}-body-${index}`, wrap: 'truncate' }, line))
  );
}

function DetailPane({ log, isFocused }) {
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

  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const summary = `${log.method} ${log.path} | ${timing}`;

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
    h(DetailSection, { title: 'Request', headers: log.request.headers, payload: log.request }),
    h(DetailSection, { title: 'Response', headers: log.response.headers, payload: log.response })
  );
}

function Footer({ isListFocused, isRawModeSupported, isFollowingLatest }) {
  const text = isRawModeSupported
    ? `up/down inspect | tab focus: ${isListFocused ? 'traffic' : 'details'} | follow: ${isFollowingLatest ? 'on' : 'off'} | f latest | q quit`
    : 'keyboard input unavailable in this shell | Ctrl-C or SIGTERM quit';

  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { color: 'gray' },
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

function KeyboardControls({ isListFocused, onQuit, onToggleFocus, onMoveSelection, onFollowLatest }) {
  useInput((input, key) => {
    if (input === 'q' || (input === 'c' && key.ctrl)) {
      onQuit();
      return;
    }

    if (input === 'f') {
      onFollowLatest();
      return;
    }

    if (key.tab) {
      onToggleFocus();
      return;
    }

    if (!isListFocused) {
      return;
    }

    if (key.upArrow) {
      onMoveSelection(-1);
    }

    if (key.downArrow) {
      onMoveSelection(1);
    }
  });

  return null;
}

export function App({ stateStore, context = {}, onQuit = () => {} }) {
  const { isRawModeSupported } = useStdin();
  const [logs, setLogs] = useState(() => stateStore.getLogs());
  const [selectedLogId, setSelectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [isFollowingLatest, setIsFollowingLatest] = useState(false);
  const [isListFocused, setIsListFocused] = useState(true);

  useEffect(() => {
    const handleUpdate = (updatedLogs) => setLogs(updatedLogs);

    stateStore.on('update', handleUpdate);

    return () => stateStore.off('update', handleUpdate);
  }, [stateStore]);

  useEffect(() => {
    setSelectedLogId((currentId) => resolveSelectedLogId(logs, currentId, {
      followLatest: isFollowingLatest
    }));
  }, [logs, isFollowingLatest]);

  const selectedIndex = useMemo(() => getSelectedIndex(logs, selectedLogId), [logs, selectedLogId]);
  const selectedLog = useMemo(() => logs[selectedIndex] ?? null, [logs, selectedIndex]);

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
        onQuit,
        onToggleFocus: () => setIsListFocused((current) => !current),
        onMoveSelection: (direction) => {
          setIsFollowingLatest(false);
          setSelectedLogId((currentId) => moveSelectedLogId(logs, currentId, direction));
        },
        onFollowLatest: () => {
          setIsFollowingLatest(true);
          setSelectedLogId(resolveSelectedLogId(logs, selectedLogId, { followLatest: true }));
        }
      })
      : null,
    h(Header, { context, logsCount: logs.length }),
    h(
      Box,
      { flexDirection: 'row', flexGrow: 1 },
      h(TrafficList, { logs, selectedIndex, isFocused: isListFocused, isFollowingLatest }),
      h(DetailPane, { log: selectedLog, isFocused: !isListFocused })
    ),
    h(Footer, { isListFocused, isRawModeSupported, isFollowingLatest })
  );
}
