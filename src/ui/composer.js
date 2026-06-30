import React from 'react';
import { Box, Text } from 'ink';
import {
  createManualRequestDraft,
  createManualRequestDraftFromLog,
  MANUAL_REQUEST_AUTH_MODES,
  MANUAL_REQUEST_BODY_MODES,
  MANUAL_REQUEST_METHODS
} from '../engine/manual-request.js';
import {
  API_KEY_PLACEMENTS,
  COMPOSER_RAIL_WIDTH,
  COMPOSER_TAB_LABELS,
  COMPOSER_TAB_SHORTCUTS,
  COMPOSER_TABS,
  h,
  MULTIPART_FIELD_TYPES,
  formatOptionToken,
  pad,
  padLeft,
  truncate
} from './shared.js';
import { cycleValue } from './traffic.js';
import {
  DEFAULT_KEY_BINDINGS,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';

const COMPOSER_TAB_ACTION_BY_TAB = {
  params: 'composer.selectTab.params',
  headers: 'composer.selectTab.headers',
  body: 'composer.selectTab.body',
  auth: 'composer.selectTab.auth',
  cookies: 'composer.selectTab.cookies',
  env: 'composer.selectTab.env',
  save: 'composer.selectTab.save'
};

function getComposerBindingLabel(keyBindings, actionId, options = {}) {
  return getBindingLabel(keyBindings, actionId, options);
}

function getComposerBindingPairLabel(keyBindings, firstActionId, secondActionId, options = {}) {
  return getBindingPairLabel(keyBindings, firstActionId, secondActionId, options);
}

function getComposerTabShortcutLabel(tab, keyBindings = DEFAULT_KEY_BINDINGS) {
  return getComposerBindingLabel(keyBindings, COMPOSER_TAB_ACTION_BY_TAB[tab], { limit: 1 });
}

function getComposerTabRangeLabel(keyBindings = DEFAULT_KEY_BINDINGS) {
  const labels = COMPOSER_TABS.map((tab) => getComposerTabShortcutLabel(tab, keyBindings));

  return labels.join('/') === '1/2/3/4/5/6/7' ? '1-7' : labels.join('/');
}

function createComposerTableRow(values = {}) {
  return {
    enabled: values.enabled !== false,
    key: String(values.key ?? ''),
    value: String(values.value ?? ''),
    secret: Boolean(values.secret),
    type: values.type === 'file' ? 'file' : 'text',
    filePath: String(values.filePath ?? '')
  };
}

function createComposerDraft(overrides = {}) {
  return createManualRequestDraft({
    collection: 'Default',
    url: '/',
    ...overrides
  });
}

export function createBlankComposerState(options = {}) {
  const draft = createComposerDraft({
    environment: options.environment ?? []
  });
  const composer = {
    activeTab: 'params',
    cursor: draft.url.length,
    draft,
    error: '',
    focusIndex: 1,
    isBodyEditorOpen: false,
    isConfirmOpen: false,
    isLibraryOpen: false,
    isOpen: true,
    isSending: false,
    libraryIndex: 0,
    revealSecrets: false,
    resend: null,
    source: 'new',
    status: '',
    warnings: []
  };

  return ensureComposerActiveTabRows(composer);
}

export function createComposerStateFromLog(log, options = {}) {
  const plan = createManualRequestDraftFromLog(log, {
    action: 'edit-resend',
    environment: options.environment ?? []
  });

  return ensureComposerActiveTabRows({
    ...createBlankComposerState({
      environment: options.environment ?? []
    }),
    cursor: plan.draft.url.length,
    draft: plan.draft,
    error: plan.blockers[0] ?? '',
    resend: plan.resend,
    source: 'edit-resend',
    status: plan.warnings[0] ?? '',
    warnings: [...plan.blockers, ...plan.warnings]
  });
}

export function flattenRequestLibrary(library = {}) {
  return (library.requests ?? [])
    .slice()
    .sort((left, right) => {
      const collectionCompare = String(left.collection ?? 'Default').localeCompare(String(right.collection ?? 'Default'));

      if (collectionCompare !== 0) {
        return collectionCompare;
      }

      return String(left.name || left.url).localeCompare(String(right.name || right.url));
    });
}

function maskSecretValue(value, revealSecrets) {
  const text = String(value ?? '');

  if (revealSecrets || text.length === 0) {
    return text;
  }

  return '<secret>';
}

export function getPathValue(source, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], source);
}

