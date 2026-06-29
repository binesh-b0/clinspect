import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_BODY_LIMIT, truncateTextBody } from '../store/state.js';

const BAD_GATEWAY_PREFIX = 'Bad Gateway: manual request failed.';
const HEADER_SEPARATOR = ' | ';
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*\}\}/g;
const HEADER_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const REDACTED_VALUE_PATTERN = /(?:<redacted>|\[redacted\]|\*\*\*|•••)/i;
const AUTH_LIKE_HEADER_PATTERN = /^(?:authorization|proxy-authorization|x-api-key|api-key|x-auth-token)$/i;

export const MANUAL_REQUEST_SCHEMA_VERSION = 1;
export const MANUAL_REQUEST_BODY_MODES = ['none', 'raw', 'json', 'form-urlencoded', 'multipart'];
export const MANUAL_REQUEST_AUTH_MODES = ['none', 'bearer', 'basic', 'apiKey'];
export const MANUAL_REQUEST_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

const MANAGED_REQUEST_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade'
]);

function hasLeadingUrlAuthority(value) {
  const text = String(value ?? '');

  return text.startsWith('\\') || text.startsWith('//') || text.startsWith('/\\');
}

export function isManagedManualRequestHeader(name) {
  return MANAGED_REQUEST_HEADERS.has(String(name ?? '').trim().toLowerCase());
}

function normalizeMethod(method) {
  const value = String(method || 'GET').toUpperCase();

  return value || 'GET';
}

function asHeaderValue(value) {
  return Array.isArray(value) ? value.map((item) => String(item)).join(', ') : String(value ?? '');
}

function headerEntries(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }

  return Object.entries(headers)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [String(name), asHeaderValue(value)]);
}

function getHeaderValue(headers = {}, name) {
  const normalizedName = String(name ?? '').toLowerCase();
  const entry = headerEntries(headers).find(([headerName]) => headerName.toLowerCase() === normalizedName);

  return entry?.[1] ?? '';
}

function isRequestCookieHeaderName(name) {
  return String(name ?? '').trim().toLowerCase() === 'cookie';
}

function isRedactedValue(value) {
  return REDACTED_VALUE_PATTERN.test(String(value ?? ''));
}

function assertManualHeaderName(name) {
  const normalizedName = String(name ?? '').trim();

  if (!normalizedName || !HEADER_TOKEN_PATTERN.test(normalizedName)) {
    throw new Error(`invalid header name: ${normalizedName || '(empty)'}`);
  }

  if (isManagedManualRequestHeader(normalizedName)) {
    throw new Error(`header ${normalizedName} is managed by the client`);
  }

  return normalizedName;
}

