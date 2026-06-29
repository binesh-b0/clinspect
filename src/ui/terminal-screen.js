const CSI = '\u001B[';

export const ENTER_ALTERNATE_SCREEN = `${CSI}?1049h`;
export const EXIT_ALTERNATE_SCREEN = `${CSI}?1049l`;
export const ENABLE_MOUSE_REPORTING = `${CSI}?1000h${CSI}?1006h`;
export const DISABLE_MOUSE_REPORTING = `${CSI}?1006l${CSI}?1000l`;

export function createTerminalScreen(stream = process.stdout) {
  let isActive = false;

  return {
    get isActive() {
      return isActive;
    },
    enter() {
      if (isActive || stream?.isTTY !== true) {
        return false;
      }

      stream.write(ENTER_ALTERNATE_SCREEN);
      stream.write(ENABLE_MOUSE_REPORTING);
      isActive = true;

      return true;
    },
    exit() {
      if (!isActive) {
        return false;
      }

      stream.write(DISABLE_MOUSE_REPORTING);
      stream.write(EXIT_ALTERNATE_SCREEN);
      isActive = false;

      return true;
    }
  };
}
