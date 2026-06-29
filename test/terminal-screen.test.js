import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTerminalScreen,
  DISABLE_MOUSE_REPORTING,
  ENABLE_MOUSE_REPORTING,
  ENTER_ALTERNATE_SCREEN,
  EXIT_ALTERNATE_SCREEN
} from '../src/ui/terminal-screen.js';

function createStream(isTTY) {
  const writes = [];

  return {
    stream: {
      isTTY,
      write(value) {
        writes.push(String(value));
        return true;
      }
    },
    writes
  };
}

test('terminal screen enters and exits the alternate buffer once', () => {
  const { stream, writes } = createStream(true);
  const terminalScreen = createTerminalScreen(stream);

  assert.equal(terminalScreen.isActive, false);
  assert.equal(terminalScreen.enter(), true);
  assert.equal(terminalScreen.enter(), false);
  assert.equal(terminalScreen.isActive, true);
  assert.equal(terminalScreen.exit(), true);
  assert.equal(terminalScreen.exit(), false);
  assert.equal(terminalScreen.isActive, false);
  assert.deepEqual(writes, [
    ENTER_ALTERNATE_SCREEN,
    ENABLE_MOUSE_REPORTING,
    DISABLE_MOUSE_REPORTING,
    EXIT_ALTERNATE_SCREEN
  ]);
});

test('terminal screen skips alternate buffer control for non-TTY output', () => {
  const { stream, writes } = createStream(false);
  const terminalScreen = createTerminalScreen(stream);

  assert.equal(terminalScreen.enter(), false);
  assert.equal(terminalScreen.isActive, false);
  assert.equal(terminalScreen.exit(), false);
  assert.deepEqual(writes, []);
});
