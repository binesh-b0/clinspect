import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { StateStore } from '../src/store/state.js';

const plainSummaryTheme = {
  bold: (value) => value,
  cyan: (value) => value
};

function createSilentStdout() {
  return {
    isTTY: false,
    write() {
      return true;
    }
  };
}

function createRecordingStdout(calls, options = {}) {
  return {
    isTTY: Boolean(options.isTTY),
    write(value) {
      calls.push(['write', String(value)]);
      return true;
    }
  };
}

function createClock(startedAt, endedAt) {
  const values = [startedAt, endedAt];
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)];
}

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-smoke-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function readRecords(filePath) {
  const text = await readFile(filePath, 'utf8');

  return text.trim().split('\n').map((line) => JSON.parse(line));
}

function createTrafficEntry(id, options = {}) {
  return {
    id,
    method: options.method ?? 'GET',
    path: options.path ?? `/${id}`,
    statusCode: options.statusCode ?? 200,
    responseTimeMs: options.responseTimeMs ?? 10,
    request: {
      headers: {
        host: 'localhost:3000',
        'x-trace': id,
        ...(options.requestHeaders ?? {})
      },
      body: options.requestBody ?? `request-${id}`
    },
    response: {
      headers: {
        'content-type': 'application/json',
        ...(options.responseHeaders ?? {})
      },
      body: options.responseBody ?? `response-${id}`
    }
  };
}

test('runtime modules import without syntax or ESM errors', async () => {
  const index = await import('../src/index.js');
  const app = await import('../src/ui/App.js');

  assert.equal(typeof index.run, 'function');
  assert.equal(typeof index.shouldOpenProxyUrl, 'function');
  assert.equal(typeof index.startInspector, 'function');
  assert.equal(typeof app.App, 'function');
});

test('startInspector selects the live proxy engine for live mode', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const inspector = startInspector(
    {
      mode: 'live',
      bodyLimit: 12345,
      openBrowser: false,
      port: 9090,
      targetUrl: 'http://localhost:3000/'
    },
    {
      stateStore: new StateStore(),
      stdout: createSilentStdout(),
      renderApp: () => ({
        unmount() {
          calls.push(['unmount']);
        }
      }),
      startLiveProxy: (stateStore, options) => {
        calls.push(['live', options.port, options.targetUrl, options.bodyLimit, options.responseEncodingPolicy, typeof options.shouldCapture]);

        return {
          stop() {
            calls.push(['stop']);
          }
        };
      },
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  assert.deepEqual(calls, [['live', 9090, 'http://localhost:3000/', 12345, 'readable', 'function']]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['live', 9090, 'http://localhost:3000/', 12345, 'readable', 'function'],
    ['unmount'],
    ['stop'],
    ['exit', 0]
  ]);
});

test('startInspector loads project key binding config and passes it into App', async () => {
  const { startInspector } = await import('../src/index.js');
  const { normalizeKeyBindings } = await import('../src/ui/App.js');
  const keyBindingConfig = normalizeKeyBindings({
    keyBindings: {
      'main.moveDown': ['z'],
      'main.moveUp': ['z', 'i']
    }
  });
  const calls = [];
  let appProps;
  const inspector = startInspector(
    {
      bodyLimit: 12345,
      mode: 'demo',
      openBrowser: false
    },
    {
      stateStore: new StateStore(),
      stdout: createSilentStdout(),
      loadProjectConfig: () => ({
        keyBindings: keyBindingConfig.bindings,
        keyBindingWarnings: ['duplicate key binding z for main.moveUp; main.moveDown keeps it']
      }),
      renderApp: (node) => {
        appProps = node.props;

        return {
          unmount() {
            calls.push(['unmount']);
          }
        };
      },
      startFeed: () => ({
        stop() {
          calls.push(['stop']);
        }
      }),
      trafficRecorder: {
        getStatus() {
          return { error: null, mode: 'off', state: 'off' };
        },
        stop() {
          calls.push(['recorder-stop']);
        }
      },
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  assert.deepEqual(appProps.keyBindings['main.moveDown'], ['z']);
  assert.deepEqual(appProps.keyBindings['main.moveUp'], ['i']);
  assert.deepEqual(appProps.keyBindingWarnings, ['duplicate key binding z for main.moveUp; main.moveDown keeps it']);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['unmount'],
    ['stop'],
    ['recorder-stop'],
    ['exit', 0]
  ]);
});

