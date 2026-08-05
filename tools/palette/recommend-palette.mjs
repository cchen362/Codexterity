/**
 * Codexterity — hero-image palette recommender (Plan 0003 M3)
 * -----------------------------------------------------------
 * D-0003-2 governs this file: what it proposes, why the hue instrument is
 * shaped the way it is, the 40° accent separation floor, and why only the
 * accent hue was parameterised in the engine. Read that row in
 * docs/DECISIONS.md before changing any of the four.
 *
 * Proposes RECIPE INPUTS for a hero image — a ground hue/chroma, an accent
 * hue — and nothing else. This is the hard constraint the whole file is
 * built around: it never hands back a final hex. Every proposal this module
 * emits is run straight back through palette-engine.mjs's buildDark/
 * buildLight and audit.mjs's checks before it is returned, so nothing
 * unproven can leave this module. A proposal that fails WCAG AA is still
 * RETURNED, marked failing with its failing checks named — never silently
 * dropped and never nudged into passing by hand.
 *
 * THE INSTRUMENT PROBLEM THIS FILE SOLVES. The obvious first idea — average
 * every pixel's hue — is a BROKEN instrument, measured directly against the
 * exact image this whole theme was drawn from. Captain's Cabin's hero (via
 * its calibration copy tests/fixtures/hero-empty-state.png, run through
 * hero-scrim.mjs's tonalSummary()) averages to OKLCH chroma 0.0036 and hue
 * 229° — i.e. reads as nearly neutral, because the image's warm lamplight
 * and cold sea cancel each other out in a single whole-image mean. That
 * image unmistakably names two hues to a human eye. A recommender built on
 * the whole-image mean alone would report "no hue" about the one image
 * whose two hues this theme's own navy ground and brass accent already are.
 *
 * WHAT WORKS: a chroma-weighted hue histogram, split by lightness. Measured
 * on that same hero with 10° bins and a split at OKLCH L = 0.45:
 *
 *   dark region   (L < 0.45): 240-250° holds 42.5% of the region's chroma
 *                             mass  (the shipped navy ground sits at 262.2°)
 *   bright region (L >= 0.45): 60-70° holds 87.7% of the region's chroma
 *                             mass  (the shipped brass accent sits at 90.4°)
 *
 * The image's DARK MASS names the ground; what GLOWS IN it names the
 * accent. That is the whole idea, and it is why analyseImageHues() below
 * always reports two regions rather than one whole-image figure.
 *
 * The same instrument on assets/hero-sources/BW_Jisoo.png — a monochrome
 * portrait, NOT tracked in this repo (it is the owner's private photograph
 * and assets/hero-sources/ is gitignored; nothing in this module or its
 * tests may depend on that path existing) — reports whole-image mean chroma
 * 0.0008, a MAXIMUM single-pixel chroma of 0.0239 (i.e. its single most
 * colourful pixel is less colourful than the shipped hero's AVERAGE pixel),
 * and its best bright bin holds only 29.6% of that region's chroma mass.
 * That is what "this image names no hue" looks like, measured, not assumed.
 */

import { hexToOklch, oklchToHex, rgbToOklch, buildDark, buildLight, buildSyntax, GROUNDS, ROLE_HUES } from './palette-engine.mjs';
import { run, runSyntax } from './audit.mjs';
import { loadHeroImage, tonalSummary } from './hero-scrim.mjs';
import { pathToFileURL } from 'node:url';

// ── The hue instrument ──────────────────────────────────────────────────────

export const DEFAULT_DARK_BELOW = 0.45;
export const DEFAULT_HUE_BIN_WIDTH = 10;
export const DEFAULT_HUE_WINDOW = 20;

