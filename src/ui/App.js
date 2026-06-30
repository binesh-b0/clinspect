import React, { useEffect, useMemo, useState } from 'react';
import { Box, useStdin } from 'ink';
import {
  createManualRequestDraftFromLog,
  normalizeManualResendMetadata,
  normalizeManualRequestDraft
} from '../engine/manual-request.js';
import { createNextPageRequestDraftFromLog } from '../pagination.js';
import {
  copyTextToClipboard,
  createTrafficExport,
  resolveTrafficExportTarget,
  writeTrafficExportFile
} from '../export/traffic-export.js';
import { getProxyOrigin } from '../target.js';
import {
  DEFAULT_TRAFFIC_LIST_DISPLAY,
  DETAIL_TABS,
  DETAIL_SEARCH_BAR_HEIGHT,
  FILTER_FOCUS_ORDER,
  LIST_DISPLAY_FOCUS_ORDER,
  METHOD_OPTIONS,
  RESEND_CONFIRM_BAR_HEIGHT,
  ROOT_PADDING_X,
  SEARCH_FIELDS,
  STATUS_OPTIONS,
  getRenderHeight,
  h
} from './shared.js';
import {
  Header,
  TrafficList,
  FilterBar,
  cyclePaneWidthMode,
  cycleTrafficDensity,
  cycleTrafficPathMode,
  cycleValue,
  filterLogs,
  getPaneLayout,
  getRecordingStatus,
  getSelectedIndex,
  moveSelectedLogId,
  normalizeTrafficListDisplay,
  resolveSelectedLogId,
  summarizeFrameworkAssets,
  toggleFilterValue,
  toggleTrafficColumn
} from './traffic.js';
import {
  DetailModal,
  DetailPane,
  DetailSearchBar,
  applyDetailMatches,
  clampDetailRowIndex,
  findDetailMatches,
  getBoundaryLogId,
  getDetailModalVisibleCount,
  getDetailRows,
  getDetailVisibleCount,
  getMaxScrollOffset,
  getNextDetailMatchIndex,
  getTrafficVisibleCount,
  getScrollOffsetForFocusedRow
} from './detail.js';
import {
  RequestComposerPanel,
  addComposerRow,
  backspaceComposerText,
  createBlankComposerState,
  createComposerStateFromLog,
  cycleComposerTab,
  cycleFocusedComposerOption,
  deleteComposerRow,
  deleteComposerText,
  ensureComposerActiveTabRows,
  flattenRequestLibrary,
  getFocusedComposerDescriptor,
  getPathValue,
  insertComposerText,
  moveComposerCursor,
  moveComposerCursorTo,
  moveComposerFocus,
  selectComposerTab,
  toggleFocusedComposerField
} from './composer.js';
import {
  CommandModal,
  Footer,
  HelpModal,
  ListDisplayModal,
  ResendConfirmBar
} from './chrome.js';
import {
  KeyboardControls,
  getCommandSuggestionIndex,
  resolveCommandInput
} from './commands.js';
import { normalizeKeyBindings } from './key-bindings.js';

export {
  analyzePagination,
  createNextPageRequestDraftFromLog
} from '../pagination.js';
export {
  DEFAULT_TRAFFIC_LIST_DISPLAY,
  getRenderHeight
} from './shared.js';
export {
  applyTrafficDensity,
  classifyFrameworkAssetRequest,
  countActiveFilters,
  cycleDetailWidthMode,
  cyclePaneWidthMode,
  cycleTrafficDensity,
  cycleTrafficPathMode,
  cycleTrafficWidthMode,
  cycleValue,
  extractPortFromHost,
  filterLogs,
  formatFilterLabel,
  formatFrameworkDetectionLabel,
  formatPathForMode,
  formatRecordingLabel,
  formatTrafficHeader,
  formatTrafficRow,
  getMouseWheelTarget,
  getPaneLayout,
  getSearchValues,
  getSelectedIndex,
  getTrafficPaneWidth,
  getTrafficRowWidth,
  isFrameworkAssetRequest,
  moveSelectedLogId,
  normalizeTrafficListDisplay,
  resolveSelectedLogId,
  summarizeFrameworkAssets,
  toggleFilterValue,
  toggleTrafficColumn
} from './traffic.js';
export {
  applyDetailMatches,
  clampDetailRowIndex,
  clampScrollOffset,
  findDetailMatches,
  formatStructuredPayloadRows,
  getBoundaryLogId,
  getDetailModalVisibleCount,
  getDetailLines,
  getDetailRows,
  getDetailVisibleCount,
  getMaxScrollOffset,
  getNextDetailMatchIndex,
  getPageStep,
  getScrollOffsetForFocusedRow,
  getTrafficVisibleCount,
  parseDetailSearchQuery
} from './detail.js';
export {
  createBlankComposerState,
  createComposerStateFromLog,
  ensureComposerActiveTabRows,
  getComposerFieldDescriptors,
  getComposerSectionRows,
  selectComposerTab
} from './composer.js';
export {
  COMMAND_DEFINITIONS,
  formatCommandSelectionStatus,
  getCommandHintForKey,
  getCommandMatches,
  getCommandSuggestionIndex,
  getCommandSuggestionRows,
  getKeyboardAction,
  resolveCommandInput
} from './commands.js';
export {
  HELP_SECTIONS,
  formatFooterText,
  formatPaneWidthLabel,
  getHelpSections,
  getCommandHelpRows
} from './chrome.js';
export {
  DEFAULT_KEY_BINDINGS,
  getBindingLabel,
  matchesKeyBinding,
  normalizeKeyBindings
} from './key-bindings.js';

