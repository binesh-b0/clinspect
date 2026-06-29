import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isInkMouseInput,
  isSgrMouseReport,
  parseInkMouseInput,
  parseSgrMouseEvent
} from '../src/ui/mouse.js';

test('parseSgrMouseEvent parses wheel up and wheel down SGR reports', () => {
  assert.deepEqual(parseSgrMouseEvent('\u001B[<64;10;5M'), {
    type: 'wheel',
    direction: 1,
    x: 10,
    y: 5,
    button: 64
  });
  assert.deepEqual(parseSgrMouseEvent('\u001B[<65;11;6M'), {
    type: 'wheel',
    direction: -1,
    x: 11,
    y: 6,
    button: 65
  });
});

test('parseSgrMouseEvent accepts wheel reports with modifier bits', () => {
  assert.deepEqual(parseSgrMouseEvent('\u001B[<84;3;4M'), {
    type: 'wheel',
    direction: 1,
    x: 3,
    y: 4,
    button: 84
  });
  assert.deepEqual(parseSgrMouseEvent('\u001B[<81;7;8M'), {
    type: 'wheel',
    direction: -1,
    x: 7,
    y: 8,
    button: 81
  });
});

test('parseSgrMouseEvent ignores non-wheel, release, legacy, and malformed mouse input', () => {
  assert.equal(parseSgrMouseEvent('[<65;10;5M'), null);
  assert.equal(parseSgrMouseEvent('\u001B[<0;10;5M'), null);
  assert.equal(parseSgrMouseEvent('\u001B[<65;10;5m'), null);
  assert.equal(parseSgrMouseEvent('\u001B[M !!'), null);
  assert.equal(parseSgrMouseEvent('\u001B[<65;0;5M'), null);
  assert.equal(parseSgrMouseEvent('\u001B[<65;10;0M'), null);
  assert.equal(parseSgrMouseEvent('\u001B[<65;10M'), null);
});

test('mouse report helpers identify valid SGR reports for swallow-only handling', () => {
  assert.equal(isSgrMouseReport('\u001B[<0;10;5M'), true);
  assert.equal(isSgrMouseReport('\u001B[<0;10;5m'), true);
  assert.equal(isSgrMouseReport('[<0;10;5M'), false);
  assert.equal(isSgrMouseReport('\u001B[M !!'), false);
  assert.equal(isInkMouseInput('[<0;10;5M'), true);
});

test('parseInkMouseInput handles Ink-stripped SGR mouse input', () => {
  assert.deepEqual(parseInkMouseInput('[<65;10;5M'), {
    type: 'wheel',
    direction: -1,
    x: 10,
    y: 5,
    button: 65
  });
});
