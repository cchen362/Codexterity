'use strict';

const test = require('node:test');
const { before, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// tools/palette/directions.mjs is ESM, like the rest of tools/palette/. This
// test file stays CommonJS to match tests/palette/hero-scrim.test.js and
// tests/palette/recommend-palette.test.js's own established pattern: a
// single dynamic import() in a before() hook, module-scoped bindings, loaded
// once.
const REPO_ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PNG = path.join(REPO_ROOT, 'tests', 'fixtures', 'hero-empty-state.png');

// assets/hero-sources/ IS GITIGNORED (the owner's private photographs).
// NOTHING in this file may open anything under it: a fresh clone (which
// lacks that directory entirely) must run this suite green. Every synthetic
// image below is built in-test; the only real file this suite reads is
// tests/fixtures/hero-empty-state.png, which IS tracked, for the calibration
// gate only.

let buildDark;
let buildLight;
let hexToOklch;
let GROUNDS;
let ROLE_HUES;
let DEFAULT_LIGHT_GROUND;
let loadHeroImage;
let AUTHORED_DIRECTIONS;
let DEFAULT_DARK_GROUND_LIGHTNESS;
let buildDirections;
let directionFromImage;
let ROLE_HUE_SEPARATION_FLOOR;

before(async () => {
  const pe = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'palette-engine.mjs')).href);
  ({ buildDark, buildLight, hexToOklch, GROUNDS, ROLE_HUES, DEFAULT_LIGHT_GROUND } = pe);
  const hs = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'hero-scrim.mjs')).href);
  ({ loadHeroImage } = hs);
  const rp = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'recommend-palette.mjs')).href);
  ({ ROLE_HUE_SEPARATION_FLOOR } = rp);
  const dir = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'directions.mjs')).href);
  ({ AUTHORED_DIRECTIONS, DEFAULT_DARK_GROUND_LIGHTNESS, buildDirections, directionFromImage } = dir);
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

// =====================================================================
// A. palette-engine.mjs's new `lightGround` build option (Task 1). The
// byte gate in tests/palette/emit-theme.test.js depends on buildLight(hex)
// and buildLight(hex, {}) staying identical -- proved here directly, plus
// the "explicit default is a complete no-op" proof this milestone's brief
// calls out by name (it is what makes DEFAULT_LIGHT_GROUND worth exporting
// at all: a caller can state it and get exactly what omitting it gives).
// =====================================================================

