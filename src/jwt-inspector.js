const DEFAULT_NEAR_EXPIRY_MS = 15 * 60 * 1000;
const JWT_CANDIDATE_PATTERN = /[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}\.[A-Za-z0-9_-]+={0,2}/g;

function asValues(value) {
  return Array.isArray(value) ? value.map((item) => String(item ?? '')) : [String(value ?? '')];
}

function getNowMs(value) {
  if (value instanceof Date) {
    return value.getTime();
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : Date.now();
}

function safeBase64UrlDecode(value = '') {
  const text = String(value ?? '').trim();
  const unpadded = text.replace(/=+$/g, '');

  if (!unpadded || unpadded.length % 4 === 1 || !/^[A-Za-z0-9_-]+$/.test(unpadded)) {
    return null;
  }

  const padded = unpadded
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(unpadded.length / 4) * 4, '=');

  try {
    return Buffer.from(padded, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function parseBase64UrlJson(value = '') {
  const decoded = safeBase64UrlDecode(value);

  if (!decoded) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded);

    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getNumericDateMs(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return number * 1000;
}

function getClaimText(value) {
  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }

  return Array.isArray(value) || typeof value === 'object'
    ? JSON.stringify(value)
    : String(value);
}

function normalizeScopeValues(value) {
  if (value === null || value === undefined || value === '') {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizeScopeValues(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [String(value)];
}

function getJwtWarnings({ expiresAtMs, isExpired, isNearExpiry }) {
  if (expiresAtMs === null) {
    return [];
  }

  if (isExpired) {
    return ['expired'];
  }

  return isNearExpiry ? ['near expiry'] : [];
}

function createTokenPreview(header = {}) {
  const alg = getClaimText(header.alg);
  const typ = getClaimText(header.typ);

  return typ === 'n/a' ? `JWT ${alg}` : `JWT ${alg}/${typ}`;
}

function headerEntries(headers = {}) {
  return Object.entries(headers ?? {}).flatMap(([name, value]) => (
    asValues(value).map((item) => [String(name), item])
  ));
}

function getHeader(headers = {}, name = '') {
  const normalizedName = String(name ?? '').toLowerCase();
  const entry = Object.entries(headers ?? {})
    .find(([key]) => String(key).toLowerCase() === normalizedName);

  return entry ? entry[1] : undefined;
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

function findingLocation(side, source, name) {
  return `${side} ${source} ${String(name ?? '')}`;
}

function extractJwtCandidates(value = '') {
  const text = String(value ?? '').trim();

  if (!text) {
    return [];
  }

  const bearerMatch = text.match(/^Bearer\s+(.+)$/i);
  const target = bearerMatch ? bearerMatch[1].trim() : text;

  return [...target.matchAll(JWT_CANDIDATE_PATTERN)]
    .map((match) => match[0])
    .filter(Boolean);
}

function addDecodedJwtToken(tokens, seenTokens, rawToken, metadata, options) {
  if (seenTokens.has(rawToken)) {
    return;
  }

  const decoded = decodeJwtToken(rawToken, options);

  if (!decoded.decoded) {
    return;
  }

  seenTokens.add(rawToken);
  tokens.push({
    ...decoded,
    location: findingLocation(metadata.side, metadata.source, metadata.name),
    name: String(metadata.name ?? ''),
    side: metadata.side,
    source: metadata.source
  });
}

function addJwtTokensFromValue(tokens, seenTokens, value, metadata, options) {
  for (const rawToken of extractJwtCandidates(value)) {
    addDecodedJwtToken(tokens, seenTokens, rawToken, metadata, options);
  }
}

export function formatJwtTimeClaim(value, options = {}) {
  const expiresAtMs = getNumericDateMs(value);

  if (value === null || value === undefined || value === '') {
    return 'n/a';
  }

  if (expiresAtMs === null) {
    return 'invalid';
  }

  const date = new Date(expiresAtMs);

  return Number.isNaN(date.getTime()) ? 'invalid' : date.toISOString();
}

export function formatJwtScopes(payload = {}) {
  const values = normalizeScopeValues(payload.scope)
    .concat(normalizeScopeValues(payload.scp))
    .concat(normalizeScopeValues(payload.scopes));
  const uniqueValues = [...new Set(values)];

  return uniqueValues.length > 0 ? uniqueValues.join(', ') : 'n/a';
}

export function decodeJwtToken(token = '', options = {}) {
  const rawToken = String(token ?? '').trim().replace(/^Bearer\s+/i, '');
  const parts = rawToken.split('.');

  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    return {
      decoded: false,
      reason: 'malformed',
      tokenPreview: ''
    };
  }

  const header = parseBase64UrlJson(parts[0]);
  const payload = parseBase64UrlJson(parts[1]);

  if (!header || !payload) {
    return {
      decoded: false,
      reason: 'invalid-json',
      tokenPreview: ''
    };
  }

  const nowMs = getNowMs(options.now);
  const nearExpiryMs = Number.isFinite(Number(options.nearExpiryMs))
    ? Number(options.nearExpiryMs)
    : DEFAULT_NEAR_EXPIRY_MS;
  const expiresAtMs = getNumericDateMs(payload.exp);
  const isExpired = expiresAtMs !== null && expiresAtMs <= nowMs;
  const isNearExpiry = expiresAtMs !== null && !isExpired && expiresAtMs - nowMs <= nearExpiryMs;
  const expiresAt = formatJwtTimeClaim(payload.exp);

  return {
    decoded: true,
    expiresAt: expiresAt === 'n/a' || expiresAt === 'invalid' ? null : expiresAt,
    header,
    isExpired,
    isNearExpiry,
    issuer: getClaimText(payload.iss),
    payload,
    reason: 'decoded',
    scopes: formatJwtScopes(payload),
    subject: getClaimText(payload.sub),
    tokenPreview: createTokenPreview(header),
    warnings: getJwtWarnings({ expiresAtMs, isExpired, isNearExpiry })
  };
}

export function findJwtTokensInLog(log = {}, options = {}) {
  const tokens = [];
  const seenTokens = new Set();

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
          addJwtTokensFromValue(tokens, seenTokens, cookie.value, {
            name: cookie.name,
            side,
            source: 'cookie'
          }, options);
        }
        continue;
      }

      if (side === 'response' && name === 'set-cookie') {
        const cookie = parseSetCookie(value);

        if (cookie) {
          addJwtTokensFromValue(tokens, seenTokens, cookie.value, {
            name: cookie.name,
            side,
            source: 'cookie'
          }, options);
        }
        continue;
      }

      addJwtTokensFromValue(tokens, seenTokens, value, {
        name,
        side,
        source: 'header'
      }, options);
    }
  }

  for (const [name, value] of parseQueryParams(log?.path)) {
    addJwtTokensFromValue(tokens, seenTokens, value, {
      name,
      side: 'request',
      source: 'query'
    }, options);
  }

  for (const side of ['request', 'response']) {
    for (const [name, value] of parseBodyFields(log?.[side] ?? {})) {
      addJwtTokensFromValue(tokens, seenTokens, value, {
        name,
        side,
        source: 'body'
      }, options);
    }
  }

  return tokens;
}
