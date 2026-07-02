import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveFilters,
  analyzeTrafficFlows,
  analyzePagination,
  analyzeCacheHeaders,
  analyzeContentNegotiation,
  analyzeCors,
  applyDetailMatches,
  classifyFrameworkAssetRequest,
  clampDetailRowIndex,
  clampScrollOffset,
  COMMAND_DEFINITIONS,
  createRequestDiff,
  createBlankComposerState,
  createComposerStateFromLog,
  createEndpointGroups,
  createNextPageRequestDraftFromLog,
  createSchemaGroups,
  DEFAULT_KEY_BINDINGS,
  DETAIL_TABS,
  detectAuthSecrets,
  decodeJwtToken,
  EndpointGroupsModal,
  FlowAnalysisModal,
  cycleDetailWidthMode,
  cyclePaneWidthMode,
  cycleTrafficDensity,
  cycleTrafficPathMode,
  cycleTrafficWidthMode,
  cycleValue,
  ensureComposerActiveTabRows,
  extractPortFromHost,
  findDetailMatches,
  findJwtTokensInLog,
  filterLogs,
  formatAnomalyReasons,
  formatCacheIssue,
  formatDiagnosticsIssue,
  formatFlowLabel,
  filterRequestDiffRows,
  formatCommandSelectionStatus,
  formatEndpointGroupRow,
  formatFlowHeadline,
  formatFlowMetadata,
  formatFlowRow,
  formatFrameworkDetectionLabel,
  formatPaginationNextStatus,
  formatPaneWidthLabel,
  formatFooterText,
  formatFilterLabel,
  formatPathForMode,
  formatStructuredPayloadRows,
  formatJwtScopes,
  formatJwtTimeClaim,
  formatRecordingLabel,
  formatSchemaRow,
  formatTrafficHeader,
  formatTrafficRow,
  HELP_SECTIONS,
  inferJsonShape,
  inferRestAction,
  getDiffCandidateLogIds,
  getDiffEndpointShape,
  getEndpointRoutePattern,
  getFlowDisplayGroups,
  getFlowPreviewRows,
  getRedirectChainGroups,
  getRepeatRequestGroups,
  getRequestDiffRows,
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
  getSearchQueryWarning,
  getTrafficAnomalyMap,
  getTrafficAnomalyReasons,
  getScrollOffsetForFocusedRow,
  getTrafficPaneWidth,
  getTrafficRowWidth,
  isFrameworkAssetRequest,
  parseDetailSearchQuery,
  parseCacheAge,
  parseCacheControl,
  getSelectedIndex,
  getSearchValues,
  getTrafficVisibleCount,
  matchesSearchValues,
  moveSelectedLogId,
  normalizeKeyBindings,
  normalizeTrafficListDisplay,
  parseSearchTerms,
  parseQueryParameters,
  parseJsonPayloadForSchema,
  createRequestActivity,
  failRequestActivity,
  finishRequestActivity,
  formatRequestActivityRow,
  formatRequestActivityToast,
  RequestActivityPage,
  SchemaInferenceModal,
  ToastNotification,
  resolveAutoInspectSelection,
  resolveCommandInput,
  resolveSelectedLogId,
  selectComposerTab,
  shouldOpenDetailModalForInspect,
  shouldUseWideFlowLayout,
  summarizeFrameworkAssets,
  toggleTrafficColumn,
  toggleFilterValue
} from '../src/ui/App.js';
import { CommandModal, HelpModal } from '../src/ui/chrome.js';
import { TrafficList } from '../src/ui/traffic.js';
import {
  DiffFilterBar,
  RequestDiffModal,
  clampRequestDiffValueScrollOffset,
  getRequestDiffFocusedExpansionLines,
  getRequestDiffHeaderText,
  getRequestDiffBottomControlHeight,
  getRequestDiffFrameWidth,
  getRequestDiffFilterBoxHeight,
  getRequestDiffFilterBoxLines,
  getRequestDiffPositionLabel,
  getRequestDiffSideBySideColumns,
  getRequestDiffValueLines,
  getRequestDiffValueScrollLabel,
  getRequestDiffVisibleCount,
  getRequestDiffVisibleStart,
  isRequestDiffStackedLayout,
  shouldShowRequestDiffFilterBar
} from '../src/ui/request-diff.js';

function getTestKeyBindings(overrides = {}) {
  return normalizeKeyBindings({ keyBindings: overrides }).bindings;
}

function createDiffLog(overrides = {}) {
  return {
    id: overrides.id ?? 'log',
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/',
    responseTimeMs: overrides.responseTimeMs ?? 0,
    statusCode: overrides.statusCode ?? 200,
    ...(Object.hasOwn(overrides, 'timestamp') ? { timestamp: overrides.timestamp } : {}),
    request: {
      body: '',
      headers: {},
      truncated: false,
      ...(overrides.request ?? {})
    },
    response: {
      body: '',
      headers: {},
      truncated: false,
      ...(overrides.response ?? {})
    }
  };
}

function encodeJwtPart(value, options = {}) {
  const encoded = Buffer.from(JSON.stringify(value), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return options.padding ? encoded : encoded.replace(/=+$/g, '');
}

function createJwtToken(payload = {}, options = {}) {
  const header = options.header ?? { alg: 'HS256', typ: 'JWT' };
  const signature = options.signature ?? 'signature-secret';

  return [
    encodeJwtPart(header, { padding: options.padding }),
    encodeJwtPart(payload, { padding: options.padding }),
    signature
  ].join('.');
}

function getDiffChangeRows(left, right, options) {
  return getRequestDiffRows(createRequestDiff(left, right, options))
    .filter((row) => row.type === 'change' || row.type === 'warning');
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getRequestDiffModalRowAreaChildren(node) {
  const modal = asArray(node.props.children)[0];
  const modalChildren = asArray(modal.props.children);

  return modalChildren.slice(6);
}

function getRenderedLineCount(node) {
  const children = asArray(node?.props?.children);

  return String(node?.key ?? '').endsWith(':expanded') && children.length > 0
    ? children.length
    : 1;
}

function getRequestDiffModalRowAreaLineCount(node) {
  return getRequestDiffModalRowAreaChildren(node)
    .reduce((count, child) => count + getRenderedLineCount(child), 0);
}

function getNodeText(node) {
  if (Array.isArray(node)) {
    return node.map(getNodeText).join('');
  }

  if (typeof node === 'string') {
    return node;
  }

  return asArray(node?.props?.children).map(getNodeText).join('');
}

function collectNodes(node) {
  if (Array.isArray(node)) {
    return node.flatMap(collectNodes);
  }

  if (!node || typeof node === 'string') {
    return [];
  }

  return [node, ...asArray(node.props?.children).flatMap(collectNodes)];
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

test('auto-inspect selection helper keeps inspected traffic opt-in', () => {
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'one', 'three', { autoInspect: false, direction: 1 }),
    { selectedLogId: 'two', inspectedLogId: 'three' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'one', 'three', { autoInspect: true, direction: 1 }),
    { selectedLogId: 'two', inspectedLogId: 'two' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'one', 'three', { autoInspect: true, direction: getPageStep(20) }),
    { selectedLogId: 'three', inspectedLogId: 'three' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'three', 'one', { autoInspect: true, boundary: 'first' }),
    { selectedLogId: 'one', inspectedLogId: 'one' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'one', 'one', { autoInspect: true, boundary: 'last' }),
    { selectedLogId: 'three', inspectedLogId: 'three' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection([{ id: 'two' }], 'one', 'one', {
      autoInspect: true,
      selectedLogId: resolveSelectedLogId([{ id: 'two' }], 'one')
    }),
    { selectedLogId: 'two', inspectedLogId: 'two' }
  );
  assert.deepEqual(
    resolveAutoInspectSelection(logs, 'two', 'one'),
    { selectedLogId: 'two', inspectedLogId: 'one' }
  );
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
  assert.equal(shouldOpenDetailModalForInspect({
    paneLayout: getPaneLayout({ widthMode: 'full', widthTarget: 'traffic' }, 120),
    selectedLog: log
  }), true);
  assert.equal(shouldOpenDetailModalForInspect({
    paneLayout: getPaneLayout({ widthMode: 'normal' }, 120),
    selectedLog: log
  }), false);
  assert.equal(shouldOpenDetailModalForInspect({
    paneLayout: getPaneLayout({ widthMode: 'full', widthTarget: 'traffic' }, 120),
    selectedLog: null
  }), false);
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
  assert.equal(formatTrafficRow(log, false, full, undefined, { isClinspectSent: true }).startsWith('* '), true);
  assert.equal(formatTrafficRow(log, false, full, undefined, { isClinspectSent: true }).length, 45);
  assert.equal(formatTrafficRow(log, true, full, undefined, { isClinspectSent: true }).startsWith('> '), true);
  assert.equal(formatTrafficRow(log, false, full, undefined, { isDiffBase: true }).startsWith('m1 '), true);
  assert.equal(formatTrafficRow(log, true, full, undefined, { isDiffBase: true }).startsWith('m1 '), true);
  assert.equal(formatTrafficRow(log, false, full, undefined, { isDiffCandidate: true }).startsWith('sim '), true);
  assert.equal(formatTrafficRow(log, true, full, undefined, { isDiffCandidate: true }).startsWith('sim '), true);
  assert.equal(formatTrafficHeader(full, wideRowWidth).length, wideRowWidth);
  assert.equal(formatTrafficRow(log, true, full, wideRowWidth).length, wideRowWidth);
  assert.equal(formatTrafficRow(log, false, compact).includes('GET'), true);
  assert.equal(formatTrafficRow(log, false, compact).includes('34ms'), false);
  assert.equal(formatTrafficRow(log, false, pathOnly).includes('GET'), false);
  assert.equal(formatTrafficRow(log, false, pathOnly).includes('200'), false);
  assert.equal(formatFilterLabel([], [], 'all', '', { clinspectSentCount: 2 }), 'cli sent marked *');
  assert.equal(formatFilterLabel([], [], 'all', '', { diffCandidateCount: 2 }), 'sim matches m1');
});

test('traffic anomaly helpers detect balanced anomaly cases', () => {
  const repeated4xxLogs = [
    createDiffLog({ id: 'bad-1', path: '/api/users/123', statusCode: 404 }),
    createDiffLog({ id: 'bad-2', path: '/api/users/456', statusCode: 429 }),
    createDiffLog({ id: 'bad-3', path: '/api/users/789', statusCode: 400 })
  ];
  const repeated5xxLogs = [
    createDiffLog({ id: 'err-1', path: '/api/reports/123', statusCode: 500 }),
    createDiffLog({ id: 'err-2', path: '/api/reports/456', statusCode: 502 }),
    createDiffLog({ id: 'err-3', path: '/api/reports/789', statusCode: 503 })
  ];
  const largeBody = createDiffLog({
    id: 'large',
    response: { body: 'x'.repeat(100 * 1024), headers: { 'content-type': 'text/plain' } }
  });
  const truncatedBody = createDiffLog({
    id: 'truncated',
    request: { body: 'partial', headers: {}, truncated: true }
  });
  const contentLengthBody = createDiffLog({
    id: 'content-length',
    response: { body: '', headers: { 'content-length': String(100 * 1024) } },
    statusCode: 201
  });
  const slow = createDiffLog({ id: 'slow', responseTimeMs: 1000 });
  const missingContentType = createDiffLog({
    id: 'missing-content-type',
    response: { body: 'hello', headers: {} }
  });
  const corsMismatch = createDiffLog({
    id: 'cors',
    request: {
      body: '',
      headers: {
        cookie: 'sid=secret',
        origin: 'https://app.example'
      }
    },
    response: {
      body: 'ok',
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/plain'
      }
    }
  });
  const negotiationMismatch = createDiffLog({
    id: 'negotiation',
    path: '/api/users',
    request: {
      body: '',
      headers: {
        accept: 'application/json'
      }
    },
    response: {
      body: '<html>error</html>',
      headers: {
        'content-type': 'text/html'
      }
    },
    statusCode: 500
  });
  const emptyOk = createDiffLog({
    id: 'empty-ok',
    response: { body: '', headers: { 'content-type': 'text/plain' } },
    statusCode: 200
  });
  const emptyError = createDiffLog({
    id: 'empty-error',
    response: { body: '', headers: { 'content-type': 'text/plain' } },
    statusCode: 500
  });
  const validEmpty = [
    createDiffLog({ id: 'head', method: 'HEAD', response: { body: '', headers: {} }, statusCode: 200 }),
    createDiffLog({ id: 'empty-204', response: { body: '', headers: {} }, statusCode: 204 }),
    createDiffLog({ id: 'empty-304', response: { body: '', headers: {} }, statusCode: 304 })
  ];

  assert.deepEqual(getTrafficAnomalyMap(repeated4xxLogs).get('bad-1'), ['repeated-4xx', 'empty-response']);
  assert.deepEqual(getTrafficAnomalyMap(repeated5xxLogs).get('err-1'), ['repeated-5xx', 'empty-response']);
  assert.deepEqual(getTrafficAnomalyReasons(largeBody), ['large-body']);
  assert.deepEqual(getTrafficAnomalyReasons(truncatedBody), ['large-body', 'empty-response']);
  assert.deepEqual(getTrafficAnomalyReasons(contentLengthBody), ['large-body', 'empty-response']);
  assert.deepEqual(getTrafficAnomalyReasons(slow), ['slow', 'empty-response']);
  assert.deepEqual(getTrafficAnomalyReasons(missingContentType), ['missing-content-type', 'content-negotiation']);
  assert.deepEqual(getTrafficAnomalyReasons(corsMismatch), ['cors']);
  assert.deepEqual(getTrafficAnomalyReasons(negotiationMismatch), ['content-negotiation']);
  assert.deepEqual(getTrafficAnomalyReasons(emptyOk), ['empty-response']);
  assert.deepEqual(getTrafficAnomalyReasons(emptyError), ['empty-response']);
  assert.deepEqual(validEmpty.flatMap((item) => getTrafficAnomalyReasons(item)), []);
  assert.equal(
    formatAnomalyReasons(['slow', 'large-body', 'missing-content-type', 'cors', 'content-negotiation']),
    'slow, large body, missing content-type, CORS, content negotiation'
  );
});

test('diagnostics CORS analyzer explains preflight and response mismatches', () => {
  const preflight = analyzeCors(createDiffLog({
    method: 'OPTIONS',
    request: {
      body: '',
      headers: {
        cookie: 'sid=secret',
        origin: 'https://app.example',
        'access-control-request-method': 'PATCH',
        'access-control-request-headers': 'X-Token, X-Missing'
      }
    },
    response: {
      body: '',
      headers: {
        'access-control-allow-origin': 'https://app.example',
        'access-control-allow-methods': 'GET, POST',
        'access-control-allow-headers': 'X-Token'
      }
    }
  }));
  const wildcardCredentials = analyzeCors(createDiffLog({
    request: {
      body: '',
      headers: {
        authorization: 'Bearer token',
        origin: 'https://app.example'
      }
    },
    response: {
      body: 'ok',
      headers: {
        'access-control-allow-credentials': 'true',
        'access-control-allow-origin': '*',
        'content-type': 'text/plain'
      }
    }
  }));
  const originMismatch = analyzeCors(createDiffLog({
    request: {
      body: '',
      headers: {
        origin: 'https://app.example'
      }
    },
    response: {
      body: 'ok',
      headers: {
        'access-control-allow-origin': 'https://admin.example',
        'content-type': 'text/plain'
      }
    }
  }));
  const noOrigin = analyzeCors(createDiffLog());

  assert.equal(preflight.preflight, true);
  assert.deepEqual(preflight.issues.map((issue) => issue.id), [
    'credentials-not-allowed',
    'method-not-allowed',
    'headers-not-allowed'
  ]);
  assert.equal(preflight.rows.some((row) => row.text === 'requested method: PATCH'), true);
  assert.equal(preflight.rows.some((row) => row.text === 'requested headers: x-token, x-missing'), true);
  assert.deepEqual(wildcardCredentials.issues.map((issue) => issue.id), ['wildcard-with-credentials']);
  assert.deepEqual(originMismatch.issues.map((issue) => issue.id), ['origin-not-allowed']);
  assert.deepEqual(noOrigin.issues, []);
  assert.equal(noOrigin.rows.some((row) => row.text === 'cors: not a cross-origin browser request'), true);
  assert.equal(
    formatDiagnosticsIssue(preflight.issues[0]),
    'cors issue: Credential-like request is missing Access-Control-Allow-Credentials: true'
  );
});

test('diagnostics content negotiation analyzer flags mismatches cautiously', () => {
  const jsonClientHtml = analyzeContentNegotiation(createDiffLog({
    path: '/api/users',
    request: {
      body: '',
      headers: {
        accept: 'application/json'
      }
    },
    response: {
      body: '<html>error</html>',
      headers: {
        'content-type': 'text/html'
      }
    },
    statusCode: 500
  }));
  const wildcardOk = analyzeContentNegotiation(createDiffLog({
    request: {
      body: '',
      headers: {
        accept: '*/*'
      }
    },
    response: {
      body: '<html>ok</html>',
      headers: {
        'content-type': 'text/html'
      }
    }
  }));
  const encodingMismatch = analyzeContentNegotiation(createDiffLog({
    request: {
      body: '',
      headers: {
        'accept-encoding': 'gzip'
      }
    },
    response: {
      body: 'compressed',
      headers: {
        'content-encoding': 'br',
        'content-type': 'text/plain'
      }
    }
  }));
  const requestBodyIssues = analyzeContentNegotiation(createDiffLog({
    request: {
      body: JSON.stringify({ name: 'Ada' }),
      headers: {
        'content-type': 'text/plain'
      }
    },
    response: {
      body: 'ok',
      headers: {
        'content-type': 'text/plain'
      }
    }
  }));
  const missingResponseType = analyzeContentNegotiation(createDiffLog({
    response: {
      body: 'hello',
      headers: {}
    }
  }));
  const formMissingType = analyzeContentNegotiation(createDiffLog({
    request: {
      body: 'name=Ada',
      headers: {}
    }
  }));

  assert.deepEqual(jsonClientHtml.issues.map((issue) => issue.id), [
    'response-not-acceptable',
    'json-client-html-response'
  ]);
  assert.deepEqual(wildcardOk.issues, []);
  assert.deepEqual(encodingMismatch.issues.map((issue) => issue.id), ['encoding-not-accepted']);
  assert.deepEqual(requestBodyIssues.issues.map((issue) => issue.id), ['request-json-content-type-mismatch']);
  assert.deepEqual(missingResponseType.issues.map((issue) => issue.id), ['missing-response-content-type']);
  assert.deepEqual(formMissingType.issues.map((issue) => issue.id), ['request-form-content-type-mismatch']);
  assert.equal(jsonClientHtml.rows.some((row) => row.text === 'accept: application/json'), true);
  assert.equal(
    formatDiagnosticsIssue(jsonClientHtml.issues[1]),
    'content negotiation issue: JSON-preferring client received an HTML response'
  );
});

test('diagnostics REST action inference labels common resource operations', () => {
  assert.equal(inferRestAction(createDiffLog({ method: 'GET', path: '/api/v1/users' })).action, 'list users');
  assert.equal(inferRestAction(createDiffLog({ method: 'GET', path: '/api/v1/users/123' })).action, 'get user');
  assert.equal(inferRestAction(createDiffLog({ method: 'POST', path: '/api/users' })).action, 'create user');
  assert.equal(inferRestAction(createDiffLog({ method: 'PATCH', path: '/api/users/123' })).action, 'update user');
  assert.equal(inferRestAction(createDiffLog({ method: 'PUT', path: '/api/users/123' })).action, 'update user');
  assert.equal(inferRestAction(createDiffLog({ method: 'DELETE', path: '/api/users/123' })).action, 'delete user');
  assert.equal(
    inferRestAction(createDiffLog({ method: 'GET', path: '/api/users/550e8400-e29b-41d4-a716-446655440000/orders' })).action,
    'list orders'
  );
  assert.equal(inferRestAction(createDiffLog({ method: 'GET', path: '/api/categories/abc123456789' })).action, 'get category');
  assert.equal(inferRestAction(createDiffLog({ method: 'TRACE', path: '/api/users' })).action, 'trace users');
});

test('traffic list renders anomaly highlights without filtering normal rows', () => {
  const anomalyLog = {
    id: 'slow',
    method: 'GET',
    path: '/api/slow',
    responseTimeMs: 1200,
    statusCode: 200,
    timestamp: 1700000000000,
    request: { body: '', headers: {} },
    response: { body: 'ok', headers: { 'content-type': 'text/plain' } }
  };
  const normalLog = {
    id: 'normal',
    method: 'GET',
    path: '/api/normal',
    responseTimeMs: 20,
    statusCode: 200,
    timestamp: 1700000000000,
    request: { body: '', headers: {} },
    response: { body: 'ok', headers: { 'content-type': 'text/plain' } }
  };
  const anomalyMap = getTrafficAnomalyMap([anomalyLog, normalLog]);
  const node = TrafficList.type({
    anomalyMap,
    bottomOffset: 2,
    emptyText: 'No traffic',
    highlightAnomalies: true,
    logs: [anomalyLog, normalLog],
    totalCount: 2,
    selectedIndex: 1,
    isFocused: true,
    isFollowingLatest: false
  });
  const text = getNodeText(node);
  const anomalyRow = collectNodes(node)
    .find((item) => item.props?.backgroundColor === 'yellow' && getNodeText(item).includes('/api/slow'));
  const selectedAnomalyNode = TrafficList.type({
    anomalyMap,
    bottomOffset: 2,
    emptyText: 'No traffic',
    highlightAnomalies: true,
    logs: [anomalyLog, normalLog],
    totalCount: 2,
    selectedIndex: 0,
    isFocused: true,
    isFollowingLatest: false
  });

  assert.match(text, /experimental highlights on: 1 candidate/);
  assert.match(text, /\/api\/normal/);
  assert.equal(text.includes('selected hints: slow'), false);
  assert.match(getNodeText(selectedAnomalyNode), /selected hints: slow/);
  assert.equal(formatTrafficRow(anomalyLog, false, undefined, undefined, { isAnomaly: true }).startsWith('! '), true);
  assert.equal(anomalyRow.props.backgroundColor, 'yellow');
  assert.equal(anomalyRow.props.color, 'black');
});

test('request diff compares request metadata, query params, headers, and status', () => {
  const left = createDiffLog({
    id: 'left',
    method: 'GET',
    path: '/api/users?page=1&sort=name',
    responseTimeMs: 12,
    statusCode: 200,
    request: {
      headers: {
        Cookie: 'sid=left-secret; theme=dark',
        'X-Trace': 'one'
      }
    },
    response: {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  });
  const right = createDiffLog({
    id: 'right',
    method: 'POST',
    path: '/api/users?page=2&filter=active',
    responseTimeMs: 99,
    statusCode: 500,
    request: {
      headers: {
        cookie: 'sid=right-secret; theme=dark',
        'x-trace': 'two'
      }
    },
    response: {
      headers: {
        'content-type': 'application/problem+json'
      }
    }
  });
  const diff = createRequestDiff(left, right);
  const rows = getRequestDiffRows(diff);
  const changes = rows.filter((row) => row.type === 'change');

  assert.equal(diff.changeCount, changes.length);
  assert.deepEqual(changes.find((row) => row.label === 'method').leftValue, 'GET');
  assert.deepEqual(changes.find((row) => row.label === 'method').rightValue, 'POST');
  assert.deepEqual(changes.find((row) => row.label === 'page').leftValue, '1');
  assert.deepEqual(changes.find((row) => row.label === 'page').rightValue, '2');
  assert.equal(changes.find((row) => row.label === 'sort').kind, 'removed');
  assert.equal(changes.find((row) => row.label === 'filter').kind, 'added');
  assert.deepEqual(changes.find((row) => row.label === 'x-trace').rightValue, 'two');
  assert.deepEqual(changes.find((row) => row.label === 'status').rightValue, '500');
  assert.equal(changes.some((row) => row.label === 'responseTimeMs'), false);
  assert.equal(JSON.stringify(rows).includes('right-secret'), false);

  const rawRows = getDiffChangeRows(left, right, { showCookieValues: true });
  const cookieRow = rawRows.find((row) => row.label === 'cookie');

  assert.equal(cookieRow.kind, 'changed');
  assert.equal(cookieRow.leftValue.includes('left-secret'), true);
  assert.equal(cookieRow.rightValue.includes('right-secret'), true);
});

test('request diff compares JSON body fields with nested paths and array indexes', () => {
  const left = createDiffLog({
    request: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        active: true,
        user: {
          email: 'old@example.com',
          roles: ['user', 'beta']
        }
      })
    },
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, count: 1 })
    }
  });
  const right = createDiffLog({
    request: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        user: {
          email: 'new@example.com',
          name: 'Ada',
          roles: ['user', 'admin']
        }
      })
    },
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, count: 1, error: 'denied' })
    }
  });
  const rows = getDiffChangeRows(left, right);

  assert.equal(rows.find((row) => row.label === '$.active').kind, 'removed');
  assert.deepEqual(rows.find((row) => row.label === '$.user.email').leftValue, '"old@example.com"');
  assert.deepEqual(rows.find((row) => row.label === '$.user.email').rightValue, '"new@example.com"');
  assert.equal(rows.find((row) => row.label === '$.user.name').kind, 'added');
  assert.deepEqual(rows.find((row) => row.label === '$.user.roles[1]').rightValue, '"admin"');
  assert.deepEqual(rows.find((row) => row.label === '$.ok').rightValue, 'false');
  assert.equal(rows.find((row) => row.label === '$.error').kind, 'added');
});