export function App({
  stateStore,
  context = {},
  captureController = null,
  manualRequestStore = null,
  manualRequestSender = null,
  trafficRecorder = null,
  keyBindings: keyBindingInput = null,
  keyBindingWarnings = [],
  onQuit = () => {}
}) {
  const { isRawModeSupported } = useStdin();
  const renderHeight = getRenderHeight();
  const [logs, setLogs] = useState(() => stateStore.getLogs());
  const [recordingStatus, setRecordingStatus] = useState(() => getRecordingStatus(trafficRecorder));
  const [selectedLogId, setSelectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [inspectedLogId, setInspectedLogId] = useState(() => {
    const initialLogs = stateStore.getLogs();

    return initialLogs[initialLogs.length - 1]?.id ?? null;
  });
  const [isFollowingLatest, setIsFollowingLatest] = useState(false);
  const [isListFocused, setIsListFocused] = useState(true);
  const [isPaused, setIsPaused] = useState(() => captureController?.isPaused?.() ?? false);
  const [methodFilters, setMethodFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [searchField, setSearchField] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filterFocus, setFilterFocus] = useState('query');
  const [methodOptionIndex, setMethodOptionIndex] = useState(0);
  const [statusOptionIndex, setStatusOptionIndex] = useState(0);
  const [detailTab, setDetailTab] = useState('request');
  const [detailScrollOffset, setDetailScrollOffset] = useState(0);
  const [focusedDetailRow, setFocusedDetailRow] = useState(0);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailSearchQuery, setDetailSearchQuery] = useState('');
  const [isDetailSearchOpen, setIsDetailSearchOpen] = useState(false);
  const [detailMatchIndex, setDetailMatchIndex] = useState(0);
  const [collapsedDetailPaths, setCollapsedDetailPaths] = useState([]);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isListDisplayOpen, setIsListDisplayOpen] = useState(false);
  const [listDisplayFocusIndex, setListDisplayFocusIndex] = useState(0);
  const [trafficListDisplay, setTrafficListDisplay] = useState(() => normalizeTrafficListDisplay(DEFAULT_TRAFFIC_LIST_DISPLAY));
  const [hideFrameworkAssets, setHideFrameworkAssets] = useState(() => context.hideFrameworkAssets !== false);
  const [pendingExport, setPendingExport] = useState(null);
  const [exportStatus, setExportStatus] = useState('');
  const [pendingResend, setPendingResend] = useState(null);
  const [resendStatus, setResendStatus] = useState('');
  const [commandState, setCommandState] = useState({
    input: '',
    isOpen: false,
    selectedIndex: -1,
    status: ''
  });
  const [isResending, setIsResending] = useState(false);
  const [manualLibrary, setManualLibrary] = useState(() => manualRequestStore?.getLibrary?.() ?? {
    schemaVersion: 1,
    requests: [],
    environment: [],
    warning: null
  });
  const [composer, setComposer] = useState(() => ({
    ...createBlankComposerState({
      environment: manualRequestStore?.getLibrary?.().environment ?? []
    }),
    isOpen: false
  }));
  const isReplayMode = context.mode === 'replay';
  const isLiveMode = context.mode === 'live';
  const showCookieValues = Boolean(context.showCookieValues);
  const proxyOrigin = getProxyOrigin(context.port ?? 8080);
  const publicTargetUrl = context.mode === 'live' ? context.targetUrl : null;
  const keyBindings = useMemo(() => {
    if (keyBindingInput?.bindings) {
      return keyBindingInput.bindings;
    }

    return normalizeKeyBindings(keyBindingInput ? { keyBindings: keyBindingInput } : undefined).bindings;
  }, [keyBindingInput]);
  const historyStatus = stateStore.getHistoryStatus?.() ?? {
    coldEntries: 0,
    enabled: false,
    hotEntries: logs.length,
    totalEntries: logs.length
  };
  const frameworkSummary = useMemo(() => summarizeFrameworkAssets(logs), [logs]);
  const paneLayout = getPaneLayout(trafficListDisplay);
  const trafficPaneWidth = paneLayout.trafficPaneWidth;

  const filteredLogs = useMemo(() => filterLogs(logs, {
    hideFrameworkAssets,
    methodFilters,
    searchField,
    searchQuery,
    showCookieValues,
    statusFilters
  }), [hideFrameworkAssets, logs, methodFilters, searchField, searchQuery, showCookieValues, statusFilters]);

  useEffect(() => {
    const handleUpdate = (updatedLogs) => setLogs(updatedLogs);

    stateStore.on('update', handleUpdate);

    return () => stateStore.off('update', handleUpdate);
  }, [stateStore]);

  useEffect(() => {
    setRecordingStatus(getRecordingStatus(trafficRecorder));

    const handleRecordingStatus = (status) => setRecordingStatus(status);

    trafficRecorder?.on?.('status', handleRecordingStatus);

    return () => trafficRecorder?.off?.('status', handleRecordingStatus);
  }, [trafficRecorder]);

  useEffect(() => {
    const resolveOptions = { followLatest: isFollowingLatest };

    setSelectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
    setInspectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
  }, [filteredLogs, isFollowingLatest]);

  useEffect(() => {
    setDetailScrollOffset(0);
    setFocusedDetailRow(0);
    setDetailMatchIndex(0);
  }, [inspectedLogId, detailTab]);

  const selectedIndex = useMemo(() => getSelectedIndex(filteredLogs, selectedLogId), [filteredLogs, selectedLogId]);
  const selectedLog = useMemo(() => filteredLogs[selectedIndex] ?? null, [filteredLogs, selectedIndex]);
  const hydrateLog = (log) => {
    if (!log?.id) {
      return log;
    }

    return stateStore.getLogById?.(log.id) ?? log;
  };
  const inspectedLog = useMemo(() => {
    return hydrateLog(filteredLogs.find((log) => log.id === inspectedLogId) ?? selectedLog);
  }, [filteredLogs, inspectedLogId, selectedLog, stateStore]);
  const rawDetailRows = useMemo(
    () => getDetailRows(inspectedLog, detailTab, {
      collapsedPaths: collapsedDetailPaths,
      publicTargetUrl,
      proxyOrigin,
      showCookieValues
    }),
    [collapsedDetailPaths, detailTab, inspectedLog, publicTargetUrl, proxyOrigin, showCookieValues]
  );
  const detailMatches = useMemo(
    () => findDetailMatches(rawDetailRows, detailSearchQuery),
    [detailSearchQuery, rawDetailRows]
  );
  const detailRows = useMemo(
    () => applyDetailMatches(rawDetailRows, detailMatches, detailMatchIndex),
    [detailMatchIndex, detailMatches, rawDetailRows]
  );
  const bottomOffset = isFilterOpen
    ? 19
    : (pendingResend
      ? 13 + RESEND_CONFIRM_BAR_HEIGHT
      : (isDetailSearchOpen ? 13 + DETAIL_SEARCH_BAR_HEIGHT : 13));
  const trafficVisibleCount = getTrafficVisibleCount(bottomOffset);
  const detailVisibleCount = getDetailVisibleCount(bottomOffset);
  const detailModalVisibleCount = getDetailModalVisibleCount(isDetailSearchOpen ? 11 + DETAIL_SEARCH_BAR_HEIGHT : 11);
  const activeDetailVisibleCount = isDetailModalOpen ? detailModalVisibleCount : detailVisibleCount;
  const maxDetailScrollOffset = getMaxScrollOffset(detailRows, activeDetailVisibleCount);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : (isReplayMode ? 'No recorded traffic' : 'Waiting for traffic...');
  const keyBindingStatus = keyBindingWarnings.length > 0
    ? `key bindings: ${keyBindingWarnings[0]}${keyBindingWarnings.length > 1 ? ` (+${keyBindingWarnings.length - 1} more)` : ''}`
    : '';

  useEffect(() => {
    setDetailScrollOffset((current) => Math.min(current, maxDetailScrollOffset));
  }, [maxDetailScrollOffset]);

  useEffect(() => {
    setFocusedDetailRow((current) => clampDetailRowIndex(current, detailRows));
  }, [detailRows]);

  useEffect(() => {
    setDetailMatchIndex((current) => detailMatches.length === 0
      ? 0
      : Math.min(current, detailMatches.length - 1));
  }, [detailMatches]);

  useEffect(() => {
    if (!detailSearchQuery.trim() || detailMatches.length === 0) {
      return;
    }

    const activeRow = detailMatches[Math.min(detailMatchIndex, detailMatches.length - 1)];

    setFocusedDetailRow(activeRow);
    setDetailScrollOffset((current) => getScrollOffsetForFocusedRow(
      activeRow,
      current,
      activeDetailVisibleCount,
      maxDetailScrollOffset
    ));
  }, [activeDetailVisibleCount, detailMatchIndex, detailMatches, detailSearchQuery, maxDetailScrollOffset]);

  const clearFilters = () => {
    setMethodFilters([]);
    setStatusFilters([]);
    setSearchField('all');
    setSearchQuery('');
    setFilterFocus('query');
    setMethodOptionIndex(0);
    setStatusOptionIndex(0);
    setIsFollowingLatest(false);
  };

  const cyclePaneWidth = (direction) => {
    const nextDisplay = cyclePaneWidthMode(trafficListDisplay, isListFocused, direction);
    const nextLayout = getPaneLayout(nextDisplay);

    setTrafficListDisplay(nextDisplay);

    if (!nextLayout.showDetailPane) {
      setIsListFocused(true);
    } else if (!nextLayout.showTrafficPane) {
      setIsListFocused(false);
    }
  };

  const closeCommandPrompt = () => {
    setCommandState({
      input: '',
      isOpen: false,
      selectedIndex: -1,
      status: ''
    });
  };

  const openCommandPrompt = () => {
    setCommandState({
      input: '',
      isOpen: true,
      selectedIndex: -1,
      status: ''
    });
  };

  const showCommandHint = (message) => {
    setCommandState({
      input: '',
      isOpen: false,
      selectedIndex: -1,
      status: message || 'press : for commands'
    });
  };

  const appendCommandText = (value) => {
    setCommandState((current) => ({
      ...current,
      input: `${current.input}${value}`,
      selectedIndex: -1,
      status: ''
    }));
  };

  const backspaceCommandText = () => {
    setCommandState((current) => ({
      ...current,
      input: current.input.slice(0, -1),
      selectedIndex: -1,
      status: ''
    }));
  };

  const cycleCommandSuggestion = (direction) => {
    setCommandState((current) => ({
      ...current,
      selectedIndex: getCommandSuggestionIndex(current.input, current.selectedIndex, direction),
      status: ''
    }));
  };

  const clearLogs = () => {
    stateStore.clear();
    setSelectedLogId(null);
    setInspectedLogId(null);
    setIsFollowingLatest(false);
    setDetailScrollOffset(0);
    setFocusedDetailRow(0);
  };

  const stopRecording = () => {
    const result = trafficRecorder?.stopRecording?.();

    Promise.resolve(result)
      .catch(() => {})
      .finally(() => setRecordingStatus(getRecordingStatus(trafficRecorder)));
  };

  const toggleCapturePause = () => {
    setIsPaused((current) => {
      const next = !current;
      captureController?.setPaused?.(next);
      return next;
    });
  };

  const toggleRecordingPause = () => {
    trafficRecorder?.togglePaused?.();
    setRecordingStatus(getRecordingStatus(trafficRecorder));
  };

  const closeCompletedCommand = (status = '') => {
    setCommandState({
      input: '',
      isOpen: false,
      selectedIndex: -1,
      status
    });
  };

  const runCommandAction = (resolvedCommand) => {
    const { action, command } = resolvedCommand;
    const completedStatus = `ran :${command.name}`;

    switch (action.type) {
      case 'clearLogs':
        clearLogs();
        closeCompletedCommand(completedStatus);
        break;
      case 'openHelp':
        closeCompletedCommand('');
        setIsHelpOpen(true);
        break;
      case 'quit':
        closeCompletedCommand('');
        onQuit();
        break;
      case 'startResend':
        closeCompletedCommand('');
        startResend(action.mode);
        break;
      case 'openNextPage':
        closeCompletedCommand('');
        openNextPageComposer();
        break;
      case 'stopRecording':
        if (isReplayMode) {
          closeCompletedCommand('recording unavailable in replay mode');
          break;
        }
        stopRecording();
        closeCompletedCommand(completedStatus);
        break;
      case 'togglePause':
        if (isReplayMode) {
          closeCompletedCommand('capture control unavailable in replay mode');
          break;
        }
        toggleCapturePause();
        closeCompletedCommand(completedStatus);
        break;
      case 'toggleRecordingPause':
        if (isReplayMode) {
          closeCompletedCommand('recording unavailable in replay mode');
          break;
        }
        toggleRecordingPause();
        closeCompletedCommand(completedStatus);
        break;
      default:
        setCommandState((current) => ({
          ...current,
          status: `unsupported command action: ${action.type}`
        }));
    }
  };

  const submitCommand = () => {
    const resolved = resolveCommandInput(commandState.input, commandState.selectedIndex);

    if (!resolved.ok) {
      setCommandState((current) => ({
        ...current,
        status: resolved.error
      }));
      return;
    }

    runCommandAction(resolved);
  };

  const focusDetailRowAt = (rowIndex) => {
    const safeRowIndex = clampDetailRowIndex(rowIndex, detailRows);

    setFocusedDetailRow(safeRowIndex);
    setDetailScrollOffset((current) => getScrollOffsetForFocusedRow(
      safeRowIndex,
      current,
      activeDetailVisibleCount,
      maxDetailScrollOffset
    ));
  };

  const moveDetailFocus = (direction) => {
    focusDetailRowAt(focusedDetailRow + direction);
  };

  const moveDetailMatch = (direction) => {
    if (detailMatches.length === 0) {
      return;
    }

    const nextMatchIndex = getNextDetailMatchIndex(detailMatches, detailMatchIndex, direction);

    setDetailMatchIndex(nextMatchIndex);
    focusDetailRowAt(detailMatches[nextMatchIndex]);
  };

  const toggleFocusedDetailNode = () => {
    const row = detailRows[focusedDetailRow] ?? detailRows[detailScrollOffset];

    if (!row?.collapsible || !row.path) {
      return;
    }

    setCollapsedDetailPaths((current) => {
      return current.includes(row.path)
        ? current.filter((path) => path !== row.path)
        : [...current, row.path];
    });
  };

  const moveListDisplayFocus = (direction) => {
    setListDisplayFocusIndex((current) => (
      (current + direction + LIST_DISPLAY_FOCUS_ORDER.length) % LIST_DISPLAY_FOCUS_ORDER.length
    ));
  };

  const cycleFocusedListDisplayOption = (direction) => {
    const focusKey = LIST_DISPLAY_FOCUS_ORDER[listDisplayFocusIndex];

    if (focusKey === 'pathMode') {
      setTrafficListDisplay((current) => cycleTrafficPathMode(current, direction));
    }

    if (focusKey === 'density') {
      setTrafficListDisplay((current) => cycleTrafficDensity(current, direction));
    }

    if (focusKey === 'widthMode') {
      cyclePaneWidth(direction);
    }
  };

  const toggleFrameworkAssets = () => {
    setHideFrameworkAssets((current) => !current);
    setIsFollowingLatest(false);
  };

  const toggleFocusedListDisplayColumn = () => {
    const focusKey = LIST_DISPLAY_FOCUS_ORDER[listDisplayFocusIndex];

    if (focusKey === 'pathMode' || focusKey === 'density' || focusKey === 'widthMode') {
      return;
    }

    if (focusKey === 'frameworkAssets') {
      toggleFrameworkAssets();
      return;
    }

    setTrafficListDisplay((current) => toggleTrafficColumn(current, focusKey));
  };

  const openListDisplay = () => {
    setIsListDisplayOpen(true);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const getExportLog = () => {
    return isListFocused && !isDetailModalOpen ? hydrateLog(selectedLog) : inspectedLog;
  };

  const getManualActionLog = () => {
    return isListFocused && !isDetailModalOpen ? hydrateLog(selectedLog) : inspectedLog;
  };

  const attachResendMetadata = (logEntry, metadata) => {
    const resend = normalizeManualResendMetadata(metadata);

    return resend ? { ...logEntry, resend } : logEntry;
  };

  const commitManualLog = (logEntry, metadata) => {
    const addedLog = stateStore.addLog(attachResendMetadata(logEntry, metadata));

    clearFilters();
    setSelectedLogId(addedLog.id);
    setInspectedLogId(addedLog.id);
    setIsFollowingLatest(false);
    setIsListFocused(false);
    setDetailTab('response');
    setDetailScrollOffset(0);
    setFocusedDetailRow(0);
    setDetailMatchIndex(0);

    return addedLog;
  };

  const startTrafficExport = (action) => {
    const exportLog = getExportLog();
    const exportIsListFocused = isListFocused && !isDetailModalOpen;
    const target = resolveTrafficExportTarget({
      detailRows,
      detailTab,
      focusedRow: focusedDetailRow,
      isListFocused: exportIsListFocused,
      log: exportLog
    });

    if (!target) {
      setPendingExport(null);
      setExportStatus('export unavailable');
      return;
    }

    setPendingExport({
      action,
      log: exportLog,
      target
    });
    setExportStatus(`${action === 'copy' ? 'copy' : 'download'} ${target.label ?? target.kind}`);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
  };

  const formatSavedExportPath = (filePath) => {
    const cwd = `${process.cwd()}/`;

    return String(filePath).startsWith(cwd)
      ? String(filePath).slice(cwd.length)
      : String(filePath);
  };

  const finishTrafficExport = (secretPolicy) => {
    if (!pendingExport) {
      return;
    }

    try {
      const exportData = createTrafficExport({
        context: {
          publicTargetUrl,
          proxyOrigin
        },
        log: pendingExport.log,
        secretPolicy,
        target: pendingExport.target
      });

      if (pendingExport.action === 'copy') {
        copyTextToClipboard(exportData.content, { stdout: process.stdout });
        setExportStatus(`copied ${exportData.label}`);
      } else {
        const result = writeTrafficExportFile(exportData);

        setExportStatus(`saved ${formatSavedExportPath(result.path)}`);
      }
    } catch (error) {
      setExportStatus(`export failed: ${error?.message ?? String(error)}`);
    } finally {
      setPendingExport(null);
    }
  };

  const cancelTrafficExport = () => {
    setPendingExport(null);
    setExportStatus('export cancelled');
  };

  const openComposer = (mode) => {
    if (!isLiveMode) {
      setResendStatus('resend unavailable in replay mode');
      return;
    }

    const isEditResend = mode === 'edit-resend' || mode === 'clone';

    if (isEditResend && typeof manualRequestSender !== 'function') {
      setResendStatus('manual sender unavailable');
      return;
    }

    if (isEditResend) {
      const sourceLog = getManualActionLog();

      if (!sourceLog) {
        setResendStatus('no request selected');
        return;
      }

      setComposer(createComposerStateFromLog(sourceLog, {
        environment: manualLibrary.environment,
        includeCookieHeaders: showCookieValues
      }));
    } else {
      setComposer(createBlankComposerState({ environment: manualLibrary.environment }));
    }

    setPendingResend(null);
    setResendStatus('');
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
  };

  const openComposerLibrary = () => {
    if (!isLiveMode) {
      return;
    }

    setManualLibrary(manualRequestStore?.getLibrary?.() ?? manualLibrary);
    setComposer((current) => ({
      ...(current.isOpen ? current : createBlankComposerState({ environment: manualLibrary.environment })),
      isConfirmOpen: false,
      isLibraryOpen: true,
      isOpen: true,
      isSending: false,
      libraryIndex: 0
    }));
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
  };

  const openNextPageComposer = () => {
    if (!isLiveMode) {
      setResendStatus('next page unavailable in replay mode');
      return;
    }

    if (typeof manualRequestSender !== 'function') {
      setResendStatus('manual sender unavailable');
      return;
    }

    const sourceLog = getManualActionLog();

    if (!sourceLog) {
      setResendStatus('no request selected');
      return;
    }

    const plan = createNextPageRequestDraftFromLog(sourceLog, {
      environment: manualLibrary.environment
    });

    if (!plan) {
      setResendStatus('no next page detected');
      return;
    }

    setComposer(ensureComposerActiveTabRows({
      ...createBlankComposerState({ environment: manualLibrary.environment }),
      cursor: plan.draft.url.length,
      draft: plan.draft,
      error: plan.blockers?.[0] ?? '',
      resend: plan.resend,
      source: 'next-page',
      status: plan.pagination?.nextRequest?.source === 'link'
        ? 'next page from Link header'
        : 'next page from query params',
      warnings: [...(plan.blockers ?? []), ...(plan.warnings ?? [])]
    }));
    setPendingResend(null);
    setResendStatus('');
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
  };

  const sendResendPlan = (plan) => {
    if (!plan || isResending || composer.isSending) {
      return;
    }

    if (!isLiveMode) {
      setResendStatus('resend unavailable in replay mode');
      return;
    }

    if (typeof manualRequestSender !== 'function') {
      setResendStatus('manual sender unavailable');
      return;
    }

    if ((plan.blockers ?? []).length > 0) {
      setResendStatus(`edit required: ${plan.blockers[0]}`);
      return;
    }

    setIsResending(true);
    setResendStatus(`resending ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`);

    Promise.resolve()
      .then(() => manualRequestSender({
        ...plan.draft,
        resend: plan.resend
      }))
      .then((logEntry) => {
        commitManualLog(logEntry, plan.resend);
        setPendingResend(null);
        setResendStatus(`resent ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`);
      })
      .catch((error) => {
        setResendStatus(`resend failed: ${error?.message ?? String(error)}`);
      })
      .finally(() => {
        setIsResending(false);
      });
  };

  const startResend = () => {
    if (!isLiveMode) {
      setResendStatus('resend unavailable in replay mode');
      return;
    }

    if (composer.isSending || isResending) {
      return;
    }

    if (typeof manualRequestSender !== 'function') {
      setResendStatus('manual sender unavailable');
      return;
    }

    const sourceLog = getManualActionLog();

    if (!sourceLog) {
      setResendStatus('no request selected');
      return;
    }

    const plan = createManualRequestDraftFromLog(sourceLog, {
      action: 'resend',
      environment: manualLibrary.environment
    });

    if ((plan.blockers ?? []).length > 0 || plan.requiresConfirmation) {
      setPendingResend(plan);
      setResendStatus((plan.blockers ?? []).length > 0 ? 'edit required before resend' : 'confirm resend');
      setIsFilterOpen(false);
      setIsDetailSearchOpen(false);
      setIsHelpOpen(false);
      setIsListDisplayOpen(false);
      return;
    }

    setPendingResend(null);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    sendResendPlan(plan);
  };

  const editPendingResend = () => {
    if (!pendingResend) {
      return;
    }

    setComposer(ensureComposerActiveTabRows({
      ...createBlankComposerState({ environment: manualLibrary.environment }),
      cursor: pendingResend.draft.url.length,
      draft: pendingResend.draft,
      error: pendingResend.blockers?.[0] ?? '',
      resend: normalizeManualResendMetadata({
        ...pendingResend.resend,
        action: 'edit-resend'
      }),
      source: 'edit-resend',
      status: pendingResend.warnings?.[0] ?? '',
      warnings: [...(pendingResend.blockers ?? []), ...(pendingResend.warnings ?? [])]
    }));
    setPendingResend(null);
    setResendStatus('');
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
  };

  const cancelResend = () => {
    setPendingResend(null);
    setResendStatus('resend cancelled');
  };

  const saveComposerRequest = () => {
    if (!composer.isOpen) {
      return;
    }

    const draft = normalizeManualRequestDraft({
      ...composer.draft,
      collection: composer.draft.collection || 'Default',
      name: composer.draft.name || `${composer.draft.method} ${composer.draft.url}`
    });

    try {
      const nextLibrary = manualRequestStore?.saveDraft?.(draft, {
        environment: composer.draft.environment
      }) ?? {
        ...manualLibrary,
        environment: composer.draft.environment,
        requests: [
          ...manualLibrary.requests.filter((request) => request.id !== draft.id),
          {
            ...draft,
            updatedAt: new Date().toISOString()
          }
        ],
        warning: null
      };

      setManualLibrary(nextLibrary);
      setComposer((current) => ({
        ...current,
        draft,
        error: '',
        status: `saved ${draft.name || draft.url}`
      }));
    } catch (error) {
      setComposer((current) => ({
        ...current,
        error: error?.message ?? String(error)
      }));
    }
  };

  const loadComposerLibraryRequest = () => {
    const requests = flattenRequestLibrary(manualLibrary);
    const selectedRequest = requests[Math.max(0, Math.min(requests.length - 1, composer.libraryIndex))];

    if (!selectedRequest) {
      return;
    }

    setComposer(() => {
      const draft = normalizeManualRequestDraft({
        ...selectedRequest,
        environment: manualLibrary.environment
      });

      return ensureComposerActiveTabRows({
        ...createBlankComposerState({ environment: manualLibrary.environment }),
        cursor: draft.url.length,
        draft,
        isLibraryOpen: false,
        source: 'library'
      });
    });
  };

  const sendComposer = () => {
    if (!composer.isOpen || composer.isSending || isResending || !isLiveMode || typeof manualRequestSender !== 'function') {
      return;
    }

    const resend = composer.resend
      ? normalizeManualResendMetadata({
        ...composer.resend,
        action: 'edit-resend'
      })
      : null;

    setComposer((current) => ({
      ...current,
      error: '',
      isConfirmOpen: false,
      isSending: true
    }));

    Promise.resolve()
      .then(() => manualRequestSender(resend ? {
        ...composer.draft,
        resend
      } : composer.draft))
      .then((logEntry) => {
        commitManualLog(logEntry, resend);
        setComposer((current) => ({
          ...current,
          isConfirmOpen: false,
          isOpen: false,
          isSending: false
        }));
      })
      .catch((error) => {
        setComposer((current) => ({
          ...current,
          error: error?.message ?? String(error),
          isConfirmOpen: false,
          isSending: false
        }));
      });
  };

  const trafficListNode = h(TrafficList, {
    key: 'traffic',
    bottomOffset,
    emptyText,
    logs: filteredLogs,
    totalCount: logs.length,
    selectedIndex,
    isFocused: isListFocused,
    isFollowingLatest,
    frameworkSummary,
    historyStatus,
    hideFrameworkAssets,
    listDisplay: trafficListDisplay,
    marginRight: paneLayout.showTrafficPane && paneLayout.showDetailPane ? paneLayout.gapWidth : 0,
    methodFilters,
    paneWidth: paneLayout.trafficPaneWidth,
    searchField,
    statusFilters,
    searchQuery
  });

  const detailPaneNode = h(DetailPane, {
    key: 'details',
    bottomOffset,
    log: inspectedLog,
    isFocused: !isListFocused,
    detailTab,
    focusedRow: focusedDetailRow,
    rows: detailRows,
    scrollOffset: detailScrollOffset,
    matchCount: detailMatches.length,
    activeMatchIndex: detailMatchIndex,
    paneWidth: paneLayout.detailPaneWidth
  });
  const paneNodes = [
    paneLayout.showTrafficPane ? trafficListNode : null,
    paneLayout.showDetailPane ? detailPaneNode : null
  ].filter(Boolean);

  return h(
    Box,
    {
      flexDirection: 'column',
      height: renderHeight,
      paddingX: ROOT_PADDING_X
    },
    isRawModeSupported
      ? h(KeyboardControls, {
        filterFocus,
        isListFocused,
        isHelpOpen,
        isListDisplayOpen,
        isFilterOpen,
        isDetailSearchOpen,
        isDetailModalOpen,
        isCommandOpen: commandState.isOpen,
        isExportPromptOpen: Boolean(pendingExport),
        isResendConfirmOpen: Boolean(pendingResend),
        isResending,
        isReplayMode,
        isLiveMode,
        isComposerOpen: composer.isOpen,
        isComposerSending: composer.isSending,
        isComposerConfirmOpen: composer.isConfirmOpen,
        isComposerBodyEditorOpen: composer.isBodyEditorOpen,
        isComposerLibraryOpen: composer.isLibraryOpen,
        isComposerTextFocused: getFocusedComposerDescriptor(composer)?.kind === 'text',
        keyBindings,
        detailPageSize: activeDetailVisibleCount,
        showTrafficPane: paneLayout.showTrafficPane,
        trafficPaneWidth,
        trafficPageSize: trafficVisibleCount,
        onAddComposerRow: () => setComposer(addComposerRow),
        onAppendCommandText: appendCommandText,
        onAppendDetailSearch: (value) => {
          setDetailSearchQuery((current) => `${current}${value}`);
          setDetailMatchIndex(0);
        },
        onAppendSearch: (value) => {
          setSearchQuery((current) => `${current}${value}`);
          setIsFollowingLatest(false);
        },
        onBackspaceDetailSearch: () => {
          setDetailSearchQuery((current) => current.slice(0, -1));
          setDetailMatchIndex(0);
        },
        onBackspaceCommandText: backspaceCommandText,
        onBackspaceComposerText: () => setComposer(backspaceComposerText),
        onBackspaceSearch: () => {
          setSearchQuery((current) => current.slice(0, -1));
          setIsFollowingLatest(false);
        },
        onCancelExport: cancelTrafficExport,
        onCancelResend: cancelResend,
        onClearFilters: clearFilters,
        onClearLogs: clearLogs,
        onCloseDetailModal: () => setIsDetailModalOpen(false),
        onCloseComposer: () => {
          setComposer((current) => ({
            ...current,
            isBodyEditorOpen: false,
            isConfirmOpen: false,
            isLibraryOpen: false,
            isOpen: false,
            isSending: false
          }));
        },
        onCloseComposerBodyEditor: () => {
          setComposer((current) => ({
            ...current,
            isBodyEditorOpen: false
          }));
        },
        onCloseCommandPrompt: closeCommandPrompt,
        onCloseComposerLibrary: () => {
          setComposer((current) => ({
            ...current,
            isLibraryOpen: false
          }));
        },
        onCloseComposerPreview: () => {
          setComposer((current) => ({
            ...current,
            isConfirmOpen: false
          }));
        },
        onCloseHelp: () => setIsHelpOpen(false),
        onCloseListDisplay: () => setIsListDisplayOpen(false),
        onCycleComposerFocus: (direction) => setComposer((current) => moveComposerFocus(current, direction)),
        onCycleComposerTab: (direction) => setComposer((current) => cycleComposerTab(current, direction)),
        onCycleCommandSuggestion: cycleCommandSuggestion,
        onCycleListDisplayOption: cycleFocusedListDisplayOption,
        onCyclePaneWidthMode: cyclePaneWidth,
        onCycleTrafficDensity: (direction) => setTrafficListDisplay((current) => cycleTrafficDensity(current, direction)),
        onCycleTrafficPathMode: (direction) => setTrafficListDisplay((current) => cycleTrafficPathMode(current, direction)),
        onDeleteComposerRow: () => setComposer(deleteComposerRow),
        onDeleteComposerText: () => setComposer(deleteComposerText),
        onCycleFilterFocus: (direction) => {
          setFilterFocus((current) => cycleValue(FILTER_FOCUS_ORDER, current, direction));
          setIsFollowingLatest(false);
        },
        onFinishExport: finishTrafficExport,
        onFinishDetailSearch: () => setIsDetailSearchOpen(false),
        onFinishSearch: () => setIsFilterOpen(false),
        onQuit,
        onEditPendingResend: editPendingResend,
        onInsertComposerText: (value) => setComposer((current) => insertComposerText(current, value)),
        onLoadComposerLibraryRequest: loadComposerLibraryRequest,
        onToggleFocus: () => setIsListFocused((current) => {
          if (!paneLayout.showDetailPane) {
            return true;
          }

          if (!paneLayout.showTrafficPane) {
            return false;
          }

          return !current;
        }),
        onMoveFilterOption: (direction) => {
          if (filterFocus === 'field') {
            setSearchField((current) => cycleValue(SEARCH_FIELDS, current, direction));
          }

          if (filterFocus === 'method') {
            setMethodOptionIndex((current) => (current + direction + METHOD_OPTIONS.length + 1) % (METHOD_OPTIONS.length + 1));
          }

          if (filterFocus === 'status') {
            setStatusOptionIndex((current) => (current + direction + STATUS_OPTIONS.length + 1) % (STATUS_OPTIONS.length + 1));
          }

          setIsFollowingLatest(false);
        },
        onMoveListDisplayFocus: moveListDisplayFocus,
        onMoveComposerCursor: (direction) => setComposer((current) => moveComposerCursor(current, direction)),
        onMoveComposerCursorTo: (boundary) => setComposer((current) => moveComposerCursorTo(current, boundary)),
        onMoveComposerHorizontal: (direction) => setComposer((current) => cycleFocusedComposerOption(current, direction)),
        onMoveComposerLibrary: (direction) => {
          setComposer((current) => {
            const requests = flattenRequestLibrary(manualLibrary);
            const maxIndex = Math.max(0, requests.length - 1);

            return {
              ...current,
              libraryIndex: Math.max(0, Math.min(maxIndex, current.libraryIndex + direction))
            };
          });
        },
        onMoveDetailMatch: moveDetailMatch,
        onMoveSelection: (direction) => {
          setIsFollowingLatest(false);
          setSelectedLogId((currentId) => moveSelectedLogId(filteredLogs, currentId, direction));
        },
        onMoveSelectionTo: (boundary) => {
          setIsFollowingLatest(false);
          setSelectedLogId(getBoundaryLogId(filteredLogs, boundary));
        },
        onOpenFilter: (focus) => {
          setFilterFocus(focus);
          setIsFilterOpen(true);
          setIsDetailSearchOpen(false);
          setIsListDisplayOpen(false);
          setIsFollowingLatest(false);
        },
        onOpenDetailModal: () => {
          if (inspectedLog) {
            setIsDetailModalOpen(true);
            setIsListFocused(false);
            setIsFilterOpen(false);
            setIsListDisplayOpen(false);
          }
        },
        onOpenDetailSearch: () => {
          setIsDetailSearchOpen(true);
          setIsFilterOpen(false);
          setIsListDisplayOpen(false);
          setIsListFocused(false);
        },
        onOpenComposer: openComposer,
        onOpenComposerBodyEditor: () => {
          setComposer((current) => {
            const descriptor = getFocusedComposerDescriptor(current);

            if (current.activeTab !== 'body' || descriptor?.kind !== 'text') {
              return current;
            }

            return {
              ...current,
              cursor: String(getPathValue(current.draft, descriptor.path) ?? '').length,
              isBodyEditorOpen: true
            };
          });
        },
        onOpenComposerLibrary: openComposerLibrary,
        onOpenCommandPrompt: openCommandPrompt,
        onOpenHelp: () => setIsHelpOpen(true),
        onOpenListDisplay: openListDisplay,
        onPreviewComposerSend: () => {
          setComposer((current) => ({
            ...current,
            error: '',
            isBodyEditorOpen: false,
            isConfirmOpen: true,
            isLibraryOpen: false
          }));
        },
        onSaveComposerRequest: saveComposerRequest,
        onResetListDisplay: () => {
          setTrafficListDisplay(normalizeTrafficListDisplay(DEFAULT_TRAFFIC_LIST_DISPLAY));
          setListDisplayFocusIndex(0);
        },
        onSelectComposerTab: (tab) => setComposer((current) => selectComposerTab(current, tab)),
        onShowCommandHint: showCommandHint,
        onStartExport: startTrafficExport,
        onStartResend: startResend,
        onSubmitCommand: submitCommand,
        onScrollDetails: (direction) => {
          moveDetailFocus(direction);
        },
        onScrollDetailsTo: (boundary) => {
          const rowIndex = boundary === 'bottom' ? Math.max(0, detailRows.length - 1) : 0;
          focusDetailRowAt(rowIndex);
        },
        onSendComposer: sendComposer,
        onSendResend: () => sendResendPlan(pendingResend),
        onStopRecording: stopRecording,
        onFollowLatest: () => {
          setIsFollowingLatest(true);
          const latestLogId = resolveSelectedLogId(filteredLogs, selectedLogId, { followLatest: true });

          setSelectedLogId(latestLogId);
          setInspectedLogId(latestLogId);
        },
        onInspectSelected: () => {
          setInspectedLogId(selectedLog?.id ?? null);
          setDetailScrollOffset(0);
          setFocusedDetailRow(0);
          if (selectedLog) {
            const hydratedLog = hydrateLog(selectedLog);

            setLogs(stateStore.getLogs());
            trafficRecorder?.recordInteraction?.(hydratedLog, 'inspect');
          }
          setRecordingStatus(getRecordingStatus(trafficRecorder));
        },
        onToggleFilterOption: () => {
          if (filterFocus === 'field') {
            setSearchField((current) => cycleValue(SEARCH_FIELDS, current));
          }

          if (filterFocus === 'method') {
            const value = ['all', ...METHOD_OPTIONS][methodOptionIndex];
            setMethodFilters((current) => toggleFilterValue(current, value, METHOD_OPTIONS));
          }

          if (filterFocus === 'status') {
            const value = ['all', ...STATUS_OPTIONS][statusOptionIndex];
            setStatusFilters((current) => toggleFilterValue(current, value, STATUS_OPTIONS));
          }

          setIsFollowingLatest(false);
        },
        onToggleListDisplayColumn: toggleFocusedListDisplayColumn,
        onToggleDetailTab: () => {
          setDetailTab((current) => cycleValue(DETAIL_TABS, current));
        },
        onToggleComposerField: () => setComposer(toggleFocusedComposerField),
        onToggleComposerReveal: () => {
          setComposer((current) => ({
            ...current,
            revealSecrets: !current.revealSecrets
          }));
        },
        onToggleDetailNode: toggleFocusedDetailNode,
        onToggleFrameworkAssets: toggleFrameworkAssets,
        onTogglePause: toggleCapturePause,
        onToggleRecordingPause: toggleRecordingPause
      })
      : null,
    h(Header, {
      context,
      frameworkSummary,
      hideFrameworkAssets,
      logsCount: logs.length,
      recordingStatus,
      visibleCount: filteredLogs.length,
      isPaused
    }),
    h(
      Box,
      { flexDirection: 'row', flexGrow: 1 },
      commandState.isOpen
        ? h(CommandModal, {
          keyBindings,
          input: commandState.input,
          selectedIndex: commandState.selectedIndex,
          status: commandState.status
        })
        : (isHelpOpen
        ? h(HelpModal, {
          keyBindings
        })
        : (isListDisplayOpen
          ? h(ListDisplayModal, {
            focusIndex: listDisplayFocusIndex,
            hideFrameworkAssets,
            keyBindings,
            listDisplay: trafficListDisplay
          })
        : (composer.isOpen
          ? h(RequestComposerPanel, {
            composer,
            keyBindings,
            library: manualLibrary,
            targetUrl: context.targetUrl
          })
          : (isDetailModalOpen
          ? h(DetailModal, {
            activeMatchIndex: detailMatchIndex,
            detailTab,
            focusedRow: focusedDetailRow,
            keyBindings,
            log: inspectedLog,
            matchCount: detailMatches.length,
            rows: detailRows,
            scrollOffset: detailScrollOffset,
            visibleCount: detailModalVisibleCount
          })
          : paneNodes))))
    ),
    isFilterOpen
        ? h(FilterBar, {
        filterFocus,
        historyStatus,
        keyBindings,
        logsCount: logs.length,
        methodFilters,
        methodOptionIndex,
        searchField,
        searchQuery,
        statusFilters,
        statusOptionIndex,
        visibleCount: filteredLogs.length
      })
        : (pendingResend
          ? h(ResendConfirmBar, {
          keyBindings,
          isResending,
          pendingResend
        })
          : (isDetailSearchOpen
          ? h(DetailSearchBar, {
          activeMatchIndex: detailMatchIndex,
          keyBindings,
          matchCount: detailMatches.length,
          query: detailSearchQuery
        })
          : h(Footer, {
          commandStatus: commandState.status || keyBindingStatus,
          exportStatus,
          keyBindings,
          resendStatus,
          isComposerConfirmOpen: composer.isConfirmOpen,
          isComposerOpen: composer.isOpen,
          isComposerTextFocused: getFocusedComposerDescriptor(composer)?.kind === 'text',
          isCommandOpen: commandState.isOpen,
          isDetailModalOpen,
          isDetailSearchActive: detailSearchQuery.trim().length > 0,
          isExportPromptOpen: Boolean(pendingExport),
          isHelpOpen,
          hideFrameworkAssets,
          isLiveMode,
          isListDisplayOpen,
          isListFocused: isDetailModalOpen ? false : isListFocused,
          isRawModeSupported,
          isReplayMode,
          recordingStatus
        })))
  );
}
