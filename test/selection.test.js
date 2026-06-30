import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveFilters,
  analyzePagination,
  applyDetailMatches,
  classifyFrameworkAssetRequest,
  clampDetailRowIndex,
  clampScrollOffset,
  COMMAND_DEFINITIONS,
  createBlankComposerState,
  createComposerStateFromLog,
  createNextPageRequestDraftFromLog,
  DEFAULT_KEY_BINDINGS,
  cycleDetailWidthMode,
  cyclePaneWidthMode,
  cycleTrafficDensity,
  cycleTrafficPathMode,
  cycleTrafficWidthMode,
  cycleValue,
  ensureComposerActiveTabRows,
  extractPortFromHost,
  findDetailMatches,
  filterLogs,
  formatCommandSelectionStatus,
  formatFrameworkDetectionLabel,
  formatPaneWidthLabel,
  formatFooterText,
  formatFilterLabel,
  formatPathForMode,
  formatStructuredPayloadRows,
  formatRecordingLabel,
  formatTrafficHeader,
  formatTrafficRow,
  HELP_SECTIONS,
  getBoundaryLogId,
  getCommandHelpRows,
  getCommandHintForKey,
  getCommandMatches,
  getCommandSuggestionRows,
  getCommandSuggestionIndex,
  getComposerFieldDescriptors,
  getComposerSectionRows,
  getDetailVisibleCount,
  getDetailLines,
  getDetailRows,
  getHelpSections,
  getKeyboardAction,
  getMaxScrollOffset,
  getMouseWheelTarget,
  getNextDetailMatchIndex,
  getPageStep,
  getPaneLayout,
  getRenderHeight,
  getScrollOffsetForFocusedRow,
  getTrafficPaneWidth,
  getTrafficRowWidth,
  isFrameworkAssetRequest,
  parseDetailSearchQuery,
  getSelectedIndex,
  getSearchValues,
  getTrafficVisibleCount,
  moveSelectedLogId,
  normalizeKeyBindings,
  normalizeTrafficListDisplay,
  resolveCommandInput,
  resolveSelectedLogId,
  selectComposerTab,
  summarizeFrameworkAssets,
  toggleTrafficColumn,
  toggleFilterValue
} from '../src/ui/App.js';
import { CommandModal } from '../src/ui/chrome.js';

function getTestKeyBindings(overrides = {}) {
  return normalizeKeyBindings({ keyBindings: overrides }).bindings;
}

const logs = [
  { id: 'one' },
  { id: 'two' },
  { id: 'three' }
];

test('resolveSelectedLogId follows latest only when follow mode is enabled', () => {
  assert.equal(resolveSelectedLogId(logs, 'one', { followLatest: true }), 'three');
  assert.equal(resolveSelectedLogId([...logs, { id: 'four' }], 'two', { followLatest: false }), 'two');
});

test('resolveSelectedLogId holds stable selection across appended traffic', () => {
  const updatedLogs = [...logs, { id: 'four' }, { id: 'five' }];

  assert.equal(resolveSelectedLogId(updatedLogs, 'two'), 'two');
});

test('resolveSelectedLogId falls back to first surviving item when selected item was trimmed', () => {
  const trimmedLogs = [
    { id: 'three' },
    { id: 'four' },
    { id: 'five' }
  ];

  assert.equal(resolveSelectedLogId(trimmedLogs, 'two'), 'three');
});

test('moveSelectedLogId moves relative to stable selected id', () => {
  assert.equal(moveSelectedLogId(logs, 'two', -1), 'one');
  assert.equal(moveSelectedLogId(logs, 'two', 1), 'three');
  assert.equal(moveSelectedLogId(logs, 'three', 1), 'three');
  assert.equal(moveSelectedLogId(logs, 'one', -1), 'one');
  assert.equal(moveSelectedLogId(logs, 'one', getPageStep(20)), 'three');
  assert.equal(moveSelectedLogId(logs, 'three', -getPageStep(20)), 'one');
});

test('getSelectedIndex resolves missing selections to the first row', () => {
  assert.equal(getSelectedIndex(logs, 'two'), 1);
  assert.equal(getSelectedIndex(logs, 'missing'), 0);
  assert.equal(getSelectedIndex([], 'missing'), -1);
});

test('navigation helpers resolve page sizes and boundaries', () => {
  assert.equal(getTrafficVisibleCount(13, 40), 27);
  assert.equal(getTrafficVisibleCount(30, 20), 5);
  assert.equal(getDetailVisibleCount(13, 40), 27);
  assert.equal(getDetailVisibleCount(30, 20), 4);
  assert.equal(getPageStep(21), 21);
  assert.equal(getPageStep(21, 'half'), 10);
  assert.equal(getPageStep(1, 'half'), 1);
  assert.equal(getBoundaryLogId(logs, 'first'), 'one');
  assert.equal(getBoundaryLogId(logs, 'last'), 'three');
  assert.equal(getBoundaryLogId([], 'last'), null);
});

test('traffic list display helpers format path modes and density presets', () => {
  const log = {
    method: 'GET',
    path: '/api/orders/123?include=lineItems',
    responseTimeMs: 34,
    statusCode: 200,
    timestamp: Date.UTC(2026, 5, 30, 10, 15, 20)
  };
  const full = normalizeTrafficListDisplay();
  const compact = normalizeTrafficListDisplay({ density: 'compact' });
  const pathOnly = normalizeTrafficListDisplay({ density: 'path', pathMode: 'end' });
  const wide = normalizeTrafficListDisplay({ widthMode: 'wide' });
  const invalidWidth = normalizeTrafficListDisplay({ widthMode: 'huge' });
  const invalidTarget = normalizeTrafficListDisplay({ widthMode: 'wide', widthTarget: 'side' });
  const toggled = toggleTrafficColumn(full, 'time');
  const wideLayout = getPaneLayout({ widthMode: 'wide', widthTarget: 'traffic' }, 120);
  const detailWideLayout = getPaneLayout({ widthMode: 'wide', widthTarget: 'details' }, 120);
  const wideRowWidth = getTrafficRowWidth(wideLayout.trafficPaneWidth);

  assert.equal(formatPathForMode('/short', 12, 'smart'), '/short');
  assert.equal(formatPathForMode('/api/orders/123?include=lineItems', 14, 'start').startsWith('/api/orders'), true);
  assert.equal(formatPathForMode('/api/orders/123?include=lineItems', 14, 'end').endsWith('=lineItems'), true);
  assert.equal(formatPathForMode('/api/orders/123?include=lineItems', 14, 'smart').includes('...'), true);
  assert.equal(formatPathForMode('/abcdef', 3, 'smart'), '/ab');

  assert.equal(full.density, 'full');
  assert.equal(full.widthMode, 'normal');
  assert.equal(full.widthTarget, 'traffic');
  assert.equal(compact.columns.time, false);
  assert.equal(compact.columns.duration, false);
  assert.equal(pathOnly.columns.method, false);
  assert.equal(wide.widthMode, 'wide');
  assert.equal(wide.widthTarget, 'traffic');
  assert.equal(invalidWidth.widthMode, 'normal');
  assert.equal(invalidTarget.widthTarget, 'traffic');
  assert.equal(toggled.density, 'custom');
  assert.equal(cycleTrafficPathMode(full).pathMode, 'start');
  assert.equal(cycleTrafficDensity(toggled).density, 'full');
  assert.equal(cycleTrafficWidthMode(full).widthMode, 'half');
  assert.equal(cycleTrafficWidthMode(full).widthTarget, 'traffic');
  assert.equal(cycleTrafficWidthMode({ widthMode: 'half' }).widthMode, 'wide');
  assert.equal(cycleTrafficWidthMode(wide).widthMode, 'full');
  assert.equal(cycleTrafficWidthMode(full, -1).widthMode, 'full');
  assert.equal(cycleDetailWidthMode(full).widthMode, 'wide');
  assert.equal(cycleDetailWidthMode(full).widthTarget, 'details');
  assert.equal(cycleDetailWidthMode({ widthMode: 'half' }).widthMode, 'normal');
  assert.equal(cycleDetailWidthMode({ widthMode: 'half' }).widthTarget, 'traffic');
  assert.equal(cycleDetailWidthMode({ widthMode: 'wide', widthTarget: 'details' }).widthMode, 'full');
  assert.equal(cycleDetailWidthMode({ widthMode: 'full', widthTarget: 'details' }).widthMode, 'half');
  assert.deepEqual(
    cyclePaneWidthMode({ widthMode: 'wide', widthTarget: 'traffic' }, false),
    {
      columns: full.columns,
      density: 'full',
      pathMode: 'smart',
      widthMode: 'half',
      widthTarget: 'traffic'
    }
  );
  assert.deepEqual(
    cyclePaneWidthMode({ widthMode: 'wide', widthTarget: 'details' }, true),
    {
      columns: full.columns,
      density: 'full',
      pathMode: 'smart',
      widthMode: 'half',
      widthTarget: 'traffic'
    }
  );
  assert.equal(formatPaneWidthLabel(full), 'normal');
  assert.equal(formatPaneWidthLabel({ widthMode: 'half' }), 'half');
  assert.equal(formatPaneWidthLabel({ widthMode: 'wide', widthTarget: 'traffic' }), 'traffic wide');
  assert.equal(formatPaneWidthLabel({ widthMode: 'full', widthTarget: 'details' }), 'details full');
  assert.equal(getTrafficPaneWidth('normal', 120), 50);
  assert.equal(getTrafficPaneWidth('wide', 120), 78);
  assert.equal(getTrafficPaneWidth('wide', 100), 64);
  assert.equal(getTrafficPaneWidth('wide', 80), 50);
  assert.equal(getTrafficPaneWidth('wide', 40), 38);
  assert.equal(getTrafficPaneWidth('full', 120), 118);
  assert.equal(getTrafficPaneWidth('invalid', 120), 50);
  assert.equal(getTrafficPaneWidth('full', Number.NaN), 78);
  assert.deepEqual(getPaneLayout(full, 120), {
    availableWidth: 118,
    detailPaneWidth: 67,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 50
  });
  assert.deepEqual(wideLayout, {
    availableWidth: 118,
    detailPaneWidth: 39,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 78
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'half' }, 120), {
    availableWidth: 118,
    detailPaneWidth: 59,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 58
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'full', widthTarget: 'traffic' }, 120), {
    availableWidth: 118,
    detailPaneWidth: 0,
    gapWidth: 0,
    showDetailPane: false,
    showTrafficPane: true,
    trafficPaneWidth: 118
  });
  assert.deepEqual(detailWideLayout, {
    availableWidth: 118,
    detailPaneWidth: 78,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 39
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'full', widthTarget: 'details' }, 120), {
    availableWidth: 118,
    detailPaneWidth: 118,
    gapWidth: 0,
    showDetailPane: true,
    showTrafficPane: false,
    trafficPaneWidth: 0
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'wide', widthTarget: 'details' }, 80), {
    availableWidth: 78,
    detailPaneWidth: 45,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 32
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'wide', widthTarget: 'details' }, 160), {
    availableWidth: 158,
    detailPaneWidth: 116,
    gapWidth: 1,
    showDetailPane: true,
    showTrafficPane: true,
    trafficPaneWidth: 41
  });
  assert.deepEqual(getPaneLayout({ widthMode: 'wide', widthTarget: 'details' }, 40), {
    availableWidth: 38,
    detailPaneWidth: 38,
    gapWidth: 0,
    showDetailPane: true,
    showTrafficPane: false,
    trafficPaneWidth: 0
  });
  assert.equal(getTrafficRowWidth(50), 45);
  assert.equal(getTrafficRowWidth(78), 73);
  assert.equal(getTrafficRowWidth(82), 77);

  assert.equal(formatTrafficHeader(pathOnly).trim(), 'path');
  assert.equal(formatTrafficRow(log, true, full).length, 45);
  assert.equal(formatTrafficHeader(full, wideRowWidth).length, wideRowWidth);
  assert.equal(formatTrafficRow(log, true, full, wideRowWidth).length, wideRowWidth);
  assert.equal(formatTrafficRow(log, false, compact).includes('GET'), true);
  assert.equal(formatTrafficRow(log, false, compact).includes('34ms'), false);
  assert.equal(formatTrafficRow(log, false, pathOnly).includes('GET'), false);
  assert.equal(formatTrafficRow(log, false, pathOnly).includes('200'), false);
});

