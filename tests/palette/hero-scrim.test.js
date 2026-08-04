'use strict';

const test = require('node:test');
const { before, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

// tools/palette/hero-scrim.mjs is ESM (it is a sibling of the ESM-only
// palette-engine.mjs / png-decode.mjs / emit-theme.mjs). This test file stays
// CommonJS to match the rest of tests/, per the repo's established pattern
// (see tests/packaging/windows.test.js's own header comment): a single
// dynamic import() in a before() hook, module-scoped bindings, loaded once.
const REPO_ROOT = path.join(__dirname, '..', '..');
const FIXTURE_PNG = path.join(REPO_ROOT, 'tests', 'fixtures', 'hero-empty-state.png');
const SHIPPED_WEBP = path.join(REPO_ROOT, 'themes', 'captains-cabin', 'assets', 'hero-empty-state.webp');

let loadHeroImage;
let DEFAULT_BANDS;
let bandImage;
let MODES;
let scrimAlphaAt;
let solveScrim;
let CALIBRATION_STOPS;
let SHIPPED_CAPTAINS_CABIN;
let tonalSummary;

before(async () => {
  const mod = await import(pathToFileURL(path.join(REPO_ROOT, 'tools', 'palette', 'hero-scrim.mjs')).href);
  ({
    loadHeroImage,
    DEFAULT_BANDS,
    bandImage,
    MODES,
    scrimAlphaAt,
    solveScrim,
    CALIBRATION_STOPS,
    SHIPPED_CAPTAINS_CABIN,
    tonalSummary,
  } = mod);
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

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// NOTE on solveScrim()'s real signature, discovered while writing this file
// against the implementation: `bands` is an OPTIONAL pre-computed Band[]
// array (`resolvedBands = bands ?? bandImage(image, { bands: bandCount ??
// DEFAULT_BANDS })`), used by the CLI to avoid re-slicing the image once per
// stop set; the band COUNT when only `image` is given is `bandCount`, not
// `bands`. Every solveScrim() call below that supplies `image` therefore
// passes `bandCount`, not `bands`, to actually select 60 bands.

// =====================================================================
// A. THE CALIBRATION GATE — the whole point of this milestone. If this
// group is not green, nothing else in this file matters: it is the proof
// that the Node port reproduces the number the shipped theme was actually
// solved against (5.99:1, "milder B"), not just a plausible-looking one.
// =====================================================================

describe('the calibration gate: re-solving the real shipped hero reproduces solve-hero-scrim.py exactly', () => {
  let heroImage;
  before(() => {
    heroImage = loadHeroImage(FIXTURE_PNG);
  });

  const EXPECTED = [
    // The Python script's FIRST row was printed under the label
    // 'current (shipped calc)' — that label was always stale: the row was
    // never what shipped. What ships is 'milder B'. hero-scrim.mjs corrects
    // the label to 'earlier attempt (NOT shipped)'; this table asserts the
    // corrected label alongside the SAME numbers the stale-labelled row
    // printed, so the port is checked against the reference's actual output,
    // not against a rewritten history.
    { label: 'earlier attempt (NOT shipped)', worstRatio: '8.68', visiblePct: 58 },
    { label: 'milder A', worstRatio: '6.72', visiblePct: 73 },
    { label: 'milder B (SHIPPED)', worstRatio: '5.99', visiblePct: 83 },
    { label: 'milder C (most image)', worstRatio: '5.73', visiblePct: 90 },
  ];

  test('CALIBRATION_STOPS has exactly the four reference rows, in reference order', () => {
    assert.equal(CALIBRATION_STOPS.length, 4);
    assert.deepEqual(
      CALIBRATION_STOPS.map((c) => c.label),
      EXPECTED.map((e) => e.label)
    );
  });

  for (let i = 0; i < EXPECTED.length; i++) {
    const expected = EXPECTED[i];
    test(`"${expected.label}" solves to worst ${expected.worstRatio}:1 at 43%, image visible over ${expected.visiblePct}% of the panel`, () => {
      const candidate = CALIBRATION_STOPS[i];
      assert.equal(candidate.label, expected.label);
      const result = solveScrim({
        image: heroImage,
        bandCount: 60,
        stops: candidate.stops,
        ground: '#0E141F',
        ink: '#F4EAD4',
        mode: 'dark',
        textFrom: 0.42,
      });
      assert.equal(result.worstRatio.toFixed(2), expected.worstRatio);
      // The Python printed worst-case fraction as '%3.0f%%', i.e. rounded to
      // the nearest whole percent; every reference row rounds to 43%.
      assert.equal(Math.round(result.worstFraction * 100), 43);
      // visibleFraction is the share of ALL 60 bands whose alpha < 0.85,
      // printed by the reference as '%2.0f%%'.
      assert.equal(Math.round(result.visibleFraction * 100), expected.visiblePct);
      assert.equal(result.passes, result.worstRatio >= 4.5);
    });
  }

  test('SHIPPED_CAPTAINS_CABIN carries the exact stops of "milder B (SHIPPED)"', () => {
    const shippedRow = CALIBRATION_STOPS.find((c) => c.label === 'milder B (SHIPPED)');
    assert.ok(shippedRow, 'expected a "milder B (SHIPPED)" row in CALIBRATION_STOPS');
    assert.deepEqual(SHIPPED_CAPTAINS_CABIN.stops, shippedRow.stops);
  });

  test('solving with SHIPPED_CAPTAINS_CABIN\'s own ground/ink/mode reproduces its declared expectedWorstRatio of 5.99 and passes', () => {
    const result = solveScrim({
      image: heroImage,
      bandCount: 60,
      stops: SHIPPED_CAPTAINS_CABIN.stops,
      ground: SHIPPED_CAPTAINS_CABIN.ground,
      ink: SHIPPED_CAPTAINS_CABIN.ink,
      mode: SHIPPED_CAPTAINS_CABIN.mode,
      textFrom: 0.42,
    });
    assert.equal(SHIPPED_CAPTAINS_CABIN.ground, '#0E141F');
    assert.equal(SHIPPED_CAPTAINS_CABIN.ink, '#F4EAD4');
    assert.equal(SHIPPED_CAPTAINS_CABIN.mode, 'dark');
    assert.equal(SHIPPED_CAPTAINS_CABIN.expectedWorstRatio, 5.99);
    assert.equal(result.worstRatio.toFixed(2), '5.99');
    assert.equal(result.passes, true);
  });
});

// =====================================================================
// B. GROUND AND INK ARE ARGUMENTS, NOT BAKED-IN LITERALS — the exact defect
// that made solve-hero-scrim.py unusable for a second theme (it hardcoded
// GROUND = (14, 20, 31); INK = (244, 234, 212) as Python tuples). If the
// port silently reintroduced that, every future theme's scrim would be
// solved against Captain's Cabin's colours instead of its own.
// =====================================================================

describe('ground and ink are runtime arguments, not values baked into the module', () => {
  test('solving the same fixture and stops with a materially different ground/ink changes the result', () => {
    const heroImage = loadHeroImage(FIXTURE_PNG);
    const shippedRow = CALIBRATION_STOPS.find((c) => c.label === 'milder B (SHIPPED)');
    const inverted = solveScrim({
      image: heroImage,
      bandCount: 60,
      stops: shippedRow.stops,
      ground: '#FFFFFF',
      ink: '#000000',
      mode: 'dark',
      textFrom: 0.42,
    });
    // If ground/ink were hardcoded to Captain's Cabin's navy/parchment, this
    // would silently reproduce 5.99:1 regardless of what was passed in.
    assert.notEqual(inverted.worstRatio.toFixed(2), '5.99');
    assert.ok(
      Math.abs(inverted.worstRatio - 5.99) > 0.5,
      `expected a materially different ratio from 5.99, got ${inverted.worstRatio}`
    );
  });
});

// =====================================================================
// C. THE MODE INVERSION — dark mode is governed by the brightest pixel per
// band, light mode by the darkest. This is not a detail: it is review
// finding #2, and the reference script is dark-mode-only precisely because
// it always takes max(px, key=lum).
// =====================================================================

describe('the dark/light mode inversion: which pixel governs, and that it changes the outcome', () => {
  // A smooth vertical grey gradient, white at the top row fading to black at
  // the bottom row. With DEFAULT_BANDS spanning only 2 rows each (height 120,
  // 60 bands -> step 2), every band's top row is measurably brighter than its
  // bottom row, so brightest and darkest are genuinely different pixels
  // within the same band, not just the same pixel picked twice.
  function makeGradientImage() {
    return makeImage(64, 120, (x, y) => {
      const v = Math.round((255 * (119 - y)) / 119);
      return [v, v, v, 255];
    });
  }

  test('MODES maps dark to "brightest" and light to "darkest"', () => {
    assert.deepEqual(MODES, { dark: 'brightest', light: 'darkest' });
  });

  test('bandImage() picks different pixels for brightest vs darkest within a mixed (gradient) band', () => {
    const image = makeGradientImage();
    const bands = bandImage(image, { bands: 60 });
    assert.equal(bands.length, 60);
    const mixedBand = bands.find((b) => !arraysEqual(b.brightest, b.darkest));
    assert.ok(mixedBand, 'expected at least one band whose brightest and darkest pixels differ');
  });

  test('solveScrim reports governingPixel "brightest" in dark mode and "darkest" in light mode', () => {
    const image = makeGradientImage();
    const stops = [
      [0, 0],
      [1, 0],
    ];
    const darkResult = solveScrim({ image, bandCount: 60, stops, ground: '#888888', ink: '#202020', mode: 'dark', textFrom: 0 });
    const lightResult = solveScrim({ image, bandCount: 60, stops, ground: '#888888', ink: '#202020', mode: 'light', textFrom: 0 });
    assert.equal(darkResult.governingPixel, 'brightest');
    assert.equal(lightResult.governingPixel, 'darkest');
  });

  test('with a light ground and dark ink, dark mode and light mode reach materially DIFFERENT worst-case contrast on the same image', () => {
    // A checkerboard column image: pixel column 0 is white, every other
    // column is black, identically on every row. So band.brightest is
    // always the white pixel and band.darkest is always the black pixel,
    // for every band -- eliminating the gradient's row-to-row noise and
    // isolating the mode inversion itself, not just measurement jitter.
    const image = makeImage(4, 120, (x) => (x === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    const stops = [
      [0, 0],
      [1, 0],
    ]; // alpha always 0: the blended pixel is the raw pixel, unscrimmed.
    const darkResult = solveScrim({
      image,
      bandCount: 60,
      stops,
      ground: '#F5F0E6',
      ink: '#141414',
      mode: 'dark',
      textFrom: 0,
    });
    const lightResult = solveScrim({
      image,
      bandCount: 60,
      stops,
      ground: '#F5F0E6',
      ink: '#141414',
      mode: 'light',
      textFrom: 0,
    });
    // Dark mode evaluates white-on-dark-ink (high contrast); light mode
    // evaluates black-on-dark-ink (near 1:1). The method must invert, not
    // merely produce two slightly different numbers.
    assert.ok(
      darkResult.worstRatio - lightResult.worstRatio > 5,
      `expected dark mode's ratio (${darkResult.worstRatio}) to exceed light mode's (${lightResult.worstRatio}) by a wide margin`
    );
    assert.ok(lightResult.worstRatio < 2, `expected light mode's ratio to be near 1:1, got ${lightResult.worstRatio}`);
  });

  test('an unknown mode throws by name', () => {
    const image = makeGradientImage();
    assert.throws(
      () =>
        solveScrim({
          image,
          bandCount: 60,
          stops: [
            [0, 0],
            [1, 0],
          ],
          ground: '#0E141F',
          ink: '#F4EAD4',
          mode: 'sepia',
          textFrom: 0,
        }),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /sepia/);
        return true;
      }
    );
  });
});

function arraysEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// =====================================================================
// D. BAND GEOMETRY reproduces the Python's `range(0, H, H // bands)` walk
// exactly: step = floor(height/bands), a band starts at each multiple of
// step below height, and the last band is short if it doesn't divide evenly.
// =====================================================================

describe('bandImage() band geometry matches the Python range(0, H, H//bands) walk', () => {
  test('height 900, 60 bands: step 15, exactly 60 bands, first fraction 0, fractions strictly ascending', () => {
    const image = makeImage(4, 900, () => [128, 128, 128, 255]);
    const bands = bandImage(image, { bands: 60 });
    assert.equal(bands.length, 60);
    assert.equal(bands[0].top, 0);
    assert.equal(bands[0].height, 15);
    assert.equal(bands[0].fraction, 0);
    for (let i = 1; i < bands.length; i++) {
      assert.ok(bands[i].fraction > bands[i - 1].fraction, `fraction must strictly ascend at index ${i}`);
    }
  });

  test('height 130, 60 bands: step floors to 2, giving 65 bands, and the last band ends exactly at the image height', () => {
    const image = makeImage(4, 130, () => [64, 64, 64, 255]);
    const bands = bandImage(image, { bands: 60 });
    assert.equal(bands.length, 65);
    const last = bands[bands.length - 1];
    assert.equal(last.top + last.height, 130);
  });

  test('DEFAULT_BANDS is 60', () => {
    assert.equal(DEFAULT_BANDS, 60);
  });

  test('a height smaller than the band count throws by name (a step of 0 would loop forever)', () => {
    const image = makeImage(4, 10, () => [0, 0, 0, 255]);
    assert.throws(
      () => bandImage(image, { bands: 60 }),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        return true;
      }
    );
  });

  test('an rgba buffer whose length disagrees with width*height*4 throws by name', () => {
    const image = { width: 10, height: 10, rgba: Buffer.alloc(10 * 10 * 4 - 4, 255) };
    assert.throws(
      () => bandImage(image, { bands: 2 }),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        return true;
      }
    );
  });
});

// =====================================================================
// E. THE ALPHA GUARD. The Python read the hero via Pillow's .convert('RGB'),
// which silently drops alpha entirely. Guessing a compositing background in
// the Node port would make every contrast figure downstream of it wrong
// without any error at all -- so any non-opaque pixel must throw, loudly,
// rather than be guessed at.
// =====================================================================

describe('bandImage() refuses any pixel whose alpha byte is not 255', () => {
  test('a single non-opaque pixel among otherwise-opaque pixels throws by name', () => {
    const image = makeImage(2, 4, () => [10, 20, 30, 255]);
    // Corrupt exactly one alpha byte.
    image.rgba[(1 * 2 + 1) * 4 + 3] = 254;
    assert.throws(
      () => bandImage(image, { bands: 2 }),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /alpha/i);
        return true;
      }
    );
  });

  test('a fully-opaque synthetic image passes the alpha guard cleanly', () => {
    const image = makeImage(2, 4, () => [10, 20, 30, 255]);
    assert.doesNotThrow(() => bandImage(image, { bands: 2 }));
  });
});

