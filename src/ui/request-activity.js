import React from 'react';
import { Box, Text } from 'ink';
import {
  h,
  pad,
  truncate
} from './shared.js';
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyToken,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';

function normalizeTime(value = Date.now()) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : Date.now();
}

function formatClock(timestamp) {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatSource(source = 'composer') {
  const labels = {
    composer: 'composer',
    'edit-resend': 'edit resend',
    library: 'library',
    'next-page': 'next page',
    resend: 'resend',
    'send-next-page': 'next page'
  };

  return labels[source] ?? String(source || 'composer');
}

function hasTiming(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

export function createRequestActivity(options = {}) {
  const draft = options.draft ?? {};
  const startedAt = normalizeTime(options.startedAt ?? options.now?.() ?? Date.now());

  return {
    id: String(options.id ?? `request-${startedAt}-${Math.random().toString(36).slice(2, 8)}`),
    source: options.source ?? 'composer',
    method: String(draft.method ?? options.method ?? 'GET').toUpperCase(),
    url: String(draft.url ?? draft.path ?? options.url ?? '/'),
    startedAt,
    finishedAt: null,
    state: 'sending',
    statusCode: null,
    responseTimeMs: null,
    logId: null,
    error: ''
  };
}

export function finishRequestActivity(activity, logEntry = {}, options = {}) {
  return {
    ...activity,
    finishedAt: normalizeTime(options.finishedAt ?? options.now?.() ?? Date.now()),
    state: 'success',
    statusCode: logEntry.statusCode ?? null,
    responseTimeMs: logEntry.responseTimeMs ?? null,
    logId: logEntry.id ? String(logEntry.id) : null,
    error: ''
  };
}

export function failRequestActivity(activity, error, options = {}) {
  return {
    ...activity,
    finishedAt: normalizeTime(options.finishedAt ?? options.now?.() ?? Date.now()),
    state: 'error',
    error: error?.message ?? String(error ?? 'request failed')
  };
}

export function formatRequestActivityToast(activity = {}, options = {}) {
  const method = activity.method ?? 'GET';
  const url = activity.url ?? '/';

  if (options.state === 'sending' || activity.state === 'sending') {
    return `sending ${method} ${url}`;
  }

  if (activity.state === 'success') {
    const status = activity.statusCode ?? '---';
    const timing = hasTiming(activity.responseTimeMs)
      ? ` in ${Number(activity.responseTimeMs)}ms`
      : '';

    return `sent ${method} ${url} -> ${status}${timing}`;
  }

  return `send failed ${method} ${url}: ${activity.error || 'request failed'}`;
}

export function formatRequestActivityRow(activity = {}, options = {}) {
  const width = Math.max(32, Math.floor(Number(options.width) || 80));
  const selected = Boolean(options.selected);
  const marker = selected ? '>' : ' ';
  const time = activity.startedAt ? formatClock(activity.startedAt) : '--:--:--';
  const state = activity.state === 'sending'
    ? 'sending'
    : (activity.state === 'success' ? String(activity.statusCode ?? 'ok') : 'error');
  const source = formatSource(activity.source);
  const timing = hasTiming(activity.responseTimeMs)
    ? `${Number(activity.responseTimeMs)}ms`
    : '';
  const prefix = `${marker} ${time} ${pad(state, 7)} ${pad(activity.method ?? 'GET', 6)} `;
  const suffix = ` ${pad(source, 11)} ${timing}`;
  const urlWidth = Math.max(8, width - prefix.length - suffix.length);

  return `${prefix}${pad(truncate(activity.url ?? '/', urlWidth), urlWidth)}${suffix}`;
}

function rowColor(activity = {}, selected = false) {
  if (selected) {
    return 'black';
  }

  if (activity.state === 'error') {
    return 'red';
  }

  if (activity.state === 'sending') {
    return 'cyan';
  }

  return 'green';
}

function getBindingTokens(bindings, actionId) {
  return bindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];
}

function getCloseLabel(keyBindings) {
  const helpTokens = new Set(getBindingTokens(keyBindings, 'main.openHelp'));
  const closeTokens = getBindingTokens(keyBindings, 'help.close').filter((token) => !helpTokens.has(token));
  const displayedTokens = closeTokens.length > 0 ? closeTokens : getBindingTokens(keyBindings, 'help.close');

  return displayedTokens.slice(0, 2).map(formatKeyToken).join('/');
}

export const RequestActivityPage = React.memo(function RequestActivityPage({
  activities = [],
  selectedId = null,
  keyBindings = DEFAULT_KEY_BINDINGS
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(72, columns - 4);
  const selectedIndex = Math.max(0, activities.findIndex((activity) => activity.id === selectedId));
  const visibleCount = Math.max(6, (process.stdout.rows ?? 24) - 10);
  const startIndex = Math.max(0, Math.min(
    selectedIndex - Math.floor(visibleCount / 2),
    Math.max(0, activities.length - visibleCount)
  ));
  const visibleActivities = activities.slice(startIndex, startIndex + visibleCount);

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1,
      borderStyle: 'single',
      borderColor: 'cyan',
      paddingX: 2,
      paddingY: 1,
      width
    },
    h(Text, { color: 'cyan', bold: true }, 'Sent requests'),
    h(Text, { color: 'gray' }, 'Requests initiated from clinspect'),
    h(Text, {}, ''),
    activities.length === 0
      ? h(Text, { color: 'gray' }, 'No clinspect-sent requests yet')
      : visibleActivities.map((activity) => {
        const selected = activity.id === selectedId;

        return h(
          Text,
          {
            key: activity.id,
            backgroundColor: selected ? 'cyan' : undefined,
            color: rowColor(activity, selected),
            wrap: 'truncate'
          },
          formatRequestActivityRow(activity, { selected, width: width - 6 })
        );
      }),
    h(Text, {}, ''),
    h(Text, { color: 'gray', wrap: 'truncate' }, `${getBindingPairLabel(keyBindings, 'main.moveDown', 'main.moveUp')} move | ${getBindingLabel(keyBindings, 'main.inspect', { limit: 1 })} inspect log | ${getCloseLabel(keyBindings)} close | ${getBindingLabel(keyBindings, 'main.openHelp', { limit: 1 })} help`)
  );
});

export const ToastNotification = React.memo(function ToastNotification({
  toast = null
}) {
  if (!toast?.message) {
    return null;
  }

  const color = toast.kind === 'error'
    ? 'red'
    : (toast.kind === 'success' ? 'green' : (toast.kind === 'warning' ? 'yellow' : 'cyan'));

  return h(
    Box,
    {
      borderStyle: 'single',
      borderColor: color,
      paddingX: 1,
      marginTop: 1
    },
    h(Text, { color, wrap: 'truncate' }, toast.message)
  );
});
