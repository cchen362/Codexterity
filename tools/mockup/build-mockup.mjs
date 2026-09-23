// Builds the Captain's Cabin UI mockup.
//
// Values are parsed out of themes/captains-cabin/theme.css rather than re-derived,
// because that file is the single source of truth (docs/ENGINEERING.md). If the
// mockup and the shipped theme ever disagree, this build is what catches it.
//
// The hero image is picked up automatically if present, so dropping the generated
// file into themes/captains-cabin/assets/ needs no code change:
//     themes/captains-cabin/assets/hero-empty-state.(webp|png|jpg)
//
// Usage:  node tools/mockup/build-mockup.mjs [outfile]

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, extname } from 'node:path';
import { MODE_SCOPE } from '../palette/codex-surface.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME = resolve(ROOT, 'themes/captains-cabin');
const OUT = process.argv[2] || resolve(ROOT, 'docs/mockups/0002-captains-cabin-character-pass.html');

// ── read the shipped theme ───────────────────────────────────────────────────
const css = readFileSync(resolve(THEME, 'theme.css'), 'utf8');
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Plan 0004 M2 — the block to parse is now MODE_SCOPE.dark/.light
// (codex-surface.mjs), not a literal '.electron-dark'/'.electron-light'
// class, and every value now carries a trailing '!important' (D-0004-2)
// this parser must strip. NORMALIZATION: this mockup's OWN template below
// (varBlock, and every hand-written 'var(--color-*)' reference in its CSS)
// keeps addressing tokens under their PRE-OWL '--color-*' spelling — that is
// an internal convention of THIS FILE, not a claim about what Codex itself
// reads, so a renamed '--app-color-X' from theme.css is folded back to
// '--color-X' here rather than rewriting every var() reference in the
// template below. tokenProperty() in codex-surface.mjs is the inverse of
// this normalization and is not reused here because it goes the other
// direction (bare key -> real CSS name); this parser goes real CSS name ->
// this file's own bare-'--color-' convention.
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
const syntax = JSON.parse(readFileSync(resolve(THEME, 'syntax.json'), 'utf8'));

// ── assets ───────────────────────────────────────────────────────────────────
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(p).toString('base64')}`;
const FONTS = [
  ['Fraunces', 'fraunces-latin-variable.woff2', 'font-weight:100 900;'],
  ['Monaspace Xenon', 'monaspace-xenon-latin-400.woff2', 'font-weight:400;'],
].map(([fam, file, extra]) =>
  `@font-face{font-family:'${fam}';src:url(${dataUri(resolve(THEME, 'assets/fonts', file), 'font/woff2')}) format('woff2');font-display:block;${extra}}`
).join('');

const crest = readFileSync(resolve(THEME, 'assets/compass-rose.svg'), 'utf8')
  .replace(/<\?xml[^>]*\?>/, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/ (width|height)="\d+"/g, '')
  .trim();

const HERO_MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
let heroUri = null, heroFile = null;
for (const ext of Object.keys(HERO_MIME)) {
  const p = resolve(THEME, 'assets/hero-empty-state' + ext);
  if (existsSync(p)) { heroUri = dataUri(p, HERO_MIME[ext]); heroFile = 'hero-empty-state' + ext; break; }
}

const varBlock = (t) => Object.entries(t).map(([k, v]) => `${k}:${v};`).join('');
const synBlock = (mode) => Object.entries(syntax.modes[mode])
  .filter(([k]) => k !== '_meta')
  .map(([role, v]) => `--syn-${role}:${v.color};`).join('');

const CODE = `<span class="c">// D-0001-1 — official Electron API only; no debug port is ever opened.</span>
<span class="k">const</span> { app } <span class="o">=</span> <span class="f">require</span>(<span class="s">'electron'</span>);
<span class="k">const</span> theme <span class="o">=</span> <span class="f">loadTheme</span>(process.env.<span class="t">CDX_THEME</span>);

