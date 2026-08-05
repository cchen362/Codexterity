/**
 * Codexterity — theme directions (Plan 0003 M3b)
 * -----------------------------------------------
 * D-0003-2 governs recommend-palette.mjs; this file is its scope correction,
 * not its replacement. That module answers "what colour is this picture?" —
 * an INSTRUMENT. The owner asked for a GENERATOR: "here are several ways
 * this app could look with this picture in it," where the creative direction
 * comes from the OWNER, not the image (see the "SCOPE CORRECTION, 2026-08-05"
 * block in docs/plans/0003-image-led-theme-authoring.md, which this whole
 * file exists to satisfy). The owner's own words: *"I provide a preferred
 * hero image > based on the hero image theme/aesthetic/palette or direction
 * from me (i.e: Dior inspired palette + another 2 bolder/creative version)"*.
 *
 * A DIRECTION is the unit this file introduces: a first-class authored
 * record — an id, an evocative name, one plain-language sentence of intent,
 * and the recipe inputs a direction actually gets to choose (ground hue and
 * chroma per mode, plus an optional lightness override per mode, plus an
 * accent hue). Two things this repo already required are unchanged by
 * introducing it: an authored INPUT was never forbidden (navy #0E141F is
 * itself one — see the plan's clause 3), and nothing here ever hands back a
 * final hex — buildDirections() below runs every direction through the same
 * palette-engine.mjs solve and audit.mjs sweep every shipped theme goes
 * through, exactly as recommend-palette.mjs does for its own proposals.
 *
 * WHY AUTHORED AND MEASURED DIRECTIONS ARE THE SAME SHAPE. The owner's
 * example pairs an authored direction ("Dior inspired") with measured ones
 * from an image in the same sentence — they are not two different kinds of
 * thing to the owner, and this file does not make them two different kinds
 * of thing in code either. directionFromImage() below produces a record with
 * exactly the fields AUTHORED_DIRECTIONS entries carry, so buildDirections()
 * needs no branch for "was this authored or measured" anywhere: a colourful
 * hero contributes one direction automatically, a monochrome one contributes
 * none (directionFromImage returns null), and the rest of the pipeline never
 * has to know which happened.
 *
 * WHAT MUST STAY GENERAL. Nothing below may be shaped around one photograph.
 * The owner's own example of a "bolder/creative" input is a cyberpunk
 * neon-lit city skyline, not a monochrome portrait, and AUTHORED_DIRECTIONS
 * is written to that brief: every entry is a hue/chroma/lightness input set
 * the engine still has to solve and audit, never a colour picked by eye.
 */

import {
  hexToOklch, oklchToHex, buildDark, buildLight, buildSyntax,
  GROUNDS, ROLE_HUES, DEFAULT_LIGHT_GROUND,
} from './palette-engine.mjs';
import { run, runSyntax } from './audit.mjs';
import { analyseImageHues, projectAccentHue } from './recommend-palette.mjs';
import { loadHeroImage } from './hero-scrim.mjs';
import { pathToFileURL } from 'node:url';

// ── Validation ───────────────────────────────────────────────────────────────

function requireFiniteInRange(value, name, lo, hi) {
  if (!Number.isFinite(value) || value < lo || value > hi) {
    throw new Error(`directions: ${name} must be a finite number in [${lo}, ${hi}], got ${JSON.stringify(value)}`);
  }
}

