// Codexterity — Captain's Cabin recipe
// --------------------------------------
// The authored choices for the shipped theme: identity, palette inputs, the
// accent role, typography roles and font assets, shape values, the hero
// configuration, syntax policy, and the manifest landmarks. No CSS rule and
// no mechanism prose lives here — see tools/palette/emit-theme.mjs for that.
// Regenerate the shipped files with:  node tools/palette/emit-theme.mjs

// ── Palette inputs ──────────────────────────────────────────────────────────
// The recipe names the ground KEY; the emitter resolves it through
// palette-engine.mjs's GROUNDS and fails loudly and by name on an unknown
// key. 'navy' is the shipped ground (D-0001-7).
//
// DELIBERATE BOUNDARY: palette-engine.mjs's role hues (ROLE.brass etc.) are
// shared derivation policy, not a per-theme authored value, and nothing
// varies them yet — this recipe does not add an accent-hue input, because an
// input no theme uses would be a placeholder, which this repo forbids.
// Parameterising the role hues is Plan 0003 M3's work, when a recommender
// first proposes one; M4's cooler light mode will likewise be the change
// that first parameterises PARCHMENT. This is a boundary, not a TODO.
const GROUND = 'navy';

// ── Accent role ──────────────────────────────────────────────────────────────
// Three views of the same accent, each read by a different consumer:
//   token — which Codex colour TOKEN this theme treats as "the" single accent
//           for the chrome layer (title-bar tint hook, selection wash,
//           scrollbar thumb, the active-sidebar-row mark).
//   label — the prose phrase used in the generated header and the manifest
//           description ("antique brass, used sparingly").
//   name  — the short, capitalised noun codex-surface.mjs's tokenGroups()
//           interpolates into its two accent-bearing group titles ("Brass —
//           the single accent"), so that theme-agnostic file never hardcodes
//           Captain's Cabin's accent name itself. tokenGroups() derives the
//           lowercase form from this with .toLowerCase() rather than taking
//           a fourth field.
// For Captain's Cabin this is the brass button token the palette engine
// already solves.
const ACCENT = { token: 'background-button-primary', label: 'antique brass', name: 'Brass' };

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
//
// One list, two consumers: the @font-face blocks and manifest.json's
// assets[]. (The pre-M2 script also computed a font-byte total and a
// hero-byte total that nothing ever read -- fontBytes/heroBytes -- which M2
// removed rather than carried forward; do not reintroduce them.)
// assets/fonts/ also holds SIX faces this theme does NOT use -- the five
// losing candidates from the typography comparison
// (docs/mockups/0003-typography-comparison.html) -- bitter, commissioner,
// ibm-plex-sans, newsreader, work-sans -- plus the superseded Monaspace
// Xenon. They stay in the repo as the record of that decision and must
// never reach a .ccskin, which is precisely why the package's asset list is
// derived from this list rather than from a directory listing.
//
// The OFL text ships with each face. SIL OFL 1.1 requires the licence to
// accompany the font, and the font travels inside theme.css as a data URI, so
// the licence has to travel in the package alongside it. Not optional.
const FACES = [
  { family: 'Literata', file: 'literata-latin-variable.woff2', licence: 'Literata-OFL.txt',
    extra: '  font-weight: 400 900;\n  font-style: normal;' },
  { family: 'Fraunces', file: 'fraunces-latin-variable.woff2', licence: 'Fraunces-OFL.txt',
    extra: '  font-weight: 100 900;\n  font-style: normal;' },
  { family: 'Monaspace Neon', file: 'monaspace-neon-latin-400.woff2', licence: 'Monaspace-OFL.txt',
    extra: '  font-weight: 400;\n  font-style: normal;' },
];

// The three roles a face plays. `stack` is what actually reaches a
// font-family declaration; `variationSettings`/`opticalSizing` are the axis
// defaults for that role. SOFT/WONK are Fraunces's own variable-font axes,
// which is exactly why they are recipe data and not a Codex fact.
const ROLES = {
  ui: { stack: "'Literata', Georgia, serif", variationSettings: 'normal' },
  mono: { stack: "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", variationSettings: 'normal' },
  display: { stack: "'Fraunces', Georgia, serif", opticalSizing: 'auto', variationSettings: "'SOFT' 30, 'WONK' 0" },
};

