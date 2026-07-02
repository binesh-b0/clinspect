const DEFAULT_REDIRECT_WINDOW_MS = 10_000;
const DEFAULT_REPEAT_WINDOW_MS = 2_000;
const RETRYABLE_STATUS_CODES = new Set([429]);
const NON_IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function normalizeHeaderName(value = '') {
  return String(value ?? '').toLowerCase();
}

function findHeaderEntry(headers = {}, name = '') {
  const normalizedName = normalizeHeaderName(name);

  return Object.entries(headers ?? {})
    .find(([headerName]) => normalizeHeaderName(headerName) === normalizedName) ?? null;
}

function getHeaderValue(headers = {}, name = '') {
  const entry = findHeaderEntry(headers, name);

  if (!entry) {
    return '';
  }

  const value = entry[1];

  return Array.isArray(value) ? value.join(', ') : String(value);
}

function getTimestampMs(log = {}) {
  const timestamp = Number(log.timestamp);

  if (Number.isFinite(timestamp)) {
    return timestamp;
  }

  const parsed = Date.parse(String(log.timestamp ?? ''));

  return Number.isFinite(parsed) ? parsed : null;
}

function sortLogEntries(logs = []) {
  return (logs ?? []).map((log, index) => ({
    index,
    log,
    timestamp: getTimestampMs(log)
  })).sort((left, right) => {
    if (left.timestamp !== null && right.timestamp !== null && left.timestamp !== right.timestamp) {
      return left.timestamp - right.timestamp;
    }

    return left.index - right.index;
  }).map((entry, order) => ({ ...entry, order }));
}

function normalizeMethod(value = '') {
  return String(value || 'GET').toUpperCase();
}

function getPathMatchKey(path = '') {
  const rawPath = String(path || '/');

  try {
    const parsed = new URL(rawPath, 'http://clinspect.local');

    return `${parsed.pathname || '/'}${parsed.search}`;
  } catch {
    return rawPath || '/';
  }
}

function getBaseUrlForPath(path = '') {
  try {
    return new URL(String(path || '/'), 'http://clinspect.local');
  } catch {
    return new URL('/', 'http://clinspect.local');
  }
}

function resolveRedirectLocation(location = '', sourcePath = '/') {
  const rawLocation = String(location ?? '').trim();

  if (!rawLocation) {
    return {
      display: '',
      matchPath: ''
    };
  }

  try {
    const parsed = new URL(rawLocation, getBaseUrlForPath(sourcePath));

    return {
      display: rawLocation,
      matchPath: `${parsed.pathname || '/'}${parsed.search}`
    };
  } catch {
    return {
      display: rawLocation,
      matchPath: rawLocation
    };
  }
}

function getStatusCode(log = {}) {
  const statusCode = Number(log.statusCode);

  return Number.isInteger(statusCode) ? statusCode : null;
}

function isRedirectLog(log = {}) {
  const statusCode = getStatusCode(log);

  return statusCode !== null && statusCode >= 300 && statusCode < 400 &&
    Boolean(getHeaderValue(log.response?.headers, 'location').trim());
}

function isWithinWindow(sourceEntry, targetEntry, windowMs) {
  if (sourceEntry.timestamp === null || targetEntry.timestamp === null) {
    return true;
  }

  const delta = targetEntry.timestamp - sourceEntry.timestamp;

  return delta >= 0 && delta <= windowMs;
}

function findNextRedirectTarget(sourceEntry, entries, destinationPath, windowMs) {
  if (!destinationPath) {
    return null;
  }

  for (const candidate of entries) {
    if (candidate.order <= sourceEntry.order) {
      continue;
    }

    if (!isWithinWindow(sourceEntry, candidate, windowMs)) {
      continue;
    }

    if (getPathMatchKey(candidate.log?.path) === destinationPath) {
      return candidate;
    }
  }

  return null;
}

function formatStatusCode(statusCode) {
  return statusCode === null || statusCode === undefined ? '---' : String(statusCode);
}

function createRedirectLink(entry, entries, windowMs) {
  const location = getHeaderValue(entry.log?.response?.headers, 'location');
  const destination = resolveRedirectLocation(location, entry.log?.path);
  const nextEntry = findNextRedirectTarget(entry, entries, destination.matchPath, windowMs);

  return {
    destination,
    location,
    nextEntry
  };
}

function createRedirectHop(entry, link) {
  return {
    destination: link.destination.display || link.destination.matchPath,
    logId: entry.log?.id ?? null,
    method: normalizeMethod(entry.log?.method),
    path: String(entry.log?.path || '/'),
    statusCode: getStatusCode(entry.log)
  };
}

function compareFlowGroups(left, right) {
  return (right.latestTimestamp ?? -1) - (left.latestTimestamp ?? -1) ||
    (right.startTimestamp ?? -1) - (left.startTimestamp ?? -1) ||
    String(left.id).localeCompare(String(right.id));
}