// A direction is validated on the way IN to resolveDirection(), not trusted
// because it came from AUTHORED_DIRECTIONS -- buildDirections() also accepts
// a caller-supplied `directions` array (a direction built by hand, or one
// this module did not produce), and a malformed one must fail loudly and by
// name at the boundary rather than surface as a confusing NaN three
// functions later.
function validateDirection(direction) {
  if (!direction || typeof direction !== 'object') {
    throw new Error(`directions: a direction record must be an object, got ${JSON.stringify(direction)}`);
  }
  const { id, name, intent, dark, light, accentHue } = direction;
  if (typeof id !== 'string' || !id) {
    throw new Error(`directions: direction.id must be a non-empty string, got ${JSON.stringify(id)}`);
  }
  if (typeof name !== 'string' || !name) {
    throw new Error(`directions: direction '${id}'.name must be a non-empty string`);
  }
  if (typeof intent !== 'string' || !intent) {
    throw new Error(`directions: direction '${id}'.intent must be a non-empty string`);
  }
  if (!dark || typeof dark !== 'object') {
    throw new Error(`directions: direction '${id}'.dark must be an object with groundHue and groundChroma`);
  }
  requireFiniteInRange(dark.groundHue, `direction '${id}'.dark.groundHue`, 0, 360);
  requireFiniteInRange(dark.groundChroma, `direction '${id}'.dark.groundChroma`, 0, 0.4);
  if (dark.groundLightness !== undefined) {
    requireFiniteInRange(dark.groundLightness, `direction '${id}'.dark.groundLightness`, 0, 1);
  }
  if (light !== undefined) {
    if (typeof light !== 'object' || light === null) {
      throw new Error(`directions: direction '${id}'.light must be an object if present, got ${JSON.stringify(light)}`);
    }
    if (light.groundHue !== undefined) requireFiniteInRange(light.groundHue, `direction '${id}'.light.groundHue`, 0, 360);
    if (light.groundChroma !== undefined) requireFiniteInRange(light.groundChroma, `direction '${id}'.light.groundChroma`, 0, 0.4);
    if (light.groundLightness !== undefined) requireFiniteInRange(light.groundLightness, `direction '${id}'.light.groundLightness`, 0, 1);
  }
  requireFiniteInRange(accentHue, `direction '${id}'.accentHue`, 0, 360);
}

// The dark-ground LIGHTNESS a direction gets by not saying otherwise. Same
// reasoning recommend-palette.mjs's groundFromImageRegion() documents for
// its own proposals: lightness is what the whole surface ramp (deriveChrome
// in palette-engine.mjs) is measured against, so it is a LEGIBILITY decision,
// not a creative one, and the shipped navy ground's own lightness is the
// value every prior proof in this repo was measured at. A direction that
// genuinely wants a different one says so explicitly via groundLightness.
export const DEFAULT_DARK_GROUND_LIGHTNESS = hexToOklch(GROUNDS.navy.ground).L;

// Turn a direction's `light` field (groundHue/groundChroma/groundLightness,
// the SAME field names `dark` uses) into palette-engine.mjs's `lightGround`
// build option ({ L, C, H }, and partial). Returns undefined when nothing was
// specified, so buildLight() falls back to its own DEFAULT_LIGHT_GROUND
// rather than this module re-stating those three numbers a second time.
function toLightGroundOption(light) {
  if (!light) return undefined;
  const out = {};
  if (light.groundHue !== undefined) out.H = light.groundHue;
  if (light.groundChroma !== undefined) out.C = light.groundChroma;
  if (light.groundLightness !== undefined) out.L = light.groundLightness;
  return Object.keys(out).length ? out : undefined;
}

// ── Resolving one direction through the engine and the audit ────────────────

/**
 * Solve a direction's ground/accent inputs through palette-engine.mjs and
 * audit the result with audit.mjs's own run()/runSyntax() — the SAME
 * composition recommend-palette.mjs's buildAuditedProposal() uses, so a
 * direction and a recommender proposal are proven the same way. A failing
 * direction is returned MARKED failing, with its failing checks named; it is
 * never dropped and never nudged into passing by hand.
 *
 * THE 40° FLOOR APPLIES HERE, TO EVERY DIRECTION, AUTHORED OR MEASURED. This
 * is the one canonical call site for projectAccentHue() in this file — an
 * authored direction that happens to land inside the floor (nothing stops an
 * owner from typing 63°) is projected exactly like a measured one, and the
 * projection is reported the same way either way.
 */
