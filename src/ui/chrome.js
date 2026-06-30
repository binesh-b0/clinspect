import React from 'react';
import { Box, Text } from 'ink';
import {
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

export const HELP_SECTIONS = [
  {
    title: 'Move',
    rows: [
      ['j/k', 'move line'],
      ['[ / ]', 'move page'],
      ['Ctrl-u/d', 'move half page'],
      ['g/G', 'top / bottom'],
      ['tab', 'switch pane']
    ]
  },
  {
    title: 'Inspect',
    rows: [
      ['enter', 'inspect row'],
      ['r', 'request / response'],
      ['o', 'details modal'],
      ['/', 'find details'],
      ['n / N', 'next / previous match'],
      ['wheel', 'scroll pane']
    ]
  },
  {
    title: 'Filter',
    rows: [
      ['/', 'text search'],
      ['m / s', 'method / status'],
      ['space', 'toggle option'],
      ['x', 'clear filters']
    ]
  },
  {
    title: 'Compose',
    rows: [
      ['n', 'new request'],
      ['E', 'edit and resend'],
      ['e', 'edit selected request'],
      ['l', 'saved requests'],
      ['1-7', 'jump sections'],
      ['a/d', 'add / delete row'],
      ['space', 'enable / disable row'],
      ['enter/y', 'preview / send'],
      ['esc', 'close composer']
    ]
  },
  {
    title: 'Display / Export',
    rows: [
      ['t', 'cycle path mode'],
      ['v', 'cycle list density'],
      ['w', 'cycle pane width'],
      ['F', 'show / hide static'],
      ['L', 'list display modal'],
      ['y', 'copy item'],
      ['D', 'download item'],
      ['m / r', 'masked / raw export']
    ]
  },
  {
    title: 'Capture / Session',
    rows: [
      ['f', 'follow latest'],
      ['h', 'help']
    ]
  }
];

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

export function getCommandHelpRows(commands = COMMAND_DEFINITIONS) {
  return commands.map((command) => ({
    aliases: (command.aliases ?? []).map((alias) => `:${alias}`).join(', '),
    command: `:${command.name}`,
    description: command.description
  }));
}

function renderCommandHelpRows(width) {
  const useColumns = width >= COMMAND_HELP_COMMAND_WIDTH + COMMAND_HELP_ALIAS_WIDTH + 18;
  const descriptionWidth = Math.max(
    8,
    width - COMMAND_HELP_COMMAND_WIDTH - COMMAND_HELP_ALIAS_WIDTH - 2
  );

  return [
    h(Text, { key: 'commands-title', bold: true, color: 'cyan' }, 'Commands'),
    ...getCommandHelpRows().map((row) => (
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

export const HelpModal = React.memo(function HelpModal() {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(34, Math.min(90, columns - 6));
  const useColumns = width >= 68;
  const contentWidth = Math.max(26, width - 6);
  const columnWidth = useColumns ? Math.floor((contentWidth - HELP_COLUMN_GAP_WIDTH) / 2) : contentWidth;
  const [leftSections, rightSections] = getHelpColumns(HELP_SECTIONS);

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
        : h(Box, { flexDirection: 'column' }, ...renderHelpSections(HELP_SECTIONS, contentWidth)),
      h(Text, {}, ''),
      h(Box, { flexDirection: 'column', width: contentWidth }, ...renderCommandHelpRows(contentWidth)),
      h(Text, { color: 'gray' }, 'esc/h/q close')
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
    return 'static assets';
  }

  return `show ${key}`;
}

export const ListDisplayModal = React.memo(function ListDisplayModal({
  focusIndex = 0,
  hideFrameworkAssets,
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
        const hint = key === 'pathMode' || key === 'density' || key === 'widthMode'
          ? 'change with left/right arrows'
          : 'show/hide with space';
        const text = `${selected ? '>' : ' '} ${pad(label, 14)} ${pad(value, 13)} ${hint}`;

        return h(Text, {
          key,
          backgroundColor: selected ? 'cyan' : undefined,
          color: selected ? 'black' : undefined,
          wrap: 'truncate'
        }, text);
      }),
      h(Text, {}, ''),
      h(Text, { color: 'gray' }, 'j/k select row  r reset  enter/esc close')
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
  resendStatus = '',
  isComposerConfirmOpen = false,
  isComposerOpen = false,
  isComposerTextFocused = false,
  isCommandOpen = false,
  isDetailModalOpen = false,
  isDetailSearchActive = false,
  isExportPromptOpen = false,
  isHelpOpen = false,
  hideFrameworkAssets = true,
  isLiveMode = true,
  isListFocused = true,
  isRawModeSupported = true,
  isReplayMode = false,
  recordingStatus = OFF_RECORDING_STATUS
} = {}) {
  const withStatus = (value) => {
    const status = [exportStatus, resendStatus, commandStatus]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join(' | ');

    return status ? `${value} | ${status}` : value;
  };
  const liveDetailActions = isLiveMode ? ['E edit'] : [];
  const liveDetailModalActions = isLiveMode ? [formatFooterBinding('E', 'edit')] : [];

  if (!isRawModeSupported) {
    return 'keyboard input unavailable in this shell | Ctrl-C or SIGTERM quit';
  }

  if (isCommandOpen) {
    return '';
  }

  if (isExportPromptOpen) {
    return 'export  m masked  r raw  esc cancel';
  }

  if (isListDisplayOpen) {
    return 'list display  j/k select row  left/right change value  space show/hide  r reset  enter/esc close';
  }

  if (isHelpOpen) {
    return 'help | esc/h/q close';
  }

  if (isComposerOpen) {
    if (isComposerConfirmOpen) {
      return 'preview  enter/y send  esc/n edit';
    }

    return isComposerTextFocused
      ? 'typing  backspace delete  tab next  enter preview  esc close  1-7 sections'
      : 'composer  1-7 sections  tab fields  enter preview  a add  d delete  s save  l library  R reveal  esc close';
  }

  if (isDetailSearchActive && !isListFocused) {
    return isDetailModalOpen
      ? withStatus(joinFooterParts([
        'detail search active',
        '/ edit',
        'n/N match',
        ...liveDetailActions,
        'j/k scroll',
        'enter collapse',
        'esc/q close',
        ': command'
      ]))
      : withStatus(joinFooterParts([
        'detail search active',
        '/ edit',
        'n/N match',
        ...liveDetailActions,
        'j/k scroll',
        'enter collapse',
        'o big',
        'tab traffic',
        ': command'
      ]));
  }

  if (isDetailModalOpen) {
    return withStatus(joinFooterParts([
      formatFooterBinding('j/k', 'scroll'),
      formatFooterBinding('[ / ]', 'page'),
      formatFooterBinding('r', 'req/res'),
      formatFooterBinding('/', 'find'),
      formatFooterBinding('n/N', 'match'),
      ...liveDetailModalActions,
      formatFooterBinding('enter', 'collapse'),
      formatFooterBinding('esc/q', 'close'),
      ': command'
    ]));
  }

  if (isListFocused) {
    return withStatus(joinFooterParts([
      formatFooterBinding('j/k', 'move'),
      formatFooterBinding('[ / ]', 'page'),
      formatFooterBinding('enter', 'inspect'),
      formatFooterBinding('tab', 'details'),
      ': command',
      formatFooterBinding('h', 'help')
    ]));
  }

  return withStatus(joinFooterParts([
    formatFooterBinding('j/k', 'scroll'),
    formatFooterBinding('[ / ]', 'page'),
    formatFooterBinding('r', 'req/res'),
    formatFooterBinding('/', 'find'),
    formatFooterBinding('n/N', 'match'),
    formatFooterBinding('tab', 'traffic'),
    ': command',
    formatFooterBinding('h', 'help')
  ]));
}

export const Footer = React.memo(function Footer({
  commandStatus,
  exportStatus,
  isListDisplayOpen,
  resendStatus,
  isComposerConfirmOpen,
  isComposerOpen,
  isComposerTextFocused,
  isCommandOpen,
  isDetailModalOpen,
  isDetailSearchActive,
  isExportPromptOpen,
  isHelpOpen,
  hideFrameworkAssets,
  isLiveMode,
  isListFocused,
  isRawModeSupported,
  isReplayMode,
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
        resendStatus,
        isComposerConfirmOpen,
        isComposerOpen,
        isComposerTextFocused,
        isCommandOpen,
        isDetailModalOpen,
        isDetailSearchActive,
        isExportPromptOpen,
        isHelpOpen,
        hideFrameworkAssets,
        isLiveMode,
        isListFocused,
        isRawModeSupported,
        isReplayMode,
        recordingStatus
      })
    )
  );
});

export const CommandModal = React.memo(function CommandModal({
  input = '',
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
  const matches = getCommandMatches(input);
  const rows = getCommandSuggestionRows(input, selectedIndex);
  const selectedRow = rows.find((row) => row.command && row.isSelected);
  const statusColor = /^unknown|^ambiguous|^command required/.test(status) ? 'red' : 'gray';
  const inputText = input ? `:${input}_` : ':_';
  const commandHelpText = 'enter run  tab/up/down select  esc cancel';
  const selectedStatusText = formatCommandSelectionStatus(selectedRow);
  const statusText = status || (matches.length === 0 ? 'No command matches' : selectedStatusText || commandHelpText);
  const statusHelpText = !status && selectedStatusText && contentWidth >= 36 ? 'enter run' : '';
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
  const help = canExactResend
    ? 'enter/y send | E edit | esc/n cancel'
    : 'E edit | esc/n cancel';
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
