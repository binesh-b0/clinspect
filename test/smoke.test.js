import assert from 'node:assert/strict';
import test from 'node:test';
import { StateStore } from '../src/store/state.js';

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
      openBrowser: false,
      port: 9090,
      targetUrl: 'http://localhost:3000/'
    },
    {
      stateStore: new StateStore(),
      renderApp: () => ({
        unmount() {
          calls.push(['unmount']);
        }
      }),
      startLiveProxy: (stateStore, options) => {
        calls.push(['live', options.port, options.targetUrl, typeof options.shouldCapture]);

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

  assert.deepEqual(calls, [['live', 9090, 'http://localhost:3000/', 'function']]);

  await inspector.stop();

  assert.deepEqual(calls, [
    ['live', 9090, 'http://localhost:3000/', 'function'],
    ['unmount'],
    ['stop'],
    ['exit', 0]
  ]);
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
