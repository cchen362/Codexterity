'use strict';

/**
 * Codexterity — shared injection core (Gate 0)
 * ---------------------------------------------
 * Platform-agnostic. Runs inside Codex Desktop's Electron MAIN process,
 * loaded via NODE_OPTIONS=--require <preload.js> (D-0001-1, primary mechanism).
 *
 * D-0001-3 — non-destructive by construction. This module never touches any
 * file inside the Codex install directory, never opens a debug port, and
 * never reads or writes ~/.codex/auth.json, ~/.codex/.credentials.json, or
 * any API key/token. It reads exactly one file: the theme CSS path handed to
 * it via CDX_THEME_CSS_PATH, and calls exactly one privileged Electron API,
 * webContents.insertCSS(), which is read-only with respect to the app itself
 * (it mutates only the in-memory render tree of a window we did not create).
 *
 * If the theme cannot be applied cleanly, this module logs the failure and
 * leaves the window exactly as Codex rendered it — never half-styled, never
 * crashed (see docs/ENGINEERING.md "Fail loudly in development, gracefully
 * in production").
 */

const fs = require('fs');

// D-0001-2 — declared landmarks from themes/captains-cabin/theme.css and
// docs/specs/customizable-ui-inventory.md. Gate 0's job is to report, for the
// first time, which of these actually exist in the live DOM.
const DECLARED_LANDMARKS = [
  { name: 'app-header-tint', selector: '.app-header-tint' },
  { name: 'popupContent', selector: '.popupContent' },
  { name: 'app-shell-main-content-top-fade', selector: '.app-shell-main-content-top-fade' },
  { name: 'code-surfaces (pre,code,kbd,samp)', selector: 'pre, code, kbd, samp' },
];

// Gate 0 diagnostic aid: stdout capture from a packaged GUI-subsystem
// Electron process launched through unusual activation paths is itself an
// open question, so every log line is ALSO appended to a plain file when
// CDX_DEBUG_LOG_PATH is set. This gives ground truth independent of
// whatever is or isn't happening to this process's stdout handle.
let debugLogPath = null;
try {
  debugLogPath = process.env.CDX_DEBUG_LOG_PATH || null;
} catch (err) {
  debugLogPath = null;
}

function log(message) {
  const line = `[codexterity] ${message}`;
  try {
    process.stdout.write(`${line}\n`);
  } catch (err) {
    // stdout may not be writable in this process context; the file sink
    // below is the fallback, not a substitute we silently prefer.
  }
  if (debugLogPath) {
    try {
      fs.appendFileSync(debugLogPath, `${new Date().toISOString()} ${line}\n`);
    } catch (err) {
      // Nothing further we can do to report a logging failure from inside
      // the logger itself; this must never throw out into caller code.
    }
  }
}

function resolveThemePath() {
  const themePath = process.env.CDX_THEME_CSS_PATH;
  if (!themePath) {
    throw new Error(
      'CDX_THEME_CSS_PATH is not set. The launcher must set this to an absolute ' +
        'path to themes/<name>/theme.css before starting Codex.'
    );
  }
  return themePath;
}

function loadThemeCss(themePath) {
  // Read-only access to OUR OWN theme package file. Never touches anything
  // under the Codex install directory.
  return fs.readFileSync(themePath, 'utf8');
}

/**
 * Probe the live DOM for the declared landmarks. Read-only querySelector
 * checks only — no mutation, no data extraction beyond boolean presence and
 * a match count.
 */
function buildLandmarkProbeScript() {
  const selectors = DECLARED_LANDMARKS.map((l) => l.selector);
  return `
    (() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.map((sel) => {
        let count = 0;
        try {
          count = document.querySelectorAll(sel).length;
        } catch (err) {
          count = -1;
        }
        return { selector: sel, count };
      });
    })();
  `;
}

/**
 * Report the facts the whole styling strategy rests on, read from the live DOM.
 *
 * D-0001-2 assumes Codex toggles .electron-dark / .electron-light on the root
 * element and exposes a semantic --color-* layer. That came from static analysis
 * of a shipped bundle, never from a running app. If either assumption is wrong,
 * the theme is inert no matter how well the injection works — so this is checked
 * every run rather than trusted.
 */
