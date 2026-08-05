// Builds the Plan 0003 M3b palette-directions decision sheet.
//
// This is a DECISION SURFACE, not an instrument report — the sheet it
// replaces (0006-palette-recommendation.html, built by
// build-palette-recommendation.mjs) failed review because it was the other
// thing. The owner's verdict, verbatim, is this file's specification: "the
// bunch of jargon and terms like `Ground OKLCH: L 0.191, C 0.024, H 262.2°` …
// doesn't help or serve any purpose for me visually." So this file shows
// large rendered UI mocks per direction, in both modes, and says nothing
// about OKLCH, hue degrees, chroma, or audit arithmetic — that lives in
// `node tools/palette/directions.mjs`, which is where the engineer reads it.
// The ONE permitted exception is a single quiet, non-numeric mark meaning
// "contrast verified" (see AA_MARK below).
//
// Data source: tools/palette/directions.mjs's AUTHORED_DIRECTIONS,
// directionFromImage and buildDirections. This file does not recompute a
// palette or re-run an audit — buildDirections already derives and audits
// every direction through palette-engine.mjs and audit.mjs, and this builder
// only reads its results.
//
// House style, followed from tools/mockup/build-mockup.mjs and
// tools/mockup/build-palette-recommendation.mjs (which this file replaces —
// see docs/plans/0003-image-led-theme-authoring.md's M3b, "Retiring 0006"):
// everything is embedded as a data URI so the file is self-contained with no
// external requests, and every input that does not parse or pass fails
// LOUDLY rather than degrading into a fabricated sheet.
//
// GENERALITY (M3b gate #2): this builder takes an arbitrary hero plus an
// arbitrary direction set — nothing here is shaped around one photograph. A
// fresh clone lacking assets/hero-sources/ (BW_Jisoo.png is git-ignored,
// owner ruling 4) still runs green: Section 1's measured direction and
// Section 2's portrait imagery are both skipped with a plain-language note,
// never a fabricated sheet.
//
// Usage:  node tools/mockup/build-palette-directions.mjs [outfile] [--hero <path>]

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve, extname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = resolve(ROOT, 'themes/captains-cabin');

// ── Argument parsing: one positional outfile, one --hero flag ───────────────
const rawArgs = process.argv.slice(2);
let OUT = resolve(ROOT, 'docs/mockups/0007-palette-directions.html');
let heroOverridePath = null;
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--hero') {
    heroOverridePath = rawArgs[++i];
    if (!heroOverridePath) {
      process.stderr.write('build-palette-directions: --hero needs a path\n');
      process.exit(1);
    }
  } else if (!a.startsWith('--')) {
    OUT = resolve(process.cwd(), a);
  }
}

// The two heroes this pipeline knows about (docs/plans/0003…, "HEROES"):
//   A. tests/fixtures/hero-empty-state.png — tracked, always available.
//   B. assets/hero-sources/BW_Jisoo.png    — git-ignored, may be absent.
// --hero overrides which image feeds the "measured from the hero" direction
// in Section 1; Section 2 is specifically about the Deep Navy Portrait and
// always looks for the portrait file, independent of --hero.
const TRACKED_HERO = resolve(ROOT, 'tests/fixtures/hero-empty-state.png');
const PORTRAIT_HERO = resolve(ROOT, 'assets/hero-sources/BW_Jisoo.png');
const measuredHeroPath = heroOverridePath ? resolve(process.cwd(), heroOverridePath) : TRACKED_HERO;
if (heroOverridePath && !existsSync(measuredHeroPath)) {
  process.stderr.write(`build-palette-directions: --hero path does not exist: ${measuredHeroPath}\n`);
  process.exit(1);
}

// ── The data source (Plan 0003 M3b) ──────────────────────────────────────────
const {
  buildDirections, AUTHORED_DIRECTIONS, DEFAULT_DARK_GROUND_LIGHTNESS,
} = await import(pathToFileURL(resolve(ROOT, 'tools/palette/directions.mjs')).href);
const { loadHeroImage } = await import(pathToFileURL(resolve(ROOT, 'tools/palette/hero-scrim.mjs')).href);
const { hexToOklch, GROUNDS, ROLE_HUES } = await import(pathToFileURL(resolve(ROOT, 'tools/palette/palette-engine.mjs')).href);

