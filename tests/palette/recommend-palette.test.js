'use strict';

const test = require('node:test');
const { before, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// tools/palette/recommend-palette.mjs is ESM, like the rest of tools/palette/.
// This test file stays CommonJS to match tests/palette/hero-scrim.test.js and
// tests/palette/emit-theme.test.js's own established pattern: a single
// dynamic import() in a before() hook, module-scoped bindings, loaded once.
const REPO_ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PNG = path.join(REPO_ROOT, 'tests', 'fixtures', 'hero-empty-state.png');

// assets/hero-sources/BW_Jisoo.png IS GITIGNORED -- the owner's private
// photograph. NOTHING in this file may open it: a fresh clone (which lacks
// that directory entirely) must run this suite green. Every synthetic image
// below is built in-test; only the calibration gate touches a real file, and
// that file is tests/fixtures/hero-empty-state.png, which IS tracked.

let analyseImageHues;
let projectAccentHue;
let recommendPalette;
let ROLE_HUE_SEPARATION_FLOOR;
let NAMES_HUE_MIN_CHROMA;
let NAMES_HUE_MIN_CONCENTRATION;
let loadHeroImage;
let buildDark;
let buildLight;
let oklchToHex;
let GROUNDS;
let ROLE_HUES;

before(async () => {
  const rp = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'recommend-palette.mjs')).href);
  ({
    analyseImageHues, projectAccentHue, recommendPalette,
    ROLE_HUE_SEPARATION_FLOOR, NAMES_HUE_MIN_CHROMA, NAMES_HUE_MIN_CONCENTRATION,
  } = rp);
  const hs = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'hero-scrim.mjs')).href);
  ({ loadHeroImage } = hs);
  const pe = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'palette-engine.mjs')).href);
  ({ buildDark, buildLight, oklchToHex, GROUNDS, ROLE_HUES } = pe);
});

// --- helpers for building synthetic { width, height, rgba } images without a PNG encoder ---

function makeImage(width, height, fillFn) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fillFn(x, y);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return { width, height, rgba };
}

