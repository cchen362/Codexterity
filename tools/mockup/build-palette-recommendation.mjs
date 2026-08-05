// Builds the Plan 0003 M3 palette-recommendation review sheet.
//
// This is a JUDGEMENT SHEET, not a mockup of a finished theme. Its job is to
// let the owner decide, by eye, whether tools/palette/recommend-palette.mjs
// works — proved against Captain's Cabin's OWN hero, whose right answer is
// already known and shipped — and to show, thinly and honestly, what it
// proposes for the new monochrome portrait.
//
// House style, followed from tools/mockup/build-mockup.mjs: everything is
// embedded as a data URI so the file is self-contained with no external
// requests, and every input that does not parse or pass fails LOUDLY rather
// than degrading into a fabricated sheet. Unlike build-mockup.mjs this file
// does NOT parse theme.css for its swatches — it calls palette-engine.mjs
// directly, because the whole point of this sheet is to render palettes that
// are NOT yet shipped anywhere theme.css could describe. The shipped navy/
// brass comparison swatches ARE read out of theme.css, because those two
// values must never drift from what actually ships.
//
// THE GATE THIS FILE ENFORCES (Plan 0003 M3): every proposal the recommender
// emits must pass audit.mjs BEFORE the owner is shown anything. If any
// proposal in `proposals` has `passes !== true`, this script THROWS and
// writes no file — same reasoning as emit-theme.mjs's assertPalettesPassAA:
// a failing palette must be structurally unable to reach the owner's eyes,
// not merely unlikely to.
//
// Usage:  node tools/mockup/build-palette-recommendation.mjs [outfile]

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = resolve(ROOT, 'themes/captains-cabin');
const OUT = process.argv[2] || resolve(ROOT, 'docs/mockups/0006-palette-recommendation.html');

const CAPTAINS_CABIN_HERO = resolve(ROOT, 'tests/fixtures/hero-empty-state.png');
const PORTRAIT_HERO = resolve(ROOT, 'assets/hero-sources/BW_Jisoo.png');

// ── The module this sheet consumes — may not exist yet ──────────────────────
// Per the milestone brief: if recommend-palette.mjs is missing, do NOT stub
// it, fake its output, or write a fabricated sheet. Say so plainly and stop.
let recommendPalette;
// The two thresholds `namesHue` is decided by, read from the recommender
// itself rather than restated here — the sheet's job is to report what the
// instrument did, and a second copy of a threshold is how a review sheet
// starts quietly disagreeing with the tool it is reviewing.
let NAMES_HUE_MIN_CHROMA;
let NAMES_HUE_MIN_CONCENTRATION;
try {
  const mod = await import(pathToFileURL(resolve(ROOT, 'tools/palette/recommend-palette.mjs')).href);
  recommendPalette = mod.recommendPalette;
  ({ NAMES_HUE_MIN_CHROMA, NAMES_HUE_MIN_CONCENTRATION } = mod);
  if (typeof recommendPalette !== 'function') {
    throw new Error('module loaded but does not export a recommendPalette function');
  }
  if (!Number.isFinite(NAMES_HUE_MIN_CHROMA) || !Number.isFinite(NAMES_HUE_MIN_CONCENTRATION)) {
    throw new Error('module loaded but does not export the numeric namesHue thresholds');
  }
} catch (err) {
  process.stderr.write(
    `build-palette-recommendation: tools/palette/recommend-palette.mjs is not available yet ` +
      `(${err.message}).\n` +
      `This builder is written fully against its contract but CANNOT RUN without it. ` +
      `No sheet was written. This is not a bug in this file — it is the correct refusal.\n`
  );
  process.exit(1);
}

const { loadHeroImage, CALIBRATION_STOPS } = await import(pathToFileURL(resolve(ROOT, 'tools/palette/hero-scrim.mjs')).href);
const { buildDark, buildLight, buildSyntax, GROUNDS, ROLE_HUES } = await import(pathToFileURL(resolve(ROOT, 'tools/palette/palette-engine.mjs')).href);

