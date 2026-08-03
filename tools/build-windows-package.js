'use strict';

/**
 * Codexterity — Windows distributable builder (Phase 4 M4)
 * -----------------------------------------------------------
 * CommonJS, zero dependencies (D-0001-20 binds the whole repo), matching
 * the house style of tools/pack-ccskin.js. Produces `dist/Codexterity-Windows/`:
 * a self-contained portable folder a recipient runs `Install.ps1` from.
 *
 *   Codexterity-Windows/
 *   |- Install.ps1
 *   |- Uninstall.ps1
 *   |- README.txt
 *   `- payload/
 *      |- package.json
 *      |- injector/**            (cli.js, core/, theme-loader/)
 *      |- launcher/windows/launch.ps1
 *      |- dist/captains-cabin.ccskin
 *      `- bin/Codexterity.exe  +  Codexterity.ico
 *
 * `payload/` IS the repo root as far as injector/cli.js is concerned:
 * REPO_ROOT there is `path.resolve(__dirname, '..')`, i.e. one level above
 * `injector/`, so once `injector/`, `launcher/windows/`, `dist/*.ccskin` and
 * `package.json` sit under `payload/` in this exact shape,
 * `resolveThemeSource()` finds the packaged theme with zero code change.
 *
 * Only what is needed is copied. Explicitly NOT copied: themes/, tools/,
 * docs/, tests/, launcher/macos/ — the payload is a runtime, not a checkout.
 *
 * The GUI-subsystem shortcut stub (packaging/windows/Codexterity.cs) is
 * compiled HERE, at build time, never on the recipient's machine — running
 * csc.exe on a user's machine is itself a well-known malware heuristic, and
 * the whole point of shipping a stub at all was to avoid asking a
 * non-technical recipient to run anything but Install.ps1.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { packTheme } = require('./pack-ccskin.js');
const { ThemeLoadError } = require('../injector/theme-loader/index.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'dist', 'Codexterity-Windows');
const PAYLOAD_ROOT = path.join(OUTPUT_ROOT, 'payload');
const PACKAGING_DIR = path.join(REPO_ROOT, 'packaging', 'windows');

// The known in-box .NET Framework C# compiler location (verified present on
// this machine, Node v22.14.0 / Windows 11). Never guessed at install time —
// see the module header. A `where csc.exe` PATH search is tried as a
// fallback for a machine where the Framework64 tree differs, but the
// Framework64 path is tried first because it needs no shell resolution at
// all.
const KNOWN_CSC_PATH = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

function resolveCsc() {
  if (fs.existsSync(KNOWN_CSC_PATH)) {
    return KNOWN_CSC_PATH;
  }
  try {
    const found = execFileSync('where', ['csc.exe'], { encoding: 'utf8' }).split(/\r?\n/)[0].trim();
    if (found && fs.existsSync(found)) {
      return found;
    }
  } catch (err) {
    // `where` itself failing (not found, or csc.exe not on PATH) falls
    // through to the loud failure below — this function never returns a
    // path it has not verified exists.
  }
  throw new Error(
    'build-windows-package: could not find csc.exe (the .NET Framework C# compiler). ' +
      `Checked "${KNOWN_CSC_PATH}" and "where csc.exe" on PATH. ` +
      'csc.exe ships in-box with .NET Framework 4 on Windows 10/11; if it is genuinely absent, ' +
      'install the .NET Framework Developer Pack, or run this on a machine that has it. ' +
      'The stub MUST be compiled at build time, never on a recipient machine (see this file\'s header).'
  );
}

function ensureCcskin() {
  // packTheme() is idempotent and byte-reproducible (D-0001-23) — calling it
  // here guarantees the payload always carries a package built from the
  // CURRENT themes/captains-cabin/ source, rather than trusting a stale
  // dist/*.ccskin some earlier, unrelated command happened to leave behind.
  const themeDir = path.join(REPO_ROOT, 'themes', 'captains-cabin');
  try {
    return packTheme(themeDir);
  } catch (err) {
    if (err instanceof ThemeLoadError) {
      throw new Error(
        `build-windows-package: the theme failed to pack (${err.code}): ${err.message}\n` +
          'Run "node tools/pack-ccskin.js" directly to see the full validation error.'
      );
    }
    throw err;
  }
}

async function ensureIcon() {
  const icoPath = path.join(REPO_ROOT, 'dist', 'Codexterity.ico');
  // The icon is regenerated on every build rather than trusted from a
  // previous run, for reproducibility — the same reason as the .ccskin
  // above — so a future change to make-ico.mjs's geometry/colours reaches
  // the shipped package automatically.
  //
  // make-ico.mjs is ESM (it imports the ESM-only palette-engine.mjs so its
  // rasterised spectrum is the exact owner-approved numbers, never a
  // reimplemented conversion); this file stays CommonJS, so a dynamic
  // `import()` is the load-bearing bridge rather than converting this whole
  // build script to ESM for one dependency.
  const { makeIco } = await import('./make-ico.mjs');
  return makeIco(icoPath);
}

/**
 * Compile the GUI-subsystem stub straight to `outPath`, never to a
 * location under packaging/windows/. The legacy Framework `csc.exe` (no
 * `/deterministic` flag — that is a Roslyn-only feature) stamps a real
 * build timestamp into the PE header, so the produced .exe is NOT
 * byte-reproducible across builds — the same class of build output as
 * `dist/*.ccskin`, which is why it belongs only under the gitignored
 * `dist/` tree, never in the tracked `packaging/windows/` source
 * directory alongside Codexterity.cs.
 */
