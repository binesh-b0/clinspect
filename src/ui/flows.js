import React from 'react';
import { Box, Text } from 'ink';
import {
  getTerminalRows,
  h,
  truncate
} from './shared.js';
import { formatFlowLabel } from '../flow-analysis.js';

export function formatFlowSpan(value) {
  const duration = Number(value);

  if (!Number.isFinite(duration) || duration <= 0) {
    return '<1s';
  }

  if (duration < 1000) {
    return `${Math.round(duration)}ms`;
  }

  return `${Math.round(duration / 1000)}s`;
}

function getFlowSpanMs(group = {}) {
  if (Number.isFinite(Number(group.durationMs))) {
    return Number(group.durationMs);
  }

  if (Number.isFinite(Number(group.startTimestamp)) && Number.isFinite(Number(group.latestTimestamp))) {
    return Math.max(0, Number(group.latestTimestamp) - Number(group.startTimestamp));
  }

  return 0;
}

export function getFlowDisplayGroups(analysis = {}) {
  return [
    ...(analysis.redirectChains ?? []),
    ...(analysis.repeatGroups ?? [])
  ];
}

export function shouldUseWideFlowLayout(width = 80) {
  return Math.max(0, Number(width) || 0) >= 96;
}

function getFinalDestinationLabel(group = {}) {
  if (group.kind !== 'redirect') {
    return '';
  }

  if (group.complete) {
    return `${group.finalStatusCode ?? '---'} ${group.finalDestination ?? 'unknown destination'}`;
  }

  return group.finalDestination ?? 'next request not captured';
}

export function formatFlowHeadline(group = {}) {
  if (group.kind === 'redirect') {
    const start = `${group.start?.method ?? 'GET'} ${group.start?.path ?? '/'}`;
    const final = group.finalPath ?? group.finalDestination ?? 'unknown destination';

    return `${group.statusTrail || 'redirect'} ${start} -> ${final}`;
  }

  return `${formatFlowLabel(group)} ${group.count ?? 0}x ${group.method ?? 'GET'} ${group.path ?? '/'}`;
}

export function formatFlowMetadata(group = {}) {
  if (group.kind === 'redirect') {
    const hopLabel = group.hopCount === 1 ? '1 hop' : `${group.hopCount ?? 0} hops`;
    const stateLabel = group.complete ? 'complete' : 'incomplete';

    return `${stateLabel} | ${hopLabel} | span ${formatFlowSpan(getFlowSpanMs(group))} | final ${getFinalDestinationLabel(group)}`;
  }

  return `span ${formatFlowSpan(getFlowSpanMs(group))} | statuses ${group.statusTrail || '---'} | ${group.count ?? 0} matching requests`;
}

export function formatFlowRow(group = {}, options = {}) {
  const selected = Boolean(options.selected);
  const width = Math.max(16, Number(options.width) || 80);
  const prefix = selected ? '> ' : '  ';

  return truncate(`${prefix}${formatFlowHeadline(group)}`, width);
}

function getFlowVisibleCount(terminalRows = process.stdout.rows) {
  return Math.max(4, getTerminalRows(terminalRows) - 12);
}

function getFlowVisibleStart(groups = [], focusedIndex = 0, visibleCount = 1) {
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const maxStart = Math.max(0, groups.length - safeVisibleCount);
  const safeFocusedIndex = Math.max(0, Math.min(groups.length - 1, Math.floor(Number(focusedIndex) || 0)));

  return Math.max(0, Math.min(
    safeFocusedIndex - Math.floor(safeVisibleCount / 2),
    maxStart
  ));
}

function getFlowSummary(analysis = {}, totalLogs = 0) {
  const chainCount = analysis.redirectChains?.length ?? 0;
  const repeatCount = analysis.repeatGroups?.length ?? 0;
  const flowCount = analysis.groups?.length ?? 0;
  const requestCount = Number.isFinite(Number(totalLogs)) ? Number(totalLogs) : 0;

  return `${flowCount} flows | ${chainCount} redirect chains | ${repeatCount} repeat groups | ${requestCount} visible requests`;
}

