#!/usr/bin/env node

import { run } from '../src/index.js';

const exitCode = run(process.argv);

if (exitCode !== 0) {
  process.exitCode = exitCode;
}
