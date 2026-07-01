import { useInput } from 'ink';
import { isInkMouseInput, parseInkMouseInput } from './mouse.js';
import {
  COMMAND_MODAL_ROW_COUNT,
  TRAFFIC_LIST_WIDTH
} from './shared.js';
import { getPageStep } from './detail.js';
import { getMouseWheelTarget } from './traffic.js';
import {
  DEFAULT_KEY_BINDINGS,
  getInputKeyTokens,
  matchesKeyBinding,
  normalizeKeyBindings
} from './key-bindings.js';

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
    name: 'next-page',
    aliases: ['np'],
    description: 'open next-page request',
    action: { type: 'openNextPage' }
  },
  {
    name: 'send-next-page',
    aliases: ['snp'],
    description: 'send next-page request',
    action: { type: 'sendNextPage' }
  },
  {
    name: 'requests',
    aliases: ['sent', 'rq'],
    description: 'open sent requests',
    action: { type: 'openRequestActivity' }
  },
  {
    name: 'endpoints',
    aliases: ['ep', 'endpoint-groups'],
    description: 'open endpoint groups',
    action: { type: 'openEndpointGroups' }
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

const COMMAND_HINTS_BY_ACTION = new Map([
  ['main.hintQuit', 'use :quit'],
  ['main.hintResend', 'use :resend'],
  ['main.hintRecord', 'use :record'],
  ['main.hintStopRecording', 'use :stop-recording'],
  ['main.hintPause', 'use :pause-capture'],
  ['main.hintClear', 'use :clear-logs'],
  ['detail.hintResend', 'use :resend']
]);

const COMPOSER_TAB_ACTIONS = [
  ['composer.selectTab.params', 'params'],
  ['composer.selectTab.headers', 'headers'],
  ['composer.selectTab.body', 'body'],
  ['composer.selectTab.auth', 'auth'],
  ['composer.selectTab.cookies', 'cookies'],
  ['composer.selectTab.env', 'env'],
  ['composer.selectTab.save', 'save']
];

const COMPOSER_LIBRARY_TAB_ACTIONS = [
  ['composerLibrary.selectTab.params', 'params'],
  ['composerLibrary.selectTab.headers', 'headers'],
  ['composerLibrary.selectTab.body', 'body'],
  ['composerLibrary.selectTab.auth', 'auth'],
  ['composerLibrary.selectTab.cookies', 'cookies'],
  ['composerLibrary.selectTab.env', 'env'],
  ['composerLibrary.selectTab.save', 'save']
];

const TEXT_ENTRY_CONTROL_BLOCKLIST = new Set(['ctrl-?', 'ctrl-h']);

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

function getCommandAvailability(command, commandContext = null) {
  return commandContext?.availability?.[command.name] ?? { available: true, reason: '' };
}

function isCommandAvailable(command, commandContext = null) {
  return getCommandAvailability(command, commandContext).available !== false;
}

function getCommandUnavailableError(command, commandContext = null) {
  const reason = getCommandAvailability(command, commandContext).reason || 'not available';

  return `${command.name} unavailable: ${reason}`;
}

export function getCommandMatches(input = '', commandContext = null) {
  const value = normalizeCommandInput(input);
  const availableCommands = COMMAND_DEFINITIONS.filter((command) => (
    isCommandAvailable(command, commandContext)
  ));

  if (!value) {
    return availableCommands;
  }

  return availableCommands.filter((command) => (
    getCommandLabels(command).some((label) => label.startsWith(value))
  ));
}

export function getCommandSuggestionIndex(input = '', currentIndex = -1, direction = 1, commandContext = null) {
  const matches = getCommandMatches(input, commandContext);

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

export function getCommandSuggestionRows(input = '', selectedIndex = -1, rowCount = COMMAND_MODAL_ROW_COUNT, commandContext = null) {
  const safeRowCount = typeof rowCount === 'number' ? rowCount : COMMAND_MODAL_ROW_COUNT;
  const safeCommandContext = typeof rowCount === 'number' ? commandContext : rowCount;
  const matches = getCommandMatches(input, safeCommandContext);
  const safeSelectedIndex = selectedIndex >= 0 && matches.length > 0
    ? selectedIndex % matches.length
    : -1;
  const maxStartIndex = Math.max(0, matches.length - safeRowCount);
  const visibleStartIndex = safeSelectedIndex >= 0
    ? Math.min(Math.max(0, safeSelectedIndex - safeRowCount + 1), maxStartIndex)
    : 0;
  const visibleMatches = matches.slice(visibleStartIndex, visibleStartIndex + safeRowCount);
  const rows = visibleMatches.map((command, index) => ({
    aliases: command.aliases?.length ? command.aliases.join(', ') : '',
    command,
    description: command.description,
    isSelected: visibleStartIndex + index === safeSelectedIndex,
    name: command.name,
    primaryAlias: getCompactCommandAlias(command)
  }));

  while (rows.length < safeRowCount) {
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

function getCommandHintForAction(actionId) {
  return COMMAND_HINTS_BY_ACTION.get(actionId) ?? null;
}

function resolveActiveKeyBindings(keyBindings) {
  if (!keyBindings) {
    return DEFAULT_KEY_BINDINGS;
  }
  if (keyBindings.bindings) {
    return keyBindings.bindings;
  }
  return normalizeKeyBindings({ keyBindings }).bindings;
}

function getMatchedComposerTab(input, key, bindings, actions) {
  const matchedAction = actions.find(([actionId]) => matchesKeyBinding(input, key, bindings, actionId));
  return matchedAction?.[1] ?? null;
}

function isTextEntryContext({
  diffFilterFocus = 'query',
  filterFocus = 'query',
  isCommandOpen = false,
  isComposerBodyEditorOpen = false,
  isComposerConfirmOpen = false,
  isComposerLibraryOpen = false,
  isComposerOpen = false,
  isComposerTextFocused = false,
  isDetailSearchOpen = false,
  isDiffFilterOpen = false,
  isFilterOpen = false
} = {}) {
  return Boolean(
    isCommandOpen
      || isDetailSearchOpen
      || (isFilterOpen && filterFocus === 'query')
      || (isDiffFilterOpen && diffFilterFocus === 'query')
      || (isComposerOpen && (
        isComposerBodyEditorOpen
          || (isComposerTextFocused && !isComposerConfirmOpen && !isComposerLibraryOpen)
      ))
  );
}

export function resolveCommandInput(input = '', selectedIndex = -1, commandContext = null) {
  const value = normalizeCommandInput(input);

  if (!value) {
    const matches = getCommandMatches(value, commandContext);

    if (selectedIndex >= 0 && matches.length > 0) {
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
      error: 'command required'
    };
  }

  const exactCommand = COMMAND_DEFINITIONS.find((command) => (
    getCommandLabels(command).includes(value)
  ));

  if (exactCommand) {
    if (!isCommandAvailable(exactCommand, commandContext)) {
      return {
        ok: false,
        error: getCommandUnavailableError(exactCommand, commandContext)
      };
    }

    return {
      ok: true,
      action: cloneCommandAction(exactCommand),
      command: exactCommand
    };
  }

  const matches = getCommandMatches(value, commandContext);

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
    diffFilterFocus = 'query',
    filterFocus = 'query',
    isListFocused = true,
    isHelpOpen = false,
    isListDisplayOpen = false,
    isEndpointGroupsOpen = false,
    isRequestActivityOpen = false,
    isDiffOpen = false,
    isDiffFilterOpen = false,
    isDiffValueOpen = false,
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
    diffPageSize = 1,
    diffValuePageSize = 1,
    endpointGroupsPageSize = 1,
    detailPageSize = 1,
    keyBindings: configuredKeyBindings,
    showTrafficPane = true,
    trafficPageSize = 1,
    trafficPaneWidth = TRAFFIC_LIST_WIDTH
  } = options;
  const value = input ?? '';
  const keyState = key ?? {};
  const keyBindings = resolveActiveKeyBindings(configuredKeyBindings);
  const matches = (actionId) => matchesKeyBinding(value, keyState, keyBindings, actionId);
  const pressedTokens = getInputKeyTokens(value, keyState);
  const matchesControlBinding = (actionId) => {
    const activeBindings = keyBindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];

    return pressedTokens.some((token) => (
      token.startsWith('ctrl-')
        && !TEXT_ENTRY_CONTROL_BLOCKLIST.has(token)
        && activeBindings.includes(token)
    ));
  };
  const textEntryContext = isTextEntryContext({
    diffFilterFocus,
    filterFocus,
    isCommandOpen,
    isComposerBodyEditorOpen,
    isComposerConfirmOpen,
    isComposerLibraryOpen,
    isComposerOpen,
    isComposerTextFocused,
    isDetailSearchOpen,
    isDiffFilterOpen,
    isFilterOpen
  });
  const textEntryControlShortcutsEnabled = textEntryContext && !isCommandOpen;

  if (matches('global.quit')) {
    return { type: 'quit' };
  }

  if (!textEntryContext || (textEntryControlShortcutsEnabled && matchesControlBinding('global.openCommandPrompt'))) {
    if (matches('global.openCommandPrompt')) {
      return { type: 'openCommandPrompt' };
    }
  }

  if (!textEntryContext || (textEntryControlShortcutsEnabled && matchesControlBinding('main.openHelp'))) {
    if (matches('main.openHelp')) {
      return isHelpOpen ? { type: 'closeHelp' } : { type: 'openHelp' };
    }
  }

  if (isCommandOpen) {
    if (matches('command.close')) {
      return { type: 'closeCommandPrompt' };
    }

    if (matches('command.submit')) {
      return { type: 'submitCommand' };
    }

    if (matches('command.delete')) {
      return { type: 'backspaceCommandText' };
    }

    if (matches('command.nextSuggestion')) {
      return { type: 'cycleCommandSuggestion', direction: 1 };
    }

    if (matches('command.previousSuggestion')) {
      return { type: 'cycleCommandSuggestion', direction: -1 };
    }

    if (value && !keyState.ctrl && !keyState.meta && !parseInkMouseInput(value) && !isInkMouseInput(value)) {
      return { type: 'appendCommandText', value };
    }

    return { type: 'none' };
  }

  if (isExportPromptOpen) {
    if (matches('export.cancel')) {
      return { type: 'cancelExport' };
    }

    if (matches('export.masked')) {
      return { type: 'finishExport', secretPolicy: 'masked' };
    }

    if (matches('export.raw')) {
      return { type: 'finishExport', secretPolicy: 'raw' };
    }

    return { type: 'none' };
  }

  if (isHelpOpen) {
    if (matches('help.close')) {
      return { type: 'closeHelp' };
    }

    return { type: 'none' };
  }

  if (isListDisplayOpen) {
    if (matches('listDisplay.close')) {
      return { type: 'closeListDisplay' };
    }

    if (matches('listDisplay.moveUp')) {
      return { type: 'moveListDisplayFocus', direction: -1 };
    }

    if (matches('listDisplay.moveDown')) {
      return { type: 'moveListDisplayFocus', direction: 1 };
    }

    if (matches('listDisplay.previousOption')) {
      return { type: 'cycleListDisplayOption', direction: -1 };
    }

    if (matches('listDisplay.nextOption')) {
      return { type: 'cycleListDisplayOption', direction: 1 };
    }

    if (matches('listDisplay.toggleOption')) {
      return { type: 'toggleListDisplayColumn' };
    }

    if (matches('listDisplay.reset')) {
      return { type: 'resetListDisplay' };
    }

    return { type: 'none' };
  }

  if (isEndpointGroupsOpen) {
    if (matches('endpointGroups.close')) {
      return { type: 'closeEndpointGroups' };
    }

    if (matches('endpointGroups.moveUp')) {
      return { type: 'moveEndpointGroup', direction: -1 };
    }

    if (matches('endpointGroups.moveDown')) {
      return { type: 'moveEndpointGroup', direction: 1 };
    }

    if (matches('endpointGroups.pageUp')) {
      return { type: 'moveEndpointGroup', direction: -getPageStep(endpointGroupsPageSize) };
    }

    if (matches('endpointGroups.pageDown')) {
      return { type: 'moveEndpointGroup', direction: getPageStep(endpointGroupsPageSize) };
    }

    if (matches('endpointGroups.top')) {
      return { type: 'moveEndpointGroupTo', boundary: 'top' };
    }

    if (matches('endpointGroups.bottom')) {
      return { type: 'moveEndpointGroupTo', boundary: 'bottom' };
    }

    return { type: 'none' };
  }

  if (isDiffFilterOpen) {
    if (matches('filter.close')) {
      return { type: 'finishDiffFilter' };
    }

    if (matches('filter.clear')) {
      return { type: 'clearDiffFilter' };
    }

    if (matches('filter.nextField')) {
      return { type: 'cycleDiffFilterFocus', direction: 1 };
    }

    if (matches('filter.previousField')) {
      return { type: 'cycleDiffFilterFocus', direction: -1 };
    }

    if (matches('filter.nextOption')) {
      return { type: 'moveDiffFilterOption', direction: 1 };
    }

    if (matches('filter.previousOption')) {
      return { type: 'moveDiffFilterOption', direction: -1 };
    }

    if (matches('filter.toggleOption') && diffFilterFocus !== 'query') {
      return { type: 'toggleDiffFilterOption' };
    }

    if (matches('filter.delete') || matches('filter.backspace')) {
      return diffFilterFocus === 'query'
        ? { type: 'backspaceDiffFilter' }
        : { type: 'none' };
    }

    if (value && !keyState.ctrl && !keyState.meta && diffFilterFocus === 'query' && !parseInkMouseInput(value) && !isInkMouseInput(value)) {
      return { type: 'appendDiffFilter', value };
    }

    return { type: 'none' };
  }

  if (isDiffValueOpen) {
    if (matches('diffValue.close')) {
      return { type: 'closeDiffValue' };
    }

    if (matches('diffValue.scrollDown')) {
      return { type: 'moveDiffValueScroll', direction: 1 };
    }

    if (matches('diffValue.scrollUp')) {
      return { type: 'moveDiffValueScroll', direction: -1 };
    }

    if (matches('diffValue.pageDown')) {
      return { type: 'moveDiffValueScroll', direction: getPageStep(diffValuePageSize) };
    }

    if (matches('diffValue.pageUp')) {
      return { type: 'moveDiffValueScroll', direction: -getPageStep(diffValuePageSize) };
    }

    if (matches('diffValue.top')) {
      return { type: 'moveDiffValueScrollTo', boundary: 'top' };
    }

    if (matches('diffValue.bottom')) {
      return { type: 'moveDiffValueScrollTo', boundary: 'bottom' };
    }

    return { type: 'none' };
  }

  if (isDiffOpen) {
    if (matches('diff.openFilter')) {
      return { type: 'openDiffFilter' };
    }

    if (matches('diff.openFocusedRow')) {
      return { type: 'openDiffValue' };
    }

    if (matches('main.clearDiffBase')) {
      return { type: 'clearDiffBase' };
    }

    if (matches('diff.close')) {
      return { type: 'closeDiff' };
    }

    if (matches('diff.nextChange')) {
      return { type: 'moveDiffFocus', direction: 1 };
    }

    if (matches('diff.previousChange')) {
      return { type: 'moveDiffFocus', direction: -1 };
    }

    if (matches('diff.pageDown')) {
      return { type: 'moveDiffFocus', direction: getPageStep(diffPageSize) };
    }

    if (matches('diff.pageUp')) {
      return { type: 'moveDiffFocus', direction: -getPageStep(diffPageSize) };
    }

    if (matches('diff.top')) {
      return { type: 'moveDiffFocusTo', boundary: 'top' };
    }

    if (matches('diff.bottom')) {
      return { type: 'moveDiffFocusTo', boundary: 'bottom' };
    }

    if (matches('diff.toggleLayout')) {
      return { type: 'toggleDiffLayout' };
    }

    return { type: 'none' };
  }

  if (isRequestActivityOpen) {
    if (matches('global.openCommandPrompt')) {
      return { type: 'openCommandPrompt' };
    }

    if (matches('help.close')) {
      return { type: 'closeRequestActivity' };
    }

    if (matches('main.inspect')) {
      return { type: 'inspectRequestActivity' };
    }

    if (matches('main.moveUp')) {
      return { type: 'moveRequestActivity', direction: -1 };
    }

    if (matches('main.moveDown')) {
      return { type: 'moveRequestActivity', direction: 1 };
    }

    if (matches('main.pageUp')) {
      return { type: 'moveRequestActivity', direction: -getPageStep(trafficPageSize) };
    }

    if (matches('main.pageDown')) {
      return { type: 'moveRequestActivity', direction: getPageStep(trafficPageSize) };
    }

    if (matches('main.top')) {
      return { type: 'moveRequestActivityTo', boundary: 'first' };
    }

    if (matches('main.bottom')) {
      return { type: 'moveRequestActivityTo', boundary: 'last' };
    }

    return { type: 'none' };
  }

  if (isResendConfirmOpen) {
    if (isResending) {
      return { type: 'none' };
    }

    if (matches('resend.confirm')) {
      return { type: 'sendResend' };
    }

    if (matches('resend.edit')) {
      return { type: 'editPendingResend' };
    }

    if (matches('resend.cancel')) {
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
      if (matches('composerConfirm.confirm')) {
        return { type: 'sendComposer' };
      }

      if (matches('composerConfirm.cancel')) {
        return { type: 'closeComposerPreview' };
      }

      return { type: 'none' };
    }

    if (isComposerLibraryOpen) {
      const shortcutTab = getMatchedComposerTab(value, keyState, keyBindings, COMPOSER_LIBRARY_TAB_ACTIONS);

      if (shortcutTab) {
        return { type: 'selectComposerTab', tab: shortcutTab };
      }

      if (matches('composerLibrary.close')) {
        return { type: 'closeComposerLibrary' };
      }

      if (matches('composerLibrary.open')) {
        return { type: 'loadComposerLibraryRequest' };
      }

      if (matches('composerLibrary.moveUp')) {
        return { type: 'moveComposerLibrary', direction: -1 };
      }

      if (matches('composerLibrary.moveDown')) {
        return { type: 'moveComposerLibrary', direction: 1 };
      }

      return { type: 'none' };
    }

    if (isComposerBodyEditorOpen) {
      if (matches('composerBody.close')) {
        return { type: 'closeComposerBodyEditor' };
      }

      if (matches('composerBody.newline')) {
        return { type: 'insertComposerText', value: '\n' };
      }

      if (matches('composerBody.delete')) {
        return { type: 'deleteComposerText' };
      }

      if (matches('composerBody.backspace')) {
        return { type: 'backspaceComposerText' };
      }

      if (matches('composerBody.cursorLeft')) {
        return { type: 'moveComposerCursor', direction: -1 };
      }

      if (matches('composerBody.cursorRight')) {
        return { type: 'moveComposerCursor', direction: 1 };
      }

      if (matches('composerBody.cursorStart')) {
        return { type: 'moveComposerCursorTo', boundary: 'start' };
      }

      if (matches('composerBody.cursorEnd')) {
        return { type: 'moveComposerCursorTo', boundary: 'end' };
      }

      if (value && !keyState.ctrl && !keyState.meta) {
        return { type: 'insertComposerText', value };
      }

      return { type: 'none' };
    }

    if (matches('composer.close')) {
      return { type: 'closeComposer' };
    }

    if (matches('composer.preview')) {
      return { type: 'previewComposerSend' };
    }

    if (matches('composer.previousTab')) {
      return { type: 'cycleComposerTab', direction: -1 };
    }

    if (matches('composer.nextTab')) {
      return { type: 'cycleComposerTab', direction: 1 };
    }

    const shortcutTab = !isComposerTextFocused
      ? getMatchedComposerTab(value, keyState, keyBindings, COMPOSER_TAB_ACTIONS)
      : null;

    if (shortcutTab) {
      return { type: 'selectComposerTab', tab: shortcutTab };
    }

    if (matches('composer.previousField')) {
      return { type: 'cycleComposerFocus', direction: -1 };
    }

    if (matches('composer.nextField')) {
      return { type: 'cycleComposerFocus', direction: 1 };
    }

    if (!isComposerTextFocused && matches('composer.addRow')) {
      return { type: 'addComposerRow' };
    }

    if (!isComposerTextFocused && matches('composer.deleteRow')) {
      return { type: 'deleteComposerRow' };
    }

    if (!isComposerTextFocused && matches('composer.toggleField')) {
      return { type: 'toggleComposerField' };
    }

    if (!isComposerTextFocused && matches('composer.save')) {
      return { type: 'saveComposerRequest' };
    }

    if (!isComposerTextFocused && matches('composer.openLibrary')) {
      return { type: 'openComposerLibrary' };
    }

    if (!isComposerTextFocused && matches('composer.revealSecrets')) {
      return { type: 'toggleComposerReveal' };
    }

    if (!isComposerTextFocused && matches('composer.openBodyEditor')) {
      return { type: 'openComposerBodyEditor' };
    }

    if (matches('composer.previousOption')) {
      return { type: 'moveComposerHorizontal', direction: -1 };
    }

    if (matches('composer.nextOption')) {
      return { type: 'moveComposerHorizontal', direction: 1 };
    }

    if (matches('composer.cursorStart')) {
      return { type: 'moveComposerCursorTo', boundary: 'start' };
    }

    if (matches('composer.cursorEnd')) {
      return { type: 'moveComposerCursorTo', boundary: 'end' };
    }

    if (matches('composer.delete')) {
      return { type: 'deleteComposerText' };
    }

    if (matches('composer.backspace')) {
      return { type: 'backspaceComposerText' };
    }

    if (value && !keyState.ctrl && !keyState.meta) {
      return { type: 'insertComposerText', value };
    }

    return { type: 'none' };
  }

  if (isDetailSearchOpen) {
    if (matches('detailSearch.close')) {
      return { type: 'finishDetailSearch' };
    }

    if (matches('detailSearch.delete') || matches('detailSearch.backspace')) {
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

  if (matches('main.toggleFrameworkAssets') && !isFilterOpen) {
    return { type: 'toggleFrameworkAssets' };
  }

  if (isDetailModalOpen) {
    if (matches('detail.close')) {
      return { type: 'closeDetailModal' };
    }

    if (matches('detail.copy')) {
      return { type: 'startExport', action: 'copy' };
    }

    if (matches('detail.download')) {
      return { type: 'startExport', action: 'download' };
    }

    if (matches('main.markDiffBase')) {
      return { type: 'markDiffBase' };
    }

    if (matches('main.clearDiffBase')) {
      return { type: 'clearDiffBase' };
    }

    if (matches('main.openDiff')) {
      return { type: 'openDiff' };
    }

    if (matches('detail.openSearch')) {
      return { type: 'openDetailSearch' };
    }

    if (matches('detail.hintResend')) {
      return { type: 'showCommandHint', message: getCommandHintForAction('detail.hintResend') };
    }

    if (matches('detail.editRequest') && isLiveMode) {
      return { type: 'openComposer', mode: 'edit-resend' };
    }

    if (matches('detail.nextMatch')) {
      return { type: 'moveDetailMatch', direction: 1 };
    }

    if (matches('detail.previousMatch')) {
      return { type: 'moveDetailMatch', direction: -1 };
    }

    if (matches('detail.toggleTab')) {
      return { type: 'toggleDetailTab' };
    }

    if (matches('detail.toggleNode')) {
      return { type: 'toggleDetailNode' };
    }

    if (matches('detail.scrollUp')) {
      return { type: 'scrollDetails', direction: -1 };
    }

    if (matches('detail.scrollDown')) {
      return { type: 'scrollDetails', direction: 1 };
    }

    if (matches('detail.pageUp')) {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
    }

    if (matches('detail.pageDown')) {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
    }

    if (matches('detail.halfPageUp')) {
      return { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
    }

    if (matches('detail.halfPageDown')) {
      return { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
    }

    if (matches('detail.top')) {
      return { type: 'scrollDetailsTo', boundary: 'top' };
    }

    if (matches('detail.bottom')) {
      return { type: 'scrollDetailsTo', boundary: 'bottom' };
    }

    return { type: 'none' };
  }

  if (isFilterOpen) {
    if (matches('filter.close')) {
      return { type: 'finishSearch' };
    }

    if (matches('filter.clear')) {
      return { type: 'clearFilters' };
    }

    if (matches('filter.nextField')) {
      return { type: 'cycleFilterFocus', direction: 1 };
    }

    if (matches('filter.previousField')) {
      return { type: 'cycleFilterFocus', direction: -1 };
    }

    if (matches('filter.nextOption')) {
      return { type: 'moveFilterOption', direction: 1 };
    }

    if (matches('filter.previousOption')) {
      return { type: 'moveFilterOption', direction: -1 };
    }

    if (matches('filter.toggleOption') && filterFocus !== 'query') {
      return { type: 'toggleFilterOption' };
    }

    if (matches('filter.delete') || matches('filter.backspace')) {
      return filterFocus === 'query'
        ? { type: 'backspaceSearch' }
        : { type: 'none' };
    }

    if (value && !keyState.ctrl && !keyState.meta && filterFocus === 'query') {
      return { type: 'appendSearch', value };
    }

    return { type: 'none' };
  }

  if (matches('main.openHelp')) {
    return { type: 'openHelp' };
  }

  if (matches('main.openListDisplay')) {
    return { type: 'openListDisplay' };
  }

  if (matches('main.cyclePathDisplay')) {
    return { type: 'cycleTrafficPathMode', direction: 1 };
  }

  if (matches('main.cycleDensity')) {
    return { type: 'cycleTrafficDensity', direction: 1 };
  }

  if (matches('main.cyclePaneWidth')) {
    return { type: 'cyclePaneWidthMode', direction: 1 };
  }

  if (matches('main.copy')) {
    return { type: 'startExport', action: 'copy' };
  }

  if (matches('main.download')) {
    return { type: 'startExport', action: 'download' };
  }

  if (matches('main.markDiffBase')) {
    return { type: 'markDiffBase' };
  }

  if (matches('main.clearDiffBase')) {
    return { type: 'clearDiffBase' };
  }

  if (matches('main.openDiff')) {
    return { type: 'openDiff' };
  }

  if (matches('main.openComposer') && isLiveMode && isListFocused) {
    return { type: 'openComposer', mode: 'blank' };
  }

  if (matches('main.hintResend')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintResend') };
  }

  if (matches('main.editRequest') && isLiveMode) {
    return { type: 'openComposer', mode: 'edit-resend' };
  }

  if (matches('main.openLibrary') && isLiveMode) {
    return { type: 'openComposerLibrary' };
  }

  if (matches('main.hintQuit')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintQuit') };
  }

  if (matches('main.openSearch')) {
    return isListFocused
      ? { type: 'openFilter', focus: 'query' }
      : { type: 'openDetailSearch' };
  }

  if (matches('main.clearFilter')) {
    return { type: 'clearFilters' };
  }

  if (matches('main.hintClear')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintClear') };
  }

  if (matches('main.followLatest')) {
    return { type: 'followLatest' };
  }

  if (matches('main.openDetailModal')) {
    return { type: 'openDetailModal' };
  }

  if (matches('main.inspect')) {
    return isListFocused ? { type: 'inspectSelected' } : { type: 'toggleDetailNode' };
  }

  if (matches('main.methodFilter')) {
    return { type: 'openFilter', focus: 'method' };
  }

  if (matches('main.hintPause')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintPause') };
  }

  if (matches('main.hintRecord')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintRecord') };
  }

  if (matches('main.hintStopRecording')) {
    return { type: 'showCommandHint', message: getCommandHintForAction('main.hintStopRecording') };
  }

  if (matches('main.toggleDetailTab')) {
    return { type: 'toggleDetailTab' };
  }

  if (matches('main.statusFilter')) {
    return { type: 'openFilter', focus: 'status' };
  }

  if (matches('main.nextMatch') && !isListFocused) {
    return { type: 'moveDetailMatch', direction: 1 };
  }

  if (matches('main.previousMatch') && !isListFocused) {
    return { type: 'moveDetailMatch', direction: -1 };
  }

  if (matches('main.toggleFocus')) {
    return { type: 'toggleFocus' };
  }

  if (matches('main.moveUp')) {
    return isListFocused
      ? { type: 'moveSelection', direction: -1 }
      : { type: 'scrollDetails', direction: -1 };
  }

  if (matches('main.moveDown')) {
    return isListFocused
      ? { type: 'moveSelection', direction: 1 }
      : { type: 'scrollDetails', direction: 1 };
  }

  if (matches('main.pageUp')) {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize) };
  }

  if (matches('main.pageDown')) {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize) }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize) };
  }

  if (matches('main.halfPageUp')) {
    return isListFocused
      ? { type: 'moveSelection', direction: -getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: -getPageStep(detailPageSize, 'half') };
  }

  if (matches('main.halfPageDown')) {
    return isListFocused
      ? { type: 'moveSelection', direction: getPageStep(trafficPageSize, 'half') }
      : { type: 'scrollDetails', direction: getPageStep(detailPageSize, 'half') };
  }

  if (matches('main.top')) {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'first' }
      : { type: 'scrollDetailsTo', boundary: 'top' };
  }

  if (matches('main.bottom')) {
    return isListFocused
      ? { type: 'moveSelectionTo', boundary: 'last' }
      : { type: 'scrollDetailsTo', boundary: 'bottom' };
  }

  return { type: 'none' };
}