function splitRawHeaderEntries(headersText) {
  return String(headersText ?? '')
    .split(/\r?\n|\s*\|\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function headersFromResponse(response) {
  const headers = {};

  response.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return headers;
}

function createRow(row = {}) {
  return {
    enabled: row.enabled !== false,
    key: String(row.key ?? row.name ?? ''),
    value: String(row.value ?? ''),
    secret: Boolean(row.secret),
    type: row.type === 'file' ? 'file' : 'text',
    filePath: String(row.filePath ?? row.path ?? '')
  };
}

function normalizeRows(rows = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map(createRow);
}

function rowsFromObject(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null)
    .map(([key, item]) => createRow({ key, value: item }));
}

function rowsFromHeaders(headersValue = '') {
  if (!headersValue) {
    return [];
  }

  if (Array.isArray(headersValue)) {
    return normalizeRows(headersValue);
  }

  if (typeof headersValue === 'object') {
    return rowsFromObject(headersValue);
  }

  return Object.entries(parseManualRequestHeaders(headersValue))
    .map(([key, value]) => createRow({ key, value }));
}

function normalizeBody(bodyValue = '') {
  if (bodyValue && typeof bodyValue === 'object' && !Buffer.isBuffer(bodyValue)) {
    const mode = MANUAL_REQUEST_BODY_MODES.includes(bodyValue.mode) ? bodyValue.mode : 'none';

    return {
      mode,
      raw: String(bodyValue.raw ?? ''),
      json: String(bodyValue.json ?? '')
    };
  }

  const text = String(bodyValue ?? '');

  return {
    mode: text.length > 0 ? 'raw' : 'none',
    raw: text,
    json: text
  };
}

function normalizeAuth(auth = {}) {
  const mode = MANUAL_REQUEST_AUTH_MODES.includes(auth?.mode) ? auth.mode : 'none';
  const apiKey = auth?.apiKey ?? {};

  return {
    mode,
    bearerToken: String(auth?.bearerToken ?? auth?.token ?? ''),
    username: String(auth?.username ?? ''),
    password: String(auth?.password ?? ''),
    apiKey: {
      key: String(apiKey.key ?? auth?.key ?? ''),
      value: String(apiKey.value ?? auth?.value ?? ''),
      placement: apiKey.placement === 'query' || auth?.placement === 'query' ? 'query' : 'header'
    }
  };
}

function cloneDraft(draft) {
  return JSON.parse(JSON.stringify(draft));
}

export function createManualRequestDraft(input = {}) {
  const body = normalizeBody(input.body);

  return {
    schemaVersion: MANUAL_REQUEST_SCHEMA_VERSION,
    id: String(input.id ?? `request-${randomUUID()}`),
    name: String(input.name ?? ''),
    collection: String(input.collection ?? 'Default') || 'Default',
    updatedAt: input.updatedAt ?? null,
    method: normalizeMethod(input.method),
    urlMode: input.urlMode === 'absolute' ? 'absolute' : 'target',
    url: String(input.url ?? input.path ?? '/'),
    params: normalizeRows(input.params),
    headers: rowsFromHeaders(input.headers),
    cookies: normalizeRows(input.cookies),
    formFields: normalizeRows(input.formFields),
    multipartFields: normalizeRows(input.multipartFields),
    environment: normalizeRows(input.environment),
    auth: normalizeAuth(input.auth),
    body
  };
}

export function normalizeManualRequestDraft(input = {}) {
  const draft = createManualRequestDraft(input);

  if (draft.url.trim().length === 0) {
    draft.url = '/';
  }

  if (!MANUAL_REQUEST_METHODS.includes(draft.method)) {
    draft.method = normalizeMethod(draft.method);
  }

  return draft;
}

export function cloneManualRequestDraft(draft) {
  return normalizeManualRequestDraft(cloneDraft(draft));
}

function parseCapturedCookieRows(cookieValue = '', blockers) {
  const rows = String(cookieValue ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf('=');
      const value = separatorIndex === -1 ? '' : part.slice(separatorIndex + 1).trim();
      const redacted = isRedactedValue(value);

      if (redacted) {
        blockers.add('cookie values are redacted; exact resend requires edit');
      }

      return createRow({
        enabled: !redacted,
        key: separatorIndex === -1 ? part : part.slice(0, separatorIndex).trim(),
        value,
        secret: true
      });
    });

  return rows;
}

function isJsonContentType(contentType) {
  const type = String(contentType ?? '').split(';', 1)[0].trim().toLowerCase();

  return type === 'application/json' || type.endsWith('+json');
}

function isFormUrlEncodedContentType(contentType) {
  return String(contentType ?? '').split(';', 1)[0].trim().toLowerCase() === 'application/x-www-form-urlencoded';
}

function isMultipartContentType(contentType) {
  return String(contentType ?? '').split(';', 1)[0].trim().toLowerCase() === 'multipart/form-data';
}

function hasCapturedBody(log) {
  return String(log?.request?.body ?? '').length > 0;
}

