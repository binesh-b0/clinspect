import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countActiveFilters,
  applyDetailMatches,
  clampDetailRowIndex,
  clampScrollOffset,
  createBlankComposerState,
  createComposerStateFromLog,
  cycleValue,
  ensureComposerActiveTabRows,
  extractPortFromHost,
  findDetailMatches,
  filterLogs,
  formatFooterText,
  formatFilterLabel,
  formatStructuredPayloadRows,
  formatRecordingLabel,
  HELP_SECTIONS,
  getBoundaryLogId,
  getComposerFieldDescriptors,
  getComposerSectionRows,
  getDetailVisibleCount,
  getDetailLines,
  getDetailRows,
  getKeyboardAction,
  getMaxScrollOffset,
  getMouseWheelTarget,
  getNextDetailMatchIndex,
  getPageStep,
  getRenderHeight,
  getScrollOffsetForFocusedRow,
  parseDetailSearchQuery,
  getSelectedIndex,
  getSearchValues,
  getTrafficVisibleCount,
  moveSelectedLogId,
  resolveSelectedLogId,
  selectComposerTab,
  toggleFilterValue
} from '../src/ui/App.js';

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
    getKeyboardAction('P', {}, { isReplayMode: false }),
    { type: 'toggleRecordingPause' }
  );
  assert.deepEqual(
    getKeyboardAction('P', {}, { isReplayMode: true }),
    { type: 'none' }
  );
  assert.deepEqual(
    getKeyboardAction('S', {}, { isReplayMode: false }),
    { type: 'stopRecording' }
  );
  assert.deepEqual(
    getKeyboardAction('S', {}, { isReplayMode: true }),
    { type: 'none' }
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
    { type: 'openComposer', mode: 'clone' }
  );
  assert.deepEqual(
    getKeyboardAction('e', {}, { isLiveMode: false }),
    { type: 'none' }
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

test('keyboard action helper supports request composer input', () => {
  assert.deepEqual(
    getKeyboardAction('a', {}, { isComposerOpen: true, isComposerTextFocused: true }),
    { type: 'insertComposerText', value: 'a' }
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
    getKeyboardAction('?', {}, { isFilterOpen: true, filterFocus: 'method' }),
    { type: 'none' }
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
    getKeyboardAction('j', {}, { isDetailModalOpen: true }),
    { type: 'scrollDetails', direction: 1 }
  );
  assert.deepEqual(
    getKeyboardAction('a', {}, { isDetailSearchOpen: true }),
    { type: 'appendDetailSearch', value: 'a' }
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

test('mouse wheel routing maps the fixed traffic pane by terminal column', () => {
  assert.equal(getMouseWheelTarget(1), 'traffic');
  assert.equal(getMouseWheelTarget(51), 'traffic');
  assert.equal(getMouseWheelTarget(52), 'details');
  assert.equal(getMouseWheelTarget(120), 'details');
});

test('getRenderHeight keeps one terminal row free for Ink updates', () => {
  assert.equal(getRenderHeight(40), 39);
  assert.equal(getRenderHeight(2), 1);
  assert.equal(getRenderHeight(undefined), 23);
});

test('footer text shows mode-aware essential keymaps', () => {
  assert.equal(
    formatFooterText({ isListFocused: true }),
    'j/k move  [/] page  enter inspect  n new  e clone  l library  tab details  P/S rec  h help  q quit'
  );
  assert.equal(
    formatFooterText({ isListFocused: false }),
    'j/k scroll  [/] page  r req/res  / find  n/N match  e clone  l library  tab traffic  P/S rec  h help'
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
    'detail search active  / edit  n/N match  j/k scroll  enter collapse  o big  tab traffic  q quit'
  );
  assert.equal(
    formatFooterText({ isListFocused: false, isDetailSearchActive: true, isDetailModalOpen: true }),
    'detail search active  / edit  n/N match  j/k scroll  enter collapse  esc/q close'
  );
  assert.equal(formatFooterText({ isHelpOpen: true }), 'help | esc/h/q close');
});

test('help sections describe starting, pausing, and stopping recording', () => {
  const captureSection = HELP_SECTIONS.find((section) => section.title === 'Capture');

  assert.deepEqual(captureSection.rows.find(([keys]) => keys === 'P'), ['P', 'start / pause recording']);
  assert.deepEqual(captureSection.rows.find(([keys]) => keys === 'S'), ['S', 'stop recording']);
});

test('help sections describe bracket page movement', () => {
  const navigationSection = HELP_SECTIONS.find((section) => section.title === 'Navigation');

  assert.deepEqual(navigationSection.rows.find(([keys]) => keys === '[ / ]'), ['[ / ]', 'move page']);
});

test('help sections describe request composer keys', () => {
  const composeSection = HELP_SECTIONS.find((section) => section.title === 'Compose');

  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'n'), ['n', 'new request']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'e'), ['e', 'clone request']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'l'), ['l', 'saved requests']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === '1 params'), ['1 params', 'open params']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === '3 body'), ['3 body', 'open body']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === '4 auth'), ['4 auth', 'open auth']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'a/d'), ['a/d', 'add / delete row']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'enter'), ['enter', 'preview request']);
  assert.deepEqual(composeSection.rows.find(([keys]) => keys === 'enter/y'), ['enter/y', 'confirm send']);
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
  assert.equal(cloned.source, 'clone');

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
