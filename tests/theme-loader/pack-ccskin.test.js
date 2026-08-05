'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { packTheme } = require(path.join('..', '..', 'tools', 'pack-ccskin.js'));
const { loadTheme, ThemeLoadError, MAX_PACKAGE_BYTES } = require(
  path.join('..', '..', 'injector', 'theme-loader', 'index.js')
);
const { readZip } = require(path.join('..', '..', 'injector', 'theme-loader', 'zip.js'));

const REPO_ROOT = path.join(__dirname, '..', '..');
const CAPTAINS_CABIN_DIR = path.join(REPO_ROOT, 'themes', 'captains-cabin');

function makeTempOutDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codexterity-pack-'));
}

// The milestone's headline check: pack the real shipped theme, then load it
// back both ways (packed .ccskin, and the source directory) and assert the
// loader's contract sees the exact same theme either way.
test('packTheme() round-trips the real captains-cabin theme through loadTheme()', () => {
  const outDir = makeTempOutDir();
  try {
    const result = packTheme(CAPTAINS_CABIN_DIR, { outDir });

    // D-0003-9 — 'eager' on both loads: this test's whole point is to
    // compare actual asset bytes between the two source kinds, which the
    // default lazy mode deliberately does not read.
    const fromCcskin = loadTheme(result.outputPath, { assets: 'eager' });
    const fromDirectory = loadTheme(CAPTAINS_CABIN_DIR, { assets: 'eager' });

    assert.equal(fromCcskin.id, fromDirectory.id);

    // Length first: a diff on the ~476 KB theme.css string is unreadable, and
    // a length mismatch is the more legible failure to see before the full
    // string-equality assertion below.
    assert.equal(fromCcskin.css.length, fromDirectory.css.length);
    assert.equal(fromCcskin.css, fromDirectory.css);

    assert.deepStrictEqual(fromCcskin.syntax, fromDirectory.syntax);

    assert.equal(fromCcskin.assets.size, fromDirectory.assets.size);
    for (const [assetPath, buffer] of fromDirectory.assets) {
      const packedBuffer = fromCcskin.assets.get(assetPath);
      assert.ok(packedBuffer, `packed archive is missing asset "${assetPath}"`);
      assert.ok(packedBuffer.equals(buffer), `asset "${assetPath}" differs between directory load and packed load`);
    }

    assert.equal(fromCcskin.sourceKind, 'ccskin');
    assert.equal(fromDirectory.sourceKind, 'directory');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

// This is the check that catches a stray timestamp: two packs of the same
// theme, into two different output directories, must be byte-identical
// files — not merely "both load to the same theme", which a writer that
// stamped Date.now() would also satisfy.
test('packing the same theme twice produces byte-identical .ccskin files', () => {
  const outDirA = makeTempOutDir();
  const outDirB = makeTempOutDir();
  try {
    const resultA = packTheme(CAPTAINS_CABIN_DIR, { outDir: outDirA });
    const resultB = packTheme(CAPTAINS_CABIN_DIR, { outDir: outDirB });

    const bytesA = fs.readFileSync(resultA.outputPath);
    const bytesB = fs.readFileSync(resultB.outputPath);
    assert.ok(bytesA.equals(bytesB));
  } finally {
    fs.rmSync(outDirA, { recursive: true, force: true });
    fs.rmSync(outDirB, { recursive: true, force: true });
  }
});

test('the package contains exactly the manifest-declared assets, and no undeclared font files', () => {
  const outDir = makeTempOutDir();
  try {
    const result = packTheme(CAPTAINS_CABIN_DIR, { outDir });

    const manifestText = fs.readFileSync(path.join(CAPTAINS_CABIN_DIR, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestText);
    const declaredAssetPaths = new Set(manifest.assets.map((a) => a.path));

    // assetSizes is populated in both modes and is all this assertion needs
    // (the set of paths, not their bytes) -- no need to opt into 'eager'.
    const fromCcskin = loadTheme(result.outputPath);
    const loadedAssetPaths = new Set(fromCcskin.assetSizes.keys());
    assert.deepStrictEqual(loadedAssetPaths, declaredAssetPaths);

    // The negative case: themes/captains-cabin/assets/fonts/ holds more font
    // files on disk than the manifest declares (losing typography
    // candidates, and Monaspace Xenon, superseded per D-0001-7, kept as the
    // record of that decision). Enumerate the real directory and diff it
    // against the manifest's declared set.
    const fontsDir = path.join(CAPTAINS_CABIN_DIR, 'assets', 'fonts');
    const onDiskFontPaths = fs
      .readdirSync(fontsDir)
      .map((name) => `assets/fonts/${name}`);
    const undeclaredFontPaths = onDiskFontPaths.filter((p) => !declaredAssetPaths.has(p));

    // Not vacuous: if someone later deletes the undeclared fixtures, this
    // assertion is what tells you the test stopped testing anything.
    assert.ok(
      undeclaredFontPaths.length > 0,
      'expected themes/captains-cabin/assets/fonts/ to contain at least one font not declared in manifest.json — ' +
        'if this fails, the undeclared-asset fixture files were removed and this test no longer exercises anything'
    );

    // Read the true entry list straight off the raw .ccskin bytes via
    // readZip(), not via loadTheme() — loadTheme() only ever looks up
    // manifest-declared paths, so it would report a stowaway asset as
    // simply absent rather than proving it was never packed.
    const archiveBuffer = fs.readFileSync(result.outputPath);
    // readZip() now returns { files, sizes } (D-0003-9); `sizes` covers
    // every entry regardless of inflate mode, and the default inflate
    // predicate (everything) means `files` does too here -- either would
    // answer this "what's really in the archive" question, `sizes` is used
    // since it is the cheaper of the two.
    const { sizes: archiveEntries } = readZip(archiveBuffer, { maxTotalBytes: MAX_PACKAGE_BYTES });

    // The exact-set assertion, which is what actually closes the hole: the
    // per-font loop below only proves no *font* stowed away, and the
    // declared-assets check above went through loadTheme(), which looks up
    // manifest-declared paths and therefore cannot see an entry of any other
    // name. Comparing the raw entry list against the complete expected set is
    // the only check that a file nobody declared did not ride along.
    const expectedEntryNames = new Set([
      'manifest.json',
      manifest.files.css,
      manifest.files.syntax,
      ...declaredAssetPaths,
    ]);
    assert.deepStrictEqual(new Set(archiveEntries.keys()), expectedEntryNames);

    for (const undeclaredPath of undeclaredFontPaths) {
      assert.equal(
        archiveEntries.has(undeclaredPath),
        false,
        `undeclared font "${undeclaredPath}" was packed into the .ccskin, but the manifest never declared it`
      );
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

// --- packTheme() refuses to build a package from an invalid theme ---

function writeBrokenManifest(dir, overrides = {}) {
  const manifest = Object.assign(
    {
      formatVersion: 1,
      id: 'broken-theme',
      name: 'Broken Theme',
      version: '0.1.0',
      author: 'test',
      license: 'MIT',
      description: 'A fixture theme built to fail packTheme().',
      targetApp: 'openai-codex-desktop',
      targetVersionRange: { min: '26.727', max: '27' },
      verifiedAgainst: '26.727.6591.0',
      files: { css: 'theme.css', syntax: 'syntax.json' },
      landmarks: [],
      assets: [],
    },
    overrides
  );
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

// Packing an invalid theme is not something to discover at install time —
// packTheme() must refuse it at build time, the same way loadTheme() would.
test('packTheme() refuses a theme whose manifest declares a missing files.css', () => {
  const themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexterity-broken-theme-'));
  const outDir = makeTempOutDir();
  try {
    writeBrokenManifest(themeDir);
    // theme.css deliberately not written — files.css names a file that does
    // not exist in the package.
    fs.writeFileSync(path.join(themeDir, 'syntax.json'), '{}');

    assert.throws(() => packTheme(themeDir, { outDir }), (err) => {
      assert.ok(err instanceof ThemeLoadError);
      assert.equal(err.code, 'MANIFEST_INVALID');
      return true;
    });

    const outputPath = path.join(outDir, 'broken-theme.ccskin');
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(themeDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('packTheme() refuses a theme whose CSS fails the safe-CSS scan', () => {
  const themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexterity-broken-theme-'));
  const outDir = makeTempOutDir();
  try {
    writeBrokenManifest(themeDir);
    fs.writeFileSync(path.join(themeDir, 'theme.css'), '@import url("https://example.com/x.css");');
    fs.writeFileSync(path.join(themeDir, 'syntax.json'), '{}');

    assert.throws(() => packTheme(themeDir, { outDir }), (err) => {
      assert.ok(err instanceof ThemeLoadError);
      assert.equal(err.code, 'CSS_UNSAFE');
      return true;
    });

    const outputPath = path.join(outDir, 'broken-theme.ccskin');
    assert.equal(fs.existsSync(outputPath), false);
  } finally {
    fs.rmSync(themeDir, { recursive: true, force: true });
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('packTheme() reports the actual on-disk size, under the package cap', () => {
  const outDir = makeTempOutDir();
  try {
    const result = packTheme(CAPTAINS_CABIN_DIR, { outDir });
    const onDiskSize = fs.statSync(result.outputPath).size;
    assert.equal(result.bytes, onDiskSize);
    assert.ok(result.bytes < MAX_PACKAGE_BYTES);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