test('detail scroll helper clamps page-wise scrolling', () => {
  assert.equal(clampScrollOffset(3, 5, 10), 8);
  assert.equal(clampScrollOffset(3, -10, 10), 0);
  assert.equal(clampScrollOffset(8, 5, 10), 10);
  assert.equal(clampScrollOffset(Number.NaN, 5, 10), 5);
  assert.equal(clampScrollOffset(8, 5, Number.NaN), 0);
  assert.equal(clampDetailRowIndex(5, [{}, {}, {}]), 2);
  assert.equal(clampDetailRowIndex(-1, [{}, {}, {}]), 0);
  assert.equal(getScrollOffsetForFocusedRow(12, 0, 5, 20), 8);
  assert.equal(getScrollOffsetForFocusedRow(2, 10, 5, 20), 2);
  assert.equal(getScrollOffsetForFocusedRow(12, 10, 5, 20), 10);
});

test('keyboard action helper resolves navigation aliases and page movement', () => {
  assert.deepEqual(
    getKeyboardAction('j', {}, { isListFocused: true }),
    { type: 'moveSelection', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('k', {}, { isListFocused: false }),
    { type: 'scrollDetails', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { pageDown: true }, { isListFocused: true, trafficPageSize: 12 }),
    { type: 'moveSelection', direction: 12 }
  );
  assert.deepEqual(
    getKeyboardAction('', { pageUp: true }, { isListFocused: false, detailPageSize: 8 }),
    { type: 'scrollDetails', direction: -8 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { isListFocused: true, trafficPageSize: 9 }),
    { type: 'moveSelection', direction: 9 }
  );
  assert.deepEqual(
    getKeyboardAction('[', {}, { isListFocused: false, detailPageSize: 6 }),
    { type: 'scrollDetails', direction: -6 }
  );
  assert.deepEqual(
    getKeyboardAction('d', { ctrl: true }, { isListFocused: true, trafficPageSize: 11 }),
    { type: 'moveSelection', direction: 5 }
  );
  assert.deepEqual(
    getKeyboardAction('u', { ctrl: true }, { isListFocused: false, detailPageSize: 7 }),
    { type: 'scrollDetails', direction: -3 }
  );
  assert.deepEqual(
    getKeyboardAction('g', {}, { isListFocused: true }),
    { type: 'moveSelectionTo', boundary: 'first' }
  );
  assert.deepEqual(
    getKeyboardAction('G', {}, { isListFocused: false }),
    { type: 'scrollDetailsTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isListFocused: true }),
    { type: 'inspectSelected' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isListFocused: false }),
    { type: 'toggleDetailNode' }
  );
  assert.deepEqual(
    getKeyboardAction('/', {}, { isListFocused: true }),
    { type: 'openFilter', focus: 'query' }
  );
  assert.deepEqual(
    getKeyboardAction('/', {}, { isListFocused: false }),
    { type: 'openDetailSearch' }
  );
  assert.deepEqual(getKeyboardAction('o'), { type: 'openDetailModal' });
  assert.deepEqual(
    getKeyboardAction('y', {}, { isListFocused: true }),
    { type: 'startExport', action: 'copy' }
  );
  assert.deepEqual(
    getKeyboardAction('D', {}, { isListFocused: false }),
    { type: 'startExport', action: 'download' }
  );
  assert.deepEqual(
    getKeyboardAction('m', {}, { isExportPromptOpen: true }),
    { type: 'finishExport', secretPolicy: 'masked' }
  );
  assert.deepEqual(
    getKeyboardAction('r', {}, { isExportPromptOpen: true }),
    { type: 'finishExport', secretPolicy: 'raw' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isExportPromptOpen: true }),
    { type: 'cancelExport' }
  );
  assert.deepEqual(
    getKeyboardAction('t'),
    { type: 'cycleTrafficPathMode', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('v'),
    { type: 'cycleTrafficDensity', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('w'),
    { type: 'cyclePaneWidthMode', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('L'),
    { type: 'openListDisplay' }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isListFocused: false }),
    { type: 'moveDetailMatch', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('N', {}, { isListFocused: false }),
    { type: 'moveDetailMatch', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isLiveMode: true, isListFocused: true }),
    { type: 'openComposer', mode: 'blank' }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isLiveMode: false, isListFocused: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('e', {}, { isLiveMode: true }),
    { type: 'openComposer', mode: 'edit-resend' }
  );
  assert.deepEqual(
    getKeyboardAction('E', {}, { isLiveMode: true }),
    { type: 'openComposer', mode: 'edit-resend' }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isLiveMode: true }),
    { type: 'showCommandHint', message: 'use :resend' }
  );
  assert.deepEqual(
    getKeyboardAction('e', {}, { isLiveMode: false }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isLiveMode: false }),
    { type: 'showCommandHint', message: 'use :resend' }
  );
  assert.deepEqual(
    getKeyboardAction('l', {}, { isLiveMode: true }),
    { type: 'openComposerLibrary' }
  );
  assert.deepEqual(
    getKeyboardAction('l', {}, { isLiveMode: false }),
    { type: 'none' }
  );
});

