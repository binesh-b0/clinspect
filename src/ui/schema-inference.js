import React from 'react';
import { Box, Text } from 'ink';
import { getEndpointRoutePattern } from './endpoints.js';
import {
  getTerminalRows,
  h,
  pad,
  padLeft,
  truncate
} from './shared.js';
import {
  getContentType,
  getHeaderTokens
} from './traffic.js';

const SIDE_LABELS = Object.freeze({
  request: 'req',
  response: 'res'
});

const TYPE_ORDER = ['object', 'array', 'string', 'number', 'boolean', 'null'];
const TEXTUAL_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /(?:^|[+/.-])json$/,
  /(?:^|[+/.-])javascript$/,
  /(?:^|[+/.-])typescript$/
];

function isJsonContentType(contentType = '') {
  return /(?:^|[+/.-])json$/.test(contentType);
}

function isTextualContentType(contentType = '') {
  if (!contentType) {
    return true;
  }

  return TEXTUAL_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function hasEncodedBody(headers = {}) {
  return getHeaderTokens(headers, 'content-encoding')
    .some((encoding) => encoding && encoding !== 'identity');
}

function looksLikeJsonBody(body = '') {
  const trimmed = String(body ?? '').trim();

  return trimmed.startsWith('{') || trimmed.startsWith('[') ||
    /^-?\d(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed) ||
    /^(?:true|false|null|"[\s\S]*")$/.test(trimmed);
}

function getValueType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function sortTypes(types = []) {
  return [...types].sort((left, right) => {
    const leftIndex = TYPE_ORDER.indexOf(left);
    const rightIndex = TYPE_ORDER.indexOf(right);
    const normalizedLeft = leftIndex === -1 ? TYPE_ORDER.length : leftIndex;
    const normalizedRight = rightIndex === -1 ? TYPE_ORDER.length : rightIndex;

    return normalizedLeft - normalizedRight || left.localeCompare(right);
  });
}

function appendObjectPath(parentPath, key) {
  const textKey = String(key);

  if (/^[A-Za-z_$][\w$]*$/.test(textKey)) {
    return `${parentPath}.${textKey}`;
  }

  return `${parentPath}[${JSON.stringify(textKey)}]`;
}

function ensureSampleObservation(observations, path) {
  const existing = observations.get(path);

  if (existing) {
    return existing;
  }

  const observation = {
    array: false,
    arrayItemTypes: new Set(),
    emptyArray: false,
    nullable: false,
    path,
    types: new Set()
  };

  observations.set(path, observation);
  return observation;
}

function collectValueShape(value, path, observations) {
  const type = getValueType(value);
  const observation = ensureSampleObservation(observations, path);

  observation.types.add(type);

  if (type === 'null') {
    observation.nullable = true;
    return;
  }

  if (type === 'array') {
    observation.array = true;

    if (value.length === 0) {
      observation.emptyArray = true;
      return;
    }

    value.forEach((item) => {
      observation.arrayItemTypes.add(getValueType(item));
      collectValueShape(item, `${path}[]`, observations);
    });
    return;
  }

  if (type === 'object') {
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => collectValueShape(value[key], appendObjectPath(path, key), observations));
  }
}

function createFieldAccumulator(path) {
  return {
    array: false,
    arrayItemTypes: new Set(),
    emptyArrayCount: 0,
    nullable: false,
    path,
    presenceCount: 0,
    types: new Set()
  };
}

function mergeSampleObservations(fields, observations) {
  for (const observation of observations.values()) {
    const field = fields.get(observation.path) ?? createFieldAccumulator(observation.path);

    field.presenceCount += 1;
    field.array = field.array || observation.array;
    field.nullable = field.nullable || observation.nullable;
    field.emptyArrayCount += observation.emptyArray ? 1 : 0;
    observation.types.forEach((type) => field.types.add(type));
    observation.arrayItemTypes.forEach((type) => field.arrayItemTypes.add(type));
    fields.set(field.path, field);
  }
}

function createSchemaAccumulator(log = {}, side = 'response') {
  const method = String(log.method ?? 'GET').toUpperCase();
  const routePattern = getEndpointRoutePattern(log.path ?? '/');

  return {
    fields: new Map(),
    id: `${method} ${routePattern} ${side}`,
    jsonSampleCount: 0,
    method,
    parseFailureCount: 0,
    routePattern,
    side,
    skippedCount: 0,
    trafficCount: 0
  };
}