test('request diff compares URL-encoded form bodies by field', () => {
  const left = createDiffLog({
    request: {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=abc&enabled=true'
    }
  });
  const right = createDiffLog({
    request: {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=xyz&extra=1'
    }
  });
  const rows = getDiffChangeRows(left, right);

  assert.deepEqual(rows.find((row) => row.label === 'form.token').leftValue, '"abc"');
  assert.deepEqual(rows.find((row) => row.label === 'form.token').rightValue, '"xyz"');
  assert.equal(rows.find((row) => row.label === 'form.enabled').kind, 'removed');
  assert.equal(rows.find((row) => row.label === 'form.extra').kind, 'added');
});

test('request diff uses honest summaries for text, binary, compressed, and truncated bodies', () => {
  const textLeft = createDiffLog({
    request: {
      body: 'hello world',
      headers: { 'content-type': 'text/plain' },
      truncated: true
    },
    response: {
      body: 'abc',
      headers: { 'content-type': 'image/png' }
    }
  });
  const textRight = createDiffLog({
    request: {
      body: 'hello there',
      headers: { 'content-type': 'text/plain' }
    },
    response: {
      body: 'def',
      headers: { 'content-type': 'image/png' }
    }
  });
  const rows = getDiffChangeRows(textLeft, textRight);

  assert.equal(rows.find((row) => row.type === 'warning').label, 'partial diff');
  assert.deepEqual(rows.find((row) => row.label === 'body summary').leftValue, 'hello world');
  assert.equal(rows.some((row) => row.rightValue.includes('binary body not compared: image/png')), true);

  const longHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>readable full body</body></html>'.repeat(6);
  const longRows = getDiffChangeRows(
    createDiffLog({
      response: {
        body: longHtml,
        headers: { 'content-type': 'text/html' }
      }
    }),
    createDiffLog({
      response: {
        body: '{"user":null}',
        headers: { 'content-type': 'application/json' }
      }
    })
  );
  const longBodySummary = longRows.find((row) => row.label === 'body summary');

  assert.equal(longBodySummary.leftValue.endsWith('...'), true);
  assert.equal(longBodySummary.fullLeftValue, longHtml);
  assert.equal(getRequestDiffValueLines(longBodySummary, 40).some((line) => line.text.includes('...')), false);

  const compressedRows = getDiffChangeRows(
    createDiffLog({
      request: {
        body: 'compressed-a',
        headers: { 'content-encoding': 'gzip', 'content-type': 'application/json' }
      }
    }),
    createDiffLog({
      request: {
        body: 'compressed-b',
        headers: { 'content-encoding': 'gzip', 'content-type': 'application/json' }
      }
    })
  );

  assert.equal(compressedRows.some((row) => row.leftValue.includes('compressed body not compared: gzip')), true);
});

test('request diff layout helper stacks rows on narrow terminals', () => {
  assert.equal(isRequestDiffStackedLayout(80), true);
  assert.equal(isRequestDiffStackedLayout(120), false);
  assert.equal(isRequestDiffStackedLayout(80, 'side-by-side'), false);
  assert.equal(isRequestDiffStackedLayout(120, 'stacked'), true);
  assert.equal(isRequestDiffStackedLayout(80, 'unknown'), true);
  assert.equal(getRequestDiffVisibleCount(undefined, 30), 15);
  assert.equal(getRequestDiffFrameWidth(80), 76);
  assert.equal(getRequestDiffFrameWidth(190), 186);
});

test('request diff modal helpers constrain side-by-side rows and expose position labels', () => {
  const columns = getRequestDiffSideBySideColumns(34);

  assert.equal(columns.totalWidth, 34);
  assert.equal(columns.labelWidth + columns.leftWidth + columns.separatorWidth + columns.rightWidth, 34);

  const rows = [
    { id: 'section', isFocusable: false, type: 'section' },
    { id: 'first', isFocusable: true, type: 'change' },
    { id: 'second', isFocusable: true, type: 'change' }
  ];

  assert.equal(getRequestDiffPositionLabel(rows, 1), 'item 1/2');
  assert.equal(getRequestDiffPositionLabel(rows, 2), 'item 2/2');
  assert.equal(getRequestDiffPositionLabel([], 0), 'item 0/0');
  assert.equal(
    getRequestDiffHeaderText({ changeCount: 1299 }, rows, 2, 'side-by-side'),
    'Request diff (experimental) | 1299 changes | item 2/2 | side-by-side layout'
  );
  assert.equal(
    getRequestDiffHeaderText({ changeCount: 1299 }, rows, 2, 'side-by-side', { filterQuery: 'price' }),
    'Request diff (experimental) | 1299 changes | item 2/2 | side-by-side layout'
  );
});

