'use strict';

/**
 * Codexterity — macOS wrapper `.app` builder (Phase 4 M4)
 * ---------------------------------------------------------
 * Assembles `dist/Codexterity-macOS/Codexterity.app` — the wrapper bundle
 * that will `exec` the argument-free `cdx` (D-0001-24/25) — plus the
 * `payload/` it carries. Node CJS, zero third-party dependencies
 * (D-0001-20 binds the whole repo, not only `injector/`), and runs on any
 * platform: a `.app` is just a directory tree with a defined layout, and
 * nothing below requires macOS APIs. What genuinely DOES require macOS —
 * ad-hoc codesigning and building the final `.dmg` — is deliberately NOT
 * here; see `build-dmg.sh`, which is a macOS-only script this tool hands
 * off to.
 *
 * THE EXECUTABLE-BIT DECISION (read before touching this file).
 * `Contents/MacOS/Codexterity` MUST be mode 0755 or the bundle will not
 * launch from Finder — silently, with no dialog, because Finder simply
 * will not attempt to execute a non-executable file via LaunchServices.
 * Windows has no POSIX permission bits, so nothing this script does on
 * this development machine can put a real, transportable exec bit on that
 * file: `fs.chmodSync` is called below anyway (harmless on Windows, and a
 * real, correct bit if this script is ever run on a POSIX host), but it is
 * NOT the guarantee. The guarantee is `install.sh`'s `chmod +x`, run
 * immediately after the `.app` is copied onto the target Mac, regardless
 * of how the bundle travelled there (zip, tarball, cloud sync, USB) —
 * because D-0001-20 already found, the hard way, that a zip's external
 * attributes silently misencode exactly this bit (a Unix 0755's
 * group-execute bit sits in the same position a DOS zip reads as the
 * directory flag), and this script does not even control what archiver, if
 * any, carries the tree across. Fixing it unconditionally at install time
 * is the only place in the pipeline that cannot be defeated by a lossy
 * transport. Do not remove `install.sh`'s chmod on the theory that this
 * script's chmodSync already covers it — it does not, on the platform this
 * script actually runs on.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const APP_BUNDLE_NAME = 'Codexterity.app';
// CFBundleExecutable MUST equal this exactly — see buildInfoPlist() below,
// which reads this same constant rather than a second literal, and the
// test that reads the emitted plist back and compares it against the
// actual file `fs.readdirSync` finds in Contents/MacOS/.
const EXECUTABLE_NAME = 'Codexterity';
// Referenced by a single constant everywhere an icon filename is needed,
// per the milestone brief ("keep the filename a single constant") — the
// icon's design is a separate, pending owner decision from a render, and
// the bundle must launch with the system default icon if the file never
// materialises (degrade, never fail).
const ICON_FILE_NAME = 'Codexterity.icns';
const BUNDLE_IDENTIFIER = 'com.codexterity.wrapper';

// Every key Info.plist must carry. Exported so the test asserts against
// this exact list rather than a second, hand-copied one.
const REQUIRED_PLIST_KEYS = [
  'CFBundleIdentifier',
  'CFBundleName',
  'CFBundleDisplayName',
  'CFBundleExecutable',
  'CFBundleIconFile',
  'CFBundlePackageType',
  'CFBundleSignature',
  'CFBundleShortVersionString',
  'CFBundleVersion',
  'CFBundleInfoDictionaryVersion',
  'LSMinimumSystemVersion',
  'NSHighResolutionCapable',
];

function escapePlistText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Build Info.plist as real XML — a fixed key order, one <string> or
 * boolean-tag value per key, nothing hand-waved.
 */
function buildInfoPlist({ version, bundleId, execName, iconFile }) {
  const v = escapePlistText(version);
  const rows = [
    ['CFBundleIdentifier', 'string', escapePlistText(bundleId)],
    ['CFBundleName', 'string', 'Codexterity'],
    ['CFBundleDisplayName', 'string', 'Codexterity'],
    ['CFBundleExecutable', 'string', escapePlistText(execName)],
    ['CFBundleIconFile', 'string', escapePlistText(iconFile)],
    ['CFBundlePackageType', 'string', 'APPL'],
    ['CFBundleSignature', 'string', '????'],
    ['CFBundleShortVersionString', 'string', v],
    ['CFBundleVersion', 'string', v],
    ['CFBundleInfoDictionaryVersion', 'string', '6.0'],
    ['LSMinimumSystemVersion', 'string', '11.0'],
    ['NSHighResolutionCapable', 'bool', true],
  ];

  const body = rows
    .map(([key, type, value]) => {
      if (type === 'bool') {
        return `\t<key>${key}</key>\n\t<${value ? 'true' : 'false'}/>`;
      }
      return `\t<key>${key}</key>\n\t<string>${value}</string>`;
    })
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0">\n' +
    '<dict>\n' +
    body +
    '\n</dict>\n' +
    '</plist>\n'
  );
}

