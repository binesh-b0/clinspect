import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { cloneLogEntry } from '../store/state.js';

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

function createRecord({ entry, interaction, mode, now }) {
  return {
    type: 'traffic',
    recordedAt: now().toISOString(),
    recordingMode: mode,
    interaction,
    entry: cloneLogEntry(entry)
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

  if (mode === 'off') {
    return createNoopRecorder();
  }

  const emitter = new EventEmitter();
  const seenInteractionIds = new Set();
  let stream = null;
  let state = 'recording';
  let error = null;

  const getStatus = () => ({
    mode,
    path: filePath,
    state,
    error: error ? serializeError(error) : null
  });

  const setError = (nextError) => {
    error = nextError;
    state = 'error';
    emitter.emit('status', getStatus());
  };

  try {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
    stream = fs.createWriteStream(path.resolve(filePath), { flags: 'a' });
    stream.on('error', setError);
  } catch (nextError) {
    setError(nextError);
  }

  const writeRecord = (entry, interaction) => {
    if (!stream || state === 'error') {
      return false;
    }

    try {
      stream.write(`${JSON.stringify(createRecord({
        entry,
        interaction,
        mode,
        now
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

      seenInteractionIds.add(entry.id);

      return writeRecord(entry, interaction);
    },
    stop() {
      if (!stream || stream.destroyed) {
        return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
        stream.once('error', reject);
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
