const NAMED_KEY_ALIASES = new Map([
  ['esc', 'escape'],
  ['escape', 'escape'],
  ['return', 'enter'],
  ['enter', 'enter'],
  ['space', 'space'],
  ['spacebar', 'space'],
  ['tab', 'tab'],
  ['shift-tab', 'shift-tab'],
  ['shift+tab', 'shift-tab'],
  ['backspace', 'backspace'],
  ['delete', 'delete'],
  ['del', 'delete'],
  ['up', 'up'],
  ['uparrow', 'up'],
  ['arrowup', 'up'],
  ['down', 'down'],
  ['downarrow', 'down'],
  ['arrowdown', 'down'],
  ['left', 'left'],
  ['leftarrow', 'left'],
  ['arrowleft', 'left'],
  ['right', 'right'],
  ['rightarrow', 'right'],
  ['arrowright', 'right'],
  ['home', 'home'],
  ['end', 'end'],
  ['pageup', 'pageup'],
  ['page-up', 'pageup'],
  ['page up', 'pageup'],
  ['pagedown', 'pagedown'],
  ['page-down', 'pagedown'],
  ['page down', 'pagedown']
]);

const CONTROL_KEY_PREFIXES = ['ctrl-', 'ctrl+'];

export const DEFAULT_KEY_BINDINGS = Object.freeze({
  'global.quit': Object.freeze(['ctrl-c', 'ctrl-q']),
  'global.openCommandPrompt': Object.freeze([':', 'ctrl-:']),

  'command.close': Object.freeze(['escape']),
  'command.submit': Object.freeze(['enter']),
  'command.delete': Object.freeze(['backspace', 'delete']),
  'command.nextSuggestion': Object.freeze(['tab', 'down']),
  'command.previousSuggestion': Object.freeze(['up']),

  'export.cancel': Object.freeze(['escape', 'backspace']),
  'export.masked': Object.freeze(['m', 'M']),
  'export.raw': Object.freeze(['r', 'R']),

  'help.close': Object.freeze(['escape', 'h', 'q', 'ctrl-/', 'backspace']),

  'diff.close': Object.freeze(['escape', 'q', 'backspace']),
  'diff.nextChange': Object.freeze(['n', 'down', 'j']),
  'diff.previousChange': Object.freeze(['N', 'up', 'k']),
  'diff.pageDown': Object.freeze(['pagedown', ']']),
  'diff.pageUp': Object.freeze(['pageup', '[']),
  'diff.top': Object.freeze(['g']),
  'diff.bottom': Object.freeze(['G']),
  'diff.toggleLayout': Object.freeze(['v']),
  'diff.openFilter': Object.freeze(['/']),
  'diff.openFocusedRow': Object.freeze(['enter']),

  'diffValue.close': Object.freeze(['enter', 'escape', 'q', 'backspace']),
  'diffValue.scrollDown': Object.freeze(['j', 'down']),
  'diffValue.scrollUp': Object.freeze(['k', 'up']),
  'diffValue.pageDown': Object.freeze(['pagedown', ']']),
  'diffValue.pageUp': Object.freeze(['pageup', '[']),
  'diffValue.top': Object.freeze(['g']),
  'diffValue.bottom': Object.freeze(['G']),

  'listDisplay.close': Object.freeze(['escape', 'enter', 'backspace']),
  'listDisplay.moveDown': Object.freeze(['j', 'down']),
  'listDisplay.moveUp': Object.freeze(['k', 'up']),
  'listDisplay.previousOption': Object.freeze(['left']),
  'listDisplay.nextOption': Object.freeze(['right']),
  'listDisplay.toggleOption': Object.freeze(['space']),
  'listDisplay.reset': Object.freeze(['r']),

  'endpointGroups.close': Object.freeze(['escape', 'q', 'backspace']),
  'endpointGroups.moveDown': Object.freeze(['j', 'down']),
  'endpointGroups.moveUp': Object.freeze(['k', 'up']),
  'endpointGroups.pageDown': Object.freeze(['pagedown', ']']),
  'endpointGroups.pageUp': Object.freeze(['pageup', '[']),
  'endpointGroups.top': Object.freeze(['g']),
  'endpointGroups.bottom': Object.freeze(['G']),

  'schemaInference.close': Object.freeze(['escape', 'q', 'backspace']),
  'schemaInference.moveDown': Object.freeze(['j', 'down']),
  'schemaInference.moveUp': Object.freeze(['k', 'up']),
  'schemaInference.pageDown': Object.freeze(['pagedown', ']']),
  'schemaInference.pageUp': Object.freeze(['pageup', '[']),
  'schemaInference.top': Object.freeze(['g']),
  'schemaInference.bottom': Object.freeze(['G']),
  'schemaInference.nextGroup': Object.freeze(['n']),
  'schemaInference.previousGroup': Object.freeze(['N']),

  'flowAnalysis.close': Object.freeze(['escape', 'q', 'backspace']),
  'flowAnalysis.inspect': Object.freeze(['enter']),
  'flowAnalysis.moveDown': Object.freeze(['j', 'down']),
  'flowAnalysis.moveUp': Object.freeze(['k', 'up']),
  'flowAnalysis.pageDown': Object.freeze(['pagedown', ']']),
  'flowAnalysis.pageUp': Object.freeze(['pageup', '[']),
  'flowAnalysis.top': Object.freeze(['g']),
  'flowAnalysis.bottom': Object.freeze(['G']),

  'resend.confirm': Object.freeze(['enter', 'y', 'Y']),
  'resend.edit': Object.freeze(['E', 'e']),
  'resend.cancel': Object.freeze(['escape', 'n', 'N', 'backspace']),

  'composerConfirm.confirm': Object.freeze(['enter', 'y', 'Y']),
  'composerConfirm.cancel': Object.freeze(['escape', 'n', 'N', 'backspace']),

  'composerLibrary.close': Object.freeze(['escape', 'l', 'backspace']),
  'composerLibrary.open': Object.freeze(['enter']),
  'composerLibrary.moveDown': Object.freeze(['j', 'down']),
  'composerLibrary.moveUp': Object.freeze(['k', 'up']),
  'composerLibrary.selectTab.params': Object.freeze(['1']),
  'composerLibrary.selectTab.headers': Object.freeze(['2']),
  'composerLibrary.selectTab.body': Object.freeze(['3']),
  'composerLibrary.selectTab.auth': Object.freeze(['4']),
  'composerLibrary.selectTab.cookies': Object.freeze(['5']),
  'composerLibrary.selectTab.env': Object.freeze(['6']),
  'composerLibrary.selectTab.save': Object.freeze(['7']),

  'composerBody.close': Object.freeze(['escape']),
  'composerBody.newline': Object.freeze(['enter']),
  'composerBody.backspace': Object.freeze(['backspace']),
  'composerBody.delete': Object.freeze(['delete']),
  'composerBody.cursorLeft': Object.freeze(['left']),
  'composerBody.cursorRight': Object.freeze(['right']),
  'composerBody.cursorStart': Object.freeze(['home']),
  'composerBody.cursorEnd': Object.freeze(['end']),

  'composer.close': Object.freeze(['escape']),
  'composer.preview': Object.freeze(['enter']),
  'composer.previousTab': Object.freeze(['[']),
  'composer.nextTab': Object.freeze([']']),
  'composer.previousField': Object.freeze(['shift-tab', 'up']),
  'composer.nextField': Object.freeze(['tab', 'down']),
  'composer.addRow': Object.freeze(['a']),
  'composer.deleteRow': Object.freeze(['d']),
  'composer.toggleField': Object.freeze(['space']),
  'composer.save': Object.freeze(['s']),
  'composer.openLibrary': Object.freeze(['l']),
  'composer.revealSecrets': Object.freeze(['R']),
  'composer.openBodyEditor': Object.freeze(['o']),
  'composer.previousOption': Object.freeze(['left']),
  'composer.nextOption': Object.freeze(['right']),
  'composer.cursorStart': Object.freeze(['home']),
  'composer.cursorEnd': Object.freeze(['end']),
  'composer.backspace': Object.freeze(['backspace']),
  'composer.delete': Object.freeze(['delete']),
  'composer.selectTab.params': Object.freeze(['1']),
  'composer.selectTab.headers': Object.freeze(['2']),
  'composer.selectTab.body': Object.freeze(['3']),
  'composer.selectTab.auth': Object.freeze(['4']),
  'composer.selectTab.cookies': Object.freeze(['5']),
  'composer.selectTab.env': Object.freeze(['6']),
  'composer.selectTab.save': Object.freeze(['7']),

  'detailSearch.close': Object.freeze(['escape', 'enter']),
  'detailSearch.backspace': Object.freeze(['backspace']),
  'detailSearch.delete': Object.freeze(['delete']),

  'detail.close': Object.freeze(['escape', 'q', 'backspace']),
  'detail.copy': Object.freeze(['y']),
  'detail.download': Object.freeze(['D']),
  'detail.openSearch': Object.freeze(['/']),
  'detail.hintResend': Object.freeze(['R']),
  'detail.editRequest': Object.freeze(['E', 'e']),
  'detail.nextMatch': Object.freeze(['n']),
  'detail.previousMatch': Object.freeze(['N']),
  'detail.toggleTab': Object.freeze(['r']),
  'detail.previousTab': Object.freeze(['left']),
  'detail.nextTab': Object.freeze(['right']),
  'detail.toggleNode': Object.freeze(['enter']),
  'detail.scrollDown': Object.freeze(['j', 'down']),
  'detail.scrollUp': Object.freeze(['k', 'up']),
  'detail.pageDown': Object.freeze(['pagedown', ']']),
  'detail.pageUp': Object.freeze(['pageup', '[']),
  'detail.halfPageDown': Object.freeze(['ctrl-d']),
  'detail.halfPageUp': Object.freeze(['ctrl-u']),
  'detail.top': Object.freeze(['g']),
  'detail.bottom': Object.freeze(['G']),

  'filter.close': Object.freeze(['escape', 'enter']),
  'filter.clear': Object.freeze(['x']),
  'filter.nextField': Object.freeze(['tab', 'down']),
  'filter.previousField': Object.freeze(['up']),
  'filter.nextOption': Object.freeze(['right']),
  'filter.previousOption': Object.freeze(['left']),
  'filter.toggleOption': Object.freeze(['space']),
  'filter.backspace': Object.freeze(['backspace']),
  'filter.delete': Object.freeze(['delete']),

  'main.openHelp': Object.freeze(['h', 'ctrl-/']),
  'main.openListDisplay': Object.freeze(['L']),
  'main.cyclePathDisplay': Object.freeze(['t']),
  'main.cycleDensity': Object.freeze(['v']),
  'main.cyclePaneWidth': Object.freeze(['w']),
  'main.copy': Object.freeze(['y']),
  'main.download': Object.freeze(['D']),
  'main.markDiffBase': Object.freeze(['a']),
  'main.clearDiffBase': Object.freeze(['u']),
  'main.openDiff': Object.freeze(['b']),
  'main.openComposer': Object.freeze(['n']),
  'main.hintResend': Object.freeze(['R']),
  'main.editRequest': Object.freeze(['E', 'e']),
  'main.openLibrary': Object.freeze(['l']),
  'main.hintQuit': Object.freeze(['q']),
  'main.openSearch': Object.freeze(['/']),
  'main.clearFilter': Object.freeze(['x']),
  'main.hintClear': Object.freeze(['c']),
  'main.followLatest': Object.freeze(['f']),
  'main.openDetailModal': Object.freeze(['o']),
  'main.inspect': Object.freeze(['enter']),
  'main.methodFilter': Object.freeze(['m']),
  'main.hintPause': Object.freeze(['p']),
  'main.hintRecord': Object.freeze(['P']),
  'main.hintStopRecording': Object.freeze(['S']),
  'main.toggleDetailTab': Object.freeze(['r']),
  'main.previousDetailTab': Object.freeze(['left']),
  'main.nextDetailTab': Object.freeze(['right']),
  'main.statusFilter': Object.freeze(['s']),
  'main.nextMatch': Object.freeze(['n']),
  'main.previousMatch': Object.freeze(['N']),
  'main.toggleFocus': Object.freeze(['tab']),
  'main.moveDown': Object.freeze(['j', 'down']),
  'main.moveUp': Object.freeze(['k', 'up']),
  'main.pageDown': Object.freeze(['pagedown', ']']),
  'main.pageUp': Object.freeze(['pageup', '[']),
  'main.halfPageDown': Object.freeze(['ctrl-d']),
  'main.halfPageUp': Object.freeze(['ctrl-u']),
  'main.top': Object.freeze(['g']),
  'main.bottom': Object.freeze(['G']),
  'main.toggleFrameworkAssets': Object.freeze(['F']),
  'main.toggleAnomalies': Object.freeze(['A'])
});

