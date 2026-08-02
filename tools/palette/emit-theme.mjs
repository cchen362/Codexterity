// Emits themes/captains-cabin/theme.css, syntax.json and manifest.json from the
// derivation engine, so the shipped values are exactly the ones the owner
// approved from the mockup.
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDark, buildLight, buildSyntax, GROUNDS, ratio } from './palette-engine.mjs';
import { run, runSyntax } from './audit.mjs';

const GROUND = 'navy';
// Resolved from this file's own location, never from a machine-specific absolute
// path: the emitter has to run on the packaging machine and on a collaborator's
// checkout, and a hardcoded C:\ path makes it silently a Windows-only tool.
const OUT = fileURLToPath(new URL('../../themes/captains-cabin/', import.meta.url)).replace(/\\/g, '/');
const dark = buildDark(GROUNDS[GROUND].ground);
const light = buildLight(GROUNDS[GROUND].ground);
const synDark = buildSyntax(dark, 'dark');
const synLight = buildSyntax(light, 'light');

for (const [name, p, s] of [['dark', dark, synDark], ['light', light, synLight]]) {
  const bad = [...run(p), ...runSyntax(s)].filter((x) => !x.pass);
  if (bad.length) throw new Error(`${name} mode fails AA: ${bad.map((b) => b.label).join(', ')}`);
}

const GROUPS = [
  ['Surfaces — the six-step ground ramp', [
    'background-surface', 'token-main-surface-primary', 'token-bg-secondary',
    'background-elevated-primary', 'background-elevated-secondary', 'token-bg-tertiary',
    'token-diff-surface',
  ]],
  ['Text — four tiers of ink', [
    'text-primary', 'text-foreground', 'token-foreground', 'text-secondary',
    'text-foreground-secondary', 'text-tertiary', 'text-quaternary', 'text-on-accent',
  ]],
  ['Status ink', ['text-success', 'text-warning', 'text-error']],
  ['Borders', ['border-light', 'border', 'border-heavy', 'border-focus']],
  ['Brass — the single accent', [
    'background-button-primary', 'background-button-primary-hover',
    'background-button-primary-active', 'background-button-secondary',
  ]],
  ['Icons', ['icon-primary', 'icon-secondary', 'icon-tertiary']],
  ['Status & diff surfaces', [
    'background-status-success', 'background-status-warning', 'background-status-error',
    'background-danger-active', 'editor-added', 'editor-deleted',
  ]],

  // ── Added 2026-08-01 from the measured inventory ───────────────────────────
  // docs/research/phase3-inventory-findings.md found Codex defines 97 custom
  // properties on .electron-dark and this theme claimed 24. These are the rest of
  // the ones with downstream paint impact — the tokens that were leaving the
  // sidebar, menus, editor surfaces and every accent stock in the running app.
  ['Chrome surfaces the app paints separately', [
    'background-surface-under', 'background-panel', 'background-editor-opaque',
    'background-elevated-primary-opaque', 'background-elevated-secondary-opaque',
    'background-control', 'background-control-opaque',
  ]],
  ['Application menu bar', [
    'background-application-menu', 'foreground-application-menu',
    'border-application-menu-separator',
  ]],
  ['Accent — brass, and the two decorative hues that collapse into it (D-0001-11)', [
    'text-accent', 'icon-accent', 'accent-blue', 'accent-purple',
    'background-accent', 'background-accent-hover', 'background-accent-active',
  ]],
  ['Status hues — kept DISTINCT on purpose (D-0001-11)', [
    'accent-green', 'accent-red', 'accent-orange', 'accent-yellow',
    'icon-success', 'icon-warning', 'icon-error',
    'border-error', 'border-warning',
    'decoration-added', 'decoration-deleted', 'decoration-modified', 'decoration-unchanged',
  ]],
  ['Interaction states — list rows and secondary buttons', [
    'background-button-secondary-hover', 'background-button-secondary-active',
    'background-button-tertiary', 'background-button-tertiary-hover',
    'background-button-tertiary-active',
  ]],
  ['Button and tertiary ink', [
    'text-button-primary', 'text-button-secondary', 'text-button-tertiary',
    'text-foreground-tertiary',
  ]],
];

// The terminal's 16 ANSI slots. Codex names these on .electron-dark under their
// VS Code spellings, and they reach the terminal through --color-token-terminal-*.
// They are mapped from tokens already solved for this ground rather than left
// stock, so a terminal does not become the one window in the app still wearing
// OpenAI's palette. Programs rely on these being DISTINGUISHABLE, which is the
// same reason D-0001-11 keeps the status hues apart.
const ansi = (p, syn) => ({
  Black: p['text-quaternary'],        BrightBlack: p['text-tertiary'],
  Red: p['text-error'],               BrightRed: p['text-error'],
  Green: p['text-success'],           BrightGreen: p['text-success'],
  Yellow: p['text-warning'],          BrightYellow: p['text-warning'],
  Blue: syn.number,                   BrightBlue: syn.number,
  Magenta: syn.keyword,               BrightMagenta: syn.keyword,
  Cyan: syn.type,                     BrightCyan: syn.type,
  White: p['text-secondary'],         BrightWhite: p['text-primary'],
});