function getGroupSortKey(group = {}) {
  return `${group.method} ${group.routePattern} ${group.side}`;
}

function compareSchemaGroups(left, right) {
  return right.driftFieldCount - left.driftFieldCount ||
    right.optionalFieldCount - left.optionalFieldCount ||
    right.jsonSampleCount - left.jsonSampleCount ||
    getGroupSortKey(left).localeCompare(getGroupSortKey(right));
}

function hasNonNullDrift(types) {
  return sortTypes(types).filter((type) => type !== 'null').length > 1;
}

function formatArrayType(field) {
  if (!field.array) {
    return null;
  }

  const itemTypes = sortTypes(field.arrayItemTypes);

  return itemTypes.length === 0
    ? 'array<empty>'
    : `array<${itemTypes.join('|')}>`;
}

function createTypeLabels(field) {
  const baseTypes = sortTypes(field.types).filter((type) => type !== 'array' && type !== 'null');
  const arrayType = formatArrayType(field);
  const labels = [
    ...(arrayType ? [arrayType] : []),
    ...baseTypes
  ];

  if (labels.length === 0 && field.nullable) {
    return ['null'];
  }

  return labels.length > 0 ? labels : ['unknown'];
}

function finalizeFieldRow(field, sampleCount) {
  const nonNullTypes = sortTypes(field.types).filter((type) => type !== 'null');
  const nonNullArrayItemTypes = sortTypes(field.arrayItemTypes).filter((type) => type !== 'null');
  const drift = hasNonNullDrift(field.types) || nonNullArrayItemTypes.length > 1;
  const presenceRate = sampleCount === 0 ? 0 : field.presenceCount / sampleCount;

  return {
    array: field.array,
    drift,
    nullable: field.nullable,
    path: field.path,
    presenceCount: field.presenceCount,
    presenceRate,
    sampleCount,
    types: createTypeLabels(field),
    optional: field.presenceCount < sampleCount,
    _sortDepth: field.path.split('.').length + (field.path.match(/\[\]/g) ?? []).length,
    _sortNonNullTypes: nonNullTypes,
    _sortArrayItemTypes: nonNullArrayItemTypes
  };
}

function compareSchemaRows(left, right) {
  if (left.path === '$') {
    return -1;
  }
  if (right.path === '$') {
    return 1;
  }

  return left.path.localeCompare(right.path);
}

function finalizeSchemaGroup(group) {
  const rows = [...group.fields.values()]
    .map((field) => finalizeFieldRow(field, group.jsonSampleCount))
    .sort(compareSchemaRows)
    .map(({ _sortDepth, _sortNonNullTypes, _sortArrayItemTypes, ...row }) => row);
  const optionalFieldCount = rows.filter((row) => row.optional).length;
  const nullableFieldCount = rows.filter((row) => row.nullable).length;
  const driftFieldCount = rows.filter((row) => row.drift).length;

  return {
    driftFieldCount,
    fieldCount: rows.length,
    jsonSampleCount: group.jsonSampleCount,
    method: group.method,
    nullableFieldCount,
    optionalFieldCount,
    parseFailureCount: group.parseFailureCount,
    routePattern: group.routePattern,
    rows,
    side: group.side,
    skippedCount: group.skippedCount,
    trafficCount: group.trafficCount
  };
}

export function parseJsonPayloadForSchema(payload = {}) {
  const body = String(payload.body ?? '');
  const trimmed = body.trim();
  const contentType = getContentType(payload.headers);

  if (!trimmed) {
    return { parsed: false, reason: 'empty', skipped: true, value: null };
  }

  if (payload.truncated) {
    return { parsed: false, reason: 'truncated', skipped: true, value: null };
  }

  if (hasEncodedBody(payload.headers)) {
    return { parsed: false, reason: 'encoded', skipped: true, value: null };
  }

  const jsonLike = isJsonContentType(contentType) || looksLikeJsonBody(trimmed);

  if (!jsonLike) {
    return {
      parsed: false,
      reason: isTextualContentType(contentType) ? 'non-json' : 'binary',
      skipped: true,
      value: null
    };
  }

  try {
    return {
      parsed: true,
      reason: 'parsed',
      skipped: false,
      value: JSON.parse(trimmed)
    };
  } catch {
    return {
      parsed: false,
      reason: 'invalid-json',
      skipped: false,
      value: null
    };
  }
}

