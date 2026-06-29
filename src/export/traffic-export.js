import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import { isCookieHeaderName, maskCookieHeaderValue } from '../cookies.js';
import { isPublicTargetUrl } from '../target.js';

export const DEFAULT_EXPORT_DIRECTORY = './.clinspect/exports';

const BODY_LINE_MAX_LENGTH = 120;
const TEXTUAL_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /(?:^|[+/.-])json$/,
  /(?:^|[+/.-])(?:x-)?ndjson$/,
  /(?:^|[+/.-])jsonl$/,
  /(?:^|[+/.-])jsonlines$/,
  /(?:^|[+/.-])xml$/,
  /(?:^|[+/.-])javascript$/,
  /(?:^|[+/.-])typescript$/,
  /(?:^|[+/.-])x-www-form-urlencoded$/,
  /(?:^|[+/.-])graphql$/
];

function padTimestampPart(value) {
  return String(value).padStart(2, '0');
}

export function formatExportTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padTimestampPart(date.getMonth() + 1),
    padTimestampPart(date.getDate())
  ].join('') + '-' + [
    padTimestampPart(date.getHours()),
    padTimestampPart(date.getMinutes()),
    padTimestampPart(date.getSeconds())
  ].join('');
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

function normalizeHeaderName(value = '') {
  return String(value ?? '').toLowerCase();
}

function findHeaderEntry(headers = {}, name = '') {
  const normalizedName = normalizeHeaderName(name);

  return Object.entries(headers ?? {})
    .find(([headerName]) => normalizeHeaderName(headerName) === normalizedName) ?? null;
}

function getHeaderValue(headers = {}, key) {
  const entry = findHeaderEntry(headers, key);

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

function isNdjsonContentType(contentType) {
  return /(?:^|[+/.-])(?:x-)?ndjson$/.test(contentType) ||
    /(?:^|[+/.-])jsonl$/.test(contentType) ||
    contentType === 'application/jsonlines' ||
    contentType === 'text/jsonlines';
}

function isReactFlightContentType(contentType) {
  return contentType === 'text/x-component' ||
    contentType === 'application/x-component' ||
    contentType === 'application/react-flight';
}

function isServerSentEventContentType(contentType) {
  return contentType === 'text/event-stream';
}

function isUrlEncodedContentType(contentType) {
  return contentType === 'application/x-www-form-urlencoded';
}

function isHtmlContentType(contentType) {
  return contentType === 'text/html' || contentType === 'application/xhtml+xml';
}

function isXmlContentType(contentType) {
  return /(?:^|[+/.-])xml$/.test(contentType) ||
    contentType === 'image/svg+xml' ||
    contentType === 'application/rss+xml' ||
    contentType === 'application/atom+xml';
}

function trimmedPayloadBody(body) {
  return String(body ?? '').trim();
}

function looksLikeJsonBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function looksLikeNdjsonBody(body) {
  try {
    return parseNdjsonRecords(body).length > 0;
  } catch {
    return false;
  }
}

function looksLikeReactFlightBody(body) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  return lines.length > 0 && lines.every((line) => /^\d+:[A-Z]?/.test(line));
}

function looksLikeSseBody(body) {
  return String(body ?? '')
    .split(/\r?\n/)
    .some((line) => /^(event|data|id|retry):/.test(line.trim()));
}

function looksLikeUrlEncodedBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return /^[^=\s&]+=[\s\S]*$/.test(trimmed) && !trimmed.includes('\n');
}

function looksLikeHtmlBody(body) {
  return /^<!doctype\s+html/i.test(trimmedPayloadBody(body)) ||
    /^<html(?:\s|>)/i.test(trimmedPayloadBody(body));
}

function looksLikeXmlBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return /^<\?xml(?:\s|>)/i.test(trimmed) ||
    (/^<[A-Za-z_][\w:.-]*(?:\s|>)/.test(trimmed) && !looksLikeHtmlBody(trimmed));
}