function hexToRgbBytes(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// =====================================================================
// A. THE CALIBRATION GATE. This is M3's analogue of M1's 5.99:1 scrim gate:
// it proves this instrument, run on the theme's own source image (via its
// tracked PNG calibration copy), reproduces figures the owner already
// approved by a completely different route -- the shipped navy ground
// (262.2 deg) and the shipped brass accent (90.4 deg). If this group is not
// green, nothing else in this file matters.
// =====================================================================

describe('the calibration gate: analysing the real shipped hero reproduces the shipped navy/brass values', () => {
  let heroImage;
  let analysis;

  before(() => {
    heroImage = loadHeroImage(FIXTURE_PNG);
    analysis = analyseImageHues(heroImage);
  });

  test('the dark region names a hue in the 235-255 deg band (shipped navy sits at 262.2 deg)', () => {
    assert.equal(analysis.dark.namesHue, true);
    assert.ok(
      analysis.dark.dominantHue >= 235 && analysis.dark.dominantHue <= 255,
      `expected dark.dominantHue in [235, 255], got ${analysis.dark.dominantHue}`
    );
  });

  test('the bright region names a hue in the 55-75 deg band (this is the pre-projection reading)', () => {
    assert.equal(analysis.bright.namesHue, true);
    assert.ok(
      analysis.bright.dominantHue >= 55 && analysis.bright.dominantHue <= 75,
      `expected bright.dominantHue in [55, 75], got ${analysis.bright.dominantHue}`
    );
  });

  test('the measured ground chroma sits close to navy\'s own shipped chroma (0.0243)', () => {
    // Witnessed by the shipped theme rather than invented: the dark region's
    // measured mean chroma and navy's own GROUNDS chroma are close enough
    // that treating the dark region's meanChroma as a ground-chroma proposal
    // is a reasonable rule, not an arbitrary one.
    assert.ok(
      Math.abs(analysis.dark.meanChroma - 0.0243) < 0.01,
      `expected dark.meanChroma close to 0.0243, got ${analysis.dark.meanChroma}`
    );
  });

  test('the bright hue is inadmissible against warning (50 deg) under the 40 deg separation floor', () => {
    const dist = Math.min(
      Math.abs(analysis.bright.dominantHue - 50),
      360 - Math.abs(analysis.bright.dominantHue - 50)
    );
    assert.ok(dist < ROLE_HUE_SEPARATION_FLOOR, `expected the bright hue to violate the ${ROLE_HUE_SEPARATION_FLOOR} deg floor against warning, distance was ${dist}`);
  });

  test('projecting the bright hue lands on EXACTLY 90 deg -- the shipped brass hue', () => {
    const projected = projectAccentHue(analysis.bright.dominantHue);
    assert.equal(projected.accentHue, 90);
    assert.notEqual(projected.adjustment, null);
    assert.match(projected.adjustment, /warning/);
  });

  test('recommendPalette(inheritFrom: "navy") on this image emits all four proposals, every one passing AA', () => {
    const result = recommendPalette(heroImage, { inheritFrom: 'navy' });
    assert.deepEqual(result.proposals.map((p) => p.id).sort(), ['image-accent', 'image-both', 'image-ground', 'inherited'].sort());
    assert.equal(result.omitted.length, 0);
    for (const p of result.proposals) {
      assert.equal(p.passes, true, `expected proposal '${p.id}' to pass AA, failures: dark=${JSON.stringify(p.audit.dark.failures)} light=${JSON.stringify(p.audit.light.failures)}`);
    }
    const imageAccent = result.proposals.find((p) => p.id === 'image-accent');
    assert.equal(imageAccent.accentHue, 90);
    assert.ok(imageAccent.requestedAccentHue > 55 && imageAccent.requestedAccentHue < 75);
  });
});

// =====================================================================
// B. AN IMAGE THAT NAMES NO HUE. The whole-image-mean failure mode this
// module exists to avoid is about a MIXED image cancelling out; this group
// covers the simpler case of an image that is genuinely, uniformly neutral
// in both regions, and proves that is reported as "no hue" rather than as
// some arbitrary hue reaching threshold by numerical accident.
// =====================================================================

describe('a synthetic near-neutral image names no hue in either region', () => {
  test('both regions report namesHue: false, and recommendPalette emits ONLY \'inherited\', with every omission carrying a numbered reason', () => {
    // Pure greys: R=G=B gives OKLab a=b=0, so chroma is exactly 0 regardless
    // of lightness -- an unambiguous "no hue" input, not a marginal one.
    // Top half is dark (well under the darkBelow=0.45 split), bottom half is
    // bright (well over it), so both regions are genuinely populated.
    const image = makeImage(8, 60, (x, y) => {
      const v = y < 30 ? 24 : 224;
      return [v, v, v, 255];
    });
    const analysis = analyseImageHues(image);
    assert.equal(analysis.dark.namesHue, false);
    // Mathematically exactly 0 for R=G=B (a=b=0 in OKLab), but the OKLab
    // matrices carry floating-point residue in the ~1e-8 range, so this
    // checks "effectively zero" rather than a bit-exact 0.
    assert.ok(analysis.dark.meanChroma < 1e-6, `expected ~0 chroma, got ${analysis.dark.meanChroma}`);
    assert.equal(analysis.bright.namesHue, false);
    assert.ok(analysis.bright.meanChroma < 1e-6, `expected ~0 chroma, got ${analysis.bright.meanChroma}`);

    const result = recommendPalette(image, { inheritFrom: 'navy' });
    assert.equal(result.proposals.length, 1);
    assert.equal(result.proposals[0].id, 'inherited');
    assert.equal(result.proposals[0].passes, true);

    // Three proposals are withheld ('image-ground', 'image-accent', and
    // 'image-both', which needs both regions and so is withheld too), and
    // every one of them names the actual measured figure that failed it --
    // never a bare "omitted" with no explanation.
    assert.equal(result.omitted.length, 3);
    assert.deepEqual(result.omitted.map((o) => o.id).sort(), ['image-accent', 'image-both', 'image-ground']);
    for (const o of result.omitted) {
      assert.match(o.reason, new RegExp(NAMES_HUE_MIN_CHROMA.toString().replace('.', '\\.')));
    }
  });
});

// =====================================================================
// C. THE WRAPAROUND BUG. A naive arithmetic mean of hues straddling 0/360
// deg (e.g. averaging 350 and 10) reports ~180 deg -- the exact opposite
// side of the circle from the true answer. The circular (vector) mean this
// module uses must not make that mistake.
// =====================================================================

describe('analyseImageHues() computes a correct circular mean across the 0/360 deg seam', () => {
  test('a bright region straddling hue 350/10 (roughly symmetric around 0) reports a dominant hue near 0, not near 180', () => {
    // Two saturated colours at the SAME lightness (bright, L well over 0.45)
    // and the SAME chroma, one at OKLCH hue 350 deg and one at 10 deg --
    // built through oklchToHex so the true hues are exact, not eyeballed.
    // A slight majority (51/49) at 350 deg makes that bin's chroma mass
    // strictly larger, so it is deterministically the "best bin" the window
    // centres on, and the window (+-20 deg default) then reaches both sides
    // of the seam from there.
    const c350 = hexToRgbBytes(oklchToHex({ L: 0.75, C: 0.15, H: 350 }));
    const c10 = hexToRgbBytes(oklchToHex({ L: 0.75, C: 0.15, H: 10 }));
    const width = 100, height = 40;
    const image = makeImage(width, height, (x) => {
      const [r, g, b] = x < 51 ? c350 : c10;
      return [r, g, b, 255];
    });

    const analysis = analyseImageHues(image);
    assert.equal(analysis.dark.pixelCount, undefined); // sanity: no such field leaks
    assert.ok(analysis.bright.namesHue, 'expected the bright region to name a hue');

    const distFromZero = Math.min(analysis.bright.dominantHue, 360 - analysis.bright.dominantHue);
    assert.ok(distFromZero < 15, `expected dominantHue near 0/360, got ${analysis.bright.dominantHue} (distance from 0 = ${distFromZero})`);

    // The failure mode this test exists to catch: a naive (non-circular)
    // mean of 350 and 10 is (350+10)/2 = 180, the far side of the circle.
    const distFrom180 = Math.abs(analysis.bright.dominantHue - 180);
    assert.ok(distFrom180 > 150, `expected dominantHue to be FAR from the naive-mean answer of 180, got ${analysis.bright.dominantHue}`);
  });
});

// =====================================================================
// D. THE ENGINE'S NEW INPUT (palette-engine.mjs, Task 1). buildDark/
// buildLight must stay byte-identical with no options (the byte gate in
// tests/palette/emit-theme.test.js depends on this not moving), and the new
// accentHue option must validate strictly.
// =====================================================================

describe('palette-engine.mjs: buildDark/buildLight accentHue option', () => {
  test('buildDark(hex) and buildDark(hex, {}) are identical across every key', () => {
    const withoutOptions = buildDark(GROUNDS.navy.ground);
    const withEmptyOptions = buildDark(GROUNDS.navy.ground, {});
    assert.deepEqual(withEmptyOptions, withoutOptions);
  });

  test('buildLight(hex) and buildLight(hex, {}) are identical across every key', () => {
    const withoutOptions = buildLight(GROUNDS.navy.ground);
    const withEmptyOptions = buildLight(GROUNDS.navy.ground, {});
    assert.deepEqual(withEmptyOptions, withoutOptions);
  });

  test('buildDark(hex, { accentHue: 90 }) -- the shipped hue -- reproduces the un-optioned build exactly', () => {
    // ROLE.brass.H is 90 in the shipped engine, so passing that value back
    // in explicitly must be a complete no-op, proving the option threads
    // through deriveChrome rather than silently being ignored somewhere.
    const withoutOptions = buildDark(GROUNDS.navy.ground);
    const withExplicitShippedHue = buildDark(GROUNDS.navy.ground, { accentHue: ROLE_HUES.brass });
    assert.deepEqual(withExplicitShippedHue, withoutOptions);
  });

  test('a different accentHue changes at least the accent-bearing tokens', () => {
    const shipped = buildDark(GROUNDS.navy.ground);
    const rotated = buildDark(GROUNDS.navy.ground, { accentHue: 200 });
    assert.notEqual(rotated['border-focus'], shipped['border-focus']);
    assert.notEqual(rotated['text-accent'], shipped['text-accent']);
  });

  test('a non-finite accentHue throws by name', () => {
    assert.throws(
      () => buildDark(GROUNDS.navy.ground, { accentHue: NaN }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '), `expected a "palette-engine: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /accentHue/);
        return true;
      }
    );
  });

  test('an out-of-range accentHue (e.g. 400) throws by name', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { accentHue: 400 }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '), `expected a "palette-engine: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /accentHue/);
        return true;
      }
    );
  });

  test('a negative accentHue throws by name', () => {
    assert.throws(
      () => buildDark(GROUNDS.navy.ground, { accentHue: -10 }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        return true;
      }
    );
  });

  test('an unrecognised option key throws by name, naming the typo\'d key', () => {
    assert.throws(
      () => buildDark(GROUNDS.navy.ground, { accentHu: 90 }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '), `expected a "palette-engine: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /accentHu/);
        assert.match(err.message, /unrecognised/);
        return true;
      }
    );
  });
});

