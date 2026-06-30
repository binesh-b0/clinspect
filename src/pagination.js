import { createManualRequestDraftFromLog } from './engine/manual-request.js';

const PAGINATION_PARAM_ALIASES = Object.freeze({
  page: Object.freeze(['page']),
  pageSize: Object.freeze(['pageSize', 'page_size']),
  limit: Object.freeze(['limit']),
  offset: Object.freeze(['offset']),
  cursor: Object.freeze(['cursor']),
  after: Object.freeze(['after']),
  before: Object.freeze(['before'])
});

const CURSOR_FIELDS = Object.freeze(['cursor', 'after', 'before']);
const LOCAL_ORIGIN = 'http://clinspect.local';
const MAX_BODY_PAGINATION_PARSE_LENGTH = 1024 * 1024;
const BODY_NEXT_URL_PATHS = Object.freeze([
  Object.freeze(['next']),
  Object.freeze(['nextUrl']),
  Object.freeze(['next_url']),
  Object.freeze(['links', 'next']),
  Object.freeze(['pagination', 'next']),
  Object.freeze(['paging', 'next']),
  Object.freeze(['page', 'next'])
]);
const BODY_NEXT_CURSOR_PATHS = Object.freeze([
  Object.freeze({ path: ['nextCursor'], field: 'cursor' }),
  Object.freeze({ path: ['next_cursor'], field: 'cursor' }),
  Object.freeze({ path: ['nextPageCursor'], field: 'cursor' }),
  Object.freeze({ path: ['next_page_cursor'], field: 'cursor' }),
  Object.freeze({ path: ['nextToken'], field: 'cursor' }),
  Object.freeze({ path: ['next_token'], field: 'cursor' }),
  Object.freeze({ path: ['pagination', 'nextCursor'], field: 'cursor' }),
  Object.freeze({ path: ['pagination', 'next_cursor'], field: 'cursor' }),
  Object.freeze({ path: ['pagination', 'nextToken'], field: 'cursor' }),
  Object.freeze({ path: ['pagination', 'next_token'], field: 'cursor' }),
  Object.freeze({ path: ['meta', 'nextCursor'], field: 'cursor' }),
  Object.freeze({ path: ['meta', 'next_cursor'], field: 'cursor' }),
  Object.freeze({ path: ['meta', 'nextToken'], field: 'cursor' }),
  Object.freeze({ path: ['meta', 'next_token'], field: 'cursor' }),
  Object.freeze({ path: ['paging', 'nextCursor'], field: 'cursor' }),
  Object.freeze({ path: ['paging', 'next_cursor'], field: 'cursor' }),
  Object.freeze({ path: ['pageInfo', 'endCursor'], field: 'after', hasNextPath: ['pageInfo', 'hasNextPage'] }),
  Object.freeze({ path: ['page_info', 'end_cursor'], field: 'after', hasNextPath: ['page_info', 'has_next_page'] }),
  Object.freeze({ path: ['pagination', 'endCursor'], field: 'after', hasNextPath: ['pagination', 'hasNextPage'] }),
  Object.freeze({ path: ['pagination', 'end_cursor'], field: 'after', hasNextPath: ['pagination', 'has_next_page'] })
]);

function parseUrl(value = '/') {
  try {
    return new URL(String(value || '/'), LOCAL_ORIGIN);
  } catch {
    return new URL('/', LOCAL_ORIGIN);
  }
}

function isLocalUrl(url) {
  return url.origin === LOCAL_ORIGIN;
}

function toDraftUrl(url) {
  url.hash = '';

  return isLocalUrl(url) ? `${url.pathname}${url.search}` : url.href;
}

function resolveDraftUrl(value, basePath = '/') {
  return toDraftUrl(new URL(String(value), parseUrl(basePath)));
}

function getHeaderValues(headers = {}, name) {
  const normalizedName = String(name ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([key]) => String(key).toLowerCase() === normalizedName);

  if (!entry) {
    return [];
  }

  return Array.isArray(entry[1])
    ? entry[1].map((value) => String(value))
    : [String(entry[1])];
}