const ACTION_CONTEXT_GROUPS = [
  ['global.quit', 'global.openCommandPrompt'],
  ['command.close', 'command.submit', 'command.delete', 'command.nextSuggestion', 'command.previousSuggestion'],
  ['export.cancel', 'export.masked', 'export.raw'],
  ['help.close'],
  [
    'diff.close',
    'diff.nextChange',
    'diff.previousChange',
    'diff.pageDown',
    'diff.pageUp',
    'diff.top',
    'diff.bottom',
    'diff.toggleLayout',
    'diff.openFilter',
    'diff.openFocusedRow'
  ],
  [
    'diffValue.close',
    'diffValue.scrollDown',
    'diffValue.scrollUp',
    'diffValue.pageDown',
    'diffValue.pageUp',
    'diffValue.top',
    'diffValue.bottom'
  ],
  [
    'listDisplay.close',
    'listDisplay.moveDown',
    'listDisplay.moveUp',
    'listDisplay.previousOption',
    'listDisplay.nextOption',
    'listDisplay.toggleOption',
    'listDisplay.reset'
  ],
  [
    'endpointGroups.close',
    'endpointGroups.moveDown',
    'endpointGroups.moveUp',
    'endpointGroups.pageDown',
    'endpointGroups.pageUp',
    'endpointGroups.top',
    'endpointGroups.bottom'
  ],
  [
    'schemaInference.close',
    'schemaInference.moveDown',
    'schemaInference.moveUp',
    'schemaInference.pageDown',
    'schemaInference.pageUp',
    'schemaInference.top',
    'schemaInference.bottom',
    'schemaInference.nextGroup',
    'schemaInference.previousGroup'
  ],
  [
    'flowAnalysis.close',
    'flowAnalysis.inspect',
    'flowAnalysis.moveDown',
    'flowAnalysis.moveUp',
    'flowAnalysis.pageDown',
    'flowAnalysis.pageUp',
    'flowAnalysis.top',
    'flowAnalysis.bottom'
  ],
  ['resend.confirm', 'resend.edit', 'resend.cancel'],
  ['composerConfirm.confirm', 'composerConfirm.cancel'],
  [
    'composerLibrary.close',
    'composerLibrary.open',
    'composerLibrary.moveDown',
    'composerLibrary.moveUp',
    'composerLibrary.selectTab.params',
    'composerLibrary.selectTab.headers',
    'composerLibrary.selectTab.body',
    'composerLibrary.selectTab.auth',
    'composerLibrary.selectTab.cookies',
    'composerLibrary.selectTab.env',
    'composerLibrary.selectTab.save'
  ],
  [
    'composerBody.close',
    'composerBody.newline',
    'composerBody.backspace',
    'composerBody.delete',
    'composerBody.cursorLeft',
    'composerBody.cursorRight',
    'composerBody.cursorStart',
    'composerBody.cursorEnd'
  ],
  [
    'composer.close',
    'composer.preview',
    'composer.previousTab',
    'composer.nextTab',
    'composer.previousField',
    'composer.nextField',
    'composer.addRow',
    'composer.deleteRow',
    'composer.toggleField',
    'composer.save',
    'composer.openLibrary',
    'composer.revealSecrets',
    'composer.openBodyEditor',
    'composer.previousOption',
    'composer.nextOption',
    'composer.cursorStart',
    'composer.cursorEnd',
    'composer.backspace',
    'composer.delete',
    'composer.selectTab.params',
    'composer.selectTab.headers',
    'composer.selectTab.body',
    'composer.selectTab.auth',
    'composer.selectTab.cookies',
    'composer.selectTab.env',
    'composer.selectTab.save'
  ],
  ['detailSearch.close', 'detailSearch.backspace', 'detailSearch.delete'],
  [
    'detail.close',
    'detail.copy',
    'detail.download',
    'detail.openSearch',
    'detail.hintResend',
    'detail.editRequest',
    'detail.nextMatch',
    'detail.previousMatch',
    'detail.toggleTab',
    'detail.previousTab',
    'detail.nextTab',
    'detail.toggleNode',
    'detail.scrollDown',
    'detail.scrollUp',
    'detail.pageDown',
    'detail.pageUp',
    'detail.halfPageDown',
    'detail.halfPageUp',
    'detail.top',
    'detail.bottom'
  ],
  [
    'filter.close',
    'filter.clear',
    'filter.nextField',
    'filter.previousField',
    'filter.nextOption',
    'filter.previousOption',
    'filter.toggleOption',
    'filter.backspace',
    'filter.delete'
  ],
  [
    'main.openHelp',
    'main.openListDisplay',
    'main.cyclePathDisplay',
    'main.cycleDensity',
    'main.cyclePaneWidth',
    'main.copy',
    'main.download',
    'main.markDiffBase',
    'main.clearDiffBase',
    'main.openDiff',
    'main.openComposer',
    'main.hintResend',
    'main.editRequest',
    'main.openLibrary',
    'main.hintQuit',
    'main.openSearch',
    'main.clearFilter',
    'main.hintClear',
    'main.followLatest',
    'main.openDetailModal',
    'main.inspect',
    'main.methodFilter',
    'main.hintPause',
    'main.hintRecord',
    'main.hintStopRecording',
    'main.toggleDetailTab',
    'main.previousDetailTab',
    'main.nextDetailTab',
    'main.statusFilter',
    'main.toggleFocus',
    'main.moveDown',
    'main.moveUp',
    'main.pageDown',
    'main.pageUp',
    'main.halfPageDown',
    'main.halfPageUp',
    'main.top',
    'main.bottom',
    'main.toggleFrameworkAssets',
    'main.toggleAnomalies'
  ],
  [
    'main.openHelp',
    'main.openListDisplay',
    'main.cyclePathDisplay',
    'main.cycleDensity',
    'main.cyclePaneWidth',
    'main.copy',
    'main.download',
    'main.markDiffBase',
    'main.clearDiffBase',
    'main.openDiff',
    'main.hintResend',
    'main.editRequest',
    'main.openLibrary',
    'main.hintQuit',
    'main.openSearch',
    'main.clearFilter',
    'main.hintClear',
    'main.followLatest',
    'main.openDetailModal',
    'main.inspect',
    'main.methodFilter',
    'main.hintPause',
    'main.hintRecord',
    'main.hintStopRecording',
    'main.toggleDetailTab',
    'main.previousDetailTab',
    'main.nextDetailTab',
    'main.statusFilter',
    'main.nextMatch',
    'main.previousMatch',
    'main.toggleFocus',
    'main.moveDown',
    'main.moveUp',
    'main.pageDown',
    'main.pageUp',
    'main.halfPageDown',
    'main.halfPageUp',
    'main.top',
    'main.bottom',
    'main.toggleFrameworkAssets',
    'main.toggleAnomalies'
  ]
];

