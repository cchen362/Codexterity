// Builds the Plan 0003 M4 palette-directions decision sheet.
//
// This is a DECISION SURFACE, not an instrument report — same posture as the
// M3b file this replaces in place, tightened by D-0003-4 (owner ruling,
// 2026-08-05, docs/DECISIONS.md), which is this file's specification line by
// line:
//   (a) the hero image appears IN each option, behind the empty state where
//       it actually lives, with a scrim SOLVED PER OPTION (own ground, own
//       ink, own mode) via tools/palette/hero-scrim.mjs's solveScrimStops —
//       not beside the option as a reference thumbnail, which was the
//       previous sheet's dodge around an unsolved scrim.
//   (b) ONE dark/light toggle for the whole sheet, not a panel per mode.
//       Implemented below as an attribute on <html>; every option's dark AND
//       light mock windows are both in the DOM at all times, and the toggle
//       is pure CSS (`html[data-mode] .mode-<other> { display:none }`) so
//       nothing is rebuilt to switch — see the head of buildPage() for the
//       two-line rule this relies on.
//   (c) typography does not vary — Fraunces/Literata/Monaspace Neon on every
//       option, exactly as before.
//   (d) no engineering figures anywhere except the single AA_MARK glyph. The
//       previous sheet's hex captions under every swatch are GONE — a
//       swatch is a pure colour chip with a plain-language label now.
//
// Section 2 (the three light-ground candidates for Deep Navy Portrait) is
// DELETED, not hidden behind a flag. That question was settled 2026-08-05:
// the owner picked the shipped warm parchment on sight and rejected both
// cooler candidates (docs/DECISIONS.md's D-0003-4 amendment log / commit
// f3955e9). Keeping the dead section around "just in case" is exactly the
// kind of half-finished state this repo's engineering rules forbid.
//
// Data source: tools/palette/directions.mjs's AUTHORED_DIRECTIONS and
// buildDirections(). This file does not recompute a palette or re-run an
// audit — buildDirections() already derives and audits every direction
// through palette-engine.mjs and audit.mjs, and this builder only reads its
// results. The one NEW instrument this file calls is hero-scrim.mjs's
// solveScrimStops(), which did not exist before Plan 0003 M4 — it is what
// makes clause (a) possible at all.
//
// GENERALITY (kept from the M3b file, now applied to the whole sheet rather
// than one section of it): this builder takes an arbitrary hero plus an
// arbitrary direction set — nothing here is shaped around one photograph.
// The hero is resolved once, up front (see resolveHero() below), and every
// option card reads from that single resolution. A fresh clone lacking
// assets/hero-sources/ (BW_Jisoo.png is git-ignored, owner ruling 4) still
// runs: every option renders its empty state on flat ground with a plain
// note explaining why, never a broken <img> and never a silent omission.
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

// The private hero this pipeline was built for. Deliberately NOT falling
// back to the tracked calibration fixture (tests/fixtures/hero-empty-state.png)
// when this is absent and --hero was not given — that fixture exists to make
// hero-scrim.mjs's tests reproducible from a clone, not to stand in for a
// photograph the owner never supplied. Silently substituting one hero for
// another on a decision surface is exactly the kind of quiet omission
// D-0003-4 rules out; saying "no hero, flat ground" in words is not.
const PORTRAIT_HERO = resolve(ROOT, 'assets/hero-sources/BW_Jisoo.png');
if (heroOverridePath) {
  const resolvedOverride = resolve(process.cwd(), heroOverridePath);
  if (!existsSync(resolvedOverride)) {
    process.stderr.write(`build-palette-directions: --hero path does not exist: ${resolvedOverride}\n`);
    process.exit(1);
  }
}

// ── The data source (Plan 0003 M3b) ──────────────────────────────────────────
const { buildDirections, AUTHORED_DIRECTIONS } =
  await import(pathToFileURL(resolve(ROOT, 'tools/palette/directions.mjs')).href);
const { loadHeroImage, bandImage, solveScrimStops } =
  await import(pathToFileURL(resolve(ROOT, 'tools/palette/hero-scrim.mjs')).href);
const { hexToRgb } = await import(pathToFileURL(resolve(ROOT, 'tools/palette/palette-engine.mjs')).href);

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
// The sheet's chrome (page background, headings, the gate note, the mode
// toggle) uses the shipped Captain's Cabin dark palette so it never competes
// visually with the options it is displaying — unaffected by the per-option
// dark/light toggle, which only ever touches the mock windows.
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
// named, carried forward because it is what caused a page nobody could read
// to ship once already (Plan 0003 M3, measured fact #5). palette-engine
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

