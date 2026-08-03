'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  buildMacosPackage,
  buildInfoPlist,
  APP_BUNDLE_NAME,
  EXECUTABLE_NAME,
  ICON_FILE_NAME,
  BUNDLE_IDENTIFIER,
  REQUIRED_PLIST_KEYS,
} = require(path.join('..', '..', 'packaging', 'macos', 'build-macos-package.js'));

const { installedPaths, candidateAppPaths, APP_NAME } = require(
  path.join('..', '..', 'packaging', 'macos', 'install-manifest.js')
);

const { resolveThemeSource } = require(path.join('..', '..', 'injector', 'cli.js'));

const PACKAGING_DIR = path.join(__dirname, '..', '..', 'packaging', 'macos');

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Build a minimal, fast fixture repo (package.json, injector/, launcher/
 * macos/launch.sh, a fake .ccskin) so the suite never depends on the real
 * 681,124-byte Captain's Cabin package or takes on the cost of packing it.
 * The REAL package is exercised once, separately, in the "real repo"
 * section below, so both are covered.
 */
function fixtureRepo() {
  const repoRoot = tempDir('cdx-macos-repo-');
  fs.writeFileSync(path.join(repoRoot, 'package.json'), JSON.stringify({ name: 'codexterity-fixture', version: '9.9.9' }));

  const injectorDir = path.join(repoRoot, 'injector');
  fs.mkdirSync(path.join(injectorDir, 'core'), { recursive: true });
  fs.mkdirSync(path.join(injectorDir, 'theme-loader'), { recursive: true });
  fs.writeFileSync(path.join(injectorDir, 'cli.js'), '// fixture cli.js\n');
  fs.writeFileSync(path.join(injectorDir, 'core', 'preload.js'), '// fixture preload.js\n');
  fs.writeFileSync(path.join(injectorDir, 'theme-loader', 'index.js'), '// fixture loader\n');

  const launcherDir = path.join(repoRoot, 'launcher', 'macos');
  fs.mkdirSync(launcherDir, { recursive: true });
  fs.writeFileSync(path.join(launcherDir, 'launch.sh'), '#!/bin/bash\n# fixture launch.sh\n');

  const distDir = path.join(repoRoot, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  const themePackagePath = path.join(distDir, 'captains-cabin.ccskin');
  // Contents do not need to be a real zip -- build-macos-package.js only
  // ever COPIES this file by path; nothing in this suite loads it as a
  // theme. Real-zip validity is covered by tests/theme-loader/*.
  fs.writeFileSync(themePackagePath, Buffer.from('not a real zip, just needs to exist and be copyable'));

  return { repoRoot, themePackagePath };
}

// ---------------------------------------------------------------------
// Info.plist — well-formed XML, every required key, CFBundleExecutable
// actually matches the emitted file.
// ---------------------------------------------------------------------

/**
 * A small, real structural check on THIS build's plist output -- not a
 * general-purpose XML parser (no dependency exists for one here, and none
 * is needed: plist syntax has no attributes-with-nested-quotes cases this
 * generator produces beyond the one stripped below). Verifies every
 * opening tag has a matching, properly nested closing tag.
 */
function assertWellFormedXml(xml) {
  // Strip the one attribute this generator ever emits (<plist version="1.0">)
  // so the tag-balance scanner below does not have to understand attributes.
  const withoutAttrs = xml.replace(/(<[a-zA-Z][\w.-]*)\s+[^<>]*?(\/?>)/g, '$1$2');
  const tagPattern = /<\/?([a-zA-Z][\w.-]*)\s*\/?>/g;
  const stack = [];
  let match;
  while ((match = tagPattern.exec(withoutAttrs)) !== null) {
    const [full, name] = match;
    if (full.startsWith('</')) {
      const top = stack.pop();
      assert.equal(top, name, `mismatched closing tag </${name}> in plist XML`);
    } else if (!full.endsWith('/>')) {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `unclosed tag(s) in plist XML: ${stack.join(', ')}`);
}

test('buildInfoPlist() produces well-formed XML with every required key', () => {
  const xml = buildInfoPlist({
    version: '1.2.3',
    bundleId: 'com.example.test',
    execName: 'Codexterity',
    iconFile: 'Codexterity.icns',
  });

  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<!DOCTYPE plist PUBLIC/);
  assertWellFormedXml(xml);

  for (const key of REQUIRED_PLIST_KEYS) {
    assert.match(xml, new RegExp(`<key>${key}</key>`), `Info.plist is missing required key "${key}"`);
  }
});

test('buildInfoPlist() escapes XML-significant characters in text values', () => {
  const xml = buildInfoPlist({
    version: '1.0.0',
    bundleId: 'com.example.<test>&more',
    execName: 'Codexterity',
    iconFile: 'Codexterity.icns',
  });
  assertWellFormedXml(xml);
  assert.doesNotMatch(xml, /<test>&more/);
  assert.match(xml, /com\.example\.&lt;test&gt;&amp;more/);
});

// ---------------------------------------------------------------------
// buildMacosPackage() — the bundle layout invariant, the payload-is-
// repo-root invariant, and the executable-bit decision.
// ---------------------------------------------------------------------

test('buildMacosPackage() writes the full bundle tree with the expected layout', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');

  const result = buildMacosPackage({ repoRoot, outDir, themePackagePath });

  assert.equal(result.appDir, path.join(outDir, APP_BUNDLE_NAME));
  assert.ok(fs.existsSync(path.join(result.appDir, 'Contents', 'Info.plist')));
  assert.ok(fs.existsSync(path.join(result.appDir, 'Contents', 'MacOS', EXECUTABLE_NAME)));
  assert.ok(fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', 'payload', 'package.json')));
  assert.ok(fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', 'payload', 'injector', 'cli.js')));
  assert.ok(
    fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', 'payload', 'injector', 'theme-loader', 'index.js'))
  );
  assert.ok(
    fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', 'payload', 'launcher', 'macos', 'launch.sh'))
  );
  assert.ok(
    fs.existsSync(
      path.join(result.appDir, 'Contents', 'Resources', 'payload', 'dist', path.basename(themePackagePath))
    )
  );

  // Only what's needed -- not the fixture's docs/tools/tests-equivalents,
  // and not launcher/windows (there is none in this fixture, but the real
  // repo does have one; the real-repo test below asserts it is excluded).
  assert.ok(!fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', 'payload', 'themes')));
});

test('buildMacosPackage() throws a clear error when the theme package is missing, rather than shipping without one', () => {
  const { repoRoot } = fixtureRepo();
  const missingPath = path.join(repoRoot, 'dist', 'does-not-exist.ccskin');
  assert.throws(
    () => buildMacosPackage({ repoRoot, outDir: path.join(repoRoot, 'out'), themePackagePath: missingPath }),
    /theme package not found/
  );
});

test('buildMacosPackage() cleans a stale previous build before writing', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const staleFile = path.join(outDir, 'stale-leftover.txt');
  fs.writeFileSync(staleFile, 'from a previous build');

  buildMacosPackage({ repoRoot, outDir, themePackagePath });

  assert.equal(fs.existsSync(staleFile), false);
});

test('CFBundleExecutable in the emitted Info.plist matches the ACTUAL file written to Contents/MacOS/', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');
  const result = buildMacosPackage({ repoRoot, outDir, themePackagePath });

  const macosDir = path.join(result.appDir, 'Contents', 'MacOS');
  const filesInMacos = fs.readdirSync(macosDir);
  assert.equal(filesInMacos.length, 1, `expected exactly one file in Contents/MacOS, found: ${filesInMacos.join(', ')}`);
  const actualExecutableName = filesInMacos[0];

  const plistText = fs.readFileSync(result.plistPath, 'utf8');
  const match = plistText.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
  assert.ok(match, 'Info.plist does not declare CFBundleExecutable as a <string>');
  assert.equal(match[1], actualExecutableName, 'CFBundleExecutable does not match the file actually on disk -- this is the exact silent-non-launch trap');
  assert.equal(actualExecutableName, EXECUTABLE_NAME);
});

test('the icon referenced in Info.plist uses the single ICON_FILE_NAME constant', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');
  const result = buildMacosPackage({ repoRoot, outDir, themePackagePath });
  const plistText = fs.readFileSync(result.plistPath, 'utf8');
  assert.match(plistText, new RegExp(`<key>CFBundleIconFile</key>\\s*<string>${ICON_FILE_NAME}</string>`));
  // Not required to exist on disk -- the app must still launch with the
  // system default icon if it's absent (degrade, never fail).
  assert.equal(fs.existsSync(path.join(result.appDir, 'Contents', 'Resources', ICON_FILE_NAME)), false);
});

