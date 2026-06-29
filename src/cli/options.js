import { Command, InvalidArgumentError } from 'commander';

export const DEFAULT_PORT = 8080;

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

export function createProgram() {
  return new Command()
    .name('clinspect')
    .description('Mock terminal traffic inspector MVP')
    .option('-p, --port <number>', 'local proxy port for future live mode', parsePort, DEFAULT_PORT)
    .option('-t, --target <url>', 'upstream target URL for future live mode', parseTargetUrl);
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

  return {
    mode: 'demo',
    port: options.port,
    targetUrl: options.target ?? null
  };
}

export function formatCliError(error) {
  if (typeof error?.message === 'string') {
    return error.message.replace(/^error:\s*/i, '');
  }

  return String(error);
}
