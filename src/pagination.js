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

function createPatchedRequest(pathValue, paramName, nextValue) {
  const url = parseUrl(pathValue);

  url.searchParams.set(paramName, String(nextValue));

  return {
    source: 'computed',
    url: toDraftUrl(url)
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

function resolveNextRequest(pathValue, fields, fieldNames, rels) {
  if (rels.next) {
    return {
      cursor: findCursorParam(rels.next.resolvedUrl),
      source: 'link',
      url: rels.next.resolvedUrl
    };
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

export function analyzePagination(log = {}) {
  const pathValue = String(log?.path ?? '/');
  const { fieldNames, fields } = detectPaginationFields(pathValue);
  const links = parseLinkHeaders(log?.response?.headers, pathValue);
  const rels = mapLinkRels(links);
  const nextRequest = resolveNextRequest(pathValue, fields, fieldNames, rels);
  const summary = formatPaginationSummary(fields, nextRequest, rels);
  const detected = Object.keys(fields).length > 0 || links.length > 0 || Boolean(nextRequest);

  return {
    detected,
    fieldNames,
    fields,
    links,
    nextRequest,
    rels,
    summary
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
