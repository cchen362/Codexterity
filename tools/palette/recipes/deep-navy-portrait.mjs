// Codexterity — Deep Navy Portrait recipe
// ----------------------------------------
// The first theme produced by Plan 0003's hero-image-to-palette pipeline.
// Same recipe shape and comment discipline as captains-cabin.mjs; see that
// file for the long history behind values this recipe merely carries
// forward. No CSS rule and no mechanism prose lives here — see
// tools/palette/emit-theme.mjs for that.
// Regenerate with:  node tools/palette/emit-theme.mjs deep-navy-portrait
//
// D-0003-6 — this recipe is the committed SOURCE; themes/deep-navy-portrait/
// is git-ignored build output, because the emitted theme.css embeds a private
// photograph as base64 and committing it would put that photograph into git
// history exactly as committing the image itself would.
//
// STAGING REQUIRED FIRST, and it is the price of that ruling. The emitter
// reads a recipe's assets from themes/<id>/, so before this will emit,
// themes/deep-navy-portrait/assets/ needs the hero PNG (a copy of
// assets/hero-sources/BW_Jisoo.png, also git-ignored) plus byte copies of the
// three shipped font faces and their three OFL licences from
// themes/captains-cabin/assets/fonts/ — those three only, never the six
// losing candidates that also live there. This theme therefore cannot be
// rebuilt from a fresh clone, which is correct for a private theme and must
// not be "fixed" by committing the photograph.

// ── Palette inputs ──────────────────────────────────────────────────────────
// THIS RECIPE ADDS NO NEW COLOUR. It sets only the ground key — no
// `accentHue` and no `lightGround` override anywhere below — and that
// omission IS the owner's answer, not an oversight. Offered a rendered
// comparison against two cooler light-mode candidates on 2026-08-05, the
// owner chose the shipped warm parchment on sight, reversing an earlier
// ruling that had called for a cooler light mode. The accent hue was never
// in question. So palette-engine.mjs resolves this theme through the exact
// same GROUNDS['navy'] entry Captain's Cabin uses, and the two themes'
// dark/light token sets are byte-for-byte the same colours. This theme's
// entire novelty is the hero image and its two independently solved scrims,
// below.
const GROUND = 'navy';

// ── Accent role ──────────────────────────────────────────────────────────────
// Unchanged from Captain's Cabin (D-0001-7) — same brass token, same role.
const ACCENT = { token: 'background-button-primary', label: 'antique brass', name: 'Brass' };

// ── Fonts ────────────────────────────────────────────────────────────────────
// Unchanged from Captain's Cabin: Fraunces for DISPLAY, Literata for UI/body,
// Monaspace Neon for code (D-0001-7). See captains-cabin.mjs for the full
// history of that choice and why the fonts are embedded rather than named.
// Staged at themes/deep-navy-portrait/assets/fonts/ as byte copies of the
// three shipped faces — never the six losing candidates that also live under
// themes/captains-cabin/assets/fonts/.
const FACES = [
  { family: 'Literata', file: 'literata-latin-variable.woff2', licence: 'Literata-OFL.txt',
    extra: '  font-weight: 400 900;\n  font-style: normal;' },
  { family: 'Fraunces', file: 'fraunces-latin-variable.woff2', licence: 'Fraunces-OFL.txt',
    extra: '  font-weight: 100 900;\n  font-style: normal;' },
  { family: 'Monaspace Neon', file: 'monaspace-neon-latin-400.woff2', licence: 'Monaspace-OFL.txt',
    extra: '  font-weight: 400;\n  font-style: normal;' },
];

const ROLES = {
  ui: { stack: "'Literata', Georgia, serif", variationSettings: 'normal' },
  mono: { stack: "'Monaspace Neon', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", variationSettings: 'normal' },
  display: { stack: "'Fraunces', Georgia, serif", opticalSizing: 'auto', variationSettings: "'SOFT' 30, 'WONK' 0" },
};

// ── Shape ────────────────────────────────────────────────────────────────────
// Unchanged from Captain's Cabin — same joinery-not-pillows radii.
const SHAPE = {
  note: 'Shape. Tighter than stock: joinery, not pillows.',
  radii: {
    sm: '3px', md: '5px', lg: '7px', xl: '9px',
    '2xl': '12px', '3xl': '16px', '4xl': '20px', full: '9999px',
  },
};