app.<span class="f">on</span>(<span class="s">'browser-window-created'</span>, (_evt, win) <span class="o">=></span> {
  win.webContents.<span class="f">on</span>(<span class="s">'dom-ready'</span>, () <span class="o">=></span> {
    win.webContents.<span class="f">insertCSS</span>(theme.css, { cssOrigin: <span class="s">'user'</span> });
  });
});`;

const TASKS_TODAY = [
  ['Resolve the MSIX exe without a hardcoded path', '2m', true],
  ['Audit theme.css token coverage', '41m', false],
  ['Wire the hot-reload file watcher', '3h', false],
  ['Verify landmark presence at inject time', '5h', false],
];
const TASKS_YDAY = [
  ['Decode Electron fuse bytes in chrome.dll', '1d', false],
  ['Draft the .ccskin manifest schema', '1d', false],
  ['Solve the brass ramp for AA on navy', '1d', false],
];
const taskList = (rows) => rows.map(([label, when, on]) =>
  `<li${on ? ' class="on"' : ''}><span>${label}</span><em>${when}</em></li>`).join('');

const sidebar = `
  <aside class="side">
    <button class="btn-primary" type="button">New task</button>
    <label class="field"><input type="text" placeholder="Search tasks" aria-label="Search tasks" /></label>
    <div class="side-scroll">
      <p class="side-head">Today</p>
      <ul class="tasks">${taskList(TASKS_TODAY)}</ul>
      <p class="side-head">Yesterday</p>
      <ul class="tasks">${taskList(TASKS_YDAY)}</ul>
    </div>
    <div class="side-foot">
      <span class="avatar" aria-hidden="true"></span>
      <span class="side-user">Signed in</span><span class="pill">gpt-5.4</span>
    </div>
  </aside>`;

const titlebar = (crumb) => `
  <div class="titlebar">
    <span class="tb-crest" aria-hidden="true">${crest}</span>
    <span class="tb-title">Codex</span><span class="tb-crumb">${crumb}</span>
    <span class="tb-spacer"></span>
    <span class="tb-caption" aria-hidden="true"><i></i><i></i><i></i></span>
  </div>`;

const heroArt = heroUri
  ? `<div class="hero-art has-image" aria-hidden="true"></div>`
  : `<div class="hero-art" aria-hidden="true"><span class="hero-tag">No hero generated yet — placeholder</span></div>`;

const html = `<title>Captain's Cabin — character pass</title>
<style>
${FONTS}
:root{
  --ui:'Fraunces'; --mono:'Monaspace Xenon';
  --display-var:'SOFT' 40,'WONK' 1,'opsz' 144; --ui-var:'SOFT' 30,'WONK' 0,'opsz' 14;
  ${heroUri ? `--hero:url(${heroUri});` : ''}
}
:root[data-mode="dark"]{ ${varBlock(DARK)} ${synBlock('dark')} --page:#05080D; }
:root[data-mode="light"]{ ${varBlock(LIGHT)} ${synBlock('light')} --page:#D9CBB0; }
*{box-sizing:border-box}
body{margin:0; background:var(--page); color:var(--color-text-primary);
  font-family:var(--ui),Georgia,serif; font-variation-settings:var(--ui-var);
  font-size:16px; line-height:1.6; -webkit-font-smoothing:antialiased;}
.wrap{max-width:1200px; margin:0 auto; padding:40px 24px 80px;}
h1{font-family:var(--ui),serif; font-variation-settings:var(--display-var);
  font-size:clamp(30px,5vw,48px); font-weight:600; margin:0; letter-spacing:-.015em; text-wrap:balance;}
h2{font-family:var(--ui),serif; font-variation-settings:var(--display-var);
  font-size:24px; font-weight:600; margin:0;}
.eyebrow{font-size:11.5px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--color-background-button-primary); font-weight:700; margin:0 0 12px;}
.dek{color:var(--color-text-tertiary); font-size:15px; max-width:64ch; margin:8px 0 0;}
.controls{position:sticky; top:0; z-index:20; display:flex; flex-wrap:wrap; gap:12px 20px; align-items:center;
  margin:32px 0 28px; padding:12px 16px; border:1px solid var(--color-border);
  border-radius:6px; background:var(--color-background-elevated-primary);}
.ctl-label{font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--color-text-tertiary);}
.seg{display:flex; gap:2px; padding:3px; border:1px solid var(--color-border-light); border-radius:5px;}
.seg button{font:inherit; font-size:14px; cursor:pointer; border:0; border-radius:3px; padding:5px 13px;
  background:transparent; color:var(--color-text-tertiary);}
