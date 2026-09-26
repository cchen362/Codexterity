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
 * any API key/token. It reads exactly one thing from disk: the theme package
 * named by CDX_THEME_PACKAGE, and only through the validating loader in
 * ../theme-loader/index.js — never a raw fs.readFileSync of a stylesheet.
 * The Electron APIs it calls are read-only with respect to the app itself
 * (they mutate only the in-memory render tree of a window we did not create).
 *
 * If the theme cannot be applied cleanly, this module logs the failure and
 * leaves the window exactly as Codex rendered it — never half-styled, never
 * crashed (see docs/ENGINEERING.md "Fail loudly in development, gracefully
 * in production").
 */

const fs = require('fs');
const path = require('path');
const { runProbe } = require('./probe.js');
const { loadTheme, ThemeLoadError } = require('../theme-loader/index.js');
const { reportLandmarkVerdicts } = require('./landmarks.js');
const { buildStyleTagScript } = require('./style-tag.js');
const { createLogger } = require('./log-sink.js');
const { reportRootEnvironment } = require('./root-environment.js');

// D-0001-25 (Phase 4 M3) — CDX_THEME_PACKAGE replaces CDX_THEME_CSS_PATH,
// with no fallback and no compatibility shim. Before M3, this module read
// CDX_THEME_CSS_PATH and fs.readFileSync'd a raw stylesheet directly:
// M1 and M2 built a validating loader (theme-loader/index.js — manifest
// validation, the safe-CSS scan, the D-0001-4 size cap) and NOTHING called
// it. A validator nothing calls is documentation, not a guarantee. Routing
// through loadTheme() here makes that validation unskippable before a byte
// of CSS reaches Codex, and it means the development theme directory and
// the shipped .ccskin travel the exact same code path — loadTheme() tells
// them apart with statSync, never by extension, so there is no second,
// untested route for a packaged theme to take.

// D-0001-25 / Phase 4 M3 — the loaded theme lives in a MUTABLE MODULE-LEVEL
// SLOT, not a local captured in a closure. Before M3, start() bound the CSS
// as a local `css` and threaded it explicitly through attachToWindow(win,
// css) into every applyTheme() call. That works for a single theme chosen
// once at launch, but it is a dead end for the live re-theming feature
// recorded under "After Phase 4" in docs/plans/0001-captains-cabin-architecture.md:
// applyThemeViaStyleTag already finds-or-creates one <style> element with a
// stable id and replaces its textContent, and already re-runs on every
// dom-ready / did-navigate / did-navigate-in-page — so repainting a live
// window is NOT launch-bound, only the injector's *attachment* is (NODE_OPTIONS
// is read at process start). A slot a later milestone can repoint is the whole
// cost of keeping that door open; a value threaded through call arguments is not
// repointable without touching every call site. THIS MILESTONE (M3) BUILDS ONLY
// THE SLOT — no change signal, no watcher, no IPC listens for a new theme. It is
// set once, in start(), and read at every applyTheme() call.
let activeTheme = null;

// D-0003-9 (Plan 0003 M6) — HOW OFTEN THE STYLESHEET IS RE-SENT, AND WHAT EACH
// SEND COSTS, ARE LOGGED RATHER THAN REASONED ABOUT.
//
// applyThemeViaStyleTag replaces one <style> element's textContent, and
// attachToWindow re-runs it on dom-ready, did-navigate AND did-navigate-in-page
// — the last of which fires on ordinary in-app route changes. So the entire
// stylesheet crosses main->renderer as a string every time the user moves
// around the app, and a theme's stylesheet is not a fixed size: Captain's Cabin
// is ~476 KB and a two-mode photographic hero is several times that. Plan 0002's
// review finding #5 asserted this was a runtime cost; it was CERTAIN that the
// re-send happens and UNMEASURED whether it costs anything, and the obvious
// repair (skip the assignment when a content hash matches) is cheap enough that
// it would have been shipped on the strength of the assertion alone.
//
// This counter and the two timings below are the measurement, kept in the
// shipped code rather than added and removed: the cost scales with whatever
// theme is applied, so it is a standing property of the product, not a one-off
// experiment. The two halves are timed SEPARATELY on purpose — building the
// script (JSON.stringify over the whole stylesheet, in Codex's main process)
// and executeJavaScript (IPC plus the renderer's own parse) have different
// fixes, and a single end-to-end number cannot tell them apart.
let applyCount = 0;

// D-0004-1 — which injection route actually applied on the LAST successful
// attempt, set from the main-process side where insertCSS()/executeJavaScript
// are actually called, and read by reportRootEnvironment()'s diagnostic log.
// Needed because the DOM-side evidence alone is ambiguous on OWL: insertCSS
// success leaves no <style id="codexterity-theme"> element at all (see that
// route's own comment), so a diagnostic that only checked the DOM cannot tell
// "insertCSS worked" apart from "nothing applied".
let lastAppliedRoute = null;

// Gate 0 diagnostic aid: stdout capture from a packaged GUI-subsystem
// Electron process launched through unusual activation paths is itself an
// open question, so every log line is ALSO appended to a plain file when
// CDX_DEBUG_LOG_PATH is set. This gives ground truth independent of
// whatever is or isn't happening to this process's stdout handle.
//
// Plan 0005 M1 — the sink itself moved to ./log-sink.js so
// injector/attach-cdp.js can log identically without a copy; `log()` and
// `debugLogPath` below are kept as local names so nothing else in this file
// needs to change.
const log = createLogger('[codexterity]');
function debugLogPathNow() {
  try {
    return process.env.CDX_DEBUG_LOG_PATH || null;
  } catch (err) {
    return null;
  }
}

function resolveThemePackagePath() {
  const packagePath = process.env.CDX_THEME_PACKAGE;
  if (!packagePath) {
    throw new Error(
      'CDX_THEME_PACKAGE is not set. The launcher must set this to an absolute ' +
        'path to a theme directory (e.g. themes/captains-cabin) or a .ccskin file ' +
        'before starting Codex.'
    );
  }
  return packagePath;
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
  const debugLogPath = debugLogPathNow();
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
 * The settled check ALWAYS runs — set CDX_VERIFY_AT=<ms> only to override
 * WHEN it samples. Unset (or empty), it takes a single reading 15000ms after
 * dom-ready, which is the default schedule DEFAULT_VERIFY_SCHEDULE below.
 * That default is not arbitrary: Plan 0002 M3 measured all four
 * screen-relevant landmarks PRESENT and stable at +8000, +15000 and +25000ms
 * on the main window, so 15000ms sits inside a window that was actually
 * observed settled, with margin on both sides for a slower launch.
 *
 * This is load-bearing, not a convenience default. F1 (Plan 0002 M3): with no
 * default, verifySchedule() returned [] for every real install — nothing in
 * the shipped launch path (packaging/windows/Codexterity.cs, injector/cli.js,
 * launcher/windows/launch.ps1) ever sets CDX_VERIFY_AT — so the one
 * required:true landmark (sidebar-panel, D-0001-13) was NEVER adjudicated
 * for a real user. Every launch logged "not yet present … the settled check
 * (CDX_VERIFY_AT) is what convicts it" and no verdict ever arrived. The
 * settled check must be on by default for the safety net it exists to be.
 *
 * SEVERAL offsets may be given, comma-separated, exactly as CDX_PROBE_AT
 * already accepts them. This is not symmetry for its own sake. Half of what the
 * settled check reports only exists on ONE screen — the empty-state cards are
 * absent from a conversation, a menu is unmounted until it is opened, code
 * surfaces are absent until a code block is on screen — and Codex exposes no
 * UI-automation tree, so no screen can be driven to from outside. A single
 * offset therefore measures whichever screen the user happened to be on and
 * silently reports every other surface as absent. Several offsets let one
 * launch cover several screens, which is the difference between one owner
 * interaction and three.
 */
const DEFAULT_VERIFY_SCHEDULE = [15000];

function verifySchedule() {
  const raw = process.env.CDX_VERIFY_AT;
  // Unset AND explicitly empty (CDX_VERIFY_AT="") both mean "use the
  // default" — they are indistinguishable from each other in a shell, and
  // treating either as "disabled" would silently switch off the one
  // required-landmark safety net this project has (see F1 above).
  if (!raw || !raw.trim()) return DEFAULT_VERIFY_SCHEDULE;
  const parsed = [];
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const ms = Number(trimmed);
    // Reported per-entry rather than rejecting the whole list: a typo in the
    // third offset should not silently cancel the first two, and a skipped
    // sample that says nothing is how a wrong screen gets read as a finding.
    if (!Number.isFinite(ms) || ms < 0) {
      log(`CDX_VERIFY_AT entry "${trimmed}" is not a millisecond value; skipping that sample.`);
      continue;
    }
    parsed.push(ms);
  }
  // Deliberately NOT falling back to the default here. The caller supplied
  // an explicit, non-empty list — if every entry in it was invalid, that is
  // the user's typo, not an absent setting, and quietly substituting the
  // default would hide it. The per-entry log lines above already said why
  // each sample was dropped; an empty result here says so too.
  return parsed;
}

function scheduleSettledVerification(webContents) {
  const offsets = verifySchedule();
  if (!offsets.length) return;
  for (const ms of offsets) {
    setTimeout(() => {
      if (webContents.isDestroyed()) return;
      log(`settled token re-check on webContents#${webContents.id} (+${ms}ms):`);
      // D-0001-25 — the SETTLED sample re-probes the landmarks too, not just
      // the token environment. This was reportRootEnvironment() alone, and the
      // first real launch through the M3 path showed why that is wrong: the
      // landmark probe ran ONLY at `dom-ready`, where the DOM held 24 elements
      // and `stylesheets: 3`, so `sidebar-panel` — the one required:true
      // landmark — reported MISSING (REQUIRED) on EVERY launch, while the
      // later sample that could actually answer it never asked. A required
      // alarm that fires every time is worse than no alarm: it trains the
      // reader to ignore the line, and the next time it is real nobody looks.
      // This is the same failure that killed the four pre-Gate-0 landmarks,
      // in its noisy form rather than its silent one.
      reportLandmarks(webContents, `settled +${ms}ms`);
    }, ms);
  }
}

/**
 * The token environment, then the landmark verdicts, in that order — one
 * reading of the live DOM per call site.
 *
 * The verdict logic itself lives in ./landmarks.js and takes the manifest's
 * landmarks as an argument (Plan 0002 M4b). It moved there so the degradation
 * path — every landmark selector stopping matching, which is what a future
 * Codex update would cause — can be exercised under `npm test` instead of only
 * by launching the real app. Nothing about the reporting changed in the move;
 * see that module for why a required landmark is adjudicated the way it is
 * (D-0001-33) and what `phase` means (D-0001-21).
 */
async function reportLandmarks(webContents, phase) {
  await reportRootEnvironment(webContents, { log, lastAppliedRoute });
  await reportLandmarkVerdicts({
    webContents,
    landmarks: activeTheme.manifest.landmarks,
    phase,
    log,
  });
}

// Plan 0005 M1 — `buildStyleTagScript()` MOVED to ./style-tag.js (required at
// the top of this file) so injector/attach-cdp.js's CDP route can share it
// rather than carry a copy. Its D-0001-1/D-0004-2 doc comment moved with it;
// see that module for the full history of why this route exists and what
// "author origin" versus "user origin" means for the cascade.

// Split out of applyThemeViaStyleTag (D-0003-9) so the two halves can be timed
// apart: everything above happens in Codex's MAIN process and scales with the
// stylesheet's length; everything below crosses the IPC boundary and is then
// the renderer's problem.
async function applyThemeViaStyleTag(webContents, script) {
  return webContents.executeJavaScript(script, true);
}

async function applyTheme(webContents, reason) {
  const label = `webContents#${webContents.id}`;
  const applyNo = ++applyCount;
  // Read from the module-level slot, not a captured argument (D-0001-25 —
  // see the slot's own doc comment above). This is the read half of the
  // mutable slot M3 exists to build: every call site asks "what is the
  // active theme RIGHT NOW" instead of "what was it when this window
  // attached", which is exactly the indirection a future live-re-theming
  // milestone needs and exactly what a closure-captured `css` local cannot
  // provide without restructuring every call site that holds one.
  const css = activeTheme.css;
  const bytes = Buffer.byteLength(css, 'utf8');

  // hrtime.bigint(), not Date.now(): a single apply may well land under a
  // millisecond, and a measurement whose resolution is the same size as the
  // thing measured cannot answer "is this worth fixing".
  const tStart = process.hrtime.bigint();
  const ms = (from, to) => Number(to - from) / 1e6;

  try {
    await webContents.insertCSS(css, { cssOrigin: 'user' });
    lastAppliedRoute = 'insertCSS (user origin)';
    log(`injected OK via insertCSS on ${label} — ${bytes} bytes`);
    await reportLandmarks(webContents, 'apply-time (dom-ready/navigate)');
    return;
  } catch (err) {
    log(`insertCSS FAILED on ${label}: ${err.message}`);
  }
  const tInsertCssFailed = process.hrtime.bigint();

  // insertCSS is unavailable on this build. Before conceding the mechanism,
  // establish whether the OTHER official main->renderer API works at all --
  // the answer decides whether D-0001-1's no-debug-port guarantee survives.
  try {
    const script = buildStyleTagScript(css);
    const tScriptBuilt = process.hrtime.bigint();
    const result = await applyThemeViaStyleTag(webContents, script);
    const tDone = process.hrtime.bigint();
    lastAppliedRoute = 'style-tag executeJavaScript (author origin)';
    log(
      `injected OK via executeJavaScript style tag on ${label} — ` +
        `${result.bytes} chars, lastChildOfHead=${result.lastChildOfHead}`
    );
    // D-0003-9 — the re-application cost, per apply, on one line. `reason` names
    // the event that triggered it so a session's log says WHICH kind of
    // navigation is doing the re-sending, not merely how many happened.
    log(
      `  apply #${applyNo} [${reason}] on ${label}: ${bytes} CSS bytes — ` +
        `insertCSS attempt ${ms(tStart, tInsertCssFailed).toFixed(1)}ms, ` +
        `build script ${ms(tInsertCssFailed, tScriptBuilt).toFixed(1)}ms, ` +
        `executeJavaScript ${ms(tScriptBuilt, tDone).toFixed(1)}ms, ` +
        `total ${ms(tStart, tDone).toFixed(1)}ms`
    );
    // The DIAGNOSTICS are timed too, and separately, because they also run on
    // every one of these events and they are not part of the theme at all.
    // Without this line the measurement above could report a few milliseconds
    // of stylesheet transfer sitting inside a far more expensive DOM sweep, and
    // "re-application is cheap" would be a true statement about the wrong
    // subject — the recurring mistake this plan has recorded four times over
    // (a contrast ratio measured over the wrong region, a mock wrong about
    // which surfaces are opaque, a crop comparison run at the wrong aspect
    // ratio, a log diffed across a truncation). Whichever half dominates, the
    // fix belongs to that half.
    const tProbeStart = process.hrtime.bigint();
    await reportLandmarks(webContents, 'apply-time (dom-ready/navigate)');
    log(
      `  apply #${applyNo} [${reason}] diagnostics (token + landmark probe, not the theme transfer): ` +
        `${ms(tProbeStart, process.hrtime.bigint()).toFixed(1)}ms`
    );
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

function attachToWindow(win) {
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

  // No CSS argument threaded through: applyTheme() reads the active theme
  // from the module-level slot at the moment each event fires (D-0001-25).
  // The trigger is passed down rather than inferred inside applyTheme, because
  // the three events are the whole question M6 asks (D-0003-9): dom-ready fires
  // once per window, did-navigate on a real page load, and did-navigate-in-page
  // on every in-app route change — and only the last one can turn ordinary use
  // of the app into repeated whole-stylesheet transfers.
  wc.on('dom-ready', () => {
    log(`dom-ready on ${label} (url=${wc.getURL()})`);
    applyTheme(wc, 'dom-ready');
  });

  wc.on('did-navigate', (_event, url) => {
    log(`did-navigate on ${label} -> ${url}`);
    applyTheme(wc, 'did-navigate');
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    log(`did-navigate-in-page on ${label} -> ${url}`);
    applyTheme(wc, 'did-navigate-in-page');
  });
}

function start() {
  log('preload loaded into main process');

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

    // D-0001-25 — THE THEME IS LOADED HERE, AFTER 'electron' HAS RESOLVED, AND
    // DELIBERATELY NOT IN start()'s OWN BODY.
    //
    // NODE_OPTIONS is inherited by EVERY child process Codex spawns (GPU,
    // utility, renderer helpers), so this module's start() runs in all of
    // them — and only one of them is an Electron main process that can apply
    // anything. Loading above the electron check was correct while the theme
    // was a bare fs.readFileSync, whose cost was invisible. It is not
    // invisible now: loadTheme() inflates a ~681 KB zip and runs the
    // safe-CSS scan over ~476 KB of CSS, MEASURED at 27 ms, and the first
    // real launch through this path showed the package being loaded FOUR
    // times — once usefully, three times in processes that then failed the
    // electron check and exited. A process that structurally cannot apply a
    // theme must never pay to validate one. The two guards are now in
    // dependency order rather than in the order they were written.
    try {
      const packagePath = resolveThemePackagePath();
      activeTheme = loadTheme(packagePath);
      log(
        `theme package loaded from ${activeTheme.sourcePath} (${activeTheme.sourceKind}) — ` +
          `id=${activeTheme.id}  ${Buffer.byteLength(activeTheme.css, 'utf8')} bytes of CSS  ` +
          `${activeTheme.manifest.landmarks.length} landmark(s) declared`
      );
    } catch (err) {
      // Cannot theme without a validated package. Degrade: log the failure's
      // machine-readable code loudly (docs/ENGINEERING.md "fail loudly in
      // development, gracefully in production" — never half-styled, never
      // crashed), attach nothing, and let Codex run completely stock and
      // functional. A ThemeLoadError names exactly what was wrong
      // (SOURCE_NOT_FOUND, MANIFEST_INVALID, CSS_UNSAFE, SIZE_EXCEEDED,
      // ZIP_MALFORMED); anything else is an unexpected error and is reported
      // the same way, degrading rather than propagating.
      const code = err instanceof ThemeLoadError ? err.code : 'UNEXPECTED';
      log(`STARTUP FAILED [${code}], running stock/unthemed: ${err.message}`);
      return;
    }

    log(`process.versions: ${JSON.stringify(process.versions)}`);

    const attach = () => {
      app.on('browser-window-created', (_event, win) => {
        log(`browser-window-created (webContents#${win.webContents.id})`);
        attachToWindow(win);
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

module.exports = { start };
