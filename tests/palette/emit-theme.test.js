'use strict';

const test = require('node:test');
const { before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

// tools/palette/emit-theme.mjs is ESM, like the rest of tools/palette/. This
// test file stays CommonJS to match tests/palette/hero-scrim.test.js's own
// established pattern: a single dynamic import() in a before() hook.
const REPO_ROOT = path.join(__dirname, '..', '..');
const REAL_THEME_DIR = path.join(REPO_ROOT, 'themes', 'captains-cabin') + path.sep;

let emitTheme;
let assertPalettesPassAA;
let captainsCabin;

before(async () => {
  const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'emit-theme.mjs')).href);
  ({ emitTheme, assertPalettesPassAA } = mod);
  const recipeMod = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'recipes', 'captains-cabin.mjs')).href);
  captainsCabin = recipeMod.default;
});

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-emit-theme-'));
}

// =====================================================================
// A. THE BYTE GATE, INSTITUTIONALISED. The whole point of this milestone:
// splitting emit-theme.mjs into a generic emitter plus a recipe must not
// move a single byte of what ships. This makes that a permanent, automated
// check instead of a one-off `Get-FileHash` measurement.
// =====================================================================

describe('the byte gate: emitting Captain\'s Cabin into a temp directory reproduces the tracked files exactly', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('theme.css, syntax.json and manifest.json are byte-identical to themes/captains-cabin/', () => {
    const outDir = tmpDir + path.sep;
    emitTheme(captainsCabin, { outDir, assetsDir: REAL_THEME_DIR });

    for (const file of ['theme.css', 'syntax.json', 'manifest.json']) {
      const emitted = fs.readFileSync(path.join(tmpDir, file));
      const tracked = fs.readFileSync(path.join(REAL_THEME_DIR, file));
      assert.ok(
        emitted.equals(tracked),
        `${file}: emitted output (${emitted.length} bytes) differs from the tracked file (${tracked.length} bytes)`
      );
    }
  });
});

// =====================================================================
// B. A STALE PROBE FAILS THE BUILD, AND NOTHING REACHES DISK. D-0001-21:
// the landmark probe assertion is a cross-file contract between a recipe
// and this emitter, and it must run before any file is written.
// =====================================================================