test('startInspector contains interactive output in the alternate terminal screen', async () => {
  const { startInspector } = await import('../src/index.js');
  const {
    DISABLE_MOUSE_REPORTING,
    ENABLE_MOUSE_REPORTING,
    ENTER_ALTERNATE_SCREEN,
    EXIT_ALTERNATE_SCREEN
  } = await import('../src/ui/terminal-screen.js');
  const calls = [];
  const stdout = createRecordingStdout(calls, { isTTY: true });
  const inspector = startInspector(
    {
      mode: 'demo',
      openBrowser: false,
      port: 8080,
      recording: {
        mode: 'off',
        path: null
      },
      targetUrl: null
    },
    {
      stateStore: new StateStore(),
      stdout,
      now: createClock(0, 2000),
      summaryTheme: plainSummaryTheme,
      renderApp: (node, options) => {
        calls.push(['render', options.stdout === stdout, node.props.context.mode]);

        return {
          unmount() {
            calls.push(['unmount']);
          }
        };
      },
      startDemoFeed: () => ({
        stop() {
          calls.push(['engine-stop']);
        }
      }),
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  assert.deepEqual(calls, [
    ['write', ENTER_ALTERNATE_SCREEN],
    ['write', ENABLE_MOUSE_REPORTING],
    ['render', true, 'demo']
  ]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['write', ENTER_ALTERNATE_SCREEN],
    ['write', ENABLE_MOUSE_REPORTING],
    ['render', true, 'demo'],
    ['unmount'],
    ['write', DISABLE_MOUSE_REPORTING],
    ['write', EXIT_ALTERNATE_SCREEN],
    ['engine-stop'],
    ['write', '\nGood bye.\n\nSession summary\n  Runtime       2s\n  Requests      0\n  Status        2xx 0  3xx 0  4xx 0  5xx 0  other 0\n  Avg response  n/a\n'],
    ['exit', 0]
  ]);
});

test('startInspector wires full recording to StateStore add events and shutdown', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const stateStore = new StateStore();
  const recorder = {
    getStatus() {
      return {
        mode: 'full',
        path: './capture.ndjson',
        state: 'recording',
        error: null
      };
    },
    recordCapture(log) {
      calls.push(['record', log.id]);
    },
    recordInteraction() {},
    stop() {
      calls.push(['recorder-stop']);
    }
  };
  const inspector = startInspector(
    {
      mode: 'demo',
      openBrowser: false,
      port: 8080,
      recording: {
        mode: 'full',
        path: './capture.ndjson'
      },
      targetUrl: null
    },
    {
      stateStore,
      stdout: createSilentStdout(),
      recorder,
      renderApp: (node) => {
        calls.push(['render', node.props.trafficRecorder === recorder]);

        return {
          unmount() {
            calls.push(['unmount']);
          }
        };
      },
      startDemoFeed: () => ({
        stop() {
          calls.push(['engine-stop']);
        }
      }),
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  stateStore.addLog({ id: 'one', path: '/one' });

  assert.deepEqual(calls, [
    ['render', true],
    ['record', 'one']
  ]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['render', true],
    ['record', 'one'],
    ['unmount'],
    ['engine-stop'],
    ['recorder-stop'],
    ['exit', 0]
  ]);
});

test('startInspector passes a manual request sender whose logs can be recorded', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const stateStore = new StateStore();
  const manualLog = {
    id: 'manual-one',
    method: 'POST',
    path: '/manual',
    statusCode: 202,
    responseTimeMs: 12,
    request: {
      headers: { accept: '*/*' },
      body: 'payload'
    },
    response: {
      headers: { 'content-type': 'text/plain' },
      body: 'accepted'
    }
  };
  const manualRequestSender = async (request) => {
    calls.push(['manual', request.method, request.path, request.body]);

    return manualLog;
  };
  const recorder = {
    getStatus() {
      return {
        mode: 'full',
        path: './capture.ndjson',
        state: 'recording',
        error: null
      };
    },
    recordCapture(log) {
      calls.push(['record', log.id]);
    },
    recordInteraction() {},
    stop() {
      calls.push(['recorder-stop']);
    }
  };
  let appManualRequestSender = null;
  let appManualRequestStore = null;
  const manualRequestStore = {
    getLibrary() {
      return {
        schemaVersion: 1,
        requests: [],
        environment: [],
        warning: null
      };
    }
  };
  const inspector = startInspector(
    {
      mode: 'live',
      bodyLimit: 123,
      openBrowser: false,
      port: 8080,
      recording: {
        mode: 'full',
        path: './capture.ndjson'
      },
      targetUrl: 'http://localhost:3000/'
    },
    {
      stateStore,
      stdout: createSilentStdout(),
      manualRequestSender,
      manualRequestStore,
      recorder,
      renderApp: (node) => {
        appManualRequestSender = node.props.manualRequestSender;
        appManualRequestStore = node.props.manualRequestStore;
        calls.push(['render', node.props.context.mode, typeof node.props.manualRequestSender, typeof node.props.manualRequestStore]);

        return {
          unmount() {
            calls.push(['unmount']);
          }
        };
      },
      startLiveProxy: () => ({
        stop() {
          calls.push(['engine-stop']);
        }
      }),
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  const sentLog = await appManualRequestSender({
    body: 'payload',
    method: 'POST',
    path: '/manual'
  });

  stateStore.addLog(sentLog);

  assert.equal(appManualRequestStore, manualRequestStore);
  assert.deepEqual(calls, [
    ['render', 'live', 'function', 'object'],
    ['manual', 'POST', '/manual', 'payload'],
    ['record', 'manual-one']
  ]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['render', 'live', 'function', 'object'],
    ['manual', 'POST', '/manual', 'payload'],
    ['record', 'manual-one'],
    ['unmount'],
    ['engine-stop'],
    ['recorder-stop'],
    ['exit', 0]
  ]);
});

test('startInspector passes partial recorder into App without full capture subscription', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const stateStore = new StateStore();
  const recorder = {
    getStatus() {
      return {
        mode: 'partial',
        path: './capture.ndjson',
        state: 'recording',
        error: null
      };
    },
    recordCapture(log) {
      calls.push(['record', log.id]);
    },
    recordInteraction() {},
    stop() {
      calls.push(['recorder-stop']);
    }
  };
  const inspector = startInspector(
    {
      mode: 'demo',
      openBrowser: false,
      port: 8080,
      recording: {
        mode: 'partial',
        path: './capture.ndjson'
      },
      targetUrl: null
    },
    {
      stateStore,
      stdout: createSilentStdout(),
      recorder,
      renderApp: (node) => {
        calls.push(['render', node.props.trafficRecorder === recorder]);

        return {
          unmount() {}
        };
      },
      startDemoFeed: () => ({
        stop() {}
      }),
      exitProcess: () => {}
    }
  );

  stateStore.addLog({ id: 'one', path: '/one' });

  assert.deepEqual(calls, [['render', true]]);

  await inspector.stop();
});

