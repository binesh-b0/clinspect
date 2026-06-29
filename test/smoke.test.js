import assert from 'node:assert/strict';
import test from 'node:test';
import { StateStore } from '../src/store/state.js';

test('runtime modules import without syntax or ESM errors', async () => {
  const index = await import('../src/index.js');
  const app = await import('../src/ui/App.js');

  assert.equal(typeof index.run, 'function');
  assert.equal(typeof index.startInspector, 'function');
  assert.equal(typeof app.App, 'function');
});

test('startInspector selects the live proxy engine for live mode', async () => {
  const { startInspector } = await import('../src/index.js');
  const calls = [];
  const inspector = startInspector(
    {
      mode: 'live',
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