test('request diff modal preserves row area height while filtering', () => {
  const visibleCount = 6;
  const createChangeRow = (index) => ({
    id: `row-${index}`,
    isFocusable: true,
    label: `field-${index}`,
    leftValue: `left-${index}`,
    rightValue: `right-${index}`,
    type: 'change'
  });
  const fullRows = Array.from({ length: 8 }, (_, index) => createChangeRow(index));
  const noMatchRows = [{
    id: 'diff-filter-empty',
    isFocusable: false,
    text: 'no diff matches for "aa"',
    type: 'empty'
  }];
  const fullModal = RequestDiffModal.type({
    diff: { changeCount: 8, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    layoutMode: 'side-by-side',
    rows: fullRows,
    visibleCount
  });
  const noMatchModal = RequestDiffModal.type({
    diff: { changeCount: 8, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    layoutMode: 'side-by-side',
    rows: noMatchRows,
    visibleCount
  });
  const sparseModal = RequestDiffModal.type({
    diff: { changeCount: 1, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    layoutMode: 'side-by-side',
    rows: [createChangeRow(0)],
    visibleCount
  });
  const sparseBodyChildren = getRequestDiffModalRowAreaChildren(sparseModal);
  const sparseFillerRows = sparseBodyChildren
    .filter((child) => String(child.key ?? '').startsWith('diff-filler:'));
  const lastSparseChild = sparseBodyChildren[sparseBodyChildren.length - 1];

  assert.equal(getRequestDiffModalRowAreaLineCount(fullModal), visibleCount);
  assert.equal(getRequestDiffModalRowAreaLineCount(noMatchModal), visibleCount);
  assert.equal(getRequestDiffModalRowAreaLineCount(sparseModal), visibleCount);
  assert.equal(sparseFillerRows.length, visibleCount - 1);
  assert.equal(String(lastSparseChild.key ?? '').startsWith('diff-filler:'), true);
});

test('request diff focused rows keep semantic value colors', () => {
  const rows = [{
    id: 'row-0',
    isFocusable: true,
    kind: 'removed',
    label: 'cache-control',
    leftValue: 'max-age=0',
    rightValue: '(missing)',
    type: 'change'
  }];
  const sideBySideModal = RequestDiffModal.type({
    diff: { changeCount: 1, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    focusedRow: 0,
    layoutMode: 'side-by-side',
    rows,
    visibleCount: 2
  });
  const sideBySideRow = getRequestDiffModalRowAreaChildren(sideBySideModal)
    .find((child) => child.key === 'row-0');
  const [labelCell, leftCell, separatorCell, rightCell] = asArray(sideBySideRow.props.children)
    .map((cell) => asArray(cell.props.children)[0]);

  assert.equal(sideBySideRow.props.backgroundColor, undefined);
  assert.equal(labelCell.props.bold, true);
  assert.equal(labelCell.props.color, 'cyan');
  assert.equal(leftCell.props.color, 'red');
  assert.equal(separatorCell.props.color, 'gray');
  assert.equal(rightCell.props.color, 'gray');

  const stackedModal = RequestDiffModal.type({
    diff: { changeCount: 1, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    focusedRow: 0,
    layoutMode: 'stacked',
    rows,
    visibleCount: 2
  });
  const stackedRow = getRequestDiffModalRowAreaChildren(stackedModal)
    .find((child) => child.key === 'row-0');
  const [stackedLabel, stackedLeft, stackedRight] = asArray(stackedRow.props.children);

  assert.equal(stackedRow.props.backgroundColor, undefined);
  assert.equal(stackedLabel.props.bold, true);
  assert.equal(stackedLabel.props.color, 'cyan');
  assert.equal(stackedLeft.props.color, 'red');
  assert.equal(stackedRight.props.color, 'gray');
});

test('request diff filter bar helpers hide idle empty state and keep fixed active states', () => {
  const totalRows = [
    { id: 'section', isFocusable: false, type: 'section' },
    { id: 'first', isFocusable: true, type: 'change' },
    { id: 'second', isFocusable: true, type: 'change' },
    { id: 'third', isFocusable: true, type: 'warning' }
  ];
  const filteredRows = [
    { id: 'section', isFocusable: false, type: 'section' },
    { id: 'second', isFocusable: true, type: 'change' }
  ];

  assert.equal(shouldShowRequestDiffFilterBar({
    filterQuery: '',
    isFilterOpen: false
  }), false);
  assert.equal(shouldShowRequestDiffFilterBar({
    filterQuery: '   ',
    isFilterOpen: false
  }), false);
  assert.equal(shouldShowRequestDiffFilterBar({
    filterQuery: '',
    isFilterOpen: true
  }), true);
  assert.equal(shouldShowRequestDiffFilterBar({
    filterQuery: 'price',
    isFilterOpen: false
  }), true);
  assert.equal(getRequestDiffBottomControlHeight({
    filterQuery: '',
    isFilterOpen: false
  }), 0);
  assert.equal(getRequestDiffBottomControlHeight({
    filterQuery: '',
    isFilterOpen: true
  }), getRequestDiffFilterBoxHeight());
  assert.equal(getRequestDiffBottomControlHeight({
    filterQuery: 'price',
    isFilterOpen: false
  }), getRequestDiffFilterBoxHeight());
  assert.deepEqual(getRequestDiffFilterBoxLines({
    filterQuery: 'price',
    filterFocus: 'mode',
    isFilterOpen: true,
    rows: filteredRows,
    totalRows
  }), [
    'Diff filter | matches 1/3',
    '  query price_',
    '> mode [words] pattern',
    '  words [and] or',
    '  case [ignore] match',
    'tab/down row  left/right/space change  enter/esc close  x clear'
  ]);
  assert.deepEqual(getRequestDiffFilterBoxLines({
    filterQuery: 'price',
    isFilterOpen: false,
    matchCase: true,
    rows: filteredRows,
    searchMode: 'pattern',
    totalRows,
    wordMatchMode: 'or'
  }), [
    'Diff filter | matches 1/3',
    '  query "price"',
    '  mode words [pattern]',
    '  words and [or]',
    '  case ignore [match]',
    '/ edit filter'
  ]);
  assert.equal(getRequestDiffFilterBoxHeight({
    filterQuery: 'price',
    isFilterOpen: false,
    rows: filteredRows,
    totalRows
  }), 8);
  assert.equal(getRequestDiffFilterBoxHeight({
    filterQuery: '',
    isFilterOpen: false,
    rows: totalRows,
    totalRows
  }), 8);
  assert.match(getRequestDiffFilterBoxLines({
    filterQuery: '[',
    isFilterOpen: true,
    rows: [],
    searchMode: 'pattern',
    totalRows
  }).join('\n'), /invalid pattern:/);

  const constrainedLines = getRequestDiffFilterBoxLines({
    filterQuery: 'very-long-filter-query-value',
    isFilterOpen: true,
    rows: filteredRows,
    totalRows,
    width: 18
  });

  assert.equal(constrainedLines.every((line) => line.length <= 18), true);
  assert.match(constrainedLines[1], /\.\.\.$/);
  assert.equal(DiffFilterBar.type({
    filterQuery: '',
    isFilterOpen: true,
    rows: filteredRows,
    totalRows
  }).props.alignItems, 'flex-start');
  assert.doesNotThrow(() => {
    DiffFilterBar.type({
      filterQuery: '[',
      isFilterOpen: true,
      rows: filteredRows,
      searchMode: 'pattern',
      totalRows
    });
  });
  assert.doesNotThrow(() => {
    RequestDiffModal.type({
      diff: { changeCount: 2 },
      filterQuery: '[',
      isFilterOpen: true,
      rows: filteredRows,
      totalRows,
      visibleCount: 4
    });
  });
});

test('request diff row filter narrows rows by field, values, and section title', () => {
  const rows = [
    { id: 'request:section', isFocusable: false, text: 'Request (1)', title: 'Request', type: 'section' },
    { id: 'request:method', groupId: 'request', isFocusable: true, label: 'method', leftValue: 'GET', rightValue: 'POST', text: 'method: GET -> POST', type: 'change' },
    { id: 'body:section', isFocusable: false, text: 'Response Body (2)', title: 'Response Body', type: 'section' },
    { id: 'body:price', groupId: 'responseBody', isFocusable: true, label: '$.price', leftValue: '12.99', rightValue: '13.99', text: '$.price: 12.99 -> 13.99', type: 'change' },
    { id: 'body:name', groupId: 'responseBody', isFocusable: true, label: '$.name', leftValue: 'Burger', rightValue: 'Pizza', text: '$.name: Burger -> Pizza', type: 'change' }
  ];

  assert.deepEqual(filterRequestDiffRows(rows, '').map((row) => row.id), rows.map((row) => row.id));
  assert.deepEqual(filterRequestDiffRows(rows, 'PRICE').map((row) => row.id), [
    'body:section:filter',
    'body:price'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'pizza').map((row) => row.id), [
    'body:section:filter',
    'body:name'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'response body').map((row) => row.id), [
    'body:section:filter',
    'body:price',
    'body:name'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'price 13.99').map((row) => row.id), [
    'body:section:filter',
    'body:price'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'price method', { wordMatchMode: 'or' }).map((row) => row.id), [
    'request:section:filter',
    'request:method',
    'body:section:filter',
    'body:price'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, '"Response Body"').map((row) => row.id), [
    'body:section:filter',
    'body:price',
    'body:name'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'PRICE', { matchCase: true }).map((row) => row.id), [
    'diff-filter-empty'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, '^\\$\\.p', { searchMode: 'pattern' }).map((row) => row.id), [
    'body:section:filter',
    'body:price'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, '[', { searchMode: 'pattern' }).map((row) => row.id), [
    'diff-filter-empty'
  ]);
  assert.deepEqual(filterRequestDiffRows(rows, 'missing')[0], {
    id: 'diff-filter-empty',
    isFocusable: false,
    text: 'no diff matches for "missing"',
    type: 'empty'
  });
});

test('request diff focused expansion wraps full row text inside the modal width', () => {
  const row = {
    isFocusable: true,
    label: '$.menu[3].products[18].description',
    leftValue: '"A simple yet delicious serving of plain cassava with sauce"',
    rightValue: '(missing)',
    type: 'change'
  };
  const width = 24;
  const lines = getRequestDiffFocusedExpansionLines(row, width);
  const collect = (side) => lines
    .filter((line) => line.side === side)
    .map((line) => line.text.slice(side === 'field' ? 'field: '.length : `${side === 'left' ? 'A' : 'B'}: `.length))
    .join('');

  assert.equal(lines.every((line) => line.text.length <= width), true);
  assert.equal(collect('field'), row.label);
  assert.equal(collect('left'), row.leftValue);
  assert.equal(collect('right'), row.rightValue);
  assert.deepEqual(getRequestDiffFocusedExpansionLines({ isFocusable: false }, width), []);
});

test('request diff full-row reader wraps untruncated text and tracks scroll position', () => {
  const row = {
    id: 'row-0',
    isFocusable: true,
    label: '$.very.long.path',
    leftValue: 'left value '.repeat(12),
    rightValue: 'right value '.repeat(12),
    type: 'change'
  };
  const width = 20;
  const valueLines = getRequestDiffValueLines(row, width);
  const collect = (side) => valueLines
    .filter((line) => line.side === side)
    .map((line) => line.text.slice(side === 'field' ? 'field: '.length : `${side === 'left' ? 'A' : 'B'}: `.length))
    .join('');
  const modal = RequestDiffModal.type({
    diff: { changeCount: 1, leftSummary: 'GET /a', rightSummary: 'GET /b' },
    focusedRow: 0,
    isValueOpen: true,
    rows: [row],
    valueScrollOffset: 1,
    visibleCount: 4
  });
  const bodyChildren = getRequestDiffModalRowAreaChildren(modal);
  const bodyText = bodyChildren.map(getNodeText).join('\n');
  const rows = Array.from({ length: 20 }, (_, index) => ({
    id: `row-${index}`,
    isFocusable: true,
    type: 'change'
  }));

  assert.equal(valueLines.every((line) => line.text.length <= width), true);
  assert.equal(collect('field'), row.label);
  assert.equal(collect('left'), row.leftValue);
  assert.equal(collect('right'), row.rightValue);
  assert.equal(clampRequestDiffValueScrollOffset(valueLines, 999, 4), valueLines.length - 4);
  assert.equal(getRequestDiffValueScrollLabel(valueLines, 1, 4), `line 2/${valueLines.length}`);
  assert.equal(getRequestDiffModalRowAreaLineCount(modal), 4);
  assert.equal(bodyText.includes('... more lines'), false);
  assert.equal(getRequestDiffVisibleStart(rows, 18, 0, 5), 14);
  assert.equal(getRequestDiffVisibleStart(rows, 2, 10, 5), 2);
  assert.equal(getRequestDiffVisibleStart(rows, 12, 10, 5), 10);
});

test('request diff endpoint shape normalizes ids and ignores query strings', () => {
  assert.equal(
    getDiffEndpointShape(createDiffLog({ method: 'get', path: '/api/users/123?include=roles' })),
    'GET /api/users/:id'
  );
  assert.equal(
    getDiffEndpointShape(createDiffLog({ method: 'GET', path: '/api/users/550e8400-e29b-41d4-a716-446655440000' })),
    'GET /api/users/:id'
  );
  assert.equal(
    getDiffEndpointShape(createDiffLog({ method: 'GET', path: '/api/assets/0123456789abcdef01234567' })),
    'GET /api/assets/:id'
  );
  assert.equal(
    getDiffEndpointShape(createDiffLog({ method: 'POST', path: '/api/orders/ord_1234567890ab' })),
    'POST /api/orders/:id'
  );
  assert.equal(
    getDiffEndpointShape(createDiffLog({ method: 'GET', path: '/api/users/current' })),
    'GET /api/users/current'
  );
});

test('endpoint route patterns normalize ids, queries, and trailing slashes', () => {
  assert.equal(getEndpointRoutePattern('/api/users/123?include=roles'), '/api/users/:id');
  assert.equal(getEndpointRoutePattern('/api/users/123/'), '/api/users/:id');
  assert.equal(
    getEndpointRoutePattern('/api/users/550e8400-e29b-41d4-a716-446655440000'),
    '/api/users/:id'
  );
  assert.equal(
    getEndpointRoutePattern('/api/assets/0123456789abcdef01234567'),
    '/api/assets/:id'
  );
  assert.equal(getEndpointRoutePattern('/api/orders/ord_1234567890ab'), '/api/orders/:id');
  assert.equal(getEndpointRoutePattern('/api/users/current'), '/api/users/current');
  assert.equal(getEndpointRoutePattern('/'), '/');
});

test('endpoint groups aggregate status distribution, errors, latency, and impact sorting', () => {
  const groups = createEndpointGroups([
    createDiffLog({ id: 'users-1', method: 'GET', path: '/api/users/123?include=roles', statusCode: 200, responseTimeMs: 10 }),
    createDiffLog({ id: 'users-2', method: 'GET', path: '/api/users/456', statusCode: 500, responseTimeMs: 30 }),
    createDiffLog({ id: 'users-3', method: 'GET', path: '/api/users/789', statusCode: 'bad', responseTimeMs: 'bad' }),
    createDiffLog({ id: 'post-user', method: 'POST', path: '/api/users/123', statusCode: 404, responseTimeMs: 40 }),
    createDiffLog({ id: 'orders-1', method: 'DELETE', path: '/api/orders/1', statusCode: 404, responseTimeMs: 20 }),
    createDiffLog({ id: 'orders-2', method: 'DELETE', path: '/api/orders/2', statusCode: 503, responseTimeMs: 60 }),
    createDiffLog({ id: 'orders-3', method: 'DELETE', path: '/api/orders/3', statusCode: 204, responseTimeMs: 10 })
  ]);

  assert.deepEqual(groups.map((group) => `${group.method} ${group.routePattern}`), [
    'DELETE /api/orders/:id',
    'POST /api/users/:id',
    'GET /api/users/:id'
  ]);

  const getUsers = groups.find((group) => group.method === 'GET');

  assert.equal(getUsers.count, 3);
  assert.equal(getUsers.errorCount, 1);
  assert.equal(getUsers.errorRate, 1 / 3);
  assert.equal(getUsers.averageResponseTimeMs, 20);
  assert.deepEqual(getUsers.statusCounts, {
    '2xx': 1,
    '3xx': 0,
    '4xx': 0,
    '5xx': 1,
    other: 1
  });
});

test('endpoint group rows and modal render summary, truncation, empty, and focused states', () => {
  const groups = createEndpointGroups([
    createDiffLog({ id: 'one', method: 'GET', path: '/api/users/123', statusCode: 200, responseTimeMs: 10 }),
    createDiffLog({ id: 'two', method: 'GET', path: '/api/users/456', statusCode: 500, responseTimeMs: 30 }),
    createDiffLog({
      id: 'long',
      method: 'POST',
      path: '/api/accounts/1234567890abcdef/projects/9876543210abcdef/environments/1234567890abcdef',
      statusCode: 201,
      responseTimeMs: 50
    })
  ]);
  const row = formatEndpointGroupRow(groups[1], { width: 66 });
  const modal = EndpointGroupsModal.type({
    focusedIndex: 1,
    groups,
    keyBindings: DEFAULT_KEY_BINDINGS,
    totalLogs: 5
  });
  const emptyModal = EndpointGroupsModal.type({
    focusedIndex: 0,
    groups: [],
    keyBindings: DEFAULT_KEY_BINDINGS,
    totalLogs: 0
  });
  const flatten = (node) => {
    if (Array.isArray(node)) {
      return node.flatMap(flatten);
    }

    if (!node || typeof node === 'string') {
      return [];
    }

    return [node, ...asArray(node.props?.children).flatMap(flatten)];
  };
  const modalNodes = flatten(modal);
  const focusedRows = modalNodes.filter((node) => node.props?.backgroundColor === 'cyan');

  assert.equal(row.includes('...'), true);
  assert.equal(row.length, 66);
  assert.match(getNodeText(modal), /2 groups \| 3\/5 visible requests \| 1 errors \(33%\) \| slowest POST/);
  assert.match(getNodeText(modal), /Current filtered traffic \| sorted by impact \| item 2\/2/);
  assert.equal(modalNodes.some((node) => getNodeText(node).includes('2xx')), true);
  assert.equal(modalNodes.some((node) => getNodeText(node).includes('oth')), true);
  assert.equal(focusedRows.some((node) => getNodeText(node).includes('POST')), true);
  assert.match(getNodeText(emptyModal), /No visible traffic to group/);
});

test('flow analyzer groups complete and incomplete redirect chains', () => {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const chains = getRedirectChainGroups([
    createDiffLog({
      id: 'login',
      method: 'POST',
      path: '/login',
      statusCode: 303,
      timestamp: start,
      response: { headers: { location: '/mfa' } }
    }),
    createDiffLog({
      id: 'mfa',
      method: 'GET',
      path: '/mfa',
      statusCode: 302,
      timestamp: start + 500,
      response: { headers: { location: 'https://app.example/dashboard?from=mfa' } }
    }),
    createDiffLog({
      id: 'done',
      method: 'GET',
      path: '/dashboard?from=mfa',
      statusCode: 200,
      timestamp: start + 900
    })
  ]);

  assert.equal(chains.length, 1);
  assert.equal(chains[0].complete, true);
  assert.equal(chains[0].hopCount, 2);
  assert.deepEqual(chains[0].logIds, ['login', 'mfa', 'done']);
  assert.equal(chains[0].statusTrail, '303 -> 302 -> 200');
  assert.equal(chains[0].finalDestination, 'GET /dashboard?from=mfa');
  assert.equal(formatFlowLabel(chains[0]), 'redirect chain 2 hops | final 200');

  const incomplete = getRedirectChainGroups([
    createDiffLog({
      id: 'old',
      method: 'GET',
      path: '/old',
      statusCode: 302,
      response: { headers: { location: '/new' } }
    })
  ]);

  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].complete, false);
  assert.equal(incomplete[0].finalDestination, '/new (next request not captured)');
  assert.equal(formatFlowLabel(incomplete[0]), 'incomplete redirect chain 1 hop');
});

test('flow analyzer classifies repeated request groups cautiously', () => {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const jsonRequest = (body = '{"ok":true}') => ({
    body,
    headers: { 'content-type': 'application/json' }
  });
  const groups = getRepeatRequestGroups([
    createDiffLog({ id: 'submit-1', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start, request: jsonRequest() }),
    createDiffLog({ id: 'submit-2', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start + 600, request: jsonRequest() }),
    createDiffLog({ id: 'retry-1', method: 'GET', path: '/api/items', statusCode: 500, timestamp: start + 3000 }),
    createDiffLog({ id: 'retry-2', method: 'GET', path: '/api/items', statusCode: 200, timestamp: start + 3400 }),
    createDiffLog({ id: 'poll-1', method: 'GET', path: '/poll', statusCode: 200, timestamp: start + 6000 }),
    createDiffLog({ id: 'poll-2', method: 'GET', path: '/poll', statusCode: 200, timestamp: start + 6500 }),
    createDiffLog({ id: 'poll-3', method: 'GET', path: '/poll', statusCode: 200, timestamp: start + 7000 }),
    createDiffLog({ id: 'loop-1', method: 'GET', path: '/loop', statusCode: 503, timestamp: start + 9000 }),
    createDiffLog({ id: 'loop-2', method: 'GET', path: '/loop', statusCode: 503, timestamp: start + 9400 }),
    createDiffLog({ id: 'loop-3', method: 'GET', path: '/loop', statusCode: 503, timestamp: start + 9800 }),
    createDiffLog({ id: 'dup-1', method: 'GET', path: '/duplicate', statusCode: 200, timestamp: start + 12_000 }),
    createDiffLog({ id: 'dup-2', method: 'GET', path: '/duplicate', statusCode: 200, timestamp: start + 12_900 }),
    createDiffLog({ id: 'late-1', method: 'GET', path: '/late', statusCode: 200, timestamp: start + 16_000 }),
    createDiffLog({ id: 'late-2', method: 'GET', path: '/late', statusCode: 200, timestamp: start + 19_000 }),
    createDiffLog({ id: 'body-1', method: 'POST', path: '/body', statusCode: 200, timestamp: start + 22_000, request: jsonRequest('{"id":1}') }),
    createDiffLog({ id: 'body-2', method: 'POST', path: '/body', statusCode: 200, timestamp: start + 22_500, request: jsonRequest('{"id":2}') })
  ]);
  const labels = Object.fromEntries(groups.map((group) => [`${group.method} ${group.path}`, group.label]));

  assert.equal(labels['POST /checkout'], 'possible double submit');
  assert.equal(labels['GET /api/items'], 'likely retry');
  assert.equal(labels['GET /poll'], 'possible polling');
  assert.equal(labels['GET /loop'], 'possible retry loop');
  assert.equal(labels['GET /duplicate'], 'possible duplicate');
  assert.equal(labels['GET /late'], undefined);
  assert.equal(labels['POST /body'], undefined);
});

test('flow modal renders grouped sections and selected-flow previews', () => {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const analysis = analyzeTrafficFlows([
    createDiffLog({
      id: 'redirect',
      method: 'GET',
      path: '/old',
      statusCode: 302,
      timestamp: start,
      response: { headers: { location: '/new' } }
    }),
    createDiffLog({ id: 'final', method: 'GET', path: '/new', statusCode: 200, timestamp: start + 100 }),
    createDiffLog({ id: 'submit-1', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start + 1000, request: { body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } } }),
    createDiffLog({ id: 'submit-2', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start + 1500, request: { body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } } })
  ]);
  const displayGroups = getFlowDisplayGroups(analysis);
  const repeatGroup = displayGroups.find((group) => group.kind === 'repeat');
  const redirectGroup = displayGroups.find((group) => group.kind === 'redirect');
  const row = formatFlowRow(repeatGroup, { width: 72 });
  const wideModal = FlowAnalysisModal.type({
    analysis,
    focusedIndex: 0,
    terminalColumns: 120,
    terminalRows: 28,
    totalLogs: 4
  });
  const narrowModal = FlowAnalysisModal.type({
    analysis,
    focusedIndex: 1,
    terminalColumns: 76,
    terminalRows: 28,
    totalLogs: 4
  });
  const emptyModal = FlowAnalysisModal.type({
    analysis: analyzeTrafficFlows([]),
    focusedIndex: 0,
    totalLogs: 0
  });
  const wideText = getNodeText(wideModal);
  const narrowText = getNodeText(narrowModal);
  const focusedRows = collectNodes(wideModal).filter((node) => node.props?.backgroundColor === 'cyan');
  const wideRows = collectNodes(wideModal).filter((node) => node.props?.flexDirection === 'row');

  assert.equal(shouldUseWideFlowLayout(100), true);
  assert.equal(shouldUseWideFlowLayout(70), false);
  assert.match(row, /possible double submit 2x POST \/checkout/);
  assert.equal(formatFlowHeadline(redirectGroup), '302 -> 200 GET /old -> /new');
  assert.equal(formatFlowMetadata(redirectGroup), 'complete | 1 hop | span 100ms | final 200 GET /new');
  assert.deepEqual(getFlowPreviewRows(repeatGroup).map((line) => line.text), [
    'possible double submit 2x POST /checkout',
    'span 500ms | statuses 200 -> 200 | 2 matching requests',
    'statuses 200 -> 200',
    'related submit-1, submit-2'
  ]);
  assert.match(wideText, /Flows/);
  assert.match(wideText, /Redirect chains/);
  assert.match(wideText, /Repeated requests/);
  assert.match(wideText, /302 -> 200 GET \/old -> \/new/);
  assert.match(wideText, /complete \| 1 hop \| span 100ms \| final 200 GET \/new/);
  assert.match(wideText, /Selected flow/);
  assert.match(wideText, /final 200 GET \/new/);
  assert.equal(wideRows.some((node) => node.props?.width >= 90), true);
  assert.match(narrowText, /possible double submit 2x POST \/checkout/);
  assert.match(narrowText, /span 500ms \| statuses 200 -> 200 \| 2 matching requests/);
  assert.match(narrowText, /related submit-1, submit-2/);
  assert.equal(narrowText.includes('a=1'), false);
  assert.equal(focusedRows.length, 1);
  assert.match(getNodeText(emptyModal), /No redirect chains or repeated requests in visible traffic/);
});

test('flow detail rows render selected redirect and repeat context', () => {
  const start = Date.UTC(2026, 0, 1, 0, 0, 0);
  const logs = [
    createDiffLog({
      id: 'redirect',
      method: 'GET',
      path: '/old',
      statusCode: 302,
      timestamp: start,
      response: { headers: { location: '/new' } }
    }),
    createDiffLog({ id: 'final', method: 'GET', path: '/new', statusCode: 200, timestamp: start + 100 }),
    createDiffLog({ id: 'submit-1', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start + 1000, request: { body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } } }),
    createDiffLog({ id: 'submit-2', method: 'POST', path: '/checkout', statusCode: 200, timestamp: start + 1500, request: { body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } } })
  ];
  const flowAnalysis = analyzeTrafficFlows(logs);
  const finalText = getDetailLines(logs[1], 'flow', { flowAnalysis }).join('\n');
  const repeatRows = getDetailRows(logs[2], 'flow', { flowAnalysis });
  const repeatText = repeatRows.map((row) => row.text).join('\n');

  assert.deepEqual(getDetailLines(createDiffLog(), 'flow'), [
    'Flow context',
    'No flow context for selected request'
  ]);
  assert.match(finalText, /Flow context/);
  assert.match(finalText, /Redirect chain/);
  assert.match(finalText, /302 -> 200 GET \/old -> \/new/);
  assert.match(finalText, /complete \| 1 hop \| span 100ms \| final 200 GET \/new/);
  assert.match(finalText, /position 2\/2/);
  assert.match(finalText, /> final 200 GET \/new/);
  assert.match(repeatText, /Repeat detection/);
  assert.match(repeatText, /possible double submit 2x POST \/checkout/);
  assert.match(repeatText, /span 500ms \| statuses 200 -> 200 \| 2 matching requests/);
  assert.match(repeatText, /position 1\/2/);
  assert.match(repeatText, /related submit-1, submit-2/);
  assert.equal(repeatText.includes('a=1'), false);
  assert.equal(findDetailMatches(repeatRows, 'possible double submit').length > 0, true);
});

