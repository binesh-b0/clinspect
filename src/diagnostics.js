const CREDENTIAL_HEADERS = ['authorization', 'cookie', 'proxy-authorization'];
const API_PREFIX_PATTERN = /^(?:api|graphql|trpc|v\d+)$/i;
const ID_SEGMENT_PATTERN = /^:id$/;
const JSON_CONTENT_TYPE_PATTERN = /(?:^|[+/.-])json$/;
const HTML_CONTENT_TYPE_PATTERN = /^(?:text\/html|application\/xhtml\+xml)$/;
const FORM_CONTENT_TYPE_PATTERN = /^application\/x-www-form-urlencoded$/;

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

function normalizeHeaderToken(value = '') {
  return String(value ?? '').trim().toLowerCase();
}

function splitHeaderList(value = '') {
  return asValues(value)
    .join(',')
    .split(',')
    .map(normalizeHeaderToken)
    .filter(Boolean);
}

function normalizeContentType(value = '') {
  return String(value ?? '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

function normalizeMethod(value = '') {
  return String(value || 'GET').toUpperCase();
}

function getStatusCode(log = {}) {
  const status = Number(log.statusCode);

  return Number.isInteger(status) ? status : null;
}

function getPathname(path = '') {
  try {
    return new URL(String(path || '/'), 'http://clinspect.local').pathname || '/';
  } catch {
    return String(path || '/').split(/[?#]/, 1)[0] || '/';
  }
}

function createIssue(section, id, kind, message, details = {}) {
  return {
    details,
    id,
    kind,
    message,
    section,
    severity: 'warning'
  };
}

function createInfo(id, label, value, section = 'summary') {
  return {
    id,
    label,
    section,
    text: `${label}: ${value}`,
    value
  };
}

function getCorsAllowedOrigins(value = '') {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return [];
  }

  return raw.split(/\s+/).filter(Boolean);
}

function isCorsOriginAllowed(origin = '', allowOrigin = '') {
  const allowedOrigins = getCorsAllowedOrigins(allowOrigin);

  return allowedOrigins.includes('*') || allowedOrigins.includes(origin);
}

function hasCredentialLikeRequest(log = {}) {
  return CREDENTIAL_HEADERS.some((header) => hasHeader(log.request?.headers, header));
}

function getRequestedCorsHeaders(log = {}) {
  return splitHeaderList(getHeaderValue(log.request?.headers, 'access-control-request-headers'));
}

function getAllowedCorsHeaders(log = {}) {
  return splitHeaderList(getHeaderValue(log.response?.headers, 'access-control-allow-headers'));
}

function getAllowedCorsMethods(log = {}) {
  return splitHeaderList(getHeaderValue(log.response?.headers, 'access-control-allow-methods'))
    .map((method) => method.toUpperCase());
}

function getCorsSummary(log = {}) {
  const requestHeaders = log.request?.headers ?? {};
  const responseHeaders = log.response?.headers ?? {};
  const method = normalizeMethod(log.method);
  const origin = getHeaderValue(requestHeaders, 'origin').trim();
  const requestedMethod = getHeaderValue(requestHeaders, 'access-control-request-method').trim().toUpperCase();
  const preflight = method === 'OPTIONS' && Boolean(origin && requestedMethod);
  const allowOrigin = getHeaderValue(responseHeaders, 'access-control-allow-origin').trim();
  const allowCredentials = getHeaderValue(responseHeaders, 'access-control-allow-credentials').trim().toLowerCase();
  const credentialLike = hasCredentialLikeRequest(log);
  const requestedHeaders = getRequestedCorsHeaders(log);

  return {
    allowCredentials,
    allowHeaders: getAllowedCorsHeaders(log),
    allowMethods: getAllowedCorsMethods(log),
    allowOrigin,
    credentialLike,
    origin,
    preflight,
    requestedHeaders,
    requestedMethod
  };
}

export function analyzeCors(log = {}, options = {}) {
  const summary = getCorsSummary(log);
  const issues = [];

  if (!summary.origin) {
    return {
      issues,
      preflight: false,
      rows: [
        createInfo('cors-origin', 'origin', 'none', 'cors'),
        createInfo('cors-status', 'cors', 'not a cross-origin browser request', 'cors')
      ],
      summary
    };
  }

  if (!summary.allowOrigin) {
    issues.push(createIssue(
      'cors',
      'missing-allow-origin',
      'cors-origin',
      'Origin request has no Access-Control-Allow-Origin response header',
      { origin: summary.origin }
    ));
  } else if (!isCorsOriginAllowed(summary.origin, summary.allowOrigin)) {
    issues.push(createIssue(
      'cors',
      'origin-not-allowed',
      'cors-origin',
      'Access-Control-Allow-Origin does not match the request Origin',
      { allowOrigin: summary.allowOrigin, origin: summary.origin }
    ));
  }

  if (summary.credentialLike && summary.allowOrigin === '*') {
    issues.push(createIssue(
      'cors',
      'wildcard-with-credentials',
      'cors-credentials',
      'Credential-like request cannot use Access-Control-Allow-Origin *',
      { allowOrigin: summary.allowOrigin }
    ));
  }

  if (summary.credentialLike && summary.allowCredentials !== 'true') {
    issues.push(createIssue(
      'cors',
      'credentials-not-allowed',
      'cors-credentials',
      'Credential-like request is missing Access-Control-Allow-Credentials: true',
      { allowCredentials: summary.allowCredentials || 'missing' }
    ));
  }

  if (summary.preflight && !summary.allowMethods.includes(summary.requestedMethod)) {
    issues.push(createIssue(
      'cors',
      'method-not-allowed',
      'cors-method',
      'Preflight requested method is not listed in Access-Control-Allow-Methods',
      { allowMethods: summary.allowMethods, requestedMethod: summary.requestedMethod }
    ));
  }

  if (summary.preflight && summary.requestedHeaders.length > 0) {
    const missingHeaders = summary.requestedHeaders.filter((header) => !summary.allowHeaders.includes(header));

    if (missingHeaders.length > 0) {
      issues.push(createIssue(
        'cors',
        'headers-not-allowed',
        'cors-headers',
        'Preflight requested headers are not listed in Access-Control-Allow-Headers',
        { missingHeaders }
      ));
    }
  }

  return {
    issues,
    preflight: summary.preflight,
    rows: [
      createInfo('cors-origin', 'origin', summary.origin, 'cors'),
      createInfo('cors-preflight', 'preflight', summary.preflight ? 'yes' : 'no', 'cors'),
      createInfo('cors-requested-method', 'requested method', summary.requestedMethod || 'n/a', 'cors'),
      createInfo('cors-requested-headers', 'requested headers', summary.requestedHeaders.join(', ') || 'n/a', 'cors'),
      createInfo('cors-allow-origin', 'allow origin', summary.allowOrigin || 'missing', 'cors'),
      createInfo('cors-allow-credentials', 'allow credentials', summary.allowCredentials || 'missing', 'cors'),
      createInfo('cors-allow-methods', 'allow methods', summary.allowMethods.join(', ') || 'missing', 'cors'),
      createInfo('cors-allow-headers', 'allow headers', summary.allowHeaders.join(', ') || 'missing', 'cors')
    ],
    summary
  };
}

function parseAcceptItem(item = '') {
  const [rawType, ...parameterParts] = String(item ?? '').split(';');
  const type = normalizeContentType(rawType);
  let quality = 1;

  for (const part of parameterParts) {
    const [rawName, rawValue] = part.split('=');

    if (String(rawName ?? '').trim().toLowerCase() === 'q') {
      const parsedQuality = Number(String(rawValue ?? '').trim());

      if (Number.isFinite(parsedQuality)) {
        quality = parsedQuality;
      }
    }
  }

  return { quality, type };
}

export function parseAcceptHeader(value = '') {
  const raw = String(value ?? '').trim();

  if (!raw) {
    return [{ quality: 1, type: '*/*' }];
  }

  return raw.split(',')
    .map(parseAcceptItem)
    .filter((item) => item.type && item.quality > 0);
}

function mediaRangeMatches(mediaRange = '', contentType = '') {
  const range = normalizeContentType(mediaRange);
  const type = normalizeContentType(contentType);

  if (!range || !type || range === '*/*') {
    return Boolean(range && type);
  }

  const [rangeType, rangeSubtype] = range.split('/');
  const [typeType, typeSubtype] = type.split('/');

  if (!rangeType || !rangeSubtype || !typeType || !typeSubtype) {
    return false;
  }

  if (rangeType !== '*' && rangeType !== typeType) {
    return false;
  }

  if (rangeSubtype === '*' || rangeSubtype === typeSubtype) {
    return true;
  }

  if (rangeSubtype.startsWith('*+') && typeSubtype.endsWith(rangeSubtype.slice(1))) {
    return true;
  }

  return false;
}

function acceptsContentType(acceptItems = [], contentType = '') {
  return acceptItems.some((item) => mediaRangeMatches(item.type, contentType));
}

function prefersJson(acceptItems = []) {
  return acceptItems.some((item) => (
    item.quality > 0 &&
    (
      item.type === 'application/json' ||
      item.type.endsWith('+json') ||
      item.type === 'application/*+json'
    )
  ));
}

function isJsonContentType(contentType = '') {
  return JSON_CONTENT_TYPE_PATTERN.test(normalizeContentType(contentType));
}

function isHtmlContentType(contentType = '') {
  return HTML_CONTENT_TYPE_PATTERN.test(normalizeContentType(contentType));
}

function isFormContentType(contentType = '') {
  return FORM_CONTENT_TYPE_PATTERN.test(normalizeContentType(contentType));
}

function looksLikeJsonBody(body = '') {
  const text = String(body ?? '').trim();

  return text.startsWith('{') || text.startsWith('[');
}

function looksLikeFormBody(body = '') {
  const text = String(body ?? '').trim();

  return /^[^=\s&]+=[\s\S]*$/.test(text) && !text.includes('\n');
}

function getAcceptedEncodings(headers = {}) {
  const raw = getHeaderValue(headers, 'accept-encoding');

  if (!raw) {
    return [];
  }

  return raw.split(',')
    .map((part) => part.trim().split(';', 1)[0].toLowerCase())
    .filter(Boolean);
}

function getNegotiationSummary(log = {}) {
  const requestHeaders = log.request?.headers ?? {};
  const responseHeaders = log.response?.headers ?? {};
  const accept = getHeaderValue(requestHeaders, 'accept').trim();
  const requestContentType = normalizeContentType(getHeaderValue(requestHeaders, 'content-type'));
  const acceptEncoding = getHeaderValue(requestHeaders, 'accept-encoding').trim();
  const responseContentType = normalizeContentType(getHeaderValue(responseHeaders, 'content-type'));
  const responseContentEncoding = normalizeHeaderToken(getHeaderValue(responseHeaders, 'content-encoding'));

  return {
    accept,
    acceptEncoding,
    acceptItems: parseAcceptHeader(accept),
    requestContentType,
    responseContentEncoding,
    responseContentType
  };
}

export function analyzeContentNegotiation(log = {}, options = {}) {
  const summary = getNegotiationSummary(log);
  const issues = [];
  const responseBody = String(log.response?.body ?? '');
  const requestBody = String(log.request?.body ?? '');
  const statusCode = getStatusCode(log);
  const apiLike = /^\/(?:api|graphql|trpc)(?:\/|$)/i.test(getPathname(log.path));

  if (summary.responseContentType && !acceptsContentType(summary.acceptItems, summary.responseContentType)) {
    issues.push(createIssue(
      'content-negotiation',
      'response-not-acceptable',
      'accept',
      'Response Content-Type does not match the request Accept header',
      { accept: summary.accept || '*/*', responseContentType: summary.responseContentType }
    ));
  }

  if (prefersJson(summary.acceptItems) && isHtmlContentType(summary.responseContentType) && (apiLike || statusCode >= 400)) {
    issues.push(createIssue(
      'content-negotiation',
      'json-client-html-response',
      'accept',
      'JSON-preferring client received an HTML response',
      { accept: summary.accept, responseContentType: summary.responseContentType }
    ));
  }

  if (summary.responseContentEncoding && summary.responseContentEncoding !== 'identity') {
    const encodings = getAcceptedEncodings(log.request?.headers ?? {});

    if (encodings.length > 0 && !encodings.includes('*') && !encodings.includes(summary.responseContentEncoding)) {
      issues.push(createIssue(
        'content-negotiation',
        'encoding-not-accepted',
        'accept-encoding',
        'Response Content-Encoding is not listed in Accept-Encoding',
        { acceptEncoding: summary.acceptEncoding, responseContentEncoding: summary.responseContentEncoding }
      ));
    }
  }

  if (requestBody.trim()) {
    if (looksLikeJsonBody(requestBody) && !isJsonContentType(summary.requestContentType)) {
      issues.push(createIssue(
        'content-negotiation',
        'request-json-content-type-mismatch',
        'content-type',
        summary.requestContentType
          ? 'Request body looks like JSON but Content-Type is not JSON'
          : 'Request body looks like JSON but Content-Type is missing',
        { requestContentType: summary.requestContentType || 'missing' }
      ));
    }

    if (looksLikeFormBody(requestBody) && !isFormContentType(summary.requestContentType)) {
      issues.push(createIssue(
        'content-negotiation',
        'request-form-content-type-mismatch',
        'content-type',
        summary.requestContentType
          ? 'Request body looks like form data but Content-Type is not form-urlencoded'
          : 'Request body looks like form data but Content-Type is missing',
        { requestContentType: summary.requestContentType || 'missing' }
      ));
    }
  }

  if (responseBody.length > 0 && !summary.responseContentType) {
    issues.push(createIssue(
      'content-negotiation',
      'missing-response-content-type',
      'content-type',
      'Response has a body but no Content-Type header',
      {}
    ));
  }

  return {
    issues,
    rows: [
      createInfo('negotiation-accept', 'accept', summary.accept || '*/*', 'content-negotiation'),
      createInfo('negotiation-request-content-type', 'request content type', summary.requestContentType || 'missing', 'content-negotiation'),
      createInfo('negotiation-accept-encoding', 'accept encoding', summary.acceptEncoding || 'n/a', 'content-negotiation'),
      createInfo('negotiation-response-content-type', 'response content type', summary.responseContentType || 'missing', 'content-negotiation'),
      createInfo('negotiation-response-content-encoding', 'response content encoding', summary.responseContentEncoding || 'identity', 'content-negotiation')
    ],
    summary
  };
}

function singularize(value = '') {
  const text = String(value ?? '');

  if (text.endsWith('ies') && text.length > 3) {
    return `${text.slice(0, -3)}y`;
  }

  if (text.endsWith('ses') || text.endsWith('xes') || text.endsWith('zes') || text.endsWith('ches') || text.endsWith('shes')) {
    return text.slice(0, -2);
  }

  if (text.endsWith('s') && !text.endsWith('ss') && text.length > 1) {
    return text.slice(0, -1);
  }

  return text;
}

function humanizeSegment(value = '') {
  return String(value ?? '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function getRouteSegments(path = '') {
  return getPathname(path)
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
}

function getActionSegments(path = '') {
  const segments = getRouteSegments(path);
  let index = 0;

  while (index < segments.length && API_PREFIX_PATTERN.test(segments[index])) {
    index += 1;
  }

  return segments.slice(index);
}

function isIdSegment(segment = '') {
  return ID_SEGMENT_PATTERN.test(segment) ||
    /^\d+$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment) ||
    /^[0-9a-f]{12,}$/i.test(segment) ||
    (segment.length >= 12 && /\d/.test(segment) && /^[A-Za-z0-9_-]+$/.test(segment));
}

export function inferRestAction(log = {}, options = {}) {
  const method = normalizeMethod(log.method);
  const segments = getActionSegments(log.path);
  const lastSegment = segments[segments.length - 1] ?? '';
  const itemRoute = isIdSegment(lastSegment);
  const resourceSegment = [...segments].reverse().find((segment) => !isIdSegment(segment));
  const resource = humanizeSegment(resourceSegment || 'resource');
  const singular = singularize(resource);
  let action = null;

  if ((method === 'GET' || method === 'HEAD') && itemRoute) {
    action = `get ${singular}`;
  } else if (method === 'GET' || method === 'HEAD') {
    action = `list ${resource}`;
  } else if (method === 'POST' && !itemRoute) {
    action = `create ${singular}`;
  } else if ((method === 'PUT' || method === 'PATCH') && itemRoute) {
    action = `update ${singular}`;
  } else if (method === 'DELETE' && itemRoute) {
    action = `delete ${singular}`;
  } else if (method === 'OPTIONS') {
    action = 'describe endpoint options';
  } else {
    action = `${method.toLowerCase()} ${itemRoute ? singular : resource}`;
  }

  return {
    action,
    confidence: resourceSegment ? 'medium' : 'low',
    itemRoute,
    method,
    resource,
    route: `/${segments.join('/') || ''}` || '/',
    section: 'rest-action'
  };
}

export function formatDiagnosticsIssue(issue = {}) {
  const section = issue.section === 'content-negotiation'
    ? 'content negotiation'
    : (issue.section ?? 'diagnostics');

  return `${section} issue: ${issue.message ?? 'review request diagnostics'}`;
}