export function getRedirectChainGroups(logs = [], options = {}) {
  const windowMs = Number.isFinite(Number(options.redirectWindowMs))
    ? Number(options.redirectWindowMs)
    : DEFAULT_REDIRECT_WINDOW_MS;
  const entries = sortLogEntries(logs);
  const linksById = new Map();
  const incomingRedirectLogIds = new Set();

  for (const entry of entries) {
    if (!isRedirectLog(entry.log)) {
      continue;
    }

    const link = createRedirectLink(entry, entries, windowMs);
    const logId = entry.log?.id;

    if (logId !== undefined && logId !== null) {
      linksById.set(String(logId), link);
    }

    if (link.nextEntry?.log?.id !== undefined && link.nextEntry.log.id !== null && isRedirectLog(link.nextEntry.log)) {
      incomingRedirectLogIds.add(String(link.nextEntry.log.id));
    }
  }

  const chains = [];

  for (const entry of entries) {
    const startId = entry.log?.id;

    if (!isRedirectLog(entry.log) || startId === undefined || startId === null) {
      continue;
    }

    if (incomingRedirectLogIds.has(String(startId))) {
      continue;
    }

    const hops = [];
    const logIds = [];
    const seenLogIds = new Set();
    let currentEntry = entry;
    let complete = false;
    let finalEntry = null;

    while (currentEntry?.log && isRedirectLog(currentEntry.log)) {
      const currentId = currentEntry.log?.id;

      if (currentId === undefined || currentId === null || seenLogIds.has(String(currentId))) {
        break;
      }

      seenLogIds.add(String(currentId));
      logIds.push(String(currentId));

      const link = linksById.get(String(currentId));
      if (!link) {
        break;
      }

      hops.push(createRedirectHop(currentEntry, link));

      if (!link.nextEntry?.log) {
        finalEntry = null;
        break;
      }

      const nextId = link.nextEntry.log?.id;
      if (!isRedirectLog(link.nextEntry.log) && nextId !== undefined && nextId !== null && !seenLogIds.has(String(nextId))) {
        logIds.push(String(nextId));
      }

      finalEntry = link.nextEntry;
      if (!isRedirectLog(link.nextEntry.log)) {
        complete = true;
        break;
      }

      currentEntry = link.nextEntry;
    }

    if (hops.length === 0) {
      continue;
    }

    const lastHop = hops[hops.length - 1];
    const finalLog = finalEntry?.log ?? null;
    const finalPath = finalLog ? String(finalLog.path || '/') : lastHop.destination;
    const finalMethod = finalLog ? normalizeMethod(finalLog.method) : null;
    const finalStatusCode = finalLog ? getStatusCode(finalLog) : null;
    const timestamps = [entry.timestamp, finalEntry?.timestamp]
      .filter((value) => value !== null && value !== undefined);
    const startTimestamp = entry.timestamp ?? null;
    const latestTimestamp = timestamps.length > 0 ? Math.max(...timestamps) : startTimestamp;
    const finalDestination = finalLog
      ? `${finalMethod} ${finalPath}`
      : `${lastHop.destination} (next request not captured)`;

    chains.push({
      complete,
      finalDestination,
      finalLogId: finalLog?.id ?? null,
      finalMethod,
      finalPath,
      finalStatusCode,
      focusLogId: finalLog?.id ?? startId,
      hopCount: hops.length,
      hops,
      id: `redirect-${String(startId)}`,
      kind: 'redirect',
      latestTimestamp,
      logIds,
      start: {
        logId: String(startId),
        method: normalizeMethod(entry.log.method),
        path: String(entry.log.path || '/'),
        statusCode: getStatusCode(entry.log)
      },
      startTimestamp,
      statusTrail: [
        ...hops.map((hop) => formatStatusCode(hop.statusCode)),
        ...(finalStatusCode !== null ? [formatStatusCode(finalStatusCode)] : [])
      ].join(' -> ')
    });
  }

  return chains.sort(compareFlowGroups);
}

function getRequestContentType(log = {}) {
  return getHeaderValue(log.request?.headers, 'content-type')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
}

function getRequestFingerprint(log = {}) {
  return [
    normalizeMethod(log.method),
    getPathMatchKey(log.path),
    getRequestContentType(log),
    String(log.request?.body ?? '')
  ].join('\n');
}

function isRetryableFailureStatus(statusCode) {
  const status = getStatusCode({ statusCode });

  return status !== null && (status >= 500 || RETRYABLE_STATUS_CODES.has(status));
}

function classifyRepeatGroup(groupLogs = []) {
  const method = normalizeMethod(groupLogs[0]?.method);
  const retryableBeforeRepeat = groupLogs
    .slice(0, -1)
    .some((log) => isRetryableFailureStatus(log.statusCode));
  const failureCount = groupLogs.filter((log) => isRetryableFailureStatus(log.statusCode)).length;

  if (groupLogs.length >= 3 && failureCount >= 2) {
    return 'possible retry loop';
  }

  if (retryableBeforeRepeat) {
    return 'likely retry';
  }

  if ((method === 'GET' || method === 'HEAD') && groupLogs.length >= 3) {
    return 'possible polling';
  }

  if (NON_IDEMPOTENT_METHODS.has(method) && groupLogs.length === 2) {
    return 'possible double submit';
  }

  return 'possible duplicate';
}