export function setPathValue(source, pathParts, value) {
  const [key, ...rest] = pathParts;

  if (key === undefined) {
    return value;
  }

  if (Array.isArray(source)) {
    return source.map((item, index) => (
      index === Number(key) ? setPathValue(item, rest, value) : item
    ));
  }

  return {
    ...source,
    [key]: setPathValue(source?.[key], rest, value)
  };
}

function getComposerRowDescriptors(rows, table, revealSecrets, options = {}) {
  return rows.flatMap((row, index) => {
    const descriptors = [
      {
        kind: 'toggle',
        label: 'on',
        path: [table, index, 'enabled'],
        rowIndex: index,
        table
      }
    ];

    if (options.includeType) {
      descriptors.push({
        kind: 'option',
        label: 'type',
        options: MULTIPART_FIELD_TYPES,
        path: [table, index, 'type'],
        rowIndex: index,
        table
      });
    }

    descriptors.push(
      {
        kind: 'text',
        label: 'key',
        path: [table, index, 'key'],
        rowIndex: index,
        table
      },
      {
        kind: 'text',
        label: row.type === 'file' ? 'file' : 'value',
        path: [table, index, row.type === 'file' ? 'filePath' : 'value'],
        rowIndex: index,
        secret: options.secretValues || row.secret,
        table
      }
    );

    if (options.includeSecret) {
      descriptors.push({
        kind: 'toggle',
        label: 'secret',
        path: [table, index, 'secret'],
        rowIndex: index,
        table
      });
    }

    return descriptors.map((descriptor) => ({
      ...descriptor,
      revealSecrets
    }));
  });
}

export function getComposerFieldDescriptors(composer) {
  const draft = composer.draft;
  const descriptors = [
    {
      kind: 'option',
      label: 'method',
      options: MANUAL_REQUEST_METHODS,
      path: ['method']
    },
    {
      kind: 'text',
      label: 'url',
      path: ['url']
    }
  ];

  if (composer.activeTab === 'params') {
    descriptors.push(...getComposerRowDescriptors(draft.params, 'params', composer.revealSecrets));
  }

  if (composer.activeTab === 'headers') {
    descriptors.push(...getComposerRowDescriptors(draft.headers, 'headers', composer.revealSecrets));
  }

  if (composer.activeTab === 'cookies') {
    descriptors.push(...getComposerRowDescriptors(draft.cookies, 'cookies', composer.revealSecrets, { secretValues: true }));
  }

  if (composer.activeTab === 'env') {
    descriptors.push(...getComposerRowDescriptors(draft.environment, 'environment', composer.revealSecrets, { includeSecret: true }));
  }

  if (composer.activeTab === 'body') {
    descriptors.push({
      kind: 'option',
      label: 'body mode',
      options: MANUAL_REQUEST_BODY_MODES,
      path: ['body', 'mode']
    });

    if (draft.body.mode === 'raw') {
      descriptors.push({
        kind: 'text',
        label: 'raw body',
        multiline: true,
        path: ['body', 'raw']
      });
    }

    if (draft.body.mode === 'json') {
      descriptors.push({
        kind: 'text',
        label: 'json body',
        multiline: true,
        path: ['body', 'json']
      });
    }

    if (draft.body.mode === 'form-urlencoded') {
      descriptors.push(...getComposerRowDescriptors(draft.formFields, 'formFields', composer.revealSecrets));
    }

    if (draft.body.mode === 'multipart') {
      descriptors.push(...getComposerRowDescriptors(draft.multipartFields, 'multipartFields', composer.revealSecrets, { includeType: true }));
    }
  }

  if (composer.activeTab === 'auth') {
    descriptors.push({
      kind: 'option',
      label: 'auth mode',
      options: MANUAL_REQUEST_AUTH_MODES,
      path: ['auth', 'mode']
    });

    if (draft.auth.mode === 'bearer') {
      descriptors.push({
        kind: 'text',
        label: 'token',
        path: ['auth', 'bearerToken'],
        secret: true
      });
    }

    if (draft.auth.mode === 'basic') {
      descriptors.push(
        {
          kind: 'text',
          label: 'username',
          path: ['auth', 'username']
        },
        {
          kind: 'text',
          label: 'password',
          path: ['auth', 'password'],
          secret: true
        }
      );
    }

    if (draft.auth.mode === 'apiKey') {
      descriptors.push(
        {
          kind: 'text',
          label: 'key',
          path: ['auth', 'apiKey', 'key']
        },
        {
          kind: 'text',
          label: 'value',
          path: ['auth', 'apiKey', 'value'],
          secret: true
        },
        {
          kind: 'option',
          label: 'add to',
          options: API_KEY_PLACEMENTS,
          path: ['auth', 'apiKey', 'placement']
        }
      );
    }
  }

  if (composer.activeTab === 'save') {
    descriptors.push(
      {
        kind: 'text',
        label: 'name',
        path: ['name']
      },
      {
        kind: 'text',
        label: 'collection',
        path: ['collection']
      }
    );
  }

  return descriptors;
}

