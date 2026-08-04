/**
 * Codexterity — hero-image scrim solver (Plan 0003 M1)
 * -----------------------------------------------------------
 * Node port of tools/palette/solve-hero-scrim.py, generalised so ground/ink/
 * mode are arguments rather than Captain's Cabin literals baked into the
 * script. This is now the LIVE instrument for proving a hero image's scrim
 * meets WCAG AA over the text region — the Python script survives only as the
 * historical record of the calculation that produced the shipped 5.99:1.
 *
 * THE WEBP FACT THAT SHAPES THIS FILE. The shipped hero
 * (themes/captains-cabin/assets/hero-empty-state.webp) is lossy VP8 — a full
 * intra-frame video codec (arithmetic coding, DCT, in-loop deblocking), not a
 * simple container format. Decoding it from scratch in zero-dependency Node
 * is out of scope for this tool (D-0001-20 forbids reaching for a WebP
 * library instead). loadHeroImage() therefore REJECTS WebP input BY NAME
 * rather than attempting a partial decode — the fail-loudly rule this repo
 * follows everywhere else (see tools/png-decode.mjs's own header). The
 * companion fixture tests/fixtures/hero-empty-state.png is a bit-identical
 * PNG re-encode of the same shipped image, produced once, offline, precisely
 * so this module and its tests have something real to decode.
 */

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodePng } from '../png-decode.mjs';
import { hexToRgb, hexToOklch, ratioRgb, luminanceRgb } from './palette-engine.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Read an image file and return { width, height, rgba } (rgba: a
 * width*height*4 Buffer of 8-bit RGBA bytes, matching png-decode.mjs's
 * output shape exactly so bandImage() never has to care which decoder ran).
 */
export function loadHeroImage(filePath) {
  const buf = readFileSync(filePath);

  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return decodePng(buf);
  }

  const isRiff = buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (isRiff) {
    const subchunk = buf.length >= 16 ? buf.toString('ascii', 12, 16) : '????';
    throw new Error(
      `hero-scrim: "${filePath}" is a WebP file (sub-chunk "${subchunk}"). ` +
        'Lossy VP8 is a full video-codec intra frame (arithmetic coding, DCT, in-loop ' +
        'deblocking) and decoding it in zero-dependency Node is out of scope here. Use the ' +
        'PNG calibration fixture tests/fixtures/hero-empty-state.png instead — it is a ' +
        'bit-identical re-encode of this image.'
    );
  }

  const leading = buf.subarray(0, Math.min(8, buf.length)).toString('hex');
  throw new Error(`hero-scrim: "${filePath}" is not a supported image (leading bytes 0x${leading} match neither PNG nor WebP)`);
}

export const DEFAULT_BANDS = 60;

/**
 * Slice an image into horizontal bands and reduce each to the figures the
 * scrim solver needs. Band geometry matches the Python reference exactly:
 * `step = floor(height / bands)`, bands cover [top, min(height, top+step)),
 * and a band's `fraction` is its top row divided by the image height — NOT
 * its centre, which is what the Python used and what the shipped 5.99:1 was
 * measured against.
 */