// ── Fonts — the theme's own three faces, embedded (design floor, non-negotiable) ──
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;
const FONTS = [
  ['Literata', 'literata-latin-variable.woff2', 'font-weight:400 900;'],
  ['Fraunces', 'fraunces-latin-variable.woff2', 'font-weight:100 900;'],
  ['Monaspace Neon', 'monaspace-neon-latin-400.woff2', 'font-weight:400;'],
].map(([fam, file, extra]) =>
  `@font-face{font-family:'${fam}';src:url(${dataUri(resolve(THEME, 'assets/fonts', file), 'font/woff2')}) format('woff2');font-display:block;${extra}}`
).join('');

// ── Shipped theme.css tokens — for the sheet's OWN chrome only ─────────────
// The sheet's chrome uses the shipped Captain's Cabin dark palette so it
// never competes visually with the directions it is displaying (design floor
// instruction, this milestone's brief).
const css = readFileSync(resolve(THEME, 'theme.css'), 'utf8');
function tokens(selector) {
  const m = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!m) throw new Error(`could not find ${selector} in theme.css`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const t = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (t) out[t[1]] = t[2].trim();
  }
  return out;
}
const SHIPPED_DARK = tokens('.electron-dark');
if (!SHIPPED_DARK['--color-background-surface']) throw new Error('shipped dark block parsed but has no surface token');

// TWO KEY SHAPES — same trap build-palette-recommendation.mjs's own comment
// names, carried forward here because it is what caused a page nobody could
// read to ship once already (Plan 0003 M3, measured fact #5). palette-engine
// palettes are keyed BARE ('text-primary'); tokens() above parses theme.css
// and returns keys that ALREADY carry '--color-'. Passing the second through
// the bare-key formatter defines '--color---color-text-primary', which is
// not a CSS error — every affected property silently falls back to its
// initial value. varBlock() is for bare palette-engine keys ONLY;
// shippedVarBlock() is for parsed theme.css keys ONLY. Never swap them.
const varBlock = (t) => Object.entries(t).map(([k, v]) => `--color-${k}:${v};`).join('');
const shippedVarBlock = (t) => Object.entries(t)
  .map(([k, v]) => `${k}:${v.replace(/\s*!important$/, '')};`)
  .join('');
const synBlock = (syn) => Object.entries(syn).filter(([k]) => k !== '_surface').map(([role, v]) => `--syn-${role}:${v};`).join('');

// ── Small formatting helpers ─────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// THE ONE PERMITTED NUMBER-ADJACENT MARK. Not a ratio, not a percentage —
// a quiet glyph meaning "this direction cleared WCAG AA in both modes before
// it reached this page," which is the single fact the owner needs to trust
// from this sheet without reading a figure. Every direction shown here
// already carries this mark by construction (assertAllDirectionsPass below
// refuses to write the file otherwise), so it is decoration confirming a
// gate already passed, not a claim this page is making on its own.
const AA_MARK = '◆';

function swatch(hex, label) {
  return `<span class="swatch-item"><span class="swatch-chip" style="background:${esc(hex)}"></span><span class="swatch-label">${esc(label)}<br><code>${esc(hex)}</code></span></span>`;
}

// ── The build-time refusal (M3b gate #1) ─────────────────────────────────────
// Same reasoning as emit-theme.mjs's assertPalettesPassAA and
// build-palette-recommendation.mjs's assertAllProposalsPass: a direction
// that cannot pass audit.mjs must be structurally unable to reach the owner's
// eyes, not merely unlikely to. Throws and writes NOTHING if it fires.
function assertAllDirectionsPass(label, result) {
  if (result.passes) return;
  const failing = result.directions.filter((d) => !d.passes);
  const detail = failing.map((d) =>
    `'${d.id}' — dark: ${d.failures.dark.join(', ') || '(none)'}; light: ${d.failures.light.join(', ') || '(none)'}`
  ).join(' | ');
  throw new Error(
    `build-palette-directions: REFUSING TO RENDER (${label}) — at least one direction failed audit.mjs: ${detail}. ` +
    'A direction must pass WCAG AA in both modes before it is shown to the owner.'
  );
}