function cloneDefaultBindings() {
  return Object.fromEntries(Object.entries(DEFAULT_KEY_BINDINGS).map(([actionId, tokens]) => [actionId, [...tokens]]));
}

function normalizeControlKeyToken(token) {
  const lowerToken = token.toLowerCase();
  const prefix = CONTROL_KEY_PREFIXES.find((candidate) => lowerToken.startsWith(candidate));

  if (!prefix) {
    return null;
  }

  const rawControlKey = token.slice(prefix.length);
  const controlKey = rawControlKey.length === 1
    ? normalizeKeyToken(rawControlKey)
    : NAMED_KEY_ALIASES.get(rawControlKey.toLowerCase());

  if (!controlKey || controlKey.length !== 1) {
    return null;
  }

  return `ctrl-${/^[A-Z]$/.test(controlKey) ? controlKey.toLowerCase() : controlKey}`;
}

export function normalizeKeyToken(token) {
  if (token === ' ') {
    return 'space';
  }
  if (typeof token !== 'string') {
    return null;
  }
  const rawToken = token.trim();
  if (!rawToken) {
    return null;
  }
  if (rawToken.length === 1) {
    const code = rawToken.charCodeAt(0);
    return code >= 0x20 && code !== 0x7f ? rawToken : null;
  }

  const lowerToken = rawToken.toLowerCase();
  const controlToken = normalizeControlKeyToken(rawToken);
  if (controlToken) {
    return controlToken;
  }

  return NAMED_KEY_ALIASES.get(lowerToken) ?? null;
}