.seg button[aria-pressed="true"]{background:var(--color-background-button-primary);
  color:var(--color-text-on-accent); font-weight:700;}
.seg button:focus-visible{outline:2px solid var(--color-border-focus); outline-offset:2px;}
.mock-label{font-size:11px; letter-spacing:.18em; text-transform:uppercase;
  color:var(--color-text-tertiary); margin:40px 0 12px;}

/* ══ the window ══════════════════════════════════════════════════════════ */
.win{border:1px solid var(--color-border-heavy); border-radius:9px; overflow:hidden;
  background:var(--color-background-surface); font-size:14px; color:var(--color-text-primary);}
.titlebar{display:flex; align-items:center; gap:10px; padding:0 12px; height:40px;
  background:var(--color-background-elevated-primary); border-bottom:1px solid var(--color-border);}
.tb-crest{width:16px; height:16px; flex:none; color:var(--color-text-quaternary); display:block;}
.tb-crest svg{width:16px; height:16px; display:block;}
.tb-title{font-variation-settings:var(--display-var); font-size:15px; font-weight:600;}
.tb-crumb{color:var(--color-text-tertiary); font-size:12.5px;}
.tb-spacer{flex:1}
.tb-caption{display:flex; gap:14px}
.tb-caption i{width:10px; height:1px; background:var(--color-icon-tertiary); display:block;}
.body{display:grid; grid-template-columns:244px 1fr; position:relative; min-height:540px;}
.body > *{min-width:0;}
.side{border-right:1px solid var(--color-border); background:var(--color-background-elevated-primary);
  padding:14px 12px; display:flex; flex-direction:column; gap:10px; min-width:0;}
.side-scroll{overflow-y:auto; max-height:250px; margin-right:-4px; padding-right:4px;}
.btn-primary{font:inherit; font-size:13.5px; font-weight:700; cursor:pointer;
  background:var(--color-background-button-primary); color:var(--color-text-on-accent);
  border:0; border-radius:5px; padding:8px 14px;}
.btn-secondary{font:inherit; font-size:13.5px; cursor:pointer;
  background:var(--color-background-button-secondary); color:var(--color-text-primary);
  border:1px solid var(--color-border-heavy); border-radius:5px; padding:8px 14px;}
.field input{width:100%; font:inherit; font-size:13px; padding:6px 9px; border-radius:5px;
  border:1px solid var(--color-border-heavy); background:var(--color-token-bg-tertiary);
  color:var(--color-text-primary);}
.field input::placeholder{color:var(--color-text-quaternary);}
.field input:focus{outline:2px solid var(--color-border-focus); outline-offset:1px;}
.side-head{margin:8px 0 4px; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--color-text-tertiary);}
.tasks{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:1px;}
.tasks li{display:flex; gap:8px; align-items:baseline; padding:6px 8px; border-radius:5px;
  font-size:13.5px; color:var(--color-text-secondary); min-width:0;}
.tasks li span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.tasks li em{font-style:normal; font-size:11.5px; color:var(--color-text-quaternary); flex:none;}
.tasks li.on{background:var(--color-token-bg-tertiary); color:var(--color-text-primary);}
.side-foot{margin-top:auto; display:flex; align-items:center; gap:8px; padding-top:10px;
  border-top:1px solid var(--color-border-light);}
.avatar{width:22px; height:22px; border-radius:50%; border:1px solid var(--color-border-heavy);
  background:var(--color-token-bg-tertiary); flex:none;}
.side-user{font-size:12.5px; color:var(--color-text-tertiary); flex:1; min-width:0;}
.pill{font-size:11px; padding:2px 7px; border-radius:99px; border:1px solid var(--color-border-heavy);
  color:var(--color-text-secondary); flex:none;}
.main{padding:22px 26px; display:flex; flex-direction:column; gap:16px; min-width:0;}
.turn p{margin:0;}
.turn.user{align-self:flex-end; max-width:74%; background:var(--color-background-elevated-secondary);
  border:1px solid var(--color-border); border-radius:9px 9px 3px 9px; padding:10px 14px;}
.turn.user code{background:var(--color-token-bg-tertiary); padding:1px 5px; border-radius:3px; font-size:12.5px;}
.turn.asst{display:flex; flex-direction:column; gap:12px; min-width:0;}
.turn.asst > p{max-width:66ch;}
.code{border:1px solid var(--color-border); border-radius:7px; overflow:hidden;
  background:var(--color-token-diff-surface);}
