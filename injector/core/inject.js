'use strict';

/**
 * Codexterity — shared injection core (Gate 0)
 * ---------------------------------------------
 * Platform-agnostic. Runs inside Codex Desktop's Electron MAIN process,
 * loaded via NODE_OPTIONS=--require <preload.js> (D-0001-1, primary mechanism).
 *
 * D-0001-1 (amended 2026-08-01) — the primary API is
 * webContents.executeJavaScript appending one <style> element, NOT
 * insertCSS(), which is broken on this Electron fork. Still an official API,
 * still no debug port. See applyThemeViaStyleTag below and docs/DECISIONS.md.
 *
 * D-0001-3 — non-destructive by construction. This module never touches any
 * file inside the Codex install directory, never opens a debug port, and
 * never reads or writes ~/.codex/auth.json, ~/.codex/.credentials.json, or
 * any API key/token. It reads exactly one thing from disk: the theme package
 * named by CDX_THEME_PACKAGE, and only through the validating loader in
 * ../theme-loader/index.js — never a raw fs.readFileSync of a stylesheet.
 * The Electron APIs it calls are read-only with respect to the app itself
 * (they mutate only the in-memory render tree of a window we did not create).
 *
 * If the theme cannot be applied cleanly, this module logs the failure and
 * leaves the window exactly as Codex rendered it — never half-styled, never
 * crashed (see docs/ENGINEERING.md "Fail loudly in development, gracefully
 * in production").
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { runProbe } = require('./probe.js');
const { loadTheme, ThemeLoadError } = require('../theme-loader/index.js');

// D-0001-25 (Phase 4 M3) — CDX_THEME_PACKAGE replaces CDX_THEME_CSS_PATH,
// with no fallback and no compatibility shim. Before M3, this module read
// CDX_THEME_CSS_PATH and fs.readFileSync'd a raw stylesheet directly:
// M1 and M2 built a validating loader (theme-loader/index.js — manifest
// validation, the safe-CSS scan, the D-0001-4 size cap) and NOTHING called
// it. A validator nothing calls is documentation, not a guarantee. Routing
// through loadTheme() here makes that validation unskippable before a byte
// of CSS reaches Codex, and it means the development theme directory and
// the shipped .ccskin travel the exact same code path — loadTheme() tells
// them apart with statSync, never by extension, so there is no second,
// untested route for a packaged theme to take.

// D-0001-25 / Phase 4 M3 — the loaded theme lives in a MUTABLE MODULE-LEVEL
// SLOT, not a local captured in a closure. Before M3, start() bound the CSS
// as a local `css` and threaded it explicitly through attachToWindow(win,
// css) into every applyTheme() call. That works for a single theme chosen
// once at launch, but it is a dead end for the live re-theming feature
// recorded under "After Phase 4" in docs/plans/0001-captains-cabin-architecture.md:
// applyThemeViaStyleTag already finds-or-creates one <style> element with a
// stable id and replaces its textContent, and already re-runs on every
// dom-ready / did-navigate / did-navigate-in-page — so repainting a live
// window is NOT launch-bound, only the injector's *attachment* is (NODE_OPTIONS
// is read at process start). A slot a later milestone can repoint is the whole
// cost of keeping that door open; a value threaded through call arguments is not
// repointable without touching every call site. THIS MILESTONE (M3) BUILDS ONLY
// THE SLOT — no change signal, no watcher, no IPC listens for a new theme. It is
// set once, in start(), and read at every applyTheme() call.
let activeTheme = null;

// Gate 0 diagnostic aid: stdout capture from a packaged GUI-subsystem
// Electron process launched through unusual activation paths is itself an
// open question, so every log line is ALSO appended to a plain file when
// CDX_DEBUG_LOG_PATH is set. This gives ground truth independent of
// whatever is or isn't happening to this process's stdout handle.
let debugLogPath = null;
try {
  debugLogPath = process.env.CDX_DEBUG_LOG_PATH || null;
} catch (err) {
  debugLogPath = null;
}

function log(message) {
  const line = `[codexterity] ${message}`;
  try {
    process.stdout.write(`${line}\n`);
  } catch (err) {
    // stdout may not be writable in this process context; the file sink
    // below is the fallback, not a substitute we silently prefer.
  }
  if (debugLogPath) {
    try {
      fs.appendFileSync(debugLogPath, `${new Date().toISOString()} ${line}\n`);
    } catch (err) {
      // Nothing further we can do to report a logging failure from inside
      // the logger itself; this must never throw out into caller code.
    }
  }
}

function resolveThemePackagePath() {
  const packagePath = process.env.CDX_THEME_PACKAGE;
  if (!packagePath) {
    throw new Error(
      'CDX_THEME_PACKAGE is not set. The launcher must set this to an absolute ' +
        'path to a theme directory (e.g. themes/captains-cabin) or a .ccskin file ' +
        'before starting Codex.'
    );
  }
  return packagePath;
}

/**
 * Probe the live DOM for the active theme's declared landmarks. Read-only
 * querySelector checks only — no mutation, no data extraction beyond boolean
 * presence and a match count.
 *
 * D-0001-25 / Phase 4 M3 — the selector list comes from
 * activeTheme.manifest.landmarks[], not a constant compiled into this file.
 * Before M3 this read a hardcoded DECLARED_LANDMARKS array frozen at Gate 0
 * (4 selectors) that had silently drifted from the real manifest (6, each
 * carrying a build-time `probe` asserted against the emitted stylesheet —
 * D-0001-21). A hardcoded list rots without anyone noticing; a list read from
 * the manifest fails the BUILD the moment a rule is renamed, and it keeps a
 * theme-specific fact (which selectors this theme cares about) out of the
 * theme-agnostic injector core, per the layer rule in docs/ENGINEERING.md.
 */
function buildLandmarkProbeScript() {
  const selectors = activeTheme.manifest.landmarks.map((l) => l.selector);
  return `
    (() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.map((sel) => {
        let count = 0;
        try {
          count = document.querySelectorAll(sel).length;
        } catch (err) {
          count = -1;
        }
        return { selector: sel, count };
      });
    })();
  `;
}

/**
 * Report the facts the whole styling strategy rests on, read from the live DOM.
 *
 * D-0001-2 assumes Codex toggles .electron-dark / .electron-light on the root
 * element and exposes a semantic --color-* layer. That came from static analysis
 * of a shipped bundle, never from a running app. If either assumption is wrong,
 * the theme is inert no matter how well the injection works — so this is checked
 * every run rather than trusted.
 */