export function inferJsonShape(value) {
  const observations = new Map();

  collectValueShape(value, '$', observations);

  const fields = new Map();
  mergeSampleObservations(fields, observations);

  const rows = [...fields.values()]
    .map((field) => finalizeFieldRow(field, 1))
    .sort(compareSchemaRows)
    .map(({ _sortDepth, _sortNonNullTypes, _sortArrayItemTypes, ...row }) => row);

  return {
    driftFieldCount: rows.filter((row) => row.drift).length,
    fieldCount: rows.length,
    nullableFieldCount: rows.filter((row) => row.nullable).length,
    optionalFieldCount: rows.filter((row) => row.optional).length,
    rows
  };
}

export function createSchemaGroups(logs = []) {
  const groups = new Map();

  for (const log of logs ?? []) {
    for (const side of ['request', 'response']) {
      const seed = createSchemaAccumulator(log, side);
      const group = groups.get(seed.id) ?? seed;
      const payload = side === 'response' ? log?.response : log?.request;
      const parsed = parseJsonPayloadForSchema(payload);

      group.trafficCount += 1;

      if (parsed.parsed) {
        group.jsonSampleCount += 1;
        const observations = new Map();
        collectValueShape(parsed.value, '$', observations);
        mergeSampleObservations(group.fields, observations);
      } else if (parsed.skipped) {
        group.skippedCount += 1;
      } else {
        group.parseFailureCount += 1;
      }

      groups.set(group.id, group);
    }
  }

  return [...groups.values()]
    .filter((group) => group.jsonSampleCount > 0)
    .map(finalizeSchemaGroup)
    .sort(compareSchemaGroups);
}

function formatPercent(value = 0) {
  const percent = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);

  return `${percent}%`;
}

function getSchemaRowWidths(width = 80) {
  const safeWidth = Math.max(42, Math.floor(Number(width) || 80));
  const markerWidth = 2;
  const driftWidth = 2;
  const seenWidth = 7;
  const nullWidth = 5;
  const arrayWidth = 4;
  const gapWidth = 6;
  const typeWidth = Math.max(10, Math.min(28, Math.floor(safeWidth * 0.28)));
  const fixedWidth = markerWidth + driftWidth + typeWidth + seenWidth + nullWidth + arrayWidth + gapWidth;
  const pathWidth = Math.max(8, safeWidth - fixedWidth);

  return {
    arrayWidth,
    driftWidth,
    markerWidth,
    nullWidth,
    pathWidth,
    seenWidth,
    typeWidth
  };
}

function formatTypes(types = []) {
  return types.join('|') || 'unknown';
}

export function formatSchemaRow(row = {}, options = {}) {
  const selected = Boolean(options.selected);
  const widths = getSchemaRowWidths(options.width);
  const marker = pad(selected ? '>' : '', widths.markerWidth);
  const drift = pad(row.drift ? '!' : '', widths.driftWidth);
  const path = pad(truncate(row.path ?? '$', widths.pathWidth), widths.pathWidth);
  const types = pad(truncate(formatTypes(row.types), widths.typeWidth), widths.typeWidth);
  const seen = padLeft(formatPercent(row.presenceRate), widths.seenWidth);
  const nullable = pad(row.nullable ? 'null' : '', widths.nullWidth);
  const array = pad(row.array ? 'arr' : '', widths.arrayWidth);

  return [
    marker,
    drift,
    path,
    types,
    seen,
    nullable,
    array
  ].join(' ');
}

function formatSchemaHeader(width = 80) {
  const widths = getSchemaRowWidths(width);

  return [
    pad('', widths.markerWidth),
    pad('!', widths.driftWidth),
    pad('path', widths.pathWidth),
    pad('types', widths.typeWidth),
    padLeft('seen', widths.seenWidth),
    pad('null', widths.nullWidth),
    pad('arr', widths.arrayWidth)
  ].join(' ');
}

function getSchemaVisibleCount(terminalRows = process.stdout.rows) {
  return Math.max(4, getTerminalRows(terminalRows) - 14);
}