function normalizeBindingList(actionId, value, warnings) {
  if (!Array.isArray(value) || value.length === 0) {
    warnings.push(`invalid key binding for ${actionId}; expected a non-empty array`);
    return null;
  }

  const normalizedTokens = [];
  const seenTokens = new Set();
  for (const token of value) {
    const normalizedToken = normalizeKeyToken(token);
    if (!normalizedToken) {
      warnings.push(`invalid key token for ${actionId}: ${String(token)}`);
      return null;
    }
    if (!seenTokens.has(normalizedToken)) {
      seenTokens.add(normalizedToken);
      normalizedTokens.push(normalizedToken);
    }
  }
  return normalizedTokens;
}

function getConfigKeyBindings(input, warnings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  if (Object.hasOwn(input, 'schemaVersion') || Object.hasOwn(input, 'keyBindings')) {
    if (input.keyBindings === undefined) {
      return {};
    }
    if (!input.keyBindings || typeof input.keyBindings !== 'object' || Array.isArray(input.keyBindings)) {
      warnings.push('invalid keyBindings config; expected an object');
      return {};
    }

    return input.keyBindings;
  }

  if (input.keyBindings && typeof input.keyBindings === 'object') {
    return input.keyBindings;
  }
  return input;
}

function removeDuplicateBindings(bindings, warnings) {
  const nextBindings = Object.fromEntries(Object.entries(bindings).map(([actionId, tokens]) => [actionId, [...tokens]]));

  for (const group of ACTION_CONTEXT_GROUPS) {
    const claimedTokens = new Map();
    for (const actionId of group) {
      const tokens = nextBindings[actionId] ?? [];
      const keptTokens = [];
      for (const token of tokens) {
        const claimingAction = claimedTokens.get(token);
        if (claimingAction) {
          warnings.push(`duplicate key binding ${formatKeyToken(token)} for ${actionId}; ${claimingAction} keeps it`);
          continue;
        }
        claimedTokens.set(token, actionId);
        keptTokens.push(token);
      }
      nextBindings[actionId] = keptTokens;
    }
  }

  return nextBindings;
}