function getComposerTableForTab(composer, tab = composer.activeTab) {
  if (tab === 'params') {
    return 'params';
  }

  if (tab === 'headers') {
    return 'headers';
  }

  if (tab === 'cookies') {
    return 'cookies';
  }

  if (tab === 'env') {
    return 'environment';
  }

  if (tab === 'body' && composer.draft.body.mode === 'form-urlencoded') {
    return 'formFields';
  }

  if (tab === 'body' && composer.draft.body.mode === 'multipart') {
    return 'multipartFields';
  }

  return null;
}

function createComposerRowForTable(table) {
  return createComposerTableRow({
    type: table === 'multipartFields' ? 'text' : undefined,
    secret: table === 'cookies'
  });
}

export function ensureComposerActiveTabRows(composer) {
  const table = getComposerTableForTab(composer);

  if (!table) {
    return composer;
  }

  const rows = getPathValue(composer.draft, [table]) ?? [];

  if (rows.length > 0) {
    return composer;
  }

  return {
    ...composer,
    draft: setPathValue(composer.draft, [table], [createComposerRowForTable(table)])
  };
}

function getDefaultComposerFocusIndex(composer) {
  const descriptors = getComposerFieldDescriptors(composer);
  const sectionDescriptors = descriptors
    .map((descriptor, index) => ({ descriptor, index }))
    .slice(2);
  const preferred = sectionDescriptors.find(({ descriptor }) => descriptor.kind === 'text') ?? sectionDescriptors[0];

  return preferred?.index ?? Math.min(1, Math.max(0, descriptors.length - 1));
}

function getComposerCursorForFocus(composer, focusIndex) {
  const descriptor = getComposerFieldDescriptors(composer)[focusIndex];

  if (descriptor?.kind !== 'text') {
    return 0;
  }

  return String(getPathValue(composer.draft, descriptor.path) ?? '').length;
}

export function getComposerTabFromShortcut(value) {
  return COMPOSER_TAB_SHORTCUTS.get(String(value ?? '')) ?? null;
}

function resolveComposerTab(tabOrIndex) {
  if (typeof tabOrIndex === 'number') {
    return COMPOSER_TABS[tabOrIndex - 1] ?? null;
  }

  const shortcutTab = getComposerTabFromShortcut(tabOrIndex);

  if (shortcutTab) {
    return shortcutTab;
  }

  return COMPOSER_TABS.includes(tabOrIndex) ? tabOrIndex : null;
}

export function selectComposerTab(composer, tabOrIndex) {
  const activeTab = resolveComposerTab(tabOrIndex);

  if (!activeTab) {
    return composer;
  }

  const withTab = ensureComposerActiveTabRows({
    ...composer,
    activeTab,
    isBodyEditorOpen: false,
    isConfirmOpen: false,
    isLibraryOpen: false
  });
  const focusIndex = getDefaultComposerFocusIndex(withTab);

  return {
    ...withTab,
    cursor: getComposerCursorForFocus(withTab, focusIndex),
    focusIndex
  };
}

