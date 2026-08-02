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
 * any API key/token. It reads exactly one file: the theme CSS path handed to
 * it via CDX_THEME_CSS_PATH, and the Electron APIs it calls are read-only
 * with respect to the app itself (they mutate only the in-memory render tree
 * of a window we did not create).
 *
 * If the theme cannot be applied cleanly, this module logs the failure and
 * leaves the window exactly as Codex rendered it — never half-styled, never
 * crashed (see docs/ENGINEERING.md "Fail loudly in development, gracefully
 * in production").
 */

const fs = require('fs');
const path = require('path');
const { runProbe } = require('./probe.js');

// D-0001-2 — declared landmarks from themes/captains-cabin/theme.css and
// docs/specs/customizable-ui-inventory.md. Gate 0's job is to report, for the
// first time, which of these actually exist in the live DOM.
const DECLARED_LANDMARKS = [
  { name: 'app-header-tint', selector: '.app-header-tint' },
  { name: 'popupContent', selector: '.popupContent' },
  { name: 'app-shell-main-content-top-fade', selector: '.app-shell-main-content-top-fade' },
  { name: 'code-surfaces (pre,code,kbd,samp)', selector: 'pre, code, kbd, samp' },
];

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

function resolveThemePath() {
  const themePath = process.env.CDX_THEME_CSS_PATH;
  if (!themePath) {
    throw new Error(
      'CDX_THEME_CSS_PATH is not set. The launcher must set this to an absolute ' +
        'path to themes/<name>/theme.css before starting Codex.'
    );
  }
  return themePath;
}

function loadThemeCss(themePath) {
  // Read-only access to OUR OWN theme package file. Never touches anything
  // under the Codex install directory.
  return fs.readFileSync(themePath, 'utf8');
}

/**
 * Probe the live DOM for the declared landmarks. Read-only querySelector
 * checks only — no mutation, no data extraction beyond boolean presence and
 * a match count.
 */
function buildLandmarkProbeScript() {
  const selectors = DECLARED_LANDMARKS.map((l) => l.selector);
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
      const allButtons = Array.from(document.querySelectorAll('button'));
      const cards = allButtons.filter((b) => {
        const r = b.getBoundingClientRect();
        const bySize = r.width > 120 && r.width < 320 && r.height > 70 && r.height < 180;
        const byClass = typeof b.className === 'string' && b.className.split(/\\s+/).indexOf('min-h-26') >= 0;
        return bySize || byClass;
      });
      let cardHairline;
      if (!cards.length) {
        const onHome = !!document.querySelector('.heading-xl');
        const composerText = (document.querySelector('.ProseMirror') || {}).textContent || '';
        const biggest = allButtons
          .map((b) => b.getBoundingClientRect())
          .sort((a, b) => (b.width * b.height) - (a.width * a.height))
          .slice(0, 3)
          .map((r) => Math.round(r.width) + 'x' + Math.round(r.height))
          .join(', ');
        cardHairline = 'NOT FOUND — homeScreen=' + (onHome ? 'yes' : 'no') +
          '  buttons=' + allButtons.length + ' (largest: ' + (biggest || 'none') + ')' +
          '  composerDraft=' + JSON.stringify(composerText.slice(0, 24)) +
          (onHome && composerText.trim()
            ? '  => a non-empty composer HIDES the cards, and Codex persists the draft across restarts. Clear the composer and re-sample; this is not a theming failure.'
            : onHome ? '  => on the home screen with an empty composer and still no cards: investigate.'
                     : '  => not the home screen; cards exist only there.');
      } else {
        const cs = getComputedStyle(cards[0]);
        cardHairline = cards.length + ' card(s); ring-color=' + (cs.getPropertyValue('--tw-ring-color').trim() || '(unset)') +
          '  border-width=' + cs.borderTopWidth + ' (0px expected on Electron)' +
          '  bg=' + cs.backgroundColor;
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
      const monoRegions = [];
      const SCAN_BUDGET = 4000;
      let scanned = 0;
      let scanTruncated = false;
      for (const el of document.querySelectorAll('div, section, main, table, pre, code')) {
        if (++scanned > SCAN_BUDGET) { scanTruncated = true; break; }
        const r = el.getBoundingClientRect();
        if (r.width < 200 || r.height < 60) continue;
        const ecs = getComputedStyle(el);
        const fam = ecs.fontFamily || '';
        if (!/Monaspace|monospace|Consolas|Menlo/i.test(fam)) continue;
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
      const codeRegions = monoRegions.length
        ? monoRegions.map((m) => m.line)
        : [scanTruncated
            ? 'none found, but the scan hit its ' + SCAN_BUDGET + '-element budget — INCONCLUSIVE, not a negative result'
            : 'no mono-rendered block >=200x60 anywhere on this screen (' + scanned + ' elements scanned; no diff/terminal/code view open — not a finding)'];

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
 * Set CDX_VERIFY_AT=<ms> to take a second reading after the app has settled.
 * That is the one that tells you whether the theme reached what Codex paints.
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
function verifySchedule() {
  const raw = process.env.CDX_VERIFY_AT;
  if (!raw) return [];
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
  return parsed;
}

function scheduleSettledVerification(webContents) {
  const offsets = verifySchedule();
  if (!offsets.length) return;
  for (const ms of offsets) {
    setTimeout(() => {
      if (webContents.isDestroyed()) return;
      log(`settled token re-check on webContents#${webContents.id} (+${ms}ms):`);
      reportRootEnvironment(webContents);
    }, ms);
  }
}

async function reportLandmarks(webContents) {
  await reportRootEnvironment(webContents);
  try {
    const results = await webContents.executeJavaScript(buildLandmarkProbeScript(), true);
    results.forEach((result, i) => {
      const declared = DECLARED_LANDMARKS[i];
      if (result.count > 0) {
        log(`  landmark PRESENT: ${declared.name}  (${result.count} match${result.count === 1 ? '' : 'es'})`);
      } else if (result.count === 0) {
        log(`  landmark MISSING: ${declared.name}  (selector "${declared.selector}" matched nothing)`);
      } else {
        log(`  landmark PROBE ERROR: ${declared.name}  (invalid selector "${declared.selector}")`);
      }
    });
  } catch (err) {
    log(`  landmark probe FAILED: ${err.message}`);
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

async function applyTheme(webContents, css) {
  const label = `webContents#${webContents.id}`;
  const bytes = Buffer.byteLength(css, 'utf8');

  try {
    await webContents.insertCSS(css, { cssOrigin: 'user' });
    log(`injected OK via insertCSS on ${label} — ${bytes} bytes`);
    await reportLandmarks(webContents);
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
    await reportLandmarks(webContents);
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

function attachToWindow(win, css) {
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

  wc.on('dom-ready', () => {
    log(`dom-ready on ${label} (url=${wc.getURL()})`);
    applyTheme(wc, css);
  });

  wc.on('did-navigate', (_event, url) => {
    log(`did-navigate on ${label} -> ${url}`);
    applyTheme(wc, css);
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    log(`did-navigate-in-page on ${label} -> ${url}`);
    applyTheme(wc, css);
  });
}

function start() {
  log('preload loaded into main process');

  let css;
  try {
    const themePath = resolveThemePath();
    css = loadThemeCss(themePath);
    log(`theme CSS loaded from ${themePath} (${Buffer.byteLength(css, 'utf8')} bytes)`);
  } catch (err) {
    // Cannot theme without CSS. Degrade: log loudly, attach nothing, let
    // Codex run completely stock and functional.
    log(`STARTUP FAILED, running stock/unthemed: ${err.message}`);
    return;
  }

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

    log(`process.versions: ${JSON.stringify(process.versions)}`);

    const attach = () => {
      app.on('browser-window-created', (_event, win) => {
        log(`browser-window-created (webContents#${win.webContents.id})`);
        attachToWindow(win, css);
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

module.exports = { start, DECLARED_LANDMARKS };