test('startInspector can start full recording in the middle of a session', async () => {
  await withTempDir(async (directory) => {
    const { startInspector } = await import('../src/index.js');
    const calls = [];
    const stateStore = new StateStore();
    const filePath = path.join(directory, 'mid-session.ndjson');
    let appRecorder = null;
    const inspector = startInspector(
      {
        mode: 'demo',
        openBrowser: false,
        port: 8080,
        recording: {
          mode: 'off',
          path: null
        },
        targetUrl: null
      },
      {
        createRecordingPath: () => filePath,
        stateStore,
        stdout: createSilentStdout(),
        renderApp: (node) => {
          appRecorder = node.props.trafficRecorder;
          calls.push(['render', node.props.trafficRecorder.getStatus().mode]);

          return {
            unmount() {
              calls.push(['unmount']);
            }
          };
        },
        startDemoFeed: () => ({
          stop() {
            calls.push(['engine-stop']);
          }
        }),
        exitProcess: (code) => {
          calls.push(['exit', code]);
        }
      }
    );

    stateStore.addLog({ id: 'before', path: '/before' });
    assert.equal(appRecorder.getStatus().mode, 'off');

    appRecorder.togglePaused();
    assert.deepEqual(appRecorder.getStatus(), {
      mode: 'full',
      path: filePath,
      state: 'recording',
      error: null
    });
    stateStore.addLog({ id: 'after', path: '/after' });
    assert.deepEqual(await appRecorder.stopRecording(), {
      mode: 'off',
      path: null,
      state: 'off',
      error: null
    });
    stateStore.addLog({ id: 'after-stop', path: '/after-stop' });

    await inspector.stop();

    const records = await readRecords(filePath);
    const trafficRecords = records.filter((record) => record.type === 'traffic');

    assert.deepEqual(calls, [
      ['render', 'off'],
      ['unmount'],
      ['engine-stop'],
      ['exit', 0]
    ]);
    assert.deepEqual(trafficRecords.map((record) => record.entry.id), ['after']);
    assert.equal(records[0].type, 'session');
    assert.equal(records[0].recordingMode, 'full');
    assert.equal(records.at(-1).type, 'session-end');
  });
});

