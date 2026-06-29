import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStableStdout,
  parseEraseLinesPrefix,
  renderLineDiff,
  splitFrameLines
} from '../src/ui/stable-output.js';

const CSI = '\u001B[';
const ERASE_LINE = `${CSI}2K`;
const CURSOR_LEFT = `${CSI}G`;
const CURSOR_UP_ONE = `${CSI}1A`;

function eraseLines(count) {
  let output = '';

  for (let index = 0; index < count; index += 1) {
    output += ERASE_LINE;

    if (index < count - 1) {
      output += CURSOR_UP_ONE;
    }
  }

  return count > 0 ? `${output}${CURSOR_LEFT}` : '';
}

test('stable output helpers parse Ink frame updates', () => {
  const update = `${eraseLines(3)}one\ntwo\n`;
  const parsed = parseEraseLinesPrefix(update);

  assert.deepEqual(splitFrameLines('one\ntwo\n'), ['one', 'two']);
  assert.equal(parsed.lineCount, 3);
  assert.equal(parsed.rest, 'one\ntwo\n');
});

test('renderLineDiff updates only changed rows and returns to the frame bottom', () => {
  assert.equal(
    renderLineDiff(['top', 'old', 'bottom'], ['top', 'new', 'bottom']),
    `${CSI}2A${CURSOR_LEFT}${ERASE_LINE}new${CSI}2B${CURSOR_LEFT}`
  );
  assert.equal(renderLineDiff(['same'], ['same']), '');
  assert.equal(renderLineDiff(['short'], ['short', 'tall']), null);
});

test('createStableStdout converts same-height Ink repaints into line diffs', () => {
  const writes = [];
  const stream = {
    columns: 80,
    rows: 24,
    isTTY: true,
    write(value) {
      writes.push(String(value));
      return true;
    },
    on() {},
    off() {},
    once() {},
    removeListener() {}
  };
  const stdout = createStableStdout(stream);

  stdout.write('one\ntwo\n');
  stdout.write(`${eraseLines(3)}one\nTWO\n`);

  assert.equal(writes[0], 'one\ntwo\n');
  assert.equal(writes[1], `${CSI}1A${CURSOR_LEFT}${ERASE_LINE}TWO${CSI}1B${CURSOR_LEFT}`);
});