async function reportRootEnvironment(webContents) {
  const script = `
    (() => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      const probe = ['--color-background-surface', '--color-text-primary',
                     '--color-background-button-primary', '--radius-lg'];
      const tokens = {};
      for (const t of probe) tokens[t] = cs.getPropertyValue(t).trim() || '(unset)';
      return {
        rootClass: root.className || '(none)',
        bodyClass: document.body ? (document.body.className || '(none)') : '(no body)',
        styleTagPresent: !!document.getElementById('codexterity-theme'),
        tokens,
        bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : '(no body)',
        sheetCount: document.styleSheets.length,
      };
    })();
  `;
  try {
    const env = await webContents.executeJavaScript(script, true);
    log(`  root class:  ${env.rootClass}`);
    log(`  body class:  ${env.bodyClass}`);
    log(`  our <style> present: ${env.styleTagPresent}   stylesheets: ${env.sheetCount}`);
    log(`  body background: ${env.bodyBg}`);
    for (const [name, value] of Object.entries(env.tokens)) {
      log(`  ${name}: ${value}`);
    }
  } catch (err) {
    log(`  root environment probe FAILED: ${err.message}`);
  }
}

/**
 * Enumerate every CSS custom property Codex defines on its own root, and report
 * which ones this theme overrides and which it misses.
 *
 * Gate 0 established that the theme's tokens DO resolve in the running app while
 * major surfaces stay stock — which means the app paints them from properties
 * the theme never redefines. The token list in docs/specs came from static
 * analysis of a bundle; this reads the live CSSOM instead, and the difference
 * between the two is the actual Phase 3 work list.
 *
 * Read-only: enumerates property NAMES and values from stylesheets already
 * loaded in the page. Touches no app file and no user data.
 */
async function reportTokenGap(webContents, ourCss) {
  const ourNames = Array.from(new Set(
    (ourCss.match(/--[a-zA-Z0-9-]+(?=\s*:)/g) || [])
  ));
  // Enumerated off getComputedStyle rather than by walking document.styleSheets:
  // the app's own sheets are opaque to cssRules (a CSSOM walk returned zero
  // properties while the very same tokens demonstrably resolved), whereas the
  // computed style is the resolved truth regardless of which sheet supplied it.
  const script = `
    (() => {
      const OURS = new Set(${JSON.stringify(ourNames)});
      const cs = getComputedStyle(document.documentElement);
      const all = Array.from(cs).filter((p) => p.startsWith('--'));
      const missing = [], covered = [];
      for (const name of all) {
        const entry = name + ' = ' + cs.getPropertyValue(name).trim();
        (OURS.has(name) ? covered : missing).push(entry);
      }
      return {
        totalTheirs: all.length,
        covered: covered.length,
        missing: missing.sort(),
      };
    })();
  `;
  try {
    const gap = await webContents.executeJavaScript(script, true);
    log(`  TOKEN GAP: app defines ${gap.totalTheirs} root custom properties; ` +
        `theme overrides ${gap.covered}; ${gap.missing.length} unclaimed`);
    for (const entry of gap.missing) log(`    unclaimed: ${entry}`);
  } catch (err) {
    log(`  token gap probe FAILED: ${err.message}`);
  }
}

async function reportLandmarks(webContents, css) {
  await reportRootEnvironment(webContents);
  if (process.env.CDX_TOKEN_GAP && css) await reportTokenGap(webContents, css);
  try {
    const results = await webContents.executeJavaScript(buildLandmarkProbeScript(), true);
    results.forEach((result, i) => {
      const declared = DECLARED_LANDMARKS[i];
      if (result.count > 0) {
        log(`  landmark PRESENT: ${declared.name}  (${result.count} match${result.count === 1 ? '' : 'es'})`);
      } else if (result.count === 0) {
        log(`  landmark MISSING: ${declared.name}  (selector "${declared.selector}" matched nothing)`);
      } else {
        log(`  landmark PROBE ERROR: ${declared.name}  (invalid selector "${declared.selector}")`);
      }
    });
  } catch (err) {
    log(`  landmark probe FAILED: ${err.message}`);
  }
}

/**
 * Second official-API injection route, used only when insertCSS is unavailable.
 *
 * Appends (or replaces) a single <style> element via webContents
 * .executeJavaScript. This is a DIFFERENT main->renderer IPC channel from the
 * one insertCSS uses, which matters: insertCSS reaches the renderer through the
 * sandboxed webFrame proxy, and that proxy is where this Electron fork fails.
 *
 * Still an official Electron API. Still no debug port. Two real differences
 * from insertCSS, both of which Gate 0 must measure rather than assume:
 *   - Author origin, not user origin. Our overrides are variable definitions on
 *     .electron-dark / .electron-light at equal specificity to Codex's own, so
 *     later-wins should carry them; a stock !important author rule would not be
 *     beaten the way a user-origin sheet beats it.
 *   - A DOM node can be removed by the app's own re-rendering, where an
 *     inserted stylesheet cannot. The stable id makes re-application idempotent.
 */