function parseMaybeJsonValue(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return {
      parsed: false,
      value: ''
    };
  }

  if (!/^(?:[\[{"]|-?\d|true\b|false\b|null\b)/.test(trimmed)) {
    return {
      parsed: false,
      value: sanitizeTerminalText(value)
    };
  }

  try {
    return {
      parsed: true,
      value: JSON.parse(trimmed)
    };
  } catch {
    return {
      parsed: false,
      value: sanitizeTerminalText(value)
    };
  }
}

function parseNdjsonRecords(body, allowSingleLine = false) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!allowSingleLine && lines.length < 2) {
    throw new Error('not ndjson');
  }

  return lines.map((line) => JSON.parse(line));
}

function parseReactFlightRecords(body, requireFlightLine = false) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let sawFlightLine = false;

  const records = lines.map((line, index) => {
    const match = line.match(/^([^:]+):([A-Z])?([\s\S]*)$/);

    if (!match) {
      return {
        line: index + 1,
        malformed: true,
        raw: sanitizeTerminalText(line)
      };
    }

    sawFlightLine = true;

    const parsedPayload = parseMaybeJsonValue(match[3]);

    return {
      id: match[1],
      line: index + 1,
      payload: parsedPayload.value,
      payloadType: parsedPayload.parsed ? typeof parsedPayload.value : 'raw',
      tag: match[2] || 'data'
    };
  });

  if (requireFlightLine && !sawFlightLine) {
    throw new Error('not react flight');
  }

  return records;
}

function parseSseEvents(body) {
  const events = [];
  let event = {};
  let dataLines = [];

  const flush = () => {
    if (Object.keys(event).length === 0 && dataLines.length === 0) {
      return;
    }

    const data = dataLines.join('\n');
    const parsedData = parseMaybeJsonValue(data);

    events.push({
      ...event,
      ...(dataLines.length > 0
        ? {
          data: parsedData.value,
          dataType: parsedData.parsed ? typeof parsedData.value : 'text'
        }
        : {})
    });
    event = {};
    dataLines = [];
  };

  String(body ?? '').split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (line.length === 0) {
      flush();
      return;
    }

    if (line.startsWith(':')) {
      event.comment = event.comment
        ? `${event.comment}\n${line.slice(1).trimStart()}`
        : line.slice(1).trimStart();
      return;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'data') {
      dataLines.push(value);
    } else if (field === 'event') {
      event.event = value;
    } else if (field === 'id') {
      event.id = value;
    } else if (field === 'retry') {
      event.retry = Number.isNaN(Number(value)) ? value : Number(value);
    } else if (field) {
      event[field] = value;
    }
  });
  flush();

  if (events.length === 0) {
    throw new Error('not sse');
  }

  return events;
}

function parseUrlEncodedForm(body) {
  if (!looksLikeUrlEncodedBody(body)) {
    throw new Error('not urlencoded');
  }

  const form = {};

  for (const [key, value] of new URLSearchParams(String(body))) {
    if (Object.prototype.hasOwnProperty.call(form, key)) {
      form[key] = Array.isArray(form[key])
        ? [...form[key], value]
        : [form[key], value];
    } else {
      form[key] = value;
    }
  }

  if (Object.keys(form).length === 0) {
    throw new Error('not urlencoded');
  }

  return form;
}

function parseXmlBody(body) {
  const parser = new XMLParser({
    allowBooleanAttributes: true,
    attributeNamePrefix: '@',
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
    textNodeName: '#text',
    trimValues: true
  });
  const parsed = parser.parse(String(body));

  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
    throw new Error('not xml');
  }

  return parsed;
}

function normalizeOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
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

  const normalizedKey = normalizeHeaderName(key);

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

function headerValueLines(key, value, options = {}) {
  const displayValue = getDisplayHeaderValue(key, value, options);
  const values = Array.isArray(displayValue) ? displayValue : [displayValue];

  return values.map((item) => `${key}: ${String(item)}`);
}

function getPayload(log, detailTab = 'request') {
  return detailTab === 'response' ? log?.response : log?.request;
}

function createHeaderOptions(log, detailTab, secretPolicy, context = {}) {
  if (secretPolicy === 'raw') {
    return {
      showCookieValues: true
    };
  }

  const payload = getPayload(log, detailTab);

  return detailTab === 'request'
    ? {
      publicTargetUrl: context.publicTargetUrl,
      proxyOrigin: context.proxyOrigin,
      requestHost: payload?.headers?.host,
      rewritePublicTargetRequestHeaders: true,
      showCookieValues: false
    }
    : {
      showCookieValues: false
    };
}

function formatHeaders(headers = {}, options = {}) {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return '(none)';
  }

  return entries.flatMap(([key, value]) => headerValueLines(key, value, options)).join('\n');
}

function formatSingleHeader(headers = {}, headerName = '', options = {}) {
  const entry = findHeaderEntry(headers, headerName);

  if (!entry) {
    return '(none)';
  }

  return headerValueLines(entry[0], entry[1], options).join('\n');
}

function formatJsonValue(value) {
  return JSON.stringify(value, null, 2);
}

function withTrailingTruncation(content, payload = {}) {
  if (!payload?.truncated) {
    return content;
  }

  return `${content}${content.endsWith('\n') ? '' : '\n'}[body truncated]`;
}

