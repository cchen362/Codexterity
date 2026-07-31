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

export function hexToOklch(hex) {
  const [R, G, B] = hexToRgb(hex).map((v) => fInv(v / 255));
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
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => fInv(v / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
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
// Parchment is the light-mode ground for every option. A pale tint of the dark
// ground would give aubergine a lilac cast — the exact violet-on-white look the
// design floor rules out — and a captain's chart room is paper in daylight either
// way. The ground's identity carries into light mode through the ink and borders.
const PARCHMENT = { L: 0.930, C: 0.026, H: 85 };

export function buildDark(groundHex) {
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
  const worst = p['background-elevated-secondary'];
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
  p['border-focus'] = solveL(ROLE.brass, groundHex, 7.6, 'up');

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
  return p;
}

export function buildLight(groundHex) {
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
  const worst = p['token-bg-tertiary']; // darkest surface — solve text against it
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
  p['border-focus'] = solveL(ROLE.brass, ground, 4.0, 'down');

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
  return p;
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