// ── The empty-state hero ─────────────────────────────────────────────────────
//
// Same hook as Captain's Cabin (D-0001-9) and the same contrast reasoning
// (D-0001-6 forbids luminance variation BEHIND TEXT, not imagery) — see
// captains-cabin.mjs for that history. What differs here:
//
//   - the image is a monochrome portrait, not a night chart-room scene;
//   - it shows in BOTH modes, not dark-mode-only — Captain's Cabin's hero is
//     a night scene with no meaning on a parchment ground, but a monochrome
//     portrait reads in either mode;
//   - the two scrims were SOLVED INDEPENDENTLY per mode by
//     tools/palette/hero-scrim.mjs's solveScrimStops(), a new capability
//     this milestone added specifically because the old solveScrim() could
//     only VERIFY a stop set a human had already guessed. The stops below
//     are that solver's own output at target 4.0:1, textFrom 0, precision 2 —
//     do not re-solve them by hand and do not round them differently. That
//     target is deliberately below WCAG AA and is governed by D-0003-7; read
//     the prose below before touching it.
//
// D-0003-5 — WHY THE SCRIM IS FLAT AND HAS NO CLEAR TOP. This looks like a
// scrim nobody bothered to shape, and it is the opposite: it is the shape the
// image forces. See the prose below, which ships in theme.css.
const HERO = {
  file: 'assets/hero-empty-state.png',
  mime: 'image/png',
  position: 'center',
  modes: ['dark', 'light'],
  // D-0003-7 — these two alphas sit BELOW WCAG AA for normal-size text, by an
  // explicit owner decision taken from a rendered comparison. Solved at a
  // 4.0:1 target, they verify at 4.04:1 dark and 4.07:1 light. Do not "fix"
  // them upward and do not copy them into another theme; see the ruling.
  scrim: {
    dark: [[0, 0.60], [1, 0.60]],
    light: [[0, 0.56], [1, 0.56]],
  },
  prose:
    `/*
 * The empty-state hero. See the note in emit-theme.mjs for why this hook,
 * and why an image here does not void the flat-surface contrast proof
 * (D-0001-6).
 *
 * BOTH MODES, not dark-only. Captain's Cabin's hero is a night chart-room
 * scene and has no meaning on a parchment ground (D-0001-9), so it is
 * dark-mode-only; this theme's hero is a monochrome portrait, which reads
 * the same way in either mode, so it shows in both.
 *
 * TWO SCRIMS, SOLVED INDEPENDENTLY, and the method INVERTS between them.
 * Dark mode lays LIGHT ink over the image, so the BRIGHTEST pixel in a band
 * is the worst case; light mode lays DARK ink over the image, so the
 * DARKEST pixel is the worst case instead. Solved by
 * tools/palette/hero-scrim.mjs's solveScrimStops(): dark verified at 4.04:1
 * worst-case, light at 4.07:1.
 *
 * D-0003-7 — THOSE TWO FIGURES ARE BELOW WCAG AA FOR NORMAL-SIZE TEXT (4.5:1)
 * AND THAT IS DELIBERATE. This is the only place in Codexterity where a
 * measured contrast figure is knowingly under the project's own first design
 * law, and it is an owner decision taken on sight from a rendered ladder of
 * four veils per mode, not an oversight and not a rounding error. What it
 * costs is precise: the empty state's HEADING is large text, whose AA
 * threshold is 3:1, so the heading remains compliant with room to spare; what
 * falls below the line is the normal-size text over the image — the secondary
 * line under the heading, the suggestion-card labels and the composer
 * placeholder. What it buys is the portrait, which is this theme's entire
 * reason to exist. The trade only makes sense because THIS THEME IS PRIVATE
 * AND LOCAL ONLY (owner ruling 4): it is never shared, so nobody but its
 * owner is subject to the choice, and the owner made it with the number in
 * front of them. It is NOT a precedent — Captain's Cabin and any shareable
 * theme stay at AA, and no future recipe may cite this one as licence.
 *
 * ONE CONSTANT ALPHA OVER THE WHOLE PANEL, in each mode, with NO clear band
 * at the top. That is deliberate and it was measured, not defaulted to.
 * Captain's Cabin's scrim ramps out to fully transparent at the top of the
 * panel, which is safe there because its hero is a night scene and is dark
 * up there on its own. This hero is a high-key portrait — near-white almost
 * everywhere — so a transparent band is not a stylistic choice but a HOLE in
 * the proof: any text landing in it sits unveiled over near-white pixels.
 * Rendering the real empty state inside the real app chrome is what exposed
 * that; a ramped scrim washed the heading out completely while the reported
 * figure stayed a comfortable 5.53:1, because that figure only ever
 * described the region below the text line. Nothing pins where the heading
 * sits — it moves with the window's shape — so the veil has to cover
 * everything. Note the NUMBER did not change when the shape did: the solver
 * always searched every band.
 *
 * That same property is what makes the proof independent of how the panel
 * crops the image. The CSS declaration
 *     background-size: cover
 * makes panel coordinates and image coordinates disagree the moment a
 * panel's aspect ratio differs from the image's, so a scrim solved only
 * against co-located bands is proven for exactly one window shape and merely
 * hoped-for at every other. A single alpha solved against the worst band
 * ANYWHERE in the image cannot be caught out by a crop: whatever pixel the
 * crop slides under the heading was already accounted for.
 *
 * If this hero is ever replaced or regraded, RE-SOLVE both scrims with
 * solveScrimStops() — the image and its scrims are one proof, not three.
 */`,
};