// The two thresholds `namesHue` is built from, and why these numbers rather
// than others. Both are set from the GAP between an image that plainly names
// its hues and one that plainly does not, measured through this very
// function (2026-08-05, `node tools/palette/recommend-palette.mjs <img>
// --inherit-from navy`):
//
//                              meanChroma   concentration
//   shipped hero, dark region      0.0238           83.9%
//   shipped hero, bright region    0.0931          100.0%
//   monochrome portrait, dark      0.0015           40.2%
//   monochrome portrait, bright    0.0007           31.7%
//
// The thresholds sit in the empty space between those two groups. On chroma
// the nearest YES (0.0238) and the nearest NO (0.0015) are ~16x apart, with
// 0.010 roughly in the middle on a log scale — so an image has to change
// character, not merely drift, to cross it. On concentration the nearest YES
// is 83.9% and the nearest NO is 40.2%, so 50% is not a knife edge either.
//
// One figure worth keeping in view because it is the most vivid statement of
// how neutral a monochrome portrait really is: that portrait's single MOST
// colourful pixel measures chroma 0.0239 — essentially the shipped hero's
// dark-region AVERAGE. Its best pixel is the shipped hero's typical one.
export const NAMES_HUE_MIN_CHROMA = 0.010;
export const NAMES_HUE_MIN_CONCENTRATION = 0.50;

function requirePositiveIntegerDivisor(value, name) {
  if (!Number.isInteger(value) || value < 1 || 360 % value !== 0) {
    throw new Error(`recommend-palette: ${name} must be a positive integer that divides 360 evenly, got ${JSON.stringify(value)}`);
  }
}

// Shortest angular distance between two hues on the circle, always in [0, 180].
function circularDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Split an image's pixels into a dark region (OKLCH L < darkBelow) and a
 * bright region (L >= darkBelow), and within each region find the hue that
 * actually dominates its colour, weighted by how saturated each pixel is
 * (a chroma-weighted histogram) rather than by raw pixel count (which would
 * let a huge flat grey sky outvote a small saturated lamp).
 *
 * Two passes over the pixel buffer, by design: the first bins every pixel's
 * (hue, chroma) into `360/binWidth` per-region buckets and finds the bucket
 * carrying the most chroma mass; the second re-walks the same pixels to
 * compute the REAL circular mean hue and REAL chroma-mass share within a
 * `window`-degree circular window centred on that bucket's centre — not the
 * bucket's own centre, which would report a coarse label instead of a
 * measured angle. Both passes cache each pixel's (L, C, H) so the OKLab
 * conversion — the expensive part, on the order of 1.5 million pixels for a
 * real hero image — runs exactly once per pixel.
 */
export function analyseImageHues(image, options = {}) {
  const darkBelow = options.darkBelow ?? DEFAULT_DARK_BELOW;
  const binWidth = options.binWidth ?? DEFAULT_HUE_BIN_WIDTH;
  const window = options.window ?? DEFAULT_HUE_WINDOW;

  if (!Number.isFinite(darkBelow) || darkBelow <= 0 || darkBelow >= 1) {
    throw new Error(`recommend-palette: darkBelow must be a number strictly between 0 and 1, got ${JSON.stringify(darkBelow)}`);
  }
  requirePositiveIntegerDivisor(binWidth, 'binWidth');
  if (!Number.isFinite(window) || window <= 0 || window > 180) {
    throw new Error(`recommend-palette: window must be a number in (0, 180], got ${JSON.stringify(window)}`);
  }

  const { width, height, rgba } = image;
  if (rgba.length !== width * height * 4) {
    throw new Error(`recommend-palette: image buffer length ${rgba.length} does not match width*height*4 (${width}x${height})`);
  }

  const n = width * height;
  const nBins = 360 / binWidth;
  // Cached per-pixel OKLCH, region membership and hue bin — computed once in
  // the first pass, reused by the second so the OKLab conversion never runs
  // twice for the same pixel.
  const hueOf = new Float64Array(n);
  const chromaOf = new Float64Array(n);
  const isDark = new Uint8Array(n);

  const totals = {
    dark: { pixelCount: 0, chromaSum: 0, bins: new Float64Array(nBins) },
    bright: { pixelCount: 0, chromaSum: 0, bins: new Float64Array(nBins) },
  };

  for (let i = 0, o = 0; i < n; i++, o += 4) {
    if (rgba[o + 3] !== 255) {
      throw new Error(`recommend-palette: pixel with alpha ${rgba[o + 3]} !== 255 found (image is not fully opaque)`);
    }
    const { L, C, H } = rgbToOklch([rgba[o], rgba[o + 1], rgba[o + 2]]);
    hueOf[i] = H;
    chromaOf[i] = C;
    const dark = L < darkBelow;
    isDark[i] = dark ? 1 : 0;
    const region = dark ? totals.dark : totals.bright;
    region.pixelCount++;
    region.chromaSum += C;
    let bin = Math.floor(H / binWidth);
    if (bin >= nBins) bin = nBins - 1; // H can land exactly on 360 for a hue of 0 processed as 360
    region.bins[bin] += C;
  }

  const result = {};
  for (const [name, region] of Object.entries(totals)) {
    let bestBin = 0, bestMass = -Infinity;
    for (let b = 0; b < nBins; b++) {
      if (region.bins[b] > bestMass) { bestMass = region.bins[b]; bestBin = b; }
    }
    const bestCenter = bestBin * binWidth + binWidth / 2;
    const wantDark = name === 'dark' ? 1 : 0;

    let windowChromaSum = 0, cosSum = 0, sinSum = 0;
    for (let i = 0; i < n; i++) {
      if (isDark[i] !== wantDark) continue;
      const h = hueOf[i];
      if (circularDistance(h, bestCenter) > window) continue;
      const c = chromaOf[i];
      windowChromaSum += c;
      const rad = (h * Math.PI) / 180;
      cosSum += c * Math.cos(rad);
      sinSum += c * Math.sin(rad);
    }

    let dominantHue = bestCenter;
    if (windowChromaSum > 0) {
      let deg = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      dominantHue = deg;
    }

    const meanChroma = region.pixelCount > 0 ? region.chromaSum / region.pixelCount : 0;
    const concentration = region.chromaSum > 0 ? windowChromaSum / region.chromaSum : 0;

    result[name] = {
      pixelShare: region.pixelCount / n,
      meanChroma,
      chromaMass: region.chromaSum,
      dominantHue,
      concentration,
      namesHue: meanChroma >= NAMES_HUE_MIN_CHROMA && concentration >= NAMES_HUE_MIN_CONCENTRATION,
    };
  }
  return result;
}