describe('palette-engine.mjs: the lightGround build option', () => {
  test('buildLight(hex) and buildLight(hex, {}) are identical across every key', () => {
    const withoutOptions = buildLight(GROUNDS.navy.ground);
    const withEmptyOptions = buildLight(GROUNDS.navy.ground, {});
    assert.deepEqual(withEmptyOptions, withoutOptions);
  });

  test('an explicit lightGround equal to DEFAULT_LIGHT_GROUND is a complete no-op', () => {
    // Proves the option actually THREADS THROUGH resolveLightGround rather
    // than being ignored somewhere -- the same discipline the accentHue
    // no-op test in tests/palette/recommend-palette.test.js already applies
    // to buildDark's own accentHue option.
    const withoutOptions = buildLight(GROUNDS.navy.ground);
    const withExplicitDefault = buildLight(GROUNDS.navy.ground, { lightGround: { ...DEFAULT_LIGHT_GROUND } });
    assert.deepEqual(withExplicitDefault, withoutOptions);
  });

  test('a partial lightGround override (hue only) changes surface tokens but the ink hue still tracks the DARK ground, not the light-ground override', () => {
    const shipped = buildLight(GROUNDS.navy.ground);
    const rotated = buildLight(GROUNDS.navy.ground, { lightGround: { H: 30 } });
    assert.notEqual(rotated['background-surface'], shipped['background-surface']);
    // The ink hue is derived from `groundHex` (the DARK ground argument),
    // not from `base` (the light ground) -- see buildLight's own comment on
    // this interaction. groundHex was NOT varied here, only lightGround.H
    // (30, warm red-orange), so text-primary's hue should still sit near
    // navy's own ~262 deg, nowhere near the override's 30 deg.
    //
    // The tolerance below is generous (10 deg, not a fraction of a degree)
    // DELIBERATELY: text-primary's chroma is only 0.040, and at that low a
    // chroma, OKLCH-to-sRGB gamut mapping followed by 8-bit byte rounding
    // (oklchToHex -> hexToOklch round-trips through integer RGB) measurably
    // perturbs the recovered hue -- shipped's own OWN round-trip (no
    // override at all) already lands a couple of degrees off 262.2. The
    // invariant this test actually needs is "ink hue tracks the DARK
    // ground, not the light-ground override", which holds at 10 deg
    // resolution even though it does not hold at 0.01 deg resolution.
    const groundH = hexToOklch(GROUNDS.navy.ground).H;
    const shippedInkH = hexToOklch(shipped['text-primary']).H;
    const rotatedInkH = hexToOklch(rotated['text-primary']).H;
    assert.ok(Math.abs(groundH - shippedInkH) < 10, `expected shipped ink hue near the dark ground's ${groundH}, got ${shippedInkH}`);
    assert.ok(Math.abs(groundH - rotatedInkH) < 10, `expected rotated ink hue STILL near the dark ground's ${groundH} (not the lightGround override's 30), got ${rotatedInkH}`);
    // And, the sharper point: the override's hue (30) must NOT have pulled
    // the ink hue toward it -- rotatedInkH is far closer to groundH than to 30.
    const distToGround = Math.abs(rotatedInkH - groundH);
    const distToOverride = Math.min(Math.abs(rotatedInkH - 30), 360 - Math.abs(rotatedInkH - 30));
    assert.ok(distToGround < distToOverride, `expected rotated ink hue (${rotatedInkH}) closer to the dark ground (${groundH}) than to the lightGround override (30), but distances were ${distToGround} vs ${distToOverride}`);
  });

  test('a non-finite lightGround.L throws by name', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { lightGround: { L: NaN } }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '), `expected a "palette-engine: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /lightGround\.L/);
        return true;
      }
    );
  });

  test('an out-of-range lightGround.C throws by name', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { lightGround: { C: 5 } }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        assert.match(err.message, /lightGround\.C/);
        return true;
      }
    );
  });

  test('an out-of-range lightGround.H throws by name', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { lightGround: { H: 500 } }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        assert.match(err.message, /lightGround\.H/);
        return true;
      }
    );
  });

  test('an unrecognised key inside lightGround throws by name, naming the typo\'d key', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { lightGround: { Lightness: 0.9 } }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        assert.match(err.message, /Lightness/);
        assert.match(err.message, /unrecognised/);
        return true;
      }
    );
  });

  test('a lightGround that is not an object throws by name', () => {
    assert.throws(
      () => buildLight(GROUNDS.navy.ground, { lightGround: 'parchment' }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        assert.match(err.message, /lightGround/);
        return true;
      }
    );
  });

  test('an unrecognised TOP-LEVEL option key still throws by name -- the lightGround addition did not weaken this gate', () => {
    assert.throws(
      () => buildDark(GROUNDS.navy.ground, { accentHu: 90 }),
      (err) => {
        assert.ok(err.message.startsWith('palette-engine: '));
        assert.match(err.message, /accentHu/);
        assert.match(err.message, /unrecognised/);
        return true;
      }
    );
  });

  test('buildDark accepts a lightGround key without throwing (it simply does not consume it), so a caller can pass one options object to both build functions', () => {
    const withoutOptions = buildDark(GROUNDS.navy.ground);
    const withUnusedLightGround = buildDark(GROUNDS.navy.ground, { lightGround: { H: 10 } });
    assert.deepEqual(withUnusedLightGround, withoutOptions);
  });
});

// =====================================================================
// B. THE CATALOGUE'S OWN GATE. Every authored direction must pass AA in
// BOTH modes -- if one cannot, the fix is to the direction, never to the
// audit (same posture as emit-theme.mjs's own build-time refusal).
// =====================================================================