export function getFocusedComposerDescriptor(composer) {
  const descriptors = getComposerFieldDescriptors(composer);
  const index = Math.max(0, Math.min(descriptors.length - 1, composer.focusIndex));

  return descriptors[index] ?? descriptors[0] ?? null;
}


function getComposerDisplayValue(value, descriptor, composer, isFocused) {
  if (descriptor?.kind === 'toggle') {
    return value ? 'on' : 'off';
  }

  if (descriptor?.kind === 'option') {
    return descriptor.options
      .map((option) => formatOptionToken(option, {
        cursor: option === value,
        selected: option === value
      }))
      .join(' ');
  }

  const text = descriptor?.secret
    ? maskSecretValue(value, composer.revealSecrets)
    : String(value ?? '');
  const displayText = text.length > 0 ? text : '(empty)';

  return `${truncate(displayText.replace(/\n/g, '\\n'), 90)}${isFocused ? '_' : ''}`;
}

function getEnabledComposerRows(rows = []) {
  return rows.filter((row) => row.enabled !== false && String(row.key ?? '').trim());
}

function formatComposerPreviewRows(rows = [], options = {}) {
  const enabledRows = getEnabledComposerRows(rows);
  const emptyText = options.emptyText ?? '(none)';

  if (enabledRows.length === 0) {
    return [emptyText];
  }

  return enabledRows.slice(0, 6).map((row) => {
    const value = row.type === 'file' ? row.filePath : row.value;
    const displayValue = options.secretValues || row.secret
      ? maskSecretValue(value, options.revealSecrets)
      : value;

    return `${row.key}: ${displayValue}`;
  });
}

function getComposerPreviewBodySummary(draft) {
  const mode = draft.body?.mode ?? 'none';

  if (mode === 'none') {
    return 'none';
  }

  if (mode === 'raw') {
    return `raw ${draft.body.raw.length} chars`;
  }

  if (mode === 'json') {
    return `json ${draft.body.json.length} chars`;
  }

  if (mode === 'form-urlencoded') {
    return `form-urlencoded ${getEnabledComposerRows(draft.formFields).length} fields`;
  }

  if (mode === 'multipart') {
    return `multipart ${getEnabledComposerRows(draft.multipartFields).length} fields`;
  }

  return mode;
}

function getComposerPreviewAuthSummary(auth = {}) {
  if (auth.mode === 'apiKey') {
    return `api key in ${auth.apiKey?.placement ?? 'header'}`;
  }

  return auth.mode ?? 'none';
}

