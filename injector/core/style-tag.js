'use strict';

/**
 * Codexterity — the style-tag injection script (Plan 0005 M1)
 * -------------------------------------------------------------
 * `buildStyleTagScript(css)` MOVED here out of injector/core/inject.js
 * verbatim, with its governing comment, because Plan 0005 M1 adds a second
 * entry point (injector/attach-cdp.js) that needs the exact same script —
 * CDP's `Runtime.evaluate`/`Page.addScriptToEvaluateOnNewDocument` and
 * Electron's `webContents.executeJavaScript` both just run a string of
 * JavaScript in the renderer, so the script itself does not know or care
 * which route delivered it. Per docs/ENGINEERING.md's file conventions, a
 * shared behaviour gets one module both entry points require, never a copy
 * that can drift.
 *
 * D-0001-1 (amended 2026-08-01) — THE FALLBACK INJECTION ROUTE, pre-OWL
 * history: insertCSS() was attempted first only because it is the cleaner
 * API where it works; on every Electron fork measured through 2026-08, it
 * always threw, and THIS style-tag route was what actually applied the
 * theme. Gate 0 measured that; docs/DECISIONS.md records it.
 *
 * D-0004-2 (Plan 0004 M1/M2, measured 2026-09-23) — THIS CHANGED ON OWL.
 * Against Codex `26.917`'s OWL runtime, `insertCSS(css, {cssOrigin:'user'})`
 * SUCCEEDS (logs "injected OK via insertCSS" — see inject.js's applyTheme()),
 * so this style-tag function is the FALLBACK on that route, exercised only
 * if insertCSS itself throws. The origin argument stops being a detail once
 * insertCSS works: `cssOrigin: 'user'` inserts a USER-origin stylesheet, and
 * per the CSS cascade a user-origin declaration beats an author-origin one
 * only when it carries `!important` — an ordinary user-origin rule does NOT
 * automatically out-rank an unmarked author rule the way this file's older
 * "later wins at equal specificity" reasoning assumed. This style-tag
 * route, by contrast, is AUTHOR origin, same as Codex's own rules.
 * Specificity is also no longer the load-bearing argument for either route:
 * Codex's OWL-era token blocks are zero-specificity `:where(...)` rules
 * inside `@layer theme` (docs/research/owl-token-inventory.md), so an
 * unlayered author rule already beats them by layer order regardless of
 * specificity, and a user-origin rule beats them regardless of layer or
 * specificity, PROVIDED it is `!important` for the user-origin case. The
 * emitter marks every declaration `!important` precisely so the same
 * stylesheet wins by whichever route actually applies.
 *
 * Plan 0005 M1 — over CDP there is no insertCSS() equivalent reachable from
 * outside the renderer: `Page.addScriptToEvaluateOnNewDocument` runs a
 * script in the page, so this style-tag route is the ONLY route the CDP
 * attacher has. That is consistent with the design above, not a new
 * mechanism — the CDP attacher simply never gets to try insertCSS first.
 *
 * Appends (or replaces) a single <style> element. Two properties this
 * relies on, both measured rather than assumed:
 *   - Author origin, not user origin — see D-0004-2 above.
 *   - A DOM node can be removed by the app's own re-rendering, where an
 *     inserted stylesheet cannot. The stable id makes re-application
 *     idempotent, which is what lets both inject.js (on dom-ready/navigate)
 *     and attach-cdp.js (on Page.frameNavigated) call this repeatedly and
 *     safely.
 */
function buildStyleTagScript(css) {
  return `
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
}

module.exports = { buildStyleTagScript };