test('schema inference parses JSON payloads and infers field shapes', () => {
  assert.deepEqual(parseJsonPayloadForSchema({
    body: '{"ok":true}',
    headers: { 'content-type': 'text/plain' },
    truncated: false
  }), {
    parsed: true,
    reason: 'parsed',
    skipped: false,
    value: { ok: true }
  });
  assert.deepEqual(parseJsonPayloadForSchema({
    body: '{"bad"',
    headers: { 'content-type': 'application/json' },
    truncated: false
  }), {
    parsed: false,
    reason: 'invalid-json',
    skipped: false,
    value: null
  });
  assert.equal(parseJsonPayloadForSchema({ body: '', headers: {} }).reason, 'empty');
  assert.equal(parseJsonPayloadForSchema({ body: '{"ok":true}', headers: {}, truncated: true }).reason, 'truncated');
  assert.equal(parseJsonPayloadForSchema({
    body: '{"ok":true}',
    headers: { 'content-encoding': 'gzip' }
  }).reason, 'encoded');
  assert.equal(parseJsonPayloadForSchema({
    body: 'plain text',
    headers: { 'content-type': 'application/octet-stream' }
  }).reason, 'binary');

  const shape = inferJsonShape({
    empty: [],
    id: 123,
    items: [
      { active: true, id: 1 },
      { extra: null, id: '2' }
    ],
    name: null,
    tags: ['new', 'sale']
  });
  const byPath = Object.fromEntries(shape.rows.map((row) => [row.path, row]));

  assert.equal(shape.fieldCount, 11);
  assert.deepEqual(byPath.$.types, ['object']);
  assert.deepEqual(byPath['$.id'].types, ['number']);
  assert.deepEqual(byPath['$.name'].types, ['null']);
  assert.equal(byPath['$.name'].nullable, true);
  assert.deepEqual(byPath['$.tags'].types, ['array<string>']);
  assert.deepEqual(byPath['$.tags[]'].types, ['string']);
  assert.deepEqual(byPath['$.empty'].types, ['array<empty>']);
  assert.deepEqual(byPath['$.items'].types, ['array<object>']);
  assert.equal(byPath['$.items[].id'].drift, true);
  assert.deepEqual(byPath['$.items[].id'].types, ['string', 'number']);
});

test('schema groups aggregate request and response JSON shapes with drift sorting', () => {
  const groups = createSchemaGroups([
    createDiffLog({
      id: 'users-1',
      method: 'GET',
      path: '/api/users/123?include=profile',
      response: {
        body: JSON.stringify({ id: 1, name: 'Ada', profile: { age: 30 }, tags: ['admin'] }),
        headers: { 'content-type': 'application/json' }
      }
    }),
    createDiffLog({
      id: 'users-2',
      method: 'GET',
      path: '/api/users/456',
      response: {
        body: JSON.stringify({ extra: true, id: 2, name: null, profile: { age: 'unknown' }, tags: [] }),
        headers: { 'content-type': 'application/json' }
      }
    }),
    createDiffLog({
      id: 'users-invalid',
      method: 'GET',
      path: '/api/users/789',
      response: {
        body: '{"bad"',
        headers: { 'content-type': 'application/json' }
      }
    }),
    createDiffLog({
      id: 'users-non-json',
      method: 'GET',
      path: '/api/users/current',
      response: {
        body: 'ok',
        headers: { 'content-type': 'text/plain' }
      }
    }),
    createDiffLog({
      id: 'post-user',
      method: 'POST',
      path: '/api/users',
      request: {
        body: JSON.stringify({ name: 'Grace', roles: ['admin'] }),
        headers: { 'content-type': 'application/json' }
      }
    })
  ]);
  const responseGroup = groups.find((group) => (
    group.method === 'GET' && group.routePattern === '/api/users/:id' && group.side === 'response'
  ));
  const requestGroup = groups.find((group) => (
    group.method === 'POST' && group.routePattern === '/api/users' && group.side === 'request'
  ));
  const byPath = Object.fromEntries(responseGroup.rows.map((row) => [row.path, row]));

  assert.equal(groups[0], responseGroup);
  assert.equal(responseGroup.trafficCount, 3);
  assert.equal(responseGroup.jsonSampleCount, 2);
  assert.equal(responseGroup.parseFailureCount, 1);
  assert.equal(responseGroup.skippedCount, 0);
  assert.equal(responseGroup.optionalFieldCount, 2);
  assert.equal(responseGroup.nullableFieldCount, 1);
  assert.equal(responseGroup.driftFieldCount, 1);
  assert.equal(byPath['$.extra'].optional, true);
  assert.equal(byPath['$.name'].nullable, true);
  assert.equal(byPath['$.profile.age'].drift, true);
  assert.deepEqual(byPath['$.profile.age'].types, ['string', 'number']);
  assert.equal(requestGroup.trafficCount, 1);
  assert.equal(requestGroup.jsonSampleCount, 1);
  assert.equal(requestGroup.rows.find((row) => row.path === '$.roles').array, true);
});

test('schema rows and modal render summary, truncation, empty, focused state, and drift markers', () => {
  const groups = createSchemaGroups([
    createDiffLog({
      id: 'one',
      method: 'GET',
      path: '/api/users/123',
      response: {
        body: JSON.stringify({
          id: 1,
          profile: { age: 30 },
          veryLongFieldNameForSchemaInferenceTruncation: 'value'
        }),
        headers: { 'content-type': 'application/json' }
      }
    }),
    createDiffLog({
      id: 'two',
      method: 'GET',
      path: '/api/users/456',
      response: {
        body: JSON.stringify({
          id: '2',
          profile: { age: 'unknown' }
        }),
        headers: { 'content-type': 'application/json' }
      }
    })
  ]);
  const group = groups[0];
  const driftIndex = group.rows.findIndex((row) => row.path === '$.id');
  const row = formatSchemaRow(group.rows.find((item) => item.path.includes('veryLongFieldName')), { width: 46 });
  const modal = SchemaInferenceModal.type({
    focusedGroupIndex: 0,
    focusedRowIndex: driftIndex,
    groups,
    keyBindings: DEFAULT_KEY_BINDINGS,
    totalLogs: 2
  });
  const emptyModal = SchemaInferenceModal.type({
    focusedGroupIndex: 0,
    focusedRowIndex: 0,
    groups: [],
    keyBindings: DEFAULT_KEY_BINDINGS,
    totalLogs: 0
  });
  const focusedRows = collectNodes(modal).filter((node) => node.props?.backgroundColor === 'cyan');

  assert.equal(row.includes('...'), true);
  assert.equal(row.length, 46);
  assert.match(getNodeText(modal), /1 schema groups \| 2 JSON samples \| 2 drift fields/);
  assert.match(getNodeText(modal), /group 1\/1 \| 2\/2 JSON/);
  assert.equal(collectNodes(modal).some((node) => getNodeText(node).includes('types')), true);
  assert.equal(focusedRows.some((node) => getNodeText(node).includes('!') && getNodeText(node).includes('$.id')), true);
  assert.match(getNodeText(emptyModal), /No JSON request or response bodies in visible traffic/);
});