describe('AUTHORED_DIRECTIONS: every catalogue entry passes AA in both modes', () => {
  let result;
  before(() => {
    result = buildDirections({ directions: AUTHORED_DIRECTIONS });
  });

  test('the catalogue is non-trivial: at least four directions, including the shipped control and two bolder ones', () => {
    assert.ok(AUTHORED_DIRECTIONS.length >= 4, `expected at least 4 authored directions, got ${AUTHORED_DIRECTIONS.length}`);
    assert.ok(AUTHORED_DIRECTIONS.some((d) => d.id === 'shipped-navy'), 'expected a shipped-navy control direction');
  });

  test('buildDirections({ directions: AUTHORED_DIRECTIONS }) reports passes: true overall', () => {
    assert.equal(result.passes, true, `expected the whole catalogue to pass; failing ids: ${result.directions.filter((d) => !d.passes).map((d) => d.id).join(', ')}`);
  });

  test('every individual direction record passes, with its failing checks named if it had not', () => {
    for (const d of result.directions) {
      assert.equal(
        d.passes, true,
        `expected direction '${d.id}' to pass AA, failures: dark=${JSON.stringify(d.failures.dark)} light=${JSON.stringify(d.failures.light)}`
      );
      assert.equal(d.failed.dark, 0);
      assert.equal(d.failed.light, 0);
    }
  });

  test('the shipped-navy control reproduces the actually-shipped ground and accent', () => {
    const shipped = result.directions.find((d) => d.id === 'shipped-navy');
    assert.equal(shipped.dark.groundHex, GROUNDS.navy.ground);
    assert.equal(shipped.accentHue, ROLE_HUES.brass);
    assert.equal(shipped.accentAdjustment, null, 'the shipped brass hue must already clear the separation floor with no projection');
  });

  test('the shipped-navy control\'s explicit light field (equal to DEFAULT_LIGHT_GROUND) resolves to parchment, matching the shipped theme', () => {
    const shipped = result.directions.find((d) => d.id === 'shipped-navy');
    const parchmentHex = shipped.light.groundHex;
    // Cross-checked against the engine's own default build (no lightGround
    // override at all) rather than a hardcoded hex, so this test cannot
    // silently drift from palette-engine.mjs's own DEFAULT_LIGHT_GROUND.
    const engineDefault = buildLight(GROUNDS.navy.ground);
    assert.equal(parchmentHex, engineDefault['background-surface']);
  });

  test('the two bolder directions genuinely differ from the control -- not a relabelled navy', () => {
    const shipped = result.directions.find((d) => d.id === 'shipped-navy');
    const ember = result.directions.find((d) => d.id === 'ember-quarterdeck');
    const neon = result.directions.find((d) => d.id === 'neon-fathom');
    assert.ok(ember && neon, 'expected both bolder directions to be present');
    assert.notEqual(ember.dark.groundHex, shipped.dark.groundHex);
    assert.notEqual(neon.dark.groundHex, shipped.dark.groundHex);
    assert.notEqual(ember.accentHue, shipped.accentHue);
    assert.notEqual(neon.accentHue, shipped.accentHue);
  });
});

// =====================================================================
// C. GENERALITY (gate 2 of M3b): this tool must work for an ARBITRARY
// direction set and an ARBITRARY image, with nothing shaped around
// BW_Jisoo.png -- and a fresh clone lacking assets/hero-sources/ must still
// run this whole suite green, which every image in this file being
// synthetic (except the tracked fixture) already proves by construction.
// =====================================================================

