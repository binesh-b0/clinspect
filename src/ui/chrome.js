import React from 'react';
import { Box, Text } from 'ink';
import {
  COMMAND_MODAL_HEIGHT,
  COMMAND_MODAL_MAX_WIDTH,
  COMMAND_MODAL_MIN_WIDTH,
  LIST_DISPLAY_FOCUS_ORDER,
  OFF_RECORDING_STATUS,
  h,
  pad,
  truncate
} from './shared.js';
import { normalizeTrafficListDisplay } from './traffic.js';
import {
  COMMAND_DEFINITIONS,
  formatCommandSelectionStatus,
  getCommandMatches,
  getCommandSuggestionRows
} from './commands.js';
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyToken,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';

const COMPOSER_TAB_ACTION_IDS = [
  'composer.selectTab.params',
  'composer.selectTab.headers',
  'composer.selectTab.body',
  'composer.selectTab.auth',
  'composer.selectTab.cookies',
  'composer.selectTab.env',
  'composer.selectTab.save'
];

function getActionLabel(bindings, actionId, options = {}) {
  return getBindingLabel(bindings, actionId, options);
}

function getActionPairLabel(bindings, firstActionId, secondActionId, options = {}) {
  return getBindingPairLabel(bindings, firstActionId, secondActionId, options);
}

function getComposerTabLabel(bindings) {
  const labels = COMPOSER_TAB_ACTION_IDS.map((actionId) => getActionLabel(bindings, actionId, { limit: 1 }));

  return labels.join('/') === '1/2/3/4/5/6/7' ? '1-7' : labels.join('/');
}

function getNthActionLabel(bindings, actionId, index = 0) {
  const tokens = bindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];
  const token = tokens[index] ?? tokens[0];
  return token ? formatKeyToken(token) : 'unbound';
}

function getPreviewSendLabel(bindings) {
  const previewLabel = getActionLabel(bindings, 'composer.preview', { limit: 1 });
  const confirmTokens = bindings?.['composerConfirm.confirm'] ?? DEFAULT_KEY_BINDINGS['composerConfirm.confirm'];
  const confirmToken = confirmTokens.find((token) => formatKeyToken(token) !== previewLabel) ?? confirmTokens[0];

  return `${previewLabel}/${confirmToken ? formatKeyToken(confirmToken) : 'unbound'}`;
}

function getCommandSuggestionLabel(bindings) {
  const next = getActionLabel(bindings, 'command.nextSuggestion');
  const previous = getActionLabel(bindings, 'command.previousSuggestion');

  return next === 'tab/down' && previous === 'up' ? 'tab/up/down' : `${next}/${previous}`;
}

function getActionTokens(bindings, actionId) {
  return bindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];
}

function getActionLabelExcluding(bindings, actionId, excludedActionId, options = {}) {
  const excludedTokens = new Set(getActionTokens(bindings, excludedActionId));
  const tokens = getActionTokens(bindings, actionId).filter((token) => !excludedTokens.has(token));
  const activeTokens = tokens.length > 0 ? tokens : getActionTokens(bindings, actionId);
  const limitedTokens = Number.isInteger(options.limit) ? activeTokens.slice(0, options.limit) : activeTokens;

  return limitedTokens.length > 0
    ? limitedTokens.map(formatKeyToken).join(options.separator ?? '/')
    : 'unbound';
}

function normalizeHelpSurface(context) {
  if (typeof context === 'string') {
    return context;
  }

  return context?.surface ?? '';
}