test('request diff candidate helper returns same method and endpoint shape from supplied logs', () => {
  const base = createDiffLog({ id: 'base', method: 'GET', path: '/api/users/123?include=roles' });
  const candidates = [
    base,
    createDiffLog({ id: 'same-shape', method: 'GET', path: '/api/users/456?include=posts' }),
    createDiffLog({ id: 'same-path-different-method', method: 'POST', path: '/api/users/789' }),
    createDiffLog({ id: 'different-shape', method: 'GET', path: '/api/users/current' }),
    createDiffLog({ id: 'filtered-out', method: 'GET', path: '/api/users/999' })
  ];

  assert.deepEqual(
    getDiffCandidateLogIds(base, candidates.slice(0, 4)),
    ['same-shape']
  );
  assert.deepEqual(
    getDiffCandidateLogIds(base, candidates),
    ['same-shape', 'filtered-out']
  );
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
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isListFocused: false }),
    { type: 'cycleDetailTab', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isListFocused: false }),
    { type: 'cycleDetailTab', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isListFocused: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isListFocused: true }),
    { type: 'none' }
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
    getKeyboardAction('a', {}, { isListFocused: true }),
    { type: 'markDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('u', {}, { isListFocused: true }),
    { type: 'clearDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('b', {}, { isListFocused: false }),
    { type: 'openDiff' }
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
    getKeyboardAction('', { backspace: true }, { isExportPromptOpen: true }),
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
    getKeyboardAction(':', { ctrl: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('q', { ctrl: true }),
    { type: 'quit' }
  );
  assert.deepEqual(
    getKeyboardAction('\u0011'),
    { type: 'quit' }
  );
  assert.deepEqual(
    getKeyboardAction('/', { ctrl: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('\u001F'),
    { type: 'openHelp' }
  );
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
    getKeyboardAction(':', {}, { isCommandOpen: true }),
    { type: 'appendCommandText', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isCommandOpen: true }),
    { type: 'appendCommandText', value: 'h' }
  );
  assert.deepEqual(
    getKeyboardAction('/', { ctrl: true }, { isCommandOpen: true }),
    { type: 'none' }
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
    getKeyboardAction('', { downArrow: true }, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('\u001B[B', {}, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('\u001BOB', {}, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { upArrow: true }, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('\u001B[A', {}, { isCommandOpen: true }),
    { type: 'cycleCommandSuggestion', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { escape: true }, { isRequestActivityOpen: true }),
    { type: 'closeRequestActivity' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isRequestActivityOpen: true }),
    { type: 'closeRequestActivity' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isRequestActivityOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isRequestActivityOpen: true }),
    { type: 'moveRequestActivity', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isRequestActivityOpen: true }),
    { type: 'inspectRequestActivity' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isEndpointGroupsOpen: true }),
    { type: 'moveEndpointGroup', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('k', {}, { isEndpointGroupsOpen: true }),
    { type: 'moveEndpointGroup', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { endpointGroupsPageSize: 9, isEndpointGroupsOpen: true }),
    { type: 'moveEndpointGroup', direction: 9 }
  );
  assert.deepEqual(
    getKeyboardAction('g', {}, { isEndpointGroupsOpen: true }),
    { type: 'moveEndpointGroupTo', boundary: 'top' }
  );
  assert.deepEqual(
    getKeyboardAction('G', {}, { isEndpointGroupsOpen: true }),
    { type: 'moveEndpointGroupTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isEndpointGroupsOpen: true }),
    { type: 'closeEndpointGroups' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isEndpointGroupsOpen: true }),
    { type: 'closeEndpointGroups' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isEndpointGroupsOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isEndpointGroupsOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaField', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('k', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaField', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { isSchemaInferenceOpen: true, schemaInferencePageSize: 8 }),
    { type: 'moveSchemaField', direction: 8 }
  );
  assert.deepEqual(
    getKeyboardAction('g', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaFieldTo', boundary: 'top' }
  );
  assert.deepEqual(
    getKeyboardAction('G', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaFieldTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('n', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaGroup', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('N', {}, { isSchemaInferenceOpen: true }),
    { type: 'moveSchemaGroup', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isSchemaInferenceOpen: true }),
    { type: 'closeSchemaInference' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isSchemaInferenceOpen: true }),
    { type: 'closeSchemaInference' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isSchemaInferenceOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isSchemaInferenceOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isFlowAnalysisOpen: true }),
    { type: 'moveFlowAnalysis', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('k', {}, { isFlowAnalysisOpen: true }),
    { type: 'moveFlowAnalysis', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { flowAnalysisPageSize: 8, isFlowAnalysisOpen: true }),
    { type: 'moveFlowAnalysis', direction: 8 }
  );
  assert.deepEqual(
    getKeyboardAction('g', {}, { isFlowAnalysisOpen: true }),
    { type: 'moveFlowAnalysisTo', boundary: 'top' }
  );
  assert.deepEqual(
    getKeyboardAction('G', {}, { isFlowAnalysisOpen: true }),
    { type: 'moveFlowAnalysisTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isFlowAnalysisOpen: true }),
    { type: 'inspectFlowAnalysis' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isFlowAnalysisOpen: true }),
    { type: 'closeFlowAnalysis' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isFlowAnalysisOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isFlowAnalysisOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isDiffOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isDiffOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isDiffOpen: true }),
    { type: 'closeDiff' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isDiffOpen: true }),
    { type: 'closeDiff' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isDiffOpen: true }),
    { type: 'moveDiffFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('N', {}, { isDiffOpen: true }),
    { type: 'moveDiffFocus', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(']', {}, { diffPageSize: 9, isDiffOpen: true }),
    { type: 'moveDiffFocus', direction: 9 }
  );
  assert.deepEqual(
    getKeyboardAction('g', {}, { isDiffOpen: true }),
    { type: 'moveDiffFocusTo', boundary: 'top' }
  );
  assert.deepEqual(
    getKeyboardAction('G', {}, { isDiffOpen: true }),
    { type: 'moveDiffFocusTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('v', {}, { isDiffOpen: true }),
    { type: 'toggleDiffLayout' }
  );
  assert.deepEqual(
    getKeyboardAction('/', {}, { isDiffOpen: true }),
    { type: 'openDiffFilter' }
  );
  assert.deepEqual(
    getKeyboardAction('p', {}, { isDiffFilterOpen: true }),
    { type: 'appendDiffFilter', value: 'p' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isDiffFilterOpen: true }),
    { type: 'appendDiffFilter', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction(':', { ctrl: true }, { isDiffFilterOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isDiffFilterOpen: true }),
    { type: 'appendDiffFilter', value: 'h' }
  );
  assert.deepEqual(
    getKeyboardAction('/', { ctrl: true }, { isDiffFilterOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('', { tab: true }, { isDiffFilterOpen: true }),
    { type: 'cycleDiffFilterFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { downArrow: true }, { isDiffFilterOpen: true }),
    { type: 'cycleDiffFilterFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { upArrow: true }, { isDiffFilterOpen: true }),
    { type: 'cycleDiffFilterFocus', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { diffFilterFocus: 'mode', isDiffFilterOpen: true }),
    { type: 'moveDiffFilterOption', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { diffFilterFocus: 'words', isDiffFilterOpen: true }),
    { type: 'moveDiffFilterOption', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(' ', {}, { diffFilterFocus: 'case', isDiffFilterOpen: true }),
    { type: 'toggleDiffFilterOption' }
  );
  assert.deepEqual(
    getKeyboardAction('p', {}, { diffFilterFocus: 'mode', isDiffFilterOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { diffFilterFocus: 'mode', isDiffFilterOpen: true }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { diffFilterFocus: 'mode', isDiffFilterOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isDiffFilterOpen: true }),
    { type: 'backspaceDiffFilter' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { diffFilterFocus: 'mode', isDiffFilterOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('x', {}, { isDiffFilterOpen: true }),
    { type: 'clearDiffFilter' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isDiffFilterOpen: true }),
    { type: 'finishDiffFilter' }
  );
  assert.deepEqual(
    getKeyboardAction('C', {}, { isDiffOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isListFocused: false }),
    { type: 'none' }
  );

  const globalShortcutSurfaces = [
    { isExportPromptOpen: true },
    { isListDisplayOpen: true },
    { isEndpointGroupsOpen: true },
    { isSchemaInferenceOpen: true },
    { isFlowAnalysisOpen: true },
    { isRequestActivityOpen: true },
    { isDiffOpen: true },
    { isDiffOpen: true, isDiffValueOpen: true },
    { isDiffFilterOpen: true, diffFilterFocus: 'mode' },
    { isResendConfirmOpen: true },
    { isComposerOpen: true, isComposerTextFocused: false },
    { isComposerOpen: true, isComposerConfirmOpen: true },
    { isComposerOpen: true, isComposerConfirmOpen: true, isComposerTextFocused: true },
    { isComposerOpen: true, isComposerLibraryOpen: true },
    { isComposerOpen: true, isComposerLibraryOpen: true, isComposerTextFocused: true },
    { isDetailModalOpen: true },
    { isFilterOpen: true, filterFocus: 'method' }
  ];

  for (const options of globalShortcutSurfaces) {
    assert.deepEqual(getKeyboardAction(':', {}, options), { type: 'openCommandPrompt' });
    assert.deepEqual(getKeyboardAction('h', {}, options), { type: 'openHelp' });
  }

  assert.deepEqual(
    getKeyboardAction(':', {}, { isHelpOpen: true }),
    { type: 'openCommandPrompt' }
  );

  assert.deepEqual(getCommandHintForKey('R'), 'use :resend');
  assert.deepEqual(COMMAND_DEFINITIONS.map((command) => command.name), [
    'quit',
    'resend',
    'next-page',
    'send-next-page',
    'requests',
    'endpoints',
    'schemas',
    'flows',
    'record',
    'stop-recording',
    'pause-capture',
    'clear-logs',
    'anomalies',
    'auto-inspect',
    'help'
  ]);
  assert.deepEqual(getCommandMatches('res').map((command) => command.name), ['resend']);
  assert.deepEqual(getCommandMatches('np').map((command) => command.name), ['next-page']);
  assert.deepEqual(getCommandMatches('snp').map((command) => command.name), ['send-next-page']);
  assert.deepEqual(getCommandMatches('rq').map((command) => command.name), ['requests']);
  assert.deepEqual(getCommandMatches('ep').map((command) => command.name), ['endpoints']);
  assert.deepEqual(getCommandMatches('sc').map((command) => command.name), ['schemas']);
  assert.deepEqual(getCommandMatches('flow').map((command) => command.name), ['flows']);
  assert.deepEqual(getCommandMatches('red').map((command) => command.name), ['flows']);
  assert.deepEqual(getCommandMatches('ret').map((command) => command.name), ['flows']);
  assert.deepEqual(getCommandMatches('anom').map((command) => command.name), ['anomalies']);
  assert.deepEqual(getCommandMatches('ai').map((command) => command.name), ['auto-inspect']);
  assert.deepEqual(getCommandMatches('auto').map((command) => command.name), ['auto-inspect']);
  assert.deepEqual(getCommandMatches('r').map((command) => command.name), ['resend', 'requests', 'flows', 'record']);
  assert.deepEqual(resolveCommandInput('next-page').action, { type: 'openNextPage' });
  assert.deepEqual(resolveCommandInput('np').action, { type: 'openNextPage' });
  assert.deepEqual(resolveCommandInput('send-next-page').action, { type: 'sendNextPage' });
  assert.deepEqual(resolveCommandInput('snp').action, { type: 'sendNextPage' });
  assert.deepEqual(resolveCommandInput('requests').action, { type: 'openRequestActivity' });
  assert.deepEqual(resolveCommandInput('sent').action, { type: 'openRequestActivity' });
  assert.deepEqual(resolveCommandInput('endpoints').action, { type: 'openEndpointGroups' });
  assert.deepEqual(resolveCommandInput('endpoint-groups').action, { type: 'openEndpointGroups' });
  assert.deepEqual(resolveCommandInput('ep').action, { type: 'openEndpointGroups' });
  assert.deepEqual(resolveCommandInput('schemas').action, { type: 'openSchemaInference' });
  assert.deepEqual(resolveCommandInput('schema').action, { type: 'openSchemaInference' });
  assert.deepEqual(resolveCommandInput('sc').action, { type: 'openSchemaInference' });
  assert.deepEqual(resolveCommandInput('shapes').action, { type: 'openSchemaInference' });
  assert.deepEqual(resolveCommandInput('flows').action, { type: 'openFlowAnalysis' });
  assert.deepEqual(resolveCommandInput('flow').action, { type: 'openFlowAnalysis' });
  assert.deepEqual(resolveCommandInput('redirects').action, { type: 'openFlowAnalysis' });
  assert.deepEqual(resolveCommandInput('retries').action, { type: 'openFlowAnalysis' });
  assert.deepEqual(resolveCommandInput('anomalies').action, { type: 'toggleAnomalies' });
  assert.deepEqual(resolveCommandInput('anomaly').action, { type: 'toggleAnomalies' });
  assert.deepEqual(resolveCommandInput('anom').action, { type: 'toggleAnomalies' });
  assert.deepEqual(resolveCommandInput('auto-inspect').action, { type: 'toggleAutoInspect' });
  assert.deepEqual(resolveCommandInput('ai').action, { type: 'toggleAutoInspect' });
  assert.deepEqual(resolveCommandInput('auto-select').action, { type: 'toggleAutoInspect' });
  assert.deepEqual(resolveCommandInput('auto-details').action, { type: 'toggleAutoInspect' });
  assert.equal(getCommandSuggestionIndex('r', -1, 1), 0);
  assert.equal(getCommandSuggestionIndex('r', 0, 1), 1);
  assert.equal(getCommandSuggestionIndex('r', 0, -1), 3);
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
    ['q', 'rs', 'np', 'snp', 'rq', 'ep', 'sc']
  );
  assert.deepEqual(
    getCommandSuggestionRows('', 0).map((row) => row.isSelected),
    [true, false, false, false, false, false, false]
  );
  assert.deepEqual(
    getCommandSuggestionRows('', 8).map((row) => row.name),
    ['next-page', 'send-next-page', 'requests', 'endpoints', 'schemas', 'flows', 'record']
  );
  assert.deepEqual(
    getCommandSuggestionRows('', 8).map((row) => row.isSelected),
    [false, false, false, false, false, false, true]
  );
  assert.equal(
    formatCommandSelectionStatus(getCommandSuggestionRows('r', 2)[2]),
    'selected :flows (flow)'
  );
  assert.equal(formatCommandSelectionStatus(getCommandSuggestionRows('wat')[0]), '');
  assert.deepEqual(resolveCommandInput(''), {
    ok: false,
    error: 'command required'
  });
  assert.deepEqual(resolveCommandInput('', 0), {
    ok: true,
    action: { type: 'quit' },
    command: COMMAND_DEFINITIONS[0]
  });
  assert.deepEqual(resolveCommandInput('q'), {
    ok: true,
    action: { type: 'quit' },
    command: COMMAND_DEFINITIONS[0]
  });
  assert.deepEqual(resolveCommandInput('rs').action, { type: 'startResend', mode: 'exact' });
  assert.deepEqual(resolveCommandInput('res').action, { type: 'startResend', mode: 'exact' });
  assert.deepEqual(resolveCommandInput('r'), {
    ok: false,
    error: 'ambiguous command: resend, requests, flows, record'
  });
  assert.deepEqual(resolveCommandInput('r', 1).action, { type: 'openRequestActivity' });
  assert.deepEqual(resolveCommandInput('r', 2).action, { type: 'openFlowAnalysis' });
  assert.deepEqual(resolveCommandInput('r', 3).action, { type: 'toggleRecordingPause' });
  assert.deepEqual(resolveCommandInput('wat'), {
    ok: false,
    error: 'unknown command: wat'
  });

  const unavailableNextPageContext = {
    availability: {
      'next-page': { available: false, reason: 'no next page detected' },
      'send-next-page': { available: false, reason: 'no next page detected' }
    }
  };
  const nextPageOnlyContext = {
    availability: {
      'next-page': { available: true },
      'send-next-page': { available: false, reason: 'edit required: request body is truncated' }
    }
  };
  const sendNextPageContext = {
    availability: {
      'next-page': { available: true },
      'send-next-page': { available: true }
    }
  };

  assert.equal(getCommandMatches('np', unavailableNextPageContext).length, 0);
  assert.equal(getCommandMatches('snp', unavailableNextPageContext).length, 0);
  assert.deepEqual(
    getCommandSuggestionRows('', -1, unavailableNextPageContext).map((row) => row.name),
    ['quit', 'resend', 'requests', 'endpoints', 'schemas', 'flows', 'record']
  );
  assert.deepEqual(resolveCommandInput('np', -1, unavailableNextPageContext), {
    ok: false,
    error: 'next-page unavailable: no next page detected'
  });
  assert.deepEqual(resolveCommandInput('snp', -1, unavailableNextPageContext), {
    ok: false,
    error: 'send-next-page unavailable: no next page detected'
  });

  assert.deepEqual(getCommandMatches('np', nextPageOnlyContext).map((command) => command.name), ['next-page']);
  assert.equal(getCommandMatches('snp', nextPageOnlyContext).length, 0);
  assert.deepEqual(resolveCommandInput('next-page', -1, nextPageOnlyContext).action, { type: 'openNextPage' });
  assert.deepEqual(resolveCommandInput('snp', -1, nextPageOnlyContext), {
    ok: false,
    error: 'send-next-page unavailable: edit required: request body is truncated'
  });

  assert.deepEqual(getCommandMatches('np', sendNextPageContext).map((command) => command.name), ['next-page']);
  assert.deepEqual(getCommandMatches('snp', sendNextPageContext).map((command) => command.name), ['send-next-page']);
  assert.equal(getCommandSuggestionIndex('np', -1, 1, sendNextPageContext), 0);
  assert.equal(getCommandSuggestionIndex('snp', -1, 1, unavailableNextPageContext), -1);
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
    getKeyboardAction('h', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'h' }
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
    getKeyboardAction('', { backspace: true }, { isComposerOpen: true, isComposerConfirmOpen: true }),
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
    getKeyboardAction('', { backspace: true }, { isComposerOpen: true, isComposerLibraryOpen: true }),
    { type: 'closeComposerLibrary' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isComposerOpen: true, isComposerBodyEditorOpen: true }),
    { type: 'insertComposerText', value: '\n' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isComposerOpen: true, isComposerBodyEditorOpen: true }),
    { type: 'insertComposerText', value: ':' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isComposerOpen: true, isComposerBodyEditorOpen: true }),
    { type: 'insertComposerText', value: 'h' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isComposerOpen: true, isComposerBodyEditorOpen: true }),
    { type: 'backspaceComposerText' }
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
    getKeyboardAction('', { backspace: true }, { isResendConfirmOpen: true }),
    { type: 'cancelResend' }
  );
  assert.deepEqual(
    getKeyboardAction('y', {}, { isResendConfirmOpen: true, isResending: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isResendConfirmOpen: true, isResending: true }),
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
    getKeyboardAction('', { backspace: true }, { isHelpOpen: true }),
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
    getKeyboardAction('h', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'h' }
  );
  assert.deepEqual(
    getKeyboardAction(':', { ctrl: true }, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('\u001F', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('q', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'q' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'backspaceSearch' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction(':', {}, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('h', {}, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isFilterOpen: true, filterFocus: 'mode' }),
    { type: 'moveFilterOption', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isFilterOpen: true, filterFocus: 'words' }),
    { type: 'moveFilterOption', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction(' ', {}, { isFilterOpen: true, filterFocus: 'case' }),
    { type: 'toggleFilterOption' }
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
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isListDisplayOpen: true }),
    { type: 'closeListDisplay' }
  );
});

test('keyboard action helper toggles framework assets outside text inputs', () => {
  assert.deepEqual(getKeyboardAction('F'), { type: 'toggleFrameworkAssets' });
  assert.deepEqual(getKeyboardAction('A'), { type: 'toggleAnomalies' });
  assert.deepEqual(
    getKeyboardAction('F', {}, { isDetailModalOpen: true }),
    { type: 'toggleFrameworkAssets' }
  );
  assert.deepEqual(
    getKeyboardAction('A', {}, { isDetailModalOpen: true }),
    { type: 'toggleAnomalies' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'F' }
  );
  assert.deepEqual(
    getKeyboardAction('A', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'A' }
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
    getKeyboardAction('A', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'A' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'F' }
  );
  assert.deepEqual(
    getKeyboardAction('A', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'A' }
  );
});

test('keyboard action helper toggles auto-inspect only outside text and overlay contexts', () => {
  assert.deepEqual(getKeyboardAction('I'), { type: 'toggleAutoInspect' });
  assert.deepEqual(
    getKeyboardAction('I', {}, { isListFocused: false }),
    { type: 'toggleAutoInspect' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isDetailModalOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isListDisplayOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isCommandOpen: true }),
    { type: 'appendCommandText', value: 'I' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isFilterOpen: true, filterFocus: 'query' }),
    { type: 'appendSearch', value: 'I' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'I' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'I' }
  );
  assert.deepEqual(
    getKeyboardAction('I', {}, { isComposerBodyEditorOpen: true, isComposerOpen: true }),
    { type: 'insertComposerText', value: 'I' }
  );

  const autoInspectBindings = getTestKeyBindings({
    'main.toggleAutoInspect': ['Z']
  });

  assert.deepEqual(
    getKeyboardAction('Z', {}, { keyBindings: autoInspectBindings }),
    { type: 'toggleAutoInspect' }
  );
  assert.deepEqual(
    getKeyboardAction('Z', {}, { filterFocus: 'query', isFilterOpen: true, keyBindings: autoInspectBindings }),
    { type: 'appendSearch', value: 'Z' }
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
    getKeyboardAction('', { backspace: true }, { isDetailModalOpen: true }),
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
    getKeyboardAction('a', {}, { isDetailModalOpen: true }),
    { type: 'markDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('u', {}, { isDetailModalOpen: true }),
    { type: 'clearDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('b', {}, { isDetailModalOpen: true }),
    { type: 'openDiff' }
  );
  assert.deepEqual(
    getKeyboardAction('j', {}, { isDetailModalOpen: true }),
    { type: 'scrollDetails', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isDetailModalOpen: true }),
    { type: 'cycleDetailTab', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isDetailModalOpen: true }),
    { type: 'cycleDetailTab', direction: -1 }
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
    getKeyboardAction('h', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'h' }
  );
  assert.deepEqual(
    getKeyboardAction('/', { ctrl: true }, { isDetailSearchOpen: true }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('', { rightArrow: true }, { isDetailSearchOpen: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('', { leftArrow: true }, { isDetailSearchOpen: true }),
    { type: 'none' }
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
  const globalBindings = getTestKeyBindings({
    'global.openCommandPrompt': [';'],
    'main.openHelp': ['?']
  });

  assert.deepEqual(
    getKeyboardAction(';', {}, { isListDisplayOpen: true, keyBindings: globalBindings }),
    { type: 'openCommandPrompt' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { isResendConfirmOpen: true, keyBindings: globalBindings }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction(';', {}, { filterFocus: 'query', isFilterOpen: true, keyBindings: globalBindings }),
    { type: 'appendSearch', value: ';' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { filterFocus: 'query', isFilterOpen: true, keyBindings: globalBindings }),
    { type: 'appendSearch', value: '?' }
  );

  const movementBindings = getTestKeyBindings({
    'main.moveDown': ['z'],
    'main.moveUp': ['i']
  });

  assert.deepEqual(
    getKeyboardAction('z', {}, { isListFocused: true, keyBindings: movementBindings }),
    { type: 'moveSelection', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('i', {}, { isListFocused: false, keyBindings: movementBindings }),
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

  const detailTabBindings = getTestKeyBindings({
    'main.previousDetailTab': ['Z'],
    'main.nextDetailTab': ['X'],
    'detail.previousTab': ['<'],
    'detail.nextTab': ['>']
  });

  assert.deepEqual(
    getKeyboardAction('X', {}, { isListFocused: false, keyBindings: detailTabBindings }),
    { type: 'cycleDetailTab', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('Z', {}, { isListFocused: false, keyBindings: detailTabBindings }),
    { type: 'cycleDetailTab', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('X', {}, { isListFocused: true, keyBindings: detailTabBindings }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('>', {}, { isDetailModalOpen: true, keyBindings: detailTabBindings }),
    { type: 'cycleDetailTab', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('<', {}, { isDetailModalOpen: true, keyBindings: detailTabBindings }),
    { type: 'cycleDetailTab', direction: -1 }
  );

  const anomalyBindings = getTestKeyBindings({
    'main.toggleAnomalies': ['!']
  });

  assert.deepEqual(
    getKeyboardAction('!', {}, { isListFocused: true, keyBindings: anomalyBindings }),
    { type: 'toggleAnomalies' }
  );
  assert.deepEqual(
    getKeyboardAction('!', {}, { filterFocus: 'query', isFilterOpen: true, keyBindings: anomalyBindings }),
    { type: 'appendSearch', value: '!' }
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

  const diffBindings = getTestKeyBindings({
    'main.openHelp': ['?'],
    'main.markDiffBase': ['B'],
    'main.clearDiffBase': ['U'],
    'main.openDiff': ['Q'],
    'diff.close': ['c'],
    'diff.nextChange': ['>'],
    'diff.previousChange': ['<'],
    'diff.toggleLayout': ['T'],
    'diff.openFilter': ['F'],
    'diff.openFocusedRow': ['O'],
    'diffValue.close': ['X'],
    'diffValue.scrollDown': ['J'],
    'diffValue.scrollUp': ['K'],
    'diffValue.pageDown': ['R'],
    'diffValue.pageUp': ['L'],
    'diffValue.top': ['H'],
    'diffValue.bottom': ['E']
  });

  assert.deepEqual(
    getKeyboardAction('B', {}, { keyBindings: diffBindings }),
    { type: 'markDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('U', {}, { keyBindings: diffBindings }),
    { type: 'clearDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('Q', {}, { keyBindings: diffBindings }),
    { type: 'openDiff' }
  );
  assert.deepEqual(
    getKeyboardAction('c', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'closeDiff' }
  );
  assert.deepEqual(
    getKeyboardAction('>', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffFocus', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('<', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffFocus', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('T', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'toggleDiffLayout' }
  );
  assert.deepEqual(
    getKeyboardAction('F', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'openDiffFilter' }
  );
  assert.deepEqual(
    getKeyboardAction('O', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'openDiffValue' }
  );
  assert.deepEqual(
    getKeyboardAction('U', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'clearDiffBase' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isDiffOpen: true }),
    { type: 'openDiffValue' }
  );
  assert.deepEqual(
    getKeyboardAction('J', {}, { isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScroll', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('K', {}, { isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScroll', direction: -1 }
  );
  assert.deepEqual(
    getKeyboardAction('R', {}, { diffValuePageSize: 8, isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScroll', direction: getPageStep(8) }
  );
  assert.deepEqual(
    getKeyboardAction('L', {}, { diffValuePageSize: 8, isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScroll', direction: -getPageStep(8) }
  );
  assert.deepEqual(
    getKeyboardAction('H', {}, { isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScrollTo', boundary: 'top' }
  );
  assert.deepEqual(
    getKeyboardAction('E', {}, { isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'moveDiffValueScrollTo', boundary: 'bottom' }
  );
  assert.deepEqual(
    getKeyboardAction('X', {}, { isDiffOpen: true, isDiffValueOpen: true, keyBindings: diffBindings }),
    { type: 'closeDiffValue' }
  );
  assert.deepEqual(
    getKeyboardAction('', { return: true }, { isDiffOpen: true, isDiffValueOpen: true }),
    { type: 'closeDiffValue' }
  );
  assert.deepEqual(
    getKeyboardAction('', { backspace: true }, { isDiffOpen: true, isDiffValueOpen: true }),
    { type: 'closeDiffValue' }
  );
  assert.deepEqual(
    getKeyboardAction('/', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('?', {}, { isDiffOpen: true, keyBindings: diffBindings }),
    { type: 'openHelp' }
  );
  assert.deepEqual(
    getKeyboardAction('>', {}, { isFilterOpen: true, filterFocus: 'query', keyBindings: diffBindings }),
    { type: 'appendSearch', value: '>' }
  );
  assert.deepEqual(
    getKeyboardAction('v', {}, { isFilterOpen: true, filterFocus: 'query', keyBindings: diffBindings }),
    { type: 'appendSearch', value: 'v' }
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
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, hasDiffBase: true }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  u: unmark  b: diff  tab: details  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isListFocused: false }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  a: mark A  tab: traffic  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({ hideFrameworkAssets: false, isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isAutoInspectEnabled: true, isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  auto inspect on  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isAutoInspectEnabled: true, isListFocused: false }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  a: mark A  tab: traffic  A: candidates  auto inspect on  : command  h: help'
  );
  assert.equal(
    formatFooterText({ isDetailModalOpen: true }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  E: edit  a: mark A  enter: collapse  esc/q: close  A: candidates  : command'
  );
  assert.equal(
    formatFooterText({ isDetailModalOpen: true, hasDiffBase: true }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  E: edit  a: mark A  u: unmark  b: diff  enter: collapse  esc/q: close  A: candidates  : command'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, isLiveMode: false, isReplayMode: true }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({
      isListFocused: true,
      recordingStatus: { mode: 'full', path: './capture.ndjson', state: 'recording', error: null }
    }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help'
  );
  assert.equal(
    formatFooterText({
      isListFocused: false,
      recordingStatus: { mode: 'partial', path: './capture.ndjson', state: 'paused', error: null }
    }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  a: mark A  tab: traffic  A: candidates  : command  h: help'
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
    formatFooterText({ isRequestActivityOpen: true }),
    'sent requests  j/k move  enter inspect log  esc/q close  h help'
  );
  assert.equal(
    formatFooterText({ isEndpointGroupsOpen: true }),
    'endpoint groups  j/k: move  [ / ]: page  g/G: top/bottom  esc/q: close  h: help'
  );
  assert.equal(
    formatFooterText({ isSchemaInferenceOpen: true }),
    'schemas  n/N: group  j/k: field  [ / ]: page  g/G: top/bottom  esc/q: close  h: help'
  );
  assert.equal(
    formatFooterText({ isFlowAnalysisOpen: true }),
    'flows  j/k: move  [ / ]: page  g/G: top/bottom  enter: inspect  esc/q: close  h: help'
  );
  assert.equal(
    formatFooterText({ isDiffOpen: true }),
    'diff  n/N: change  [ / ]: page  g/G: top/bottom  v: layout  /: filter  enter: full row  esc/q: close  h: help'
  );
  assert.equal(
    formatFooterText({ isDiffOpen: true, hasDiffBase: true }),
    'diff  n/N: change  [ / ]: page  g/G: top/bottom  v: layout  /: filter  enter: full row  u: unmark  esc/q: close  h: help'
  );
  assert.equal(
    formatFooterText({ exportStatus: 'copied response body', isListFocused: false }),
    'j/k: scroll  [ / ]: page  left/right: tabs  /: find  n/N: match  a: mark A  tab: traffic  A: candidates  : command  h: help | copied response body'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, resendStatus: 'resent GET /food' }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help | resent GET /food'
  );
  assert.equal(
    formatFooterText({ commandStatus: 'use :quit', isListFocused: true }),
    'j/k: move  [ / ]: page  enter: inspect  a: mark A  tab: details  A: candidates  : command  h: help | use :quit'
  );
  assert.equal(
    formatFooterText({ isCommandOpen: true }),
    ''
  );
  assert.equal(formatFooterText({ isHelpOpen: true }), 'help | esc, h, q, Ctrl-/, backspace close');
});

test('footer and help labels reflect custom key bindings', () => {
  const keyBindings = getTestKeyBindings({
    'global.openCommandPrompt': [';'],
    'main.moveDown': ['z'],
    'main.moveUp': ['a'],
    'main.openHelp': ['?'],
    'main.openSearch': ['.'],
    'main.markDiffBase': ['B'],
    'main.clearDiffBase': ['U'],
    'main.openDiff': ['Q'],
    'main.previousDetailTab': ['Y'],
    'main.nextDetailTab': ['I'],
    'main.toggleAutoInspect': ['O'],
    'main.toggleAnomalies': ['H'],
    'diff.close': ['c'],
    'diff.nextChange': ['>'],
    'diff.previousChange': ['<'],
    'diff.toggleLayout': ['T'],
    'diff.openFilter': ['F'],
    'diff.openFocusedRow': ['O'],
    'export.masked': ['1'],
    'export.raw': ['2']
  });

  assert.equal(
    formatFooterText({ isListFocused: true, keyBindings }),
    'z/a: move  [ / ]: page  enter: inspect  B: mark A  tab: details  H: candidates  ; command  ?: help'
  );
  assert.equal(
    formatFooterText({ isListFocused: true, hasDiffBase: true, keyBindings }),
    'z/a: move  [ / ]: page  enter: inspect  B: mark A  U: unmark  Q: diff  tab: details  H: candidates  ; command  ?: help'
  );
  assert.equal(
    formatFooterText({ isListFocused: false, keyBindings }),
    'z/a: scroll  [ / ]: page  Y/I: tabs  .: find  n/N: match  B: mark A  tab: traffic  H: candidates  ; command  ?: help'
  );
  assert.equal(
    formatFooterText({ isExportPromptOpen: true, keyBindings }),
    'export  1 masked  2 raw  esc cancel'
  );
  assert.equal(
    formatFooterText({ isDiffOpen: true, keyBindings }),
    'diff  >/<: change  [ / ]: page  g/G: top/bottom  T: layout  F: filter  O: full row  c: close  ?: help'
  );
  assert.equal(
    formatFooterText({ isDiffOpen: true, hasDiffBase: true, keyBindings }),
    'diff  >/<: change  [ / ]: page  g/G: top/bottom  T: layout  F: filter  O: full row  U: unmark  c: close  ?: help'
  );

  const customSections = getHelpSections(keyBindings);
  const moveSection = customSections.find((section) => section.title === 'Move');
  const inspectSection = customSections.find((section) => section.title === 'Inspect');
  const diffSection = customSections.find((section) => section.title === 'Diff');
  const exportSection = customSections.find((section) => section.title === 'Display / Export');

  assert.deepEqual(moveSection.rows.find((row) => row[1] === 'move line'), ['z/a', 'move line']);
  assert.deepEqual(inspectSection.rows.find((row) => row[1] === 'find details'), ['.', 'find details']);
  assert.deepEqual(
    inspectSection.rows.find((row) => row[1] === 'request / response / diagnostics'),
    ['Y/I, r', 'request / response / diagnostics']
  );
  assert.deepEqual(inspectSection.rows.find((row) => row[1] === 'auto inspect mode'), ['O', 'auto inspect mode']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'mark A'), ['B', 'mark A']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'unmark A'), ['U', 'unmark A']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'compare with A'), ['Q', 'compare with A']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'next / previous change'), ['>/<', 'next / previous change']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'toggle layout'), ['T', 'toggle layout']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'filter rows'), ['F', 'filter rows']);
  assert.deepEqual(diffSection.rows.find((row) => row[1] === 'open full row'), ['O', 'open full row']);
  assert.deepEqual(exportSection.rows.find((row) => row[1] === 'masked / raw export'), ['1 / 2', 'masked / raw export']);
  assert.deepEqual(exportSection.rows.find((row) => row[1] === 'experimental highlights'), ['H', 'experimental highlights']);
  assert.equal(DEFAULT_KEY_BINDINGS['main.moveDown'][0], 'j');
});

test('request activity helpers track sent request progress', () => {
  const sending = createRequestActivity({
    draft: {
      method: 'get',
      url: '/api/items?page=3'
    },
    id: 'req-1',
    source: 'next-page',
    startedAt: Date.UTC(2024, 0, 2, 3, 4, 5)
  });

  assert.deepEqual(sending, {
    error: '',
    finishedAt: null,
    id: 'req-1',
    logId: null,
    method: 'GET',
    responseTimeMs: null,
    source: 'next-page',
    startedAt: Date.UTC(2024, 0, 2, 3, 4, 5),
    state: 'sending',
    statusCode: null,
    url: '/api/items?page=3'
  });
  assert.equal(formatRequestActivityToast(sending), 'sending GET /api/items?page=3');
  assert.match(formatRequestActivityRow(sending, { selected: true, width: 88 }), /^> .* sending GET/);
  assert.match(formatRequestActivityRow(sending, { selected: true, width: 88 }), /next page\s*$/);

  const success = finishRequestActivity(sending, {
    id: 'log-1',
    responseTimeMs: 42,
    statusCode: 200
  }, {
    finishedAt: Date.UTC(2024, 0, 2, 3, 4, 6)
  });

  assert.equal(success.state, 'success');
  assert.equal(success.logId, 'log-1');
  assert.equal(success.statusCode, 200);
  assert.equal(success.responseTimeMs, 42);
  assert.equal(formatRequestActivityToast(success), 'sent GET /api/items?page=3 -> 200 in 42ms');
  assert.match(formatRequestActivityRow(success, { width: 88 }), / 200\s+GET\s+\/api\/items\?page=3/);

  const failure = failRequestActivity(sending, new Error('network down'), {
    finishedAt: Date.UTC(2024, 0, 2, 3, 4, 7)
  });

  assert.equal(failure.state, 'error');
  assert.equal(failure.error, 'network down');
  assert.equal(formatRequestActivityToast(failure), 'send failed GET /api/items?page=3: network down');

  const page = RequestActivityPage.type({
    activities: [],
    keyBindings: DEFAULT_KEY_BINDINGS,
    selectedId: null
  });
  const warningToast = ToastNotification.type({
    toast: {
      kind: 'warning',
      message: 'experimental highlights on: 1 candidate'
    }
  });

  assert.match(getNodeText(page), /esc\/q close \| h help/);
  assert.equal(warningToast.props.borderColor, 'yellow');
  assert.equal(collectNodes(warningToast).find((item) => item.props?.children === 'experimental highlights on: 1 candidate')?.props.color, 'yellow');
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
  assert.deepEqual(
    rows.find((row) => row.command === ':send-next-page'),
    {
      aliases: ':snp',
      command: ':send-next-page',
      description: 'send next-page request'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':requests'),
    {
      aliases: ':sent, :rq',
      command: ':requests',
      description: 'open sent requests'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':endpoints'),
    {
      aliases: ':ep, :endpoint-groups',
      command: ':endpoints',
      description: 'open endpoint groups'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':schemas'),
    {
      aliases: ':schema, :sc, :shapes',
      command: ':schemas',
      description: 'open schema inference'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':flows'),
    {
      aliases: ':flow, :redirects, :retries',
      command: ':flows',
      description: 'open redirect and retry flows'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':anomalies'),
    {
      aliases: ':anomaly, :anom',
      command: ':anomalies',
      description: 'toggle experimental highlights'
    }
  );
  assert.deepEqual(
    rows.find((row) => row.command === ':auto-inspect'),
    {
      aliases: ':ai, :auto-select, :auto-details',
      command: ':auto-inspect',
      description: 'toggle auto-inspect on selection move'
    }
  );
  assert.equal(
    rows.find((row) => row.command === ':clear-logs').aliases,
    ':clear, :clear-traffic'
  );
});

test('contextual help sections focus the active surface and command availability', () => {
  const trafficSections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'traffic' });
  const diffSections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'diff' });
  const endpointSections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'endpointGroups' });
  const schemaSections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'schemaInference' });
  const flowSections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'flowAnalysis' });
  const requestActivitySections = getHelpSections(DEFAULT_KEY_BINDINGS, { surface: 'requestActivity' });

  assert.deepEqual(
    trafficSections.map((section) => section.title),
    ['Traffic', 'Traffic Actions']
  );
  assert.deepEqual(
    trafficSections[0].rows.find((row) => row[1] === 'auto inspect mode'),
    ['I', 'auto inspect mode']
  );
  assert.equal(trafficSections.find((section) => section.title === 'Compose'), undefined);
  assert.deepEqual(
    trafficSections[0].rows.find((row) => row[1] === 'search traffic'),
    ['/', 'search traffic']
  );
  assert.deepEqual(
    trafficSections[0].rows.find((row) => row[1] === 'experimental highlights'),
    ['A', 'experimental highlights']
  );
  assert.deepEqual(
    diffSections.map((section) => section.title),
    ['Diff']
  );
  assert.deepEqual(
    diffSections[0].rows.find((row) => row[1] === 'filter rows'),
    ['/', 'filter rows']
  );
  assert.deepEqual(
    endpointSections.map((section) => section.title),
    ['Endpoint Groups']
  );
  assert.deepEqual(
    endpointSections[0].rows.find((row) => row[1] === 'move endpoint'),
    ['j/k', 'move endpoint']
  );
  assert.deepEqual(
    schemaSections.map((section) => section.title),
    ['Schema Inference']
  );
  assert.deepEqual(
    schemaSections[0].rows.find((row) => row[1] === 'change schema group'),
    ['n/N', 'change schema group']
  );
  assert.deepEqual(
    flowSections.map((section) => section.title),
    ['Flows']
  );
  assert.deepEqual(
    flowSections[0].rows.find((row) => row[1] === 'inspect log'),
    ['enter', 'inspect log']
  );
  assert.deepEqual(
    requestActivitySections[0].rows.find((row) => row[1] === 'close'),
    ['esc/q', 'close']
  );

  const unavailableNextPageContext = {
    availability: {
      'next-page': { available: false, reason: 'no next page detected' },
      'send-next-page': { available: false, reason: 'no next page detected' }
    }
  };
  const commandRows = getCommandHelpRows(unavailableNextPageContext);

  assert.equal(commandRows.find((row) => row.command === ':next-page'), undefined);
  assert.equal(commandRows.find((row) => row.command === ':send-next-page'), undefined);
  assert.equal(commandRows.find((row) => row.command === ':clear-logs').aliases, ':clear, :clear-traffic');
});

test('help modal keeps long key labels on one row', () => {
  const modal = HelpModal.type({
    helpContext: { surface: 'details' },
    keyBindings: DEFAULT_KEY_BINDINGS
  });
  const keyNode = collectNodes(modal).find((node) => (
    node.props?.color === 'cyan' && getNodeText(node).trim() === 'left/right, r'
  ));

  assert.equal(Boolean(keyNode), true);
  assert.equal(keyNode.props.wrap, 'truncate');
  assert.equal(
    collectNodes(modal).some((node) => getNodeText(node).trim() === 'ht'),
    false
  );
});

test('command modal renders command suggestions without missing constants', () => {
  assert.doesNotThrow(() => {
    CommandModal.type({
      commandContext: {
        availability: {
          'next-page': { available: false, reason: 'no next page detected' },
          'send-next-page': { available: false, reason: 'no next page detected' }
        }
      },
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
  assert.deepEqual(captureSection.rows.find(([keys]) => keys === 'h/Ctrl-/'), ['h/Ctrl-/', 'help']);
});

test('help sections describe copy and download exports', () => {
  const exportSection = HELP_SECTIONS.find((section) => section.title === 'Display / Export');

  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'y'), ['y', 'copy item']);
  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'D'), ['D', 'download item']);
  assert.deepEqual(exportSection.rows.find(([keys]) => keys === 'm / r'), ['m / r', 'masked / raw export']);
});

test('help sections describe request diff controls', () => {
  const diffSection = HELP_SECTIONS.find((section) => section.title === 'Diff');

  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'a'), ['a', 'mark A']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'u'), ['u', 'unmark A']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'b'), ['b', 'compare with A']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'n/N'), ['n/N', 'next / previous change']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === '[ / ]'), ['[ / ]', 'move page']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'v'), ['v', 'toggle layout']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === '/'), ['/', 'filter rows']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'enter'), ['enter', 'open full row']);
  assert.deepEqual(diffSection.rows.find(([keys]) => keys === 'esc/q'), ['esc/q', 'close diff']);
});

