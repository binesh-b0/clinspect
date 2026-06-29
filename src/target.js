export function isLoopbackHostname(hostname = '') {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/g, '');

  return normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '::1' ||
    normalized.startsWith('127.');
}

export function isLoopbackTargetUrl(targetUrl) {
  if (!targetUrl) {
    return false;
  }

  try {
    return isLoopbackHostname(new URL(targetUrl).hostname);
  } catch {
    return false;
  }
}

export function isPublicTargetUrl(targetUrl) {
  return Boolean(targetUrl) && !isLoopbackTargetUrl(targetUrl);
}

export function getProxyOrigin(port = 8080) {
  return `http://localhost:${port}`;
}