test('keyboard action helper supports colon command mode for careful actions', () => {
  assert.deepEqual(getKeyboardAction(':'), { type: 'openCommandPrompt' });
  assert.deepEqual(
    getKeyboardAction(':', {}, { isDetailModalOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('q'),
    { type: 'showCommandHint', message: 'use :quit' }
  );
  assert.deepEqual(
    getKeyboardAction('P'),
    { type: 'showCommandHint', message: 'use :record' }
  );
  assert.deepEqual(
    getKeyboardAction('S'),
    { type: 'showCommandHint', message: 'use :stop-recording' }
  );
  assert.deepEqual(
    getKeyboardAction('p'),
    { type: 'showCommandHint', message: 'use :pause-capture' }
  );
  assert.deepEqual(
    getKeyboardAction('c'),
    { type: 'showCommandHint', message: 'use :clear-logs' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isCommandOpen: true }),
    { type: 'closeCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isCommandOpen: true }),
    { type: 'submitCommand' }
  );
  assert.deepEqual(
    getKeyboardAction('r', {}, { isCommandOpen: true }),
    { type: 'appendCommandText', value: 'r' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isCommandOpen: true }),
    { type: 'appendCommandText', value: 'w' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isCommandOpen: true }),
    { type: 'backspaceCommandText' }
  );
  assert.deepEqual(
    getKeyboardAction('', { tab: true }, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { upArrow: true }, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: -1 }
  );

  assert.deepEqual(getCommandHintForKey('R'), 'use :resend');
  assert.deepEqual(COMMAND_DEFINITIONS.map((command) => command.name), [
    'quit',
    'resend',
    'next-page',
    'record',
    'stop-recording',
    'pause-capture',
    'clear-logs',
    'help'
  ]);
  assert.deepEqual(getCommandMatches('res').map((command) => command.name), ['resend']);
  assert.deepEqual(getCommandMatches('np').map((command) => command.name), ['next-page']);
  assert.deepEqual(getCommandMatches('r').map((command) => command.name), ['resend', 'record']);
  assert.deepEqual(resolveCommandInput('next-page').action, { type: 'openNextPage' });
  assert.deepEqual(resolveCommandInput('np').action, { type: 'openNextPage' });
  assert.equal(getCommandSuggestionIndex('r', -1, 1), 0);
  assert.equal(getCommandSuggestionIndex('r', 0, 1), 1);
  assert.equal(getCommandSuggestionIndex('r', 0, -1), 1);
  assert.equal(getCommandSuggestionRows('res').length, 7);
  assert.deepEqual(
    getCommandSuggestionRows('res').map((row) => row.name),
    ['resend', '', '', '', '', '', '']
  );
  assert.deepEqual(
    getCommandSuggestionRows('r', 1).map((row) => row.isSelected),
    [false, true, false, false, false, false, false]
  );
  assert.deepEqual(
    getCommandSuggestionRows('wat').map((row) => row.name),
    ['', '', '', '', '', '', '']
  );
  assert.deepEqual(
    getCommandSuggestionRows('').map((row) => row.primaryAlias),
    ['q', 'rs', 'np', 'rec', 'stop', 'pause', 'clear']
  );
  assert.equal(
    formatCommandSelectionStatus(getCommandSuggestionRows('r', 1)[1]),
    'selected :record (rec)'
  );
  assert.equal(formatCommandSelectionStatus(getCommandSuggestionRows('wat')[0]), '');
  assert.deepEqual(resolveCommandInput('q'), {
    ok: true,
    action: { type: 'quit' },
    command: COMMAND_DEFINITIONS[0]
  });
  assert.deepEqual(resolveCommandInput('rs').action, { type: 'startResend', mode: 'exact' });
  assert.deepEqual(resolveCommandInput('res').action, { type: 'startResend', mode: 'exact' });
  assert.deepEqual(resolveCommandInput('r'), {
    ok: false,
    error: 'ambiguous command: resend, record'
  });
  assert.deepEqual(resolveCommandInput('r', 1).action, { type: 'toggleRecordingPause' });
  assert.deepEqual(resolveCommandInput('wat'), {
    ok: false,
    error: 'unknown command: wat'
  });
});

test('keyboard action helper supports request composer input', () => {
  assert.deepEqual(
    getKeyboardAction('a', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'a' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'w' }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'R' }
  );
  assert.deepEqual(
    getKeyboardAction('\u007F', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'backspaceComposerText' }
  );
  assert.deepEqual(
    getKeyboardAction('\b', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'backspaceComposerText' }
  );
  assert.deepEqual(
    getKeyboardAction('', { delete: true }, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'backspaceComposerText' }
  );
  assert.deepEqual(
    getKeyboardAction('\u001B[3~', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'deleteComposerText' }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'addComposerRow' }
  );
  assert.deepEqual(
    getKeyboardAction('d', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'deleteComposerRow' }
  );
  assert.deepEqual(
    getKeyboardAction(' ', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'toggleComposerField' }
  );
  assert.deepEqual(
    getKeyboardAction('s', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'saveComposerRequest' }
  );
  assert.deepEqual(
    getKeyboardAction('l', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'openComposerLibrary' }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'toggleComposerReveal' }
  );
  assert.deepEqual(
    getKeyboardAction('[', {}, { isComposerOpen: true }),
    { type: 'cycleComposerTab', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { isComposerOpen: true }),
    { type: 'cycleComposerTab', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('4', {}, { isComposerOpen: true, isComposerTextFocused: false }),
    { type: 'selectComposerTab', tab: 'auth' }
  );
  assert.deepEqual(
    getKeyboardAction('4', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: '4' }
  );
  assert.deepEqual(
    getKeyboardAction('', { tab: true, shift: true }, { isComposerOpen: true }),
    { type: 'cycleComposerFocus', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isComposerOpen: true }),
    { type: 'moveComposerHorizontal', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { tab: true }, { isComposerOpen: true, composerFocus: 'method' }),
    { type: 'cycleComposerFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isComposerOpen: true }),
    { type: 'previewComposerSend' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isComposerOpen: true, isComposerConfirmOpen: true }),
    { type: 'sendComposer' }
  );
  assert.deepEqual(
    getKeyboardAction('y', {}, { isComposerOpen: true, isComposerConfirmOpen: true }),
    { type: 'sendComposer' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isComposerOpen: true, isComposerConfirmOpen: true }),
    { type: 'closeComposerPreview' }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isComposerOpen: true, isComposerConfirmOpen: true }),
    { type: 'closeComposerPreview' }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isComposerOpen: true, isComposerConfirmOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isComposerOpen: true }),
    { type: 'closeComposer' }
  );
  assert.deepEqual(
    getKeyboardAction('\u001B[<65;20;5M', {}, { isComposerOpen: true, composerFocus: 'path' }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isComposerOpen: true, isComposerSending: true, isComposerTextFocused: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isComposerOpen: true, isComposerLibraryOpen: true }),
    { type: 'moveComposerLibrary', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('1', {}, { isComposerOpen: true, isComposerLibraryOpen: true }),
    { type: 'selectComposerTab', tab: 'params' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isComposerOpen: true, isComposerLibraryOpen: true }),
    { type: 'loadComposerLibraryRequest' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isComposerOpen: true, isComposerBodyEditorOpen: true }),
    { type: 'insertComposerText', value: '\n' }
  );
});

test('keyboard action helper supports resend confirmation input', () => {
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isResendConfirmOpen: true }),
    { type: 'sendResend' }
  );
  assert.deepEqual(
    getKeyboardAction('y', {}, { isResendConfirmOpen: true }),
    { type: 'sendResend' }
  );
  assert.deepEqual(
    getKeyboardAction('E', {}, { isResendConfirmOpen: true }),
    { type: 'editPendingResend' }
  );
  assert.deepEqual(
    getKeyboardAction('e', {}, { isResendConfirmOpen: true }),
    { type: 'editPendingResend' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isResendConfirmOpen: true }),
    { type: 'cancelResend' }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isResendConfirmOpen: true }),
    { type: 'cancelResend' }
  );
  assert.deepEqual(
    getKeyboardAction('y', {}, { isResendConfirmOpen: true, isResending: true }),
    { type: 'none' }
  );
});

test('keyboard action helper gates help modal and preserves filter query input', () => {
  assert.deepEqual(getKeyboardAction('h'), { type: 'openHelp' });
  assert.deepEqual(getKeyboardAction('?'), { type: 'none' });
  assert.deepEqual(
    getKeyboardAction('h', {}, { isHelpOpen: true }),
    { type: 'closeHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isHelpOpen: true }),
    { type: 'closeHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isHelpOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isHelpOpen: true }),
    { type: 'closeHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isHelpOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: '?' }
  );
  assert.deepEqual(
    getKeyboardAction('[', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: '[' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'q' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'none' }
  );
});

test('keyboard action helper supports list display modal input', () => {
  assert.deepEqual(
    getKeyboardAction('j', {}, { isListDisplayOpen: true }),
    { type: 'moveListDisplayFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('k', {}, { isListDisplayOpen: true }),
    { type: 'moveListDisplayFocus', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isListDisplayOpen: true }),
    { type: 'cycleListDisplayOption', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isListDisplayOpen: true }),
    { type: 'cycleListDisplayOption', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(' ', {}, { isListDisplayOpen: true }),
    { type: 'toggleListDisplayColumn' }
  );
  assert.deepEqual(
    getKeyboardAction('r', {}, { isListDisplayOpen: true }),
    { type: 'resetListDisplay' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isListDisplayOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isListDisplayOpen: true }),
    { type: 'closeListDisplay' }
  );
});

test('keyboard action helper toggles framework assets outside text inputs', () => {
  assert.deepEqual(getKeyboardAction('F'), { type: 'toggleFrameworkAssets' });
  assert.deepEqual(
    getKeyboardAction('F', {}, { isDetailModalOpen: true }),
    { type: 'toggleFrameworkAssets' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'F' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'w' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'F' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'F' }
  );
});

test('keyboard action helper supports detail modal and detail search input', () => {
  assert.deepEqual(
    getKeyboardAction('q', {}, { isDetailModalOpen: true }),
    { type: 'closeDetailModal' }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isDetailModalOpen: true }),
    { type: 'closeDetailModal' }
  );
  assert.deepEqual(
    getKeyboardAction('/', {}, { isDetailModalOpen: true }),
    { type: 'openDetailSearch' }
  );
  assert.deepEqual(
    getKeyboardAction('y', {}, { isDetailModalOpen: true }),
    { type: 'startExport', action: 'copy' }
  );
  assert.deepEqual(
    getKeyboardAction('D', {}, { isDetailModalOpen: true }),
    { type: 'startExport', action: 'download' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isDetailModalOpen: true }),
    { type: 'scrollDetails', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isDetailModalOpen: true, isLiveMode: true }),
    { type: 'showCommandHint', message: 'use :resend' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isDetailModalOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('E', {}, { isDetailModalOpen: true, isLiveMode: true }),
    { type: 'openComposer', mode: 'edit-resend' }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'a' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'R' }
  );
  assert.deepEqual(
    getKeyboardAction('w', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'w' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isDetailSearchOpen: true }),
    { type: 'backspaceDetailSearch' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isDetailSearchOpen: true }),
    { type: 'finishDetailSearch' }
  );
});