test('startInspector creates a disk-backed temporary history store for current-run traffic', async () => {
  await withTempDir(async (directory) => {
    const { startInspector } = await import('../src/index.js');
    const calls = [];
    let appProps = null;
    const inspector = startInspector(
      {
        mode: 'demo',
        historyHotEntries: 2,
        openBrowser: false,
        port: 8080,
        recording: {
          mode: 'off',
          path: null
        },
        targetUrl: null
      },
      {
        historyRoot: directory,
        stdout: createSilentStdout(),
        renderApp: (node) => {
          appProps = node.props;
          calls.push(['render', node.props.context.mode]);

          return {
            unmount() {
              calls.push(['unmount']);
            }
          };
        },
        startDemoFeed: () => ({
          stop() {
            calls.push(['engine-stop']);
          }
        }),
        exitProcess: (code) => {
          calls.push(['exit', code]);
        }
      }
    );

    inspector.stateStore.addLog(createTrafficEntry('one'));
    inspector.stateStore.addLog(createTrafficEntry('two'));
    inspector.stateStore.addLog(createTrafficEntry('three'));

    const status = inspector.stateStore.getHistoryStatus();
    const logs = inspector.stateStore.getLogs();

    assert.equal(appProps.stateStore, inspector.stateStore);
    assert.equal(status.enabled, true);
    assert.equal(status.totalEntries, 3);
    assert.equal(status.hotEntries, 2);
    assert.equal(status.coldEntries, 1);
    assert.equal(status.sessionPath.startsWith(directory), true);
    assert.equal(fs.existsSync(status.sessionPath), true);
    assert.deepEqual(logs.map((log) => [log.id, log.history.cold]), [
      ['one', true],
      ['two', false],
      ['three', false]
    ]);
    assert.equal(inspector.stateStore.getLogById('one').response.body, 'response-one');

    await inspector.stop();

    const manifest = JSON.parse(await readFile(path.join(status.sessionPath, 'manifest.json'), 'utf8'));

    assert.equal(typeof manifest.endedAt, 'string');
    assert.deepEqual(calls, [
      ['render', 'demo'],
      ['unmount'],
      ['engine-stop'],
      ['exit', 0]
    ]);
  });
});