function inferCapturedBody(log, contentType, warnings) {
  const body = String(log?.request?.body ?? '');

  if (body.length === 0) {
    return {
      body: {
        mode: 'none',
        raw: '',
        json: ''
      },
      formFields: [],
      multipartFields: []
    };
  }

  if (isJsonContentType(contentType)) {
    try {
      JSON.parse(body);

      return {
        body: {
          mode: 'json',
          raw: body,
          json: body
        },
        formFields: [],
        multipartFields: []
      };
    } catch (error) {
      warnings.add(`captured JSON body is invalid; using raw body: ${error?.message ?? String(error)}`);
    }
  }

  if (!isFormUrlEncodedContentType(contentType) && !isMultipartContentType(contentType)) {
    const trimmedBody = body.trim();

    if (trimmedBody.startsWith('{') || trimmedBody.startsWith('[')) {
      try {
        JSON.parse(body);

        return {
          body: {
            mode: 'json',
            raw: body,
            json: body
          },
          formFields: [],
          multipartFields: []
        };
      } catch {
        // Keep raw mode when JSON sniffing fails.
      }
    }
  }

  if (isFormUrlEncodedContentType(contentType)) {
    const searchParams = new URLSearchParams(body);
    const formFields = Array.from(searchParams.entries()).map(([key, value]) => createRow({ key, value }));

    if (formFields.length > 0) {
      return {
        body: {
          mode: 'form-urlencoded',
          raw: body,
          json: body
        },
        formFields,
        multipartFields: []
      };
    }

    warnings.add('captured form body could not be parsed; using raw body');
  }

  if (isMultipartContentType(contentType)) {
    warnings.add('multipart body is captured as raw text and may not replay byte-perfectly');
  }

  return {
    body: {
      mode: 'raw',
      raw: body,
      json: body
    },
    formFields: [],
    multipartFields: []
  };
}

function normalizeCapturedMethod(method) {
  const normalized = normalizeMethod(method);

  return MANUAL_REQUEST_METHODS.includes(normalized) ? normalized : 'GET';
}

export function normalizeManualResendMetadata(metadata = {}) {
  const action = metadata?.action === 'edit-resend' ? 'edit-resend' : (metadata?.action === 'resend' ? 'resend' : null);

  if (!action) {
    return null;
  }

  return {
    action,
    sourceLogId: String(metadata.sourceLogId ?? ''),
    sourceMethod: String(metadata.sourceMethod ?? '').toUpperCase(),
    sourcePath: String(metadata.sourcePath ?? '')
  };
}

export function createManualRequestDraftFromLog(log, options = {}) {
  const warnings = new Set();
  const blockers = new Set();
  const requestHeaders = log?.request?.headers ?? {};
  const headerRows = [];
  const cookieRows = [];
  const method = normalizeCapturedMethod(log?.method);
  const url = String(log?.path || '/');

  for (const [name, value] of headerEntries(requestHeaders)) {
    if (isManagedManualRequestHeader(name)) {
      continue;
    }

    if (isRequestCookieHeaderName(name)) {
      const parsedCookies = parseCapturedCookieRows(value, blockers);

      if (parsedCookies.length > 0) {
        warnings.add('cookies included; review before resend');
      }

      cookieRows.push(...parsedCookies);
      continue;
    }

    if (AUTH_LIKE_HEADER_PATTERN.test(name)) {
      warnings.add(`auth-like header included: ${name}`);
    }

    headerRows.push(createRow({
      key: name,
      value,
      secret: AUTH_LIKE_HEADER_PATTERN.test(name)
    }));
  }

  const inferredBody = inferCapturedBody(log, getHeaderValue(requestHeaders, 'content-type'), warnings);

  if (log?.request?.truncated) {
    blockers.add('request body is truncated; exact resend requires edit');
  }

  if (['GET', 'HEAD'].includes(method) && hasCapturedBody(log)) {
    blockers.add(`${method} request has a captured body; edit before sending`);
  }

  const draft = createManualRequestDraft({
    body: inferredBody.body,
    cookies: cookieRows,
    environment: options.environment ?? [],
    formFields: inferredBody.formFields,
    headers: headerRows,
    method,
    multipartFields: inferredBody.multipartFields,
    name: `${method} ${url}`,
    url
  });
  const hasBody = hasCapturedBody(log);
  const action = options.action === 'resend' ? 'resend' : 'edit-resend';
  const metadata = normalizeManualResendMetadata({
    action,
    sourceLogId: log?.id,
    sourceMethod: method,
    sourcePath: url
  });
  const warningList = [...warnings];
  const blockerList = [...blockers];
  const requiresConfirmation = blockerList.length > 0 ||
    hasBody ||
    !['GET', 'HEAD'].includes(method) ||
    cookieRows.length > 0 ||
    headerRows.some((row) => AUTH_LIKE_HEADER_PATTERN.test(row.key)) ||
    warningList.length > 0;

  return {
    blockers: blockerList,
    draft,
    requiresConfirmation,
    resend: metadata,
    summary: {
      body: hasBody ? `${draft.body.mode} body (${String(log?.request?.body ?? '').length} chars)` : 'no body',
      cookies: cookieRows.length,
      headers: headerRows.length,
      method,
      path: url
    },
    warnings: warningList
  };
}