// ── The empty-state hero (D-0001-9) ──────────────────────────────────────────
//
// Approved 2026-08-01, shipped as a file the same day — and never referenced by
// anything until now, so it has never actually been on screen. This wires it in.
//
// WHERE IT ATTACHES. Codex offers no class named for the empty state, and its
// CSS-module classes are build-hashed and unusable as landmarks. The hook used
// here is `[container-name:home-main-content]` — a Tailwind arbitrary-property
// class whose name IS its declaration (`container-name: home-main-content`), so
// it is authored and semantic rather than a build artefact. It is further gated
// on `:has(.heading-xl)`, the empty state's own centred heading, so the image
// cannot paint behind a loaded conversation. If either stops matching, the
// empty state falls back to flat ground — the pre-hero look, not breakage.
//
// FULL BLEED, which is what was approved. D-0001-8 rejected a full-bleed
// atmospheric background behind THE WHOLE APP and narrowed it to *empty states
// only*; asset-manifest.md describes the hero as sitting "behind the
// new-session screen ... under a scrim". A first attempt shipped it as a
// top-anchored band with no scrim at all, which read as an awkward banner with
// a hard horizontal seam. The scrim is a CSS layer we apply, not something
// baked into the image — that is what "under a scrim" meant.
//
// WHY THIS DOES NOT VOID THE CONTRAST PROOF (D-0001-6). D-0001-6 forbids
// luminance variation BEHIND TEXT; it does not forbid imagery. The scrim's
// stops are SOLVED, not chosen by eye: for every horizontal band of the image,
// the brightest pixel in that band is blended with the ground at that band's
// scrim alpha, and the result is checked against --color-text-primary. Over the
// whole region where text can sit (the heading and everything below it) the
// worst case is 5.99:1 against a 4.5:1 requirement. The measurement is
// deliberately pessimistic: it samples the brightest pixel across the image's
// full width, while `cover` on a tall panel crops to the centre.
//
// If the hero is ever regraded or replaced, RE-SOLVE the scrim — do not assume
// these stops still hold. The scrim and the image are one proof, not two.
const heroB64 = readFileSync(OUT + 'assets/hero-empty-state.webp').toString('base64');
const heroBytes = statSync(OUT + 'assets/hero-empty-state.webp').size;

// Codex exposes --color-token-* aliases alongside the --color-* names; both are
// set so a utility reading either resolves to the same value.
const ALIAS = {
  'token-border-default': 'border',
  'token-border-light': 'border-light',
  'token-border-heavy': 'border-heavy',
};

// ── Fonts ────────────────────────────────────────────────────────────────────
//
// D-0001-7 (typography half, CLOSED 2026-08-01): Fraunces for DISPLAY, Literata
// for UI/body, Monaspace Neon for code. The owner chose Literata at 14px from
// the rendered comparison in docs/mockups/0003-typography-comparison.html.
//
// THE FONTS ARE EMBEDDED, and that is not a packaging nicety — it is the fix for
// a bug this change exists to correct. Until now theme.css named 'Fraunces' with
// no @font-face, and Fraunces is not installed on either dev machine, so the app
// silently rendered the CSS fallback: Georgia. Gate 0 recorded "Fraunces renders
// throughout the app — CONFIRMED (by inheritance from the theme class)"; what was
// actually confirmed was that the *declaration* inherits, never that the face
// loaded. A font-family that names an unavailable face fails silently and looks
// like success, so any future font change must be verified with
// document.fonts.check(), not by reading a computed font-family.
//
// Axis ranges below are read from the files with fontTools, not assumed:
//   Fraunces  opsz 9-144, wght 100-900, SOFT 0-100, WONK 0-1
//   Literata  wght 400-900
//   Monaspace Neon  static 400
const FONT_DIR = OUT + 'assets/fonts/';
const face = (family, file, extra) => {
  const b64 = readFileSync(FONT_DIR + file).toString('base64');
  return `@font-face {
  font-family: '${family}';
  src: url(data:font/woff2;base64,${b64}) format('woff2');
${extra}
  /* swap, never block: the theme is injected after first paint, so blocking
     would hide text that Codex has already rendered legibly. */
  font-display: swap;
}`;
};

// One list, three consumers: the @font-face blocks, the size accounting in the
// generated header, and manifest.json's assets[]. assets/fonts/ also holds five
// faces this theme does NOT use -- the losing candidates from the typography
// comparison (docs/mockups/0003-typography-comparison.html) plus the superseded
// Monaspace Xenon. They stay in the repo as the record of that decision and must
// never reach a .ccskin, which is precisely why the package's asset list is
// derived from here rather than from a directory listing.
//
// The OFL text ships with each face. SIL OFL 1.1 requires the licence to
// accompany the font, and the font travels inside theme.css as a data URI, so
// the licence has to travel in the package alongside it. Not optional.
const FONTS = [
  { family: 'Literata', file: 'literata-latin-variable.woff2', licence: 'Literata-OFL.txt',
    extra: '  font-weight: 400 900;\n  font-style: normal;' },
  { family: 'Fraunces', file: 'fraunces-latin-variable.woff2', licence: 'Fraunces-OFL.txt',
    extra: '  font-weight: 100 900;\n  font-style: normal;' },
  { family: 'Monaspace Neon', file: 'monaspace-neon-latin-400.woff2', licence: 'Monaspace-OFL.txt',
    extra: '  font-weight: 400;\n  font-style: normal;' },
];