export function bandImage(image, { bands = DEFAULT_BANDS } = {}) {
  const { width, height, rgba } = image;
  // A non-integer band count is refused rather than coerced. `Math.floor(h/NaN)`
  // is NaN, which makes the loop below advance `top` to NaN and exit after one
  // pass — so `bands: NaN` (what `Number('abc')` hands us from the CLI) would
  // otherwise return a single band and read exactly like a real measurement.
  if (!Number.isInteger(bands) || bands < 1) {
    throw new Error(`hero-scrim: band count must be a positive integer, got ${JSON.stringify(bands)}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(`hero-scrim: image buffer length ${rgba.length} does not match width*height*4 (${width}x${height})`);
  }
  if (height < bands) {
    throw new Error(`hero-scrim: image height ${height} is smaller than the requested ${bands} bands (step would be 0)`);
  }

  // Alpha is discarded rather than composited. The Python reference used
  // Pillow's .convert('RGB'), which silently drops alpha against an assumed
  // background; doing the same here would make every contrast figure below
  // wrong for a semi-transparent hero, and guessing a compositing colour is
  // exactly the kind of guess the fail-loudly rule forbids. Refuse instead.
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] !== 255) {
      throw new Error(`hero-scrim: pixel with alpha ${rgba[i]} !== 255 found (image is not fully opaque; a hero must be)`);
    }
  }

  const step = Math.floor(height / bands);
  const result = [];
  for (let top = 0; top < height; top += step) {
    const bottom = Math.min(height, top + step);

    // Track brightest/darkest by first-seen-on-tie, row-major, matching
    // Python's max()/min() over a flat pixel list built row by row.
    let brightest = null, brightestLum = -Infinity;
    let darkest = null, darkestLum = Infinity;
    let sumR = 0, sumG = 0, sumB = 0, sumLum = 0, count = 0;

    for (let y = top; y < bottom; y++) {
      const rowStart = y * width * 4;
      for (let x = 0; x < width; x++) {
        const o = rowStart + x * 4;
        const px = [rgba[o], rgba[o + 1], rgba[o + 2]];
        const lum = luminanceRgb(px);
        if (lum > brightestLum) { brightestLum = lum; brightest = px; }
        if (lum < darkestLum) { darkestLum = lum; darkest = px; }
        sumR += px[0]; sumG += px[1]; sumB += px[2]; sumLum += lum;
        count++;
      }
    }

    result.push({
      fraction: top / height,
      top,
      height: bottom - top,
      brightest,
      darkest,
      minLuminance: darkestLum,
      maxLuminance: brightestLum,
      meanLuminance: sumLum / count,
      meanRgb: [Math.round(sumR / count), Math.round(sumG / count), Math.round(sumB / count)],
    });
  }
  return result;
}

// Which pixel governs contrast in each mode. Dark mode lays LIGHT ink over the
// image, so the BRIGHTEST pixel in a band is the worst case for that band
// (it comes closest to the ink's own lightness); light mode lays DARK ink
// over the image, so the DARKEST pixel is the worst case instead. The rule
// inverts the pixel picked, not the arithmetic — ratioRgb() is unchanged
// either way.
export const MODES = { dark: 'brightest', light: 'darkest' };

/**
 * Piecewise-linear interpolation over ascending [fraction, alpha] stops.
 * Beyond the last stop, hold at the last stop's alpha rather than
 * extrapolating — the Python reference's `alpha(f)` semantics.
 *
 * BELOW the first stop it holds at the FIRST alpha, which is a DELIBERATE
 * correction of the reference rather than a port of it. Python fell through
 * its loop and returned `stops[-1][1]` for any unbracketed fraction, so a
 * position above the first stop reported the LAST alpha — a scrim meant to be
 * fully transparent at the top of the panel reporting fully opaque, the
 * furthest-possible-from-right answer. It never fired there because all four
 * calibration stop sets begin at fraction 0 and no band can sit below that.
 * A generalised instrument does not get to rely on that: the moment a theme
 * authors stops beginning at, say, 0.1, the old behaviour returns a confident
 * wrong number instead of an error. Same shape as D-0001-23 — behaviour that
 * was safe only because of its inputs, carried forward without them.
 */
export function scrimAlphaAt(stops, fraction) {
  if (fraction <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [f0, a0] = stops[i];
    const [f1, a1] = stops[i + 1];
    if (fraction >= f0 && fraction <= f1) {
      const t = f1 === f0 ? 0 : (fraction - f0) / (f1 - f0);
      return a0 + t * (a1 - a0);
    }
  }
  return stops[stops.length - 1][1];
}

// palette-engine's hexToRgb assumes it is being handed a colour the engine
// itself derived, so a malformed string dies on `.exec(...)[1]` with a bare
// "Cannot read properties of null". Ground and ink reach this module from a
// command line, so they are checked at the boundary and named in the failure.
function requireHex(value, role) {
  if (typeof value !== 'string' || !/^#?[0-9a-f]{6}$/i.test(value)) {
    throw new Error(`hero-scrim: ${role} must be a '#RRGGBB' colour, got ${JSON.stringify(value)}`);
  }
  return hexToRgb(value);
}

function blend(px, alpha, groundRgb) {
  return [0, 1, 2].map((i) => Math.round(px[i] * (1 - alpha) + groundRgb[i] * alpha));
}

/**
 * Solve (or verify) a scrim's worst-case contrast over the region of a hero
 * image where text can sit. Mirrors solve-hero-scrim.py's `evaluate()`, but
 * ground/ink/mode are all arguments — the Python script had Captain's
 * Cabin's colours as literals, which is exactly what a general instrument
 * cannot do.
 */
export function solveScrim({ image, bands, stops, ground, ink, mode, textFrom = 0.42, bandCount }) {
  if (mode !== 'dark' && mode !== 'light') {
    throw new Error(`hero-scrim: mode must be 'dark' or 'light', got ${JSON.stringify(mode)}`);
  }
  if (!Number.isFinite(textFrom)) {
    throw new Error(`hero-scrim: textFrom must be a number, got ${JSON.stringify(textFrom)}`);
  }
  const pixelKey = MODES[mode];
  const resolvedBands = bands ?? bandImage(image, { bands: bandCount ?? DEFAULT_BANDS });

  const groundRgb = requireHex(ground, 'ground');
  const inkRgb = requireHex(ink, 'ink');

  const evaluated = resolvedBands.filter((b) => b.fraction >= textFrom);
  if (evaluated.length === 0) {
    throw new Error(`hero-scrim: no band survives the textFrom=${textFrom} filter (${resolvedBands.length} bands total) — cannot report a worst case`);
  }

  let worstRatio = Infinity, worstFraction = null, worstPixel = null, worstBlended = null;
  for (const band of evaluated) {
    const px = band[pixelKey];
    const alpha = scrimAlphaAt(stops, band.fraction);
    const blended = blend(px, alpha, groundRgb);
    const r = ratioRgb(blended, inkRgb);
    if (r < worstRatio) {
      worstRatio = r;
      worstFraction = band.fraction;
      worstPixel = px;
      worstBlended = blended;
    }
  }

  const visibleFraction = resolvedBands.filter((b) => scrimAlphaAt(stops, b.fraction) < 0.85).length / resolvedBands.length;

  return {
    mode,
    governingPixel: pixelKey,
    worstRatio,
    worstFraction,
    visibleFraction,
    passes: worstRatio >= 4.5,
    worstPixel,
    worstBlended,
  };
}

// The four candidate stop sets from the Phase 3 calibration run, kept
// verbatim so this module and the Python script can be compared side by
// side. The FIRST label is deliberately corrected here, not copied as-is:
// the Python printed 'current (shipped calc)' for this row, but that
// candidate was never shipped — it is an earlier, harsher attempt. What
// actually shipped is milder B: its stops (40%/5%, 55%/25%, 70%/62%,
// 86%/92%) appear verbatim in themes/captains-cabin/theme.css, and its
// 5.99:1 is the figure emit-theme.mjs's hero comment cites. Reading this
// module's 8.68:1 first row as "the current state" is the trap this comment
// exists to close.
export const CALIBRATION_STOPS = [
  {
    label: 'earlier attempt (NOT shipped)',
    stops: [[0, 0], [0.30, 0.10], [0.45, 0.45], [0.58, 0.86], [0.68, 1], [1, 1]],
  },
  {
    label: 'milder A',
    stops: [[0, 0], [0.35, 0.06], [0.50, 0.30], [0.64, 0.70], [0.78, 0.95], [1, 1]],
  },
  {
    label: 'milder B (SHIPPED)',
    stops: [[0, 0], [0.40, 0.05], [0.55, 0.25], [0.70, 0.62], [0.86, 0.92], [1, 1]],
  },
  {
    label: 'milder C (most image)',
    stops: [[0, 0], [0.42, 0.04], [0.58, 0.20], [0.74, 0.55], [0.90, 0.88], [1, 0.97]],
  },
];

// The live calibration target: what actually shipped. Any change to this
// module must still reproduce 5.99:1 against
// tests/fixtures/hero-empty-state.png before it is trusted on a NEW image.
// `ground` and `ink` here are Captain's Cabin's dark ground and primary ink,
// recorded as calibration DATA for this check — not as a default. solveScrim
// itself always takes ground/ink as arguments; nothing in this module reads
// these two constants except a test/CLI run that opts in explicitly.
export const SHIPPED_CAPTAINS_CABIN = {
  stops: CALIBRATION_STOPS[2].stops,
  ground: '#0E141F',
  ink: '#F4EAD4',
  mode: 'dark',
  expectedWorstRatio: 5.99,
};

/**
 * Per-band and whole-image tonal statistics, independent of any scrim or
 * ink/ground pair. This exists for exactly one downstream consumer: Plan
 * 0003 M3's recommender, which proposes RECIPE INPUTS — a ground hue and
 * chroma, an accent hue — never final hex, so everything it suggests still
 * has to pass through the OKLCH engine and audit.mjs. Chroma and hue are
 * reported here for that reason: a monochrome hero reports near-zero chroma
 * in `meanOklch`, and that near-zero reading IS the signal that tells a
 * recommender the image does not name a hue for it, rather than an absence
 * of information.
 */
export function tonalSummary(image, { bands = DEFAULT_BANDS, buckets = 10 } = {}) {
  const { width, height } = image;
  const banded = bandImage(image, { bands });

  const bandSummaries = banded.map((b) => ({
    fraction: b.fraction,
    minLuminance: b.minLuminance,
    maxLuminance: b.maxLuminance,
    meanLuminance: b.meanLuminance,
    meanHex: rgbToHexString(b.meanRgb),
  }));

  // Whole-image mean, and a luminance histogram, computed directly from the
  // pixel buffer rather than from the bands — bands already summarise rows
  // into one figure each, which would understate the histogram's spread.
  const { rgba } = image;
  if (!Number.isInteger(buckets) || buckets < 1) {
    throw new Error(`hero-scrim: histogram bucket count must be a positive integer, got ${JSON.stringify(buckets)}`);
  }
  let sumR = 0, sumG = 0, sumB = 0, sumLum = 0;
  const pixelCount = width * height;
  const histogramCounts = new Array(buckets).fill(0);
  const binWidth = 1 / buckets;
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = luminanceRgb([rgba[i], rgba[i + 1], rgba[i + 2]]);
    sumR += rgba[i]; sumG += rgba[i + 1]; sumB += rgba[i + 2]; sumLum += lum;
    let bin = Math.floor(lum / binWidth);
    if (bin >= buckets) bin = buckets - 1; // luminance can land exactly on 1.0
    histogramCounts[bin]++;
  }

  const meanRgb = [Math.round(sumR / pixelCount), Math.round(sumG / pixelCount), Math.round(sumB / pixelCount)];
  const meanHex = rgbToHexString(meanRgb);
  const meanLuminance = sumLum / pixelCount;

  const luminanceHistogram = histogramCounts.map((count, i) => ({
    from: i * binWidth,
    to: (i + 1) * binWidth,
    share: count / pixelCount,
  }));

  return {
    width,
    height,
    bands: bandSummaries,
    overall: {
      meanHex,
      meanLuminance,
      meanOklch: hexToOklch(meanHex),
      luminanceHistogram,
    },
  };
}

function rgbToHexString([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseStopsArg(text) {
  // "f,a f,a ..." — same shape a human would type after copying pairs out of
  // CALIBRATION_STOPS by hand.
  return text.trim().split(/\s+/).map((pair) => {
    const parts = pair.split(',');
    if (parts.length !== 2) {
      throw new Error(`hero-scrim: --stops entry "${pair}" is not "fraction,alpha"`);
    }
    // Checked, not coerced: Number('abc') is NaN, and a NaN alpha propagates
    // all the way to a printed "worst NaN:1" that reads like a measurement.
    return parts.map((part, i) => {
      const n = Number(part);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        throw new Error(
          `hero-scrim: --stops entry "${pair}" has a non-numeric or out-of-range ` +
            `${i === 0 ? 'fraction' : 'alpha'} ("${part}"); both must be between 0 and 1`
        );
      }
      return n;
    });
  });
}

// Same reason as parseStopsArg: a silently-NaN option is worse than a refusal.
function numericFlag(flag, value, { integer = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) {
    usageAndExit(`${flag} needs ${integer ? 'an integer' : 'a number'}, got "${value}"`);
  }
  return n;
}

function usageAndExit(message) {
  if (message) process.stderr.write(`hero-scrim: ${message}\n`);
  process.stderr.write(
    'Usage: node tools/palette/hero-scrim.mjs <image.png> --ground #RRGGBB --ink #RRGGBB ' +
      '[--mode dark|light] [--text-from 0..1] [--bands n] [--stops "f,a f,a ..."] [--tonal]\n'
  );
  process.exit(1);
}

function runCli(argv) {
  const [imagePath, ...rest] = argv;
  if (!imagePath || imagePath.startsWith('--')) {
    usageAndExit('missing <image.png>');
  }

  const options = { mode: 'dark', textFrom: 0.42, bands: DEFAULT_BANDS, ground: null, ink: null, stopsText: null, tonal: false };
  const knownFlags = new Set(['--mode', '--ground', '--ink', '--text-from', '--bands', '--stops', '--tonal']);

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!knownFlags.has(flag)) {
      usageAndExit(`unknown flag "${flag}"`);
    }
    if (flag === '--tonal') {
      options.tonal = true;
      continue;
    }
    const value = rest[++i];
    if (value === undefined) {
      usageAndExit(`flag "${flag}" needs a value`);
    }
    if (flag === '--mode') options.mode = value;
    else if (flag === '--ground') options.ground = value;
    else if (flag === '--ink') options.ink = value;
    else if (flag === '--text-from') options.textFrom = numericFlag(flag, value);
    else if (flag === '--bands') options.bands = numericFlag(flag, value, { integer: true });
    else if (flag === '--stops') options.stopsText = value;
  }

  if (!options.ground) usageAndExit('--ground is required (no default — refusing to guess Captain\'s Cabin\'s ground for an arbitrary image)');
  if (!options.ink) usageAndExit('--ink is required (no default — refusing to guess an arbitrary image\'s ink colour)');
  if (options.mode !== 'dark' && options.mode !== 'light') usageAndExit(`--mode must be "dark" or "light", got "${options.mode}"`);

  // Every failure below is one this module raises deliberately and by name, so
  // the CLI reports the message and exits non-zero rather than printing a stack
  // trace at an owner who is running an authoring tool, not debugging one.
  try {
    evaluateAndPrint(imagePath, options);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

function evaluateAndPrint(imagePath, options) {
  const image = loadHeroImage(imagePath);
  const bands = bandImage(image, { bands: options.bands });

  process.stdout.write(
    `mode=${options.mode} governingPixel=${MODES[options.mode]} bands=${bands.length} textFrom=${options.textFrom}\n`
  );

  const stopSets = options.stopsText
    ? [{ label: 'custom', stops: parseStopsArg(options.stopsText) }]
    : CALIBRATION_STOPS;

  for (const { label, stops } of stopSets) {
    const result = solveScrim({ bands, stops, ground: options.ground, ink: options.ink, mode: options.mode, textFrom: options.textFrom });
    process.stdout.write(
      `${label.padEnd(22)} worst ${result.worstRatio.toFixed(2).padStart(5)}:1 at ${(result.worstFraction * 100).toFixed(0).padStart(3)}%` +
        `   image still visible over ${(result.visibleFraction * 100).toFixed(0).padStart(2)}% of panel  ${result.passes ? 'OK' : 'FAILS'}\n`
    );
  }

  if (options.tonal) {
    const summary = tonalSummary(image, { bands: options.bands });
    process.stdout.write(
      `\ntonal: meanHex=${summary.overall.meanHex} meanLuminance=${summary.overall.meanLuminance.toFixed(4)} ` +
        `meanOklch=(L=${summary.overall.meanOklch.L.toFixed(3)}, C=${summary.overall.meanOklch.C.toFixed(3)}, H=${summary.overall.meanOklch.H.toFixed(1)})\n`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