async function reportRootEnvironment(webContents) {
  // async because the font check must await document.fonts.load();
  // executeJavaScript resolves a returned promise.
  const script = `
    (async () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      // Two kinds of token, on purpose.
      //
      // The first four are ones WE define, and prove the sheet applied at all.
      // The rest are DOWNSTREAM of ours — Codex derives them through its own
      // four-stage chain (see docs/research/phase3-inventory-findings.md §1),
      // and they are what actually paints the sidebar, the menu bar, links and
      // the empty-state card icons. Checking only our own names would prove the
      // stylesheet landed while the app still looked stock, which is exactly the
      // gap Gate 0 fell into. 47 of our tokens are also set INLINE on <html>, so
      // this is also the standing check that the cascade still goes our way.
      const probe = ['--color-background-surface', '--color-text-primary',
                     '--color-background-button-primary', '--radius-lg',
                     '--color-background-surface-under', '--color-accent-purple',
                     '--color-token-charts-purple', '--color-token-text-link-foreground',
                     '--color-background-application-menu', '--color-token-side-bar-background'];
      const tokens = {};
      for (const t of probe) tokens[t] = cs.getPropertyValue(t).trim() || '(unset)';

      // D-0001-18's OWN check, read at BOTH levels, because "the panel paints
      // ui-monospace" has two causes that need opposite fixes and the font
      // reading alone cannot tell them apart (measured 2026-08-02):
      //
      //   html=Neon  body=ui-monospace -> the body block LOST. Real regression.
      //   html=Neon  body=Neon         -> the block WON and the panel does not
      //                                   READ this variable. A reads-vs-paints
      //                                   error, and the fix belongs elsewhere.
      //
      // Reported as raw values rather than a verdict: the whole point is that
      // the two states are indistinguishable downstream, so collapsing them into
      // one PASS/FAIL here would rebuild the ambiguity this exists to remove.
      const MONO_VAR = '--vscode-editor-font-family';
      const monoVarHtml = cs.getPropertyValue(MONO_VAR).trim() || '(unset)';
      const monoVarBody = document.body
        ? (getComputedStyle(document.body).getPropertyValue(MONO_VAR).trim() || '(unset)')
        : '(no body)';
      // A resolved token is not a painted pixel. The empty-state card icons were
      // the visible symptom of the multi-accent violation, so the check that
      // closes it has to read what the ELEMENTS compute, not what the root
      // holds — an icon could still be painted by an inline fill attribute or a
      // hue we never traced. Sampled by the utility classes the icons actually
      // carry (docs/research/phase3-inventory-findings.md §3).
      const painted = [];
      for (const sel of ['.text-token-charts-green', '.text-token-charts-blue',
                         '.text-token-charts-purple', '.text-token-charts-orange',
                         '.text-token-charts-red']) {
        const el = document.querySelector(sel);
        if (!el) { painted.push(sel + ' = (absent)'); continue; }
        const cs = getComputedStyle(el);
        const kid = el.querySelector('path, circle, rect');
        painted.push(sel + ' color=' + cs.color +
          (kid ? ' childFill=' + getComputedStyle(kid).fill : ''));
      }

      // A font-family declaration that names an unavailable face fails SILENTLY:
      // the computed style still reads back the name we asked for, and the app
      // renders the fallback. That is exactly how "Fraunces renders throughout"
      // was recorded at Gate 0 while the app was actually showing Georgia. So
      // the check is document.fonts.check(), which answers whether the face is
      // loadable, never the computed font-family.
      // load() BEFORE check(). An @font-face the page has not painted with yet is
      // never fetched, so check() alone reports "not available" for a face that
      // is perfectly fine — Monaspace Neon reads false on the empty state purely
      // because no code is on screen. load() forces the fetch and rejects if the
      // src is actually broken, which is the failure we care about.
      const fonts = [];
      for (const family of ['Literata', 'Fraunces', 'Monaspace Neon']) {
        let state;
        try {
          const faces = await document.fonts.load('14px "' + family + '"');
          state = faces.length
            ? (document.fonts.check('14px "' + family + '"') ? 'YES' : 'loaded-but-check-false')
            : 'NO FACE MATCHED';
        } catch (err) {
          state = 'LOAD FAILED: ' + err.message;
        }
        fonts.push(family + '=' + state);
      }
      // Code surfaces. The 'pre, code, kbd, samp' landmark matched nothing at
      // Gate 0, but the empty state contains no code, so that was never evidence
      // of absence. Reported per-tag with the font actually resolved, so a zero
      // on a screen without code is legible as "not applicable" rather than
      // "missing" — and so the answer is recorded on whatever screen the user
      // happens to be on, instead of needing a special run.
      const code = [];
      for (const tag of ['pre', 'code', 'kbd', 'samp']) {
        const n = document.querySelectorAll(tag).length;
        const el = n ? document.querySelector(tag) : null;
        code.push(tag + '=' + n + (el ? ' font=' + getComputedStyle(el).fontFamily.split(',')[0] : ''));
      }

      // The hero and the character pass are the two pieces of approved design
      // that were shipped-but-invisible: the hero was never referenced by any
      // rule, and the character pass spent weeks bound to landmarks that matched
      // nothing. Both now report whether they ACTUALLY PAINT, because "the token
      // resolves" and "the file exists" have each already been mistaken for
      // "the user can see it" once in this project.
      const heroHost = document.querySelector('[container-name\\\\:home-main-content]') ||
                       document.querySelector('.\\\\[container-name\\\\:home-main-content\\\\]');
      let hero;
      if (!heroHost) {
        hero = 'container ABSENT (not the home screen?)';
      } else {
        const img = getComputedStyle(heroHost).backgroundImage;
        hero = (img && img !== 'none' ? 'PAINTING (' + img.slice(0, 24) + '…)' : 'container present, NO background-image') +
               '  emptyStateHeading=' + (heroHost.querySelector('.heading-xl') ? 'yes' : 'no');
      }

      // Character pass: the title bar reads --codex-titlebar-tint through
      // --header-tint. Report the colour it actually computes, not our token.
      const titleBar = document.querySelector('[class*="ApplicationMenuTopBar"]');
      const tint = titleBar
        ? getComputedStyle(titleBar).backgroundColor
        : '(title bar element not found)';

      // The ACTIVE-ROW BRASS INDICATOR (D-0001-14). A ::before cannot be
      // inspected from outside the app, and screen-sampling it only proves
      // absence, never why. Report the three things that can each independently
      // make it invisible, separately, so a null result names its own cause:
      // whether either hook MATCHES, whether the pseudo-element GENERATES a box
      // (content), and what it actually COMPUTES.
      const activeRow = document.querySelector(
        '.sidebar-item[data-app-action-sidebar-thread-active="true"], .sidebar-item[aria-current="page"]');
      let indicator;
      if (!activeRow) {
        const anyRow = document.querySelectorAll('.sidebar-item').length;
        const anyActive = document.querySelectorAll('[data-app-action-sidebar-thread-active="true"]').length;
        const anyCurrent = document.querySelectorAll('[aria-current="page"]').length;
        indicator = 'NO MATCH — .sidebar-item=' + anyRow +
                    '  [thread-active=true]=' + anyActive + '  [aria-current=page]=' + anyCurrent +
                    (anyActive || anyCurrent ? '  (state exists but NOT on the .sidebar-item element)' : '');
      } else {
        const b = getComputedStyle(activeRow, '::before');
        const own = getComputedStyle(activeRow);
        indicator = 'matched; ::before content=' + b.content +
                    ' w=' + b.width + ' h=' + b.height +
                    ' bg=' + b.backgroundColor +
                    ' position=' + b.position +
                    ' | row position=' + own.position +
                    ' overflow=' + own.overflow +
                    ' zIndex=' + own.zIndex;
      }

      // THE EMPTY-STATE CARD HAIRLINE. D-0001-15 — no landmark is written for
      // this, deliberately; the check below is the whole of the implementation.
      // Measured 2026-08-02: on Electron the
      // cards carry BOTH 'border border-token-input-border' AND
      // 'electron:border-0 electron:ring-[0.5px] electron:ring-token-border-heavy'
      // — Codex zeroes the border on this platform and substitutes a ring, which
      // Tailwind implements as a BOX-SHADOW. Computed border-width is 0 0 0 0.
      //
      // So the hairline is reachable only through --tw-ring-color, which reads
      // --color-token-border-heavy -> --color-border-heavy, a stage-1 token this
      // theme already defines. No landmark is needed and none is written. What
      // IS needed is proof that our value arrives, because a resolved token is
      // not a painted pixel — reported as the ring colour the card computes.
      //
      // A border-based check here would read 0px and conclude "unstyled" on a
      // screen showing four visibly outlined cards, which is why the width is
      // reported alongside: the zero is the expected answer, not a fault.
      // Found geometrically (a card is a large button) with the measured
      // authored class as a second, independent route — the same two-hook
      // reasoning as D-0001-14, so a Codex layout change that moves the size
      // out of range does not silently produce "absent".
      //
      // A MISS MUST NAME ITS OWN CAUSE. The cards disappear whenever the
      // composer holds text, and Codex PERSISTS that draft across a restart —
      // so a fresh launch is not necessarily a clean empty state, and a bare
      // "no cards" would be read as a theming failure when it is a draft. The
      // negative branch therefore reports whether the home screen is even
      // present, how many buttons were considered, and whether a draft is
      // suppressing them.
      // FOUND BY WHAT IT PAINTS, NOT BY ITS TAG. This census was 'button'-only
      // until 2026-08-02, when it reported a confident NOT FOUND on a light
      // home screen with an empty composer -- i.e. neither documented cause
      // applied -- while the largest buttons on screen were 654x40 and 315x30.
      // A card-sized <button> would have out-ranked those by area, so there was
      // none, and a tag-scoped census cannot tell "no cards" from "the cards
      // are not buttons". findings §8.5 already recorded this exact lesson for
      // the PROBE's control census and rebuilt it geometrically; the lesson was
      // never carried across to this check. It is now.
      //
      // The thing being measured is a HAIRLINE, so the census keys on painting
      // one: a ring (box-shadow, which is what Electron substitutes for the
      // zeroed border) or a real border, at card-ish geometry. Bounds are
      // deliberately generous -- a maximized window widens the cards, and the
      // old 320px ceiling was itself a way to miss them.
      //
      // Declared here rather than beside its other use further down: both
      // scans share it, and a const is in its temporal dead zone until the
      // line that declares it runs.
      const SCAN_BUDGET = 4000;
      const cardScan = [];
      let cardScanned = 0;
      for (const el of document.querySelectorAll('*')) {
        if (++cardScanned > SCAN_BUDGET) break;
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.width > 700 || r.height < 40 || r.height > 300) continue;
        const ecs = getComputedStyle(el);
        const ring = ecs.boxShadow && ecs.boxShadow !== 'none';
        const bordered = parseFloat(ecs.borderTopWidth) > 0 || parseFloat(ecs.borderLeftWidth) > 0;
        const byClass = typeof el.className === 'string' && el.className.split(/\\s+/).indexOf('min-h-26') >= 0;
        if (!ring && !bordered && !byClass) continue;
        cardScan.push({ el, r, cs: ecs });
      }
      // Cards are siblings and contain no other ringed box, so keeping only
      // candidates that contain no other candidate drops the wrappers.
      const cards = cardScan.filter((c) => !cardScan.some((o) => o !== c && c.el.contains(o.el)));
      let cardHairline;
      if (!cards.length) {
        const onHome = !!document.querySelector('.heading-xl');
        const composerText = (document.querySelector('.ProseMirror') || {}).textContent || '';
        // Report the biggest elements of ANY tag now, not the biggest buttons:
        // the previous phrasing invited "no cards" to be read as a theming
        // result when it was a census that could not see them.
        const biggest = Array.from(document.querySelectorAll('*'))
          .slice(0, SCAN_BUDGET)
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width > 80 && r.height > 30)
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))
          .slice(0, 3)
          .map((r) => Math.round(r.width) + 'x' + Math.round(r.height))
          .join(', ');
        cardHairline = 'NOT FOUND — homeScreen=' + (onHome ? 'yes' : 'no') +
          '  ringedOrBorderedCandidates=' + cardScan.length +
          '  (largest elements of any tag: ' + (biggest || 'none') + ')' +
          '  composerDraft=' + JSON.stringify(composerText.slice(0, 24)) +
          (onHome && composerText.trim()
            ? '  => a non-empty composer HIDES the cards, and Codex persists the draft across restarts. Clear the composer and re-sample; this is not a theming failure.'
            : onHome ? '  => on the home screen with an empty composer and STILL no element painting a hairline at card geometry. The census is no longer tag-scoped, so this is now evidence about the screen rather than about the query.'
                     : '  => not the home screen; cards exist only there.');
      } else {
        cardHairline = cards.length + ' card(s) <' + cards[0].el.tagName.toLowerCase() + '> ' +
          Math.round(cards[0].r.width) + 'x' + Math.round(cards[0].r.height) +
          '; ring-color=' + (cards[0].cs.getPropertyValue('--tw-ring-color').trim() || '(unset)') +
          '  boxShadow=' + (cards[0].cs.boxShadow || 'none').slice(0, 60) +
          '  border-width=' + cards[0].cs.borderTopWidth + ' (0px expected on Electron)' +
          '  bg=' + cards[0].cs.backgroundColor;
      }

      // THE COMPOSER'S FILLED CIRCULAR CONTROL. D-0001-15 — no landmark here
      // either, and this one CANNOT have a useful token override of its own.
      // Voice when the composer is
      // empty, SEND once text is typed. Measured 2026-08-02: it is ONE element
      // whose aria-label flips between 'Start new voice chat' and 'Send'; the
      // classes, size and position never change. It is painted by
      // 'bg-token-foreground' -> --color-token-foreground -> --vscode-foreground
      // -> --color-text-foreground, a stage-1 token this theme already sets.
      //
      // That token is also the app's main TEXT colour, so it cannot be
      // retargeted at the button alone without recolouring every glyph in the
      // app. The button therefore inherits the theme rather than being themed
      // separately — and the thing that must be checked is not the fill but the
      // CONTRAST between the disc and the glyph sitting on it. Both are read,
      // because a foreground-coloured glyph on a foreground-coloured disc is
      // invisible, and that failure would look like a missing icon rather than
      // like a theming bug.
      const filled = Array.from(document.querySelectorAll('button'))
        .find((b) => b.className && typeof b.className === 'string' &&
                     b.className.split(/\\s+/).indexOf('bg-token-foreground') >= 0);
      let composerAction;
      if (!filled) {
        composerAction = 'not on this screen';
      } else {
        const cs = getComputedStyle(filled);
        const glyph = filled.querySelector('path, circle, rect, polygon, svg');
        const gcs = glyph ? getComputedStyle(glyph) : null;
        composerAction = 'aria=' + JSON.stringify(filled.getAttribute('aria-label')) +
          '  disc=' + cs.backgroundColor +
          '  glyphFill=' + (gcs ? gcs.fill : '(no glyph)') +
          '  glyphColor=' + (gcs ? gcs.color : '-');
      }

      // FLOATING SURFACES — menus, popovers, dialogs.
      //
      // Measured 2026-08-02: the open permissions popover is
      // 'bg-token-dropdown-background/90 ring-token-border', i.e.
      // --color-token-dropdown-background -> --vscode-dropdown-background ->
      // --color-background-control-opaque, a stage-1 token this theme defines.
      // Note that is NOT --color-background-elevated-primary-opaque, which the
      // inventory's impact table names for "menus, popovers, dialogs" — that
      // table ranks var() READS, and a token can be read 333 times and paint
      // none of the menu in front of you (findings §2.1, the same trap as the
      // sidebar).
      //
      // Reported opportunistically rather than on a dedicated run, because an
      // unopened menu is UNMOUNTED, not hidden, and Codex exposes no
      // UI-automation tree to open one from outside. So this records itself the
      // first time anyone happens to have a menu open when a sample fires.
      //
      // The alpha and the backdrop-filter are reported deliberately: the panel
      // is 90% opaque OVER A BLUR, so text on it does not sit on flat colour,
      // and D-0001-6 computes every contrast figure this theme claims against
      // flat colour. That is an open question, not a settled one — do not read
      // a themed-looking colour here as a passed contrast check.
      //
      // COMPOSITING IS MEASURED, NOT MODELLED. Chromium reports colours
      // authored in oklab as oklab(), so any hand-rolled sRGB parse of a
      // computed value is wrong before the contrast maths even starts. Painting
      // to a 1x1 canvas and reading the pixel back delegates BOTH the colour
      // conversion and the alpha compositing to the same engine that paints the
      // real panel — so what is reported is what the compositor did, in the
      // space it did it in, not our reconstruction of it.
      const cnv = document.createElement('canvas');
      cnv.width = 1; cnv.height = 1;
      const cx = cnv.getContext('2d', { willReadFrequently: true });
      // 'over' MUST be opaque: a semi-transparent fill onto a cleared canvas
      // composites against transparent black, which is not what any pixel on
      // screen does.
      const paint = (css, over) => {
        try {
          cx.clearRect(0, 0, 1, 1);
          cx.fillStyle = over || '#000000';
          cx.fillRect(0, 0, 1, 1);
          cx.fillStyle = css;
          cx.fillRect(0, 0, 1, 1);
          const d = cx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2]];
        } catch (err) { return null; }
      };
      const hx = (c) => c ? '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase() : '(unpaintable)';
      const lum = (c) => {
        const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
      };
      const cr = (a, b) => {
        if (!a || !b) return 0;
        const x = lum(a), y = lum(b);
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };

      // Recover a colour's ALPHA and its opaque form from two paints, rather
      // than parsing the string. Painting css over black gives a*P; over white
      // gives a*P + (1-a)*255. The difference is (1-a)*255 in every channel, so
      // alpha falls out of the measurement and the opaque colour is a*P / a.
      // This is what makes "is the menu really /90" an observation instead of a
      // quotation from a stylesheet we did not read.
      const decompose = (css) => {
        const B = paint(css, '#000000');
        const W = paint(css, '#FFFFFF');
        if (!B || !W) return null;
        let a = 0;
        for (let i = 0; i < 3; i++) a += 1 - (W[i] - B[i]) / 255;
        a = Math.min(1, Math.max(0, a / 3));
        const opaque = a > 0.004 ? B.map((v) => Math.min(255, Math.round(v / a))) : [0, 0, 0];
        return { alpha: a, opaque, darkest: B, lightest: W };
      };

      // The first ancestor that actually paints. The transparent-ancestor walk
      // is the lesson of D-0001-13: an element's own backgroundColor is very
      // often rgba(0,0,0,0) and the colour on screen belongs to something
      // further up — reading the element alone reports "unpainted" for a
      // surface the user can plainly see.
      const effectiveBg = (start) => {
        for (let el = start; el; el = el.parentElement) {
          const c = paint(getComputedStyle(el).backgroundColor, '#FF00FF');
          if (c && !(c[0] === 255 && c[1] === 0 && c[2] === 255)) return { colour: c, from: el };
        }
        return null;
      };

      const panel = document.querySelector('[role=menu], [role=dialog], [role=alertdialog], [role=listbox]');
      let floatingSurface;
      if (!panel) {
        floatingSurface = 'none open at this sample (a closed menu is unmounted, not hidden — not a finding)';
      } else {
        const cs = getComputedStyle(panel);
        const rect = panel.getBoundingClientRect();

        // WHICH INK TIERS ACTUALLY PAINT HERE. This is the measurement the
        // translucency question reduces to. The theme's contrast-critical
        // tokens are SOLVED to land exactly on 4.5:1 (tools/palette/audit.mjs
        // binary-searches to target), so they carry ~0.1-0.36 of headroom and a
        // translucent surface consumes more than that — while the label and
        // secondary tiers have enough spare to survive ANY backdrop. So the
        // panel is safe or unsafe entirely according to which tiers it carries,
        // and listing them is the difference between a verdict and a guess.
        // Only elements with their own visible text are counted; a wrapper
        // inherits a colour it never paints.
        const inks = new Map();
        for (const el of panel.querySelectorAll('*')) {
          let own = '';
          for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
          own = own.trim();
          if (!own) continue;
          const ecs = getComputedStyle(el);
          if (ecs.visibility === 'hidden' || ecs.display === 'none') continue;
          const key = ecs.color;
          if (!inks.has(key)) inks.set(key, { sample: own.slice(0, 20), n: 0 });
          inks.get(key).n++;
        }

        // WHAT IS BEHIND IT. elementsFromPoint returns topmost-first, so
        // anything after the panel's own subtree is genuinely behind the panel
        // at that point. Sampled on a 3x3 grid inset from the edges, because a
        // panel commonly straddles two different surfaces and one centre probe
        // would report whichever it happened to land on.
        const behind = new Map();
        for (const fx of [0.15, 0.5, 0.85]) {
          for (const fy of [0.15, 0.5, 0.85]) {
            const px = rect.left + rect.width * fx;
            const py = rect.top + rect.height * fy;
            let stack;
            try { stack = document.elementsFromPoint(px, py); } catch (err) { continue; }
            for (const el of stack) {
              if (panel === el || panel.contains(el)) continue;
              const bcs = getComputedStyle(el);
              const bg = paint(bcs.backgroundColor, '#FF00FF');
              // Skip fully transparent ancestors: painting them over magenta
              // leaves magenta, which is how a no-op is detected without
              // parsing the colour string ourselves.
              if (!bg || (bg[0] === 255 && bg[1] === 0 && bg[2] === 255)) continue;
              const key = hx(paint(bcs.backgroundColor, '#000000')) + '/' + hx(paint(bcs.backgroundColor, '#FFFFFF'));
              if (!behind.has(key)) behind.set(key, { css: bcs.backgroundColor, n: 0 });
              behind.get(key).n++;
              break;
            }
          }
        }

        // THE VERDICT. Reported against three backdrops, in decreasing
        // strength of claim:
        //   flat   — the panel colour alone, i.e. what the theme's own audit
        //            assumes and what D-0001-6 requires.
        //   #000 / #FFF — the UNCONDITIONAL bound. The panel is 90% opaque, so
        //            no backdrop that exists or could ever exist moves it
        //            further than these two. A tier that clears AA against both
        //            is closed PERMANENTLY, with no dependence on catching a
        //            representative screen — which matters because a menu can
        //            only be sampled if the user happens to have one open.
        // The observed backdrops are reported too, but they are evidence about
        // this screen; the bound is the part that generalises.
        const surf = decompose(cs.backgroundColor);
        const verdicts = [];
        for (const [colour, info] of inks) {
          const fg = paint(colour, '#808080');
          const flat = surf ? cr(fg, surf.opaque) : 0;
          const lo = surf ? cr(fg, surf.darkest) : 0;
          const hi = surf ? cr(fg, surf.lightest) : 0;
          const worst = Math.min(lo, hi);
          verdicts.push(hx(fg) + ' x' + info.n + ' ' + JSON.stringify(info.sample) +
            ' -> flat ' + flat.toFixed(2) +
            '  over#000 ' + lo.toFixed(2) + '  over#FFF ' + hi.toFixed(2) +
            '  WORST ' + worst.toFixed(2) + ' ' +
            (worst >= 4.5
              ? 'PASSES AA OVER ANY BACKDROP — closed, no landmark needed'
              : 'below 4.5 in the worst case; judge against the observed backdrop above'));
        }

        floatingSurface = '<' + panel.tagName.toLowerCase() + ' role=' + panel.getAttribute('role') + '> ' +
          Math.round(rect.width) + 'x' + Math.round(rect.height) +
          '  bg=' + cs.backgroundColor +
          (surf ? '  measuredAlpha=' + surf.alpha.toFixed(3) + '  opaqueForm=' + hx(surf.opaque) : '  (bg unpaintable)') +
          '  backdropFilter=' + cs.backdropFilter +
          // The newline escapes below are DOUBLE-escaped, and must be. This
          // file is a Node template literal whose VALUE is evaluated as
          // JavaScript in the renderer: a singly-escaped newline resolves to a
          // real line break in that value, splitting the string literal across
          // two lines and throwing at executeJavaScript time. Same reason the
          // regexes above are written with a doubled backslash. Note that a
          // comment is not a refuge from this — one written the other way here
          // broke the parse exactly as the code did.
          '\\n      behind it: ' + (behind.size
            ? Array.from(behind.values()).map((b) => b.css + ' x' + b.n).join('  |  ')
            : '(nothing opaque found under the panel — it may sit over the window material)') +
          '\\n      ink tiers painted on it (' + inks.size + '):' +
          (verdicts.length ? '\\n        ' + verdicts.join('\\n        ') : ' (none — panel carries no text of its own)');
      }

      // DIFF / EDITOR / TERMINAL SURFACES — never measured under the theme
      // (findings §8.6). Deliberately NOT found by tag: the diff view contains
      // no pre/code/kbd/samp element at all, so the code-surface line above
      // reads pre=0 code=0 on a screen full of visible code and does not cover
      // this. Found instead by the property that actually defines these
      // regions — a sizeable block rendering in the theme's mono face — which
      // no markup change can invalidate the way a class or tag can.
      //
      // This is an OBSERVATION, not a landmark: nothing here is styled from it.
      //
      // Bounded on purpose. This runs inside the user's live editor, not a test
      // page: a conversation view can hold many thousands of divs, and an
      // unbounded getComputedStyle sweep would stall the UI thread of the app we
      // are supposed to leave fully functional. A diagnostic that degrades the
      // app it is diagnosing is not an acceptable trade, so the scan stops after
      // a fixed budget and says so rather than running to completion.
      // Two runs reported "no mono block" while the owner believed a diff was
      // open. Before concluding anything about the SCREEN, this has to be able
      // to distinguish three different states it previously collapsed into one
      // message: nothing mono on screen at all; something mono on screen but
      // below the size/tag filter; and a scan that ran out of budget. So a
      // separate, unfiltered tally runs first and is reported either way.
      // Without it, "no diff" is indistinguishable from "the query cannot see
      // the diff" -- which is exactly the mistake the card census just made.
      // WHERE the font-family actually comes from. font-family INHERITS, so an
      // element computing ui-monospace may be stating nothing itself and simply
      // carrying an ancestor's value. Checking el.style alone answers the wrong
      // question -- measured 2026-08-02, where the terminal panel reported
      // inlineFontFamily=none while still painting ui-monospace, and the ancestor
      // was never looked at. Walk to the HIGHEST ancestor sharing the same
      // computed value: that element is where the value enters the subtree, and
      // it is the only element a fix could target.
      function fontOrigin(el, fam) {
        let origin = el;
        let node = el.parentElement;
        while (node && getComputedStyle(node).fontFamily === fam) {
          origin = node;
          node = node.parentElement;
        }
        const ocs = getComputedStyle(origin);
        const inline = origin.style && origin.style.fontFamily;
        return 'fontOrigin=<' + origin.tagName.toLowerCase() + '>' +
          (origin === el ? ' (the region itself)' : ' (ancestor)') +
          ' class="' + String(origin.className || '').slice(0, 60) + '"' +
          ' inline=' + (inline ? '"' + inline.split(',')[0] + '" (INLINE — unreachable by CSS)' : 'none') +
          // The variable AT THE ORIGIN, which is the one that would matter.
          ' ' + MONO_VAR + '=' + (ocs.getPropertyValue(MONO_VAR).trim() || '(unset)').split(',')[0] +
          ' --default-mono-font-family=' + (ocs.getPropertyValue('--default-mono-font-family').trim() || '(unset)').split(',')[0];
      }

      const monoRegions = [];
      let scanned = 0;
      let scanTruncated = false;
      let monoAnySize = 0;
      let monoBiggest = null;
      const monoFamilies = new Set();
      for (const el of document.querySelectorAll('*')) {
        if (++scanned > SCAN_BUDGET) { scanTruncated = true; break; }
        const ecs = getComputedStyle(el);
        const fam = ecs.fontFamily || '';
        if (!/Monaspace|monospace|Consolas|Menlo/i.test(fam)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          monoAnySize++;
          monoFamilies.add(fam.split(',')[0]);
          // Carry the FACE, not just the geometry. D-0001-18 is a question about
          // which font-family wins on <body>, and the size/tag filter below can
          // reject every candidate on a screen that is visibly full of code --
          // measured 2026-08-02, where a diff rendered as 40px-tall <span> rows.
          // When that happens the tally is the only line that reports, so it has
          // to carry the answer. The regex above matches Monaspace, Consolas and
          // Menlo alike, so a bare count cannot tell the D-0001-18 pass case from
          // the exact failure it predicts.
          if (!monoBiggest || r.width * r.height > monoBiggest.w * monoBiggest.h) {
            const bsurface = effectiveBg(el);
            const bink = paint(ecs.color, '#808080');
            monoBiggest = {
              w: r.width,
              h: r.height,
              tag: el.tagName.toLowerCase(),
              font: fam.split(',')[0],
              ink: hx(bink),
              surface: bsurface ? hx(bsurface.colour) : null,
              contrast: bsurface ? cr(bink, bsurface.colour) : null,
            };
          }
        }
        if (r.width < 200 || r.height < 60) continue;
        if (!/^(div|section|main|table|pre|code|tbody|article)$/.test(el.tagName.toLowerCase())) continue;
        // Only the OUTERMOST such block, or every nested row reports itself.
        if (monoRegions.some((m) => m.el.contains(el))) continue;
        // The region's own background is usually transparent, so the surface
        // the code actually sits on belongs to an ancestor. Walk to it rather
        // than reporting rgba(0,0,0,0) as "the diff surface".
        const surface = effectiveBg(el);
        const ink = paint(ecs.color, '#808080');
        monoRegions.push({
          el,
          line: Math.round(r.width) + 'x' + Math.round(r.height) +
            '  font=' + fam.split(',')[0] +
            // The variable AS THIS ELEMENT SEES IT. If it reads Monaspace Neon
            // while the element paints ui-monospace, the element's font-family
            // does not come from this variable at all -- e.g. an inline style
            // written by JS, which no stylesheet can reach.
            '  ' + MONO_VAR + '=' + (ecs.getPropertyValue(MONO_VAR).trim() || '(unset)').split(',')[0] +
            '  ' + fontOrigin(el, fam) +
            '  ink=' + hx(ink) +
            '  surface=' + (surface ? hx(surface.colour) + ' (from <' + surface.from.tagName.toLowerCase() + '>)' : 'NONE opaque up to <html>') +
            '  contrast=' + (surface ? cr(ink, surface.colour).toFixed(2) + (cr(ink, surface.colour) >= 4.5 ? ' PASS' : ' FAIL') : 'unprovable — nothing paints behind it'),
        });
        if (monoRegions.length >= 4) break;
      }
      // A miss must name its own cause (findings §8.5). "None found" after a
      // truncated scan is a different statement from "none found" after a
      // complete one, and reporting them identically is how an absent surface
      // gets read as a measured negative.
      const monoTally = 'monoElements=' + monoAnySize +
        (monoBiggest ? ' biggest=<' + monoBiggest.tag + '> ' +
          Math.round(monoBiggest.w) + 'x' + Math.round(monoBiggest.h) +
          ' font=' + monoBiggest.font +
          ' ink=' + monoBiggest.ink +
          ' surface=' + (monoBiggest.surface || 'NONE opaque up to <html>') +
          (monoBiggest.contrast === null
            ? ' contrast=unprovable'
            : ' contrast=' + monoBiggest.contrast.toFixed(2) +
              (monoBiggest.contrast >= 4.5 ? ' PASS' : ' FAIL'))
          : '') +
        // Every DISTINCT mono face on screen, because the detection regex above
        // matches ours and Codex's stock stack alike. If Monaspace Neon and
        // ui-monospace both appear, D-0001-18 has reached some surfaces and not
        // others, which a single "biggest" sample would hide.
        (monoFamilies.size ? '  faces={' + [...monoFamilies].join(' | ') + '}' : '') +
        '  scanned=' + scanned + (scanTruncated ? ' (TRUNCATED)' : '');
      const codeRegions = monoRegions.length
        ? monoRegions.map((m) => m.line)
        : [scanTruncated
            ? 'none — scan hit its ' + SCAN_BUDGET + '-element budget. INCONCLUSIVE, not a negative result. ' + monoTally
            : monoAnySize
              ? 'no qualifying block, BUT ' + monoTally + ' — mono text IS on screen and the size/tag filter is what rejected it. ' +
                'This is a finding about the QUERY, not about the screen.'
              : 'nothing on screen renders in a mono face at all (' + monoTally + '). No diff/terminal/code view was open at this sample — an unrun measurement, not a negative result.'];

      // D-0001-19 — the terminal is xterm.js, which sizes its cell grid by
      // MEASURING .xterm-char-measure-element and paints glyphs into .xterm-rows.
      // Those two must carry the SAME face or the grid desynchronises: correct
      // glyphs, misplaced cursor and selection. That misalignment is invisible to
      // any contrast or font check, so what is reported here is the PRECONDITION
      // for coherence -- both faces, side by side, plus the measured cell box.
      // A split is a defect even when both names look right individually.
      const xtermRows = document.querySelector('.xterm-rows');
      const xtermMeasure = document.querySelector('.xterm-char-measure-element');
      let xterm = null;
      if (xtermRows || xtermMeasure) {
        const rowFam = xtermRows ? getComputedStyle(xtermRows).fontFamily.split(',')[0] : '(no .xterm-rows)';
        const measFam = xtermMeasure ? getComputedStyle(xtermMeasure).fontFamily.split(',')[0] : '(no measure element)';
        const mr = xtermMeasure ? xtermMeasure.getBoundingClientRect() : null;
        xterm = 'rows=' + rowFam + '  measureElement=' + measFam +
          (mr ? '  cell=' + mr.width.toFixed(2) + 'x' + mr.height.toFixed(2) : '') +
          '  => ' + (xtermRows && xtermMeasure
            ? (rowFam === measFam
                ? 'COHERENT (measurement and paint agree)'
                : 'SPLIT — grid will misalign; cursor/selection will not sit on the glyphs')
            : 'INCOMPLETE — one of the two elements is not mounted, so coherence is UNTESTED, not confirmed');
      }

      const heading = document.querySelector('.heading-xl, .heading-lg, .heading-2xl');
      const headingFont = heading ? getComputedStyle(heading).fontFamily : '(no heading on screen)';
      const bodyFont = document.body ? getComputedStyle(document.body).fontFamily : '(no body)';

      return {
        painted,
        fonts,
        code,
        hero,
        tint,
        indicator,
        cardHairline,
        composerAction,
        floatingSurface,
        codeRegions,
        xterm,
        monoVarHtml,
        monoVarBody,
        headingFont,
        bodyFont,
        rootClass: root.className || '(none)',
        bodyClass: document.body ? (document.body.className || '(none)') : '(no body)',
        styleTagPresent: !!document.getElementById('codexterity-theme'),
        tokens,
        bodyBg: document.body ? getComputedStyle(document.body).backgroundColor : '(no body)',
        sheetCount: document.styleSheets.length,
      };
    })();
  `;
  try {
    const env = await webContents.executeJavaScript(script, true);
    log(`  root class:  ${env.rootClass}`);
    log(`  body class:  ${env.bodyClass}`);
    log(`  our <style> present: ${env.styleTagPresent}   stylesheets: ${env.sheetCount}`);
    log(`  body background: ${env.bodyBg}`);
    for (const [name, value] of Object.entries(env.tokens)) {
      log(`  ${name}: ${value}`);
    }
    for (const row of env.painted || []) log(`  painted ${row}`);
    if (env.fonts) log(`  fonts loadable: ${env.fonts.join('  ')}`);
    if (env.code) log(`  code surfaces: ${env.code.join('  ')}`);
    if (env.hero) log(`  hero: ${env.hero}`);
    if (env.tint) log(`  title-bar tint computes: ${env.tint}`);
    if (env.indicator) log(`  active-row indicator: ${env.indicator}`);
    if (env.cardHairline) log(`  empty-state card hairline: ${env.cardHairline}`);
    if (env.composerAction) log(`  composer filled control: ${env.composerAction}`);
    if (env.floatingSurface) log(`  floating surface: ${env.floatingSurface}`);
    for (const row of env.codeRegions || []) log(`  code/diff/terminal region: ${row}`);
    if (env.xterm) log(`  D-0001-19  xterm terminal: ${env.xterm}`);
    // D-0001-18 — the two levels are logged ADJACENTLY and unreduced, because
    // the whole diagnostic value is in comparing them to each other.
    if (env.monoVarHtml !== undefined) {
      log(`  D-0001-18  --vscode-editor-font-family on <html>: ${env.monoVarHtml}`);
      log(`  D-0001-18  --vscode-editor-font-family on <body>: ${env.monoVarBody}`);
    }
    if (env.bodyFont) log(`  body font-family:    ${env.bodyFont}`);
    if (env.headingFont) log(`  heading font-family: ${env.headingFont}`);
  } catch (err) {
    log(`  root environment probe FAILED: ${err.message}`);
  }
}

