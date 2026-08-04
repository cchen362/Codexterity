// Codexterity — generic theme emitter (Plan 0003 M2)
// -----------------------------------------------------
// Emits <theme>/theme.css, syntax.json and manifest.json from a RECIPE, so
// adding a theme is "write a recipe" and never "edit this file". This module
// owns MECHANISM and facts about CODEX (every CSS rule, every D-0001-*
// mechanism comment, the emitted file structure); a recipe under
// tools/palette/recipes/ owns IDENTITY and AUTHORED VALUES (palette inputs,
// accent role, typography roles and font assets, shape values, hero
// configuration, syntax policy, manifest landmarks, and the theme's own
// prose/voice strings).
//
// The path and filename of THIS file are pinned: the emitted theme.css and
// syntax.json both contain the literal string "tools/palette/emit-theme.mjs"
// (see buildHeader() and the recipe's syntax.note), and every doc references
// this exact command. Do not rename or move it.
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildDark, buildLight, buildSyntax, GROUNDS, ratio } from './palette-engine.mjs';
import { run, runSyntax } from './audit.mjs';
import {
  ROOT_CLASSES, tokenGroups, TOKEN_ALIASES, ansiSlots, FONT_FAMILY_TOKENS, HEADING_CLASSES,
} from './codex-surface.mjs';

// ── Recipe validation — fail loudly, by name ────────────────────────────────
// Guards against an author's typo, not a security boundary.
function validateRecipe(recipe) {
  const fail = (msg) => { throw new Error(`emit-theme: recipe invalid — ${msg}`); };

  if (!recipe || typeof recipe !== 'object') fail('recipe must be an object');
  if (typeof recipe.id !== 'string' || !recipe.id) fail('recipe.id must be a non-empty string');
  if (/[\\/]/.test(recipe.id) || recipe.id.includes('..')) {
    fail(`recipe.id ${JSON.stringify(recipe.id)} must be a safe directory name (no path separators, no "..")`);
  }
  if (typeof recipe.name !== 'string' || !recipe.name) fail('recipe.name must be a non-empty string');
  if (typeof recipe.version !== 'string' || !recipe.version) fail('recipe.version must be a non-empty string');

  const groundKey = recipe.palette && recipe.palette.ground;
  if (!GROUNDS[groundKey]) {
    fail(`recipe.palette.ground ${JSON.stringify(groundKey)} does not resolve in GROUNDS (known: ${Object.keys(GROUNDS).join(', ')})`);
  }

  if (!recipe.accent || typeof recipe.accent.token !== 'string' || !recipe.accent.token) {
    fail('recipe.accent.token must be a non-empty string');
  }

  for (const role of ['ui', 'mono', 'display']) {
    const r = recipe.typography && recipe.typography.roles && recipe.typography.roles[role];
    if (!r || typeof r.stack !== 'string' || !r.stack) {
      fail(`recipe.typography.roles.${role}.stack must be a non-empty string`);
    }
  }

  if (!Array.isArray(recipe.landmarks) || recipe.landmarks.length === 0) {
    fail('recipe.landmarks must be a non-empty array');
  }
  for (const l of recipe.landmarks) {
    if (!l || typeof l.probe !== 'string' || !l.probe) {
      fail(`landmark ${JSON.stringify(l && l.name)} must have a non-empty probe`);
    }
  }

  if (!recipe.hero || !Array.isArray(recipe.hero.modes)) {
    fail('recipe.hero.modes must be an array');
  }
  for (const mode of recipe.hero.modes) {
    if (!recipe.hero.scrim || !recipe.hero.scrim[mode]) {
      fail(`recipe.hero declares mode ${JSON.stringify(mode)} but has no matching recipe.hero.scrim.${mode}`);
    }
  }
}

// ── @font-face ───────────────────────────────────────────────────────────────
function faceBlock({ family, file, extra }, assetsDir) {
  const b64 = readFileSync(assetsDir + 'assets/fonts/' + file).toString('base64');
  return `@font-face {
  font-family: '${family}';
  src: url(data:font/woff2;base64,${b64}) format('woff2');
${extra}
  /* swap, never block: the theme is injected after first paint, so blocking
     would hide text that Codex has already rendered legibly. */
  font-display: swap;
}`;
}

function buildFontFaces(recipe, assetsDir) {
  return recipe.typography.faces.map((f) => faceBlock(f, assetsDir)).join('\n\n');
}

// Every token declaration is marked !important, and that is a measured
// requirement rather than a specificity shortcut. See the D-0001-12 note in the
// generated file header for the full reasoning.
const decl = (name, value) => `  ${name}: ${value} !important;`;