function createBodyMessageExport(message, payload = {}) {
  return {
    content: withTrailingTruncation(message, payload),
    extension: 'txt',
    mediaType: 'text/plain'
  };
}

function parseJsonBody(body) {
  return JSON.parse(String(body));
}

export function createBodyExport(payload = {}) {
  const body = String(payload.body || '');
  const contentType = getContentType(payload.headers);

  if (body.length === 0) {
    return createBodyMessageExport('(empty)', payload);
  }

  if (hasEncodedBody(payload.headers)) {
    return createBodyMessageExport(`(compressed body not shown: ${getHeaderTokens(payload.headers, 'content-encoding').join(', ')})`, payload);
  }

  if (!isTextualContentType(contentType)) {
    return createBodyMessageExport(`(binary body omitted: ${contentType})`, payload);
  }

  if (isNdjsonContentType(contentType) || looksLikeNdjsonBody(body)) {
    return {
      content: withTrailingTruncation(String(body).trimEnd(), payload),
      extension: 'jsonl',
      mediaType: 'application/x-ndjson'
    };
  }

  if (isJsonContentType(contentType) || looksLikeJsonBody(body)) {
    try {
      return {
        content: withTrailingTruncation(formatJsonValue(parseJsonBody(body)), payload),
        extension: 'json',
        mediaType: 'application/json'
      };
    } catch {
      // Heuristic JSON detection can fail; fall through to text export.
    }
  }

  if (isHtmlContentType(contentType) || looksLikeHtmlBody(body)) {
    return {
      content: withTrailingTruncation(String(body), payload),
      extension: 'html',
      mediaType: 'text/html'
    };
  }

  if (isXmlContentType(contentType) || looksLikeXmlBody(body)) {
    return {
      content: withTrailingTruncation(String(body), payload),
      extension: 'xml',
      mediaType: 'application/xml'
    };
  }

  return {
    content: withTrailingTruncation(splitBodyLines(body).join('\n'), payload),
    extension: 'txt',
    mediaType: 'text/plain'
  };
}

function parseStructuredPayload(payload = {}) {
  const body = String(payload.body || '');
  const contentType = getContentType(payload.headers);

  if (!body || hasEncodedBody(payload.headers) || !isTextualContentType(contentType)) {
    return null;
  }

  const parsers = [
    {
      detect: () => isReactFlightContentType(contentType) || looksLikeReactFlightBody(body),
      parse: () => ({ flight: parseReactFlightRecords(body, !isReactFlightContentType(contentType)) })
    },
    {
      detect: () => isServerSentEventContentType(contentType) || looksLikeSseBody(body),
      parse: () => ({ events: parseSseEvents(body) })
    },
    {
      detect: () => isNdjsonContentType(contentType) || looksLikeNdjsonBody(body),
      parse: () => ({ records: parseNdjsonRecords(body, isNdjsonContentType(contentType)) })
    },
    {
      detect: () => isJsonContentType(contentType) || looksLikeJsonBody(body),
      parse: () => parseJsonBody(body)
    },
    {
      detect: () => isUrlEncodedContentType(contentType) || looksLikeUrlEncodedBody(body),
      parse: () => ({ form: parseUrlEncodedForm(body) })
    },
    {
      detect: () => isXmlContentType(contentType) || looksLikeXmlBody(body),
      parse: () => ({ xml: parseXmlBody(body) })
    }
  ];

  for (const parser of parsers) {
    try {
      if (parser.detect()) {
        return parser.parse();
      }
    } catch {
      // Parser detection is heuristic; try the next body shape.
    }
  }

  return null;
}

function parseDetailPath(pathValue = '') {
  if (pathValue === '$') {
    return [];
  }

  const parts = [];

  for (const segment of String(pathValue).split('.').filter(Boolean)) {
    const match = segment.match(/^([^\[]*)((?:\[\d+\])*)$/);

    if (!match) {
      parts.push(segment);
      continue;
    }

    if (match[1]) {
      parts.push(match[1]);
    }

    const indexes = match[2].match(/\[(\d+)\]/g) ?? [];

    indexes.forEach((indexPart) => {
      parts.push(Number(indexPart.slice(1, -1)));
    });
  }

  return parts;
}

function getPathValue(root, detailPath) {
  const parts = parseDetailPath(detailPath);
  let current = root;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return {
        found: false,
        value: undefined
      };
    }

    current = current[part];
  }

  return {
    found: current !== undefined,
    value: current
  };
}

function formatStructuredValueExport(value, payload = {}) {
  return {
    content: withTrailingTruncation(formatJsonValue(value), payload),
    extension: 'json',
    mediaType: 'application/json'
  };
}

