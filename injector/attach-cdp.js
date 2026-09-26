#!/usr/bin/env node
'use strict';

/**
 * Codexterity — the shared CDP attacher (Plan 0005 M1)
 * -------------------------------------------------------------------------
 * Entry point: `node injector/attach-cdp.js --port <n> --theme <package path>
 * [--timeout-ms <n>]`.
 *
 * This is the Windows-primary route Plan 0005 builds (see that plan's "The
 * design" section for the full picture): Codex 26.924 requires a Windows
 * package identity to start at all, and a process launched that way does not
 * inherit the calling shell's environment (facts 2-3), so the old
 * NODE_OPTIONS/CDX_THEME_PACKAGE preload route (injector/core/inject.js) can
 * no longer reach it. Codex DOES honour `--remote-debugging-port` when
 * launched with identity (fact 4), so the launcher starts Codex that way and
 * this script attaches over that loopback CDP endpoint afterwards, applying
 * the theme to every Codex page target instead of relying on a preload
 * having run inside Codex's own process.
 *
 * Exit codes, per the plan's attacher contract:
 *   0 - the browser's websocket connection closed (Codex exited normally).
 *   1 - the theme failed to load (ThemeLoadError or any other error from
 *       loadTheme()) — logged, then exit; Codex is left running stock.
 *   2 - the debugging port never answered within the timeout — logged
 *       plainly, then exit; Codex is left running stock.
 *
 * Every log line goes through the SAME sink injector/core/inject.js uses
 * (injector/core/log-sink.js — stdout plus CDX_DEBUG_LOG_PATH when set), so
 * a launcher log capturing this script's stdout/stderr reads exactly like
 * inject.js's own preload log always has.
 */

const { createLogger } = require('./core/log-sink.js');
const { loadTheme, ThemeLoadError } = require('./theme-loader/index.js');
const { buildStyleTagScript } = require('./core/style-tag.js');
const { reportRootEnvironment } = require('./core/root-environment.js');
const { reportLandmarkVerdicts } = require('./core/landmarks.js');
const { createPageAdapter, isCodexPageTarget } = require('./core/cdp-page.js');
const { connect } = require('./core/cdp-client.js');

const log = createLogger('[codexterity]');

const DEFAULT_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 250;

// Same schedule inject.js uses for the settled re-check (see that module's
// DEFAULT_VERIFY_SCHEDULE doc comment for why 15000ms specifically): Plan
// 0002 M3 measured every screen-relevant landmark PRESENT and stable at
// +8000/+15000/+25000ms on the main window, so re-using the same offset here
// keeps the two entry points' diagnostics comparable rather than inventing a
// second, untested number.
const SETTLED_VERIFY_MS = 15000;

/**
 * Parse the entry point's command-line arguments. Pure and exported so
 * tests can drive it without spawning a process. Unknown flags are
 * ignored rather than rejected — this script is not a general CLI, and a
 * strict parser would make it fragile to add an optional flag later.
 */
function parseArgs(argv) {
  const result = { port: null, theme: null, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') {
      result.port = Number(argv[++i]);
    } else if (arg === '--theme') {
      result.theme = argv[++i];
    } else if (arg === '--timeout-ms') {
      result.timeoutMs = Number(argv[++i]);
    }
  }
  return result;
}

/**
 * Poll `http://127.0.0.1:<port>/json/version` until it answers with a body
 * carrying `webSocketDebuggerUrl`, or until `timeoutMs` elapses. Returns the
 * parsed JSON on success, or `null` on timeout — never throws for a timeout,
 * since that is an ordinary, expected outcome (exit code 2 is not a bug).
 *
 * `fetchImpl` and `sleepImpl` are injected so this is testable without a real
 * network call or a real wall-clock wait (a test's `sleepImpl` can resolve
 * immediately while still exercising the retry loop's own logic).
 */