test('the bundle identifier does not collide with the OpenAI Codex identifier family', () => {
  assert.doesNotMatch(BUNDLE_IDENTIFIER, /^com\.openai\.codex/);
});

// ---------------------------------------------------------------------
// The payload/-is-repo-root invariant: resolveThemeSource() (from
// injector/cli.js, UNMODIFIED) must find the packaged theme inside the
// payload with ZERO code change, exactly as it does against the real repo
// root. This is the concrete proof the milestone brief asks for.
// ---------------------------------------------------------------------

test('resolveThemeSource() finds the packaged theme inside payload/ with no code change', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');
  const result = buildMacosPackage({ repoRoot, outDir, themePackagePath });

  const payloadDir = path.join(result.appDir, 'Contents', 'Resources', 'payload');
  const resolved = resolveThemeSource('captains-cabin', payloadDir);

  assert.equal(resolved, path.join(payloadDir, 'dist', 'captains-cabin.ccskin'));
  assert.ok(fs.existsSync(resolved));
});

// ---------------------------------------------------------------------
// The executable-mode decision (§1 of the brief): assert it, don't assume
// it. chmodSync is attempted unconditionally; what it actually achieves is
// platform-dependent, and the test asserts BOTH halves rather than only
// the convenient one.
// ---------------------------------------------------------------------