// ── The per-mode token block ─────────────────────────────────────────────────
function tokenBlock(rootClass, p, syn, label, recipe) {
  const lines = [`.${rootClass} {`, `  /* ${label} */`];
  for (const [title, keys] of tokenGroups(recipe.accent.name)) {
    lines.push('', `  /* ${title} */`);
    for (const k of keys) lines.push(decl(`--color-${k}`, p[k]));
  }
  lines.push('', '  /* Aliased spellings of the same values */');
  for (const [alias, src] of Object.entries(TOKEN_ALIASES)) lines.push(decl(`--color-${alias}`, p[src]));
  lines.push('', '  /* Terminal — the 16 ANSI slots, under Codex\'s VS Code spellings */');
  for (const [slot, hex] of Object.entries(ansiSlots(p, syn))) {
    lines.push(decl(`--vscode-terminal-ansi${slot}`, hex));
  }
  lines.push('', '  /* Font families — Codex reads these as tokens, like colour (D-0001-7) */');
  for (const name of FONT_FAMILY_TOKENS.ui) lines.push(decl(`--${name}`, recipe.typography.roles.ui.stack));
  for (const name of FONT_FAMILY_TOKENS.mono) lines.push(decl(`--${name}`, recipe.typography.roles.mono.stack));
  lines.push('', '  /* Syntax palette — consumed by the editor layer (see syntax.json) */');
  for (const [role, hex] of Object.entries(syn)) {
    if (role === '_surface') continue;
    lines.push(decl(`--cc-syntax-${role}`, hex));
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Header comment ───────────────────────────────────────────────────────────
// Mostly mechanism prose about THIS ENGINE (D-0001-2, D-0001-12, D-0001-6),
// true of any theme it emits; only the title, its underline, and the two
// blurb lines are the recipe's own voice.
function buildHeader(recipe, groundHex) {
  const [blurb0, blurb1] = recipe.voice.blurbLines(groundHex);
  return `/*
 * ${recipe.voice.title}
 * ${recipe.voice.titleUnderline}
 * ${blurb0}
 * ${blurb1}
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH FOR THIS THEME'S TOKEN VALUES.
 * Mockups and palette studies under docs/ are design inputs; no other file
 * carries a copy of these values. See docs/ENGINEERING.md § Design & Aesthetic Rules.
 *
 * Every value is derived in OKLCH and solved against a WCAG AA target rather than
 * chosen by eye; the derivation lives in tools/palette/palette-engine.mjs and the
 * check in tools/palette/audit.mjs. Regenerate with:  node tools/palette/emit-theme.mjs
 *
 * D-0001-2 — Token-first styling. Every rule below redefines one of Codex's own
 * semantic custom properties on its root theme class. Codex is Tailwind v4 with a
 * token layer, so a single override cascades through every bg-token- and
 * text-token- utility — including UI OpenAI has not shipped yet. Structural
 * selectors are a last resort; each one is a declared LANDMARK, marked as such
 * below, and degrades to the stock look rather than breaking if it stops matching.
 *
 * D-0001-12 — Every declaration below is !important, and it has to be.
 *
 * Codex writes 67 custom properties as an INLINE style on <html> a moment after
 * boot, and 47 of them are ones this theme also defines. An inline declaration
 * outranks every non-important author rule at any specificity, so without
 * !important the theme applies at dom-ready and is then silently reverted: our
 * <style> element is still in the document (verified present), still last in
 * <head>, and simply outranked. Measured directly — with CDX_VERIFY_AT=15000 the
 * settled re-check read --color-background-surface back as Codex's stock
 * #111111 while our own inert token --color-text-primary, which Codex never
 * writes inline, still read #F4EAD4.
 *
 * This is the author-origin cost recorded in D-0001-1's amendment coming due. A
 * USER-origin stylesheet — what webContents.insertCSS() would have given us —
 * beats inline styles without !important, but insertCSS is broken on this
 * Electron fork. !important is not a specificity shortcut here; it is the only
 * cascade mechanism that reaches an inline declaration at all.
 *
 * It is safe in scope: these are custom-property DEFINITIONS. Marking a
 * definition important fixes which value the variable holds; it forces nothing
 * on the properties that read it, so Codex's own layout and state rules keep
 * winning normally.
 *
 * D-0001-6 — Surfaces are FLAT token colour. No tiling texture, no gradient wash
 * behind content. Every contrast figure this theme claims is computed against a
 * flat colour; luminance variation behind text would make the governing value the
 * worst pixel rather than the average, and readability is this project's first law.
 * Do not reintroduce surface textures without redoing the contrast proof.
 */`;
}

// ── Shape block ──────────────────────────────────────────────────────────────
function buildShapeBlock(recipe) {
  const r = recipe.shape.radii;
  return `/*
 * ${recipe.shape.note}
 */
.electron-dark,
.electron-light {
  --radius-sm: ${r.sm} !important;
  --radius-md: ${r.md} !important;
  --radius-lg: ${r.lg} !important;
  --radius-xl: ${r.xl} !important;
  --radius-2xl: ${r['2xl']} !important;
  --radius-3xl: ${r['3xl']} !important;
  --radius-4xl: ${r['4xl']} !important;
  --radius-full: ${r.full} !important;
}`;
}

// ── Heading selector — the ten .heading-* classes, wrapped exactly as a hand
// -formatted CSS file would: the continuation line indents to the width of
// ".<root-class> :is(", so dark and light naturally indent differently. ────
function headingSelector(rootClass, classes) {
  const prefix = `.${rootClass} :is(`;
  const indent = ' '.repeat(prefix.length);
  const first = classes.slice(0, 5).map((c) => `.${c}`).join(', ');
  const rest = classes.slice(5).map((c) => `.${c}`).join(', ');
  return `${prefix}${first},\n${indent}${rest})`;
}

// ── Typography: the root/body/xterm/heading/code rules (D-0001-7, -18, -19) ─
// The big narrative comment above these rules is the recipe's own voice
// (recipe.voice.typographyProse); the rules themselves, and the mechanism
// comments fixed to Codex's own behaviour, are this engine's.
function buildTypographyBlock(recipe) {
  const ui = recipe.typography.roles.ui;
  const mono = recipe.typography.roles.mono;
  const display = recipe.typography.roles.display;

  const rootRule = `${recipe.voice.typographyProse}
/* UI and body — Literata. Inherited from the theme class, which covers the rules
 * that hardcode a font stack rather than reading --font-sans. */
.electron-dark,
.electron-light {
  font-family: ${ui.stack} !important;
  font-variation-settings: ${ui.variationSettings};
}`;

  const bodyRule = `/* D-0001-18 — RE-DECLARED ON <body>, AND IT HAS TO BE.
 *
 * Codex sets this same token on BODY, measured in the probe corpus:
 *
 *   :is([data-codex-window-type=browser],[…=chrome-extension],[…=electron]) body {
 *     --vscode-editor-font-family: ui-monospace, "SFMono-Regular", …, monospace;
 *   }
 *
 * Our block above declares it on .electron-dark / .electron-light, which are on
 * <html>. Custom properties INHERIT, so a value set on body wins for body and
 * everything under it no matter what html says — this is not a specificity
 * contest, and !important on the html declaration cannot win it. Measured
 * consequence: the diff and terminal panels rendered in ui-monospace, i.e.
 * Consolas on Windows, so D-0001-7's code face was absent from the one surface
 * most made of code while every colour around it was correctly themed.
 *
 * Same shape as D-0001-12, one level down: that one handled Codex writing tokens
 * inline on <html>, and nobody checked whether it also wrote any on <body>. A
 * corpus sweep says it sets 17 custom properties there and exactly two collide
 * with this theme. The other, --color-background-elevated-primary, is benign —
 * it re-points our token to our own --color-background-elevated-primary-opaque,
 * which this emitter always gives the same value, and its rule is gated on
 * .electron-opaque which this window does not carry. It is listed here so the
 * next person does not have to re-derive that it is safe.
 *
 * Matching Codex's own selector shape (both land on body at equal specificity)
 * means later-wins would already carry it; the !important makes it independent
 * of sheet order. */
.electron-dark body,
.electron-light body {
  --vscode-editor-font-family: ${mono.stack} !important;
}`;

  const xtermRule = `/* D-0001-19 — THE TERMINAL IS xterm.js, AND NO TOKEN CAN REACH IT.
 *
 * Measured in the running app 2026-08-02, three identical samples:
 *
 *   475x1280  font=ui-monospace  fontOrigin=<div> (the region itself)
 *   class="xterm-rows"  inline=none
 *   --vscode-editor-font-family='Monaspace Neon'
 *   --default-mono-font-family='Monaspace Neon'
 *
 * Read that carefully: BOTH mono custom properties already resolve to our face
 * AT THAT ELEMENT, and it paints ui-monospace (Consolas on Windows) anyway.
 * xterm.js takes fontFamily from a JavaScript options object and writes a
 * literal stack into a stylesheet it generates at runtime, so it never reads
 * either variable. D-0001-18 captured the token at every level and could not
 * have reached this surface -- a captured token is not a consumed token.
 *
 * This is therefore a LANDMARK by necessity, not by preference (D-0001-2), and
 * it was written only after the governing rule was measured -- the mistake that
 * killed the four pre-Gate-0 landmarks was writing them first.
 *
 * The hook is safe as landmarks go: .xterm-rows and .xterm-char-measure-element
 * are xterm.js's own public, documented class names, not Codex build hashes.
 * If xterm is ever swapped out the rule stops matching and the terminal returns
 * to its stock face -- degradation, not breakage.
 *
 * .xterm-char-measure-element IS LOAD-BEARING AND MUST NOT BE DROPPED. xterm's
 * DOM renderer sizes its cell grid by measuring that element. Style the rows
 * without it and xterm measures Consolas while painting Monaspace, which
 * desynchronises the grid: misplaced cursor, offset selection, drifting
 * columns. Monaspace and Consolas are NOT metric-compatible, so this is a real
 * failure mode. Styling both keeps measurement and painting on one face. Our
 * sheet lands at dom-ready, before any terminal is opened, so xterm's first
 * measurement already sees our face.
 *
 * VERIFY BY LOOKING AT A LIVE TERMINAL -- type a command, move the cursor,
 * drag a selection. Correct glyphs with a misaligned cursor is the signature of
 * a measurement/paint split, and no contrast figure will show it. */
.electron-dark .xterm,
.electron-light .xterm,
.electron-dark .xterm-rows,
.electron-light .xterm-rows,
.electron-dark .xterm-char-measure-element,
.electron-light .xterm-char-measure-element {
  font-family: ${mono.stack} !important;
}`;

  const headingRule = `/* DISPLAY — Fraunces, on Codex's ten authored heading classes.
 *
 * These are global, semantic, hand-written class names, not build-hashed CSS
 * module names, which makes them the same grade of hook as 'pre, code, kbd,
 * samp' and the only structural selectors this theme permits itself. All ten
 * were read out of the shipped stylesheet; .heading-xl was additionally observed
 * in the live DOM. If Codex renames them, headings fall back to Literata and
 * nothing breaks — the page stays entirely legible, which is the whole test.
 *
 * No 'opsz' is pinned here. Fraunces carries an optical-size axis (9-144) and
 * font-optical-sizing lets the browser drive it from the rendered size, which is
 * what a display face is for. The old rule pinned 'opsz' 14 because Fraunces was
 * doing double duty as the UI face; that constraint is gone with the split. */
${headingSelector(ROOT_CLASSES.dark, HEADING_CLASSES)},
${headingSelector(ROOT_CLASSES.light, HEADING_CLASSES)} {
  font-family: ${display.stack} !important;
  font-optical-sizing: ${display.opticalSizing};
  font-variation-settings: ${display.variationSettings};
}`;

  const codeRule = `.electron-dark :is(pre, code, kbd, samp),
.electron-light :is(pre, code, kbd, samp) {
  font-family: ${mono.stack};
  font-variation-settings: ${mono.variationSettings};
}`;

  return `${rootRule}

${bodyRule}

${xtermRule}

${headingRule}

${codeRule}`;
}

// ── Layer 2 — the named-hook "character pass" (D-0001-10, -13, -14) ────────
// Entirely mechanism: decorates chrome, never a content surface, and the
// accent is always read through the recipe's own accent token so a palette
// regeneration — or a future recipe with a different accent token — recolours
// this layer automatically.
function buildLayer2Block(recipe) {
  const accent = `var(--color-${recipe.accent.token})`;
  return `/*
 * Layer 2 — Named-hook rules (the "character pass").
 *
 * D-0001-10 — The owner approved this treatment on 2026-08-01 by toggling it
 * against the flat build in docs/mockups/0002-captains-cabin-character-pass.html
 * and judging it "more polished and refined."
 *
 * Every rule here decorates CHROME — title bar, scrollbars, popovers, selection.
 * None of it puts luminance variation behind body text, so D-0001-6 and the
 * 152/152 contrast proof are untouched. That scoping is the whole reason this
 * layer is permitted; do not extend it onto a content surface.
 *
 * The accent is always read through ${accent} so a
 * palette regeneration recolours this layer automatically.
 *
 * NO STRUCTURAL SELECTORS — re-derived 2026-08-01 against the running app.
 *
 * This layer originally targeted four named classes from
 * docs/specs/customizable-ui-inventory.md §Tier 2. Gate 0 found that ALL FOUR
 * match nothing in the shipped build, so the treatment the owner approved was
 * inert. The rebuilt inventory
 * (docs/research/phase3-inventory-findings.md §4) explains why, and why simply
 * finding new classes would have been the wrong fix: Codex uses CSS Modules with
 * BUILD-HASHED class names (_ApplicationMenuTopBar_zbk1f_3), so any such
 * selector works in testing and breaks on the next Codex release.
 *
 * The replacement is better than what it replaces. Codex reads a set of custom
 * properties it never defines — sanctioned, named tint holes left open for a
 * host to fill. The title bar's own rule is
 *   --header-tint: var(--codex-titlebar-tint, transparent);
 *   background-color: var(--header-tint);
 * so setting one custom property tints it, with no selector at all. Unset hooks
 * fall back to their own defaults, so an upstream rename degrades to stock
 * exactly as an unmatched selector did.
 *
 * DO NOT reintroduce a CSS-module class as a landmark here.
 */

/* Selection — no landmark required, so this is the layer's most durable rule. */
.electron-dark ::selection,
.electron-light ::selection {
  background: color-mix(in oklab, ${accent} 34%, transparent);
  color: var(--color-text-primary);
}

/* Scrollbars. \`scrollbar-color\` is a standard property and inherits, so it
 * reaches every scroll container without a structural selector. */
.electron-dark,
.electron-light {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklab, ${accent} 45%, transparent) transparent;
}

/* HOOK — --codex-titlebar-tint. The app's own title-bar tint variable, read 3×
 * and never defined by Codex, which leaves it for a host to fill. This is the
 * measured, supported replacement for the dead .app-header-tint landmark: the
 * title bar's rule is \`--header-tint: var(--codex-titlebar-tint, transparent)\`,
 * so one custom property tints it with no selector to go stale. */
.electron-dark,
.electron-light {
  --codex-titlebar-tint: var(--color-background-application-menu) !important;
}

/* HOOKS — the composer tray. Two more variables Codex reads and never defines
 * (\`background\` and \`border\`/\`border-color\` on the tray above the composer).
 * The composer was one of the three regions Gate 0 saw stay stock. */
.electron-dark,
.electron-light {
  --composer-top-tray-background: var(--color-background-elevated-primary) !important;
  --composer-top-tray-border: 1px solid var(--color-border) !important;
}

/* HOOK — --app-shell-tab-background. Read for a background-color and a gradient
 * stop on the shell tabs. */
.electron-dark,
.electron-light {
  --app-shell-tab-background: var(--color-background-surface-under) !important;
}

/*
 * LANDMARK — .app-shell-left-panel. THE SIDEBAR HAS NO BACKGROUND OF ITS OWN.
 *
 * D-0001-13 — the theme must PAINT the sidebar; no token override can.
 *
 * Measured 2026-08-02 in the running app, in confirmed light mode
 * (rootClass=electron-light), walking the ancestor chain to <html>: EVERY
 * ancestor of the sidebar is background-color rgba(0,0,0,0), alpha 0. Nothing
 * in the document paints it. Codex's own rule that would is
 *
 *   [data-codex-window-type=electron]:not([data-codex-window-chrome=application-menu])
 *     .app-shell-left-panel { background: ... }
 *
 * and <html> here carries data-codex-window-chrome="application-menu", so the
 * :not() excludes this window exactly. On Windows the main window owns the
 * application menu (File/Edit/View/Help), so Codex deliberately declines to
 * paint that panel and lets the OS window material — Windows 11 Mica/acrylic —
 * show through.
 *
 * WHAT THE OWNER SAW. A "pale mint-green sidebar" in light mode. It is the
 * DESKTOP WALLPAPER, composited through the transparent panel. Sampled from the
 * screen: #E6F9F6 at the top, #B7C5C6 lower down, #EAF7F3 at the bottom — the
 * panel is not one colour at all, which is conclusive. A token produces a
 * uniform fill; only an image varies down its length. Nothing in this theme's
 * palette is anywhere near hue 170, and the same run measured every genuinely
 * themed surface as correct (main content #F9F0DD, title bar #E7DECC,
 * composer #E1D9C6).
 *
 * WHY THIS IS A CONTRAST FIX BEFORE IT IS AN AESTHETIC ONE. D-0001-6 computes
 * every figure this theme claims against FLAT colour. Sidebar text is
 * --color-text-primary, and behind it was an arbitrary user wallpaper, so its
 * contrast was not merely unproven — it was unprovable, and it changes when the
 * user changes their desktop. Readability outranks aesthetics, so an opaque
 * surface is required here, not preferred.
 *
 * WHY A SELECTOR, WHEN D-0001-2 SAYS TOKEN-FIRST. Token-first presupposes a
 * declaration that READS a token. There is no background declaration anywhere in
 * this chain, so there is nothing for a token to feed; this is the "declared,
 * verified landmark" case D-0001-2 provides for. 'app-shell-left-panel' is an
 * authored, semantic, non-hashed global class — the grade of hook
 * docs/research/phase3-inventory-findings.md §4.2 sanctions, NOT a CSS-module
 * build hash. If Codex renames it, the panel returns to the stock translucent
 * look: the pre-fix appearance, not breakage.
 *
 * WHY !important HERE, on a real property rather than a token definition.
 * Codex's own rule above scores (0,3,0) — two attribute selectors plus a class —
 * where '.electron-light .app-shell-left-panel' scores (0,2,0). On THIS window
 * that rule does not match, so nothing competes. On a window WITHOUT the
 * application-menu chrome it does match and would outrank us, and the macOS
 * build is the obvious such case. This is not verified on macOS (no access), so
 * the declaration is made unconditionally rather than assuming a platform
 * difference that has not been measured. Cross-platform verification remains
 * outstanding per docs/ENGINEERING.md.
 *
 * The value is --color-background-surface-under, which palette-engine.mjs
 * derives for exactly this job ("the sidebar sits a step BELOW the ground").
 */
.electron-dark .app-shell-left-panel,
.electron-light .app-shell-left-panel {
  background: var(--color-background-surface-under) !important;
}

/*
 * LANDMARK — the ACTIVE sidebar row, marked with a brass left edge.
 *
 * D-0001-14 — the one piece of the Phase 2 sidebar mockup that theming can
 * actually deliver.
 *
 * WHAT THIS IS NOT. docs/mockups/0001-captains-cabin-palette-approval.html
 * drew a brass "New task" primary button, brass-bordered task cards and a
 * brass-railed list. Codex has none of those elements — it has plain nav rows —
 * and a theming engine recolours what the app renders; it cannot restructure
 * it (D-0001-3 forbids touching Codex's files at all). That mockup is a PALETTE
 * STUDY, not a target. This rule is the reachable part of its intent: the one
 * brass mark that says "you are here".
 *
 * THE HOOKS, both measured in the running app on a screen with an open
 * conversation (28 sidebar rows, exactly one active):
 *
 *   [data-app-action-sidebar-thread-active="true"]   Codex's own app-action
 *                                                    contract name — authored
 *                                                    and semantic, NOT a
 *                                                    CSS-module build hash
 *   [aria-current="page"]                            the web standard
 *
 * BOTH are matched, deliberately. They are independent: if Codex renames its
 * data attribute the ARIA state still carries the indicator, and vice versa.
 * A single hook here would be one rename away from silent removal, which is
 * exactly how the four pre-Gate-0 landmarks died. If BOTH stop matching, the
 * active row keeps Codex's own hover-wash highlight and nothing breaks — the
 * row is still visibly the active one, just without the brass.
 *
 * The rows are position:relative and overflow-hidden already (measured), so an
 * absolutely-positioned ::before needs no layout change from us.
 *
 * ACCENT DISCIPLINE. This is a 2px rule on ONE row, not a fill. The design
 * floor's "one accent, used sparingly, never as a background fill" holds: the
 * row's own surface stays --color-background-button-secondary-hover, which the
 * palette already solves and which every ink tier is already audited against.
 * No contrast figure changes, because no text sits on the brass.
 */
.electron-dark .sidebar-item[data-app-action-sidebar-thread-active="true"]::before,
.electron-dark .sidebar-item[aria-current="page"]::before,
.electron-light .sidebar-item[data-app-action-sidebar-thread-active="true"]::before,
.electron-light .sidebar-item[aria-current="page"]::before {
  content: "";
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  height: 16px;
  width: 2px;
  border-radius: 1px;
  transform: translateY(-50%);
  background: ${accent};
  pointer-events: none;
}`;
}

// ── Hero scrim rendering ─────────────────────────────────────────────────────
// One [fraction, alpha] stop format across the whole pipeline: this is the
// SAME shape tools/palette/hero-scrim.mjs solves for, so the stops a solver
// proves are literally the stops this renders.
function renderScrimStop([fraction, alpha]) {
  const fractionPct = Math.round(fraction * 100);
  if (alpha >= 1) {
    // color-mix(in srgb, X 100%, transparent) IS X — this is not a special
    // case, it is a correct simplification, so alpha===1 renders the surface
    // colour directly rather than through a no-op color-mix().
    return `var(--color-background-surface) ${fractionPct}%`;
  }
  const alphaPct = Math.round(alpha * 100);
  return `color-mix(in srgb, var(--color-background-surface) ${alphaPct}%, transparent) ${fractionPct}%`;
}

function buildHeroModeRule(recipe, mode, heroB64) {
  const stops = recipe.hero.scrim[mode];
  const stopLines = stops.map((s, i) => {
    const rendered = renderScrimStop(s);
    return `      ${rendered}${i === stops.length - 1 ? '),' : ','}`;
  });
  const rootClass = ROOT_CLASSES[mode];
  return `.${rootClass} .\\[container-name\\:home-main-content\\]:has(.heading-xl) {
  /* FULL BLEED, under a computed scrim — two layers, scrim first (on top).
     The image fills the panel; the scrim is what makes text over it provable. */
  background-image:
    linear-gradient(to bottom,
${stopLines.join('\n')}
    url(data:${recipe.hero.mime};base64,${heroB64});
  background-size: cover, cover;
  /* '${recipe.hero.position}', not 'top': on a tall panel cover scales by height, so nothing is
     cropped vertically and this only centres horizontally. On a SHORT panel it
     crops top and bottom evenly, which drops the lamp — the brightest part of
     the frame — instead of holding it behind the heading. 'top center' would do
     the opposite and put the worst pixels where the text is. */
  background-position: ${recipe.hero.position}, ${recipe.hero.position};
  background-repeat: no-repeat, no-repeat;
}`;
}

function buildHeroBlock(recipe, heroB64) {
  const rules = recipe.hero.modes.map((mode) => buildHeroModeRule(recipe, mode, heroB64));
  return `${recipe.hero.prose}
${rules.join('\n\n')}`;
}

const MOTION_NOTE = `/*
 * Motion — deliberately absent.
 *
 * This theme adds no animation or transition of its own, so it has nothing to
 * suppress under prefers-reduced-motion. A blanket
 * \`@media (prefers-reduced-motion) { * { animation-iteration-count: 1 !important } }\`
 * was written here and removed: it would have governed CODEX's animations rather
 * than ours, stopping loading spinners after a single rotation. Respecting the
 * preference for motion we introduce is our job; overriding the host app's motion
 * is not. If a future layer adds motion, scope the reduced-motion rule to exactly
 * that motion — never to \`*\`.
 */
`;

// ── The full stylesheet ──────────────────────────────────────────────────────
function buildCss(recipe, { dark, light, synDark, synLight, groundHex, fontFaces, heroB64 }) {
  const header = buildHeader(recipe, groundHex);
  const darkBlock = tokenBlock(ROOT_CLASSES.dark, dark, synDark, recipe.voice.modeLabels.dark, recipe);
  const lightBlock = tokenBlock(ROOT_CLASSES.light, light, synLight, recipe.voice.modeLabels.light, recipe);
  const shapeBlock = buildShapeBlock(recipe);
  const typographyBlock = buildTypographyBlock(recipe);
  const layer2Block = buildLayer2Block(recipe);
  const heroBlock = buildHeroBlock(recipe, heroB64);

  return `${header}

/*
 * The three faces, embedded. See the Typography section below for the roles and
 * for why embedding is a correctness requirement rather than a packaging step.
 */
${fontFaces}

${darkBlock}

${lightBlock}

${shapeBlock}

${typographyBlock}

${layer2Block}

${heroBlock}

${MOTION_NOTE}`;
}

const asset = (dir, p) => ({ path: p, bytes: statSync(dir + p).size });

// THE BUILD-TIME AUDIT REFUSAL — kept exactly as it behaved pre-M2, because it
// is load-bearing. This throws before a single byte reaches disk if either
// mode fails WCAG AA, which is what makes "palette values are derived, not
// hand-picked" enforceable rather than aspirational. It stays inside this
// GENERIC emitter, so that any theme emitted through this path is
// structurally unable to reach disk while failing AA — it is not demoted to
// a check a theme author is trusted to run separately.
//
// This refusal is ALSO the answer to "how does an audit bind to a recipe".
// audit.mjs's CLI sweeps a registry of GROUNDS (navy and oak) — 68 checks x
// 2 modes x 2 grounds = 272 — and 136 of those prove a ground that ships in
// NO theme. So `272/272` is an ENGINE-level proof, not a per-theme one, and
// a theme reusing an existing ground adds no checks to it. The per-theme
// proof is this refusal, which audits exactly the two palettes THIS recipe
// produces and nothing else.
//
// EXPORTED so it can be unit-tested directly against a synthetic failing
// palette without touching palette-engine.mjs (both real GROUNDS entries are
// 272/272 clean) — this is the SAME function emitTheme() calls below, not a
// copy, so a test against it proves what the emitter itself does.
export function assertPalettesPassAA(modes) {
  const summary = {};
  for (const [name, p, s] of modes) {
    const rows = [...run(p), ...runSyntax(s)];
    const bad = rows.filter((x) => !x.pass);
    if (bad.length) throw new Error(`${name} mode fails AA: ${bad.map((b) => b.label).join(', ')}`);
    summary[name] = { checks: rows.length, failed: bad.length };
  }
  return summary;
}

// ── The generic emitter ──────────────────────────────────────────────────────
//
// ORDER OF OPERATIONS, and one deliberate improvement over the pre-M2 script:
// nothing is written to disk until every gate has passed. Build everything in
// memory, run the build-time audit refusal, build the CSS, assert every
// landmark's probe against it, build syntax and manifest, and only THEN write
// all three files. This changes zero output bytes; it just makes the emitter
// all-or-nothing, so a stale probe or a failing palette can never leave a
// half-emitted theme on disk the way writing theme.css before the probe
// assertion used to.
export function emitTheme(recipe, { outDir, assetsDir } = {}) {
  validateRecipe(recipe);

  // Resolved from this file's own location, never from a machine-specific
  // absolute path: the emitter has to run on the packaging machine and on a
  // collaborator's checkout, and a hardcoded C:\ path makes it silently a
  // Windows-only tool.
  const defaultDir = fileURLToPath(new URL(`../../themes/${recipe.id}/`, import.meta.url)).replace(/\\/g, '/');
  const ASSETS = assetsDir ?? defaultDir;
  const OUT = outDir ?? defaultDir;

  const groundHex = GROUNDS[recipe.palette.ground].ground;
  const dark = buildDark(groundHex);
  const light = buildLight(groundHex);
  const synDark = buildSyntax(dark, 'dark');
  const synLight = buildSyntax(light, 'light');

  const audit = assertPalettesPassAA([['dark', dark, synDark], ['light', light, synLight]]);

  const fontFaces = buildFontFaces(recipe, ASSETS);
  const heroB64 = readFileSync(ASSETS + recipe.hero.file).toString('base64');

  const css = buildCss(recipe, { dark, light, synDark, synLight, groundHex, fontFaces, heroB64 });

  // THE LANDMARK PROBE ASSERTION (D-0001-21). The probe stays PER-RECIPE —
  // never hoisted into this emitter and never auto-derived from a selector —
  // but the ASSERTION itself lives here, which makes it a CROSS-FILE CONTRACT
  // rather than a same-file self-check: a rule renamed in this emitter now
  // fails EVERY recipe's build. That is stronger than a same-file version and
  // is the correct reading of Plan 0002's review finding #4.
  for (const l of recipe.landmarks) {
    if (!css.includes(l.probe)) {
      throw new Error(
        `manifest landmark '${l.name}' probe ${JSON.stringify(l.probe)} is not in the ` +
        'emitted stylesheet. Either the rule was renamed or removed and this list is ' +
        'stale, or the probe is wrong. Fix the list -- do not weaken the probe.'
      );
    }
  }

  // ── syntax.json ──────────────────────────────────────────────────────────
  // Our own schema, deliberately not claimed to be Pierre-compatible: the editor
  // hook is a Phase 3 question (see docs/specs/css-architecture.md § Layer 4).
  const roles = (s, p) => Object.fromEntries(
    Object.entries(s).filter(([k]) => k !== '_surface').map(([role, hex]) => [
      role, { color: hex, contrast: +ratio(hex, s._surface).toFixed(2) },
    ]).concat([['_meta', { surface: s._surface, foreground: p['text-primary'] }]])
  );

  const syntax = {
    name: recipe.name,
    version: recipe.version,
    ground: groundHex,
    minimumContrast: recipe.syntax.minimumContrast,
    note: recipe.syntax.note,
    modes: { dark: roles(synDark, dark), light: roles(synLight, light) },
  };

  // ── manifest.json ────────────────────────────────────────────────────────
  //
  // D-0001-21 -- manifest.json is GENERATED here, never hand-written.
  //
  // D-0001-4 gives the manifest two jobs that are facts about the emitted CSS
  // rather than package metadata: the list of structural landmarks the theme
  // depends on, and the list of assets whose bytes it embeds. A hand-maintained
  // copy of either drifts the moment someone edits a rule here and forgets the
  // manifest -- and drift in THIS file is uniquely nasty, because a stale landmark
  // list makes the injector's verification report a landmark healthy when the rule
  // that needed it is gone. That is the same silent-success failure that killed the
  // four pre-Gate-0 landmarks (docs/research/gate0-findings.md).
  //
  // So the emitter, which is the only thing that knows what it just wrote, writes
  // the manifest too. assets[] is derived from the recipe's own font/hero lists,
  // never from a directory listing, which is exactly the property that keeps the
  // five losing typography candidates (six, counting the superseded Monaspace
  // Xenon) out of a shipped package.
  const fontAssets = recipe.typography.faces.flatMap((f) => [
    asset(ASSETS, 'assets/fonts/' + f.file),
    asset(ASSETS, 'assets/fonts/' + f.licence),
  ]);

  const manifest = {
    formatVersion: 1,
    id: recipe.id,
    name: recipe.name,
    version: recipe.version,
    author: recipe.author,
    license: recipe.license,
    description: recipe.description,
    targetApp: recipe.targetApp,
    targetVersionRange: recipe.targetVersionRange,
    verifiedAgainst: recipe.verifiedAgainst,
    files: { css: 'theme.css', syntax: 'syntax.json' },
    landmarks: recipe.landmarks.map(({ probe, ...rest }) => rest),
    assets: [asset(ASSETS, recipe.hero.file), ...fontAssets],
  };

  // Nothing above this line has touched disk. Every gate — recipe validation,
  // the build-time AA refusal, the landmark probe assertion — has now passed,
  // so the three files are written together, all-or-nothing.
  writeFileSync(OUT + 'theme.css', css.replace(/\r?\n/g, '\n'));
  writeFileSync(OUT + 'syntax.json', JSON.stringify(syntax, null, 2).replace(/\r?\n/g, '\n') + '\n');
  writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 2).replace(/\r?\n/g, '\n') + '\n');

  return { css, syntax, manifest, audit, dark, light };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
// `node tools/palette/emit-theme.mjs` with no arguments emits Captain's
// Cabin; an optional single argument is a recipe id, loaded from
// ./recipes/<id>.mjs.
async function runCli(argv) {
  const recipeId = argv[0] ?? 'captains-cabin';
  const recipeUrl = new URL(`./recipes/${recipeId}.mjs`, import.meta.url);
  let recipeModule;
  try {
    recipeModule = await import(recipeUrl.href);
  } catch (err) {
    throw new Error(`emit-theme: no recipe named ${JSON.stringify(recipeId)} at tools/palette/recipes/${recipeId}.mjs (${err.message})`);
  }
  const recipe = recipeModule.default;
  const result = emitTheme(recipe);

  console.log('theme.css + syntax.json + manifest.json written for ground', result.syntax.ground);
  console.log(
    `audit — dark ${result.audit.dark.checks - result.audit.dark.failed}/${result.audit.dark.checks} pass, ` +
    `light ${result.audit.light.checks - result.audit.light.failed}/${result.audit.light.checks} pass`
  );
  console.log('dark surface', result.dark['background-surface'], '| brass', result.dark['background-button-primary']);
  console.log('light surface', result.light['background-surface'], '| ink', result.light['text-primary']);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