// THE ONE PERMITTED NUMBER-ADJACENT MARK. Not a ratio, not a percentage — a
// quiet glyph meaning "this direction cleared WCAG AA in both modes before it
// reached this page," which is the single fact the owner needs to trust from
// this sheet without reading a figure. Every direction shown here already
// carries this mark by construction (assertAllDirectionsPass below refuses to
// write the file otherwise), so it is decoration confirming a gate already
// passed, not a claim this page is making on its own.
const AA_MARK = '◆';

// A swatch is now a PURE colour chip with a plain-language label — no hex
// caption. D-0003-4(d) and the owner's own verdict on the sheet this
// replaces ("doesn't help or serve any purpose for me visually") name this
// exactly: the hex string was the thing to cut, not the chip itself.
function swatch(hex, label) {
  return `<span class="swatch-item"><span class="swatch-chip" style="background:${esc(hex)}"></span><span class="swatch-label">${esc(label)}</span></span>`;
}

// ── The build-time refusal ───────────────────────────────────────────────────
// Same reasoning as emit-theme.mjs's assertPalettesPassAA and the file this
// replaces: a direction that cannot pass audit.mjs must be structurally
// unable to reach the owner's eyes, not merely unlikely to. Throws and writes
// NOTHING if it fires.
function assertAllDirectionsPass(result) {
  if (result.passes) return;
  const failing = result.directions.filter((d) => !d.passes);
  const detail = failing.map((d) =>
    `'${d.id}' — dark: ${d.failures.dark.join(', ') || '(none)'}; light: ${d.failures.light.join(', ') || '(none)'}`
  ).join(' | ');
  throw new Error(
    `build-palette-directions: REFUSING TO RENDER — at least one direction failed audit.mjs: ${detail}. ` +
    'A direction must pass WCAG AA in both modes before it is shown to the owner.'
  );
}

function mimeFor(p) {
  const ext = extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  throw new Error(`build-palette-directions: unrecognised hero extension "${ext}" for ${p}`);
}

// ── Resolving ONE hero for the whole sheet ───────────────────────────────────
//
// Every option card reads from this single resolution — there is exactly one
// hero per build, never one per direction, because the hero is the fixed
// input the directions are all being compared against.
//
//   --hero <path>   always wins, must exist (checked above), any read error
//                    is fatal (an explicitly-requested hero that cannot be
//                    decoded is a bug to fix, not something to degrade past).
//   otherwise       the private portrait, if present on this machine.
//   otherwise       no hero at all — every option renders on flat ground
//                    with a note explaining why, per D-0003-4(a)'s "never a
//                    broken image and never a silent omission."
function resolveHero() {
  const path = heroOverridePath ? resolve(process.cwd(), heroOverridePath)
    : existsSync(PORTRAIT_HERO) ? PORTRAIT_HERO
    : null;
  if (!path) {
    return {
      image: null, bands: null, dataUri: null,
      note: 'No hero photograph is present on this machine — <code>assets/hero-sources/</code> is deliberately not tracked by git, because the source photo is private. Every option below renders its empty state on flat ground instead. Pass <code>--hero &lt;path&gt;</code> to preview with a picture.',
    };
  }
  const image = loadHeroImage(path); // throws loudly on a bad --hero; that is correct here
  return {
    image,
    bands: bandImage(image), // computed once, reused by every option/mode's scrim solve
    dataUri: dataUri(path, mimeFor(path)),
    note: '',
  };
}

// Turn a solved scrim's stops into the CSS gradient that actually paints it.
// The blend the solver assumes (hero-scrim.mjs's blend()) mixes each pixel
// TOWARD the ground colour, so the gradient overlay is that same ground
// colour at the solved alphas — this function must not invent a different
// tint or the rendered page stops matching what was proven.
function scrimGradient(stops, groundHex) {
  const [r, g, b] = hexToRgb(groundHex);
  const stopsCss = stops.map(([f, a]) => `rgba(${r},${g},${b},${a}) ${(f * 100).toFixed(1)}%`).join(', ');
  return `linear-gradient(180deg, ${stopsCss})`;
}

