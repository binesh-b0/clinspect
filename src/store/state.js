import { EventEmitter } from 'events';
import { maskCookieHeaders } from '../cookies.js';
import {
  DEFAULT_TEMP_HISTORY_ROOT,
  createTempHistorySession,
  getLatestTempHistorySession,
  openTempHistorySession
} from './temp-history.js';

export const DEFAULT_MAX_ENTRIES = 100;
export const DEFAULT_HISTORY_HOT_ENTRIES = 500;
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

function stringifyBody(value) {
  if (value === null || value === undefined) {
    return '';
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

function cloneHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.map((item) => String(item)) : String(value)
    ])
  );
}

function headersToSearchText(headers = {}) {
  return Object.entries(headers ?? {})
    .flatMap(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];

      return values.map((item) => `${key}: ${String(item)}`);
    })
    .join('\n');
}

function getHeaderValue(headers = {}, key) {
  const normalizedKey = String(key ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([headerKey]) => String(headerKey).toLowerCase() === normalizedKey);

  if (!entry) {
    return '';
  }

  return Array.isArray(entry[1]) ? entry[1].join(', ') : String(entry[1]);
}

function extractPortFromHost(host = '') {
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

export function truncateTextBody(value, limit = DEFAULT_BODY_LIMIT) {
  const body = stringifyBody(value);

  if (body.length > limit) {
    return {
      body: body.slice(0, limit),
      truncated: true
    };
  }

  return {
    body,
    truncated: false
  };
}

function normalizePayload(payload = {}, bodyLimit = DEFAULT_BODY_LIMIT) {
  const body = truncateTextBody(payload.body ?? '', bodyLimit);

  return {
    headers: cloneHeaders(payload.headers),
    body: body.body,
    truncated: Boolean(payload.truncated || body.truncated)
  };
}

function normalizeResendMetadata(metadata = {}) {
  const action = metadata?.action === 'resend' || metadata?.action === 'edit-resend'
    ? metadata.action
    : null;

  if (!action) {
    return null;
  }

  return {
    action,
    sourceLogId: String(metadata.sourceLogId ?? ''),
    sourceMethod: String(metadata.sourceMethod ?? '').toUpperCase(),
    sourcePath: String(metadata.sourcePath ?? '')
  };
}

export function normalizeLogEntry(entry, options = {}) {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const resend = normalizeResendMetadata(entry.resend);

  return {
    id: String(entry.id),
    timestamp: Number(entry.timestamp ?? Date.now()),
    method: String(entry.method ?? 'GET').toUpperCase(),
    path: String(entry.path ?? '/'),
    statusCode: entry.statusCode ?? null,
    responseTimeMs: Number(entry.responseTimeMs ?? 0),
    ...(resend ? { resend } : {}),
    request: normalizePayload(entry.request, bodyLimit),
    response: normalizePayload(entry.response, bodyLimit)
  };
}

export function cloneLogEntry(entry) {
  return {
    ...entry,
    ...(entry.resend ? { resend: { ...entry.resend } } : {}),
    ...(entry.search ? { search: { ...entry.search } } : {}),
    ...(entry.history ? { history: { ...entry.history } } : {}),
    request: {
      ...entry.request,
      headers: cloneHeaders(entry.request?.headers)
    },
    response: {
      ...entry.response,
      headers: cloneHeaders(entry.response?.headers)
    }
  };
}

function createSearchIndex(entry) {
  const requestHeaders = entry.request?.headers ?? {};
  const responseHeaders = entry.response?.headers ?? {};
  const maskedRequestHeaders = maskCookieHeaders(requestHeaders);
  const maskedResponseHeaders = maskCookieHeaders(responseHeaders);
  const host = getHeaderValue(requestHeaders, 'host');

  return {
    host,
    port: extractPortFromHost(host),
    requestContentType: getHeaderValue(requestHeaders, 'content-type'),
    requestHeaders: headersToSearchText(requestHeaders),
    requestHeadersMasked: headersToSearchText(maskedRequestHeaders),
    responseContentType: getHeaderValue(responseHeaders, 'content-type'),
    responseHeaders: headersToSearchText(responseHeaders),
    responseHeadersMasked: headersToSearchText(maskedResponseHeaders)
  };
}

function createLogSummary(entry) {
  return {
    id: entry.id,
    timestamp: entry.timestamp,
    method: entry.method,
    path: entry.path,
    statusCode: entry.statusCode,
    responseTimeMs: entry.responseTimeMs,
    ...(entry.resend ? { resend: { ...entry.resend } } : {}),
    request: {
      headers: {},
      body: '',
      truncated: Boolean(entry.request?.truncated)
    },
    response: {
      headers: {},
      body: '',
      truncated: Boolean(entry.response?.truncated)
    },
    search: createSearchIndex(entry),
    history: {
      cold: true,
      summaryOnly: true
    }
  };
}

function cloneSummaryEntry(summary, options = {}) {
  return {
    ...summary,
    ...(summary.resend ? { resend: { ...summary.resend } } : {}),
    request: {
      ...summary.request,
      headers: cloneHeaders(summary.request?.headers)
    },
    response: {
      ...summary.response,
      headers: cloneHeaders(summary.response?.headers)
    },
    search: summary.search ? { ...summary.search } : null,
    history: {
      ...(summary.history ?? {}),
      cold: options.cold !== false,
      summaryOnly: true
    }
  };
}

function withHistoryState(entry, options = {}) {
  return {
    ...cloneLogEntry(entry),
    history: {
      ...(entry.history ?? {}),
      cold: Boolean(options.cold),
      summaryOnly: false
    }
  };
}

export class StateStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
    this.historyCache = options.historyCache === true;
    this.historyHotEntries = Math.max(0, Math.floor(Number(options.historyHotEntries ?? DEFAULT_HISTORY_HOT_ENTRIES) || 0));
    this.historyRoot = options.historyRoot ?? DEFAULT_TEMP_HISTORY_ROOT;
    this.historySourceMode = options.sourceMode;
    this.historyTargetUrl = options.targetUrl;
    this.logs = [];
    this.summaries = [];
    this.hotEntries = new Map();
    this.locations = new Map();
    this.historyError = null;
    this.restoredHistory = null;
    this.tempHistory = null;

    if (this.historyCache) {
      if (options.restoreHistory) {
        this.tempHistory = options.restoreHistory;
        this.restoredHistory = options.restoreHistory;
        this.summaries = options.restoreHistory.entries.map(({ locator, summary }) => {
          this.locations.set(summary.id, locator);

          return {
            ...summary,
            history: {
              ...(summary.history ?? {}),
              cold: true,
              summaryOnly: true
            }
          };
        });
      } else {
        this.tempHistory = createTempHistorySession({
          bodyLimit: this.bodyLimit,
          hotEntries: this.historyHotEntries,
          root: this.historyRoot,
          sourceMode: this.historySourceMode,
          targetUrl: this.historyTargetUrl
        });
      }
    }
  }

  static restoreTempSession(sessionPath, options = {}) {
    return new StateStore({
      ...options,
      historyCache: true,
      restoreHistory: openTempHistorySession(sessionPath)
    });
  }

  static restoreLatestTempSession(options = {}) {
    const latest = getLatestTempHistorySession(options.historyRoot ?? DEFAULT_TEMP_HISTORY_ROOT);

    if (!latest) {
      throw new Error('no temporary history session found');
    }

    return StateStore.restoreTempSession(latest.path, options);
  }

  setHotEntry(entry) {
    if (this.historyHotEntries <= 0) {
      return;
    }

    if (this.hotEntries.has(entry.id)) {
      this.hotEntries.delete(entry.id);
    }

    this.hotEntries.set(entry.id, entry);

    while (this.hotEntries.size > this.historyHotEntries) {
      const oldestId = this.hotEntries.keys().next().value;

      this.hotEntries.delete(oldestId);
    }
  }

  getSummaryById(id) {
    return this.summaries.find((summary) => summary.id === id) ?? null;
  }

  addLog(logEntry) {
    const normalized = normalizeLogEntry(logEntry, { bodyLimit: this.bodyLimit });

    if (this.historyCache) {
      const summary = createLogSummary(normalized);

      try {
        const locator = this.tempHistory?.append(normalized, summary);

        if (locator) {
          this.locations.set(summary.id, locator);
        }
      } catch (error) {
        this.historyError = error?.message ?? String(error);
      }

      this.summaries = [...this.summaries, summary];
      this.setHotEntry(normalized);
      this.emit('add', cloneLogEntry(normalized));
      this.emit('update', this.getLogs());

      return cloneLogEntry(normalized);
    }

    this.logs = [...this.logs, normalized].slice(-this.maxEntries);
    this.emit('add', cloneLogEntry(normalized));
    this.emit('update', this.getLogs());

    return cloneLogEntry(normalized);
  }

  getLogs() {
    if (this.historyCache) {
      return this.summaries.map((summary) => {
        const hotEntry = this.hotEntries.get(summary.id);

        return hotEntry
          ? withHistoryState(hotEntry, { cold: false })
          : cloneSummaryEntry(summary, { cold: true });
      });
    }

    return this.logs.map(cloneLogEntry);
  }

  getLogById(id) {
    const value = String(id ?? '');

    if (!value) {
      return null;
    }

    if (!this.historyCache) {
      const entry = this.logs.find((log) => log.id === value);

      return entry ? cloneLogEntry(entry) : null;
    }

    const hotEntry = this.hotEntries.get(value);

    if (hotEntry) {
      this.setHotEntry(hotEntry);
      return withHistoryState(hotEntry, { cold: false });
    }

    const locator = this.locations.get(value);

    if (!locator || !this.tempHistory) {
      const summary = this.getSummaryById(value);

      return summary ? cloneSummaryEntry(summary, { cold: true }) : null;
    }

    try {
      const entry = normalizeLogEntry(this.tempHistory.read(locator), { bodyLimit: this.bodyLimit });

      this.setHotEntry(entry);

      return withHistoryState(entry, { cold: false });
    } catch (error) {
      this.historyError = error?.message ?? String(error);
      const summary = this.getSummaryById(value);

      return summary ? cloneSummaryEntry(summary, { cold: true }) : null;
    }
  }

  getHistoryStatus() {
    if (!this.historyCache) {
      return {
        coldEntries: 0,
        enabled: false,
        error: null,
        hotEntries: this.logs.length,
        restored: false,
        sessionPath: null,
        skippedLines: 0,
        totalEntries: this.logs.length
      };
    }

    return {
      coldEntries: Math.max(0, this.summaries.length - this.hotEntries.size),
      enabled: true,
      error: this.historyError,
      hotEntries: this.hotEntries.size,
      restored: Boolean(this.restoredHistory),
      endedAt: this.restoredHistory?.endedAt ?? null,
      metadata: this.restoredHistory?.manifest ?? null,
      sessionPath: this.tempHistory?.path ?? null,
      skippedLines: this.restoredHistory?.skippedLines ?? 0,
      totalEntries: this.summaries.length
    };
  }

  clear() {
    if (this.historyCache) {
      this.summaries = [];
      this.hotEntries.clear();
      this.locations.clear();
      this.tempHistory?.destroy?.();
      this.tempHistory = this.restoredHistory
        ? null
        : createTempHistorySession({
          bodyLimit: this.bodyLimit,
          hotEntries: this.historyHotEntries,
          root: this.historyRoot,
          sourceMode: this.historySourceMode,
          targetUrl: this.historyTargetUrl
        });
      this.emit('update', []);
      return;
    }

    this.logs = [];
    this.emit('update', []);
  }

  close() {
    this.tempHistory?.close?.();
  }
}