.code-head{display:flex; justify-content:space-between; align-items:center; gap:10px; padding:6px 11px;
  background:var(--color-background-elevated-primary); border-bottom:1px solid var(--color-border-light);
  font-size:12px; color:var(--color-text-tertiary);}
.chip-run{font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
  color:var(--color-text-quaternary); flex:none;}
.code pre{margin:0; padding:12px 14px; overflow-x:auto; font-family:var(--mono),ui-monospace,monospace;
  font-size:12.5px; line-height:1.65; color:var(--syn-variable);}
.c{color:var(--syn-comment); font-style:italic;} .k{color:var(--syn-keyword);} .s{color:var(--syn-string);}
.f{color:var(--syn-function);} .t{color:var(--syn-type);} .o{color:var(--syn-operator);}
.d-del{display:block; background:var(--color-editor-deleted); margin:0 -14px; padding:0 14px;}
.d-add{display:block; background:var(--color-editor-added); margin:0 -14px; padding:0 14px;}
.chips-row{display:flex; flex-wrap:wrap; gap:8px;}
.stat{font-size:12px; padding:3px 10px; border-radius:99px; border:1px solid var(--color-border);}
.stat.ok{background:var(--color-background-status-success); color:var(--color-text-success);}
.stat.warn{color:var(--color-text-warning);}
.stat.err{background:var(--color-background-danger-active); color:var(--color-text-error);}
.actions{display:flex; gap:9px; flex-wrap:wrap;}
.composer{margin-top:auto; display:flex; align-items:center; gap:10px; padding:11px 14px; border-radius:7px;
  border:1px solid var(--color-border-heavy); background:var(--color-token-bg-tertiary);}
.composer .ph{flex:1; min-width:0; color:var(--color-text-quaternary); font-size:13.5px;}
.composer .send{width:26px; height:26px; border-radius:5px;
  background:var(--color-background-button-primary); flex:none;}
.popover{position:absolute; left:14px; bottom:56px; width:214px; border-radius:7px; padding:7px;
  background:var(--color-background-elevated-secondary); border:1px solid var(--color-border-heavy);}
.pop-head{margin:2px 8px 6px; font-size:10.5px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--color-text-tertiary);}
.popover ul{list-style:none; margin:0; padding:0;}
.popover li{display:flex; justify-content:space-between; padding:6px 8px; border-radius:4px;
  font-size:13px; color:var(--color-text-secondary);}
.popover li.on{background:var(--color-token-bg-tertiary); color:var(--color-text-primary);}
.popover li.on b{color:var(--color-background-button-primary);}

/* empty state */
.main.hero{position:relative; padding:0; justify-content:flex-end; overflow:hidden;}
.hero-art{position:absolute; inset:0; background:var(--color-background-elevated-primary);
  display:flex; align-items:flex-start; justify-content:center; padding-top:12px;}
.hero-art.has-image{background-image:var(--hero); background-size:cover; background-position:center top;}
.hero-tag{font-size:10px; letter-spacing:.16em; text-transform:uppercase;
  color:var(--color-text-quaternary); border:1px dashed var(--color-border-heavy);
  border-radius:99px; padding:3px 10px;}
.hero-scrim{position:absolute; inset:0; background:linear-gradient(180deg,
  transparent 0%,
  color-mix(in oklab, var(--color-background-surface) 70%, transparent) 34%,
  var(--color-background-surface) 62%);}
.hero-content{position:relative; padding:26px; display:flex; flex-direction:column; gap:14px;}
.hero-content h4{margin:0; font-variation-settings:var(--display-var); font-size:27px; font-weight:600;}
.hero-content > p{margin:0; color:var(--color-text-secondary); font-size:14px;}
.hero-cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:9px;}
.hcard{border:1px solid var(--color-border-heavy); border-radius:7px; padding:14px 12px; font-size:13px;
  background:var(--color-background-elevated-secondary); color:var(--color-text-secondary);}

/* ══ CHARACTER PASS — Layer 2 named hooks ════════════════════════════════
   Every rule below decorates CHROME. None of it puts variation behind body
   text, so D-0001-6 and the contrast proof are untouched.                  */