function resolveDirection(direction) {
  validateDirection(direction);

  const darkGroundLightness = direction.dark.groundLightness ?? DEFAULT_DARK_GROUND_LIGHTNESS;
  const darkGroundHex = oklchToHex({ L: darkGroundLightness, C: direction.dark.groundChroma, H: direction.dark.groundHue });

  const projected = projectAccentHue(direction.accentHue);
  const options = { accentHue: projected.accentHue };
  const lightGround = toLightGroundOption(direction.light);
  if (lightGround) options.lightGround = lightGround;

  const dark = buildDark(darkGroundHex, options);
  // buildLight's FIRST argument is still the DARK ground hex -- it reads
  // only its HUE from that argument (palette-engine.mjs's own comment on
  // buildLight explains why: ink/border hue tracks the dark ground even when
  // the light SURFACE comes from `lightGround`). Passing darkGroundHex here,
  // not a light-mode hex, is not a mistake; it is the interaction the task
  // brief for this milestone calls out by name.
  const light = buildLight(darkGroundHex, options);
  const synDark = buildSyntax(dark, 'dark');
  const synLight = buildSyntax(light, 'light');

  const darkRows = [...run(dark), ...runSyntax(synDark)];
  const lightRows = [...run(light), ...runSyntax(synLight)];
  const darkBad = darkRows.filter((r) => !r.pass);
  const lightBad = lightRows.filter((r) => !r.pass);

  return {
    id: direction.id,
    name: direction.name,
    intent: direction.intent,
    dark: { groundHex: darkGroundHex, groundOklch: { L: darkGroundLightness, C: direction.dark.groundChroma, H: direction.dark.groundHue } },
    // light['background-surface'] is the ACTUAL resolved ground -- reading it
    // back off the built palette (rather than recomputing oklchToHex(base)
    // here) means this record can never disagree with the palette it is
    // reporting on.
    light: { groundHex: light['background-surface'], groundOklch: hexToOklch(light['background-surface']) },
    palettes: { dark, light },
    syntax: { dark: synDark, light: synLight },
    requestedAccentHue: direction.accentHue,
    accentHue: projected.accentHue,
    accentAdjustment: projected.adjustment,
    passes: darkBad.length === 0 && lightBad.length === 0,
    checks: { dark: darkRows.length, light: lightRows.length },
    failed: { dark: darkBad.length, light: lightBad.length },
    failures: { dark: darkBad.map((r) => r.label), light: lightBad.map((r) => r.label) },
  };
}

/**
 * Resolve a whole set of directions (authored, measured, or a mix) and audit
 * every one before returning. `directions` defaults to AUTHORED_DIRECTIONS;
 * `image`/`inheritFrom`, if given, ALSO run directionFromImage() and append
 * whatever it returns (nothing, if the image names no hue -- see that
 * function's own comment). No caller of this function can obtain an
 * unaudited direction: this is the ONE place that composition happens, same
 * posture as recommend-palette.mjs's recommendPalette() and
 * build-palette-recommendation.mjs's assertAllProposalsPass().
 */
export function buildDirections({ image, directions, inheritFrom } = {}) {
  const list = [...(directions ?? AUTHORED_DIRECTIONS)];
  if (image) {
    const measured = directionFromImage(image, { inheritFrom });
    if (measured) list.push(measured);
  }
  const resolved = list.map(resolveDirection);
  return { directions: resolved, passes: resolved.every((d) => d.passes) };
}

// ── The measured direction ──────────────────────────────────────────────────

/**
 * Wrap recommend-palette.mjs's own analyseImageHues() -- DOES NOT
 * reimplement the hue instrument, per the hard constraint this milestone was
 * given -- and turn its reading into ONE direction record, or null if the
 * image names no hue in either region (recommend-palette.mjs's own
 * NAMES_HUE_MIN_CHROMA/NAMES_HUE_MIN_CONCENTRATION thresholds decide that;
 * this function does not carry a second copy of them).
 *
 * The accent hue returned here is the RAW, UNPROJECTED reading -- the 40°
 * separation floor is applied exactly once, inside resolveDirection() above,
 * so every direction (authored or measured) goes through the projection at
 * the same call site rather than this function pre-empting it. That is what
 * makes the calibration fact reproducible: pointed at
 * tests/fixtures/hero-empty-state.png, this function reports the bright
 * region's raw ~63.4°, and buildDirections() -> resolveDirection() is what
 * turns that into exactly 90°, the shipped brass hue.
 *
 * ONLY the dark ground is proposed from the image, never the light one --
 * the same boundary D-0003-2 clause (d) draws for recommend-palette.mjs's
 * own proposals, for the same reason: nothing here has evidence for what a
 * LIGHT-mode ground should be, and proposing one anyway would be inventing a
 * value this module has no basis for. A direction's `light` field is left
 * empty, which resolveDirection()'s toLightGroundOption() reads as "inherit
 * DEFAULT_LIGHT_GROUND" -- parchment, unless the direction says otherwise.
 */
