import { decodeJwtToken } from './jwt-inspector.js';

const BADGES = Object.freeze({
  'api-key': 'api key',
  bearer: 'bearer',
  'basic-auth': 'basic auth',
  csrf: 'csrf',
  jwt: 'JWT',
  'session-cookie': 'session cookie',
  'token-cookie': 'token cookie'
});

const AUTHORIZATION_HEADERS = new Set(['authorization', 'proxy-authorization']);
const API_KEY_HEADERS = new Set(['x-api-key', 'api-key', 'x-auth-token']);
const CSRF_HEADERS = new Set(['x-csrf-token', 'x-xsrf-token']);
const SESSION_COOKIE_NAMES = new Set(['sid', 'session', 'sessionid', 'connect.sid']);

function asValues(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [String(value ?? '')];
}

function normalizeName(value = '') {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function nameTokens(value = '') {
  return normalizeName(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasAnyToken(value, tokens) {
  const values = new Set(nameTokens(value));

  return tokens.some((token) => values.has(token));
}

function hasApiKeyName(value) {
  const tokens = new Set(nameTokens(value));

  return (tokens.has('api') && tokens.has('key')) ||
    (tokens.has('client') && tokens.has('secret')) ||
    tokens.has('secret') ||
    tokens.has('token') ||
    tokens.has('auth');
}

function hasCsrfName(value) {
  return hasAnyToken(value, ['csrf', 'xsrf']);
}

function hasSessionCookieName(value) {
  const normalized = normalizeName(value).replace(/_/g, '.');
  const tokens = new Set(nameTokens(value));

  return SESSION_COOKIE_NAMES.has(normalized) ||
    tokens.has('sid') ||
    tokens.has('session') ||
    tokens.has('sessionid') ||
    /(?:^|[._-])session[._-]?id$/.test(normalized);
}

function hasTokenCookieName(value) {
  const normalized = normalizeName(value);
  const tokens = new Set(nameTokens(value));

  return /(?:^|_)access_token$/.test(normalized) ||
    /(?:^|_)refresh_token$/.test(normalized) ||
    /(?:^|_)id_token$/.test(normalized) ||
    tokens.has('token') ||
    (tokens.has('auth') && tokens.has('token'));
}

function classifyNamedSecret(name, source) {
  if (hasCsrfName(name)) {
    return 'csrf';
  }

  if (source === 'cookie' && hasSessionCookieName(name)) {
    return 'session-cookie';
  }

  if (source === 'cookie' && hasTokenCookieName(name)) {
    return 'token-cookie';
  }

  if (hasApiKeyName(name)) {
    return 'api-key';
  }

  return null;
}

function classifyCookieSecret(name, value) {
  if (hasCsrfName(name)) {
    return 'csrf';
  }

  if (isJwtLike(value)) {
    return 'jwt';
  }

  if (hasSessionCookieName(name)) {
    return 'session-cookie';
  }

  if (hasTokenCookieName(name)) {
    return 'token-cookie';
  }

  return hasApiKeyName(name) ? 'api-key' : null;
}

function classifyStructuredSecret(name, value, source) {
  const authorizationType = /(?:^|[.[_-])authorization$/i.test(String(name ?? ''))
    ? getAuthorizationType(value)
    : null;

  return authorizationType ?? classifyNamedSecret(name, source);
}

function isJwtLike(value = '') {
  return decodeJwtToken(value).decoded === true;
}

function getAuthorizationType(value = '') {
  const text = String(value ?? '').trim();
  const bearerMatch = text.match(/^Bearer\s+(.+)$/i);

  if (bearerMatch) {
    return isJwtLike(bearerMatch[1].trim()) ? 'jwt' : 'bearer';
  }

  if (/^Basic\s+\S+/i.test(text)) {
    return 'basic-auth';
  }

  return isJwtLike(text) ? 'jwt' : null;
}

function headerEntries(headers = {}) {
  return Object.entries(headers ?? {}).flatMap(([name, value]) => (
    asValues(value).map((item) => [String(name), item])
  ));
}

function parseRequestCookies(value = '') {
  return String(value ?? '')
    .split(';')
    .map((part) => part.trim())
    .map((part) => {
      const separatorIndex = part.indexOf('=');

      if (separatorIndex <= 0) {
        return null;
      }

      return {
        name: part.slice(0, separatorIndex).trim(),
        value: part.slice(separatorIndex + 1).trim()
      };
    })
    .filter((item) => item?.name);
}

function parseSetCookie(value = '') {
  const cookiePair = String(value ?? '').split(';', 1)[0]?.trim() ?? '';
  const separatorIndex = cookiePair.indexOf('=');

  if (separatorIndex <= 0) {
    return null;
  }

  return {
    name: cookiePair.slice(0, separatorIndex).trim(),
    value: cookiePair.slice(separatorIndex + 1).trim()
  };
}

function getHeader(headers = {}, name = '') {
  const normalizedName = String(name ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([key]) => String(key).toLowerCase() === normalizedName);

  return entry ? entry[1] : undefined;
}

function parseQueryParams(path = '') {
  const text = String(path ?? '');

  if (!text) {
    return [];
  }

  try {
    const url = new URL(text, 'http://clinspect.local');

    return [...url.searchParams.entries()];
  } catch {
    const queryIndex = text.indexOf('?');

    if (queryIndex === -1) {
      return [];
    }

    return [...new URLSearchParams(text.slice(queryIndex + 1)).entries()];
  }
}

function isJsonContentType(value = '') {
  return /(?:^|[+/.-])json(?:$|[;\s])/i.test(String(value ?? ''));
}

function isUrlEncodedContentType(value = '') {
  return /^application\/x-www-form-urlencoded(?:$|[;\s])/i.test(String(value ?? ''));
}

function looksLikeJson(value = '') {
  const text = String(value ?? '').trim();

  return text.startsWith('{') || text.startsWith('[');
}

function looksLikeForm(value = '') {
  const text = String(value ?? '').trim();

  return /^[^=\s&]+=[\s\S]*$/.test(text) && !text.includes('\n');
}

function pathToText(path = []) {
  return path.reduce((text, part) => {
    if (typeof part === 'number') {
      return `${text}[${part}]`;
    }

    return text ? `${text}.${part}` : String(part);
  }, '');
}

function collectJsonFields(value, visit, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectJsonFields(item, visit, [...path, index]));
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    const nextPath = [...path, key];

    if (childValue === null || typeof childValue !== 'object') {
      visit(pathToText(nextPath), childValue);
    } else {
      collectJsonFields(childValue, visit, nextPath);
    }
  }
}

function parseBodyFields(payload = {}) {
  const body = String(payload?.body ?? '').trim();

  if (!body) {
    return [];
  }

  const contentType = String(getHeader(payload?.headers ?? {}, 'content-type') ?? '');
  const fields = [];

  if (isJsonContentType(contentType) || looksLikeJson(body)) {
    try {
      collectJsonFields(JSON.parse(body), (name, value) => {
        fields.push([name, String(value ?? '')]);
      });
      return fields;
    } catch {
      return [];
    }
  }

  if (isUrlEncodedContentType(contentType) || looksLikeForm(body)) {
    return [...new URLSearchParams(body).entries()];
  }

  return [];
}

function slug(value = '') {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'secret';
}

function findingLocation(side, source, name) {
  return `${side} ${source} ${name}`;
}

function createFinding({ index, name, side, source, type }) {
  const safeName = String(name ?? '');

  return {
    badge: BADGES[type] ?? type,
    id: `${side}-${source}-${slug(safeName)}-${type}-${index}`,
    location: findingLocation(side, source, safeName),
    name: safeName,
    side,
    source,
    type
  };
}

export function detectAuthSecrets(log = {}, options = {}) {
  const findings = [];
  const seen = new Set();
  const addFinding = ({ name, side, source, type }) => {
    if (!type || !name) {
      return;
    }

    const key = `${side}|${source}|${type}|${String(name).toLowerCase()}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    findings.push(createFinding({
      index: findings.length,
      name,
      side,
      source,
      type
    }));
  };

  for (const side of ['request', 'response']) {
    const payload = log?.[side] ?? {};
    const headers = payload.headers ?? {};

    for (const [rawName, rawValue] of headerEntries(headers)) {
      const name = String(rawName ?? '').toLowerCase();
      const value = String(rawValue ?? '').trim();

      if (!value) {
        continue;
      }

      if (side === 'request' && name === 'cookie') {
        for (const cookie of parseRequestCookies(value)) {
          const type = classifyCookieSecret(cookie.name, cookie.value);

          addFinding({ name: cookie.name, side, source: 'cookie', type });
        }
        continue;
      }

      if (side === 'response' && name === 'set-cookie') {
        const cookie = parseSetCookie(value);

        if (cookie) {
          const type = classifyCookieSecret(cookie.name, cookie.value);

          addFinding({ name: cookie.name, side, source: 'cookie', type });
        }
        continue;
      }

      if (AUTHORIZATION_HEADERS.has(name)) {
        addFinding({ name, side, source: 'header', type: getAuthorizationType(value) });
        continue;
      }

      if (CSRF_HEADERS.has(name)) {
        addFinding({ name, side, source: 'header', type: 'csrf' });
        continue;
      }

      if (API_KEY_HEADERS.has(name)) {
        addFinding({ name, side, source: 'header', type: isJwtLike(value) ? 'jwt' : 'api-key' });
        continue;
      }

      const namedType = classifyNamedSecret(name, 'header');

      if (namedType) {
        addFinding({ name, side, source: 'header', type: isJwtLike(value) ? 'jwt' : namedType });
      }
    }
  }

  for (const [name, value] of parseQueryParams(log?.path)) {
    const trimmedValue = String(value ?? '').trim();
    const namedType = classifyStructuredSecret(name, trimmedValue, 'query');

    if (trimmedValue && namedType) {
      addFinding({ name, side: 'request', source: 'query', type: isJwtLike(trimmedValue) ? 'jwt' : namedType });
    }
  }

  for (const side of ['request', 'response']) {
    for (const [name, value] of parseBodyFields(log?.[side] ?? {})) {
      const trimmedValue = String(value ?? '').trim();
      const namedType = classifyStructuredSecret(name, trimmedValue, 'body');

      if (trimmedValue && namedType) {
        addFinding({ name, side, source: 'body', type: isJwtLike(trimmedValue) ? 'jwt' : namedType });
      }
    }
  }

  return findings;
}