// ── The mock window: one mode instance of one direction ─────────────────────
//
// Both the dark instance and the light instance of every direction are
// always in the DOM (D-0003-4(b)) — the toggle in buildPage()'s CSS is what
// decides which one is visible, so switching modes never rebuilds anything.
function renderMockWindow(mode, d, hero) {
  const palette = d.palettes[mode];
  const syn = d.syntax[mode];
  const groundHex = mode === 'dark' ? d.dark.groundHex : d.light.groundHex;
  const inkHex = palette['text-primary'];
  const style = `${varBlock(palette)}${synBlock(syn)}`;

  let heroLayers = '';
  let scrimNote = '';
  if (hero.image) {
    // Solved for THIS option's own ground and ink, in THIS mode — the load-
    // bearing part of D-0003-4(a). A shared scrim across options would be
    // proven for none of them; each ground/ink pair needs its own plateau.
    const scrim = solveScrimStops({ bands: hero.bands, ground: groundHex, ink: inkHex, mode });
    const gradient = scrimGradient(scrim.stops, groundHex);
    // The photo itself is NOT re-embedded per instance — see buildPage()'s
    // --hero-url custom property, defined once at :root. Eight copies of a
    // ~1.5MB portrait (four directions × two modes) would balloon this file
    // toward 16MB for a picture that never changes between them; the CSS
    // custom property lets every .mw-hero-photo reference the same encoded
    // bytes exactly once. Only the solved veil differs per instance.
    heroLayers = `
          <div class="mw-hero-photo"></div>
          <div class="mw-hero-veil" style="background:${gradient}"></div>`;
    if (!scrim.passes) {
      // The bisection in solveScrimStops brackets an answer at alpha=1 (the
      // ground itself, whose contrast against the ink is this palette's own
      // audited figure), so this branch is not expected to fire for an
      // audited direction — it exists because D-0003-4(a) requires the
      // sheet to SAY SO rather than assume it never will.
      scrimNote = `<p class="mw-hero-note">The picture can’t stay legible behind this text in ${mode} mode — shown as covered as it can be while the words still read.</p>`;
    }
  }

  return `
    <div class="mockwin mode-${mode}" style="${style}">
      <div class="mw-titlebar"><span class="mw-tb-title">Codex</span><span class="mw-tb-mode">${esc(mode)}</span></div>
      <div class="mw-body">
        <aside class="mw-side">
          <div class="mw-side-row">Draft the recipe</div>
          <div class="mw-side-row mw-side-row-active"><span class="mw-side-mark"></span>Review the palette</div>
          <div class="mw-side-row">Solve the scrim</div>
        </aside>
        <main class="mw-main">
          <div class="mw-hero">${heroLayers}
            <div class="mw-hero-content">
              <p class="mw-hero-heading">What should we build?</p>
              <div class="mw-composer">
                <span class="mw-composer-placeholder">Ask Codex to work in this workspace…</span>
                <span class="mw-send">→</span>
              </div>
            </div>
            ${scrimNote}
          </div>
          <div class="mw-card">
            <p class="mw-card-title">${esc(d.name)}</p>
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

function renderDirectionCard(d, hero) {
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
      <div class="mock-stack">
        ${renderMockWindow('dark', d, hero)}
        ${renderMockWindow('light', d, hero)}
      </div>
    </article>`;
}

// REFUSE TO WRITE A SHEET WHOSE OWN TEXT COLOUR DOES NOT RESOLVE.
//
// Carried forward from the file this replaces because the bug it guards
// against is not hypothetical: that exact double-prefix shipped once,
// rendering pure black text on the navy ground at about 1.1:1, with fonts,
// images and overflow all green. See varBlock()/shippedVarBlock()'s comment
// above for the two key shapes that cause it.
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

// ── Main ──────────────────────────────────────────────────────────────────────
function main() {
  const hero = resolveHero();

  const result = buildDirections(
    hero.image ? { image: hero.image, inheritFrom: 'navy' } : { directions: AUTHORED_DIRECTIONS }
  );
  assertAllDirectionsPass(result);

  let heroNote = hero.note;
  if (hero.image && !result.directions.some((d) => d.id === 'from-image')) {
    heroNote = 'This hero names no hue in either its dark mass or its brightest glow — a genuinely monochrome or near-neutral image. No measured direction was added; the authored directions below stand on their own, each still shown with the hero behind its empty state.';
  }

  const directionCards = result.directions.map((d) => renderDirectionCard(d, hero)).join('\n');

  const html = buildPage({ directionCards, heroNote, heroDataUri: hero.dataUri });
  assertChromeTokensResolve(html);
  writeFileSync(OUT, html);
  console.log(`sheet -> ${OUT}`);
  console.log(`bytes -> ${Buffer.byteLength(html, 'utf8')}`);
  console.log(`directions: ${result.directions.map((d) => d.id).join(', ')}`);
  console.log(`hero: ${hero.image ? 'present, shown per-option with a solved scrim' : 'absent, every option on flat ground'}`);
}