/**
 * Probe mode (Phase 3 task A).
 *
 * Gate 0's token-gap probe is DELETED rather than kept behind a flag, because a
 * measurement that cannot distinguish our properties from Codex's is not a
 * weaker measurement — it is a wrong one, and leaving it runnable invites it to
 * be quoted again (docs/research/gate0-findings.md §4.3). Its replacement is
 * injector/core/probe.js, which samples with injection SUPPRESSED and reads
 * stylesheet text rather than resolved computed values.
 *
 * CDX_PROBE=1              enable probe mode; the theme is deliberately NOT applied
 * CDX_PROBE_OUT=<dir>      where reports are written (ours, never Codex's)
 * CDX_PROBE_AT=6000,30000  ms after dom-ready to sample, so a later sample can
 *                          catch a screen the first one could not — e.g. one
 *                          containing code, which the empty state never does.
 */
const PROBE_ENABLED = !!process.env.CDX_PROBE;

function probeOutDir() {
  if (process.env.CDX_PROBE_OUT) return process.env.CDX_PROBE_OUT;
  if (debugLogPath) return path.dirname(debugLogPath);
  return process.cwd();
}

function probeSchedule() {
  const raw = process.env.CDX_PROBE_AT;
  if (!raw) return [6000];
  const parsed = raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  if (!parsed.length) {
    log(`CDX_PROBE_AT="${raw}" contained no usable millisecond offsets; falling back to 6000.`);
    return [6000];
  }
  return parsed;
}

