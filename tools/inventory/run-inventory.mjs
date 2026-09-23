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
 *   node tools/inventory/run-inventory.mjs [--out <dir>]
 *
 * `--out` must resolve OUTSIDE this repository — the captured screens can
 * contain the owner's private project and thread names, and the repo is
 * public (see docs/DECISIONS.md D-0003-10 for why that boundary matters
 * here). The default output directory is under the OS temp dir, which is
 * outside the repo by construction.
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

const CODEX_EXIT_TIMEOUT_MS = 6 * 60 * 1000; // 6 minutes, per spec
const SAFETY_MARGIN_MS = 15 * 1000; // grace period after the driver's own 5-minute quit

function parseArgs(argv) {
  const args = { out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      args.out = argv[i + 1];
      i++;
    } else {
      throw new Error(`Unrecognized argument: ${argv[i]}`);
    }
  }
  return args;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || defaultOutDir());
  assertOutsideRepo(outDir);

  const profileDir = path.join(outDir, 'profile');
  fs.mkdirSync(profileDir, { recursive: true });

  const codexExe = resolveCodexExe();
  const preloadForNodeOptions = PRELOAD_PATH.split(path.sep).join('/');

  console.log(`Codex exe:        ${codexExe}`);
  console.log(`Throwaway profile: ${profileDir}`);
  console.log(`Output directory:  ${outDir}`);

  const stdoutPath = path.join(outDir, 'codex-stdout.txt');
  const stdoutFd = fs.openSync(stdoutPath, 'a');

  const env = Object.assign({}, process.env, {
    NODE_OPTIONS: `--require "${preloadForNodeOptions}"`,
    CDX_INVENTORY_OUT: outDir,
  });

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

  console.log(`\nOutput directory: ${outDir}`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((err) => {
  console.error(`FATAL: ${err.stack || err.message}`);
  process.exitCode = 1;
});
