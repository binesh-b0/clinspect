import fs from 'node:fs';

import { normalizeKeyBindings } from './ui/key-bindings.js';

export const DEFAULT_CONFIG_PATH = './.clinspect/config.json';

export function loadProjectConfig(configPath = DEFAULT_CONFIG_PATH, options = {}) {
  const fileSystem = options.fs ?? fs;
  const normalizedDefaults = normalizeKeyBindings();

  if (!fileSystem.existsSync(configPath)) {
    return {
      keyBindings: normalizedDefaults.bindings,
      keyBindingWarnings: []
    };
  }

  try {
    const rawConfig = fileSystem.readFileSync(configPath, 'utf8');
    const parsedConfig = JSON.parse(rawConfig);
    const normalizedBindings = normalizeKeyBindings(parsedConfig);
    return {
      keyBindings: normalizedBindings.bindings,
      keyBindingWarnings: normalizedBindings.warnings
    };
  } catch (error) {
    return {
      keyBindings: normalizedDefaults.bindings,
      keyBindingWarnings: [`invalid .clinspect/config.json; using default key bindings (${error.message})`]
    };
  }
}

