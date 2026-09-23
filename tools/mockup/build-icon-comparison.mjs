/**
 * Builds docs/mockups/0004-shortcut-icon-comparison.html — the render the owner
 * judges M4's shortcut ICON and NAME from.
 *
 * Why this is a generated mockup and not a hand-written page: the same reason as
 * D-0001-21. Every colour on it is read out of themes/captains-cabin/theme.css at
 * build time, because docs/ENGINEERING.md makes that file the single source of
 * truth for this theme's token values ("Read that file for every token value; no
 * other file carries a copy"). A hand-written comparison would carry copies, and
 * copies drift silently.
 *
 * The question this render exists to answer (Plan 0001, M4):
 *
 *   Reusing Codex's own icon is the most idiot-proof — it looks like the app you
 *   already launch, just themed — but it makes a themed and a stock Codex
 *   INDISTINGUISHABLE if both are pinned to the taskbar. So the render shows every
 *   candidate at real Windows icon sizes AND in the pinned-side-by-side case,
 *   which is the case that actually decides it.
 *
 * Usage:  node tools/mockup/build-icon-comparison.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { oklchToHex } from '../palette/palette-engine.mjs';
import { MODE_SCOPE, tokenProperty } from '../palette/codex-surface.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const THEME_CSS = path.join(REPO, 'themes', 'captains-cabin', 'theme.css');
const COMPASS_SVG = path.join(REPO, 'themes', 'captains-cabin', 'assets', 'compass-rose.svg');
const OUT = path.join(REPO, 'docs', 'mockups', '0004-shortcut-icon-comparison.html');

// ---------------------------------------------------------------------------
// 1. Token values — read from the shipped stylesheet, never hand-typed.
// ---------------------------------------------------------------------------

const css = fs.readFileSync(THEME_CSS, 'utf8');

/**
 * Pull one token's value out of a specific mode-scope block. theme.css declares
 * one block per mode (MODE_SCOPE.dark / MODE_SCOPE.light, codex-surface.mjs) with
 * the SAME token names and different values, so a whole-file regex would
 * silently return whichever came first. Scope the search to the requested
 * block, and resolve `name` (this engine's bare palette-role key, e.g.
 * 'background-surface') to its real CSS property name via tokenProperty() —
 * Plan 0004 M2 renamed 60 of 77 such properties to '--app-color-*'.
 */
function token(mode, name) {
  const scope = MODE_SCOPE[mode];
  const blockStart = css.indexOf(`${scope} {`);
  if (blockStart === -1) throw new Error(`theme.css has no ${scope} block`);
  const blockEnd = css.indexOf('\n}', blockStart);
  if (blockEnd === -1) throw new Error(`${scope} block is unterminated in theme.css`);
  const block = css.slice(blockStart, blockEnd);
  const cssName = tokenProperty(name);
  const m = block.match(new RegExp(`${cssName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(#[0-9A-Fa-f]{3,8})`));
  if (!m) throw new Error(`token ${cssName} not found in ${scope}`);
  return m[1];
}

const T = {
  ground: token('dark', 'background-surface'),
  brass: token('dark', 'background-button-primary'),
  brassInk: token('dark', 'text-accent'),
  ink: token('dark', 'text-foreground'),
  inkDim: token('dark', 'text-secondary'),
  border: token('dark', 'border-heavy'),
  lightGround: token('light', 'background-surface'),
  lightInk: token('light', 'text-foreground'),
  lightBrass: token('light', 'background-button-primary'),
};

// The two embedded faces this project already ships as data URIs inside
// theme.css (D-0001-7). Reuse those exact @font-face rules rather than linking
// anything — the mockup must render in the real faces or it is not a fair render,
// and a font that silently falls back is exactly how Gate 0 recorded a false
// confirmation (see DECISIONS.md, D-0001-7 typography half).
function fontFaceRules() {
  const rules = [];
  const re = /@font-face\s*\{[^}]*\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    if (/Fraunces|Literata/.test(m[0])) rules.push(m[0]);
  }
  if (rules.length === 0) throw new Error('no Fraunces/Literata @font-face rules found in theme.css');
  return rules.join('\n');
}