// ── The role-separation guard ────────────────────────────────────────────────

// palette-engine.mjs's own ROLE table holds warning 40° from brass (50 vs
// 90) DELIBERATELY, so a warning border is never mistaken for the accent —
// see that file's ROLE comment. This floor encodes the same 40° gap as a
// hard rule any RECOMMENDED accent hue must also respect, against all three
// semantic status hues (success/warning/error), not just warning: an image
// could just as easily name a hue that collides with success or error.
export const ROLE_HUE_SEPARATION_FLOOR = 40;

function nearestViolatedRole(hue, roleHues, floor) {
  let name = null, dist = Infinity;
  for (const roleName of ['success', 'warning', 'error']) {
    const d = circularDistance(hue, roleHues[roleName]);
    if (d < floor && d < dist) { dist = d; name = roleName; }
  }
  return { name, dist };
}

/**
 * Enforce ROLE_HUE_SEPARATION_FLOOR against every semantic status hue
 * (success/warning/error — never brass itself, which is the value being
 * placed). If the requested hue already clears the floor it is returned
 * unchanged. If it does not, it is PROJECTED to the nearest admissible hue
 * on the circle (never silently dropped, never silently left in violation)
 * and the projection is reported by name on the return value so a caller
 * can see both what the image asked for and what the guard allowed.
 *
 * CALIBRATION FACT this function must reproduce (see
 * tests/palette/recommend-palette.test.js): the shipped hero's bright
 * region measures an accent hue near 65°. 65° sits only 15° from warning at
 * 50° — a clear violation of this 40° floor — and the nearest admissible
 * hue on the circle is 90°, which is Captain's Cabin's shipped brass hue
 * exactly. This is M3's analogue of M1's 5.99:1 scrim gate: it is the proof
 * that this instrument, run on the theme's own source image, reproduces a
 * value the owner already approved by a completely different route.
 */
