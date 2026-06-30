import { useInput } from 'ink';
import { isInkMouseInput, parseInkMouseInput } from './mouse.js';
import {
  COMMAND_MODAL_ROW_COUNT,
  TRAFFIC_LIST_WIDTH
} from './shared.js';
import { getPageStep } from './detail.js';
import { getComposerTabFromShortcut } from './composer.js';
import { getMouseWheelTarget } from './traffic.js';

export const COMMAND_DEFINITIONS = [
  {
    name: 'quit',
    aliases: ['q'],
    description: 'quit',
    action: { type: 'quit' }
  },
  {
    name: 'resend',
    aliases: ['rs'],
    description: 'exact resend selected request',
    action: { type: 'startResend', mode: 'exact' }
  },
  {
    name: 'record',
    aliases: ['rec'],
    description: 'start, pause, or resume recording',
    action: { type: 'toggleRecordingPause' }
  },
  {
    name: 'stop-recording',
    aliases: ['stop', 'stop-rec'],
    description: 'stop recording',
    action: { type: 'stopRecording' }
  },
  {
    name: 'pause-capture',
    aliases: ['capture-pause', 'pause'],
    description: 'pause or resume capture',
    action: { type: 'togglePause' }
  },
  {
    name: 'clear-logs',
    aliases: ['clear', 'clear-traffic'],
    description: 'clear current logs',
    action: { type: 'clearLogs' }
  },
  {
    name: 'help',
    aliases: ['h'],
    description: 'open help',
    action: { type: 'openHelp' }
  }
];

const COMMAND_HINTS_BY_KEY = new Map([
  ['q', 'use :quit'],
  ['R', 'use :resend'],
  ['P', 'use :record'],
  ['S', 'use :stop-recording'],
  ['p', 'use :pause-capture'],
  ['c', 'use :clear-logs']
]);

function isBackspaceInput(value, keyState = {}) {
  return Boolean(keyState.backspace || keyState.delete || value === '\u007F' || value === '\b');
}

function isDeleteInput(value, _keyState = {}) {
  return value === '\u001B[3~';
}

function normalizeCommandInput(input = '') {
  return String(input ?? '').trim().replace(/^:/, '').toLowerCase();
}

function getCommandLabels(command) {
  return [command.name, ...(command.aliases ?? [])];
}

function cloneCommandAction(command) {
  return { ...command.action };
}

export function getCommandMatches(input = '') {
  const value = normalizeCommandInput(input);

  if (!value) {
    return COMMAND_DEFINITIONS;
  }

  return COMMAND_DEFINITIONS.filter((command) => (
    getCommandLabels(command).some((label) => label.startsWith(value))
  ));
}

export function getCommandSuggestionIndex(input = '', currentIndex = -1, direction = 1) {
  const matches = getCommandMatches(input);

  if (matches.length === 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction < 0 ? matches.length - 1 : 0;
  }

  return (currentIndex + direction + matches.length) % matches.length;
}

function getCompactCommandAlias(command) {
  const aliases = command?.aliases ?? [];

  if (aliases.length === 0) {
    return '';
  }

  return [...aliases].sort((first, second) => first.length - second.length)[0];
}

export function getCommandSuggestionRows(input = '', selectedIndex = -1, rowCount = COMMAND_MODAL_ROW_COUNT) {
  const matches = getCommandMatches(input).slice(0, rowCount);
  const safeSelectedIndex = selectedIndex >= 0 && matches.length > 0
    ? selectedIndex % matches.length
    : -1;
  const rows = matches.map((command, index) => ({
    aliases: command.aliases?.length ? command.aliases.join(', ') : '',
    command,
    description: command.description,
    isSelected: index === safeSelectedIndex,
    name: command.name,
    primaryAlias: getCompactCommandAlias(command)
  }));

  while (rows.length < rowCount) {
    rows.push({
      aliases: '',
      command: null,
      description: '',
      isSelected: false,
      name: '',
      primaryAlias: ''
    });
  }

  return rows;
}

export function formatCommandSelectionStatus(row) {
  if (!row?.command) {
    return '';
  }

  const aliasText = row.primaryAlias ? ` (${row.primaryAlias})` : '';

  return `selected :${row.name}${aliasText}`;
}

export function getCommandHintForKey(input = '') {
  return COMMAND_HINTS_BY_KEY.get(String(input ?? '')) ?? null;
}

