// Emits themes/captains-cabin/theme.css and syntax.json from the derivation engine,
// so the shipped values are exactly the ones the owner approved from the mockup.
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { buildDark, buildLight, buildSyntax, GROUNDS, ratio } from './palette-engine.mjs';
import { run, runSyntax } from './audit.mjs';

const GROUND = 'navy';
const OUT = 'C:/Users/cchen362/Desktop/CodexSkin_Pirate/themes/captains-cabin/';
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
// for UI/body, Monaspace Xenon for code. The owner chose Literata at 14px from
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
//   Monaspace Xenon  static 400
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

const fontFaces = [
  face('Literata', 'literata-latin-variable.woff2', '  font-weight: 400 900;\n  font-style: normal;'),
  face('Fraunces', 'fraunces-latin-variable.woff2', '  font-weight: 100 900;\n  font-style: normal;'),
  face('Monaspace Xenon', 'monaspace-xenon-latin-400.woff2', '  font-weight: 400;\n  font-style: normal;'),
].join('\n\n');

const fontBytes = ['literata-latin-variable.woff2', 'fraunces-latin-variable.woff2',
  'monaspace-xenon-latin-400.woff2'].reduce((n, f) => n + statSync(FONT_DIR + f).size, 0);

// Codex reads its font families through tokens, exactly as it does colour, so
// the split is expressed token-first (D-0001-2) rather than by chasing elements.
// The root font-family below is the catch-all for rules that hardcode a stack.
const FONT_TOKENS = {
  'font-sans': "'Literata', Georgia, serif",
  'font-sans-default': "'Literata', Georgia, serif",
  'font-serif': "'Literata', Georgia, serif",
  'font-openai-sans': "'Literata', Georgia, serif",
  'default-font-family': "'Literata', Georgia, serif",
  'font-mono': "'Monaspace Xenon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'font-mono-default': "'Monaspace Xenon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'default-mono-font-family': "'Monaspace Xenon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'vscode-editor-font-family': "'Monaspace Xenon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
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
 * Fraunces for DISPLAY, Literata for UI and body, Monaspace Xenon for code. All
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
  font-family: 'Monaspace Xenon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
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

console.log('theme.css + syntax.json written for ground', GROUNDS[GROUND].ground);
console.log('dark surface', dark['background-surface'], '| brass', dark['background-button-primary']);
console.log('light surface', light['background-surface'], '| ink', light['text-primary']);
