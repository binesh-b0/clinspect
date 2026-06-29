export const COOKIE_VALUE_MASK = '<redacted>';

function asHeaderValues(value) {
  return Array.isArray(value) ? value.map((item) => String(item)) : [String(value ?? '')];
}

export function isCookieHeaderName(name) {
  const normalized = String(name ?? '').toLowerCase();

  return normalized === 'cookie' || normalized === 'set-cookie';
}

export function maskRequestCookieHeader(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return COOKIE_VALUE_MASK;
  }

  const maskedParts = text.split(';').map((part) => {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex <= 0) {
      return COOKIE_VALUE_MASK;
    }

    return `${trimmed.slice(0, separatorIndex).trim()}=${COOKIE_VALUE_MASK}`;
  });

  return maskedParts.join('; ');
}

export function maskSetCookieHeader(value) {
  const text = String(value ?? '').trim();

  if (!text) {
    return COOKIE_VALUE_MASK;
  }

  const parts = text.split(';');
  const cookiePair = parts[0].trim();
  const separatorIndex = cookiePair.indexOf('=');

  if (separatorIndex <= 0) {
    return COOKIE_VALUE_MASK;
  }

  const maskedCookie = `${cookiePair.slice(0, separatorIndex).trim()}=${COOKIE_VALUE_MASK}`;
  const attributes = parts.slice(1)
    .map((part) => part.trim())
    .filter(Boolean);

  return [maskedCookie, ...attributes].join('; ');
}

export function maskCookieHeaderValue(name, value) {
  const normalized = String(name ?? '').toLowerCase();
  const values = asHeaderValues(value);
  const maskedValues = values.map((item) => (
    normalized === 'set-cookie'
      ? maskSetCookieHeader(item)
      : maskRequestCookieHeader(item)
  ));

  return Array.isArray(value) ? maskedValues : maskedValues[0];
}

export function maskCookieHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      isCookieHeaderName(key) ? maskCookieHeaderValue(key, value) : value
    ])
  );
}

export function maskLogEntryCookies(entry = {}) {
  return {
    ...entry,
    request: {
      ...entry.request,
      headers: maskCookieHeaders(entry.request?.headers)
    },
    response: {
      ...entry.response,
      headers: maskCookieHeaders(entry.response?.headers)
    }
  };
}