export function projectAccentHue(requestedHue, options = {}) {
  const floor = options.floor ?? ROLE_HUE_SEPARATION_FLOOR;
  const roleHues = options.roleHues ?? ROLE_HUES;
  const isAdmissible = (h) => ['success', 'warning', 'error'].every((r) => circularDistance(h, roleHues[r]) >= floor);

  if (isAdmissible(requestedHue)) {
    return { accentHue: requestedHue, adjustment: null };
  }

  let best = null, bestDist = Infinity;
  for (let h = 0; h < 360; h++) {
    if (!isAdmissible(h)) continue;
    const d = circularDistance(h, requestedHue);
    if (d < bestDist) { bestDist = d; best = h; }
  }
  if (best === null) {
    // Geometrically impossible with three roles spaced around the circle at
    // a 40° floor — three 80°-wide exclusion zones cannot cover 360° — but
    // failing loudly here costs nothing and a silent NaN would cost a lot.
    throw new Error('recommend-palette: no accent hue on the circle clears the separation floor against all three status hues; this should not be reachable');
  }

  const violated = nearestViolatedRole(requestedHue, roleHues, floor);
  return {
    accentHue: best,
    adjustment:
      `requested ${requestedHue.toFixed(1)}° is only ${violated.dist.toFixed(1)}° from ` +
      `${violated.name} (${roleHues[violated.name]}°), inside the ${floor}° separation floor; ` +
      `projected to the nearest admissible hue, ${best}°`,
  };
}

// ── Proposals ─────────────────────────────────────────────────────────────────

// Hold the inherited ground's own LIGHTNESS and vary hue/chroma from the
// image. Lightness is a LEGIBILITY decision — the whole surface ramp
// deriveChrome builds is measured against it — not something a picture gets
// to name; hue and chroma are exactly the two things a picture CAN
// legitimately name. If the requested chroma leaves sRGB gamut at that
// lightness/hue, oklchToHex()'s own chroma-reduction loop clamps it; this
// wrapper detects that (by round-tripping the emitted hex back through
// hexToOklch and comparing) and reports it rather than hiding it.
function groundFromImageRegion(inheritedL, region) {
  const requestedC = region.meanChroma;
  const hex = oklchToHex({ L: inheritedL, C: requestedC, H: region.dominantHue });
  const achievedC = hexToOklch(hex).C;
  return { hex, requestedChroma: requestedC, clamped: achievedC < requestedC - 1e-4 };
}

function reasonRegionDoesNotNameHue(label, region) {
  const parts = [];
  if (region.meanChroma < NAMES_HUE_MIN_CHROMA) {
    parts.push(`meanChroma ${region.meanChroma.toFixed(4)} is below the ${NAMES_HUE_MIN_CHROMA} threshold`);
  }
  if (region.concentration < NAMES_HUE_MIN_CONCENTRATION) {
    parts.push(`concentration ${(region.concentration * 100).toFixed(1)}% is below the ${(NAMES_HUE_MIN_CONCENTRATION * 100).toFixed(0)}% threshold`);
  }
  return `${label} does not name a hue (${parts.join('; ')})`;
}

// THE AUDIT RUNS INSIDE THE RECOMMENDER. Every proposal, whatever its
// inputs, is built through the SAME buildDark/buildLight/buildSyntax path
// every shipped theme goes through, and checked with the SAME run()/
// runSyntax() audit.mjs uses for its own 272/272 sweep. A caller of this
// module can never obtain a proposal that has not been audited — a failing
// one is still returned, marked `passes: false` with its failing checks
// named, never thrown away and never silently adjusted to pass.
function buildAuditedProposal(id, groundHex, accentOptions, extra) {
  const dark = buildDark(groundHex, accentOptions);
  const light = buildLight(groundHex, accentOptions);
  const synDark = buildSyntax(dark, 'dark');
  const synLight = buildSyntax(light, 'light');

  const darkRows = [...run(dark), ...runSyntax(synDark)];
  const lightRows = [...run(light), ...runSyntax(synLight)];
  const darkBad = darkRows.filter((r) => !r.pass);
  const lightBad = lightRows.filter((r) => !r.pass);

  return {
    id,
    ground: groundHex,
    groundOklch: hexToOklch(groundHex),
    accentHue: accentOptions.accentHue ?? ROLE_HUES.brass,
    ...extra,
    passes: darkBad.length === 0 && lightBad.length === 0,
    audit: {
      dark: { checks: darkRows.length, failed: darkBad.length, failures: darkBad.map((r) => r.label) },
      light: { checks: lightRows.length, failed: lightBad.length, failures: lightBad.map((r) => r.label) },
    },
  };
}