describe('a landmark whose probe names a rule not in the emitted CSS fails the build and writes nothing', () => {
  test('throws naming the landmark, and the output directory stays empty', () => {
    const tmpDir = makeTempDir();
    try {
      const staleRecipe = {
        ...captainsCabin,
        landmarks: [
          ...captainsCabin.landmarks.filter((l) => l.name !== 'sidebar-panel'),
          { ...captainsCabin.landmarks.find((l) => l.name === 'sidebar-panel'), probe: '.this-rule-does-not-exist-in-the-css' },
        ],
      };
      const outDir = tmpDir + path.sep;
      assert.throws(
        () => emitTheme(staleRecipe, { outDir, assetsDir: REAL_THEME_DIR }),
        (err) => {
          assert.match(err.message, /sidebar-panel/);
          assert.match(err.message, /this-rule-does-not-exist-in-the-css/);
          return true;
        }
      );
      assert.deepEqual(fs.readdirSync(tmpDir), [], 'expected the output directory to still be empty after a failed build');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// C. THE BUILD-TIME AA REFUSAL FIRES FOR REAL. assertPalettesPassAA() is
// EXPORTED from emit-theme.mjs specifically so it can be exercised directly
// against a synthetic failing palette without touching palette-engine.mjs
// (both real GROUNDS entries are 272/272 clean per audit.mjs, so no real
// recipe can fail this end-to-end). This is the SAME function emitTheme()
// calls, not a copy — a Proxy that returns one identical hex for every
// token key makes every fg/bg pair ratio() computes come out 1:1, which
// fails every check in audit.mjs's CHECKS list and every syntax role.
//
// Together with test B (a stale landmark probe leaves the output directory
// empty), this pair establishes the all-or-nothing property end to end:
// B proves a gate failing anywhere leaves nothing on disk, and this test
// proves the AA gate itself genuinely fires rather than being a check that
// happens to pass on every recipe anyone has written so far. Since all
// three files are written at the single call site after every gate in
// emitTheme() (see its own "nothing above this line has touched disk"
// comment), a synthetic recipe is not needed to extend B's guarantee to
// this gate too — but this test's own job is narrower and is named for
// exactly that: it proves the refusal fires and names the failing mode and
// at least one failing check, nothing more.
// =====================================================================

describe('assertPalettesPassAA() — the build-time AA refusal, exercised directly', () => {
  test('a palette where every token resolves to the same hex fails every check and throws, naming the mode and a failing check', () => {
    const FAILING_HEX = '#000000';
    // Any key access returns the same hex, so ratio(p[fg], p[bg]) is 1:1 for
    // every CHECKS entry in audit.mjs, regardless of which keys it reads.
    const failingPalette = new Proxy({}, { get: () => FAILING_HEX });
    const failingSyntax = {
      _surface: FAILING_HEX, variable: FAILING_HEX,
      keyword: FAILING_HEX, string: FAILING_HEX, function: FAILING_HEX,
      number: FAILING_HEX, type: FAILING_HEX, operator: FAILING_HEX, comment: FAILING_HEX,
    };

    assert.throws(
      () => assertPalettesPassAA([
        ['dark', failingPalette, failingSyntax],
        ['light', failingPalette, failingSyntax],
      ]),
      (err) => {
        assert.match(err.message, /^dark mode fails AA:/);
        assert.match(err.message, /Body text on app ground/);
        return true;
      }
    );
  });

  test('emitTheme() itself reports 0 failures for Captain\'s Cabin\'s real dark/light palettes (the SAME assertPalettesPassAA() call, exercised end to end)', () => {
    const tmpDir = makeTempDir();
    try {
      const outDir = tmpDir + path.sep;
      const result = emitTheme(captainsCabin, { outDir, assetsDir: REAL_THEME_DIR });
      assert.equal(result.audit.dark.failed, 0);
      assert.equal(result.audit.light.failed, 0);
      assert.ok(result.audit.dark.checks > 0);
      assert.ok(result.audit.light.checks > 0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// =====================================================================
// D. assets[] NEVER COMES FROM A DIRECTORY LISTING (the property D-0001-21
// exists to protect). themes/captains-cabin/assets/fonts/ holds nine
// .woff2 files; only three should ever reach a manifest.
// =====================================================================

describe('manifest assets[] is derived from the recipe\'s own font/hero lists, never a directory listing', () => {
  let manifest;

  before(() => {
    const tmpDir = makeTempDir();
    try {
      const outDir = tmpDir + path.sep;
      const result = emitTheme(captainsCabin, { outDir, assetsDir: REAL_THEME_DIR });
      manifest = result.manifest;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('assets[] contains exactly the hero plus the three shipped faces and their licences (7 entries)', () => {
    const paths = manifest.assets.map((a) => a.path);
    assert.equal(paths.length, 7);
    assert.deepEqual(paths, [
      'assets/hero-empty-state.webp',
      'assets/fonts/literata-latin-variable.woff2',
      'assets/fonts/Literata-OFL.txt',
      'assets/fonts/fraunces-latin-variable.woff2',
      'assets/fonts/Fraunces-OFL.txt',
      'assets/fonts/monaspace-neon-latin-400.woff2',
      'assets/fonts/Monaspace-OFL.txt',
    ]);
  });

  test('none of the six unused faces (five losing candidates plus superseded Monaspace Xenon) appear', () => {
    const paths = manifest.assets.map((a) => a.path);
    const unused = [
      'assets/fonts/bitter-latin-variable.woff2',
      'assets/fonts/commissioner-latin-variable.woff2',
      'assets/fonts/ibm-plex-sans-latin-variable.woff2',
      'assets/fonts/newsreader-latin-variable.woff2',
      'assets/fonts/work-sans-latin-variable.woff2',
      'assets/fonts/monaspace-xenon-latin-400.woff2',
    ];
    for (const p of unused) {
      assert.ok(!paths.includes(p), `expected ${p} to be absent from manifest assets[]`);
    }
  });
});

// =====================================================================
// E. RECIPE VALIDATION — fails loudly, by name, on an author's typo.
// =====================================================================

describe('validateRecipe (exercised through emitTheme) rejects a malformed recipe by name', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTempDir();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Every case below is expected to throw during validation, before any
  // directory is created under outDir, so one shared tmpDir is safe to
  // reuse across all four — none of them ever writes into it.
  const outDir = () => tmpDir + path.sep;

  test('an unknown ground key is rejected by name', () => {
    const bad = { ...captainsCabin, palette: { ground: 'aubergine' } };
    assert.throws(
      () => emitTheme(bad, { outDir: outDir(), assetsDir: REAL_THEME_DIR }),
      (err) => {
        assert.match(err.message, /recipe invalid/);
        assert.match(err.message, /aubergine/);
        return true;
      }
    );
  });

  test('a missing typography role is rejected by name', () => {
    const bad = { ...captainsCabin, typography: { ...captainsCabin.typography, roles: { ui: captainsCabin.typography.roles.ui, mono: captainsCabin.typography.roles.mono } } };
    assert.throws(
      () => emitTheme(bad, { outDir: outDir(), assetsDir: REAL_THEME_DIR }),
      (err) => {
        assert.match(err.message, /recipe invalid/);
        assert.match(err.message, /display/);
        return true;
      }
    );
  });

  test('an empty landmark probe is rejected by name', () => {
    const bad = {
      ...captainsCabin,
      landmarks: [{ ...captainsCabin.landmarks[0], probe: '' }, ...captainsCabin.landmarks.slice(1)],
    };
    assert.throws(
      () => emitTheme(bad, { outDir: outDir(), assetsDir: REAL_THEME_DIR }),
      (err) => {
        assert.match(err.message, /recipe invalid/);
        assert.match(err.message, /probe/);
        return true;
      }
    );
  });

  test('a recipe id containing a path separator is rejected by name', () => {
    const bad = { ...captainsCabin, id: '../evil' };
    assert.throws(
      () => emitTheme(bad, { outDir: outDir(), assetsDir: REAL_THEME_DIR }),
      (err) => {
        assert.match(err.message, /recipe invalid/);
        assert.match(err.message, /safe directory name/);
        return true;
      }
    );
  });
});