// ── The mock: the actual product, not an abstraction ────────────────────────
// Title bar, sidebar with an active row carrying the accent mark, main panel,
// a card, a primary button, a code block using the direction's OWN syntax
// palette. No hero image behind this — these mocks are generic app chrome,
// not a bound empty-state hero, so the per-image scrim question (see the
// heroBlock() section below) never enters here at all.
let mockCounter = 0;
function renderMockWindow(darkOrLight, palette, syn, modeLabel) {
  mockCounter += 1;
  const scope = `mk${mockCounter}`;
  const style = `${varBlock(palette)}${synBlock(syn)}`;
  return `
    <div class="mockwin ${scope}" style="${style}">
      <div class="mw-titlebar"><span class="mw-tb-title">Codex</span><span class="mw-tb-mode">${esc(modeLabel)}</span></div>
      <div class="mw-body">
        <aside class="mw-side">
          <div class="mw-side-row">Draft the recipe</div>
          <div class="mw-side-row mw-side-row-active"><span class="mw-side-mark"></span>Review the palette</div>
          <div class="mw-side-row">Solve the scrim</div>
        </aside>
        <main class="mw-main">
          <p class="mw-para">This is how the app itself would read — every colour below is the theme's own token, not an approximation of it.</p>
          <div class="mw-card">
            <p class="mw-card-title">Deep Navy Portrait</p>
            <p class="mw-card-body">A working session, one panel, one open file.</p>
            <button type="button" class="mw-btn">Apply theme</button>
          </div>
          <div class="mw-code">
            <div class="mw-code-head">launcher/resolve-codex.ps1</div>
            <pre class="mw-code-body"><span class="mw-c">// resolved by package identity, not a hardcoded path</span>
<span class="mw-k">const</span> exe <span class="mw-o">=</span> <span class="mw-f">resolveCodex</span>(<span class="mw-s">'OpenAI.Codex'</span>);</pre>
          </div>
        </main>
      </div>
    </div>`;
}

function renderDirectionCard(d, { heroDataUri, heroNote } = {}) {
  const heroBlock = heroDataUri
    ? `<div class="direction-hero">
        <img class="direction-hero-img" src="${heroDataUri}" alt="Source hero for ${esc(d.name)}" />
        <p class="direction-hero-note">${heroNote}</p>
      </div>`
    : '';
  return `
    <article class="direction-card">
      <header class="direction-head">
        <h3>${esc(d.name)} <span class="aa-mark" title="Passed WCAG AA in both modes before reaching this page">${AA_MARK}</span></h3>
        <p class="direction-intent">${esc(d.intent)}</p>
      </header>
      <div class="swatch-row">
        ${swatch(d.dark.groundHex, 'Ground — dark')}
        ${swatch(d.light.groundHex, 'Ground — light')}
        ${swatch(d.palettes.dark['background-button-primary'], 'Accent — dark')}
        ${swatch(d.palettes.light['background-button-primary'], 'Accent — light')}
      </div>
      ${heroBlock}
      <div class="mock-pair">
        ${renderMockWindow('dark', d.palettes.dark, d.syntax.dark, 'Dark')}
        ${renderMockWindow('light', d.palettes.light, d.syntax.light, 'Light')}
      </div>
    </article>`;
}