function getFlowAccentColor(group = {}) {
  return group.kind === 'redirect' ? 'yellow' : 'magenta';
}

function truncateLine(line = {}, width = 80) {
  return {
    ...line,
    text: truncate(line.text, Math.max(10, width))
  };
}

export function getFlowPreviewRows(group = {}, options = {}) {
  if (!group?.kind) {
    return [{
      id: 'empty',
      text: 'No flow selected',
      color: 'gray'
    }];
  }

  if (group.kind === 'redirect') {
    return [
      {
        id: 'headline',
        text: formatFlowHeadline(group),
        color: 'yellow',
        bold: true
      },
      {
        id: 'metadata',
        text: formatFlowMetadata(group),
        color: 'gray'
      },
      ...((group.hops ?? []).map((hop, index) => {
        const selected = options.selectedLogId !== undefined && options.selectedLogId !== null && String(hop.logId) === String(options.selectedLogId);
        const marker = selected ? '> ' : '  ';

        return {
          id: `hop-${index}`,
          text: `${marker}${index + 1}. ${hop.statusCode ?? '---'} ${hop.method} ${hop.path} -> ${hop.destination}`,
          color: selected ? 'cyan' : undefined,
          bold: selected
        };
      })),
      (() => {
        const selected = options.selectedLogId !== undefined
          && options.selectedLogId !== null
          && group.finalLogId !== null
          && group.finalLogId !== undefined
          && String(group.finalLogId) === String(options.selectedLogId);
        const marker = selected ? '> ' : '';

        return {
          id: 'final',
          text: group.complete
            ? `${marker}final ${group.finalStatusCode ?? '---'} ${group.finalDestination ?? 'unknown destination'}`
            : `${marker}final ${group.finalDestination ?? 'next request not captured'}`,
          color: selected ? 'cyan' : (group.complete ? undefined : 'yellow'),
          bold: selected
        };
      })()
    ];
  }

  return [
    {
      id: 'headline',
      text: formatFlowHeadline(group),
      color: 'magenta',
      bold: true
    },
    {
      id: 'metadata',
      text: formatFlowMetadata(group),
      color: 'gray'
    },
    {
      id: 'statuses',
      text: `statuses ${group.statusTrail || '---'}`,
      color: 'gray'
    },
    {
      id: 'related',
      text: `related ${group.logIds?.join(', ') || 'none'}`,
      color: 'gray'
    }
  ];
}

function renderFlowPreview(group, width) {
  return h(
    Box,
    {
      flexDirection: 'column',
      width
    },
    h(Text, { color: 'cyan', bold: true }, 'Selected flow'),
    ...getFlowPreviewRows(group).map((line) => {
      const row = truncateLine(line, width);

      return h(Text, {
        key: `preview-${line.id}`,
        bold: row.bold,
        color: row.color,
        wrap: 'truncate'
      }, row.text);
    })
  );
}

function renderFlowGroupRow(group, index, focusedIndex, width) {
  const selected = index === focusedIndex;

  return h(
    Box,
    {
      key: group.id,
      flexDirection: 'column',
      marginBottom: 1,
      width
    },
    h(Text, {
      backgroundColor: selected ? 'cyan' : undefined,
      bold: selected,
      color: selected ? 'black' : getFlowAccentColor(group),
      wrap: 'truncate'
    }, formatFlowRow(group, { selected, width })),
    h(Text, { color: 'gray', wrap: 'truncate' }, truncate(`  ${formatFlowMetadata(group)}`, width))
  );
}

function getFlowListEntries(analysis = {}) {
  const redirectGroups = analysis.redirectChains ?? [];
  const repeatGroups = analysis.repeatGroups ?? [];

  return [
    {
      key: 'redirect-heading',
      title: 'Redirect chains',
      type: 'heading'
    },
    ...(redirectGroups.length === 0
      ? [{
        key: 'redirect-empty',
        text: '  none',
        type: 'empty'
      }]
      : redirectGroups.map((group, index) => ({
        group,
        index,
        key: group.id,
        type: 'group'
      }))),
    {
      key: 'section-space',
      type: 'spacer'
    },
    {
      key: 'repeat-heading',
      title: 'Repeated requests',
      type: 'heading'
    },
    ...(repeatGroups.length === 0
      ? [{
        key: 'repeat-empty',
        text: '  none',
        type: 'empty'
      }]
      : repeatGroups.map((group, index) => ({
        group,
        index: redirectGroups.length + index,
        key: group.id,
        type: 'group'
      })))
  ];
}