// ── Shipped theme.css tokens — for the comparison swatches only ────────────
// The single source of truth for what actually shipped. Never a copy of a
// value; parsed straight out of the file, same as build-mockup.mjs.
const css = readFileSync(resolve(THEME, 'theme.css'), 'utf8');
function tokens(selector) {
  const m = new RegExp(`\\${selector}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!m) throw new Error(`could not find ${selector} in theme.css`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const t = /^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/.exec(line);
    if (t) out[t[1]] = t[2].trim();
  }
  return out;
}
const SHIPPED_DARK = tokens('.electron-dark');
const SHIPPED_LIGHT = tokens('.electron-light');
for (const [name, t] of [['dark', SHIPPED_DARK], ['light', SHIPPED_LIGHT]]) {
  if (!t['--color-background-surface']) throw new Error(`shipped ${name} block parsed but has no surface token`);
}
const SHIPPED_GROUND_DARK = SHIPPED_DARK['--color-background-surface'].replace(/\s*!important$/, '');
const SHIPPED_BRASS_DARK = SHIPPED_DARK['--color-background-button-primary'].replace(/\s*!important$/, '');
const SHIPPED_GROUND_LIGHT = SHIPPED_LIGHT['--color-background-surface'].replace(/\s*!important$/, '');
const SHIPPED_BRASS_LIGHT = SHIPPED_LIGHT['--color-background-button-primary'].replace(/\s*!important$/, '');

// ── Fonts — the theme's own three faces, embedded (design floor, non-negotiable) ──
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;
const FONTS = [
  ['Literata', 'literata-latin-variable.woff2', 'font-weight:400 900;'],
  ['Fraunces', 'fraunces-latin-variable.woff2', 'font-weight:100 900;'],
  ['Monaspace Neon', 'monaspace-neon-latin-400.woff2', 'font-weight:400;'],
].map(([fam, file, extra]) =>
  `@font-face{font-family:'${fam}';src:url(${dataUri(resolve(THEME, 'assets/fonts', file), 'font/woff2')}) format('woff2');font-display:block;${extra}}`
).join('');

// ── The build-time refusal (M3's gate) ───────────────────────────────────────
// Same reasoning as emit-theme.mjs's assertPalettesPassAA: a proposal that
// cannot pass audit.mjs must be structurally unable to reach this sheet, not
// merely unlikely to. This throws and writes NOTHING if it fires.
function assertAllProposalsPass(heroLabel, recommendation) {
  for (const proposal of recommendation.proposals) {
    if (proposal.passes !== true) {
      const failNames = (label) => {
        const audit = proposal.audit && proposal.audit[label];
        const failures = audit && Array.isArray(audit.failures) ? audit.failures : [];
        return failures.length ? failures.join(', ') : '(no failure detail reported)';
      };
      throw new Error(
        `build-palette-recommendation: REFUSING TO RENDER — proposal '${proposal.id}' for hero ` +
          `'${heroLabel}' failed audit.mjs. dark: ${failNames('dark')} | light: ${failNames('light')}. ` +
          'A proposal must pass WCAG AA in both modes before it is shown to the owner.'
      );
    }
  }
}

// ── Small formatting helpers ─────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${(x * 100).toFixed(1)}%` : 'n/a');
const num = (x, d = 3) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : 'n/a');
const deg = (x) => (typeof x === 'number' && Number.isFinite(x) ? `${x.toFixed(1)}°` : 'n/a');
const boolWord = (b) => (b === true ? 'yes' : b === false ? 'no' : 'n/a');

