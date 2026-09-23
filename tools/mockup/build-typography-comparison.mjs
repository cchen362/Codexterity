// Builds the typography-split comparison mockup for the reopened D-0001-7 half.
//
// The owner reopened only the UI/body typeface — Fraunces stays for display
// (headings, hero, title bar) in every candidate, because the question is
// whether a dedicated text face should take UI and body, not whether Fraunces
// leaves the theme. See docs/DECISIONS.md "D-0001-7 (typography half)".
//
// This is a comparison tool, not a decision. It changes nothing in
// themes/captains-cabin/theme.css. Ground/ink/accent values are parsed out of
// theme.css exactly like tools/mockup/build-mockup.mjs, so the render can never
// drift from the locked palette.
//
// Usage:  node tools/mockup/build-typography-comparison.mjs [outfile]

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { MODE_SCOPE } from '../palette/codex-surface.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = resolve(ROOT, 'themes/captains-cabin');
const OUT = process.argv[2] || resolve(ROOT, 'docs/mockups/0003-typography-comparison.html');

// ── read the shipped theme (ground/ink/accent only — no product code touched) ─
const css = readFileSync(resolve(THEME, 'theme.css'), 'utf8');
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Plan 0004 M2 — same parser shape as tools/mockup/build-mockup.mjs: the
// block to parse is MODE_SCOPE.dark/.light (codex-surface.mjs), every value
// now carries a trailing '!important' (D-0004-2) to strip, and a renamed
// '--app-color-X' from theme.css is folded back to this file's own
// '--color-X' convention so the template below (which addresses tokens under
// their pre-OWL spelling) needs no other change. See build-mockup.mjs's
// tokens() for the full reasoning.
function tokens(scope) {
  const m = new RegExp(`${escapeRegExp(scope)}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!m) throw new Error(`could not find ${scope} in theme.css`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const t = /^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*!important\s*;/.exec(line);
    if (!t) continue;
    const rawName = t[1];
    const name = rawName.startsWith('--app-color-') ? `--color-${rawName.slice('--app-color-'.length)}` : rawName;
    out[name] = t[2].trim();
  }
  return out;
}
const DARK = tokens(MODE_SCOPE.dark);
const LIGHT = tokens(MODE_SCOPE.light);
for (const [name, t] of [['dark', DARK], ['light', LIGHT]]) {
  if (!t['--color-background-surface']) throw new Error(`${name} block parsed but has no surface token`);
}

// ── fonts ────────────────────────────────────────────────────────────────────
const FONT_DIR = resolve(THEME, 'assets/fonts');
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;
const kb = (p) => `${Math.round(statSync(p).size / 1024 * 10) / 10} KB`;

// Display face — unchanged, not in question. Same file the shipped theme uses.
const FRAUNCES_FILE = 'fraunces-latin-variable.woff2';
const FRAUNCES_URI = dataUri(resolve(FONT_DIR, FRAUNCES_FILE), 'font/woff2');

// Candidates: the UI/body face under test. `wght` is the variable font's real
// axis range (verified with fonttools against the downloaded file) so bold
// labels and buttons render the actual weight rather than a faux-bold fallback.
const CANDIDATES = [
  {
    key: 'control', family: 'Fraunces', label: 'Fraunces — control',
    kind: 'Control · display face doing double duty',
    file: 'fraunces-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '100 900',
    note: 'The shipped build today. Same face carries display and UI/body — this is the delta every other card is measured against.',
    isControl: true,
  },
  {
    key: 'literata', family: 'Literata', label: 'Literata',
    kind: 'Screen serif',
    file: 'literata-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '400 900',
    note: 'Google’s text-optimized book serif — built for long-form reading on screen, moderate stroke contrast.',
  },
  {
    key: 'newsreader', family: 'Newsreader', label: 'Newsreader',
    kind: 'Screen serif',
    file: 'newsreader-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '200 800',
    note: 'A transitional text serif drawn for editorial reading; has an optical-size axis of its own.',
  },
  {
    key: 'bitter', family: 'Bitter', label: 'Bitter',
    kind: 'Screen serif',
    file: 'bitter-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '100 900',
    note: 'A slab serif built for on-screen reading — sturdier, lower-contrast strokes than a display serif.',
  },
  {
    key: 'ibm-plex-sans', family: 'IBM Plex Sans', label: 'IBM Plex Sans',
    kind: 'Humanist sans',
    file: 'ibm-plex-sans-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '100 700',
    note: 'IBM’s corporate humanist sans — even strokes, engineered for dense UI at small sizes.',
  },
  {
    key: 'commissioner', family: 'Commissioner', label: 'Commissioner',
    kind: 'Humanist sans',
    file: 'commissioner-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '100 900',
    note: 'A grotesque-leaning variable sans with a wide weight range and a slightly warmer skeleton than most UI grotesques.',
  },
  {
    key: 'work-sans', family: 'Work Sans', label: 'Work Sans',
    kind: 'Humanist sans',
    file: 'work-sans-latin-variable.woff2', licence: 'SIL OFL 1.1', wght: '100 900',
    note: 'Optically sized for text at small sizes — designed down from a display grotesque rather than up from a UI face.',
  },
];

const fontFaces = [
  `@font-face{font-family:'Fraunces';src:url(${FRAUNCES_URI}) format('woff2');font-weight:100 900;font-display:block;}`,
  ...CANDIDATES.filter((c) => !c.isControl).map((c) =>
    `@font-face{font-family:'${c.family}';src:url(${dataUri(resolve(FONT_DIR, c.file), 'font/woff2')}) format('woff2');font-weight:${c.wght};font-display:block;}`
  ),
].join('\n');

const varBlock = (t) => Object.entries(t).map(([k, v]) => `${k}:${v};`).join('');

// ── shared product copy (Captain's Cabin voice, identical across every card) ──
const SIDEBAR_ITEMS = [
  'Resolve the launcher’s exe path',
  'Audit theme.css token coverage',
  'Wire the hot-reload watcher',
];
const USER_TURN = 'Why does the launcher resolve the executable with Get-AppxPackage instead of a path?';
const ASST_PARAGRAPH = 'Because the Store rewrites the install directory on every update, the version number is baked into the folder name. Resolving the package by identity survives that; a literal path breaks on the very next release. The launcher asks Windows which package owns the identity, reads its install location at that moment, and hands the resolved executable straight to the injector — nothing is cached, nothing is guessed.';
const DEK = 'Pick up where you left off, or start something new.';
const META = 'Applied 2s ago · gpt-5.4 · 1 landmark unverified';
const COMPOSER = 'Ask Codex to change something…';

// ── one candidate card ─────────────────────────────────────────────────────
function candidateCard(c) {
  const bodyFamily = c.isControl ? 'Fraunces' : c.family;
  const wc = ASST_PARAGRAPH.trim().split(/\s+/).length;
  return `
  <article class="cand" style="--body-font:'${bodyFamily}';${c.isControl ? "--body-var:'SOFT' 30,'WONK' 0,'opsz' 14;" : ''}">
    <header class="cand-head">
      <span class="cand-kind">${c.kind}</span>
      <h3>${c.label}</h3>
      <p class="cand-meta">${c.licence} · <code>${c.file}</code> · ${kb(resolve(FONT_DIR, c.file))}</p>
      <p class="cand-note">${c.note}</p>
    </header>
    <div class="cand-win">
      <div class="cand-titlebar"><span class="cand-tb-title">Codex</span><span class="cand-tb-crumb">codexterity / injector</span></div>
      <div class="cand-body">
        <aside class="cand-side">
          <p class="cand-side-head">Today</p>
          <ul class="cand-tasks">${SIDEBAR_ITEMS.map((t, i) => `<li${i === 0 ? ' class="on"' : ''}>${t}</li>`).join('')}</ul>
        </aside>
        <main class="cand-main">
          <p class="cand-user">${USER_TURN}</p>
          <p class="cand-asst">${ASST_PARAGRAPH}</p>
          <p class="cand-dek">${DEK}</p>
          <div class="cand-row">
            <button class="cand-btn" type="button">Apply theme</button>
            <span class="cand-metatext">${META}</span>
          </div>
          <div class="cand-composer">${COMPOSER}</div>
        </main>
      </div>
    </div>
    <p class="cand-wc">Paragraph shown at ${wc} words — identical copy on every card.</p>
  </article>`;
}

const html = `<meta charset="utf-8">
<title>Captain's Cabin — typography comparison (D-0001-7 reopened)</title>
<style>
${fontFaces}
:root{
  --display-var:'SOFT' 40,'WONK' 1,'opsz' 144;
}
:root[data-mode="dark"]{ ${varBlock(DARK)} --page:#05080D; }
:root[data-mode="light"]{ ${varBlock(LIGHT)} --page:#D9CBB0; }
:root[data-size="13"]{ --ui-size:13px; }
:root[data-size="14"]{ --ui-size:14px; }
:root[data-size="15"]{ --ui-size:15px; }
*{box-sizing:border-box}
body{margin:0; background:var(--page); color:var(--color-text-primary);
  font-family:'Fraunces',Georgia,serif; font-variation-settings:'SOFT' 30,'WONK' 0,'opsz' 14;
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;}
.wrap{max-width:1440px; margin:0 auto; padding:32px 20px 80px;}
h1{font-family:'Fraunces',serif; font-variation-settings:var(--display-var);
  font-size:clamp(26px,4.5vw,42px); font-weight:600; margin:0; letter-spacing:-.015em; text-wrap:balance;}
.eyebrow{font-size:11px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--color-background-button-primary); font-weight:700; margin:0 0 10px;}
.dek{color:var(--color-text-tertiary); font-size:14.5px; max-width:74ch; margin:8px 0 0;}
.controls{position:sticky; top:0; z-index:20; display:flex; flex-wrap:wrap; gap:12px 22px; align-items:center;
  margin:26px 0 26px; padding:12px 16px; border:1px solid var(--color-border);
  border-radius:6px; background:var(--color-background-elevated-primary);
  box-shadow:0 8px 24px -12px rgba(0,0,0,.5);}
.ctl-label{font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--color-text-tertiary);}
.seg{display:flex; gap:2px; padding:3px; border:1px solid var(--color-border-light); border-radius:5px;}
.seg button{font:inherit; font-size:13.5px; cursor:pointer; border:0; border-radius:3px; padding:5px 12px;
  background:transparent; color:var(--color-text-tertiary);}
.seg button[aria-pressed="true"]{background:var(--color-background-button-primary);
  color:var(--color-text-on-accent); font-weight:700;}
.seg button:focus-visible{outline:2px solid var(--color-border-focus); outline-offset:2px;}

.grid{display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:18px; align-items:start;}
.cand{border:1px solid var(--color-border-heavy); border-radius:9px; overflow:hidden;
  background:var(--color-background-elevated-primary); display:flex; flex-direction:column;}
.cand-head{padding:14px 16px 12px; border-bottom:1px solid var(--color-border);}
.cand-kind{font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--color-text-quaternary);}
.cand-head h3{font-family:'Fraunces',serif; font-variation-settings:var(--display-var);
  font-size:19px; font-weight:600; margin:4px 0 5px;}
.cand-meta{margin:0 0 6px; font-size:11.5px; color:var(--color-text-tertiary);}
.cand-meta code{background:var(--color-token-bg-tertiary); padding:1px 5px; border-radius:3px; font-size:11px;
  font-family:'Monaspace Xenon',ui-monospace,monospace;}
.cand-note{margin:0; font-size:12.5px; color:var(--color-text-secondary); line-height:1.5;}

.cand-win{background:var(--color-background-surface); margin:0; flex:1; display:flex; flex-direction:column;}
.cand-titlebar{display:flex; align-items:baseline; gap:9px; padding:8px 14px;
  background:var(--color-background-elevated-secondary); border-bottom:1px solid var(--color-border);
  font-family:'Fraunces',serif;}
.cand-tb-title{font-variation-settings:var(--display-var); font-size:14px; font-weight:600;}
.cand-tb-crumb{color:var(--color-text-tertiary); font-size:var(--ui-size); font-family:var(--body-font),Georgia,serif;}
.cand-body{display:flex; flex:1;}
.cand-side{width:150px; flex:none; border-right:1px solid var(--color-border);
  background:var(--color-background-elevated-primary); padding:10px 10px;}
.cand-side-head{margin:0 0 4px; font-size:9.5px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--color-text-tertiary); font-family:'Fraunces',serif;}
.cand-tasks{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px;
  font-family:var(--body-font),Georgia,serif; font-size:var(--ui-size); color:var(--color-text-secondary);}