function formatFullExchange(log, secretPolicy, context = {}) {
  const requestHeaderOptions = createHeaderOptions(log, 'request', secretPolicy, context);
  const responseHeaderOptions = createHeaderOptions(log, 'response', secretPolicy, context);
  const requestBody = createBodyExport(log.request);
  const responseBody = createBodyExport(log.response);
  const lines = [
    `${log.method ?? 'GET'} ${log.path ?? '/'}`,
    `Status: ${log.statusCode ?? '---'}`,
    `Duration: ${log.responseTimeMs ?? 0}ms`,
    `Timestamp: ${log.timestamp ? new Date(log.timestamp).toISOString() : ''}`,
    '',
    'Request headers',
    formatHeaders(log.request?.headers, requestHeaderOptions),
    '',
    'Request body',
    requestBody.content,
    '',
    'Response headers',
    formatHeaders(log.response?.headers, responseHeaderOptions),
    '',
    'Response body',
    responseBody.content
  ];

  return {
    content: lines.join('\n'),
    extension: 'txt',
    mediaType: 'text/plain'
  };
}

function targetLabel(target = {}) {
  if (target.kind === 'exchange') {
    return 'exchange';
  }

  if (target.kind === 'header') {
    return `${target.detailTab} header ${target.headerName}`;
  }

  if (target.kind === 'headers') {
    return `${target.detailTab} headers`;
  }

  if (target.kind === 'body') {
    return `${target.detailTab} body`;
  }

  if (target.kind === 'body-field') {
    return `${target.detailTab} body ${target.path}`;
  }

  return `${target.detailTab ?? 'detail'} row`;
}

function filenamePartForTarget(target = {}) {
  if (target.kind === 'exchange') {
    return 'exchange';
  }

  if (target.kind === 'headers') {
    return `${target.detailTab}-headers`;
  }

  if (target.kind === 'header') {
    return `${target.detailTab}-header-${target.headerName}`;
  }

  if (target.kind === 'body') {
    return `${target.detailTab}-body`;
  }

  if (target.kind === 'body-field') {
    return `${target.detailTab}-body-${target.path}`;
  }

  return target.filenamePart ?? target.kind ?? 'export';
}

export function resolveTrafficExportTarget({
  log = null,
  detailRows = [],
  detailTab = 'request',
  focusedRow = 0,
  isListFocused = true
} = {}) {
  if (!log) {
    return null;
  }

  if (isListFocused) {
    return {
      kind: 'exchange',
      detailTab: 'exchange',
      filenamePart: 'exchange',
      label: 'exchange'
    };
  }

  const row = detailRows[Math.max(0, Math.min(detailRows.length - 1, focusedRow))] ?? null;
  const rowId = String(row?.id ?? '');

  if (rowId === `${detailTab}-headers-title`) {
    return {
      kind: 'headers',
      detailTab,
      filenamePart: `${detailTab}-headers`,
      label: `${detailTab} headers`
    };
  }

  if (rowId === `${detailTab}-body-title`) {
    return {
      kind: 'body',
      detailTab,
      filenamePart: `${detailTab}-body`,
      label: `${detailTab} body`
    };
  }

  if (row?.type === 'header' && String(row.path ?? '').startsWith('headers.')) {
    const headerName = String(row.path).slice('headers.'.length);

    return {
      kind: 'header',
      detailTab,
      filenamePart: `${detailTab}-header-${headerName}`,
      headerName,
      label: `${detailTab} header ${headerName}`
    };
  }

  if (row?.path && !String(row.path).startsWith('headers.')) {
    return {
      kind: 'body-field',
      detailTab,
      filenamePart: `${detailTab}-body-${row.path}`,
      label: `${detailTab} body ${row.path}`,
      path: row.path,
      rowText: row.text
    };
  }

  return {
    kind: 'row',
    detailTab,
    filenamePart: `${detailTab}-row`,
    label: `${detailTab} row`,
    rowText: row?.text ?? ''
  };
}