function splitHeaderValue(value, separator) {
  const parts = [];
  let current = '';
  let inQuote = false;
  let inAngle = false;

  for (const char of String(value ?? '')) {
    if (char === '"') {
      inQuote = !inQuote;
      current += char;
      continue;
    }

    if (!inQuote && char === '<') {
      inAngle = true;
    } else if (!inQuote && char === '>') {
      inAngle = false;
    }

    if (!inQuote && !inAngle && char === separator) {
      parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts.filter(Boolean);
}

function unquoteHeaderValue(value = '') {
  const text = String(value ?? '').trim();

  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1).replace(/\\"/g, '"');
  }

  return text;
}

function parseLinkPart(part, basePath) {
  const segments = splitHeaderValue(part, ';');
  const targetMatch = String(segments.shift() ?? '').match(/^<([^>]*)>$/);

  if (!targetMatch || !targetMatch[1]) {
    return null;
  }

  const params = {};

  for (const segment of segments) {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const key = segment.slice(0, separatorIndex).trim().toLowerCase();
    const value = unquoteHeaderValue(segment.slice(separatorIndex + 1));

    if (key) {
      params[key] = value;
    }
  }

  const rels = String(params.rel ?? '')
    .split(/\s+/)
    .map((rel) => rel.trim().toLowerCase())
    .filter(Boolean);
  const baseUrl = parseUrl(basePath);
  const resolvedUrl = toDraftUrl(new URL(targetMatch[1], baseUrl));

  return {
    params,
    raw: part,
    rels,
    resolvedUrl,
    url: targetMatch[1]
  };
}

function parseLinkHeaders(headers = {}, basePath = '/') {
  return getHeaderValues(headers, 'link')
    .flatMap((value) => splitHeaderValue(value, ','))
    .map((part) => {
      try {
        return parseLinkPart(part, basePath);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function mapLinkRels(links = []) {
  return links.reduce((rels, link) => {
    for (const rel of link.rels) {
      if (!rels[rel]) {
        rels[rel] = link;
      }
    }

    return rels;
  }, {});
}

function getSearchParamEntry(searchParams, names = []) {
  for (const name of names) {
    if (searchParams.has(name)) {
      return {
        name,
        value: searchParams.get(name)
      };
    }
  }

  return null;
}

function detectPaginationFields(pathValue = '/') {
  const url = parseUrl(pathValue);
  const fields = {};
  const fieldNames = {};

  for (const [field, aliases] of Object.entries(PAGINATION_PARAM_ALIASES)) {
    const entry = getSearchParamEntry(url.searchParams, aliases);

    if (entry) {
      fields[field] = entry.value;
      fieldNames[field] = entry.name;
    }
  }

  return {
    fieldNames,
    fields,
    url
  };
}

function parseInteger(value) {
  const text = String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  return Number.parseInt(text, 10);
}

function hasField(fields = {}, field) {
  return Object.prototype.hasOwnProperty.call(fields, field);
}

function getPathValue(value, path = []) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return current[key];
  }, value);
}

function isNonEmptyScalar(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return false;
  }

  const text = String(value).trim();

  return text.length > 0 && text.toLowerCase() !== 'null' && text.toLowerCase() !== 'undefined';
}

function isUrlLikeNextValue(value) {
  const text = String(value ?? '').trim();

  return text.startsWith('/')
    || text.startsWith('?')
    || /^https?:\/\//i.test(text);
}

function tryParseResponseJson(log = {}) {
  if (log?.response?.truncated) {
    return null;
  }

  const body = String(log?.response?.body ?? '').trim();

  if (!body || body.length > MAX_BODY_PAGINATION_PARSE_LENGTH || !/^[{[]/.test(body)) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function getPreferredCursorParam(fields, fieldNames, suggestedField = 'cursor') {
  const knownFields = [suggestedField, 'after', 'cursor', 'before']
    .filter((field, index, fieldsList) => field && fieldsList.indexOf(field) === index);

  for (const field of knownFields) {
    if (fieldNames[field]) {
      return {
        field,
        name: fieldNames[field]
      };
    }
  }

  return {
    field: suggestedField,
    name: PAGINATION_PARAM_ALIASES[suggestedField]?.[0] ?? suggestedField
  };
}

function createPatchedRequest(pathValue, paramName, nextValue) {
  const url = parseUrl(pathValue);

  url.searchParams.set(paramName, String(nextValue));

  return {
    strategy: paramName.toLowerCase() === 'offset' ? 'offset-limit' : 'page-increment',
    source: 'computed',
    url: toDraftUrl(url)
  };
}

function createBodyCursorRequest(pathValue, fields, fieldNames, cursorValue, options = {}) {
  const cursor = getPreferredCursorParam(fields, fieldNames, options.field);
  const url = parseUrl(pathValue);

  url.searchParams.set(cursor.name, String(cursorValue));

  return {
    bodyPath: options.bodyPath ?? '',
    cursor: {
      field: cursor.field,
      name: cursor.name,
      value: String(cursorValue)
    },
    strategy: 'body-cursor',
    source: 'body',
    url: toDraftUrl(url)
  };
}

function createBodyNextUrlRequest(pathValue, nextUrl) {
  const url = resolveDraftUrl(nextUrl, pathValue);

  return {
    cursor: findCursorParam(url),
    strategy: 'body-next-url',
    source: 'body',
    url
  };
}

function findCursorParam(pathValue) {
  const url = parseUrl(pathValue);

  for (const field of CURSOR_FIELDS) {
    const entry = getSearchParamEntry(url.searchParams, PAGINATION_PARAM_ALIASES[field]);

    if (entry?.value) {
      return {
        field,
        name: entry.name,
        value: entry.value
      };
    }
  }

  return null;
}

function findBodyNextRequest(pathValue, fields, fieldNames, log) {
  const body = tryParseResponseJson(log);

  if (!body) {
    return null;
  }

  for (const path of BODY_NEXT_URL_PATHS) {
    const value = getPathValue(body, path);

    if (!isNonEmptyScalar(value)) {
      continue;
    }

    if (isUrlLikeNextValue(value)) {
      return createBodyNextUrlRequest(pathValue, value);
    }

    if (CURSOR_FIELDS.some((field) => hasField(fields, field))) {
      return createBodyCursorRequest(pathValue, fields, fieldNames, value, {
        bodyPath: path.join('.'),
        field: 'cursor'
      });
    }
  }

  for (const candidate of BODY_NEXT_CURSOR_PATHS) {
    if (candidate.hasNextPath && getPathValue(body, candidate.hasNextPath) !== true) {
      continue;
    }

    const value = getPathValue(body, candidate.path);

    if (!isNonEmptyScalar(value)) {
      continue;
    }

    return createBodyCursorRequest(pathValue, fields, fieldNames, value, {
      bodyPath: candidate.path.join('.'),
      field: candidate.field
    });
  }

  return null;
}

function resolveNextRequest(pathValue, fields, fieldNames, rels, bodyNextRequest) {
  if (rels.next) {
    return {
      cursor: findCursorParam(rels.next.resolvedUrl),
      strategy: 'link-rel-next',
      source: 'link',
      url: rels.next.resolvedUrl
    };
  }

  if (bodyNextRequest) {
    return bodyNextRequest;
  }

  const page = parseInteger(fields.page);

  if (page !== null && fieldNames.page) {
    return createPatchedRequest(pathValue, fieldNames.page, page + 1);
  }

  const offset = parseInteger(fields.offset);
  const limit = parseInteger(fields.limit);

  if (offset !== null && limit !== null && fieldNames.offset) {
    return createPatchedRequest(pathValue, fieldNames.offset, offset + limit);
  }

  return null;
}

function getUnavailableReason(fields, rels = {}, nextRequest = null) {
  if (nextRequest) {
    return '';
  }

  if (CURSOR_FIELDS.some((field) => hasField(fields, field))) {
    return 'next cursor not found in Link header or response body';
  }

  if (hasField(fields, 'page') && parseInteger(fields.page) === null) {
    return 'page is not numeric';
  }

  const hasOffset = hasField(fields, 'offset');
  const hasLimit = hasField(fields, 'limit');

  if (hasOffset && parseInteger(fields.offset) === null) {
    return 'offset is not numeric';
  }

  if (hasOffset && !hasLimit) {
    return 'offset pagination needs a limit';
  }

  if (hasOffset && parseInteger(fields.limit) === null) {
    return 'limit is not numeric for offset pagination';
  }

  if (!hasOffset && hasLimit && parseInteger(fields.limit) === null) {
    return 'limit is not numeric';
  }

  if (Object.keys(rels).length > 0 && !rels.next) {
    return 'Link header has no rel=next';
  }

  return '';
}

function formatPaginationSummary(fields, nextRequest, rels = {}) {
  const parts = [];

  if (fields.page) {
    parts.push(`page ${fields.page}`);
  }

  if (fields.pageSize) {
    parts.push(`pageSize ${fields.pageSize}`);
  }

  if (fields.limit) {
    parts.push(`limit ${fields.limit}`);
  }

  if (fields.offset) {
    parts.push(`offset ${fields.offset}`);
  }

  for (const field of CURSOR_FIELDS) {
    if (fields[field]) {
      parts.push(`${field} ${fields[field]}`);
    }
  }

  if (nextRequest?.cursor?.value) {
    parts.push(`likely next ${nextRequest.cursor.field}: ${nextRequest.cursor.value}`);
  } else if (nextRequest?.url) {
    const nextUrl = parseUrl(nextRequest.url);
    const nextPage = nextUrl.searchParams.get('page');
    const nextOffset = nextUrl.searchParams.get('offset');

    if (nextPage) {
      parts.push(`next page ${nextPage}`);
    } else if (nextOffset) {
      parts.push(`next offset ${nextOffset}`);
    } else {
      parts.push('next link available');
    }
  }

  if (parts.length === 0 && Object.keys(rels).length > 0) {
    parts.push(`link rels: ${Object.keys(rels).join(', ')}`);
  }

  return parts.join(', ');
}

export function formatPaginationNextStatus(pagination = {}) {
  if (!pagination.nextRequest) {
    return pagination.unavailableReason || 'no next page detected';
  }

  if (pagination.nextRequest.strategy === 'link-rel-next') {
    return 'next page from Link rel=next';
  }

  if (pagination.nextRequest.strategy === 'page-increment') {
    return 'next page computed from page + 1';
  }

  if (pagination.nextRequest.strategy === 'offset-limit') {
    return 'next page computed from offset + limit';
  }

  if (pagination.nextRequest.strategy === 'body-next-url') {
    return 'next page from response body next URL';
  }

  if (pagination.nextRequest.strategy === 'body-cursor') {
    return 'next page from response body cursor';
  }

  return pagination.nextRequest.source === 'link'
    ? 'next page from Link header'
    : 'next page from query params';
}

export function analyzePagination(log = {}) {
  const pathValue = String(log?.path ?? '/');
  const { fieldNames, fields } = detectPaginationFields(pathValue);
  const links = parseLinkHeaders(log?.response?.headers, pathValue);
  const rels = mapLinkRels(links);
  const bodyNextRequest = findBodyNextRequest(pathValue, fields, fieldNames, log);
  const nextRequest = resolveNextRequest(pathValue, fields, fieldNames, rels, bodyNextRequest);
  const summary = formatPaginationSummary(fields, nextRequest, rels);
  const unavailableReason = getUnavailableReason(fields, rels, nextRequest);
  const detected = Object.keys(fields).length > 0 || links.length > 0 || Boolean(nextRequest) || Boolean(bodyNextRequest);

  return {
    bodyNextRequest,
    detected,
    fieldNames,
    fields,
    links,
    nextRequest,
    rels,
    summary,
    unavailableReason
  };
}

export function createNextPageRequestDraftFromLog(log, options = {}) {
  const pagination = analyzePagination(log);

  if (!pagination.nextRequest) {
    return null;
  }

  const plan = createManualRequestDraftFromLog(log, {
    action: 'edit-resend',
    environment: options.environment ?? []
  });
  const draft = {
    ...plan.draft,
    name: `${plan.draft.method} ${pagination.nextRequest.url}`,
    url: pagination.nextRequest.url
  };

  return {
    ...plan,
    draft,
    pagination,
    summary: {
      ...plan.summary,
      path: pagination.nextRequest.url
    }
  };
}
