'use strict';

/**
 * Codexterity — throwaway Codex driver for the Plan 0004 inventory
 * ---------------------------------------------------------------------
 * WHAT THIS IS
 *
 * A `NODE_OPTIONS=--require` preload (same mechanism as injector/core/inject.js,
 * D-0001-1: no debug port) that runs inside a SEPARATE, throwaway Codex
 * instance started by ../inventory/run-inventory.mjs on a temporary
 * `--user-data-dir`. It never touches the owner's own running Codex, and
 * because the instance runs on a brand-new profile it never reads
 * ~/.codex/auth.json, ~/.codex/.credentials.json, or any real credential
 * (D-0001-3 — non-destructive by construction: this module reads DOM state
 * and calls only the official webContents/Menu APIs; it writes nothing but
 * the inventory report files under CDX_INVENTORY_OUT).
 *
 * It steps the instance through a fixed list of screens — codex-home,
 * codex-thread, codex-thread-links, codex-terminal, codex-diff,
 * chatgpt-chat-home, chatgpt-work-home, chatgpt-conversation,
 * chatgpt-work-thread, chatgpt-images, overlay-mode-menu — in dark and light
 * mode (overlay-mode-menu is dark only), runs the existing live inventory
 * probe (injector/core/probe.js) on each, saves a screenshot, and quits. See
 * docs/plans/0004-codex-owl-token-remap.md, M1–M3.
 *
 * HARD SAFETY RULES — do not relax these when editing this file:
 *   - Never type text into anything, never press Enter.
 *   - Never click send/submit/voice/microphone/"Approve for me"/model
 *     pickers/settings.
 *   - Never archive, pin, or delete anything.
 *   - The ONLY clicks this driver performs are: the "Switch mode" button and
 *     its two menu items; the Chat/Work home toggle; the "New chat" nav
 *     item; a Codex thread row's text area (never its Pin/Archive buttons);
 *     the sidebar nav item whose trimmed text is exactly "Images"; a
 *     ChatGPT-mode conversation row's text area at x-fraction 0.3 (never its
 *     Pin/Archive buttons); the turn-diff file-row button; and the
 *     review-panel diff-header button.
 *   - The ONLY application-menu items ever invoked are "Open Terminal",
 *     "Toggle Bottom Panel" and "Toggle Review Panel", via
 *     `MenuItem.click(undefined, win, wc)` — never any other menu item, and
 *     never a menu item reached any other way.
 *   - A global 12-minute safety timeout calls app.quit() no matter what
 *     state the driver is in.
 *   - A scenario whose setup cannot be verified is recorded FAILED with a
 *     reason and its probes are skipped — never caught-and-ignored, and
 *     never allowed to abort the whole run (project rule: fail loudly).
 *   - The Codex vs ChatGPT app-mode choice is SHARED with the owner's real
 *     Codex — it is account/Codex-side state, not part of this throwaway
 *     --user-data-dir profile (measured: a brand-new profile still started
 *     in ChatGPT mode, left over from an earlier scouting run). Restore
 *     ALWAYS returns the app mode to whatever was observed at the START of
 *     this run (manifest.facts.initialAppMode), never to a hardcoded mode,
 *     and closes any terminal/review panel left open before restoring.
 *
 * AMBIGUITY NOTE: the brief does not say whether a synthetic click via
 * sendInputEvent needs the target window focused first. It has not been
 * exercised against a real Codex window; if clicks land but do nothing,
 * focusing the BrowserWindow (win.focus()) before each click is the first
 * thing to try.
 */

const fs = require('fs');
const path = require('path');

const PROBE_PATH = path.join(__dirname, '..', '..', 'injector', 'core', 'probe.js');
const { runProbe } = require(PROBE_PATH);

// ---------------------------------------------------------------------------
// Pure helpers — no Electron, so these are exercised by `node --check` and by
// tests/inventory/driver-preload.test.js.
// ---------------------------------------------------------------------------

/**
 * True only for the app's main window: `app://-/index.html` with no
 * `initialRoute` query param. Other windows (avatar overlay, detached
 * windows, …) must be ignored (Plan 0004 M1 instructions).
 */
