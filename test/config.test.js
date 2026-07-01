import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { DEFAULT_CONFIG_PATH, loadProjectConfig } from '../src/config.js';
import {
  DEFAULT_KEY_BINDINGS,
  normalizeKeyBindings
} from '../src/ui/App.js';

async function withTempDir(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'clinspect-config-'));

  try {
    return await callback(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function writeConfig(directory, value) {
  const configDirectory = path.join(directory, '.clinspect');
  const configPath = path.join(configDirectory, 'config.json');

  await mkdir(configDirectory, { recursive: true });
  await writeFile(configPath, value, 'utf8');

  return configPath;
}

test('project config defaults to built-in key bindings when missing', async () => {
  await withTempDir(async (directory) => {
    const config = loadProjectConfig(path.join(directory, '.clinspect', 'config.json'));

    assert.equal(DEFAULT_CONFIG_PATH, './.clinspect/config.json');
    assert.deepEqual(config.keyBindingWarnings, []);
    assert.deepEqual(config.keyBindings['main.moveDown'], DEFAULT_KEY_BINDINGS['main.moveDown']);
  });
});

test('project config loads valid partial key binding overrides', async () => {
  await withTempDir(async (directory) => {
    const configPath = await writeConfig(directory, JSON.stringify({
      schemaVersion: 1,
      keyBindings: {
        'main.moveDown': ['z'],
        'main.moveUp': ['i']
      }
    }));
    const config = loadProjectConfig(configPath);

    assert.deepEqual(config.keyBindingWarnings, []);
    assert.deepEqual(config.keyBindings['main.moveDown'], ['z']);
    assert.deepEqual(config.keyBindings['main.moveUp'], ['i']);
    assert.deepEqual(config.keyBindings['main.openHelp'], DEFAULT_KEY_BINDINGS['main.openHelp']);
  });
});

test('project config falls back to defaults for invalid JSON', async () => {
  await withTempDir(async (directory) => {
    const configPath = await writeConfig(directory, '{ not json');
    const config = loadProjectConfig(configPath);

    assert.deepEqual(config.keyBindings['main.moveDown'], DEFAULT_KEY_BINDINGS['main.moveDown']);
    assert.equal(config.keyBindingWarnings.length, 1);
    assert.match(config.keyBindingWarnings[0], /invalid \.clinspect\/config\.json/);
  });
});

test('key binding normalization warns for unknown and invalid entries', () => {
  const normalized = normalizeKeyBindings({
    keyBindings: {
      'main.moveDown': 'z',
      'main.moveUp': ['i'],
      'unknown.action': ['x']
    }
  });

  assert.deepEqual(normalized.bindings['main.moveDown'], DEFAULT_KEY_BINDINGS['main.moveDown']);
  assert.deepEqual(normalized.bindings['main.moveUp'], ['i']);
  assert.match(normalized.warnings.join('\n'), /invalid key binding for main\.moveDown/);
  assert.match(normalized.warnings.join('\n'), /unknown key binding action ignored: unknown\.action/);
});

test('key binding normalization drops duplicate bindings in the same active context', () => {
  const normalized = normalizeKeyBindings({
    keyBindings: {
      'main.moveDown': ['~'],
      'main.moveUp': ['~', 'i']
    }
  });

  assert.deepEqual(normalized.bindings['main.moveDown'], ['~']);
  assert.deepEqual(normalized.bindings['main.moveUp'], ['i']);
  assert.match(normalized.warnings.join('\n'), /duplicate key binding ~ for main\.moveUp; main\.moveDown keeps it/);
});
