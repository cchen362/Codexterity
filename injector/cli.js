#!/usr/bin/env node
'use strict';

/**
 * Codexterity — `cdx` CLI (Phase 4 M3)
 * -----------------------------------------------------------
 * The user-facing entry point: `apply` / `restore` / `verify` / `list` /
 * `launch` / `help`. CommonJS, zero dependencies (D-0001-20 binds the whole
 * `injector/` tree, not just the loader) — argument parsing is hand-rolled
 * below rather than pulled in from a library, because the surface is four
 * verbs and a library buys nothing a `switch` does not already give us.
 *
 * The owner's governing requirement (settled 2026-08-03, before this
 * milestone was handed off): *"the way to start the customized Codex should
 * be hassle free and usable/idiot-proof… not some technical hobbyist way of
 * applying a theme."* Two things follow from it, and both are load-bearing
 * for the shape of this file:
 *
 *   1. `NODE_OPTIONS` is read at process START (D-0001-1), so Codex MUST be
 *      *launched* through Codexterity for the injector to attach at all —
 *      that step cannot be moved into the running app. `cdx apply <theme>`
 *      therefore only ever PERSISTS a choice; it never launches anything
 *      itself, and it must say so plainly so nobody assumes it does.
 *   2. A shortcut is a fixed command line and cannot carry a changing
 *      argument, so there must be a single, ARGUMENT-FREE launch entry
 *      point that reads the active theme from persisted state. That is
 *      `cdx` (bare) and `cdx launch`, below — the only shape a Start-menu
 *      shortcut (M4) can point at.
 *
 * Almost everything here is exported as a small testable unit (parseArgs,
 * the state-file functions, resolveThemeSource, main) precisely so the test
 * suite never has to spawn a process or touch the real home directory — see
 * tests/cli/*.test.js.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const { loadTheme, ThemeLoadError } = require('./theme-loader/index.js');

// cli.js sits in injector/, so the repo root is one level up.
const REPO_ROOT = path.resolve(__dirname, '..');

// The state file's own format version, independent of any theme's version
// or the .ccskin package format version (SUPPORTED_FORMAT_VERSION in
// manifest.js). Bumping this is a breaking change to what state.json is
// allowed to contain.
const STATE_FORMAT_VERSION = 1;

const VERBS = new Set(['apply', 'restore', 'verify', 'list', 'launch', 'help']);

const USAGE = `Codexterity — cdx <verb> [args]

  cdx                  start Codex with the currently active theme (same as "cdx launch")
  cdx launch           same as bare "cdx" — the argument-free entry point a shortcut can target
  cdx apply <theme>    validate <theme> (a theme id, or a path to a directory or .ccskin) and
                        persist it as the active theme. Does NOT launch or repaint anything —
                        NODE_OPTIONS is only read when a process starts, so run "cdx" (or
                        "cdx launch") afterward, or use the shortcut once one exists.
  cdx restore          clear the active theme, returning future launches to stock Codex.
                        A Codex window that is already running and themed stays themed
                        until it is restarted — this cannot un-paint a live window.
  cdx verify [<theme>] validate the active theme (or <theme>, if given) and report its
                        manifest details without launching anything.
  cdx list             enumerate themes available under dist/*.ccskin and themes/*/.
  cdx help             show this message.
`;

// ---------------------------------------------------------------------
// Persisted state — D-0001-24
// ---------------------------------------------------------------------
//
// Location: `~/.codexterity/state.json` (a single home-relative path, no
// per-OS branch). Two reasons this is the right home, not merely a
// convenient one:
//
//   (a) `injector/` is platform-agnostic per the layer rule in
//       docs/ENGINEERING.md — a `%APPDATA%` (Windows) vs
//       `~/Library/Application Support` (macOS) branch here would be
//       exactly the platform leak that rule reserves for `launcher/<os>/`.
//       `os.homedir()` already resolves correctly on both OSes with zero
//       branching, so one path needs no branch at all.
//   (b) It sits outside the Codex install and nowhere near `~/.codex`
//       (where Codex itself keeps `auth.json` / `.credentials.json`),
//       satisfying D-0001-3's non-destructive boundary structurally: this
//       file never resolves a path under `~/.codex`, so it cannot collide
//       with — or be mistaken for a tool that reads — the app's own
//       credential store. The `.codexterity` name deliberately mirrors
//       Codex's own `~/.codex` convention rather than inventing a new one.

function stateFilePath(home) {
  return path.join(home, '.codexterity', 'state.json');
}

/**
 * Read persisted state. Returns `null` if no state file exists yet (a
 * legitimate, common case — nothing has been applied). Throws a plain
 * `Error` with a clear message if the file exists but cannot be read or
 * parsed — "fail loudly", never silently treat corruption as "no theme".
 */
function readState(home) {
  const filePath = stateFilePath(home);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`cdx: cannot read state file "${filePath}": ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`cdx: state file "${filePath}" is corrupt (not valid JSON): ${err.message}`);
  }
}

