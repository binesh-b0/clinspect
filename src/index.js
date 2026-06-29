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
import { DEFAULT_BODY_LIMIT, StateStore } from './store/state.js';
import { getProxyOrigin, isPublicTargetUrl } from './target.js';
import { App } from './ui/App.js';
import { createStableStdout } from './ui/stable-output.js';

const h = React.createElement;

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

export function startInspector(options, runtime = {}) {
  const stateStore = runtime.stateStore ?? new StateStore({ bodyLimit: DEFAULT_BODY_LIMIT });
  const renderApp = runtime.renderApp ?? render;
  const startDemoFeed = runtime.startDemoFeed ?? runtime.startFeed ?? startMockTrafficFeed;
  const startProxy = runtime.startLiveProxy ?? startLiveProxy;
  const exitProcess = runtime.exitProcess ?? process.exit;
  const openBrowserUrl = runtime.openUrl ?? openUrl;
  const captureController = runtime.captureController ?? createCaptureController();
  const stdout = runtime.stdout ?? createStableStdout(process.stdout);
  const engine = options.mode === 'live'
    ? startProxy(stateStore, {
      bodyLimit: DEFAULT_BODY_LIMIT,
      port: options.port,
      shouldCapture: () => captureController.shouldCapture(),
      targetUrl: options.targetUrl
    })
    : startDemoFeed(stateStore, {
      bodyLimit: DEFAULT_BODY_LIMIT,
      shouldCapture: () => captureController.shouldCapture()
    });
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
      context: options,
      captureController,
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

  startInspector(options);
  return 0;
}

if (isDirectExecution()) {
  const exitCode = run(process.argv);

  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}