test('keyboard action helper supports custom key bindings without stealing text input', () => {
  const movementBindings = getTestKeyBindings({
    'main.moveDown': ['z'],
    'main.moveUp': ['a']
  });

  assert.deepEqual(
    getKeyboardAction('z', {}, { isListFocused: true, keyBindings: movementBindings }),
    { type: 'moveSelection', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isListFocused: false, keyBindings: movementBindings }),
    { type: 'scrollDetails', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isListFocused: true, keyBindings: movementBindings }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('z', {}, { filterFocus: 'query', isFilterOpen: true, keyBindings: movementBindings }),
    { type: 'appendSearch', value: 'z' }
  );

  const exportBindings = getTestKeyBindings({
    'main.copy': ['b'],
    'main.download': ['X'],
    'export.masked': ['1'],
    'export.raw': ['2']
  });

  assert.deepEqual(
    getKeyboardAction('b', {}, { keyBindings: exportBindings }),
    { type: 'startExport', action: 'copy' }
  );
  assert.deepEqual(
    getKeyboardAction('X', {}, { keyBindings: exportBindings }),
    { type: 'startExport', action: 'download' }
  );
  assert.deepEqual(
    getKeyboardAction('1', {}, { isExportPromptOpen: true, keyBindings: exportBindings }),
    { type: 'finishExport', secretPolicy: 'masked' }
  );
  assert.deepEqual(
    getKeyboardAction('2', {}, { isExportPromptOpen: true, keyBindings: exportBindings }),
    { type: 'finishExport', secretPolicy: 'raw' }
  );

  const composerBindings = getTestKeyBindings({
    'composer.addRow': ['+'],
    'composer.deleteRow': ['-'],
    'composer.save': ['!'],
    'composer.selectTab.auth': ['8'],
    'composerLibrary.open': ['o']
  });

  assert.deepEqual(
    getKeyboardAction('+', {}, { isComposerOpen: true, isComposerTextFocused: false, keyBindings: composerBindings }),
    { type: 'addComposerRow' }
  );
  assert.deepEqual(
    getKeyboardAction('+', {}, { isComposerOpen: true, isComposerTextFocused: true, keyBindings: composerBindings }),
    { type: 'insertComposerText', value: '+' }
  );
  assert.deepEqual(
    getKeyboardAction('8', {}, { isComposerOpen: true, isComposerTextFocused: false, keyBindings: composerBindings }),
    { type: 'selectComposerTab', tab: 'auth' }
  );
  assert.deepEqual(
    getKeyboardAction('o', {}, { isComposerOpen: true, isComposerLibraryOpen: true, keyBindings: composerBindings }),
    { type: 'loadComposerLibraryRequest' }
  );
});

test('mouse wheel routing maps the active traffic pane by terminal column', () => {
  assert.equal(getMouseWheelTarget(1), 'traffic');
  assert.equal(getMouseWheelTarget(51), 'traffic');
  assert.equal(getMouseWheelTarget(52), 'details');
  assert.equal(getMouseWheelTarget(120), 'details');
  assert.equal(getMouseWheelTarget(79, getPaneLayout({ widthMode: 'wide', widthTarget: 'traffic' }, 120)), 'traffic');
  assert.equal(getMouseWheelTarget(80, getPaneLayout({ widthMode: 'wide', widthTarget: 'traffic' }, 120)), 'details');
  assert.equal(getMouseWheelTarget(119, getPaneLayout({ widthMode: 'full', widthTarget: 'traffic' }, 120)), 'traffic');
  assert.equal(getMouseWheelTarget(120, getPaneLayout({ widthMode: 'full', widthTarget: 'traffic' }, 120)), 'details');
  assert.equal(getMouseWheelTarget(1, getPaneLayout({ widthMode: 'full', widthTarget: 'details' }, 120)), 'details');
});

test('getRenderHeight keeps one terminal row free for Ink updates', () => {
  assert.equal(getRenderHeight(40), 39);
  assert.equal(getRenderHeight(2), 1);
  assert.equal(getRenderHeight(undefined), 23);
});

test('footer text shows mode-aware essential keymaps', () => {
  assert.equal(
    formatFooterText({ isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isListFocused: false }),
    'j/k: scroll  [ / ]: page  r: req/res  /: find  n/N: match  tab: traffic  : command  h: help'
  );
  assert.equal(
    formatFooterText({ hideFrameworkAssets: false, isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isDetailModalOpen: true }),
    'j/k: scroll  [ / ]: page  r: req/res  /: find  n/N: match  E: edit  enter: collapse  esc/q: close  : command'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, isLiveMode: false, isReplayMode: true }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help'
  );
  assert.equal(
    formatFooterText({
      isListFocused: true,
      recordingStatus: { mode: 'full', path: './capture.ndjson', state: 'recording', error: null }
    }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help'
  );
  assert.equal(
    formatFooterText({
      isListFocused: false,
      recordingStatus: { mode: 'partial', path: './capture.ndjson', state: 'paused', error: null }
    }),
    'j/k: scroll  [ / ]: page  r: req/res  /: find  n/N: match  tab: traffic  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isComposerOpen: true }),
    'composer  1-7 sections  tab fields  enter preview  a add  d delete  s save  l library  R reveal  esc close'
  );
  assert.equal(
    formatFooterText({ isComposerOpen: true, isComposerTextFocused: true }),
    'typing  backspace delete  tab next  enter preview  esc close  1-7 sections'
  );
  assert.equal(
    formatFooterText({ isComposerOpen: true, isComposerConfirmOpen: true }),
    'preview  enter/y send  esc/n edit'
  );
  assert.equal(
    formatFooterText({ isListFocused: false, isDetailSearchActive: true }),
    'detail search active  / edit  n/N match  E edit  j/k scroll  enter collapse  o big  tab traffic  : command'
  );
  assert.equal(
    formatFooterText({ isListFocused: false, isDetailSearchActive: true, isDetailModalOpen: true }),
    'detail search active  / edit  n/N match  E edit  j/k scroll  enter collapse  esc/q close  : command'
  );
  assert.equal(
    formatFooterText({ isExportPromptOpen: true }),
    'export  m masked  r raw  esc cancel'
  );
  assert.equal(
    formatFooterText({ isListDisplayOpen: true }),
    'list display  j/k select row  left/right change value  space show/hide  r reset  enter/esc close'
  );
  assert.equal(
    formatFooterText({ exportStatus: 'copied response body', isListFocused: false }),
    'j/k: scroll  [ / ]: page  r: req/res  /: find  n/N: match  tab: traffic  : command  h: help | copied response body'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, resendStatus: 'resent GET /food' }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help | resent GET /food'
  );
  assert.equal(
    formatFooterText({ commandStatus: 'use :quit', isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  tab: details  : command  h: help | use :quit'
  );
  assert.equal(
    formatFooterText({ isCommandOpen: true }),
    ''
  );
  assert.equal(formatFooterText({ isHelpOpen: true }), 'help | esc/h/q close');
});

test('footer and help labels reflect custom key bindings', () => {
  const keyBindings = getTestKeyBindings({
    'global.openCommandPrompt': [';'],
    'main.moveDown': ['z'],
    'main.moveUp': ['a'],
    'main.openHelp': ['?'],
    'main.openSearch': ['.'],
    'export.masked': ['1'],
    'export.raw': ['2']
  });

  assert.equal(
    formatFooterText({ isListFocused: true, keyBindings }),
    'z/a: move  [ / ]: page  enter: inspect  tab: details  ; command  ?: help'
  );
  assert.equal(
    formatFooterText({ isExportPromptOpen: true, keyBindings }),
    'export  1 masked  2 raw  esc cancel'
  );

  const customSections = getHelpSections(keyBindings);
  const moveSection = customSections.find((section) => section.title === 'Move');
  const inspectSection = customSections.find((section) => section.title === 'Inspect');
  const exportSection = customSections.find((section) => section.title === 'Display / Export');

  assert.deepEqual(moveSection.rows.find((row) => row[1] === 'move line'), ['z/a', 'move line']);
  assert.deepEqual(inspectSection.rows.find((row) => row[1] === 'find details'), ['.', 'find details']);
  assert.deepEqual(exportSection.rows.find((row) => row[1] === 'masked / raw export'), ['1 / 2', 'masked / raw export']);
  assert.equal(DEFAULT_KEY_BINDINGS['main.moveDown'][0], 'j');
});

test('command help rows are generated from command definitions', () => {
  const rows = getCommandHelpRows();

  assert.deepEqual(
    rows.map((row) => row.command),
    COMMAND_DEFINITIONS.map((command) => `:${command.name}`)
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':stop-recording'),
    {
      aliases: ':stop, :stop-rec',
      command: ':stop-recording',
      description: 'stop recording'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':next-page'),
    {
      aliases: ':np',
      command: ':next-page',
      description: 'open next-page request'
    }
  );
  assert.equal(
    rows.find((row) => row.command === ':clear-logs').aliases,
    ':clear, :clear-traffic'
  );
});