function renderComposerPreview(composer, keyBindings = DEFAULT_KEY_BINDINGS) {
  const draft = composer.draft;
  const params = formatComposerPreviewRows(draft.params, { revealSecrets: composer.revealSecrets });
  const headers = formatComposerPreviewRows(draft.headers, { revealSecrets: composer.revealSecrets });
  const cookies = formatComposerPreviewRows(draft.cookies, {
    revealSecrets: composer.revealSecrets,
    secretValues: true
  });

  return [
    h(Text, { key: 'preview-title', color: 'cyan', bold: true }, 'Preview request'),
    h(Text, { key: 'preview-request', wrap: 'truncate' }, `${draft.method} ${draft.url || '/'}`),
    h(Text, { key: 'preview-auth', wrap: 'truncate' }, `auth ${getComposerPreviewAuthSummary(draft.auth)} | body ${getComposerPreviewBodySummary(draft)}`),
    ...(composer.warnings ?? []).slice(0, 3).map((warning, index) => h(
      Text,
      { key: `preview-warning-${index}`, color: 'yellow', wrap: 'truncate' },
      `warning ${warning}`
    )),
    h(Text, { key: 'preview-space-1' }, ''),
    h(Text, { key: 'preview-params-title', color: 'gray' }, 'Params'),
    ...params.map((row, index) => h(Text, { key: `preview-param-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-headers-title', color: 'gray' }, 'Headers'),
    ...headers.map((row, index) => h(Text, { key: `preview-header-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-cookies-title', color: 'gray' }, 'Cookies'),
    ...cookies.map((row, index) => h(Text, { key: `preview-cookie-${index}`, wrap: 'truncate' }, `  ${row}`)),
    h(Text, { key: 'preview-space-2' }, ''),
    h(Text, { key: 'preview-confirm', color: 'yellow', bold: true }, 'Send this request?'),
    h(Text, { key: 'preview-help', color: 'gray' }, `${getComposerBindingLabel(keyBindings, 'composerConfirm.confirm', { limit: 2 })} send | ${getComposerBindingLabel(keyBindings, 'composerConfirm.cancel', { limit: 2 })} edit`)
  ];
}

function renderComposerDescriptor(composer, descriptor, index) {
  const value = getPathValue(composer.draft, descriptor.path);
  const isFocused = index === composer.focusIndex;

  return h(
    Box,
    { key: `${descriptor.path.join('.')}-${index}` },
    h(Text, { color: isFocused ? 'cyan' : 'gray' }, isFocused ? '>' : ' '),
    h(Text, { color: isFocused ? 'cyan' : 'gray' }, ` ${pad(descriptor.label, 12)}`),
    h(Text, { wrap: 'truncate' }, getComposerDisplayValue(value, descriptor, composer, isFocused))
  );
}

function renderComposerTableEmpty(activeTab) {
  return h(Text, { color: 'gray' }, `${COMPOSER_TAB_LABELS[activeTab]} has no rows.`);
}

function renderComposerTabBody(composer, keyBindings = DEFAULT_KEY_BINDINGS) {
  if (composer.isBodyEditorOpen) {
    const descriptor = getFocusedComposerDescriptor(composer);
    const value = descriptor?.kind === 'text'
      ? String(getPathValue(composer.draft, descriptor.path) ?? '')
      : '';
    const lines = value.length > 0 ? value.split('\n') : [''];

    return [
      h(Text, { key: 'editor-title', color: 'cyan', bold: true }, 'Body editor'),
      ...lines.slice(0, 14).map((line, index) => h(
        Text,
        { key: `editor-${index}`, wrap: 'truncate' },
        `${padLeft(index + 1, 3)} ${line}${index === lines.length - 1 ? '_' : ''}`
      )),
      h(Text, { key: 'editor-help', color: 'gray' }, `${getComposerBindingLabel(keyBindings, 'composerBody.newline', { limit: 1 })} newline | ${getComposerBindingLabel(keyBindings, 'composerBody.close', { limit: 1 })} back to Body tab | ${getComposerBindingLabel(keyBindings, 'global.quit', { limit: 1 })} quit`)
    ];
  }

  const descriptors = getComposerFieldDescriptors(composer);
  const tabDescriptors = descriptors.slice(2);

  if (tabDescriptors.length === 0) {
    return [renderComposerTableEmpty(composer.activeTab)];
  }

  return tabDescriptors.map((descriptor, index) => renderComposerDescriptor(composer, descriptor, index + 2));
}

function renderComposerLibrary(composer, library, keyBindings = DEFAULT_KEY_BINDINGS) {
  const requests = flattenRequestLibrary(library);
  const selectedIndex = Math.max(0, Math.min(requests.length - 1, composer.libraryIndex));

  return [
    h(Text, { key: 'library-title', color: 'cyan', bold: true }, 'Saved requests'),
    library.warning ? h(Text, { key: 'library-warning', color: 'yellow', wrap: 'truncate' }, library.warning) : null,
    requests.length === 0
      ? h(Text, { key: 'library-empty', color: 'gray' }, `No saved requests. Compose a request and press ${getComposerBindingLabel(keyBindings, 'composer.save', { limit: 1 })} to save it.`)
      : requests.slice(0, 18).map((request, index) => {
        const selected = index === selectedIndex;

        return h(
          Text,
          {
            key: request.id,
            backgroundColor: selected ? 'cyan' : undefined,
            color: selected ? 'black' : undefined,
            wrap: 'truncate'
          },
          `${selected ? '>' : ' '} ${pad(request.collection ?? 'Default', 14)} ${pad(request.method, 7)} ${request.name || request.url}`
        );
      }),
    h(Text, { key: 'library-help', color: 'gray' }, `${getComposerBindingPairLabel(keyBindings, 'composerLibrary.moveDown', 'composerLibrary.moveUp')} move | ${getComposerBindingLabel(keyBindings, 'composerLibrary.open', { limit: 1 })} open | ${getComposerBindingLabel(keyBindings, 'composerLibrary.close', { limit: 2 })} close`)
  ].filter(Boolean);
}

function getComposerTabShortcut(tab, keyBindings = DEFAULT_KEY_BINDINGS) {
  const index = COMPOSER_TABS.indexOf(tab);

  return index === -1 ? '' : getComposerTabShortcutLabel(tab, keyBindings);
}

function formatComposerAuthSummary(auth = {}) {
  return auth.mode === 'apiKey' ? 'api key' : (auth.mode ?? 'none');
}

function getComposerTabSummary(composer, tab) {
  const draft = composer.draft;

  if (tab === 'params') {
    return String(draft.params.length);
  }

  if (tab === 'headers') {
    return String(draft.headers.length);
  }

  if (tab === 'body') {
    return draft.body.mode;
  }

  if (tab === 'auth') {
    return formatComposerAuthSummary(draft.auth);
  }

  if (tab === 'cookies') {
    return String(draft.cookies.length);
  }

  if (tab === 'env') {
    return String(draft.environment.length);
  }

  return draft.collection || 'Default';
}

export function getComposerSectionRows(composer, library = {}, keyBindings = DEFAULT_KEY_BINDINGS) {
  return [
    ...COMPOSER_TABS.map((tab) => ({
      active: !composer.isLibraryOpen && tab === composer.activeTab,
      key: getComposerTabShortcut(tab, keyBindings),
      label: COMPOSER_TAB_LABELS[tab],
      summary: getComposerTabSummary(composer, tab),
      tab
    })),
    {
      active: Boolean(composer.isLibraryOpen),
      key: getComposerBindingLabel(keyBindings, 'composer.openLibrary', { limit: 1 }),
      label: 'Library',
      summary: String(flattenRequestLibrary(library).length),
      tab: 'library'
    }
  ];
}

function renderComposerSectionRail(composer, library, keyBindings = DEFAULT_KEY_BINDINGS) {
  return h(
    Box,
    {
      flexDirection: 'column',
      flexShrink: 0,
      marginRight: 2,
      width: COMPOSER_RAIL_WIDTH
    },
    h(Text, { color: 'cyan', bold: true }, 'Sections'),
    h(Text, { color: 'gray' }, `${getComposerTabRangeLabel(keyBindings)} jump`),
    h(Text, {}, ''),
    ...getComposerSectionRows(composer, library, keyBindings).map((item) => {
      const text = `${item.active ? '>' : ' '} ${pad(item.key, 2)} ${pad(item.label, 8)} ${truncate(item.summary, 8)}`;

      return h(
        Text,
        {
          key: item.tab,
          backgroundColor: item.active ? 'cyan' : undefined,
          color: item.active ? 'black' : (item.key === 'l' ? 'gray' : undefined),
          wrap: 'truncate'
        },
        text
      );
    })
  );
}

export const RequestComposerPanel = React.memo(function RequestComposerPanel({
  composer,
  keyBindings = DEFAULT_KEY_BINDINGS,
  library,
  targetUrl
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(72, columns - 4);
  const title = composer.source === 'edit-resend'
    ? 'Edit and resend'
    : (composer.source === 'next-page'
      ? 'Next page'
      : (composer.source === 'library' ? 'Saved request' : 'New request'));
  const statusText = composer.isSending
    ? 'sending...'
    : (composer.error || composer.status || composer.warnings?.[0] || 'ready');
  const statusColor = composer.error ? 'yellow' : (composer.isSending ? 'cyan' : 'gray');
  const descriptors = getComposerFieldDescriptors(composer);
  const sectionTitle = composer.isLibraryOpen
    ? 'Library'
    : `${getComposerTabShortcut(composer.activeTab, keyBindings)} ${COMPOSER_TAB_LABELS[composer.activeTab]}`;
  const isTextFocused = getFocusedComposerDescriptor(composer)?.kind === 'text';
  const helpText = composer.isConfirmOpen
    ? `preview | ${getComposerBindingLabel(keyBindings, 'composerConfirm.confirm', { limit: 2 })} send | ${getComposerBindingLabel(keyBindings, 'composerConfirm.cancel', { limit: 2 })} edit`
    : (isTextFocused
      ? `typing | ${getComposerBindingLabel(keyBindings, 'composer.backspace', { limit: 1 })} ${getComposerBindingLabel(keyBindings, 'composer.delete', { limit: 1 })} | ${getComposerBindingLabel(keyBindings, 'composer.nextField', { limit: 1 })} next | ${getComposerBindingLabel(keyBindings, 'composer.preview', { limit: 1 })} preview | ${getComposerBindingLabel(keyBindings, 'composer.close', { limit: 1 })} close | ${getComposerTabRangeLabel(keyBindings)} sections`
      : `${getComposerTabRangeLabel(keyBindings)} sections | ${getComposerBindingPairLabel(keyBindings, 'composer.previousTab', 'composer.nextTab')} section | ${getComposerBindingLabel(keyBindings, 'composer.nextField', { limit: 1 })} fields | ${getComposerBindingLabel(keyBindings, 'composer.preview', { limit: 1 })} preview | ${getComposerBindingLabel(keyBindings, 'composer.addRow', { limit: 1 })} add | ${getComposerBindingLabel(keyBindings, 'composer.deleteRow', { limit: 1 })} delete | ${getComposerBindingLabel(keyBindings, 'composer.save', { limit: 1 })} save | ${getComposerBindingLabel(keyBindings, 'composer.openLibrary', { limit: 1 })} library | ${getComposerBindingLabel(keyBindings, 'composer.revealSecrets', { limit: 1 })} reveal | ${getComposerBindingLabel(keyBindings, 'composer.close', { limit: 1 })} close`);

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow: 1
    },
    h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: composer.error ? 'yellow' : 'cyan',
        paddingX: 2,
        paddingY: 1,
        width
      },
      h(Text, { color: composer.error ? 'yellow' : 'cyan', bold: true }, title),
      h(Text, { color: 'gray', wrap: 'truncate' }, `target ${targetUrl ?? '(not configured)'}`),
      h(Text, {}, ''),
      h(
        Box,
        { flexDirection: 'row', flexGrow: 1 },
        renderComposerSectionRail(composer, library, keyBindings),
        h(
          Box,
          { flexDirection: 'column', flexGrow: 1 },
          composer.isLibraryOpen
            ? renderComposerLibrary(composer, library, keyBindings)
            : (composer.isConfirmOpen
              ? renderComposerPreview(composer, keyBindings)
              : [
              h(Text, { key: 'request-line', color: 'gray' }, 'Request'),
              renderComposerDescriptor(composer, descriptors[0], 0),
              renderComposerDescriptor(composer, descriptors[1], 1),
              h(Text, { key: 'tabs-space' }, ''),
              h(Text, { key: 'section-title', color: 'cyan', bold: true }, sectionTitle),
              ...renderComposerTabBody(composer, keyBindings)
            ])
        )
      ),
      h(Text, {}, ''),
      h(Text, { color: statusColor, wrap: 'truncate' }, statusText),
      h(Text, { color: 'gray', wrap: 'truncate' }, helpText)
    )
  );
});