export function normalizeKeyBindings(input = {}) {
  const bindings = cloneDefaultBindings();
  const warnings = [];
  const requestedBindings = getConfigKeyBindings(input, warnings);

  for (const [actionId, value] of Object.entries(requestedBindings)) {
    if (!Object.hasOwn(DEFAULT_KEY_BINDINGS, actionId)) {
      warnings.push(`unknown key binding action ignored: ${actionId}`);
      continue;
    }
    const normalizedTokens = normalizeBindingList(actionId, value, warnings);
    if (normalizedTokens) {
      bindings[actionId] = normalizedTokens;
    }
  }

  return {
    bindings: removeDuplicateBindings(bindings, warnings),
    warnings
  };
}

export function getInputKeyTokens(input = '', key = {}) {
  const tokens = [];
  const push = (token) => {
    if (token && !tokens.includes(token)) {
      tokens.push(token);
    }
  };

  if (typeof input === 'string') {
    if (input === '\u001B[A') {
      push('up');
    }
    if (input === '\u001BOA') {
      push('up');
    }
    if (input === '\u001B[B') {
      push('down');
    }
    if (input === '\u001BOB') {
      push('down');
    }
    if (input === '\u001B[C') {
      push('right');
    }
    if (input === '\u001BOC') {
      push('right');
    }
    if (input === '\u001B[D') {
      push('left');
    }
    if (input === '\u001BOD') {
      push('left');
    }
    if (input === '\u001B[H') {
      push('home');
    }
    if (input === '\u001BOH') {
      push('home');
    }
    if (input === '\u001B[F') {
      push('end');
    }
    if (input === '\u001BOF') {
      push('end');
    }
    if (input === '\u001B[5~') {
      push('pageup');
    }
    if (input === '\u001B[6~') {
      push('pagedown');
    }
  }

  if (typeof input === 'string' && input.length === 1) {
    const code = input.charCodeAt(0);

    if (code >= 1 && code <= 26) {
      push(`ctrl-${String.fromCharCode(code + 96)}`);
    }
    if (code === 0x1f) {
      push('ctrl-/');
    }
    if (code === 0x7f) {
      push('ctrl-?');
    }
  }

  if (key.ctrl && typeof input === 'string' && input.length === 1) {
    const normalizedToken = normalizeKeyToken(input);
    if (normalizedToken?.length === 1) {
      push(`ctrl-${/^[A-Z]$/.test(normalizedToken) ? normalizedToken.toLowerCase() : normalizedToken}`);
    }
  }

  if (key.escape) {
    push('escape');
  }
  if (key.return) {
    push('enter');
  }
  if (key.shiftTab || (key.shift && key.tab)) {
    push('shift-tab');
  } else if (key.tab) {
    push('tab');
  }
  if (key.upArrow) {
    push('up');
  }
  if (key.downArrow) {
    push('down');
  }
  if (key.leftArrow) {
    push('left');
  }
  if (key.rightArrow) {
    push('right');
  }
  if (key.pageUp) {
    push('pageup');
  }
  if (key.pageDown) {
    push('pagedown');
  }
  if (key.home) {
    push('home');
  }
  if (key.end) {
    push('end');
  }
  if (key.backspace || key.delete || input === '\u007F' || input === '\b') {
    push('backspace');
  }
  if (input === '\u001B[3~') {
    push('delete');
  }
  if (!key.ctrl && !key.meta && typeof input === 'string' && input.length === 1) {
    const normalizedToken = normalizeKeyToken(input);
    if (normalizedToken) {
      push(normalizedToken);
    }
  }

  return tokens;
}

