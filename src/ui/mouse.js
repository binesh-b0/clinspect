const ESC = '\u001B';
const SGR_MOUSE_PATTERN = /^\u001B\[<(\d+);(\d+);(\d+)([Mm])$/;
const MOUSE_MODIFIER_MASK = 4 | 8 | 16;
const WHEEL_UP_BUTTON = 64;
const WHEEL_DOWN_BUTTON = 65;

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function normalizeInkMouseSequence(input) {
  return input.startsWith('[<') ? `${ESC}${input}` : input;
}

function parseSgrMouseReport(sequence) {
  if (typeof sequence !== 'string') {
    return null;
  }

  const match = sequence.match(SGR_MOUSE_PATTERN);

  if (!match) {
    return null;
  }

  const button = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const action = match[4];

  if (!isPositiveInteger(x) || !isPositiveInteger(y) || !Number.isSafeInteger(button) || button > 255) {
    return null;
  }

  return {
    action,
    button,
    x,
    y
  };
}

export function isSgrMouseReport(sequence) {
  return parseSgrMouseReport(sequence) !== null;
}

export function isInkMouseInput(input) {
  if (typeof input !== 'string') {
    return false;
  }

  return isSgrMouseReport(normalizeInkMouseSequence(input));
}

export function parseSgrMouseEvent(sequence) {
  const report = parseSgrMouseReport(sequence);

  if (!report || report.action !== 'M') {
    return null;
  }

  const { button, x, y } = report;
  const buttonType = button & ~MOUSE_MODIFIER_MASK;

  if (buttonType === WHEEL_UP_BUTTON) {
    return {
      type: 'wheel',
      direction: 1,
      x,
      y,
      button
    };
  }

  if (buttonType === WHEEL_DOWN_BUTTON) {
    return {
      type: 'wheel',
      direction: -1,
      x,
      y,
      button
    };
  }

  return null;
}

export function parseInkMouseInput(input) {
  if (typeof input !== 'string') {
    return null;
  }

  return parseSgrMouseEvent(normalizeInkMouseSequence(input));
}
