import React from 'react';
import { XMLParser } from 'fast-xml-parser';
import { parseDocument } from 'htmlparser2';
import { Box, Text } from 'ink';
import { detectAuthSecrets } from '../auth-secrets.js';
import {
  analyzeCacheHeaders,
  formatCacheIssue
} from '../cache-analysis.js';
import {
  analyzeTrafficFlows
} from '../flow-analysis.js';
import {
  findJwtTokensInLog,
  formatJwtTimeClaim
} from '../jwt-inspector.js';
import { analyzePagination } from '../pagination.js';
import { parseQueryParameters } from '../query-params.js';
import {
  BODY_LINE_MAX_LENGTH,
  TEXTUAL_CONTENT_TYPE_PATTERNS,
  h,
  getTerminalRows,
  truncate
} from './shared.js';
import {
  getContentType,
  getDisplayHeaderValue,
  getHeaderTokens
} from './traffic.js';
import {
  DEFAULT_KEY_BINDINGS,
  formatKeyToken,
  getBindingLabel,
  getBindingPairLabel
} from './key-bindings.js';
import {
  getFlowPreviewRows
} from './flows.js';

function getDetailBindingLabel(keyBindings, actionId, options = {}) {
  return getBindingLabel(keyBindings, actionId, options);
}

function getDetailBindingPairLabel(keyBindings, firstActionId, secondActionId, options = {}) {
  return getBindingPairLabel(keyBindings, firstActionId, secondActionId, options);
}

function getReversedBindingLabel(keyBindings, actionId) {
  const tokens = keyBindings?.[actionId] ?? DEFAULT_KEY_BINDINGS[actionId] ?? [];
  const firstToken = tokens[1] ?? tokens[0];
  const secondToken = tokens[0];

  if (!firstToken || !secondToken) {
    return firstToken ? formatKeyToken(firstToken) : 'unbound';
  }

  return `${formatKeyToken(firstToken)}/${formatKeyToken(secondToken)}`;
}

function formatDetailTabLabel(detailTab = 'request') {
  return [
    ['request', 'Request'],
    ['response', 'Response'],
    ['auth', 'Auth'],
    ['cache', 'Cache'],
    ['flow', 'Flow']
  ].map(([tab, label]) => (detailTab === tab ? `[${label}]` : label)).join(' ');
}

function hasEncodedBody(headers = {}) {
  const encodings = getHeaderTokens(headers, 'content-encoding');

  return encodings.some((encoding) => encoding !== 'identity');
}

function isTextualContentType(contentType) {
  if (!contentType) {
    return true;
  }

  return TEXTUAL_CONTENT_TYPE_PATTERNS.some((pattern) => pattern.test(contentType));
}

function isJsonContentType(contentType) {
  return /(?:^|[+/.-])json$/.test(contentType);
}

function formatHeaderDetailRows(headers, options = {}, idPrefix = 'headers') {
  const entries = Object.entries(headers ?? {});

  if (entries.length === 0) {
    return [createDetailRow({
      id: `${idPrefix}-empty`,
      text: '(none)',
      type: 'header'
    })];
  }

  return entries.flatMap(([key, value], entryIndex) => {
    const displayValue = getDisplayHeaderValue(key, value, options);
    const values = Array.isArray(displayValue) ? displayValue : [displayValue];

    return values.flatMap((item, valueIndex) => {
      const prefix = `${key}: `;
      const safeValue = sanitizeTerminalText(item);
      const path = `headers.${key}`;
      const chunkLength = Math.max(20, BODY_LINE_MAX_LENGTH - prefix.length);
      const chunks = splitLongBodyLine(safeValue, chunkLength);

      return chunks.map((chunk, chunkIndex) => {
        const isContinuation = chunkIndex > 0;
        const continuationPrefix = ' '.repeat(prefix.length);
        const text = isContinuation ? `${continuationPrefix}${chunk}` : `${prefix}${chunk}`;

        return createDetailRow({
          id: `${idPrefix}-header-${entryIndex}-${valueIndex}-${chunkIndex}`,
          path,
          searchText: [text, path].join(' '),
          segments: isContinuation
            ? [
              { text: continuationPrefix, color: 'gray' },
              { text: chunk }
            ]
            : [
              { text: key, color: 'cyan' },
              { text: ': ', color: 'gray' },
              { text: chunk }
            ],
          text,
          type: 'header'
        });
      });
    });
  });
}

function formatAuthSecretDetailRows(log, options = {}) {
  const findings = detectAuthSecrets(log);
  const jwtTokens = findJwtTokensInLog(log, options);
  const titleRow = createDetailRow({
    id: 'auth-title',
    segments: [{ text: 'Auth & secrets', color: 'cyan', bold: true }],
    type: 'section'
  });

  if (findings.length === 0 && jwtTokens.length === 0) {
    return [
      titleRow,
      createDetailRow({
        id: 'auth-empty',
        segments: [{ text: 'No auth or secret candidates', color: 'gray' }],
        text: 'No auth or secret candidates',
        type: 'empty'
      })
    ];
  }

  return [
    titleRow,
    ...findings.map((finding) => {
      const text = `[${finding.badge}] ${finding.location}`;

      return createDetailRow({
        id: `auth-${finding.id}`,
        matchText: `${finding.badge} ${finding.type} ${finding.location}`,
        searchText: `${finding.badge} ${finding.type} ${finding.location}`,
        segments: [
          { text: '[', color: 'gray' },
          { text: finding.badge, color: 'yellow', bold: true },
          { text: '] ', color: 'gray' },
          { text: finding.location }
        ],
        text,
        type: 'auth-secret'
      });
    }),
    ...formatJwtInspectorDetailRows(jwtTokens, { showEmpty: findings.length > 0 })
  ];
}

function formatCacheHeaderDetailRow(row) {
  return createDetailRow({
    id: `cache-header-${row.id}`,
    matchText: `cache ${row.label} ${row.summary}`,
    searchText: `cache ${row.label} ${row.name} ${row.summary} ${row.text}`,
    segments: [
      { text: row.label, color: 'cyan' },
      { text: ': ', color: 'gray' },
      { text: row.value },
      ...(row.summary
        ? [
          { text: ' | ', color: 'gray' },
          { text: row.summary, color: 'yellow' }
        ]
        : [])
    ],
    text: row.text,
    type: 'cache-header'
  });
}

function formatCacheContextDetailRow(row) {
  const [label, rest = ''] = row.text.split(/: (.*)/s);

  return createDetailRow({
    id: `cache-${row.id}`,
    matchText: `cache context ${row.text}`,
    searchText: `cache context ${row.label} ${row.value} ${row.text}`,
    segments: [
      { text: label, color: 'gray' },
      { text: ': ', color: 'gray' },
      { text: rest }
    ],
    text: row.text,
    type: 'cache-context'
  });
}