/**
 * Propose recipe inputs for a hero image, inheriting everything not proposed
 * from `inheritFrom` (a GROUNDS key). Four proposals are POSSIBLE, each
 * emitted by a mechanical rule with no invention:
 *
 *   'inherited'    — ground and accent both from inheritFrom. ALWAYS emitted;
 *                     it is the control every other proposal is measured against.
 *   'image-ground' — ground from the image's dark region, accent inherited.
 *                     Emitted only if the dark region names a hue.
 *   'image-accent' — ground inherited, accent from the image's bright region.
 *                     Emitted only if the bright region names a hue.
 *   'image-both'   — both ground and accent from the image.
 *                     Emitted only if BOTH regions name a hue.
 *
 * Every proposal NOT emitted appears in `omitted` with the measured figure
 * that failed it — an image that names no hue is not silence, it is a
 * reported, numbered reason. Every EMITTED proposal has already been run
 * through the OKLCH engine and audit.mjs (see buildAuditedProposal above) —
 * this function's caller never sees an unaudited hex.
 */
export function recommendPalette(image, options = {}) {
  const { inheritFrom, darkBelow, binWidth, window } = options;

  // No default for inheritFrom, on purpose: refusing to guess a ground for
  // an arbitrary image is the same discipline hero-scrim.mjs's own CLI
  // already applies to --ground/--ink.
  if (typeof inheritFrom !== 'string' || !inheritFrom) {
    throw new Error(`recommend-palette: inheritFrom is required (no default). Known grounds: ${Object.keys(GROUNDS).join(', ')}`);
  }
  const groundMeta = GROUNDS[inheritFrom];
  if (!groundMeta) {
    throw new Error(`recommend-palette: inheritFrom ${JSON.stringify(inheritFrom)} does not resolve in GROUNDS (known: ${Object.keys(GROUNDS).join(', ')})`);
  }

  const inheritedHex = groundMeta.ground;
  const inheritedOklch = hexToOklch(inheritedHex);
  const analysis = analyseImageHues(image, { darkBelow, binWidth, window });
  const tonal = tonalSummary(image);

  const proposals = [];
  const omitted = [];

  proposals.push(buildAuditedProposal('inherited', inheritedHex, {}, {
    note: `ground and accent both inherited from '${inheritFrom}' unchanged -- the control.`,
  }));

  if (analysis.dark.namesHue) {
    const groundResult = groundFromImageRegion(inheritedOklch.L, analysis.dark);
    proposals.push(buildAuditedProposal('image-ground', groundResult.hex, {}, {
      note: `ground hue/chroma from the image's dark region; lightness held at inheritFrom's own L=${inheritedOklch.L.toFixed(3)}.`,
      measuredGroundChroma: analysis.dark.meanChroma,
      groundClamped: groundResult.clamped,
    }));
  } else {
    omitted.push({ id: 'image-ground', reason: reasonRegionDoesNotNameHue('dark region', analysis.dark) });
  }

  if (analysis.bright.namesHue) {
    const projected = projectAccentHue(analysis.bright.dominantHue);
    proposals.push(buildAuditedProposal('image-accent', inheritedHex, { accentHue: projected.accentHue }, {
      note: `ground inherited from '${inheritFrom}' unchanged; accent hue from the image's bright region.`,
      requestedAccentHue: analysis.bright.dominantHue,
      accentAdjustment: projected.adjustment,
    }));
  } else {
    omitted.push({ id: 'image-accent', reason: reasonRegionDoesNotNameHue('bright region', analysis.bright) });
  }

  if (analysis.dark.namesHue && analysis.bright.namesHue) {
    const groundResult = groundFromImageRegion(inheritedOklch.L, analysis.dark);
    const projected = projectAccentHue(analysis.bright.dominantHue);
    proposals.push(buildAuditedProposal('image-both', groundResult.hex, { accentHue: projected.accentHue }, {
      note: 'both ground and accent from the image.',
      measuredGroundChroma: analysis.dark.meanChroma,
      groundClamped: groundResult.clamped,
      requestedAccentHue: analysis.bright.dominantHue,
      accentAdjustment: projected.adjustment,
    }));
  } else {
    const reasons = [];
    if (!analysis.dark.namesHue) reasons.push(reasonRegionDoesNotNameHue('dark region', analysis.dark));
    if (!analysis.bright.namesHue) reasons.push(reasonRegionDoesNotNameHue('bright region', analysis.bright));
    omitted.push({ id: 'image-both', reason: reasons.join('; ') });
  }

  return { inheritFrom, analysis, tonal, proposals, omitted };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function numericFlag(flag, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) usageAndExit(`${flag} needs a number, got "${value}"`);
  return n;
}

