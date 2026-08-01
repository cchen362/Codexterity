// Emits themes/captains-cabin/theme.css and syntax.json from the derivation engine,
// so the shipped values are exactly the ones the owner approved from the mockup.
import { writeFileSync } from 'node:fs';
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

// Codex exposes --color-token-* aliases alongside the --color-* names; both are
// set so a utility reading either resolves to the same value.
const ALIAS = {
  'token-border-default': 'border',
  'token-border-light': 'border-light',
  'token-border-heavy': 'border-heavy',
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
 * Fraunces (display + UI) and Monaspace Xenon (monospace), both SIL OFL 1.1 and
 * therefore redistributable inside the .ccskin. The woff2 files and their licence
 * texts live in assets/fonts/; the packaging build inlines them as data URIs, so
 * the shipped theme never references a remote resource.
 *
 * LANDMARK — 'pre, code, kbd, samp'. The theme's ONLY remaining structural
 * selector, and it is semantic HTML rather than a class, so it cannot be
 * invalidated by a CSS-module rebuild the way a hashed class can.
 *
 * STATUS: unverified, not disproven. It matches nothing on Codex's empty state —
 * which contains no code, so that is expected rather than evidence of absence
 * (docs/research/phase3-inventory-findings.md §4.3). It must be re-probed on a
 * screen containing a code block. If it never matches, code renders in the stock
 * monospace stack and nothing breaks; the code SURFACE is themed regardless,
 * through --color-background-editor-opaque, which needs no selector.
 */
.electron-dark,
.electron-light {
  font-family: 'Fraunces', Georgia, serif;
  font-variation-settings: 'SOFT' 30, 'WONK' 0, 'opsz' 14;
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
