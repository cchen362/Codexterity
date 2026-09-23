'use strict';

/**
 * Codexterity — throwaway Codex driver for the Plan 0004 M1 inventory
 * ---------------------------------------------------------------------
 * WHAT THIS IS
 *
 * A `NODE_OPTIONS=--require` preload (same mechanism as injector/core/inject.js,
 * D-0001-1: no debug port) that runs inside a SEPARATE, throwaway Codex
 * instance started by ../inventory/run-inventory.mjs on a temporary
 * `--user-data-dir`. It never touches the owner's own running Codex, and
 * because the instance runs on a brand-new profile it never reads
 * ~/.codex/auth.json, ~/.codex/.credentials.json, or any real credential
 * (D-0001-3 — non-destructive by construction: this module reads DOM state
 * and calls only the official webContents API; it writes nothing but the
 * inventory report files under CDX_INVENTORY_OUT).
 *
 * It steps the instance through a fixed list of screens (Codex home, an
 * existing Codex thread, ChatGPT Chat home, ChatGPT Work home, the mode-
 * switch overlay), in both dark and light mode, runs the existing live
 * inventory probe (injector/core/probe.js) on each, saves a screenshot, and
 * quits. See docs/plans/0004-codex-owl-token-remap.md, M1.
 *
 * HARD SAFETY RULES — do not relax these when editing this file:
 *   - Never type text into anything, never press Enter.
 *   - Never click send/submit/voice/microphone/"Approve for me"/model
 *     pickers/settings.
 *   - Never archive, pin, or delete anything.
 *   - The ONLY clicks this driver performs are: the "Switch mode" button and
 *     its two menu items, the Chat/Work home toggle, the "New chat" nav
 *     item, and a thread row's text area (never its Pin/Archive buttons).
 *   - A global 5-minute safety timeout calls app.quit() no matter what state
 *     the driver is in.
 *   - A scenario whose setup cannot be verified is recorded FAILED with a
 *     reason and its probes are skipped — never caught-and-ignored, and
 *     never allowed to abort the whole run (project rule: fail loudly).
 *   - The Codex vs ChatGPT app-mode choice is SHARED with the owner's real
 *     Codex — it is account/Codex-side state, not part of this throwaway
 *     --user-data-dir profile (measured: a brand-new profile still started
 *     in ChatGPT mode, left over from an earlier scouting run). Restore
 *     ALWAYS returns the app mode to whatever was observed at the START of
 *     this run (manifest.facts.initialAppMode), never to a hardcoded mode.
 *
 * AMBIGUITY NOTE: the brief does not say whether a synthetic click via
 * sendInputEvent needs the target window focused first. It has not been
 * exercised against a real Codex window; if clicks land but do nothing,
 * focusing the BrowserWindow (win.focus()) before each click is the first
 * thing to try.
 */

const fs = require('fs');
const path = require('path');

const PROBE_PATH = path.join(__dirname, '..', '..', 'injector', 'core', 'probe.js');
const { runProbe } = require(PROBE_PATH);

// ---------------------------------------------------------------------------
// Pure helpers — no Electron, so these are exercised by `node --check` and by
// the throwaway parse-check the implementer ran before committing this file.
// ---------------------------------------------------------------------------

/**
 * True only for the app's main window: `app://-/index.html` with no
 * `initialRoute` query param. Other windows (avatar overlay, detached
 * windows, …) must be ignored (Plan 0004 M1 instructions).
 */