function isMainWindowUrl(url) {
  if (!url) return false;
  const qIndex = url.indexOf('?');
  const base = qIndex === -1 ? url : url.slice(0, qIndex);
  const query = qIndex === -1 ? '' : url.slice(qIndex);
  return base === 'app://-/index.html' && query.indexOf('initialRoute=') === -1;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `predicateFn` (which may be async) every `intervalMs` (default
 * 500ms) until it returns a truthy value or `timeoutMs` elapses, resolving
 * to whatever the last call returned. Shared by every wait-for-DOM-state
 * spot in this file instead of each scenario hand-rolling its own loop.
 */
async function pollUntil(predicateFn, timeoutMs, intervalMs) {
  const interval = intervalMs || 500;
  const started = Date.now();
  let result = await predicateFn();
  while (!result && Date.now() - started < timeoutMs) {
    await sleep(interval);
    result = await predicateFn();
  }
  return result;
}

/**
 * Pure viewport-bounds check for a computed click point. Orchestrator QA fix
 * (Plan 0004 M3): a below-the-fold sidebar row (e.g. ChatGPT's "Recents"
 * list on a tall sidebar) resolves to real DOM coordinates that sit outside
 * the window's own viewport, so sendInputEvent silently lands nowhere. Used
 * to refuse a click rather than fire one blind.
 */
function isPointInViewport(point, viewportWidth, viewportHeight) {
  return !!(
    point &&
    typeof point.x === 'number' &&
    typeof point.y === 'number' &&
    typeof viewportWidth === 'number' &&
    typeof viewportHeight === 'number' &&
    point.x >= 0 &&
    point.x < viewportWidth &&
    point.y >= 0 &&
    point.y < viewportHeight
  );
}

/**
 * Recursive finder over a plain `{ items: [{ label, submenu: { items } }] }`
 * shape — the same shape both a real `electron.Menu` and a plain test
 * fixture expose. Returns the FIRST matching item in document order (a
 * shallower/earlier match always wins over a deeper one found later), or
 * null. Pure — no Electron dependency — so it is unit-tested directly.
 */
function findMenuItemByLabel(menuLike, label) {
  if (!menuLike || !menuLike.items) return null;
  for (const item of menuLike.items) {
    if (item.label === label) return item;
  }
  for (const item of menuLike.items) {
    if (item.submenu) {
      const found = findMenuItemByLabel(item.submenu, label);
      if (found) return found;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// In-page finder expressions. Each is a STRING of a JS expression that,
// evaluated in the page, returns an Element (or value) or null/false. Built
// by string concatenation (never nested template literals) so there is no
// backtick-escaping hazard when they are spliced into the wrapping eval
// script below.
// ---------------------------------------------------------------------------

/**
 * Finds a `.app-shell-left-panel` nav item (a, button, [role="button"] or
 * .sidebar-item) whose trimmed text is exactly `target`. Used for "New
 * chat" and "Images" — both are plain nav rows, not conversation rows.
 */
function sidebarNavItemExpr(target) {
  return (
    '(function(){' +
    'var target = ' + JSON.stringify(target) + ';' +
    'var panel = document.querySelector(".app-shell-left-panel");' +
    'if (!panel) return null;' +
    'var candidates = panel.querySelectorAll(\'a, button, [role="button"], .sidebar-item\');' +
    'for (var i = 0; i < candidates.length; i++) {' +
    'if ((candidates[i].textContent || "").trim() === target) return candidates[i];' +
    '}' +
    'return null;' +
    '})()'
  );
}

// `[aria-label="New chat"]` alone resolves to the WRONG element — scouted
// against a real window, it matched something at (311,1581) with empty
// text on a ~1600px-tall window, nowhere near the sidebar nav item. Scope
// the search to the left sidebar panel and require an exact trimmed-text
// match on an actually clickable element, falling back to null (scenario
// FAILED) rather than clicking whatever else in the DOM happens to carry
// that aria-label.
const NEW_CHAT_EXPR = sidebarNavItemExpr('New chat');

const SWITCH_MODE_EXPR =
  'document.querySelector(\'[aria-label^="Switch mode, current mode: "]\')';

/**
 * The mode-switch popup lists both "ChatGPT" / "Create, learn, and explore"
 * and "Codex" / "Build, debug, and ship". We want the smallest (most
 * specific / deepest) element whose trimmed text STARTS WITH the target
 * name, searched among elements inside the popup containers — never the
 * container itself if that container's text merely happens to start with
 * the target while also holding the other item.
 */
function pickMenuItemExpr(target) {
  return (
    '(function(){' +
    'var target = ' + JSON.stringify(target) + ';' +
    'var containers = document.querySelectorAll(' +
    '\'[data-radix-popper-content-wrapper], [role="menu"], [role="menuitem"], [role="menuitemradio"], [role="option"]\'' +
    ');' +
    'var best = null, bestCount = Infinity;' +
    'containers.forEach(function(root){' +
    'var all = root.querySelectorAll("*");' +
    'var candidates = [root].concat(Array.prototype.slice.call(all));' +
    'candidates.forEach(function(el){' +
    'var text = (el.textContent || "").trim();' +
    'if (text.indexOf(target) === 0) {' +
    'var count = el.querySelectorAll("*").length;' +
    'if (count < bestCount) { bestCount = count; best = el; }' +
    '}' +
    '});' +
    '});' +
    'return best;' +
    '})()'
  );
}

/** Every sidebar row that is a real conversation (carries a Pin/Archive action), as an array. */
const THREAD_ROWS_ARRAY_EXPR =
  '(function(){' +
  'return Array.prototype.filter.call(document.querySelectorAll(".sidebar-item"), function(row){' +
  'return !!(row.querySelector(\'[aria-label="Pin chat"]\') || row.querySelector(\'[aria-label="Archive chat"]\'));' +
  '});' +
  '})()';

/** Wraps a collection expression, returning its element at `index` or null. */
function nthElementExpr(collectionExpr, index) {
  return (
    '(function(){' +
    'var list = ' + collectionExpr + ';' +
    'return (list && list[' + index + ']) || null;' +
    '})()'
  );
}

/** The first sidebar row that is a real thread (carries a Pin/Archive action). */
const THREAD_ROW_EXPR = nthElementExpr(THREAD_ROWS_ARRAY_EXPR, 0);

/**
 * Finds the first thread row whose Work-badge state matches `hasWork`: a
 * Work row contains a LEAF element (no element children) whose trimmed text
 * is exactly "Work"; a Chat row contains no such leaf (Plan 0004 M3
 * measured facts).
 */
function firstThreadRowByWorkBadgeExpr(hasWork) {
  const want = hasWork ? 'true' : 'false';
  return (
    '(function(){' +
    'var rows = ' + THREAD_ROWS_ARRAY_EXPR + ';' +
    'for (var i = 0; i < rows.length; i++) {' +
    'var row = rows[i];' +
    'var all = row.querySelectorAll("*");' +
    'var hasBadge = false;' +
    'for (var j = 0; j < all.length; j++) {' +
    'var el = all[j];' +
    'if (el.children.length === 0 && (el.textContent || "").trim() === "Work") { hasBadge = true; break; }' +
    '}' +
    'if (hasBadge === ' + want + ') return row;' +
    '}' +
    'return null;' +
    '})()'
  );
}

/** Same search as firstThreadRowByWorkBadgeExpr, but returns the row's INDEX into THREAD_ROWS_ARRAY_EXPR (or -1), so a caller can click and later re-verify the SAME row by index. */
function firstThreadRowIndexByWorkBadgeExpr(hasWork) {
  const want = hasWork ? 'true' : 'false';
  return (
    '(function(){' +
    'var rows = ' + THREAD_ROWS_ARRAY_EXPR + ';' +
    'for (var i = 0; i < rows.length; i++) {' +
    'var row = rows[i];' +
    'var all = row.querySelectorAll("*");' +
    'var hasBadge = false;' +
    'for (var j = 0; j < all.length; j++) {' +
    'var el = all[j];' +
    'if (el.children.length === 0 && (el.textContent || "").trim() === "Work") { hasBadge = true; break; }' +
    '}' +
    'if (hasBadge === ' + want + ') return i;' +
    '}' +
    'return -1;' +
    '})()'
  );
}

/**
 * Whether THREAD_ROWS_ARRAY_EXPR's element at `index` (re-queried fresh, not
 * cached) carries the active-thread marker. Orchestrator QA fix (Plan 0004
 * M3): checking "some row is active" is true the instant a PREVIOUS
 * scenario's thread is still open, so a fresh click must be verified against
 * the SPECIFIC row it clicked, by index into the same filtered list the
 * click itself used — never "any row".
 */
/**
 * Orchestrator QA fix #2 (Plan 0004 M3): a chatgpt-conversation run against
 * a real Recents row measured that Codex's active marker is NOT reliably
 * `data-app-action-sidebar-thread-active="true"` on the row itself for
 * every row type — it (or `aria-current="page"`) may sit on the row, on a
 * descendant, or on the row's own closest `[role="button"]`/`[data-theme]`
 * ancestor instead. A row counts as active if ANY of those three places
 * carries either marker.
 */
function rowAtIndexActiveExpr(index) {
  return (
    '(function(){' +
    'var row = ' + nthElementExpr(THREAD_ROWS_ARRAY_EXPR, index) + ';' +
    'if (!row) return false;' +
    'function isActive(el) {' +
    'return el.getAttribute("data-app-action-sidebar-thread-active") === "true" || el.getAttribute("aria-current") === "page";' +
    '}' +
    'if (isActive(row)) return true;' +
    'var descendants = row.querySelectorAll("*");' +
    'for (var i = 0; i < descendants.length; i++) { if (isActive(descendants[i])) return true; }' +
    'var ancestor = row.closest(\'[role="button"], [data-theme]\');' +
    'if (ancestor && isActive(ancestor)) return true;' +
    'return false;' +
    '})()'
  );
}

/**
 * Orchestrator QA fix #2 (Plan 0004 M3): recorded, not merely logged, when a
 * row-open verification fails — the clicked row's own attributes and those
 * of its first 3 descendants carrying any attribute other than `class`, the
 * main pane's header title (first element outside the sidebar with
 * top<90px and non-empty own text, 80 chars), the current app-mode label,
 * and whether the home-mode toggle is present. `rowIndex` may be -1/null
 * when no specific row was ever resolved (e.g. the Work-badge search itself
 * came up empty) — `rowAttrs`/`descendants` then come back null/[].
 */
function buildRowDiagnosticsScript(rowIndex) {
  const index = typeof rowIndex === 'number' && rowIndex >= 0 ? rowIndex : -1;
  return (
    '(function(){' +
    'function attrsOf(el) {' +
    'var out = {};' +
    'for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; out[a.name] = String(a.value).slice(0, 120); }' +
    'return out;' +
    '}' +
    'var row = ' + (index === -1 ? 'null' : nthElementExpr(THREAD_ROWS_ARRAY_EXPR, index)) + ';' +
    'var rowAttrs = row ? attrsOf(row) : null;' +
    'var descendants = [];' +
    'if (row) {' +
    'var all = row.querySelectorAll("*");' +
    'for (var di = 0; di < all.length && descendants.length < 3; di++) {' +
    'var attrs = attrsOf(all[di]);' +
    'var keys = Object.keys(attrs).filter(function (k) { return k !== "class"; });' +
    'if (keys.length) descendants.push({ tag: all[di].tagName, attrs: attrs });' +
    '}' +
    '}' +
    'var panel = document.querySelector(".app-shell-left-panel");' +
    'var headerTitle = null;' +
    'var candidates = document.querySelectorAll("*");' +
    'for (var hi = 0; hi < candidates.length; hi++) {' +
    'var hEl = candidates[hi];' +
    'if (panel && panel.contains(hEl)) continue;' +
    'var hr = hEl.getBoundingClientRect();' +
    'if (hr.top < 0 || hr.top >= 90) continue;' +
    'var ownText = "";' +
    'for (var ci = 0; ci < hEl.childNodes.length; ci++) {' +
    'var child = hEl.childNodes[ci];' +
    'if (child.nodeType === 3 && child.textContent && child.textContent.trim()) ownText += child.textContent;' +
    '}' +
    'if (ownText.trim()) { headerTitle = ownText.trim().slice(0, 80); break; }' +
    '}' +
    'var modeBtn = ' + SWITCH_MODE_EXPR + ';' +
    'var appModeLabel = modeBtn ? modeBtn.getAttribute("aria-label") : null;' +
    'var homeModeTogglePresent = document.querySelector(\'[class*="home-mode-toggle"]\') !== null;' +
    'return {' +
    'rowAttrs: rowAttrs,' +
    'descendants: descendants,' +
    'headerTitle: headerTitle,' +
    'appModeLabel: appModeLabel,' +
    'homeModeTogglePresent: homeModeTogglePresent' +
    '};' +
    '})()'
  );
}

function homeToggleButtonExpr(target) {
  return (
    '(function(){' +
    'var target = ' + JSON.stringify(target) + ';' +
    'var scope = document.querySelector(\'[class*="home-mode-toggle"]\');' +
    'if (!scope) return null;' +
    'var btns = scope.querySelectorAll("button");' +
    'for (var i = 0; i < btns.length; i++) {' +
    'if ((btns[i].textContent || "").trim() === target) return btns[i];' +
    '}' +
    'return null;' +
    '})()'
  );
}

const HOME_HEADING_EXPR =
  '(function(){' +
  'var h = document.querySelector("h1");' +
  'return h ? (h.textContent || "").trim() : null;' +
  '})()';

// Thread-open verification. Codex's router does NOT change
// location.pathname when a thread opens (measured: it stayed "/index.html"
// after clicking a real thread row) — pathname is kept only as recorded
// evidence, never the pass criterion. The real signal is the clicked row
// gaining the active marker and the home empty-state heading disappearing.
const THREAD_ACTIVE_EXPR =
  '(function(){' +
  'var rows = document.querySelectorAll(".sidebar-item");' +
  'for (var i = 0; i < rows.length; i++) {' +
  'var r = rows[i];' +
  'if (r.getAttribute("data-app-action-sidebar-thread-active") === "true" || ' +
  'r.getAttribute("aria-current") === "page") return true;' +
  '}' +
  'return false;' +
  '})()';

const HOME_EMPTY_STATE_TEXT = 'What should we build';

const HOME_EMPTY_STATE_GONE_EXPR =
  '(function(){' +
  'var text = ' + JSON.stringify(HOME_EMPTY_STATE_TEXT) + ';' +
  'var headings = document.querySelectorAll("h1, h2, .heading-xl, .heading-2xl");' +
  'for (var i = 0; i < headings.length; i++) {' +
  'if ((headings[i].textContent || "").indexOf(text) !== -1) return false;' +
  '}' +
  'return true;' +
  '})()';

/** The ChatGPT-mode home toggle is present only on the home screen; absent once a conversation is open. */
const HOME_TOGGLE_ABSENT_EXPR =
  '(function(){ return document.querySelector(\'[class*="home-mode-toggle"]\') === null; })()';

/** The first `a[href^="http"]` outside `.app-shell-left-panel`, or null. */
const FIRST_EXTERNAL_LINK_EXPR =
  '(function(){' +
  'var panel = document.querySelector(".app-shell-left-panel");' +
  'var links = document.querySelectorAll(\'a[href^="http"]\');' +
  'for (var i = 0; i < links.length; i++) {' +
  'if (!panel || !panel.contains(links[i])) return links[i];' +
  '}' +
  'return null;' +
  '})()';

const EXTERNAL_LINK_PRESENT_EXPR = '(' + FIRST_EXTERNAL_LINK_EXPR + ') !== null';

/** Whether `.xterm-rows` exists and has a non-zero rect. */
const XTERM_ROWS_VISIBLE_EXPR =
  '(function(){' +
  'var el = document.querySelector(".xterm-rows");' +
  'if (!el) return false;' +
  'var r = el.getBoundingClientRect();' +
  'return r.width > 0 && r.height > 0;' +
  '})()';

/** The nearest ancestor of `.xterm` (other than <html>) carrying its own `[data-theme]`, or null. */
function terminalMountedUnderExpr() {
  return (
    '(function(){' +
    'var el = document.querySelector(".xterm");' +
    'if (!el) return null;' +
    'for (var node = el; node; node = node.parentElement) {' +
    'if (node !== document.documentElement && node.hasAttribute("data-theme")) return node.getAttribute("data-theme");' +
    '}' +
    'return null;' +
    '})()'
  );
}

/** The first turn-diff file-row's own button, inside a Codex thread's inline diff card. */
const DIFF_ROW_BUTTON_EXPR =
  '(function(){' +
  'var rows = document.querySelectorAll(\'[class*="group/turn-diff-file-row"]\');' +
  'for (var i = 0; i < rows.length; i++) {' +
  'var b = rows[i].querySelector("button");' +
  'if (b) return b;' +
  '}' +
  'return null;' +
  '})()';

const DIFF_ROW_BUTTON_PRESENT_EXPR = '(' + DIFF_ROW_BUTTON_EXPR + ') !== null';

/** Whether the Review side panel's `[class*="group/diff-header"]` is present with a non-zero rect. */
const DIFF_HEADER_VISIBLE_EXPR =
  '(function(){' +
  'var el = document.querySelector(\'[class*="group/diff-header"]\');' +
  'if (!el) return false;' +
  'var r = el.getBoundingClientRect();' +
  'return r.width > 0 && r.height > 0;' +
  '})()';

/** The diff-header's own expand button — class starts "min-w-0 cursor-interaction truncate text-start". */
const DIFF_HEADER_BUTTON_EXPR =
  '(function(){' +
  'var header = document.querySelector(\'[class*="group/diff-header"]\');' +
  'if (!header) return null;' +
  'var btns = header.querySelectorAll("button");' +
  'var prefix = "min-w-0 cursor-interaction truncate text-start";' +
  'for (var i = 0; i < btns.length; i++) {' +
  'var cls = btns[i].getAttribute("class") || "";' +
  'if (cls.indexOf(prefix) === 0) return btns[i];' +
  '}' +
  'return null;' +
  '})()';

/** Whether any open shadow root on the page contains an expanded diff change line. */
const SHADOW_CHANGE_LINE_PRESENT_EXPR =
  '(function(){' +
  'var all = document.querySelectorAll("*");' +
  'for (var i = 0; i < all.length; i++) {' +
  'var sr = all[i].shadowRoot;' +
  'if (sr && sr.querySelectorAll(\'[data-line-type^="change-"]\').length) return true;' +
  '}' +
  'return false;' +
  '})()';

/** The nearest ancestor of the first diff shadow-root HOST (other than <html>) carrying `[data-theme]`, or null. */
function diffMountedUnderExpr() {
  return (
    '(function(){' +
    'var all = document.querySelectorAll("*");' +
    'for (var i = 0; i < all.length; i++) {' +
    'var sr = all[i].shadowRoot;' +
    'if (sr && sr.querySelector("[data-line-type]")) {' +
    'for (var node = all[i]; node; node = node.parentElement) {' +
    'if (node !== document.documentElement && node.hasAttribute("data-theme")) return node.getAttribute("data-theme");' +
    '}' +
    'return null;' +
    '}' +
    '}' +
    'return null;' +
    '})()'
  );
}

/**
 * Sets `<html data-theme>` to `theme` AND rewrites `data-theme` to the same
 * value on every OTHER element that already carries one. Measured (owner
 * addendum, Plan 0004 M3): Codex writes its own `data-theme` on some INNER
 * elements too (the terminal panel container, a composer container), driven
 * from its own app state — a real mode switch would rewrite those, but this
 * driver's setTheme() previously only touched <html>, so those subtrees sat
 * stale in the old mode after a synthetic switch. Returns the resulting
 * `<html>` value plus how many inner scopes were rewritten, so the caller
 * can log it as a fact.
 */
function setThemeScript(theme) {
  const themeJson = JSON.stringify(theme);
  return (
    '(function(){' +
    'document.documentElement.dataset.theme = ' + themeJson + ';' +
    'var innerCount = 0;' +
    'var scopedEls = document.querySelectorAll("[data-theme]");' +
    'for (var i = 0; i < scopedEls.length; i++) {' +
    'var el = scopedEls[i];' +
    'if (el === document.documentElement) continue;' +
    'el.setAttribute("data-theme", ' + themeJson + ');' +
    'innerCount++;' +
    '}' +
    'return { theme: document.documentElement.dataset.theme, innerScopesRewritten: innerCount };' +
    '})()'
  );
}

/** Whether a heading OUTSIDE the sidebar has trimmed text exactly "Images". */
const IMAGES_HEADING_PRESENT_EXPR =
  '(function(){' +
  'var panel = document.querySelector(".app-shell-left-panel");' +
  'var candidates = document.querySelectorAll(\'h1, h2, [class*="heading"]\');' +
  'for (var i = 0; i < candidates.length; i++) {' +
  'var el = candidates[i];' +
  'if (panel && panel.contains(el)) continue;' +
  'if ((el.textContent || "").trim() === "Images") return true;' +
  '}' +
  'return false;' +
  '})()';

// ---------------------------------------------------------------------------
// Plan 0004 M2/M3 — the in-page "theme check" script, run in EVERY run (Plan
// 0004 M3: theme-check-<tag>.json is now written in stock runs too, not only
// --theme runs — only the painted-surface POLL, waitForThemedSurface, stays
// themed-only, since "painted" is meaningless without a theme to paint). It
// reads PAINTED values (getComputedStyle), not our own declared token
// strings, for exactly the reason probe.js's own header explains for its
// census: a resolved token is not a painted pixel.
//
// Built by string concatenation (array.join, same convention as
// killLeftoverProcesses's PowerShell script in run-inventory.mjs) rather than
// a template literal, deliberately: this file's own header already warns
// that nested backticks and unescaped regex characters inside a template
// literal silently corrupt the generated page script (see probe.js's own
// scars on this), and string concatenation has no such hazard. No regex and
// NO BACKSLASH of any kind is used in the script body below for the same
// reason — alpha/quote/join handling is done with plain string ops instead
// (see the driver-preload.test.js check that asserts zero backslashes in the
// generated script).
// ---------------------------------------------------------------------------

const THEME_CHECK_TOKENS = [
  '--app-color-background-surface',
  '--color-text-primary',
  '--app-color-background-button-primary',
  '--app-color-background-surface-under',
  '--app-color-accent-blue',
  '--color-background-composer-primary',
  '--font-sans',
  '--font-mono',
];

const THEME_CHECK_FONT_FAMILIES = ['Literata', 'Fraunces', 'Monaspace Neon'];

function buildThemeCheckScript() {
  return [
    '(async () => {',
    '  var root = document.documentElement;',
    '  var rootCs = getComputedStyle(root);',
    '  var html = {',
    '    dataTheme: root.getAttribute("data-theme") || "(unset)",',
    '    windowType: root.getAttribute("data-codex-window-type") || "(unset)"',
    '  };',
    '  var TOKENS = ' + JSON.stringify(THEME_CHECK_TOKENS) + ';',
    '  var tokens = {};',
    '  for (var ti = 0; ti < TOKENS.length; ti++) {',
    '    tokens[TOKENS[ti]] = rootCs.getPropertyValue(TOKENS[ti]).trim() || "(unset)";',
    '  }',
    // Rasterise any CSS colour Chromium accepts (oklab(), color(srgb ...),
    // etc — the OWL runtime's composited menus already measured this way in
    // probe.js) to 8-bit sRGB via a 1x1 canvas, so two colours authored in
    // different colour spaces still compare equal when they paint the same
    // pixel. Not imported from probe.js because probe.js defines this logic
    // only as a closure inside buildProbeScript(), never as an exported,
    // reusable function — there is nothing to require here.
    '  var cnv = document.createElement("canvas");',
    '  cnv.width = 1; cnv.height = 1;',
    '  var cx = cnv.getContext("2d", { willReadFrequently: true });',
    '  function rasterise(css) {',
    '    try {',
    '      cx.clearRect(0, 0, 1, 1);',
    '      cx.fillStyle = "#000000";',
    '      cx.fillRect(0, 0, 1, 1);',
    '      cx.fillStyle = css;',
    '      cx.fillRect(0, 0, 1, 1);',
    '      var d = cx.getImageData(0, 0, 1, 1).data;',
    '      return "rgb(" + d[0] + ", " + d[1] + ", " + d[2] + ")";',
    '    } catch (err) { return null; }',
    '  }',
    // Alpha, read from the raw string rather than a regex: an rgb(...) form
    // has no alpha channel (opaque); an rgba(...) form's fourth component is
    // the alpha. "transparent" is the only bare keyword getComputedStyle
    // ever returns for full transparency.
    '  function alphaOf(bg) {',
    '    if (!bg || bg === "transparent") return 0;',
    '    if (bg.indexOf("rgba(") !== 0) return 1;',
    '    var inner = bg.slice(5, bg.length - 1);',
    '    var parts = inner.split(",");',
    '    if (parts.length < 4) return 1;',
    '    var a = parseFloat(parts[3]);',
    '    return isNaN(a) ? 1 : a;',
    '  }',
    '  function firstPaintedBg(start) {',
    '    for (var el = start; el; el = el.parentElement) {',
    '      var bg = getComputedStyle(el).backgroundColor;',
    '      if (alphaOf(bg) > 0) return { el: el, background: rasterise(bg) };',
    '    }',
    '    return null;',
    '  }',
    // Fonts: document.fonts.check() alone cannot distinguish "loadable" from
    // "no such family declared at all" (both read false for a family with no
    // matching text on screen, and — per Plan 0004's own note — check() can
    // read true for an undeclared family too), so a FontFace census is taken
    // alongside it. No regex for quote-stripping — plain character checks.
    '  function unquote(s) {',
    '    var c0 = s.charCodeAt(0);',
    '    if (s.length >= 2 && (c0 === 34 || c0 === 39) && s.charCodeAt(s.length - 1) === c0) {',
    '      return s.slice(1, -1);',
    '    }',
    '    return s;',
    '  }',
    '  var FAMILIES = ' + JSON.stringify(THEME_CHECK_FONT_FAMILIES) + ';',
    '  var fonts = {};',
    '  for (var fi = 0; fi < FAMILIES.length; fi++) {',
    '    var family = FAMILIES[fi];',
    '    var checkResult = null;',
    '    try { checkResult = document.fonts.check(\'16px "\' + family + \'"\'); } catch (err) { checkResult = null; }',
    '    var faceExists = false;',
    '    var faceStatus = null;',
    '    document.fonts.forEach(function (face) {',
    '      if (!faceExists && unquote(face.family) === family) { faceExists = true; faceStatus = face.status; }',
    '    });',
    '    fonts[family] = { check: checkResult, faceExists: faceExists, faceStatus: faceStatus };',
    '  }',
    '  var W = window.innerWidth, H = window.innerHeight;',
    '  var centreEl = document.elementFromPoint(W / 2, H / 2);',
    '  var mainSurface = centreEl ? firstPaintedBg(centreEl) : null;',
    // Ink: the nearest element at the sampled point that owns visible text of
    // its own (child text node, not inherited from a descendant), same
    // "own text only" rule probe.js's floating-surface ink census uses.
    '  var inkColor = null;',
    '  if (centreEl) {',
    '    var node = centreEl;',
    '    while (node && node !== document.documentElement) {',
    '      var ownText = "";',
    '      for (var ci = 0; ci < node.childNodes.length; ci++) {',
    '        var child = node.childNodes[ci];',
    '        if (child.nodeType === 3 && child.textContent && child.textContent.trim()) ownText += child.textContent;',
    '      }',
    '      if (ownText.trim()) { inkColor = rasterise(getComputedStyle(node).color); break; }',
    '      node = node.parentElement;',
    '    }',
    '  }',
    '  var sidebarPanel = document.querySelector(".app-shell-left-panel");',
    '  var sidebar = sidebarPanel ? { background: rasterise(getComputedStyle(sidebarPanel).backgroundColor) } : null;',
    '  var activeRow = document.querySelector(\'.sidebar-item[data-app-action-sidebar-thread-active="true"]\');',
    '  var sidebarActiveRow = null;',
    '  if (activeRow) {',
    '    var b = getComputedStyle(activeRow, "::before");',
    '    sidebarActiveRow = { background: rasterise(b.backgroundColor), content: b.content };',
    '  }',
    '  var heading = document.querySelector(".heading-xl, .heading-lg, .heading-2xl, .heading-display");',
    '  var headingFontFamily = heading ? getComputedStyle(heading).fontFamily : null;',
    '  var editor = document.querySelector(".ProseMirror");',
    '  var composerSurface = null;',
    '  if (editor) {',
    '    var cur = editor.parentElement;',
    '    while (cur) {',
    '      var cbg = getComputedStyle(cur).backgroundColor;',
    '      if (alphaOf(cbg) > 0) { composerSurface = { background: rasterise(cbg) }; break; }',
    '      cur = cur.parentElement;',
    '    }',
    '  }',
    '  var bodyFontFamily = document.body ? getComputedStyle(document.body).fontFamily : null;',
    '  var titleBarTint = rootCs.getPropertyValue("--codex-titlebar-tint").trim() || "(unset)";',
    // --- Plan 0004 M3 additions --------------------------------------
    '  var updatePill = null;',
    '  var updateBtn = document.querySelector(\'button[aria-label="Update"]\');',
    '  if (updateBtn) {',
    '    var ur = updateBtn.getBoundingClientRect();',
    '    var svgEl = updateBtn.querySelector("svg");',
    '    updatePill = {',
    '      rect: { x: ur.x, y: ur.y, width: ur.width, height: ur.height },',
    '      background: rasterise(getComputedStyle(updateBtn).backgroundColor),',
    '      color: rasterise(getComputedStyle(updateBtn).color),',
    '      svgColor: svgEl ? rasterise(getComputedStyle(svgEl).color) : null',
    '    };',
    '  }',
    '  var innerThemeScopes = [];',
    '  var themedEls = document.querySelectorAll("[data-theme]");',
    '  for (var si = 0; si < themedEls.length; si++) {',
    '    var scopeEl = themedEls[si];',
    '    if (scopeEl === document.documentElement) continue;',
    '    innerThemeScopes.push({',
    '      tag: scopeEl.tagName,',
    '      value: scopeEl.getAttribute("data-theme"),',
    '      className: (scopeEl.getAttribute("class") || "").slice(0, 80)',
    '    });',
    '  }',
    '  function deepestTextColor(startEl) {',
    '    var best = null;',
    '    function ownText(node) {',
    '      var t = "";',
    '      for (var oci = 0; oci < node.childNodes.length; oci++) {',
    '        var ochild = node.childNodes[oci];',
    '        if (ochild.nodeType === 3 && ochild.textContent && ochild.textContent.trim()) t += ochild.textContent;',
    '      }',
    '      return t.trim();',
    '    }',
    '    function walk(node, depth) {',
    '      if (ownText(node)) { if (!best || depth > best.depth) best = { el: node, depth: depth }; }',
    '      for (var wci = 0; wci < node.children.length; wci++) walk(node.children[wci], depth + 1);',
    '    }',
    '    walk(startEl, 0);',
    '    return rasterise(getComputedStyle(best ? best.el : startEl).color);',
    '  }',
    '  var externalLinks = [];',
    '  var linkPanel = document.querySelector(".app-shell-left-panel");',
    '  var allLinks = document.querySelectorAll(\'a[href^="http"]\');',
    '  for (var li = 0; li < allLinks.length && externalLinks.length < 10; li++) {',
    '    var aEl = allLinks[li];',
    '    if (linkPanel && linkPanel.contains(aEl)) continue;',
    '    var lr = aEl.getBoundingClientRect();',
    '    if (lr.width <= 0 || lr.height <= 0) continue;',
    '    var linkHost = null;',
    '    try { linkHost = new URL(aEl.href).host; } catch (err) { linkHost = null; }',
    '    externalLinks.push({',
    '      host: linkHost,',
    '      text: (aEl.textContent || "").trim().slice(0, 30),',
    '      anchorColor: rasterise(getComputedStyle(aEl).color),',
    '      textColor: deepestTextColor(aEl)',
    '    });',
    '  }',
    '  var terminal = null;',
    '  var xtermRows = document.querySelector(".xterm-rows");',
    '  var xtermRowsRect = xtermRows ? xtermRows.getBoundingClientRect() : null;',
    '  if (xtermRows && xtermRowsRect && xtermRowsRect.width > 0 && xtermRowsRect.height > 0) {',
    '    var rowsCs = getComputedStyle(xtermRows);',
    '    var termBgAncestor = null;',
    '    var xtermEl = document.querySelector(".xterm");',
    '    for (var ta = xtermEl; ta; ta = ta.parentElement) {',
    '      var tbg = getComputedStyle(ta).backgroundColor;',
    '      if (alphaOf(tbg) > 0) { termBgAncestor = rasterise(tbg); break; }',
    '    }',
    '    var termHist = {};',
    '    var spanDivs = xtermRows.querySelectorAll("span, div");',
    '    for (var sd = 0; sd < spanDivs.length; sd++) {',
    '      var termColour = rasterise(getComputedStyle(spanDivs[sd]).color);',
    '      if (termColour) termHist[termColour] = (termHist[termColour] || 0) + 1;',
    '    }',
    '    var termHistEntries = [];',
    '    for (var thk in termHist) { if (termHist.hasOwnProperty(thk)) termHistEntries.push({ color: thk, count: termHist[thk] }); }',
    '    termHistEntries.sort(function (a, b) { return b.count - a.count; });',
    '    terminal = {',
    '      fontFamily: rowsCs.fontFamily,',
    '      color: rasterise(rowsCs.color),',
    '      background: termBgAncestor,',
    '      colorHistogram: termHistEntries.slice(0, 10)',
    '    };',
    '  }',
    '  var diff = null;',
    '  var diffErrors = [];',
    '  var shadowHostEl = null;',
    '  var shadowRootEl = null;',
    '  var allEls = document.querySelectorAll("*");',
    '  for (var de = 0; de < allEls.length; de++) {',
    '    var candidateSr = allEls[de].shadowRoot;',
    '    if (candidateSr && candidateSr.querySelector("[data-line-type]")) {',
    '      shadowHostEl = allEls[de];',
    '      shadowRootEl = candidateSr;',
    '      break;',
    '    }',
    '  }',
    '  if (shadowRootEl) {',
    '    var lineColors = function (sel) {',
    '      var lcEl = shadowRootEl.querySelector(sel);',
    '      if (!lcEl) return null;',
    '      var lcCs = getComputedStyle(lcEl);',
    '      return { background: rasterise(lcCs.backgroundColor), color: rasterise(lcCs.color), fontFamily: lcCs.fontFamily };',
    '    };',
    '    var preDiff = shadowRootEl.querySelector("pre[data-diff]");',
    '    var preAttrs = [];',
    '    if (preDiff) {',
    '      for (var pa = 0; pa < preDiff.attributes.length; pa++) {',
    '        var attr = preDiff.attributes[pa];',
    '        preAttrs.push(attr.name + "=" + String(attr.value).slice(0, 40));',
    '      }',
    '    }',
    '    var lineTypes = ["context", "change-addition", "change-deletion"];',
    '    var byType = {};',
    '    for (var lt = 0; lt < lineTypes.length; lt++) {',
    '      var lineType = lineTypes[lt];',
    '      var gutterRow = lineColors(\'[data-line-type="\' + lineType + \'"]\');',
    '      var contentRow = lineColors(\'[data-line][data-line-type="\' + lineType + \'"]\');',
    '      var numberEl = shadowRootEl.querySelector(\'[data-line-type="\' + lineType + \'"] [data-line-number-content]\');',
    '      byType[lineType] = {',
    '        gutter: gutterRow,',
    '        content: contentRow,',
    '        lineNumberColor: numberEl ? rasterise(getComputedStyle(numberEl).color) : null',
    '      };',
    '    }',
    '    var sepEl = shadowRootEl.querySelector(\'[data-separator="line-info"]\');',
    '    var sepColors = sepEl ? { background: rasterise(getComputedStyle(sepEl).backgroundColor), color: rasterise(getComputedStyle(sepEl).color) } : null;',
    '    var unmodEl = shadowRootEl.querySelector("[data-unmodified-lines]");',
    '    var unmodColor = unmodEl ? rasterise(getComputedStyle(unmodEl).color) : null;',
    '    var preColors = preDiff ? { background: rasterise(getComputedStyle(preDiff).backgroundColor), color: rasterise(getComputedStyle(preDiff).color) } : null;',
    '    var spanHist = {};',
    '    var spanStyles = {};',
    '    var lineSpans = shadowRootEl.querySelectorAll("[data-line] span[style]");',
    '    for (var ls = 0; ls < lineSpans.length; ls++) {',
    '      var spanColour = rasterise(getComputedStyle(lineSpans[ls]).color);',
    '      if (!spanColour) continue;',
    '      spanHist[spanColour] = (spanHist[spanColour] || 0) + 1;',
    '      if (!spanStyles[spanColour]) spanStyles[spanColour] = lineSpans[ls].getAttribute("style");',
    '    }',
    '    var spanEntries = [];',
    '    for (var sk in spanHist) { if (spanHist.hasOwnProperty(sk)) spanEntries.push({ color: sk, count: spanHist[sk], style: spanStyles[sk] }); }',
    '    spanEntries.sort(function (a, b) { return b.count - a.count; });',
    '    var shadowCssParts = [];',
    '    var styleTags = shadowRootEl.querySelectorAll("style");',
    '    for (var st = 0; st < styleTags.length; st++) shadowCssParts.push(styleTags[st].textContent || "");',
    '    var adopted = shadowRootEl.adoptedStyleSheets || [];',
    '    for (var as = 0; as < adopted.length; as++) {',
    '      try {',
    '        var sheetRules = adopted[as].cssRules;',
    '        for (var ri = 0; ri < sheetRules.length; ri++) shadowCssParts.push(sheetRules[ri].cssText);',
    '      } catch (err) { diffErrors.push("adoptedStyleSheets[" + as + "]: " + err.message); }',
    '    }',
    '    diff = {',
    '      hostTag: shadowHostEl.tagName,',
    '      hostClassName: (shadowHostEl.getAttribute("class") || "").slice(0, 80),',
    '      hostStyle: (shadowHostEl.getAttribute("style") || "").slice(0, 300),',
    '      preAttrs: preAttrs,',
    '      lineTypes: byType,',
    '      separator: sepColors,',
    '      unmodifiedLinesColor: unmodColor,',
    '      pre: preColors,',
    '      spanHistogram: spanEntries.slice(0, 12),',
    '      shadowCss: shadowCssParts.join(" "),',
    '      errors: diffErrors',
    '    };',
    '  }',
    '  return {',
    '    html: html,',
    '    tokens: tokens,',
    '    fonts: fonts,',
    '    mainSurface: mainSurface ? { background: mainSurface.background } : null,',
    '    ink: inkColor ? { color: inkColor } : null,',
    '    sidebar: sidebar,',
    '    sidebarActiveRow: sidebarActiveRow,',
    '    headingFontFamily: headingFontFamily,',
    '    composerSurface: composerSurface,',
    '    bodyFontFamily: bodyFontFamily,',
    '    titleBarTint: titleBarTint,',
    '    updatePill: updatePill,',
    '    innerThemeScopes: innerThemeScopes,',
    '    externalLinks: externalLinks,',
    '    terminal: terminal,',
    '    diff: diff',
    '  };',
    '})()',
  ].join('\n');
}

// A theme's own painted surface must differ from Codex's OWN stock value for
// this to count as "themed, not merely slept for". Values measured against
// OWL (26.917) — Plan 0004's Verified facts, fact 9 — as the raw hex string
// Codex declares for --app-color-background-surface in each mode, compared
// case-insensitively against the SAME custom property's raw (undecomposed)
// value, which is why this does not need the canvas rasteriser above.
const STOCK_SURFACE_HEX = { dark: '#111111', light: '#ffffff' };

// ---------------------------------------------------------------------------
// Electron-dependent runtime. Built once `require("electron")` has resolved
// (see the setImmediate deferral at the bottom — same load-order fix as
// injector/core/inject.js's start(), and same reason: a synchronous
// require("electron") throws MODULE_NOT_FOUND in every process that inherits
// NODE_OPTIONS until Electron's own bootstrap has registered the module).
// ---------------------------------------------------------------------------

function buildRuntime(electron) {
  const { app, BrowserWindow, Menu, webContents } = electron;

  let logPath = null;
  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    console.log(line);
    if (logPath) {
      try {
        fs.appendFileSync(logPath, line + '\n');
      } catch (err) {
        // Logging must never crash the driver; the console line above is
        // the fallback record if the file write itself is failing.
        console.error(`(could not append to inventory.log: ${err.message})`);
      }
    }
  }

  async function getTheme(wc) {
    return wc.executeJavaScript('document.documentElement.dataset.theme', true);
  }

  /**
   * Runs setThemeScript(theme) and logs how many inner [data-theme] scopes
   * it rewrote. Split out from setTheme() so setAndCaptureTheme can call it
   * a SECOND time, immediately before capture — measured (orchestrator QA,
   * Plan 0004 M3): Codex's own terminal/diff panel containers write their
   * own `data-theme` from app state in a `useLayoutEffect` ON MOUNT, so a
   * rewrite done before the terminal/diff is (re)opened is undone by that
   * mount. Applying it again right before the theme-check/probe/screenshot
   * is what actually reflects in the capture.
   */
  async function applyTheme(wc, theme) {
    const result = await wc.executeJavaScript(setThemeScript(theme), true);
    const innerScopesRewritten = result ? result.innerScopesRewritten : 0;
    if (innerScopesRewritten) {
      log(`  applyTheme("${theme}"): rewrote ${innerScopesRewritten} inner [data-theme] scope(s)`);
    }
    return { theme: result ? result.theme : undefined, innerScopesRewritten };
  }

  async function setTheme(wc, theme) {
    const result = await applyTheme(wc, theme);
    return result.theme;
  }

  const THEMED_RUN = !!process.env.CDX_THEME_PACKAGE;

  /** The raw (undecomposed) declared value of --app-color-background-surface. */
  async function getSurfaceRawValue(wc) {
    const script =
      'getComputedStyle(document.documentElement).getPropertyValue(' +
      JSON.stringify('--app-color-background-surface') +
      ').trim()';
    try {
      return await wc.executeJavaScript(script, true);
    } catch (err) {
      return null;
    }
  }

  /**
   * Poll (rather than merely sleep longer) until the surface token's raw
   * value differs from Codex's OWN stock value for `mode` (STOCK_SURFACE_HEX,
   * measured against OWL) — the sign that a theme is actually PAINTED, not
   * only that time has passed since setTheme(). Bounded: after `timeoutMs`,
   * returns whatever the last reading was, themed=false, and the caller logs
   * that as a fact rather than treating a timeout as success. THEMED-RUN
   * ONLY — a stock run has nothing to wait for.
   */
  async function waitForThemedSurface(wc, mode, timeoutMs) {
    const stock = (STOCK_SURFACE_HEX[mode] || '').toLowerCase();
    const started = Date.now();
    let value = await getSurfaceRawValue(wc);
    let themed = !!value && value.toLowerCase() !== stock;
    while (!themed && Date.now() - started < timeoutMs) {
      await sleep(500);
      value = await getSurfaceRawValue(wc);
      themed = !!value && value.toLowerCase() !== stock;
    }
    return { value, themed };
  }

  /**
   * Run the theme-check in-page script and write theme-check-<tag>.json.
   * Runs in EVERY run, stock or themed (Plan 0004 M3). `diff.shadowCss`, if
   * present, is stripped out of the JSON and written to its own
   * `diff-shadow-<tag>.css` file instead, so the JSON stays a compact,
   * diffable record.
   */
  async function themeCheckAndSave(wc, outDir, tag) {
    let report;
    try {
      report = await wc.executeJavaScript(buildThemeCheckScript(), true);
    } catch (err) {
      log(`  THEME CHECK FAILED (${tag}): ${err.message}`);
      return null;
    }
    if (report && report.diff && typeof report.diff.shadowCss === 'string') {
      const css = report.diff.shadowCss;
      delete report.diff.shadowCss;
      const cssPath = path.join(outDir, `diff-shadow-${tag}.css`);
      try {
        fs.writeFileSync(cssPath, css, 'utf8');
        log(`  diff shadow CSS -> ${cssPath} (${Buffer.byteLength(css, 'utf8')} bytes)`);
      } catch (err) {
        log(`  could not write ${cssPath}: ${err.message}`);
      }
    }
    const outPath = path.join(outDir, `theme-check-${tag}.json`);
    try {
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
      log(`  theme-check -> ${outPath}`);
    } catch (err) {
      log(`  could not write ${outPath}: ${err.message}`);
    }
    return report;
  }

  async function getPathname(wc) {
    try {
      return await wc.executeJavaScript('location.pathname + location.search', true);
    } catch (err) {
      return null;
    }
  }

  async function getHeadingText(wc) {
    try {
      return await wc.executeJavaScript(HOME_HEADING_EXPR, true);
    } catch (err) {
      return null;
    }
  }

  async function isThreadActive(wc) {
    try {
      return await wc.executeJavaScript(THREAD_ACTIVE_EXPR, true);
    } catch (err) {
      return false;
    }
  }

  async function homeEmptyStateGone(wc) {
    try {
      return await wc.executeJavaScript(HOME_EMPTY_STATE_GONE_EXPR, true);
    } catch (err) {
      return false;
    }
  }

  /**
   * Polls `isThreadActive` and `homeEmptyStateGone` every 500ms for up to
   * `timeoutMs`, resolving as soon as both are true (or once the timeout
   * elapses, with whatever the last-checked values were).
   */
  async function waitForThreadOpen(wc, timeoutMs) {
    const started = Date.now();
    let active = await isThreadActive(wc);
    let headingGone = await homeEmptyStateGone(wc);
    while (!(active && headingGone) && Date.now() - started < timeoutMs) {
      await sleep(500);
      active = await isThreadActive(wc);
      headingGone = await homeEmptyStateGone(wc);
    }
    return { active, headingGone };
  }

  async function getAppModeLabel(wc) {
    const script =
      '(function(){ var el = ' + SWITCH_MODE_EXPR + '; return el ? el.getAttribute("aria-label") : null; })()';
    return wc.executeJavaScript(script, true);
  }

  /** "Switch mode, current mode: Codex" -> "Codex"; null if neither name is present. */
  function appModeNameFromLabel(label) {
    if (!label) return null;
    if (label.indexOf('ChatGPT') !== -1) return 'ChatGPT';
    if (label.indexOf('Codex') !== -1) return 'Codex';
    return null;
  }

  async function getTogglePressed(wc, target) {
    const script =
      '(function(){' +
      'var target = ' + JSON.stringify(target) + ';' +
      'var scope = document.querySelector(\'[class*="home-mode-toggle"]\');' +
      'if (!scope) return null;' +
      'var btns = scope.querySelectorAll("button");' +
      'for (var i = 0; i < btns.length; i++) {' +
      'if ((btns[i].textContent || "").trim() === target) return btns[i].getAttribute("aria-pressed");' +
      '}' +
      'return null;' +
      '})()';
    return wc.executeJavaScript(script, true);
  }

  /**
   * Click the element `finderExpr` (an in-page expression string) resolves
   * to, via a REAL synthetic click (mouseDown + mouseUp at the element's own
   * centre, or an x/y-fraction of it) — element.click() does not open
   * Codex's Radix-based menus (verified in the M1 measurement session).
   *
   * Orchestrator QA fix (Plan 0004 M3): scrolls the element into view
   * (`block: "center"`) and settles ~500ms BEFORE computing the click point
   * — a below-the-fold sidebar row otherwise resolves to a point outside the
   * window, and sendInputEvent at that point silently does nothing. The
   * computed point is then checked against the page's own viewport
   * (isPointInViewport); a still-off-screen point REFUSES the click (logged,
   * returns null) rather than firing blind.
   */
  async function clickElementByFinder(wc, finderExpr, description, xFraction, yFraction) {
    const xf = typeof xFraction === 'number' ? xFraction : 0.5;
    const yf = typeof yFraction === 'number' ? yFraction : 0.5;
    const script =
      '(async function(){' +
      'var el = (' + finderExpr + ');' +
      'if (!el) return null;' +
      'el.scrollIntoView({ block: "center" });' +
      'await new Promise(function(resolve){ setTimeout(resolve, 500); });' +
      'var r = el.getBoundingClientRect();' +
      'return { x: r.left + r.width * ' + xf + ', y: r.top + r.height * ' + yf + ', ' +
      'text: (el.textContent || "").trim().slice(0, 80), ' +
      'viewportWidth: window.innerWidth, viewportHeight: window.innerHeight };' +
      '})()';
    let point;
    try {
      point = await wc.executeJavaScript(script, true);
    } catch (err) {
      log(`  CLICK FAILED (${description}): executeJavaScript threw: ${err.message}`);
      return null;
    }
    if (!point) {
      log(`  CLICK FAILED (${description}): element not found`);
      return null;
    }
    if (!isPointInViewport(point, point.viewportWidth, point.viewportHeight)) {
      log(
        `  CLICK FAILED (${description}): computed point (${point.x.toFixed(0)},${point.y.toFixed(0)}) is ` +
          `outside the viewport (${point.viewportWidth}x${point.viewportHeight}) even after scrollIntoView`
      );
      return null;
    }
    wc.sendInputEvent({ type: 'mouseDown', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    log(
      `  CLICKED (${description}) @ (${point.x.toFixed(0)},${point.y.toFixed(0)}) ` +
        `text=${JSON.stringify(point.text)}`
    );
    return point;
  }

  /** Scrolls the element `finderExpr` resolves to into view (block:"center"); returns whether it was found. */
  async function scrollElementIntoView(wc, finderExpr) {
    const script =
      '(function(){' +
      'var el = (' + finderExpr + ');' +
      'if (!el) return false;' +
      'el.scrollIntoView({ block: "center" });' +
      'return true;' +
      '})()';
    try {
      return await wc.executeJavaScript(script, true);
    } catch (err) {
      return false;
    }
  }

  async function pressEscape(wc) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  }

  /** Switch to `targetMode` ("Codex" | "ChatGPT") via a real menu click, or confirm it is active already. */
  async function ensureAppMode(wc, targetMode) {
    const label = await getAppModeLabel(wc);
    if (label === null) {
      return { ok: false, reason: 'mode switch button not found', label: null };
    }
    if (label.indexOf(targetMode) !== -1) {
      return { ok: true, label };
    }
    const clicked = await clickElementByFinder(wc, SWITCH_MODE_EXPR, 'mode switch button');
    if (!clicked) {
      return { ok: false, reason: 'mode switch button click failed', label };
    }
    await sleep(1500); // popup open animation
    const itemClicked = await clickElementByFinder(
      wc,
      pickMenuItemExpr(targetMode),
      `mode menu item "${targetMode}"`
    );
    if (!itemClicked) {
      return { ok: false, reason: `menu item "${targetMode}" not found in the open popup`, label };
    }
    await sleep(10000); // measured settle time (see plan's Verified facts)
    const newLabel = await getAppModeLabel(wc);
    if (!newLabel || newLabel.indexOf(targetMode) === -1) {
      return { ok: false, reason: `app mode did not change to "${targetMode}" (now: ${newLabel})`, label: newLabel };
    }
    return { ok: true, label: newLabel };
  }

  /** Ensure the Chat/Work home toggle shows `target` pressed. */
  async function ensureHomeMode(wc, target) {
    let pressed = await getTogglePressed(wc, target);
    if (pressed === null) {
      // Toggle only exists on the home screen — go there first.
      const nc = await clickElementByFinder(wc, NEW_CHAT_EXPR, 'New chat (to reach home for toggle)');
      if (!nc) {
        return { ok: false, reason: 'home-mode-toggle absent and "New chat" nav item not found' };
      }
      await sleep(3000);
      pressed = await getTogglePressed(wc, target);
      if (pressed === null) {
        return { ok: false, reason: 'home-mode-toggle still absent after clicking New chat' };
      }
    }
    if (pressed === 'true') {
      return { ok: true, pressed };
    }
    const clicked = await clickElementByFinder(wc, homeToggleButtonExpr(target), `home mode toggle "${target}"`);
    if (!clicked) {
      return { ok: false, reason: `home mode toggle button "${target}" not found` };
    }
    await sleep(2000);
    pressed = await getTogglePressed(wc, target);
    if (pressed !== 'true') {
      return { ok: false, reason: `toggle did not switch to "${target}" (aria-pressed now: ${pressed})` };
    }
    return { ok: true, pressed };
  }

  /** Sets `theme` and confirms `dataset.theme` reflects it, WITHOUT any capture — used before a manual open/close sequence (terminal, diff). */
  async function setAndVerifyTheme(wc, theme) {
    await setTheme(wc, theme);
    await sleep(2500);
    const actual = await getTheme(wc);
    return { verified: actual === theme, actual };
  }

  /**
   * Run the probe and save its screenshot for one theme, on the given
   * webContents, under `outDir`, using `tag`. Sets CDX_PROBE_DUMP_CSS for
   * exactly the very first probe of the whole run (tracked via `state`),
   * then removes it — never left set for later calls.
   */
  async function probeAndScreenshot(wc, outDir, tag, state) {
    const dumpThisCall = !state.dumpDone;
    if (dumpThisCall) {
      process.env.CDX_PROBE_DUMP_CSS = '1';
    }
    try {
      await runProbe(wc, log, outDir, tag);
    } finally {
      if (dumpThisCall) {
        delete process.env.CDX_PROBE_DUMP_CSS;
        state.dumpDone = true;
      }
    }
    const image = await wc.capturePage();
    const filePath = path.join(outDir, `${tag}.png`);
    fs.writeFileSync(filePath, image.toPNG());
    log(`  screenshot -> ${filePath}`);
    return path.basename(filePath);
  }

  /**
   * Orchestrator QA fix #2 (Plan 0004 M3): records diagnostics on
   * `record.facts.failureDiagnostics` and saves `<tag>-FAILED.png` whenever
   * a row-open verification fails, so the reason is captured state (the
   * actual DOM at the moment of failure), not a re-probed guess afterward.
   * `rowIndex` is the row this attempt clicked, or -1/undefined if none was
   * ever resolved. Best-effort — a failure here is logged, never thrown.
   */
  async function captureRowOpenFailureDiagnostics(wc, outDir, record, tag, rowIndex) {
    let diagnostics;
    try {
      diagnostics = await wc.executeJavaScript(buildRowDiagnosticsScript(rowIndex), true);
    } catch (err) {
      diagnostics = { error: err.message };
    }
    record.facts.failureDiagnostics = diagnostics;
    try {
      const image = await wc.capturePage();
      const filePath = path.join(outDir, `${tag}-FAILED.png`);
      fs.writeFileSync(filePath, image.toPNG());
      log(`  FAILURE diagnostics screenshot -> ${filePath}`);
      record.facts.failureScreenshot = path.basename(filePath);
    } catch (err) {
      log(`  could not capture failure diagnostics screenshot: ${err.message}`);
    }
  }

  /**
   * Sets `theme`, verifies it, (THEMED_RUN only) waits for it to actually
   * PAINT, then ALWAYS runs the theme-check (Plan 0004 M3: stock runs get a
   * theme-check too) and the probe/screenshot. Records facts/files on
   * `record`. This is `forEachTheme`'s per-theme body, extracted so scenarios
   * that need custom setup between modes (terminal, diff) can call it too.
   */
  async function setAndCaptureTheme(wc, outDir, tag, record, theme, state) {
    record.facts.themes = record.facts.themes || {};
    await setTheme(wc, theme);
    await sleep(2500);
    const actual = await getTheme(wc);
    if (actual !== theme) {
      record.facts.themes[theme] = { verified: false, actual };
      log(`  THEME VERIFY FAILED: wanted "${theme}", dataset.theme is "${actual}" — skipping probe/screenshot`);
      return { verified: false };
    }
    record.facts.themes[theme] = { verified: true };
    if (THEMED_RUN) {
      // The injector applies at dom-ready/navigation, asynchronously — the
      // existing 2500ms settle above is the mode switch's own settle time,
      // not evidence the theme repainted. Poll a PAINTED value instead of
      // guessing a longer sleep (see waitForThemedSurface's own doc).
      const painted = await waitForThemedSurface(wc, theme, 5000);
      record.facts.themes[theme].painted = painted;
      if (!painted.themed) {
        log(
          `  THEME NOT YET PAINTED for "${theme}" after settle+poll: ` +
            `--app-color-background-surface still reads "${painted.value}" ` +
            `(Codex's own stock for this mode). Capturing theme-check/probe/screenshot anyway — ` +
            `this is a finding, not a skip.`
        );
      }
    }
    // Re-apply right before capture (see applyTheme's own doc): a
    // terminal/diff panel opened between setTheme() above and here would
    // otherwise sit in the wrong mode despite the earlier rewrite.
    const reapplied = await applyTheme(wc, theme);
    record.facts.themes[theme].innerScopesRewrittenBeforeCapture = reapplied.innerScopesRewritten;
    await themeCheckAndSave(wc, outDir, tag);
    const file = await probeAndScreenshot(wc, outDir, tag, state);
    record.files = record.files || [];
    record.files.push(file);
    return { verified: true };
  }

  /** For each theme in `themes`: setAndCaptureTheme with tag `${scenarioTag}-${theme}`. */
  async function forEachTheme(wc, scenarioTag, outDir, record, themes, state) {
    record.facts.themes = record.facts.themes || {};
    record.files = record.files || [];
    for (const theme of themes) {
      await setAndCaptureTheme(wc, outDir, `${scenarioTag}-${theme}`, record, theme, state);
    }
  }

  /** Finds `label` in the current application menu and invokes it via MenuItem.click(undefined, win, wc). */
  async function invokeMenuItem(win, wc, label) {
    const menu = Menu.getApplicationMenu();
    if (!menu) return { ok: false, reason: 'Menu.getApplicationMenu() returned null' };
    const item = findMenuItemByLabel(menu, label);
    if (!item) return { ok: false, reason: `menu item "${label}" not found` };
    try {
      item.click(undefined, win, wc);
      log(`  MENU INVOKED: "${label}"`);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: `menu item "${label}" click threw: ${err.message}` };
    }
  }

  /**
   * If `checkVisibleExpr` currently reads true, invokes `toggleLabel` and
   * polls (up to `timeoutMs`) for it to read false. Used to close a terminal
   * or review panel left open from a previous mode before re-measuring.
   */
  async function ensurePanelClosed(win, wc, checkVisibleExpr, toggleLabel, description, timeoutMs) {
    const visible = await wc.executeJavaScript(checkVisibleExpr, true).catch(() => false);
    if (!visible) return { ok: true, wasVisible: false };
    const invoked = await invokeMenuItem(win, wc, toggleLabel);
    if (!invoked.ok) {
      return { ok: false, reason: `could not invoke "${toggleLabel}" to close ${description}: ${invoked.reason}` };
    }
    const gone = await pollUntil(
      () => wc.executeJavaScript(checkVisibleExpr, true).then((v) => !v).catch(() => false),
      timeoutMs
    );
    if (!gone) {
      return { ok: false, reason: `${description} still visible ${timeoutMs}ms after invoking "${toggleLabel}"` };
    }
    return { ok: true, wasVisible: true };
  }

  /**
   * Clicks the row at `index` into THREAD_ROWS_ARRAY_EXPR (text area, x=0.3)
   * and verifies THAT SPECIFIC ROW (re-queried by the same index, never "any
   * row") gains the active-thread marker within `timeoutMs` — orchestrator
   * QA fix (Plan 0004 M3): "some row is active" is already true the instant
   * a PREVIOUS scenario's thread is still open, so it must never be the
   * pass criterion for a fresh click. Also polls the Codex home empty-state
   * heading gone (harmless/no-op outside Codex home, where that heading
   * never existed to begin with). Every row-click verification in this file
   * goes through this one helper.
   */
  async function clickThreadRowAtIndex(wc, index, description, timeoutMs) {
    const to = timeoutMs || 8000;
    const rowExpr = nthElementExpr(THREAD_ROWS_ARRAY_EXPR, index);
    const clicked = await clickElementByFinder(wc, rowExpr, description, 0.3, 0.5);
    if (!clicked) {
      return { ok: false, reason: `could not click ${description} (row not found or off-screen)` };
    }
    const active = await pollUntil(
      () => wc.executeJavaScript(rowAtIndexActiveExpr(index), true).catch(() => false),
      to
    );
    if (!active) {
      return { ok: false, reason: `${description}: clicked row (index ${index}) did not become active within ${to}ms` };
    }
    const headingGone = await pollUntil(() => homeEmptyStateGone(wc), to);
    return { ok: true, active, headingGone };
  }

  /**
   * Iterates thread rows (up to `maxRows`), clicking each via
   * clickThreadRowAtIndex (so only a row that ITSELF became active is ever
   * considered), then polls `matchExpr` for up to `matchTimeoutMs` — content
   * renders lazily after a row activates, so the match predicate must be
   * polled too, not read once. Returns the FIRST row index whose content
   * matches, or {ok:false} if none of the first `maxRows` rows matched.
   */
  async function findThreadRowMatching(wc, matchExpr, maxRows, activeTimeoutMs, matchTimeoutMs, description) {
    const countRaw = await wc.executeJavaScript(THREAD_ROWS_ARRAY_EXPR + '.length', true).catch(() => 0);
    const count = Math.min(countRaw || 0, maxRows);
    if (count === 0) {
      return { ok: false, reason: `no sidebar thread rows found (looking for ${description})` };
    }
    for (let i = 0; i < count; i++) {
      const opened = await clickThreadRowAtIndex(wc, i, `thread row #${i} (looking for ${description})`, activeTimeoutMs);
      if (!opened.ok) continue;
      const matched = await pollUntil(
        () => wc.executeJavaScript(matchExpr, true).catch(() => false),
        matchTimeoutMs
      );
      if (matched) return { ok: true, index: i };
    }
    return { ok: false, reason: `no thread among the first ${count} rows matched: ${description}`, lastIndex: count - 1 };
  }

  // --- Scenarios -------------------------------------------------------

  async function scenarioCodexHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const clicked = await clickElementByFinder(wc, NEW_CHAT_EXPR, 'New chat');
    if (!clicked) return { ok: false, reason: '"New chat" nav item not found' };
    await sleep(3000);
    record.facts.pathname = await getPathname(wc);
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'codex-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioCodexThread(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    // Recorded as evidence only — Codex's router does not change
    // location.pathname when a thread opens (measured: it stayed
    // "/index.html" after a real thread click), so pathname is never the
    // pass criterion here.
    record.facts.pathnameBefore = await getPathname(wc);
    // Click the row's text area (left portion), never the Pin/Archive
    // buttons that sit at the row's right edge.
    const opened = await clickThreadRowAtIndex(wc, 0, 'thread row (text area)', 8000);
    record.facts.pathnameAfter = await getPathname(wc);
    record.facts.threadActive = opened.active;
    record.facts.homeEmptyStateGone = opened.headingGone;
    if (!opened.ok || !opened.headingGone) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'codex-thread', 0);
      return {
        ok: false,
        reason: opened.ok
          ? `thread open not confirmed within 8s (sidebar-item active marker=${opened.active}, ` +
            `home empty-state gone=${opened.headingGone})`
          : opened.reason,
      };
    }
    await forEachTheme(wc, 'codex-thread', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioCodexThreadLinks(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };

    const found = await findThreadRowMatching(wc, EXTERNAL_LINK_PRESENT_EXPR, 15, 8000, 5000, 'a link outside the sidebar');
    record.facts.threadRowIndex = found.ok ? found.index : null;
    if (!found.ok) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'codex-thread-links', found.lastIndex);
      return { ok: false, reason: found.reason };
    }

    const scrolled = await scrollElementIntoView(wc, FIRST_EXTERNAL_LINK_EXPR);
    record.facts.scrolledLinkIntoView = scrolled;
    await sleep(800);

    await forEachTheme(wc, 'codex-thread-links', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioCodexTerminal(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };

    let active = await isThreadActive(wc);
    if (!active) {
      const opened = await clickThreadRowAtIndex(wc, 0, 'thread row (text area) — opening before terminal', 8000);
      if (!opened.ok) {
        await captureRowOpenFailureDiagnostics(wc, outDir, record, 'codex-terminal', 0);
        return { ok: false, reason: opened.reason };
      }
      active = opened.active;
    }
    if (!active) return { ok: false, reason: 'could not confirm a thread open before invoking the terminal' };

    const win = BrowserWindow.fromWebContents(wc);
    if (!win) return { ok: false, reason: 'BrowserWindow.fromWebContents(wc) returned null' };

    record.facts.webContentsList = webContents.getAllWebContents().map((w) => ({
      id: w.id,
      type: w.getType(),
      url: (w.getURL() || '').slice(0, 120),
    }));

    record.facts.themes = record.facts.themes || {};
    record.facts.terminalByMode = {};
    record.files = record.files || [];

    for (const theme of ['dark', 'light']) {
      const closeCheck = await ensurePanelClosed(win, wc, XTERM_ROWS_VISIBLE_EXPR, 'Toggle Bottom Panel', 'terminal', 5000);
      if (!closeCheck.ok) return { ok: false, reason: closeCheck.reason };

      const setResult = await setAndVerifyTheme(wc, theme);
      if (!setResult.verified) {
        return {
          ok: false,
          reason: `could not verify theme "${theme}" (dataset.theme is "${setResult.actual}") before opening the terminal`,
        };
      }
      record.facts.themes[theme] = { verified: true };

      const opened = await invokeMenuItem(win, wc, 'Open Terminal');
      if (!opened.ok) return { ok: false, reason: `could not invoke "Open Terminal": ${opened.reason}` };

      const visible = await pollUntil(
        () => wc.executeJavaScript(XTERM_ROWS_VISIBLE_EXPR, true).catch(() => false),
        10000
      );
      if (!visible) return { ok: false, reason: `.xterm-rows did not become visible within 10s for mode "${theme}"` };

      const mountedUnder = await wc.executeJavaScript(terminalMountedUnderExpr(), true).catch(() => null);
      record.facts.terminalByMode[theme] = { mountedUnder };

      const tag = `codex-terminal-${theme}`;
      if (THEMED_RUN) {
        const painted = await waitForThemedSurface(wc, theme, 5000);
        record.facts.themes[theme].painted = painted;
        if (!painted.themed) {
          log(`  THEME NOT YET PAINTED for "${theme}" (terminal) after settle+poll: still "${painted.value}"`);
        }
      }
      // The terminal panel writes its OWN data-theme from Codex's app state
      // in a useLayoutEffect on mount, undoing the earlier setAndVerifyTheme
      // rewrite — re-apply immediately before capture (applyTheme's doc).
      const reapplied = await applyTheme(wc, theme);
      record.facts.terminalByMode[theme].innerScopesRewrittenBeforeCapture = reapplied.innerScopesRewritten;
      await themeCheckAndSave(wc, outDir, tag);
      const file = await probeAndScreenshot(wc, outDir, tag, state);
      record.files.push(file);
    }

    const finalClose = await ensurePanelClosed(win, wc, XTERM_ROWS_VISIBLE_EXPR, 'Toggle Bottom Panel', 'terminal', 5000);
    record.facts.terminalClosedAtEnd = finalClose.ok;
    if (!finalClose.ok) {
      log(`  WARNING: could not confirm terminal closed at end of the terminal scenario: ${finalClose.reason}`);
    }
    return { ok: true };
  }

  async function scenarioCodexDiff(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'Codex');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };

    const found = await findThreadRowMatching(wc, DIFF_ROW_BUTTON_PRESENT_EXPR, 15, 8000, 5000, 'a turn-diff file row');
    record.facts.threadRowIndex = found.ok ? found.index : null;
    if (!found.ok) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'codex-diff', found.lastIndex);
      return { ok: false, reason: found.reason };
    }

    const win = BrowserWindow.fromWebContents(wc);
    if (!win) return { ok: false, reason: 'BrowserWindow.fromWebContents(wc) returned null' };

    record.facts.webContentsList = webContents.getAllWebContents().map((w) => ({
      id: w.id,
      type: w.getType(),
      url: (w.getURL() || '').slice(0, 120),
    }));

    record.facts.themes = record.facts.themes || {};
    record.facts.diffByMode = {};
    record.files = record.files || [];

    for (const theme of ['dark', 'light']) {
      const closeCheck = await ensurePanelClosed(win, wc, DIFF_HEADER_VISIBLE_EXPR, 'Toggle Review Panel', 'review panel', 5000);
      if (!closeCheck.ok) return { ok: false, reason: closeCheck.reason };

      const setResult = await setAndVerifyTheme(wc, theme);
      if (!setResult.verified) {
        return {
          ok: false,
          reason: `could not verify theme "${theme}" (dataset.theme is "${setResult.actual}") before opening the diff`,
        };
      }
      record.facts.themes[theme] = { verified: true };

      await scrollElementIntoView(wc, DIFF_ROW_BUTTON_EXPR);
      await sleep(300);
      const rowClicked = await clickElementByFinder(wc, DIFF_ROW_BUTTON_EXPR, 'turn-diff file-row button');
      if (!rowClicked) return { ok: false, reason: `could not click the turn-diff file-row button for mode "${theme}"` };

      const headerVisible = await pollUntil(
        () => wc.executeJavaScript(DIFF_HEADER_VISIBLE_EXPR, true).catch(() => false),
        8000
      );
      if (!headerVisible) return { ok: false, reason: `diff-header did not appear within 8s for mode "${theme}"` };

      const headerClicked = await clickElementByFinder(wc, DIFF_HEADER_BUTTON_EXPR, 'diff-header button');
      if (!headerClicked) return { ok: false, reason: `could not click the diff-header button for mode "${theme}"` };

      const expanded = await pollUntil(
        () => wc.executeJavaScript(SHADOW_CHANGE_LINE_PRESENT_EXPR, true).catch(() => false),
        8000
      );
      if (!expanded) return { ok: false, reason: `no shadow root exposed a change line within 8s for mode "${theme}"` };

      const mountedUnder = await wc.executeJavaScript(diffMountedUnderExpr(), true).catch(() => null);
      record.facts.diffByMode[theme] = { mountedUnder };

      const tag = `codex-diff-${theme}`;
      if (THEMED_RUN) {
        const painted = await waitForThemedSurface(wc, theme, 5000);
        record.facts.themes[theme].painted = painted;
        if (!painted.themed) {
          log(`  THEME NOT YET PAINTED for "${theme}" (diff) after settle+poll: still "${painted.value}"`);
        }
      }
      // The review panel's diff renderer writes its OWN data-theme from
      // Codex's app state on mount, undoing the earlier setAndVerifyTheme
      // rewrite — re-apply immediately before capture (applyTheme's doc).
      const reapplied = await applyTheme(wc, theme);
      record.facts.diffByMode[theme].innerScopesRewrittenBeforeCapture = reapplied.innerScopesRewritten;
      await themeCheckAndSave(wc, outDir, tag);
      const file = await probeAndScreenshot(wc, outDir, tag, state);
      record.files.push(file);
    }

    const finalClose = await ensurePanelClosed(win, wc, DIFF_HEADER_VISIBLE_EXPR, 'Toggle Review Panel', 'review panel', 5000);
    record.facts.reviewPanelClosedAtEnd = finalClose.ok;
    if (!finalClose.ok) {
      log(`  WARNING: could not confirm review panel closed at end of the diff scenario: ${finalClose.reason}`);
    }
    return { ok: true };
  }

  async function scenarioChatGptChatHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const toggle = await ensureHomeMode(wc, 'Chat');
    record.facts.toggle = toggle;
    if (!toggle.ok) return { ok: false, reason: toggle.reason };
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'chatgpt-chat-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptWorkHome(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const toggle = await ensureHomeMode(wc, 'Work');
    record.facts.toggle = toggle;
    if (!toggle.ok) return { ok: false, reason: toggle.reason };
    record.facts.heading = await getHeadingText(wc);
    await forEachTheme(wc, 'chatgpt-work-home', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptConversation(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const rowIndex = await wc.executeJavaScript(firstThreadRowIndexByWorkBadgeExpr(false), true).catch(() => -1);
    record.facts.threadRowIndex = rowIndex;
    if (rowIndex === -1 || rowIndex === null || rowIndex === undefined) {
      return { ok: false, reason: 'no ChatGPT conversation row without a Work badge found' };
    }
    // 12s, not 8: ChatGPT conversations load their content from the network.
    const clickResult = await clickThreadRowAtIndex(wc, rowIndex, 'first Chat conversation row (no Work badge)', 12000);
    if (!clickResult.ok) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'chatgpt-conversation', rowIndex);
      return { ok: false, reason: clickResult.reason };
    }
    const toggleAbsent = await pollUntil(
      () => wc.executeJavaScript(HOME_TOGGLE_ABSENT_EXPR, true).catch(() => false),
      12000
    );
    record.facts.opened = clickResult.active && toggleAbsent;
    if (!toggleAbsent) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'chatgpt-conversation', rowIndex);
      return { ok: false, reason: 'home toggle did not disappear within 12s after the conversation row became active' };
    }
    await forEachTheme(wc, 'chatgpt-conversation', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptWorkThread(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const rowIndex = await wc.executeJavaScript(firstThreadRowIndexByWorkBadgeExpr(true), true).catch(() => -1);
    record.facts.threadRowIndex = rowIndex;
    if (rowIndex === -1 || rowIndex === null || rowIndex === undefined) {
      return { ok: false, reason: 'no ChatGPT conversation row with a Work badge found' };
    }
    // 12s, not 8: ChatGPT conversations load their content from the network.
    const clickResult = await clickThreadRowAtIndex(wc, rowIndex, 'first Work conversation row (Work badge)', 12000);
    if (!clickResult.ok) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'chatgpt-work-thread', rowIndex);
      return { ok: false, reason: clickResult.reason };
    }
    const toggleAbsent = await pollUntil(
      () => wc.executeJavaScript(HOME_TOGGLE_ABSENT_EXPR, true).catch(() => false),
      12000
    );
    record.facts.opened = clickResult.active && toggleAbsent;
    if (!toggleAbsent) {
      await captureRowOpenFailureDiagnostics(wc, outDir, record, 'chatgpt-work-thread', rowIndex);
      return { ok: false, reason: 'home toggle did not disappear within 12s after the Work conversation row became active' };
    }
    await forEachTheme(wc, 'chatgpt-work-thread', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioChatGptImages(wc, outDir, record, state) {
    const mode = await ensureAppMode(wc, 'ChatGPT');
    record.facts.appMode = mode.label;
    if (!mode.ok) return { ok: false, reason: mode.reason };
    const clicked = await clickElementByFinder(wc, sidebarNavItemExpr('Images'), 'Images nav item');
    if (!clicked) return { ok: false, reason: '"Images" nav item not found' };
    const opened = await pollUntil(
      () => wc.executeJavaScript(IMAGES_HEADING_PRESENT_EXPR, true).catch(() => false),
      8000
    );
    record.facts.opened = opened;
    if (!opened) return { ok: false, reason: '"Images" heading did not appear outside the sidebar within 8s' };
    await forEachTheme(wc, 'chatgpt-images', outDir, record, ['dark', 'light'], state);
    return { ok: true };
  }

  async function scenarioOverlayModeMenu(wc, outDir, record, state) {
    // Dark only, per the scenario list.
    await setTheme(wc, 'dark');
    await sleep(2500);
    const actual = await getTheme(wc);
    if (actual !== 'dark') {
      return { ok: false, reason: `could not set dark theme for the overlay scenario (dataset.theme is "${actual}")` };
    }
    record.facts.themes = { dark: { verified: true } };
    if (THEMED_RUN) {
      const painted = await waitForThemedSurface(wc, 'dark', 5000);
      record.facts.themes.dark.painted = painted;
      if (!painted.themed) {
        log(`  THEME NOT YET PAINTED for the overlay scenario after settle+poll: still "${painted.value}"`);
      }
    }
    const clicked = await clickElementByFinder(wc, SWITCH_MODE_EXPR, 'switch mode button (open menu)');
    if (!clicked) return { ok: false, reason: 'switch mode button not found (cannot open the overlay)' };
    await sleep(1500);
    const tag = 'overlay-mode-menu-dark';
    await themeCheckAndSave(wc, outDir, tag);
    const file = await probeAndScreenshot(wc, outDir, tag, state);
    record.files = [file];
    await pressEscape(wc);
    await sleep(800);
    return { ok: true };
  }

  // --- Main window discovery -------------------------------------------

  /**
   * Resolves once the FIRST BrowserWindow whose webContents URL is the main
   * app URL (isMainWindowUrl) has been identified, then waits the measured
   * ~14s settle time before returning its webContents. Resolves null if
   * nothing matches within `timeoutMs`.
   */
  function waitForMainWindow(timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const seen = new Set();

      function consider(win) {
        if (!win || win.isDestroyed()) return;
        const wc = win.webContents;
        if (!wc || seen.has(wc.id)) return;
        const check = () => {
          if (settled || wc.isDestroyed()) return;
          const url = wc.getURL();
          log(`window webContents#${wc.id} url=${url || '(none yet)'}`);
          if (isMainWindowUrl(url)) {
            settled = true;
            seen.add(wc.id);
            log(`main window identified: webContents#${wc.id}; waiting 14s before driving it`);
            setTimeout(() => resolve(wc), 14000);
          }
        };
        check();
        wc.on('did-navigate', check);
        wc.on('did-finish-load', check);
      }

      for (const win of BrowserWindow.getAllWindows()) consider(win);
      app.on('browser-window-created', (_event, win) => consider(win));

      setTimeout(() => {
        if (!settled) resolve(null);
      }, timeoutMs);
    });
  }

  // --- Run ---------------------------------------------------------------

  async function run() {
    const outDir = process.env.CDX_INVENTORY_OUT;
    if (!outDir) {
      console.error('CDX_INVENTORY_OUT is not set — the driver was not launched by run-inventory.mjs. Aborting.');
      try {
        app.quit();
      } catch (err) {
        /* best effort */
      }
      return;
    }
    fs.mkdirSync(outDir, { recursive: true });
    logPath = path.join(outDir, 'inventory.log');
    log(`driver started; out=${outDir}`);

    const manifest = {
      codexVersions: { chrome: process.versions.chrome, app: null },
      startedAt: new Date().toISOString(),
      finishedAt: null,
      facts: {},
      scenarios: [],
    };
    try {
      manifest.codexVersions.app = app.getVersion();
    } catch (err) {
      log(`could not read app.getVersion(): ${err.message}`);
    }

    let quit = false;
    function finish() {
      if (quit) return;
      quit = true;
      manifest.finishedAt = new Date().toISOString();
      try {
        fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
        log('manifest.json written');
      } catch (err) {
        log(`FAILED to write manifest.json: ${err.message}`);
      }
      log('driver quitting');
      try {
        app.quit();
      } catch (err) {
        /* best effort */
      }
    }

    const safetyTimer = setTimeout(() => {
      log('SAFETY TIMEOUT (12 minutes) reached — quitting regardless of progress');
      finish();
    }, 12 * 60 * 1000);

    const wc = await waitForMainWindow(90 * 1000);
    if (!wc) {
      log('MAIN WINDOW NOT FOUND within the discovery timeout — aborting with an empty scenario list');
      clearTimeout(safetyTimer);
      finish();
      return;
    }

    const initialTheme = await getTheme(wc).catch((err) => {
      log(`could not read initial theme: ${err.message}`);
      return null;
    });
    log(`initial theme = ${initialTheme}`);

    // The app-mode choice (Codex vs ChatGPT) is Codex/account-side state,
    // NOT part of this throwaway --user-data-dir profile — measured: a
    // brand-new profile still started in ChatGPT mode because an earlier
    // scouting run had left the account in that mode. It is therefore
    // shared with the owner's real Codex, and restoring to a hardcoded
    // mode would leave their app in a different mode than they left it.
    // Always restore to whatever was observed here at the start.
    const initialAppModeLabel = await getAppModeLabel(wc).catch((err) => {
      log(`could not read initial app mode: ${err.message}`);
      return null;
    });
    const initialAppMode = appModeNameFromLabel(initialAppModeLabel);
    manifest.facts.initialAppMode = initialAppMode;
    manifest.facts.initialAppModeLabel = initialAppModeLabel;
    log(`initial app mode = ${initialAppMode} (label: ${initialAppModeLabel})`);

    const state = { dumpDone: false };
    const scenarios = [
      { name: 'codex-home', run: scenarioCodexHome },
      { name: 'codex-thread', run: scenarioCodexThread },
      { name: 'codex-thread-links', run: scenarioCodexThreadLinks },
      { name: 'codex-terminal', run: scenarioCodexTerminal },
      { name: 'codex-diff', run: scenarioCodexDiff },
      { name: 'chatgpt-chat-home', run: scenarioChatGptChatHome },
      { name: 'chatgpt-work-home', run: scenarioChatGptWorkHome },
      { name: 'chatgpt-conversation', run: scenarioChatGptConversation },
      { name: 'chatgpt-work-thread', run: scenarioChatGptWorkThread },
      { name: 'chatgpt-images', run: scenarioChatGptImages },
      { name: 'overlay-mode-menu', run: scenarioOverlayModeMenu },
    ];

    for (const scenario of scenarios) {
      log(`=== scenario: ${scenario.name} ===`);
      const record = { name: scenario.name, status: 'FAILED', reason: null, facts: {}, files: [] };
      try {
        const outcome = await scenario.run(wc, outDir, record, state);
        if (outcome && outcome.ok) {
          record.status = 'OK';
        } else {
          record.status = 'FAILED';
          record.reason = (outcome && outcome.reason) || 'scenario returned no outcome';
          log(`  SCENARIO SETUP FAILED: ${record.reason}`);
        }
      } catch (err) {
        record.status = 'FAILED';
        record.reason = `exception: ${err.message}`;
        log(`  SCENARIO EXCEPTION: ${err.stack || err.message}`);
      }
      manifest.scenarios.push(record);
    }

    log(
      `restoring: theme -> ${initialTheme || '(unknown)'}, home toggle -> Chat (if ChatGPT), ` +
        `app mode -> ${initialAppMode || '(unknown — leaving as-is)'}`
    );
    try {
      const win = BrowserWindow.fromWebContents(wc);
      if (win) {
        const terminalClose = await ensurePanelClosed(win, wc, XTERM_ROWS_VISIBLE_EXPR, 'Toggle Bottom Panel', 'terminal', 5000);
        if (!terminalClose.ok) log(`restore: could not confirm terminal closed: ${terminalClose.reason}`);
        const reviewClose = await ensurePanelClosed(win, wc, DIFF_HEADER_VISIBLE_EXPR, 'Toggle Review Panel', 'review panel', 5000);
        if (!reviewClose.ok) log(`restore: could not confirm review panel closed: ${reviewClose.reason}`);
      } else {
        log('restore: BrowserWindow.fromWebContents(wc) returned null — skipping terminal/review-panel close');
      }
      const label = await getAppModeLabel(wc);
      if (label && label.indexOf('ChatGPT') !== -1) {
        const chatRestore = await ensureHomeMode(wc, 'Chat');
        if (!chatRestore.ok) log(`restore: could not reset home toggle to Chat: ${chatRestore.reason}`);
      }
      if (initialAppMode) {
        const modeRestore = await ensureAppMode(wc, initialAppMode);
        if (!modeRestore.ok) {
          log(`restore: could not reset app mode to "${initialAppMode}": ${modeRestore.reason}`);
        }
      } else {
        log('restore: initial app mode was never determined — leaving app mode as-is rather than guessing');
      }
      if (initialTheme) {
        await setTheme(wc, initialTheme);
        await sleep(1000);
      }
    } catch (err) {
      log(`restore encountered an error (non-fatal, continuing to quit): ${err.message}`);
    }

    clearTimeout(safetyTimer);
    finish();
  }

  return { run };
}