/** Write persisted state, 2-space indented with a trailing newline. */
function writeState(home, state) {
  const dir = path.join(home, '.codexterity');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = stateFilePath(home);
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return filePath;
}

/**
 * `cdx restore`'s mechanism. This is D-0001-3's user-facing promise and
 * must leave nothing residual: delete state.json, then remove the
 * `.codexterity` directory too if that leaves it empty. `fs.rmdirSync` on
 * an already-empty directory only — never a recursive delete, which would
 * be exactly the kind of destructive shortcut docs/ENGINEERING.md forbids
 * for a directory Codexterity does not fully own the contents of.
 */
function clearState(home) {
  const dir = path.join(home, '.codexterity');
  const filePath = stateFilePath(home);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
    fs.rmdirSync(dir);
  }
}

// ---------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------

/**
 * Hand-rolled parser for four verbs. Returns `{ verb, args }` on success,
 * or `{ error: string }` on failure — callers print `error` plus USAGE and
 * exit non-zero, never throw, so `main()` stays a straight-line dispatch.
 */
function parseArgs(argv) {
  if (argv.length === 0) {
    // Bare "cdx" — the argument-free launch entry point (see file header).
    return { verb: 'launch', args: [] };
  }

  const [first, ...rest] = argv;

  if (first === '--help' || first === '-h') {
    return { verb: 'help', args: [] };
  }

  if (!VERBS.has(first)) {
    return { error: `cdx: unknown command "${first}"` };
  }

  if (first === 'apply') {
    if (rest.length !== 1) {
      return { error: 'cdx apply requires exactly one argument: a theme id or a path' };
    }
    return { verb: 'apply', args: rest };
  }

  if (first === 'verify') {
    if (rest.length > 1) {
      return { error: 'cdx verify takes at most one argument: a theme id or a path' };
    }
    return { verb: 'verify', args: rest };
  }

  // restore / list / launch / help take no arguments.
  if (rest.length !== 0) {
    return { error: `cdx ${first} takes no arguments` };
  }
  return { verb: first, args: [] };
}

// ---------------------------------------------------------------------
// Theme resolution
// ---------------------------------------------------------------------

/**
 * Resolve a user-supplied theme name or path to a concrete source for
 * `loadTheme()`, in the order settled for this milestone:
 *
 *   1. An existing path (directory or file), used verbatim, resolved to
 *      absolute. This lets `apply`/`verify` take either a theme id or a
 *      literal path.
 *   2. Otherwise, treat it as a theme id and look under the repo's two
 *      roots: the packaged `.ccskin` FIRST, the development directory
 *      SECOND. The packaged form wins because that is what actually
 *      ships; the directory is the development fallback and is what
 *      exists on a fresh clone, since `dist/` is gitignored build output.
 *   3. Otherwise fail, naming both places that were checked.
 */
function resolveThemeSource(nameOrPath, repoRoot) {
  let stat = null;
  try {
    stat = fs.statSync(nameOrPath);
  } catch (err) {
    stat = null;
  }
  if (stat) {
    return path.resolve(nameOrPath);
  }

  const ccskinPath = path.join(repoRoot, 'dist', `${nameOrPath}.ccskin`);
  if (fs.existsSync(ccskinPath)) {
    return ccskinPath;
  }

  const dirPath = path.join(repoRoot, 'themes', nameOrPath);
  if (fs.existsSync(dirPath)) {
    return dirPath;
  }

  throw new Error(
    `cdx: could not resolve theme "${nameOrPath}" — it is not an existing path, and neither ` +
      `"${ccskinPath}" nor "${dirPath}" exists`
  );
}

