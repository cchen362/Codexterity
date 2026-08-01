'use strict';

/**
 * Codexterity — shared injection core (Gate 0)
 * ---------------------------------------------
 * Platform-agnostic. Runs inside Codex Desktop's Electron MAIN process,
 * loaded via NODE_OPTIONS=--require <preload.js> (D-0001-1, primary mechanism).
 *
 * D-0001-1 (amended 2026-08-01) — the primary API is
 * webContents.executeJavaScript appending one <style> element, NOT
 * insertCSS(), which is broken on this Electron fork. Still an official API,
 * still no debug port. See applyThemeViaStyleTag below and docs/DECISIONS.md.
 *
 * D-0001-3 — non-destructive by construction. This module never touches any
 * file inside the Codex install directory, never opens a debug port, and
 * never reads or writes ~/.codex/auth.json, ~/.codex/.credentials.json, or
 * any API key/token. It reads exactly one file: the theme CSS path handed to
 * it via CDX_THEME_CSS_PATH, and the Electron APIs it calls are read-only
 * with respect to the app itself (they mutate only the in-memory render tree
 * of a window we did not create).
 *
 * If the theme cannot be applied cleanly, this module logs the failure and
 * leaves the window exactly as Codex rendered it — never half-styled, never
 * crashed (see docs/ENGINEERING.md "Fail loudly in development, gracefully
 * in production").
 */

const fs = require('fs');
const path = require('path');
const { runProbe } = require('./probe.js');

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
  // async because the font check must await document.fonts.load();
  // executeJavaScript resolves a returned promise.
  const script = `
    (async () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      // Two kinds of token, on purpose.
      //
      // The first four are ones WE define, and prove the sheet applied at all.
      // The rest are DOWNSTREAM of ours — Codex derives them through its own
      // four-stage chain (see docs/research/phase3-inventory-findings.md §1),
      // and they are what actually paints the sidebar, the menu bar, links and
      // the empty-state card icons. Checking only our own names would prove the
      // stylesheet landed while the app still looked stock, which is exactly the
      // gap Gate 0 fell into. 47 of our tokens are also set INLINE on <html>, so
      // this is also the standing check that the cascade still goes our way.
      const probe = ['--color-background-surface', '--color-text-primary',
                     '--color-background-button-primary', '--radius-lg',
                     '--color-background-surface-under', '--color-accent-purple',
                     '--color-token-charts-purple', '--color-token-text-link-foreground',
                     '--color-background-application-menu', '--color-token-side-bar-background'];
      const tokens = {};
      for (const t of probe) tokens[t] = cs.getPropertyValue(t).trim() || '(unset)';
      // A resolved token is not a painted pixel. The empty-state card icons were
      // the visible symptom of the multi-accent violation, so the check that
      // closes it has to read what the ELEMENTS compute, not what the root
      // holds — an icon could still be painted by an inline fill attribute or a
      // hue we never traced. Sampled by the utility classes the icons actually
      // carry (docs/research/phase3-inventory-findings.md §3).
      const painted = [];
      for (const sel of ['.text-token-charts-green', '.text-token-charts-blue',
                         '.text-token-charts-purple', '.text-token-charts-orange',
                         '.text-token-charts-red']) {
        const el = document.querySelector(sel);
        if (!el) { painted.push(sel + ' = (absent)'); continue; }
        const cs = getComputedStyle(el);
        const kid = el.querySelector('path, circle, rect');
        painted.push(sel + ' color=' + cs.color +
          (kid ? ' childFill=' + getComputedStyle(kid).fill : ''));
      }

      // A font-family declaration that names an unavailable face fails SILENTLY:
      // the computed style still reads back the name we asked for, and the app
      // renders the fallback. That is exactly how "Fraunces renders throughout"
      // was recorded at Gate 0 while the app was actually showing Georgia. So
      // the check is document.fonts.check(), which answers whether the face is
      // loadable, never the computed font-family.
      // load() BEFORE check(). An @font-face the page has not painted with yet is
      // never fetched, so check() alone reports "not available" for a face that
      // is perfectly fine — Monaspace Xenon reads false on the empty state purely
      // because no code is on screen. load() forces the fetch and rejects if the
      // src is actually broken, which is the failure we care about.
      const fonts = [];
      for (const family of ['Literata', 'Fraunces', 'Monaspace Xenon']) {
        let state;
        try {
          const faces = await document.fonts.load('14px "' + family + '"');
          state = faces.length
            ? (document.fonts.check('14px "' + family + '"') ? 'YES' : 'loaded-but-check-false')
            : 'NO FACE MATCHED';
        } catch (err) {
          state = 'LOAD FAILED: ' + err.message;
        }
        fonts.push(family + '=' + state);
      }
      const heading = document.querySelector('.heading-xl, .heading-lg, .heading-2xl');
      const headingFont = heading ? getComputedStyle(heading).fontFamily : '(no heading on screen)';
      const bodyFont = document.body ? getComputedStyle(document.body).fontFamily : '(no body)';

      return {
        painted,
        fonts,
        headingFont,
        bodyFont,
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
    for (const row of env.painted || []) log(`  painted ${row}`);
    if (env.fonts) log(`  fonts loadable: ${env.fonts.join('  ')}`);
    if (env.bodyFont) log(`  body font-family:    ${env.bodyFont}`);
    if (env.headingFont) log(`  heading font-family: ${env.headingFont}`);
  } catch (err) {
    log(`  root environment probe FAILED: ${err.message}`);
  }
}

/**
 * Probe mode (Phase 3 task A).
 *
 * Gate 0's token-gap probe is DELETED rather than kept behind a flag, because a
 * measurement that cannot distinguish our properties from Codex's is not a
 * weaker measurement — it is a wrong one, and leaving it runnable invites it to
 * be quoted again (docs/research/gate0-findings.md §4.3). Its replacement is
 * injector/core/probe.js, which samples with injection SUPPRESSED and reads
 * stylesheet text rather than resolved computed values.
 *
 * CDX_PROBE=1              enable probe mode; the theme is deliberately NOT applied
 * CDX_PROBE_OUT=<dir>      where reports are written (ours, never Codex's)
 * CDX_PROBE_AT=6000,30000  ms after dom-ready to sample, so a later sample can
 *                          catch a screen the first one could not — e.g. one
 *                          containing code, which the empty state never does.
 */
const PROBE_ENABLED = !!process.env.CDX_PROBE;

function probeOutDir() {
  if (process.env.CDX_PROBE_OUT) return process.env.CDX_PROBE_OUT;
  if (debugLogPath) return path.dirname(debugLogPath);
  return process.cwd();
}

function probeSchedule() {
  const raw = process.env.CDX_PROBE_AT;
  if (!raw) return [6000];
  const parsed = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  if (!parsed.length) {
    log(`CDX_PROBE_AT="${raw}" contained no usable millisecond offsets; falling back to 6000.`);
    return [6000];
  }
  return parsed;
}

function scheduleProbes(webContents) {
  const offsets = probeSchedule();
  const outDir = probeOutDir();
  log(`PROBE MODE: theme injection is suppressed on purpose. Sampling webContents#${webContents.id} ` +
      `at ${offsets.join('ms, ')}ms after dom-ready; reports -> ${outDir}`);
  offsets.forEach((ms) => {
    setTimeout(() => {
      if (webContents.isDestroyed()) return;
      runProbe(webContents, log, outDir, `wc${webContents.id}-t${ms}`);
    }, ms);
  });
}

