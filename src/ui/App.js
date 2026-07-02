import React, { useEffect, useMemo, useState } from 'react';
import { Box, useStdin } from 'ink';
import {
  createManualRequestDraftFromLog,
  normalizeManualResendMetadata,
  normalizeManualRequestDraft
} from '../engine/manual-request.js';
import {
  analyzePagination,
  createNextPageRequestDraftFromLog,
  formatPaginationNextStatus
} from '../pagination.js';
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
  SEARCH_MODES,
  STATUS_OPTIONS,
  WORD_MATCH_MODES,
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
  getTrafficAnomalyMap,
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
  RequestActivityPage,
  ToastNotification,
  createRequestActivity,
  failRequestActivity,
  finishRequestActivity,
  formatRequestActivityRow,
  formatRequestActivityToast
} from './request-activity.js';
import {
  EndpointGroupsModal,
  createEndpointGroups,
  formatEndpointGroupRow,
  getEndpointRoutePattern
} from './endpoints.js';
import {
  FlowAnalysisModal,
  formatFlowHeadline,
  formatFlowMetadata,
  formatFlowRow,
  getFlowDisplayGroups,
  getFlowPreviewRows,
  shouldUseWideFlowLayout
} from './flows.js';
import {
  SchemaInferenceModal,
  createSchemaGroups,
  formatSchemaRow,
  inferJsonShape,
  parseJsonPayloadForSchema
} from './schema-inference.js';
import {
  DIFF_FILTER_FOCUS_ORDER,
  DiffFilterBar,
  REQUEST_DIFF_LAYOUT_MODES,
  RequestDiffModal,
  clampRequestDiffRowIndex,
  clampRequestDiffValueScrollOffset,
  createRequestDiff,
  filterRequestDiffRows,
  getDiffCandidateLogIds,
  getDiffEndpointShape,
  getBoundaryRequestDiffRowIndex,
  getNextRequestDiffRowIndex,
  getRequestDiffBottomControlHeight,
  getRequestDiffFrameWidth,
  getRequestDiffFilterBoxHeight,
  getRequestDiffRows,
  getRequestDiffValueLines,
  getRequestDiffVisibleCount,
  shouldShowRequestDiffFilterBar
} from './request-diff.js';
import {
  KeyboardControls,
  getCommandSuggestionIndex,
  resolveCommandInput
} from './commands.js';
import { normalizeKeyBindings } from './key-bindings.js';
import {
  analyzeTrafficFlows,
  formatFlowLabel,
  getRedirectChainGroups,
  getRepeatRequestGroups
} from '../flow-analysis.js';

export {
  analyzePagination,
  createNextPageRequestDraftFromLog,
  formatPaginationNextStatus
} from '../pagination.js';
export {
  parseQueryParameters
} from '../query-params.js';
export {
  DEFAULT_TRAFFIC_LIST_DISPLAY,
  DETAIL_TABS,
  getRenderHeight
} from './shared.js';
export {
  detectAuthSecrets
} from '../auth-secrets.js';
export {
  analyzeCacheHeaders,
  formatCacheIssue,
  parseCacheAge,
  parseCacheControl
} from '../cache-analysis.js';
export {
  analyzeContentNegotiation,
  analyzeCors,
  formatDiagnosticsIssue,
  inferRestAction
} from '../diagnostics.js';
export {
  analyzeTrafficFlows,
  formatFlowLabel,
  getRedirectChainGroups,
  getRepeatRequestGroups
} from '../flow-analysis.js';
export {
  decodeJwtToken,
  findJwtTokensInLog,
  formatJwtScopes,
  formatJwtTimeClaim
} from '../jwt-inspector.js';
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
  formatAnomalyReasons,
  formatFilterLabel,
  formatFrameworkDetectionLabel,
  formatPathForMode,
  formatRecordingLabel,
  formatTrafficHeader,
  formatTrafficRow,
  getSearchQueryWarning,
  getTrafficAnomalyMap,
  getTrafficAnomalyReasons,
  getMouseWheelTarget,
  getPaneLayout,
  getSearchValues,
  getSelectedIndex,
  getTrafficPaneWidth,
  getTrafficRowWidth,
  isFrameworkAssetRequest,
  moveSelectedLogId,
  matchesSearchValues,
  normalizeTrafficListDisplay,
  parseSearchTerms,
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
  RequestActivityPage,
  ToastNotification,
  createRequestActivity,
  failRequestActivity,
  finishRequestActivity,
  formatRequestActivityRow,
  formatRequestActivityToast
} from './request-activity.js';
export {
  EndpointGroupsModal,
  createEndpointGroups,
  formatEndpointGroupRow,
  getEndpointRoutePattern
} from './endpoints.js';
export {
  FlowAnalysisModal,
  formatFlowHeadline,
  formatFlowMetadata,
  formatFlowRow,
  getFlowDisplayGroups,
  getFlowPreviewRows,
  shouldUseWideFlowLayout
} from './flows.js';
export {
  SchemaInferenceModal,
  createSchemaGroups,
  formatSchemaRow,
  inferJsonShape,
  parseJsonPayloadForSchema
} from './schema-inference.js';
export {
  createRequestDiff,
  filterRequestDiffRows,
  clampRequestDiffValueScrollOffset,
  getDiffCandidateLogIds,
  getDiffEndpointShape,
  getRequestDiffFrameWidth,
  getRequestDiffRows,
  getRequestDiffValueLines,
  getRequestDiffValueScrollLabel
} from './request-diff.js';
export {
  DEFAULT_KEY_BINDINGS,
  getBindingLabel,
  matchesKeyBinding,
  normalizeKeyBindings
} from './key-bindings.js';

function getNextPageUnavailableStatusForLog(log) {
  const pagination = analyzePagination(log);

  if (!pagination.detected) {
    return 'no pagination detected';
  }

  return pagination.unavailableReason || 'no next page detected';
}

function createCommandContext({
  activeLog,
  composerIsSending = false,
  environment = [],
  isLiveMode = false,
  isResending = false,
  manualRequestSender = null
} = {}) {
  const unavailable = (reason) => ({
    available: false,
    reason
  });
  const available = { available: true, reason: '' };

  if (!isLiveMode) {
    const reason = 'next page unavailable in replay mode';

    return {
      availability: {
        'next-page': unavailable(reason),
        'send-next-page': unavailable(reason)
      }
    };
  }

  if (typeof manualRequestSender !== 'function') {
    const reason = 'manual sender unavailable';

    return {
      availability: {
        'next-page': unavailable(reason),
        'send-next-page': unavailable(reason)
      }
    };
  }

  if (!activeLog) {
    const reason = 'no request selected';

    return {
      availability: {
        'next-page': unavailable(reason),
        'send-next-page': unavailable(reason)
      }
    };
  }

  const plan = createNextPageRequestDraftFromLog(activeLog, { environment });

  if (!plan) {
    const reason = getNextPageUnavailableStatusForLog(activeLog);

    return {
      availability: {
        'next-page': unavailable(reason),
        'send-next-page': unavailable(reason)
      }
    };
  }

  const blocker = plan.blockers?.[0] ?? '';
  const sendReason = composerIsSending || isResending
    ? 'request already sending'
    : (blocker ? `edit required: ${blocker}` : '');

  return {
    availability: {
      'next-page': available,
      'send-next-page': sendReason ? unavailable(sendReason) : available
    }
  };
}