// ---------------------------------------------------------------------------
// Entry point. Deferred past the current tick, exactly like
// injector/core/inject.js's start(): a synchronous require('electron') here
// throws MODULE_NOT_FOUND in every process NODE_OPTIONS reaches (main, GPU,
// utility, …) until Electron's own bootstrap has registered the module. If it
// still throws, or electron.app is missing, this is not an Electron main
// process — return silently, as instructed.
// ---------------------------------------------------------------------------

setImmediate(() => {
  let electron;
  try {
    electron = require('electron');
  } catch (err) {
    return;
  }
  if (!electron || !electron.app) {
    return;
  }
  const { app } = electron;
  const runtime = buildRuntime(electron);

  const start = () => {
    runtime.run().catch((err) => {
      console.error(`driver-preload FATAL: ${err.stack || err.message}`);
      try {
        app.quit();
      } catch (quitErr) {
        /* best effort */
      }
    });
  };

  if (app.isReady()) {
    start();
  } else {
    app.whenReady().then(start);
  }
});

module.exports = {
  isMainWindowUrl,
  isPointInViewport,
  pollUntil,
  findMenuItemByLabel,
  setThemeScript,
  sidebarNavItemExpr,
  pickMenuItemExpr,
  homeToggleButtonExpr,
  nthElementExpr,
  firstThreadRowByWorkBadgeExpr,
  firstThreadRowIndexByWorkBadgeExpr,
  rowAtIndexActiveExpr,
  buildRowDiagnosticsScript,
  terminalMountedUnderExpr,
  diffMountedUnderExpr,
  THREAD_ROWS_ARRAY_EXPR,
  THREAD_ROW_EXPR,
  NEW_CHAT_EXPR,
  HOME_TOGGLE_ABSENT_EXPR,
  FIRST_EXTERNAL_LINK_EXPR,
  EXTERNAL_LINK_PRESENT_EXPR,
  XTERM_ROWS_VISIBLE_EXPR,
  DIFF_ROW_BUTTON_EXPR,
  DIFF_ROW_BUTTON_PRESENT_EXPR,
  DIFF_HEADER_VISIBLE_EXPR,
  DIFF_HEADER_BUTTON_EXPR,
  SHADOW_CHANGE_LINE_PRESENT_EXPR,
  IMAGES_HEADING_PRESENT_EXPR,
  buildThemeCheckScript,
  THEME_CHECK_TOKENS,
  THEME_CHECK_FONT_FAMILIES,
  STOCK_SURFACE_HEX,
};