test('temporary history still emits full add entries for permanent recording', async () => {
  await withTempDir(async (directory) => {
    const { startInspector } = await import('../src/index.js');
    const calls = [];
    const recorder = {
      getStatus() {
        return {
          mode: 'full',
          path: './capture.ndjson',
          state: 'recording',
          error: null
        };
      },
      recordCapture(log) {
        calls.push(['record', log.id, log.request.body, log.response.body, log.request.headers['x-trace']]);
      },
      recordInteraction() {},
      stop() {
        calls.push(['recorder-stop']);
      }
    };
    const inspector = startInspector(
      {
        mode: 'demo',
        historyHotEntries: 1,
        openBrowser: false,
        port: 8080,
        recording: {
          mode: 'full',
          path: './capture.ndjson'
        },
        targetUrl: null
      },
      {
        historyRoot: directory,
        stdout: createSilentStdout(),
        recorder,
        renderApp: () => ({
          unmount() {
            calls.push(['unmount']);
          }
        }),
        startDemoFeed: () => ({
          stop() {
            calls.push(['engine-stop']);
          }
        }),
        exitProcess: (code) => {
          calls.push(['exit', code]);
        }
      }
    );

    inspector.stateStore.addLog(createTrafficEntry('one'));
    inspector.stateStore.addLog(createTrafficEntry('two'));

    assert.deepEqual(calls, [
      ['record', 'one', 'request-one', 'response-one', 'one'],
      ['record', 'two', 'request-two', 'response-two', 'two']
    ]);
    assert.deepEqual(inspector.stateStore.getLogs().map((log) => [log.id, log.history.cold]), [
      ['one', true],
      ['two', false]
    ]);

    await inspector.stop();
  });
});

test('startInspector loads replay sessions without starting capture engines', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const stdout = createRecordingStdout(calls);
  const entries = Array.from({ length: 105 }, (_, index) => ({
    id: `entry-${index + 1}`,
    path: `/entry-${index + 1}`
  }));
  const inspector = startInspector(
    {
      mode: 'replay',
      loadedSession: null,
      openBrowser: false,
      port: 8080,
      recording: {
        mode: 'off',
        path: null
      },
      sessionPath: './captures/session.ndjson',
      targetUrl: null
    },
    {
      stdout,
      now: createClock(0, 65_000),
      summaryTheme: plainSummaryTheme,
      loadRecordedSession: (sessionPath) => {
        calls.push(['load', sessionPath]);

        return {
          endedAt: null,
          entries,
          metadata: {
            sourceMode: 'live',
            targetUrl: 'http://localhost:3000/'
          },
          skippedLines: 1,
          totalEntries: entries.length
        };
      },
      renderApp: (node) => {
        calls.push([
          'render',
          node.props.context.mode,
          node.props.context.loadedSession.totalEntries,
          node.props.context.loadedSession.skippedLines
        ]);

        return {
          unmount() {
            calls.push(['unmount']);
          }
        };
      },
      startDemoFeed: () => {
        throw new Error('demo feed should not start in replay mode');
      },
      startLiveProxy: () => {
        throw new Error('live proxy should not start in replay mode');
      },
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  assert.equal(inspector.stateStore.getLogs().length, 105);
  assert.deepEqual(calls, [
    ['load', './captures/session.ndjson'],
    ['render', 'replay', 105, 1]
  ]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['load', './captures/session.ndjson'],
    ['render', 'replay', 105, 1],
    ['unmount'],
    ['write', '\nGood bye.\n\nSession summary\n  Runtime       1m 5s\n  Requests      105\n  Status        2xx 0  3xx 0  4xx 0  5xx 0  other 105\n  Avg response  0ms\n'],
    ['exit', 0]
  ]);
});