// =====================================================================
// F. FORMAT HANDLING. The whole reason this module exists rather than a
// call to png-decode.mjs directly: the shipped hero is lossy WebP, which the
// repo's zero-dependency PNG decoder cannot read, and that has to fail with
// a message that NAMES the problem rather than a generic parse error.
// =====================================================================

describe('loadHeroImage() format handling', () => {
  test('loading the real shipped WebP hero throws, naming both "WebP" and the VP8 sub-chunk', () => {
    assert.throws(
      () => loadHeroImage(SHIPPED_WEBP),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        assert.match(err.message, /WebP/);
        assert.match(err.message, /VP8 /);
        return true;
      }
    );
  });

  test('loading the PNG fixture returns 1600x900 with an rgba buffer of the exact expected length', () => {
    const image = loadHeroImage(FIXTURE_PNG);
    assert.equal(image.width, 1600);
    assert.equal(image.height, 900);
    assert.equal(image.rgba.length, 1600 * 900 * 4);
  });

  test('loading a file that is neither PNG nor RIFF/WebP throws by name, naming the leading bytes', () => {
    const junkPath = path.join(os.tmpdir(), `cdx-hero-scrim-junk-${process.pid}-${Date.now()}.bin`);
    fs.writeFileSync(junkPath, Buffer.from([0x00, 0x01, 0x02, 0x03, 0xde, 0xad, 0xbe, 0xef]));
    try {
      assert.throws(
        () => loadHeroImage(junkPath),
        (err) => {
          assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
          return true;
        }
      );
    } finally {
      fs.rmSync(junkPath, { force: true });
    }
  });
});

