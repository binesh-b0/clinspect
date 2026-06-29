import fs from 'fs';
import path from 'path';
import {
  MANUAL_REQUEST_SCHEMA_VERSION,
  normalizeManualRequestDraft
} from './manual-request.js';

export const DEFAULT_MANUAL_REQUEST_STORE_PATH = './.clinspect/requests.json';

export function createEmptyManualRequestLibrary(warning = null) {
  return {
    schemaVersion: MANUAL_REQUEST_SCHEMA_VERSION,
    requests: [],
    environment: [],
    warning
  };
}

function normalizeEnvironment(rows = []) {
  return Array.isArray(rows)
    ? rows.map((row) => ({
      enabled: row?.enabled !== false,
      key: String(row?.key ?? row?.name ?? ''),
      value: String(row?.value ?? ''),
      secret: Boolean(row?.secret),
      type: 'text',
      filePath: ''
    }))
    : [];
}

export function normalizeManualRequestLibrary(input = {}) {
  return {
    schemaVersion: MANUAL_REQUEST_SCHEMA_VERSION,
    requests: Array.isArray(input.requests)
      ? input.requests.map((request) => normalizeManualRequestDraft(request))
      : [],
    environment: normalizeEnvironment(input.environment),
    warning: input.warning ?? null
  };
}

export function loadManualRequestLibrary(filePath = DEFAULT_MANUAL_REQUEST_STORE_PATH, options = {}) {
  const fsImpl = options.fs ?? fs;

  try {
    if (!fsImpl.existsSync(filePath)) {
      return createEmptyManualRequestLibrary();
    }

    return normalizeManualRequestLibrary(JSON.parse(fsImpl.readFileSync(filePath, 'utf8')));
  } catch (error) {
    return createEmptyManualRequestLibrary(`Could not load request library: ${error?.message ?? String(error)}`);
  }
}

export function saveManualRequestLibrary(filePath = DEFAULT_MANUAL_REQUEST_STORE_PATH, library, options = {}) {
  const fsImpl = options.fs ?? fs;
  const normalized = normalizeManualRequestLibrary(library);
  const resolvedPath = path.resolve(filePath);
  const tempPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify({
    schemaVersion: normalized.schemaVersion,
    requests: normalized.requests,
    environment: normalized.environment
  }, null, 2);

  fsImpl.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fsImpl.writeFileSync(tempPath, `${payload}\n`, 'utf8');
  fsImpl.renameSync(tempPath, resolvedPath);

  return {
    ...normalized,
    warning: null
  };
}

function upsertRequest(requests, draft) {
  const normalizedDraft = {
    ...normalizeManualRequestDraft(draft),
    updatedAt: new Date().toISOString()
  };
  const index = requests.findIndex((request) => request.id === normalizedDraft.id);

  if (index === -1) {
    return [...requests, normalizedDraft];
  }

  return requests.map((request, requestIndex) => (
    requestIndex === index ? normalizedDraft : request
  ));
}

export function createManualRequestStore(options = {}) {
  const filePath = options.path ?? DEFAULT_MANUAL_REQUEST_STORE_PATH;
  const fsImpl = options.fs ?? fs;
  let library = loadManualRequestLibrary(filePath, { fs: fsImpl });

  return {
    path: filePath,
    getLibrary() {
      return normalizeManualRequestLibrary(library);
    },
    getWarning() {
      return library.warning ?? null;
    },
    saveDraft(draft, saveOptions = {}) {
      library = saveManualRequestLibrary(filePath, {
        ...library,
        requests: upsertRequest(library.requests, draft),
        environment: normalizeEnvironment(saveOptions.environment ?? library.environment)
      }, { fs: fsImpl });

      return this.getLibrary();
    },
    saveEnvironment(environment) {
      library = saveManualRequestLibrary(filePath, {
        ...library,
        environment: normalizeEnvironment(environment)
      }, { fs: fsImpl });

      return this.getLibrary();
    }
  };
}