function getSchemaVisibleStart(rows = [], focusedIndex = 0, visibleCount = 1) {
  const safeVisibleCount = Math.max(1, Math.floor(Number(visibleCount) || 1));
  const maxStart = Math.max(0, rows.length - safeVisibleCount);
  const safeFocusedIndex = Math.max(0, Math.min(rows.length - 1, Math.floor(Number(focusedIndex) || 0)));

  return Math.max(0, Math.min(
    safeFocusedIndex - Math.floor(safeVisibleCount / 2),
    maxStart
  ));
}

function getSchemaSummary(groups = [], totalLogs = 0) {
  const jsonSamples = groups.reduce((total, group) => total + group.jsonSampleCount, 0);
  const driftFields = groups.reduce((total, group) => total + group.driftFieldCount, 0);
  const parseFailures = groups.reduce((total, group) => total + group.parseFailureCount, 0);
  const visibleLogs = Number.isFinite(Number(totalLogs)) ? Number(totalLogs) : 0;

  return `${groups.length} schema groups | ${jsonSamples} JSON samples | ${driftFields} drift fields | ${parseFailures} parse failures | ${visibleLogs} visible requests`;
}

function formatGroupTitle(group = {}, index = 0, total = 0, width = 80) {
  const label = `${group.method ?? 'GET'} ${group.routePattern ?? '/'} ${SIDE_LABELS[group.side] ?? group.side ?? 'body'}`;
  const stats = `${group.jsonSampleCount}/${group.trafficCount} JSON | ${group.fieldCount} fields | ${group.optionalFieldCount} optional | ${group.nullableFieldCount} nullable | ${group.driftFieldCount} drift`;

  return `${truncate(label, Math.max(12, width - stats.length - 14))} | group ${index + 1}/${total} | ${stats}`;
}

function schemaRowColor(row = {}, selected = false) {
  if (selected) {
    return 'black';
  }

  if (row.drift) {
    return 'red';
  }

  if (row.optional || row.nullable) {
    return 'yellow';
  }

  return 'white';
}

export const SchemaInferenceModal = React.memo(function SchemaInferenceModal({
  focusedGroupIndex = 0,
  focusedRowIndex = 0,
  groups = [],
  totalLogs = groups.length
}) {
  const columns = Number.isFinite(process.stdout.columns) && process.stdout.columns > 0
    ? process.stdout.columns
    : 80;
  const width = Math.max(52, Math.min(128, columns - 8));
  const contentWidth = Math.max(46, width - 6);
  const safeFocusedGroupIndex = Math.max(0, Math.min(groups.length - 1, focusedGroupIndex));
  const activeGroup = groups[safeFocusedGroupIndex] ?? null;
  const rows = activeGroup?.rows ?? [];
  const safeFocusedRowIndex = Math.max(0, Math.min(rows.length - 1, focusedRowIndex));
  const visibleCount = getSchemaVisibleCount();
  const startIndex = getSchemaVisibleStart(rows, safeFocusedRowIndex, visibleCount);
  const visibleRows = rows.slice(startIndex, startIndex + visibleCount);

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
      h(Text, { color: 'cyan', bold: true }, 'Schema inference'),
      h(Text, { color: 'gray', wrap: 'truncate' }, getSchemaSummary(groups, totalLogs)),
      activeGroup
        ? h(Text, { color: 'gray', wrap: 'truncate' }, formatGroupTitle(activeGroup, safeFocusedGroupIndex, groups.length, contentWidth))
        : h(Text, { color: 'gray', wrap: 'truncate' }, 'Current filtered traffic | JSON request/response bodies only'),
      h(Text, {}, ''),
      groups.length === 0
        ? h(Text, { color: 'gray' }, 'No JSON request or response bodies in visible traffic')
        : [
          h(Text, { key: 'schema-header', color: 'gray', wrap: 'truncate' }, formatSchemaHeader(contentWidth)),
          ...visibleRows.map((row, index) => {
            const absoluteIndex = startIndex + index;
            const selected = absoluteIndex === safeFocusedRowIndex;

            return h(Text, {
              key: `${activeGroup.method} ${activeGroup.routePattern} ${activeGroup.side} ${row.path}`,
              backgroundColor: selected ? 'cyan' : undefined,
              color: schemaRowColor(row, selected),
              wrap: 'truncate'
            }, formatSchemaRow(row, {
              selected,
              width: contentWidth
            }));
          })
        ]
    )
  );
});