export function createTrafficExport({
  log,
  target,
  secretPolicy = 'masked',
  context = {}
} = {}) {
  if (!log || !target) {
    throw new Error('No traffic item selected for export');
  }

  let bodyExport;
  const label = target.label ?? targetLabel(target);

  if (target.kind === 'exchange') {
    bodyExport = formatFullExchange(log, secretPolicy, context);
  } else if (target.kind === 'headers') {
    const payload = getPayload(log, target.detailTab);
    bodyExport = {
      content: formatHeaders(payload?.headers, createHeaderOptions(log, target.detailTab, secretPolicy, context)),
      extension: 'txt',
      mediaType: 'text/plain'
    };
  } else if (target.kind === 'header') {
    const payload = getPayload(log, target.detailTab);
    bodyExport = {
      content: formatSingleHeader(payload?.headers, target.headerName, createHeaderOptions(log, target.detailTab, secretPolicy, context)),
      extension: 'txt',
      mediaType: 'text/plain'
    };
  } else if (target.kind === 'body') {
    bodyExport = createBodyExport(getPayload(log, target.detailTab));
  } else if (target.kind === 'body-field') {
    const payload = getPayload(log, target.detailTab);
    const parsed = parseStructuredPayload(payload);
    const result = parsed ? getPathValue(parsed, target.path) : { found: false };

    bodyExport = result.found
      ? formatStructuredValueExport(result.value, payload)
      : {
        content: target.rowText ?? '',
        extension: 'txt',
        mediaType: 'text/plain'
      };
  } else {
    bodyExport = {
      content: target.rowText ?? '',
      extension: 'txt',
      mediaType: 'text/plain'
    };
  }

  return {
    ...bodyExport,
    label,
    filenamePart: filenamePartForTarget(target),
    method: log.method ?? 'GET',
    path: log.path ?? '/',
    secretPolicy,
    statusCode: log.statusCode ?? null,
    target
  };
}

function sanitizeSlugPart(value = '', fallback = 'item') {
  const slug = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || fallback;
}

function pathSlug(value = '/') {
  try {
    const parsed = new URL(String(value), 'http://clinspect.local');

    return sanitizeSlugPart(parsed.pathname, 'root');
  } catch {
    return sanitizeSlugPart(value, 'root');
  }
}

export function createExportFilename(exportData, options = {}) {
  const now = options.now ?? new Date();
  const method = sanitizeSlugPart(exportData.method ?? 'GET', 'request').toUpperCase();
  const status = exportData.statusCode === null || exportData.statusCode === undefined
    ? '---'
    : String(exportData.statusCode);
  const requestPath = pathSlug(exportData.path);
  const target = sanitizeSlugPart(exportData.filenamePart ?? exportData.label ?? 'export', 'export');
  const extension = sanitizeSlugPart(exportData.extension ?? 'txt', 'txt');

  return [
    'clinspect',
    formatExportTimestamp(now),
    method,
    status,
    requestPath,
    target
  ].join('-') + `.${extension}`;
}

export function writeTrafficExportFile(exportData, options = {}) {
  const fsImpl = options.fs ?? fs;
  const directory = path.resolve(options.directory ?? DEFAULT_EXPORT_DIRECTORY);
  const filename = options.filename ?? createExportFilename(exportData, options);
  const filePath = path.join(directory, filename);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const payload = exportData.content.endsWith('\n')
    ? exportData.content
    : `${exportData.content}\n`;

  fsImpl.mkdirSync(directory, { recursive: true });
  fsImpl.writeFileSync(tempPath, payload, 'utf8');
  fsImpl.renameSync(tempPath, filePath);

  return {
    bytes: Buffer.byteLength(payload, 'utf8'),
    filename,
    path: filePath
  };
}

function clipboardCommands(platform = process.platform) {
  if (platform === 'darwin') {
    return [{ command: 'pbcopy', args: [] }];
  }

  if (platform === 'win32') {
    return [{ command: 'clip', args: [] }];
  }

  return [
    { command: 'wl-copy', args: [] },
    { command: 'xclip', args: ['-selection', 'clipboard'] },
    { command: 'xsel', args: ['--clipboard', '--input'] }
  ];
}

function writeOsc52Clipboard(text, stream) {
  if (!stream || typeof stream.write !== 'function') {
    return false;
  }

  const payload = Buffer.from(String(text), 'utf8').toString('base64');

  stream.write(`\u001B]52;c;${payload}\u0007`);

  return true;
}

export function copyTextToClipboard(text, options = {}) {
  const platform = options.platform ?? process.platform;
  const spawn = options.spawnSync ?? spawnSync;

  for (const candidate of clipboardCommands(platform)) {
    try {
      const result = spawn(candidate.command, candidate.args, {
        encoding: 'utf8',
        input: String(text),
        stdio: ['pipe', 'ignore', 'ignore'],
        windowsHide: true
      });

      if (!result.error && result.status === 0) {
        return {
          method: candidate.command,
          ok: true
        };
      }
    } catch {
      // Try the next clipboard backend.
    }
  }

  if (writeOsc52Clipboard(text, options.stdout ?? process.stdout)) {
    return {
      method: 'osc52',
      ok: true
    };
  }

  throw new Error('No clipboard backend available');
}