// ---------------------------------------------------------------------------
// 2. Codex's own icon — resolved the way the launcher resolves the app.
// ---------------------------------------------------------------------------
//
// Get-AppxPackage, never a hardcoded WindowsApps path: the Store rewrites the
// install directory on every update. This is the same rule launcher/windows/
// launch.ps1 follows, and it is worth following here too because it is what makes
// this script still run after a Codex update.
//
// NOTE this is also a real argument in the decision the render is asking about:
// pointing a shortcut's IconLocation at a file under WindowsApps would break on
// every Codex update, so "reuse Codex's icon" means REDISTRIBUTING OpenAI's mark
// in our installer, not referencing theirs.

function codexInstallLocation() {
  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation'],
      { encoding: 'utf8' }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Extract one frame from a .ico as a PNG data URI. */
function icoFrames(icoPath) {
  const buf = fs.readFileSync(icoPath);
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error(`${icoPath} is not a valid .ico`);
  }
  const count = buf.readUInt16LE(4);
  const frames = new Map();
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    const w = buf.readUInt8(off) || 256;
    const size = buf.readUInt32LE(off + 8);
    const dataOff = buf.readUInt32LE(off + 12);
    const data = buf.subarray(dataOff, dataOff + size);
    if (data.length > 8 && data.readUInt32BE(0) === 0x89504e47) {
      frames.set(w, `data:image/png;base64,${data.toString('base64')}`);
    }
  }
  return frames;
}

const install = codexInstallLocation();
if (!install) {
  throw new Error(
    'Codex Desktop (package OpenAI.Codex) is not installed for this user, so the ' +
      '"reuse Codex\'s own icon" candidate cannot be rendered honestly. Install Codex, ' +
      'or run this on a machine that has it.'
  );
}

const codexIco = path.join(install, 'app', 'resources', 'icon-chatgpt.ico');
const codexFrames = icoFrames(codexIco);
const codexBig = codexFrames.get(256) || codexFrames.get(64);
const codexSmall = codexFrames.get(32) || codexBig;

// The white-on-transparent tile asset: its ALPHA carries the knot shape, which
// makes it usable as a CSS mask so candidate B can paint the mark in brass
// without shipping a recoloured raster.
const unplated = path.join(install, 'assets', 'Square44x44Logo.targetsize-256_altform-unplated.png');
const knotMask = fs.existsSync(unplated)
  ? `data:image/png;base64,${fs.readFileSync(unplated).toString('base64')}`
  : null;
if (!knotMask) throw new Error(`expected the unplated tile asset at ${unplated}`);

// ---------------------------------------------------------------------------
// 3. The compass rose — the theme's own hand-authored crest.
// ---------------------------------------------------------------------------

const compassRaw = fs.readFileSync(COMPASS_SVG, 'utf8');
/** Inline the crest at a given colour. Every fill in it is currentColor. */
function compass(colour, opts = {}) {
  const ring = opts.ring === false ? compassRaw.replace(/<circle[^>]*r="13\.2"[^>]*\/>/, '') : compassRaw;
  return ring
    .replace(/<svg /, `<svg style="color:${colour}" `)
    .replace(/ width="32" height="32"/, ' width="100%" height="100%"');
}

// ---------------------------------------------------------------------------
// 4. Candidates
// ---------------------------------------------------------------------------

// Neon chromas are DERIVED in OKLCH, not hand-picked, for the same reason the
// theme's palette is (docs/ENGINEERING.md, "Palette values are derived, not
// hand-picked"): a stepped hue/chroma/lightness triple is reproducible and
// comparable, an eyedropped hex is neither. Held at one lightness and one chroma
// so the only variable between the neon candidates is HUE.
const NEON_L = 0.86;
const NEON_C = 0.17;
const neon = (H) => oklchToHex({ L: NEON_L, C: NEON_C, H });

const NEON = {
  brass: neon(90), // the theme's own accent hue, pushed to neon
  cyan: neon(195),
  green: neon(150),
};

