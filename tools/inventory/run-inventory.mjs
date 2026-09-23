#!/usr/bin/env node
'use strict';

/**
 * Codexterity — orchestrator for the Plan 0004 M1 throwaway-instance
 * inventory measurement.
 * ---------------------------------------------------------------------
 * Launches a SEPARATE, throwaway Codex instance on a brand-new
 * `--user-data-dir`, with `./driver-preload.js` attached via
 * NODE_OPTIONS=--require (D-0001-1's mechanism — no debug port). The
 * driver steps that instance through a fixed set of screens, probes and
 * screenshots each, restores its own state, and quits by itself. This
 * script's job is purely: resolve the Codex executable, spawn it, wait for
 * it to exit (or force it after a timeout), clean up every process and
 * temp file the run created, and report the result.
 *
 * D-0001-3 — non-destructive by construction: this never touches the
 * owner's own Codex profile or its running instance. The throwaway profile
 * is deleted at the end of every run, successful or not.
 *
 * Usage:
 *   node tools/inventory/run-inventory.mjs [--out <dir>] [--theme <path>]
 *
 * `--out` must resolve OUTSIDE this repository — the captured screens can
 * contain the owner's private project and thread names, and the repo is
 * public (see docs/DECISIONS.md D-0003-10 for why that boundary matters
 * here). The default output directory is under the OS temp dir, which is
 * outside the repo by construction.
 *
 * `--theme <path>` (Plan 0004 M2) — a theme DIRECTORY (e.g.
 * themes/captains-cabin) or a `.ccskin` file, exactly what
 * `injector/theme-loader/index.js`'s `loadTheme()` already accepts. When
 * given, the throwaway instance is launched with the REAL injector attached
 * (`injector/core/preload.js` — the same entry point the launcher points
 * NODE_OPTIONS at; requiring `injector/core/inject.js` directly would do
 * nothing, since it only exports `{ start }` and never calls it itself) in
 * ADDITION to this driver's own preload, so the theme is actually applied
 * and can be measured PAINTED, not merely probed stock. `CDX_PROBE` is
 * deliberately never set in this mode — it suppresses theming, which is the
 * opposite of what a themed run is for. Without `--theme` this tool behaves
 * exactly as it did before (probe-only inventory, no theme applied).
 *
 * Exit code is non-zero if any scenario FAILED or manifest.json is missing.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PRELOAD_PATH = path.join(__dirname, 'driver-preload.js');
// The launcher's own entry point (D-0001-1) — the file NODE_OPTIONS actually
// points at in the real product, per launcher/windows/launch.ps1. It is a
// one-liner (`require('./inject.js').start()`); requiring inject.js itself
// would load the module without ever calling start(), since inject.js only
// exports `{ start }`.
const INJECTOR_PRELOAD_PATH = path.join(REPO_ROOT, 'injector', 'core', 'preload.js');

const CODEX_EXIT_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes, per spec
const SAFETY_MARGIN_MS = 15 * 1000; // grace period after the driver's own 5-minute quit

function parseArgs(argv) {
  const args = { out: null, theme: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      args.out = argv[i + 1];
      i++;
    } else if (argv[i] === '--theme') {
      args.theme = argv[i + 1];
      i++;
    } else {
      throw new Error(`Unrecognized argument: ${argv[i]}`);
    }
  }
  return args;
}

/**
 * Resolve and validate `--theme <path>` up front (fail loudly, before
 * spawning anything) — a theme directory (containing manifest.json) or a
 * `.ccskin` file, exactly what `loadTheme()` accepts. This does not run the
 * full validating loader (that happens inside Codex's own process, via the
 * real injector); it only confirms the path exists and is a plausible theme
 * source, so a typo fails immediately instead of burning a 6-minute Codex
 * launch to discover "STARTUP FAILED [SOURCE_NOT_FOUND]" in injector.log.
 */
