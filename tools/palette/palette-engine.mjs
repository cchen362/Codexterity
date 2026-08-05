// Derives a full Captain's Cabin token set from a single ground colour.
// Ramps are stepped in OKLCH (perceptually even) and contrast-critical tokens are
// SOLVED for their target ratio rather than picked by eye.

// ── OKLab / OKLCH ↔ sRGB ─────────────────────────────────────────────────────
const f = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const fInv = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

export function hexToRgb(hex) {
  const n = parseInt(/^#?([0-9a-f]{6})$/i.exec(hex)[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (x) => Math.min(1, Math.max(0, x));
const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

// sRGB (0-255 byte triple) -> OKLCH. This is the one place the OKLab matrices
// live; `hexToOklch` below is a thin wrapper (hex -> bytes -> here), the same
// shape `luminanceRgb`/`luminance` already use for the WCAG coefficients, and
// for the same reason: Plan 0003 M3's recommender converts on the order of
// 1.5 million pixels from a hero image, and routing that through hex-string
// parsing on every pixel would be wasted work for no benefit.
export function rgbToOklch([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => fInv(v / 255));
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(a, bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
export function hexToOklch(hex) {
  return rgbToOklch(hexToRgb(hex));
}

function oklchToRgbRaw({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    f(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    f(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    f(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

// Gamut-map by reducing chroma until the colour fits sRGB — preserves hue and
// lightness, which is what a token ramp actually needs. Naive clamping shifts hue.
export function oklchToHex({ L, C, H }) {
  let c = C;
  for (let i = 0; i < 64; i++) {
    const rgb = oklchToRgbRaw({ L, C: c, H });
    if (rgb.every((v) => v >= -0.0015 && v <= 1.0015)) return rgbToHex(...rgb);
    c *= 0.94;
  }
  return rgbToHex(...oklchToRgbRaw({ L, C: 0, H }));
}

// ── WCAG ─────────────────────────────────────────────────────────────────────
// The relative-luminance formula lives here ONCE, taking a byte triple. `luminance(hex)`
// and hero-scrim.mjs's pixel-domain callers both funnel through this rather than each
// carrying their own copy of the coefficients.
export function luminanceRgb([r, g, b]) {
  const [R, G, B] = [r, g, b].map((v) => fInv(v / 255));
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
export function luminance(hex) {
  return luminanceRgb(hexToRgb(hex));
}
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
export function ratioRgb(a, b) {
  const [x, y] = [luminanceRgb(a), luminanceRgb(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// Find the lightness that hits `target` contrast against `bg`, holding H and C.
// `dir` = 'up' for a colour lighter than bg, 'down' for darker.
function solveL({ C, H }, bg, target, dir) {
  let lo = dir === 'up' ? hexToOklch(bg).L : 0;
  let hi = dir === 'up' ? 1 : hexToOklch(bg).L;
  let best = oklchToHex({ L: dir === 'up' ? 1 : 0, C, H });
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const hex = oklchToHex({ L: mid, C, H });
    const r = ratio(hex, bg);
    if (r >= target) { best = hex; if (dir === 'up') hi = mid; else lo = mid; }
    else if (dir === 'up') lo = mid; else hi = mid;
  }
  return best;
}

// ── The recipe ───────────────────────────────────────────────────────────────
// Hues are fixed per role so every ground yields the same *relationships*.
// Warning sits at 75° and brass at 88° — far enough apart that a warning border
// is never mistaken for the accent, which was the risk when both read as "amber".
const ROLE = {
  ink:     { C: 0.030, H: 85 },   // parchment / warm ivory
  brass:   { C: 0.105, H: 90 },   // the one accent
  success: { C: 0.080, H: 155 },  // verdigris
  warning: { C: 0.130, H: 50 },   // burnt ochre — deliberately pulled 40° off the
  error:   { C: 0.130, H: 25 },   // brass so a warning never reads as the accent
};

// The role hues, and ONLY the hues, exported for a single downstream reader:
// Plan 0003 M3's recommend-palette.mjs, so it reads the shipped defaults —
// and the three semantic hues an accent proposal must stay clear of — from
// one place instead of copying five numbers into a second file where they
// would silently drift from ROLE above. Frozen because this is a module
// constant the engine itself also reads (via ROLE); an exported mutable
// object a caller could mutate is a live hazard, not a convenience.
export const ROLE_HUES = Object.freeze({
  ink: ROLE.ink.H,
  brass: ROLE.brass.H,
  success: ROLE.success.H,
  warning: ROLE.warning.H,
  error: ROLE.error.H,
});

// ── The accent hue, made a parameter (Plan 0003 M3, D-0003-2 clause d) ──────
// PARCHMENT below is deliberately NOT parameterised alongside it: nothing
// proposes a light-mode ground yet, and M4 is the change that first varies it.
// D-0001-11 is NOT reopened by this. That decision fixes ACCENT POLICY — one
// accent, with the two decorative hues collapsing into it and the three
// semantic status hues held distinct — and nothing here changes how many
// accents this theme has or which tokens collapse into it. This only lets a
// caller choose WHICH HUE that one accent sits at; the chroma (how saturated
// it reads) is not varied, because nothing downstream proposes a chroma and
// an unused input would be exactly the placeholder this repo forbids.
const ACCENT_OPTION_KEYS = new Set(['accentHue']);
function resolveAccent(options) {
  for (const key of Object.keys(options)) {
    if (!ACCENT_OPTION_KEYS.has(key)) {
      throw new Error(`palette-engine: unrecognised build option ${JSON.stringify(key)} (recognised: accentHue)`);
    }
  }
  if (!('accentHue' in options)) return ROLE.brass;
  const h = options.accentHue;
  if (!Number.isFinite(h) || h < 0 || h > 360) {
    throw new Error(`palette-engine: accentHue must be a finite number in the range [0, 360], got ${JSON.stringify(h)}`);
  }
  return { ...ROLE.brass, H: h };
}
// Parchment is the light-mode ground for every option. A pale tint of the dark
// ground would give aubergine a lilac cast — the exact violet-on-white look the
// design floor rules out — and a captain's chart room is paper in daylight either
// way. The ground's identity carries into light mode through the ink and borders.
const PARCHMENT = { L: 0.930, C: 0.026, H: 85 };

/**
 * The chrome layer — everything outside the six core surfaces and four ink tiers.
 *
 * WHY THIS EXISTS. The measured inventory
 * (docs/research/phase3-inventory-findings.md) found that Codex defines 97 custom
 * properties on `.electron-dark`, and this theme originally claimed 24 of them.
 * The unclaimed 73 are precisely what stayed stock in the running app: the
 * sidebar (`background-surface-under`), the menus
 * (`background-elevated-primary-opaque`, `background-application-menu`), the
 * editor surfaces (`background-editor-opaque`), and every accent.
 *
 * D-0001-11 — ACCENT POLICY, decided by the owner 2026-08-01 from the measured
 * accent trace. The design floor permits ONE accent, and brass is it, so the two
 * DECORATIVE accents (`accent-blue`, `accent-purple` — the link/mention hue and
 * the discovery hue) collapse into brass. The three SEMANTIC status hues
 * (`accent-green`, `accent-red`, `accent-orange`) do NOT: an error that looks
 * identical to a success is a readability failure, and readability outranks
 * aesthetics. They are instead re-derived into this theme's own world by reusing
 * the status inks, which are already OKLCH-solved against this ground for AA.
 * Do not "finish the job" by collapsing the status hues too.
 *
 * Everything here is DERIVED from values already solved above — no new hand-picked
 * colour enters the theme through this function.
 *
 * @param p      the partially built palette (surfaces + ink + status already solved)
 * @param ctx    { surf, tint, worst, ground, dir, brass } from the caller's own mode.
 *               `brass` is ROLE.brass, or ROLE.brass with its hue overridden by an
 *               `accentHue` build option (Plan 0003 M3) — threaded through ctx
 *               rather than read from the module-level ROLE, so this function
 *               never has to know whether the hue was overridden.
 */
// The sidebar's offset from the ground, and the row-interaction depths measured
// FROM THE SIDEBAR. Module-level because `buildLight` needs the row depth to know
// how far its ramp really extends, and a second copy of these numbers is exactly
// how a derived palette starts disagreeing with itself.
//
// 0.058 is not a taste value: it is the separation dark already had and that the
// owner reads as correct (0.0574 measured in the running app). Light inherits it
// rather than being tuned independently.
const SIDEBAR_DL = -0.014;
const ROW_HOVER_DL = 0.058;
const ROW_ACTIVE_DL = 0.070;

function deriveChrome(p, { surf, tint, worst, dir, brass }) {
  // ── Surfaces the app paints that the core ramp did not name ────────────────
  // The sidebar sits a step BELOW the ground, as Codex's own does (#0e0e0e under
  // a #111111 ground). Going down rather than up keeps every text/surface pair
  // already solved against the LIGHTEST surface comfortably valid.
  p['background-surface-under']            = surf(SIDEBAR_DL);
  p['background-editor-opaque']            = p['token-diff-surface'];
  p['background-elevated-primary-opaque']  = p['background-elevated-primary'];
  p['background-elevated-secondary-opaque'] = p['background-elevated-secondary'];
  p['background-control']                  = p['token-bg-tertiary'];
  p['background-control-opaque']           = p['token-bg-tertiary'];
  p['background-panel']                    = p['background-elevated-primary'];

  // The application menu bar — its own surface in Codex, and one of the three
  // regions Gate 0 saw stay stock.
  p['background-application-menu']         = surf(dir === 'up' ? 0.030 : -0.026);
  p['foreground-application-menu']         = p['text-secondary'];
  p['border-application-menu-separator']   = p['border'];

  // ── The one accent, and the two decorative hues that collapse into it ──────
  // Solved against the WORST (lightest in dark mode, darkest in light) surface so
  // accent text clears AA wherever it lands, not merely on the ground.
  p['text-accent']    = solveL(brass, worst, 4.8, dir);
  p['icon-accent']    = p['text-accent'];
  p['accent-blue']    = p['text-accent'];   // link / mention  — decorative, collapses
  p['accent-purple']  = p['text-accent'];   // discovery       — decorative, collapses

  // ── The three semantic status hues — kept distinct, re-derived in-palette ──
  p['accent-green']   = p['text-success'];
  p['accent-red']     = p['text-error'];
  p['accent-orange']  = p['text-warning'];
  p['accent-yellow']  = p['text-warning'];
  p['icon-success']   = p['text-success'];
  p['icon-warning']   = p['text-warning'];
  p['icon-error']     = p['text-error'];
  p['border-error']   = p['text-error'];
  p['border-warning'] = p['text-warning'];

  // Git decorations follow the same three hues; "unchanged" is deliberately mute.
  p['decoration-added']     = p['text-success'];
  p['decoration-deleted']   = p['text-error'];
  p['decoration-modified']  = p['text-warning'];
  p['decoration-unchanged'] = p['text-quaternary'];

  // ── Accent surfaces: selection, find-match, progress. Brass-tinted ground,
  //    never brass itself — a fill would break the "accent is never a background
  //    fill" rule in the design floor.
  //
  // Every step below is a FRACTION of the ramp's own extent (ground → the surface
  // the ink was solved against) rather than a fixed lightness delta. That is what
  // makes the guard at the end of this function satisfiable by construction: a
  // fraction under 1.0 cannot land outside the ramp, in either mode, for any
  // ground. Fixed deltas were tried first and were wrong for light mode, whose
  // ramp extent is 0.050 where dark's is 0.082 — the same number is a modest lift
  // in one and off the end of the ramp in the other.
  const aDir = dir === 'up' ? 1 : -1;
  const extent = Math.abs(hexToOklch(worst).L - hexToOklch(p['background-surface']).L);
  const step = (fraction) => aDir * fraction * extent;

  p['background-accent']        = tint(brass.H, step(0.49));
  p['background-accent-hover']  = tint(brass.H, step(0.71));
  p['background-accent-active'] = tint(brass.H, step(0.93));

  // Row hover / press — anchored to the SIDEBAR, not to the ground (D-0001-17).
  //
  // These were a fraction of the ramp measured from the GROUND until 2026-08-02,
  // and the same formula produced opposite outcomes in the two modes for a
  // reason that is pure geometry. The sidebar sits BELOW the ground in BOTH
  // modes (SIDEBAR_DL is negative either way). In dark the ramp rises, so hover
  // moved AWAY from the sidebar and the two diverged — 0.0574 of separation. In
  // light the ramp falls, so hover moved TOWARD the sidebar and they converged —
  // 0.0122, which the owner reported as an invisible hover in the running app
  // and which measured out at 4.7x weaker than dark (findings §8.5.2).
  //
  // List rows live ON THE SIDEBAR, so the step that matters is the one against
  // the sidebar, and that is what these are now measured from. The modes become
  // symmetric by construction rather than by luck. The check that this is a fix
  // to light and not a retune of both: dark lands at +0.044 from the ground
  // where the old fraction gave +0.045, i.e. visually unchanged.
  //
  // The old comment warned that a hover beyond `worst` invalidates the ink proof.
  // That is still true and is now handled explicitly below rather than by keeping
  // the step too small to matter.
  // Note the direction is +1 in BOTH modes, deliberately: a hovered row LIFTS
  // away from the sidebar. Dark already did this (the sidebar is the darkest
  // thing on screen, so its hover could only go up); light did not, and that —
  // not the size of the step — was the actual asymmetry. Lifting in light also
  // keeps the row INSIDE the existing ramp, and because light ink is solved
  // against the DARKEST surface, a lighter row can only raise every contrast
  // figure. So this costs no ink change at all, where deepening the row would
  // have forced every light ink tier down to keep its AA proof.
  p['background-button-secondary-hover']  = surf(SIDEBAR_DL + ROW_HOVER_DL);
  p['background-button-secondary-active'] = surf(SIDEBAR_DL + ROW_ACTIVE_DL);

  // In light mode the deepened rows are now the darkest surface any ink lands
  // on — deeper than the ramp's own `worst` — so the AA proof no longer covers
  // them. Re-solve the ONE tier actually at risk, meta text, against whichever
  // is the extreme. Primary and secondary ink deliberately keep the values the
  // owner approved: they clear the deepened row at 10.2:1 and 6.5:1, and
  // re-solving them would move a locked palette to fix pairs that never failed.
  const rowExtreme = [
    p['background-button-secondary-hover'],
    p['background-button-secondary-active'],
    worst,
  ].reduce((a, b) => (dir === 'up'
    ? (hexToOklch(a).L > hexToOklch(b).L ? a : b)    // dark: the extreme is the LIGHTEST
    : (hexToOklch(a).L < hexToOklch(b).L ? a : b))); // light: the extreme is the DARKEST
  if (rowExtreme !== worst) {
    const t = hexToOklch(p['text-tertiary']);
    p['text-tertiary'] = solveL({ C: t.C, H: t.H }, rowExtreme, 4.6, dir);
    p['text-button-tertiary']     = p['text-tertiary'];
    p['text-foreground-tertiary'] = p['text-tertiary'];
  }
  p['background-button-tertiary']         = p['background-button-secondary'];
  p['background-button-tertiary-hover']   = p['background-button-secondary-hover'];
  p['background-button-tertiary-active']  = p['background-button-secondary-active'];

  // Status surfaces to match the success/danger pair the core already solves.
  p['background-status-warning'] = tint(ROLE.warning.H, step(0.67));
  p['background-status-error']   = p['background-danger-active'];

  // Labels on the filled brass button, and the tertiary ink tier Codex names
  // separately from ours.
  p['text-button-primary']        = p['text-on-accent'];
  p['text-button-secondary']      = p['text-secondary'];
  p['text-button-tertiary']       = p['text-tertiary'];
  p['text-foreground-tertiary']   = p['text-tertiary'];

  // GUARD — the ink tiers are solved against `worst`, so no surface this layer
  // introduces may sit beyond it, or every text/surface figure the theme claims
  // becomes optimistic for the surfaces added here. The audit would catch it for
  // the specific pairs it lists; this catches it for all of them, at the point
  // where the mistake is actually made. If a design genuinely needs a lighter
  // surface, raise it in the core ramp and re-solve the ink — do not relax this.
  const worstL = hexToOklch(worst).L;
  const beyond = (hex) => (dir === 'up' ? hexToOklch(hex).L > worstL + 1e-6
                                        : hexToOklch(hex).L < worstL - 1e-6);
  // Scoped to surfaces that carry the ORDINARY ink tiers. The brass button fills
  // are deliberately outside the ramp — they are the accent, and they carry
  // `text-on-accent`, which is solved against the darkest brass state and audited
  // separately ("Button label on brass", ×3). Holding them to the neutral ramp's
  // bound would forbid the accent from being an accent.
  const CARRIES_ORDINARY_INK = /^(background|token-bg)/;
  const ACCENT_FILL = /^background-button-primary/;
  const offenders = Object.entries(p)
    .filter(([k, v]) => CARRIES_ORDINARY_INK.test(k) && !ACCENT_FILL.test(k) &&
                        typeof v === 'string' && beyond(v))
    .map(([k, v]) => `${k} (${v})`);
  if (offenders.length) {
    throw new Error(
      `Surface(s) beyond the one the ink was solved against (${worst}): ${offenders.join(', ')}. ` +
      'Raise the core ramp and re-solve the ink rather than relaxing this check.'
    );
  }
  return p;
}

export function buildDark(groundHex, options = {}) {
  const brass = resolveAccent(options);
  const g = hexToOklch(groundHex);
  const surf = (dL, dC = 0) => oklchToHex({ L: g.L + dL, C: Math.max(0, g.C + dC), H: g.H });
  const p = {
    'background-surface':            groundHex,
    'token-main-surface-primary':    groundHex,
    'token-diff-surface':            surf(0.014),
    'token-bg-secondary':            surf(0.030),
    'background-elevated-primary':   surf(0.050),
    'background-elevated-secondary': surf(0.082, -0.004),
    'token-bg-tertiary':             surf(0.082, -0.004),
  };
  // Text is solved against the LIGHTEST surface, so it clears AA on all of them.
  // Same reasoning as buildLight below, mirrored: the extreme is the LIGHTEST
  // surface in dark. The rows land at +0.044 from the ground against a ramp that
  // already reaches +0.082, so this is a no-op here today — kept symmetric so a
  // future change to ROW_*_DL cannot quietly void the dark proof the way it
  // would have voided the light one.
  const rowCeiling = surf(SIDEBAR_DL + ROW_ACTIVE_DL);
  const worst = hexToOklch(rowCeiling).L > hexToOklch(p['background-elevated-secondary']).L
    ? rowCeiling
    : p['background-elevated-secondary'];
  p['text-primary']     = solveL(ROLE.ink, worst, 12.5, 'up');
  p['text-secondary']   = solveL(ROLE.ink, worst, 7.0, 'up');
  p['text-tertiary']    = solveL(ROLE.ink, worst, 4.6, 'up');
  p['text-quaternary']  = solveL(ROLE.ink, groundHex, 3.2, 'up');
  p['text-foreground']            = p['text-primary'];
  p['text-foreground-secondary']  = p['text-secondary'];
  p['token-foreground']           = p['text-primary'];

  p['border-light'] = surf(0.030);
  p['border']       = surf(0.070);
  p['border-heavy'] = solveL({ C: Math.max(g.C, 0.02), H: g.H }, groundHex, 3.2, 'up');
  // Brass is solved bright enough to read as lit metal, not tarnished bronze.
  p['border-focus'] = solveL(brass, groundHex, 7.6, 'up');

  p['background-button-primary']        = p['border-focus'];
  p['background-button-primary-hover']  = oklchToHex({ ...hexToOklch(p['border-focus']), L: hexToOklch(p['border-focus']).L + 0.055 });
  p['background-button-primary-active'] = oklchToHex({ ...hexToOklch(p['border-focus']), L: hexToOklch(p['border-focus']).L - 0.055 });
  p['background-button-secondary']      = p['background-elevated-secondary'];
  // Ink on brass is solved against the DARKEST brass state (pressed).
  p['text-on-accent'] = solveL({ C: g.C * 0.6, H: g.H }, p['background-button-primary-active'], 5.0, 'down');

  p['icon-primary']   = p['text-primary'];
  p['icon-secondary'] = solveL(ROLE.ink, worst, 4.6, 'up');
  p['icon-tertiary']  = p['text-quaternary'];

  p['text-success'] = solveL(ROLE.success, worst, 4.8, 'up');
  p['text-warning'] = solveL(ROLE.warning, worst, 4.8, 'up');
  p['text-error']   = solveL(ROLE.error,   worst, 4.8, 'up');

  const tint = (H, dL) => oklchToHex({ L: g.L + dL, C: 0.045, H });
  p['background-status-success'] = tint(ROLE.success.H, 0.055);
  p['background-danger-active']  = tint(ROLE.error.H, 0.055);
  p['editor-added']              = tint(ROLE.success.H, 0.042);
  p['editor-deleted']            = tint(ROLE.error.H, 0.042);
  return deriveChrome(p, { surf, tint, worst, dir: 'up', brass });
}

export function buildLight(groundHex, options = {}) {
  const brass = resolveAccent(options);
  // Surfaces are parchment for every ground; the ground's hue carries into the
  // ink and borders instead, so aubergine reads as plum ink on paper rather than
  // as a lilac page.
  const g0 = hexToOklch(groundHex);
  const inkH = g0.H;
  const base = { ...PARCHMENT };
  const ground = oklchToHex(base);
  const surf = (dL, dC = 0) => oklchToHex({ L: base.L + dL, C: Math.max(0, base.C + dC), H: base.H });
  const p = {
    'background-surface':            ground,
    'token-main-surface-primary':    surf(0.026),
    'token-diff-surface':            surf(0.018),
    'token-bg-secondary':            surf(-0.026),
    'background-elevated-primary':   surf(0.046),
    'background-elevated-secondary': surf(0.026),
    'token-bg-tertiary':             surf(-0.050),
  };
  // The darkest surface ink lands on is no longer token-bg-tertiary: since
  // D-0001-17 the row interaction states are anchored to the sidebar and sit
  // DEEPER than the ramp. Ink must be solved against the true extreme, or every
  // figure this theme claims is optimistic on a hovered row — which is exactly
  // what deriveChrome's guard refuses to allow. Following that guard rather than
  // relaxing it is why all three light ink tiers deepen slightly.
  const rowFloor = surf(SIDEBAR_DL + ROW_ACTIVE_DL);
  const worst = hexToOklch(rowFloor).L < hexToOklch(p['token-bg-tertiary']).L
    ? rowFloor
    : p['token-bg-tertiary'];
  p['text-primary']    = solveL({ C: 0.040, H: inkH }, worst, 11.0, 'down');
  p['text-secondary']  = solveL({ C: 0.048, H: inkH }, worst, 7.0, 'down');
  p['text-tertiary']   = solveL({ C: 0.052, H: inkH }, worst, 4.6, 'down');
  p['text-quaternary'] = solveL({ C: 0.052, H: inkH }, ground, 3.2, 'down');
  p['text-foreground']           = p['text-primary'];
  p['text-foreground-secondary'] = p['text-secondary'];
  p['token-foreground']          = p['text-primary'];

  p['border-light'] = surf(-0.028);
  p['border']       = surf(-0.070);
  p['border-heavy'] = solveL({ C: 0.045, H: inkH }, ground, 3.2, 'down');
  p['border-focus'] = solveL(brass, ground, 4.0, 'down');

  // On a light ground the filled button DARKENS on hover/press, so the ivory
  // label's contrast only ever increases from its rest-state worst case.
  p['background-button-primary']        = p['border-focus'];
  p['background-button-primary-hover']  = oklchToHex({ ...hexToOklch(p['border-focus']), L: hexToOklch(p['border-focus']).L - 0.045 });
  p['background-button-primary-active'] = oklchToHex({ ...hexToOklch(p['border-focus']), L: hexToOklch(p['border-focus']).L - 0.090 });
  p['background-button-secondary']      = p['token-bg-secondary'];
  p['text-on-accent'] = solveL({ C: 0.020, H: 85 }, p['background-button-primary'], 4.6, 'up');

  p['icon-primary']   = p['text-primary'];
  p['icon-secondary'] = solveL({ C: 0.048, H: inkH }, worst, 4.6, 'down');
  p['icon-tertiary']  = p['text-quaternary'];

  p['text-success'] = solveL(ROLE.success, worst, 4.8, 'down');
  p['text-warning'] = solveL(ROLE.warning, worst, 4.8, 'down');
  p['text-error']   = solveL(ROLE.error,   worst, 4.8, 'down');

  const tint = (H, dL) => oklchToHex({ L: base.L + dL, C: 0.040, H });
  p['background-status-success'] = tint(ROLE.success.H, -0.030);
  p['background-danger-active']  = tint(ROLE.error.H, -0.030);
  p['editor-added']              = tint(ROLE.success.H, -0.018);
  p['editor-deleted']            = tint(ROLE.error.H, -0.018);
  return deriveChrome(p, { surf, tint, worst, dir: 'down', brass });
}

// Syntax palette, derived so it always sits on that ground's code surface.
const SYN = {
  keyword:  { C: 0.115, H: 32 },
  string:   { C: 0.080, H: 145 },
  function: { C: 0.105, H: 78 },
  number:   { C: 0.055, H: 232 },
  type:     { C: 0.065, H: 185 },
  operator: { C: 0.022, H: 88 },
  comment:  { C: 0.022, H: 88 },
};
export function buildSyntax(p, mode) {
  const surface = p['token-diff-surface'];
  const dir = mode === 'dark' ? 'up' : 'down';
  const out = { _surface: surface, variable: p['text-primary'] };
  for (const [role, spec] of Object.entries(SYN)) {
    out[role] = solveL(spec, surface, role === 'comment' ? 4.8 : 5.2, dir);
  }
  return out;
}

// Grounds evaluated for Captain's Cabin. `navy` is the shipped one (D-0001-7);
// `oak` is kept because it was a genuine finalist and is the obvious starting
// point for a future warm theme. An aubergine ground (#1E0D2B) was built, rendered
// and rejected by the owner on sight — do not re-propose it (see docs/DECISIONS.md).
export const GROUNDS = {
  navy: { label: 'Deep navy', ground: '#0E141F', note: 'Shipped. Night watch — ink, sea, and lamplight.' },
  oak:  { label: 'Dark oak',  ground: '#16110C', note: 'Finalist. Espresso oak, warm and low-saturation.' },
};