/**
 * The launch shim installed at Contents/MacOS/<EXECUTABLE_NAME>. It:
 *   - resolves its OWN bundle path from $0/BASH_SOURCE, never a hardcoded
 *     one (a wrapper copied to ~/Applications instead of /Applications
 *     must still find its own payload);
 *   - sets CDX_DEBUG_LOG_PATH under ~/Library/Logs/Codexterity/ when the
 *     caller has not already set one, so a double-clicked launch still
 *     leaves the one artifact docs/ENGINEERING.md treats as ground truth
 *     for whether injection attached;
 *   - execs the ARGUMENT-FREE `cdx` (D-0001-24/25's `cdx launch` contract)
 *     — never names a theme per launch, because a Finder double-click,
 *     like a Windows shortcut, is a fixed command line.
 * It does not itself verify Node is installed beyond what a plain `exec
 * node` already does by failing loudly (command not found) — that check
 * belongs to install.sh, which runs once, ahead of any double-click, and
 * can print a clear message instead of a bare shell error.
 */
function buildShimScript() {
  return `#!/bin/bash
# Codexterity macOS wrapper shim — GENERATED by packaging/macos/build-macos-package.js.
# Do not edit by hand; edit the generator instead.
set -euo pipefail

# Resolve the bundle's OWN location. Never hardcode /Applications: the user
# may have installed into ~/Applications instead (install.sh picks whichever
# is writable without sudo), and this file must work either way.
MACOS_DIR="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
CONTENTS_DIR="$(cd -- "\${MACOS_DIR}/.." && pwd)"
PAYLOAD_DIR="\${CONTENTS_DIR}/Resources/payload"

if [ -z "\${CDX_DEBUG_LOG_PATH:-}" ]; then
    LOG_DIR="\${HOME}/Library/Logs/Codexterity"
    mkdir -p "\${LOG_DIR}"
    export CDX_DEBUG_LOG_PATH="\${LOG_DIR}/codexterity-$(date +%Y%m%d-%H%M%S).log"
fi

if ! command -v node >/dev/null 2>&1; then
    MSG="Codexterity needs Node.js (>=22) installed, and could not find it on PATH. Install it from https://nodejs.org/ and try again."
    echo "$MSG" >&2
    # A double-clicked .app has no visible terminal, so surface this as a
    # dialog too rather than leaving the only trace in a log nobody opened.
    osascript -e "display dialog \\"$MSG\\" with title \\"Codexterity\\" buttons {\\"OK\\"} default button 1" >/dev/null 2>&1 || true
    exit 1
fi

# The argument-free entry point (D-0001-24/25): reads the active theme from
# ~/.codexterity/state.json and launches through launcher/macos/launch.sh.
exec node "\${PAYLOAD_DIR}/injector/cli.js"
`;
}

/**
 * @param {object} [options]
 * @param {string} [options.repoRoot] - defaults to the real repo root.
 * @param {string} [options.outDir] - defaults to <repoRoot>/dist/Codexterity-macOS.
 * @param {string} [options.themePackagePath] - the `.ccskin` to embed in the
 *   payload. Defaults to <repoRoot>/dist/captains-cabin.ccskin — the real
 *   package `tools/pack-ccskin.js` produces. Overridable so tests can point
 *   at a small fixture instead of depending on the real 681,124-byte theme.
 * @param {string} [options.version] - CFBundle*Version. Defaults to the
 *   version in the repo's own package.json.
 * @returns {{ outDir: string, appDir: string, executablePath: string,
 *   plistPath: string, manifest: { relativePath: string, bytes: number }[],
 *   chmod: { path: string, requestedMode: number, platform: string,
 *   resultingMode: number|null } }}
 */
