import { Command, InvalidArgumentError } from 'commander';

export const DEFAULT_PORT = 8080;
export const RECORDING_MODES = ['full', 'partial'];

function padTimestampPart(value) {
  return String(value).padStart(2, '0');
}

export function formatRecordingTimestamp(date = new Date()) {
  return [
    date.getFullYear(),
    padTimestampPart(date.getMonth() + 1),
    padTimestampPart(date.getDate())
  ].join('') + '-' + [
    padTimestampPart(date.getHours()),
    padTimestampPart(date.getMinutes()),
    padTimestampPart(date.getSeconds())
  ].join('');
}

export function createDefaultRecordingPath(date = new Date()) {
  return `./.clinspect/recordings/clinspect-${formatRecordingTimestamp(date)}.ndjson`;
}

export function parsePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new InvalidArgumentError('port must be an integer between 1 and 65535');
  }

  return port;
}

export function parseTargetUrl(value) {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('unsupported protocol');
    }

    return url.href;
  } catch {
    throw new InvalidArgumentError('target must be a valid http(s) URL');
  }
}

export function parseRecordMode(value) {
  const mode = String(value ?? '').toLowerCase();

  if (!RECORDING_MODES.includes(mode)) {
    throw new InvalidArgumentError('record must be one of: full, partial');
  }

  return mode;
}

export function createProgram() {
  return new Command()
    .name('clinspect')
    .description('Terminal HTTP traffic inspector')
    .option('--load <path>', 'load a recorded NDJSON session without starting live or demo capture')
    .option('-p, --port <number>', 'local proxy port for live mode', parsePort, DEFAULT_PORT)
    .option('-t, --target <url>', 'upstream target URL for live proxy mode', parseTargetUrl)
    .option('--open', 'open the local proxy URL in a browser for public live targets')
    .option('--record <mode>', 'record traffic to disk (full|partial)', parseRecordMode)
    .option('--record-path <path>', 'exact NDJSON file path for --record output')
    .option('--show-cookie-values', 'show raw Cookie and Set-Cookie values in the UI and search')
    .option('--record-cookie-values', 'write raw Cookie and Set-Cookie values to recordings');
}

function hasExplicitOption(argv, optionNames) {
  return argv.slice(2).some((arg) => {
    return optionNames.some((optionName) => {
      if (optionName.startsWith('--')) {
        return arg === optionName || arg.startsWith(`${optionName}=`);
      }

      return arg === optionName || arg.startsWith(optionName);
    });
  });
}

export function isHelpRequested(argv = process.argv) {
  return argv.slice(2).some((arg) => arg === '--help' || arg === '-h');
}

export function getCliHelpText() {
  const helpText = createProgram().helpInformation();

  return helpText.endsWith('\n') ? helpText : `${helpText}\n`;
}

export function parseCliOptions(argv = process.argv) {
  const program = createProgram();

  program.exitOverride();
  program.configureOutput({
    writeOut: () => {},
    writeErr: () => {}
  });

  program.parse(argv, { from: 'node' });

  const options = program.opts();
  const sessionPath = options.load ?? null;
  const targetUrl = options.target ?? null;
  const recordMode = options.record ?? 'off';
  const showCookieValues = Boolean(options.showCookieValues);
  const recordCookieValues = Boolean(options.recordCookieValues);

  if (sessionPath) {
    const hasReplayConflict = Boolean(
      targetUrl ||
      options.open ||
      options.record ||
      options.recordPath ||
      recordCookieValues ||
      hasExplicitOption(argv, ['--port', '-p'])
    );

    if (hasReplayConflict) {
      throw new InvalidArgumentError('load cannot be combined with --target, --port, --open, --record, --record-path, or --record-cookie-values');
    }

    return {
      mode: 'replay',
      loadedSession: null,
      openBrowser: false,
      port: DEFAULT_PORT,
      recording: {
        cookieValuePolicy: 'masked',
        mode: 'off',
        path: null
      },
      recordCookieValues: false,
      sessionPath,
      showCookieValues,
      targetUrl: null
    };
  }

  if (recordMode === 'off' && options.recordPath) {
    throw new InvalidArgumentError('record-path requires --record');
  }

  if (recordMode === 'off' && recordCookieValues) {
    throw new InvalidArgumentError('record-cookie-values requires --record');
  }

  return {
    mode: targetUrl ? 'live' : 'demo',
    openBrowser: Boolean(options.open),
    port: options.port,
    recording: {
      cookieValuePolicy: recordCookieValues ? 'raw' : 'masked',
      mode: recordMode,
      path: recordMode === 'off'
        ? null
        : (options.recordPath ?? createDefaultRecordingPath())
    },
    recordCookieValues,
    showCookieValues,
    targetUrl
  };
}

export function formatCliError(error) {
  if (typeof error?.message === 'string') {
    return error.message.replace(/^error:\s*/i, '');
  }

  return String(error);
}