function usageAndExit(message) {
  if (message) process.stderr.write(`recommend-palette: ${message}\n`);
  process.stderr.write(
    'Usage: node tools/palette/recommend-palette.mjs <image.png> --inherit-from navy ' +
      '[--dark-below 0.45] [--bin-width 10] [--window 20]\n'
  );
  process.exit(1);
}

function runCli(argv) {
  const [imagePath, ...rest] = argv;
  if (!imagePath || imagePath.startsWith('--')) usageAndExit('missing <image.png>');

  const options = { inheritFrom: null, darkBelow: undefined, binWidth: undefined, window: undefined };
  const knownFlags = new Set(['--inherit-from', '--dark-below', '--bin-width', '--window']);

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (!knownFlags.has(flag)) usageAndExit(`unknown flag "${flag}"`);
    const value = rest[++i];
    if (value === undefined) usageAndExit(`flag "${flag}" needs a value`);
    if (flag === '--inherit-from') options.inheritFrom = value;
    else if (flag === '--dark-below') options.darkBelow = numericFlag(flag, value);
    else if (flag === '--bin-width') options.binWidth = numericFlag(flag, value);
    else if (flag === '--window') options.window = numericFlag(flag, value);
  }
  if (!options.inheritFrom) {
    usageAndExit(`--inherit-from is required (no default -- refusing to guess a ground for an arbitrary image). Known grounds: ${Object.keys(GROUNDS).join(', ')}`);
  }

  // Every failure below is one this module raises deliberately and by name,
  // so the CLI reports the message and exits non-zero rather than printing a
  // stack trace at an owner who is running an authoring tool, not debugging one.
  try {
    evaluateAndPrint(imagePath, options);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

function fmtRegion(label, region) {
  return (
    `${label}  pixelShare=${(region.pixelShare * 100).toFixed(1)}%  meanChroma=${region.meanChroma.toFixed(4)}  ` +
    `dominantHue=${region.dominantHue.toFixed(1)}°  concentration=${(region.concentration * 100).toFixed(1)}%  namesHue=${region.namesHue}`
  );
}

function evaluateAndPrint(imagePath, options) {
  const image = loadHeroImage(imagePath);
  const result = recommendPalette(image, {
    inheritFrom: options.inheritFrom,
    darkBelow: options.darkBelow,
    binWidth: options.binWidth,
    window: options.window,
  });

  process.stdout.write(`inheritFrom=${result.inheritFrom}\n`);
  process.stdout.write(fmtRegion('dark  ', result.analysis.dark) + '\n');
  process.stdout.write(fmtRegion('bright', result.analysis.bright) + '\n\n');

  for (const p of result.proposals) {
    process.stdout.write(`[${p.passes ? 'OK     ' : 'FAILING'}] ${p.id}\n`);
    process.stdout.write(
      `  ground ${p.ground}  (L=${p.groundOklch.L.toFixed(3)} C=${p.groundOklch.C.toFixed(4)} H=${p.groundOklch.H.toFixed(1)}°)` +
        (p.groundClamped ? '  [gamut-clamped]' : '') + '\n'
    );
    if (p.requestedAccentHue !== undefined) {
      process.stdout.write(`  accent requested ${p.requestedAccentHue.toFixed(1)}° -> used ${p.accentHue.toFixed(1)}°\n`);
      if (p.accentAdjustment) process.stdout.write(`    ${p.accentAdjustment}\n`);
    } else {
      process.stdout.write(`  accent ${p.accentHue.toFixed(1)}° (unchanged)\n`);
    }
    process.stdout.write(
      `  audit  dark ${p.audit.dark.checks - p.audit.dark.failed}/${p.audit.dark.checks} pass, ` +
        `light ${p.audit.light.checks - p.audit.light.failed}/${p.audit.light.checks} pass\n`
    );
    if (!p.passes) {
      if (p.audit.dark.failed) process.stdout.write(`    FAILING dark:  ${p.audit.dark.failures.join(', ')}\n`);
      if (p.audit.light.failed) process.stdout.write(`    FAILING light: ${p.audit.light.failures.join(', ')}\n`);
    }
  }

  if (result.omitted.length) {
    process.stdout.write('\nomitted:\n');
    for (const o of result.omitted) process.stdout.write(`  ${o.id}: ${o.reason}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