function scheduleProbes(webContents) {
  const offsets = probeSchedule();
  const outDir = probeOutDir();
  log(`PROBE MODE: theme injection is suppressed on purpose. Sampling webContents#${webContents.id} ` +
      `at ${offsets.join('ms, ')}ms after dom-ready; reports -> ${outDir}`);
  offsets.forEach((ms) => {
    setTimeout(() => {
      if (webContents.isDestroyed()) return;
      runProbe(webContents, log, outDir, `wc${webContents.id}-t${ms}`);
    }, ms);
  });
}

/**
 * Re-read the token report once the app has settled.
 *
 * reportRootEnvironment runs at `dom-ready`, which is EARLY — before Codex's
 * later stylesheets have loaded. At that moment its own downstream tokens
 * (--color-token-*) have not been defined yet and read back as "(unset)". That
 * is a property of when we sampled, not evidence that the theme failed to
 * reach them, and reading it as a finding would be the same mistake as Gate 0's
 * invalid measurement in the opposite direction.
 *
 * The settled check ALWAYS runs — set CDX_VERIFY_AT=<ms> only to override
 * WHEN it samples. Unset (or empty), it takes a single reading 15000ms after
 * dom-ready, which is the default schedule DEFAULT_VERIFY_SCHEDULE below.
 * That default is not arbitrary: Plan 0002 M3 measured all four
 * screen-relevant landmarks PRESENT and stable at +8000, +15000 and +25000ms
 * on the main window, so 15000ms sits inside a window that was actually
 * observed settled, with margin on both sides for a slower launch.
 *
 * This is load-bearing, not a convenience default. F1 (Plan 0002 M3): with no
 * default, verifySchedule() returned [] for every real install — nothing in
 * the shipped launch path (packaging/windows/Codexterity.cs, injector/cli.js,
 * launcher/windows/launch.ps1) ever sets CDX_VERIFY_AT — so the one
 * required:true landmark (sidebar-panel, D-0001-13) was NEVER adjudicated
 * for a real user. Every launch logged "not yet present … the settled check
 * (CDX_VERIFY_AT) is what convicts it" and no verdict ever arrived. The
 * settled check must be on by default for the safety net it exists to be.
 *
 * SEVERAL offsets may be given, comma-separated, exactly as CDX_PROBE_AT
 * already accepts them. This is not symmetry for its own sake. Half of what the
 * settled check reports only exists on ONE screen — the empty-state cards are
 * absent from a conversation, a menu is unmounted until it is opened, code
 * surfaces are absent until a code block is on screen — and Codex exposes no
 * UI-automation tree, so no screen can be driven to from outside. A single
 * offset therefore measures whichever screen the user happened to be on and
 * silently reports every other surface as absent. Several offsets let one
 * launch cover several screens, which is the difference between one owner
 * interaction and three.
 */