export function resolveCommandInput(input = '', selectedIndex = -1) {
  const value = normalizeCommandInput(input);

  if (!value) {
    return {
      ok: false,
      error: 'command required'
    };
  }

  const exactCommand = COMMAND_DEFINITIONS.find((command) => (
    getCommandLabels(command).includes(value)
  ));

  if (exactCommand) {
    return {
      ok: true,
      action: cloneCommandAction(exactCommand),
      command: exactCommand
    };
  }

  const matches = getCommandMatches(value);

  if (matches.length === 0) {
    return {
      ok: false,
      error: `unknown command: ${value}`
    };
  }

  if (matches.length === 1) {
    return {
      ok: true,
      action: cloneCommandAction(matches[0]),
      command: matches[0]
    };
  }

  if (selectedIndex >= 0) {
    const safeIndex = selectedIndex % matches.length;
    const command = matches[safeIndex];

    return {
      ok: true,
      action: cloneCommandAction(command),
      command
    };
  }

  return {
    ok: false,
    error: `ambiguous command: ${matches.map((command) => command.name).join(', ')}`
  };
}

export function getKeyboardAction(input = '', key = {}, options = {}) {
  const {
    filterFocus = 'query',
    isListFocused = true,
    isHelpOpen = false,
    isListDisplayOpen = false,
    isFilterOpen = false,
    isDetailSearchOpen = false,
    isDetailModalOpen = false,
    isCommandOpen = false,
    isExportPromptOpen = false,
    isResendConfirmOpen = false,
    isResending = false,
    isReplayMode = false,
    isLiveMode = false,
    isComposerOpen = false,
    isComposerSending = false,
    isComposerConfirmOpen = false,
    isComposerBodyEditorOpen = false,
    isComposerLibraryOpen = false,
    isComposerTextFocused = false,
    detailPageSize = 1,
    showTrafficPane = true,
    trafficPageSize = 1,
    trafficPaneWidth = TRAFFIC_LIST_WIDTH
  } = options;
  const value = input ?? '';
  const keyState = key ?? {};

  if (value === 'c' && keyState.ctrl) {
    return { type: 'quit' };
  }

  if (isCommandOpen) {
    if (keyState.escape) {
      return { type: 'closeCommandPrompt' };
    }

    if (keyState.return) {
      return { type: 'submitCommand' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return { type: 'backspaceCommandText' };
    }

    if (keyState.tab || keyState.downArrow) {
      return { type: 'cycleCommandSuggestion', direction: 1 };
    }

    if (keyState.upArrow) {
      return { type: 'cycleCommandSuggestion', direction: -1 };
    }

    if (value && !keyState.ctrl && !keyState.meta && !parseInkMouseInput(value) && !isInkMouseInput(value)) {
      return { type: 'appendCommandText', value };
    }

    return { type: 'none' };
  }

  if (isExportPromptOpen) {
    if (keyState.escape) {
      return { type: 'cancelExport' };
    }

    if (value === 'm' || value === 'M') {
      return { type: 'finishExport', secretPolicy: 'masked' };
    }

    if (value === 'r' || value === 'R') {
      return { type: 'finishExport', secretPolicy: 'raw' };
    }

    return { type: 'none' };
  }

  if (isHelpOpen) {
    if (keyState.escape || value === 'h' || value === 'q') {
      return { type: 'closeHelp' };
    }

    return { type: 'none' };
  }

  if (isListDisplayOpen) {
    if (keyState.escape || keyState.return) {
      return { type: 'closeListDisplay' };
    }

    if (keyState.upArrow || value === 'k') {
      return { type: 'moveListDisplayFocus', direction: -1 };
    }

    if (keyState.downArrow || value === 'j') {
      return { type: 'moveListDisplayFocus', direction: 1 };
    }

    if (keyState.leftArrow) {
      return { type: 'cycleListDisplayOption', direction: -1 };
    }

    if (keyState.rightArrow) {
      return { type: 'cycleListDisplayOption', direction: 1 };
    }

    if (value === ' ') {
      return { type: 'toggleListDisplayColumn' };
    }

    if (value === 'r') {
      return { type: 'resetListDisplay' };
    }

    return { type: 'none' };
  }

  if (isResendConfirmOpen) {
    if (isResending) {
      return { type: 'none' };
    }

    if (keyState.return || value === 'y' || value === 'Y') {
      return { type: 'sendResend' };
    }

    if (value === 'E' || value === 'e') {
      return { type: 'editPendingResend' };
    }

    if (keyState.escape || value === 'n' || value === 'N') {
      return { type: 'cancelResend' };
    }

    return { type: 'none' };
  }

  if (isComposerOpen) {
    if (parseInkMouseInput(value) || isInkMouseInput(value)) {
      return { type: 'none' };
    }

    if (isComposerSending) {
      return { type: 'none' };
    }

    if (isComposerConfirmOpen) {
      if (keyState.return || value === 'y' || value === 'Y') {
        return { type: 'sendComposer' };
      }

      if (keyState.escape || value === 'n' || value === 'N') {
        return { type: 'closeComposerPreview' };
      }

      return { type: 'none' };
    }

    if (isComposerLibraryOpen) {
      const shortcutTab = getComposerTabFromShortcut(value);

      if (shortcutTab) {
        return { type: 'selectComposerTab', tab: shortcutTab };
      }

      if (keyState.escape || value === 'l') {
        return { type: 'closeComposerLibrary' };
      }

      if (keyState.return) {
        return { type: 'loadComposerLibraryRequest' };
      }

      if (keyState.upArrow || value === 'k') {
        return { type: 'moveComposerLibrary', direction: -1 };
      }

      if (keyState.downArrow || value === 'j') {
        return { type: 'moveComposerLibrary', direction: 1 };
      }

      return { type: 'none' };
    }

    if (isComposerBodyEditorOpen) {
      if (keyState.escape) {
        return { type: 'closeComposerBodyEditor' };
      }

      if (keyState.return) {
        return { type: 'insertComposerText', value: '\n' };
      }

      if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
        return { type: isDeleteInput(value, keyState) ? 'deleteComposerText' : 'backspaceComposerText' };
      }

      if (keyState.leftArrow || keyState.rightArrow) {
        return { type: 'moveComposerCursor', direction: keyState.leftArrow ? -1 : 1 };
      }

      if (keyState.home || keyState.end) {
        return { type: 'moveComposerCursorTo', boundary: keyState.home ? 'start' : 'end' };
      }

      if (value && !keyState.ctrl && !keyState.meta) {
        return { type: 'insertComposerText', value };
      }

      return { type: 'none' };
    }

    if (keyState.escape) {
      return { type: 'closeComposer' };
    }

    if (keyState.return) {
      return { type: 'previewComposerSend' };
    }

    if (value === '[') {
      return { type: 'cycleComposerTab', direction: -1 };
    }

    if (value === ']') {
      return { type: 'cycleComposerTab', direction: 1 };
    }

    if (!isComposerTextFocused && getComposerTabFromShortcut(value)) {
      return { type: 'selectComposerTab', tab: getComposerTabFromShortcut(value) };
    }

    if (keyState.shiftTab || (keyState.shift && keyState.tab)) {
      return { type: 'cycleComposerFocus', direction: -1 };
    }

    if (keyState.tab || keyState.downArrow) {
      return { type: 'cycleComposerFocus', direction: 1 };
    }

    if (keyState.upArrow) {
      return { type: 'cycleComposerFocus', direction: -1 };
    }

    if (value === 'a' && !isComposerTextFocused) {
      return { type: 'addComposerRow' };
    }

    if (value === 'd' && !isComposerTextFocused) {
      return { type: 'deleteComposerRow' };
    }

    if (value === ' ' && !isComposerTextFocused) {
      return { type: 'toggleComposerField' };
    }

    if (value === 's' && !isComposerTextFocused) {
      return { type: 'saveComposerRequest' };
    }

    if (value === 'l' && !isComposerTextFocused) {
      return { type: 'openComposerLibrary' };
    }

    if (value === 'R' && !isComposerTextFocused) {
      return { type: 'toggleComposerReveal' };
    }

    if (value === 'o' && !isComposerTextFocused) {
      return { type: 'openComposerBodyEditor' };
    }

    if (keyState.leftArrow || keyState.rightArrow) {
      return { type: 'moveComposerHorizontal', direction: keyState.leftArrow ? -1 : 1 };
    }

    if (keyState.home || keyState.end) {
      return { type: 'moveComposerCursorTo', boundary: keyState.home ? 'start' : 'end' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return { type: isDeleteInput(value, keyState) ? 'deleteComposerText' : 'backspaceComposerText' };
    }

    if (value && !keyState.ctrl && !keyState.meta) {
      return { type: 'insertComposerText', value };
    }

    return { type: 'none' };
  }

  if (isDetailSearchOpen) {
    if (keyState.escape || keyState.return) {
      return { type: 'finishDetailSearch' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return { type: 'backspaceDetailSearch' };
    }

    if (value && !keyState.ctrl && !keyState.meta) {
      return { type: 'appendDetailSearch', value };
    }

    return { type: 'none' };
  }

  const mouseEvent = parseInkMouseInput(value);

  if (mouseEvent) {
    if (getMouseWheelTarget(mouseEvent.x, trafficPaneWidth, showTrafficPane) === 'traffic') {
      return { type: 'moveSelection', direction: mouseEvent.direction };
    }

    return { type: 'scrollDetails', direction: mouseEvent.direction };
  }

  if (isInkMouseInput(value)) {
    return { type: 'none' };
  }

  if (value === ':' && !isFilterOpen) {
    return { type: 'openCommandPrompt' };
  }

  if (value === 'F' && !isFilterOpen) {
    return { type: 'toggleFrameworkAssets' };
  }

  if (isDetailModalOpen) {
    if (keyState.escape || value === 'q') {
      return { type: 'closeDetailModal' };
    }

    if (value === 'y') {
      return { type: 'startExport', action: 'copy' };
    }

    if (value === 'D') {
      return { type: 'startExport', action: 'download' };
    }

    if (value === '/') {
      return { type: 'openDetailSearch' };
    }

    if (value === 'R') {
      return { type: 'showCommandHint', message: getCommandHintForKey(value) };
    }

    if ((value === 'E' || value === 'e') && isLiveMode) {
      return { type: 'openComposer', mode: 'edit-resend' };
    }

    if (value === 'n') {
      return { type: 'moveDetailMatch', direction: 1 };
    }

    if (value === 'N') {
      return { type: 'moveDetailMatch', direction: -1 };
    }

    if (value === 'r') {
      return { type: 'toggleDetailTab' };
    }

    if (keyState.return) {
      return { type: 'toggleDetailNode' };
    }

    if (keyState.upArrow || value === 'k') {
      return { type: 'scrollDetails', direction: -1 };
    }

    if (keyState.downArrow || value === 'j') {
      return { type: 'scrollDetails', direction: 1 };
    }

    if (keyState.pageUp || value === '[') {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
    }

    if (keyState.pageDown || value === ']') {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
    }

    if (value === 'u' && keyState.ctrl) {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
    }

    if (value === 'd' && keyState.ctrl) {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
    }

    if (value === 'g') {
      return { type: 'scrollDetailsTo', boundary: 'top' };
    }

    if (value === 'G') {
      return { type: 'scrollDetailsTo', boundary: 'bottom' };
    }

    return { type: 'none' };
  }

  if (isFilterOpen) {
    if (keyState.escape || keyState.return) {
      return { type: 'finishSearch' };
    }

    if (value === 'x') {
      return { type: 'clearFilters' };
    }

    if (keyState.tab || keyState.downArrow) {
      return { type: 'cycleFilterFocus', direction: 1 };
    }

    if (keyState.upArrow) {
      return { type: 'cycleFilterFocus', direction: -1 };
    }

    if (keyState.rightArrow) {
      return { type: 'moveFilterOption', direction: 1 };
    }

    if (keyState.leftArrow) {
      return { type: 'moveFilterOption', direction: -1 };
    }

    if (value === ' ' && filterFocus !== 'query') {
      return { type: 'toggleFilterOption' };
    }

    if (isBackspaceInput(value, keyState) || isDeleteInput(value, keyState)) {
      return filterFocus === 'query'
        ? { type: 'backspaceSearch' }
        : { type: 'none' };
    }

    if (value && !keyState.ctrl && !keyState.meta && filterFocus === 'query') {
      return { type: 'appendSearch', value };
    }

    return { type: 'none' };
  }

  if (value === 'h') {
    return { type: 'openHelp' };
  }

  if (value === 'L') {
    return { type: 'openListDisplay' };
  }

  if (value === 't') {
    return { type: 'cycleTrafficPathMode', direction: 1 };
  }

  if (value === 'v') {
    return { type: 'cycleTrafficDensity', direction: 1 };
  }

  if (value === 'w') {
    return { type: 'cyclePaneWidthMode', direction: 1 };
  }

  if (value === 'y') {
    return { type: 'startExport', action: 'copy' };
  }

  if (value === 'D') {
    return { type: 'startExport', action: 'download' };
  }

  if (value === 'n' && isLiveMode && isListFocused) {
    return { type: 'openComposer', mode: 'blank' };
  }

  if (value === 'R') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if ((value === 'E' || value === 'e') && isLiveMode) {
    return { type: 'openComposer', mode: 'edit-resend' };
  }

  if (value === 'l' && isLiveMode) {
    return { type: 'openComposerLibrary' };
  }

  if (value === 'q') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if (value === '/') {
    return isListFocused
      ? { type: 'openFilter', focus: 'query' }
      : { type: 'openDetailSearch' };
  }

  if (value === 'x') {
    return { type: 'clearFilters' };
  }

  if (value === 'c') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if (value === 'f') {
    return { type: 'followLatest' };
  }

  if (value === 'o') {
    return { type: 'openDetailModal' };
  }

  if (keyState.return) {
    return isListFocused ? { type: 'inspectSelected' } : { type: 'toggleDetailNode' };
  }

  if (value === 'm') {
    return { type: 'openFilter', focus: 'method' };
  }

  if (value === 'p') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if (value === 'P') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if (value === 'S') {
    return { type: 'showCommandHint', message: getCommandHintForKey(value) };
  }

  if (value === 'r') {
    return { type: 'toggleDetailTab' };
  }

  if (value === 's') {
    return { type: 'openFilter', focus: 'status' };
  }

  if (value === 'n' && !isListFocused) {
    return { type: 'moveDetailMatch', direction: 1 };
  }

  if (value === 'N' && !isListFocused) {
    return { type: 'moveDetailMatch', direction: -1 };
  }

  if (keyState.tab) {
    return { type: 'toggleFocus' };
  }

  if (keyState.upArrow || value === 'k') {
    return isListFocused
      ? { type: 'moveSelection', direction: -1 }
      : { type: 'scrollDetails', direction: -1 };
  }

  if (keyState.downArrow || value === 'j') {
    return isListFocused
      ? { type: 'moveSelection', direction: 1 }
      : { type: 'scrollDetails', direction: 1 };
  }

  if (keyState.pageUp || value === '[') {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
  }

  if (keyState.pageDown || value === ']') {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
  }

  if (value === 'u' && keyState.ctrl) {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
  }

  if (value === 'd' && keyState.ctrl) {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
  }

  if (value === 'g') {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'first' }
      : { type: 'scrollDetailsTo', boundary: 'top' };
  }

  if (value === 'G') {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'last' }
      : { type: 'scrollDetailsTo', boundary: 'bottom' };
  }

  return { type: 'none' };
}