function renderFlowListEntry(entry, focusedIndex, listWidth) {
  if (entry.type === 'heading') {
    return h(Text, { key: entry.key, color: 'cyan', bold: true }, entry.title);
  }

  if (entry.type === 'empty') {
    return h(Text, { key: entry.key, color: 'gray' }, entry.text);
  }

  if (entry.type === 'spacer') {
    return h(Text, { key: entry.key }, '');
  }

  return renderFlowGroupRow(entry.group, entry.index, focusedIndex, listWidth);
}

export const FlowAnalysisModal = React.memo(function FlowAnalysisModal({
  analysis = { groups: [], redirectChains: [], repeatGroups: [] },
  focusedIndex = 0,
  terminalColumns = process.stdout.columns,
  terminalRows = process.stdout.rows,
  totalLogs = analysis.groups?.length ?? 0
}) {
  const groups = getFlowDisplayGroups(analysis);
  const columns = Number.isFinite(terminalColumns) && terminalColumns > 0
    ? terminalColumns
    : 80;
  const width = Math.max(46, Math.min(124, columns - 8));
  const contentWidth = Math.max(40, width - 6);
  const useWideLayout = shouldUseWideFlowLayout(contentWidth);
  const listWidth = useWideLayout ? Math.max(38, Math.floor(contentWidth * 0.54)) : contentWidth;
  const previewWidth = useWideLayout ? Math.max(28, contentWidth - listWidth - 3) : contentWidth;
  const safeFocusedIndex = Math.max(0, Math.min(groups.length - 1, focusedIndex));
  const visibleCount = Math.max(2, getFlowVisibleCount(terminalRows) - (useWideLayout ? 0 : 7));
  const listEntries = getFlowListEntries(analysis);
  const focusedEntryIndex = Math.max(0, listEntries.findIndex((entry) => (
    entry.type === 'group' && entry.index === safeFocusedIndex
  )));
  const startIndex = getFlowVisibleStart(listEntries, focusedEntryIndex, visibleCount);
  const visibleEntries = listEntries.slice(startIndex, startIndex + visibleCount);
  const selectedGroup = groups[safeFocusedIndex] ?? null;
  const position = groups.length === 0
    ? 'none'
    : `${safeFocusedIndex + 1}/${groups.length}`;
  const listNode = h(
    Box,
    {
      flexDirection: 'column',
      width: listWidth
    },
    ...visibleEntries.map((entry) => renderFlowListEntry(entry, safeFocusedIndex, listWidth))
  );
  const previewNode = renderFlowPreview(selectedGroup, previewWidth);

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
      h(Text, { color: 'cyan', bold: true }, 'Flows'),
      h(Text, { color: 'gray', wrap: 'truncate' }, getFlowSummary(analysis, totalLogs)),
      h(Text, { color: 'gray', wrap: 'truncate' }, `Current filtered traffic | grouped by type | recent first in each section | item ${position}`),
      h(Text, {}, ''),
      groups.length === 0
        ? h(Text, { color: 'gray' }, 'No redirect chains or repeated requests in visible traffic')
        : (useWideLayout
          ? h(
            Box,
            { flexDirection: 'row', width: contentWidth },
            listNode,
            h(Box, { width: 3 }, h(Text, {}, '')),
            previewNode
          )
          : h(
            Box,
            { flexDirection: 'column', width: contentWidth },
            listNode,
            h(Text, {}, ''),
            previewNode
          )),
      h(Text, {}, ''),
      h(Text, { color: 'gray', wrap: 'truncate' }, 'enter inspect | esc/q close')
    )
  );
});
