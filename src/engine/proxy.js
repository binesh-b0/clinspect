import { DEFAULT_BODY_LIMIT, truncateTextBody } from '../store/state.js';

const MOCK_TRAFFIC = [
  {
    method: 'GET',
    path: '/api/users?limit=20',
    statusCode: 200,
    responseTimeMs: 42,
    request: {
      headers: {
        accept: 'application/json',
        'user-agent': 'clinspect-demo'
      },
      body: ''
    },
    response: {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store'
      },
      body: JSON.stringify({ users: [{ id: 1, name: 'Ada Lovelace' }, { id: 2, name: 'Grace Hopper' }] }, null, 2)
    }
  },
  {
    method: 'POST',
    path: '/api/sessions',
    statusCode: 201,
    responseTimeMs: 88,
    request: {
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify({ email: 'demo@example.com', remember: true }, null, 2)
    },
    response: {
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ token: 'demo-token', expiresIn: 3600 }, null, 2)
    }
  },
  {
    method: 'PATCH',
    path: '/api/projects/clinspect',
    statusCode: 204,
    responseTimeMs: 31,
    request: {
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ status: 'mvp', inspector: true }, null, 2)
    },
    response: {
      headers: {},
      body: ''
    }
  },
  {
    method: 'GET',
    path: '/api/reports/daily',
    statusCode: 502,
    responseTimeMs: 506,
    request: {
      headers: {
        accept: 'application/json'
      },
      body: ''
    },
    response: {
      headers: {
        'content-type': 'text/plain'
      },
      body: 'Bad Gateway: upstream demo service is unreachable.'
    }
  },
  {
    method: 'POST',
    path: '/api/events/bulk',
    statusCode: 202,
    responseTimeMs: 122,
    request: {
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        events: Array.from({ length: 12 }, (_, index) => ({
          type: 'demo.event',
          sequence: index + 1,
          payload: 'sample payload '.repeat(18)
        }))
      }, null, 2)
    },
    response: {
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({ accepted: 12, queued: true }, null, 2)
    }
  }
];

function cloneHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }

  return { ...headers };
}

function applyBodyLimit(payload, bodyLimit) {
  const body = truncateTextBody(payload.body, bodyLimit);

  return {
    headers: cloneHeaders(payload.headers),
    body: body.body,
    truncated: body.truncated
  };
}

export function createMockLogEntry(index = 0, options = {}) {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const timestamp = options.timestamp ?? Date.now();
  const template = MOCK_TRAFFIC[index % MOCK_TRAFFIC.length];
  const cycle = Math.floor(index / MOCK_TRAFFIC.length);

  return {
    id: `mock-${String(index + 1).padStart(4, '0')}`,
    timestamp,
    method: template.method,
    path: cycle > 0 ? `${template.path}${template.path.includes('?') ? '&' : '?'}demoCycle=${cycle}` : template.path,
    statusCode: template.statusCode,
    responseTimeMs: template.responseTimeMs + cycle * 7,
    request: applyBodyLimit(template.request, bodyLimit),
    response: applyBodyLimit(template.response, bodyLimit)
  };
}

export function seedMockTraffic(stateStore, options = {}) {
  const count = options.count ?? 5;
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const now = options.now ?? Date.now();

  for (let index = 0; index < count; index += 1) {
    stateStore.addLog(createMockLogEntry(index, {
      bodyLimit,
      timestamp: now - (count - index) * 1500
    }));
  }

  return stateStore.getLogs();
}

export function startMockTrafficFeed(stateStore, options = {}) {
  const bodyLimit = options.bodyLimit ?? DEFAULT_BODY_LIMIT;
  const intervalMs = options.intervalMs ?? 1600;
  const seedCount = options.seedCount ?? 5;
  let nextIndex = seedCount;

  seedMockTraffic(stateStore, {
    count: seedCount,
    bodyLimit
  });

  const timer = setInterval(() => {
    stateStore.addLog(createMockLogEntry(nextIndex, {
      bodyLimit,
      timestamp: Date.now()
    }));
    nextIndex += 1;
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    }
  };
}