// ── Section 2: the light-mode candidates for Deep Navy Portrait ─────────────
// Dark stays the shipped navy ground, held fixed and unvaried, exactly as the
// owner settled it. Only the light ground moves — a hue/chroma INPUT, still
// solved and audited by palette-engine.mjs like every other direction on
// this page (never a hand-picked hex). Built via buildDirections() with a
// custom `directions` array so these three go through the SAME composition
// (resolve, audit, refuse-on-failure) as Section 1, rather than a second
// bespoke code path.
const SHIPPED_NAVY_OKLCH = hexToOklch(GROUNDS.navy.ground);
const SHIPPED_LIGHT_GROUND_HEX = tokens('.electron-light')['--color-background-surface'].replace(/\s*!important$/, '');
const LIGHT_CANDIDATE_INPUTS = [
  {
    id: 'light-as-shipped',
    label: 'As it ships — warm parchment',
    note: 'The parchment Captain’s Cabin already ships. The owner’s original concern: this reads too warm under the portrait’s cold monochrome tone.',
    dark: { groundHue: SHIPPED_NAVY_OKLCH.H, groundChroma: SHIPPED_NAVY_OKLCH.C, groundLightness: SHIPPED_NAVY_OKLCH.L },
    light: { groundHue: 85, groundChroma: 0.026, groundLightness: 0.930 },
  },
  {
    id: 'light-cooler',
    label: 'Cooler, paper-grey',
    note: 'The gold is dialed back to a quiet grey — still paper, no longer warm.',
    dark: { groundHue: SHIPPED_NAVY_OKLCH.H, groundChroma: SHIPPED_NAVY_OKLCH.C, groundLightness: SHIPPED_NAVY_OKLCH.L },
    light: { groundHue: 235, groundChroma: 0.012, groundLightness: 0.930 },
  },
  {
    id: 'light-coolest',
    label: 'Coolest, a blue-leaning paper',
    note: 'The furthest step from the shipped warmth — a page that leans visibly blue, closest in temperature to the portrait itself.',
    dark: { groundHue: SHIPPED_NAVY_OKLCH.H, groundChroma: SHIPPED_NAVY_OKLCH.C, groundLightness: SHIPPED_NAVY_OKLCH.L },
    light: { groundHue: 245, groundChroma: 0.024, groundLightness: 0.930 },
  },
].map((c) => ({ id: c.id, name: c.label, intent: c.note, dark: c.dark, light: c.light, accentHue: ROLE_HUES.brass }));