function resolveThemePath(themeArg) {
  const resolved = path.resolve(themeArg);
  if (!fs.existsSync(resolved)) {
    throw new Error(`--theme path does not exist: ${resolved}`);
  }
  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    const manifestPath = path.join(resolved, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `--theme directory ${resolved} has no manifest.json — not a valid theme package directory.`
      );
    }
  } else if (!resolved.toLowerCase().endsWith('.ccskin')) {
    throw new Error(
      `--theme path ${resolved} is neither a theme directory nor a .ccskin file.`
    );
  }
  return resolved;
}

function defaultOutDir() {
  const stamp = new Date().toISOString().replace(/:/g, '-');
  return path.join(os.tmpdir(), 'codexterity-inventory', stamp);
}

/** Refuses (throws) if `outDir` resolves inside the repository root. */
function assertOutsideRepo(outDir) {
  const resolved = path.resolve(outDir);
  const rel = path.relative(REPO_ROOT, resolved);
  const insideRepo = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  if (insideRepo) {
    throw new Error(
      `--out must resolve OUTSIDE the repository (captured screens can contain private project/thread ` +
        `names). Got: ${resolved} (repo root: ${REPO_ROOT})`
    );
  }
}

/** Single-quotes `value` for embedding in a PowerShell script, doubling any embedded single quotes. */
function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script) {
  return execFileSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
}

/** Resolves ChatGPT.exe inside the installed Codex package, version-independently. */
function resolveCodexExe() {
  const installLocation = runPowerShell(
    '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation'
  ).trim();
  if (!installLocation) {
    throw new Error(
      'Get-AppxPackage -Name OpenAI.Codex returned no InstallLocation — is Codex installed for this user?'
    );
  }
  const exe = path.join(installLocation, 'app', 'ChatGPT.exe');
  if (!fs.existsSync(exe)) {
    throw new Error(`Resolved Codex install location "${installLocation}" but "${exe}" does not exist.`);
  }
  return exe;
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timedOut: false, code, signal });
    });
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ timedOut: false, error: err });
    });
  });
}

/**
 * Stops ONLY leftover ChatGPT.exe processes whose command line contains
 * `profileDir` — never any other ChatGPT.exe/Codex process, including the
 * owner's own running Codex.
 *
 * MUST filter on `$_.Name -eq 'ChatGPT.exe'` (and exclude our own PID) as
 * well as the CommandLine match: a bare CommandLine `-like` match also
 * matches the sweeping `powershell.exe` process itself (its own command
 * line contains `profileDir`, since we pass it as an argument) and every
 * ancestor node process up the chain — proven by searching for a profile
 * path that had never been used ('*zzz*'-style search matched 5 processes,
 * all of them the searcher and its parents). Without the Name filter, the
 * sweep Stop-Process'es the powershell.exe running the sweep itself, which
 * exits with status -1 (4294967295) and no stderr — a self-inflicted,
 * silent failure. Returns true on success, false on any failure (a sweep
 * failure is now a REAL failure with the root cause fixed, not routine
 * noise — see run-inventory.mjs's caller).
 */
function killLeftoverProcesses(profileDir) {
  const quotedProfile = psQuote(profileDir);
  const script = [
    '$procs = Get-CimInstance Win32_Process | Where-Object {',
    "  $_.Name -eq 'ChatGPT.exe' -and $_.ProcessId -ne $PID -and " +
      `$_.CommandLine -like ('*' + ${quotedProfile} + '*')`,
    '}',
    'foreach ($p in $procs) {',
    '  Write-Output ("stopping leftover PID " + $p.ProcessId + ": " + $p.CommandLine)',
    '  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue',
    '}',
    'Write-Output ("SWEPT_COUNT=" + $procs.Count)',
  ].join('\n');
  try {
    const output = runPowerShell(script);
    const trimmed = output.trim();
    if (trimmed) console.log(trimmed);
    const match = /SWEPT_COUNT=(\d+)/.exec(trimmed);
    const count = match ? Number(match[1]) : null;
    console.log(`swept ${count === null ? '(unknown count of)' : count} leftover process(es)`);
    return true;
  } catch (err) {
    console.error(`ERROR: leftover-process sweep failed: ${err.message}`);
    return false;
  }
}

