'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ThemeLoadError } = require('../../injector/theme-loader/errors.js');
const { parseArgs, waitForEndpoint, run } = require('../../injector/attach-cdp.js');

// ---------------------------------------------------------------------
// parseArgs()
// ---------------------------------------------------------------------

test('parseArgs() reads --port, --theme and --timeout-ms', () => {
  const args = parseArgs(['--port', '9333', '--theme', 'themes/captains-cabin', '--timeout-ms', '5000']);
  assert.equal(args.port, 9333);
  assert.equal(args.theme, 'themes/captains-cabin');
  assert.equal(args.timeoutMs, 5000);
});

test('parseArgs() defaults --timeout-ms to 30000 when not given', () => {
  const args = parseArgs(['--port', '9333', '--theme', 'themes/captains-cabin']);
  assert.equal(args.timeoutMs, 30000);
});

test('parseArgs() leaves port/theme null when not given, rather than throwing', () => {
  const args = parseArgs([]);
  assert.equal(args.port, null);
  assert.equal(args.theme, null);
});

// ---------------------------------------------------------------------
// waitForEndpoint() — the port poll, with an injected fetch and sleep so no
// real network call or wall-clock wait happens in the suite.
// ---------------------------------------------------------------------

test('waitForEndpoint() resolves with the parsed body as soon as fetch answers with webSocketDebuggerUrl', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/abc' }) };
  };
  const sleepImpl = async () => {};
  const result = await waitForEndpoint(fetchImpl, 9333, 5000, sleepImpl);
  assert.equal(result.webSocketDebuggerUrl, 'ws://127.0.0.1:9333/devtools/browser/abc');
  assert.equal(calls, 1);
});

test('waitForEndpoint() retries through connection-refused-style rejections until it succeeds', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 3) throw new Error('ECONNREFUSED');
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://x' }) };
  };
  let slept = 0;
  const sleepImpl = async () => {
    slept++;
  };
  const result = await waitForEndpoint(fetchImpl, 9333, 5000, sleepImpl);
  assert.equal(result.webSocketDebuggerUrl, 'ws://x');
  assert.equal(calls, 3);
  assert.equal(slept, 2);
});

test('waitForEndpoint() returns null (never throws) once the deadline passes', async () => {
  const fetchImpl = async () => {
    throw new Error('ECONNREFUSED');
  };
  // A fake clock: sleepImpl advances a shared counter past the timeout
  // instead of actually waiting, so the test resolves instantly.
  let now = 0;
  const realDateNow = Date.now;
  Date.now = () => now;
  try {
    const sleepImpl = async () => {
      now += 1000;
    };
    const result = await waitForEndpoint(fetchImpl, 9333, 2500, sleepImpl);
    assert.equal(result, null);
  } finally {
    Date.now = realDateNow;
  }
});

test('waitForEndpoint() keeps polling when fetch resolves but the body has no webSocketDebuggerUrl yet', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls++;
    if (calls < 2) return { ok: true, json: async () => ({}) };
    return { ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://y' }) };
  };
  const result = await waitForEndpoint(fetchImpl, 9333, 5000, async () => {});
  assert.equal(result.webSocketDebuggerUrl, 'ws://y');
  assert.equal(calls, 2);
});

// ---------------------------------------------------------------------
// run() — the three exit codes, with client/fetch/loadTheme all injected.
// ---------------------------------------------------------------------

function fakeTheme(overrides = {}) {
  return {
    sourcePath: '/fake/theme',
    sourceKind: 'directory',
    id: 'fake-theme',
    css: ':root { --x: 1; }',
    manifest: { landmarks: [] },
    ...overrides,
  };
}

test('run() returns exit code 1 when the theme fails to load, and never touches the network', async () => {
  let fetchCalled = false;
  const code = await run({
    argv: ['--port', '9333', '--theme', 'bad/path'],
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error('should not be called');
    },
    loadThemeImpl: () => {
      throw new ThemeLoadError('SOURCE_NOT_FOUND', 'no such theme package');
    },
  });
  assert.equal(code, 1);
  assert.equal(fetchCalled, false);
});

test('run() returns exit code 2 when the port never answers within the timeout', async () => {
  let now = 0;
  const realDateNow = Date.now;
  Date.now = () => now;
  try {
    const code = await run({
      argv: ['--port', '9333', '--theme', 'themes/captains-cabin', '--timeout-ms', '1000'],
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
      sleepImpl: async () => {
        now += 500;
      },
      loadThemeImpl: () => fakeTheme(),
    });
    assert.equal(code, 2);
  } finally {
    Date.now = realDateNow;
  }
});

