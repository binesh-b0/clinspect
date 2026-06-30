const LOCAL_ORIGIN = 'http://clinspect.local';
const PAGINATION_KEYS = Object.freeze(['page', 'pageSize', 'page_size', 'limit', 'offset', 'cursor', 'after', 'before']);
const PAGINATION_KEY_SET = new Set(PAGINATION_KEYS);

function extractQueryString(value = '') {
  const text = String(value ?? '').trim();

  if (!text) {
    return '';
  }

  if (text.startsWith('?')) {
    return text.slice(1).split('#')[0];
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:\/\//.test(text)) {
    try {
      return new URL(text).search.slice(1);
    } catch {
      return '';
    }
  }

  const questionIndex = text.indexOf('?');

  if (questionIndex !== -1) {
    return text.slice(questionIndex + 1).split('#')[0];
  }

  if (!text.startsWith('/') && (text.includes('=') || text.includes('&'))) {
    return text.split('#')[0];
  }

  try {
    return new URL(text, LOCAL_ORIGIN).search.slice(1);
  } catch {
    return '';
  }
}

function parseBracketKey(key = '') {
  const text = String(key ?? '');
  const bracketIndex = text.indexOf('[');

  if (bracketIndex === -1) {
    return [text];
  }

  const root = text.slice(0, bracketIndex);

  if (!root) {
    return [text];
  }

  const parts = [root];
  let index = bracketIndex;

  while (index < text.length) {
    if (text[index] !== '[') {
      return [text];
    }

    const closeIndex = text.indexOf(']', index + 1);

    if (closeIndex === -1) {
      return [text];
    }

    parts.push(text.slice(index + 1, closeIndex));
    index = closeIndex + 1;
  }

  return parts;
}

function isContainer(value) {
  return value !== null && typeof value === 'object';
}

function setValue(target, key, value) {
  if (!Object.prototype.hasOwnProperty.call(target, key)) {
    target[key] = value;
    return;
  }

  if (Array.isArray(target[key])) {
    target[key].push(value);
    return;
  }

  target[key] = [target[key], value];
}

function createChildContainer(existingValue, nextPart) {
  const container = nextPart === '' ? [] : {};

  if (existingValue !== undefined) {
    if (Array.isArray(container)) {
      container.push(existingValue);
    } else {
      container.$value = existingValue;
    }
  }

  return container;
}

function assignNestedParts(target, parts, value) {
  if (!Array.isArray(parts) || parts.length === 0) {
    return;
  }

  const [part, ...rest] = parts;

  if (rest.length === 0) {
    if (part === '') {
      if (Array.isArray(target)) {
        target.push(value);
      } else {
        setValue(target, '$items', value);
      }
      return;
    }

    setValue(target, part, value);
    return;
  }

  if (part === '') {
    if (!Array.isArray(target)) {
      const fallback = rest[0] === '' ? [] : {};
      assignNestedParts(fallback, rest, value);
      setValue(target, '$items', fallback);
      return;
    }

    const child = rest[0] === '' ? [] : {};
    target.push(child);
    assignNestedParts(child, rest, value);
    return;
  }

  if (!isContainer(target[part])) {
    target[part] = createChildContainer(target[part], rest[0]);
  }

  assignNestedParts(target[part], rest, value);
}

function splitListValue(value) {
  const text = String(value ?? '');

  return text.includes(',')
    ? text.split(',').map((item) => item.trim())
    : [text];
}

function appendListValues(target, value) {
  target.push(...splitListValue(value));
}

function appendSortValues(target, value) {
  for (const rawValue of splitListValue(value)) {
    if (!rawValue) {
      continue;
    }

    const direction = rawValue.startsWith('-') ? 'desc' : 'asc';
    const field = rawValue.startsWith('-') || rawValue.startsWith('+')
      ? rawValue.slice(1)
      : rawValue;

    target.push({
      direction,
      field,
      raw: rawValue
    });
  }
}

function assignFieldsValue(fields, parts, value) {
  const values = splitListValue(value);

  if (!Array.isArray(parts) || parts.length === 0) {
    setValue(fields, '$all', values.length === 1 ? values[0] : values);
    return;
  }

  if (parts.length === 1 && parts[0] === '') {
    setValue(fields, '$all', values.length === 1 ? values[0] : values);
    return;
  }

  assignNestedParts(fields, parts, values.length === 1 ? values[0] : values);
}

function isExplicitFilterRoot(root) {
  const normalizedRoot = String(root ?? '').toLowerCase();

  return normalizedRoot === 'filter' || normalizedRoot === 'filters';
}

function isSimpleImplicitFilter(parts = []) {
  const [root, secondPart, ...rest] = parts;

  if (!root || /[\[\]]/.test(root) || rest.length > 0) {
    return false;
  }

  return parts.length === 1 || secondPart === '';
}

function getEntryGroup(parts = []) {
  const root = String(parts[0] ?? '');
  const normalizedRoot = root.toLowerCase();

  if (isExplicitFilterRoot(root)) {
    return 'filters';
  }

  if (normalizedRoot === 'sort') {
    return 'sort';
  }

  if (PAGINATION_KEY_SET.has(root)) {
    return 'pagination';
  }

  if (normalizedRoot === 'q' || normalizedRoot === 'query' || normalizedRoot === 'search') {
    return 'search';
  }

  if (normalizedRoot === 'include') {
    return 'include';
  }

  if (normalizedRoot === 'fields') {
    return 'fields';
  }

  return isSimpleImplicitFilter(parts) ? 'filters' : 'other';
}

function createEmptyResult(query = '') {
  return {
    decoded: {},
    detected: false,
    fields: {},
    filters: {},
    include: [],
    other: {},
    pagination: {},
    query,
    rawEntries: [],
    search: {},
    sort: []
  };
}

export function parseQueryParameters(pathOrQuery = '') {
  const query = extractQueryString(pathOrQuery);
  const result = createEmptyResult(query);

  if (!query) {
    return result;
  }

  const params = new URLSearchParams(query);

  for (const [key, value] of params.entries()) {
    const parts = parseBracketKey(key);
    const group = getEntryGroup(parts);

    result.detected = true;
    result.rawEntries.push({
      group,
      key,
      path: parts,
      value
    });
    assignNestedParts(result.decoded, parts, value);

    if (group === 'filters') {
      const targetParts = isExplicitFilterRoot(parts[0])
        ? (parts.slice(1).length > 0 ? parts.slice(1) : ['$value'])
        : parts;

      assignNestedParts(result.filters, targetParts, value);
    } else if (group === 'sort') {
      appendSortValues(result.sort, value);
    } else if (group === 'pagination') {
      setValue(result.pagination, parts[0], value);
    } else if (group === 'search') {
      if (parts[0].toLowerCase() === 'search' && parts.length > 1) {
        assignNestedParts(result.search, parts.slice(1), value);
      } else {
        setValue(result.search, parts[0], value);
      }
    } else if (group === 'include') {
      appendListValues(result.include, value);
    } else if (group === 'fields') {
      assignFieldsValue(result.fields, parts.slice(1), value);
    } else {
      assignNestedParts(result.other, parts, value);
    }
  }

  return result;
}