function getActiveHelpContext({
  isComposerBodyEditorOpen = false,
  isComposerConfirmOpen = false,
  isComposerLibraryOpen = false,
  isComposerOpen = false,
  isComposerTextFocused = false,
  isDetailModalOpen = false,
  isDetailSearchOpen = false,
  isDiffFilterOpen = false,
  isDiffOpen = false,
  isDiffValueOpen = false,
  isEndpointGroupsOpen = false,
  isFlowAnalysisOpen = false,
  isSchemaInferenceOpen = false,
  isExportPromptOpen = false,
  isFilterOpen = false,
  isListDisplayOpen = false,
  isListFocused = true,
  isRequestActivityOpen = false,
  isResendConfirmOpen = false
} = {}) {
  if (isExportPromptOpen) {
    return { surface: 'export' };
  }

  if (isResendConfirmOpen) {
    return { surface: 'resendConfirm' };
  }

  if (isListDisplayOpen) {
    return { surface: 'listDisplay' };
  }

  if (isEndpointGroupsOpen) {
    return { surface: 'endpointGroups' };
  }

  if (isSchemaInferenceOpen) {
    return { surface: 'schemaInference' };
  }

  if (isFlowAnalysisOpen) {
    return { surface: 'flowAnalysis' };
  }

  if (isRequestActivityOpen) {
    return { surface: 'requestActivity' };
  }

  if (isDiffOpen) {
    if (isDiffValueOpen) {
      return { surface: 'diffValue' };
    }

    if (isDiffFilterOpen) {
      return { surface: 'diffFilter' };
    }

    return { surface: 'diff' };
  }

  if (isComposerOpen) {
    if (isComposerConfirmOpen) {
      return { surface: 'composerConfirm' };
    }

    if (isComposerLibraryOpen) {
      return { surface: 'composerLibrary' };
    }

    if (isComposerBodyEditorOpen) {
      return { surface: 'composerBody' };
    }

    if (isComposerTextFocused) {
      return { surface: 'composerText' };
    }

    return { surface: 'composer' };
  }

  if (isDetailSearchOpen) {
    return { surface: 'detailSearch' };
  }

  if (isFilterOpen) {
    return { surface: 'filter' };
  }

  if (isDetailModalOpen) {
    return { surface: 'detailModal' };
  }

  return { surface: isListFocused ? 'traffic' : 'details' };
}