export function parseManualRequestHeaders(headersValue = '') {
  if (!headersValue) {
    return {};
  }

  if (Array.isArray(headersValue)) {
    return Object.fromEntries(headersValue
      .filter((row) => row?.enabled !== false && String(row?.key ?? '').trim())
      .map((row) => [assertManualHeaderName(row.key), asHeaderValue(row.value)]));
  }

  if (typeof headersValue === 'object') {
    return Object.fromEntries(
      Object.entries(headersValue)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([name, value]) => [assertManualHeaderName(name), asHeaderValue(value)])
    );
  }

  return Object.fromEntries(splitRawHeaderEntries(headersValue).map((entry) => {
    const separatorIndex = entry.indexOf(':');

    if (separatorIndex <= 0) {
      throw new Error(`invalid header: ${entry}`);
    }

    const name = assertManualHeaderName(entry.slice(0, separatorIndex));
    const value = entry.slice(separatorIndex + 1).trim();

    return [name, value];
  }));
}

export function serializeManualRequestHeaders(headersValue = {}) {
  return Object.entries(parseManualRequestHeaders(headersValue))
    .map(([name, value]) => `${name}: ${value}`)
    .join(HEADER_SEPARATOR);
}

function hasHeader(headers, name) {
  const normalizedName = String(name ?? '').toLowerCase();

  return Object.keys(headers).some((headerName) => headerName.toLowerCase() === normalizedName);
}

function getHeaderName(headers, name) {
  const normalizedName = String(name ?? '').toLowerCase();

  return Object.keys(headers).find((headerName) => headerName.toLowerCase() === normalizedName) ?? null;
}

function setHeader(headers, name, value) {
  const existingName = getHeaderName(headers, name);

  headers[existingName ?? name] = value;
}

function appendEnabledRowsToSearch(searchParams, rows, variables) {
  for (const row of rows) {
    if (row.enabled === false || !String(row.key ?? '').trim()) {
      continue;
    }

    searchParams.append(
      interpolateValue(row.key, variables),
      interpolateValue(row.value, variables)
    );
  }
}

function collectVariableRows(context = {}, draft) {
  return [
    ...normalizeRows(context.environment),
    ...normalizeRows(draft.environment)
  ];
}

function buildVariableMap(rows) {
  const variables = {};

  for (const row of rows) {
    if (row.enabled === false || !String(row.key ?? '').trim()) {
      continue;
    }

    variables[String(row.key).trim()] = String(row.value ?? '');
  }

  return variables;
}

