import assert from 'node:assert/strict';
import test from 'node:test';
import { getOpenCommand, openUrl } from '../src/browser.js';

test('getOpenCommand maps platform open commands', () => {
  assert.deepEqual(getOpenCommand('http://localhost:8080', 'darwin'), {
    command: 'open',
    args: ['http://localhost:8080']
  });
  assert.deepEqual(getOpenCommand('http://localhost:8080', 'win32'), {
    command: 'cmd',
    args: ['/c', 'start', '', 'http://localhost:8080']
  });
  assert.deepEqual(getOpenCommand('http://localhost:8080', 'linux'), {
    command: 'xdg-open',
    args: ['http://localhost:8080']
  });
});

test('openUrl spawns detached opener and unreferences the child process', () => {
  const calls = [];
  const child = {
    unref() {
      calls.push(['unref']);
    }
  };

  openUrl('http://localhost:8080', {
    platform: 'linux',
    spawn(command, args, options) {
      calls.push([command, args, options]);

      return child;
    }
  });

  assert.deepEqual(calls, [
    ['xdg-open', ['http://localhost:8080'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }],
    ['unref']
  ]);
});