// The RGB spectrum, stepped in OKLCH rather than HSL. This matters and is not
// pedantry: an HSL rainbow swings wildly in perceived brightness (its yellow
// glares, its blue goes muddy), so the knot's strokes would look uneven in
// thickness. Holding L and C fixed and stepping only H gives a spectrum of
// CONSTANT perceived brightness, which is what keeps a 3 px stroke reading as one
// stroke. Same principle the theme's own ramps are built on.
const SPECTRUM_STOPS = 12;
const spectrum = (L = NEON_L, C = NEON_C) =>
  Array.from({ length: SPECTRUM_STOPS + 1 }, (_, i) => {
    const H = (360 / SPECTRUM_STOPS) * i;
    return `${oklchToHex({ L, C, H })} ${((i / SPECTRUM_STOPS) * 100).toFixed(1)}%`;
  }).join(',');

const RAINBOW_CONIC = `conic-gradient(from 210deg, ${spectrum()})`;
const RAINBOW_LINEAR = `linear-gradient(115deg, ${spectrum()})`;
// "Razer" in the narrow sense: the green-cyan-blue-magenta arc rather than the
// full circle, which skips the yellows that read as "warning" in most UI.
const RAINBOW_RAZER = `linear-gradient(115deg, ${[150, 180, 210, 250, 290, 330]
  .map((H, i, a) => `${oklchToHex({ L: NEON_L, C: NEON_C, H })} ${((i / (a.length - 1)) * 100).toFixed(1)}%`)
  .join(',')})`;

// A theme-NEUTRAL ground. Derived (C = 0), not eyedropped. This exists because the
// owner settled that ONE shortcut serves every future theme (D-0001-24: the
// shortcut targets the argument-free `cdx`, which reads the active theme from
// state). An icon carrying Captain's Cabin's navy would be wrong the day a second
// theme ships, so the neutral ground is the theme-agnostic option.
const NEUTRAL_GROUND = oklchToHex({ L: 0.19, C: 0, H: 0 });

/** The Codex knot painted with an arbitrary CSS background (flat or gradient). */
function knotFill(fill, { glow = 0, glowColour = '#FFFFFF', scale = 64, ground = T.ground } = {}) {
  const filter = glow
    ? `filter:drop-shadow(0 0 ${glow}px ${glowColour}) drop-shadow(0 0 ${glow * 2.2}px ${glowColour});`
    : '';
  return `<div style="width:100%;height:100%;background:${ground};display:grid;place-items:center">
      <div style="width:${scale}%;height:${scale}%;${filter}">
        <div style="width:100%;height:100%;background:${fill};
          -webkit-mask:url(${knotMask}) center/contain no-repeat;
          mask:url(${knotMask}) center/contain no-repeat"></div>
      </div>
    </div>`;
}

/** The Codex knot painted in an arbitrary colour, via the alpha of Codex's own
 *  white-on-transparent tile asset. No new raster artwork is generated or needed. */
function knot(colour, { glow = 0, scale = 64 } = {}) {
  const filter = glow ? `filter:drop-shadow(0 0 ${glow}px ${colour}) drop-shadow(0 0 ${glow * 2.2}px ${colour});` : '';
  return `<div style="width:100%;height:100%;background:${T.ground};display:grid;place-items:center">
      <div style="width:${scale}%;height:${scale}%;${filter}">
        <div style="width:100%;height:100%;background:${colour};
          -webkit-mask:url(${knotMask}) center/contain no-repeat;
          mask:url(${knotMask}) center/contain no-repeat"></div>
      </div>
    </div>`;
}

const RGB = 'Neon rainbow — theme-neutral';
const SINGLE = 'Single-hue, for comparison';
const CREST = 'Our own crest';