const DEFAULT_VERIFY_SCHEDULE = [15000];

function verifySchedule() {
  const raw = process.env.CDX_VERIFY_AT;
  // Unset AND explicitly empty (CDX_VERIFY_AT="") both mean "use the
  // default" — they are indistinguishable from each other in a shell, and
  // treating either as "disabled" would silently switch off the one
  // required-landmark safety net this project has (see F1 above).
  if (!raw || !raw.trim()) return DEFAULT_VERIFY_SCHEDULE;
  const parsed = [];
  for (const part of String(raw).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const ms = Number(trimmed);
    // Reported per-entry rather than rejecting the whole list: a typo in the
    // third offset should not silently cancel the first two, and a skipped
    // sample that says nothing is how a wrong screen gets read as a finding.
    if (!Number.isFinite(ms) || ms < 0) {
      log(`CDX_VERIFY_AT entry "${trimmed}" is not a millisecond value; skipping that sample.`);
      continue;
    }
    parsed.push(ms);
  }
  // Deliberately NOT falling back to the default here. The caller supplied
  // an explicit, non-empty list — if every entry in it was invalid, that is
  // the user's typo, not an absent setting, and quietly substituting the
  // default would hide it. The per-entry log lines above already said why
  // each sample was dropped; an empty result here says so too.
  return parsed;
}