// =====================================================================
// G. scrimAlphaAt — the piecewise-linear interpolation over the stops.
// =====================================================================

describe('scrimAlphaAt() piecewise-linear interpolation', () => {
  const stops = [
    [0, 0],
    [0.5, 0.5],
    [1, 1],
  ];

  test('returns the exact alpha at each declared stop', () => {
    assert.equal(scrimAlphaAt(stops, 0), 0);
    assert.equal(scrimAlphaAt(stops, 0.5), 0.5);
    assert.equal(scrimAlphaAt(stops, 1), 1);
  });

  test('interpolates linearly at a midpoint between two stops', () => {
    // Between (0,0) and (0.5,0.5): t = (0.25-0)/(0.5-0) = 0.5,
    // alpha = 0 + 0.5*(0.5-0) = 0.25.
    assert.equal(scrimAlphaAt(stops, 0.25), 0.25);
    // Between (0.5,0.5) and (1,1): t = (0.75-0.5)/(1-0.5) = 0.5,
    // alpha = 0.5 + 0.5*(1-0.5) = 0.75.
    assert.equal(scrimAlphaAt(stops, 0.75), 0.75);
  });

  test('beyond the last stop, returns the last stop\'s alpha', () => {
    assert.equal(scrimAlphaAt(stops, 1.5), 1);
  });

  test('before the first stop, clamps to the FIRST stop\'s alpha -- a deliberate correction of the Python reference, not a port of it', () => {
    // solve-hero-scrim.py's alpha(f) only assigns inside a bracketing pair
    // (`if f0<=f<=f1`); any fraction matching NO pair -- including one below
    // the first stop's fraction -- fell through to `return stops[-1][1]`,
    // i.e. the LAST alpha. hero-scrim.mjs's own header comment on
    // scrimAlphaAt() documents this as a DELIBERATE fix, not an oversight:
    // the Python's fallback was safe only because every real stops array
    // begins at fraction 0, so the buggy branch never fired; a generalised
    // instrument does not get to rely on that, so it clamps low to the
    // FIRST stop instead of silently reporting the opposite extreme.
    const offsetStops = [
      [0.2, 0],
      [0.5, 0.5],
      [1, 1],
    ];
    assert.equal(scrimAlphaAt(offsetStops, 0), 0);
  });
});

