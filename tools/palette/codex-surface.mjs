// Codexterity — the Codex Desktop surface inventory
// ---------------------------------------------------
// Facts about what Codex Desktop itself exposes to a theme: its mode-scope
// selector, the custom-property names it reads for colour and font family,
// the terminal's ANSI slot names, and the ten authored heading classes it
// uses for display type. None of this is a CHOICE any theme makes — it is
// what Codex hands every theme to fill in, unchanged across recipes.
//
// This file owns the NAMES, and — since Plan 0004 M2 — it owns ALL of them:
// every selector and every custom-property name the emitter writes now
// interpolates from this file rather than being spelled as a literal in
// tools/palette/emit-theme.mjs or in a recipe's landmark `probe`. Before
// Plan 0004, the emitter's hand-written rule blocks (buildShapeBlock,
// buildTypographyBlock, buildLayer2Block) wrote '.electron-dark' /
// '.electron-light' as CSS literals for readability, and every recipe's
// landmark probes hardcoded '.electron-light …' the same way — a root-class
// rename was a change to this file, to those emitter blocks, AND to each
// recipe's probes. Plan 0004 M2 closed that gap after the rename actually
// happened (see below): everything downstream now derives from the
// constants exported here, so the next rename is a change to this file
// alone, and the probe assertion (D-0001-21) still fails the build loudly
// if a probe string goes stale.
//
// This module is a plain data/helper export with no CLI of its own — see
// tools/palette/emit-theme.mjs for the generic emitter that consumes it, and
// tools/palette/recipes/*.mjs for the per-theme authored values it is paired
// with.

// D-0004-1 — Codex's mode hook is [data-theme] on a [data-codex-window-type]
// document; see docs/DECISIONS.md.
//
// Codex 26.917 ("OWL") stopped writing '.electron-dark' / '.electron-light'
// on <html> and writes data-theme="dark"|"light" instead — measured in
// docs/research/owl-token-inventory.md §1, §6.1. <html> also carries
// data-codex-window-type="electron" (other Codex contexts use "browser",
// "chrome-extension", "extension"; no external website carries any
// data-codex-* attribute). Gating every selector on
// [data-codex-window-type] — not just on [data-theme] — is deliberate: it is
// the signal that the document is genuinely CODEX'S OWN, so a popup window
// that happens to show some external site using its own [data-theme]
// attribute is never restyled by this theme. The old '.electron-*' classes
// gave that property implicitly, because only Codex ever applied them; a
// bare '[data-theme]' selector would not, because [data-theme] alone names
// nothing Codex-specific.
//
// Each selector is a two-alternative :is(): the first alternative matches
// <html> itself (the observed case — data-theme sits directly on the
// document element on every sample M1 took), and the second matches
// [data-theme] on any DESCENDANT of a [data-codex-window-type] element.
// M1 observed no nested [data-theme] scope (§2: "No nested mode scopes were
// observed... exactly one element carried [data-theme] — <html>"), but
// Codex's own stylesheet allows one (fact 7 in Plan 0004), and a theme that
// only matched <html> would leave such a subtree half-styled — falling back
// silently to stock tokens — which this project forbids (see "Fail loudly
// in development, gracefully in production" in docs/ENGINEERING.md). The
// second alternative costs nothing today and covers that case if Codex ever
// uses it.
//
// D-0004-3 — new Codex only; no pre-OWL selector is emitted. Plan 0004's
// owner ruling (recorded 2026-09-23) is that this theme targets the OWL
// runtime exclusively: MODE_SCOPE/ANY_MODE_SCOPE below are the ONLY
// selectors this engine emits from Plan 0004 M2 onward, and the emitted
// stylesheet carries no '.electron-dark' / '.electron-light' fallback for an
// older Codex build. An older Codex simply renders stock, exactly as an
// unmatched landmark selector degrades — never half-styled.
export const MODE_SCOPE = {
  dark: ':is([data-codex-window-type][data-theme="dark"], [data-codex-window-type] [data-theme="dark"])',
  light: ':is([data-codex-window-type][data-theme="light"], [data-codex-window-type] [data-theme="light"])',
};

