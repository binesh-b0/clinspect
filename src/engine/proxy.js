import http from 'http';
import { randomUUID } from 'crypto';
import httpProxy from 'http-proxy';
import { DEFAULT_BODY_LIMIT, truncateTextBody } from '../store/state.js';

const BAD_GATEWAY_BODY = 'Bad Gateway: upstream target server is unreachable.';

function createBodyRecorder(limit = DEFAULT_BODY_LIMIT) {
  const maxBytes = Math.max(0, limit);
  const chunks = [];
  let byteLength = 0;
  let truncated = false;

  return {
    append(chunk, encoding) {
      if (chunk === null || chunk === undefined) {
        return;
      }

      if (
        typeof chunk !== 'string' &&
        !Buffer.isBuffer(chunk) &&
        !(chunk instanceof Uint8Array)
      ) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk, typeof encoding === 'string' ? encoding : undefined);

      if (byteLength >= maxBytes) {
        truncated = truncated || buffer.length > 0;
        return;
      }

      const remaining = maxBytes - byteLength;

      if (buffer.length > remaining) {
        chunks.push(buffer.subarray(0, remaining));
        byteLength += remaining;
        truncated = true;
        return;
      }

      chunks.push(buffer);
      byteLength += buffer.length;
    },

    toPayload(headers = {}) {
      return {
        headers,
        body: Buffer.concat(chunks, byteLength).toString('utf8'),
        truncated
      };
    }
  };
}

function elapsedMs(startedAt) {
  return Math.max(0, Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6));
}

function shouldCaptureLog(shouldCapture) {
  return typeof shouldCapture !== 'function' || shouldCapture();
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function startLiveProxy(stateStore, options = {}) {
  const {
    bodyLimit = DEFAULT_BODY_LIMIT,
    port,
    shouldCapture,
    targetUrl
  } = options;

  if (!targetUrl) {
    throw new Error('targetUrl is required for live proxy mode');
  }

  const proxy = httpProxy.createProxyServer({
    changeOrigin: true
  });
  const sockets = new Set();
  let stopped = false;

  const server = http.createServer((req, res) => {
    const timestamp = Date.now();
    const startedAt = process.hrtime.bigint();
    const requestRecorder = createBodyRecorder(bodyLimit);
    const responseRecorder = createBodyRecorder(bodyLimit);
    let finalized = false;

    req.on('data', (chunk) => {
      requestRecorder.append(chunk);
    });

    const finalizeLog = () => {
      if (finalized) {
        return;
      }

      finalized = true;

      if (!shouldCaptureLog(shouldCapture)) {
        return;
      }

      stateStore.addLog({
        id: `live-${randomUUID()}`,
        timestamp,
        method: req.method,
        path: req.url,
        statusCode: res.statusCode,
        responseTimeMs: elapsedMs(startedAt),
        request: requestRecorder.toPayload(req.headers),
        response: responseRecorder.toPayload(res.getHeaders())
      });
    };

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    res.write = (chunk, encoding, callback) => {
      responseRecorder.append(chunk, encoding);
      return originalWrite(chunk, encoding, callback);
    };

    res.end = (chunk, encoding, callback) => {
      responseRecorder.append(chunk, encoding);
      finalizeLog();
      return originalEnd(chunk, encoding, callback);
    };

    proxy.web(req, res, { target: targetUrl }, () => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('content-type', 'text/plain; charset=utf-8');
      }

      res.end(BAD_GATEWAY_BODY);
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  const ready = new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  ready.catch(() => {});

  server.listen(port);

  return {
    ready,
    server,
    address() {
      return server.address();
    },
    async stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      proxy.close();
      const closePromise = closeServer(server);

      for (const socket of sockets) {
        socket.destroy();
      }

      await closePromise;
    }
  };
}

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
  const shouldCapture = options.shouldCapture;
  let nextIndex = seedCount;

  if (shouldCaptureLog(shouldCapture)) {
    seedMockTraffic(stateStore, {
      count: seedCount,
      bodyLimit
    });
  }

  const timer = setInterval(() => {
    if (!shouldCaptureLog(shouldCapture)) {
      return;
    }

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