// ── Evidence: plain-language read of one hue-mass region ────────────────────
function describeRegion(name, region) {
  if (!region) {
    return `<p><b>${esc(name)} mass:</b> the recommender reported nothing for this region.</p>`;
  }
  const names = region.namesHue === true;
  const lines = [];
  lines.push(
    `<p><b>${esc(name)} mass</b> covers <b>${pct(region.pixelShare)}</b> of the image. ` +
    // Four decimal places, not three: the portrait's two regions measure
    // 0.0015 and 0.0007, which both round to "0.001" and would read as one
    // number when they differ by more than a factor of two.
    `Mean chroma <b>${num(region.meanChroma, 4)}</b>, concentration <b>${pct(region.concentration)}</b>.</p>`
  );
  if (names) {
    lines.push(
      `<p>It <b>names a hue</b>: <b>${deg(region.dominantHue)}</b>, with enough chroma mass ` +
      `(${num(region.chromaMass, 2)}) that the recommender trusts it as a colour signal.</p>`
    );
  } else {
    // Name every test that actually failed, not just the first. Both can fail
    // at once — they do for the monochrome portrait — and reporting only one
    // would understate how far the image is from naming a hue.
    const failed = [];
    if (region.meanChroma < NAMES_HUE_MIN_CHROMA) {
      failed.push(
        `its mean chroma of <b>${num(region.meanChroma, 4)}</b> is under the ` +
        `${num(NAMES_HUE_MIN_CHROMA, 3)} floor — too close to neutral grey to be a colour signal`
      );
    }
    if (region.concentration < NAMES_HUE_MIN_CONCENTRATION) {
      failed.push(
        `its colour is <b>scattered</b> rather than pooled: only <b>${pct(region.concentration)}</b> ` +
        `of it falls near one hue, under the ${pct(NAMES_HUE_MIN_CONCENTRATION)} floor`
      );
    }
    lines.push(
      `<p>It does <b>not</b> name a hue, because ${failed.join(', and ')}. ` +
      `The dominant angle it reports (${deg(region.dominantHue)}) is arithmetic on noise, ` +
      `not a colour the picture actually has.</p>`
    );
  }
  return lines.join('\n');
}

// ── Swatch and mock-window rendering ─────────────────────────────────────────
function swatch(hex, label) {
  return `<span class="swatch-item"><span class="swatch-chip" style="background:${esc(hex)}"></span><span class="swatch-label">${esc(label)}<br><code>${esc(hex)}</code></span></span>`;
}

// TWO KEY SHAPES, AND THE REASON THIS FILE CARRIES TWO FORMATTERS INSTEAD OF ONE.
// palette-engine.mjs's palettes are keyed BARE ('text-primary') because adding
// Codex's '--color-' prefix is the emitter's job; tokens() above parses
// theme.css and so returns keys that ALREADY are the full property name
// ('--color-text-primary'). Passing the second through varBlock() prefixes a
// second time and defines '--color---color-text-primary'.
//
// That is not a CSS error, which is exactly why it is dangerous: every
// `var(--color-text-primary)` in the sheet then resolves to nothing and each
// property silently falls back to its INITIAL value. It shipped once and was
// caught only by looking at the rendered page — body text rendered at the
// initial `color`, pure black, on the navy ground: about 1.1:1, unreadable,
// while every structural check (fonts loaded, images decoded, no horizontal
// overflow) stayed green. Same silent-success shape as the Fraunces bug in
// the theme recipe: a declaration naming something undefined looks like
// success. assertChromeTokensResolve() below is the guard that keeps it
// caught by the build rather than by an eye.
const varBlock = (t) => Object.entries(t).map(([k, v]) => `--color-${k}:${v};`).join('');
const shippedVarBlock = (t) => Object.entries(t)
  .map(([k, v]) => `${k}:${v.replace(/\s*!important$/, '')};`)
  .join('');
const synBlock = (syn) => Object.entries(syn).filter(([k]) => k !== '_surface').map(([role, v]) => `--syn-${role}:${v};`).join('');