.cand-tasks li{padding:5px 7px; border-radius:5px; line-height:1.35;}
.cand-tasks li.on{background:var(--color-token-bg-tertiary); color:var(--color-text-primary);
  box-shadow:inset 2px 0 0 var(--color-background-button-primary);}
.cand-main{flex:1; min-width:0; padding:14px 16px; display:flex; flex-direction:column; gap:12px;
  font-family:var(--body-font),Georgia,serif; font-size:var(--ui-size);}
.cand-user{align-self:flex-end; max-width:88%; margin:0; background:var(--color-background-elevated-secondary);
  border:1px solid var(--color-border); border-radius:8px 8px 3px 8px; padding:8px 11px;
  color:var(--color-text-primary); line-height:1.5;}
.cand-asst{margin:0; color:var(--color-text-primary); line-height:1.62; max-width:62ch;}
.cand-dek{margin:0; color:var(--color-text-tertiary); font-size:calc(var(--ui-size) - 1px);}
.cand-row{display:flex; align-items:center; gap:10px; flex-wrap:wrap;}
.cand-btn{font-family:var(--body-font),Georgia,serif; font-size:var(--ui-size); font-weight:700; cursor:default;
  background:var(--color-background-button-primary); color:var(--color-text-on-accent);
  border:0; border-radius:5px; padding:6px 13px;}