test('startInspector restores the latest temporary history session in replay-like mode', async () => {
  await withTempDir(async (directory) => {
    const { startInspector } = await import('../src/index.js');
    const seedStore = new StateStore({
      bodyLimit: 1000,
      historyCache: true,
      historyHotEntries: 1,
      historyRoot: directory,
      sourceMode: 'live',
      targetUrl: 'http://localhost:3000/'
    });

    seedStore.addLog(createTrafficEntry('one'));
    seedStore.addLog(createTrafficEntry('two'));
    const sessionPath = seedStore.getHistoryStatus().sessionPath;
    seedStore.close();

    const calls = [];
    const inspector = startInspector(
      {
        mode: 'history-restore',
        historyHotEntries: 1,
        openBrowser: false,
        port: 8080,
        recording: {
          mode: 'off',
          path: null
        },
        restoreLastSession: true,
        targetUrl: null
      },
      {
        historyRoot: directory,
        stdout: createSilentStdout(),
        loadRecordedSession: () => {
          throw new Error('recorded replay loader should not run for temp history restore');
        },
        renderApp: (node) => {
          calls.push([
            'render',
            node.props.context.mode,
            node.props.context.loadedSession.totalEntries,
            node.props.context.loadedSession.metadata.sourceMode,
            node.props.context.sessionPath === sessionPath
          ]);

          return {
            unmount() {
              calls.push(['unmount']);
            }
          };
        },
        startDemoFeed: () => {
          throw new Error('demo feed should not start in history restore mode');
        },
        startLiveProxy: () => {
          throw new Error('live proxy should not start in history restore mode');
        },
        exitProcess: (code) => {
          calls.push(['exit', code]);
        }
      }
    );

    const summaries = inspector.stateStore.getLogs();

    assert.deepEqual(summaries.map((log) => [log.id, log.history.cold]), [
      ['one', true],
      ['two', true]
    ]);
    assert.equal(inspector.stateStore.getHistoryStatus().restored, true);
    assert.equal(inspector.stateStore.getLogById('two').response.body, 'response-two');
    assert.deepEqual(calls, [
      ['render', 'replay', 2, 'live', true]
    ]);

    await inspector.stop();

    assert.deepEqual(calls, [
      ['render', 'replay', 2, 'live', true],
      ['unmount'],
      ['exit', 0]
    ]);
  });
});

test('shouldOpenProxyUrl only enables public live targets with --open', async () => {
  const { shouldOpenProxyUrl } = await import('../src/index.js');

  assert.equal(shouldOpenProxyUrl({
    mode: 'live',
    openBrowser: true,
    targetUrl: 'https://example.com/'
  }), true);
  assert.equal(shouldOpenProxyUrl({
    mode: 'live',
    openBrowser: true,
    targetUrl: 'http://localhost:3000/'
  }), false);
  assert.equal(shouldOpenProxyUrl({
    mode: 'live',
    openBrowser: false,
    targetUrl: 'https://example.com/'
  }), false);
  assert.equal(shouldOpenProxyUrl({
    mode: 'demo',
    openBrowser: true,
    targetUrl: null
  }), false);
});

test('startInspector opens the proxy URL for public live targets when requested', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const inspector = startInspector(
    {
      mode: 'live',
      openBrowser: true,
      port: 9090,
      targetUrl: 'https://example.com/'
    },
    {
      stateStore: new StateStore(),
      stdout: createSilentStdout(),
      renderApp: () => ({
        unmount() {
          calls.push(['unmount']);
        }
      }),
      startLiveProxy: () => ({
        ready: Promise.resolve(),
        stop() {
          calls.push(['stop']);
        }
      }),
      openUrl: (url) => {
        calls.push(['open', url]);
      },
      exitProcess: (code) => {
        calls.push(['exit', code]);
      }
    }
  );

  await inspector.engine.ready;
  await Promise.resolve();

  assert.deepEqual(calls, [['open', 'http://localhost:9090']]);

  await inspector.stop();
});

test('startInspector does not open browser for local live targets', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const inspector = startInspector(
    {
      mode: 'live',
      openBrowser: true,
      port: 9090,
      targetUrl: 'http://127.0.0.1:3000/'
    },
    {
      stateStore: new StateStore(),
      stdout: createSilentStdout(),
      renderApp: () => ({
        unmount() {}
      }),
      startLiveProxy: () => ({
        ready: Promise.resolve(),
        stop() {}
      }),
      openUrl: (url) => {
        calls.push(['open', url]);
      },
      exitProcess: () => {}
    }
  );

  await inspector.engine.ready;
  await Promise.resolve();

  assert.deepEqual(calls, []);

  await inspector.stop();
});