test('command modal renders command suggestions without missing constants', () => {
  assert.doesNotThrow(() => {
    CommandModal.type({
      input: 'r',
      selectedIndex: 0,
      status: ''
    });
  });
});

test('help sections keep colon commands in the dedicated command block', () => {
  const composeSection = HELP_SECTIONS.find((section) => section.title === 'Compose');
  const captureSection = HELP_SECTIONS.find((section) => section.title === 'Capture / Session');
  const sectionCommandRows = HELP_SECTIONS
    .flatMap((section) => section.rows)
    .filter(([keys]) => keys.includes(':'));

  assert.deepEqual(sectionCommandRows, []);
  assert.equal(composeSection.rows.find(([keys]) => keys === ':resend'), undefined);
  assert.deepEqual(captureSection.rows.find(([keys]) => keys === 'f'), ['f', 'follow latest']);
  assert.deepEqual(captureSection.rows.find(([keys]) => keys === 'h'), ['h', 'help']);
});

test('help sections describe copy and download exports', () => {
  const exportSection = HELP_SECTIONS.find((section) => section.title === 'Display / Export');

  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'y'), ['y', 'copy item']);
  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'D'), ['D', 'download item']);
  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'm / r'), ['m / r', 'masked / raw export']);
});

test('help sections describe traffic list display controls', () => {
  const displaySection = HELP_SECTIONS.find((section) => section.title === 'Display / Export');

  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 't'), ['t', 'cycle path mode']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'v'), ['v', 'cycle list density']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'w'), ['w', 'cycle pane width']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'F'), ['F', 'show / hide static']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'L'), ['L', 'list display modal']);
});

test('help sections describe bracket page movement', () => {
  const navigationSection = HELP_SECTIONS.find((section) => section.title === 'Move');

  assert.deepEqual(navigationSection.rows.find(([keys]) => keys === '[ / ]'), ['[ / ]', 'move page']);
  assert.deepEqual(navigationSection.rows.find(([keys]) => keys === 'j/k'), ['j/k', 'move line']);
  assert.deepEqual(navigationSection.rows.find(([keys]) => keys === 'g/G'), ['g/G', 'top / bottom']);
  assert.deepEqual(navigationSection.rows.find(([keys]) => keys === 'tab'), ['tab', 'switch pane']);
});

test('help sections describe request composer keys', () => {
  const composeSection = HELP_SECTIONS.find((section) => section.title === 'Compose');

  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'n'), ['n', 'new request']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'E'), ['E', 'edit and resend']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'e'), ['e', 'edit selected request']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'l'), ['l', 'saved requests']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === '1-7'), ['1-7', 'jump sections']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'a/d'), ['a/d', 'add / delete row']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'space'), ['space', 'enable / disable row']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'enter/y'), ['enter/y', 'preview / send']);
});

test('composer helpers create blank and cloned request state', () => {
  const blank = createBlankComposerState();

  assert.equal(blank.activeTab, 'params');
  assert.equal(blank.draft.method, 'GET');
  assert.equal(blank.draft.url, '/');
  assert.equal(blank.draft.params.length, 1);
  assert.equal(blank.draft.collection, 'Default');
  assert.equal(blank.isConfirmOpen, false);
  assert.equal(blank.isOpen, true);
  assert.equal(blank.source, 'new');

  const cloned = createComposerStateFromLog({
    method: 'POST',
    path: '/api/sessions',
    request: {
      headers: {
        accept: 'application/json',
        'content-length': '25',
        cookie: 'session=secret',
        host: 'example.test',
        'x-trace': 'abc'
      },
      body: 'email=demo@example.com'
    }
  });

  assert.equal(cloned.draft.body.raw, 'email=demo@example.com');
  assert.equal(cloned.draft.body.mode, 'raw');
  assert.equal(cloned.draft.method, 'POST');
  assert.equal(cloned.draft.url, '/api/sessions');
  assert.deepEqual(cloned.draft.headers.map((row) => [row.key, row.value]), [
    ['accept', 'application/json'],
    ['x-trace', 'abc']
  ]);
  assert.deepEqual(cloned.draft.cookies.map((row) => [row.key, row.value, row.secret]), [
    ['session', 'secret', true]
  ]);
  assert.equal(cloned.source, 'edit-resend');
  assert.equal(cloned.resend.action, 'edit-resend');

  assert.equal(createComposerStateFromLog({
    method: 'GET',
    path: '/',
    request: {
      headers: {
        cookie: 'session=secret'
      }
    }
  }, { includeCookieHeaders: true }).draft.cookies[0].value, 'secret');
});

test('pagination analyzer detects query params and Link header next cursors', () => {
  const result = analyzePagination({
    path: '/api/items?page=2&limit=50',
    response: {
      headers: {
        link: '</api/items?cursor=abc123&limit=50>; rel="next", </api/items?page=1&limit=50>; rel="prev"'
      }
    }
  });

  assert.equal(result.detected, true);
  assert.deepEqual(result.fields, {
    limit: '50',
    page: '2'
  });
  assert.equal(result.rels.next.resolvedUrl, '/api/items?cursor=abc123&limit=50');
  assert.deepEqual(result.nextRequest, {
    cursor: {
      field: 'cursor',
      name: 'cursor',
      value: 'abc123'
    },
    source: 'link',
    url: '/api/items?cursor=abc123&limit=50'
  });
  assert.equal(result.summary, 'page 2, limit 50, likely next cursor: abc123');
});

test('pagination analyzer computes page and offset fallbacks without inventing cursors', () => {
  assert.deepEqual(
    analyzePagination({
      path: '/api/items?page=2&page_size=25',
      response: { headers: {} }
    }).nextRequest,
    {
      source: 'computed',
      url: '/api/items?page=3&page_size=25'
    }
  );

  const offsetResult = analyzePagination({
    path: '/api/items?offset=100&limit=50',
    response: { headers: {} }
  });

  assert.equal(offsetResult.nextRequest.url, '/api/items?offset=150&limit=50');
  assert.equal(offsetResult.summary, 'limit 50, offset 100, next offset 150');

  const cursorOnly = analyzePagination({
    path: '/api/items?cursor=current',
    response: { headers: {} }
  });

  assert.equal(cursorOnly.detected, true);
  assert.equal(cursorOnly.nextRequest, null);
  assert.equal(cursorOnly.summary, 'cursor current');
});

test('pagination analyzer tolerates malformed Link headers and resolves relative links', () => {
  const malformed = analyzePagination({
    path: '/api/items',
    response: { headers: { link: 'not a link' } }
  });

  assert.equal(malformed.detected, false);
  assert.deepEqual(malformed.links, []);

  const relative = analyzePagination({
    path: '/api/items?page=2',
    response: { headers: { link: '<?page=3>; rel=next' } }
  });

  assert.equal(relative.nextRequest.url, '/api/items?page=3');
  assert.equal(relative.summary, 'page 2, next page 3');

  const prevOnly = analyzePagination({
    path: '/api/items',
    response: { headers: { link: '</api/items?page=1>; rel="prev"' } }
  });

  assert.equal(prevOnly.detected, true);
  assert.equal(prevOnly.summary, 'link rels: prev');
});

test('next-page draft preserves captured request fields and replaces only the URL', () => {
  const plan = createNextPageRequestDraftFromLog({
    id: 'source-1',
    method: 'GET',
    path: '/api/items?page=2&limit=50',
    request: {
      headers: {
        accept: 'application/json',
        cookie: 'session=secret',
        host: 'example.test',
        'x-trace': 'abc'
      },
      body: ''
    },
    response: {
      headers: {
        link: '</api/items?page=3&limit=50>; rel="next"'
      },
      body: ''
    }
  });

  assert.equal(plan.draft.method, 'GET');
  assert.equal(plan.draft.url, '/api/items?page=3&limit=50');
  assert.deepEqual(plan.draft.headers.map((row) => [row.key, row.value]), [
    ['accept', 'application/json'],
    ['x-trace', 'abc']
  ]);
  assert.deepEqual(plan.draft.cookies.map((row) => [row.key, row.value, row.secret]), [
    ['session', 'secret', true]
  ]);
  assert.equal(plan.resend.action, 'edit-resend');
  assert.equal(plan.resend.sourcePath, '/api/items?page=2&limit=50');
});

