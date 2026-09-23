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
//     are that solver's own output at target 3.0:1, textFrom 0, precision 2 —
//     do not re-solve them by hand and do not round them differently. 3:1 is
//     WCAG AA for LARGE text, which is the only kind that sits on this image;
//     that is governed by D-0003-7, whose trip-wire says when 4.5:1 takes over
//     instead. Read the prose below before touching either number.
//
// D-0003-5 — WHY THE SCRIM IS FLAT AND HAS NO CLEAR TOP. This looks like a
// scrim nobody bothered to shape, and it is the opposite: it is the shape the
// image forces. See the prose below, which ships in theme.css.
const HERO = {
  file: 'assets/hero-empty-state.png',
  mime: 'image/png',
  // 'center', and a shifted anchor was TRIED AND REJECTED ON SIGHT — do not
  // re-propose one. The owner reported that in a half-width window with the
  // sidebar open, `cover` crops horizontally (the panel is then narrower than
  // this image's 16:9 aspect) and pushes the subject, who sits right of
  // centre, partly out of frame. '68% center' was chosen from a rendered
  // comparison of five anchors and shipped; the owner then looked at it in the
  // running app and rejected it, because at the window proportions they
  // actually use it swings the face INTO the content — crowding the heading
  // and the suggestion cards — with the sidebar both open and closed. The
  // narrow-window crop is the lesser problem and is accepted.
  //
  // WHY THE COMPARISON MISLED: the mock panels it was judged in were ~300px
  // wide against a real content panel of ~950px, so they exercised an aspect
  // ratio the app does not have. An anchor is only meaningful at the real
  // panel's proportions, and a side-by-side of five options at the wrong
  // proportions looks conclusive while answering a different question.
  //
  // Note this was never a contrast question in either direction: bandImage()
  // takes the worst pixel across each band's FULL width, so the scrim is
  // already solved against every horizontal crop, whatever the anchor.
  position: 'center',
  modes: ['dark', 'light'],
  // D-0003-7 — solved against the LARGE-TEXT threshold (3:1), not 4.5:1,
  // because the only text over this image is the empty state's heading. Verify
  // at 3.01:1 dark and 3.06:1 light. The margin is thin on purpose; read the
  // ruling before changing either number, and note the trip-wire it names —
  // which fired on 2026-09-23, and whose old "re-solve at 4.5:1" remedy was
  // measured NOT to work (see the prose below).
  scrim: {
    dark: [[0, 0.51], [1, 0.51]],
    light: [[0, 0.47], [1, 0.47]],
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
 * tools/palette/hero-scrim.mjs's solveScrimStops(): dark verified at 3.01:1
 * worst-case, light at 3.06:1.
 *
 * D-0003-7 — THOSE FIGURES ARE SOLVED AGAINST 3:1, NOT 4.5:1, AND THAT IS
 * CORRECT RATHER THAN A CONCESSION. WCAG AA is 4.5:1 for normal-size text and
 * 3:1 for LARGE text, and on this screen the only thing sitting on the
 * photograph is the empty state's heading, which is large. Everything else
 * that looks like it is over the image is not: Codex's four suggestion cards
 * and its composer paint OPAQUE surfaces — --color-background-elevated-primary
 * (#FFF6E4 light) and --color-background-elevated-secondary — so their labels
 * sit on flat theme colour whose contrast the palette audit already proves,
 * with no pixel of the photograph behind them. That was confirmed in the
 * running app by the owner and then checked against the emitted token values
 * rather than taken on sight.
 *
 * THE TRIP-WIRE, because this reasoning is contingent on Codex's layout and
 * not on anything this repo controls. If Codex ever puts NORMAL-SIZE text over
 * the empty-state background — a subtitle under the heading, a caption, a hint
 * line — or makes those card and composer surfaces translucent, the heading's
 * 3:1 no longer covers the screen. The heading is large today at roughly 30px;
 * large text is 24px regular or 18.66px bold, so a heading that shrinks past
 * 24px also trips this. Re-solve with solveScrimStops(); never nudge an alpha
 * by hand.
 *
 * IT FIRED ON 2026-09-23 (Plan 0004 M4), AND A HEAVIER SCRIM DID NOT FIX IT.
 * On Codex 26.917 the home screen can show "Suggested prompts" — normal-size
 * lines over the photograph that Codex deliberately DIMS until hovered.
 * Measured in dark mode: about 1.3:1 at this scrim. The 4.5:1 re-solve this
 * note used to prescribe (dark 0.60 / light 0.56) was rendered and measured
 * at 1.7:1, because those alphas assume full-strength ink and the dimmed rows
 * are not. What did fix it was an opaque panel behind the rows (5.0:1 dark,
 * 6.2:1 light). The owner chose neither: they turned the rows off in Codex
 * (Settings > General > Suggested prompts). So nothing here changed, and if
 * those rows come back on, the measured fix is the backing, not a heavier
 * veil. See D-0003-7 in docs/DECISIONS.md.
 *
 * WHY THE MARGIN IS DELIBERATELY THIN. The owner asked twice for more of the
 * photograph, was shown rendered ladders both times, and chose this veil
 * knowing it sits just above the bar rather than comfortably above it. The
 * portrait is the entire reason this theme exists; spending contrast the
 * standard does not ask for would be spending the only thing it is for.
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
    // Plan 0004 M2 — the end of ANY_MODE_SCOPE (codex-surface.mjs) plus the
    // landmark class. Was '.electron-light .app-shell-left-panel' pre-OWL.
    probe: '[data-theme]) .app-shell-left-panel',
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
    // Plan 0004 M2 — same shape as sidebar-panel's probe, above. Was
    // '.electron-light .xterm-char-measure-element' pre-OWL.
    probe: '[data-theme]) .xterm-char-measure-element',
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
  {
    // Plan 0004 M3 — the app-update pill's white label on the chart-blue fill
    // D-0001-11 collapses into brass. See D-0004-4 in emit-theme.mjs for the
    // measured numbers and why this is keyed to the utility pairing rather
    // than the pill by name.
    name: 'white-on-accent-fill',
    selector: '.bg-chart-blue.text-white',
    probe: '.bg-chart-blue.text-white',
    governedBy: 'D-0004-4',
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