// ── Shape ────────────────────────────────────────────────────────────────────
// Tighter than stock: joinery, not pillows.
const SHAPE = {
  note: 'Shape. Tighter than stock: joinery, not pillows.',
  radii: {
    sm: '3px', md: '5px', lg: '7px', xl: '9px',
    '2xl': '12px', '3xl': '16px', '4xl': '20px', full: '9999px',
  },
};

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
// full width, while `cover` on a tall panel crops to the centre. Solved by
// tools/palette/hero-scrim.mjs; if the hero is ever regraded or replaced,
// RE-SOLVE the scrim — do not assume these stops still hold. The scrim and the
// image are one proof, not two.
const HERO = {
  file: 'assets/hero-empty-state.webp',
  mime: 'image/webp',
  position: 'center',
  modes: ['dark'],
  scrim: {
    dark: [[0, 0], [0.40, 0.05], [0.55, 0.25], [0.70, 0.62], [0.86, 0.92], [1, 1]],
  },
  // The emitted-CSS note that precedes the hero rule. This IS part of the
  // byte gate (it lands in theme.css verbatim), which is why it is authored
  // recipe text rather than a string built by the emitter.
  prose:
    `/*
 * The empty-state hero (D-0001-9). See the note in emit-theme.mjs for why this
 * hook, and why an image here does not void the flat-surface contrast proof.
 *
 * Dark mode only: the hero is a night scene — a chart table under an oil lamp —
 * and has no meaning on a parchment ground. Light mode keeps the flat empty
 * state, which is a complete and correct look on its own.
 */`,
};

// ── Voice / prose — the strings this theme's identity puts into theme.css ──
const VOICE = {
  title: "Captain's Cabin — a theme package for Codexterity",
  // 48 dashes. NOT '-'.repeat(title.length) -- title.length is 49. There is
  // no length-derived rule to recover here; the original was hand-typed one
  // dash short of the title above it, and this carries that literal string
  // forward rather than "fixing" a byte the gate depends on.
  titleUnderline: '------------------------------------------------',
  blurbLines: (groundHex) => [
    `Ground: deep navy (${groundHex}). Accent: ${ACCENT.label}, used sparingly.`,
    'Light mode is weathered parchment carrying navy ink.',
  ],
  modeLabels: {
    dark: 'Dark — the night watch',
    light: 'Light — the chart room by day',
  },
  // The big Typography comment block. Theme-specific narrative (names
  // Fraunces/Literata/the 0003 mockup by name), so it travels as authored
  // recipe text rather than emitter mechanism.
  typographyProse:
    `/*
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
 */`,
};

// ── The six landmarks, verbatim (D-0001-21 — probe stays PER-RECIPE) ───────
//
// `selector` is what the manifest publishes for the injector to verify against
// the live DOM; `probe` exists only for the build-time drift check. They are
// different strings on purpose: the CSS writes each selector twice (once per
// root theme class) and wraps some in :is(), so no single form serves both.
//
// The probe assertion now lives in the GENERIC emitter (D-0001-21), so it is a
// CROSS-FILE CONTRACT rather than a same-file self-check: a rule renamed in
// the emitter now fails EVERY recipe's build, which is stronger than the
// same-file version and is the correct reading of Plan 0002's review finding
// #4 -- the probe itself still belongs to the recipe, never auto-derived from
// a selector, and never hoisted into the emitter as data.
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

export default {
  // Identity
  id: 'captains-cabin',
  name: "Captain's Cabin",
  version: '0.1.0',
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
  // would be as false as claiming a ceiling we did. Governed by D-0001-31:
  // targetVersionRange/verifiedAgainst are declarative metadata, deliberately
  // never enforced -- do not build a version gate.
  targetVersionRange: { min: '26', max: '27' },
  verifiedAgainst: '26.727.6591.0',

  // Palette inputs
  palette: { ground: GROUND },

  // Accent role
  accent: ACCENT,

  // Typography
  typography: { faces: FACES, roles: ROLES },

  // Shape
  shape: SHAPE,

  // Hero
  hero: HERO,

  // Syntax policy
  syntax: {
    minimumContrast: 4.5,
    note: 'Every role is solved against the code surface of its own mode. Regenerate with tools/palette/emit-theme.mjs; do not hand-edit.',
  },

  // Voice / prose
  voice: VOICE,

  // Landmarks
  landmarks: LANDMARKS,
};
