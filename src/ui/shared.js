import React from 'react';

export const h = React.createElement;

export const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
export const STATUS_OPTIONS = ['2xx', '3xx', '4xx', '5xx'];
export const DETAIL_TABS = ['request', 'response'];
export const SEARCH_FIELDS = ['all', 'path', 'status', 'method', 'time', 'host', 'port', 'headers', 'body'];
export const FILTER_FOCUS_ORDER = ['query', 'field', 'method', 'status'];
export const TRAFFIC_PATH_MODES = ['smart', 'start', 'end'];
export const TRAFFIC_DENSITY_PRESETS = ['full', 'compact', 'path'];
export const TRAFFIC_WIDTH_MODES = ['normal', 'half', 'wide', 'full'];
export const PANE_WIDTH_TARGETS = ['traffic', 'details'];
export const LIST_DISPLAY_FOCUS_ORDER = ['pathMode', 'density', 'widthMode', 'frameworkAssets', 'time', 'method', 'status', 'duration'];
export const COMPOSER_TABS = ['params', 'headers', 'body', 'auth', 'cookies', 'env', 'save'];
export const COMPOSER_TAB_LABELS = {
  auth: 'Auth',
  body: 'Body',
  cookies: 'Cookies',
  env: 'Env',
  headers: 'Headers',
  params: 'Params',
  save: 'Save'
};
export const COMPOSER_TAB_SHORTCUTS = new Map(COMPOSER_TABS.map((tab, index) => [String(index + 1), tab]));
export const COMPOSER_RAIL_WIDTH = 22;
export const API_KEY_PLACEMENTS = ['header', 'query'];
export const MULTIPART_FIELD_TYPES = ['text', 'file'];
export const ROOT_PADDING_X = 1;
export const TRAFFIC_LIST_WIDTH = 50;
export const TRAFFIC_ROW_WIDTH = 45;
export const TRAFFIC_PANE_GAP = 1;
export const MIN_TRAFFIC_PANE_WIDTH = 32;
export const MIN_DETAIL_PANE_WIDTH = 32;
export const FALLBACK_TERMINAL_COLUMNS = 80;
export const BODY_LINE_MAX_LENGTH = 120;
export const DETAIL_SEARCH_BAR_HEIGHT = 5;
export const RESEND_CONFIRM_BAR_HEIGHT = 6;
export const COMMAND_MODAL_ROW_COUNT = 7;
export const COMMAND_MODAL_HEIGHT = 18;
export const COMMAND_MODAL_MAX_WIDTH = 68;
export const COMMAND_MODAL_MIN_WIDTH = 46;
export const TEXTUAL_CONTENT_TYPE_PATTERNS = [
  /^text\//,
  /(?:^|[+/.-])json$/,
  /(?:^|[+/.-])xml$/,
  /(?:^|[+/.-])javascript$/,
  /(?:^|[+/.-])typescript$/,
  /(?:^|[+/.-])x-www-form-urlencoded$/,
  /(?:^|[+/.-])graphql$/
];
export const STATIC_ASSET_EXTENSION_PATTERN = /\.(?:avif|bmp|cjs|css|eot|gif|ico|jpeg|jpg|js|jsx|mjs|mp3|mp4|otf|png|svg|ttf|ts|tsx|vue|wasm|wav|webm|webmanifest|webp|woff2?)$/i;
export const STATIC_ASSET_FILE_PATTERN = /^\/(?:browserconfig\.xml|favicon\.ico|manifest\.json|robots\.txt|site\.webmanifest)$/i;
export const FRAMEWORK_SOURCE_MODULE_PATTERN = /^\/(?:app|components|node_modules|pages|src)\/.*\.(?:[cm]?[jt]sx?|css|svelte|vue)$/i;
export const FRAMEWORK_NAMES = ['Next.js', 'Vite', 'Nuxt', 'Astro', 'SvelteKit', 'Remix', 'Gatsby', 'Webpack'];
export const FRAMEWORK_ASSET_PATH_MATCHERS = [
  {
    framework: 'Next.js',
    patterns: [/^\/_next(?:\/|$)/i, /^\/__nextjs(?:_|\/|$)/i]
  },
  {
    framework: 'Vite',
    patterns: [/^\/@vite(?:\/|$)/i, /^\/@react-refresh(?:\/|$)/i, /^\/@id(?:\/|$)/i, /^\/@fs(?:\/|$)/i, /^\/__vite(?:_|\/|$)/i]
  },
  {
    framework: 'Nuxt',
    patterns: [/^\/_nuxt(?:\/|$)/i, /^\/__nuxt(?:\/|$)/i]
  },
  {
    framework: 'Astro',
    patterns: [/^\/_astro(?:\/|$)/i]
  },
  {
    framework: 'SvelteKit',
    patterns: [/^\/_app\/immutable(?:\/|$)/i]
  },
  {
    framework: 'Remix',
    patterns: [/^\/build\/(?:_assets|assets|_shared|routes)(?:\/|$)/i]
  },
  {
    framework: 'Gatsby',
    patterns: [/^\/page-data(?:\/|$)/i, /^\/___gatsby(?:\/|$)/i]
  },
  {
    framework: 'Webpack',
    patterns: [/^\/__webpack(?:_|\/|$)/i, /^\/webpack-dev-server(?:\/|$)/i, /^\/sockjs-node(?:\/|$)/i]
  }
];