function isMainWindowUrl(url) {
  if (!url) return false;
  const qIndex = url.indexOf('?');
  const base = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = qIndex === -1 ? '' : url.slice(qIndex);
  return base === 'app://-/index.html' && query.indexOf('initialRoute=') === -1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// In-page finder expressions. Each is a STRING of a JS expression that,
// evaluated in the page, returns an Element or null. Built by string
// concatenation (never nested template literals) so there is no backtick-
// escaping hazard when they are spliced into the wrapping eval script below.
// ---------------------------------------------------------------------------

// `[aria-label="New chat"]` alone resolves to the WRONG element — scouted
// against a real window, it matched something at (311,1581) with empty
// text on a ~1600px-tall window, nowhere near the sidebar nav item. Scope
// the search to the left sidebar panel and require an exact trimmed-text
// match on an actually clickable element, falling back to null (scenario
// FAILED) rather than clicking whatever else in the DOM happens to carry
// that aria-label.
const NEW_CHAT_EXPR =
  '(function(){' +
  'var panel = document.querySelector(".app-shell-left-panel");' +
  'if (!panel) return null;' +
  'var candidates = panel.querySelectorAll(\'a, button, [role="button"], .sidebar-item\');' +
  'for (var i = 0; i < candidates.length; i++) {' +
  'if ((candidates[i].textContent || "").trim() === "New chat") return candidates[i];' +
  '}' +
  'return null;' +
  '})()';

const SWITCH_MODE_EXPR =
  'document.querySelector(\'[aria-label^="Switch mode, current mode: "]\')';

/**
 * The mode-switch popup lists both "ChatGPT" / "Create, learn, and explore"
 * and "Codex" / "Build, debug, and ship". We want the smallest (most
 * specific / deepest) element whose trimmed text STARTS WITH the target
 * name, searched among elements inside the popup containers — never the
 * container itself if that container's text merely happens to start with
 * the target while also holding the other item.
 */
function pickMenuItemExpr(target) {
  return (
    '(function(){' +
    'var target = ' + JSON.stringify(target) + ';' +
    'var containers = document.querySelectorAll(' +
    '\'[data-radix-popper-content-wrapper], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="option"]\'' +
    ');' +
    'var best = null, bestCount = Infinity;' +
    'containers.forEach(function(root){' +
    'var all = root.querySelectorAll("*");' +
    'var candidates = [root].concat(Array.prototype.slice.call(all));' +
    'candidates.forEach(function(el){' +
    'var text = (el.textContent || "").trim();' +
    'if (text.indexOf(target) === 0) {' +
    'var count = el.querySelectorAll("*").length;' +
    'if (count < bestCount) { bestCount = count; best = el; }' +
    '}' +
    '});' +
    '});' +
    'return best;' +
    '})()'
  );
}

/** The first sidebar row that is a real thread (carries a Pin/Archive action). */
const THREAD_ROW_EXPR =
  '(function(){' +
  'var rows = document.querySelectorAll(".sidebar-item");' +
  'for (var i = 0; i < rows.length; i++) {' +
  'var row = rows[i];' +
  'if (row.querySelector(\'[aria-label="Pin chat"]\') || row.querySelector(\'[aria-label="Archive chat"]\')) {' +
  'return row;' +
  '}' +
  '}' +
  'return null;' +
  '})()';

function homeToggleButtonExpr(target) {
  return (
    '(function(){' +
    'var target = ' + JSON.stringify(target) + ';' +
    'var scope = document.querySelector(\'[class*="home-mode-toggle"]\');' +
    'if (!scope) return null;' +
    'var btns = scope.querySelectorAll("button");' +
    'for (var i = 0; i < btns.length; i++) {' +
    'if ((btns[i].textContent || "").trim() === target) return btns[i];' +
    '}' +
    'return null;' +
    '})()'
  );
}

const HOME_HEADING_EXPR =
  '(function(){' +
  'var h = document.querySelector("h1");' +
  'return h ? (h.textContent || "").trim() : null;' +
  '})()';

// Thread-open verification. Codex's router does NOT change
// location.pathname when a thread opens (measured: it stayed "/index.html"
// after clicking a real thread row) — pathname is kept only as recorded
// evidence, never the pass criterion. The real signal is the clicked row
// gaining the active marker and the home empty-state heading disappearing.
const THREAD_ACTIVE_EXPR =
  '(function(){' +
  'var rows = document.querySelectorAll(".sidebar-item");' +
  'for (var i = 0; i < rows.length; i++) {' +
  'var r = rows[i];' +
  'if (r.getAttribute("data-app-action-sidebar-thread-active") === "true" || ' +
  'r.getAttribute("aria-current") === "page") return true;' +
  '}' +
  'return false;' +
  '})()';

const HOME_EMPTY_STATE_TEXT = 'What should we build';

const HOME_EMPTY_STATE_GONE_EXPR =
  '(function(){' +
  'var text = ' + JSON.stringify(HOME_EMPTY_STATE_TEXT) + ';' +
  'var headings = document.querySelectorAll("h1, h2, .heading-xl, .heading-2xl");' +
  'for (var i = 0; i < headings.length; i++) {' +
  'if ((headings[i].textContent || "").indexOf(text) !== -1) return false;' +
  '}' +
  'return true;' +
  '})()';

// ---------------------------------------------------------------------------
// Electron-dependent runtime. Built once `require("electron")` has resolved
// (see the setImmediate deferral at the bottom — same load-order fix as
// injector/core/inject.js's start(), and same reason: a synchronous
// require("electron") throws MODULE_NOT_FOUND in every process that inherits
// NODE_OPTIONS until Electron's own bootstrap has registered the module).
// ---------------------------------------------------------------------------

function buildRuntime(electron) {
  const { app, BrowserWindow } = electron;

  let logPath = null;
  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    if (logPath) {
      try {
        fs.appendFileSync(logPath, line + '\n');
      } catch (err) {
        // Logging must never crash the driver; the console line above is
        // the fallback record if the file write itself is failing.
        console.error(`(could not append to inventory.log: ${err.message})`);
      }
    }
  }

  async function getTheme(wc) {
    return wc.executeJavaScript('document.documentElement.dataset.theme', true);
  }

  async function setTheme(wc, theme) {
    const script =
      'document.documentElement.dataset.theme = ' +
      JSON.stringify(theme) +
      '; document.documentElement.dataset.theme;';
    return wc.executeJavaScript(script, true);
  }

  async function getPathname(wc) {
    try {
      return await wc.executeJavaScript('location.pathname + location.search', true);
    } catch (err) {
      return null;
    }
  }

  async function getHeadingText(wc) {
    try {
      return await wc.executeJavaScript(HOME_HEADING_EXPR, true);
    } catch (err) {
      return null;
    }
  }

  async function isThreadActive(wc) {
    try {
      return await wc.executeJavaScript(THREAD_ACTIVE_EXPR, true);
    } catch (err) {
      return false;
    }
  }

  async function homeEmptyStateGone(wc) {
    try {
      return await wc.executeJavaScript(HOME_EMPTY_STATE_GONE_EXPR, true);
    } catch (err) {
      return false;
    }
  }

  /**
   * Polls `isThreadActive` and `homeEmptyStateGone` every 500ms for up to
   * `timeoutMs`, resolving as soon as both are true (or once the timeout
   * elapses, with whatever the last-checked values were).
   */
  async function waitForThreadOpen(wc, timeoutMs) {
    const started = Date.now();
    let active = await isThreadActive(wc);
    let headingGone = await homeEmptyStateGone(wc);
    while (!(active && headingGone) && Date.now() - started < timeoutMs) {
      await sleep(500);
      active = await isThreadActive(wc);
      headingGone = await homeEmptyStateGone(wc);
    }
    return { active, headingGone };
  }

  async function getAppModeLabel(wc) {
    const script =
      '(function(){ var el = ' + SWITCH_MODE_EXPR + '; return el ? el.getAttribute("aria-label") : null; })()';
    return wc.executeJavaScript(script, true);
  }

  /** "Switch mode, current mode: Codex" -> "Codex"; null if neither name is present. */
  function appModeNameFromLabel(label) {
    if (!label) return null;
    if (label.indexOf('ChatGPT') !== -1) return 'ChatGPT';
    if (label.indexOf('Codex') !== -1) return 'Codex';
    return null;
  }

  async function getTogglePressed(wc, target) {
    const script =
      '(function(){' +
      'var target = ' + JSON.stringify(target) + ';' +
      'var scope = document.querySelector(\'[class*="home-mode-toggle"]\');' +
      'if (!scope) return null;' +
      'var btns = scope.querySelectorAll("button");' +
      'for (var i = 0; i < btns.length; i++) {' +
      'if ((btns[i].textContent || "").trim() === target) return btns[i].getAttribute("aria-pressed");' +
      '}' +
      'return null;' +
      '})()';
    return wc.executeJavaScript(script, true);
  }

  /**
   * Click the element `finderExpr` (an in-page expression string) resolves
   * to, via a REAL synthetic click (mouseDown + mouseUp at the element's own
   * centre, or an x/y-fraction of it) — element.click() does not open
   * Codex's Radix-based menus (verified in the M1 measurement session).
   */
  async function clickElementByFinder(wc, finderExpr, description, xFraction, yFraction) {
    const xf = typeof xFraction === 'number' ? xFraction : 0.5;
    const yf = typeof yFraction === 'number' ? yFraction : 0.5;
    const script =
      '(function(){' +
      'var el = (' + finderExpr + ');' +
      'if (!el) return null;' +
      'var r = el.getBoundingClientRect();' +
      'return { x: r.left + r.width * ' + xf + ', y: r.top + r.height * ' + yf + ', ' +
      'text: (el.textContent || "").trim().slice(0, 80) };' +
      '})()';
    let point;
    try {
      point = await wc.executeJavaScript(script, true);
    } catch (err) {
      log(`  CLICK FAILED (${description}): executeJavaScript threw: ${err.message}`);
      return null;
    }
    if (!point) {
      log(`  CLICK FAILED (${description}): element not found`);
      return null;
    }
    wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    log(
      `  CLICKED (${description}) @ (${point.x.toFixed(0)},${point.y.toFixed(0)}) ` +
        `text=${JSON.stringify(point.text)}`
    );
    return point;
  }

  async function pressEscape(wc) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  }

  /** Switch to `targetMode` ("Codex" | "ChatGPT") via a real menu click, or confirm it is active already. */
  async function ensureAppMode(wc, targetMode) {
    const label = await getAppModeLabel(wc);
    if (label === null) {
      return { ok: false, reason: 'mode switch button not found', label: null };
    }
    if (label.indexOf(targetMode) !== -1) {
      return { ok: true, label };
    }
    const clicked = await clickElementByFinder(wc, SWITCH_MODE_EXPR, 'mode switch button');
    if (!clicked) {
      return { ok: false, reason: 'mode switch button click failed', label };
    }
    await sleep(1500); // popup open animation
    const itemClicked = await clickElementByFinder(
      wc,
      pickMenuItemExpr(targetMode),
      `mode menu item "${targetMode}"`
    );
    if (!itemClicked) {
      return { ok: false, reason: `menu item "${targetMode}" not found in the open popup`, label };
    }
    await sleep(10000); // measured settle time (see plan's Verified facts)
    const newLabel = await getAppModeLabel(wc);
    if (!newLabel || newLabel.indexOf(targetMode) === -1) {
      return { ok: false, reason: `app mode did not change to "${targetMode}" (now: ${newLabel})`, label: newLabel };
    }
    return { ok: true, label: newLabel };
  }

  /** Ensure the Chat/Work home toggle shows `target` pressed. */
  async function ensureHomeMode(wc, target) {
    let pressed = await getTogglePressed(wc, target);
    if (pressed === null) {
      // Toggle only exists on the home screen — go there first.
      const nc = await clickElementByFinder(wc, NEW_CHAT_EXPR, 'New chat (to reach home for toggle)');
      if (!nc) {
        return { ok: false, reason: 'home-mode-toggle absent and "New chat" nav item not found' };
      }
      await sleep(3000);
      pressed = await getTogglePressed(wc, target);
      if (pressed === null) {
        return { ok: false, reason: 'home-mode-toggle still absent after clicking New chat' };
      }
    }
    if (pressed === 'true') {
      return { ok: true, pressed };
    }
    const clicked = await clickElementByFinder(wc, homeToggleButtonExpr(target), `home mode toggle "${target}"`);
    if (!clicked) {
      return { ok: false, reason: `home mode toggle button "${target}" not found` };
    }
    await sleep(2000);
    pressed = await getTogglePressed(wc, target);
    if (pressed !== 'true') {
      return { ok: false, reason: `toggle did not switch to "${target}" (aria-pressed now: ${pressed})` };
    }
    return { ok: true, pressed };
  }

  /**
   * Run the probe and save its screenshot for one theme, on the given
   * webContents, under `outDir`, using `tag`. Sets CDX_PROBE_DUMP_CSS for
   * exactly the very first probe of the whole run (tracked via `state`),
   * then removes it — never left set for later calls.
   */
  async function probeAndScreenshot(wc, outDir, tag, state) {
    const dumpThisCall = !state.dumpDone;
    if (dumpThisCall) {
      process.env.CDX_PROBE_DUMP_CSS = '1';
    }
    try {
      await runProbe(wc, log, outDir, tag);
    } finally {
      if (dumpThisCall) {
        delete process.env.CDX_PROBE_DUMP_CSS;
        state.dumpDone = true;
      }
    }
    const image = await wc.capturePage();
    const filePath = path.join(outDir, `${tag}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    log(`  screenshot -> ${filePath}`);
    return path.basename(filePath);
  }

  /** For each theme in `themes`: set it, verify, probe, screenshot. Records facts/files on `record`. */
  async function forEachTheme(wc, scenarioTag, outDir, record, themes, state) {
    record.facts.themes = record.facts.themes || {};
    record.files = record.files || [];
    for (const theme of themes) {
      await setTheme(wc, theme);
      await sleep(2500);
      const actual = await getTheme(wc);
      if (actual !== theme) {
        record.facts.themes[theme] = { verified: false, actual };
        log(`  THEME VERIFY FAILED: wanted "${theme}", dataset.theme is "${actual}" — skipping probe/screenshot`);
        continue;
      }
      record.facts.themes[theme] = { verified: true };
      const tag = `${scenarioTag}-${theme}`;
      const file = await probeAndScreenshot(wc, outDir, tag, state);
      record.files.push(file);
    }
  }

  // --- Scenarios -------------------------------------------------------

  async function scenarioCodexHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const clicked = await clickElementByFinder(wc, NEW_CHAT_EXPR, 'New chat');
    if (!clicked) return { ok: false, reason: '"New chat" nav item not found' };
    await sleep(3000);
    record.facts.pathname = await getPathname(wc);
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'codex-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioCodexThread(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    // Recorded as evidence only — Codex's router does not change
    // location.pathname when a thread opens (measured: it stayed
    // "/index.html" after a real thread click), so pathname is never the
    // pass criterion here.
    record.facts.pathnameBefore = await getPathname(wc);
    // Click the row's text area (left portion), never the Pin/Archive
    // buttons that sit at the row's right edge.
    const clicked = await clickElementByFinder(wc, THREAD_ROW_EXPR, 'thread row (text area)', 0.3, 0.5);
    if (!clicked) return { ok: false, reason: 'no sidebar thread row (with Pin/Archive chat) found' };
    const { active, headingGone } = await waitForThreadOpen(wc, 8000);
    record.facts.pathnameAfter = await getPathname(wc);
    record.facts.threadActive = active;
    record.facts.homeEmptyStateGone = headingGone;
    if (!active || !headingGone) {
      return {
        ok: false,
        reason:
          `thread open not confirmed within 8s (sidebar-item active marker=${active}, ` +
          `home empty-state gone=${headingGone})`,
      };
    }
    await forEachTheme(wc, 'codex-thread', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptChatHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const toggle = await ensureHomeMode(wc, 'Chat');
    record.facts.toggle = toggle;
    if (!toggle.ok) return { ok: false, reason: toggle.reason };
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'chatgpt-chat-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptWorkHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const toggle = await ensureHomeMode(wc, 'Work');
    record.facts.toggle = toggle;
    if (!toggle.ok) return { ok: false, reason: toggle.reason };
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'chatgpt-work-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioOverlayModeMenu(wc, outDir, record, state) {
    // Dark only, per the scenario list.
    await setTheme(wc, 'dark');
    await sleep(2500);
    const actual = await getTheme(wc);
    if (actual !== 'dark') {
      return { ok: false, reason: `could not set dark theme for the overlay scenario (dataset.theme is "${actual}")` };
    }
    record.facts.themes = { dark: { verified: true } };
    const clicked = await clickElementByFinder(wc, SWITCH_MODE_EXPR, 'switch mode button (open menu)');
    if (!clicked) return { ok: false, reason: 'switch mode button not found (cannot open the overlay)' };
    await sleep(1500);
    const tag = 'overlay-mode-menu-dark';
    const file = await probeAndScreenshot(wc, outDir, tag, state);
    record.files = [file];
    await pressEscape(wc);
    await sleep(800);
    return { ok: true };
  }

  // --- Main window discovery -------------------------------------------

  /**
   * Resolves once the FIRST BrowserWindow whose webContents URL is the main
   * app URL (isMainWindowUrl) has been identified, then waits the measured
   * ~14s settle time before returning its webContents. Resolves null if
   * nothing matches within `timeoutMs`.
   */
  function waitForMainWindow(timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const seen = new Set();

      function consider(win) {
        if (!win || win.isDestroyed()) return;
        const wc = win.webContents;
        if (!wc || seen.has(wc.id)) return;
        const check = () => {
          if (settled || wc.isDestroyed()) return;
          const url = wc.getURL();
          log(`window webContents#${wc.id} url=${url || '(none yet)'}`);
          if (isMainWindowUrl(url)) {
            settled = true;
            seen.add(wc.id);
            log(`main window identified: webContents#${wc.id}; waiting 14s before driving it`);
            setTimeout(() => resolve(wc), 14000);
          }
        };
        check();
        wc.on('did-navigate', check);
        wc.on('did-finish-load', check);
      }

      for (const win of BrowserWindow.getAllWindows()) consider(win);
      app.on('browser-window-created', (_event, win) => consider(win));

      setTimeout(() => {
        if (!settled) resolve(null);
      }, timeoutMs);
    });
  }

  // --- Run ---------------------------------------------------------------

  async function run() {
    const outDir = process.env.CDX_INVENTORY_OUT;
    if (!outDir) {
      console.error('CDX_INVENTORY_OUT is not set — the driver was not launched by run-inventory.mjs. Aborting.');
      try {
        app.quit();
      } catch (err) {
        /* best effort */
      }
      return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    logPath = path.join(outDir, 'inventory.log');
    log(`driver started; out=${outDir}`);

    const manifest = {
      codexVersions: { chrome: process.versions.chrome, app: null },
      startedAt: new Date().toISOString(),
      finishedAt: null,
      facts: {},
      scenarios: [],
    };
    try {
      manifest.codexVersions.app = app.getVersion();
    } catch (err) {
      log(`could not read app.getVersion(): ${err.message}`);
    }

    let quit = false;
    function finish() {
      if (quit) return;
      quit = true;
      manifest.finishedAt = new Date().toISOString();
      try {
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        log('manifest.json written');
      } catch (err) {
        log(`FAILED to write manifest.json: ${err.message}`);
      }
      log('driver quitting');
      try {
        app.quit();
      } catch (err) {
        /* best effort */
      }
    }

    const safetyTimer = setTimeout(() => {
      log('SAFETY TIMEOUT (5 minutes) reached — quitting regardless of progress');
      finish();
    }, 5 * 60 * 1000);

    const wc = await waitForMainWindow(90 * 1000);
    if (!wc) {
      log('MAIN WINDOW NOT FOUND within the discovery timeout — aborting with an empty scenario list');
      clearTimeout(safetyTimer);
      finish();
      return;
    }

    const initialTheme = await getTheme(wc).catch((err) => {
      log(`could not read initial theme: ${err.message}`);
      return null;
    });
    log(`initial theme = ${initialTheme}`);

    // The app-mode choice (Codex vs ChatGPT) is Codex/account-side state,
    // NOT part of this throwaway --user-data-dir profile — measured: a
    // brand-new profile still started in ChatGPT mode because an earlier
    // scouting run had left the account in that mode. It is therefore
    // shared with the owner's real Codex, and restoring to a hardcoded
    // mode would leave their app in a different mode than they left it.
    // Always restore to whatever was observed here at the start.
    const initialAppModeLabel = await getAppModeLabel(wc).catch((err) => {
      log(`could not read initial app mode: ${err.message}`);
      return null;
    });
    const initialAppMode = appModeNameFromLabel(initialAppModeLabel);
    manifest.facts.initialAppMode = initialAppMode;
    manifest.facts.initialAppModeLabel = initialAppModeLabel;
    log(`initial app mode = ${initialAppMode} (label: ${initialAppModeLabel})`);

    const state = { dumpDone: false };
    const scenarios = [
      { name: 'codex-home', run: scenarioCodexHome },
      { name: 'codex-thread', run: scenarioCodexThread },
      { name: 'chatgpt-chat-home', run: scenarioChatGptChatHome },
      { name: 'chatgpt-work-home', run: scenarioChatGptWorkHome },
      { name: 'overlay-mode-menu', run: scenarioOverlayModeMenu },
    ];

    for (const scenario of scenarios) {
      log(`=== scenario: ${scenario.name} ===`);
      const record = { name: scenario.name, status: 'FAILED', reason: null, facts: {}, files: [] };
      try {
        const outcome = await scenario.run(wc, outDir, record, state);
        if (outcome && outcome.ok) {
          record.status = 'OK';
        } else {
          record.status = 'FAILED';
          record.reason = (outcome && outcome.reason) || 'scenario returned no outcome';
          log(`  SCENARIO SETUP FAILED: ${record.reason}`);
        }
      } catch (err) {
        record.status = 'FAILED';
        record.reason = `exception: ${err.message}`;
        log(`  SCENARIO EXCEPTION: ${err.stack || err.message}`);
      }
      manifest.scenarios.push(record);
    }

    log(
      `restoring: theme -> ${initialTheme || '(unknown)'}, home toggle -> Chat (if ChatGPT), ` +
        `app mode -> ${initialAppMode || '(unknown — leaving as-is)'}`
    );
    try {
      const label = await getAppModeLabel(wc);
      if (label && label.indexOf('ChatGPT') !== -1) {
        const chatRestore = await ensureHomeMode(wc, 'Chat');
        if (!chatRestore.ok) log(`restore: could not reset home toggle to Chat: ${chatRestore.reason}`);
      }
      if (initialAppMode) {
        const modeRestore = await ensureAppMode(wc, initialAppMode);
        if (!modeRestore.ok) {
          log(`restore: could not reset app mode to "${initialAppMode}": ${modeRestore.reason}`);
        }
      } else {
        log('restore: initial app mode was never determined — leaving app mode as-is rather than guessing');
      }
      if (initialTheme) {
        await setTheme(wc, initialTheme);
        await sleep(1000);
      }
    } catch (err) {
      log(`restore encountered an error (non-fatal, continuing to quit): ${err.message}`);
    }

    clearTimeout(safetyTimer);
    finish();
  }

  return { run };
}

// ---------------------------------------------------------------------------
// Entry point. Deferred past the current tick, exactly like
// injector/core/inject.js's start(): a synchronous require('electron') here
// throws MODULE_NOT_FOUND in every process NODE_OPTIONS reaches (main, GPU,
// utility, …) until Electron's own bootstrap has registered the module. If it
// still throws, or electron.app is missing, this is not an Electron main
// process — return silently, as instructed.
// ---------------------------------------------------------------------------

setImmediate(() => {
  let electron;
  try {
    electron = require('electron');
  } catch (err) {
    return;
  }
  if (!electron || !electron.app) {
    return;
  }
  const { app } = electron;
  const runtime = buildRuntime(electron);

  const start = () => {
    runtime.run().catch((err) => {
      console.error(`driver-preload FATAL: ${err.stack || err.message}`);
      try {
        app.quit();
      } catch (quitErr) {
        /* best effort */
      }
    });
  };

  if (app.isReady()) {
    start();
  } else {
    app.whenReady().then(start);
  }
});

module.exports = { isMainWindowUrl, pickMenuItemExpr, homeToggleButtonExpr };