export function directionFromImage(image, options = {}) {
  const { inheritFrom } = options;
  // No default, on purpose -- same discipline recommend-palette.mjs's own
  // recommendPalette() applies: refusing to guess a ground for an arbitrary
  // image rather than picking one silently.
  if (typeof inheritFrom !== 'string' || !inheritFrom) {
    throw new Error(`directions: inheritFrom is required (no default) to build a direction from an image. Known grounds: ${Object.keys(GROUNDS).join(', ')}`);
  }
  const groundMeta = GROUNDS[inheritFrom];
  if (!groundMeta) {
    throw new Error(`directions: inheritFrom ${JSON.stringify(inheritFrom)} does not resolve in GROUNDS (known: ${Object.keys(GROUNDS).join(', ')})`);
  }

  const inherited = hexToOklch(groundMeta.ground);
  const analysis = analyseImageHues(image);

  // Neither region names a hue: this is the "the picture is genuinely
  // monochrome" case the owner's own framing explicitly allows for -- see
  // the module header. It is not an error and it is not silence either; the
  // caller decides what (if anything) to say about it, same as
  // recommend-palette.mjs's own `omitted` array reports a numbered reason
  // rather than nothing.
  if (!analysis.dark.namesHue && !analysis.bright.namesHue) return null;

  const darkGroundHue = analysis.dark.namesHue ? analysis.dark.dominantHue : inherited.H;
  const darkGroundChroma = analysis.dark.namesHue ? analysis.dark.meanChroma : inherited.C;
  const rawAccentHue = analysis.bright.namesHue ? analysis.bright.dominantHue : ROLE_HUES.brass;

  return {
    id: 'from-image',
    name: 'Measured from the hero',
    intent: 'What the picture itself suggests, read straight off its dark mass and its brightest glow.',
    dark: { groundHue: darkGroundHue, groundChroma: darkGroundChroma, groundLightness: inherited.L },
    light: {},
    accentHue: rawAccentHue,
    // Carried through for a caller that wants the raw measurement (the CLI
    // below prints it); resolveDirection() re-derives everything it needs
    // from dark/light/accentHue alone and does not read this field.
    measured: { inheritFrom, analysis },
  };
}

// ── The catalogue ────────────────────────────────────────────────────────────
//
// Four authored directions: the shipped theme as its own control, one
// restrained couture direction, and two deliberately bolder ones -- the
// owner's own example of "bolder/creative" is a cyberpunk neon-lit city
// skyline, which is why the bold pair below leans electric rather than
// merely saturated-navy. Every entry is a hue/chroma/lightness INPUT set,
// never a hex picked by eye; buildDirections() is what turns these into
// actual tokens and proves them against WCAG AA.
//
// SHIPPED_NAVY_OKLCH is read off the real shipped ground with hexToOklch()
// rather than re-typed as three literals, so the control can never silently
// drift from what Captain's Cabin actually ships.
const SHIPPED_NAVY_OKLCH = hexToOklch(GROUNDS.navy.ground);

export const AUTHORED_DIRECTIONS = [
  {
    id: 'shipped-navy',
    name: 'Shipped Navy',
    intent: 'The theme exactly as it ships today — the control every other direction is judged against.',
    dark: { groundHue: SHIPPED_NAVY_OKLCH.H, groundChroma: SHIPPED_NAVY_OKLCH.C, groundLightness: SHIPPED_NAVY_OKLCH.L },
    // Explicit and equal to DEFAULT_LIGHT_GROUND, not omitted -- this is
    // deliberately the record that documents "the default IS parchment" by
    // naming it, and tests/palette/directions.test.js's own no-op test
    // proves that stating it explicitly changes nothing.
    light: { groundHue: DEFAULT_LIGHT_GROUND.H, groundChroma: DEFAULT_LIGHT_GROUND.C, groundLightness: DEFAULT_LIGHT_GROUND.L },
    accentHue: ROLE_HUES.brass,
  },
  {
    id: 'dior-atelier',
    name: 'Dior Atelier',
    intent: 'Bone, ink and one hushed gold — a couture fitting room, not a costume.',
    dark: { groundHue: 40, groundChroma: 0.012, groundLightness: 0.14 },
    light: { groundHue: 70, groundChroma: 0.016, groundLightness: 0.955 },
    accentHue: 100,
  },
  {
    id: 'ember-quarterdeck',
    name: 'Ember Quarterdeck',
    intent: "A ship's log lit by warning lamps: deep garnet by night, warm parchment by day, one cold signal that cuts through both.",
    dark: { groundHue: 18, groundChroma: 0.075, groundLightness: 0.15 },
    light: { groundHue: 42, groundChroma: 0.05, groundLightness: 0.93 },
    accentHue: 195,
  },
  {
    id: 'neon-fathom',
    name: 'Neon Fathom',
    intent: 'A skyline after dark: deep teal-black water, cool paper by day, one hot magenta signal that reads unmistakably electric.',
    dark: { groundHue: 205, groundChroma: 0.05, groundLightness: 0.12 },
    light: { groundHue: 205, groundChroma: 0.028, groundLightness: 0.92 },
    accentHue: 330,
  },
];

