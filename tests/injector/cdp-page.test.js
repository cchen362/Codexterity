'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createPageAdapter, isCodexPageTarget } = require('../../injector/core/cdp-page.js');

// ---------------------------------------------------------------------
// isCodexPageTarget() against the plan's fact 7 real target list, measured
// 2026-09-26 against Codex 26.924.1866.0's /json listing.
// ---------------------------------------------------------------------

const FACT_7_TARGETS = [
  { type: 'webview', url: 'https://some-inline-visualization-sandbox.example/', targetId: 'webview-1' },
  { type: 'webview', url: 'https://chatgpt.com/checkout', targetId: 'webview-2' },
  { type: 'page', url: 'app://-/index.html?initialRoute=%2Favatar-overlay', targetId: 'page-overlay' },
  { type: 'page', url: 'app://-/detached-window.html?foo=bar', targetId: 'page-detached' },
  { type: 'page', url: 'app://-/index.html', targetId: 'page-main' },
];

test('isCodexPageTarget() accepts every page target whose URL is app://', () => {
  const accepted = FACT_7_TARGETS.filter(isCodexPageTarget).map((t) => t.targetId);
  assert.deepEqual(accepted, ['page-overlay', 'page-detached', 'page-main']);
});

test('isCodexPageTarget() rejects webview targets even when the URL looks like Codex\'s own scheme', () => {
  assert.equal(isCodexPageTarget({ type: 'webview', url: 'app://-/index.html' }), false);
});

test('isCodexPageTarget() rejects a page target whose URL is not app://', () => {
  assert.equal(isCodexPageTarget({ type: 'page', url: 'https://chatgpt.com/checkout' }), false);
  assert.equal(isCodexPageTarget({ type: 'page', url: 'devtools://devtools/bundled/inspector.html' }), false);
});

test('isCodexPageTarget() is false for missing/malformed targetInfo', () => {
  assert.equal(isCodexPageTarget(null), false);
  assert.equal(isCodexPageTarget(undefined), false);
  assert.equal(isCodexPageTarget({}), false);
  assert.equal(isCodexPageTarget({ type: 'page' }), false); // no url at all
});

// ---------------------------------------------------------------------
// createPageAdapter() — the webContents-shaped mapping onto Runtime.evaluate.
// ---------------------------------------------------------------------

function makeFakeClient({ result }) {
  const sent = [];
  return {
    sent,
    async send(method, params, sessionId) {
      sent.push({ method, params, sessionId });
      if (typeof result === 'function') return result({ method, params, sessionId });
      return result;
    },
  };
}

test('getURL() returns the URL the adapter was created with', () => {
  const client = makeFakeClient({ result: {} });
  const page = createPageAdapter({ client, sessionId: 's1', targetId: 't1', url: 'app://-/index.html' });
  assert.equal(page.getURL(), 'app://-/index.html');
});

test('updateUrl() changes what getURL() subsequently returns, for a real navigation', () => {
  const client = makeFakeClient({ result: {} });
  const page = createPageAdapter({ client, sessionId: 's1', targetId: 't1', url: 'app://-/index.html' });
  page.updateUrl('app://-/index.html?initialRoute=%2Favatar-overlay');
  assert.equal(page.getURL(), 'app://-/index.html?initialRoute=%2Favatar-overlay');
});

test('executeJavaScript() sends Runtime.evaluate with awaitPromise and returnByValue, scoped to the session', async () => {
  const client = makeFakeClient({ result: { result: { value: 42 } } });
  const page = createPageAdapter({ client, sessionId: 'session-abc', targetId: 't1', url: 'app://-/index.html' });
  const value = await page.executeJavaScript('1 + 1');
  assert.equal(value, 42);
  assert.equal(client.sent.length, 1);
  assert.equal(client.sent[0].method, 'Runtime.evaluate');
  assert.equal(client.sent[0].sessionId, 'session-abc');
  assert.equal(client.sent[0].params.expression, '1 + 1');
  assert.equal(client.sent[0].params.awaitPromise, true);
  assert.equal(client.sent[0].params.returnByValue, true);
});

test('executeJavaScript() rejects with the exceptionDetails text when the evaluated script throws', async () => {
  const client = makeFakeClient({
    result: {
      exceptionDetails: {
        text: 'Uncaught',
        exception: { description: 'Error: something broke' },
      },
    },
  });
  const page = createPageAdapter({ client, sessionId: 's1', targetId: 't1', url: 'app://-/index.html' });
  await assert.rejects(page.executeJavaScript('throw new Error("x")'), /something broke/);
});

test('executeJavaScript() falls back to exceptionDetails.text when no exception description is present', async () => {
  const client = makeFakeClient({
    result: { exceptionDetails: { text: 'SyntaxError: Unexpected token' } },
  });
  const page = createPageAdapter({ client, sessionId: 's1', targetId: 't1', url: 'app://-/index.html' });
  await assert.rejects(page.executeJavaScript('{{{'), /Unexpected token/);
});

test('executeJavaScript() resolves undefined when Runtime.evaluate returns no result value (e.g. undefined-returning script)', async () => {
  const client = makeFakeClient({ result: { result: {} } });
  const page = createPageAdapter({ client, sessionId: 's1', targetId: 't1', url: 'app://-/index.html' });
  const value = await page.executeJavaScript('undefined');
  assert.equal(value, undefined);
});
