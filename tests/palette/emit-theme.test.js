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

// =====================================================================
// F. THE TWO-MODE HERO, GENERICALLY. Plan 0003 M4 needed the emitter to
// render a hero in BOTH dark and light mode (Deep Navy Portrait's own
// novelty), and the brief for that milestone said "you should need no
// emitter change" -- buildHeroBlock() already maps over recipe.hero.modes.
// This proves that claim against the GENERIC emitter using a synthetic
// recipe and synthetic assets, entirely independent of any specific theme:
// it must NOT reference deep-navy-portrait, BW_Jisoo.png, or
// assets/hero-sources/ anywhere, so a fresh clone lacking that gitignored
// directory still runs this green.
// =====================================================================

describe('a recipe declaring hero.modes = [dark, light] emits one hero rule per mode, generically', () => {
  let tmpAssets;
  let tmpOut;
  let assetsDir;
  let outDir;
  let css;

  before(() => {
    tmpAssets = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-emit-theme-synth-assets-'));
    assetsDir = tmpAssets + path.sep;
    fs.mkdirSync(path.join(tmpAssets, 'assets', 'fonts'), { recursive: true });

    // Synthetic font "files" -- the emitter base64-encodes whatever bytes
    // are on disk without decoding them as fonts, so arbitrary content is
    // sufficient to exercise buildFontFaces() without a real font asset.
    fs.writeFileSync(path.join(tmpAssets, 'assets', 'fonts', 'synthetic-ui.woff2'), Buffer.from('synthetic-ui-face-bytes'));
    fs.writeFileSync(path.join(tmpAssets, 'assets', 'fonts', 'synthetic-mono.woff2'), Buffer.from('synthetic-mono-face-bytes'));
    fs.writeFileSync(path.join(tmpAssets, 'assets', 'fonts', 'synthetic-display.woff2'), Buffer.from('synthetic-display-face-bytes'));
    fs.writeFileSync(path.join(tmpAssets, 'assets', 'fonts', 'Synthetic-OFL.txt'), Buffer.from('synthetic licence text'));

    // A synthetic "hero" -- likewise never decoded as an image by the
    // emitter, only base64-encoded, so arbitrary bytes prove the payload
    // travels through unmodified without needing a real PNG/WebP.
    fs.writeFileSync(path.join(tmpAssets, 'assets', 'hero-synthetic.bin'), Buffer.from('synthetic-hero-image-payload-bytes-0123456789'));

    const syntheticRecipe = {
      id: 'synthetic-two-mode-hero',
      name: 'Synthetic Two-Mode Hero',
      version: '0.0.0',
      author: 'test',
      license: 'MIT',
      description: 'A synthetic recipe for exercising the two-mode hero path in isolation.',
      targetApp: 'openai-codex-desktop',
      targetVersionRange: { min: '26', max: '27' },
      verifiedAgainst: '26.727.6591.0',
      palette: { ground: 'navy' },
      accent: { token: 'background-button-primary', label: 'test accent', name: 'Test' },
      typography: {
        faces: [
          { family: 'Synthetic UI', file: 'synthetic-ui.woff2', licence: 'Synthetic-OFL.txt', extra: '  font-weight: 400;\n  font-style: normal;' },
          { family: 'Synthetic Mono', file: 'synthetic-mono.woff2', licence: 'Synthetic-OFL.txt', extra: '  font-weight: 400;\n  font-style: normal;' },
          { family: 'Synthetic Display', file: 'synthetic-display.woff2', licence: 'Synthetic-OFL.txt', extra: '  font-weight: 400;\n  font-style: normal;' },
        ],
        roles: {
          ui: { stack: "'Synthetic UI', serif", variationSettings: 'normal' },
          mono: { stack: "'Synthetic Mono', monospace", variationSettings: 'normal' },
          display: { stack: "'Synthetic Display', serif", opticalSizing: 'auto', variationSettings: 'normal' },
        },
      },
      shape: {
        note: 'Synthetic shape.',
        radii: { sm: '1px', md: '1px', lg: '1px', xl: '1px', '2xl': '1px', '3xl': '1px', '4xl': '1px', full: '9999px' },
      },
      hero: {
        file: 'assets/hero-synthetic.bin',
        mime: 'application/octet-stream',
        position: 'center',
        modes: ['dark', 'light'],
        scrim: {
          dark: [[0, 0], [0.3, 0.5], [1, 0.5]],
          light: [[0, 0], [0.3, 0.4], [1, 0.4]],
        },
        prose: '/* synthetic hero prose, for the two-mode emitter test */',
      },
      syntax: { minimumContrast: 4.5, note: 'synthetic' },
      voice: {
        title: 'Synthetic Two-Mode Hero',
        titleUnderline: '----------------------',
        blurbLines: () => ['synthetic blurb line one', 'synthetic blurb line two'],
        modeLabels: { dark: 'Dark', light: 'Light' },
        typographyProse: '/* synthetic typography prose */',
      },
      // Codex's own selectors/classes are constant across every recipe
      // (codex-surface.mjs), so Captain's Cabin's landmark list -- unchanged
      // shape, only reused here -- probes rules this synthetic recipe also
      // emits regardless of its own hero/typography content.
      landmarks: captainsCabin.landmarks,
    };

    tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-emit-theme-synth-out-'));
    outDir = tmpOut + path.sep;
    const result = emitTheme(syntheticRecipe, { outDir, assetsDir });
    css = result.css;
  });

  after(() => {
    fs.rmSync(tmpAssets, { recursive: true, force: true });
    fs.rmSync(tmpOut, { recursive: true, force: true });
  });

  test('a hero rule is emitted under BOTH .electron-dark and .electron-light', () => {
    assert.match(css, /\.electron-dark \.\\\[container-name\\:home-main-content\\\]:has\(\.heading-xl\) \{/);
    assert.match(css, /\.electron-light \.\\\[container-name\\:home-main-content\\\]:has\(\.heading-xl\) \{/);
  });

  test("each mode's own scrim stops appear in its own rule, and not the other mode's", () => {
    const darkRuleStart = css.indexOf('.electron-dark .\\[container-name\\:home-main-content\\]:has(.heading-xl) {');
    const lightRuleStart = css.indexOf('.electron-light .\\[container-name\\:home-main-content\\]:has(.heading-xl) {');
    assert.ok(darkRuleStart >= 0 && lightRuleStart >= 0);

    // Rules are emitted dark-then-light (recipe.hero.modes order), so the
    // dark rule's own text is everything between the two rule starts.
    const darkRuleText = css.slice(darkRuleStart, lightRuleStart);
    const lightRuleText = css.slice(lightRuleStart, lightRuleStart + 1000);

    // dark: [[0,0],[0.3,0.5],[1,0.5]] -> 50% alpha at the 30% and 100% stops.
    assert.match(darkRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 50%, transparent\) 30%/);
    assert.match(darkRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 50%, transparent\) 100%/);
    // light's own 40% alpha must NOT appear in the dark rule.
    assert.doesNotMatch(darkRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 40%, transparent\)/);

    // light: [[0,0],[0.3,0.4],[1,0.4]] -> 40% alpha at the 30% and 100% stops.
    assert.match(lightRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 40%, transparent\) 30%/);
    assert.match(lightRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 40%, transparent\) 100%/);
    // dark's own 50% alpha must NOT appear in the light rule.
    assert.doesNotMatch(lightRuleText, /color-mix\(in srgb, var\(--color-background-surface\) 50%, transparent\)/);
  });

  test("the image's base64 payload is identical in both mode rules -- ONE image, two rules", () => {
    const expectedB64 = fs.readFileSync(path.join(tmpAssets, 'assets', 'hero-synthetic.bin')).toString('base64');
    const escaped = expectedB64.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const payloadRegex = new RegExp(`url\\(data:application/octet-stream;base64,${escaped}\\)`, 'g');
    const matches = css.match(payloadRegex) || [];
    assert.equal(matches.length, 2, `expected the same base64 payload to appear in exactly 2 rules (one per mode), found ${matches.length}`);
  });

  test('the recipe fixture itself names no real theme -- guards this test against accidentally depending on deep-navy-portrait or its private hero source', () => {
    assert.ok(!css.includes('BW_Jisoo'));
    assert.ok(!css.includes('deep-navy-portrait'));
    assert.ok(!css.includes('hero-sources'));
  });
});
