import { detectAuthSecrets } from './auth-secrets.js';

const CACHE_HEADER_ORDER = [
  ['cache-control', 'Cache-Control'],
  ['etag', 'ETag'],
  ['last-modified', 'Last-Modified'],
  ['vary', 'Vary'],
  ['age', 'Age']
];

const STATIC_ASSET_PATH_PATTERN = /\.(?:avif|bmp|cjs|css|eot|gif|ico|jpeg|jpg|js|jsx|mjs|mp3|mp4|otf|png|svg|ttf|ts|tsx|vue|wasm|wav|webm|webmanifest|webp|woff2?)(?:[?#]|$)/i;
const STATIC_ASSET_FILE_PATTERN = /^\/(?:browserconfig\.xml|favicon\.ico|manifest\.json|robots\.txt|site\.webmanifest)(?:[?#]|$)/i;
const STATIC_CONTENT_TYPE_PATTERNS = [
  /^image\//,
  /^font\//,
  /^audio\//,
  /^video\//,
  /^text\/css(?:$|;)/,
  /^(?:application|text)\/(?:x-)?javascript(?:$|;)/,
  /^application\/wasm(?:$|;)/,
  /^application\/font-woff2?(?:$|;)/,
  /^application\/vnd\.ms-fontobject(?:$|;)/,
  /^application\/manifest\+json(?:$|;)/
];

const DYNAMIC_CONTENT_TYPE_PATTERNS = [
  /^text\/html(?:$|;)/,
  /^text\/plain(?:$|;)/,
  /^text\/event-stream(?:$|;)/,
  /(?:^|[+/.-])json(?:$|;)/
];

function asValues(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [String(value ?? '')];
}

function getHeaderValues(headers = {}, name = '') {
  const normalizedName = String(name ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([key]) => String(key).toLowerCase() === normalizedName);

  return entry ? asValues(entry[1]).filter((value) => value.trim().length > 0) : [];
}

function getHeaderValue(headers = {}, name = '') {
  return getHeaderValues(headers, name).join(', ');
}

function hasHeader(headers = {}, name = '') {
  return getHeaderValues(headers, name).length > 0;
}

function stripQuotes(value = '') {
  const text = String(value ?? '').trim();

  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }

  return text;
}

function splitCacheControl(value = '') {
  return asValues(value)
    .join(', ')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function parseCacheControl(value = '') {
  const raw = asValues(value).join(', ');
  const directives = {};
  const order = [];

  for (const part of splitCacheControl(value)) {
    const separatorIndex = part.indexOf('=');
    const name = (separatorIndex === -1 ? part : part.slice(0, separatorIndex)).trim().toLowerCase();
    const rawValue = separatorIndex === -1 ? true : stripQuotes(part.slice(separatorIndex + 1));

    if (!name) {
      continue;
    }

    directives[name] = rawValue;
    order.push({ name, value: rawValue });
  }

  return {
    directives,
    order,
    raw
  };
}

function getDirective(cacheControl, name) {
  return cacheControl?.directives?.[name];
}

function hasDirective(cacheControl, name) {
  return Object.prototype.hasOwnProperty.call(cacheControl?.directives ?? {}, name);
}

function parseDirectiveSeconds(cacheControl, name) {
  const value = getDirective(cacheControl, name);

  if (value === undefined || value === true) {
    return null;
  }

  const text = String(value).trim();

  if (!/^\d+$/.test(text)) {
    return null;
  }

  const seconds = Number(text);

  return Number.isSafeInteger(seconds) ? seconds : null;
}

export function parseCacheAge(value = '') {
  const raw = asValues(value)[0]?.trim() ?? '';

  if (!raw) {
    return {
      present: false,
      raw: '',
      seconds: null,
      valid: false
    };
  }

  const valid = /^\d+$/.test(raw);
  const seconds = valid ? Number(raw) : null;

  return {
    present: true,
    raw,
    seconds: valid && Number.isSafeInteger(seconds) ? seconds : null,
    valid: valid && Number.isSafeInteger(seconds)
  };
}

function parseLastModified(value = '') {
  const raw = asValues(value)[0]?.trim() ?? '';

  if (!raw) {
    return {
      present: false,
      raw: '',
      valid: false
    };
  }

  const timestamp = Date.parse(raw);
  const valid = Number.isFinite(timestamp);

  return {
    present: true,
    raw,
    timestamp: valid ? timestamp : null,
    valid
  };
}

function parseEtag(value = '') {
  const raw = asValues(value)[0]?.trim() ?? '';
  const weak = /^W\//i.test(raw);
  const validator = weak ? raw.slice(2) : raw;
  const valid = /^"[\s\S]*"$/.test(validator);

  return {
    present: raw.length > 0,
    raw,
    strength: valid ? (weak ? 'weak' : 'strong') : 'invalid',
    valid
  };
}

function parseVary(value = '') {
  const raw = asValues(value).join(', ');
  const tokens = raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  return {
    present: tokens.length > 0,
    raw,
    tokens,
    wildcard: tokens.includes('*')
  };
}

function formatSeconds(seconds) {
  return `${seconds}s`;
}

function formatDirective(name, value) {
  if (value === true) {
    return name;
  }

  if (['max-age', 's-maxage', 'stale-while-revalidate', 'stale-if-error'].includes(name) && /^\d+$/.test(String(value))) {
    return `${name} ${formatSeconds(Number(value))}`;
  }

  return `${name}=${value}`;
}

function formatCacheControlSummary(cacheControl) {
  if (!cacheControl.order.length) {
    return 'empty';
  }

  return cacheControl.order
    .map(({ name, value }) => formatDirective(name, value))
    .join(', ');
}

function formatAgeSummary(age) {
  if (!age.present) {
    return '';
  }

  return age.valid ? formatSeconds(age.seconds) : 'invalid';
}

function formatLastModifiedSummary(lastModified) {
  if (!lastModified.present) {
    return '';
  }

  return lastModified.valid ? 'valid' : 'invalid';
}

function formatEtagSummary(etag) {
  if (!etag.present) {
    return '';
  }

  return etag.valid ? `${etag.strength} validator` : 'invalid';
}

function formatVarySummary(vary) {
  if (!vary.present) {
    return '';
  }

  return vary.wildcard ? 'varies on all request headers' : `varies on ${vary.tokens.join(', ')}`;
}

function getHeaderSummary(name, value) {
  switch (name) {
    case 'cache-control':
      return formatCacheControlSummary(parseCacheControl(value));
    case 'etag':
      return formatEtagSummary(parseEtag(value));
    case 'last-modified':
      return formatLastModifiedSummary(parseLastModified(value));
    case 'vary':
      return formatVarySummary(parseVary(value));
    case 'age':
      return formatAgeSummary(parseCacheAge(value));
    default:
      return '';
  }
}

function createHeaderRows(headers = {}) {
  return CACHE_HEADER_ORDER.flatMap(([name, label]) => {
    const value = getHeaderValue(headers, name);

    if (!value) {
      return [];
    }

    const summary = getHeaderSummary(name, value);
    const text = summary ? `${label}: ${value} | ${summary}` : `${label}: ${value}`;

    return [{
      id: name,
      label,
      name,
      section: 'headers',
      summary,
      text,
      value
    }];
  });
}

function getPathname(path = '') {
  try {
    return new URL(String(path ?? ''), 'http://clinspect.local').pathname;
  } catch {
    return String(path ?? '').split('?')[0] || '/';
  }
}

function hasQuery(path = '') {
  const text = String(path ?? '');

  try {
    return new URL(text, 'http://clinspect.local').search.length > 1;
  } catch {
    return text.includes('?') && text.split('?')[1].length > 0;
  }
}

function getContentType(headers = {}) {
  return getHeaderValue(headers, 'content-type').trim().toLowerCase();
}

function isStaticContentType(contentType = '') {
  return STATIC_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function isStaticAsset(log = {}) {
  const path = getPathname(log?.path ?? '/');
  const contentType = getContentType(log?.response?.headers ?? {});

  return STATIC_ASSET_PATH_PATTERN.test(path) ||
    STATIC_ASSET_FILE_PATTERN.test(path) ||
    isStaticContentType(contentType);
}

function isDynamicContentType(contentType = '') {
  return DYNAMIC_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function isApiPath(path = '') {
  return /^\/(?:api|graphql|trpc)(?:\/|$)/i.test(getPathname(path));
}

function getAuthenticationContext(log = {}) {
  const findings = detectAuthSecrets(log);
  const requestFindings = findings.filter((finding) => finding.side === 'request');
  const responseAuthCookies = findings.filter((finding) => (
    finding.side === 'response' &&
    finding.source === 'cookie' &&
    ['jwt', 'session-cookie', 'token-cookie'].includes(finding.type)
  ));
  const reasons = [];

  if (requestFindings.length > 0) {
    reasons.push('request auth candidate');
  }

  if (responseAuthCookies.length > 0) {
    reasons.push('response auth cookie');
  }

  return {
    authenticated: reasons.length > 0,
    reasons
  };
}

function getDynamicContext(log = {}, staticAsset = false) {
  const responseHeaders = log?.response?.headers ?? {};
  const contentType = getContentType(responseHeaders);
  const reasons = [];

  if (hasHeader(responseHeaders, 'set-cookie')) {
    reasons.push('sets cookie');
  }

  if (!staticAsset && isApiPath(log?.path ?? '/')) {
    reasons.push('api path');
  }

  if (!staticAsset && isDynamicContentType(contentType)) {
    reasons.push(contentType.split(';', 1)[0]);
  }

  if (!staticAsset && hasQuery(log?.path ?? '/')) {
    reasons.push('query-bearing route');
  }

  return {
    dynamic: reasons.length > 0,
    reasons
  };
}

function createContextRows(context) {
  const authenticatedReason = context.authenticatedReasons.length
    ? context.authenticatedReasons.join(', ')
    : 'none';
  const dynamicReason = context.dynamicReasons.length
    ? context.dynamicReasons.join(', ')
    : 'none';

  return [
    {
      id: 'context-authenticated',
      label: 'authenticated',
      section: 'context',
      text: `authenticated: ${context.authenticated ? 'yes' : 'no'} (${authenticatedReason})`,
      value: context.authenticated ? 'yes' : 'no'
    },
    {
      id: 'context-dynamic',
      label: 'dynamic',
      section: 'context',
      text: `dynamic: ${context.dynamic ? 'yes' : 'no'} (${dynamicReason})`,
      value: context.dynamic ? 'yes' : 'no'
    },
    {
      id: 'context-static-asset',
      label: 'static asset',
      section: 'context',
      text: `static asset: ${context.staticAsset ? 'yes' : 'no'}`,
      value: context.staticAsset ? 'yes' : 'no'
    }
  ];
}

function createIssue(id, message) {
  return {
    id,
    message,
    severity: 'caution'
  };
}

export function formatCacheIssue(issue) {
  return `possible issue: ${issue?.message ?? 'review cache headers'}`;
}

function addIssue(issues, seen, id, message) {
  if (seen.has(id)) {
    return;
  }

  seen.add(id);
  issues.push(createIssue(id, message));
}

function createIssueRows(issues = []) {
  return issues.map((issue) => ({
    id: `issue-${issue.id}`,
    label: 'possible issue',
    section: 'issues',
    text: formatCacheIssue(issue),
    value: issue.message
  }));
}

function getCacheIssues(log = {}, context = {}, parsed = {}) {
  const responseHeaders = log?.response?.headers ?? {};
  const issues = [];
  const seen = new Set();
  const cacheControl = parsed.cacheControl;
  const hasCacheControl = hasHeader(responseHeaders, 'cache-control');
  const age = parsed.age;
  const lastModified = parsed.lastModified;
  const noStore = hasDirective(cacheControl, 'no-store');
  const privateCache = hasDirective(cacheControl, 'private');
  const publicCache = hasDirective(cacheControl, 'public');
  const maxAge = parseDirectiveSeconds(cacheControl, 'max-age');
  const sMaxage = parseDirectiveSeconds(cacheControl, 's-maxage');
  const positiveMaxAge = Number.isInteger(maxAge) && maxAge > 0;
  const positiveSMaxage = Number.isInteger(sMaxage) && sMaxage > 0;
  const sensitive = context.authenticated || context.dynamic;
  const sharedCacheable = (publicCache || positiveSMaxage) && !noStore;
  const cacheable = (publicCache || positiveSMaxage || positiveMaxAge) && !noStore;

  if (age.present && !age.valid) {
    addIssue(issues, seen, 'invalid-age', 'Age header is not a valid non-negative integer');
  }

  if (lastModified.present && !lastModified.valid) {
    addIssue(issues, seen, 'invalid-last-modified', 'Last-Modified header is not a valid HTTP date');
  }

  if (noStore && (publicCache || positiveSMaxage || positiveMaxAge)) {
    addIssue(issues, seen, 'conflicting-cache-control', 'Cache-Control combines no-store with cacheable directives');
  }

  if (!sensitive) {
    return issues;
  }

  if (!hasCacheControl) {
    addIssue(issues, seen, 'missing-cache-control', 'authenticated or dynamic response has no Cache-Control header');
  }

  if (publicCache && !noStore) {
    addIssue(issues, seen, 'sensitive-public-cache', 'authenticated or dynamic response allows public caching');
  }

  if (positiveSMaxage && !noStore) {
    addIssue(issues, seen, 'sensitive-shared-cache', 'authenticated or dynamic response allows shared caching');
  }

  if (positiveMaxAge && !privateCache && !noStore) {
    addIssue(issues, seen, 'sensitive-browser-cache', 'authenticated or dynamic response can be stored by browsers');
  }

  if (hasHeader(responseHeaders, 'set-cookie') && sharedCacheable) {
    addIssue(issues, seen, 'set-cookie-shared-cache', 'Set-Cookie response allows shared or public caching');
  }

  if (age.valid && age.seconds > 0 && cacheable) {
    addIssue(issues, seen, 'cached-sensitive-response', 'cached authenticated or dynamic response has Age > 0');
  }

  return issues;
}

export function analyzeCacheHeaders(log = {}, options = {}) {
  const responseHeaders = log?.response?.headers ?? {};
  const headers = createHeaderRows(responseHeaders);
  const cacheControl = parseCacheControl(getHeaderValue(responseHeaders, 'cache-control'));
  const staticAsset = isStaticAsset(log);
  const authenticationContext = getAuthenticationContext(log);
  const dynamicContext = getDynamicContext(log, staticAsset);
  const context = {
    authenticated: authenticationContext.authenticated,
    authenticatedReasons: authenticationContext.reasons,
    dynamic: dynamicContext.dynamic,
    dynamicReasons: dynamicContext.reasons,
    staticAsset
  };
  const parsed = {
    age: parseCacheAge(getHeaderValue(responseHeaders, 'age')),
    cacheControl,
    etag: parseEtag(getHeaderValue(responseHeaders, 'etag')),
    lastModified: parseLastModified(getHeaderValue(responseHeaders, 'last-modified')),
    vary: parseVary(getHeaderValue(responseHeaders, 'vary'))
  };
  const issues = getCacheIssues(log, context, parsed);
  const rows = [
    ...headers,
    ...createContextRows(context),
    ...createIssueRows(issues)
  ];

  return {
    context,
    headers,
    issues,
    parsed,
    rows
  };
}