export function KeyboardControls({
  filterFocus,
  isListFocused,
  isHelpOpen,
  isListDisplayOpen,
  isFilterOpen,
  isDetailSearchOpen,
  isDetailModalOpen,
  isCommandOpen,
  isExportPromptOpen,
  isResendConfirmOpen,
  isResending,
  isReplayMode,
  isLiveMode,
  isComposerOpen,
  isComposerSending,
  isComposerConfirmOpen,
  isComposerBodyEditorOpen,
  isComposerLibraryOpen,
  isComposerTextFocused,
  detailPageSize,
  showTrafficPane,
  trafficPaneWidth,
  trafficPageSize,
  onAddComposerRow,
  onAppendCommandText,
  onAppendSearch,
  onAppendDetailSearch,
  onBackspaceCommandText,
  onBackspaceComposerText,
  onBackspaceSearch,
  onBackspaceDetailSearch,
  onCancelExport,
  onCancelResend,
  onCloseComposerBodyEditor,
  onCloseComposerLibrary,
  onCloseComposerPreview,
  onClearFilters,
  onClearLogs,
  onCloseDetailModal,
  onCloseComposer,
  onCloseCommandPrompt,
  onCloseHelp,
  onCloseListDisplay,
  onCycleComposerFocus,
  onCycleComposerTab,
  onCycleCommandSuggestion,
  onDeleteComposerRow,
  onDeleteComposerText,
  onCycleFilterFocus,
  onCycleListDisplayOption,
  onCyclePaneWidthMode,
  onCycleTrafficDensity,
  onCycleTrafficPathMode,
  onFinishExport,
  onFinishDetailSearch,
  onFinishSearch,
  onFollowLatest,
  onInsertComposerText,
  onEditPendingResend,
  onInspectSelected,
  onLoadComposerLibraryRequest,
  onMoveDetailMatch,
  onMoveSelectionTo,
  onMoveFilterOption,
  onMoveSelection,
  onMoveListDisplayFocus,
  onMoveComposerCursor,
  onMoveComposerCursorTo,
  onMoveComposerHorizontal,
  onMoveComposerLibrary,
  onOpenDetailModal,
  onOpenDetailSearch,
  onOpenComposer,
  onOpenComposerBodyEditor,
  onOpenComposerLibrary,
  onOpenCommandPrompt,
  onOpenFilter,
  onOpenHelp,
  onOpenListDisplay,
  onPreviewComposerSend,
  onQuit,
  onResetListDisplay,
  onSaveComposerRequest,
  onScrollDetails,
  onScrollDetailsTo,
  onSendComposer,
  onSendResend,
  onSelectComposerTab,
  onShowCommandHint,
  onStartExport,
  onStartResend,
  onSubmitCommand,
  onStopRecording,
  onToggleComposerField,
  onToggleComposerReveal,
  onToggleDetailNode,
  onToggleFilterOption,
  onToggleFrameworkAssets,
  onToggleListDisplayColumn,
  onToggleDetailTab,
  onToggleFocus,
  onTogglePause,
  onToggleRecordingPause
}) {
  useInput((input, key) => {
    const action = getKeyboardAction(input, key, {
      filterFocus,
      isListFocused,
      isHelpOpen,
      isListDisplayOpen,
      isFilterOpen,
      isDetailSearchOpen,
      isDetailModalOpen,
      isCommandOpen,
      isExportPromptOpen,
      isResendConfirmOpen,
      isResending,
      isReplayMode,
      isLiveMode,
      isComposerOpen,
      isComposerSending,
      isComposerConfirmOpen,
      isComposerBodyEditorOpen,
      isComposerLibraryOpen,
      isComposerTextFocused,
      detailPageSize,
      showTrafficPane,
      trafficPaneWidth,
      trafficPageSize
    });

    switch (action.type) {
      case 'addComposerRow':
        onAddComposerRow();
        break;
      case 'appendCommandText':
        onAppendCommandText(action.value);
        break;
      case 'backspaceComposerText':
        onBackspaceComposerText();
        break;
      case 'backspaceCommandText':
        onBackspaceCommandText();
        break;
      case 'appendSearch':
        onAppendSearch(action.value);
        break;
      case 'appendDetailSearch':
        onAppendDetailSearch(action.value);
        break;
      case 'backspaceSearch':
        onBackspaceSearch();
        break;
      case 'backspaceDetailSearch':
        onBackspaceDetailSearch();
        break;
      case 'cancelExport':
        onCancelExport();
        break;
      case 'cancelResend':
        onCancelResend();
        break;
      case 'closeComposerBodyEditor':
        onCloseComposerBodyEditor();
        break;
      case 'closeComposerLibrary':
        onCloseComposerLibrary();
        break;
      case 'closeComposerPreview':
        onCloseComposerPreview();
        break;
      case 'clearFilters':
        onClearFilters();
        break;
      case 'clearLogs':
        onClearLogs();
        break;
      case 'closeDetailModal':
        onCloseDetailModal();
        break;
      case 'closeComposer':
        onCloseComposer();
        break;
      case 'closeCommandPrompt':
        onCloseCommandPrompt();
        break;
      case 'closeHelp':
        onCloseHelp();
        break;
      case 'closeListDisplay':
        onCloseListDisplay();
        break;
      case 'cycleComposerFocus':
        onCycleComposerFocus(action.direction);
        break;
      case 'cycleComposerTab':
        onCycleComposerTab(action.direction);
        break;
      case 'cycleCommandSuggestion':
        onCycleCommandSuggestion(action.direction);
        break;
      case 'cycleListDisplayOption':
        onCycleListDisplayOption(action.direction);
        break;
      case 'cycleTrafficDensity':
        onCycleTrafficDensity(action.direction);
        break;
      case 'cycleTrafficPathMode':
        onCycleTrafficPathMode(action.direction);
        break;
      case 'cyclePaneWidthMode':
        onCyclePaneWidthMode(action.direction);
        break;
      case 'deleteComposerRow':
        onDeleteComposerRow();
        break;
      case 'deleteComposerText':
        onDeleteComposerText();
        break;
      case 'cycleFilterFocus':
        onCycleFilterFocus(action.direction);
        break;
      case 'finishSearch':
        onFinishSearch();
        break;
      case 'finishExport':
        onFinishExport(action.secretPolicy);
        break;
      case 'finishDetailSearch':
        onFinishDetailSearch();
        break;
      case 'followLatest':
        onFollowLatest();
        break;
      case 'insertComposerText':
        onInsertComposerText(action.value);
        break;
      case 'editPendingResend':
        onEditPendingResend();
        break;
      case 'inspectSelected':
        onInspectSelected();
        break;
      case 'loadComposerLibraryRequest':
        onLoadComposerLibraryRequest();
        break;
      case 'moveFilterOption':
        onMoveFilterOption(action.direction);
        break;
      case 'moveDetailMatch':
        onMoveDetailMatch(action.direction);
        break;
      case 'moveSelection':
        onMoveSelection(action.direction);
        break;
      case 'moveListDisplayFocus':
        onMoveListDisplayFocus(action.direction);
        break;
      case 'moveComposerCursor':
        onMoveComposerCursor(action.direction);
        break;
      case 'moveComposerCursorTo':
        onMoveComposerCursorTo(action.boundary);
        break;
      case 'moveComposerHorizontal':
        onMoveComposerHorizontal(action.direction);
        break;
      case 'moveComposerLibrary':
        onMoveComposerLibrary(action.direction);
        break;
      case 'moveSelectionTo':
        onMoveSelectionTo(action.boundary);
        break;
      case 'openFilter':
        onOpenFilter(action.focus);
        break;
      case 'openDetailModal':
        onOpenDetailModal();
        break;
      case 'openDetailSearch':
        onOpenDetailSearch();
        break;
      case 'openComposer':
        onOpenComposer(action.mode);
        break;
      case 'openComposerBodyEditor':
        onOpenComposerBodyEditor();
        break;
      case 'openComposerLibrary':
        onOpenComposerLibrary();
        break;
      case 'openCommandPrompt':
        onOpenCommandPrompt();
        break;
      case 'openHelp':
        onOpenHelp();
        break;
      case 'openListDisplay':
        onOpenListDisplay();
        break;
      case 'previewComposerSend':
        onPreviewComposerSend();
        break;
      case 'quit':
        onQuit();
        break;
      case 'saveComposerRequest':
        onSaveComposerRequest();
        break;
      case 'resetListDisplay':
        onResetListDisplay();
        break;
      case 'scrollDetails':
        onScrollDetails(action.direction);
        break;
      case 'scrollDetailsTo':
        onScrollDetailsTo(action.boundary);
        break;
      case 'sendComposer':
        onSendComposer();
        break;
      case 'sendResend':
        onSendResend();
        break;
      case 'selectComposerTab':
        onSelectComposerTab(action.tab);
        break;
      case 'showCommandHint':
        onShowCommandHint(action.message);
        break;
      case 'startExport':
        onStartExport(action.action);
        break;
      case 'startResend':
        onStartResend(action.mode);
        break;
      case 'submitCommand':
        onSubmitCommand();
        break;
      case 'stopRecording':
        onStopRecording();
        break;
      case 'toggleDetailTab':
        onToggleDetailTab();
        break;
      case 'toggleComposerField':
        onToggleComposerField();
        break;
      case 'toggleComposerReveal':
        onToggleComposerReveal();
        break;
      case 'toggleDetailNode':
        onToggleDetailNode();
        break;
      case 'toggleFilterOption':
        onToggleFilterOption();
        break;
      case 'toggleFrameworkAssets':
        onToggleFrameworkAssets();
        break;
      case 'toggleListDisplayColumn':
        onToggleListDisplayColumn();
        break;
      case 'toggleFocus':
        onToggleFocus();
        break;
      case 'togglePause':
        onTogglePause();
        break;
      case 'toggleRecordingPause':
        onToggleRecordingPause();
        break;
      default:
        break;
    }
  });

  return null;
}
