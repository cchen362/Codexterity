'use strict';

/**
 * Codexterity — a webContents-shaped adapter over one attached CDP page session
 * (Plan 0005 M1)
 * -------------------------------------------------------------------------------
 * The plan's design section is explicit about why this adapter exists: so
 * `reportLandmarkVerdicts()` (injector/core/landmarks.js) and
 * `reportRootEnvironment()` (injector/core/root-environment.js) run
 * UNCHANGED against a page reached over CDP, exactly as they already run
 * against a real Electron `webContents`. Both of those modules only ever
 * call `.getURL()` and `.executeJavaScript(script, awaitPromise)` on the
 * object they are given — they do not know or care whether it is backed by
 * Electron's IPC or by `Runtime.evaluate` over a websocket. Duck typing, not
 * a shared base class, is the whole contract.
 *
 * `executeJavaScript(script)` maps to `Runtime.evaluate` with
 * `awaitPromise: true` (so a script's own returned Promise, e.g.
 * reportRootEnvironment's async IIFE, is awaited before this resolves — the
 * same behaviour Electron's `executeJavaScript(script, true)` gives) and
 * `returnByValue: true` (so the result comes back as plain JSON rather than
 * a remote-object handle the caller would then have to resolve separately).
 * A `Runtime.evaluate` call can "succeed" at the protocol level while the
 * evaluated expression itself threw — that failure surfaces in
 * `result.exceptionDetails`, not in a rejected `send()` — so this adapter
 * checks for it explicitly and rejects with an Error carrying the
 * exception's own text, which is what lets a caller's `.catch` read a
 * meaningful message instead of silently getting `undefined` back.
 */

/**
 * True only for a `page`-type CDP target whose URL is Codex's own `app://`
 * scheme. Plan fact 7, measured 2026-09-26: Codex's `/json` list includes,
 * alongside the app's own windows, a `webview` target for an inline
 * visualization sandbox and another `webview` target for a `chatgpt.com`
 * checkout page — third-party content the theme must never reach into, and
 * exactly the reason this filter exists rather than "attach to everything
 * `/json` lists". `type` is checked before `url` so a same-origin `webview`
 * (which could coincidentally carry an `app://` URL) is still excluded by
 * type alone.
 */
function isCodexPageTarget(targetInfo) {
  if (!targetInfo || targetInfo.type !== 'page') return false;
  return typeof targetInfo.url === 'string' && targetInfo.url.startsWith('app://');
}

/**
 * @param {object} options
 * @param {import('./cdp-client.js').CdpConnection} options.client - the
 *   browser-level connection this page's session was attached over.
 * @param {string} options.sessionId - the flat-session id from
 *   `Target.attachToTarget`'s result, used to route every command to this
 *   specific page rather than the browser endpoint.
 * @param {string} options.targetId - the CDP target id, kept for logging and
 *   for matching `Target.targetDestroyed` events to this adapter.
 * @param {string} options.url - the target's URL at attach time. `getURL()`
 *   returns this cached value rather than re-querying the target on every
 *   call: landmarks.js's `isSecondaryWindowUrl()` only needs the URL the
 *   target was IDENTIFIED with (D-0001-33's "is this the app shell or an
 *   overlay" question is decided at attach time, not per-probe), and the
 *   attacher updates this via `updateUrl()` on a real navigation instead of
 *   this adapter re-fetching it out of band.
 */
function createPageAdapter({ client, sessionId, targetId, url }) {
  let currentUrl = url;
  return {
    id: targetId,
    sessionId,
    getURL() {
      return currentUrl;
    },
    updateUrl(newUrl) {
      currentUrl = newUrl;
    },
    async executeJavaScript(script) {
      const result = await client.send(
        'Runtime.evaluate',
        {
          expression: script,
          awaitPromise: true,
          returnByValue: true,
        },
        sessionId
      );
      if (result && result.exceptionDetails) {
        const details = result.exceptionDetails;
        const message =
          (details.exception && (details.exception.description || details.exception.value)) ||
          details.text ||
          'unknown Runtime.evaluate exception';
        throw new Error(`executeJavaScript threw: ${message}`);
      }
      return result && result.result ? result.result.value : undefined;
    },
  };
}

module.exports = { createPageAdapter, isCodexPageTarget };
