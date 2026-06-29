import fs from 'fs';
import path from 'path';
import { maskLogEntryCookies } from '../cookies.js';
import { DEFAULT_BODY_LIMIT, normalizeLogEntry } from '../store/state.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeLogEntry(value) {
  return isObject(value) && (
    'method' in value ||
    'path' in value ||
    'statusCode' in value ||
    'request' in value ||
    'response' in value
  );
}

function getEntryFromRecord(record) {
  if (!isObject(record)) {
    return null;
  }

  if (record.type === 'traffic') {
    return isObject(record.entry) && looksLikeLogEntry(record.entry)
      ? record.entry
      : null;
  }

  if (!('type' in record) && looksLikeLogEntry(record)) {
    return record;
  }

  return null;
}

function withStableReplayId(entry, lineNumber, seenIds) {
  const baseId = String(entry.id ?? `replay-line-${lineNumber}`);
  const count = seenIds.get(baseId) ?? 0;
  const nextCount = count + 1;

  seenIds.set(baseId, nextCount);

  if (count === 0) {
    return {
      ...entry,
      id: baseId
    };
  }

  return {
    ...entry,
    id: `${baseId}-replay-${nextCount}`
  };
}

export function loadRecordedSession(filePath, options = {}) {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const showCookieValues = Boolean(options.showCookieValues);
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const entries = [];
  const seenIds = new Map();
  let metadata = null;
  let endedAt = null;
  let skippedLines = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    let record;

    try {
      record = JSON.parse(trimmed);
    } catch {
      skippedLines += 1;
      return;
    }

    if (isObject(record) && record.type === 'session') {
      metadata = {
        ...record,
        sourcePath: filePath,
        sourceFilename: path.basename(filePath)
      };
      return;
    }

    if (isObject(record) && record.type === 'session-end') {
      endedAt = record.endedAt ?? null;
      return;
    }

    const entry = getEntryFromRecord(record);

    if (!entry) {
      skippedLines += 1;
      return;
    }

    const normalizedEntry = normalizeLogEntry(
      withStableReplayId(entry, lineNumber, seenIds),
      { bodyLimit }
    );

    entries.push(showCookieValues ? normalizedEntry : maskLogEntryCookies(normalizedEntry));
  });

  const fallbackMetadata = {
    schemaVersion: null,
    sourcePath: filePath,
    sourceFilename: path.basename(filePath)
  };

  return {
    entries,
    metadata: metadata ?? fallbackMetadata,
    skippedLines,
    totalEntries: entries.length,
    endedAt
  };
}
