import path from 'path';
import { fileURLToPath } from 'url';
import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import { parseCliOptions, formatCliError } from './cli/options.js';
import { startMockTrafficFeed } from './engine/proxy.js';
import { DEFAULT_BODY_LIMIT, StateStore } from './store/state.js';
import { App } from './ui/App.js';

const h = React.createElement;

function isDirectExecution() {
  if (!process.argv[1]) {
    return false;
  }

  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

export function startInspector(options, runtime = {}) {
  const stateStore = runtime.stateStore ?? new StateStore({ bodyLimit: DEFAULT_BODY_LIMIT });
  const renderApp = runtime.renderApp ?? render;
  const startFeed = runtime.startFeed ?? startMockTrafficFeed;
  const exitProcess = runtime.exitProcess ?? process.exit;
  const feed = startFeed(stateStore, { bodyLimit: DEFAULT_BODY_LIMIT });
  let inkInstance;
  let stopped = false;

  const shutdown = (code = 0) => {
    if (stopped) {
      return;
    }

    stopped = true;
    feed.stop();
    process.off('SIGINT', handleSignal);
    process.off('SIGTERM', handleSignal);

    if (inkInstance) {
      inkInstance.unmount();
    }

    process.stdout.write('\n');
    exitProcess(code);
  };

  const handleSignal = () => shutdown(0);

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  inkInstance = renderApp(
    h(App, {
      stateStore,
      context: options,
      onQuit: () => shutdown(0)
    }),
    { exitOnCtrlC: false }
  );

  return {
    stateStore,
    stop: shutdown,
    view: inkInstance
  };
}

export function run(argv = process.argv) {
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