function removeProfileDir(profileDir) {
  try {
    fs.rmSync(profileDir, { recursive: true, force: true });
    return true;
  } catch (err) {
    console.error(`ERROR: could not remove throwaway profile dir ${profileDir}: ${err.message}`);
    return false;
  }
}

function printSummary(manifest) {
  const chrome = manifest.codexVersions && manifest.codexVersions.chrome;
  const appVersion = manifest.codexVersions && manifest.codexVersions.app;
  console.log(`Codex ${appVersion || '(unknown)'} (chrome ${chrome || '(unknown)'})`);
  const scenarios = manifest.scenarios || [];
  if (scenarios.length === 0) {
    console.log('  (no scenarios recorded)');
  }
  for (const s of scenarios) {
    const mark = s.status === 'OK' ? 'OK  ' : 'FAIL';
    console.log(`  ${mark}  ${s.name}${s.reason ? ` — ${s.reason}` : ''}`);
  }
}

/**
 * Read every theme-check-<scenario>-<mode>.json the driver wrote (Plan 0004
 * M2, --theme mode only) and print one compact, human-readable row per
 * scenario x mode: scenario, mode, surface, sidebar, ink, brass and which of
 * the three shipped faces loaded. This is deliberately the ONLY place that
 * table is built — the driver writes raw painted-value JSON per file, not a
 * pre-formatted table, so the same JSON stays useful for a script diffing
 * against the theme's own hex values without also having to parse a table.
 */