let mockCounter = 0;
function renderMockWindow(groundHex, palette, syn, modeLabel) {
  mockCounter += 1;
  const scope = `mk${mockCounter}`;
  const style = `${varBlock(palette)}${synBlock(syn)}`;
  return `
  <div class="mockwin ${scope}" style="${style}">
    <div class="mw-titlebar"><span class="mw-tb-title">Codex</span><span class="mw-tb-mode">${esc(modeLabel)}</span></div>
    <div class="mw-body">
      <aside class="mw-side">
        <div class="mw-side-row">Draft the recipe</div>
        <div class="mw-side-row mw-side-row-active"><span class="mw-side-mark"></span>Review the palette</div>
        <div class="mw-side-row">Solve the scrim</div>
      </aside>
      <main class="mw-main">
        <p class="mw-para">Every value below is solved for WCAG AA against this ground, the same engine Captain's Cabin ships from.</p>
        <div class="mw-card">
          <p class="mw-card-title">Recipe inputs, not final hex</p>
          <p class="mw-card-body">Ground and accent hue only — palette-engine.mjs derives the rest.</p>
          <button type="button" class="mw-btn">Apply theme</button>
        </div>
        <div class="mw-code">
          <div class="mw-code-head">recommend-palette.mjs</div>
          <pre class="mw-code-body"><span class="mw-c">// proposed, not shipped</span>
<span class="mw-k">const</span> ground <span class="mw-o">=</span> <span class="mw-s">'${esc(groundHex)}'</span>;
<span class="mw-f">buildDark</span>(ground, { accentHue });</pre>
        </div>
      </main>
    </div>
  </div>`;
}

function renderProjection(proposal) {
  const requested = proposal.requestedAccentHue;
  const used = proposal.accentHue;
  const adjustment = proposal.accentAdjustment;
  if (requested === undefined) {
    // Ground-only proposals (and 'inherited') carry no accent projection at all.
    return `<p class="projection">Accent hue: <b>${deg(used)}</b> (not driven by the image for this proposal).</p>`;
  }
  if (!adjustment) {
    return `<p class="projection">Accent hue: image measured <b>${deg(requested)}</b>, used as-is — <b>${deg(used)}</b>. No adjustment needed.</p>`;
  }
  return `<p class="projection"><b>Projection:</b> the image measured <b>${deg(requested)}</b>, ` +
    `but the recommender proposes <b>${deg(used)}</b> instead. Reason: ${esc(adjustment)}</p>`;
}

function renderProposal(proposal, heroSlug) {
  const darkPalette = buildDark(proposal.ground, { accentHue: proposal.accentHue });
  const lightPalette = buildLight(proposal.ground, { accentHue: proposal.accentHue });
  const synDark = buildSyntax(darkPalette, 'dark');
  const synLight = buildSyntax(lightPalette, 'light');

  const auditLine = (label, audit) => {
    if (!audit) return `${label}: n/a`;
    const pass = (audit.checks ?? 0) - (audit.failed ?? 0);
    return `${label}: <b>${pass}/${audit.checks ?? '?'}</b> pass`;
  };

  return `
    <article class="proposal-card" id="${esc(heroSlug)}-${esc(proposal.id)}">
      <header class="proposal-head">
        <h4>${esc(proposal.id)}</h4>
        <p class="proposal-basis">${esc(proposal.note ?? '')}</p>
      </header>
      <div class="swatch-row">
        ${swatch(proposal.ground, 'Proposed ground')}
        ${swatch(darkPalette['background-button-primary'], 'Proposed accent (dark)')}
        ${swatch(SHIPPED_GROUND_DARK, 'Shipped navy')}
        ${swatch(SHIPPED_BRASS_DARK, 'Shipped brass')}
      </div>
      <p class="hue-line">Ground OKLCH: L ${num(proposal.groundOklch?.L)}, C ${num(proposal.groundOklch?.C)}, H ${deg(proposal.groundOklch?.H)}${proposal.groundClamped ? ' — gamut-clamped' : ''}</p>
      ${renderProjection(proposal)}
      <p class="audit-line">Audit — ${auditLine('dark', proposal.audit?.dark)}, ${auditLine('light', proposal.audit?.light)}</p>
      <div class="mock-pair">
        ${renderMockWindow(proposal.ground, darkPalette, synDark, 'Dark')}
        ${renderMockWindow(proposal.ground, lightPalette, synLight, 'Light')}
      </div>
    </article>`;
}

function renderOmitted(omitted) {
  if (!omitted || omitted.length === 0) {
    return '<p class="dim">Nothing was omitted for this hero.</p>';
  }
  return `<ul class="omitted-list">${omitted.map((o) =>
    `<li><b>${esc(o.id)}</b> — ${esc(o.reason)}</li>`).join('')}</ul>`;
}

