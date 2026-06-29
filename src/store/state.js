import { EventEmitter } from 'events';

export const DEFAULT_MAX_ENTRIES = 100;
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
    request: {
      ...entry.request,
      headers: cloneHeaders(entry.request.headers)
    },
    response: {
      ...entry.response,
      headers: cloneHeaders(entry.response.headers)
    }
  };
}

export class StateStore extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
    this.logs = [];
  }

  addLog(logEntry) {
    const normalized = normalizeLogEntry(logEntry, { bodyLimit: this.bodyLimit });

    this.logs = [...this.logs, normalized].slice(-this.maxEntries);
    this.emit('add', cloneLogEntry(normalized));
    this.emit('update', this.getLogs());

    return cloneLogEntry(normalized);
  }

  getLogs() {
    return this.logs.map(cloneLogEntry);
  }

  clear() {
    this.logs = [];
    this.emit('update', []);
  }
}