.cand-metatext{font-size:calc(var(--ui-size) - 1.5px); color:var(--color-text-quaternary);}
.cand-composer{margin-top:auto; padding:8px 11px; border-radius:6px; border:1px solid var(--color-border-heavy);
  background:var(--color-token-bg-tertiary); color:var(--color-text-quaternary); font-size:var(--ui-size);}
.cand-wc{margin:0; padding:8px 16px; font-size:10.5px; color:var(--color-text-quaternary);
  border-top:1px solid var(--color-border); background:var(--color-background-elevated-primary);
  font-family:'Fraunces',serif;}

.note{margin-top:30px; border:1px solid var(--color-border);
  border-left:3px solid var(--color-background-button-primary); border-radius:0 6px 6px 0;
  padding:16px 20px; background:var(--color-background-elevated-primary);}
.note p{margin:0 0 8px; color:var(--color-text-secondary); font-size:14px; max-width:76ch;}
.note p:last-child{margin-bottom:0;}
.note b{color:var(--color-text-primary); font-weight:600;}
@media (max-width:480px){
  .cand-side{width:120px;}
}
</style>

<div class="wrap">
  <p class="eyebrow">Codexterity · Captain's Cabin · D-0001-7 (typography half) — comparison, not a decision</p>
  <h1>Does the UI face need to split from Fraunces?</h1>
  <p class="dek">Same screen, same copy, same locked palette — only the UI/body face changes per card. Fraunces stays for display (title bar, card headings) everywhere; the control card also keeps it for body text so you can see the exact thing you flagged in the real app. Flip Mode and Size to test at the sizes that actually matter.</p>

  <div class="controls">
    <span class="ctl-label">Mode</span>
    <div class="seg" id="modeseg">
      <button type="button" data-mode="dark" aria-pressed="true">Dark · navy</button>
      <button type="button" data-mode="light" aria-pressed="false">Light · parchment</button>
    </div>
    <span class="ctl-label">Size</span>
    <div class="seg" id="sizeseg">
      <button type="button" data-size="13" aria-pressed="false">13px</button>
      <button type="button" data-size="14" aria-pressed="true">14px</button>
      <button type="button" data-size="15" aria-pressed="false">15px</button>
    </div>
  </div>

  <div class="grid">
    ${CANDIDATES.map(candidateCard).join('')}
  </div>

  <div class="note">
    <p><b>What is fixed across every card:</b> the ground, ink and accent tokens (parsed straight out of <code>theme.css</code>, not duplicated), the sidebar copy, the question-and-answer exchange, the 66-word paragraph, and the button/metadata copy. Only <code>--body-font</code> and, for the control card, <code>--body-var</code> change.</p>
    <p><b>What is not being tested here:</b> the mono face (Monaspace Xenon) — not in question, untouched. And the display face itself — every card keeps Fraunces for the title bar and card headings, because the question this sheet answers is whether the UI/body half should split off, not whether Fraunces leaves the theme.</p>
    <p><b>Ground truth for every token:</b> <code>themes/captains-cabin/theme.css</code>. This build parses that file rather than copying values, so if the mockup and the shipped theme ever disagree, this build fails outright.</p>
  </div>
</div>

<script>
(function(){
  var root = document.documentElement, state = { mode:'dark', size:'14' };
  function apply(){ root.dataset.mode = state.mode; root.dataset.size = state.size; }
  function wire(id, attr, key){
    var box = document.getElementById(id);
    box.addEventListener('click', function(e){
      var b = e.target.closest('button'); if(!b) return;
      state[key] = b.dataset[attr];
      box.querySelectorAll('button').forEach(function(x){ x.setAttribute('aria-pressed', String(x===b)); });
      apply();
    });
  }
  state.mode = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  document.querySelectorAll('#modeseg button').forEach(function(b){
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  });
  wire('modeseg','mode','mode'); wire('sizeseg','size','size');
  apply();
})();
</script>`;

writeFileSync(OUT, html);
console.log(`typography comparison → ${OUT}`);
console.log(`candidates: ${CANDIDATES.map((c) => c.family).join(', ')}`);