export function shouldOpenDetailModalForInspect({ paneLayout = {}, selectedLog = null } = {}) {
  return Boolean(selectedLog) && paneLayout.showDetailPane === false;
}

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
  const [searchMode, setSearchMode] = useState('words');
  const [wordMatchMode, setWordMatchMode] = useState('and');
  const [matchCase, setMatchCase] = useState(false);
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
  const [highlightAnomalies, setHighlightAnomalies] = useState(false);
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
  const [requestActivities, setRequestActivities] = useState([]);
  const [selectedRequestActivityId, setSelectedRequestActivityId] = useState(null);
  const [isRequestActivityOpen, setIsRequestActivityOpen] = useState(false);
  const [isEndpointGroupsOpen, setIsEndpointGroupsOpen] = useState(false);
  const [focusedEndpointGroupIndex, setFocusedEndpointGroupIndex] = useState(0);
  const [isSchemaInferenceOpen, setIsSchemaInferenceOpen] = useState(false);
  const [focusedSchemaGroupIndex, setFocusedSchemaGroupIndex] = useState(0);
  const [focusedSchemaRowIndex, setFocusedSchemaRowIndex] = useState(0);
  const [isFlowAnalysisOpen, setIsFlowAnalysisOpen] = useState(false);
  const [focusedFlowAnalysisIndex, setFocusedFlowAnalysisIndex] = useState(0);
  const [diffBaseLogId, setDiffBaseLogId] = useState(null);
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [focusedDiffIndex, setFocusedDiffIndex] = useState(0);
  const [diffScrollOffset, setDiffScrollOffset] = useState(0);
  const [diffLayoutMode, setDiffLayoutMode] = useState('auto');
  const [diffStatus, setDiffStatus] = useState('');
  const [isDiffValueOpen, setIsDiffValueOpen] = useState(false);
  const [diffValueScrollOffset, setDiffValueScrollOffset] = useState(0);
  const [isDiffFilterOpen, setIsDiffFilterOpen] = useState(false);
  const [diffFilterFocus, setDiffFilterFocus] = useState('query');
  const [diffFilterQuery, setDiffFilterQuery] = useState('');
  const [diffSearchMode, setDiffSearchMode] = useState('words');
  const [diffWordMatchMode, setDiffWordMatchMode] = useState('and');
  const [diffMatchCase, setDiffMatchCase] = useState(false);
  const [toast, setToast] = useState(null);
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
  const clinspectSentLogIds = useMemo(() => new Set(
    requestActivities
      .filter((activity) => activity.state === 'success' && activity.logId)
      .map((activity) => String(activity.logId))
  ), [requestActivities]);
  const paneLayout = getPaneLayout(trafficListDisplay);
  const trafficPaneWidth = paneLayout.trafficPaneWidth;

  const filteredLogs = useMemo(() => filterLogs(logs, {
    hideFrameworkAssets,
    matchCase,
    methodFilters,
    searchField,
    searchMode,
    searchQuery,
    showCookieValues,
    statusFilters,
    wordMatchMode
  }), [hideFrameworkAssets, logs, matchCase, methodFilters, searchField, searchMode, searchQuery, showCookieValues, statusFilters, wordMatchMode]);
  const trafficAnomalyMap = useMemo(() => getTrafficAnomalyMap(filteredLogs), [filteredLogs]);
  const endpointGroups = useMemo(() => createEndpointGroups(filteredLogs), [filteredLogs]);
  const schemaGroups = useMemo(() => createSchemaGroups(filteredLogs), [filteredLogs]);
  const flowAnalysis = useMemo(() => analyzeTrafficFlows(filteredLogs), [filteredLogs]);
  const flowDisplayGroups = useMemo(() => getFlowDisplayGroups(flowAnalysis), [flowAnalysis]);

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
    if (!toast?.message) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setToast((current) => current?.id === toast.id ? null : current);
    }, toast.timeoutMs ?? 3000);

    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const resolveOptions = { followLatest: isFollowingLatest };

    setSelectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
    setInspectedLogId((currentId) => resolveSelectedLogId(filteredLogs, currentId, resolveOptions));
  }, [filteredLogs, isFollowingLatest]);

  useEffect(() => {
    setSelectedRequestActivityId((currentId) => {
      if (requestActivities.length === 0) {
        return null;
      }

      return requestActivities.some((activity) => activity.id === currentId)
        ? currentId
        : requestActivities[0].id;
    });
  }, [requestActivities]);

  useEffect(() => {
    setFocusedEndpointGroupIndex((current) => Math.max(0, Math.min(endpointGroups.length - 1, current)));
  }, [endpointGroups]);

  useEffect(() => {
    setFocusedSchemaGroupIndex((current) => Math.max(0, Math.min(schemaGroups.length - 1, current)));
  }, [schemaGroups]);

  useEffect(() => {
    setFocusedFlowAnalysisIndex((current) => Math.max(0, Math.min(flowDisplayGroups.length - 1, current)));
  }, [flowDisplayGroups]);

  useEffect(() => {
    const currentRows = schemaGroups[focusedSchemaGroupIndex]?.rows ?? [];

    setFocusedSchemaRowIndex((current) => Math.max(0, Math.min(currentRows.length - 1, current)));
  }, [focusedSchemaGroupIndex, schemaGroups]);

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
  const commandActionLog = isListFocused && !isDetailModalOpen ? hydrateLog(selectedLog) : inspectedLog;
  const diffBaseLog = useMemo(() => {
    if (!diffBaseLogId) {
      return null;
    }

    return stateStore.getLogById?.(diffBaseLogId) ?? logs.find((log) => log.id === diffBaseLogId) ?? null;
  }, [diffBaseLogId, logs, stateStore]);
  const commandContext = useMemo(() => createCommandContext({
    activeLog: commandActionLog,
    composerIsSending: composer.isSending,
    environment: manualLibrary.environment,
    isLiveMode,
    isResending,
    manualRequestSender
  }), [
    commandActionLog,
    composer.isSending,
    isLiveMode,
    isResending,
    manualLibrary.environment,
    manualRequestSender
  ]);
  const rawDetailRows = useMemo(
    () => getDetailRows(inspectedLog, detailTab, {
      collapsedPaths: collapsedDetailPaths,
      flowAnalysis,
      publicTargetUrl,
      proxyOrigin,
      showCookieValues
    }),
    [collapsedDetailPaths, detailTab, flowAnalysis, inspectedLog, publicTargetUrl, proxyOrigin, showCookieValues]
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
    ? 22
    : (pendingResend
      ? 13 + RESEND_CONFIRM_BAR_HEIGHT
      : (isDetailSearchOpen ? 13 + DETAIL_SEARCH_BAR_HEIGHT : 13));
  const trafficVisibleCount = getTrafficVisibleCount(bottomOffset);
  const detailVisibleCount = getDetailVisibleCount(bottomOffset);
  const detailModalVisibleCount = getDetailModalVisibleCount(isDetailSearchOpen ? 11 + DETAIL_SEARCH_BAR_HEIGHT : 11);
  const activeDetailVisibleCount = isDetailModalOpen ? detailModalVisibleCount : detailVisibleCount;
  const maxDetailScrollOffset = getMaxScrollOffset(detailRows, activeDetailVisibleCount);
  const requestDiff = useMemo(() => (
    isDiffOpen && diffBaseLog && commandActionLog && diffBaseLog.id !== commandActionLog.id
      ? createRequestDiff(diffBaseLog, commandActionLog, { showCookieValues })
      : null
  ), [commandActionLog, diffBaseLog, isDiffOpen, showCookieValues]);
  const requestDiffRows = useMemo(() => getRequestDiffRows(requestDiff), [requestDiff]);
  const filteredRequestDiffRows = useMemo(
    () => filterRequestDiffRows(requestDiffRows, diffFilterQuery, {
      matchCase: diffMatchCase,
      searchMode: diffSearchMode,
      wordMatchMode: diffWordMatchMode
    }),
    [diffFilterQuery, diffMatchCase, diffSearchMode, diffWordMatchMode, requestDiffRows]
  );
  const diffCandidateLogIds = useMemo(() => new Set(
    diffBaseLog ? getDiffCandidateLogIds(diffBaseLog, filteredLogs) : []
  ), [diffBaseLog, filteredLogs]);
  const isDiffFilterVisible = shouldShowRequestDiffFilterBar({
    filterQuery: diffFilterQuery,
    isFilterOpen: isDiffFilterOpen
  });
  const diffBottomControlHeight = getRequestDiffBottomControlHeight({
    filterQuery: diffFilterQuery,
    isFilterOpen: isDiffFilterOpen
  });
  const diffVisibleCount = getRequestDiffVisibleCount(15 + diffBottomControlHeight);
  const endpointGroupPageSize = Math.max(6, renderHeight - 9);
  const schemaInferencePageSize = Math.max(4, renderHeight - 14);
  const diffValueContentWidth = Math.max(34, getRequestDiffFrameWidth() - 4);
  const diffValueLines = useMemo(
    () => getRequestDiffValueLines(filteredRequestDiffRows[focusedDiffIndex], diffValueContentWidth),
    [diffValueContentWidth, filteredRequestDiffRows, focusedDiffIndex]
  );
  const maxDiffScrollOffset = getMaxScrollOffset(filteredRequestDiffRows, diffVisibleCount);
  const maxDiffValueScrollOffset = Math.max(0, diffValueLines.length - diffVisibleCount);
  const emptyText = context.mode === 'live'
    ? `Waiting for traffic at ${proxyOrigin}`
    : (isReplayMode ? 'No recorded traffic' : 'Waiting for traffic...');
  const keyBindingStatus = keyBindingWarnings.length > 0
    ? `key bindings: ${keyBindingWarnings[0]}${keyBindingWarnings.length > 1 ? ` (+${keyBindingWarnings.length - 1} more)` : ''}`
    : '';
  const footerCommandStatus = [commandState.status, diffStatus, keyBindingStatus]
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .join(' | ');

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
    setDiffScrollOffset((current) => Math.min(current, maxDiffScrollOffset));
  }, [maxDiffScrollOffset]);

  useEffect(() => {
    setDiffValueScrollOffset((current) => Math.min(current, maxDiffValueScrollOffset));
  }, [maxDiffValueScrollOffset]);

  useEffect(() => {
    if (isDiffValueOpen && !filteredRequestDiffRows[focusedDiffIndex]?.isFocusable) {
      setIsDiffValueOpen(false);
      setDiffValueScrollOffset(0);
    }
  }, [filteredRequestDiffRows, focusedDiffIndex, isDiffValueOpen]);

  useEffect(() => {
    setFocusedDiffIndex((current) => {
      const safeIndex = clampRequestDiffRowIndex(current, filteredRequestDiffRows);

      return filteredRequestDiffRows[safeIndex]?.isFocusable
        ? safeIndex
        : getBoundaryRequestDiffRowIndex(filteredRequestDiffRows, 'top');
    });
  }, [filteredRequestDiffRows]);

  useEffect(() => {
    // Do not depend on filteredRequestDiffRows here; those rows can be recreated while moving focus.
    setFocusedDiffIndex(getBoundaryRequestDiffRowIndex(filteredRequestDiffRows, 'top'));
    setDiffScrollOffset(0);
  }, [diffFilterQuery, diffMatchCase, diffSearchMode, diffWordMatchMode]);

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
    setSearchMode('words');
    setWordMatchMode('and');
    setMatchCase(false);
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
      selectedIndex: 0,
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
      selectedIndex: getCommandSuggestionIndex(current.input, current.selectedIndex, direction, commandContext),
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
    setDiffBaseLogId(null);
    setIsDiffOpen(false);
    setFocusedDiffIndex(0);
    setDiffScrollOffset(0);
    setDiffStatus('');
    setIsDiffFilterOpen(false);
    setDiffFilterFocus('query');
    setDiffFilterQuery('');
    setDiffSearchMode('words');
    setDiffWordMatchMode('and');
    setDiffMatchCase(false);
    setIsFlowAnalysisOpen(false);
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

  const showToast = (message, kind = 'info', options = {}) => {
    setToast({
      id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      kind,
      message,
      timeoutMs: options.timeoutMs ?? 3000
    });
  };

  const startRequestActivity = (source, draft) => {
    const activity = createRequestActivity({ source, draft });

    setRequestActivities((current) => [activity, ...current]);
    setSelectedRequestActivityId(activity.id);
    showToast(formatRequestActivityToast(activity, { state: 'sending' }), 'info');

    return activity;
  };

  const updateRequestActivity = (activity) => {
    setRequestActivities((current) => current.map((item) => (
      item.id === activity.id ? activity : item
    )));
    setSelectedRequestActivityId(activity.id);
  };

  const finishTrackedRequest = (activity, logEntry) => {
    const completed = finishRequestActivity(activity, logEntry);

    updateRequestActivity(completed);
    showToast(formatRequestActivityToast(completed), 'success');

    return completed;
  };

  const failTrackedRequest = (activity, error) => {
    const failed = failRequestActivity(activity, error);

    updateRequestActivity(failed);
    showToast(formatRequestActivityToast(failed), 'error', { timeoutMs: 5000 });

    return failed;
  };

  const getNextPageUnavailableStatus = (log) => {
    return getNextPageUnavailableStatusForLog(log);
  };

  const openRequestActivity = () => {
    setIsRequestActivityOpen(true);
    setSelectedRequestActivityId((currentId) => {
      if (requestActivities.some((activity) => activity.id === currentId)) {
        return currentId;
      }

      return requestActivities[0]?.id ?? null;
    });
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const openEndpointGroups = () => {
    setIsEndpointGroupsOpen(true);
    setFocusedEndpointGroupIndex((current) => Math.max(0, Math.min(endpointGroups.length - 1, current)));
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const openSchemaInference = () => {
    setIsSchemaInferenceOpen(true);
    setFocusedSchemaGroupIndex((current) => Math.max(0, Math.min(schemaGroups.length - 1, current)));
    setFocusedSchemaRowIndex(0);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const openFlowAnalysis = () => {
    setIsFlowAnalysisOpen(true);
    setFocusedFlowAnalysisIndex((current) => Math.max(0, Math.min(flowDisplayGroups.length - 1, current)));
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsDiffOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const moveEndpointGroup = (direction) => {
    setFocusedEndpointGroupIndex((current) => Math.max(
      0,
      Math.min(endpointGroups.length - 1, current + direction)
    ));
  };

  const moveEndpointGroupTo = (boundary) => {
    setFocusedEndpointGroupIndex(boundary === 'bottom'
      ? Math.max(0, endpointGroups.length - 1)
      : 0);
  };

  const moveSchemaGroup = (direction) => {
    setFocusedSchemaGroupIndex((current) => {
      if (schemaGroups.length === 0) {
        return 0;
      }

      const nextIndex = Math.max(0, Math.min(schemaGroups.length - 1, current + direction));
      setFocusedSchemaRowIndex(0);
      return nextIndex;
    });
  };

  const moveSchemaField = (direction) => {
    const rows = schemaGroups[focusedSchemaGroupIndex]?.rows ?? [];

    setFocusedSchemaRowIndex((current) => Math.max(
      0,
      Math.min(rows.length - 1, current + direction)
    ));
  };

  const moveSchemaFieldTo = (boundary) => {
    const rows = schemaGroups[focusedSchemaGroupIndex]?.rows ?? [];

    setFocusedSchemaRowIndex(boundary === 'bottom'
      ? Math.max(0, rows.length - 1)
      : 0);
  };

  const moveFlowAnalysis = (direction) => {
    setFocusedFlowAnalysisIndex((current) => Math.max(
      0,
      Math.min(flowDisplayGroups.length - 1, current + direction)
    ));
  };

  const moveFlowAnalysisTo = (boundary) => {
    setFocusedFlowAnalysisIndex(boundary === 'bottom'
      ? Math.max(0, flowDisplayGroups.length - 1)
      : 0);
  };

  const inspectFlowAnalysis = () => {
    const group = flowDisplayGroups[focusedFlowAnalysisIndex];

    if (!group) {
      showToast('no flow selected', 'error');
      return;
    }

    const logId = group.focusLogId;
    const log = logId
      ? stateStore.getLogById?.(logId) ?? filteredLogs.find((item) => String(item.id) === String(logId))
      : null;

    if (!log) {
      showToast('flow request not found', 'error');
      return;
    }

    setLogs(stateStore.getLogs());
    setSelectedLogId(log.id);
    setInspectedLogId(log.id);
    setIsFlowAnalysisOpen(false);
    setIsListFocused(false);
    setDetailTab('flow');
    setDetailScrollOffset(0);
    setFocusedDetailRow(0);
    setDetailMatchIndex(0);
    showToast(`opened ${log.method} ${log.path}`, 'success');
  };

  const moveRequestActivity = (direction) => {
    if (requestActivities.length === 0) {
      setSelectedRequestActivityId(null);
      return;
    }

    const currentIndex = requestActivities.findIndex((activity) => activity.id === selectedRequestActivityId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.max(0, Math.min(requestActivities.length - 1, safeIndex + direction));

    setSelectedRequestActivityId(requestActivities[nextIndex].id);
  };

  const moveRequestActivityTo = (boundary) => {
    if (requestActivities.length === 0) {
      setSelectedRequestActivityId(null);
      return;
    }

    setSelectedRequestActivityId(boundary === 'last'
      ? requestActivities[requestActivities.length - 1].id
      : requestActivities[0].id);
  };

  const inspectRequestActivity = () => {
    const activity = requestActivities.find((item) => item.id === selectedRequestActivityId);

    if (!activity) {
      showToast('no sent request selected', 'error');
      return;
    }

    if (activity.state === 'sending') {
      showToast('request still sending', 'info');
      return;
    }

    if (!activity.logId) {
      showToast(activity.error ? `request failed: ${activity.error}` : 'no captured log for request', 'error');
      return;
    }

    const log = stateStore.getLogById?.(activity.logId);

    if (!log) {
      showToast('captured log not found', 'error');
      return;
    }

    clearFilters();
    setLogs(stateStore.getLogs());
    setSelectedLogId(log.id);
    setInspectedLogId(log.id);
    setIsRequestActivityOpen(false);
    setIsListFocused(false);
    setDetailTab('response');
    setDetailScrollOffset(0);
    setFocusedDetailRow(0);
    showToast(`opened ${activity.method} ${activity.url}`, 'success');
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
      case 'sendNextPage':
        closeCompletedCommand('');
        sendNextPageNow();
        break;
      case 'openRequestActivity':
        closeCompletedCommand('');
        openRequestActivity();
        break;
      case 'openEndpointGroups':
        closeCompletedCommand('');
        openEndpointGroups();
        break;
      case 'openSchemaInference':
        closeCompletedCommand('');
        openSchemaInference();
        break;
      case 'openFlowAnalysis':
        closeCompletedCommand('');
        openFlowAnalysis();
        break;
      case 'toggleAnomalies':
        closeCompletedCommand(toggleAnomalies());
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
    const resolved = resolveCommandInput(commandState.input, commandState.selectedIndex, commandContext);

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

  const toggleAnomalies = () => {
    const nextHighlightAnomalies = !highlightAnomalies;
    const anomalyCount = trafficAnomalyMap.size;
    const candidateLabel = anomalyCount === 1 ? 'candidate' : 'candidates';
    const status = nextHighlightAnomalies
      ? `experimental highlights on: ${anomalyCount} ${candidateLabel}`
      : 'experimental highlights off';

    setHighlightAnomalies(nextHighlightAnomalies);
    setCommandState((current) => (
      current.isOpen ? current : { ...current, status }
    ));
    showToast(status, nextHighlightAnomalies && anomalyCount > 0 ? 'warning' : 'info');

    return status;
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
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const getActiveActionLog = () => {
    return isListFocused && !isDetailModalOpen ? hydrateLog(selectedLog) : inspectedLog;
  };

  const getExportLog = () => {
    return getActiveActionLog();
  };

  const getManualActionLog = () => {
    return getActiveActionLog();
  };

  const getStoredDiffBaseLog = () => {
    if (!diffBaseLogId) {
      return null;
    }

    return stateStore.getLogById?.(diffBaseLogId) ?? logs.find((log) => log.id === diffBaseLogId) ?? null;
  };

  const formatDiffLogStatus = (log) => `${String(log?.method ?? 'GET').toUpperCase()} ${String(log?.path ?? '/')}`;

  const markDiffBase = () => {
    const activeLog = getActiveActionLog();

    if (!activeLog?.id) {
      const status = 'diff: no request selected';

      setDiffStatus(status);
      showToast(status, 'error');
      return;
    }

    const status = `marked A ${formatDiffLogStatus(activeLog)}`;

    setDiffBaseLogId(activeLog.id);
    setIsDiffOpen(false);
    setFocusedDiffIndex(0);
    setDiffScrollOffset(0);
    setDiffStatus(status);
    showToast(status, 'info');
  };

  const clearDiffBase = () => {
    if (!diffBaseLogId) {
      const status = 'diff: no mark set';

      setDiffStatus(status);
      showToast(status, 'info');
      return;
    }

    const status = 'diff mark cleared';

    setDiffBaseLogId(null);
    setIsDiffOpen(false);
    setFocusedDiffIndex(0);
    setDiffScrollOffset(0);
    setIsDiffValueOpen(false);
    setDiffValueScrollOffset(0);
    setIsDiffFilterOpen(false);
    setDiffFilterFocus('query');
    setDiffFilterQuery('');
    setDiffSearchMode('words');
    setDiffWordMatchMode('and');
    setDiffMatchCase(false);
    setDiffStatus(status);
    showToast(status, 'info');
  };

  const openDiff = () => {
    const baseLog = getStoredDiffBaseLog();
    const targetLog = getActiveActionLog();

    if (!baseLog) {
      const status = 'diff: mark A first';

      setDiffStatus(status);
      showToast(status, 'error');
      return;
    }

    if (!targetLog?.id) {
      const status = 'diff: no request selected';

      setDiffStatus(status);
      showToast(status, 'error');
      return;
    }

    if (baseLog.id === targetLog.id) {
      const status = 'diff: select another request';

      setDiffStatus(status);
      showToast(status, 'info');
      return;
    }

    const nextRows = getRequestDiffRows(createRequestDiff(baseLog, targetLog, { showCookieValues }));

    setIsDiffOpen(true);
    setFocusedDiffIndex(getBoundaryRequestDiffRowIndex(nextRows, 'top'));
    setDiffScrollOffset(0);
    setIsDiffValueOpen(false);
    setDiffValueScrollOffset(0);
    setIsDiffFilterOpen(false);
    setDiffFilterFocus('query');
    setDiffFilterQuery('');
    setDiffSearchMode('words');
    setDiffWordMatchMode('and');
    setDiffMatchCase(false);
    setDiffStatus(`diff A -> B ${formatDiffLogStatus(targetLog)}`);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setPendingExport(null);
    setPendingResend(null);
  };

  const closeDiff = () => {
    setIsDiffOpen(false);
    setIsDiffValueOpen(false);
    setDiffValueScrollOffset(0);
    setIsDiffFilterOpen(false);
    setDiffFilterFocus('query');
    setDiffFilterQuery('');
    setDiffSearchMode('words');
    setDiffWordMatchMode('and');
    setDiffMatchCase(false);
  };

  const focusDiffRowAt = (rowIndex) => {
    const safeRowIndex = clampRequestDiffRowIndex(rowIndex, filteredRequestDiffRows);

    setFocusedDiffIndex(safeRowIndex);
    setDiffScrollOffset((current) => getScrollOffsetForFocusedRow(
      safeRowIndex,
      current,
      diffVisibleCount,
      maxDiffScrollOffset
    ));
  };

  const moveDiffFocus = (direction) => {
    focusDiffRowAt(getNextRequestDiffRowIndex(filteredRequestDiffRows, focusedDiffIndex, direction));
  };

  const moveDiffFocusTo = (boundary) => {
    focusDiffRowAt(getBoundaryRequestDiffRowIndex(
      filteredRequestDiffRows,
      boundary === 'bottom' ? 'bottom' : 'top'
    ));
  };

  const toggleDiffLayout = () => {
    setDiffLayoutMode((current) => cycleValue(REQUEST_DIFF_LAYOUT_MODES, current));
  };

  const openDiffValue = () => {
    if (!filteredRequestDiffRows[focusedDiffIndex]?.isFocusable) {
      return;
    }

    setIsDiffValueOpen(true);
    setDiffValueScrollOffset(0);
    setIsDiffFilterOpen(false);
  };

  const closeDiffValue = () => {
    setIsDiffValueOpen(false);
    setDiffValueScrollOffset(0);
  };

  const moveDiffValueScroll = (direction) => {
    setDiffValueScrollOffset((current) => clampRequestDiffValueScrollOffset(
      diffValueLines,
      current + direction,
      diffVisibleCount
    ));
  };

  const moveDiffValueScrollTo = (boundary) => {
    setDiffValueScrollOffset(boundary === 'bottom' ? maxDiffValueScrollOffset : 0);
  };

  const cycleDiffFilterFocus = (direction) => {
    setDiffFilterFocus((current) => cycleValue(DIFF_FILTER_FOCUS_ORDER, current, direction));
  };

  const moveDiffFilterOption = (direction = 1) => {
    if (diffFilterFocus === 'mode') {
      setDiffSearchMode((current) => cycleValue(SEARCH_MODES, current, direction));
    }

    if (diffFilterFocus === 'words') {
      setDiffWordMatchMode((current) => cycleValue(WORD_MATCH_MODES, current, direction));
    }

    if (diffFilterFocus === 'case') {
      setDiffMatchCase((current) => !current);
    }
  };

  const clearDiffFilter = () => {
    setDiffFilterFocus('query');
    setDiffFilterQuery('');
    setDiffSearchMode('words');
    setDiffWordMatchMode('and');
    setDiffMatchCase(false);
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

    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
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
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
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
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
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
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
  };

  const openNextPageComposer = () => {
    if (!isLiveMode) {
      const status = 'next page unavailable in replay mode';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    if (typeof manualRequestSender !== 'function') {
      const status = 'manual sender unavailable';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    const sourceLog = getManualActionLog();

    if (!sourceLog) {
      const status = 'no request selected';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    const plan = createNextPageRequestDraftFromLog(sourceLog, {
      environment: manualLibrary.environment
    });

    if (!plan) {
      const status = getNextPageUnavailableStatus(sourceLog);

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    setComposer(ensureComposerActiveTabRows({
      ...createBlankComposerState({ environment: manualLibrary.environment }),
      cursor: plan.draft.url.length,
      draft: plan.draft,
      error: plan.blockers?.[0] ?? '',
      resend: plan.resend,
      source: 'next-page',
      status: formatPaginationNextStatus(plan.pagination),
      warnings: [...(plan.blockers ?? []), ...(plan.warnings ?? [])]
    }));
    setPendingResend(null);
    setResendStatus('');
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
  };

  const sendNextPageNow = () => {
    if (!isLiveMode) {
      const status = 'next page unavailable in replay mode';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    if (composer.isSending || isResending) {
      const status = 'request already sending';

      setResendStatus(status);
      showToast(status, 'info');
      return;
    }

    if (typeof manualRequestSender !== 'function') {
      const status = 'manual sender unavailable';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    const sourceLog = getManualActionLog();

    if (!sourceLog) {
      const status = 'no request selected';

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    const plan = createNextPageRequestDraftFromLog(sourceLog, {
      environment: manualLibrary.environment
    });

    if (!plan) {
      const status = getNextPageUnavailableStatus(sourceLog);

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    if ((plan.blockers ?? []).length > 0) {
      const status = `edit required: ${plan.blockers[0]}`;

      setResendStatus(status);
      showToast(status, 'error');
      return;
    }

    const activity = startRequestActivity('send-next-page', plan.draft);
    const status = `sending ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`;

    setIsRequestActivityOpen(true);
    setPendingResend(null);
    setResendStatus(status);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsDetailModalOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);

    Promise.resolve()
      .then(() => manualRequestSender({
        ...plan.draft,
        resend: plan.resend
      }))
      .then((logEntry) => {
        const addedLog = commitManualLog(logEntry, plan.resend);

        finishTrackedRequest(activity, addedLog);
        setResendStatus(`sent ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`);
      })
      .catch((error) => {
        failTrackedRequest(activity, error);
        setResendStatus(`send failed: ${error?.message ?? String(error)}`);
      });
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
    const activity = startRequestActivity('resend', plan.draft);
    setResendStatus(`resending ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`);

    Promise.resolve()
      .then(() => manualRequestSender({
        ...plan.draft,
        resend: plan.resend
      }))
      .then((logEntry) => {
        const addedLog = commitManualLog(logEntry, plan.resend);

        finishTrackedRequest(activity, addedLog);
        setPendingResend(null);
        setResendStatus(`resent ${plan.summary?.method ?? plan.draft.method} ${plan.summary?.path ?? plan.draft.url}`);
      })
      .catch((error) => {
        failTrackedRequest(activity, error);
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
      setIsRequestActivityOpen(false);
      setIsEndpointGroupsOpen(false);
      setIsSchemaInferenceOpen(false);
      setIsFlowAnalysisOpen(false);
      setIsDiffOpen(false);
      return;
    }

    setPendingResend(null);
    setIsFilterOpen(false);
    setIsDetailSearchOpen(false);
    setIsHelpOpen(false);
    setIsListDisplayOpen(false);
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
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
    setIsRequestActivityOpen(false);
    setIsEndpointGroupsOpen(false);
    setIsSchemaInferenceOpen(false);
    setIsFlowAnalysisOpen(false);
    setIsDiffOpen(false);
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
    const activitySource = composer.source === 'next-page'
      ? 'next-page'
      : (resend ? 'edit-resend' : (composer.source === 'library' ? 'library' : 'composer'));
    const activity = startRequestActivity(activitySource, composer.draft);

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
        const addedLog = commitManualLog(logEntry, resend);

        finishTrackedRequest(activity, addedLog);
        setComposer((current) => ({
          ...current,
          isConfirmOpen: false,
          isOpen: false,
          isSending: false
        }));
      })
      .catch((error) => {
        failTrackedRequest(activity, error);
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
    anomalyMap: trafficAnomalyMap,
    bottomOffset,
    emptyText,
    highlightAnomalies,
    logs: filteredLogs,
    totalCount: logs.length,
    selectedIndex,
    isFocused: isListFocused,
    isFollowingLatest,
    frameworkSummary,
    historyStatus,
    hideFrameworkAssets,
    matchCase,
    clinspectSentLogIds,
    diffBaseLogId,
    diffCandidateLogIds,
    listDisplay: trafficListDisplay,
    marginRight: paneLayout.showTrafficPane && paneLayout.showDetailPane ? paneLayout.gapWidth : 0,
    methodFilters,
    paneWidth: paneLayout.trafficPaneWidth,
    searchField,
    searchMode,
    statusFilters,
    searchQuery,
    wordMatchMode
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
  const requestActivityNode = h(RequestActivityPage, {
    activities: requestActivities,
    keyBindings,
    selectedId: selectedRequestActivityId
  });
  const endpointGroupsNode = h(EndpointGroupsModal, {
    focusedIndex: focusedEndpointGroupIndex,
    groups: endpointGroups,
    keyBindings,
    totalLogs: logs.length
  });
  const schemaInferenceNode = h(SchemaInferenceModal, {
    focusedGroupIndex: focusedSchemaGroupIndex,
    focusedRowIndex: focusedSchemaRowIndex,
    groups: schemaGroups,
    keyBindings,
    totalLogs: filteredLogs.length
  });
  const flowAnalysisNode = h(FlowAnalysisModal, {
    analysis: flowAnalysis,
    focusedIndex: focusedFlowAnalysisIndex,
    keyBindings,
    totalLogs: filteredLogs.length
  });
  const requestDiffNode = h(RequestDiffModal, {
    diff: requestDiff,
    focusedRow: focusedDiffIndex,
    isValueOpen: isDiffValueOpen,
    keyBindings,
    layoutMode: diffLayoutMode,
    rows: filteredRequestDiffRows,
    scrollOffset: diffScrollOffset,
    valueScrollOffset: diffValueScrollOffset,
    visibleCount: diffVisibleCount
  });
  const isComposerTextFocused = getFocusedComposerDescriptor(composer)?.kind === 'text';
  const helpContext = getActiveHelpContext({
    isComposerBodyEditorOpen: composer.isBodyEditorOpen,
    isComposerConfirmOpen: composer.isConfirmOpen,
    isComposerLibraryOpen: composer.isLibraryOpen,
    isComposerOpen: composer.isOpen,
    isComposerTextFocused,
    isDetailModalOpen,
    isDetailSearchOpen,
    isDiffFilterOpen,
    isDiffOpen,
    isDiffValueOpen,
    isEndpointGroupsOpen,
    isFlowAnalysisOpen,
    isSchemaInferenceOpen,
    isExportPromptOpen: Boolean(pendingExport),
    isFilterOpen,
    isListDisplayOpen,
    isListFocused: isDetailModalOpen ? false : isListFocused,
    isRequestActivityOpen,
    isResendConfirmOpen: Boolean(pendingResend)
  });
  const footerNode = h(Footer, {
    commandStatus: footerCommandStatus,
    exportStatus,
    keyBindings,
    resendStatus,
    isComposerConfirmOpen: composer.isConfirmOpen,
    isComposerOpen: composer.isOpen,
    isComposerTextFocused,
    isCommandOpen: commandState.isOpen,
    isDiffOpen,
    isDetailModalOpen,
    isDetailSearchActive: detailSearchQuery.trim().length > 0,
    isExportPromptOpen: Boolean(pendingExport),
    hasDiffBase: Boolean(diffBaseLogId),
    isHelpOpen,
    hideFrameworkAssets,
    isLiveMode,
    isListDisplayOpen,
    isEndpointGroupsOpen,
    isFlowAnalysisOpen,
    isSchemaInferenceOpen,
    isRequestActivityOpen,
    isListFocused: isDetailModalOpen ? false : isListFocused,
    isRawModeSupported,
    isReplayMode,
    recordingStatus
  });

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
        diffFilterFocus,
        isListFocused,
        isHelpOpen,
        isListDisplayOpen,
        isEndpointGroupsOpen,
        isFlowAnalysisOpen,
        isSchemaInferenceOpen,
        isRequestActivityOpen,
        isDiffOpen,
        isDiffFilterOpen,
        isDiffValueOpen,
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
        isComposerTextFocused,
        keyBindings,
        diffPageSize: diffVisibleCount,
        diffValuePageSize: diffVisibleCount,
        endpointGroupsPageSize: endpointGroupPageSize,
        flowAnalysisPageSize: endpointGroupPageSize,
        schemaInferencePageSize,
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
        onBackspaceDiffFilter: () => {
          setDiffFilterQuery((current) => current.slice(0, -1));
        },
        onBackspaceSearch: () => {
          setSearchQuery((current) => current.slice(0, -1));
          setIsFollowingLatest(false);
        },
        onCancelExport: cancelTrafficExport,
        onCancelResend: cancelResend,
        onClearFilters: clearFilters,
        onClearDiffFilter: clearDiffFilter,
        onClearDiffBase: clearDiffBase,
        onClearLogs: clearLogs,
        onCloseDetailModal: () => setIsDetailModalOpen(false),
        onCloseDiff: closeDiff,
        onCloseEndpointGroups: () => setIsEndpointGroupsOpen(false),
        onCloseFlowAnalysis: () => setIsFlowAnalysisOpen(false),
        onCloseRequestActivity: () => setIsRequestActivityOpen(false),
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
        onCloseDiffValue: closeDiffValue,
        onCloseComposerLibrary: () => {
          setComposer((current) => ({
            ...current,
            isLibraryOpen: false
          }));
        },
        onCloseSchemaInference: () => setIsSchemaInferenceOpen(false),
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
        onCycleDiffFilterFocus: cycleDiffFilterFocus,
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
        onFinishDiffFilter: () => setIsDiffFilterOpen(false),
        onFinishSearch: () => setIsFilterOpen(false),
        onQuit,
        onEditPendingResend: editPendingResend,
        onInsertComposerText: (value) => setComposer((current) => insertComposerText(current, value)),
        onAppendDiffFilter: (value) => {
          setDiffFilterQuery((current) => `${current}${value}`);
        },
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

          if (filterFocus === 'mode') {
            setSearchMode((current) => cycleValue(SEARCH_MODES, current, direction));
          }

          if (filterFocus === 'words') {
            setWordMatchMode((current) => cycleValue(WORD_MATCH_MODES, current, direction));
          }

          if (filterFocus === 'case') {
            setMatchCase((current) => !current);
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
        onMoveRequestActivity: moveRequestActivity,
        onMoveRequestActivityTo: moveRequestActivityTo,
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
        onMoveDiffFilterOption: moveDiffFilterOption,
        onMoveDiffFocus: moveDiffFocus,
        onMoveDiffFocusTo: moveDiffFocusTo,
        onMoveDiffValueScroll: moveDiffValueScroll,
        onMoveDiffValueScrollTo: moveDiffValueScrollTo,
        onMoveEndpointGroup: moveEndpointGroup,
        onMoveEndpointGroupTo: moveEndpointGroupTo,
        onMoveFlowAnalysis: moveFlowAnalysis,
        onMoveFlowAnalysisTo: moveFlowAnalysisTo,
        onMoveSchemaField: moveSchemaField,
        onMoveSchemaFieldTo: moveSchemaFieldTo,
        onMoveSchemaGroup: moveSchemaGroup,
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
          setIsRequestActivityOpen(false);
          setIsEndpointGroupsOpen(false);
          setIsSchemaInferenceOpen(false);
          setIsFlowAnalysisOpen(false);
          setIsDiffOpen(false);
          setIsFollowingLatest(false);
        },
        onOpenDetailModal: () => {
          if (inspectedLog) {
            setIsDetailModalOpen(true);
            setIsListFocused(false);
            setIsFilterOpen(false);
            setIsListDisplayOpen(false);
            setIsRequestActivityOpen(false);
            setIsEndpointGroupsOpen(false);
            setIsSchemaInferenceOpen(false);
            setIsFlowAnalysisOpen(false);
            setIsDiffOpen(false);
          }
        },
        onOpenDetailSearch: () => {
          setIsDetailSearchOpen(true);
          setIsFilterOpen(false);
          setIsListDisplayOpen(false);
          setIsRequestActivityOpen(false);
          setIsEndpointGroupsOpen(false);
          setIsSchemaInferenceOpen(false);
          setIsFlowAnalysisOpen(false);
          setIsDiffOpen(false);
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
        onOpenDiff: openDiff,
        onOpenDiffFilter: () => {
          setIsDiffFilterOpen(true);
          setDiffFilterFocus('query');
        },
        onOpenDiffValue: openDiffValue,
        onOpenHelp: () => setIsHelpOpen(true),
        onOpenListDisplay: openListDisplay,
        onOpenFlowAnalysis: openFlowAnalysis,
        onOpenSchemaInference: openSchemaInference,
        onInspectFlowAnalysis: inspectFlowAnalysis,
        onInspectRequestActivity: inspectRequestActivity,
        onMarkDiffBase: markDiffBase,
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
          if (shouldOpenDetailModalForInspect({ paneLayout, selectedLog })) {
            setIsDetailModalOpen(true);
            setIsListFocused(true);
            setIsFilterOpen(false);
            setIsListDisplayOpen(false);
            setIsRequestActivityOpen(false);
            setIsEndpointGroupsOpen(false);
            setIsSchemaInferenceOpen(false);
            setIsFlowAnalysisOpen(false);
            setIsDiffOpen(false);
          }
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

          if (filterFocus === 'mode') {
            setSearchMode((current) => cycleValue(SEARCH_MODES, current));
          }

          if (filterFocus === 'words') {
            setWordMatchMode((current) => cycleValue(WORD_MATCH_MODES, current));
          }

          if (filterFocus === 'case') {
            setMatchCase((current) => !current);
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
        onToggleDetailTab: (direction = 1) => {
          setDetailTab((current) => cycleValue(DETAIL_TABS, current, direction));
        },
        onToggleComposerField: () => setComposer(toggleFocusedComposerField),
        onToggleComposerReveal: () => {
          setComposer((current) => ({
            ...current,
            revealSecrets: !current.revealSecrets
          }));
        },
        onToggleDetailNode: toggleFocusedDetailNode,
        onToggleDiffLayout: toggleDiffLayout,
        onToggleDiffFilterOption: () => moveDiffFilterOption(1),
        onToggleFrameworkAssets: toggleFrameworkAssets,
        onToggleAnomalies: toggleAnomalies,
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
          commandContext,
          keyBindings,
          input: commandState.input,
          selectedIndex: commandState.selectedIndex,
          status: commandState.status
        })
        : (isHelpOpen
        ? h(HelpModal, {
          commandContext,
          helpContext,
          keyBindings
        })
        : (isListDisplayOpen
        ? h(ListDisplayModal, {
            focusIndex: listDisplayFocusIndex,
            hideFrameworkAssets,
            keyBindings,
            listDisplay: trafficListDisplay
          })
        : (isDiffOpen
          ? requestDiffNode
        : (isEndpointGroupsOpen
          ? endpointGroupsNode
        : (isSchemaInferenceOpen
          ? schemaInferenceNode
        : (isFlowAnalysisOpen
          ? flowAnalysisNode
        : (isRequestActivityOpen
          ? requestActivityNode
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
          : paneNodes)))))))))
    ),
    h(ToastNotification, { toast }),
    isDiffOpen && !commandState.isOpen && !isHelpOpen && !isListDisplayOpen
      ? (isDiffFilterVisible
        ? h(
          Box,
          {
            flexDirection: 'column',
            height: getRequestDiffFilterBoxHeight()
          },
          h(DiffFilterBar, {
            filterFocus: diffFilterFocus,
            filterQuery: diffFilterQuery,
            isFilterOpen: isDiffFilterOpen,
            keyBindings,
            matchCase: diffMatchCase,
            rows: filteredRequestDiffRows,
            searchMode: diffSearchMode,
            totalRows: requestDiffRows,
            wordMatchMode: diffWordMatchMode
          })
        )
        : footerNode)
      : (isFilterOpen
        ? h(FilterBar, {
        filterFocus,
        historyStatus,
        keyBindings,
        logsCount: logs.length,
        matchCase,
        methodFilters,
        methodOptionIndex,
        searchField,
        searchMode,
        searchQuery,
        statusFilters,
        statusOptionIndex,
        wordMatchMode,
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
          : footerNode)))
  );
}