function printThemeCheckSummary(outDir) {
  let entries;
  try {
    entries = fs.readdirSync(outDir).filter((f) => f.startsWith('theme-check-') && f.endsWith('.json'));
  } catch (err) {
    console.error(`could not list ${outDir} for theme-check files: ${err.message}`);
    return;
  }
  if (!entries.length) {
    console.log('\n(no theme-check-*.json files found — was --theme given?)');
    return;
  }
  entries.sort();
  console.log('\nTheme-check summary (painted values, --theme mode):');
  const header = ['scenario', 'mode', 'surface', 'sidebar', 'ink', 'brass', 'fonts'];
  const rows = [header];
  for (const file of entries) {
    let check;
    try {
      check = JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
    } catch (err) {
      rows.push([file, 'PARSE ERROR', err.message, '', '', '', '']);
      continue;
    }
    const tag = file.replace(/^theme-check-/, '').replace(/\.json$/, '');
    const lastDash = tag.lastIndexOf('-');
    const scenario = lastDash === -1 ? tag : tag.slice(0, lastDash);
    const mode = lastDash === -1 ? '' : tag.slice(lastDash + 1);
    const fonts = check.fonts
      ? Object.entries(check.fonts)
          .map(([family, info]) => `${family}=${info && info.check ? 'Y' : 'N'}`)
          .join(' ')
      : '';
    rows.push([
      scenario,
      mode,
      (check.mainSurface && check.mainSurface.background) || '',
      (check.sidebar && check.sidebar.background) || '',
      (check.ink && check.ink.color) || '',
      (check.sidebarActiveRow && check.sidebarActiveRow.background) || '(none open)',
      fonts,
    ]);
  }
  const widths = header.map((_, col) => Math.max(...rows.map((r) => String(r[col]).length)));
  for (const row of rows) {
    console.log('  ' + row.map((cell, col) => String(cell).padEnd(widths[col])).join('  '));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || defaultOutDir());
  assertOutsideRepo(outDir);

  const themePath = args.theme ? resolveThemePath(args.theme) : null;

  const profileDir = path.join(outDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });

  const codexExe = resolveCodexExe();
  const preloadForNodeOptions = PRELOAD_PATH.split(path.sep).join('/');

  console.log(`Codex exe:        ${codexExe}`);
  console.log(`Throwaway profile: ${profileDir}`);
  console.log(`Output directory:  ${outDir}`);
  if (themePath) console.log(`Theme:             ${themePath}`);

  const stdoutPath = path.join(outDir, 'codex-stdout.txt');
  const stdoutFd = fs.openSync(stdoutPath, 'a');

  // Quoted the same way as the driver's own preload path (forward slashes,
  // wrapped in double quotes) — NODE_OPTIONS is tokenized by Node's own
  // CLI-option parser, same as launcher/windows/launch.ps1's comment on this
  // explains for the real launcher.
  let nodeOptions = `--require "${preloadForNodeOptions}"`;
  const env = Object.assign({}, process.env, {
    CDX_INVENTORY_OUT: outDir,
  });
  if (themePath) {
    const injectorPreloadForNodeOptions = INJECTOR_PRELOAD_PATH.split(path.sep).join('/');
    nodeOptions += ` --require "${injectorPreloadForNodeOptions}"`;
    env.CDX_THEME_PACKAGE = themePath;
    env.CDX_DEBUG_LOG_PATH = path.join(outDir, 'injector.log');
    // CDX_PROBE must NOT be set here — it suppresses theming, and a themed
    // run exists specifically to measure the theme actually applied.
    delete env.CDX_PROBE;
  }
  env.NODE_OPTIONS = nodeOptions;

  let child;
  try {
    child = spawn(codexExe, [`--user-data-dir=${profileDir}`], {
      env,
      stdio: ['ignore', stdoutFd, stdoutFd],
    });
  } finally {
    // The child inherits the fd; our own handle can close once spawned.
    try {
      fs.closeSync(stdoutFd);
    } catch (err) {
      /* best effort */
    }
  }

  console.log(`Spawned Codex (pid ${child.pid}). Waiting up to ${CODEX_EXIT_TIMEOUT_MS / 1000}s for it to exit...`);

  const result = await waitForExit(child, CODEX_EXIT_TIMEOUT_MS + SAFETY_MARGIN_MS);
  if (result.timedOut) {
    console.error('Codex did not exit in time — force-stopping the spawned process.');
    try {
      child.kill();
    } catch (err) {
      /* best effort */
    }
  } else if (result.error) {
    console.error(`Codex process reported an error: ${result.error.message}`);
  } else {
    console.log(`Codex exited (code=${result.code}, signal=${result.signal}).`);
  }

  // Attempt both cleanup steps regardless of the other's outcome, but a
  // failure in either is now a real failure (the self-kill root cause is
  // fixed — see killLeftoverProcesses's doc comment) and must fail the run.
  const sweepOk = killLeftoverProcesses(profileDir);
  const removeOk = removeProfileDir(profileDir);

  const manifestPath = path.join(outDir, 'manifest.json');
  let ok = sweepOk && removeOk;
  if (!fs.existsSync(manifestPath)) {
    console.error(
      `No manifest.json at ${manifestPath} — the driver likely crashed or never reached the main window. ` +
        `See ${path.join(outDir, 'inventory.log')} and ${stdoutPath} for detail.`
    );
    ok = false;
  } else {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(`manifest.json at ${manifestPath} could not be parsed: ${err.message}`);
      ok = false;
      manifest = null;
    }
    if (manifest) {
      printSummary(manifest);
      const scenarios = manifest.scenarios || [];
      if (scenarios.length === 0 || scenarios.some((s) => s.status !== 'OK')) {
        ok = false;
      }
    }
  }

  if (themePath) printThemeCheckSummary(outDir);

  console.log(`\nOutput directory: ${outDir}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`FATAL: ${err.stack || err.message}`);
  process.exitCode = 1;
});