test('detail rows include pagination summaries without body path metadata', () => {
  const rows = getDetailRows({
    method: 'GET',
    path: '/api/items?page=2&limit=50',
    request: { headers: {}, body: '' },
    response: {
      headers: {
        link: '</api/items?cursor=abc123&limit=50>; rel="next"'
      },
      body: ''
    }
  }, 'response');
  const summaryRow = rows.find((row) => row.id === 'response-pagination-summary');
  const nextRow = rows.find((row) => row.id === 'response-pagination-next');

  assert.equal(rows.some((row) => row.id === 'response-pagination-title'), true);
  assert.equal(summaryRow.text, 'page 2, limit 50, likely next cursor: abc123');
  assert.equal(summaryRow.path, null);
  assert.equal(nextRow.text, 'next request: /api/items?cursor=abc123&limit=50');
  assert.equal(nextRow.path, null);
});

test('composer section helpers jump sections and seed editable rows', () => {
  const blank = createBlankComposerState();
  const auth = selectComposerTab(blank, '4');

  assert.equal(auth.activeTab, 'auth');
  assert.equal(auth.isConfirmOpen, false);
  assert.equal(getComposerFieldDescriptors(auth)[auth.focusIndex].label, 'auth mode');

  const params = selectComposerTab({
    ...blank,
    activeTab: 'headers',
    draft: {
      ...blank.draft,
      params: []
    }
  }, '1');

  assert.equal(params.activeTab, 'params');
  assert.equal(params.draft.params.length, 1);
  assert.equal(getComposerFieldDescriptors(params)[params.focusIndex].label, 'key');

  const body = selectComposerTab({
    ...blank,
    draft: {
      ...blank.draft,
      body: {
        ...blank.draft.body,
        mode: 'multipart'
      },
      multipartFields: []
    }
  }, 'body');

  assert.equal(body.activeTab, 'body');
  assert.equal(body.draft.multipartFields.length, 1);
  assert.equal(getComposerFieldDescriptors(body)[body.focusIndex].label, 'key');

  const headers = ensureComposerActiveTabRows({
    ...blank,
    activeTab: 'headers',
    draft: {
      ...blank.draft,
      headers: []
    }
  });

  assert.equal(headers.draft.headers.length, 1);

  const railRows = getComposerSectionRows(auth, {
    requests: [
      { id: 'one', collection: 'Default', name: 'GET /one', method: 'GET', url: '/one' },
      { id: 'two', collection: 'Default', name: 'GET /two', method: 'GET', url: '/two' }
    ]
  });

  assert.deepEqual(
    railRows.filter((row) => row.key === '1' || row.key === '4' || row.key === 'l')
      .map((row) => [row.key, row.label, row.summary, row.active]),
    [
      ['1', 'Params', '1', false],
      ['4', 'Auth', 'none', true],
      ['l', 'Library', '2', false]
    ]
  );
});

test('filterLogs narrows by method, status family, and search text', () => {
  const timestamp = 1700000000000;
  const traffic = [
    {
      id: 'one',
      method: 'GET',
      path: '/users',
      statusCode: 200,
      timestamp,
      request: { headers: { accept: 'application/json', host: 'localhost:8080' }, body: '' },
      response: { headers: { 'x-result': 'ok' }, body: 'Ada' }
    },
    {
      id: 'two',
      method: 'POST',
      path: '/sessions',
      statusCode: 500,
      timestamp,
      request: { headers: { host: 'localhost:9090', 'x-token': 'demo' }, body: 'email=demo@example.com' },
      response: { headers: { 'content-type': 'text/plain' }, body: 'Bad Gateway' }
    }
  ];
  const timeValue = getSearchValues(traffic[0], 'time')[0];

  assert.deepEqual(filterLogs(traffic, { methodFilter: 'POST' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { statusFilter: '5xx' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'ada' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'x-token' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'path', searchQuery: 'sessions' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'status', searchQuery: '500' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'port', searchQuery: '8080' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'time', searchQuery: timeValue }).map((log) => log.id), ['one', 'two']);
  assert.deepEqual(filterLogs(traffic, { searchField: 'body', searchQuery: 'gateway' }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, { methodFilters: ['GET', 'POST'] }).map((log) => log.id), ['one', 'two']);
  assert.deepEqual(filterLogs(traffic, { methodFilters: ['GET'], statusFilters: ['2xx'] }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { statusFilters: ['2xx', '5xx'] }).map((log) => log.id), ['one', 'two']);
});

test('filterLogs searches cold summary indexes without requiring full headers or bodies', () => {
  const timestamp = 1700000000000;
  const coldSummary = {
    id: 'summary',
    method: 'GET',
    path: '/cold',
    statusCode: 200,
    timestamp,
    request: { headers: {}, body: '' },
    response: { headers: {}, body: '' },
    search: {
      host: 'api.local:9443',
      port: '9443',
      requestHeaders: 'host: api.local:9443\nx-token: raw-secret',
      requestHeadersMasked: 'host: api.local:9443\nx-token: [hidden]',
      responseContentType: 'application/json',
      responseHeaders: 'content-type: application/json\nset-cookie: sid=raw',
      responseHeadersMasked: 'content-type: application/json\nset-cookie: [hidden]'
    },
    history: {
      cold: true,
      summaryOnly: true
    }
  };
  const coldAssetSummary = {
    ...coldSummary,
    id: 'asset',
    path: '/asset-proxy?id=logo',
    search: {
      ...coldSummary.search,
      responseContentType: 'image/png'
    }
  };
  const coldRscSummary = {
    ...coldSummary,
    id: 'rsc',
    path: '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63?_rsc=3hbm4',
    search: {
      ...coldSummary.search,
      responseContentType: 'text/x-component; charset=utf-8',
      responseHeaders: 'content-type: text/x-component\nx-matched-path: /b/[businessId].rsc',
      responseHeadersMasked: 'content-type: text/x-component\nx-matched-path: /b/[businessId].rsc'
    }
  };

  assert.deepEqual(getSearchValues(coldSummary, 'host'), ['api.local:9443']);
  assert.deepEqual(getSearchValues(coldSummary, 'port'), ['9443']);
  assert.deepEqual(filterLogs([coldSummary], {
    hideFrameworkAssets: false,
    searchField: 'headers',
    searchQuery: 'content-type: application/json'
  }).map((log) => log.id), ['summary']);
  assert.deepEqual(filterLogs([coldSummary], {
    hideFrameworkAssets: false,
    searchField: 'headers',
    searchQuery: 'raw-secret'
  }).map((log) => log.id), []);
  assert.deepEqual(filterLogs([coldSummary], {
    hideFrameworkAssets: false,
    searchField: 'headers',
    searchQuery: 'raw-secret',
    showCookieValues: true
  }).map((log) => log.id), ['summary']);
  assert.deepEqual(filterLogs([coldSummary], {
    hideFrameworkAssets: false,
    searchField: 'body',
    searchQuery: 'raw-secret'
  }).map((log) => log.id), []);
  assert.deepEqual(classifyFrameworkAssetRequest(coldAssetSummary), {
    framework: null,
    isAsset: true,
    reason: 'content-type'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(coldRscSummary), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(filterLogs([coldSummary, coldRscSummary]).map((log) => log.id), ['summary']);
  assert.deepEqual(filterLogs([coldSummary, coldRscSummary], {
    hideFrameworkAssets: false
  }).map((log) => log.id), ['summary', 'rsc']);
});

test('filterLogs auto-hides common frontend framework static traffic by default', () => {
  const createTraffic = (id, path, options = {}) => ({
    id,
    method: options.method ?? 'GET',
    path,
    statusCode: options.statusCode ?? 200,
    timestamp: 1700000000000,
    request: {
      headers: {
        host: 'localhost:3000',
        ...(options.requestHeaders ?? {})
      },
      body: options.requestBody ?? ''
    },
    response: { headers: options.responseHeaders ?? {}, body: options.responseBody ?? '' }
  });
  const traffic = [
    createTraffic('api', '/api/users', {
      responseBody: '{"ok":true}',
      responseHeaders: { 'content-type': 'application/json' }
    }),
    createTraffic('api-json', '/api/businesses', {
      responseBody: '{"items":[]}',
      responseHeaders: { 'content-type': 'application/json' }
    }),
    createTraffic('next', '/_next/static/chunks/app/layout.js?v=1'),
    createTraffic('next-rsc-query', '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63?_rsc=3hbm4', {
      responseHeaders: { 'content-type': 'text/plain' }
    }),
    createTraffic('next-rsc-matched', '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63', {
      responseHeaders: { 'x-matched-path': '/b/[businessId].rsc' }
    }),
    createTraffic('next-rsc-content-type', '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63', {
      responseHeaders: { 'content-type': 'text/x-component; charset=utf-8' }
    }),
    createTraffic('next-rsc-header', '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63', {
      requestHeaders: { rsc: '1', 'next-router-state-tree': '%5B%22%22%5D' }
    }),
    createTraffic('vite', '/@vite/client', { responseHeaders: { 'content-type': 'text/javascript' } }),
    createTraffic('nuxt', '/_nuxt/app.js'),
    createTraffic('astro', '/_astro/page.css'),
    createTraffic('sveltekit', '/_app/immutable/chunks/app.js'),
    createTraffic('remix', '/build/_assets/root-BHY.js'),
    createTraffic('gatsby', '/page-data/index/page-data.json'),
    createTraffic('webpack', '/webpack-dev-server/sockjs.bundle.js'),
    createTraffic('module', '/src/main.tsx?t=1700000000000'),
    createTraffic('image', '/asset-proxy?id=logo', { responseHeaders: { 'content-type': 'image/svg+xml' } }),
    createTraffic('post', '/_next/static/upload.js', { method: 'POST', requestBody: 'payload', statusCode: 201 }),
    createTraffic('post-rsc', '/b/bb56efed-5f5d-4db5-999a-73deb60a2f63?_rsc=3hbm4', { method: 'POST', requestBody: 'payload', statusCode: 201 })
  ];

  assert.deepEqual(traffic.map(isFrameworkAssetRequest), [
    false,
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    false
  ]);
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[2]), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'framework-path'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[3]), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[4]), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[5]), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[6]), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[7]), {
    framework: 'Vite',
    isAsset: true,
    reason: 'framework-path'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[8]).framework, 'Nuxt');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[9]).framework, 'Astro');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[10]).framework, 'SvelteKit');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[11]).framework, 'Remix');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[12]).framework, 'Gatsby');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[13]).framework, 'Webpack');
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[14]), {
    framework: null,
    isAsset: true,
    reason: 'source-module'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[15]), {
    framework: null,
    isAsset: true,
    reason: 'content-type'
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[16]), {
    framework: null,
    isAsset: false,
    reason: null
  });
  assert.deepEqual(classifyFrameworkAssetRequest(traffic[17]), {
    framework: null,
    isAsset: false,
    reason: null
  });
  assert.deepEqual(filterLogs(traffic).map((log) => log.id), ['api', 'api-json', 'post', 'post-rsc']);
  assert.deepEqual(filterLogs(traffic, { hideFrameworkAssets: false }).map((log) => log.id), traffic.map((log) => log.id));
  assert.deepEqual(summarizeFrameworkAssets(traffic), {
    additionalFrameworkCount: 7,
    assetCount: 14,
    framework: 'Next.js',
    frameworkCount: 5,
    frameworks: [
      { count: 5, framework: 'Next.js' },
      { count: 1, framework: 'Vite' },
      { count: 1, framework: 'Nuxt' },
      { count: 1, framework: 'Astro' },
      { count: 1, framework: 'SvelteKit' },
      { count: 1, framework: 'Remix' },
      { count: 1, framework: 'Gatsby' },
      { count: 1, framework: 'Webpack' }
    ]
  });
  assert.deepEqual(summarizeFrameworkAssets([traffic[0], traffic[1], traffic[16], traffic[17]]), {
    additionalFrameworkCount: 0,
    assetCount: 0,
    framework: null,
    frameworkCount: 0,
    frameworks: []
  });
  assert.equal(formatFrameworkDetectionLabel(summarizeFrameworkAssets(traffic)), 'Next.js?+7');
});