export function clampComposerFocus(composer) {
  const descriptors = getComposerFieldDescriptors(composer);

  return {
    ...composer,
    focusIndex: Math.max(0, Math.min(descriptors.length - 1, composer.focusIndex))
  };
}

export function updateComposerDraftPath(composer, pathParts, updater) {
  const currentValue = getPathValue(composer.draft, pathParts);
  const nextValue = typeof updater === 'function' ? updater(currentValue) : updater;

  return clampComposerFocus({
    ...composer,
    draft: setPathValue(composer.draft, pathParts, nextValue),
    error: ''
  });
}

export function getFocusedTextDescriptor(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  return descriptor?.kind === 'text' ? descriptor : null;
}

export function insertComposerText(composer, value) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));
  const nextText = `${text.slice(0, cursor)}${value}${text.slice(cursor)}`;

  return {
    ...updateComposerDraftPath(composer, descriptor.path, nextText),
    cursor: cursor + value.length
  };
}

export function backspaceComposerText(composer) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));

  if (cursor === 0) {
    return composer;
  }

  return {
    ...updateComposerDraftPath(composer, descriptor.path, `${text.slice(0, cursor - 1)}${text.slice(cursor)}`),
    cursor: cursor - 1
  };
}

export function deleteComposerText(composer) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');
  const cursor = Math.max(0, Math.min(text.length, composer.cursor));

  if (cursor >= text.length) {
    return composer;
  }

  return updateComposerDraftPath(composer, descriptor.path, `${text.slice(0, cursor)}${text.slice(cursor + 1)}`);
}