function interpolateValue(value, variables) {
  return String(value ?? '').replace(VARIABLE_PATTERN, (_match, name) => {
    if (!Object.prototype.hasOwnProperty.call(variables, name)) {
      throw new Error(`undefined variable: ${name}`);
    }

    return variables[name];
  });
}

function validateRequestUrlValue(value) {
  const text = String(value ?? '').trim();

  if (hasLeadingUrlAuthority(text)) {
    throw new Error('protocol-relative URLs are not supported');
  }

  if (text.includes('\\')) {
    throw new Error('backslash URLs are not supported');
  }

  return text.length > 0 ? text : '/';
}

function resolveUrl(draft, context, variables) {
  const urlValue = validateRequestUrlValue(interpolateValue(draft.url, variables));
  const schemeMatch = urlValue.match(/^([a-z][a-z\d+.-]*):/i);
  let url;
  let isAbsolute = false;

  if (schemeMatch) {
    if (!/^https?:$/i.test(`${schemeMatch[1]}:`)) {
      throw new Error(`unsupported URL scheme: ${schemeMatch[1]}`);
    }

    url = new URL(urlValue);
    isAbsolute = true;
  } else {
    if (!context.targetUrl) {
      throw new Error('targetUrl is required for relative manual requests');
    }

    url = new URL(normalizeManualRequestPath(urlValue), context.targetUrl);
  }

  url.hash = '';
  appendEnabledRowsToSearch(url.searchParams, draft.params, variables);

  return {
    isAbsolute,
    logPath: isAbsolute ? url.href : `${url.pathname}${url.search}`,
    url
  };
}

function buildUserHeaders(draft, variables) {
  const headers = {};

  for (const row of draft.headers) {
    if (row.enabled === false || !String(row.key ?? '').trim()) {
      continue;
    }

    const name = assertManualHeaderName(interpolateValue(row.key, variables));

    headers[name] = interpolateValue(row.value, variables);
  }

  return headers;
}

function buildCookieHeader(draft, headers, variables) {
  const cookies = draft.cookies
    .filter((row) => row.enabled !== false && String(row.key ?? '').trim())
    .map((row) => `${interpolateValue(row.key, variables)}=${interpolateValue(row.value, variables)}`);

  if (cookies.length === 0) {
    return;
  }

  if (hasHeader(headers, 'cookie')) {
    throw new Error('Cookie header conflicts with Cookies tab');
  }

  headers.Cookie = cookies.join('; ');
}

function applyAuth(draft, headers, url, variables) {
  const auth = draft.auth ?? { mode: 'none' };

  if (auth.mode === 'none') {
    return;
  }

  if (auth.mode === 'bearer') {
    if (hasHeader(headers, 'authorization')) {
      throw new Error('Authorization header conflicts with Auth tab');
    }

    headers.Authorization = `Bearer ${interpolateValue(auth.bearerToken, variables)}`;
    return;
  }

  if (auth.mode === 'basic') {
    if (hasHeader(headers, 'authorization')) {
      throw new Error('Authorization header conflicts with Auth tab');
    }

    const username = interpolateValue(auth.username, variables);
    const password = interpolateValue(auth.password, variables);
    const encoded = Buffer.from(`${username}:${password}`).toString('base64');

    headers.Authorization = `Basic ${encoded}`;
    return;
  }

  if (auth.mode === 'apiKey') {
    const key = interpolateValue(auth.apiKey?.key, variables).trim();
    const value = interpolateValue(auth.apiKey?.value, variables);

    if (!key) {
      throw new Error('API key name is required');
    }

    if (auth.apiKey?.placement === 'query') {
      if (url.searchParams.has(key)) {
        throw new Error(`query param ${key} conflicts with Auth tab`);
      }

      url.searchParams.append(key, value);
      return;
    }

    const headerName = assertManualHeaderName(key);

    if (hasHeader(headers, headerName)) {
      throw new Error(`header ${headerName} conflicts with Auth tab`);
    }

    headers[headerName] = value;
  }
}