// ── The Captain's Cabin calibration section — proof the instrument works ────
function renderCalibrationHeroImage(imageDataUri) {
  const stops = CALIBRATION_STOPS.find((s) => s.label.includes('SHIPPED')).stops;
  const stopStr = stops.map(([f, a], i) => {
    const pctF = Math.round(f * 100);
    if (a >= 1) return `${SHIPPED_GROUND_DARK} ${pctF}%`;
    return `color-mix(in srgb, ${SHIPPED_GROUND_DARK} ${Math.round(a * 100)}%, transparent) ${pctF}%`;
  }).join(', ');
  return `
  <div class="hero-proof">
    <div class="hero-proof-img" style="background-image:linear-gradient(to bottom, ${stopStr}), url(${imageDataUri});"></div>
    <p class="hero-proof-label">Shipped scrim, proven <b>5.99:1</b> worst case (tools/palette/hero-scrim.mjs, "milder B (SHIPPED)"). This is the only hero on this sheet with a solved scrim — shown here as calibration, not as a preview of anything new.</p>
  </div>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const captainsCabinImage = loadHeroImage(CAPTAINS_CABIN_HERO);
  const captainsCabinRec = await recommendPalette(captainsCabinImage, { inheritFrom: 'navy' });
  assertAllProposalsPass("Captain's Cabin (calibration)", captainsCabinRec);

  let portraitRec = null;
  let portraitNote = '';
  if (existsSync(PORTRAIT_HERO)) {
    const portraitImage = loadHeroImage(PORTRAIT_HERO);
    portraitRec = await recommendPalette(portraitImage, { inheritFrom: 'navy' });
    assertAllProposalsPass('Deep Navy Portrait candidate', portraitRec);
  } else {
    portraitNote = `<p class="note-block"><b>assets/hero-sources/BW_Jisoo.png is absent on this machine</b> — that directory is deliberately git-ignored (owner ruling 4, private/local theme). This sheet was built without the portrait section. Nothing else on this sheet depends on that file.</p>`;
  }

  function renderHeroSection(slug, title, sub, imageDataUri, rec, extraHtml = '') {
    const inheritedGround = GROUNDS[rec.inheritFrom]?.ground ?? 'n/a';
    return `
  <section class="hero-section">
    <h2>${esc(title)}</h2>
    <p class="hero-sub">${sub}</p>
    ${extraHtml}
    <div class="evidence-block">
      <img class="hero-thumb" src="${imageDataUri}" alt="${esc(title)} hero" />
      <div class="evidence-text">
        <p class="evidence-dims">${rec.tonal?.width ?? '?'}×${rec.tonal?.height ?? '?'} px</p>
        ${describeRegion('Dark', rec.analysis?.dark)}
        ${describeRegion('Bright', rec.analysis?.bright)}
        <p class="inherited-line">Inherited baseline (ground <code>${esc(inheritedGround)}</code>, accent <b>${deg(ROLE_HUES.brass)}</b>, from GROUNDS['${esc(rec.inheritFrom)}']) — every proposal is judged against this, the navy recipe unchanged.</p>
      </div>
    </div>
    <h3>Proposals</h3>
    <div class="proposal-grid">
      ${rec.proposals.map((p) => renderProposal(p, slug)).join('\n')}
    </div>
    <h3>Omitted</h3>
    ${renderOmitted(rec.omitted)}
  </section>`;
  }

  const captainsCabinUri = dataUri(CAPTAINS_CABIN_HERO, 'image/png');
  const captainsSection = renderHeroSection(
    'cc',
    "Calibration — Captain's Cabin's own hero",
    'The right answer here is already known and shipped. If the recommender cannot land near the shipped navy ground and brass accent from this image, it does not work — this section exists to prove or disprove that on sight.',
    captainsCabinUri,
    captainsCabinRec,
    renderCalibrationHeroImage(captainsCabinUri)
  );

  let portraitSection;
  if (portraitRec) {
    const portraitUri = dataUri(PORTRAIT_HERO, 'image/png');
    portraitSection = renderHeroSection(
      'portrait',
      'Deep Navy Portrait candidate — BW_Jisoo.png',
      'The owner-supplied monochrome portrait. Its scrim is <b>NOT solved</b> — measured at 1.03:1 dark and 1.02:1 light against a 4.5:1 requirement (Plan 0003 M1). Re-solving it is M4\'s work. The image is shown here strictly ALONGSIDE its mock windows, never underneath any text, for exactly that reason.',
      portraitUri,
      portraitRec
    );
  } else {
    portraitSection = `<section class="hero-section">
      <h2>Deep Navy Portrait candidate — BW_Jisoo.png</h2>
      ${portraitNote}
    </section>`;
  }

  const html = buildPage(captainsSection, portraitSection);
  assertChromeTokensResolve(html);
  writeFileSync(OUT, html);
  console.log(`sheet -> ${OUT}`);
  console.log(`captains-cabin proposals: ${captainsCabinRec.proposals.map((p) => p.id).join(', ')}`);
  if (portraitRec) console.log(`portrait proposals: ${portraitRec.proposals.map((p) => p.id).join(', ')}`);
  else console.log('portrait: skipped (BW_Jisoo.png absent on this machine)');
}

// REFUSE TO WRITE A SHEET WHOSE OWN TEXT COLOUR DOES NOT RESOLVE.
//
// Every `var(--color-…)` in this sheet's chrome reads a token the :root block
// is supposed to define. If a name is malformed, CSS does not complain — the
// property just falls back to its initial value, and for `color` that is
// black, which on this navy ground is roughly 1.1:1. A review sheet the owner
// cannot read is a failed deliverable no matter how correct its numbers are,
// and readability is this project's first design law.
//
// So the build asserts, rather than trusting, that the handful of tokens the
// page's own legibility depends on are actually defined, and that no
// double-prefixed name got emitted. Same posture as emit-theme.mjs's landmark
// probe assertion (D-0001-21): check the artefact you just built, before it
// reaches disk.
const CHROME_TOKENS_REQUIRED = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-tertiary',
  '--color-border',
  '--color-background-elevated-primary',
];

function assertChromeTokensResolve(html) {
  const doubled = /--color---/.exec(html);
  if (doubled) {
    throw new Error(
      'build-palette-recommendation: emitted a double-prefixed custom property ' +
      `(found "${html.slice(doubled.index, doubled.index + 40)}"). A parsed theme.css key already ` +
      'carries its "--color-" prefix — use shippedVarBlock() for those and varBlock() only for ' +
      'palette-engine.mjs palettes, whose keys are bare.'
    );
  }
  const missing = CHROME_TOKENS_REQUIRED.filter((t) => !html.includes(`${t}:`));
  if (missing.length) {
    throw new Error(
      `build-palette-recommendation: the sheet's own chrome reads ${missing.join(', ')} but nothing ` +
      'defines them, so those properties would fall back to their initial values and the page would ' +
      'render unreadable. Fix the :root block — do not drop the check.'
    );
  }
}