export function moveComposerCursor(composer, direction) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');

  return {
    ...composer,
    cursor: Math.max(0, Math.min(text.length, composer.cursor + direction))
  };
}

export function moveComposerCursorTo(composer, boundary) {
  const descriptor = getFocusedTextDescriptor(composer);

  if (!descriptor) {
    return composer;
  }

  const text = String(getPathValue(composer.draft, descriptor.path) ?? '');

  return {
    ...composer,
    cursor: boundary === 'end' ? text.length : 0
  };
}

export function cycleFocusedComposerOption(composer, direction) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (descriptor?.kind !== 'option') {
    return moveComposerCursor(composer, direction);
  }

  return ensureComposerActiveTabRows(updateComposerDraftPath(composer, descriptor.path, (currentValue) => (
    cycleValue(descriptor.options, currentValue, direction)
  )));
}

export function toggleFocusedComposerField(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (descriptor?.kind !== 'toggle') {
    return composer;
  }

  return updateComposerDraftPath(composer, descriptor.path, (currentValue) => !currentValue);
}

export function getComposerTableForActiveTab(composer) {
  return getComposerTableForTab(composer);
}

export function addComposerRow(composer) {
  const table = getComposerTableForActiveTab(composer);

  if (!table) {
    return composer;
  }

  const row = createComposerTableRow({
    type: table === 'multipartFields' ? 'text' : undefined,
    secret: table === 'cookies'
  });
  const rows = getPathValue(composer.draft, [table]) ?? [];
  const nextComposer = {
    ...composer,
    draft: setPathValue(composer.draft, [table], [...rows, row]),
    error: ''
  };
  const descriptors = getComposerFieldDescriptors(nextComposer);
  const focusIndex = descriptors.findIndex((descriptor) => (
    descriptor.table === table &&
      descriptor.rowIndex === rows.length &&
      descriptor.kind === 'text' &&
      descriptor.label === 'key'
  ));

  return clampComposerFocus({
    ...nextComposer,
    cursor: 0,
    focusIndex: focusIndex === -1 ? getComposerFieldDescriptors(composer).length : focusIndex
  });
}

export function deleteComposerRow(composer) {
  const descriptor = getFocusedComposerDescriptor(composer);

  if (!descriptor?.table || descriptor.rowIndex === undefined) {
    return composer;
  }

  const rows = getPathValue(composer.draft, [descriptor.table]) ?? [];

  return clampComposerFocus({
    ...composer,
    draft: setPathValue(composer.draft, [descriptor.table], rows.filter((_, index) => index !== descriptor.rowIndex)),
    error: ''
  });
}

export function cycleComposerTab(composer, direction) {
  return selectComposerTab(composer, cycleValue(COMPOSER_TABS, composer.activeTab, direction));
}

export function moveComposerFocus(composer, direction) {
  const descriptors = getComposerFieldDescriptors(composer);
  const nextIndex = (composer.focusIndex + direction + descriptors.length) % descriptors.length;
  const descriptor = descriptors[nextIndex];
  const value = descriptor?.kind === 'text' ? String(getPathValue(composer.draft, descriptor.path) ?? '') : '';

  return {
    ...composer,
    cursor: value.length,
    focusIndex: nextIndex
  };
}