function scheduleSettledVerification(webContents) {
  const offsets = verifySchedule();
  if (!offsets.length) return;
  for (const ms of offsets) {
    setTimeout(() => {
      if (webContents.isDestroyed()) return;
      log(`settled token re-check on webContents#${webContents.id} (+${ms}ms):`);
      // D-0001-25 — the SETTLED sample re-probes the landmarks too, not just
      // the token environment. This was reportRootEnvironment() alone, and the
      // first real launch through the M3 path showed why that is wrong: the
      // landmark probe ran ONLY at `dom-ready`, where the DOM held 24 elements
      // and `stylesheets: 3`, so `sidebar-panel` — the one required:true
      // landmark — reported MISSING (REQUIRED) on EVERY launch, while the
      // later sample that could actually answer it never asked. A required
      // alarm that fires every time is worse than no alarm: it trains the
      // reader to ignore the line, and the next time it is real nobody looks.
      // This is the same failure that killed the four pre-Gate-0 landmarks,
      // in its noisy form rather than its silent one.
      reportLandmarks(webContents, `settled +${ms}ms`);
    }, ms);
  }
}

/**
 * @param {string} phase - where in the lifecycle this reading was taken.
 *   It is printed on every line because the two call sites are NOT equally
 *   authoritative: `dom-ready` fires before Codex has built its shell, so a
 *   zero there is a fact about WHEN we looked, while a zero at a settled
 *   offset is a fact about the SCREEN. Reporting both without saying which is
 *   which is precisely the collapse "a negative result must name its query"
 *   exists to prevent.
 */