function buildPage({ directionCards, heroNote, heroDataUri }) {
  return `<!doctype html>
<html lang="en" data-mode="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Codexterity — palette directions (Plan 0003 M4)</title>
<style>
${FONTS}
:root{
  ${shippedVarBlock(SHIPPED_DARK)}
  --page-ground:${SHIPPED_DARK['--color-background-surface'].replace(/\s*!important$/, '')};
  ${heroDataUri ? `--hero-url:url(${heroDataUri});` : ''}
}
*{box-sizing:border-box}
html,body{max-width:100%; overflow-x:hidden;}
body{margin:0; background:var(--page-ground); color:var(--color-text-primary);
  font-family:'Literata',Georgia,serif; font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;}
.wrap{max-width:1240px; margin:0 auto; padding:32px 20px 100px;}
h1{font-family:'Fraunces',Georgia,serif; font-optical-sizing:auto;
  font-size:clamp(28px,4.6vw,46px); font-weight:600; margin:0 0 10px; letter-spacing:-.01em;}
h3{font-family:'Fraunces',Georgia,serif; font-size:19px; font-weight:600; margin:0; display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;}
p{margin:0 0 8px;}
code{font-family:'Monaspace Neon',ui-monospace,monospace; font-size:12.5px; background:var(--color-token-bg-tertiary);
  padding:1px 5px; border-radius:3px; word-break:break-word;}
.eyebrow{font-size:11.5px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--color-background-button-primary); font-weight:700; margin:0 0 12px;}
.dek{color:var(--color-text-secondary); font-size:15px; max-width:80ch;}
.gate-note{margin-top:22px; border:1px solid var(--color-border-heavy); border-left:3px solid var(--color-background-button-primary);
  border-radius:0 6px 6px 0; padding:14px 18px; background:var(--color-background-elevated-primary); font-size:14px; max-width:82ch;}
.gate-note b{color:var(--color-text-primary);}
.note-block{border:1px dashed var(--color-border-heavy); border-radius:6px; padding:14px 18px; font-size:14px;
  color:var(--color-text-secondary); max-width:80ch; margin:20px 0;}

/* ── Mode toggle — sheet-wide state, not per option (D-0003-4(b)) ────────── */
.controls{position:sticky; top:10px; z-index:10; display:flex; align-items:center; gap:10px;
  padding:8px; margin:24px 0 4px; width:max-content; background:color-mix(in oklab,var(--color-background-elevated-primary) 92%,transparent);
  border:1px solid var(--color-border-heavy); border-radius:9px; backdrop-filter:blur(10px);}
.control-label{margin-left:2px; color:var(--color-text-tertiary); font-size:10px; font-weight:700; letter-spacing:.13em; text-transform:uppercase;}
.seg{display:flex; gap:3px; padding:3px; background:var(--color-background-surface); border:1px solid var(--color-border); border-radius:7px;}
.seg button{font:inherit; border:0; border-radius:4px; padding:6px 12px; background:transparent; color:var(--color-text-secondary); cursor:pointer; font-size:12.5px;}
.seg button[aria-pressed="true"]{background:var(--color-background-button-primary); color:var(--color-text-on-accent); font-weight:600;}

/* ── Direction cards ──────────────────────────────────────────────────────── */
.direction-grid{display:grid; grid-template-columns:1fr; gap:26px; margin-top:22px;}
.direction-card{border:1px solid var(--color-border-heavy); border-radius:10px; padding:20px;
  background:var(--color-background-elevated-primary);}
.direction-head{margin-bottom:8px;}
.aa-mark{color:var(--color-background-button-primary); font-size:14px; cursor:default;}
.direction-intent{color:var(--color-text-secondary); font-size:14.5px; max-width:76ch; margin:6px 0 0;}
.swatch-row{display:flex; gap:16px; flex-wrap:wrap; margin:16px 0 4px;}
.swatch-item{display:flex; align-items:center; gap:8px; font-size:11px; color:var(--color-text-tertiary);}
.swatch-chip{width:26px; height:26px; border-radius:6px; border:1px solid var(--color-border-heavy); flex:none;}

/* ── The mock windows — the real product, at real size ───────────────────── */
/* Both mode instances of every direction stay in the DOM at all times; this
   pair of rules is the ENTIRE mode toggle — flipping html[data-mode] is the
   only thing the toggle script below does. */
html[data-mode="dark"] .mode-light{display:none;}
html[data-mode="light"] .mode-dark{display:none;}

.mock-stack{margin-top:16px;}
.mockwin{border:1px solid var(--color-border-heavy); border-radius:9px; overflow:hidden;
  background:var(--color-background-surface); font-size:13px; color:var(--color-text-primary);
  box-shadow:0 14px 34px -18px rgba(0,0,0,.5);}
.mw-titlebar{display:flex; justify-content:space-between; align-items:center; padding:9px 14px;
  background:var(--color-background-elevated-primary); border-bottom:1px solid var(--color-border);
  font-family:'Fraunces',Georgia,serif; font-size:14px; font-weight:600;}
.mw-tb-mode{font-family:'Literata',Georgia,serif; font-weight:400; font-size:11px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:.08em;}
.mw-body{display:flex; min-height:360px;}
.mw-side{width:170px; flex:none; background:var(--color-background-surface-under); padding:14px 10px; display:flex; flex-direction:column; gap:3px;}
.mw-side-row{padding:8px 9px; border-radius:5px; font-size:12px; color:var(--color-text-secondary); position:relative;}
.mw-side-row-active{background:var(--color-background-button-secondary-hover); color:var(--color-text-primary); padding-left:16px; font-weight:600;}
.mw-side-mark{position:absolute; left:4px; top:50%; transform:translateY(-50%); width:3px; height:14px; border-radius:1px;
  background:var(--color-background-button-primary);}
.mw-main{flex:1; min-width:0; padding:16px 18px; display:flex; flex-direction:column; gap:12px;}

.mw-hero{position:relative; overflow:hidden; min-height:190px; border-radius:8px; border:1px solid var(--color-border);
  display:flex; align-items:flex-end; padding:16px; background:var(--color-background-surface);}
.mw-hero-photo{position:absolute; inset:0; background-image:var(--hero-url); background-size:cover; background-position:center center;}
.mw-hero-veil{position:absolute; inset:0;}
.mw-hero-content{position:relative; z-index:1; width:100%; max-width:360px;}
.mw-hero-heading{font-family:'Fraunces',Georgia,serif; font-size:16px; font-weight:600; margin:0 0 9px; color:var(--color-text-primary);}
.mw-hero-note{position:relative; z-index:1; margin:8px 0 0; font-size:10.5px; color:var(--color-text-secondary); max-width:340px;}
.mw-composer{display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:6px;
  background:var(--color-background-elevated-primary); border:1px solid var(--color-border-heavy);}
.mw-composer-placeholder{flex:1; font-size:12px; color:var(--color-text-tertiary);}
.mw-send{width:22px; height:22px; flex:none; border-radius:5px; background:var(--color-background-button-primary);
  color:var(--color-text-on-accent); display:flex; align-items:center; justify-content:center; font-size:12px;}

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

@media (max-width:480px){
  .mw-body{flex-direction:column;}
  .mw-side{width:100%; flex-direction:row; flex-wrap:wrap;}
  .mw-hero-content{max-width:100%;}
}
</style>
</head>
<body>
<div class="wrap">
  <p class="eyebrow">Codexterity · Plan 0003 M4 · palette directions</p>
  <h1>Pick a direction</h1>
  <p class="dek">Every card below is a complete, working palette — built by the same colour engine Captain's Cabin ships from, and checked for readability in both modes before it reached this page. The hero photo sits behind the empty state exactly where it lives in the app, under a covering solved for that option's own colours. Choose the one that reads right.</p>
  <div class="gate-note">
    <p><b>The refusal this sheet enforces:</b> if any direction below had failed WCAG AA in either mode, this file would not exist. That is the same build-time gate as the rest of this project's theming pipeline — a failing palette is structurally unable to reach the owner's eyes.</p>
    <p>The ${AA_MARK} mark next to a name means exactly one thing: this direction cleared that gate. Nothing else on this page is a number.</p>
  </div>
  ${heroNote ? `<p class="note-block">${heroNote}</p>` : ''}

  <section class="controls" aria-label="Mode toggle">
    <span class="control-label">Mode</span>
    <div class="seg" id="mode-controls">
      <button type="button" data-mode="dark" aria-pressed="true">Dark</button>
      <button type="button" data-mode="light" aria-pressed="false">Light</button>
    </div>
  </section>

  <div class="direction-grid">
    ${directionCards}
  </div>
</div>
<script>
(function () {
  // The ENTIRE toggle. Both modes for every option are already in the DOM
  // (see the "html[data-mode]" CSS rules above); this only ever flips one
  // attribute, so there is nothing here that reconstructs a card.
  var root = document.documentElement;
  document.getElementById('mode-controls').addEventListener('click', function (event) {
    var button = event.target.closest('button');
    if (!button) return;
    root.dataset.mode = button.dataset.mode;
    this.querySelectorAll('button').forEach(function (candidate) {
      candidate.setAttribute('aria-pressed', String(candidate === button));
    });
  });
})();
</script>
</body>
</html>`;
}

main();