function renderLightCandidateCard(d, note) {
  return `
    <article class="candidate-card">
      <header class="direction-head">
        <h3>${esc(d.name)} <span class="aa-mark" title="Passed WCAG AA in both modes before reaching this page">${AA_MARK}</span></h3>
        <p class="direction-intent">${esc(note)}</p>
      </header>
      <div class="swatch-row">
        ${swatch(d.dark.groundHex, 'Dark ground (unchanged)')}
        ${swatch(d.light.groundHex, 'This candidate’s light ground')}
      </div>
      <div class="mock-pair candidate-mock-pair">
        ${renderMockWindow('light', d.palettes.light, d.syntax.light, 'Light')}
      </div>
    </article>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  // Section 1 — every authored direction, plus whatever the hero measures to.
  let measuredHero = null;
  let measuredHeroDataUri = null;
  let measuredSkippedNote = '';
  try {
    measuredHero = loadHeroImage(measuredHeroPath);
    measuredHeroDataUri = dataUri(measuredHeroPath, mimeFor(measuredHeroPath));
  } catch (err) {
    measuredSkippedNote = `<p class="note-block">Could not read the hero at <code>${esc(measuredHeroPath)}</code> for the measured direction (${esc(err.message)}). Section 1 was built with the four authored directions only.</p>`;
  }
  const section1Result = buildDirections(
    measuredHero ? { image: measuredHero, inheritFrom: 'navy' } : { directions: AUTHORED_DIRECTIONS }
  );
  assertAllDirectionsPass('Section 1 — directions', section1Result);

  const hadMeasured = section1Result.directions.some((d) => d.id === 'from-image');
  if (measuredHero && !hadMeasured) {
    measuredSkippedNote = `<p class="note-block">The hero at <code>${esc(measuredHeroPath)}</code> names no hue in either its dark mass or its brightest glow — a genuinely monochrome or near-neutral image. No measured direction was added; the four authored directions below stand on their own.</p>`;
  }

  const section1Cards = section1Result.directions.map((d) => {
    if (d.id === 'from-image') {
      return renderDirectionCard(d, {
        heroDataUri: measuredHeroDataUri,
        // The hero is named in WORDS, not as a file path. A path is a fact about
        // this machine's disk, not something the owner is choosing between, and
        // the whole point of this sheet is that nothing on it is engineer-facing.
        heroNote: 'This is the picture this direction was read from. It sits beside the mocks rather than behind them — the gradient that would let text sit on top of an image is worked out per picture, and it has not been worked out for this one yet.',
      });
    }
    return renderDirectionCard(d);
  }).join('\n');

  // Section 2 — the Deep Navy Portrait light-mode question.
  const section2Result = buildDirections({ directions: LIGHT_CANDIDATE_INPUTS });
  assertAllDirectionsPass('Section 2 — light candidates', section2Result);
  const notesById = Object.fromEntries(LIGHT_CANDIDATE_INPUTS.map((c) => [c.id, c.intent]));
  const section2Cards = section2Result.directions.map((d) => renderLightCandidateCard(d, notesById[d.id])).join('\n');

  const portraitAvailable = existsSync(PORTRAIT_HERO);
  const portraitHeroBlock = portraitAvailable
    ? `<div class="portrait-hero">
        <img class="portrait-hero-img" src="${dataUri(PORTRAIT_HERO, 'image/png')}" alt="The Deep Navy Portrait hero" />
        <p class="portrait-hero-note">The hero itself — shown here alongside the three candidates, never underneath any text. Its scrim (the gradient that would let text sit on top of it) has not been solved yet; that is a later milestone's work.</p>
      </div>`
    : `<p class="note-block"><b><code>assets/hero-sources/BW_Jisoo.png</code> is absent on this machine</b> — that directory is deliberately git-ignored (the theme is private and local only). Section 2 was built without the portrait image; the three light-mode candidates below are unaffected, since none of them puts the image behind text.</p>`;

  const html = buildPage({
    section1Cards, measuredSkippedNote,
    section2Cards, portraitHeroBlock,
  });
  assertChromeTokensResolve(html);
  writeFileSync(OUT, html);
  console.log(`sheet -> ${OUT}`);
  console.log(`bytes -> ${Buffer.byteLength(html, 'utf8')}`);
  console.log(`section 1 directions: ${section1Result.directions.map((d) => d.id).join(', ')}`);
  console.log(`section 2 candidates: ${section2Result.directions.map((d) => d.id).join(', ')}`);
  console.log(`portrait hero: ${portraitAvailable ? 'present, shown' : 'absent, skipped with a note'}`);
}

function mimeFor(p) {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  throw new Error(`build-palette-directions: unrecognised hero extension "${ext}" for ${p}`);
}

// REFUSE TO WRITE A SHEET WHOSE OWN TEXT COLOUR DOES NOT RESOLVE.
//
// Carried forward from build-palette-recommendation.mjs (the sheet this file
// replaces) because the bug it guards against is not hypothetical: that
// exact double-prefix shipped once, rendering pure black text on the navy
// ground at about 1.1:1, with fonts, images and overflow all green. See this
// file's varBlock()/shippedVarBlock() comment for the two key shapes that
// cause it.
const CHROME_TOKENS_REQUIRED = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-border',
  '--color-background-elevated-primary',
];

function assertChromeTokensResolve(html) {
  const doubled = /--color---/.exec(html);
  if (doubled) {
    throw new Error(
      'build-palette-directions: emitted a double-prefixed custom property ' +
      `(found "${html.slice(doubled.index, doubled.index + 40)}"). A parsed theme.css key already ` +
      'carries its "--color-" prefix — use shippedVarBlock() for those and varBlock() only for ' +
      'palette-engine.mjs palettes, whose keys are bare.'
    );
  }
  const missing = CHROME_TOKENS_REQUIRED.filter((t) => !html.includes(`${t}:`));
  if (missing.length) {
    throw new Error(
      `build-palette-directions: the sheet's own chrome reads ${missing.join(', ')} but nothing ` +
      'defines them, so those properties would fall back to their initial values and the page would ' +
      'render unreadable. Fix the :root block — do not drop the check.'
    );
  }
}