function buildPage(captainsSection, portraitSection) {
  return `<meta charset="utf-8">
<title>Codexterity — palette recommendation review (Plan 0003 M3)</title>
<style>
${FONTS}
:root{
  ${shippedVarBlock(SHIPPED_DARK)}
  --page-ground:${SHIPPED_GROUND_DARK};
}
*{box-sizing:border-box}
body{margin:0; background:var(--page-ground); color:var(--color-text-primary);
  font-family:'Literata',Georgia,serif; font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;}
.wrap{max-width:1180px; margin:0 auto; padding:40px 24px 90px;}
h1{font-family:'Fraunces',Georgia,serif; font-variation-settings:'SOFT' 30,'WONK' 0; font-optical-sizing:auto;
  font-size:clamp(28px,4.4vw,42px); font-weight:600; margin:0 0 8px; letter-spacing:-.01em;}
h2{font-family:'Fraunces',Georgia,serif; font-variation-settings:'SOFT' 30,'WONK' 0; font-optical-sizing:auto;
  font-size:26px; font-weight:600; margin:48px 0 4px; border-top:1px solid var(--color-border); padding-top:36px;}
h3{font-family:'Fraunces',Georgia,serif; font-size:16px; font-weight:600; letter-spacing:.04em;
  text-transform:uppercase; color:var(--color-text-tertiary); margin:30px 0 12px;}
h4{font-family:'Fraunces',Georgia,serif; font-size:18px; font-weight:600; margin:0;}
p{margin:0 0 8px;}
code{font-family:'Monaspace Neon',ui-monospace,monospace; font-size:12.5px; background:var(--color-token-bg-tertiary);
  padding:1px 5px; border-radius:3px;}
.eyebrow{font-size:11.5px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--color-background-button-primary); font-weight:700; margin:0 0 12px;}
.dek{color:var(--color-text-secondary); font-size:15px; max-width:76ch;}
.gate-note{margin-top:20px; border:1px solid var(--color-border-heavy); border-left:3px solid var(--color-background-button-primary);
  border-radius:0 6px 6px 0; padding:14px 18px; background:var(--color-background-elevated-primary); font-size:14px; max-width:80ch;}
.gate-note b{color:var(--color-text-primary);}
.hero-section{}
.hero-sub{color:var(--color-text-secondary); font-size:14px; max-width:80ch;}
.evidence-block{display:flex; gap:22px; align-items:flex-start; margin:18px 0; flex-wrap:wrap;}
.hero-thumb{width:280px; max-width:100%; border-radius:7px; border:1px solid var(--color-border-heavy); display:block; object-fit:cover;}
.evidence-text{flex:1; min-width:260px; font-size:14px; color:var(--color-text-secondary);}
.evidence-text p{margin:0 0 10px;}
.evidence-dims{color:var(--color-text-quaternary); font-size:12px; letter-spacing:.05em;}
.inherited-line{border-top:1px solid var(--color-border-light); padding-top:10px; margin-top:6px !important;}
.hero-proof{margin:14px 0 22px; display:flex; gap:16px; align-items:center; flex-wrap:wrap;}
.hero-proof-img{width:280px; height:158px; border-radius:7px; border:1px solid var(--color-border-heavy);
  background-size:cover; background-position:center;}
.hero-proof-label{max-width:60ch; font-size:13.5px; color:var(--color-text-secondary);}
.note-block{border:1px dashed var(--color-border-heavy); border-radius:6px; padding:14px 18px; font-size:14px;
  color:var(--color-text-secondary); max-width:76ch;}
.proposal-grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:18px;}
.proposal-card{border:1px solid var(--color-border-heavy); border-radius:8px; padding:16px 18px;
  background:var(--color-background-elevated-primary);}
.proposal-basis{font-size:12.5px; color:var(--color-text-tertiary); margin:2px 0 0;}
.swatch-row{display:flex; gap:14px; flex-wrap:wrap; margin:12px 0;}
.swatch-item{display:flex; align-items:center; gap:7px; font-size:11px; color:var(--color-text-tertiary);}
.swatch-chip{width:26px; height:26px; border-radius:5px; border:1px solid var(--color-border-heavy); flex:none;}
.swatch-label code{background:none; padding:0; font-size:10.5px;}
.hue-line{font-size:12.5px; color:var(--color-text-secondary);}
.projection{font-size:13px; background:var(--color-token-bg-tertiary); border-radius:5px; padding:8px 11px;
  color:var(--color-text-secondary);}
.audit-line{font-size:13px; margin-top:8px;}
.omitted-list{margin:0; padding-left:18px; font-size:13.5px; color:var(--color-text-secondary);}
.dim{color:var(--color-text-quaternary); font-size:13.5px;}

/* ── The mock windows — independent tiny token scopes, one per proposal/mode ── */
.mock-pair{display:flex; gap:12px; margin-top:14px; flex-wrap:wrap;}
.mockwin{flex:1; min-width:200px; border:1px solid var(--color-border-heavy); border-radius:7px; overflow:hidden;
  background:var(--color-background-surface); font-size:11px; color:var(--color-text-primary);}
.mw-titlebar{display:flex; justify-content:space-between; align-items:center; padding:6px 10px;
  background:var(--color-background-elevated-primary); border-bottom:1px solid var(--color-border);
  font-family:'Fraunces',Georgia,serif; font-size:12px; font-weight:600;}
.mw-tb-mode{font-family:'Literata',Georgia,serif; font-weight:400; font-size:10px; color:var(--color-text-tertiary); text-transform:uppercase; letter-spacing:.08em;}
.mw-body{display:flex;}
.mw-side{width:34%; background:var(--color-background-surface-under); padding:8px 6px; display:flex; flex-direction:column; gap:2px;}
.mw-side-row{padding:5px 6px; border-radius:4px; font-size:10px; color:var(--color-text-secondary); position:relative;}
.mw-side-row-active{background:var(--color-background-button-secondary-hover); color:var(--color-text-primary); padding-left:12px;}
.mw-side-mark{position:absolute; left:3px; top:50%; transform:translateY(-50%); width:2px; height:11px; border-radius:1px;
  background:var(--color-background-button-primary);}
.mw-main{flex:1; padding:9px 10px; min-width:0;}
.mw-para{color:var(--color-text-secondary); font-size:10.5px; margin:0 0 8px;}
.mw-card{border:1px solid var(--color-border); border-radius:5px; padding:8px 9px; background:var(--color-background-elevated-secondary);}
.mw-card-title{font-family:'Fraunces',Georgia,serif; font-weight:600; font-size:11px; margin:0 0 3px;}
.mw-card-body{color:var(--color-text-tertiary); font-size:10px; margin:0 0 7px;}
.mw-btn{font:inherit; font-size:10px; font-weight:700; cursor:default; border:0; border-radius:4px; padding:5px 9px;
  background:var(--color-background-button-primary); color:var(--color-text-on-accent);}
.mw-code{margin-top:8px; border:1px solid var(--color-border); border-radius:5px; overflow:hidden; background:var(--color-token-diff-surface);}
.mw-code-head{padding:4px 8px; font-size:9.5px; color:var(--color-text-tertiary); background:var(--color-background-elevated-primary);
  border-bottom:1px solid var(--color-border-light);}
.mw-code-body{margin:0; padding:7px 8px; font-family:'Monaspace Neon',ui-monospace,monospace; font-size:9.5px;
  line-height:1.5; color:var(--syn-variable); white-space:pre-wrap; word-break:break-word;}
.mw-c{color:var(--syn-comment); font-style:italic;} .mw-k{color:var(--syn-keyword);} .mw-s{color:var(--syn-string);}
.mw-f{color:var(--syn-function);} .mw-o{color:var(--syn-operator);}
@media (max-width:640px){ .mock-pair{flex-direction:column;} .evidence-block{flex-direction:column;} .hero-thumb{width:100%;} }
</style>

<div class="wrap">
  <p class="eyebrow">Codexterity · Plan 0003 M3 · palette recommendation review</p>
  <h1>An image in, recipe inputs out</h1>
  <p class="dek">This sheet is how the recommender in <code>tools/palette/recommend-palette.mjs</code> is judged — not from prose or a hex list, but from rendered proposals against real hero images. It proposes ground hue/chroma and accent hue; every value shown is then solved by <code>palette-engine.mjs</code> exactly as Captain's Cabin's own tokens are, and every proposal on this page has already passed <code>audit.mjs</code> in both modes.</p>
  <div class="gate-note">
    <p><b>The refusal this sheet enforces:</b> if any proposal below had failed WCAG AA in either mode, this file would not exist — <code>build-palette-recommendation.mjs</code> throws before writing a byte, the same shape as <code>emit-theme.mjs</code>'s build-time audit refusal. What you are looking at has already cleared that gate.</p>
    <p><b>Do not read this sheet as a preview of a finished theme.</b> The scrim that makes text legible over a hero image is solved per-image and is proven ONLY for Captain's Cabin's own hero (worst case 5.99:1). For the new portrait it is measured and UNSOLVED (1.03:1 dark, 1.02:1 light) — that is M4's work. No text sits over the portrait anywhere on this page.</p>
  </div>

  ${captainsSection}
  ${portraitSection}
</div>`;
}

await main();