// The mode-agnostic form, for rules that do not themselves vary by mode
// (shape, typography, the Layer 2 "character pass") but that still must only
// ever match Codex's own document and never an unrelated page that happens
// to use [data-theme]. Before Plan 0004 these rules listed both
// '.electron-dark X, .electron-light X' as two literal selectors; now they
// are one selector reading either mode's [data-theme] value.
export const ANY_MODE_SCOPE = ':is([data-codex-window-type][data-theme], [data-codex-window-type] [data-theme])';

// The 16 custom-property keys Codex kept under their PRE-OWL name — measured
// in docs/research/owl-token-inventory.md §3 ("77 tokens: 60 renamed, 16
// same name, 1 gone"). Everything NOT in this set that tokenProperty() is
// asked for gets the '--app-' prefix Codex moved the other 60 primitives
// under.
export const SAME_NAME_TOKENS = new Set([
  'token-main-surface-primary', 'token-bg-secondary', 'token-bg-tertiary', 'token-diff-surface',
  'text-primary', 'token-foreground', 'text-secondary', 'text-tertiary', 'text-success', 'text-warning',
  'border', 'background-panel', 'background-control-opaque',
  'token-border-default', 'token-border-light', 'token-border-heavy',
]);

// tokenProperty(key) — the single place that decides whether a palette-role
// KEY (this engine's own vocabulary, e.g. 'background-surface') is written
// as Codex's pre-OWL '--color-<key>' or its OWL '--app-color-<key>'. Every
// var()-reference and every custom-property definition the emitter writes
// goes through this function; nothing hardcodes '--color-' or '--app-color-'
// as a literal prefix outside this file. 'text-quaternary' THROWS —
// docs/research/owl-token-inventory.md §3 measured it gone on OWL (the one
// of 77 tokens with no home at all), so nothing may emit it; its solved
// palette value stays in use elsewhere (ansiSlots' Black/BrightBlack slots),
// which is a fact about the PALETTE, not about this CSS property.
export function tokenProperty(key) {
  if (key === 'text-quaternary') {
    throw new Error(
      "tokenProperty: 'text-quaternary' no longer exists on Codex's OWL-era token layer " +
      '(docs/research/owl-token-inventory.md §3) — it must not be emitted as a CSS custom property.'
    );
  }
  return SAME_NAME_TOKENS.has(key) ? `--color-${key}` : `--app-color-${key}`;
}

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
//
// EACH GROUP'S ENTRIES are either a bare palette-key STRING (its CSS name is
// tokenProperty(key), i.e. the ordinary case) or a [cssName, paletteKey] PAIR
// for a token whose CSS name does not match the palette role it takes its
// value from — every entry in the "OWL primitives" group below is a pair,
// because that whole group exists precisely because Codex introduced CSS
// names with no pre-OWL counterpart to derive a bare key from.
export function tokenGroups(accentName) {
  const accentLower = accentName.toLowerCase();
  return [
    ['Surfaces — the six-step ground ramp', [
      'background-surface', 'token-main-surface-primary', 'token-bg-secondary',
      'background-elevated-primary', 'background-elevated-secondary', 'token-bg-tertiary',
      'token-diff-surface',
    ]],
    // 'text-quaternary' dropped here (Plan 0004 M2) — gone upstream
    // (docs/research/owl-token-inventory.md §3). Its solved palette value is
    // still used by ansiSlots()'s Black/BrightBlack ANSI slots below; this
    // group is the list of CSS PROPERTIES this theme defines, which is a
    // narrower thing than "every palette role that is used somewhere."
    ['Text — four tiers of ink', [
      'text-primary', 'text-foreground', 'token-foreground', 'text-secondary',
      'text-foreground-secondary', 'text-tertiary', 'text-on-accent',
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

    // ── Added Plan 0004 M2 — OWL primitives with no pre-OWL counterpart ─────────
    // docs/research/owl-token-inventory.md §3 found 22 '--app-color-*' primitives
    // the shipped theme gave no value: Codex INTRODUCED them rather than renaming
    // an existing role, so there is no bare palette key to derive their CSS name
    // from — every entry below is an explicit [cssName, paletteKey] pair, each
    // pointing at an ALREADY-SOLVED role (nothing here is a new colour; see
    // audit.mjs's five new checks, Plan 0004 M2, for the pairings this newly makes
    // contrast-critical). Three of the 22 are deliberately left OUT, each with its
    // own reason, immediately below this group.
    ['Tooltips, the tip badge, inactive buttons and popover recovery UI (Plan 0004 M2)', [
      ['--app-color-background-button-primary-inactive', 'background-button-secondary'],
      ['--app-color-background-button-secondary-inactive', 'background-button-secondary'],
      ['--app-color-background-recovery', 'background-elevated-secondary'],
      ['--app-color-background-tip-badge', 'background-accent'],
      ['--app-color-text-tip-badge', 'text-accent'],
      ['--app-color-background-tooltip', 'background-elevated-secondary'],
      ['--app-color-background-tooltip-shortcut', 'background-button-secondary'],
      ['--app-color-border-tooltip', 'border'],
      ['--app-color-text-tooltip', 'text-primary'],
      ['--app-color-text-tooltip-secondary', 'text-secondary'],
      ['--app-color-text-tooltip-tertiary', 'text-tertiary'],
      ['--app-color-text-tooltip-success', 'text-success'],
      ['--app-color-text-tooltip-warning', 'text-warning'],
      ['--app-color-text-tooltip-danger', 'text-error'],
      ['--app-color-text-tooltip-info', 'text-accent'],
      // Read DIRECTLY in addition to sitting behind '--color-border' /
      // '--color-text-secondary' (docs/research/owl-token-inventory.md §3, "Two
      // of these... sit behind names the theme already sets, but are also read
      // directly") — so they need their own definition, not just a same-named
      // alias.
      ['--app-color-border', 'border'],
      ['--app-color-text-secondary', 'text-secondary'],
      ['--app-color-text-success', 'text-success'],
      ['--app-color-text-warning', 'text-warning'],
      // D-0001-15 — the composer send control is painted INK, not brass. On the
      // pre-OWL build (measured 2026-08-02, and the look the owner approved on
      // 2026-08-05) it was painted by --color-text-foreground and needed no rule.
      // OWL gives it its own token, which stock light mode paints blue (#3a83f7)
      // while stock dark still paints it ink. This plan's goal is parity with
      // 2026-08-05, so it takes the ink role in both modes; brass is the obvious
      // wrong guess. Its glyph falls through to --color-background-control-opaque,
      // audited against this ink ("Send control glyph on ink pill", audit.mjs).
      ['--color-background-composer-primary', 'text-foreground'],
      // Its glyph. Stock light paints it a literal #ffffff; the ground colour on
      // the ink pill is the body-text pairing inverted, audited as "Send control
      // glyph on ink pill" in audit.mjs.
      ['--color-text-composer-primary', 'background-surface'],
    ]],

    // ── Added Plan 0004 M2 — component tokens Codex sets to per-mode LITERALS ──
    // Found by the themed isolated run, not by M1's map: M1 started from the 77
    // names this theme already overrode, so it could not see a component token
    // that never derived from any of them. Comparing every root colour token in
    // a themed run against the stock run lists the ones whose value did not move;
    // these are the ones that PAINTED on a screen M2 is gated on (the Chat/Work
    // mode toggle on the ChatGPT home, and the utility bar under every home
    // composer). The rest of that list — ChatGPT's status palettes, the
    // user-message bubble, text selection — paints only on screens M3 covers.
    ['Home mode toggle and composer utility bar (Plan 0004 M2)', [
      ['--color-background-mode-toggle-track', 'background-surface-under'],
      ['--color-background-mode-toggle-selected', 'background-elevated-primary'],
      ['--color-border-mode-toggle-selected', 'border'],
      ['--color-text-mode-toggle-inactive', 'text-secondary'],
      // Stock dark is a 3% white wash, so on a hero theme the chips' labels sat
      // over the photograph unproven. An opaque, already-audited surface makes
      // them provable ("Body text on sidebar" is this exact pairing).
      ['--color-background-composer-action-bar', 'background-surface-under'],
    ]],
  ];
}

// Three of the 22 OWL primitives are DELIBERATELY left unset, each for its
// own measured reason (docs/research/owl-token-inventory.md §3, §6.3):
//
//   --app-color-background-card         Codex ships 'initial' in both modes
//                                        (verified in the corpus), so it falls
//                                        through to var(--color-surface),
//                                        Codex's design-system surface, which
//                                        resolves from the primitives this
//                                        theme sets — giving it a value here
//                                        would only restate that fallback.
//   --app-color-text-primary-solid      Same shape: ships 'initial' in both
//                                        modes and falls through to
//                                        --color-background-control-opaque,
//                                        already set.
//   --app-color-simple-scrim            A neutral translucent INK wash used
//                                        for terminal selection / overlay
//                                        surfaces. It carries no hue by
//                                        design, and giving it brass would be
//                                        the single accent used as a FILL —
//                                        exactly what the design floor in
//                                        docs/ENGINEERING.md forbids ("never
//                                        as a background fill"). Left unset,
//                                        Codex's own neutral value stands.

// Codex exposes --color-token-* aliases alongside the --color-* names; both are
// set so a utility reading either resolves to the same value. All four keys on
// both sides of this map are in SAME_NAME_TOKENS (measured unchanged on OWL),
// so tokenProperty() resolves every one of them to '--color-<key>'.
export const TOKEN_ALIASES = {
  'token-border-default': 'border',
  'token-border-light': 'border-light',
  'token-border-heavy': 'border-heavy',
};

// codexSyntaxSlots(syn, p) — Codex's 8 code-highlighting custom properties.
// docs/research/owl-token-inventory.md §1 calls these "the exception to
// 'everything derives'": --color-codex-syntax-* are literal hex PER MODE in
// Codex's own stylesheet, not resolved from any primitive, so this theme
// must set them directly rather than through tokenGroups()'s
// primitive-remap shape. Mapped from the theme's own syntax roles (the same
// values syntax.json publishes) rather than left stock, so code highlighting
// matches the rest of the theme instead of being the one surface still
// wearing OpenAI's palette. `-error` has no dedicated syntax role, so it
// takes the theme's general error ink (p['text-error']) — the same choice
// ansiSlots() makes for the terminal's Red/BrightRed slots.
export function codexSyntaxSlots(syn, p) {
  return {
    '--color-codex-syntax-comment': syn.comment,
    '--color-codex-syntax-keyword': syn.keyword,
    '--color-codex-syntax-string': syn.string,
    '--color-codex-syntax-variable': syn.variable,
    '--color-codex-syntax-literal': syn.number,
    '--color-codex-syntax-name': syn.function,
    '--color-codex-syntax-attribute': syn.type,
    '--color-codex-syntax-error': p['text-error'],
  };
}

// The terminal's 16 ANSI slots. Codex names these under their VS Code
// spellings (--vscode-terminal-ansi*), unchanged by the OWL rename — measured
// in docs/research/owl-token-inventory.md §1 ("--vscode-terminal-ansi*
// (all 16 still read)"). They reach the terminal through
// --color-token-terminal-*. They are mapped from tokens already solved for
// this ground rather than left stock, so a terminal does not become the one
// window in the app still wearing OpenAI's palette. Programs rely on these
// being DISTINGUISHABLE, which is the same reason D-0001-11 keeps the status
// hues apart.
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
// tokens), which is the order the emitted stylesheet has always used. Unchanged
// by the OWL rename — measured in docs/research/owl-token-inventory.md §3
// ("all eight font tokens the theme sets still exist under the same names").
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
// matters: it is the order the generated selector lists them in. Unchanged
// by the OWL rename — measured "present" in
// docs/research/owl-token-inventory.md §5.
export const HEADING_CLASSES = [
  'heading-2xl', 'heading-3xl', 'heading-4xl', 'heading-xl', 'heading-lg',
  'heading-base', 'heading-sm', 'heading-xs', 'heading-dialog', 'heading-subsection',
];