function buildPage({ section1Cards, measuredSkippedNote, section2Cards, portraitHeroBlock }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codexterity — palette directions (Plan 0003 M3b)</title>
<style>
${FONTS}
:root{
  ${shippedVarBlock(SHIPPED_DARK)}
  --page-ground:${SHIPPED_DARK['--color-background-surface'].replace(/\s*!important$/, '')};
}
*{box-sizing:border-box}
html,body{max-width:100%; overflow-x:hidden;}
body{margin:0; background:var(--page-ground); color:var(--color-text-primary);
  font-family:'Literata',Georgia,serif; font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;}
.wrap{max-width:1240px; margin:0 auto; padding:40px 24px 100px;}
h1{font-family:'Fraunces',Georgia,serif; font-variation-settings:'SOFT' 30,'WONK' 0; font-optical-sizing:auto;
  font-size:clamp(30px,4.6vw,46px); font-weight:600; margin:0 0 10px; letter-spacing:-.01em;}
h2{font-family:'Fraunces',Georgia,serif; font-variation-settings:'SOFT' 30,'WONK' 0; font-optical-sizing:auto;
  font-size:28px; font-weight:600; margin:56px 0 6px; border-top:1px solid var(--color-border); padding-top:40px;}
h3{font-family:'Fraunces',Georgia,serif; font-size:19px; font-weight:600; margin:0; display:flex; align-items:baseline; gap:8px;}
p{margin:0 0 8px;}
code{font-family:'Monaspace Neon',ui-monospace,monospace; font-size:12.5px; background:var(--color-token-bg-tertiary);
  padding:1px 5px; border-radius:3px; word-break:break-word;}
.eyebrow{font-size:11.5px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--color-background-button-primary); font-weight:700; margin:0 0 12px;}
.dek{color:var(--color-text-secondary); font-size:15px; max-width:80ch;}
.section-sub{color:var(--color-text-secondary); font-size:14.5px; max-width:82ch; margin:0 0 24px;}
.gate-note{margin-top:22px; border:1px solid var(--color-border-heavy); border-left:3px solid var(--color-background-button-primary);
  border-radius:0 6px 6px 0; padding:14px 18px; background:var(--color-background-elevated-primary); font-size:14px; max-width:82ch;}
.gate-note b{color:var(--color-text-primary);}
.note-block{border:1px dashed var(--color-border-heavy); border-radius:6px; padding:14px 18px; font-size:14px;
  color:var(--color-text-secondary); max-width:80ch; margin:16px 0;}

/* ── Direction / candidate cards ─────────────────────────────────────────── */
.direction-grid{display:grid; grid-template-columns:1fr; gap:26px;}
.direction-card, .candidate-card{border:1px solid var(--color-border-heavy); border-radius:10px; padding:22px 24px;
  background:var(--color-background-elevated-primary);}
.direction-head{margin-bottom:8px;}
.aa-mark{color:var(--color-background-button-primary); font-size:14px; cursor:default;}
.direction-intent{color:var(--color-text-secondary); font-size:14.5px; max-width:76ch; margin:6px 0 0;}
.swatch-row{display:flex; gap:16px; flex-wrap:wrap; margin:16px 0 4px;}
.swatch-item{display:flex; align-items:center; gap:8px; font-size:11px; color:var(--color-text-tertiary);}
.swatch-chip{width:30px; height:30px; border-radius:6px; border:1px solid var(--color-border-heavy); flex:none;}
.swatch-label code{background:none; padding:0; font-size:10.5px;}
.direction-hero, .portrait-hero{display:flex; gap:16px; align-items:center; flex-wrap:wrap; margin:14px 0;
  padding:12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-token-bg-tertiary);}
.direction-hero-img, .portrait-hero-img{width:220px; max-width:100%; border-radius:6px;
  border:1px solid var(--color-border-heavy); display:block; object-fit:cover;}
.direction-hero-note, .portrait-hero-note{flex:1; min-width:220px; font-size:13px; color:var(--color-text-secondary); margin:0;}

/* ── The mock windows — the real product, at real size ───────────────────── */
.mock-pair{display:flex; gap:18px; margin-top:18px; flex-wrap:wrap;}
.mockwin{flex:1; min-width:320px; border:1px solid var(--color-border-heavy); border-radius:9px; overflow:hidden;
  background:var(--color-background-surface); font-size:13px; color:var(--color-text-primary); box-shadow:0 14px 34px -18px rgba(0,0,0,.55);}
.mw-titlebar{display:flex; justify-content:space-between; align-items:center; padding:9px 14px;
  background:var(--color-background-elevated-primary); border-bottom:1px solid var(--color-border);
  font-family:'Fraunces',Georgia,serif; font-size:14px; font-weight:600;}