function getAdjacentDeltaMs(leftEntry, rightEntry) {
  if (leftEntry.timestamp === null || rightEntry.timestamp === null) {
    return 0;
  }

  return Math.max(0, rightEntry.timestamp - leftEntry.timestamp);
}

function createRepeatGroup(entries) {
  const groupLogs = entries.map((entry) => entry.log);
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const method = normalizeMethod(firstEntry.log.method);
  const path = String(firstEntry.log.path || '/');
  const deltas = entries.slice(1).map((entry, index) => getAdjacentDeltaMs(entries[index], entry));
  const maxAdjacentDeltaMs = deltas.length > 0 ? Math.max(...deltas) : 0;
  const durationMs = firstEntry.timestamp !== null && lastEntry.timestamp !== null
    ? Math.max(0, lastEntry.timestamp - firstEntry.timestamp)
    : maxAdjacentDeltaMs;

  return {
    count: entries.length,
    durationMs,
    focusLogId: lastEntry.log?.id ?? firstEntry.log?.id ?? null,
    id: `repeat-${String(firstEntry.log?.id ?? firstEntry.index)}`,
    kind: 'repeat',
    label: classifyRepeatGroup(groupLogs),
    latestTimestamp: lastEntry.timestamp ?? firstEntry.timestamp,
    logIds: groupLogs
      .map((log) => log?.id)
      .filter((id) => id !== undefined && id !== null)
      .map(String),
    maxAdjacentDeltaMs,
    method,
    path,
    startTimestamp: firstEntry.timestamp,
    statusTrail: groupLogs.map((log) => formatStatusCode(getStatusCode(log))).join(' -> ')
  };
}

export function getRepeatRequestGroups(logs = [], options = {}) {
  const windowMs = Number.isFinite(Number(options.repeatWindowMs))
    ? Number(options.repeatWindowMs)
    : DEFAULT_REPEAT_WINDOW_MS;
  const buckets = new Map();

  for (const entry of sortLogEntries(logs)) {
    const fingerprint = getRequestFingerprint(entry.log);
    const current = buckets.get(fingerprint) ?? [];

    current.push(entry);
    buckets.set(fingerprint, current);
  }

  const groups = [];

  for (const entries of buckets.values()) {
    let currentGroup = [];

    for (const entry of entries) {
      const previousEntry = currentGroup[currentGroup.length - 1];
      const withinWindow = previousEntry
        ? isWithinWindow(previousEntry, entry, windowMs)
        : true;

      if (currentGroup.length > 0 && !withinWindow) {
        if (currentGroup.length >= 2) {
          groups.push(createRepeatGroup(currentGroup));
        }
        currentGroup = [];
      }

      currentGroup.push(entry);
    }

    if (currentGroup.length >= 2) {
      groups.push(createRepeatGroup(currentGroup));
    }
  }

  return groups.sort(compareFlowGroups);
}

function addLogContext(logContextById, logId, key, value) {
  if (logId === undefined || logId === null) {
    return;
  }

  const id = String(logId);
  const context = logContextById.get(id) ?? {
    redirectChains: [],
    repeatGroups: []
  };

  context[key].push(value);
  logContextById.set(id, context);
}

export function formatFlowLabel(group = {}) {
  if (group.kind === 'redirect') {
    const hopLabel = group.hopCount === 1 ? '1 hop' : `${group.hopCount} hops`;
    const finalStatus = group.finalStatusCode === null || group.finalStatusCode === undefined
      ? ''
      : ` | final ${group.finalStatusCode}`;

    return group.complete
      ? `redirect chain ${hopLabel}${finalStatus}`
      : `incomplete redirect chain ${hopLabel}`;
  }

  if (group.kind === 'repeat') {
    return group.label ?? 'possible duplicate';
  }

  return 'flow';
}

export function analyzeTrafficFlows(logs = [], options = {}) {
  const redirectChains = getRedirectChainGroups(logs, options);
  const repeatGroups = getRepeatRequestGroups(logs, options);
  const groups = [...redirectChains, ...repeatGroups].sort(compareFlowGroups);
  const logContextById = new Map();

  for (const chain of redirectChains) {
    chain.logIds.forEach((logId, index) => addLogContext(logContextById, logId, 'redirectChains', {
      chain,
      position: index + 1,
      total: chain.logIds.length
    }));
  }

  for (const group of repeatGroups) {
    group.logIds.forEach((logId, index) => addLogContext(logContextById, logId, 'repeatGroups', {
      group,
      position: index + 1,
      total: group.logIds.length
    }));
  }

  return {
    groups,
    logContextById,
    redirectChains,
    repeatGroups
  };
}
