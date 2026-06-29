import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COOKIE_VALUE_MASK,
  maskCookieHeaderValue,
  maskCookieHeaders,
  maskLogEntryCookies,
  maskRequestCookieHeader,
  maskSetCookieHeader
} from '../src/cookies.js';

test('maskRequestCookieHeader keeps cookie names and masks values', () => {
  assert.equal(
    maskRequestCookieHeader('sid=abc; theme=dark; empty='),
    `sid=${COOKIE_VALUE_MASK}; theme=${COOKIE_VALUE_MASK}; empty=${COOKIE_VALUE_MASK}`
  );
});

test('maskRequestCookieHeader masks malformed cookie segments conservatively', () => {
  assert.equal(
    maskRequestCookieHeader('sid=abc; malformed; theme=dark'),
    `sid=${COOKIE_VALUE_MASK}; ${COOKIE_VALUE_MASK}; theme=${COOKIE_VALUE_MASK}`
  );
  assert.equal(maskRequestCookieHeader(''), COOKIE_VALUE_MASK);
});

test('maskSetCookieHeader keeps attributes and masks only the cookie value', () => {
  assert.equal(
    maskSetCookieHeader('sid=abc; Path=/; HttpOnly; Secure; SameSite=Lax'),
    `sid=${COOKIE_VALUE_MASK}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
  assert.equal(
    maskSetCookieHeader('empty=; Domain=example.com; Max-Age=0'),
    `empty=${COOKIE_VALUE_MASK}; Domain=example.com; Max-Age=0`
  );
});

test('maskSetCookieHeader masks malformed values conservatively', () => {
  assert.equal(maskSetCookieHeader('malformed; HttpOnly'), COOKIE_VALUE_MASK);
  assert.equal(maskSetCookieHeader(''), COOKIE_VALUE_MASK);
});

test('maskCookieHeaderValue preserves multiple Set-Cookie header values', () => {
  assert.deepEqual(
    maskCookieHeaderValue('set-cookie', [
      'sid=abc; Path=/; HttpOnly',
      'theme=dark; Path=/'
    ]),
    [
      `sid=${COOKIE_VALUE_MASK}; Path=/; HttpOnly`,
      `theme=${COOKIE_VALUE_MASK}; Path=/`
    ]
  );
});

test('maskCookieHeaders and maskLogEntryCookies leave non-cookie headers unchanged', () => {
  const headers = {
    cookie: 'sid=abc',
    authorization: 'Bearer raw',
    'set-cookie': ['sid=abc; Path=/']
  };

  assert.deepEqual(maskCookieHeaders(headers), {
    cookie: `sid=${COOKIE_VALUE_MASK}`,
    authorization: 'Bearer raw',
    'set-cookie': [`sid=${COOKIE_VALUE_MASK}; Path=/`]
  });

  assert.deepEqual(maskLogEntryCookies({
    request: { headers },
    response: { headers: { 'set-cookie': 'token=secret; Secure' } }
  }), {
    request: {
      headers: {
        cookie: `sid=${COOKIE_VALUE_MASK}`,
        authorization: 'Bearer raw',
        'set-cookie': [`sid=${COOKIE_VALUE_MASK}; Path=/`]
      }
    },
    response: {
      headers: {
        'set-cookie': `token=${COOKIE_VALUE_MASK}; Secure`
      }
    }
  });
});