describe('generality: an arbitrary, hand-authored direction resolves and audits correctly', () => {
  test('a minimal direction (no groundLightness, no light field, an admissible accentHue) resolves using DEFAULT_DARK_GROUND_LIGHTNESS and DEFAULT_LIGHT_GROUND', () => {
    const custom = {
      id: 'test-direction',
      name: 'Test Direction',
      intent: 'A hand-authored direction with the bare minimum fields, to prove the tool is not special-cased to its own catalogue.',
      dark: { groundHue: 300, groundChroma: 0.06 },
      accentHue: 200,
    };
    const result = buildDirections({ directions: [custom] });
    assert.equal(result.directions.length, 1);
    const [d] = result.directions;
    assert.equal(d.passes, true, `failures: dark=${JSON.stringify(d.failures.dark)} light=${JSON.stringify(d.failures.light)}`);
    assert.equal(d.dark.groundOklch.L, DEFAULT_DARK_GROUND_LIGHTNESS);
    assert.equal(d.dark.groundOklch.H, 300);
    // light was omitted entirely -- must resolve to the same ground
    // DEFAULT_LIGHT_GROUND produces via the engine's own no-op path.
    const engineDefault = buildLight(GROUNDS.navy.ground);
    assert.equal(d.light.groundHex, engineDefault['background-surface']);
  });

  test('an out-of-range field in a hand-authored direction throws by name rather than producing a silently-wrong palette', () => {
    const bad = {
      id: 'bad-direction',
      name: 'Bad Direction',
      intent: 'A direction with an invalid chroma, to prove validation runs on caller-supplied directions too.',
      dark: { groundHue: 10, groundChroma: 99 },
      accentHue: 10,
    };
    assert.throws(
      () => buildDirections({ directions: [bad] }),
      (err) => {
        assert.ok(err.message.startsWith('directions: '), `expected a "directions: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /groundChroma/);
        return true;
      }
    );
  });
});

// =====================================================================
// D. THE 40° FLOOR APPLIES TO EVERY DIRECTION, AUTHORED OR MEASURED
// (D-0003-2 clause c, reused via projectAccentHue -- not re-implemented).
// =====================================================================

describe('the 40 degree accent separation floor governs authored directions exactly like measured ones', () => {
  test('an authored direction whose accentHue lands inside the floor against warning (50 deg) is projected, and both hues are reported', () => {
    const custom = {
      id: 'too-close-to-warning',
      name: 'Too Close To Warning',
      intent: 'An authored accent hue deliberately placed inside the 40 degree floor, to prove authored directions are projected exactly like measured ones.',
      dark: { groundHue: 260, groundChroma: 0.02 },
      accentHue: 60, // 10 deg from warning's 50 deg -- a clear violation
    };
    const result = buildDirections({ directions: [custom] });
    const [d] = result.directions;
    assert.equal(d.requestedAccentHue, 60);
    assert.notEqual(d.accentHue, 60);
    const dist = Math.min(Math.abs(d.accentHue - 50), 360 - Math.abs(d.accentHue - 50));
    assert.ok(dist >= ROLE_HUE_SEPARATION_FLOOR, `expected the projected hue to clear the ${ROLE_HUE_SEPARATION_FLOOR} deg floor, got ${d.accentHue}`);
    assert.ok(d.accentAdjustment, 'expected a non-null adjustment reason');
    assert.match(d.accentAdjustment, /warning/);
    // Still passes AA -- projection, not failure.
    assert.equal(d.passes, true);
  });

  test('an authored direction whose accentHue already clears the floor is returned unchanged, with a null adjustment', () => {
    const custom = {
      id: 'clean-accent',
      name: 'Clean Accent',
      intent: 'An authored accent hue that already clears the 40 degree floor against every semantic role hue.',
      dark: { groundHue: 260, groundChroma: 0.02 },
      accentHue: 300,
    };
    const result = buildDirections({ directions: [custom] });
    const [d] = result.directions;
    assert.equal(d.requestedAccentHue, 300);
    assert.equal(d.accentHue, 300);
    assert.equal(d.accentAdjustment, null);
  });
});

// =====================================================================
// E. directionFromImage(): the calibration gate (M3b's analogue of M1's
// 5.99:1 and M3's 63.4 deg -> 90 deg) and the "no hue" case.
// =====================================================================

describe('directionFromImage()', () => {
  test('a synthetic near-neutral image (pure greys in both regions) returns null -- the monochrome-hero case is not a special case, it is this return value', () => {
    // Pure greys: R=G=B gives OKLab a=b=0, so chroma is exactly ~0 regardless
    // of lightness. Top half dark, bottom half bright, so both regions are
    // genuinely populated and genuinely neutral -- the same construction
    // tests/palette/recommend-palette.test.js's own "names no hue" group uses.
    const image = makeImage(8, 60, (x, y) => {
      const v = y < 30 ? 24 : 224;
      return [v, v, v, 255];
    });
    const direction = directionFromImage(image, { inheritFrom: 'navy' });
    assert.equal(direction, null);
  });

  test('inheritFrom is required -- no default, refusing to guess a ground for an arbitrary image', () => {
    const image = makeImage(4, 4, () => [10, 10, 10, 255]);
    assert.throws(
      () => directionFromImage(image, {}),
      (err) => {
        assert.ok(err.message.startsWith('directions: '));
        assert.match(err.message, /inheritFrom/);
        return true;
      }
    );
  });

  test('the calibration gate: the tracked shipped hero fixture yields a direction whose accent projects to EXACTLY 90 deg, and it passes AA in both modes', () => {
    const heroImage = loadHeroImage(FIXTURE_PNG);
    const direction = directionFromImage(heroImage, { inheritFrom: 'navy' });
    assert.notEqual(direction, null, 'expected the shipped hero to name a hue in at least one region');
    assert.equal(direction.id, 'from-image');
    // The RAW reading is unprojected here (projection happens once, inside
    // resolveDirection() via buildDirections()) -- this is the same 63.4 deg
    // figure tests/palette/recommend-palette.test.js's own calibration group
    // asserts for analyseImageHues() directly.
    assert.ok(direction.accentHue >= 55 && direction.accentHue <= 75, `expected the raw accentHue in [55, 75], got ${direction.accentHue}`);

    const result = buildDirections({ directions: [direction] });
    const [resolved] = result.directions;
    assert.equal(resolved.accentHue, 90, 'expected the projected accent hue to land EXACTLY on 90 deg, the shipped brass hue');
    assert.equal(resolved.passes, true, `failures: dark=${JSON.stringify(resolved.failures.dark)} light=${JSON.stringify(resolved.failures.light)}`);
  });

  test('buildDirections({ image, inheritFrom }) appends the measured direction automatically for a hero that names a hue', () => {
    const heroImage = loadHeroImage(FIXTURE_PNG);
    const result = buildDirections({ image: heroImage, inheritFrom: 'navy', directions: [] });
    assert.equal(result.directions.length, 1);
    assert.equal(result.directions[0].id, 'from-image');
    assert.equal(result.passes, true);
  });

  test('buildDirections({ image, inheritFrom }) adds NOTHING for a monochrome image -- no special case, just an empty contribution', () => {
    const image = makeImage(8, 60, (x, y) => {
      const v = y < 30 ? 24 : 224;
      return [v, v, v, 255];
    });
    const result = buildDirections({ image, inheritFrom: 'navy', directions: [] });
    assert.equal(result.directions.length, 0);
    assert.equal(result.passes, true, 'an empty direction list has nothing to fail');
  });
});
