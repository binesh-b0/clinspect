import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getProxyOrigin,
  isLoopbackHostname,
  isLoopbackTargetUrl,
  isPublicTargetUrl
} from '../src/target.js';

test('target helpers classify loopback and public targets', () => {
  assert.equal(isLoopbackHostname('localhost'), true);
  assert.equal(isLoopbackHostname('api.localhost'), true);
  assert.equal(isLoopbackHostname('127.0.0.1'), true);
  assert.equal(isLoopbackHostname('127.2.3.4'), true);
  assert.equal(isLoopbackHostname('::1'), true);
  assert.equal(isLoopbackHostname('example.com'), false);

  assert.equal(isLoopbackTargetUrl('http://localhost:3000'), true);
  assert.equal(isLoopbackTargetUrl('http://127.0.0.1:3000'), true);
  assert.equal(isLoopbackTargetUrl('https://www.example.com'), false);
  assert.equal(isPublicTargetUrl('https://www.example.com'), true);
  assert.equal(isPublicTargetUrl('http://localhost:3000'), false);
  assert.equal(getProxyOrigin(9090), 'http://localhost:9090');
});
