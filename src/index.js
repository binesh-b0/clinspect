import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import {
  createDefaultRecordingPath,
  parseCliOptions,
  formatCliError,
  getCliHelpText,
  isHelpRequested
} from './cli/options.js';
import { openUrl } from './browser.js';
import { loadProjectConfig } from './config.js';
import { sendManualRequest } from './engine/manual-request.js';
import { createManualRequestStore } from './engine/manual-request-store.js';
import { startLiveProxy, startMockTrafficFeed } from './engine/proxy.js';
import { createSessionStats, formatExitSummary } from './exit-summary.js';
import { DEFAULT_BODY_LIMIT, DEFAULT_MAX_ENTRIES, StateStore } from './store/state.js';
import { getProxyOrigin, isPublicTargetUrl } from './target.js';
import { App } from './ui/App.js';
import { createStableStdout } from './ui/stable-output.js';
import { createTerminalScreen } from './ui/terminal-screen.js';
import { createNoopRecorder, createRuntimeRecorder, createTrafficRecorder } from './recording/recorder.js';
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
  const now = runtime.now ?? (() => new Date());
  const startedAt = now();
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const isRecordedReplay = options.mode === 'replay';
  const isHistoryRestore = options.mode === 'history-restore';
  const loadSession = runtime.loadRecordedSession ?? loadRecordedSession;
  const loadedSession = isRecordedReplay
    ? loadSession(options.sessionPath, {
      bodyLimit,
      showCookieValues: options.showCookieValues
    })
    : null;
  const maxEntries = isRecordedReplay
    ? Math.max(DEFAULT_MAX_ENTRIES, loadedSession.entries.length)
    : (options.historyHotEntries ?? DEFAULT_MAX_ENTRIES);
  const stateStore = runtime.stateStore ?? (isHistoryRestore
    ? StateStore.restoreLatestTempSession({
      bodyLimit,
      historyRoot: options.historyRoot ?? runtime.historyRoot,
      historyHotEntries: options.historyHotEntries
    })
    : new StateStore({
      bodyLimit,
      historyCache: !isRecordedReplay && options.historyCache !== false,
      historyRoot: options.historyRoot ?? runtime.historyRoot,
      historyHotEntries: options.historyHotEntries,
      maxEntries,
      sourceMode: options.mode,
      targetUrl: options.targetUrl
    }));
  const renderApp = runtime.renderApp ?? render;
  const startDemoFeed = runtime.startDemoFeed ?? runtime.startFeed ?? startMockTrafficFeed;
  const startProxy = runtime.startLiveProxy ?? startLiveProxy;
  const loadConfig = runtime.loadProjectConfig ?? loadProjectConfig;
  const projectConfig = runtime.projectConfig ?? loadConfig(runtime.configPath);
  const manualRequestStore = runtime.manualRequestStore ?? createManualRequestStore({
    path: runtime.manualRequestStorePath
  });
  const manualRequestSender = runtime.manualRequestSender ?? ((request) => sendManualRequest(request, {
    bodyLimit,
    fetchImpl: runtime.fetchImpl,
    fileReader: runtime.fileReader,
    now,
    targetUrl: options.targetUrl
  }));
  const exitProcess = runtime.exitProcess ?? process.exit;
  const openBrowserUrl = runtime.openUrl ?? openUrl;
  const captureController = runtime.captureController ?? createCaptureController();
  const stdout = runtime.stdout ?? createStableStdout(process.stdout);
  const terminalScreen = runtime.terminalScreen ?? createTerminalScreen(stdout);
  const sessionStats = createSessionStats();
  const summaryOptions = runtime.summaryTheme ? { theme: runtime.summaryTheme } : {};
  const createRecorder = runtime.createTrafficRecorder ?? createTrafficRecorder;
  const trafficRecorder = (isRecordedReplay || isHistoryRestore)
    ? (runtime.trafficRecorder ?? runtime.recorder ?? createNoopRecorder())
    : (runtime.trafficRecorder ?? runtime.recorder ?? createRuntimeRecorder({
      ...options.recording,
      bodyLimit,
      clinspectVersion: CLINSPECT_VERSION,
      cookieValuePolicy: options.recording?.mode === 'off'
        ? 'raw'
        : (options.recording?.cookieValuePolicy ?? 'raw'),
      createRecorder,
      createRecordingPath: runtime.createRecordingPath ?? (() => createDefaultRecordingPath()),
      recordCookieValues: options.recordCookieValues,
      port: options.port,
      proxyOrigin: getProxyOrigin(options.port ?? 8080),
      sourceMode: options.mode,
      targetKind: getTargetKind(options),
      targetUrl: options.targetUrl
    }));
  const handleRecordAdd = (logEntry) => {
    if (trafficRecorder.getStatus?.().mode === 'full') {
      trafficRecorder.recordCapture?.(logEntry);
    }
  };
  const handleStatsAdd = (logEntry) => sessionStats.record(logEntry);
  const restoredHistoryStatus = isHistoryRestore ? stateStore.getHistoryStatus() : null;
  const appContext = isRecordedReplay
    ? {
      ...options,
      loadedSession: {
        endedAt: loadedSession.endedAt,
        metadata: loadedSession.metadata,
        skippedLines: loadedSession.skippedLines,
        totalEntries: loadedSession.totalEntries
      }
    }
    : (isHistoryRestore
      ? {
        ...options,
        mode: 'replay',
        loadedSession: {
          endedAt: restoredHistoryStatus.endedAt,
          metadata: {
            ...(restoredHistoryStatus.metadata ?? {}),
            sourceFilename: restoredHistoryStatus.metadata?.sessionId ?? 'temporary-history',
            sourcePath: restoredHistoryStatus.sessionPath
          },
          skippedLines: restoredHistoryStatus.skippedLines ?? 0,
          totalEntries: restoredHistoryStatus.totalEntries ?? 0
        },
        sessionPath: restoredHistoryStatus.sessionPath
      }
      : options);

  if (loadedSession) {
    loadedSession.entries.forEach((entry) => {
      sessionStats.record(stateStore.addLog(entry));
    });
  }

  if (isHistoryRestore) {
    stateStore.getLogs().forEach((entry) => sessionStats.record(entry));
  }

  stateStore.on('add', handleStatsAdd);

  stateStore.on('add', handleRecordAdd);

  let engine;

  if (isRecordedReplay || isHistoryRestore) {
    engine = createNoopEngine();
  } else if (options.mode === 'live') {
    engine = startProxy(stateStore, {
      bodyLimit,
      port: options.port,
      responseEncodingPolicy: options.responseEncodingPolicy ?? 'readable',
      shouldCapture: () => captureController.shouldCapture(),
      targetUrl: options.targetUrl
    });
  } else {
    engine = startDemoFeed(stateStore, {
      bodyLimit,
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

    terminalScreen.exit?.();

    return Promise.resolve(engine.stop())
      .catch((error) => {
        process.stderr.write(`${chalk.red(`Error during shutdown: ${formatCliError(error)}`)}\n`);
      })
      .then(() => {
        stateStore.off('add', handleRecordAdd);
        stateStore.off('add', handleStatsAdd);
        stateStore.close?.();

        return Promise.resolve(trafficRecorder.stop?.())
          .catch((error) => {
            process.stderr.write(`${chalk.red(`Error closing recording: ${formatCliError(error)}`)}\n`);
          });
      })
      .finally(() => {
        stdout.write(`\n${formatExitSummary({
          endedAt: now(),
          startedAt,
          stats: sessionStats.snapshot()
        }, summaryOptions)}\n`);
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

  try {
    terminalScreen.enter?.();
    inkInstance = renderApp(
      h(App, {
        stateStore,
        context: appContext,
        captureController,
        manualRequestStore,
        manualRequestSender,
        trafficRecorder,
        keyBindings: projectConfig.keyBindings,
        keyBindingWarnings: projectConfig.keyBindingWarnings,
        onQuit: () => shutdown(0)
      }),
      {
        exitOnCtrlC: false,
        stdout
      }
    );
  } catch (error) {
    terminalScreen.exit?.();
    throw error;
  }

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