function formatCacheIssueDetailRow(issue) {
  const text = formatCacheIssue(issue);

  return createDetailRow({
    id: `cache-issue-${issue.id}`,
    matchText: `cache possible issue ${issue.message}`,
    searchText: `cache possible issue ${issue.id} ${issue.message}`,
    segments: [{ text, color: 'yellow', bold: true }],
    text,
    type: 'cache-issue'
  });
}

function formatCacheAnalysisDetailRows(log, options = {}) {
  const analysis = analyzeCacheHeaders(log, options);
  const titleRow = createDetailRow({
    id: 'cache-headers-title',
    segments: [{ text: 'Cache headers', color: 'cyan', bold: true }],
    type: 'section'
  });

  if (analysis.headers.length === 0 && analysis.issues.length === 0) {
    return [
      titleRow,
      createDetailRow({
        id: 'cache-empty',
        segments: [{ text: 'No cache headers captured', color: 'gray' }],
        text: 'No cache headers captured',
        type: 'empty'
      })
    ];
  }

  const contextRows = analysis.rows.filter((row) => row.section === 'context');
  const headerRows = analysis.headers.length > 0
    ? analysis.headers.map(formatCacheHeaderDetailRow)
    : [
      createDetailRow({
        id: 'cache-empty',
        segments: [{ text: 'No cache headers captured', color: 'gray' }],
        text: 'No cache headers captured',
        type: 'empty'
      })
    ];

  return [
    titleRow,
    ...headerRows,
    createDetailRow({ id: 'cache-context-spacer', text: '', type: 'blank' }),
    createDetailRow({
      id: 'cache-context-title',
      segments: [{ text: 'Context', color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...contextRows.map(formatCacheContextDetailRow),
    ...(analysis.issues.length > 0
      ? [
        createDetailRow({ id: 'cache-issues-spacer', text: '', type: 'blank' }),
        createDetailRow({
          id: 'cache-issues-title',
          segments: [{ text: 'Possible issues', color: 'cyan', bold: true }],
          type: 'section'
        }),
        ...analysis.issues.map(formatCacheIssueDetailRow)
      ]
      : [])
  ];
}

function getFlowContextForLog(log, options = {}) {
  const logId = log?.id === undefined || log?.id === null ? null : String(log.id);

  if (options.flowContext) {
    return options.flowContext;
  }

  if (logId && options.flowAnalysis?.logContextById instanceof Map) {
    return options.flowAnalysis.logContextById.get(logId) ?? {
      redirectChains: [],
      repeatGroups: []
    };
  }

  if (Array.isArray(options.flowLogs)) {
    return analyzeTrafficFlows(options.flowLogs).logContextById.get(logId) ?? {
      redirectChains: [],
      repeatGroups: []
    };
  }

  return {
    redirectChains: [],
    repeatGroups: []
  };
}

function formatFlowPreviewDetailRow(line, index, idPrefix, searchPrefix) {
  return createDetailRow({
    id: `${idPrefix}-${line.id}-${index}`,
    matchText: `${searchPrefix} ${line.text}`,
    searchText: `${searchPrefix} ${line.text}`,
    segments: [{
      text: line.text,
      color: line.color,
      bold: line.bold
    }],
    text: line.text,
    type: 'flow'
  });
}

function createFlowPositionDetailRow(idPrefix, entry, searchPrefix) {
  const text = `position ${entry.position}/${entry.total}`;

  return createDetailRow({
    id: `${idPrefix}-position`,
    matchText: `${searchPrefix} ${text}`,
    searchText: `${searchPrefix} ${text}`,
    segments: [{ text, color: 'gray' }],
    text,
    type: 'flow'
  });
}

function formatRedirectChainDetailRows(entry, selectedLogId) {
  const chain = entry.chain;
  const idPrefix = `flow-redirect-${chain.id}`;
  const searchPrefix = 'flow redirect chain';
  const previewRows = getFlowPreviewRows(chain, { selectedLogId });

  return [
    ...previewRows.slice(0, 2).map((line, index) => formatFlowPreviewDetailRow(
      line,
      index,
      idPrefix,
      searchPrefix
    )),
    createFlowPositionDetailRow(idPrefix, entry, searchPrefix),
    ...previewRows.slice(2).map((line, index) => formatFlowPreviewDetailRow(
      line,
      index + 2,
      idPrefix,
      searchPrefix
    ))
  ];
}

function formatRepeatGroupDetailRows(entry) {
  const group = entry.group;
  const idPrefix = `flow-repeat-${group.id}`;
  const searchPrefix = 'flow repeated requests';
  const previewRows = getFlowPreviewRows(group);

  return [
    ...previewRows.slice(0, 2).map((line, index) => formatFlowPreviewDetailRow(
      line,
      index,
      idPrefix,
      searchPrefix
    )),
    createFlowPositionDetailRow(idPrefix, entry, searchPrefix),
    ...previewRows.slice(2).map((line, index) => formatFlowPreviewDetailRow(
      line,
      index + 2,
      idPrefix,
      searchPrefix
    ))
  ];
}

function formatFlowDetailRows(log, options = {}) {
  const context = getFlowContextForLog(log, options);
  const redirectChains = context.redirectChains ?? [];
  const repeatGroups = context.repeatGroups ?? [];
  const titleRow = createDetailRow({
    id: 'flow-title',
    segments: [{ text: 'Flow context', color: 'cyan', bold: true }],
    type: 'section'
  });

  if (redirectChains.length === 0 && repeatGroups.length === 0) {
    return [
      titleRow,
      createDetailRow({
        id: 'flow-empty',
        segments: [{ text: 'No flow context for selected request', color: 'gray' }],
        text: 'No flow context for selected request',
        type: 'empty'
      })
    ];
  }

  return [
    titleRow,
    ...(redirectChains.length > 0
      ? [
        createDetailRow({
          id: 'flow-redirect-title',
          segments: [{ text: 'Redirect chain', color: 'cyan', bold: true }],
          type: 'section'
        }),
        ...redirectChains.flatMap((entry, index) => [
          ...(index > 0 ? [createDetailRow({ id: `flow-redirect-spacer-${index}`, text: '', type: 'blank' })] : []),
          ...formatRedirectChainDetailRows(entry, log?.id)
        ])
      ]
      : []),
    ...(repeatGroups.length > 0
      ? [
        ...(redirectChains.length > 0 ? [createDetailRow({ id: 'flow-repeat-spacer', text: '', type: 'blank' })] : []),
        createDetailRow({
          id: 'flow-repeat-title',
          segments: [{ text: 'Repeat detection', color: 'cyan', bold: true }],
          type: 'section'
        }),
        ...repeatGroups.flatMap((entry, index) => [
          ...(index > 0 ? [createDetailRow({ id: `flow-repeat-spacer-${index}`, text: '', type: 'blank' })] : []),
          ...formatRepeatGroupDetailRows(entry)
        ])
      ]
      : [])
  ];
}

function slugDetailId(value = '') {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'jwt';
}

function formatJwtWarningLabel(token = {}) {
  if (token.isExpired) {
    return 'expired';
  }

  if (token.isNearExpiry) {
    return 'near expiry';
  }

  return 'none';
}

function getJwtWarningColor(token = {}) {
  if (token.isExpired) {
    return 'red';
  }

  if (token.isNearExpiry) {
    return 'yellow';
  }

  return 'green';
}

function formatJwtClaimText(value = '') {
  const text = String(value ?? '');

  return text.trim() ? sanitizeTerminalText(text) : 'n/a';
}

function createJwtClaimRow(index, label, value, options = {}) {
  const safeValue = formatJwtClaimText(value);
  const text = `${label}: ${safeValue}`;

  return createDetailRow({
    id: `jwt-${index}-${slugDetailId(label)}`,
    searchText: `jwt ${label} ${safeValue}`,
    segments: [
      { text: label, color: 'gray' },
      { text: ': ', color: 'gray' },
      { text: safeValue, color: options.color }
    ],
    text,
    type: 'jwt-claim'
  });
}

function namespaceJwtJsonRows(rows = [], prefix = '') {
  return rows.map((row) => ({
    ...row,
    id: `${prefix}-${row.id}`,
    path: row.path ? `${prefix}.${row.path}` : row.path,
    searchText: ['jwt decoded', row.searchText, row.path ? `${prefix}.${row.path}` : '']
      .filter(Boolean)
      .join(' '),
    type: `jwt-${row.type}`
  }));
}

function formatJwtDecodedRows(token = {}, index = 0) {
  const prefix = `jwt-${index}`;

  return [
    createDetailRow({
      id: `${prefix}-decoded-header-title`,
      segments: [{ text: 'decoded header', color: 'cyan' }],
      text: 'decoded header',
      type: 'jwt-section'
    }),
    ...namespaceJwtJsonRows(formatRootedJsonRows(token.header, {}, 'header'), `${prefix}-header`),
    createDetailRow({
      id: `${prefix}-decoded-payload-title`,
      segments: [{ text: 'decoded payload', color: 'cyan' }],
      text: 'decoded payload',
      type: 'jwt-section'
    }),
    ...namespaceJwtJsonRows(formatRootedJsonRows(token.payload, {}, 'payload'), `${prefix}-payload`)
  ];
}

function formatJwtTokenRows(token = {}, index = 0) {
  const expiryLabel = formatJwtTimeClaim(token.payload?.exp);
  const warningLabel = formatJwtWarningLabel(token);
  const prefix = `jwt-${index}`;

  return [
    createDetailRow({
      id: `${prefix}-summary`,
      searchText: `jwt ${token.location} ${token.tokenPreview} unverified local decode`,
      segments: [
        { text: token.location, color: 'cyan' },
        { text: ' | ', color: 'gray' },
        { text: token.tokenPreview, color: 'yellow' },
        { text: ' | ', color: 'gray' },
        { text: 'unverified local decode', color: 'gray' }
      ],
      type: 'jwt-summary'
    }),
    createJwtClaimRow(index, 'issuer', token.issuer),
    createJwtClaimRow(index, 'subject', token.subject),
    createJwtClaimRow(index, 'scopes', token.scopes),
    createJwtClaimRow(index, 'expiry', expiryLabel, {
      color: token.isExpired || token.isNearExpiry ? getJwtWarningColor(token) : undefined
    }),
    createJwtClaimRow(index, 'warning', warningLabel, { color: getJwtWarningColor(token) }),
    createJwtClaimRow(index, 'verification', 'signature not verified (local decode only)', { color: 'gray' }),
    ...formatJwtDecodedRows(token, index)
  ];
}

function formatJwtInspectorDetailRows(tokens = [], options = {}) {
  if (tokens.length === 0 && !options.showEmpty) {
    return [];
  }

  return [
    createDetailRow({ id: 'jwt-spacer', text: '', type: 'blank' }),
    createDetailRow({
      id: 'jwt-title',
      segments: [{ text: 'JWT Inspector', color: 'cyan', bold: true }],
      text: 'JWT Inspector',
      type: 'section'
    }),
    ...(tokens.length === 0
      ? [
        createDetailRow({
          id: 'jwt-empty',
          segments: [{ text: 'No JWT tokens found', color: 'gray' }],
          text: 'No JWT tokens found',
          type: 'empty'
        })
      ]
      : tokens.flatMap(formatJwtTokenRows))
  ];
}

function formatPaginationDetailRows(log, detailTab) {
  const pagination = analyzePagination(log);

  if (!pagination.detected || !pagination.summary) {
    return [];
  }

  const rows = [
    createDetailRow({ id: `${detailTab}-pagination-spacer`, text: '', type: 'blank' }),
    createDetailRow({
      id: `${detailTab}-pagination-title`,
      segments: [{ text: 'Pagination', color: 'cyan', bold: true }],
      type: 'section'
    }),
    createDetailRow({
      id: `${detailTab}-pagination-summary`,
      searchText: `pagination ${pagination.summary}`,
      segments: [{ text: pagination.summary, color: 'yellow' }],
      type: 'pagination'
    })
  ];

  if (pagination.nextRequest?.url) {
    rows.push(createDetailRow({
      id: `${detailTab}-pagination-next`,
      searchText: `pagination next request ${pagination.nextRequest.url}`,
      segments: [
        { text: 'next request: ', color: 'gray' },
        { text: pagination.nextRequest.url }
      ],
      type: 'pagination'
    }));
  } else if (pagination.unavailableReason) {
    rows.push(createDetailRow({
      id: `${detailTab}-pagination-unavailable`,
      searchText: `pagination ${pagination.unavailableReason}`,
      segments: [
        { text: 'next unavailable: ', color: 'gray' },
        { text: pagination.unavailableReason, color: 'yellow' }
      ],
      type: 'pagination'
    }));
  }

  return rows;
}

function hasObjectEntries(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

const QUERY_VALUE_DISPLAY_MAX_LENGTH = 96;

function formatQueryValue(value, options = {}) {
  const maxLength = options.maxLength ?? QUERY_VALUE_DISPLAY_MAX_LENGTH;
  const maybeTruncate = (text) => options.truncate === false
    ? text
    : truncate(text, maxLength);

  if (Array.isArray(value)) {
    const separator = options.arraySeparator ?? ', ';
    const content = value.map((item) => formatQueryValue(item, {
      arraySeparator: separator,
      bareArray: true,
      truncate: false
    })).join(separator);
    const text = options.bareArray ? content : `[${content}]`;

    return maybeTruncate(text);
  }

  if (value && typeof value === 'object') {
    return maybeTruncate(JSON.stringify(value));
  }

  return maybeTruncate(sanitizeTerminalText(value));
}

function flattenQueryGroup(prefix, value) {
  if (Array.isArray(value) || value === null || typeof value !== 'object') {
    return [{ label: prefix, value }];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const label = key === '$value' || key === '$all'
      ? prefix
      : `${prefix}.${key}`;

    if (child && typeof child === 'object' && !Array.isArray(child)) {
      return flattenQueryGroup(label, child);
    }

    return [{ label, value: child }];
  });
}

function createQueryDetailRow(detailTab, index, label, value, options = {}) {
  const displayValue = formatQueryValue(value, options);
  const fullValue = formatQueryValue(value, { ...options, truncate: false });
  const text = `${label}: ${displayValue}`;
  const fullText = `${label}: ${fullValue}`;

  return createDetailRow({
    id: `${detailTab}-query-param-${index}`,
    searchText: `query params ${fullText}`,
    segments: [
      { text: label, color: 'cyan' },
      { text: ': ', color: 'gray' },
      { text: displayValue }
    ],
    text,
    type: 'query'
  });
}

function formatQuerySortValue(sort = []) {
  return sort
    .map((item) => `${item.field} ${item.direction}`)
    .join(', ');
}

function createQueryRowsFromParsed(parsed, detailTab) {
  const rows = [];
  let index = 0;
  const pushRow = (label, value, options) => {
    rows.push(createQueryDetailRow(detailTab, index, label, value, options));
    index += 1;
  };

  if (hasObjectEntries(parsed.filters)) {
    for (const { label, value } of flattenQueryGroup('filters', parsed.filters)) {
      pushRow(label, value);
    }
  }

  if (parsed.sort.length > 0) {
    pushRow('sort', formatQuerySortValue(parsed.sort));
  }

  if (hasObjectEntries(parsed.search)) {
    for (const { label, value } of flattenQueryGroup('search', parsed.search)) {
      pushRow(label === 'search.search' ? 'search' : label, value);
    }
  }

  if (parsed.include.length > 0) {
    pushRow('include', parsed.include, { bareArray: true });
  }

  if (hasObjectEntries(parsed.fields)) {
    for (const { label, value } of flattenQueryGroup('fields', parsed.fields)) {
      pushRow(label, value, { bareArray: true });
    }
  }

  if (hasObjectEntries(parsed.other)) {
    for (const { label, value } of flattenQueryGroup('other', parsed.other)) {
      pushRow(label, value);
    }
  }

  return rows;
}

function formatQueryParameterDetailRows(log, detailTab) {
  if (detailTab !== 'request') {
    return [];
  }

  const parsed = parseQueryParameters(log?.path ?? '');
  const queryRows = createQueryRowsFromParsed(parsed, detailTab);

  if (!parsed.detected || queryRows.length === 0) {
    return [];
  }

  return [
    createDetailRow({ id: `${detailTab}-query-params-spacer`, text: '', type: 'blank' }),
    createDetailRow({
      id: `${detailTab}-query-params-title`,
      segments: [{ text: 'Query Params', color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...queryRows
  ];
}

function createDetailRow(options = {}) {
  const segments = options.segments ?? [{ text: options.text ?? '' }];
  const text = options.text ?? segments.map((segment) => segment.text).join('');

  return {
    collapsible: false,
    id: options.id ?? `${options.type ?? 'row'}-${text}`,
    matchText: options.matchText ?? text,
    path: options.path ?? null,
    searchText: options.searchText ?? [text, options.path].filter(Boolean).join(' '),
    segments,
    text,
    type: options.type ?? 'body',
    ...options
  };
}

function createPlainDetailRows(lines, options = {}) {
  return lines.map((line, index) => createDetailRow({
    id: `${options.idPrefix ?? options.type ?? 'row'}-${index}`,
    path: options.path ?? null,
    text: line,
    type: options.type ?? 'body'
  }));
}

function sanitizeTerminalText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '\uFFFD');
}

function splitLongBodyLine(line, maxLength = BODY_LINE_MAX_LENGTH) {
  if (line.length <= maxLength) {
    return [line];
  }

  const chunks = [];

  for (let index = 0; index < line.length; index += maxLength) {
    chunks.push(line.slice(index, index + maxLength));
  }

  return chunks;
}

function splitBodyLines(value) {
  return sanitizeTerminalText(value)
    .split('\n')
    .flatMap((line) => splitLongBodyLine(line));
}

function jsonPathToString(pathParts = []) {
  if (pathParts.length === 0) {
    return '$';
  }

  return pathParts.reduce((path, part) => {
    if (typeof part === 'number') {
      return `${path}[${part}]`;
    }

    if (/^[A-Za-z_$][\w$]*$/.test(part)) {
      return path ? `${path}.${part}` : part;
    }

    return `${path}${path ? '' : '$'}[${JSON.stringify(part)}]`;
  }, '');
}

function jsonNodeSummary(value) {
  if (Array.isArray(value)) {
    return `[...] ${value.length} items`;
  }

  if (value && typeof value === 'object') {
    return `{...} ${Object.keys(value).length} keys`;
  }

  return '';
}

function jsonContainerOpen(value) {
  return Array.isArray(value) ? '[' : '{';
}

function jsonContainerClose(value) {
  return Array.isArray(value) ? ']' : '}';
}

function jsonValueType(value) {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function jsonValueText(value) {
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function jsonValueColor(value) {
  const type = jsonValueType(value);

  if (type === 'string') {
    return 'green';
  }

  if (type === 'number') {
    return 'yellow';
  }

  if (type === 'boolean') {
    return 'magenta';
  }

  if (type === 'null') {
    return 'gray';
  }

  return undefined;
}

function jsonLabelText(label, path) {
  if (path === '$') {
    return '$';
  }

  if (typeof label === 'number') {
    return `[${label}]`;
  }

  return String(label);
}

function formatJsonRows(value, options = {}, pathParts = [], label = null, depth = 0) {
  const rows = [];
  const path = jsonPathToString(pathParts);
  const indent = '  '.repeat(depth);
  const collapsedPaths = new Set(options.collapsedPaths ?? []);
  const isContainer = value && typeof value === 'object';
  const labelText = jsonLabelText(label, path);
  const prefix = path === '$' ? '' : `${labelText}: `;

  if (!isContainer) {
    const valueText = jsonValueText(value);

    rows.push(createDetailRow({
      id: `json-${path}`,
      matchText: `${prefix}${valueText}`,
      path,
      segments: [
        { text: indent },
        ...(path === '$' ? [] : [{ text: labelText, color: 'cyan' }, { text: ': ', color: 'gray' }]),
        { text: valueText, color: jsonValueColor(value) }
      ],
      type: `json-${jsonValueType(value)}`
    }));

    return rows;
  }

  const collapsed = collapsedPaths.has(path);
  const entries = Array.isArray(value)
    ? value.map((item, index) => [index, item])
    : Object.entries(value);
  const opener = jsonContainerOpen(value);
  const closer = jsonContainerClose(value);
  const summary = collapsed ? jsonNodeSummary(value) : `${opener} ${entries.length} ${Array.isArray(value) ? 'items' : 'keys'}`;

  rows.push(createDetailRow({
    collapsible: true,
    collapsed,
    id: `json-${path}`,
    matchText: `${prefix}${summary}`,
    path,
    segments: [
      { text: indent },
      { text: collapsed ? '> ' : 'v ', color: 'gray' },
      ...(path === '$'
        ? [{ text: '$', color: 'cyan' }, { text: ' ', color: 'gray' }]
        : [{ text: labelText, color: 'cyan' }, { text: ': ', color: 'gray' }]),
      { text: summary, color: collapsed ? 'gray' : undefined }
    ],
    type: Array.isArray(value) ? 'json-array' : 'json-object'
  }));

  if (collapsed) {
    return rows;
  }

  entries.forEach(([key, child]) => {
    rows.push(...formatJsonRows(
      child,
      options,
      [...pathParts, key],
      key,
      depth + 1
    ));
  });

  rows.push(createDetailRow({
    id: `json-${path}-close`,
    matchText: closer,
    path,
    segments: [
      { text: indent },
      { text: closer, color: 'gray' }
    ],
    type: 'json-punctuation'
  }));

  return rows;
}

function withPreviewLabel(rows, label) {
  if (label) {
    rows.previewLabel = label;
  }

  return rows;
}

function appendTruncationRow(rows, payload = {}) {
  const { previewLabel } = rows;

  if (!payload.truncated) {
    return rows;
  }

  return withPreviewLabel([
    ...rows,
    createDetailRow({
      id: 'body-truncated',
      segments: [{ text: '[body truncated]', color: 'yellow' }],
      type: 'warning'
    })
  ], previewLabel);
}

function trimmedPayloadBody(body) {
  return String(body ?? '').trim();
}

function looksLikeJsonBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isNdjsonContentType(contentType) {
  return /(?:^|[+/.-])(?:x-)?ndjson$/.test(contentType) ||
    /(?:^|[+/.-])jsonl$/.test(contentType) ||
    contentType === 'application/jsonlines' ||
    contentType === 'text/jsonlines';
}

function isReactFlightContentType(contentType) {
  return contentType === 'text/x-component' ||
    contentType === 'application/x-component' ||
    contentType === 'application/react-flight';
}

function isServerSentEventContentType(contentType) {
  return contentType === 'text/event-stream';
}

function isUrlEncodedContentType(contentType) {
  return contentType === 'application/x-www-form-urlencoded';
}

function isHtmlContentType(contentType) {
  return contentType === 'text/html' || contentType === 'application/xhtml+xml';
}

function isXmlContentType(contentType) {
  return /(?:^|[+/.-])xml$/.test(contentType) ||
    contentType === 'image/svg+xml' ||
    contentType === 'application/rss+xml' ||
    contentType === 'application/atom+xml';
}

function looksLikeReactFlightBody(body) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

  return lines.length > 0 && lines.every((line) => /^\d+:[A-Z]?/.test(line));
}

function looksLikeSseBody(body) {
  return String(body ?? '')
    .split(/\r?\n/)
    .some((line) => /^(event|data|id|retry):/.test(line.trim()));
}

function looksLikeUrlEncodedBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return /^[^=\s&]+=[\s\S]*$/.test(trimmed) && !trimmed.includes('\n');
}

function looksLikeHtmlBody(body) {
  return /^<!doctype\s+html/i.test(trimmedPayloadBody(body)) ||
    /^<html(?:\s|>)/i.test(trimmedPayloadBody(body));
}

function looksLikeXmlBody(body) {
  const trimmed = trimmedPayloadBody(body);

  return /^<\?xml(?:\s|>)/i.test(trimmed) ||
    (/^<[A-Za-z_][\w:.-]*(?:\s|>)/.test(trimmed) && !looksLikeHtmlBody(trimmed));
}

function parseJsonPayload(body) {
  return JSON.parse(String(body));
}

function parseMaybeJsonValue(value) {
  const trimmed = String(value ?? '').trim();

  if (!trimmed) {
    return {
      parsed: false,
      value: ''
    };
  }

  if (!/^(?:[\[{"]|-?\d|true\b|false\b|null\b)/.test(trimmed)) {
    return {
      parsed: false,
      value: sanitizeTerminalText(value)
    };
  }

  try {
    return {
      parsed: true,
      value: JSON.parse(trimmed)
    };
  } catch {
    return {
      parsed: false,
      value: sanitizeTerminalText(value)
    };
  }
}

function formatRootedJsonRows(value, options, rootName) {
  return formatJsonRows(value, options, [rootName], rootName, 0);
}

function formatJsonPayloadRows(body, options) {
  return formatJsonRows(parseJsonPayload(body), options);
}

function parseNdjsonRecords(body, allowSingleLine = false) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!allowSingleLine && lines.length < 2) {
    throw new Error('not ndjson');
  }

  return lines.map((line) => JSON.parse(line));
}

function formatNdjsonRows(body, options, contentType) {
  return formatRootedJsonRows(
    parseNdjsonRecords(body, isNdjsonContentType(contentType)),
    options,
    'records'
  );
}

function parseReactFlightRecords(body, requireFlightLine = false) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let sawFlightLine = false;

  const records = lines.map((line, index) => {
    const match = line.match(/^([^:]+):([A-Z])?([\s\S]*)$/);

    if (!match) {
      return {
        line: index + 1,
        malformed: true,
        raw: sanitizeTerminalText(line)
      };
    }

    sawFlightLine = true;

    const parsedPayload = parseMaybeJsonValue(match[3]);

    return {
      id: match[1],
      line: index + 1,
      payload: parsedPayload.value,
      payloadType: parsedPayload.parsed ? jsonValueType(parsedPayload.value) : 'raw',
      tag: match[2] || 'data'
    };
  });

  if (requireFlightLine && !sawFlightLine) {
    throw new Error('not react flight');
  }

  return records;
}

function formatReactFlightRows(body, options, contentType) {
  return formatRootedJsonRows(
    parseReactFlightRecords(body, !isReactFlightContentType(contentType)),
    options,
    'flight'
  );
}

function parseSseEvents(body) {
  const events = [];
  let event = {};
  let dataLines = [];

  const flush = () => {
    if (Object.keys(event).length === 0 && dataLines.length === 0) {
      return;
    }

    const data = dataLines.join('\n');
    const parsedData = parseMaybeJsonValue(data);

    events.push({
      ...event,
      ...(dataLines.length > 0
        ? {
          data: parsedData.value,
          dataType: parsedData.parsed ? jsonValueType(parsedData.value) : 'text'
        }
        : {})
    });
    event = {};
    dataLines = [];
  };

  String(body ?? '').split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trimEnd();

    if (line.length === 0) {
      flush();
      return;
    }

    if (line.startsWith(':')) {
      event.comment = event.comment
        ? `${event.comment}\n${line.slice(1).trimStart()}`
        : line.slice(1).trimStart();
      return;
    }

    const separatorIndex = line.indexOf(':');
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
    const rawValue = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;

    if (field === 'data') {
      dataLines.push(value);
    } else if (field === 'event') {
      event.event = value;
    } else if (field === 'id') {
      event.id = value;
    } else if (field === 'retry') {
      event.retry = Number.isNaN(Number(value)) ? value : Number(value);
    } else if (field) {
      event[field] = value;
    }
  });
  flush();

  if (events.length === 0) {
    throw new Error('not sse');
  }

  return events;
}

function formatSseRows(body, options) {
  return formatRootedJsonRows(parseSseEvents(body), options, 'events');
}

function parseUrlEncodedForm(body) {
  if (!looksLikeUrlEncodedBody(body)) {
    throw new Error('not urlencoded');
  }

  const form = {};

  for (const [key, value] of new URLSearchParams(String(body))) {
    if (Object.prototype.hasOwnProperty.call(form, key)) {
      form[key] = Array.isArray(form[key])
        ? [...form[key], value]
        : [form[key], value];
    } else {
      form[key] = value;
    }
  }

  if (Object.keys(form).length === 0) {
    throw new Error('not urlencoded');
  }

  return form;
}

function formatUrlEncodedRows(body, options) {
  return formatRootedJsonRows(parseUrlEncodedForm(body), options, 'form');
}

function parseXmlBody(body) {
  const parser = new XMLParser({
    allowBooleanAttributes: true,
    attributeNamePrefix: '@',
    ignoreAttributes: false,
    parseAttributeValue: true,
    parseTagValue: true,
    textNodeName: '#text',
    trimValues: true
  });
  const parsed = parser.parse(String(body));

  if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
    throw new Error('not xml');
  }

  return parsed;
}

function formatXmlRows(body, options) {
  return formatRootedJsonRows(parseXmlBody(body), options, 'xml');
}

function isHtmlElementNode(node) {
  return node?.type === 'tag' || node?.type === 'script' || node?.type === 'style';
}

function getHtmlElementChildren(node) {
  return (node?.children ?? []).filter(isHtmlElementNode);
}

function getHtmlDirectText(node) {
  return (node?.children ?? [])
    .filter((child) => child.type === 'text')
    .map((child) => child.data)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatHtmlAttributeSummary(attributes = {}) {
  const entries = Object.entries(attributes);

  if (entries.length === 0) {
    return '';
  }

  return ` ${entries
    .slice(0, 4)
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join(' ')}${entries.length > 4 ? ' ...' : ''}`;
}

function htmlChildPath(parentPath, tagName, siblingIndex) {
  if (!parentPath) {
    return tagName;
  }

  if (parentPath === 'html' && (tagName === 'head' || tagName === 'body')) {
    return `${parentPath}.${tagName}`;
  }

  return `${parentPath}.${tagName}[${siblingIndex}]`;
}

function formatHtmlElementRows(nodes, options = {}, parentPath = '', depth = 0) {
  const rows = [];
  const collapsedPaths = new Set(options.collapsedPaths ?? []);
  const siblingCounts = new Map();

  nodes.filter(isHtmlElementNode).forEach((node) => {
    const tagName = String(node.name ?? 'element').toLowerCase();
    const siblingIndex = siblingCounts.get(tagName) ?? 0;
    const path = htmlChildPath(parentPath, tagName, siblingIndex);
    const childElements = getHtmlElementChildren(node);
    const directText = getHtmlDirectText(node);
    const attributes = formatHtmlAttributeSummary(node.attribs);
    const isCollapsible = childElements.length > 0;
    const collapsed = isCollapsible && collapsedPaths.has(path);
    const indent = '  '.repeat(depth);
    const summaryParts = [
      `<${tagName}${attributes}>`,
      ...(childElements.length > 0 ? [`${childElements.length} children`] : []),
      ...(directText ? [JSON.stringify(truncate(directText, 64))] : [])
    ];
    const summary = summaryParts.join(' ');

    siblingCounts.set(tagName, siblingIndex + 1);
    rows.push(createDetailRow({
      collapsible: isCollapsible,
      collapsed,
      id: `html-${path}`,
      matchText: summary,
      path,
      searchText: [path, summary, directText].filter(Boolean).join(' '),
      segments: [
        { text: indent },
        { text: isCollapsible ? (collapsed ? '> ' : 'v ') : '  ', color: 'gray' },
        { text: `<${tagName}`, color: 'cyan' },
        ...(attributes ? [{ text: attributes, color: 'gray' }] : []),
        { text: '>', color: 'gray' },
        ...(childElements.length > 0 ? [{ text: ` ${childElements.length} children`, color: 'gray' }] : []),
        ...(directText ? [{ text: ` ${JSON.stringify(truncate(directText, 64))}`, color: 'green' }] : [])
      ],
      text: `${indent}${isCollapsible ? (collapsed ? '> ' : 'v ') : '  '}${summary}`,
      type: 'html-element'
    }));

    if (!collapsed) {
      rows.push(...formatHtmlElementRows(childElements, options, path, depth + 1));
    }
  });

  return rows;
}

function formatHtmlRows(body, options) {
  const document = parseDocument(String(body), {
    lowerCaseAttributeNames: true,
    lowerCaseTags: true
  });
  const rows = formatHtmlElementRows(document.children ?? [], options);

  if (rows.length === 0) {
    throw new Error('not html');
  }

  return rows;
}

const PAYLOAD_PARSERS = [
  {
    label: 'React Flight',
    detect: (body, contentType) => isReactFlightContentType(contentType) || looksLikeReactFlightBody(body),
    format: formatReactFlightRows
  },
  {
    label: 'SSE',
    detect: (body, contentType) => isServerSentEventContentType(contentType) || looksLikeSseBody(body),
    format: formatSseRows
  },
  {
    label: 'NDJSON',
    detect: (body, contentType) => isNdjsonContentType(contentType) || parseNdjsonRecords(body).length > 0,
    format: formatNdjsonRows
  },
  {
    label: 'JSON',
    detect: (body, contentType) => isJsonContentType(contentType) || looksLikeJsonBody(body),
    format: formatJsonPayloadRows
  },
  {
    label: 'Form',
    detect: (body, contentType) => isUrlEncodedContentType(contentType) || looksLikeUrlEncodedBody(body),
    format: formatUrlEncodedRows
  },
  {
    label: 'HTML',
    detect: (body, contentType) => isHtmlContentType(contentType) || looksLikeHtmlBody(body),
    format: formatHtmlRows
  },
  {
    label: 'XML',
    detect: (body, contentType) => isXmlContentType(contentType) || looksLikeXmlBody(body),
    format: formatXmlRows
  }
];

function formatParsedPayloadRows(body, contentType, options = {}) {
  for (const parser of PAYLOAD_PARSERS) {
    let detected = false;

    try {
      detected = parser.detect(body, contentType);
    } catch {
      detected = false;
    }

    if (!detected) {
      continue;
    }

    try {
      const rows = parser.format(body, options, contentType);

      if (rows.length > 0) {
        return withPreviewLabel(rows, parser.label);
      }
    } catch {
      // Parser detection can be heuristic; fall through to the next parser.
    }
  }

  return null;
}

export function formatStructuredPayloadRows(payload = {}, options = {}) {
  const body = String(payload.body || '');
  const contentType = getContentType(payload.headers);
  let lines;

  if (body.length === 0) {
    lines = ['(empty)'];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-empty', type: 'body-empty' }), payload);
  } else if (hasEncodedBody(payload.headers)) {
    const encoding = getHeaderTokens(payload.headers, 'content-encoding').join(', ');
    lines = [`(compressed body not shown: ${encoding})`];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-compressed', type: 'warning' }), payload);
  } else if (!isTextualContentType(contentType)) {
    lines = [`(binary body omitted: ${contentType})`];
    return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-binary', type: 'warning' }), payload);
  }

  const parsedRows = formatParsedPayloadRows(body, contentType, options);

  if (parsedRows) {
    return appendTruncationRow(parsedRows, payload);
  }

  lines = splitBodyLines(body);

  return appendTruncationRow(createPlainDetailRows(lines, { idPrefix: 'body-text', type: 'body' }), payload);
}


export function getDetailRows(log, detailTab = 'request', options = {}) {
  if (!log) {
    return [];
  }

  if (detailTab === 'auth') {
    return formatAuthSecretDetailRows(log, options);
  }

  if (detailTab === 'cache') {
    return formatCacheAnalysisDetailRows(log, options);
  }

  if (detailTab === 'flow') {
    return formatFlowDetailRows(log, options);
  }

  const payload = detailTab === 'response' ? log.response : log.request;
  const title = detailTab === 'response' ? 'Response' : 'Request';
  const bodyRows = formatStructuredPayloadRows(payload, options);
  const bodyTitle = bodyRows.previewLabel
    ? `${title} body | ${bodyRows.previewLabel}`
    : `${title} body`;
  const headerOptions = detailTab === 'request'
    ? {
      ...options,
      requestHost: payload.headers?.host,
      rewritePublicTargetRequestHeaders: true
    }
    : options;

  return [
    createDetailRow({
      id: `${detailTab}-headers-title`,
      segments: [{ text: `${title} headers`, color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...formatHeaderDetailRows(payload.headers, headerOptions, detailTab),
    ...formatQueryParameterDetailRows(log, detailTab),
    ...formatPaginationDetailRows(log, detailTab),
    createDetailRow({ id: `${detailTab}-spacer`, text: '', type: 'blank' }),
    createDetailRow({
      id: `${detailTab}-body-title`,
      segments: [{ text: bodyTitle, color: 'cyan', bold: true }],
      type: 'section'
    }),
    ...bodyRows
  ];
}

export function getDetailLines(log, detailTab = 'request', options = {}) {
  return getDetailRows(log, detailTab, options).map((row) => row.text);
}

export function parseDetailSearchQuery(query = '') {
  const value = String(query ?? '').trim();

  if (!value) {
    return {
      kind: 'empty',
      pattern: '',
      regex: null
    };
  }

  const regexMatch = value.match(/^\/(.+)\/([a-z]*)$/i);

  if (regexMatch) {
    try {
      return {
        kind: 'regex',
        pattern: regexMatch[1],
        regex: new RegExp(regexMatch[1], regexMatch[2].includes('i') ? 'i' : '')
      };
    } catch {
      return {
        kind: 'invalid',
        pattern: value,
        regex: null
      };
    }
  }

  return {
    kind: 'text',
    pattern: value.toLowerCase(),
    regex: null
  };
}

function getDetailRowSearchText(row = {}) {
  return [
    row.searchText,
    row.path,
    row.matchText,
    row.text
  ].filter(Boolean).join(' ');
}

export function findDetailMatches(rows = [], query = '') {
  const parsed = typeof query === 'string' ? parseDetailSearchQuery(query) : query;

  if (parsed.kind === 'empty' || parsed.kind === 'invalid') {
    return [];
  }

  return rows.reduce((matches, row, index) => {
    const searchText = getDetailRowSearchText(row);
    const matched = parsed.kind === 'regex'
      ? parsed.regex.test(searchText)
      : searchText.toLowerCase().includes(parsed.pattern);

    if (matched) {
      matches.push(index);
    }

    return matches;
  }, []);
}

export function getNextDetailMatchIndex(matches = [], currentIndex = 0, direction = 1) {
  if (matches.length === 0) {
    return 0;
  }

  const current = Number.isInteger(currentIndex) ? currentIndex : 0;

  return (current + direction + matches.length) % matches.length;
}

export function applyDetailMatches(rows = [], matches = [], activeMatchIndex = 0) {
  const matchSet = new Set(matches);
  const activeRowIndex = matches[activeMatchIndex] ?? -1;

  return rows.map((row, index) => ({
    ...row,
    isActiveMatch: index === activeRowIndex,
    isMatched: matchSet.has(index)
  }));
}

export function getMaxScrollOffset(lines, visibleCount) {
  return Math.max(0, lines.length - Math.max(1, visibleCount));
}

export function getTrafficVisibleCount(bottomOffset, terminalRows = process.stdout.rows) {
  return Math.max(5, getTerminalRows(terminalRows) - bottomOffset);
}

export function getDetailVisibleCount(bottomOffset, terminalRows = process.stdout.rows) {
  return Math.max(4, getTerminalRows(terminalRows) - bottomOffset);
}

export function getDetailModalVisibleCount(bottomOffset = 10, terminalRows = process.stdout.rows) {
  return Math.max(8, getTerminalRows(terminalRows) - bottomOffset);
}

export function getPageStep(visibleCount, amount = 'page') {
  const pageSize = Math.max(1, Math.floor(Number(visibleCount) || 1));

  return amount === 'half' ? Math.max(1, Math.floor(pageSize / 2)) : pageSize;
}

export function clampScrollOffset(currentOffset, direction, maxScrollOffset) {
  const current = Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0;
  const delta = Number.isFinite(Number(direction)) ? Number(direction) : 0;
  const max = Number.isFinite(Number(maxScrollOffset)) ? Number(maxScrollOffset) : 0;

  return Math.min(
    Math.max(0, max),
    Math.max(0, current + delta)
  );
}

export function clampDetailRowIndex(rowIndex, rows) {
  const maxIndex = Math.max(0, rows.length - 1);
  const value = Number.isFinite(Number(rowIndex)) ? Number(rowIndex) : 0;

  return Math.min(maxIndex, Math.max(0, value));
}

export function getScrollOffsetForFocusedRow(focusedRow, currentOffset, visibleCount, maxScrollOffset) {
  const focus = Number.isFinite(Number(focusedRow)) ? Number(focusedRow) : 0;
  const current = Number.isFinite(Number(currentOffset)) ? Number(currentOffset) : 0;
  const visible = Math.max(1, Number(visibleCount) || 1);
  const max = Math.max(0, Number(maxScrollOffset) || 0);

  if (focus < current) {
    return Math.max(0, focus);
  }

  if (focus >= current + visible) {
    return Math.min(max, focus - visible + 1);
  }

  return Math.min(max, Math.max(0, current));
}

export function getBoundaryLogId(logs, boundary) {
  if (logs.length === 0) {
    return null;
  }

  return boundary === 'last' ? logs[logs.length - 1].id : logs[0].id;
}


function renderDetailRow(row, key) {
  if (row.isActiveMatch || row.isFocused) {
    return h(
      Text,
      {
        key,
        backgroundColor: row.isActiveMatch ? 'yellow' : 'cyan',
        color: 'black',
        bold: row.isActiveMatch || row.isFocused,
        wrap: 'truncate'
      },
      row.text
    );
  }

  if (row.isMatched) {
    return h(
      Text,
      {
        key,
        color: 'yellow',
        bold: true,
        wrap: 'truncate'
      },
      row.text
    );
  }

  return h(
    Text,
    {
      key,
      bold: row.type === 'section',
      wrap: 'truncate'
    },
    ...(row.segments ?? [{ text: row.text }]).map((segment, index) => h(
      Text,
      {
        key: `${key}-${index}`,
        color: segment.color,
        bold: segment.bold
      },
      segment.text
    ))
  );
}

const DetailViewport = React.memo(function DetailViewport({
  rows,
  scrollOffset,
  visibleCount,
  focusedRow,
  title,
  subtitle,
  borderColor,
  flexGrow = 1,
  width
}) {
  const maxScrollOffset = getMaxScrollOffset(rows, visibleCount);
  const safeScrollOffset = Math.min(scrollOffset, maxScrollOffset);
  const visibleRows = rows
    .slice(safeScrollOffset, safeScrollOffset + visibleCount)
    .map((row, index) => ({
      ...row,
      isFocused: safeScrollOffset + index === focusedRow
    }));
  const scrollLabel = maxScrollOffset === 0
    ? 'top'
    : `${safeScrollOffset + 1}-${Math.min(rows.length, safeScrollOffset + visibleCount)}/${rows.length}`;

  return h(
    Box,
    {
      flexDirection: 'column',
      flexGrow: width ? 0 : flexGrow,
      flexShrink: width ? 0 : undefined,
      width,
      borderStyle: 'single',
      borderColor,
      paddingX: 1
    },
    h(Text, { bold: true, wrap: 'truncate' }, title),
    h(Text, { color: 'gray', wrap: 'truncate' }, `${subtitle} | scroll ${scrollLabel}`),
    ...visibleRows.map((row, index) => renderDetailRow(row, `${row.id}-${safeScrollOffset + index}`))
  );
});

export const DetailPane = React.memo(function DetailPane({
  bottomOffset,
  log,
  isFocused,
  detailTab,
  rows,
  focusedRow,
  scrollOffset,
  matchCount = 0,
  activeMatchIndex = 0,
  paneWidth
}) {
  if (!log) {
    return h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: paneWidth ? 0 : 1,
        flexShrink: paneWidth ? 0 : undefined,
        width: paneWidth,
        borderStyle: 'single',
        borderColor: isFocused ? 'cyan' : 'gray',
        paddingX: 1
      },
      h(Text, { color: 'gray' }, 'No request inspected')
    );
  }

  const visibleCount = getDetailVisibleCount(bottomOffset);
  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const summary = `${log.method} ${log.path} | ${timing}`;
  const tabLabel = formatDetailTabLabel(detailTab);
  const matchLabel = matchCount > 0 ? ` | match ${activeMatchIndex + 1}/${matchCount}` : '';

  return h(DetailViewport, {
    borderColor: isFocused ? 'cyan' : 'gray',
    focusedRow,
    rows,
    scrollOffset,
    title: summary,
    subtitle: `${tabLabel}${matchLabel}`,
    visibleCount,
    width: paneWidth
  });
});

export const DetailModal = React.memo(function DetailModal({
  log,
  detailTab,
  rows,
  focusedRow,
  keyBindings = DEFAULT_KEY_BINDINGS,
  scrollOffset,
  visibleCount,
  matchCount,
  activeMatchIndex
}) {
  if (!log) {
    return h(
      Box,
      {
        flexDirection: 'column',
        flexGrow: 1,
        borderStyle: 'single',
        borderColor: 'cyan',
        paddingX: 2,
        paddingY: 1
      },
      h(Text, { color: 'gray' }, 'No request inspected')
    );
  }

  const timing = `${log.statusCode ?? '---'} in ${log.responseTimeMs}ms`;
  const title = `Details ${detailTab} | ${log.method} ${log.path} | ${timing}`;
  const matchLabel = matchCount > 0 ? ` | match ${activeMatchIndex + 1}/${matchCount}` : '';
  const subtitle = [
    `${getDetailBindingLabel(keyBindings, 'detail.close', { limit: 2 })} close`,
    `${getDetailBindingPairLabel(keyBindings, 'detail.previousTab', 'detail.nextTab')} tabs`,
    `${getDetailBindingLabel(keyBindings, 'detail.openSearch', { limit: 1 })} find`,
    `${getDetailBindingPairLabel(keyBindings, 'detail.nextMatch', 'detail.previousMatch')} next/prev`,
    `${getDetailBindingLabel(keyBindings, 'detail.toggleNode', { limit: 1 })} collapse`
  ].join(' | ');

  return h(DetailViewport, {
    borderColor: 'cyan',
    focusedRow,
    rows,
    scrollOffset,
    title,
    subtitle: `${subtitle}${matchLabel}`,
    visibleCount,
    flexGrow: 1
  });
});


export const DetailSearchBar = React.memo(function DetailSearchBar({
  activeMatchIndex,
  keyBindings = DEFAULT_KEY_BINDINGS,
  matchCount,
  query
}) {
  const displayQuery = query.length > 0 ? query : '(empty)';
  const parsed = parseDetailSearchQuery(query);
  const mode = parsed.kind === 'regex'
    ? 'regex'
    : (parsed.kind === 'invalid' ? 'invalid regex' : 'text/path');
  const matchLabel = query.trim().length === 0
    ? 'no query'
    : `${matchCount} matches${matchCount > 0 ? ` | active ${activeMatchIndex + 1}` : ''}`;

  return h(
    Box,
    {
      flexDirection: 'column',
      borderStyle: 'single',
      borderColor: parsed.kind === 'invalid' ? 'yellow' : 'cyan',
      paddingX: 1,
      marginTop: 1
    },
    h(Text, { color: parsed.kind === 'invalid' ? 'yellow' : 'cyan', bold: true }, `Detail search | ${mode} | ${matchLabel}`),
    h(Text, { wrap: 'truncate' }, `query ${displayQuery}_`),
    h(Text, { color: 'gray', wrap: 'truncate' }, `type text/path or /regex/ | ${getDetailBindingLabel(keyBindings, 'detailSearch.backspace', { limit: 1 })} edit | ${getReversedBindingLabel(keyBindings, 'detailSearch.close')} close, then ${getDetailBindingPairLabel(keyBindings, 'detail.nextMatch', 'detail.previousMatch')} next/prev`)
  );
});