test('help sections describe traffic list display controls', () => {
  const displaySection = HELP_SECTIONS.find((section) => section.title === 'Display / Export');

  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 't'), ['t', 'cycle path mode']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'v'), ['v', 'cycle list density']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'w'), ['w', 'cycle pane width']);
  assert.deepEqual(displaySection.rows.find(([keys]) => keys === 'F'), ['F', 'show / hide framework']);
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

test('query parameter parser groups nested filters, sorting, pagination, and other params', () => {
  const parsed = parseQueryParameters(
    '/api/users?filter[status]=active&sort=-createdAt,name&ids[]=1&ids[]=2&fields[user]=id,name&include=team,owner&page=2&limit=50&q=ada'
  );

  assert.equal(parsed.detected, true);
  assert.deepEqual(parsed.filters, {
    ids: ['1', '2'],
    status: 'active'
  });
  assert.deepEqual(parsed.sort, [
    { direction: 'desc', field: 'createdAt', raw: '-createdAt' },
    { direction: 'asc', field: 'name', raw: 'name' }
  ]);
  assert.deepEqual(parsed.pagination, { limit: '50', page: '2' });
  assert.deepEqual(parsed.search, { q: 'ada' });
  assert.deepEqual(parsed.include, ['team', 'owner']);
  assert.deepEqual(parsed.fields, { user: ['id', 'name'] });
  assert.deepEqual(parsed.other, {});
  assert.deepEqual(parsed.decoded.ids, ['1', '2']);
  assert.deepEqual(parsed.rawEntries.map((entry) => [entry.key, entry.value, entry.group]), [
    ['filter[status]', 'active', 'filters'],
    ['sort', '-createdAt,name', 'sort'],
    ['ids[]', '1', 'filters'],
    ['ids[]', '2', 'filters'],
    ['fields[user]', 'id,name', 'fields'],
    ['include', 'team,owner', 'include'],
    ['page', '2', 'pagination'],
    ['limit', '50', 'pagination'],
    ['q', 'ada', 'search']
  ]);
});

test('query parameter parser accepts raw and absolute queries with repeated and empty values', () => {
  const raw = parseQueryParameters('filter[tags][]=red&filter[range][min]=10&include[]=team&include=owner&fields=id,email&search[term]=ada&query=grace&empty=');

  assert.equal(raw.detected, true);
  assert.deepEqual(raw.filters, {
    empty: '',
    range: { min: '10' },
    tags: ['red']
  });
  assert.deepEqual(raw.include, ['team', 'owner']);
  assert.deepEqual(raw.fields, { $all: ['id', 'email'] });
  assert.deepEqual(raw.search, { query: 'grace', term: 'ada' });
  assert.deepEqual(raw.other, {});

  const absolute = parseQueryParameters('https://example.test/api?filter%5Bstatus%5D=active+now&pageSize=25');

  assert.deepEqual(absolute.filters, { status: 'active now' });
  assert.deepEqual(absolute.pagination, { pageSize: '25' });
  assert.deepEqual(parseQueryParameters('meta[debug]=1&broken[key=2').other, {
    'broken[key': '2',
    meta: { debug: '1' }
  });
  assert.equal(parseQueryParameters('/api/users').detected, false);
});

test('query parameter parser treats common catalog params as filters and pagination separately', () => {
  const parsed = parseQueryParameters(
    '/api/catalog/businesses?type=food&limit=12&postalCode=M1P+1E7&country=CA&radiusKm=25&cursor=abc123'
  );

  assert.deepEqual(parsed.filters, {
    country: 'CA',
    postalCode: 'M1P 1E7',
    radiusKm: '25',
    type: 'food'
  });
  assert.deepEqual(parsed.pagination, {
    cursor: 'abc123',
    limit: '12'
  });
  assert.deepEqual(parsed.other, {});
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
    strategy: 'link-rel-next',
    source: 'link',
    url: '/api/items?cursor=abc123&limit=50'
  });
  assert.equal(result.summary, 'page 2, limit 50, likely next cursor: abc123');
  assert.equal(formatPaginationNextStatus(result), 'next page from Link rel=next');
});