function compileStub(cscPath, outPath) {
  const srcPath = path.join(PACKAGING_DIR, 'Codexterity.cs');
  const icoPath = path.join(REPO_ROOT, 'dist', 'Codexterity.ico');
  if (!fs.existsSync(srcPath)) {
    throw new Error(`build-windows-package: missing stub source at "${srcPath}"`);
  }
  if (!fs.existsSync(icoPath)) {
    throw new Error(`build-windows-package: missing icon at "${icoPath}" — call ensureIcon() before compileStub()`);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const args = [
    '/nologo',
    '/target:winexe',
    '/platform:anycpu',
    '/optimize+',
    `/win32icon:${icoPath}`,
    `/out:${outPath}`,
    srcPath,
  ];

  execFileSync(cscPath, args, { stdio: 'pipe' });

  if (!fs.existsSync(outPath)) {
    throw new Error(`build-windows-package: csc.exe reported success but "${outPath}" was not produced`);
  }
  return outPath;
}

/**
 * Recursively list every file under `dir`, relative to `dir`, forward-slash
 * separated — used only for the manifest print at the end, so a developer
 * running this script sees exactly what shipped rather than trusting a
 * silent "done".
 */
function listFilesRecursive(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full));
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Build the full `dist/Codexterity-Windows/` distributable.
 * @returns {{ outputRoot: string, manifest: { path: string, bytes: number }[] }}
 */
async function buildWindowsPackage() {
  const cscPath = resolveCsc();
  const packResult = ensureCcskin();
  const icoResult = await ensureIcon();

  // Start clean: a stale payload/ from a previous build must never leak an
  // asset this run no longer copies (e.g. after a theme.css font swap).
  if (fs.existsSync(OUTPUT_ROOT)) {
    fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  }
  fs.mkdirSync(PAYLOAD_ROOT, { recursive: true });

  // Compiled directly into payload/bin/ — see compileStub()'s own comment
  // for why the non-reproducible .exe must never land in packaging/windows/.
  compileStub(cscPath, path.join(PAYLOAD_ROOT, 'bin', 'Codexterity.exe'));

  // package.json — verbatim copy. cli.js does not read it at runtime, but
  // its presence is part of the documented payload shape and costs nothing.
  fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(PAYLOAD_ROOT, 'package.json'));

  // injector/** — the whole tree (cli.js, core/, theme-loader/). Nothing
  // under injector/ is excluded: cli.js requires theme-loader/index.js at
  // runtime, and the preload/inject modules under core/ are what
  // launch.ps1 points NODE_OPTIONS at.
  fs.cpSync(path.join(REPO_ROOT, 'injector'), path.join(PAYLOAD_ROOT, 'injector'), { recursive: true });

  // launcher/windows/launch.ps1 ONLY — not launcher/macos/, per this
  // milestone's scope, and not any other file that might later appear
  // beside it under launcher/windows/.
  fs.mkdirSync(path.join(PAYLOAD_ROOT, 'launcher', 'windows'), { recursive: true });
  fs.copyFileSync(
    path.join(REPO_ROOT, 'launcher', 'windows', 'launch.ps1'),
    path.join(PAYLOAD_ROOT, 'launcher', 'windows', 'launch.ps1')
  );

  // dist/captains-cabin.ccskin — the packaged theme, freshly (re)built above.
  fs.mkdirSync(path.join(PAYLOAD_ROOT, 'dist'), { recursive: true });
  fs.copyFileSync(packResult.outputPath, path.join(PAYLOAD_ROOT, 'dist', path.basename(packResult.outputPath)));

  // bin/Codexterity.exe was compiled directly to its final payload location
  // above; only the icon needs copying in beside it.
  fs.copyFileSync(icoResult.outputPath, path.join(PAYLOAD_ROOT, 'bin', 'Codexterity.ico'));

  // Install.ps1 / Uninstall.ps1 / README.txt sit at the DIST ROOT, not
  // inside payload/ — they are the recipient's entry points, run from
  // wherever they extracted the folder, and they themselves copy payload/
  // into its real install location.
  for (const name of ['Install.ps1', 'Uninstall.ps1', 'README.txt']) {
    fs.copyFileSync(path.join(PACKAGING_DIR, name), path.join(OUTPUT_ROOT, name));
  }

  const manifest = listFilesRecursive(OUTPUT_ROOT).map((full) => ({
    path: path.relative(OUTPUT_ROOT, full).split(path.sep).join('/'),
    bytes: fs.statSync(full).size,
  }));

  return { outputRoot: OUTPUT_ROOT, manifest };
}

module.exports = { buildWindowsPackage, resolveCsc, OUTPUT_ROOT, PAYLOAD_ROOT };

if (require.main === module) {
  buildWindowsPackage().then((result) => {
    console.log(`Built: ${result.outputRoot}`);
    let totalBytes = 0;
    for (const entry of result.manifest) {
      totalBytes += entry.bytes;
      console.log(`  ${entry.path} (${entry.bytes} bytes)`);
    }
    console.log(`Total: ${result.manifest.length} file(s), ${totalBytes} bytes`);
  });
}
