import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { startLiveProxy } from '../src/engine/proxy.js';
import { StateStore } from '../src/store/state.js';

async function startServer(handler) {
  const server = http.createServer(handler);

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();

  return {
    server,
    url: `http://127.0.0.1:${address.port}`
  };
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

async function getUnusedPort() {
  const { server, url } = await startServer((req, res) => {
    res.end('unused');
  });
  const port = Number(new URL(url).port);

  await closeServer(server);

  return port;
}

function proxyUrl(proxy) {
  const address = proxy.address();

  return `http://127.0.0.1:${address.port}`;
}

test('startLiveProxy forwards requests and captures traffic logs', async () => {
  const upstream = await startServer((req, res) => {
    let body = '';

    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      setTimeout(() => {
        res.statusCode = 201;
        res.setHeader('content-type', 'application/json');
        res.setHeader('x-upstream', 'captured');
        res.end(JSON.stringify({
          method: req.method,
          path: req.url,
          body,
          header: req.headers['x-test']
        }));
      }, 10);
    });
  });
  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    targetUrl: upstream.url
  });

  try {
    await proxy.ready;

    const response = await fetch(`${proxyUrl(proxy)}/api/demo?x=1`, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-test': 'abc'
      },
      body: 'hello live proxy'
    });

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-upstream'), 'captured');

    const responseBody = await response.json();

    assert.deepEqual(responseBody, {
      method: 'POST',
      path: '/api/demo?x=1',
      body: 'hello live proxy',
      header: 'abc'
    });

    const logs = store.getLogs();

    assert.equal(logs.length, 1);

    const [log] = logs;

    assert.match(log.id, /^live-/);
    assert.equal(log.method, 'POST');
    assert.equal(log.path, '/api/demo?x=1');
    assert.equal(log.statusCode, 201);
    assert.equal(log.responseTimeMs > 0, true);
    assert.equal(log.request.headers['x-test'], 'abc');
    assert.equal(log.request.body, 'hello live proxy');
    assert.equal(log.response.headers['x-upstream'], 'captured');
    assert.match(log.response.body, /"path":"\/api\/demo\?x=1"/);
  } finally {
    await proxy.stop();
    await closeServer(upstream.server);
  }
});

test('startLiveProxy caps captured request and response bodies', async () => {
  const upstream = await startServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.setHeader('content-type', 'text/plain');
      res.end('0123456789abcdef');
    });
  });
  const store = new StateStore({ maxEntries: 10, bodyLimit: 10 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 10,
    port: 0,
    targetUrl: upstream.url
  });

  try {
    await proxy.ready;

    const response = await fetch(`${proxyUrl(proxy)}/long`, {
      method: 'POST',
      body: 'abcdefghijklmnopqrstuvwxyz'
    });

    assert.equal(await response.text(), '0123456789abcdef');

    const [log] = store.getLogs();

    assert.equal(log.request.body, 'abcdefghij');
    assert.equal(log.request.truncated, true);
    assert.equal(log.response.body, '0123456789');
    assert.equal(log.response.truncated, true);
  } finally {
    await proxy.stop();
    await closeServer(upstream.server);
  }
});

test('startLiveProxy preserves Cookie and multiple Set-Cookie headers in logs', async () => {
  const upstream = await startServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.statusCode = 200;
      res.setHeader('set-cookie', [
        'sid=abc; Path=/; HttpOnly',
        'theme=dark; Path=/'
      ]);
      res.end(req.headers.cookie ?? '');
    });
  });
  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    targetUrl: upstream.url
  });

  try {
    await proxy.ready;

    const response = await fetch(`${proxyUrl(proxy)}/cookies`, {
      headers: {
        cookie: 'sid=abc; theme=dark'
      }
    });

    assert.equal(await response.text(), 'sid=abc; theme=dark');

    const [log] = store.getLogs();

    assert.equal(log.request.headers.cookie, 'sid=abc; theme=dark');
    assert.deepEqual(log.response.headers['set-cookie'], [
      'sid=abc; Path=/; HttpOnly',
      'theme=dark; Path=/'
    ]);
  } finally {
    await proxy.stop();
    await closeServer(upstream.server);
  }
});

test('startLiveProxy can forward while capture is paused', async () => {
  const upstream = await startServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.end('forwarded');
    });
  });
  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    shouldCapture: () => false,
    targetUrl: upstream.url
  });

  try {
    await proxy.ready;

    const response = await fetch(`${proxyUrl(proxy)}/paused`);

    assert.equal(await response.text(), 'forwarded');
    assert.deepEqual(store.getLogs(), []);
  } finally {
    await proxy.stop();
    await closeServer(upstream.server);
  }
});

test('startLiveProxy rewrites target redirects back to the proxy origin', async () => {
  let upstreamUrl;
  const upstream = await startServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.statusCode = 302;
      res.setHeader('location', `${upstreamUrl}/next`);
      res.end('redirect');
    });
  });
  upstreamUrl = upstream.url;

  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    targetUrl: upstream.url
  });

  try {
    await proxy.ready;

    const origin = proxyUrl(proxy);
    const response = await fetch(`${origin}/redirect`, {
      redirect: 'manual'
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${origin}/next`);

    const [log] = store.getLogs();

    assert.equal(log.statusCode, 302);
    assert.equal(log.response.headers.location, `${origin}/next`);
  } finally {
    await proxy.stop();
    await closeServer(upstream.server);
  }
});

test('startLiveProxy returns and logs 502 when upstream is unavailable', async () => {
  const unavailablePort = await getUnusedPort();
  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    targetUrl: `http://127.0.0.1:${unavailablePort}`
  });

  try {
    await proxy.ready;

    const response = await fetch(`${proxyUrl(proxy)}/missing`);

    assert.equal(response.status, 502);
    assert.match(await response.text(), /Bad Gateway/);

    const [log] = store.getLogs();

    assert.equal(log.method, 'GET');
    assert.equal(log.path, '/missing');
    assert.equal(log.statusCode, 502);
    assert.match(log.response.body, /Bad Gateway/);
  } finally {
    await proxy.stop();
  }
});

test('startLiveProxy stop releases the listening port', async () => {
  const upstream = await startServer((req, res) => {
    res.end('ok');
  });
  const store = new StateStore({ maxEntries: 10, bodyLimit: 1000 });
  const proxy = startLiveProxy(store, {
    bodyLimit: 1000,
    port: 0,
    targetUrl: upstream.url
  });
  let replacement;

  try {
    await proxy.ready;

    const port = proxy.address().port;

    await proxy.stop();

    replacement = http.createServer((req, res) => {
      res.end('replacement');
    });
    replacement.listen(port, '127.0.0.1');
    await once(replacement, 'listening');

    const response = await fetch(`http://127.0.0.1:${port}/`);

    assert.equal(await response.text(), 'replacement');
  } finally {
    if (replacement) {
      await closeServer(replacement);
    }

    await proxy.stop();
    await closeServer(upstream.server);
  }
});
