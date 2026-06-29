import { spawn } from 'child_process';

export function getOpenCommand(url, platform = process.platform) {
  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [url]
    };
  }

  if (platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/c', 'start', '', url]
    };
  }

  return {
    command: 'xdg-open',
    args: [url]
  };
}

export function openUrl(url, runtime = {}) {
  const spawnProcess = runtime.spawn ?? spawn;
  const platform = runtime.platform ?? process.platform;
  const { command, args } = getOpenCommand(url, platform);
  const child = spawnProcess(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });

  if (typeof child?.unref === 'function') {
    child.unref();
  }

  return child;
}