// =====================================================================
// H. TONAL SUMMARY — the input M3's recommender consumes.
// =====================================================================

describe('tonalSummary()', () => {
  test('on a uniform mid-grey synthetic image, every band reports the hand-computed luminance and hex', () => {
    // sRGB 128 -> linear ((128/255 + 0.055)/1.055)^2.4, luminance is that
    // value in all three channels (equal weights sum to 1 for R=G=B).
    const c = 128 / 255;
    const linear = Math.pow((c + 0.055) / 1.055, 2.4);
    const expectedLuminance = 0.2126 * linear + 0.7152 * linear + 0.0722 * linear;

    const image = makeImage(8, 60, () => [128, 128, 128, 255]);
    const summary = tonalSummary(image, { bands: 60, buckets: 10 });
    assert.equal(summary.width, 8);
    assert.equal(summary.height, 60);
    assert.equal(summary.bands.length, 60);
    for (const band of summary.bands) {
      assert.ok(Math.abs(band.meanLuminance - expectedLuminance) < 1e-6, `band luminance off: ${band.meanLuminance} vs ${expectedLuminance}`);
      assert.ok(Math.abs(band.minLuminance - expectedLuminance) < 1e-6);
      assert.ok(Math.abs(band.maxLuminance - expectedLuminance) < 1e-6);
      assert.equal(band.meanHex.toLowerCase(), '#808080');
    }
    assert.equal(summary.overall.meanHex.toLowerCase(), '#808080');
    assert.ok(Math.abs(summary.overall.meanLuminance - expectedLuminance) < 1e-6);
  });

  test('the luminance histogram\'s bucket shares sum to 1 and its boundaries tile 0..1 without gaps', () => {
    const image = makeImage(8, 60, (x, y) => {
      const v = Math.round((255 * y) / 59);
      return [v, v, v, 255];
    });
    const summary = tonalSummary(image, { bands: 60, buckets: 10 });
    const hist = summary.overall.luminanceHistogram;
    assert.equal(hist.length, 10);
    const totalShare = hist.reduce((sum, b) => sum + b.share, 0);
    assert.ok(Math.abs(totalShare - 1) < 1e-9, `histogram shares must sum to 1, got ${totalShare}`);
    assert.equal(hist[0].from, 0);
    assert.equal(hist[hist.length - 1].to, 1);
    for (let i = 1; i < hist.length; i++) {
      assert.equal(hist[i].from, hist[i - 1].to, `bucket ${i} must start exactly where bucket ${i - 1} ended`);
    }
  });

  test('on the real hero fixture, the image is near-monochrome and low-key, as the design brief describes it', () => {
    // Measured directly by running tools/palette/hero-scrim.mjs's
    // tonalSummary() against tests/fixtures/hero-empty-state.png on this
    // machine (2026-08-05): meanOklch.C ~ 0.0036, meanLuminance ~ 0.0247.
    // These bounds are deliberately loose (roughly 15-20x the measured
    // value) so the test asserts "near-monochrome, low-key" rather than
    // pinning a float that would break on any legitimate recompute.
    const image = loadHeroImage(FIXTURE_PNG);
    const summary = tonalSummary(image, { bands: 60, buckets: 10 });
    assert.ok(summary.overall.meanOklch.C < 0.06, `expected a near-monochrome hero (low chroma), got C=${summary.overall.meanOklch.C}`);
    assert.ok(summary.overall.meanLuminance < 0.15, `expected a low-key night scene, got meanLuminance=${summary.overall.meanLuminance}`);
  });
});

// =====================================================================
// I. textFrom filtering out every band throws by name.
// =====================================================================

describe('solveScrim() when textFrom excludes every band', () => {
  test('a textFrom above every band fraction (e.g. 1.5) throws by name', () => {
    const image = makeImage(4, 60, () => [100, 100, 100, 255]);
    assert.throws(
      () =>
        solveScrim({
          image,
          bandCount: 60,
          stops: [
            [0, 0],
            [1, 1],
          ],
          ground: '#0E141F',
          ink: '#F4EAD4',
          mode: 'dark',
          textFrom: 1.5,
        }),
      (err) => {
        assert.ok(err.message.startsWith('hero-scrim: '), `expected a "hero-scrim: " prefixed message, got: ${err.message}`);
        return true;
      }
    );
  });
});