export const STATIC_ASSET_CONTENT_TYPE_PATTERNS = [
  /^image\//,
  /^font\//,
  /^audio\//,
  /^video\//,
  /^text\/css$/,
  /^(?:application|text)\/(?:x-)?javascript$/,
  /^application\/wasm$/,
  /^application\/font-woff2?$/,
  /^application\/vnd\.ms-fontobject$/,
  /^application\/manifest\+json$/
];
export const OFF_RECORDING_STATUS = {
  mode: 'off',
  path: null,
  state: 'off',
  error: null
};

export const METHOD_COLORS = {
  GET: 'green',
  POST: 'cyan',
  PUT: 'yellow',
  PATCH: 'magenta',
  DELETE: 'red'
};

export const TRAFFIC_COLUMN_WIDTHS = {
  duration: 6,
  method: 6,
  status: 3,
  time: 8
};

export const DEFAULT_TRAFFIC_LIST_DISPLAY = {
  columns: {
    duration: true,
    method: true,
    status: true,
    time: true
  },
  density: 'full',
  pathMode: 'smart',
  widthMode: 'normal',
  widthTarget: 'traffic'
};

export const TRAFFIC_DENSITY_COLUMNS = {
  compact: {
    duration: false,
    method: true,
    status: true,
    time: false
  },
  full: DEFAULT_TRAFFIC_LIST_DISPLAY.columns,
  path: {
    duration: false,
    method: false,
    status: false,
    time: false
  }
};


export function getTerminalRows(terminalRows = process.stdout.rows) {
  return Number.isFinite(terminalRows) && terminalRows > 0
    ? Math.floor(terminalRows)
    : 24;
}

export function truncate(value, maxLength) {
  const text = String(value ?? '');

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function pad(value, length) {
  return String(value).padEnd(length).slice(0, length);
}

export function padLeft(value, length) {
  return String(value).padStart(length).slice(-length);
}

export function getRenderHeight(terminalRows = process.stdout.rows) {
  const rows = getTerminalRows(terminalRows);

  // Ink clears the whole terminal when rendered output is >= stdout.rows.
  // Keep one row free so routine UI updates use incremental line erases.
  return Math.max(1, rows - 1);
}

export function getTrafficVisibleCount(bottomOffset, terminalRows = process.stdout.rows) {
  return Math.max(5, getTerminalRows(terminalRows) - bottomOffset);
}


export function formatOptionToken(value, options = {}) {
  const displayValue = options.label ?? value;
  const label = options.selected ? `[${displayValue}]` : displayValue;

  return options.cursor ? `<${label}>` : ` ${label} `;
}