:root[data-treat="character"] .titlebar{
  background:var(--color-background-elevated-secondary);
  box-shadow:inset 0 -1px 0 color-mix(in oklab, var(--color-background-button-primary) 34%, transparent);
  border-bottom-color:transparent;
}
:root[data-treat="character"] .tb-crest{ color:var(--color-background-button-primary); opacity:.85; }
:root[data-treat="character"] .tasks li.on{
  box-shadow:inset 2px 0 0 var(--color-background-button-primary);
}
:root[data-treat="character"] .tasks li:not(.on):hover{ background:var(--color-token-bg-secondary); }
:root[data-treat="character"] .side-scroll{ scrollbar-width:thin;
  scrollbar-color:var(--color-border-heavy) transparent; }
:root[data-treat="character"] .side-scroll::-webkit-scrollbar{ width:8px; }
:root[data-treat="character"] .side-scroll::-webkit-scrollbar-thumb{
  background:color-mix(in oklab, var(--color-background-button-primary) 45%, transparent);
  border-radius:99px; }
:root[data-treat="character"] .side-scroll::-webkit-scrollbar-track{ background:transparent; }
:root[data-treat="character"] .popover{
  box-shadow:0 18px 40px -12px rgba(0,0,0,.7),
             inset 0 1px 0 color-mix(in oklab, var(--color-background-button-primary) 20%, transparent);
}
:root[data-treat="character"] .code-head{
  box-shadow:inset 3px 0 0 color-mix(in oklab, var(--color-background-button-primary) 60%, transparent);
}
:root[data-treat="character"] .composer{ border-color:var(--color-border-focus); }
:root[data-treat="character"] .btn-primary{
  box-shadow:inset 0 1px 0 rgba(255,255,255,.22), 0 1px 2px rgba(0,0,0,.35);
}
:root[data-treat="character"] .hcard{
  box-shadow:inset 0 1px 0 color-mix(in oklab, var(--color-background-button-primary) 16%, transparent);
}
:root[data-treat="character"] .hcard:hover{ border-color:var(--color-border-focus); }
:root[data-treat="character"] ::selection{
  background:color-mix(in oklab, var(--color-background-button-primary) 34%, transparent);
  color:var(--color-text-primary);
}
:root[data-treat="character"] .pill{
  border-color:color-mix(in oklab, var(--color-background-button-primary) 45%, transparent);
  color:var(--color-background-button-primary);
}

.note{margin-top:26px; border:1px solid var(--color-border);
  border-left:3px solid var(--color-background-button-primary); border-radius:0 6px 6px 0;
  padding:18px 22px; background:var(--color-background-elevated-primary);}
.note p{margin:0 0 10px; color:var(--color-text-secondary); font-size:15px; max-width:70ch;}
.note p:last-child{margin-bottom:0;}
.note b{color:var(--color-text-primary); font-weight:600;}
@media (max-width:780px){
  .body{grid-template-columns:1fr;}
  .side{border-right:0; border-bottom:1px solid var(--color-border);}
  .popover{position:static; width:auto; margin:0 16px 16px;}
  .main{padding:16px;}
  .turn.user{max-width:92%;}
  .hero-content{padding:18px;}
}
</style>