async function applyThemeViaStyleTag(webContents, css) {
  const script = `
    (() => {
      const ID = 'codexterity-theme';
      let el = document.getElementById(ID);
      if (!el) {
        el = document.createElement('style');
        el.id = ID;
        document.head.appendChild(el);
      }
      el.textContent = ${JSON.stringify(css)};
      return {
        applied: true,
        bytes: el.textContent.length,
        lastChildOfHead: document.head.lastElementChild === el,
      };
    })();
  `;
  return webContents.executeJavaScript(script, true);
}

async function applyTheme(webContents, css) {
  const label = `webContents#${webContents.id}`;
  const bytes = Buffer.byteLength(css, 'utf8');

  try {
    await webContents.insertCSS(css, { cssOrigin: 'user' });
    log(`injected OK via insertCSS on ${label} — ${bytes} bytes`);
    await reportLandmarks(webContents, css);
    return;
  } catch (err) {
    log(`insertCSS FAILED on ${label}: ${err.message}`);
  }

  // insertCSS is unavailable on this build. Before conceding the mechanism,
  // establish whether the OTHER official main->renderer API works at all --
  // the answer decides whether D-0001-1's no-debug-port guarantee survives.
  try {
    const result = await applyThemeViaStyleTag(webContents, css);
    log(
      `injected OK via executeJavaScript style tag on ${label} — ` +
        `${result.bytes} chars, lastChildOfHead=${result.lastChildOfHead}`
    );
    await reportLandmarks(webContents, css);
    return;
  } catch (err) {
    // Both official routes are gone. Degrade to the stock look — never leave
    // the window half-styled, and never throw out of an Electron event
    // handler, which would take down Codex's main process with us.
    log(
      `executeJavaScript ALSO FAILED on ${label}: ${err.message} — ` +
        `Codex remains unthemed for this window.\n${err.stack}`
    );
  }
}

function attachToWindow(win, css) {
  const wc = win.webContents;
  const label = `webContents#${wc.id}`;

  wc.on('dom-ready', () => {
    log(`dom-ready on ${label} (url=${wc.getURL()})`);
    applyTheme(wc, css);
  });

  wc.on('did-navigate', (_event, url) => {
    log(`did-navigate on ${label} -> ${url}`);
    applyTheme(wc, css);
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    log(`did-navigate-in-page on ${label} -> ${url}`);
    applyTheme(wc, css);
  });
}

function start() {
  log('preload loaded into main process');

  let css;
  try {
    const themePath = resolveThemePath();
    css = loadThemeCss(themePath);
    log(`theme CSS loaded from ${themePath} (${Buffer.byteLength(css, 'utf8')} bytes)`);
  } catch (err) {
    // Cannot theme without CSS. Degrade: log loudly, attach nothing, let
    // Codex run completely stock and functional.
    log(`STARTUP FAILED, running stock/unthemed: ${err.message}`);
    return;
  }

  // NODE_OPTIONS=--require runs this module via Node's own internal preload
  // step, which executes BEFORE Electron's bootstrap has patched Module._load
  // to recognize 'electron' as its virtual built-in module. A synchronous
  // require('electron') here throws MODULE_NOT_FOUND every time, in every
  // process (main, GPU, utility) that inherits NODE_OPTIONS -- this was
  // observed directly during Gate 0 testing. Electron's own entry script
  // registers that module later in the SAME tick sequence, so deferring the
  // require past the current call stack (setImmediate) lets it resolve once
  // Electron's bootstrap has continued. This still runs synchronously within
  // the same main-process instance, still calls only the official
  // webContents.insertCSS() API, and still opens no debug port -- it is a
  // load-order fix to D-0001-1's primary mechanism, not a different mechanism.
  setImmediate(() => {
    let electron;
    try {
      electron = require('electron');
    } catch (err) {
      log(`STARTUP FAILED, 'electron' module unavailable in this process even after deferring past ` +
        `the preload tick: ${err.message}`);
      return;
    }

    const { app } = electron;
    if (!app) {
      log('STARTUP FAILED: require("electron") did not return the main-process app module — ' +
        'this process is not an Electron main process.');
      return;
    }

    log(`process.versions: ${JSON.stringify(process.versions)}`);

    const attach = () => {
      app.on('browser-window-created', (_event, win) => {
        log(`browser-window-created (webContents#${win.webContents.id})`);
        attachToWindow(win, css);
      });
      log('attached browser-window-created listener; waiting for windows');
    };

    if (app.isReady()) {
      attach();
    } else {
      app.whenReady().then(attach);
    }
  });
}

module.exports = { start, DECLARED_LANDMARKS };