test('run() returns exit code 0 once the browser connection closes, after attaching to targets', async () => {
  const sent = [];
  let closeHandler = null;
  const fakeClient = {
    async send(method, params) {
      sent.push({ method, params });
      if (method === 'Target.getTargets') {
        return {
          targetInfos: [
            { type: 'page', url: 'app://-/index.html', targetId: 'main' },
            { type: 'webview', url: 'https://chatgpt.com/checkout', targetId: 'checkout' },
          ],
        };
      }
      if (method === 'Target.attachToTarget') {
        return { sessionId: 'session-main' };
      }
      if (method === 'Runtime.evaluate') {
        return { result: { value: { rootClass: '(none)' } } };
      }
      return {};
    },
    on() {},
    onClose(handler) {
      closeHandler = handler;
      // Simulate Codex exiting immediately after attach, on the next tick,
      // so the test does not hang waiting for a real process to close.
      setImmediate(() => closeHandler());
    },
  };
  const code = await run({
    argv: ['--port', '9333', '--theme', 'themes/captains-cabin'],
    fetchImpl: async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/x' }) }),
    connectImpl: async () => fakeClient,
    loadThemeImpl: () => fakeTheme(),
  });
  assert.equal(code, 0);
  // The webview target must never have been attached to.
  const attachedTargets = sent.filter((s) => s.method === 'Target.attachToTarget').map((s) => s.params.targetId);
  assert.deepEqual(attachedTargets, ['main']);
  assert.ok(sent.some((s) => s.method === 'Target.setDiscoverTargets'));
});

// ---------------------------------------------------------------------
// Regression: a FRESH Codex launch announces a new page target BEFORE it
// carries a URL. `Target.targetCreated` fires with url "" (the isCodexPageTarget
// filter rightly rejects that), and the target only becomes recognisable as
// a Codex page once a later `Target.targetInfoChanged` reports its real
// app:// URL. Real-app QA found that attach-cdp.js themed nothing at all on a
// fresh launch because only `Target.targetCreated` was wired to tryAttach();
// the fix (already applied, not by this change) also listens for
// `Target.targetInfoChanged`. This test drives that exact sequence through a
// fake client and proves the target is attached exactly once — not on the
// blank targetCreated, and not a second time on a repeat targetInfoChanged
// for the same target (attach-cdp.js's `attached` set is what is being
// proven here, since a re-announced target must not attach twice).
// ---------------------------------------------------------------------

test('a page target created with url "" and later identified via Target.targetInfoChanged is attached exactly once', async () => {
  const sent = [];
  let targetCreatedHandler = null;
  let targetInfoChangedHandler = null;
  let closeHandler = null;
  const fakeClient = {
    async send(method, params) {
      sent.push({ method, params });
      if (method === 'Target.getTargets') {
        // Nothing pre-existing at connect time — this is a FRESH launch, so
        // the only path to attachment is the events below.
        return { targetInfos: [] };
      }
      if (method === 'Target.attachToTarget') {
        return { sessionId: 'session-main' };
      }
      if (method === 'Runtime.evaluate') {
        return { result: { value: { rootClass: '(none)' } } };
      }
      return {};
    },
    on(eventName, handler) {
      if (eventName === 'Target.targetCreated') targetCreatedHandler = handler;
      if (eventName === 'Target.targetInfoChanged') targetInfoChangedHandler = handler;
    },
    onClose(handler) {
      closeHandler = handler;
    },
  };

  const runPromise = run({
    argv: ['--port', '9333', '--theme', 'themes/captains-cabin'],
    fetchImpl: async () => ({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser/x' }) }),
    connectImpl: async () => fakeClient,
    loadThemeImpl: () => fakeTheme(),
  });

  // Give run() a tick to finish its setup (send Target.setDiscoverTargets,
  // register listeners) before events start firing, matching the real
  // sequencing where the browser announces targets only after discovery is
  // requested.
  await new Promise((resolve) => setImmediate(resolve));

  assert.ok(targetCreatedHandler, 'expected Target.targetCreated to be subscribed');
  assert.ok(targetInfoChangedHandler, 'expected Target.targetInfoChanged to be subscribed');

  // The blank announcement: url "" must not attach.
  targetCreatedHandler({ targetInfo: { type: 'page', url: '', targetId: 'fresh-1' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    sent.filter((s) => s.method === 'Target.attachToTarget').length,
    0,
    'a blank-URL targetCreated must not attach'
  );

  // The real URL arrives via targetInfoChanged: this must attach.
  targetInfoChangedHandler({ targetInfo: { type: 'page', url: 'app://-/index.html', targetId: 'fresh-1' } });
  await new Promise((resolve) => setImmediate(resolve));
  const afterFirstChange = sent.filter((s) => s.method === 'Target.attachToTarget');
  assert.equal(afterFirstChange.length, 1, 'expected exactly one attach after the target gained its real URL');
  assert.equal(afterFirstChange[0].params.targetId, 'fresh-1');

  // A repeat targetInfoChanged for the SAME target (e.g. a later, unrelated
  // property change) must not attach a second time.
  targetInfoChangedHandler({ targetInfo: { type: 'page', url: 'app://-/index.html', targetId: 'fresh-1' } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(
    sent.filter((s) => s.method === 'Target.attachToTarget').length,
    1,
    'a repeat targetInfoChanged for an already-attached target must not attach again'
  );

  closeHandler();
  const code = await runPromise;
  assert.equal(code, 0);
});
