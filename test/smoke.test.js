import assert from 'node:assert/strict';
import test from 'node:test';

test('runtime modules import without syntax or ESM errors', async () => {
  const index = await import('../src/index.js');
  const app = await import('../src/ui/App.js');

  assert.equal(typeof index.run, 'function');
  assert.equal(typeof index.startInspector, 'function');
  assert.equal(typeof app.App, 'function');
});