test('buildMacosPackage() attempts chmod 0755 on the shim and reports what it actually achieved', () => {
  const { repoRoot, themePackagePath } = fixtureRepo();
  const outDir = path.join(repoRoot, 'out');
  const result = buildMacosPackage({ repoRoot, outDir, themePackagePath });

  assert.equal(result.chmod.path, result.executablePath);
  assert.equal(result.chmod.requestedMode, 0o755);
  assert.equal(result.chmod.platform, process.platform);

  if (process.platform === 'win32') {
    // Windows has no POSIX exec bit; chmodSync is a no-op with respect to
    // execute permission. This is the exact fact the header comment and
    // install.sh's mandatory chmod +x are built around -- assert it
    // explicitly rather than silently skip the platform where this
    // suite actually runs today.
    assert.notEqual(result.chmod.resultingMode & 0o111, 0o111, 'unexpectedly observed a real exec bit on win32 -- the header comment reasoning needs re-checking');
  } else {
    assert.equal(result.chmod.resultingMode & 0o111, 0o111, 'chmodSync(0o755) did not produce an executable bit on a POSIX platform');
  }
});

test('install.sh performs its OWN chmod +x on the installed shim, independent of the build script', () => {
  const installSh = fs.readFileSync(path.join(PACKAGING_DIR, 'install.sh'), 'utf8');
  assert.match(installSh, /chmod \+x "\$SHIM_PATH"/, 'install.sh must chmod +x the copied shim explicitly -- this is the actual cross-machine guarantee, not the build script\'s best-effort chmodSync');
  // It must do this to the COPY at the install destination, not the
  // original -- i.e. after the cp -R, referencing APP_DEST.
  const cpIndex = installSh.indexOf('cp -R');
  const chmodIndex = installSh.indexOf('chmod +x "$SHIM_PATH"');
  assert.ok(cpIndex !== -1 && chmodIndex !== -1 && cpIndex < chmodIndex, 'install.sh must chmod the installed copy AFTER copying it, not before');
  assert.match(installSh, /SHIM_PATH="\$\{APP_DEST\}/, 'install.sh must chmod the path under APP_DEST (the installed copy), not the source bundle');
});

// ---------------------------------------------------------------------
// Uninstall completeness, derived from install-manifest.js -- the ONE
// shared source -- so this test cannot pass while uninstall.sh and the
// manifest silently drift apart.
// ---------------------------------------------------------------------

test('installedPaths() names the real Codexterity.app bundle name', () => {
  assert.equal(APP_NAME, 'Codexterity.app');
  const home = tempDir('cdx-macos-home-');
  const paths = installedPaths(home);
  assert.equal(paths.appName, APP_NAME);
  assert.deepEqual(paths.appCandidates, candidateAppPaths(home));
  assert.equal(paths.appCandidates.length, 2);
  for (const candidate of paths.appCandidates) {
    assert.ok(candidate.endsWith(APP_NAME));
  }
});

test('installedPaths() derives the state path from injector/cli.js\'s OWN stateFilePath(), not a second literal', () => {
  const { stateFilePath } = require(path.join('..', '..', 'injector', 'cli.js'));
  const home = tempDir('cdx-macos-home-');
  const paths = installedPaths(home);
  assert.equal(paths.stateFile, stateFilePath(home));
  assert.equal(paths.stateDir, path.dirname(stateFilePath(home)));
});

test('uninstall.sh derives every install-manifest.js path via the shared module, not a hardcoded copy', () => {
  const uninstallSh = fs.readFileSync(path.join(PACKAGING_DIR, 'uninstall.sh'), 'utf8');

  assert.match(uninstallSh, /install-manifest\.js/, 'uninstall.sh must invoke install-manifest.js rather than hardcode paths');

  const home = tempDir('cdx-macos-home-');
  const manifest = installedPaths(home);
  const keysToCheck = Object.keys(manifest).filter((key) => key !== 'appName');
  assert.ok(keysToCheck.length > 0);

  for (const key of keysToCheck) {
    assert.ok(
      uninstallSh.includes(`.${key}`),
      `uninstall.sh does not reference install-manifest.js's "${key}" property -- ` +
        'if this key was added to installedPaths() without wiring it into uninstall.sh, that is exactly the drift this test exists to catch'
    );
  }
});

test('uninstall.sh removes the app via rm -rf and checks BOTH candidate locations, not just one', () => {
  const uninstallSh = fs.readFileSync(path.join(PACKAGING_DIR, 'uninstall.sh'), 'utf8');
  assert.match(uninstallSh, /appCandidates/);
  assert.match(uninstallSh, /rm -rf "\$FOUND_APP"/);
});

test('uninstall.sh never references ~/.codex (only ~/.codexterity)', () => {
  const uninstallSh = fs.readFileSync(path.join(PACKAGING_DIR, 'uninstall.sh'), 'utf8');
  // Guard against the one-letter-off collision this whole project's
  // non-destructive boundary (D-0001-3) depends on staying clear of.
  assert.doesNotMatch(uninstallSh, /\$\{?HOME\}?\/\.codex["'/\s)]/, 'uninstall.sh must never construct a path under ~/.codex');
});

test('install.sh never actually invokes sudo (comments and info messages are allowed to say the word)', () => {
  const installSh = fs.readFileSync(path.join(PACKAGING_DIR, 'install.sh'), 'utf8');
  const codeLines = installSh
    .split('\n')
    .filter((line) => !/^\s*#/.test(line)); // drop comment-only lines, not code
  // Only flags "sudo" appearing where a shell would actually try to run it
  // as a command (start of a statement, or after ; & |) -- not inside a
  // quoted info/log message that merely mentions the word.
  assert.ok(
    codeLines.every((line) => !/(^|[;&|]\s*)sudo\s/.test(line)),
    'install.sh must never actually invoke sudo -- D-0001-3 / "no elevation required"'
  );
});

test('build-dmg.sh refuses to run anywhere but Darwin, before touching codesign/hdiutil', () => {
  const buildDmgSh = fs.readFileSync(path.join(PACKAGING_DIR, 'build-dmg.sh'), 'utf8');
  const darwinCheckIndex = buildDmgSh.indexOf('uname -s');
  const codesignIndex = buildDmgSh.indexOf('codesign --force');
  assert.ok(darwinCheckIndex !== -1, 'build-dmg.sh must check uname -s');
  assert.ok(codesignIndex !== -1, 'build-dmg.sh must call codesign --force');
  assert.ok(darwinCheckIndex < codesignIndex, 'the Darwin guard must run before codesign is invoked');
  assert.match(buildDmgSh, /codesign --force --deep --sign - "\$APP_PATH"/, 'must ad-hoc sign the wrapper APP_PATH, never a Codex path');
});

// ---------------------------------------------------------------------
// Against the REAL repo layout (not the fixture) -- proves the real
// injector/ tree and the real launcher/macos/launch.sh copy cleanly, and
// that launcher/windows is excluded. Requires the real
// dist/captains-cabin.ccskin to already exist (built by
// "node tools/pack-ccskin.js"); if it does not, this test explains why it
// skipped rather than failing for an unrelated reason.
// ---------------------------------------------------------------------

test('buildMacosPackage() against the REAL repo excludes launcher/windows and packages the real injector tree', (t) => {
  const REAL_REPO_ROOT = path.join(__dirname, '..', '..');
  const realThemePackage = path.join(REAL_REPO_ROOT, 'dist', 'captains-cabin.ccskin');
  if (!fs.existsSync(realThemePackage)) {
    t.skip('dist/captains-cabin.ccskin does not exist in this checkout -- run "node tools/pack-ccskin.js" first. This is expected on a fresh clone before that build step has run.');
    return;
  }

  const outDir = tempDir('cdx-macos-real-out-');
  const result = buildMacosPackage({ repoRoot: REAL_REPO_ROOT, outDir, themePackagePath: realThemePackage });

  const payloadDir = path.join(result.appDir, 'Contents', 'Resources', 'payload');
  assert.ok(fs.existsSync(path.join(payloadDir, 'injector', 'cli.js')));
  assert.ok(fs.existsSync(path.join(payloadDir, 'injector', 'core', 'inject.js')));
  assert.ok(fs.existsSync(path.join(payloadDir, 'injector', 'theme-loader', 'zip.js')));
  assert.ok(fs.existsSync(path.join(payloadDir, 'launcher', 'macos', 'launch.sh')));
  assert.equal(fs.existsSync(path.join(payloadDir, 'launcher', 'windows')), false, 'the Windows launcher must never ship inside the macOS payload');
  assert.equal(fs.existsSync(path.join(payloadDir, 'themes')), false);
  assert.equal(fs.existsSync(path.join(payloadDir, 'tools')), false);
  assert.equal(fs.existsSync(path.join(payloadDir, 'docs')), false);
  assert.equal(fs.existsSync(path.join(payloadDir, 'tests')), false);

  fs.rmSync(outDir, { recursive: true, force: true });
});