// ── Voice / prose ────────────────────────────────────────────────────────────
// Named once and measured from itself. Writing the title out a second time to
// count its characters would put two copies of one string in this file, which
// is the drift this repo keeps closing off elsewhere (D-0003-1's "copies drift
// silently because nothing fails when they do").
const TITLE = 'Deep Navy Portrait — a theme package for Codexterity';

const VOICE = {
  title: TITLE,
  // Deliberately the title's own length, unlike Captain's Cabin's
  // one-dash-short underline. That one is a hand-typed quirk a byte gate now
  // pins in place (see captains-cabin.mjs); this theme has no such gate on
  // its underline, so there is no reason to reproduce the quirk here.
  titleUnderline: '-'.repeat(TITLE.length),
  blurbLines: (groundHex) => [
    `Ground: deep navy (${groundHex}). Accent: ${ACCENT.label}, used sparingly.`,
    'The same chart-room palette, carrying a monochrome portrait behind the empty state.',
  ],
  modeLabels: {
    dark: 'Dark — the night watch',
    light: 'Light — the chart room by day',
  },
  typographyProse:
    `/*
 * Typography.
 *
 * Unchanged from Captain's Cabin (D-0001-7): Fraunces for DISPLAY, Literata
 * for UI and body, Monaspace Neon for code. All three SIL OFL 1.1 and
 * redistributable inside the .ccskin, embedded above as data URIs so the
 * theme references no remote resource and depends on nothing being
 * installed on the user's machine. See captains-cabin.mjs for the
 * comparison history behind this split.
 *
 * 'pre, code, kbd, samp' below is one of only two structural selector groups
 * the theme uses (the other is the .heading-* set). Both are semantic or
 * authored names rather than CSS-module hashes, and both degrade to a
 * legible fallback.
 */`,
};

// ── The six landmarks, verbatim from Captain's Cabin (D-0001-21 — probe
// stays PER-RECIPE) ─────────────────────────────────────────────────────────
//
// The probe assertion lives in the GENERIC emitter (D-0001-21), so it is a
// CROSS-FILE CONTRACT: a rule renamed in the emitter fails every recipe's
// build. The probe itself still belongs to the recipe, never auto-derived
// from a selector. This theme's chrome is identical to Captain's Cabin's, so
// its landmarks are the same six, unchanged.
const LANDMARKS = [
  {
    name: 'sidebar-panel',
    selector: '.app-shell-left-panel',
    probe: '.electron-light .app-shell-left-panel',
    governedBy: 'D-0001-13',
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
  id: 'deep-navy-portrait',
  name: 'Deep Navy Portrait',
  version: '0.1.0',
  author: 'cchen362',
  license: 'MIT',
  description:
    "The same captain's chart room palette, carrying a monochrome portrait " +
    'behind the empty state — in both dark and light.',
  targetApp: 'openai-codex-desktop',
  // Same reasoning as captains-cabin.mjs: NOT semver, min inclusive/max
  // exclusive, compared component-wise, and deliberately untested below the
  // verified build rather than claiming a floor never measured. Governed by
  // D-0001-31: targetVersionRange/verifiedAgainst are declarative metadata,
  // deliberately never enforced — do not build a version gate, and do not
  // "update" verifiedAgainst below; it records the build this pipeline was
  // measured against, which has not changed.
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
    note: 'Every role is solved against the code surface of its own mode. Regenerate with tools/palette/emit-theme.mjs deep-navy-portrait; do not hand-edit.',
  },

  // Voice / prose
  voice: VOICE,

  // Landmarks
  landmarks: LANDMARKS,
};
