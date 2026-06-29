import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { maskLogEntryCookies } from '../cookies.js';
import { cloneLogEntry } from '../store/state.js';

export const RECORDING_SCHEMA_VERSION = 2;

const OFF_STATUS = {
  mode: 'off',
  path: null,
  state: 'off',
  error: null
};

function normalizeMode(mode) {
  return mode === 'full' || mode === 'partial' ? mode : 'off';
}

function serializeError(error) {
  return error?.message ?? String(error);
}

function createSessionRecord({ now, options, sessionId }) {
  return {
    type: 'session',
    schemaVersion: RECORDING_SCHEMA_VERSION,
    sessionId,
    createdAt: now().toISOString(),
    clinspectVersion: options.clinspectVersion ?? 'unknown',
    sourceMode: options.sourceMode ?? 'unknown',
    recordingMode: options.mode,
    targetUrl: options.targetUrl ?? null,
    targetKind: options.targetKind ?? 'unknown',
    proxyOrigin: options.proxyOrigin ?? null,
    port: options.port ?? null,
    bodyLimit: options.bodyLimit ?? null,
    cookieValuePolicy: options.cookieValuePolicy ?? 'masked'
  };
}

function createSessionEndRecord({ now, sessionId }) {
  return {
    type: 'session-end',
    schemaVersion: RECORDING_SCHEMA_VERSION,
    sessionId,
    endedAt: now().toISOString()
  };
}

function createRecord({ cookieValuePolicy, entry, interaction, mode, now, sequence, sessionId }) {
  const clonedEntry = cloneLogEntry(entry);

  return {
    type: 'traffic',
    schemaVersion: RECORDING_SCHEMA_VERSION,
    sessionId,
    sequence,
    recordedAt: now().toISOString(),
    recordingMode: mode,
    interaction,
    entry: cookieValuePolicy === 'raw'
      ? clonedEntry
      : maskLogEntryCookies(clonedEntry)
  };
}

export function createNoopRecorder() {
  return {
    getStatus() {
      return { ...OFF_STATUS };
    },
    recordCapture() {
      return false;
    },
    recordInteraction() {
      return false;
    },
    isPaused() {
      return false;
    },
    setPaused() {
      return false;
    },
    togglePaused() {
      return false;
    },
    stop() {
      return Promise.resolve();
    },
    on() {
      return this;
    },
    off() {
      return this;
    }
  };
}

export function createTrafficRecorder(options = {}) {
  const mode = normalizeMode(options.mode);
  const filePath = options.path ?? null;
  const now = options.now ?? (() => new Date());
  const sessionId = options.sessionId ?? randomUUID();
  // Recording is an explicit disk-writing action, so cookie values are retained unless
  // an internal caller asks for masked cookie recording.
  const recordingCookieValuePolicy = options.cookieValuePolicy === 'masked'
    ? 'masked'
    : 'raw';

  if (mode === 'off') {
    return createNoopRecorder();
  }

  const emitter = new EventEmitter();
  const seenInteractionIds = new Set();
  let stream = null;
  let paused = false;
  let error = null;
  let sequence = 0;
  let stopped = false;

  const getStatus = () => ({
    mode,
    path: filePath,
    state: error ? 'error' : (paused ? 'paused' : 'recording'),
    error: error ? serializeError(error) : null
  });

  const setError = (nextError) => {
    error = nextError;
    emitter.emit('status', getStatus());
  };

  const setPaused = (value) => {
    if (error) {
      return false;
    }

    paused = Boolean(value);
    emitter.emit('status', getStatus());

    return paused;
  };

  try {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    stream = fs.createWriteStream(path.resolve(filePath), { flags: 'a' });
    stream.on('error', setError);
    stream.write(`${JSON.stringify(createSessionRecord({
      now,
      options: {
        ...options,
        cookieValuePolicy: recordingCookieValuePolicy,
        mode
      },
      sessionId
    }))}\n`);
  } catch (nextError) {
    setError(nextError);
  }

  const writeRecord = (entry, interaction) => {
    if (!stream || error || paused) {
      return false;
    }

    try {
      sequence += 1;
      stream.write(`${JSON.stringify(createRecord({
        cookieValuePolicy: recordingCookieValuePolicy,
        entry,
        interaction,
        mode,
        now,
        sequence,
        sessionId
      }))}\n`);

      return true;
    } catch (nextError) {
      setError(nextError);
      return false;
    }
  };

  return {
    getStatus,
    recordCapture(entry) {
      if (mode !== 'full') {
        return false;
      }

      return writeRecord(entry, 'capture');
    },
    recordInteraction(entry, interaction) {
      if (mode !== 'partial' || interaction !== 'inspect' || !entry?.id) {
        return false;
      }

      if (seenInteractionIds.has(entry.id)) {
        return false;
      }

      const recorded = writeRecord(entry, interaction);

      if (recorded) {
        seenInteractionIds.add(entry.id);
      }

      return recorded;
    },
    isPaused() {
      return paused;
    },
    setPaused,
    togglePaused() {
      return setPaused(!paused);
    },
    stop() {
      if (!stream || stream.destroyed || stopped) {
        return Promise.resolve();
      }

      stopped = true;

      return new Promise((resolve, reject) => {
        stream.once('error', reject);
        if (!error) {
          stream.write(`${JSON.stringify(createSessionEndRecord({
            now,
            sessionId
          }))}\n`);
        }
        stream.end(resolve);
      });
    },
    on(eventName, listener) {
      emitter.on(eventName, listener);
      return this;
    },
    off(eventName, listener) {
      emitter.off(eventName, listener);
      return this;
    }
  };
}