async function waitForEndpoint(fetchImpl, port, timeoutMs, sleepImpl) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/json/version`;
  for (;;) {
    try {
      const response = await fetchImpl(url);
      if (response && response.ok) {
        const body = await response.json();
        if (body && body.webSocketDebuggerUrl) return body;
      }
    } catch (err) {
      // Connection refused is the expected state before Codex has opened
      // the port; keep polling rather than treating it as fatal.
    }
    if (Date.now() >= deadline) return null;
    await sleepImpl(POLL_INTERVAL_MS);
  }
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Apply the theme's style-tag script to one attached page: as an
 * on-new-document script (so a later navigation is themed before first
 * paint — this is what keeps the stock flash to the very first window only,
 * per the plan's design) and immediately, for the document already showing.
 */
async function applyThemeToPage(page, styleTagScript, label) {
  await page.executeJavaScript(styleTagScript);
  const bytes = Buffer.byteLength(styleTagScript, 'utf8');
  log(`injected OK via CDP style tag on ${label} — ${bytes} chars`);
}

async function reportForPage(page, phase, landmarks) {
  await reportRootEnvironment(page, { log, lastAppliedRoute: 'CDP style tag (author origin)' });
  await reportLandmarkVerdicts({ webContents: page, landmarks, phase, log });
}

/**
 * Attach to one Codex page target: enable Page/Runtime, install the
 * on-new-document script, apply immediately to the document already
 * showing, report landmarks, schedule the settled re-check, and re-apply on
 * every top-frame navigation (D-0003-9's measurement stands: in-app route
 * changes fire no navigation event at all, so this is at most a few applies
 * per session, never a per-keystroke cost).
 */
async function attachToPage({ client, targetInfo, theme, styleTagScript, timers }) {
  const { sessionId } = await client.send('Target.attachToTarget', {
    targetId: targetInfo.targetId,
    flatten: true,
  });
  const page = createPageAdapter({
    client,
    sessionId,
    targetId: targetInfo.targetId,
    url: targetInfo.url,
  });
  const label = `page#${targetInfo.targetId} (${targetInfo.url})`;

  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send(
    'Page.addScriptToEvaluateOnNewDocument',
    { source: styleTagScript },
    sessionId
  );

  await applyThemeToPage(page, styleTagScript, label);
  await reportForPage(page, 'apply-time (cdp attach)', theme.manifest.landmarks);

  const settledTimer = timers.setTimeout(() => {
    reportForPage(page, `settled +${SETTLED_VERIFY_MS}ms`, theme.manifest.landmarks).catch((err) => {
      log(`  settled landmark re-check FAILED on ${label}: ${err.message}`);
    });
  }, SETTLED_VERIFY_MS);
  if (settledTimer && typeof settledTimer.unref === 'function') settledTimer.unref();

  client.on('Page.frameNavigated', async (params, eventSessionId) => {
    if (eventSessionId !== sessionId) return;
    // Only the TOP frame — a re-apply per sub-frame navigation is not what
    // D-0001-1's re-application logic ever did, and every declared landmark
    // lives in the top document.
    if (params.frame && params.frame.parentId) return;
    try {
      page.updateUrl(params.frame.url);
      log(`Page.frameNavigated on ${label} -> ${params.frame.url}`);
      await applyThemeToPage(page, styleTagScript, label);
      await reportForPage(page, 'apply-time (cdp attach)', theme.manifest.landmarks);
    } catch (err) {
      // Never throw out of an event handler (docs/ENGINEERING.md — degrade
      // to stock, never half-styled, never crash the attacher).
      log(`  re-apply on navigation FAILED on ${label}: ${err.message}`);
    }
  });

  return page;
}

/**
 * The main flow, with every side-effecting dependency injectable so
 * `run()` can be driven end to end under node:test without a real theme
 * package, a real port, or a real websocket. Returns a numeric exit code
 * rather than calling `process.exit()` itself — only the `require.main`
 * guard below does that, which is what makes `run()` testable.
 */
async function run({
  argv,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  connectImpl = connect,
  loadThemeImpl = loadTheme,
  timers = { setTimeout, clearTimeout },
} = {}) {
  const { port, theme: themePath, timeoutMs } = parseArgs(argv);

  let theme;
  try {
    theme = loadThemeImpl(themePath);
    log(
      `theme package loaded from ${theme.sourcePath} (${theme.sourceKind}) — ` +
        `id=${theme.id}  ${Buffer.byteLength(theme.css, 'utf8')} bytes of CSS  ` +
        `${theme.manifest.landmarks.length} landmark(s) declared`
    );
  } catch (err) {
    const code = err instanceof ThemeLoadError ? err.code : 'UNEXPECTED';
    log(`STARTUP FAILED [${code}], running stock/unthemed: ${err.message}`);
    return 1;
  }

  const styleTagScript = buildStyleTagScript(theme.css);

  const endpoint = await waitForEndpoint(fetchImpl, port, timeoutMs, sleepImpl);
  if (!endpoint) {
    log(`STARTUP FAILED: http://127.0.0.1:${port}/json/version did not answer within ${timeoutMs}ms — running stock/unthemed`);
    return 2;
  }
  log(`connected to Codex's debugging endpoint: ${endpoint.webSocketDebuggerUrl}`);

  const client = await connectImpl(endpoint.webSocketDebuggerUrl);
  const attached = new Set(); // targetId -> tracked, so a duplicate targetCreated is a no-op

  const tryAttach = (targetInfo) => {
    if (!isCodexPageTarget(targetInfo)) return;
    if (attached.has(targetInfo.targetId)) return;
    attached.add(targetInfo.targetId);
    attachToPage({ client, targetInfo, theme, styleTagScript, timers }).catch((err) => {
      log(`  failed to attach to ${targetInfo.targetId} (${targetInfo.url}): ${err.message}`);
    });
  };

  client.on('Target.targetCreated', (params) => tryAttach(params.targetInfo));
  // Plan 0005 M2, measured on a FRESH launch (as opposed to M1's attach to an
  // already-running Codex): Chromium announces a new page target BEFORE it has
  // a URL — `Target.targetCreated` carries url "" / about:blank — so the
  // app:// filter rightly rejects it, and it only becomes a Codex page in a
  // later `Target.targetInfoChanged`. Without this listener the first launch
  // themed nothing at all while the log said "connected". `attached` makes a
  // re-announcement of an already-attached target a no-op.
  client.on('Target.targetInfoChanged', (params) => tryAttach(params.targetInfo));
  client.on('Target.targetDestroyed', (params) => {
    attached.delete(params.targetId);
  });

  await client.send('Target.setDiscoverTargets', { discover: true });
  const { targetInfos } = await client.send('Target.getTargets');
  for (const targetInfo of targetInfos || []) tryAttach(targetInfo);

  const closed = new Promise((resolve) => client.onClose(resolve));
  await closed;
  log('Codex\'s debugging connection closed — Codex has exited.');
  return 0;
}

if (require.main === module) {
  run({ argv: process.argv.slice(2) })
    .then((code) => process.exit(code))
    .catch((err) => {
      log(`UNEXPECTED FAILURE: ${err.message}\n${err.stack}`);
      process.exit(1);
    });
}

module.exports = { parseArgs, waitForEndpoint, run };