test('pagination analyzer computes page and offset fallbacks without inventing cursors', () => {
  assert.deepEqual(
    analyzePagination({
      path: '/api/items?page=2&page_size=25',
      response: { headers: {} }
    }).nextRequest,
    {
      strategy: 'page-increment',
      source: 'computed',
      url: '/api/items?page=3&page_size=25'
    }
  );

  const offsetResult = analyzePagination({
    path: '/api/items?offset=100&limit=50',
    response: { headers: {} }
  });

  assert.equal(offsetResult.nextRequest.url, '/api/items?offset=150&limit=50');
  assert.equal(offsetResult.nextRequest.strategy, 'offset-limit');
  assert.equal(offsetResult.summary, 'limit 50, offset 100, next offset 150');
  assert.equal(formatPaginationNextStatus(offsetResult), 'next page computed from offset + limit');

  const cursorOnly = analyzePagination({
    path: '/api/items?cursor=current',
    response: { headers: {} }
  });

  assert.equal(cursorOnly.detected, true);
  assert.equal(cursorOnly.nextRequest, null);
  assert.equal(cursorOnly.summary, 'cursor current');
  assert.equal(cursorOnly.unavailableReason, 'next cursor not found in Link header or response body');
  assert.equal(formatPaginationNextStatus(cursorOnly), 'next cursor not found in Link header or response body');

  const limitOnly = analyzePagination({
    path: '/api/items?limit=50',
    response: { headers: {} }
  });

  assert.equal(limitOnly.detected, true);
  assert.equal(limitOnly.nextRequest, null);
  assert.equal(limitOnly.summary, 'limit 50');
  assert.equal(limitOnly.unavailableReason, '');
  assert.equal(formatPaginationNextStatus(limitOnly), 'no next page detected');
});

test('pagination analyzer detects response body cursor hints', () => {
  const bodyCursor = analyzePagination({
    path: '/api/items?cursor=current&limit=50',
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: [],
        nextCursor: 'abc123'
      })
    }
  });

  assert.equal(bodyCursor.nextRequest.strategy, 'body-cursor');
  assert.deepEqual(bodyCursor.nextRequest.cursor, {
    field: 'cursor',
    name: 'cursor',
    value: 'abc123'
  });
  assert.equal(bodyCursor.nextRequest.url, '/api/items?cursor=abc123&limit=50');
  assert.equal(bodyCursor.summary, 'limit 50, cursor current, likely next cursor: abc123');
  assert.equal(bodyCursor.unavailableReason, '');
  assert.equal(formatPaginationNextStatus(bodyCursor), 'next page from response body cursor');

  const pageInfo = analyzePagination({
    path: '/api/items?after=current',
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageInfo: {
          endCursor: 'end-456',
          hasNextPage: true
        }
      })
    }
  });

  assert.equal(pageInfo.nextRequest.strategy, 'body-cursor');
  assert.deepEqual(pageInfo.nextRequest.cursor, {
    field: 'after',
    name: 'after',
    value: 'end-456'
  });
  assert.equal(pageInfo.nextRequest.url, '/api/items?after=end-456');
  assert.equal(formatPaginationNextStatus(pageInfo), 'next page from response body cursor');

  const pageInfoDone = analyzePagination({
    path: '/api/items?after=current',
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pageInfo: {
          endCursor: 'end-456',
          hasNextPage: false
        }
      })
    }
  });

  assert.equal(pageInfoDone.nextRequest, null);
  assert.equal(pageInfoDone.unavailableReason, 'next cursor not found in Link header or response body');
});

test('pagination analyzer detects response body next URLs', () => {
  const result = analyzePagination({
    path: '/api/items?cursor=current&limit=50',
    response: {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        pagination: {
          next: '?cursor=abc123&limit=50'
        }
      })
    }
  });

  assert.equal(result.nextRequest.strategy, 'body-next-url');
  assert.deepEqual(result.nextRequest.cursor, {
    field: 'cursor',
    name: 'cursor',
    value: 'abc123'
  });
  assert.equal(result.nextRequest.url, '/api/items?cursor=abc123&limit=50');
  assert.equal(result.summary, 'limit 50, cursor current, likely next cursor: abc123');
  assert.equal(formatPaginationNextStatus(result), 'next page from response body next URL');
});