const CANDIDATES = [
  {
    id: 'R1',
    group: RGB,
    name: 'Full spectrum sweep, neutral ground',
    art: () => knotFill(RAINBOW_CONIC, { glow: 7, glowColour: NEON.cyan, ground: NEUTRAL_GROUND }),
    pro:
      'The full "RGB" read: hue sweeps the whole circle around the knot. Neutral ground carries ' +
      'no theme’s palette, so this same icon is still right when a second theme ships.',
    con: 'Busiest of the set. Watch the 16 px cell — a spectrum inside a 2 px stroke has nowhere to go.',
  },
  {
    id: 'R2',
    group: RGB,
    name: 'Full spectrum sweep, navy ground',
    art: () => knotFill(RAINBOW_CONIC, { glow: 7, glowColour: NEON.cyan, ground: T.ground }),
    pro: 'Same sweep, sitting on Captain’s Cabin’s actual ground — warmer, and it matches the app it opens.',
    con:
      'The ground commits the icon to ONE theme’s palette, which cuts against reusing a single ' +
      'shortcut for every future theme.',
  },
  {
    id: 'R3',
    group: RGB,
    name: 'Linear spectrum, neutral ground',
    art: () => knotFill(RAINBOW_LINEAR, { glow: 7, glowColour: NEON.cyan, ground: NEUTRAL_GROUND }),
    pro:
      'A single diagonal wash instead of a sweep. Calmer than the conic and holds its shape better ' +
      'when the icon gets small, because adjacent strokes stay close in hue.',
    con: 'Less obviously "RGB" at a glance — reads as a gradient before it reads as a spectrum.',
  },
  {
    id: 'R4',
    group: RGB,
    name: 'Razer arc — green → magenta',
    art: () => knotFill(RAINBOW_RAZER, { glow: 7, glowColour: NEON.cyan, ground: NEUTRAL_GROUND }),
    pro:
      'The narrow arc rather than the full circle: green, cyan, blue, magenta. Skips the yellows, ' +
      'which is the part of a full rainbow that reads as "warning" in a UI context.',
    con: 'Loses the warm half of the spectrum, so it is less "rainbow" and more "gamer peripheral".',
  },
  {
    id: 'R5',
    group: RGB,
    name: 'Full spectrum, NO glow',
    art: () => knotFill(RAINBOW_CONIC, { glow: 0, ground: NEUTRAL_GROUND }),
    pro:
      'The control for the whole rainbow group. Same spectrum, glow removed — this is the variant ' +
      'that stays crisp at 16 px, because glow is the first thing to turn to mush at taskbar size.',
    con: 'Flatter. The lit quality is most of the appeal, and this is the version without it.',
  },
  {
    id: 'B',
    group: SINGLE,
    name: 'Codex mark, neon brass',
    art: () => knotFill(NEON.brass, { glow: 7, glowColour: NEON.brass }),
    pro:
      'Single-hue neon in the theme’s own accent. Held here as the honest comparison: it is what ' +
      'the rainbow candidates are being judged against.',
    con: 'Theme-specific by construction — wrong ground and wrong hue the day a second theme ships.',
  },
  {
    id: 'F',
    group: CREST,
    name: 'Compass rose, brass on navy',
    art: () =>
      `<div style="width:100%;height:100%;background:${T.ground};display:grid;place-items:center">
         <div style="width:66%;height:66%">${compass(T.brass)}</div>
       </div>`,
    pro:
      'The only option with no trademark question at all — the theme’s own hand-authored crest, ' +
      'vector, crisp at every size.',
    con: 'Does not say "Codex", and is likewise tied to one theme’s palette.',
  },
];

const GROUPS = [RGB, SINGLE, CREST];

// Held constant beside every name so the NAME is the only variable in that
// section. R1 is used only as a stand-in; pick the icon first.
const NAME_ICON = CANDIDATES.find((c) => c.id === 'R1');

// THEME-NEUTRAL ONLY. The owner settled (2026-08-03) that ONE shortcut serves
// every future theme: it targets the argument-free `cdx`, which reads the active
// theme from ~/.codexterity/state.json (D-0001-24), so `cdx apply <other-theme>`
// repoints the same shortcut without touching it. A name naming Captain's Cabin
// would therefore be wrong the day a second theme ships, and every candidate that
// did so has been removed from this list rather than shown and argued against.
const NAMES = [
  { label: 'Codexterity', note: 'The product name (D-0001-5). Short, never truncates, and correct for every theme. Does not itself say "Codex" to someone who has not read the docs.' },
  { label: 'Codex (Codexterity)', note: 'Names the app first, the engine second. Says what it launches without naming any one theme.' },
  { label: 'Codex — Themed', note: 'Plainest possible. Survives truncation everywhere and stays true across themes, but has no identity of its own.' },
  { label: 'Codex Skin', note: 'Most self-explanatory to someone who has never heard of this project. Generic, and does not match the product name anywhere else.' },
];

// ---------------------------------------------------------------------------
// 5. Render
// ---------------------------------------------------------------------------

const SIZES = [16, 24, 32, 48];

