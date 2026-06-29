import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import {
  parseCliOptions,
  formatCliError,
  getCliHelpText,
  isHelpRequested
} from './cli/options.js';
import { openUrl } from './browser.js';
import { startLiveProxy, startMockTrafficFeed } from './engine/proxy.js';
import { DEFAULT_BODY_LIMIT, DEFAULT_MAX_ENTRIES, StateStore } from './store/state.js';
import { getProxyOrigin, isPublicTargetUrl } from './target.js';
import { App } from './ui/App.js';
import { createStableStdout } from './ui/stable-output.js';
import { createNoopRecorder, createTrafficRecorder } from './recording/recorder.js';
import { loadRecordedSession } from './recording/session-loader.js';

const h = React.createElement;
const CLINSPECT_VERSION = '1.0.0';

function createCaptureController() {
  let paused = false;

  return {
    isPaused() {
      return paused;
    },
    setPaused(value) {
      paused = Boolean(value);
    },
    togglePaused() {
      paused = !paused;
      return paused;
    },
    shouldCapture() {
      return !paused;
    }
  };
}

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export function shouldOpenProxyUrl(options = {}) {
  return Boolean(
    options.openBrowser &&
    options.mode === 'live' &&
    isPublicTargetUrl(options.targetUrl)
  );
}

function createNoopEngine() {
  return {
    ready: Promise.resolve(),
    stop() {
      return Promise.resolve();
    }
  };
}

function getTargetKind(options = {}) {
  if (!options.targetUrl) {
    return 'mock';
  }

  return isPublicTargetUrl(options.targetUrl) ? 'public' : 'local';
}

export function startInspector(options, runtime = {}) {
  const loadSession = runtime.loadRecordedSession ?? loadRecordedSession;
  const loadedSession = options.mode === 'replay'
    ? loadSession(options.sessionPath, {
      bodyLimit: DEFAULT_BODY_LIMIT,
      showCookieValues: options.showCookieValues
    })
    : null;
  const maxEntries = options.mode === 'replay'
    ? Math.max(DEFAULT_MAX_ENTRIES, loadedSession.entries.length)
    : DEFAULT_MAX_ENTRIES;
  const stateStore = runtime.stateStore ?? new StateStore({
    bodyLimit: DEFAULT_BODY_LIMIT,
    maxEntries
  });
  const renderApp = runtime.renderApp ?? render;
  const startDemoFeed = runtime.startDemoFeed ?? runtime.startFeed ?? startMockTrafficFeed;
  const startProxy = runtime.startLiveProxy ?? startLiveProxy;
  const exitProcess = runtime.exitProcess ?? process.exit;
  const openBrowserUrl = runtime.openUrl ?? openUrl;
  const captureController = runtime.captureController ?? createCaptureController();
  const stdout = runtime.stdout ?? createStableStdout(process.stdout);
  const trafficRecorder = options.mode === 'replay'
    ? (runtime.trafficRecorder ?? runtime.recorder ?? createNoopRecorder())
    : (runtime.trafficRecorder ?? runtime.recorder ?? createTrafficRecorder({
      ...options.recording,
      bodyLimit: DEFAULT_BODY_LIMIT,
      clinspectVersion: CLINSPECT_VERSION,
      cookieValuePolicy: options.recording?.cookieValuePolicy ??
        (options.recording?.mode === 'off' ? 'masked' : 'raw'),
      recordCookieValues: options.recordCookieValues,
      port: options.port,
      proxyOrigin: getProxyOrigin(options.port ?? 8080),
      sourceMode: options.mode,
      targetKind: getTargetKind(options),
      targetUrl: options.targetUrl
    }));
  const handleRecordAdd = (logEntry) => trafficRecorder.recordCapture?.(logEntry);
  const appContext = options.mode === 'replay'
    ? {
      ...options,
      loadedSession: {
        endedAt: loadedSession.endedAt,
        metadata: loadedSession.metadata,
        skippedLines: loadedSession.skippedLines,
        totalEntries: loadedSession.totalEntries
      }
    }
    : options;

  if (loadedSession) {
    loadedSession.entries.forEach((entry) => stateStore.addLog(entry));
  }

  if (trafficRecorder.getStatus?.().mode === 'full') {
    stateStore.on('add', handleRecordAdd);
  }

  let engine;

  if (options.mode === 'replay') {
    engine = createNoopEngine();
  } else if (options.mode === 'live') {
    engine = startProxy(stateStore, {
      bodyLimit: DEFAULT_BODY_LIMIT,
      port: options.port,
      shouldCapture: () => captureController.shouldCapture(),
      targetUrl: options.targetUrl
    });
  } else {
    engine = startDemoFeed(stateStore, {
      bodyLimit: DEFAULT_BODY_LIMIT,
      shouldCapture: () => captureController.shouldCapture()
    });
  }
  let inkInstance;
  let stopped = false;

  const shutdown = (code = 0) => {
    if (stopped) {
      return Promise.resolve();
    }

    stopped = true;
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);

    if (inkInstance) {
      inkInstance.unmount();
    }

    process.stdout.write('\n');

    return Promise.resolve(engine.stop())
      .catch((error) => {
        process.stderr.write(`${chalk.red(`Error during shutdown: ${formatCliError(error)}`)}\n`);
      })
      .then(() => {
        stateStore.off('add', handleRecordAdd);

        return Promise.resolve(trafficRecorder.stop?.())
          .catch((error) => {
            process.stderr.write(`${chalk.red(`Error closing recording: ${formatCliError(error)}`)}\n`);
          });
      })
      .finally(() => {
        exitProcess(code);
      });
  };

  const handleSignal = () => shutdown(0);

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  if (shouldOpenProxyUrl(options)) {
    Promise.resolve(engine.ready)
      .then(() => {
        if (!stopped) {
          openBrowserUrl(getProxyOrigin(options.port));
        }
      })
      .catch((error) => {
        process.stderr.write(`${chalk.yellow(`Warning: could not open browser: ${formatCliError(error)}`)}\n`);
      });
  }

  inkInstance = renderApp(
    h(App, {
      stateStore,
      context: appContext,
      captureController,
      trafficRecorder,
      onQuit: () => shutdown(0)
    }),
    {
      exitOnCtrlC: false,
      stdout
    }
  );

  return {
    captureController,
    engine,
    loadedSession,
    recorder: trafficRecorder,
    stateStore,
    stop: shutdown,
    view: inkInstance
  };
}

export function run(argv = process.argv) {
  if (isHelpRequested(argv)) {
    process.stdout.write(getCliHelpText());
    return 0;
  }

  let options;

  try {
    options = parseCliOptions(argv);
  } catch (error) {
    process.stderr.write(`${chalk.red(`Error: ${formatCliError(error)}`)}\n`);
    return 1;
  }

  try {
    startInspector(options);
    return 0;
  } catch (error) {
    process.stderr.write(`${chalk.red(`Error: ${formatCliError(error)}`)}\n`);
    return 1;
  }
}

if (isDirectExecution()) {
  const exitCode = run(process.argv);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