function buildMacosPackage(options = {}) {
  const repoRoot = options.repoRoot || REPO_ROOT;
  const outDir = options.outDir || path.join(repoRoot, 'dist', 'Codexterity-macOS');
  const themePackagePath =
    options.themePackagePath || path.join(repoRoot, 'dist', 'captains-cabin.ccskin');

  if (!fs.existsSync(themePackagePath)) {
    throw new Error(
      `build-macos-package: theme package not found at "${themePackagePath}". ` +
        'Run "node tools/pack-ccskin.js" first (this script never rebuilds the theme itself).'
    );
  }

  let version = options.version;
  if (!version) {
    const pkgJsonPath = path.join(repoRoot, 'package.json');
    version = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version;
  }

  // Clean rebuild — this is generated build output (like dist/*.ccskin),
  // never hand-edited, so stale leftovers from a previous run must not
  // survive into a fresh one.
  fs.rmSync(outDir, { recursive: true, force: true });

  const appDir = path.join(outDir, APP_BUNDLE_NAME);
  const contentsDir = path.join(appDir, 'Contents');
  const macosDir = path.join(contentsDir, 'MacOS');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const payloadDir = path.join(resourcesDir, 'payload');

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.mkdirSync(payloadDir, { recursive: true });

  // --- Info.plist ---------------------------------------------------
  const plistPath = path.join(contentsDir, 'Info.plist');
  fs.writeFileSync(
    plistPath,
    buildInfoPlist({
      version,
      bundleId: BUNDLE_IDENTIFIER,
      execName: EXECUTABLE_NAME,
      iconFile: ICON_FILE_NAME,
    }),
    'utf8'
  );

  // --- Contents/MacOS/<EXECUTABLE_NAME> ------------------------------
  const executablePath = path.join(macosDir, EXECUTABLE_NAME);
  fs.writeFileSync(executablePath, buildShimScript(), 'utf8');

  // Best-effort exec bit. See the file-header comment: this is NOT the
  // guarantee (Windows has no real POSIX mode bits to set), but it is
  // correct and load-bearing when this script runs on a POSIX host, and
  // costs nothing to attempt on Windows.
  let resultingMode = null;
  try {
    fs.chmodSync(executablePath, 0o755);
    resultingMode = fs.statSync(executablePath).mode & 0o777;
  } catch (err) {
    // Non-fatal anywhere: install.sh is the real guarantee (see header).
  }

  // --- Resources/payload/ --------------------------------------------
  // Only what resolveThemeSource()/loadTheme() need at runtime — never a
  // wholesale copy of the repo. themes/, tools/, docs/, tests/ and
  // launcher/windows/ are deliberately excluded.
  fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(payloadDir, 'package.json'));
  fs.cpSync(path.join(repoRoot, 'injector'), path.join(payloadDir, 'injector'), { recursive: true });

  const payloadLauncherDir = path.join(payloadDir, 'launcher', 'macos');
  fs.mkdirSync(payloadLauncherDir, { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, 'launcher', 'macos', 'launch.sh'),
    path.join(payloadLauncherDir, 'launch.sh')
  );

  // The payload's dist/ mirrors the repo-root layout EXACTLY — this is
  // what lets `resolveThemeSource()` in injector/cli.js find the theme with
  // zero code change: `REPO_ROOT = path.resolve(__dirname, '..')` computed
  // from payload/injector/cli.js resolves to `payload/`, and
  // `resolveThemeSource` looks under `<repoRoot>/dist/<id>.ccskin` first.
  const payloadDistDir = path.join(payloadDir, 'dist');
  fs.mkdirSync(payloadDistDir, { recursive: true });
  const payloadThemePath = path.join(payloadDistDir, path.basename(themePackagePath));
  fs.copyFileSync(themePackagePath, payloadThemePath);

  // --- Manifest of what was written, with byte sizes -----------------
  const manifest = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        manifest.push({
          relativePath: path.relative(outDir, full).split(path.sep).join('/'),
          bytes: fs.statSync(full).size,
        });
      }
    }
  })(outDir);
  manifest.sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));

  return {
    outDir,
    appDir,
    executablePath,
    plistPath,
    manifest,
    chmod: {
      path: executablePath,
      requestedMode: 0o755,
      platform: process.platform,
      resultingMode,
    },
  };
}

module.exports = {
  buildMacosPackage,
  buildInfoPlist,
  buildShimScript,
  APP_BUNDLE_NAME,
  EXECUTABLE_NAME,
  ICON_FILE_NAME,
  BUNDLE_IDENTIFIER,
  REQUIRED_PLIST_KEYS,
};

if (require.main === module) {
  const result = buildMacosPackage();
  console.log(`Built: ${result.appDir}`);
  console.log(
    `Executable bit: requested ${result.chmod.requestedMode.toString(8)} on ${process.platform} -> ` +
      `${result.chmod.resultingMode !== null ? result.chmod.resultingMode.toString(8) : '(not settable on this platform)'}` +
      ' -- install.sh performs the guaranteed chmod at install time regardless.'
  );
  let totalBytes = 0;
  for (const entry of result.manifest) {
    totalBytes += entry.bytes;
    console.log(`  ${entry.relativePath} (${entry.bytes} bytes)`);
  }
  console.log(`Total: ${result.manifest.length} file(s), ${totalBytes} bytes`);
}