/**
 * Re-read the token report once the app has settled.
 *
 * reportRootEnvironment runs at `dom-ready`, which is EARLY — before Codex's
 * later stylesheets have loaded. At that moment its own downstream tokens
 * (--color-token-*) have not been defined yet and read back as "(unset)". That
 * is a property of when we sampled, not evidence that the theme failed to
 * reach them, and reading it as a finding would be the same mistake as Gate 0's
 * invalid measurement in the opposite direction.
 *
 * Set CDX_VERIFY_AT=<ms> to take a second reading after the app has settled.
 * That is the one that tells you whether the theme reached what Codex paints.
 */
function scheduleSettledVerification(webContents) {
  const raw = process.env.CDX_VERIFY_AT;
  if (!raw) return;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms < 0) {
    log(`CDX_VERIFY_AT="${raw}" is not a millisecond value; skipping the settled re-check.`);
    return;
  }
  setTimeout(() => {
    if (webContents.isDestroyed()) return;
    log(`settled token re-check on webContents#${webContents.id} (+${ms}ms):`);
    reportRootEnvironment(webContents);
  }, ms);
}

async function reportLandmarks(webContents) {
  await reportRootEnvironment(webContents);
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
 * D-0001-1 (amended 2026-08-01) — THE SHIPPED PRIMARY INJECTION ROUTE.
 *
 * insertCSS() is attempted first only because it is the cleaner API where it
 * works; on this Electron fork it always throws, and this is what actually
 * applies the theme. Gate 0 measured that; docs/DECISIONS.md records it.
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
    await reportLandmarks(webContents);
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
    await reportLandmarks(webContents);
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

  // In probe mode the theme is never applied — an injected sheet would make
  // Codex's own token vocabulary unreadable, which is precisely the mistake
  // Gate 0's invalid measurement made.
  if (PROBE_ENABLED) {
    wc.once('dom-ready', () => {
      log(`dom-ready on ${label} (url=${wc.getURL()})`);
      scheduleProbes(wc);
    });
    return;
  }

  wc.once('dom-ready', () => scheduleSettledVerification(wc));

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