export function KeyboardControls({
  diffFilterFocus,
  filterFocus,
  isListFocused,
  isHelpOpen,
  isListDisplayOpen,
  isEndpointGroupsOpen,
  isRequestActivityOpen,
  isDiffOpen,
  isDiffFilterOpen,
  isDiffValueOpen,
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
  diffPageSize,
  diffValuePageSize,
  endpointGroupsPageSize,
  detailPageSize,
  keyBindings,
  showTrafficPane,
  trafficPaneWidth,
  trafficPageSize,
  onAddComposerRow,
  onAppendCommandText,
  onAppendSearch,
  onAppendDiffFilter,
  onAppendDetailSearch,
  onBackspaceCommandText,
  onBackspaceComposerText,
  onBackspaceSearch,
  onBackspaceDiffFilter,
  onBackspaceDetailSearch,
  onCancelExport,
  onCancelResend,
  onCloseComposerBodyEditor,
  onCloseComposerLibrary,
  onCloseComposerPreview,
  onClearFilters,
  onClearDiffFilter,
  onClearDiffBase,
  onClearLogs,
  onCloseDetailModal,
  onCloseRequestActivity,
  onCloseComposer,
  onCloseCommandPrompt,
  onCloseDiff,
  onCloseDiffValue,
  onCloseEndpointGroups,
  onCloseHelp,
  onCloseListDisplay,
  onCycleComposerFocus,
  onCycleComposerTab,
  onCycleCommandSuggestion,
  onCycleDiffFilterFocus,
  onDeleteComposerRow,
  onDeleteComposerText,
  onCycleFilterFocus,
  onCycleListDisplayOption,
  onCyclePaneWidthMode,
  onCycleTrafficDensity,
  onCycleTrafficPathMode,
  onFinishExport,
  onFinishDetailSearch,
  onFinishDiffFilter,
  onFinishSearch,
  onFollowLatest,
  onInsertComposerText,
  onEditPendingResend,
  onInspectSelected,
  onLoadComposerLibraryRequest,
  onMoveDetailMatch,
  onMoveDiffFilterOption,
  onMoveDiffFocus,
  onMoveDiffFocusTo,
  onMoveDiffValueScroll,
  onMoveDiffValueScrollTo,
  onMoveEndpointGroup,
  onMoveEndpointGroupTo,
  onMoveSelectionTo,
  onMoveFilterOption,
  onMoveSelection,
  onMoveListDisplayFocus,
  onMoveRequestActivity,
  onMoveRequestActivityTo,
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
  onOpenDiff,
  onOpenDiffFilter,
  onOpenDiffValue,
  onOpenFilter,
  onOpenHelp,
  onOpenListDisplay,
  onInspectRequestActivity,
  onMarkDiffBase,
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
  onToggleDiffLayout,
  onToggleDiffFilterOption,
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
      diffFilterFocus,
      isListFocused,
      isHelpOpen,
      isListDisplayOpen,
      isEndpointGroupsOpen,
      isRequestActivityOpen,
      isDiffOpen,
      isDiffFilterOpen,
      isDiffValueOpen,
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
      diffPageSize,
      diffValuePageSize,
      endpointGroupsPageSize,
      detailPageSize,
      keyBindings,
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
      case 'appendDiffFilter':
        onAppendDiffFilter(action.value);
        break;
      case 'appendDetailSearch':
        onAppendDetailSearch(action.value);
        break;
      case 'backspaceSearch':
        onBackspaceSearch();
        break;
      case 'backspaceDiffFilter':
        onBackspaceDiffFilter();
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
      case 'clearDiffFilter':
        onClearDiffFilter();
        break;
      case 'clearDiffBase':
        onClearDiffBase();
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
      case 'closeDiff':
        onCloseDiff();
        break;
      case 'closeDiffValue':
        onCloseDiffValue();
        break;
      case 'closeEndpointGroups':
        onCloseEndpointGroups();
        break;
      case 'closeHelp':
        onCloseHelp();
        break;
      case 'closeListDisplay':
        onCloseListDisplay();
        break;
      case 'closeRequestActivity':
        onCloseRequestActivity();
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
      case 'cycleDiffFilterFocus':
        onCycleDiffFilterFocus(action.direction);
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
      case 'finishDiffFilter':
        onFinishDiffFilter();
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
      case 'markDiffBase':
        onMarkDiffBase();
        break;
      case 'moveFilterOption':
        onMoveFilterOption(action.direction);
        break;
      case 'moveDetailMatch':
        onMoveDetailMatch(action.direction);
        break;
      case 'moveDiffFilterOption':
        onMoveDiffFilterOption(action.direction);
        break;
      case 'moveDiffFocus':
        onMoveDiffFocus(action.direction);
        break;
      case 'moveDiffFocusTo':
        onMoveDiffFocusTo(action.boundary);
        break;
      case 'moveDiffValueScroll':
        onMoveDiffValueScroll(action.direction);
        break;
      case 'moveDiffValueScrollTo':
        onMoveDiffValueScrollTo(action.boundary);
        break;
      case 'moveEndpointGroup':
        onMoveEndpointGroup(action.direction);
        break;
      case 'moveEndpointGroupTo':
        onMoveEndpointGroupTo(action.boundary);
        break;
      case 'moveSelection':
        onMoveSelection(action.direction);
        break;
      case 'moveListDisplayFocus':
        onMoveListDisplayFocus(action.direction);
        break;
      case 'moveRequestActivity':
        onMoveRequestActivity(action.direction);
        break;
      case 'moveRequestActivityTo':
        onMoveRequestActivityTo(action.boundary);
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
      case 'openDiff':
        onOpenDiff();
        break;
      case 'openDiffFilter':
        onOpenDiffFilter();
        break;
      case 'openDiffValue':
        onOpenDiffValue();
        break;
      case 'openHelp':
        onOpenHelp();
        break;
      case 'openListDisplay':
        onOpenListDisplay();
        break;
      case 'inspectRequestActivity':
        onInspectRequestActivity();
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
      case 'toggleDiffLayout':
        onToggleDiffLayout();
        break;
      case 'toggleDiffFilterOption':
        onToggleDiffFilterOption();
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