function shouldSendBody(method, bodyResult) {
  return bodyResult.hasBody && !['GET', 'HEAD'].includes(method);
}

function assertMethodAllowsBody(method, bodyResult) {
  if (bodyResult.hasBody && ['GET', 'HEAD'].includes(method)) {
    throw new Error(`${method} requests cannot include a body`);
  }
}

async function buildRequestBody(draft, variables, context = {}) {
  const mode = draft.body?.mode ?? 'none';

  if (mode === 'none') {
    return {
      body: undefined,
      contentType: null,
      hasBody: false,
      logBody: ''
    };
  }

  if (mode === 'raw') {
    const body = interpolateValue(draft.body.raw, variables);

    return {
      body,
      contentType: 'text/plain; charset=utf-8',
      hasBody: body.length > 0,
      logBody: body
    };
  }

  if (mode === 'json') {
    const body = interpolateValue(draft.body.json, variables);

    if (body.trim().length > 0) {
      try {
        JSON.parse(body);
      } catch (error) {
        throw new Error(`invalid JSON body: ${error?.message ?? String(error)}`);
      }
    }

    return {
      body,
      contentType: 'application/json',
      hasBody: body.length > 0,
      logBody: body
    };
  }

  if (mode === 'form-urlencoded') {
    const form = new URLSearchParams();

    appendEnabledRowsToSearch(form, draft.formFields, variables);

    return {
      body: form.toString(),
      contentType: 'application/x-www-form-urlencoded; charset=utf-8',
      hasBody: form.toString().length > 0,
      logBody: form.toString()
    };
  }

  if (mode === 'multipart') {
    const form = new FormData();
    const fileReader = context.fileReader ?? ((filePath) => fs.readFile(filePath));
    const summary = [];
    let count = 0;

    for (const row of draft.multipartFields) {
      if (row.enabled === false || !String(row.key ?? '').trim()) {
        continue;
      }

      const key = interpolateValue(row.key, variables);

      if (row.type === 'file') {
        const filePath = interpolateValue(row.filePath || row.value, variables);

        if (!filePath) {
          throw new Error(`multipart file path is required for ${key}`);
        }

        const content = await fileReader(filePath);
        const blob = new Blob([content]);
        const filename = path.basename(filePath);

        form.append(key, blob, filename);
        summary.push(`file ${key}=@${filePath} (${blob.size} bytes)`);
        count += 1;
      } else {
        const value = interpolateValue(row.value, variables);

        form.append(key, value);
        summary.push(`field ${key}=${value}`);
        count += 1;
      }
    }

    return {
      body: form,
      contentType: null,
      hasBody: count > 0,
      logBody: summary.length > 0 ? `[multipart]\n${summary.join('\n')}` : ''
    };
  }

  throw new Error(`unsupported body mode: ${mode}`);
}

export function normalizeManualRequestPath(pathValue = '/') {
  const rawPath = String(pathValue ?? '').trim();
  const pathValueText = rawPath.length === 0 ? '/' : rawPath;

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(pathValueText)) {
    throw new Error('absolute URLs are not supported');
  }

  if (hasLeadingUrlAuthority(pathValueText) || pathValueText.includes('\\')) {
    throw new Error('absolute URLs are not supported');
  }

  return pathValueText.startsWith('/') ? pathValueText : `/${pathValueText}`;
}

export function validateManualRequest(input = {}, context = {}) {
  const draft = normalizeManualRequestDraft(input);
  const variables = buildVariableMap(collectVariableRows(context, draft));

  if (['GET', 'HEAD'].includes(draft.method)) {
    const hasBody = (draft.body.mode === 'raw' && draft.body.raw.length > 0) ||
      (draft.body.mode === 'json' && draft.body.json.length > 0) ||
      (draft.body.mode === 'form-urlencoded' && draft.formFields.some((row) => row.enabled !== false && row.key)) ||
      (draft.body.mode === 'multipart' && draft.multipartFields.some((row) => row.enabled !== false && row.key));

    if (hasBody) {
      throw new Error(`${draft.method} requests cannot include a body`);
    }
  }

  resolveUrl(draft, context, variables);
  buildUserHeaders(draft, variables);

  return draft;
}