// ---------------------------------------------------------------------
// Verb implementations
// ---------------------------------------------------------------------

function cmdApply(themeArg, ctx) {
  let source;
  try {
    source = resolveThemeSource(themeArg, ctx.repoRoot);
  } catch (err) {
    ctx.stderr(err.message + '\n');
    return 1;
  }

  let theme;
  try {
    // Full validation — manifest shape, safe-CSS scan, asset agreement,
    // the size cap — is the entire point of routing through loadTheme()
    // rather than reading theme.css off disk directly (see M3's second
    // settled judgement call). State is written ONLY if this succeeds.
    theme = loadTheme(source);
  } catch (err) {
    if (err instanceof ThemeLoadError) {
      ctx.stderr(`${err.code}: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  const state = {
    formatVersion: STATE_FORMAT_VERSION,
    activeTheme: {
      id: theme.id,
      source: theme.sourcePath,
      appliedAt: ctx.now(),
    },
  };
  writeState(ctx.home, state);

  ctx.stdout(
    `Applied "${theme.manifest.name}" (${theme.id} v${theme.manifest.version}) ` +
      `from ${theme.sourceKind} ${theme.sourcePath}\n`
  );
  ctx.stdout(
    'This only PERSISTS the choice — it does not launch or repaint anything. ' +
      'NODE_OPTIONS is read only when a process starts, so a Codex window already ' +
      'running (or one started any other way) will not show this theme.\n'
  );
  ctx.stdout('Start Codex through Codexterity for it to appear: run "cdx" (or "cdx launch") with no arguments.\n');
  return 0;
}

function cmdRestore(ctx) {
  let hadActiveTheme = false;
  try {
    const state = readState(ctx.home);
    hadActiveTheme = Boolean(state && state.activeTheme);
  } catch (err) {
    // Report the corruption, but still proceed to clear it below — a
    // corrupt state file is exactly the residue "restore" exists to remove.
    ctx.stderr(err.message + '\n');
  }

  clearState(ctx.home);

  ctx.stdout('Cleared the active theme. Future launches through Codexterity start stock Codex.\n');
  ctx.stdout(
    'A Codex window that is already running and themed STAYS themed until it is restarted — ' +
      'the injector has no channel to un-paint a live window.\n'
  );
  if (!hadActiveTheme) {
    ctx.stdout('(No theme was recorded as active.)\n');
  }
  return 0;
}

function cmdVerify(themeArg, ctx) {
  let source;
  if (themeArg) {
    try {
      source = resolveThemeSource(themeArg, ctx.repoRoot);
    } catch (err) {
      ctx.stderr(err.message + '\n');
      return 1;
    }
  } else {
    let state;
    try {
      state = readState(ctx.home);
    } catch (err) {
      ctx.stderr(err.message + '\n');
      return 1;
    }
    if (!state || !state.activeTheme || !state.activeTheme.source) {
      ctx.stderr('cdx verify: no theme is currently active. Run "cdx apply <theme>" first, or pass a theme id/path explicitly.\n');
      return 1;
    }
    source = state.activeTheme.source;
  }

  let theme;
  try {
    theme = loadTheme(source);
  } catch (err) {
    if (err instanceof ThemeLoadError) {
      ctx.stderr(`${err.code}: ${err.message}\n`);
      return 1;
    }
    throw err;
  }

  let totalAssetBytes = 0;
  for (const buffer of theme.assets.values()) {
    totalAssetBytes += buffer.length;
  }

  ctx.stdout(`id:          ${theme.id}\n`);
  ctx.stdout(`name:        ${theme.manifest.name}\n`);
  ctx.stdout(`version:     ${theme.manifest.version}\n`);
  ctx.stdout(`source kind: ${theme.sourceKind}\n`);
  ctx.stdout(`source path: ${theme.sourcePath}\n`);
  ctx.stdout(`css bytes:   ${Buffer.byteLength(theme.css, 'utf8')}\n`);
  ctx.stdout(`assets:      ${theme.assets.size} file(s), ${totalAssetBytes} byte(s) total\n`);
  ctx.stdout('landmarks:\n');
  if (theme.manifest.landmarks.length === 0) {
    ctx.stdout('  (none declared)\n');
  }
  for (const landmark of theme.manifest.landmarks) {
    ctx.stdout(
      `  - ${landmark.name}  (governedBy: ${landmark.governedBy || 'n/a'}, required: ${landmark.required === true})\n`
    );
  }
  return 0;
}

function cmdList(ctx) {
  let activeSourceResolved = null;
  try {
    const state = readState(ctx.home);
    if (state && state.activeTheme && state.activeTheme.source) {
      activeSourceResolved = path.resolve(state.activeTheme.source);
    }
  } catch (err) {
    ctx.stderr(err.message + '\n');
  }

  const candidates = [];
  const distDir = path.join(ctx.repoRoot, 'dist');
  if (fs.existsSync(distDir)) {
    for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.ccskin')) {
        candidates.push(path.join(distDir, entry.name));
      }
    }
  }
  const themesDir = path.join(ctx.repoRoot, 'themes');
  if (fs.existsSync(themesDir)) {
    for (const entry of fs.readdirSync(themesDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        candidates.push(path.join(themesDir, entry.name));
      }
    }
  }

  // Missing roots are normal (dist/ is gitignored build output) — the
  // loops above already no-op on a missing directory, so an empty
  // candidate list is reported as "none found", never thrown.
  if (candidates.length === 0) {
    ctx.stdout('No themes found under dist/*.ccskin or themes/*/.\n');
    return 0;
  }

  for (const source of candidates) {
    let theme;
    try {
      theme = loadTheme(source);
    } catch (err) {
      const detail = err instanceof ThemeLoadError ? `${err.code}: ${err.message}` : err.message;
      ctx.stdout(`  INVALID  ${source}\n    ${detail}\n`);
      continue;
    }
    const isActive = activeSourceResolved !== null && path.resolve(theme.sourcePath) === activeSourceResolved;
    ctx.stdout(
      `  ${theme.id}  v${theme.manifest.version}  (${theme.sourceKind})  ${theme.sourcePath}` +
        `${isActive ? '  [active]' : ''}\n`
    );
  }
  return 0;
}

function cmdLaunch(ctx) {
  let state;
  try {
    state = readState(ctx.home);
  } catch (err) {
    ctx.stderr(err.message + '\n');
    return 1;
  }
  const hasActiveTheme = Boolean(state && state.activeTheme && state.activeTheme.source);
  const themePackage = hasActiveTheme ? state.activeTheme.source : null;

  // D-0001-32 (settled 2026-08-04, Plan 0002 M3 §F3) -- "no theme applied"
  // is NOT a launch failure. cmdRestore (above) promises "future launches
  // through Codexterity start stock Codex"; before this branch existed,
  // cmdLaunch instead returned 1 with a stderr-only message that the
  // installed shortcut's GUI-subsystem stub (packaging/windows/Codexterity.cs)
  // has no console to show, so the user saw an opaque "did not start
  // cleanly" dialog. The Codexterity icon is a launcher FOR CODEX
  // (D-0001-24/30's theme-neutrality), so the owner's ruling is: fall
  // through to a theme-less launch, never refuse.

  // The one irreducible platform branch in this file. It SELECTS the
  // OS-specific launcher component; it does not contain OS-specific
  // launching logic itself (that logic lives in launcher/<os>/, per the
  // layer rule in docs/ENGINEERING.md). Do not "clean this up" by
  // collapsing it, and do not take its existence as licence to add more
  // platform branches elsewhere in this file.
  let command;
  let spawnArgs;
  if (ctx.platform === 'win32') {
    const script = path.join(ctx.repoRoot, 'launcher', 'windows', 'launch.ps1');
    command = 'powershell.exe';
    if (hasActiveTheme) {
      spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ThemePackage', themePackage];
    } else {
      ctx.stdout(
        'cdx: no theme is applied — starting Codex unthemed. Run "cdx apply captains-cabin" ' +
          '(then "cdx") to bring the theme back.\n'
      );
      spawnArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-NoTheme'];
    }
    // D-0001-27 (Phase 4 M4) -- the log fork lives in the ENVIRONMENT, not a
    // new CLI flag: the argument-free entry point (see this file's header,
    // point 2) must stay argument-free, so a developer terminal and the
    // installed shortcut cannot be told apart by argv, only by which one set
    // CDX_LAUNCHER_LOG. The GUI-subsystem shortcut stub
    // (packaging/windows/Codexterity.cs) sets it before spawning this
    // process; an ordinary developer shell leaves it unset, and launch.ps1's
    // behaviour is then byte-for-byte what it always was (its own -LogFile
    // parameter default is empty). This plumbing is identical on the
    // theme-less path -- a shortcut launched with no theme applied is still
    // the shortcut, with the same no-console problem D-0001-32 exists to fix.
    if (ctx.env && ctx.env.CDX_LAUNCHER_LOG) {
      spawnArgs.push('-LogFile', ctx.env.CDX_LAUNCHER_LOG);
    }
  } else if (ctx.platform === 'darwin') {
    if (!hasActiveTheme) {
      // launcher/macos/launch.sh is documented UNVERIFIED (D-0001-16 as
      // amended) and is out of scope for D-0001-32: it has no theme-less
      // mode today, and inventing incoherent behaviour for an unverified
      // script is worse than refusing plainly. Name the limitation instead
      // of pretending a theme-less macOS launch exists.
      ctx.stderr(
        'cdx: no theme is applied, and launcher/macos/launch.sh has no theme-less launch mode yet ' +
          '(it is documented UNVERIFIED, D-0001-16). Run "cdx apply captains-cabin" first, then "cdx".\n'
      );
      return 1;
    }
    const script = path.join(ctx.repoRoot, 'launcher', 'macos', 'launch.sh');
    command = 'bash';
    spawnArgs = [script, '--theme-package', themePackage];
  } else {
    ctx.stderr(`cdx: unsupported platform "${ctx.platform}" — Codexterity supports Windows and macOS only.\n`);
    return 1;
  }

  const result = ctx.spawnSync(command, spawnArgs, { stdio: 'inherit' });
  if (result.error) {
    throw result.error;
  }
  return typeof result.status === 'number' ? result.status : 1;
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

function buildContext(options) {
  return {
    home: options.home || os.homedir(),
    repoRoot: options.repoRoot || REPO_ROOT,
    platform: options.platform || process.platform,
    // Injectable so a test can assert cmdLaunch's -LogFile plumbing (see
    // D-0001-27 marker at its call site) without setting a REAL environment
    // variable that would leak into the rest of that test run.
    env: options.env || process.env,
    spawnSync: options.spawnSync || spawnSync,
    now: options.now || (() => new Date().toISOString()),
    stdout: options.stdout || ((text) => process.stdout.write(text)),
    stderr: options.stderr || ((text) => process.stderr.write(text)),
  };
}

/**
 * @param {string[]} argv - e.g. `process.argv.slice(2)`
 * @param {object} [options] - injectable overrides for tests: home,
 *   repoRoot, platform, env, spawnSync, now, stdout, stderr.
 * @returns {number} process exit code.
 */
function main(argv, options = {}) {
  const ctx = buildContext(options);
  const parsed = parseArgs(argv);

  if (parsed.error) {
    ctx.stderr(parsed.error + '\n');
    ctx.stderr(USAGE);
    return 1;
  }

  switch (parsed.verb) {
    case 'apply':
      return cmdApply(parsed.args[0], ctx);
    case 'restore':
      return cmdRestore(ctx);
    case 'verify':
      return cmdVerify(parsed.args[0], ctx);
    case 'list':
      return cmdList(ctx);
    case 'launch':
      return cmdLaunch(ctx);
    case 'help':
      ctx.stdout(USAGE);
      return 0;
    default:
      // Unreachable given parseArgs' own VERBS check, but kept as an
      // explicit fail-loud branch rather than falling through silently.
      ctx.stderr(`cdx: unknown command "${parsed.verb}"\n`);
      ctx.stderr(USAGE);
      return 1;
  }
}

module.exports = {
  parseArgs,
  stateFilePath,
  readState,
  writeState,
  clearState,
  resolveThemeSource,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