.mw-tb-mode{font-family:'Literata',Georgia,serif; font-weight:400; font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:.08em;}
.mw-body{display:flex; min-height:230px;}
.mw-side{width:36%; background:var(--color-background-surface-under); padding:14px 10px; display:flex; flex-direction:column; gap:3px;}
.mw-side-row{padding:8px 9px; border-radius:5px; font-size:12px; color:var(--color-text-secondary); position:relative;}
.mw-side-row-active{background:var(--color-background-button-secondary-hover); color:var(--color-text-primary); padding-left:16px; font-weight:600;}
.mw-side-mark{position:absolute; left:4px; top:50%; transform:translateY(-50%); width:3px; height:14px; border-radius:1px;
  background:var(--color-background-button-primary);}
.mw-main{flex:1; padding:16px 18px; min-width:0; display:flex; flex-direction:column; gap:11px;}
.mw-para{color:var(--color-text-secondary); font-size:12.5px; margin:0;}
.mw-card{border:1px solid var(--color-border); border-radius:6px; padding:12px 14px; background:var(--color-background-elevated-secondary);}
.mw-card-title{font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:13.5px; margin:0 0 4px;}
.mw-card-body{color:var(--color-text-tertiary); font-size:12px; margin:0 0 10px;}
.mw-btn{font:inherit; font-size:12px; font-weight:700; cursor:default; border:0; border-radius:5px; padding:7px 13px;
  background:var(--color-background-button-primary); color:var(--color-text-on-accent);}
.mw-code{border:1px solid var(--color-border); border-radius:6px; overflow:hidden; background:var(--color-token-diff-surface);}
.mw-code-head{padding:6px 10px; font-size:11px; color:var(--color-text-tertiary); background:var(--color-background-elevated-primary);
  border-bottom:1px solid var(--color-border-light);}
.mw-code-body{margin:0; padding:9px 10px; font-family:'Monaspace Neon',ui-monospace,monospace; font-size:11.5px;
  line-height:1.6; color:var(--syn-variable); white-space:pre-wrap; word-break:break-word;}
.mw-c{color:var(--syn-comment); font-style:italic;} .mw-k{color:var(--syn-keyword);} .mw-s{color:var(--syn-string);}
.mw-f{color:var(--syn-function);} .mw-o{color:var(--syn-operator);}

.candidate-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:22px;}
.candidate-mock-pair .mockwin{min-width:0;}

@media (max-width:760px){
  .mock-pair{flex-direction:column;}
  .direction-hero, .portrait-hero{flex-direction:column; align-items:stretch;}
  .direction-hero-img, .portrait-hero-img{width:100%;}
}
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">Codexterity · Plan 0003 M3b · palette directions</p>
  <h1>Pick a direction</h1>
  <p class="dek">Every card below is a complete, working palette — built by the same colour engine Captain's Cabin ships from, and checked for readability in both modes before it reached this page. Choose the one that reads right. The workings live in the build tool, not here.</p>
  <div class="gate-note">
    <p><b>The refusal this sheet enforces:</b> if any direction below had failed WCAG AA in either mode, this file would not exist. That is the same build-time gate as the rest of this project's theming pipeline — a failing palette is structurally unable to reach the owner's eyes.</p>
    <p>The ${AA_MARK} mark next to a name means exactly one thing: this direction cleared that gate. Nothing else on this page is a number.</p>
  </div>

  <h2>Section 1 — the five directions</h2>
  <p class="section-sub">Four hand-authored directions, plus whatever the supplied hero image itself suggests (if it suggests anything at all — a genuinely monochrome image contributes nothing, and that is not a failure).</p>
  ${measuredSkippedNote}
  <div class="direction-grid">
    ${section1Cards}
  </div>

  <h2>Section 2 — Deep Navy Portrait: the light-mode question</h2>
  <p class="section-sub">Dark mode is settled: the shipped navy palette, unchanged. The open question is light mode, because the shipped warm parchment was designed for a warm hero and this one is a cold monochrome portrait. Three candidates below hold dark fixed and vary only the light ground — pick the one that feels right next to the picture.</p>
  ${portraitHeroBlock}
  <div class="candidate-grid">
    ${section2Cards}
  </div>
</div>
</body>
</html>`;
}

main();
