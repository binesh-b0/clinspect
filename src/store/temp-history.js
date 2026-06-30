import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { deflateRawSync, inflateRawSync } from 'zlib';

export const TEMP_HISTORY_SCHEMA_VERSION = 1;
export const DEFAULT_TEMP_HISTORY_ROOT = './.clinspect/tmp/sessions';
export const TEMP_HISTORY_KEEP_SESSIONS = 3;
export const TEMP_HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readJsonFile(filePath) {
  try {
    return safeJsonParse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function createSessionId(now = new Date()) {
  return `session-${formatTimestamp(now)}-${process.pid}-${randomUUID()}`;
}

function sessionPaths(sessionPath) {
  return {
    blobPath: path.join(sessionPath, 'entries.blob'),
    indexPath: path.join(sessionPath, 'index.ndjson'),
    manifestPath: path.join(sessionPath, 'manifest.json')
  };
}

function writeManifest(manifestPath, manifest) {
  const payload = `${JSON.stringify(manifest, null, 2)}\n`;
  const tempPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;

  fs.writeFileSync(tempPath, payload, 'utf8');
  fs.renameSync(tempPath, manifestPath);
}

function readManifest(sessionPath) {
  const manifest = readJsonFile(path.join(sessionPath, 'manifest.json'));

  if (!manifest || manifest.schemaVersion !== TEMP_HISTORY_SCHEMA_VERSION) {
    return null;
  }

  return {
    ...manifest,
    path: sessionPath
  };
}

function listSessionManifests(root = DEFAULT_TEMP_HISTORY_ROOT) {
  let names;

  try {
    names = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }

  return names
    .filter((entry) => entry.isDirectory())
    .map((entry) => readManifest(path.join(root, entry.name)))
    .filter(Boolean)
    .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')));
}

export function getLatestTempHistorySession(root = DEFAULT_TEMP_HISTORY_ROOT) {
  return listSessionManifests(root)[0] ?? null;
}

export function cleanupTempHistorySessions(root = DEFAULT_TEMP_HISTORY_ROOT, options = {}) {
  const keepSessions = options.keepSessions ?? TEMP_HISTORY_KEEP_SESSIONS;
  const maxAgeMs = options.maxAgeMs ?? TEMP_HISTORY_MAX_AGE_MS;
  const now = Number(options.now ?? Date.now());
  const manifests = listSessionManifests(root);

  manifests.forEach((manifest, index) => {
    const createdAt = Date.parse(manifest.createdAt ?? '');
    const isTooOld = Number.isFinite(createdAt) && now - createdAt > maxAgeMs;

    if (index < keepSessions && !isTooOld) {
      return;
    }

    try {
      fs.rmSync(manifest.path, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup should not block startup.
    }
  });
}

function appendCompressedEntry(blobPath, entry) {
  const payload = Buffer.from(JSON.stringify(entry), 'utf8');
  const compressed = deflateRawSync(payload, { level: 1 });
  let offset = 0;

  try {
    offset = fs.statSync(blobPath).size;
  } catch {
    offset = 0;
  }

  fs.appendFileSync(blobPath, compressed);

  return {
    length: compressed.length,
    offset
  };
}

function readCompressedEntry(blobPath, locator) {
  const fd = fs.openSync(blobPath, 'r');

  try {
    const buffer = Buffer.alloc(Number(locator.length ?? 0));

    fs.readSync(fd, buffer, 0, buffer.length, Number(locator.offset ?? 0));

    return JSON.parse(inflateRawSync(buffer).toString('utf8'));
  } finally {
    fs.closeSync(fd);
  }
}

function readIndex(indexPath) {
  let text;

  try {
    text = fs.readFileSync(indexPath, 'utf8');
  } catch {
    return {
      entries: [],
      skippedLines: 0
    };
  }

  const entries = [];
  let skippedLines = 0;

  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return;
    }

    const record = safeJsonParse(trimmed);

    if (record?.type !== 'entry' || !record.summary || !record.locator) {
      skippedLines += 1;
      return;
    }

    entries.push({
      locator: record.locator,
      summary: record.summary
    });
  });

  return {
    entries,
    skippedLines
  };
}

export function createTempHistorySession(options = {}) {
  const root = options.root ?? DEFAULT_TEMP_HISTORY_ROOT;
  const now = options.now ?? (() => new Date());
  const createdAt = now();
  const sessionId = options.sessionId ?? createSessionId(createdAt);
  const sessionPath = path.join(root, sessionId);
  const paths = sessionPaths(sessionPath);
  const manifest = {
    schemaVersion: TEMP_HISTORY_SCHEMA_VERSION,
    sessionId,
    createdAt: createdAt.toISOString(),
    endedAt: null,
    sourceMode: options.sourceMode ?? null,
    targetUrl: options.targetUrl ?? null,
    hotEntries: options.hotEntries ?? null,
    bodyLimit: options.bodyLimit ?? null
  };

  fs.mkdirSync(sessionPath, { recursive: true });
  writeManifest(paths.manifestPath, manifest);
  fs.closeSync(fs.openSync(paths.indexPath, 'a'));
  fs.closeSync(fs.openSync(paths.blobPath, 'a'));
  cleanupTempHistorySessions(root, { now: createdAt.getTime() });

  return {
    path: sessionPath,
    sessionId,
    append(entry, summary) {
      const locator = appendCompressedEntry(paths.blobPath, entry);
      const record = {
        type: 'entry',
        schemaVersion: TEMP_HISTORY_SCHEMA_VERSION,
        locator,
        summary
      };

      fs.appendFileSync(paths.indexPath, `${JSON.stringify(record)}\n`, 'utf8');

      return locator;
    },
    clear() {
      fs.writeFileSync(paths.indexPath, '', 'utf8');
      fs.writeFileSync(paths.blobPath, '');
    },
    close() {
      writeManifest(paths.manifestPath, {
        ...manifest,
        endedAt: now().toISOString()
      });
    },
    destroy() {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    },
    read(locator) {
      return readCompressedEntry(paths.blobPath, locator);
    }
  };
}

export function openTempHistorySession(sessionPath) {
  const manifest = readManifest(sessionPath);

  if (!manifest) {
    throw new Error(`invalid temp history session: ${sessionPath}`);
  }

  const paths = sessionPaths(sessionPath);
  const { entries, skippedLines } = readIndex(paths.indexPath);

  return {
    endedAt: manifest.endedAt ?? null,
    entries,
    manifest,
    path: sessionPath,
    sessionId: manifest.sessionId,
    skippedLines,
    totalEntries: entries.length,
    close() {},
    clear() {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    },
    destroy() {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    },
    read(locator) {
      return readCompressedEntry(paths.blobPath, locator);
    }
  };
}