export function matchesKeyBinding(input, key, bindings, actionId) {
  const activeBindings = bindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];
  if (!activeBindings.length) {
    return false;
  }
  const pressedTokens = getInputKeyTokens(input, key);
  return pressedTokens.some((token) => activeBindings.includes(token));
}

export function formatKeyToken(token) {
  if (token === 'escape') {
    return 'esc';
  }
  if (token === 'enter') {
    return 'enter';
  }
  if (token === 'shift-tab') {
    return 'shift-tab';
  }
  if (token === 'space') {
    return 'space';
  }
  if (token === 'pageup') {
    return 'PageUp';
  }
  if (token === 'pagedown') {
    return 'PageDown';
  }
  if (token === 'ctrl-c') {
    return 'Ctrl-C';
  }
  if (token.startsWith('ctrl-')) {
    return `Ctrl-${token.slice(5)}`;
  }
  return token;
}

function compactLabelTokens(tokens) {
  const displayedLetters = new Set();
  const compactedTokens = [];
  for (const token of tokens) {
    if (/^[a-zA-Z]$/.test(token)) {
      const letterKey = token.toLowerCase();
      if (displayedLetters.has(letterKey)) {
        continue;
      }
      displayedLetters.add(letterKey);
    }
    compactedTokens.push(token);
  }
  return compactedTokens;
}