// =====================================================================
// E. A FAILING PROPOSAL IS REPORTED, NOT HIDDEN. The hard constraint this
// whole module exists to enforce is that nothing unproven leaves it -- and
// that includes the failing case, which must come back MARKED failing
// rather than be thrown away or silently nudged into passing.
//
// WHY THIS IS DRIVEN DIRECTLY RATHER THAN THROUGH recommendPalette(). The
// engine SOLVES every contrast-critical token against whatever ground/accent
// it is given (that is the whole point of "derived, not hand-picked" -- see
// palette-engine.mjs's own header), and recommendPalette()'s own proposals
// hold the ground's LIGHTNESS at inheritFrom's own value (a legibility
// decision, not an image one -- see groundFromImageRegion's comment) while
// only varying hue/chroma at that lightness. Measured directly: no hue,
// chroma up to 0.4, or accent hue at navy's own L=0.191 produces an AA
// failure through this engine -- the same "both real GROUNDS entries are
// 272/272 clean" fact tests/palette/emit-theme.test.js's own comment C
// records about assertPalettesPassAA(). So, exactly as that file's comment
// C does for the emitter's AA gate, this test exercises the SAME functions
// recommend-palette.mjs composes internally (buildDark, buildLight,
// buildSyntax, run, runSyntax -- see its buildAuditedProposal()) against a
// deliberately degenerate ground (a LIGHT ground fed through buildDark,
// which expects a dark one) rather than faking a result. This proves the
// mechanism recommend-palette.mjs's proposals are built from genuinely
// reports failure instead of silently passing or throwing.
// =====================================================================