function getDefaultHelpSections(keyBindings = DEFAULT_KEY_BINDINGS) {
  return [
    {
      title: 'Move',
      rows: [
        [getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp'), 'move line'],
        [getActionPairLabel(keyBindings, 'main.pageUp', 'main.pageDown', { separator: ' / ' }), 'move page'],
        [getActionPairLabel(keyBindings, 'main.halfPageUp', 'main.halfPageDown'), 'move half page'],
        [getActionPairLabel(keyBindings, 'main.top', 'main.bottom'), 'top / bottom'],
        [getActionLabel(keyBindings, 'main.toggleFocus'), 'switch pane']
      ]
    },
    {
      title: 'Inspect',
      rows: [
        [getActionLabel(keyBindings, 'main.inspect'), 'inspect row'],
        [getActionLabel(keyBindings, 'main.toggleDetailTab'), 'request / response'],
        [getActionLabel(keyBindings, 'main.openDetailModal'), 'details modal'],
        [getActionLabel(keyBindings, 'main.openSearch'), 'find details'],
        [getActionPairLabel(keyBindings, 'main.nextMatch', 'main.previousMatch', { separator: ' / ' }), 'next / previous match'],
        ['wheel', 'scroll pane']
      ]
    },
    {
      title: 'Diff',
      rows: [
        [getActionLabel(keyBindings, 'main.markDiffBase', { limit: 1 }), 'mark A'],
        [getActionLabel(keyBindings, 'main.clearDiffBase', { limit: 1 }), 'unmark A'],
        [getActionLabel(keyBindings, 'main.openDiff', { limit: 1 }), 'compare with A'],
        [getActionPairLabel(keyBindings, 'diff.nextChange', 'diff.previousChange'), 'next / previous change'],
        [getActionPairLabel(keyBindings, 'diff.pageUp', 'diff.pageDown', { separator: ' / ' }), 'move page'],
        [getActionPairLabel(keyBindings, 'diff.top', 'diff.bottom'), 'top / bottom'],
        [getActionLabel(keyBindings, 'diff.toggleLayout', { limit: 1 }), 'toggle layout'],
        [getActionLabel(keyBindings, 'diff.openFilter', { limit: 1 }), 'filter rows'],
        [getActionLabel(keyBindings, 'diff.openFocusedRow', { limit: 1 }), 'open full row'],
        [getActionLabel(keyBindings, 'diff.close', { limit: 2 }), 'close diff']
      ]
    },
    {
      title: 'Filter',
      rows: [
        [getActionLabel(keyBindings, 'main.openSearch'), 'text search'],
        [getActionPairLabel(keyBindings, 'main.methodFilter', 'main.statusFilter', { separator: ' / ' }), 'method / status'],
        [getActionLabel(keyBindings, 'filter.toggleOption'), 'toggle option'],
        [getActionLabel(keyBindings, 'filter.clear'), 'clear filters']
      ]
    },
    {
      title: 'Compose',
      rows: [
        [getActionLabel(keyBindings, 'main.openComposer'), 'new request'],
        [getActionLabel(keyBindings, 'main.editRequest', { limit: 1 }), 'edit and resend'],
        [getNthActionLabel(keyBindings, 'detail.editRequest', 1), 'edit selected request'],
        [getActionLabel(keyBindings, 'main.openLibrary'), 'saved requests'],
        [getComposerTabLabel(keyBindings), 'jump sections'],
        [getActionPairLabel(keyBindings, 'composer.addRow', 'composer.deleteRow'), 'add / delete row'],
        [getActionLabel(keyBindings, 'composer.toggleField'), 'enable / disable row'],
        [getPreviewSendLabel(keyBindings), 'preview / send'],
        [getActionLabel(keyBindings, 'composer.close'), 'close composer']
      ]
    },
    {
      title: 'Display / Export',
      rows: [
        [getActionLabel(keyBindings, 'main.cyclePathDisplay'), 'cycle path mode'],
        [getActionLabel(keyBindings, 'main.cycleDensity'), 'cycle list density'],
        [getActionLabel(keyBindings, 'main.cyclePaneWidth'), 'cycle pane width'],
        [getActionLabel(keyBindings, 'main.toggleFrameworkAssets'), 'show / hide framework'],
        [getActionLabel(keyBindings, 'main.openListDisplay'), 'list display modal'],
        [getActionLabel(keyBindings, 'main.copy'), 'copy item'],
        [getActionLabel(keyBindings, 'main.download'), 'download item'],
        [getActionPairLabel(keyBindings, 'export.masked', 'export.raw', { separator: ' / ' }), 'masked / raw export']
      ]
    },
    {
      title: 'Capture / Session',
      rows: [
        [getActionLabel(keyBindings, 'main.followLatest'), 'follow latest'],
        [getActionLabel(keyBindings, 'main.openHelp'), 'help']
      ]
    }
  ];
}

function getContextualHelpSections(keyBindings = DEFAULT_KEY_BINDINGS, context = null) {
  const surface = normalizeHelpSurface(context);
  const closeRequestActivity = getActionLabelExcluding(keyBindings, 'help.close', 'main.openHelp', { limit: 2 });

  switch (surface) {
    case 'traffic':
      return [
        {
          title: 'Traffic',
          rows: [
            [getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp'), 'move row'],
            [getActionPairLabel(keyBindings, 'main.pageUp', 'main.pageDown', { separator: ' / ' }), 'move page'],
            [getActionLabel(keyBindings, 'main.inspect'), 'inspect row'],
            [getActionLabel(keyBindings, 'main.toggleFocus'), 'details pane'],
            [getActionLabel(keyBindings, 'main.openSearch'), 'search traffic'],
            [getActionPairLabel(keyBindings, 'main.methodFilter', 'main.statusFilter', { separator: ' / ' }), 'method / status filters'],
            [getActionLabel(keyBindings, 'main.openListDisplay'), 'list display'],
            [getActionLabel(keyBindings, 'main.toggleFrameworkAssets'), 'show / hide framework']
          ]
        },
        {
          title: 'Traffic Actions',
          rows: [
            [getActionLabel(keyBindings, 'main.markDiffBase', { limit: 1 }), 'mark A'],
            [getActionLabel(keyBindings, 'main.clearDiffBase', { limit: 1 }), 'unmark A'],
            [getActionLabel(keyBindings, 'main.openDiff', { limit: 1 }), 'compare with A'],
            [getActionPairLabel(keyBindings, 'main.copy', 'main.download', { separator: ' / ' }), 'copy / download'],
            [getActionLabel(keyBindings, 'main.followLatest'), 'follow latest']
          ]
        }
      ];
    case 'details':
      return [
        {
          title: 'Details',
          rows: [
            [getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp'), 'scroll'],
            [getActionPairLabel(keyBindings, 'main.pageUp', 'main.pageDown', { separator: ' / ' }), 'page'],
            [getActionLabel(keyBindings, 'main.toggleDetailTab', { limit: 1 }), 'request / response'],
            [getActionLabel(keyBindings, 'main.openSearch', { limit: 1 }), 'find details'],
            [getActionPairLabel(keyBindings, 'main.nextMatch', 'main.previousMatch'), 'next / previous match'],
            [getActionLabel(keyBindings, 'main.inspect', { limit: 1 }), 'collapse row'],
            [getActionLabel(keyBindings, 'main.openDetailModal', { limit: 1 }), 'details modal'],
            [getActionLabel(keyBindings, 'main.toggleFocus', { limit: 1 }), 'traffic pane']
          ]
        }
      ];
    case 'detailModal':
      return [
        {
          title: 'Detail Modal',
          rows: [
            [getActionPairLabel(keyBindings, 'detail.scrollDown', 'detail.scrollUp'), 'scroll'],
            [getActionPairLabel(keyBindings, 'detail.pageUp', 'detail.pageDown', { separator: ' / ' }), 'page'],
            [getActionLabel(keyBindings, 'detail.toggleTab', { limit: 1 }), 'request / response'],
            [getActionLabel(keyBindings, 'detail.openSearch', { limit: 1 }), 'find details'],
            [getActionPairLabel(keyBindings, 'detail.nextMatch', 'detail.previousMatch'), 'next / previous match'],
            [getActionLabel(keyBindings, 'detail.toggleNode', { limit: 1 }), 'collapse row'],
            [getActionLabel(keyBindings, 'detail.close', { limit: 2 }), 'close']
          ]
        }
      ];
    case 'filter':
      return [
        {
          title: 'Filter',
          rows: [
            [getActionPairLabel(keyBindings, 'filter.nextField', 'filter.previousField'), 'move field'],
            [getActionPairLabel(keyBindings, 'filter.previousOption', 'filter.nextOption'), 'change option'],
            [getActionLabel(keyBindings, 'filter.toggleOption', { limit: 1 }), 'toggle option'],
            [getActionLabel(keyBindings, 'filter.clear', { limit: 1 }), 'clear filters'],
            [getActionLabel(keyBindings, 'filter.close', { limit: 2 }), 'finish']
          ]
        }
      ];
    case 'detailSearch':
      return [
        {
          title: 'Detail Search',
          rows: [
            [getActionLabel(keyBindings, 'detailSearch.backspace', { limit: 1 }), 'delete text'],
            [getActionLabel(keyBindings, 'detailSearch.close', { limit: 2 }), 'finish'],
            [getActionPairLabel(keyBindings, 'main.nextMatch', 'main.previousMatch'), 'next / previous match']
          ]
        }
      ];
    case 'diff':
      return [
        {
          title: 'Diff',
          rows: [
            [getActionPairLabel(keyBindings, 'diff.nextChange', 'diff.previousChange'), 'next / previous change'],
            [getActionPairLabel(keyBindings, 'diff.pageUp', 'diff.pageDown', { separator: ' / ' }), 'page'],
            [getActionPairLabel(keyBindings, 'diff.top', 'diff.bottom'), 'top / bottom'],
            [getActionLabel(keyBindings, 'diff.toggleLayout', { limit: 1 }), 'toggle layout'],
            [getActionLabel(keyBindings, 'diff.openFilter', { limit: 1 }), 'filter rows'],
            [getActionLabel(keyBindings, 'diff.openFocusedRow', { limit: 1 }), 'open full row'],
            [getActionLabel(keyBindings, 'diff.close', { limit: 2 }), 'close diff']
          ]
        }
      ];
    case 'diffValue':
      return [
        {
          title: 'Diff Row',
          rows: [
            [getActionPairLabel(keyBindings, 'diffValue.scrollDown', 'diffValue.scrollUp'), 'scroll'],
            [getActionPairLabel(keyBindings, 'diffValue.pageUp', 'diffValue.pageDown', { separator: ' / ' }), 'page'],
            [getActionPairLabel(keyBindings, 'diffValue.top', 'diffValue.bottom'), 'top / bottom'],
            [getActionLabel(keyBindings, 'diffValue.close', { limit: 2 }), 'close full row']
          ]
        }
      ];
    case 'diffFilter':
      return [
        {
          title: 'Diff Filter',
          rows: [
            [getActionPairLabel(keyBindings, 'filter.nextField', 'filter.previousField'), 'move field'],
            [getActionPairLabel(keyBindings, 'filter.previousOption', 'filter.nextOption'), 'change option'],
            [getActionLabel(keyBindings, 'filter.toggleOption', { limit: 1 }), 'toggle option'],
            [getActionLabel(keyBindings, 'filter.clear', { limit: 1 }), 'clear filter'],
            [getActionLabel(keyBindings, 'filter.close', { limit: 2 }), 'finish']
          ]
        }
      ];
    case 'composer':
      return [
        {
          title: 'Composer',
          rows: [
            [getComposerTabLabel(keyBindings), 'jump sections'],
            [getActionPairLabel(keyBindings, 'composer.previousField', 'composer.nextField'), 'move fields'],
            [getActionPairLabel(keyBindings, 'composer.addRow', 'composer.deleteRow'), 'add / delete row'],
            [getActionLabel(keyBindings, 'composer.toggleField', { limit: 1 }), 'enable / disable row'],
            [getActionLabel(keyBindings, 'composer.save', { limit: 1 }), 'save request'],
            [getActionLabel(keyBindings, 'composer.openLibrary', { limit: 1 }), 'saved requests'],
            [getPreviewSendLabel(keyBindings), 'preview / send'],
            [getActionLabel(keyBindings, 'composer.close', { limit: 1 }), 'close composer']
          ]
        }
      ];
    case 'composerText':
      return [
        {
          title: 'Composer Text',
          rows: [
            [getActionLabel(keyBindings, 'composer.backspace', { limit: 1 }), 'backspace'],
            [getActionLabel(keyBindings, 'composer.delete', { limit: 1 }), 'delete'],
            [getActionPairLabel(keyBindings, 'composer.cursorStart', 'composer.cursorEnd'), 'start / end'],
            [getActionPairLabel(keyBindings, 'composer.previousOption', 'composer.nextOption'), 'move cursor'],
            [getActionLabel(keyBindings, 'composer.nextField', { limit: 1 }), 'next field'],
            [getPreviewSendLabel(keyBindings), 'preview / send'],
            [getActionLabel(keyBindings, 'composer.close', { limit: 1 }), 'close composer']
          ]
        }
      ];
    case 'composerBody':
      return [
        {
          title: 'Body Editor',
          rows: [
            [getActionLabel(keyBindings, 'composerBody.newline', { limit: 1 }), 'new line'],
            [getActionPairLabel(keyBindings, 'composerBody.cursorLeft', 'composerBody.cursorRight'), 'move cursor'],
            [getActionPairLabel(keyBindings, 'composerBody.cursorStart', 'composerBody.cursorEnd'), 'start / end'],
            [getActionLabel(keyBindings, 'composerBody.backspace', { limit: 1 }), 'backspace'],
            [getActionLabel(keyBindings, 'composerBody.delete', { limit: 1 }), 'delete'],
            [getActionLabel(keyBindings, 'composerBody.close', { limit: 1 }), 'close editor']
          ]
        }
      ];
    case 'composerConfirm':
      return [
        {
          title: 'Send Preview',
          rows: [
            [getActionLabel(keyBindings, 'composerConfirm.confirm', { limit: 2 }), 'send request'],
            [getActionLabel(keyBindings, 'composerConfirm.cancel', { limit: 2 }), 'return to editing']
          ]
        }
      ];
    case 'composerLibrary':
      return [
        {
          title: 'Saved Requests',
          rows: [
            [getComposerTabLabel(keyBindings), 'jump sections'],
            [getActionPairLabel(keyBindings, 'composerLibrary.moveDown', 'composerLibrary.moveUp'), 'move request'],
            [getActionLabel(keyBindings, 'composerLibrary.open', { limit: 1 }), 'load request'],
            [getActionLabel(keyBindings, 'composerLibrary.close', { limit: 2 }), 'close library']
          ]
        }
      ];
    case 'listDisplay':
      return [
        {
          title: 'List Display',
          rows: [
            [getActionPairLabel(keyBindings, 'listDisplay.moveDown', 'listDisplay.moveUp'), 'select row'],
            [getActionPairLabel(keyBindings, 'listDisplay.previousOption', 'listDisplay.nextOption'), 'change value'],
            [getActionLabel(keyBindings, 'listDisplay.toggleOption', { limit: 1 }), 'show / hide'],
            [getActionLabel(keyBindings, 'listDisplay.reset', { limit: 1 }), 'reset'],
            [getActionLabel(keyBindings, 'listDisplay.close', { limit: 2 }), 'close']
          ]
        }
      ];
    case 'endpointGroups':
      return [
        {
          title: 'Endpoint Groups',
          rows: [
            [getActionPairLabel(keyBindings, 'endpointGroups.moveDown', 'endpointGroups.moveUp'), 'move endpoint'],
            [getActionPairLabel(keyBindings, 'endpointGroups.pageUp', 'endpointGroups.pageDown', { separator: ' / ' }), 'move page'],
            [getActionPairLabel(keyBindings, 'endpointGroups.top', 'endpointGroups.bottom'), 'top / bottom'],
            [getActionLabel(keyBindings, 'endpointGroups.close', { limit: 2 }), 'close']
          ]
        }
      ];
    case 'requestActivity':
      return [
        {
          title: 'Sent Requests',
          rows: [
            [getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp'), 'move request'],
            [getActionPairLabel(keyBindings, 'main.pageUp', 'main.pageDown', { separator: ' / ' }), 'move page'],
            [getActionPairLabel(keyBindings, 'main.top', 'main.bottom'), 'first / last'],
            [getActionLabel(keyBindings, 'main.inspect', { limit: 1 }), 'inspect log'],
            [closeRequestActivity, 'close']
          ]
        }
      ];
    case 'export':
      return [
        {
          title: 'Export',
          rows: [
            [getActionLabel(keyBindings, 'export.masked', { limit: 1 }), 'masked values'],
            [getActionLabel(keyBindings, 'export.raw', { limit: 1 }), 'raw values'],
            [getActionLabel(keyBindings, 'export.cancel', { limit: 1 }), 'cancel export']
          ]
        }
      ];
    case 'resendConfirm':
      return [
        {
          title: 'Resend',
          rows: [
            [getActionLabel(keyBindings, 'resend.confirm', { limit: 2 }), 'send request'],
            [getActionLabel(keyBindings, 'resend.edit', { limit: 1 }), 'edit request'],
            [getActionLabel(keyBindings, 'resend.cancel', { limit: 2 }), 'cancel resend']
          ]
        }
      ];
    default:
      return getDefaultHelpSections(keyBindings);
  }
}

export function getHelpSections(keyBindings = DEFAULT_KEY_BINDINGS, context = null) {
  return normalizeHelpSurface(context)
    ? getContextualHelpSections(keyBindings, context)
    : getDefaultHelpSections(keyBindings);
}

export const HELP_SECTIONS = getHelpSections();

const HELP_KEY_WIDTH = 10;
const HELP_COLUMN_GAP_WIDTH = 3;
const COMMAND_HELP_COMMAND_WIDTH = 18;
const COMMAND_HELP_ALIAS_WIDTH = 24;

function getHelpSectionHeight(section) {
  return section.rows.length + 2;
}

function getHelpColumns(sections) {
  const columns = [[], []];
  const heights = [0, 0];

  sections.forEach((section) => {
    const columnIndex = heights[0] <= heights[1] ? 0 : 1;

    columns[columnIndex].push(section);
    heights[columnIndex] += getHelpSectionHeight(section);
  });

  return columns;
}

function renderHelpSections(sections, width) {
  return sections.flatMap((section, sectionIndex) => [
    h(Text, { key: `${section.title}-title`, bold: true, color: 'cyan' }, section.title),
    ...section.rows.map(([keys, description]) => h(
      Box,
      { key: `${section.title}-${keys}`, width },
      h(Text, { color: 'cyan' }, pad(keys, HELP_KEY_WIDTH)),
      h(Text, { wrap: 'truncate' }, description)
    )),
    sectionIndex < sections.length - 1
      ? h(Text, { key: `${section.title}-space` }, '')
      : null
  ].filter(Boolean));
}

export function getCommandHelpRows(commands = COMMAND_DEFINITIONS, commandContext = null) {
  const activeCommands = Array.isArray(commands) ? commands : COMMAND_DEFINITIONS;
  const activeCommandContext = Array.isArray(commands) ? commandContext : commands;
  const availableCommandNames = activeCommandContext
    ? new Set(getCommandMatches('', activeCommandContext).map((command) => command.name))
    : null;

  return activeCommands
    .filter((command) => !availableCommandNames || availableCommandNames.has(command.name))
    .map((command) => ({
      aliases: (command.aliases ?? []).map((alias) => `:${alias}`).join(', '),
      command: `:${command.name}`,
      description: command.description
    }));
}

function renderCommandHelpRows(width, commandContext = null) {
  const useColumns = width >= COMMAND_HELP_COMMAND_WIDTH + COMMAND_HELP_ALIAS_WIDTH + 18;
  const descriptionWidth = Math.max(
    8,
    width - COMMAND_HELP_COMMAND_WIDTH - COMMAND_HELP_ALIAS_WIDTH - 2
  );

  return [
    h(Text, { key: 'commands-title', bold: true, color: 'cyan' }, 'Commands'),
    ...getCommandHelpRows(COMMAND_DEFINITIONS, commandContext).map((row) => (
      useColumns
        ? h(
          Box,
          { key: row.command, width },
          h(Text, { color: 'cyan' }, pad(row.command, COMMAND_HELP_COMMAND_WIDTH)),
          h(Text, { color: 'gray' }, pad(row.aliases, COMMAND_HELP_ALIAS_WIDTH)),
          h(Text, { wrap: 'truncate' }, truncate(row.description, descriptionWidth))
        )
        : h(
          Box,
          { key: row.command, width },
          h(Text, { color: 'cyan' }, pad(row.command, HELP_KEY_WIDTH)),
          h(Text, { wrap: 'truncate' }, `${row.aliases ? `${row.aliases}  ` : ''}${row.description}`)
        )
    ))
  ];
}

export const HelpModal = React.memo(function HelpModal({
  commandContext = null,
  helpContext = null,
  keyBindings = DEFAULT_KEY_BINDINGS
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(34, Math.min(90, columns - 6));
  const useColumns = width >= 68;
  const contentWidth = Math.max(26, width - 6);
  const columnWidth = useColumns ? Math.floor((contentWidth - HELP_COLUMN_GAP_WIDTH) / 2) : contentWidth;
  const helpSections = getHelpSections(keyBindings, helpContext);
  const [leftSections, rightSections] = getHelpColumns(helpSections);

  return h(
    Box,
    {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(Text, { bold: true, color: 'cyan' }, 'Help'),
      h(Text, { color: 'gray' }, 'Daily keys and commands'),
      h(Text, {}, ''),
      useColumns
        ? h(
          Box,
          { flexDirection: 'row' },
          h(Box, { flexDirection: 'column', width: columnWidth }, ...renderHelpSections(leftSections, columnWidth)),
          h(Box, { width: HELP_COLUMN_GAP_WIDTH }, h(Text, {}, '')),
          h(Box, { flexDirection: 'column', width: columnWidth }, ...renderHelpSections(rightSections, columnWidth))
        )
        : h(Box, { flexDirection: 'column' }, ...renderHelpSections(helpSections, contentWidth)),
      h(Text, {}, ''),
      h(Box, { flexDirection: 'column', width: contentWidth }, ...renderCommandHelpRows(contentWidth, commandContext)),
      h(Text, { color: 'gray' }, `${getActionLabel(keyBindings, 'help.close')} close`)
    )
  );
});

function formatBooleanOption(value) {
  return value ? '[x]' : '[ ]';
}

export function formatPaneWidthLabel(display = {}) {
  const normalized = normalizeTrafficListDisplay(display);

  if (normalized.widthMode === 'normal') {
    return 'normal';
  }

  if (normalized.widthMode === 'half') {
    return 'half';
  }

  return `${normalized.widthTarget} ${normalized.widthMode}`;
}

function formatListDisplayValue(display, key, options = {}) {
  const normalized = normalizeTrafficListDisplay(display);

  if (key === 'pathMode') {
    return normalized.pathMode;
  }

  if (key === 'density') {
    return normalized.density;
  }

  if (key === 'widthMode') {
    return formatPaneWidthLabel(normalized);
  }

  if (key === 'frameworkAssets') {
    return options.hideFrameworkAssets ? 'hidden' : 'shown';
  }

  return formatBooleanOption(normalized.columns[key]);
}

function getListDisplayLabel(key) {
  if (key === 'pathMode') {
    return 'path mode';
  }

  if (key === 'density') {
    return 'density';
  }

  if (key === 'widthMode') {
    return 'width';
  }

  if (key === 'frameworkAssets') {
    return 'framework traffic';
  }

  return `show ${key}`;
}

export const ListDisplayModal = React.memo(function ListDisplayModal({
  focusIndex = 0,
  hideFrameworkAssets,
  keyBindings = DEFAULT_KEY_BINDINGS,
  listDisplay
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(40, Math.min(72, columns - 4));
  const normalized = normalizeTrafficListDisplay(listDisplay);
  const safeFocusIndex = Math.max(0, Math.min(LIST_DISPLAY_FOCUS_ORDER.length - 1, focusIndex));

  return h(
    Box,
    {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(Text, { bold: true, color: 'cyan' }, 'List display'),
      h(Text, { color: 'gray' }, 'Traffic row layout'),
      h(Text, { color: 'gray' }, 'Select a row, then use the action shown on the right.'),
      h(Text, {}, ''),
      ...LIST_DISPLAY_FOCUS_ORDER.map((key, index) => {
        const selected = index === safeFocusIndex;
        const value = formatListDisplayValue(normalized, key, { hideFrameworkAssets });
        const label = getListDisplayLabel(key);
        const optionKeys = getActionPairLabel(keyBindings, 'listDisplay.previousOption', 'listDisplay.nextOption');
        const toggleKey = getActionLabel(keyBindings, 'listDisplay.toggleOption');
        const hint = key === 'pathMode' || key === 'density' || key === 'widthMode'
          ? `change with ${optionKeys}${optionKeys === 'left/right' ? ' arrows' : ''}`
          : `show/hide with ${toggleKey}`;
        const text = `${selected ? '>' : ' '} ${pad(label, 14)} ${pad(value, 13)} ${hint}`;

        return h(Text, {
          key,
          backgroundColor: selected ? 'cyan' : undefined,
          color: selected ? 'black' : undefined,
          wrap: 'truncate'
        }, text);
      }),
      h(Text, {}, ''),
      h(Text, { color: 'gray' }, `${getActionPairLabel(keyBindings, 'listDisplay.moveDown', 'listDisplay.moveUp')} select row  ${getActionLabel(keyBindings, 'listDisplay.reset')} reset  ${getNthActionLabel(keyBindings, 'listDisplay.close', 1)}/${getNthActionLabel(keyBindings, 'listDisplay.close', 0)} close`)
    )
  );
});

function joinFooterParts(parts) {
  return parts.filter(Boolean).join('  ');
}

function formatFooterBinding(keys, description) {
  return `${keys}: ${description}`;
}

export function formatFooterText({
  commandStatus = '',
  exportStatus = '',
  isListDisplayOpen = false,
  isRequestActivityOpen = false,
  resendStatus = '',
  isComposerConfirmOpen = false,
  isComposerOpen = false,
  isComposerTextFocused = false,
  isCommandOpen = false,
  isDiffOpen = false,
  isDetailModalOpen = false,
  isDetailSearchActive = false,
  isEndpointGroupsOpen = false,
  isExportPromptOpen = false,
  hasDiffBase = false,
  isHelpOpen = false,
  hideFrameworkAssets = true,
  isLiveMode = true,
  isListFocused = true,
  isRawModeSupported = true,
  isReplayMode = false,
  keyBindings = DEFAULT_KEY_BINDINGS,
  recordingStatus = OFF_RECORDING_STATUS
} = {}) {
  const withStatus = (value) => {
    const status = [exportStatus, resendStatus, commandStatus]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(' | ');

    return status ? `${value} | ${status}` : value;
  };
  const commandKey = getActionLabel(keyBindings, 'global.openCommandPrompt', { limit: 1 });
  const moveKeys = getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp');
  const pageKeys = getActionPairLabel(keyBindings, 'main.pageUp', 'main.pageDown', { separator: ' / ' });
  const matchKeys = getActionPairLabel(keyBindings, 'main.nextMatch', 'main.previousMatch');
  const closeDetailKeys = getActionLabel(keyBindings, 'detail.close', { limit: 2 });
  const detailEditKey = getActionLabel(keyBindings, 'detail.editRequest', { limit: 1 });
  const liveDetailActions = isLiveMode ? [`${detailEditKey} edit`] : [];
  const liveDetailModalActions = isLiveMode ? [formatFooterBinding(detailEditKey, 'edit')] : [];
  const unmarkDiffAction = hasDiffBase
    ? [formatFooterBinding(getActionLabel(keyBindings, 'main.clearDiffBase', { limit: 1 }), 'unmark')]
    : [];
  const compareDiffAction = hasDiffBase
    ? [formatFooterBinding(getActionLabel(keyBindings, 'main.openDiff', { limit: 1 }), 'diff')]
    : [];
  const requestActivityCloseKeys = getActionLabelExcluding(keyBindings, 'help.close', 'main.openHelp', { limit: 2 });

  if (!isRawModeSupported) {
    return 'keyboard input unavailable in this shell | Ctrl-C or SIGTERM quit';
  }

  if (isCommandOpen) {
    return '';
  }

  if (isHelpOpen) {
    return `help | ${getActionLabel(keyBindings, 'help.close', { separator: ', ' })} close`;
  }

  if (isExportPromptOpen) {
    return `export  ${getActionLabel(keyBindings, 'export.masked', { limit: 1 })} masked  ${getActionLabel(keyBindings, 'export.raw', { limit: 1 })} raw  ${getActionLabel(keyBindings, 'export.cancel', { limit: 1 })} cancel`;
  }

  if (isListDisplayOpen) {
    return `list display  ${getActionPairLabel(keyBindings, 'listDisplay.moveDown', 'listDisplay.moveUp')} select row  ${getActionPairLabel(keyBindings, 'listDisplay.previousOption', 'listDisplay.nextOption')} change value  ${getActionLabel(keyBindings, 'listDisplay.toggleOption', { limit: 1 })} show/hide  ${getActionLabel(keyBindings, 'listDisplay.reset', { limit: 1 })} reset  ${getNthActionLabel(keyBindings, 'listDisplay.close', 1)}/${getNthActionLabel(keyBindings, 'listDisplay.close', 0)} close`;
  }

  if (isDiffOpen) {
    return withStatus(joinFooterParts([
      'diff',
      formatFooterBinding(getActionPairLabel(keyBindings, 'diff.nextChange', 'diff.previousChange'), 'change'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'diff.pageUp', 'diff.pageDown', { separator: ' / ' }), 'page'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'diff.top', 'diff.bottom'), 'top/bottom'),
      formatFooterBinding(getActionLabel(keyBindings, 'diff.toggleLayout', { limit: 1 }), 'layout'),
      formatFooterBinding(getActionLabel(keyBindings, 'diff.openFilter', { limit: 1 }), 'filter'),
      formatFooterBinding(getActionLabel(keyBindings, 'diff.openFocusedRow', { limit: 1 }), 'full row'),
      ...unmarkDiffAction,
      formatFooterBinding(getActionLabel(keyBindings, 'diff.close', { limit: 2 }), 'close'),
      formatFooterBinding(getActionLabel(keyBindings, 'main.openHelp', { limit: 1 }), 'help')
    ]));
  }

  if (isEndpointGroupsOpen) {
    return withStatus(joinFooterParts([
      'endpoint groups',
      formatFooterBinding(getActionPairLabel(keyBindings, 'endpointGroups.moveDown', 'endpointGroups.moveUp'), 'move'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'endpointGroups.pageUp', 'endpointGroups.pageDown', { separator: ' / ' }), 'page'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'endpointGroups.top', 'endpointGroups.bottom'), 'top/bottom'),
      formatFooterBinding(getActionLabel(keyBindings, 'endpointGroups.close', { limit: 2 }), 'close'),
      formatFooterBinding(getActionLabel(keyBindings, 'main.openHelp', { limit: 1 }), 'help')
    ]));
  }

  if (isRequestActivityOpen) {
    return `sent requests  ${getActionPairLabel(keyBindings, 'main.moveDown', 'main.moveUp')} move  ${getActionLabel(keyBindings, 'main.inspect', { limit: 1 })} inspect log  ${requestActivityCloseKeys} close  ${getActionLabel(keyBindings, 'main.openHelp', { limit: 1 })} help`;
  }

  if (isComposerOpen) {
    if (isComposerConfirmOpen) {
      return `preview  ${getActionLabel(keyBindings, 'composerConfirm.confirm', { limit: 2 })} send  ${getActionLabel(keyBindings, 'composerConfirm.cancel', { limit: 2 })} edit`;
    }

    return isComposerTextFocused
      ? `typing  ${getActionLabel(keyBindings, 'composer.backspace', { limit: 1 })} ${getActionLabel(keyBindings, 'composer.delete', { limit: 1 })}  ${getActionLabel(keyBindings, 'composer.nextField', { limit: 1 })} next  ${getActionLabel(keyBindings, 'composer.preview', { limit: 1 })} preview  ${getActionLabel(keyBindings, 'composer.close', { limit: 1 })} close  ${getComposerTabLabel(keyBindings)} sections`
      : `composer  ${getComposerTabLabel(keyBindings)} sections  ${getActionLabel(keyBindings, 'composer.nextField', { limit: 1 })} fields  ${getActionLabel(keyBindings, 'composer.preview', { limit: 1 })} preview  ${getActionLabel(keyBindings, 'composer.addRow', { limit: 1 })} add  ${getActionLabel(keyBindings, 'composer.deleteRow', { limit: 1 })} delete  ${getActionLabel(keyBindings, 'composer.save', { limit: 1 })} save  ${getActionLabel(keyBindings, 'composer.openLibrary', { limit: 1 })} library  ${getActionLabel(keyBindings, 'composer.revealSecrets', { limit: 1 })} reveal  ${getActionLabel(keyBindings, 'composer.close', { limit: 1 })} close`;
  }

  if (isDetailSearchActive && !isListFocused) {
    return isDetailModalOpen
      ? withStatus(joinFooterParts([
        'detail search active',
        `${getActionLabel(keyBindings, 'detail.openSearch', { limit: 1 })} edit`,
        `${matchKeys} match`,
        ...liveDetailActions,
        `${moveKeys} scroll`,
        `${getActionLabel(keyBindings, 'detail.toggleNode', { limit: 1 })} collapse`,
        `${closeDetailKeys} close`,
        `${commandKey} command`
      ]))
      : withStatus(joinFooterParts([
        'detail search active',
        `${getActionLabel(keyBindings, 'main.openSearch', { limit: 1 })} edit`,
        `${matchKeys} match`,
        ...liveDetailActions,
        `${moveKeys} scroll`,
        `${getActionLabel(keyBindings, 'main.inspect', { limit: 1 })} collapse`,
        `${getActionLabel(keyBindings, 'main.openDetailModal', { limit: 1 })} big`,
        `${getActionLabel(keyBindings, 'main.toggleFocus', { limit: 1 })} traffic`,
        `${commandKey} command`
      ]));
  }

  if (isDetailModalOpen) {
    return withStatus(joinFooterParts([
      formatFooterBinding(getActionPairLabel(keyBindings, 'detail.scrollDown', 'detail.scrollUp'), 'scroll'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'detail.pageUp', 'detail.pageDown', { separator: ' / ' }), 'page'),
      formatFooterBinding(getActionLabel(keyBindings, 'detail.toggleTab', { limit: 1 }), 'req/res'),
      formatFooterBinding(getActionLabel(keyBindings, 'detail.openSearch', { limit: 1 }), 'find'),
      formatFooterBinding(getActionPairLabel(keyBindings, 'detail.nextMatch', 'detail.previousMatch'), 'match'),
      ...liveDetailModalActions,
      formatFooterBinding(getActionLabel(keyBindings, 'main.markDiffBase', { limit: 1 }), 'mark A'),
      ...unmarkDiffAction,
      ...compareDiffAction,
      formatFooterBinding(getActionLabel(keyBindings, 'detail.toggleNode', { limit: 1 }), 'collapse'),
      formatFooterBinding(closeDetailKeys, 'close'),
      `${commandKey} command`
    ]));
  }

  if (isListFocused) {
    return withStatus(joinFooterParts([
      formatFooterBinding(moveKeys, 'move'),
      formatFooterBinding(pageKeys, 'page'),
      formatFooterBinding(getActionLabel(keyBindings, 'main.inspect', { limit: 1 }), 'inspect'),
      formatFooterBinding(getActionLabel(keyBindings, 'main.markDiffBase', { limit: 1 }), 'mark A'),
      ...unmarkDiffAction,
      ...compareDiffAction,
      formatFooterBinding(getActionLabel(keyBindings, 'main.toggleFocus', { limit: 1 }), 'details'),
      `${commandKey} command`,
      formatFooterBinding(getActionLabel(keyBindings, 'main.openHelp', { limit: 1 }), 'help')
    ]));
  }

  return withStatus(joinFooterParts([
    formatFooterBinding(moveKeys, 'scroll'),
    formatFooterBinding(pageKeys, 'page'),
    formatFooterBinding(getActionLabel(keyBindings, 'main.toggleDetailTab', { limit: 1 }), 'req/res'),
    formatFooterBinding(getActionLabel(keyBindings, 'main.openSearch', { limit: 1 }), 'find'),
    formatFooterBinding(matchKeys, 'match'),
    formatFooterBinding(getActionLabel(keyBindings, 'main.markDiffBase', { limit: 1 }), 'mark A'),
    ...unmarkDiffAction,
    ...compareDiffAction,
    formatFooterBinding(getActionLabel(keyBindings, 'main.toggleFocus', { limit: 1 }), 'traffic'),
    `${commandKey} command`,
    formatFooterBinding(getActionLabel(keyBindings, 'main.openHelp', { limit: 1 }), 'help')
  ]));
}

export const Footer = React.memo(function Footer({
  commandStatus,
  exportStatus,
  isListDisplayOpen,
  isRequestActivityOpen,
  resendStatus,
  isComposerConfirmOpen,
  isComposerOpen,
  isComposerTextFocused,
  isCommandOpen,
  isDiffOpen,
  isDetailModalOpen,
  isDetailSearchActive,
  isEndpointGroupsOpen,
  isExportPromptOpen,
  hasDiffBase,
  isHelpOpen,
  hideFrameworkAssets,
  isLiveMode,
  isListFocused,
  isRawModeSupported,
  isReplayMode,
  keyBindings,
  recordingStatus
}) {
  return h(
    Box,
    { marginTop: 1 },
    h(
      Text,
      { color: 'gray', wrap: 'truncate' },
      formatFooterText({
        commandStatus,
        exportStatus,
        isListDisplayOpen,
        isRequestActivityOpen,
        resendStatus,
        isComposerConfirmOpen,
        isComposerOpen,
        isComposerTextFocused,
        isCommandOpen,
        isDiffOpen,
        isDetailModalOpen,
        isDetailSearchActive,
        isEndpointGroupsOpen,
        isExportPromptOpen,
        hasDiffBase,
        isHelpOpen,
        hideFrameworkAssets,
        isLiveMode,
        isListFocused,
        isRawModeSupported,
        isReplayMode,
        keyBindings,
        recordingStatus
      })
    )
  );
});

export const CommandModal = React.memo(function CommandModal({
  commandContext = null,
  input = '',
  keyBindings = DEFAULT_KEY_BINDINGS,
  selectedIndex = -1,
  status = ''
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(COMMAND_MODAL_MIN_WIDTH, Math.min(COMMAND_MODAL_MAX_WIDTH, columns - 6));
  const contentWidth = Math.max(28, width - 6);
  const commandColumnWidth = Math.min(20, Math.max(16, Math.floor(contentWidth * 0.32)));
  const aliasColumnWidth = Math.min(9, Math.max(6, Math.floor(contentWidth * 0.14)));
  const descriptionColumnWidth = Math.max(8, contentWidth - commandColumnWidth - aliasColumnWidth - 2);
  const inputWidth = Math.max(24, contentWidth);
  const matches = getCommandMatches(input, commandContext);
  const rows = getCommandSuggestionRows(input, selectedIndex, commandContext);
  const selectedRow = rows.find((row) => row.command && row.isSelected);
  const statusColor = /^unknown|^ambiguous|^command required|.* unavailable:/.test(status) ? 'red' : 'gray';
  const inputText = input ? `:${input}_` : ':_';
  const submitKey = getActionLabel(keyBindings, 'command.submit', { limit: 1 });
  const commandHelpText = `${submitKey} run  ${getCommandSuggestionLabel(keyBindings)} select  ${getActionLabel(keyBindings, 'command.close', { limit: 1 })} cancel`;
  const selectedStatusText = formatCommandSelectionStatus(selectedRow);
  const statusText = status || (matches.length === 0 ? 'No command matches' : selectedStatusText || commandHelpText);
  const statusHelpText = !status && selectedStatusText && contentWidth >= 36 ? `${submitKey} run` : '';
  const statusTextWidth = statusHelpText
    ? Math.max(8, contentWidth - statusHelpText.length - 1)
    : contentWidth;

  return h(
    Box,
    {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center'
    },
    h(
      Box,
      {
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: statusColor === 'red' ? 'red' : 'cyan',
        height: COMMAND_MODAL_HEIGHT,
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(
        Box,
        { flexDirection: 'row' },
        h(Text, { bold: true, color: 'cyan' }, 'Command'),
        h(Text, { color: 'gray' }, '  careful actions')
      ),
      h(
        Box,
        { borderStyle: 'single', borderColor: 'gray', marginTop: 1, paddingX: 1, width: inputWidth },
        h(Text, { color: 'cyan', wrap: 'truncate' }, inputText)
      ),
      h(
        Box,
        { flexDirection: 'column', marginTop: 1 },
        ...rows.map((row, index) => {
          const key = row.command?.name ?? `empty-${index}`;

          if (!row.command) {
            return h(Text, { key }, '');
          }

          const commandName = `:${row.name}`;

          return h(
            Box,
            {
              key,
              flexDirection: 'row',
              width: contentWidth
            },
            h(
              Box,
              {
                marginRight: 1,
                width: commandColumnWidth
              },
              h(Text, {
                bold: row.isSelected,
                color: 'cyan',
                wrap: 'truncate'
              }, `${row.isSelected ? '>' : ' '} ${commandName}`)
            ),
            h(
              Box,
              { marginRight: 1, width: aliasColumnWidth },
              h(Text, {
                color: row.isSelected ? 'cyan' : 'gray',
                wrap: 'truncate'
              }, row.primaryAlias)
            ),
            h(
              Box,
              { width: descriptionColumnWidth },
              h(Text, { wrap: 'truncate' }, row.description)
            )
          );
        })
      ),
      h(
        Box,
        { flexDirection: 'row', width: contentWidth },
        h(
          Box,
          { marginRight: statusHelpText ? 1 : 0, width: statusTextWidth },
          h(Text, { color: status ? statusColor : 'gray', wrap: 'truncate' }, statusText)
        ),
        statusHelpText
          ? h(Text, { color: 'gray', wrap: 'truncate' }, statusHelpText)
          : null
      )
    )
  );
});

export const ResendConfirmBar = React.memo(function ResendConfirmBar({
  keyBindings = DEFAULT_KEY_BINDINGS,
  pendingResend,
  isResending
}) {
  const blockers = pendingResend?.blockers ?? [];
  const warnings = pendingResend?.warnings ?? [];
  const summary = pendingResend?.summary ?? {};
  const canExactResend = blockers.length === 0;
  const title = canExactResend
    ? 'Confirm normalized resend'
    : 'Edit required before resend';
  const editKey = getActionLabel(keyBindings, 'resend.edit', { limit: 1 });
  const cancelKey = getActionLabel(keyBindings, 'resend.cancel', { limit: 2 });
  const help = canExactResend
    ? `${getActionLabel(keyBindings, 'resend.confirm', { limit: 2 })} send | ${editKey} edit | ${cancelKey} cancel`
    : `${editKey} edit | ${cancelKey} cancel`;
  const signals = [
    `${summary.headers ?? 0} headers`,
    `${summary.cookies ?? 0} cookies`,
    summary.body ?? 'no body',
    'normalized, not byte-perfect'
  ].join(' | ');

  return h(
    Box,
    {
      borderStyle: 'single',
      borderColor: canExactResend ? 'yellow' : 'red',
      flexDirection: 'column',
      marginTop: 1,
      paddingX: 2,
      paddingY: 0
    },
    h(Text, { color: canExactResend ? 'yellow' : 'red', bold: true }, title),
    h(Text, { wrap: 'truncate' }, `${summary.method ?? 'GET'} ${summary.path ?? '/'}`),
    h(Text, { color: 'gray', wrap: 'truncate' }, signals),
    blockers[0]
      ? h(Text, { color: 'red', wrap: 'truncate' }, `blocker ${blockers[0]}`)
      : h(Text, { color: warnings[0] ? 'yellow' : 'gray', wrap: 'truncate' }, warnings[0] ? `warning ${warnings[0]}` : 'safe request resend will use the manual sender'),
    h(Text, { color: 'gray', wrap: 'truncate' }, isResending ? 'sending...' : help)
  );
});