<div class="wrap">
  <p class="eyebrow">Codexterity · Captain's Cabin · character pass</p>
  <h1>Chrome, not surfaces</h1>
  <p class="dek">The same theme with Layer 2 applied. Every rule decorates chrome — title bar, sidebar, scrollbar, popover, code header, focus, selection — and none of it puts variation behind body text, so the contrast proof still holds. Toggle <em>Flat</em> against <em>Character</em> to see the delta.</p>

  <div class="controls">
    <span class="ctl-label">Mode</span>
    <div class="seg" id="modeseg">
      <button type="button" data-mode="dark" aria-pressed="true">Dark</button>
      <button type="button" data-mode="light" aria-pressed="false">Light</button>
    </div>
    <span class="ctl-label">Treatment</span>
    <div class="seg" id="treatseg">
      <button type="button" data-treat="flat" aria-pressed="true">Flat — as committed</button>
      <button type="button" data-treat="character" aria-pressed="false">Character pass</button>
    </div>
  </div>

  <p class="mock-label">Empty state${heroUri ? '' : ' — awaiting hero artwork'}</p>
  <div class="win">
    ${titlebar('codexterity')}
    <div class="body">
      ${sidebar}
      <main class="main hero">
        ${heroArt}
        <div class="hero-scrim" aria-hidden="true"></div>
        <div class="hero-content">
          <h4>What should we build?</h4>
          <p>Pick up where you left off, or start something new.</p>
          <div class="hero-cards">
            <span class="hcard">Explore and understand code</span>
            <span class="hcard">Build a new feature</span>
            <span class="hcard">Review and suggest changes</span>
            <span class="hcard">Fix issues and failures</span>
          </div>
          <div class="composer"><span class="ph">Ask Codex to change something…</span><span class="send"></span></div>
        </div>
      </main>
    </div>
  </div>

  <p class="mock-label">A working session</p>
  <div class="win">
    ${titlebar('codexterity / injector')}
    <div class="body">
      ${sidebar}
      <main class="main">
        <div class="turn user"><p>Why does the launcher resolve the executable with <code>Get-AppxPackage</code> instead of a path?</p></div>
        <div class="turn asst">
          <p>Because the Store rewrites the install directory on every update — the version is baked into the folder name. Resolving the package by identity survives that; a literal path breaks on the next release.</p>
          <div class="code">
            <div class="code-head"><span>injector/core/preload.js</span><span class="chip-run">JavaScript</span></div>
            <pre><code>${CODE}</code></pre>
          </div>
          <div class="code">
            <div class="code-head"><span>launcher/windows/resolve-codex.ps1</span><span class="chip-run">2 changes</span></div>
<pre><code><span class="d-del">- $exe = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_1.4.2\\codex.exe'</span>
<span class="d-add">+ $exe = (Get-AppxPackage OpenAI.Codex).InstallLocation + '\\codex.exe'</span></code></pre>
          </div>
          <div class="chips-row">
            <span class="stat ok">2 files changed</span>
            <span class="stat warn">1 landmark unverified</span>
            <span class="stat err">0 failures</span>
          </div>
          <div class="actions">
            <button class="btn-primary" type="button">Apply theme</button>
            <button class="btn-secondary" type="button">Restore stock</button>
          </div>
        </div>
        <div class="composer"><span class="ph">Ask Codex to change something…</span><span class="send"></span></div>
      </main>
      <div class="popover" role="note">
        <p class="pop-head">Theme</p>
        <ul>
          <li class="on"><span>Captain's Cabin</span><b>✓</b></li>
          <li><span>Stock dark</span></li><li><span>Stock light</span></li>
        </ul>
      </div>
    </div>
  </div>

  <div class="note">
    <p><b>Hero status:</b> ${heroUri
      ? `<code>${heroFile}</code> is embedded above. Check it against the acceptance list in <code>docs/specs/asset-generation-prompts.md</code> — particularly that the lower two-thirds stays quiet and that the cards and composer remain comfortably legible over it.`
      : `no image generated yet, so the empty state is showing its placeholder. Drop <code>hero-empty-state.webp</code> (or <code>.png</code>) into <code>themes/captains-cabin/assets/</code> and rebuild — it is picked up automatically, no code change.`}</p>
    <p><b>What the character pass adds:</b> a brass hairline and crest in the title bar; a brass rail on the active task and a hover state; thin brass scrollbars; depth and an inner brass edge on the popover; a brass marker on code-block headers; a lit edge on the primary button and cards; brass text selection; and the model pill picked out in brass.</p>
    <p><b>What it deliberately does not do:</b> touch any surface that sits behind body text. Every value still comes from <code>theme.css</code>, which this page parses rather than duplicates — if the mockup and the shipped theme ever disagree, this build fails.</p>
  </div>
</div>

<script>
(function(){
  var root = document.documentElement, state = { mode:'dark', treat:'flat' };
  function apply(){ root.dataset.mode = state.mode; root.dataset.treat = state.treat; }
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
  wire('modeseg','mode','mode'); wire('treatseg','treat','treat');
  apply();
})();
</script>`;

writeFileSync(OUT, html);
console.log(`mockup → ${OUT}`);
console.log(`hero: ${heroFile || 'none (placeholder)'}   tokens: ${Object.keys(DARK).length} dark / ${Object.keys(LIGHT).length} light`);