// ── CLI ──────────────────────────────────────────────────────────────────────
//
// THIS is where the OKLCH figures, the hue-projection reasoning and the
// audit arithmetic live now, per the scope correction: "the OKLCH figures...
// move OFF the sheet and into the CLI, where the engineer reads them; the
// owner's copy states only that a direction passed." The rendered sheet
// (tools/mockup/, a sibling milestone) is the owner's decision surface; this
// is the engineer's one.

function usageAndExit(message) {
  if (message) process.stderr.write(`directions: ${message}\n`);
  process.stderr.write(
    'Usage: node tools/palette/directions.mjs [--image <hero.png> --inherit-from navy]\n' +
      '  With no --image, evaluates AUTHORED_DIRECTIONS alone.\n' +
      '  With --image, also measures a direction from the image (analyseImageHues) and\n' +
      '  appends it, or reports that the image names no hue and none was added.\n'
  );
  process.exit(message ? 1 : 0);
}

function fmtGround(label, side) {
  return `  ${label} ground ${side.groundHex}  (L=${side.groundOklch.L.toFixed(3)} C=${side.groundOklch.C.toFixed(4)} H=${side.groundOklch.H.toFixed(1)}°)`;
}

function printDirection(d) {
  process.stdout.write(`[${d.passes ? 'OK     ' : 'FAILING'}] ${d.id} — ${d.name}\n`);
  process.stdout.write(`  "${d.intent}"\n`);
  process.stdout.write(fmtGround('dark ', d.dark) + '\n');
  process.stdout.write(fmtGround('light', d.light) + '\n');
  if (d.accentAdjustment) {
    process.stdout.write(`  accent requested ${d.requestedAccentHue.toFixed(1)}° -> projected ${d.accentHue.toFixed(1)}°\n`);
    process.stdout.write(`    ${d.accentAdjustment}\n`);
  } else {
    process.stdout.write(`  accent ${d.accentHue.toFixed(1)}° (clears the 40° floor as requested)\n`);
  }
  process.stdout.write(
    `  audit  dark ${d.checks.dark - d.failed.dark}/${d.checks.dark} pass, light ${d.checks.light - d.failed.light}/${d.checks.light} pass\n`
  );
  if (!d.passes) {
    if (d.failed.dark) process.stdout.write(`    FAILING dark:  ${d.failures.dark.join(', ')}\n`);
    if (d.failed.light) process.stdout.write(`    FAILING light: ${d.failures.light.join(', ')}\n`);
  }
  process.stdout.write('\n');
}

function runCli(argv) {
  if (argv.includes('--help') || argv.includes('-h')) usageAndExit(null);

  const options = { imagePath: null, inheritFrom: 'navy' };
  const knownFlags = new Set(['--image', '--inherit-from']);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!knownFlags.has(flag)) usageAndExit(`unknown flag "${flag}"`);
    const value = argv[++i];
    if (value === undefined) usageAndExit(`flag "${flag}" needs a value`);
    if (flag === '--image') options.imagePath = value;
    else if (flag === '--inherit-from') options.inheritFrom = value;
  }

  try {
    let image = null;
    if (options.imagePath) {
      image = loadHeroImage(options.imagePath);
    }
    const result = buildDirections({ image, inheritFrom: options.inheritFrom });
    process.stdout.write(`${result.directions.length} direction(s) evaluated -- ${result.passes ? 'ALL PASS' : 'AT LEAST ONE FAILING'}\n\n`);
    for (const d of result.directions) printDirection(d);
    if (options.imagePath && result.directions.every((d) => d.id !== 'from-image')) {
      process.stdout.write(`(the image at "${options.imagePath}" names no hue in either region -- no measured direction was added)\n`);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2));
}