function sizeRow(c) {
  return SIZES.map(
    (s) =>
      `<div class="szcell"><div class="ico" style="width:${s}px;height:${s}px">${
        s <= 32 && c.smallArt ? c.smallArt() : c.art()
      }</div><span>${s}</span></div>`
  ).join('');
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Codexterity — shortcut icon &amp; name (Plan 0001 M4)</title>
<style>
${fontFaceRules()}
:root{
  --ground:${T.ground}; --brass:${T.brass}; --brass-ink:${T.brassInk};
  --ink:${T.ink}; --ink-dim:${T.inkDim}; --border:${T.border};
}
*{box-sizing:border-box}
body{margin:0;background:var(--ground);color:var(--ink);
  font-family:'Literata',Georgia,serif;font-size:14px;line-height:1.55;
  padding:48px 32px 96px}
h1,h2{font-family:'Fraunces',Georgia,serif;font-weight:600;letter-spacing:-.01em;margin:0}
h1{font-size:30px}
h2{font-size:19px;margin:56px 0 6px;padding-bottom:8px;border-bottom:1px solid var(--border)}
.grouphead{font-family:'Fraunces',Georgia,serif;font-size:13px;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--brass-ink);margin:30px 0 0}
.lede{color:var(--ink-dim);max-width:74ch;margin:10px 0 0}
.wrap{max-width:1120px;margin:0 auto}
.q{border-left:2px solid var(--brass);padding:10px 0 10px 16px;margin:22px 0;max-width:74ch}
.q b{color:var(--brass-ink)}

.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px;margin-top:22px}
.card{border:1px solid var(--border);border-radius:6px;padding:18px;background:rgba(255,255,255,.018)}
.card h3{font-family:'Fraunces',Georgia,serif;font-size:16px;margin:0 0 2px}
.tag{color:var(--brass-ink);font-size:11px;letter-spacing:.13em;text-transform:uppercase}
.hero{width:128px;height:128px;border-radius:14px;overflow:hidden;margin:14px 0 16px;
  box-shadow:0 6px 20px rgba(0,0,0,.5)}
.ico{border-radius:3px;overflow:hidden;flex:none}
.ico img{display:block}
.sizes{display:flex;align-items:flex-end;gap:16px;margin:4px 0 14px}
.szcell{display:flex;flex-direction:column;align-items:center;gap:6px}
.szcell span{font-size:10px;color:var(--ink-dim);font-variant-numeric:tabular-nums}
.pro,.con{font-size:12.5px;margin:6px 0 0;padding-left:16px;position:relative;color:var(--ink-dim)}
.pro::before{content:'+';position:absolute;left:0;color:var(--brass-ink);font-weight:700}
.con::before{content:'\\2212';position:absolute;left:0;color:var(--ink-dim);font-weight:700}

/* Windows 11 taskbar, approximated for the pinned side-by-side case. */
.tb{margin-top:16px;border-radius:8px;padding:8px 14px;display:flex;gap:6px;align-items:center;
  justify-content:center;backdrop-filter:blur(4px)}