export function getBindingLabel(bindings, actionId, options = {}) {
  const tokens = compactLabelTokens(bindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? []);
  if (!tokens.length) {
    return 'unbound';
  }
  const limitedTokens = Number.isInteger(options.limit) ? tokens.slice(0, options.limit) : tokens;
  return limitedTokens.map(formatKeyToken).join(options.separator ?? '/');
}

function choosePairToken(tokens) {
  if (!tokens?.length) {
    return null;
  }
  const printableToken = tokens.find((token) => token.length === 1);
  return printableToken ?? tokens[0];
}

export function getBindingPairLabel(bindings, firstActionId, secondActionId, options = {}) {
  const firstToken = choosePairToken(bindings?.[firstActionId] ?? DEFAULT_KEY_BINDINGS[firstActionId] ?? []);
  const secondToken = choosePairToken(bindings?.[secondActionId] ?? DEFAULT_KEY_BINDINGS[secondActionId] ?? []);
  const separator = options.separator ?? '/';
  if (!firstToken && !secondToken) {
    return 'unbound';
  }
  if (!firstToken) {
    return formatKeyToken(secondToken);
  }
  if (!secondToken) {
    return formatKeyToken(firstToken);
  }
  if (firstToken.startsWith('ctrl-') && secondToken.startsWith('ctrl-')) {
    return `Ctrl-${firstToken.slice(5)}${separator}${secondToken.slice(5)}`;
  }
  return `${formatKeyToken(firstToken)}${separator}${formatKeyToken(secondToken)}`;
}