const fontFaces = FONTS.map((f) => face(f.family, f.file, f.extra)).join('\n\n');

const fontBytes = FONTS.reduce((n, f) => n + statSync(FONT_DIR + f.file).size, 0);

// Codex reads its font families through tokens, exactly as it does colour, so
// the split is expressed token-first (D-0001-2) rather than by chasing elements.
// The root font-family below is the catch-all for rules that hardcode a stack.
const FONT_TOKENS = {
  'font-sans': "'Literata', Georgia, serif",
  'font-sans-default': "'Literata', Georgia, serif",
  'font-serif': "'Literata', Georgia, serif",
  'font-openai-sans': "'Literata', Georgia, serif",
  'default-font-family': "'Literata', Georgia, serif",
  'font-mono': "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'font-mono-default': "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'default-mono-font-family': "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'vscode-editor-font-family': "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

// Every token declaration is marked !important, and that is a measured
// requirement rather than a specificity shortcut. See the D-0001-12 note in the
// generated file header for the full reasoning.
const decl = (name, value) => `  ${name}: ${value} !important;`;

const block = (sel, p, syn, label) => {
  const lines = [`.${sel} {`, `  /* ${label} */`];
  for (const [title, keys] of GROUPS) {
    lines.push('', `  /* ${title} */`);
    for (const k of keys) lines.push(decl(`--color-${k}`, p[k]));
  }
  lines.push('', '  /* Aliased spellings of the same values */');
  for (const [alias, src] of Object.entries(ALIAS)) lines.push(decl(`--color-${alias}`, p[src]));
  lines.push('', '  /* Terminal — the 16 ANSI slots, under Codex\'s VS Code spellings */');
  for (const [slot, hex] of Object.entries(ansi(p, syn))) {
    lines.push(decl(`--vscode-terminal-ansi${slot}`, hex));
  }
  lines.push('', '  /* Font families — Codex reads these as tokens, like colour (D-0001-7) */');
  for (const [name, stack] of Object.entries(FONT_TOKENS)) lines.push(decl(`--${name}`, stack));
  lines.push('', '  /* Syntax palette — consumed by the editor layer (see syntax.json) */');
  for (const [role, hex] of Object.entries(syn)) {
    if (role === '_surface') continue;
    lines.push(decl(`--cc-syntax-${role}`, hex));
  }
  lines.push('}');
  return lines.join('\n');
};

const css = `/*
 * Captain's Cabin — a theme package for Codexterity
 * ------------------------------------------------
 * Ground: deep navy (${GROUNDS[GROUND].ground}). Accent: antique brass, used sparingly.
 * Light mode is weathered parchment carrying navy ink.
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THIS THEME'S TOKEN VALUES.
 * Mockups and palette studies under docs/ are design inputs; no other file
 * carries a copy of these values. See docs/ENGINEERING.md § Design & Aesthetic Rules.
 *
 * Every value is derived in OKLCH and solved against a WCAG AA target rather than
 * chosen by eye; the derivation lives in tools/palette/palette-engine.mjs and the
 * check in tools/palette/audit.mjs. Regenerate with:  node tools/palette/emit-theme.mjs
 *
 * D-0001-2 — Token-first styling. Every rule below redefines one of Codex's own
 * semantic custom properties on its root theme class. Codex is Tailwind v4 with a
 * token layer, so a single override cascades through every bg-token- and
 * text-token- utility — including UI OpenAI has not shipped yet. Structural
 * selectors are a last resort; each one is a declared LANDMARK, marked as such
 * below, and degrades to the stock look rather than breaking if it stops matching.
 *
 * D-0001-12 — Every declaration below is !important, and it has to be.
 *
 * Codex writes 67 custom properties as an INLINE style on <html> a moment after
 * boot, and 47 of them are ones this theme also defines. An inline declaration
 * outranks every non-important author rule at any specificity, so without
 * !important the theme applies at dom-ready and is then silently reverted: our
 * <style> element is still in the document (verified present), still last in
 * <head>, and simply outranked. Measured directly — with CDX_VERIFY_AT=15000 the
 * settled re-check read --color-background-surface back as Codex's stock
 * #111111 while our own inert token --color-text-primary, which Codex never
 * writes inline, still read #F4EAD4.
 *
 * This is the author-origin cost recorded in D-0001-1's amendment coming due. A
 * USER-origin stylesheet — what webContents.insertCSS() would have given us —
 * beats inline styles without !important, but insertCSS is broken on this
 * Electron fork. !important is not a specificity shortcut here; it is the only
 * cascade mechanism that reaches an inline declaration at all.
 *
 * It is safe in scope: these are custom-property DEFINITIONS. Marking a
 * definition important fixes which value the variable holds; it forces nothing
 * on the properties that read it, so Codex's own layout and state rules keep
 * winning normally.
 *
 * D-0001-6 — Surfaces are FLAT token colour. No tiling texture, no gradient wash
 * behind content. Every contrast figure this theme claims is computed against a
 * flat colour; luminance variation behind text would make the governing value the
 * worst pixel rather than the average, and readability is this project's first law.
 * Do not reintroduce surface textures without redoing the contrast proof.
 */

/*
 * The three faces, embedded. See the Typography section below for the roles and
 * for why embedding is a correctness requirement rather than a packaging step.
 */
${fontFaces}

${block('electron-dark', dark, synDark, 'Dark — the night watch')}

${block('electron-light', light, synLight, 'Light — the chart room by day')}

/*
 * Shape. Tighter than stock: joinery, not pillows.
 */
.electron-dark,
.electron-light {
  --radius-sm: 3px !important;
  --radius-md: 5px !important;
  --radius-lg: 7px !important;
  --radius-xl: 9px !important;
  --radius-2xl: 12px !important;
  --radius-3xl: 16px !important;
  --radius-4xl: 20px !important;
  --radius-full: 9999px !important;
}

/*
 * Typography.
 *
 * D-0001-7 (typography half) CLOSED 2026-08-01. Three faces, three jobs:
 * Fraunces for DISPLAY, Literata for UI and body, Monaspace Neon for code. All
 * three SIL OFL 1.1 and redistributable inside the .ccskin, and all three are
 * embedded above as data URIs — the theme references no remote resource and
 * depends on nothing being installed on the user's machine.
 *
 * The split replaces Fraunces doing double duty. The owner reopened the decision
 * after long sessions in the real app and then chose Literata at 14px from a
 * rendered comparison of seven candidates
 * (docs/mockups/0003-typography-comparison.html). Fraunces keeps the headings,
 * where its stroke contrast is an asset rather than a tax on the eyes.
 *
 * 'pre, code, kbd, samp' below is one of only two structural selector groups the
 * theme uses (the other is the .heading-* set). Both are semantic or authored
 * names rather than CSS-module hashes, and both degrade to a legible fallback.
 *
 * STATUS: unverified, not disproven. It matches nothing on Codex's empty state —
 * which contains no code, so that is expected rather than evidence of absence
 * (docs/research/phase3-inventory-findings.md §4.3). It must be re-probed on a
 * screen containing a code block. If it never matches, code renders in the stock
 * monospace stack and nothing breaks; the code SURFACE is themed regardless,
 * through --color-background-editor-opaque, which needs no selector.
 */
/* UI and body — Literata. Inherited from the theme class, which covers the rules
 * that hardcode a font stack rather than reading --font-sans. */
.electron-dark,
.electron-light {
  font-family: 'Literata', Georgia, serif !important;
  font-variation-settings: normal;
}

/* D-0001-18 — RE-DECLARED ON <body>, AND IT HAS TO BE.
 *
 * Codex sets this same token on BODY, measured in the probe corpus:
 *
 *   :is([data-codex-window-type=browser],[…=chrome-extension],[…=electron]) body {
 *     --vscode-editor-font-family: ui-monospace, "SFMono-Regular", …, monospace;
 *   }
 *
 * Our block above declares it on .electron-dark / .electron-light, which are on
 * <html>. Custom properties INHERIT, so a value set on body wins for body and
 * everything under it no matter what html says — this is not a specificity
 * contest, and !important on the html declaration cannot win it. Measured
 * consequence: the diff and terminal panels rendered in ui-monospace, i.e.
 * Consolas on Windows, so D-0001-7's code face was absent from the one surface
 * most made of code while every colour around it was correctly themed.
 *
 * Same shape as D-0001-12, one level down: that one handled Codex writing tokens
 * inline on <html>, and nobody checked whether it also wrote any on <body>. A
 * corpus sweep says it sets 17 custom properties there and exactly two collide
 * with this theme. The other, --color-background-elevated-primary, is benign —
 * it re-points our token to our own --color-background-elevated-primary-opaque,
 * which this emitter always gives the same value, and its rule is gated on
 * .electron-opaque which this window does not carry. It is listed here so the
 * next person does not have to re-derive that it is safe.
 *
 * Matching Codex's own selector shape (both land on body at equal specificity)
 * means later-wins would already carry it; the !important makes it independent
 * of sheet order. */
.electron-dark body,
.electron-light body {
  --vscode-editor-font-family: 'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
}

/* D-0001-19 — THE TERMINAL IS xterm.js, AND NO TOKEN CAN REACH IT.
 *
 * Measured in the running app 2026-08-02, three identical samples:
 *
 *   475x1280  font=ui-monospace  fontOrigin=<div> (the region itself)
 *   class="xterm-rows"  inline=none
 *   --vscode-editor-font-family='Monaspace Neon'
 *   --default-mono-font-family='Monaspace Neon'
 *
 * Read that carefully: BOTH mono custom properties already resolve to our face
 * AT THAT ELEMENT, and it paints ui-monospace (Consolas on Windows) anyway.
 * xterm.js takes fontFamily from a JavaScript options object and writes a
 * literal stack into a stylesheet it generates at runtime, so it never reads
 * either variable. D-0001-18 captured the token at every level and could not
 * have reached this surface -- a captured token is not a consumed token.
 *
 * This is therefore a LANDMARK by necessity, not by preference (D-0001-2), and
 * it was written only after the governing rule was measured -- the mistake that
 * killed the four pre-Gate-0 landmarks was writing them first.
 *
 * The hook is safe as landmarks go: .xterm-rows and .xterm-char-measure-element
 * are xterm.js's own public, documented class names, not Codex build hashes.
 * If xterm is ever swapped out the rule stops matching and the terminal returns
 * to its stock face -- degradation, not breakage.
 *
 * .xterm-char-measure-element IS LOAD-BEARING AND MUST NOT BE DROPPED. xterm's
 * DOM renderer sizes its cell grid by measuring that element. Style the rows
 * without it and xterm measures Consolas while painting Monaspace, which
 * desynchronises the grid: misplaced cursor, offset selection, drifting
 * columns. Monaspace and Consolas are NOT metric-compatible, so this is a real
 * failure mode. Styling both keeps measurement and painting on one face. Our
 * sheet lands at dom-ready, before any terminal is opened, so xterm's first
 * measurement already sees our face.
 *
 * VERIFY BY LOOKING AT A LIVE TERMINAL -- type a command, move the cursor,
 * drag a selection. Correct glyphs with a misaligned cursor is the signature of
 * a measurement/paint split, and no contrast figure will show it. */
.electron-dark .xterm,
.electron-light .xterm,
.electron-dark .xterm-rows,
.electron-light .xterm-rows,
.electron-dark .xterm-char-measure-element,
.electron-light .xterm-char-measure-element {
  font-family: 'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
}

/* DISPLAY — Fraunces, on Codex's ten authored heading classes.
 *
 * These are global, semantic, hand-written class names, not build-hashed CSS
 * module names, which makes them the same grade of hook as 'pre, code, kbd,
 * samp' and the only structural selectors this theme permits itself. All ten
 * were read out of the shipped stylesheet; .heading-xl was additionally observed
 * in the live DOM. If Codex renames them, headings fall back to Literata and
 * nothing breaks — the page stays entirely legible, which is the whole test.
 *
 * No 'opsz' is pinned here. Fraunces carries an optical-size axis (9-144) and
 * font-optical-sizing lets the browser drive it from the rendered size, which is
 * what a display face is for. The old rule pinned 'opsz' 14 because Fraunces was
 * doing double duty as the UI face; that constraint is gone with the split. */
.electron-dark :is(.heading-2xl, .heading-3xl, .heading-4xl, .heading-xl, .heading-lg,
                   .heading-base, .heading-sm, .heading-xs, .heading-dialog, .heading-subsection),
.electron-light :is(.heading-2xl, .heading-3xl, .heading-4xl, .heading-xl, .heading-lg,
                    .heading-base, .heading-sm, .heading-xs, .heading-dialog, .heading-subsection) {
  font-family: 'Fraunces', Georgia, serif !important;
  font-optical-sizing: auto;
  font-variation-settings: 'SOFT' 30, 'WONK' 0;
}

.electron-dark :is(pre, code, kbd, samp),
.electron-light :is(pre, code, kbd, samp) {
  font-family: 'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variation-settings: normal;
}

/*
 * Layer 2 — Named-hook rules (the "character pass").
 *
 * D-0001-10 — The owner approved this treatment on 2026-08-01 by toggling it
 * against the flat build in docs/mockups/0002-captains-cabin-character-pass.html
 * and judging it "more polished and refined."
 *
 * Every rule here decorates CHROME — title bar, scrollbars, popovers, selection.
 * None of it puts luminance variation behind body text, so D-0001-6 and the
 * 152/152 contrast proof are untouched. That scoping is the whole reason this
 * layer is permitted; do not extend it onto a content surface.
 *
 * The accent is always read through var(--color-background-button-primary) so a
 * palette regeneration recolours this layer automatically.
 *
 * NO STRUCTURAL SELECTORS — re-derived 2026-08-01 against the running app.
 *
 * This layer originally targeted four named classes from
 * docs/specs/customizable-ui-inventory.md §Tier 2. Gate 0 found that ALL FOUR
 * match nothing in the shipped build, so the treatment the owner approved was
 * inert. The rebuilt inventory
 * (docs/research/phase3-inventory-findings.md §4) explains why, and why simply
 * finding new classes would have been the wrong fix: Codex uses CSS Modules with
 * BUILD-HASHED class names (_ApplicationMenuTopBar_zbk1f_3), so any such
 * selector works in testing and breaks on the next Codex release.
 *
 * The replacement is better than what it replaces. Codex reads a set of custom
 * properties it never defines — sanctioned, named tint holes left open for a
 * host to fill. The title bar's own rule is
 *   --header-tint: var(--codex-titlebar-tint, transparent);
 *   background-color: var(--header-tint);
 * so setting one custom property tints it, with no selector at all. Unset hooks
 * fall back to their own defaults, so an upstream rename degrades to stock
 * exactly as an unmatched selector did.
 *
 * DO NOT reintroduce a CSS-module class as a landmark here.
 */

/* Selection — no landmark required, so this is the layer's most durable rule. */
.electron-dark ::selection,
.electron-light ::selection {
  background: color-mix(in oklab, var(--color-background-button-primary) 34%, transparent);
  color: var(--color-text-primary);
}

/* Scrollbars. \`scrollbar-color\` is a standard property and inherits, so it
 * reaches every scroll container without a structural selector. */
.electron-dark,
.electron-light {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, var(--color-background-button-primary) 45%, transparent) transparent;
}

/* HOOK — --codex-titlebar-tint. The app's own title-bar tint variable, read 3×
 * and never defined by Codex, which leaves it for a host to fill. This is the
 * measured, supported replacement for the dead .app-header-tint landmark: the
 * title bar's rule is \`--header-tint: var(--codex-titlebar-tint, transparent)\`,
 * so one custom property tints it with no selector to go stale. */
.electron-dark,
.electron-light {
  --codex-titlebar-tint: var(--color-background-application-menu) !important;
}

/* HOOKS — the composer tray. Two more variables Codex reads and never defines
 * (\`background\` and \`border\`/\`border-color\` on the tray above the composer).
 * The composer was one of the three regions Gate 0 saw stay stock. */
.electron-dark,
.electron-light {
  --composer-top-tray-background: var(--color-background-elevated-primary) !important;
  --composer-top-tray-border: 1px solid var(--color-border) !important;
}

/* HOOK — --app-shell-tab-background. Read for a background-color and a gradient
 * stop on the shell tabs. */
.electron-dark,
.electron-light {
  --app-shell-tab-background: var(--color-background-surface-under) !important;
}

/*
 * LANDMARK — .app-shell-left-panel. THE SIDEBAR HAS NO BACKGROUND OF ITS OWN.
 *
 * D-0001-13 — the theme must PAINT the sidebar; no token override can.
 *
 * Measured 2026-08-02 in the running app, in confirmed light mode
 * (rootClass=electron-light), walking the ancestor chain to <html>: EVERY
 * ancestor of the sidebar is background-color rgba(0,0,0,0), alpha 0. Nothing
 * in the document paints it. Codex's own rule that would is
 *
 *   [data-codex-window-type=electron]:not([data-codex-window-chrome=application-menu])
 *     .app-shell-left-panel { background: ... }
 *
 * and <html> here carries data-codex-window-chrome="application-menu", so the
 * :not() excludes this window exactly. On Windows the main window owns the
 * application menu (File/Edit/View/Help), so Codex deliberately declines to
 * paint that panel and lets the OS window material — Windows 11 Mica/acrylic —
 * show through.
 *
 * WHAT THE OWNER SAW. A "pale mint-green sidebar" in light mode. It is the
 * DESKTOP WALLPAPER, composited through the transparent panel. Sampled from the
 * screen: #E6F9F6 at the top, #B7C5C6 lower down, #EAF7F3 at the bottom — the
 * panel is not one colour at all, which is conclusive. A token produces a
 * uniform fill; only an image varies down its length. Nothing in this theme's
 * palette is anywhere near hue 170, and the same run measured every genuinely
 * themed surface as correct (main content #F9F0DD, title bar #E7DECC,
 * composer #E1D9C6).
 *
 * WHY THIS IS A CONTRAST FIX BEFORE IT IS AN AESTHETIC ONE. D-0001-6 computes
 * every figure this theme claims against FLAT colour. Sidebar text is
 * --color-text-primary, and behind it was an arbitrary user wallpaper, so its
 * contrast was not merely unproven — it was unprovable, and it changes when the
 * user changes their desktop. Readability outranks aesthetics, so an opaque
 * surface is required here, not preferred.
 *
 * WHY A SELECTOR, WHEN D-0001-2 SAYS TOKEN-FIRST. Token-first presupposes a
 * declaration that READS a token. There is no background declaration anywhere in
 * this chain, so there is nothing for a token to feed; this is the "declared,
 * verified landmark" case D-0001-2 provides for. 'app-shell-left-panel' is an
 * authored, semantic, non-hashed global class — the grade of hook
 * docs/research/phase3-inventory-findings.md §4.2 sanctions, NOT a CSS-module
 * build hash. If Codex renames it, the panel returns to the stock translucent
 * look: the pre-fix appearance, not breakage.
 *
 * WHY !important HERE, on a real property rather than a token definition.
 * Codex's own rule above scores (0,3,0) — two attribute selectors plus a class —
 * where '.electron-light .app-shell-left-panel' scores (0,2,0). On THIS window
 * that rule does not match, so nothing competes. On a window WITHOUT the
 * application-menu chrome it does match and would outrank us, and the macOS
 * build is the obvious such case. This is not verified on macOS (no access), so
 * the declaration is made unconditionally rather than assuming a platform
 * difference that has not been measured. Cross-platform verification remains
 * outstanding per docs/ENGINEERING.md.
 *
 * The value is --color-background-surface-under, which palette-engine.mjs
 * derives for exactly this job ("the sidebar sits a step BELOW the ground").
 */
.electron-dark .app-shell-left-panel,
.electron-light .app-shell-left-panel {
  background: var(--color-background-surface-under) !important;
}

/*
 * LANDMARK — the ACTIVE sidebar row, marked with a brass left edge.
 *
 * D-0001-14 — the one piece of the Phase 2 sidebar mockup that theming can
 * actually deliver.
 *
 * WHAT THIS IS NOT. docs/mockups/0001-captains-cabin-palette-approval.html
 * drew a brass "New task" primary button, brass-bordered task cards and a
 * brass-railed list. Codex has none of those elements — it has plain nav rows —
 * and a theming engine recolours what the app renders; it cannot restructure
 * it (D-0001-3 forbids touching Codex's files at all). That mockup is a PALETTE
 * STUDY, not a target. This rule is the reachable part of its intent: the one
 * brass mark that says "you are here".
 *
 * THE HOOKS, both measured in the running app on a screen with an open
 * conversation (28 sidebar rows, exactly one active):
 *
 *   [data-app-action-sidebar-thread-active="true"]   Codex's own app-action
 *                                                    contract name — authored
 *                                                    and semantic, NOT a
 *                                                    CSS-module build hash
 *   [aria-current="page"]                            the web standard
 *
 * BOTH are matched, deliberately. They are independent: if Codex renames its
 * data attribute the ARIA state still carries the indicator, and vice versa.
 * A single hook here would be one rename away from silent removal, which is
 * exactly how the four pre-Gate-0 landmarks died. If BOTH stop matching, the
 * active row keeps Codex's own hover-wash highlight and nothing breaks — the
 * row is still visibly the active one, just without the brass.
 *
 * The rows are position:relative and overflow-hidden already (measured), so an
 * absolutely-positioned ::before needs no layout change from us.
 *
 * ACCENT DISCIPLINE. This is a 2px rule on ONE row, not a fill. The design
 * floor's "one accent, used sparingly, never as a background fill" holds: the
 * row's own surface stays --color-background-button-secondary-hover, which the
 * palette already solves and which every ink tier is already audited against.
 * No contrast figure changes, because no text sits on the brass.
 */
.electron-dark .sidebar-item[data-app-action-sidebar-thread-active="true"]::before,
.electron-dark .sidebar-item[aria-current="page"]::before,
.electron-light .sidebar-item[data-app-action-sidebar-thread-active="true"]::before,
.electron-light .sidebar-item[aria-current="page"]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  height: 16px;
  width: 2px;
  border-radius: 1px;
  transform: translateY(-50%);
  background: var(--color-background-button-primary);
  pointer-events: none;
}

/*
 * The empty-state hero (D-0001-9). See the note in emit-theme.mjs for why this
 * hook, and why an image here does not void the flat-surface contrast proof.
 *
 * Dark mode only: the hero is a night scene — a chart table under an oil lamp —
 * and has no meaning on a parchment ground. Light mode keeps the flat empty
 * state, which is a complete and correct look on its own.
 */
.electron-dark .\\[container-name\\:home-main-content\\]:has(.heading-xl) {
  /* FULL BLEED, under a computed scrim — two layers, scrim first (on top).
     The image fills the panel; the scrim is what makes text over it provable. */
  background-image:
    linear-gradient(to bottom,
      color-mix(in srgb, var(--color-background-surface) 0%, transparent) 0%,
      color-mix(in srgb, var(--color-background-surface) 5%, transparent) 40%,
      color-mix(in srgb, var(--color-background-surface) 25%, transparent) 55%,
      color-mix(in srgb, var(--color-background-surface) 62%, transparent) 70%,
      color-mix(in srgb, var(--color-background-surface) 92%, transparent) 86%,
      var(--color-background-surface) 100%),
    url(data:image/webp;base64,${heroB64});
  background-size: cover, cover;
  /* 'center', not 'top': on a tall panel cover scales by height, so nothing is
     cropped vertically and this only centres horizontally. On a SHORT panel it
     crops top and bottom evenly, which drops the lamp — the brightest part of
     the frame — instead of holding it behind the heading. 'top center' would do
     the opposite and put the worst pixels where the text is. */
  background-position: center, center;
  background-repeat: no-repeat, no-repeat;
}

/*
 * Motion — deliberately absent.
 *
 * This theme adds no animation or transition of its own, so it has nothing to
 * suppress under prefers-reduced-motion. A blanket
 * \`@media (prefers-reduced-motion) { * { animation-iteration-count: 1 !important } }\`
 * was written here and removed: it would have governed CODEX's animations rather
 * than ours, stopping loading spinners after a single rotation. Respecting the
 * preference for motion we introduce is our job; overriding the host app's motion
 * is not. If a future layer adds motion, scope the reduced-motion rule to exactly
 * that motion — never to \`*\`.
 */
`;

writeFileSync(OUT + 'theme.css', css.replace(/\r?\n/g, '\n'));

// ── syntax.json ──────────────────────────────────────────────────────────────
// Our own schema, deliberately not claimed to be Pierre-compatible: the editor
// hook is a Phase 3 question (see docs/specs/css-architecture.md § Layer 4).
const roles = (s, p) => Object.fromEntries(
  Object.entries(s).filter(([k]) => k !== '_surface').map(([role, hex]) => [
    role, { color: hex, contrast: +ratio(hex, s._surface).toFixed(2) },
  ]).concat([['_meta', { surface: s._surface, foreground: p['text-primary'] }]])
);

const syntax = {
  name: "Captain's Cabin",
  version: '0.1.0',
  ground: GROUNDS[GROUND].ground,
  minimumContrast: 4.5,
  note: 'Every role is solved against the code surface of its own mode. Regenerate with tools/palette/emit-theme.mjs; do not hand-edit.',
  modes: { dark: roles(synDark, dark), light: roles(synLight, light) },
};
writeFileSync(OUT + 'syntax.json', JSON.stringify(syntax, null, 2).replace(/\r?\n/g, '\n') + '\n');

// ── manifest.json ────────────────────────────────────────────────────────────
//
// D-0001-21 -- manifest.json is GENERATED here, never hand-written.
//
// D-0001-4 gives the manifest two jobs that are facts about the emitted CSS
// rather than package metadata: the list of structural landmarks the theme
// depends on, and the list of assets whose bytes it embeds. A hand-maintained
// copy of either drifts the moment someone edits a rule here and forgets the
// manifest -- and drift in THIS file is uniquely nasty, because a stale landmark
// list makes the injector's verification report a landmark healthy when the rule
// that needed it is gone. That is the same silent-success failure that killed the
// four pre-Gate-0 landmarks (docs/research/gate0-findings.md).
//
// So the emitter, which is the only thing that knows what it just wrote, writes
// the manifest too -- and every landmark carries a `probe`, an exact substring of
// the generated stylesheet, asserted below. If a rule is renamed or removed
// without updating this list, the build FAILS rather than shipping a manifest
// that describes a stylesheet that no longer exists.
//
// `selector` is what the manifest publishes for the injector to verify against
// the live DOM; `probe` exists only for the build-time drift check. They are
// different strings on purpose: the CSS writes each selector twice (once per
// root theme class) and wraps some in :is(), so no single form serves both.
const LANDMARKS = [
  {
    name: 'sidebar-panel',
    selector: '.app-shell-left-panel',
    probe: '.electron-light .app-shell-left-panel',
    governedBy: 'D-0001-13',
    // The only REQUIRED landmark in the theme, and it is a contrast guarantee,
    // not an aesthetic one: Codex leaves this panel transparent on Windows, so
    // without this rule sidebar text sits over the user's desktop wallpaper and
    // its contrast is not merely unproven but unprovable.
    required: true,
  },
  {
    name: 'sidebar-active-row',
    selector: '.sidebar-item[data-app-action-sidebar-thread-active="true"], .sidebar-item[aria-current="page"]',
    probe: '.sidebar-item[aria-current="page"]::before',
    governedBy: 'D-0001-14',
    required: false,
  },
  {
    name: 'terminal',
    selector: '.xterm, .xterm-rows, .xterm-char-measure-element',
    probe: '.electron-light .xterm-char-measure-element',
    governedBy: 'D-0001-19',
    required: false,
  },
  {
    name: 'heading-display',
    selector: '.heading-2xl, .heading-3xl, .heading-4xl, .heading-xl, .heading-lg, ' +
      '.heading-base, .heading-sm, .heading-xs, .heading-dialog, .heading-subsection',
    probe: '.heading-dialog, .heading-subsection)',
    governedBy: 'D-0001-7',
    required: false,
  },
  {
    name: 'code-surfaces',
    selector: 'pre, code, kbd, samp',
    probe: ':is(pre, code, kbd, samp)',
    governedBy: 'D-0001-7',
    required: false,
  },
  {
    name: 'home-hero',
    selector: '.\\[container-name\\:home-main-content\\]:has(.heading-xl)',
    probe: ':has(.heading-xl)',
    governedBy: 'D-0001-9',
    required: false,
  },
];

for (const l of LANDMARKS) {
  if (!css.includes(l.probe)) {
    throw new Error(
      `manifest landmark '${l.name}' probe ${JSON.stringify(l.probe)} is not in the ` +
      'emitted stylesheet. Either the rule was renamed or removed and this list is ' +
      'stale, or the probe is wrong. Fix the list -- do not weaken the probe.'
    );
  }
}

const asset = (p) => ({ path: p, bytes: statSync(OUT + p).size });

const manifest = {
  formatVersion: 1,
  id: 'captains-cabin',
  name: "Captain's Cabin",
  version: syntax.version,
  author: 'cchen362',
  license: 'MIT',
  description:
    "A captain's chart room at night — deep navy ground, antique brass accent, " +
    'parchment light mode carrying navy ink.',
  // Deliberately OUR OWN app id, not a per-OS identity. The Windows MSIX package
  // is 'OpenAI.Codex' and the macOS bundle identifier is a still-open unknown
  // (D-0001-16); resolving the installed app is the launcher's job, per the layer
  // rule in docs/ENGINEERING.md. A theme should not carry a platform's name.
  targetApp: 'openai-codex-desktop',
  // NOT semver. Codex's real version is 26.727.6591.0 -- four components, and the
  // leading one is a year. min is inclusive, max exclusive, compared
  // component-wise. min is '26' rather than the verified build because
  // token-first styling is version-tolerant by design (Plan 0001 §10) and we have
  // no evidence it breaks on an earlier 26.x; claiming a floor we never tested
  // would be as false as claiming a ceiling we did.
  targetVersionRange: { min: '26', max: '27' },
  verifiedAgainst: '26.727.6591.0',
  files: { css: 'theme.css', syntax: 'syntax.json' },
  landmarks: LANDMARKS.map(({ probe, ...rest }) => rest),
  assets: [
    asset('assets/hero-empty-state.webp'),
    ...FONTS.flatMap((f) => [asset('assets/fonts/' + f.file), asset('assets/fonts/' + f.licence)]),
  ],
};
writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 2).replace(/\r?\n/g, '\n') + '\n');

console.log('theme.css + syntax.json + manifest.json written for ground', GROUNDS[GROUND].ground);
console.log('dark surface', dark['background-surface'], '| brass', dark['background-button-primary']);
console.log('light surface', light['background-surface'], '| ink', light['text-primary']);
