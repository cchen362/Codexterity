// Codexterity — the Codex Desktop surface inventory
// ---------------------------------------------------
// Facts about what Codex Desktop itself exposes to a theme: its two root
// theme classes, the custom-property names it reads for colour and font
// family, the terminal's ANSI slot names, and the ten authored heading
// classes it uses for display type. None of this is a CHOICE any theme
// makes — it is what Codex hands every theme to fill in, unchanged across
// recipes.
//
// This file owns the NAMES. It does NOT own every place Codex's two root
// classes are spelled: the hand-written rule blocks in emit-theme.mjs
// (buildShapeBlock, buildTypographyBlock, buildLayer2Block) write
// '.electron-dark' / '.electron-light' as CSS literals for readability
// rather than interpolating ROOT_CLASSES, and every recipe's landmark
// probes hardcode '.electron-light …' the same way. A root-class rename is
// therefore a change to THIS file, to those emitter blocks, and to each
// recipe's probes — by design: the probe assertion (D-0001-21) is exactly
// what makes such a rename fail the build loudly instead of shipping a
// stylesheet that silently no longer matches.
//
// This module is a plain data/helper export with no CLI of its own — see
// tools/palette/emit-theme.mjs for the generic emitter that consumes it, and
// tools/palette/recipes/*.mjs for the per-theme authored values it is paired
// with.

// The two root classes Codex applies to <html> to select a mode. Every rule
// this theming engine writes is scoped under one or both of these.
export const ROOT_CLASSES = { dark: 'electron-dark', light: 'electron-light' };

// The full inventory of Codex's own semantic custom properties this engine
// overrides, grouped for readability in the generated stylesheet. Each
// group's own commentary explains WHY that cluster of tokens exists as a
// group and where it paints in the running app.
//
// A FUNCTION, not a constant, for the same reason ansiSlots() is one: two of
// the group titles below name the theme's accent colour in prose ("Brass —
// the single accent"), and this file is theme-agnostic — those two strings
// must not hardcode Captain's Cabin's accent into every theme this engine
// ever emits. `accentName` is the recipe's own accent.name ("Brass"); the
// second title lower-cases it rather than taking a second recipe field, so
// there is exactly one spelling to keep in sync.
export function tokenGroups(accentName) {
  const accentLower = accentName.toLowerCase();
  return [
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
    [`${accentName} — the single accent`, [
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
    [`Accent — ${accentLower}, and the two decorative hues that collapse into it (D-0001-11)`, [
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
}

// Codex exposes --color-token-* aliases alongside the --color-* names; both are
// set so a utility reading either resolves to the same value.
export const TOKEN_ALIASES = {
  'token-border-default': 'border',
  'token-border-light': 'border-light',
  'token-border-heavy': 'border-heavy',
};

// The terminal's 16 ANSI slots. Codex names these on .electron-dark under their
// VS Code spellings, and they reach the terminal through --color-token-terminal-*.
// They are mapped from tokens already solved for this ground rather than left
// stock, so a terminal does not become the one window in the app still wearing
// OpenAI's palette. Programs rely on these being DISTINGUISHABLE, which is the
// same reason D-0001-11 keeps the status hues apart.
export function ansiSlots(p, syn) {
  return {
    Black: p['text-quaternary'], BrightBlack: p['text-tertiary'],
    Red: p['text-error'], BrightRed: p['text-error'],
    Green: p['text-success'], BrightGreen: p['text-success'],
    Yellow: p['text-warning'], BrightYellow: p['text-warning'],
    Blue: syn.number, BrightBlue: syn.number,
    Magenta: syn.keyword, BrightMagenta: syn.keyword,
    Cyan: syn.type, BrightCyan: syn.type,
    White: p['text-secondary'], BrightWhite: p['text-primary'],
  };
}

// Codex reads its font families through tokens, exactly as it does colour, so
// the split is expressed token-first (D-0001-2) rather than by chasing elements.
// `ui` carries the five tokens that resolve to Codex's general/body face; `mono`
// carries the four that resolve to its code/terminal face. ORDER MATTERS: a
// recipe's token block writes these in this exact order (ui tokens, then mono
// tokens), which is the order the emitted stylesheet has always used.
export const FONT_FAMILY_TOKENS = {
  ui: [
    'font-sans', 'font-sans-default', 'font-serif', 'font-openai-sans', 'default-font-family',
  ],
  mono: [
    'font-mono', 'font-mono-default', 'default-mono-font-family', 'vscode-editor-font-family',
  ],
};

// Codex's ten authored, hand-written heading classes — global and semantic,
// not build-hashed CSS module names, which is what makes them safe to use as
// a display-face hook (see the D-0001-7 commentary in the emitter). Order
// matters: it is the order the generated selector lists them in.
export const HEADING_CLASSES = [
  'heading-2xl', 'heading-3xl', 'heading-4xl', 'heading-xl', 'heading-lg',
  'heading-base', 'heading-sm', 'heading-xs', 'heading-dialog', 'heading-subsection',
];