test('filter value helpers support multi-select and clearing', () => {
  const methods = ['GET', 'POST', 'PATCH'];

  assert.deepEqual(toggleFilterValue([], 'GET', methods), ['GET']);
  assert.deepEqual(toggleFilterValue(['GET'], 'POST', methods), ['GET', 'POST']);
  assert.deepEqual(toggleFilterValue(['GET', 'POST'], 'GET', methods), ['POST']);
  assert.deepEqual(toggleFilterValue(['GET', 'POST'], 'all', methods), []);
  assert.equal(countActiveFilters({
    methodFilters: ['GET', 'POST'],
    statusFilters: ['5xx'],
    searchQuery: 'error'
  }), 4);
  assert.equal(countActiveFilters({
    methodFilters: [],
    statusFilters: [],
    searchQuery: ''
  }), 0);
  assert.equal(formatFilterLabel([], [], 'all', 'id'), 'search "id" in all fields');
  assert.equal(formatFilterLabel(['GET', 'POST'], ['2xx'], 'path', 'users'), 'method GET,POST | status 2xx | search "users" in path');
  assert.equal(formatFilterLabel([], [], 'all', '', { hideFrameworkAssets: true }), 'framework hidden');
  assert.equal(formatFilterLabel([], [], 'all', '', {
    frameworkSummary: {
      additionalFrameworkCount: 1,
      assetCount: 12,
      framework: 'Next.js',
      frameworkCount: 9,
      frameworks: []
    },
    hideFrameworkAssets: true
  }), '12 hidden');
  assert.equal(formatFilterLabel([], [], 'all', '', {
    frameworkSummary: {
      additionalFrameworkCount: 0,
      assetCount: 12,
      framework: 'Vite',
      frameworkCount: 12,
      frameworks: []
    },
    hideFrameworkAssets: false
  }), '12 shown');
  assert.equal(formatFilterLabel([], [], 'body', 'secret', {
    coldEntryCount: 3
  }), 'search "secret" in body | cold bodies load on inspect');
  assert.equal(formatFilterLabel([], [], 'all', ''), 'none');
});

test('formatRecordingLabel exposes recording and pause states', () => {
  assert.equal(formatRecordingLabel(), 'rec off');
  assert.equal(formatRecordingLabel({
    mode: 'full',
    path: './capture.ndjson',
    state: 'recording',
    error: null
  }), 'rec full -> ./capture.ndjson');
  assert.equal(formatRecordingLabel({
    mode: 'partial',
    path: './capture.ndjson',
    state: 'paused',
    error: null
  }), 'rec paused partial -> ./capture.ndjson');
  assert.equal(formatRecordingLabel({
    mode: 'full',
    path: './capture.ndjson',
    state: 'error',
    error: 'disk full'
  }), 'rec error -> ./capture.ndjson');
});

test('search helpers expose scoped values', () => {
  const log = {
    method: 'GET',
    path: '/reports',
    statusCode: 204,
    timestamp: 1700000000000,
    request: {
      headers: { host: '[::1]:8080', accept: 'application/json' },
      body: 'request'
    },
    response: {
      headers: { 'x-result': 'empty' },
      body: 'response'
    }
  };

  assert.equal(extractPortFromHost('localhost:3000'), '3000');
  assert.equal(extractPortFromHost('[::1]:8080'), '8080');
  assert.equal(extractPortFromHost('example.com'), '');
  assert.deepEqual(getSearchValues(log, 'path'), ['/reports']);
  assert.deepEqual(getSearchValues(log, 'status'), ['204']);
  assert.deepEqual(getSearchValues(log, 'port'), ['8080']);
  assert.equal(getSearchValues(log, 'headers').some((value) => value.includes('x-result: empty')), true);
});

test('cookie headers are masked in details and search by default', () => {
  const log = {
    method: 'GET',
    path: '/cookie',
    statusCode: 200,
    timestamp: 1700000000000,
    request: {
      headers: {
        cookie: 'sid=secret; theme=dark',
        host: 'localhost:8080'
      },
      body: ''
    },
    response: {
      headers: {
        'set-cookie': ['sid=secret; Path=/; HttpOnly', 'theme=dark; Path=/']
      },
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request').slice(0, 3), [
    'Request headers',
    'cookie: sid=<redacted>; theme=<redacted>',
    'host: localhost:8080'
  ]);
  assert.deepEqual(getDetailLines(log, 'response').slice(0, 3), [
    'Response headers',
    'set-cookie: sid=<redacted>; Path=/; HttpOnly',
    'set-cookie: theme=<redacted>; Path=/'
  ]);
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'sid'
  }), [log]);
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'secret'
  }), []);
});

test('cookie headers can be shown and searched raw when enabled', () => {
  const log = {
    method: 'GET',
    path: '/cookie',
    statusCode: 200,
    timestamp: 1700000000000,
    request: {
      headers: {
        cookie: 'sid=secret'
      },
      body: ''
    },
    response: {
      headers: {
        'set-cookie': ['sid=secret; Path=/']
      },
      body: ''
    }
  };

  assert.equal(
    getDetailLines(log, 'request', { showCookieValues: true })[1],
    'cookie: sid=secret'
  );
  assert.deepEqual(filterLogs([log], {
    searchField: 'headers',
    searchQuery: 'secret',
    showCookieValues: true
  }), [log]);
});

test('public target request details display target host and referer', () => {
  const log = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'http://localhost:8080/some/path?x=1#section'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: https://example.com/some/path?x=1#section'
  ]);
  assert.equal(log.request.headers.host, 'localhost:8080');
  assert.equal(log.request.headers.referer, 'http://localhost:8080/some/path?x=1#section');
});

test('local target request details display original proxy headers', () => {
  const log = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'http://localhost:8080/local'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(log, 'request', {
    publicTargetUrl: 'http://localhost:3000/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: localhost:8080',
    'referer: http://localhost:8080/local'
  ]);
});

test('public target request details preserve third-party and malformed referers', () => {
  const thirdPartyLog = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'https://other.example/path'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };
  const malformedLog = {
    request: {
      headers: {
        host: 'localhost:8080',
        referer: 'not a url'
      },
      body: ''
    },
    response: {
      headers: {},
      body: ''
    }
  };

  assert.deepEqual(getDetailLines(thirdPartyLog, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: https://other.example/path'
  ]);
  assert.deepEqual(getDetailLines(malformedLog, 'request', {
    publicTargetUrl: 'https://example.com/',
    proxyOrigin: 'http://localhost:8080'
  }).slice(0, 3), [
    'Request headers',
    'host: example.com',
    'referer: not a url'
  ]);
});

