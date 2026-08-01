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
    'background-status-success', 'background-danger-active', 'editor-added', 'editor-deleted',
  ]],
];

// Codex exposes --color-token-* aliases alongside the --color-* names; both are
// set so a utility reading either resolves to the same value.
const ALIAS = {
  'token-border-default': 'border',
  'token-border-light': 'border-light',
  'token-border-heavy': 'border-heavy',
};

const block = (sel, p, syn, label) => {
  const lines = [`.${sel} {`, `  /* ${label} */`];
  for (const [title, keys] of GROUPS) {
    lines.push('', `  /* ${title} */`);
    for (const k of keys) lines.push(`  --color-${k}: ${p[k]};`);
  }
  lines.push('', '  /* Aliased spellings of the same values */');
  for (const [alias, src] of Object.entries(ALIAS)) lines.push(`  --color-${alias}: ${p[src]};`);
  lines.push('', '  /* Syntax palette — consumed by the editor layer (see syntax.json) */');
  for (const [role, hex] of Object.entries(syn)) {
    if (role === '_surface') continue;
    lines.push(`  --cc-syntax-${role}: ${hex};`);
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
  --radius-sm: 3px;
  --radius-md: 5px;
  --radius-lg: 7px;
  --radius-xl: 9px;
  --radius-2xl: 12px;
  --radius-3xl: 16px;
  --radius-4xl: 20px;
  --radius-full: 9999px;
}

/*
 * Typography.
 *
 * Fraunces (display + UI) and Monaspace Xenon (monospace), both SIL OFL 1.1 and
 * therefore redistributable inside the .ccskin. The woff2 files and their licence
 * texts live in assets/fonts/; the packaging build inlines them as data URIs, so
 * the shipped theme never references a remote resource.
 *
 * LANDMARK — 'pre, code, kbd, samp'. Codex sets an explicit monospace family on
 * code, so inheritance alone cannot reach it. These are semantic HTML elements
 * rather than utility-class combinations, which makes this the most durable
 * structural hook available. If it stops matching, code renders in the stock
 * monospace stack and nothing breaks.
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
 * LANDMARKS. Four of the rules below target Tier-2 named hooks from
 * docs/specs/customizable-ui-inventory.md. They are hand-written semantic
 * classes rather than hashed utility combos, which makes them the most durable
 * structural hooks the app offers — but NONE has yet been observed in a running
 * Codex, because Gate 0 has not run. Each degrades to the stock look if absent:
 * an unmatched selector paints nothing. If a hook is renamed upstream the theme
 * loses a flourish; it never breaks and never half-styles.
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

/* LANDMARK — .app-header-tint (Tier 2). A brass hairline along the header's
 * lower edge, replacing the stock border rather than adding to it. */
.electron-dark .app-header-tint,
.electron-light .app-header-tint {
  background: var(--color-background-elevated-secondary);
  border-bottom-color: transparent;
  box-shadow: inset 0 -1px 0 color-mix(in oklab, var(--color-background-button-primary) 34%, transparent);
}

/* LANDMARK — .popupContent (Tier 2). Depth plus a lit top edge, so a floating
 * panel separates from what is behind it. Shadows appear only here, where a
 * floating element genuinely needs to detach. */
.electron-dark .popupContent,
.electron-light .popupContent {
  background: var(--color-background-elevated-secondary);
  border: 1px solid var(--color-border-heavy);
  box-shadow:
    0 18px 40px -12px rgb(0 0 0 / 0.7),
    inset 0 1px 0 color-mix(in oklab, var(--color-background-button-primary) 20%, transparent);
}

/* LANDMARK — .app-shell-main-content-top-fade (Tier 2). The scroll fade has to
 * resolve to OUR ground or it reveals the stock colour as content scrolls under it. */
.electron-dark .app-shell-main-content-top-fade,
.electron-light .app-shell-main-content-top-fade {
  background: linear-gradient(to bottom, var(--color-background-surface), transparent);
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