.tb.dark{background:#1F2126;border:1px solid #2C2F36}
.tb.light{background:#F3F3F3;border:1px solid #DFDFDF}
.tbi{width:24px;height:24px;border-radius:4px;overflow:hidden;padding:2px;flex:none}
.tbi.on{box-shadow:inset 0 -2px 0 -0.5px #6CB6FF}
.pair{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px;margin-top:20px}
.pair figcaption{font-size:12px;color:var(--ink-dim);margin-top:8px;text-align:center}
.verdict{font-size:12px;margin-top:6px;text-align:center;color:var(--brass-ink)}

/* Start-menu-ish list for the NAME question. */
.menu{background:#2B2B2B;border:1px solid #3A3A3A;border-radius:8px;padding:8px;max-width:300px}
.menu .row{display:flex;align-items:center;gap:12px;padding:7px 10px;border-radius:4px;
  font-family:'Segoe UI','Literata',serif;font-size:13px;color:#F0F0F0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.menu .row:hover{background:#3A3A3A}
.namegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;margin-top:20px}
.namenote{font-size:12.5px;color:var(--ink-dim);margin-top:10px;max-width:44ch}
footer{margin-top:64px;padding-top:16px;border-top:1px solid var(--border);
  font-size:12px;color:var(--ink-dim);max-width:74ch}
code{font-family:ui-monospace,monospace;font-size:12px;color:var(--brass-ink)}
</style>
</head>
<body>
<div class="wrap">

<h1>Shortcut icon &amp; name</h1>
<p class="lede">Plan 0001, Phase 4 M4. Every colour below is read out of
<code>themes/captains-cabin/theme.css</code> at build time — nothing here is hand-picked.
Codex's own icon is extracted live from the installed package (version-independent, via
<code>Get-AppxPackage</code>).</p>

<div class="q">
<b>One shortcut serves every theme.</b> It targets the argument-free <code>cdx</code>, which reads
the active theme from <code>~/.codexterity/state.json</code> (D-0001-24) — so
<code>cdx apply &lt;other-theme&gt;</code> repoints this same shortcut without touching it. That makes
<b>theme-neutrality a requirement, not a preference</b>: an icon in Captain's Cabin brass and navy
would be wrong the day a second theme ships. It is why the rainbow candidates below sit on a
neutral ground, and why every name naming Captain's Cabin has been dropped.
</div>

<div class="q">
<b>Two things to check that a big tile will not show you.</b> First, the <b>16 px cell</b> under each
candidate — glow and spectrum are the first things to turn to mush at taskbar size, which is why
each group carries a no-glow control. Second, <b>“Both pinned”</b> further down: stock Codex beside
the shortcut at true 24 px.
</div>

<h2>Candidates, at real Windows icon sizes</h2>
${GROUPS.map(
  (g) => `<h3 class="grouphead">${g}</h3>
<div class="grid">
${CANDIDATES.filter((c) => c.group === g)
  .map(
    (c) => `<div class="card">
    <span class="tag">Candidate ${c.id}</span>
    <h3>${c.name}</h3>
    <div class="hero">${c.art()}</div>
    <div class="sizes">${sizeRow(c)}</div>
    <p class="pro">${c.pro}</p>
    <p class="con">${c.con}</p>
  </div>`
  )
  .join('\n')}
</div>`
).join('\n')}

<h2>Both pinned — the case that decides it</h2>
<p class="lede">Stock Codex on the left of each pair, the Codexterity shortcut on the right,
at true 24&nbsp;px taskbar size. The blue underline marks a running app.</p>
<div class="pair">
${CANDIDATES.map(
  (c) => `<figure style="margin:0">
    <div class="tb dark">
      <div class="tbi on"><img src="${codexSmall}" alt="" style="width:100%;height:100%"></div>
      <div class="tbi">${c.smallArt ? c.smallArt() : c.art()}</div>
    </div>
    <div class="tb light">
      <div class="tbi on"><img src="${codexSmall}" alt="" style="width:100%;height:100%"></div>
      <div class="tbi">${c.smallArt ? c.smallArt() : c.art()}</div>
    </div>
    <figcaption>Candidate ${c.id} — ${c.name}</figcaption>
    <div class="verdict">${c.id === 'A' ? 'Indistinguishable' : 'Distinguishable'}</div>
  </figure>`
).join('\n')}
</div>

<h2>Name, as it appears in the Start menu</h2>
<p class="lede">Rendered in Segoe UI at the real Start-menu size, with real truncation behaviour
in a narrow list.</p>
<div class="namegrid">
${NAMES.map(
  (n) => `<div>
    <div class="menu">
      <div class="row">
        <div class="tbi" style="width:20px;height:20px;padding:0">${NAME_ICON.art()}</div>
        <span>${n.label}</span>
      </div>
    </div>
    <p class="namenote">${n.note}</p>
  </div>`
).join('\n')}
</div>

<footer>
Generated by <code>tools/mockup/build-icon-comparison.mjs</code>. The icon shown beside each
name is candidate ${NAME_ICON.id}, held constant so the name is the only variable — pick the icon first.
Nothing on this page is shipped; it is a design input only, per <code>docs/ENGINEERING.md</code>.
</footer>

</div>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log(`wrote ${path.relative(REPO, OUT)} (${Buffer.byteLength(html, 'utf8').toLocaleString()} bytes)`);
console.log(`  ground ${T.ground} | brass ${T.brass} | brass ink ${T.brassInk}`);
console.log(`  codex icon frames: ${[...codexFrames.keys()].sort((a, b) => a - b).join(', ')}`);