test('detail helpers build scrollable request and response lines', () => {
  const log = {
    request: {
      headers: { accept: 'application/json' },
      body: 'request line 1\nrequest line 2',
      truncated: false
    },
    response: {
      headers: {},
      body: 'response body',
      truncated: true
    }
  };

  assert.deepEqual(cycleValue(['request', 'response'], 'request'), 'response');
  assert.deepEqual(cycleValue(['request', 'response'], 'response'), 'request');
  assert.deepEqual(cycleValue(['request', 'response'], 'request', -1), 'response');
  assert.deepEqual(getDetailLines(log, 'request'), [
    'Request headers',
    'accept: application/json',
    '',
    'Request body',
    'request line 1',
    'request line 2'
  ]);
  assert.deepEqual(getDetailLines(log, 'response'), [
    'Response headers',
    '(none)',
    '',
    'Response body',
    'response body',
    '[body truncated]'
  ]);
  assert.equal(getMaxScrollOffset(getDetailLines(log, 'request'), 4), 2);
});

test('response details omit compressed bodies that would corrupt the terminal', () => {
  const log = {
    request: { headers: {}, body: '' },
    response: {
      headers: {
        'content-encoding': 'zstd',
        'content-type': 'text/html; charset=utf-8'
      },
      body: '\u0000\u001B[31mbinary',
      truncated: true
    }
  };

  assert.deepEqual(getDetailLines(log, 'response'), [
    'Response headers',
    'content-encoding: zstd',
    'content-type: text/html; charset=utf-8',
    '',
    'Response body',
    '(compressed body not shown: zstd)',
    '[body truncated]'
  ]);
});

test('response details omit binary content types and sanitize text bodies', () => {
  const binaryLog = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'image/png' },
      body: 'png bytes',
      truncated: false
    }
  };
  const textLog = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'application/json' },
      body: 'line 1\r\nline 2\u001B[31m',
      truncated: false
    }
  };

  assert.deepEqual(getDetailLines(binaryLog, 'response').slice(3), [
    'Response body',
    '(binary body omitted: image/png)'
  ]);
  assert.deepEqual(getDetailLines(textLog, 'response').slice(3), [
    'Response body',
    'line 1\uFFFD',
    'line 2\uFFFD[31m'
  ]);
});

test('response details pretty-print JSON bodies and split long text lines', () => {
  const jsonLog = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: '{"id":"one","items":[{"name":"Ada"}]}',
      truncated: false
    }
  };
  const longTextLog = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/plain' },
      body: `${'a'.repeat(120)}b`,
      truncated: false
    }
  };

  assert.deepEqual(getDetailLines(jsonLog, 'response').slice(3), [
    'Response body | JSON',
    'v $ { 2 keys',
    '  id: "one"',
    '  v items: [ 1 items',
    '    v [0]: { 1 keys',
    '      name: "Ada"',
    '    }',
    '  ]',
    '}'
  ]);
  assert.deepEqual(getDetailLines(longTextLog, 'response').slice(3), [
    'Response body',
    'a'.repeat(120),
    'b'
  ]);
});

test('response details parse React Flight component streams', () => {
  const log = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/x-component' },
      body: [
        '0:["b","39d969ac",{"children":["business",{"name":"Ada"}]}]',
        '1:I{"module":"app/business"}',
        'not-a-flight-record'
      ].join('\n'),
      truncated: false
    }
  };
  const lines = getDetailLines(log, 'response');
  const rows = getDetailRows(log, 'response');

  assert.equal(lines[3], 'Response body | React Flight');
  assert.equal(lines.some((line) => line.includes('v flight: [ 3 items')), true);
  assert.equal(lines.some((line) => line.includes('malformed: true')), true);
  assert.equal(findDetailMatches(rows, 'flight[0].payload[2].children[1].name').length > 0, true);
});

test('response details parse mislabeled JSON, NDJSON, SSE, and form bodies', () => {
  const jsonRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/plain' },
      body: '{"ok":true}',
      truncated: false
    }
  }, 'response');
  const ndjsonRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/plain' },
      body: '{"id":1}\n{"id":2}',
      truncated: false
    }
  }, 'response');
  const sseRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/event-stream' },
      body: 'event: update\ndata: {"id":1,"name":"Ada"}\nid: a\n\n:data-only-comment\ndata: done\n',
      truncated: false
    }
  }, 'response');
  const formRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'locationId=abc&tag=one&tag=two',
      truncated: false
    }
  }, 'response');

  assert.equal(jsonRows[3].text, 'Response body | JSON');
  assert.equal(ndjsonRows[3].text, 'Response body | NDJSON');
  assert.equal(sseRows[3].text, 'Response body | SSE');
  assert.equal(formRows[3].text, 'Response body | Form');
  assert.equal(findDetailMatches(jsonRows, 'ok').length > 0, true);
  assert.equal(findDetailMatches(ndjsonRows, 'records[1].id').length > 0, true);
  assert.equal(findDetailMatches(sseRows, 'events[0].data.name').length > 0, true);
  assert.equal(findDetailMatches(formRows, 'form.locationId').length > 0, true);
  assert.equal(findDetailMatches(formRows, 'form.tag[1]').length > 0, true);
});

test('response details parse XML and HTML previews', () => {
  const xmlRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'application/xml' },
      body: '<root><item id="a">Ada</item></root>',
      truncated: false
    }
  }, 'response');
  const htmlRows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body><div id="app"><p>Hello</p></div></body></html>',
      truncated: false
    }
  }, 'response');

  assert.equal(xmlRows[3].text, 'Response body | XML');
  assert.equal(htmlRows[3].text, 'Response body | HTML');
  assert.equal(findDetailMatches(xmlRows, 'xml.root.item').length > 0, true);
  assert.equal(findDetailMatches(xmlRows, 'Ada').length > 0, true);
  assert.equal(findDetailMatches(htmlRows, 'html.body.div[0]').length > 0, true);
  assert.equal(findDetailMatches(htmlRows, 'Hello').length > 0, true);
});

test('detail headers wrap long values without overflowing the pane', () => {
  const reportTo = `{"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=${'x'.repeat(160)}"}]}`;
  const log = {
    request: { headers: {}, body: '' },
    response: {
      headers: { 'report-to': reportTo },
      body: ''
    }
  };
  const lines = getDetailLines(log, 'response');
  const rows = getDetailRows(log, 'response');
  const headerEndIndex = lines.indexOf('');
  const headerLines = lines.slice(1, headerEndIndex);
  const headerRows = rows.slice(1, headerEndIndex);

  assert.equal(headerLines[0].startsWith('report-to: '), true);
  assert.equal(headerLines[1].startsWith(' '.repeat('report-to: '.length)), true);
  assert.equal(headerLines.length > 1, true);
  assert.equal(headerLines.every((line) => line.length <= 120), true);
  assert.equal(headerRows.every((row) => row.path === 'headers.report-to'), true);
});

test('structured detail rows expose JSON path metadata and collapse summaries', () => {
  const payload = {
    headers: { 'content-type': 'application/json' },
    body: '{"items":[{"name":"Ada","active":true}],"total":1}',
    truncated: false
  };
  const rows = formatStructuredPayloadRows(payload);
  const collapsedRows = formatStructuredPayloadRows(payload, {
    collapsedPaths: ['items[0]']
  });

  assert.deepEqual(rows.map((row) => row.path).filter(Boolean).slice(0, 6), [
    '$',
    'items',
    'items[0]',
    'items[0].name',
    'items[0].active',
    'items[0]'
  ]);
  assert.equal(rows.find((row) => row.path === 'items[0]')?.collapsible, true);
  assert.equal(rows.find((row) => row.path === 'items[0].active')?.type, 'json-boolean');
  assert.equal(collapsedRows.find((row) => row.path === 'items[0]')?.text, '    > [0]: {...} 2 keys');
  assert.equal(collapsedRows.some((row) => row.path === 'items[0].name'), false);
});

test('detail search supports text regex paths and active match marking', () => {
  const rows = getDetailRows({
    request: { headers: {}, body: '' },
    response: {
      headers: { 'content-type': 'application/json' },
      body: '{"items":[{"name":"Ada"}],"total":1}',
      truncated: false
    }
  }, 'response');

  const pathMatches = findDetailMatches(rows, 'items[0].name');
  const regexMatches = findDetailMatches(rows, '/Ada|total/');
  const applied = applyDetailMatches(rows, pathMatches, 0);

  assert.equal(parseDetailSearchQuery('/Ada/i').kind, 'regex');
  assert.equal(parseDetailSearchQuery('/[/').kind, 'invalid');
  assert.equal(rows[pathMatches[0]].path, 'items[0].name');
  assert.equal(regexMatches.length, 2);
  assert.equal(applied[pathMatches[0]].isActiveMatch, true);
  assert.equal(getNextDetailMatchIndex([2, 5], 1, 1), 0);
  assert.equal(getNextDetailMatchIndex([2, 5], 0, -1), 1);
});