async function reportLandmarks(webContents, phase) {
  // Only a settled reading can convict a required landmark. Tested on the
  // caller's intent rather than by matching one phase STRING, so adding a
  // third call site later cannot silently inherit the authoritative verdict
  // just by being named something the check did not anticipate.
  const settled = phase.startsWith('settled');

  // D-0001-33 — a required landmark's MISSING verdict is gated on the URL of
  // the webContents being adjudicated, not on the manifest alone. F2 (Plan
  // 0002 M3): Codex opens a second window for `?initialRoute=%2Favatar-overlay`
  // (an overlay, not the app shell) — the theme applies there correctly, but
  // that window can never contain `.app-shell-left-panel`, so treating its
  // absence as a defect logged a false "REQUIRED and absent" alarm on every
  // healthy launch. Measured on two independent launches: the MAIN window is
  // `app://-/index.html` with no query string; every secondary window carries
  // an `initialRoute` query parameter.
  //
  // The gate is on the URL, not on the DOM (e.g. "only judge windows that
  // contain some `.app-shell*` ancestor"), deliberately:
  //   - A DOM-based gate is near-circular, because `.app-shell-left-panel` IS
  //     the landmark. If Codex renamed that whole family, a DOM gate would
  //     silently stop adjudicating and the alarm would go quiet exactly when
  //     it was needed — the same silent-success failure that killed the four
  //     pre-Gate-0 landmarks.
  //   - The URL gate fails in the NOISY direction instead: if Codex changes
  //     its routing scheme, the false alarm of today returns — visible and
  //     recoverable, never a silent miss. That asymmetry is the whole reason
  //     for the choice.
  //
  // A URL that fails to parse is treated as PRIMARY (still adjudicated) —
  // deliberately the opposite failure mode from a missing query param, since
  // an unparseable URL must never silently switch off the required-landmark
  // alarm.
  const windowUrl = webContents.getURL();
  let isSecondaryWindow = false;
  try {
    isSecondaryWindow = new URL(windowUrl).searchParams.has('initialRoute');
  } catch {
    isSecondaryWindow = false; // unparseable URL => adjudicate as primary
  }

  await reportRootEnvironment(webContents);
  try {
    const results = await webContents.executeJavaScript(buildLandmarkProbeScript(), true);
    results.forEach((result, i) => {
      const declared = activeTheme.manifest.landmarks[i];
      const governedBy = declared.governedBy ? `  [${declared.governedBy}]` : '';
      if (result.count > 0) {
        log(`  landmark PRESENT: ${declared.name}  (${result.count} match${result.count === 1 ? '' : 'es'})${governedBy}`);
      } else if (result.count === 0) {
        // D-0001-21: only `sidebar-panel` is required:true (D-0001-13) — the
        // other five are optional because they only exist on certain screens
        // (a terminal, a code block, the home hero). A zero count for an
        // optional landmark on a screen that never has one is NOT a defect —
        // "a negative result must name its query" is a repeated, hard-won
        // lesson in this project (docs/DECISIONS.md), and a log line that
        // reads MISSING for both cases would relitigate it. A missing
        // required landmark must be louder: it names its own severity so the
        // owner does not have to cross-reference the manifest to know whether
        // to worry.
        if (declared.required && settled && isSecondaryWindow) {
          // D-0001-33 — this webContents carries an `initialRoute` query
          // param, so it is a secondary/overlay window, not the app shell,
          // and can never contain the sidebar. Informational only; naming
          // the window's own URL is what lets the reader confirm the gate
          // fired for the right reason instead of trusting the label.
          log(
            `  landmark absent (secondary window, not the app shell): ${declared.name}  ` +
              `(selector "${declared.selector}" matched nothing at ${phase}; this window is ${windowUrl} ` +
              `and has no app shell — not a defect)${governedBy}`
          );
        } else if (declared.required) {
          // A required landmark absent at dom-ready is EXPECTED, not a
          // finding — Codex has not built its shell yet. Only the settled
          // reading can convict it, so the early one says so in the line
          // itself rather than leaving the reader to know it.
          log(
            `  landmark ${settled ? 'MISSING (REQUIRED)' : 'not yet present'}: ${declared.name}  ` +
              `(selector "${declared.selector}" matched nothing at ${phase})${governedBy}` +
              (settled
                ? ' — REQUIRED and absent on a settled DOM. This is a real defect.'
                : ' — the shell is not built this early; the settled check (CDX_VERIFY_AT) is what convicts it')
          );
        } else {
          log(`  landmark absent (optional, screen-dependent): ${declared.name}  (selector "${declared.selector}" matched nothing at ${phase} — not necessarily a defect)${governedBy}`);
        }
      } else {
        log(`  landmark PROBE ERROR: ${declared.name}  (invalid selector "${declared.selector}" at ${phase})${governedBy}`);
      }
    });
  } catch (err) {
    log(`  landmark probe FAILED at ${phase}: ${err.message}`);
  }
}