test('pagination analyzer reports specific invalid numeric params', () => {
  assert.equal(
    analyzePagination({
      path: '/api/items?page=two',
      response: { headers: {} }
    }).unavailableReason,
    'page is not numeric'
  );
  assert.equal(
    analyzePagination({
      path: '/api/items?offset=&limit=50',
      response: { headers: {} }
    }).unavailableReason,
    'offset is not numeric'
  );
  assert.equal(
    analyzePagination({
      path: '/api/items?offset=100',
      response: { headers: {} }
    }).unavailableReason,
    'offset pagination needs a limit'
  );
  assert.equal(
    analyzePagination({
      path: '/api/items?offset=100&limit=many',
      response: { headers: {} }
    }).unavailableReason,
    'limit is not numeric for offset pagination'
  );
  assert.equal(
    analyzePagination({
      path: '/api/items?limit=many',
      response: { headers: {} }
    }).unavailableReason,
    'limit is not numeric'
  );
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
  assert.equal(relative.nextRequest.strategy, 'link-rel-next');
  assert.equal(relative.summary, 'page 2, next page 3');
  assert.equal(formatPaginationNextStatus(relative), 'next page from Link rel=next');

  const prevOnly = analyzePagination({
    path: '/api/items',
    response: { headers: { link: '</api/items?page=1>; rel="prev"' } }
  });

  assert.equal(prevOnly.detected, true);
  assert.equal(prevOnly.summary, 'link rels: prev');
  assert.equal(prevOnly.unavailableReason, 'Link header has no rel=next');
  assert.equal(formatPaginationNextStatus(prevOnly), 'Link header has no rel=next');
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

test('detail rows include structured query parameter summaries without body path metadata', () => {
  const rows = getDetailRows({
    method: 'GET',
    path: '/api/users?filter[status]=active&sort=-createdAt,name&ids[]=1&ids[]=2&fields[user]=id,name&include=team,owner&page=2&limit=50&q=ada',
    request: { headers: {}, body: '' },
    response: { headers: {}, body: '' }
  }, 'request');

  assert.equal(rows.some((row) => row.id === 'request-query-params-title'), true);
  assert.deepEqual(rows
    .filter((row) => row.type === 'query')
    .map((row) => [row.text, row.path]), [
    ['filters.status: active', null],
    ['filters.ids: [1, 2]', null],
    ['sort: createdAt desc, name asc', null],
    ['search.q: ada', null],
    ['include: team, owner', null],
    ['fields.user: id, name', null]
  ]);

  assert.equal(
    getDetailRows({
      method: 'GET',
      path: '/api/users?filter[status]=active',
      request: { headers: {}, body: '' },
      response: { headers: {}, body: '' }
    }, 'response').some((row) => row.id === 'response-query-params-title'),
    false
  );
});

test('detail query rows keep catalog filters simple and avoid duplicate pagination rows', () => {
  const longToken = 't'.repeat(140);
  const rows = getDetailRows({
    method: 'GET',
    path: `/api/catalog/businesses?type=food&limit=12&postalCode=M1P+1E7&country=CA&radiusKm=25&cursor=abc123&debugToken=${longToken}`,
    request: { headers: {}, body: '' },
    response: { headers: {}, body: '' }
  }, 'request');
  const queryRows = rows.filter((row) => row.type === 'query');
  const tokenRow = queryRows.find((row) => row.text.startsWith('filters.debugToken: '));

  assert.deepEqual(queryRows.map((row) => row.text), [
    'filters.type: food',
    'filters.postalCode: M1P 1E7',
    'filters.country: CA',
    'filters.radiusKm: 25',
    `filters.debugToken: ${longToken.slice(0, 93)}...`
  ]);
  assert.equal(queryRows.some((row) => row.text.startsWith('pagination:')), false);
  assert.equal(rows.some((row) => row.id === 'request-pagination-title'), true);
  assert.equal(tokenRow.searchText.includes(longToken), true);
  assert.equal(tokenRow.path, null);
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

  const unavailableRows = getDetailRows({
    method: 'GET',
    path: '/api/items?cursor=current',
    request: { headers: {}, body: '' },
    response: { headers: {}, body: '' }
  }, 'response');
  const unavailableRow = unavailableRows.find((row) => row.id === 'response-pagination-unavailable');

  assert.equal(unavailableRow.text, 'next unavailable: next cursor not found in Link header or response body');
  assert.equal(unavailableRow.path, null);
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

test('advanced traffic search parses terms and supports word modes, case, and patterns', () => {
  const timestamp = 1700000000000;
  const traffic = [
    {
      id: 'one',
      method: 'GET',
      path: '/users',
      statusCode: 200,
      timestamp,
      request: { headers: { host: 'localhost:8080' }, body: '' },
      response: { headers: { 'x-result': 'ok' }, body: 'Ada Lovelace' }
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

  assert.deepEqual(parseSearchTerms('  ada   gateway  '), ['ada', 'gateway']);
  assert.deepEqual(parseSearchTerms('"Bad Gateway" sessions'), ['Bad Gateway', 'sessions']);
  assert.deepEqual(parseSearchTerms('"unclosed phrase'), ['unclosed phrase']);
  assert.equal(matchesSearchValues(['Ada Lovelace', '/users'], 'ada users'), true);
  assert.equal(matchesSearchValues(['Ada Lovelace', '/users'], 'ada gateway'), false);
  assert.equal(matchesSearchValues(['Ada Lovelace', '/users'], 'ada gateway', { wordMatchMode: 'or' }), true);
  assert.equal(matchesSearchValues(['Ada Lovelace'], 'ada', { matchCase: true }), false);
  assert.equal(matchesSearchValues(['Ada Lovelace'], 'Ada', { matchCase: true }), true);
  assert.equal(matchesSearchValues(['/sessions'], '^/sess', { searchMode: 'pattern' }), true);
  assert.equal(matchesSearchValues(['Bad Gateway'], 'bad gateway', { searchMode: 'pattern' }), true);
  assert.equal(matchesSearchValues(['Bad Gateway'], 'bad gateway', { matchCase: true, searchMode: 'pattern' }), false);
  assert.equal(matchesSearchValues(['anything'], '[', { searchMode: 'pattern' }), false);
  assert.match(getSearchQueryWarning('[', { searchMode: 'pattern' }), /^invalid pattern:/);

  assert.deepEqual(filterLogs(traffic, { searchQuery: 'ada users' }).map((log) => log.id), ['one']);
  assert.deepEqual(filterLogs(traffic, { searchQuery: 'ada sessions' }).map((log) => log.id), []);
  assert.deepEqual(filterLogs(traffic, {
    searchQuery: 'ada sessions',
    wordMatchMode: 'or'
  }).map((log) => log.id), ['one', 'two']);
  assert.deepEqual(filterLogs(traffic, {
    searchField: 'body',
    searchQuery: '"Bad Gateway"'
  }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, {
    matchCase: true,
    searchQuery: 'ada'
  }).map((log) => log.id), []);
  assert.deepEqual(filterLogs(traffic, {
    searchField: 'path',
    searchMode: 'pattern',
    searchQuery: '^/sess'
  }).map((log) => log.id), ['two']);
  assert.deepEqual(filterLogs(traffic, {
    searchMode: 'pattern',
    searchQuery: '['
  }).map((log) => log.id), []);
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
    isAsset: false,
    reason: null
  });
  assert.deepEqual(classifyFrameworkAssetRequest(coldRscSummary), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(filterLogs([coldSummary, coldRscSummary]).map((log) => log.id), ['summary']);
  assert.deepEqual(filterLogs([coldAssetSummary, coldRscSummary]).map((log) => log.id), ['asset']);
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
    createTraffic('order-id', '/orders/80npap'),
    createTraffic('order-dots', '/orders/80npap.....'),
    createTraffic('order-js', '/orders/80npap.js', {
      responseHeaders: { 'content-type': 'application/javascript' }
    }),
    createTraffic('order-css', '/orders/80npap.css', {
      responseHeaders: { 'content-type': 'text/css' }
    }),
    createTraffic('order-svg', '/orders/80npap.svg', {
      responseHeaders: { 'content-type': 'image/svg+xml' }
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
  const trafficById = new Map(traffic.map((log) => [log.id, log]));
  const classifyById = (id) => classifyFrameworkAssetRequest(trafficById.get(id));
  const selectTraffic = (...ids) => ids.map((id) => trafficById.get(id));

  assert.deepEqual(
    traffic.filter(isFrameworkAssetRequest).map((log) => log.id),
    [
      'next',
      'next-rsc-query',
      'next-rsc-matched',
      'next-rsc-content-type',
      'next-rsc-header',
      'vite',
      'nuxt',
      'astro',
      'sveltekit',
      'remix',
      'gatsby',
      'webpack',
      'module'
    ]
  );
  assert.deepEqual(
    traffic.filter((log) => !isFrameworkAssetRequest(log)).map((log) => log.id),
    [
      'api',
      'api-json',
      'order-id',
      'order-dots',
      'order-js',
      'order-css',
      'order-svg',
      'image',
      'post',
      'post-rsc'
    ]
  );
  assert.deepEqual(classifyById('next'), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'framework-path'
  });
  assert.deepEqual(classifyById('next-rsc-query'), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyById('next-rsc-matched'), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyById('next-rsc-content-type'), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyById('next-rsc-header'), {
    framework: 'Next.js',
    isAsset: true,
    reason: 'next-rsc'
  });
  assert.deepEqual(classifyById('vite'), {
    framework: 'Vite',
    isAsset: true,
    reason: 'framework-path'
  });
  assert.deepEqual(classifyById('nuxt').framework, 'Nuxt');
  assert.deepEqual(classifyById('astro').framework, 'Astro');
  assert.deepEqual(classifyById('sveltekit').framework, 'SvelteKit');
  assert.deepEqual(classifyById('remix').framework, 'Remix');
  assert.deepEqual(classifyById('gatsby').framework, 'Gatsby');
  assert.deepEqual(classifyById('webpack').framework, 'Webpack');
  assert.deepEqual(classifyById('module'), {
    framework: null,
    isAsset: true,
    reason: 'source-module'
  });
  assert.deepEqual(classifyById('image'), {
    framework: null,
    isAsset: false,
    reason: null
  });
  assert.deepEqual(classifyById('post'), {
    framework: null,
    isAsset: false,
    reason: null
  });
  assert.deepEqual(classifyById('post-rsc'), {
    framework: null,
    isAsset: false,
    reason: null
  });
  assert.deepEqual(filterLogs(traffic).map((log) => log.id), [
    'api',
    'api-json',
    'order-id',
    'order-dots',
    'order-js',
    'order-css',
    'order-svg',
    'image',
    'post',
    'post-rsc'
  ]);
  assert.deepEqual(filterLogs(traffic, { hideFrameworkAssets: false }).map((log) => log.id), traffic.map((log) => log.id));
  assert.deepEqual(summarizeFrameworkAssets(traffic), {
    additionalFrameworkCount: 7,
    assetCount: 13,
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
  assert.deepEqual(summarizeFrameworkAssets(selectTraffic('api', 'api-json', 'order-id', 'order-dots', 'image', 'post', 'post-rsc')), {
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
  assert.equal(formatFilterLabel([], [], 'all', 'id'), 'search all words "id" in all fields');
  assert.equal(formatFilterLabel(['GET', 'POST'], ['2xx'], 'path', 'users'), 'method GET,POST | status 2xx | search all words "users" in path');
  assert.equal(formatFilterLabel([], [], 'all', 'users sessions', { wordMatchMode: 'or' }), 'search any word "users sessions" in all fields');
  assert.equal(formatFilterLabel([], [], 'body', 'gateway.*timeout', { searchMode: 'pattern' }), 'pattern /gateway.*timeout/ in body');
  assert.equal(formatFilterLabel([], [], 'headers', 'X-Token', { matchCase: true }), 'search all words "X-Token" in headers | match case');
  assert.match(formatFilterLabel([], [], 'all', '[', { searchMode: 'pattern' }), /^pattern \/\[\/ in all fields \| invalid pattern:/);
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
  }), 'search all words "secret" in body | cold bodies load on inspect');
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

test('jwt inspector decodes claims, scopes, expiry, and invalid tokens locally', () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const nearExpiry = Math.floor(now / 1000) + (10 * 60);
  const token = createJwtToken({
    exp: nearExpiry,
    iss: 'https://issuer.example',
    scope: 'read write',
    sub: 'user-123'
  }, {
    header: { alg: 'RS256', kid: 'kid-1', typ: 'JWT' },
    signature: 'supersecret-signature'
  });
  const decoded = decodeJwtToken(token, { now });
  const expired = decodeJwtToken(createJwtToken({ exp: Math.floor(now / 1000) }), { now });
  const padded = decodeJwtToken(createJwtToken({ sub: 'padded' }, { padding: true }), { now });
  const serialized = JSON.stringify(decoded);

  assert.equal(decoded.decoded, true);
  assert.deepEqual(decoded.header, { alg: 'RS256', kid: 'kid-1', typ: 'JWT' });
  assert.equal(decoded.issuer, 'https://issuer.example');
  assert.equal(decoded.subject, 'user-123');
  assert.equal(decoded.scopes, 'read, write');
  assert.equal(decoded.expiresAt, '2026-01-01T00:10:00.000Z');
  assert.equal(decoded.isExpired, false);
  assert.equal(decoded.isNearExpiry, true);
  assert.deepEqual(decoded.warnings, ['near expiry']);
  assert.equal(serialized.includes(token), false);
  assert.equal(serialized.includes('supersecret-signature'), false);
  assert.equal(expired.isExpired, true);
  assert.equal(expired.isNearExpiry, false);
  assert.deepEqual(expired.warnings, ['expired']);
  assert.equal(padded.decoded, true);
  assert.equal(padded.subject, 'padded');
  assert.equal(decodeJwtToken('not-a-jwt').decoded, false);
  assert.equal(formatJwtTimeClaim(nearExpiry), '2026-01-01T00:10:00.000Z');
  assert.equal(formatJwtTimeClaim(undefined), 'n/a');
  assert.equal(formatJwtTimeClaim('not-a-date'), 'invalid');
  assert.equal(formatJwtScopes({ scp: ['read', 'write'], scopes: 42 }), 'read, write, 42');
  assert.equal(formatJwtScopes({}), 'n/a');
});

test('jwt inspector finds tokens across request and response sources without duplicates', () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const authToken = createJwtToken({ iss: 'auth', sub: 'one' });
  const rawHeaderToken = createJwtToken({ iss: 'raw-header', sub: 'two' });
  const cookieToken = createJwtToken({ iss: 'cookie', sub: 'three' });
  const queryToken = createJwtToken({ iss: 'query', sub: 'four' });
  const jsonBodyToken = createJwtToken({ iss: 'json-body', sub: 'five' });
  const setCookieToken = createJwtToken({ iss: 'set-cookie', sub: 'six' });
  const formBodyToken = createJwtToken({ iss: 'form-body', sub: 'seven' });
  const log = createDiffLog({
    path: `/callback?id_token=${queryToken}&duplicate=${authToken}&plain=ok`,
    request: {
      headers: {
        authorization: `Bearer ${authToken}`,
        cookie: `access_token=${cookieToken}; duplicate=${authToken}; bad=opaque`,
        'content-type': 'application/json',
        'x-raw-jwt': rawHeaderToken
      },
      body: JSON.stringify({
        nested: {
          id_token: jsonBodyToken
        },
        visible: 'plain'
      })
    },
    response: {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'set-cookie': [
          `ts_access_token=${setCookieToken}; Path=/; HttpOnly`,
          'bad=opaque; Path=/'
        ]
      },
      body: `access_token=${formBodyToken}&visible=plain&bad=a.b.c`
    }
  });
  const tokens = findJwtTokensInLog(log, { now });

  assert.equal(tokens.length, 7);
  assert.deepEqual(tokens.map((token) => token.location), [
    'request header authorization',
    'request cookie access_token',
    'request header x-raw-jwt',
    'response cookie ts_access_token',
    'request query id_token',
    'request body nested.id_token',
    'response body access_token'
  ]);
  assert.deepEqual(tokens.map((token) => token.issuer), [
    'auth',
    'cookie',
    'raw-header',
    'set-cookie',
    'query',
    'json-body',
    'form-body'
  ]);
  assert.equal(JSON.stringify(tokens).includes(authToken), false);
});

test('auth secret detector classifies structured candidates without exposing values', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature';
  const log = createDiffLog({
    path: `/api/items?api_key=query-secret&csrf_token=query-csrf&visible=plain`,
    request: {
      headers: {
        authorization: `Bearer ${jwt}`,
        cookie: 'sid=session-secret; csrfToken=csrf-cookie; theme=dark',
        'content-type': 'application/json',
        'x-api-key': 'header-secret'
      },
      body: JSON.stringify({
        auth: { token: 'body-token-secret' },
        csrfToken: 'body-csrf-secret',
        visible: 'plain'
      })
    },
    response: {
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'set-cookie': [
          'sessionid=response-session-secret; Path=/',
          'ts_session_id=response-ts-session-secret; Path=/',
          `ts_access_token=${jwt}; Path=/`,
          'ts_refresh_token=response-refresh-secret; Path=/',
          'csrf_token=response-csrf-cookie-secret; Path=/',
          'theme=dark; Path=/'
        ],
        'x-csrf-token': 'response-csrf-secret'
      },
      body: 'access_token=response-token-secret&visible=plain'
    }
  });
  const findings = detectAuthSecrets(log);
  const keys = new Set(findings.map((finding) => `${finding.type}:${finding.side}:${finding.source}:${finding.name}`));
  const serialized = JSON.stringify(findings);

  assert.equal(keys.has('jwt:request:header:authorization'), true);
  assert.equal(keys.has('api-key:request:header:x-api-key'), true);
  assert.equal(keys.has('session-cookie:request:cookie:sid'), true);
  assert.equal(keys.has('csrf:request:cookie:csrfToken'), true);
  assert.equal(keys.has('api-key:request:query:api_key'), true);
  assert.equal(keys.has('csrf:request:query:csrf_token'), true);
  assert.equal(keys.has('api-key:request:body:auth.token'), true);
  assert.equal(keys.has('csrf:request:body:csrfToken'), true);
  assert.equal(keys.has('session-cookie:response:cookie:sessionid'), true);
  assert.equal(keys.has('session-cookie:response:cookie:ts_session_id'), true);
  assert.equal(keys.has('jwt:response:cookie:ts_access_token'), true);
  assert.equal(keys.has('token-cookie:response:cookie:ts_refresh_token'), true);
  assert.equal(keys.has('csrf:response:cookie:csrf_token'), true);
  assert.equal(keys.has('csrf:response:header:x-csrf-token'), true);
  assert.equal(keys.has('api-key:response:body:access_token'), true);
  assert.equal([...keys].some((key) => key.includes('theme')), false);
  assert.equal(serialized.includes('header-secret'), false);
  assert.equal(serialized.includes('session-secret'), false);
  assert.equal(serialized.includes('response-refresh-secret'), false);
  assert.equal(serialized.includes('response-ts-session-secret'), false);
  assert.equal(serialized.includes('response-csrf-cookie-secret'), false);
  assert.equal(serialized.includes('body-token-secret'), false);
  assert.equal(serialized.includes('response-token-secret'), false);

  assert.deepEqual(
    detectAuthSecrets(createDiffLog({ request: { headers: { authorization: 'Bearer opaque-token' } } })).map((finding) => finding.type),
    ['bearer']
  );
  assert.deepEqual(
    detectAuthSecrets(createDiffLog({ request: { headers: { authorization: 'Basic dXNlcjpwYXNz' } } })).map((finding) => finding.type),
    ['basic-auth']
  );
  assert.deepEqual(
    detectAuthSecrets(createDiffLog({ request: { headers: { 'x-trace-id': 'not-secret' }, body: 'visible=plain' } })),
    []
  );
});

test('auth detail rows render safe badges and searchable source locations', () => {
  const log = createDiffLog({
    path: '/api/items?api_key=query-secret',
    request: {
      headers: {
        authorization: 'Bearer opaque-secret',
        cookie: 'sid=session-secret',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ csrfToken: 'csrf-secret' })
    },
    response: {
      headers: {
        'set-cookie': 'ts_refresh_token=response-refresh-secret; Path=/'
      }
    }
  });
  const rows = getDetailRows(log, 'auth', { showCookieValues: true });
  const text = getDetailLines(log, 'auth', { showCookieValues: true }).join('\n');
  const matches = findDetailMatches(rows, 'authorization');

  assert.deepEqual(DETAIL_TABS, ['request', 'response', 'diagnostics']);
  assert.equal(cycleValue(DETAIL_TABS, 'request'), 'response');
  assert.equal(cycleValue(DETAIL_TABS, 'response'), 'diagnostics');
  assert.equal(cycleValue(DETAIL_TABS, 'diagnostics'), 'request');
  assert.equal(cycleValue(DETAIL_TABS, 'request', -1), 'diagnostics');
  assert.equal(cycleValue(DETAIL_TABS, 'diagnostics', -1), 'response');
  assert.match(text, /Auth & secrets/);
  assert.match(text, /\[bearer\] request header authorization/);
  assert.match(text, /\[session cookie\] request cookie sid/);
  assert.match(text, /\[token cookie\] response cookie ts_refresh_token/);
  assert.match(text, /\[api key\] request query api_key/);
  assert.match(text, /\[csrf\] request body csrfToken/);
  assert.equal(text.includes('opaque-secret'), false);
  assert.equal(text.includes('session-secret'), false);
  assert.equal(text.includes('response-refresh-secret'), false);
  assert.equal(text.includes('query-secret'), false);
  assert.equal(text.includes('csrf-secret'), false);
  assert.equal(matches.length, 1);
  assert.equal(findDetailMatches(rows, 'opaque-secret').length, 0);
  assert.deepEqual(getDetailLines(createDiffLog(), 'auth'), [
    'Auth & secrets',
    'No auth or secret candidates'
  ]);
});

test('auth detail rows render JWT inspector summaries and decoded rows without raw token leakage', () => {
  const now = Date.UTC(2026, 0, 1, 0, 0, 0);
  const token = createJwtToken({
    aud: 'api',
    exp: Math.floor(now / 1000) + 60,
    iss: 'https://issuer.example',
    roles: ['admin'],
    scope: 'orders:read orders:write',
    sub: 'user-123'
  }, {
    header: { alg: 'HS256', typ: 'JWT' },
    signature: 'render-secret-signature'
  });
  const log = createDiffLog({
    request: {
      headers: {
        authorization: `Bearer ${token}`
      }
    }
  });
  const rows = getDetailRows(log, 'auth', { now });
  const text = getDetailLines(log, 'auth', { now }).join('\n');

  assert.match(text, /Auth & secrets/);
  assert.match(text, /\[JWT\] request header authorization/);
  assert.match(text, /JWT Inspector/);
  assert.match(text, /request header authorization \| JWT HS256\/JWT \| unverified local decode/);
  assert.match(text, /issuer: https:\/\/issuer\.example/);
  assert.match(text, /subject: user-123/);
  assert.match(text, /scopes: orders:read, orders:write/);
  assert.match(text, /expiry: 2026-01-01T00:01:00.000Z/);
  assert.match(text, /warning: near expiry/);
  assert.match(text, /verification: signature not verified \(local decode only\)/);
  assert.match(text, /decoded header/);
  assert.match(text, /alg: "HS256"/);
  assert.match(text, /decoded payload/);
  assert.match(text, /roles: \[ 1 items/);
  assert.equal(text.includes(token), false);
  assert.equal(text.includes('render-secret-signature'), false);
  assert.equal(findDetailMatches(rows, token).length, 0);
  assert.equal(findDetailMatches(rows, 'render-secret-signature').length, 0);

  const noJwtText = getDetailLines(createDiffLog({
    request: {
      headers: {
        authorization: 'Bearer opaque-secret'
      }
    }
  }), 'auth', { now }).join('\n');

  assert.match(noJwtText, /JWT Inspector/);
  assert.match(noJwtText, /No JWT tokens found/);
  assert.equal(noJwtText.includes('opaque-secret'), false);
});

test('diagnostics detail tab renders combined diagnostics, auth, cache, and flow sections', () => {
  const log = createDiffLog({
    method: 'PATCH',
    path: '/api/v1/users/123',
    request: {
      body: JSON.stringify({ name: 'Ada' }),
      headers: {
        accept: 'application/json',
        authorization: 'Bearer opaque-secret',
        origin: 'https://app.example',
        'content-type': 'text/plain'
      }
    },
    response: {
      body: '<html>error</html>',
      headers: {
        'access-control-allow-origin': '*',
        'content-type': 'text/html'
      }
    },
    statusCode: 500
  });
  const rows = getDetailRows(log, 'diagnostics');
  const text = getDetailLines(log, 'diagnostics').join('\n');

  assert.match(text, /Diagnostics/);
  assert.match(text, /REST Action/);
  assert.match(text, /action: update user/);
  assert.match(text, /resource: user/);
  assert.match(text, /route kind: item/);
  assert.match(text, /CORS/);
  assert.match(text, /origin: https:\/\/app\.example/);
  assert.match(text, /allow origin: \*/);
  assert.match(text, /cors issue: Credential-like request cannot use Access-Control-Allow-Origin \*/);
  assert.match(text, /cors issue: Credential-like request is missing Access-Control-Allow-Credentials: true/);
  assert.match(text, /Content Negotiation/);
  assert.match(text, /accept: application\/json/);
  assert.match(text, /request content type: text\/plain/);
  assert.match(text, /response content type: text\/html/);
  assert.match(text, /content negotiation issue: JSON-preferring client received an HTML response/);
  assert.match(text, /content negotiation issue: Request body looks like JSON but Content-Type is not JSON/);
  assert.match(text, /Auth & secrets/);
  assert.match(text, /\[bearer\] request header authorization/);
  assert.match(text, /JWT Inspector/);
  assert.match(text, /No JWT tokens found/);
  assert.match(text, /Cache headers/);
  assert.match(text, /No cache headers captured/);
  assert.match(text, /Possible issues/);
  assert.match(text, /possible issue: authenticated or dynamic response has no Cache-Control header/);
  assert.match(text, /Flow context/);
  assert.match(text, /No flow context for selected request/);
  assert.equal(text.includes('opaque-secret'), false);
  assert.equal(findDetailMatches(rows, 'JSON-preferring').length > 0, true);
  assert.equal(findDetailMatches(rows, 'flow context').length > 0, true);
  assert.equal(findDetailMatches(rows, 'opaque-secret').length, 0);

  const healthyText = getDetailLines(createDiffLog({
    method: 'GET',
    path: '/api/users',
    request: {
      body: '',
      headers: {
        accept: 'application/json'
      }
    },
    response: {
      body: JSON.stringify({ ok: true }),
      headers: {
        'content-type': 'application/json'
      }
    }
  }), 'diagnostics').join('\n');

  assert.match(healthyText, /action: list users/);
  assert.match(healthyText, /cors: no issues detected/);
  assert.match(healthyText, /content negotiation: no issues detected/);
});

test('cache analyzer parses cache headers and validators', () => {
  const cacheControl = parseCacheControl('public, max-age=60, s-maxage="120", private, no-cache, no-store, immutable');

  assert.deepEqual(cacheControl.directives, {
    immutable: true,
    'max-age': '60',
    'no-cache': true,
    'no-store': true,
    private: true,
    public: true,
    's-maxage': '120'
  });
  assert.deepEqual(parseCacheAge('42'), {
    present: true,
    raw: '42',
    seconds: 42,
    valid: true
  });
  assert.deepEqual(parseCacheAge('4.2'), {
    present: true,
    raw: '4.2',
    seconds: null,
    valid: false
  });

  const analysis = analyzeCacheHeaders(createDiffLog({
    response: {
      headers: {
        age: '12',
        'cache-control': 'public, max-age=60',
        etag: 'W/"abc"',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        vary: 'Accept-Encoding, Cookie'
      }
    }
  }));
  const text = analysis.rows.map((row) => row.text).join('\n');

  assert.match(text, /Cache-Control: public, max-age=60 \| public, max-age 60s/);
  assert.match(text, /ETag: W\/"abc" \| weak validator/);
  assert.match(text, /Last-Modified: Wed, 21 Oct 2015 07:28:00 GMT \| valid/);
  assert.match(text, /Vary: Accept-Encoding, Cookie \| varies on accept-encoding, cookie/);
  assert.match(text, /Age: 12 \| 12s/);

  const invalid = analyzeCacheHeaders(createDiffLog({
    response: {
      headers: {
        age: 'soon',
        'last-modified': 'not a date'
      }
    }
  }));

  assert.deepEqual(invalid.issues.map((issue) => issue.id), ['invalid-age', 'invalid-last-modified']);
  assert.equal(formatCacheIssue(invalid.issues[0]), 'possible issue: Age header is not a valid non-negative integer');
});

test('cache analyzer flags cautious cache issues for authenticated or dynamic responses', () => {
  const authenticatedPublic = analyzeCacheHeaders(createDiffLog({
    path: '/api/me',
    request: {
      headers: {
        authorization: 'Bearer opaque-secret'
      }
    },
    response: {
      headers: {
        age: '5',
        'cache-control': 'public, max-age=120',
        'set-cookie': 'sid=response-secret; Path=/'
      }
    }
  }));
  const publicIssueIds = new Set(authenticatedPublic.issues.map((issue) => issue.id));

  assert.equal(publicIssueIds.has('sensitive-public-cache'), true);
  assert.equal(publicIssueIds.has('sensitive-browser-cache'), true);
  assert.equal(publicIssueIds.has('set-cookie-shared-cache'), true);
  assert.equal(publicIssueIds.has('cached-sensitive-response'), true);

  const shared = analyzeCacheHeaders(createDiffLog({
    path: '/api/me',
    response: {
      headers: {
        'cache-control': 's-maxage=60',
        'content-type': 'application/json'
      }
    }
  }));

  assert.equal(shared.issues.some((issue) => issue.id === 'sensitive-shared-cache'), true);

  const missing = analyzeCacheHeaders(createDiffLog({
    path: '/api/items',
    response: {
      headers: {
        'content-type': 'application/json'
      }
    }
  }));

  assert.deepEqual(missing.issues.map((issue) => issue.id), ['missing-cache-control']);

  const conflict = analyzeCacheHeaders(createDiffLog({
    path: '/assets/app.js',
    response: {
      headers: {
        'cache-control': 'no-store, public, s-maxage=60'
      }
    }
  }));

  assert.equal(conflict.issues.some((issue) => issue.id === 'conflicting-cache-control'), true);

  const safeAuthenticated = analyzeCacheHeaders(createDiffLog({
    request: {
      headers: {
        authorization: 'Bearer opaque-secret'
      }
    },
    response: {
      headers: {
        'cache-control': 'private, no-store'
      }
    }
  }));

  assert.deepEqual(safeAuthenticated.issues, []);

  const staticAsset = analyzeCacheHeaders(createDiffLog({
    path: '/assets/app.js',
    response: {
      headers: {
        age: '120',
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'application/javascript'
      }
    }
  }));

  assert.deepEqual(staticAsset.issues, []);
});

test('cache detail rows render interpreted headers and safe possible issues', () => {
  const log = createDiffLog({
    path: '/api/me?include=profile',
    request: {
      headers: {
        authorization: 'Bearer opaque-secret'
      }
    },
    response: {
      headers: {
        age: '5',
        'cache-control': 'public, max-age=120',
        'content-type': 'application/json',
        etag: 'W/"abc"',
        'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        'set-cookie': 'sid=response-secret; Path=/',
        vary: 'Accept-Encoding, Cookie'
      }
    }
  });
  const rows = getDetailRows(log, 'cache', { showCookieValues: true });
  const text = getDetailLines(log, 'cache', { showCookieValues: true }).join('\n');

  assert.match(text, /Cache headers/);
  assert.match(text, /Cache-Control: public, max-age=120 \| public, max-age 120s/);
  assert.match(text, /ETag: W\/"abc" \| weak validator/);
  assert.match(text, /Context/);
  assert.match(text, /authenticated: yes \(request auth candidate, response auth cookie\)/);
  assert.match(text, /dynamic: yes \(sets cookie, api path, application\/json, query-bearing route\)/);
  assert.match(text, /Possible issues/);
  assert.match(text, /possible issue: authenticated or dynamic response allows public caching/);
  assert.equal(text.includes('opaque-secret'), false);
  assert.equal(text.includes('response-secret'), false);
  assert.equal(findDetailMatches(rows, 'cache-control').length > 0, true);
  assert.equal(findDetailMatches(rows, 'public caching').length > 0, true);
  assert.deepEqual(getDetailLines(createDiffLog(), 'cache'), [
    'Cache headers',
    'No cache headers captured'
  ]);

  const missingHeaderText = getDetailLines(createDiffLog({
    path: '/api/items',
    response: {
      headers: {
        'content-type': 'application/json'
      }
    }
  }), 'cache').join('\n');

  assert.match(missingHeaderText, /No cache headers captured/);
  assert.match(missingHeaderText, /Possible issues/);
  assert.match(missingHeaderText, /possible issue: authenticated or dynamic response has no Cache-Control header/);
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
