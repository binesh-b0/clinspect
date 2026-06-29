const CSI = '\u001B[';
const ERASE_LINE = `${CSI}2K`;
const CURSOR_LEFT = `${CSI}G`;
const CURSOR_UP_ONE = `${CSI}1A`;

function cursorUp(count) {
  return count > 0 ? `${CSI}${count}A` : '';
}

function cursorDown(count) {
  return count > 0 ? `${CSI}${count}B` : '';
}

export function splitFrameLines(frame = '') {
  const text = frame.endsWith('\n') ? frame.slice(0, -1) : frame;

  return text.length === 0 ? [] : text.split('\n');
}

export function parseEraseLinesPrefix(value = '') {
  let offset = 0;
  let lineCount = 0;

  while (value.startsWith(ERASE_LINE, offset)) {
    lineCount += 1;
    offset += ERASE_LINE.length;

    if (value.startsWith(CURSOR_UP_ONE, offset)) {
      offset += CURSOR_UP_ONE.length;
    } else {
      break;
    }
  }

  if (lineCount === 0 || !value.startsWith(CURSOR_LEFT, offset)) {
    return null;
  }

  offset += CURSOR_LEFT.length;

  return {
    lineCount,
    rest: value.slice(offset)
  };
}

export function renderLineDiff(previousLines, nextLines) {
  if (previousLines.length !== nextLines.length) {
    return null;
  }

  let output = '';
  let cursorRow = previousLines.length;

  nextLines.forEach((line, row) => {
    if (line === previousLines[row]) {
      return;
    }

    if (cursorRow > row) {
      output += cursorUp(cursorRow - row);
    } else if (cursorRow < row) {
      output += cursorDown(row - cursorRow);
    }

    output += `${CURSOR_LEFT}${ERASE_LINE}${line}`;
    cursorRow = row;
  });

  if (output.length === 0) {
    return '';
  }

  if (cursorRow < nextLines.length) {
    output += cursorDown(nextLines.length - cursorRow);
  }

  return `${output}${CURSOR_LEFT}`;
}

function writePassthrough(stream, chunk, encoding, callback) {
  if (typeof encoding === 'function') {
    return stream.write(chunk, encoding);
  }

  return stream.write(chunk, encoding, callback);
}

function callWriteCallback(callback) {
  if (typeof callback === 'function') {
    callback();
  }
}

export function createStableStdout(stream = process.stdout) {
  let previousLines = [];

  const stableStdout = {
    get columns() {
      return stream.columns;
    },
    get rows() {
      return stream.rows;
    },
    get isTTY() {
      return stream.isTTY;
    },
    get fd() {
      return stream.fd;
    },
    write(chunk, encoding, callback) {
      const text = Buffer.isBuffer(chunk)
        ? chunk.toString(typeof encoding === 'string' ? encoding : undefined)
        : String(chunk);
      const erasePrefix = parseEraseLinesPrefix(text);

      if (!erasePrefix) {
        previousLines = splitFrameLines(text);
        return writePassthrough(stream, chunk, encoding, callback);
      }

      if (erasePrefix.rest.length === 0) {
        previousLines = [];
        return writePassthrough(stream, chunk, encoding, callback);
      }

      const nextLines = splitFrameLines(erasePrefix.rest);
      const expectedErasedLines = previousLines.length + 1;
      const diff = erasePrefix.lineCount === expectedErasedLines
        ? renderLineDiff(previousLines, nextLines)
        : null;

      if (diff === null) {
        previousLines = nextLines;
        return writePassthrough(stream, chunk, encoding, callback);
      }

      previousLines = nextLines;

      if (diff.length === 0) {
        callWriteCallback(typeof encoding === 'function' ? encoding : callback);
        return true;
      }

      return writePassthrough(stream, diff, typeof encoding === 'string' ? encoding : callback, callback);
    },
    on(eventName, listener) {
      stream.on(eventName, listener);
      return stableStdout;
    },
    off(eventName, listener) {
      stream.off(eventName, listener);
      return stableStdout;
    },
    once(eventName, listener) {
      stream.once(eventName, listener);
      return stableStdout;
    },
    removeListener(eventName, listener) {
      stream.removeListener(eventName, listener);
      return stableStdout;
    },
    getColorDepth(...args) {
      return stream.getColorDepth?.(...args) ?? 1;
    },
    hasColors(...args) {
      return stream.hasColors?.(...args) ?? false;
    }
  };

  return stableStdout;
}