/**
 * D-0001-1 (amended 2026-08-01) — THE SHIPPED PRIMARY INJECTION ROUTE.
 *
 * insertCSS() is attempted first only because it is the cleaner API where it
 * works; on this Electron fork it always throws, and this is what actually
 * applies the theme. Gate 0 measured that; docs/DECISIONS.md records it.
 *
 * Appends (or replaces) a single <style> element via webContents
 * .executeJavaScript. This is a DIFFERENT main->renderer IPC channel from the
 * one insertCSS uses, which matters: insertCSS reaches the renderer through the
 * sandboxed webFrame proxy, and that proxy is where this Electron fork fails.
 *
 * Still an official Electron API. Still no debug port. Two real differences
 * from insertCSS, both of which Gate 0 must measure rather than assume:
 *   - Author origin, not user origin. Our overrides are variable definitions on
 *     .electron-dark / .electron-light at equal specificity to Codex's own, so
 *     later-wins should carry them; a stock !important author rule would not be
 *     beaten the way a user-origin sheet beats it.
 *   - A DOM node can be removed by the app's own re-rendering, where an
 *     inserted stylesheet cannot. The stable id makes re-application idempotent.
 */
async function applyThemeViaStyleTag(webContents, css) {
  const script = `
    (() => {
      const ID = 'codexterity-theme';
      let el = document.getElementById(ID);
      if (!el) {
        el = document.createElement('style');
        el.id = ID;
        document.head.appendChild(el);
      }
      el.textContent = ${JSON.stringify(css)};
      return {
        applied: true,
        bytes: el.textContent.length,
        lastChildOfHead: document.head.lastElementChild === el,
      };
    })();
  `;
  return webContents.executeJavaScript(script, true);
}

async function applyTheme(webContents) {
  const label = `webContents#${webContents.id}`;
  // Read from the module-level slot, not a captured argument (D-0001-25 —
  // see the slot's own doc comment above). This is the read half of the
  // mutable slot M3 exists to build: every call site asks "what is the
  // active theme RIGHT NOW" instead of "what was it when this window
  // attached", which is exactly the indirection a future live-re-theming
  // milestone needs and exactly what a closure-captured `css` local cannot
  // provide without restructuring every call site that holds one.
  const css = activeTheme.css;
  const bytes = Buffer.byteLength(css, 'utf8');

  try {
    await webContents.insertCSS(css, { cssOrigin: 'user' });
    log(`injected OK via insertCSS on ${label} — ${bytes} bytes`);
    await reportLandmarks(webContents, 'apply-time (dom-ready/navigate)');
    return;
  } catch (err) {
    log(`insertCSS FAILED on ${label}: ${err.message}`);
  }

  // insertCSS is unavailable on this build. Before conceding the mechanism,
  // establish whether the OTHER official main->renderer API works at all --
  // the answer decides whether D-0001-1's no-debug-port guarantee survives.
  try {
    const result = await applyThemeViaStyleTag(webContents, css);
    log(
      `injected OK via executeJavaScript style tag on ${label} — ` +
        `${result.bytes} chars, lastChildOfHead=${result.lastChildOfHead}`
    );
    await reportLandmarks(webContents, 'apply-time (dom-ready/navigate)');
    return;
  } catch (err) {
    // Both official routes are gone. Degrade to the stock look — never leave
    // the window half-styled, and never throw out of an Electron event
    // handler, which would take down Codex's main process with us.
    log(
      `executeJavaScript ALSO FAILED on ${label}: ${err.message} — ` +
        `Codex remains unthemed for this window.\n${err.stack}`
    );
  }
}

function attachToWindow(win) {
  const wc = win.webContents;
  const label = `webContents#${wc.id}`;

  // In probe mode the theme is never applied — an injected sheet would make
  // Codex's own token vocabulary unreadable, which is precisely the mistake
  // Gate 0's invalid measurement made.
  if (PROBE_ENABLED) {
    wc.once('dom-ready', () => {
      log(`dom-ready on ${label} (url=${wc.getURL()})`);
      scheduleProbes(wc);
    });
    return;
  }

  wc.once('dom-ready', () => scheduleSettledVerification(wc));

  // No CSS argument threaded through: applyTheme() reads the active theme
  // from the module-level slot at the moment each event fires (D-0001-25).
  wc.on('dom-ready', () => {
    log(`dom-ready on ${label} (url=${wc.getURL()})`);
    applyTheme(wc);
  });

  wc.on('did-navigate', (_event, url) => {
    log(`did-navigate on ${label} -> ${url}`);
    applyTheme(wc);
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    log(`did-navigate-in-page on ${label} -> ${url}`);
    applyTheme(wc);
  });
}

function start() {
  log('preload loaded into main process');

  // NODE_OPTIONS=--require runs this module via Node's own internal preload
  // step, which executes BEFORE Electron's bootstrap has patched Module._load
  // to recognize 'electron' as its virtual built-in module. A synchronous
  // require('electron') here throws MODULE_NOT_FOUND every time, in every
  // process (main, GPU, utility) that inherits NODE_OPTIONS -- this was
  // observed directly during Gate 0 testing. Electron's own entry script
  // registers that module later in the SAME tick sequence, so deferring the
  // require past the current call stack (setImmediate) lets it resolve once
  // Electron's bootstrap has continued. This still runs synchronously within
  // the same main-process instance, still calls only the official
  // webContents.insertCSS() API, and still opens no debug port -- it is a
  // load-order fix to D-0001-1's primary mechanism, not a different mechanism.
  setImmediate(() => {
    let electron;
    try {
      electron = require('electron');
    } catch (err) {
      log(`STARTUP FAILED, 'electron' module unavailable in this process even after deferring past ` +
        `the preload tick: ${err.message}`);
      return;
    }

    const { app } = electron;
    if (!app) {
      log('STARTUP FAILED: require("electron") did not return the main-process app module — ' +
        'this process is not an Electron main process.');
      return;
    }

    // D-0001-25 — THE THEME IS LOADED HERE, AFTER 'electron' HAS RESOLVED, AND
    // DELIBERATELY NOT IN start()'s OWN BODY.
    //
    // NODE_OPTIONS is inherited by EVERY child process Codex spawns (GPU,
    // utility, renderer helpers), so this module's start() runs in all of
    // them — and only one of them is an Electron main process that can apply
    // anything. Loading above the electron check was correct while the theme
    // was a bare fs.readFileSync, whose cost was invisible. It is not
    // invisible now: loadTheme() inflates a ~681 KB zip and runs the
    // safe-CSS scan over ~476 KB of CSS, MEASURED at 27 ms, and the first
    // real launch through this path showed the package being loaded FOUR
    // times — once usefully, three times in processes that then failed the
    // electron check and exited. A process that structurally cannot apply a
    // theme must never pay to validate one. The two guards are now in
    // dependency order rather than in the order they were written.
    try {
      const packagePath = resolveThemePackagePath();
      activeTheme = loadTheme(packagePath);
      log(
        `theme package loaded from ${activeTheme.sourcePath} (${activeTheme.sourceKind}) — ` +
          `id=${activeTheme.id}  ${Buffer.byteLength(activeTheme.css, 'utf8')} bytes of CSS  ` +
          `${activeTheme.manifest.landmarks.length} landmark(s) declared`
      );
    } catch (err) {
      // Cannot theme without a validated package. Degrade: log the failure's
      // machine-readable code loudly (docs/ENGINEERING.md "fail loudly in
      // development, gracefully in production" — never half-styled, never
      // crashed), attach nothing, and let Codex run completely stock and
      // functional. A ThemeLoadError names exactly what was wrong
      // (SOURCE_NOT_FOUND, MANIFEST_INVALID, CSS_UNSAFE, SIZE_EXCEEDED,
      // ZIP_MALFORMED); anything else is an unexpected error and is reported
      // the same way, degrading rather than propagating.
      const code = err instanceof ThemeLoadError ? err.code : 'UNEXPECTED';
      log(`STARTUP FAILED [${code}], running stock/unthemed: ${err.message}`);
      return;
    }

    log(`process.versions: ${JSON.stringify(process.versions)}`);

    const attach = () => {
      app.on('browser-window-created', (_event, win) => {
        log(`browser-window-created (webContents#${win.webContents.id})`);
        attachToWindow(win);
      });
      log('attached browser-window-created listener; waiting for windows');
    };

    if (app.isReady()) {
      attach();
    } else {
      app.whenReady().then(attach);
    }
  });
}

module.exports = { start };