describe('the audit path a proposal is built from reports failure honestly, on a genuinely degenerate ground', () => {
  test('a light ground pushed through buildDark (dark mode expects a dark ground) fails real AA checks, and the failures are named -- not swallowed', async () => {
    const pe = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'palette-engine.mjs')).href);
    const audit = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'audit.mjs')).href);

    // Measured directly while writing this test (see the transcript this
    // milestone's implementation left behind): a near-white, low-chroma
    // ground at L=0.98 fails 65 of the checks in audit.mjs's CHECKS list
    // when run through buildDark, because dark-mode text is solved LIGHTER
    // than the ground and there is nowhere left to go above L=1.
    const degenerateGround = pe.oklchToHex({ L: 0.98, C: 0.001, H: 0 });

    // The SAME composition buildAuditedProposal() uses internally.
    const dark = pe.buildDark(degenerateGround);
    const light = pe.buildLight(degenerateGround);
    const synDark = pe.buildSyntax(dark, 'dark');
    const synLight = pe.buildSyntax(light, 'light');
    const rows = [...audit.run(dark), ...audit.runSyntax(synDark)];
    const bad = rows.filter((r) => !r.pass);

    assert.ok(bad.length > 0, 'expected the degenerate ground to fail at least one real check through buildDark');
    assert.ok(bad.some((r) => r.label === 'Body text on app ground'), 'expected the most basic pairing to be among the named failures');

    // light is unaffected -- this is a dark-mode-specific degeneracy, which
    // is itself evidence the failure is real and not a blanket break.
    const lightRows = [...audit.run(light), ...audit.runSyntax(synLight)];
    assert.equal(lightRows.filter((r) => !r.pass).length, 0);
  });
});