export function resolveManualRequestUrl(targetUrl, pathValue) {
  if (!targetUrl) {
    throw new Error('targetUrl is required');
  }

  return new URL(normalizeManualRequestPath(pathValue), targetUrl).href;
}

export async function buildManualFetchRequest(input = {}, context = {}) {
  const draft = normalizeManualRequestDraft(input);
  const variables = buildVariableMap(collectVariableRows(context, draft));
  const { logPath, url } = resolveUrl(draft, context, variables);
  const headers = buildUserHeaders(draft, variables);
  const bodyResult = await buildRequestBody(draft, variables, context);

  assertMethodAllowsBody(draft.method, bodyResult);
  buildCookieHeader(draft, headers, variables);
  applyAuth(draft, headers, url, variables);

  if (!hasHeader(headers, 'accept')) {
    headers.accept = '*/*';
  }

  if (bodyResult.contentType && !hasHeader(headers, 'content-type')) {
    headers['content-type'] = bodyResult.contentType;
  }

  const logHeaders = {
    ...headers,
    host: url.host
  };

  return {
    body: shouldSendBody(draft.method, bodyResult) ? bodyResult.body : undefined,
    draft,
    headers,
    logBody: bodyResult.logBody,
    logHeaders,
    logPath,
    method: draft.method,
    url: url.href
  };
}

export async function sendManualRequest(input = {}, context = {}) {
  const bodyLimit = context.bodyLimit ?? input.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const fetchImpl = context.fetchImpl ?? input.fetchImpl ?? globalThis.fetch;
  const now = context.now ?? input.now ?? Date.now;
  const targetUrl = context.targetUrl ?? input.targetUrl;
  const resend = normalizeManualResendMetadata(context.resend ?? input.resend);
  const startedAt = Number(now());
  const fetchRequest = await buildManualFetchRequest(input, {
    ...context,
    targetUrl
  });

  try {
    const response = await fetchImpl(fetchRequest.url, {
      body: fetchRequest.body,
      headers: fetchRequest.headers,
      method: fetchRequest.method
    });
    const responseBody = truncateTextBody(await response.text(), bodyLimit);
    const requestBody = truncateTextBody(fetchRequest.logBody, bodyLimit);

    return {
      id: `manual-${randomUUID()}`,
      timestamp: startedAt,
      method: fetchRequest.method,
      path: fetchRequest.logPath,
      statusCode: response.status,
      responseTimeMs: Math.max(0, Number(now()) - startedAt),
      ...(resend ? { resend } : {}),
      request: {
        headers: fetchRequest.logHeaders,
        body: requestBody.body,
        truncated: requestBody.truncated
      },
      response: {
        headers: headersFromResponse(response),
        body: responseBody.body,
        truncated: responseBody.truncated
      }
    };
  } catch (error) {
    const message = error?.message ?? String(error);
    const responseBody = truncateTextBody(`${BAD_GATEWAY_PREFIX} ${message}`, bodyLimit);
    const requestBody = truncateTextBody(fetchRequest.logBody, bodyLimit);

    return {
      id: `manual-${randomUUID()}`,
      timestamp: startedAt,
      method: fetchRequest.method,
      path: fetchRequest.logPath,
      statusCode: 502,
      responseTimeMs: Math.max(0, Number(now()) - startedAt),
      ...(resend ? { resend } : {}),
      request: {
        headers: fetchRequest.logHeaders,
        body: requestBody.body,
        truncated: requestBody.truncated
      },
      response: {
        headers: {
          'content-type': 'text/plain; charset=utf-8'
        },
        body: responseBody.body,
        truncated: responseBody.truncated
      }
    };
  }
}
