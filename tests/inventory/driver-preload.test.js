'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Script } = require('node:vm');

const {
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
} = require(path.join('..', '..', 'tools', 'inventory', 'driver-preload.js'));

// ---------------------------------------------------------------------
// isMainWindowUrl — pure, no Electron, previously untested.
// ---------------------------------------------------------------------

test('isMainWindowUrl accepts the main app URL with no initialRoute', () => {
  assert.equal(isMainWindowUrl('app://-/index.html'), true);
});

test('isMainWindowUrl rejects a URL carrying initialRoute', () => {
  assert.equal(isMainWindowUrl('app://-/index.html?initialRoute=%2Fsettings'), false);
});

test('isMainWindowUrl rejects other windows and empty/undefined input', () => {
  assert.equal(isMainWindowUrl('app://-/avatar-overlay.html'), false);
  assert.equal(isMainWindowUrl(''), false);
  assert.equal(isMainWindowUrl(null), false);
  assert.equal(isMainWindowUrl(undefined), false);
});

// ---------------------------------------------------------------------
// pickMenuItemExpr / homeToggleButtonExpr — sanity that the target name is
// actually embedded in the generated finder expression.
// ---------------------------------------------------------------------

test('pickMenuItemExpr embeds its target as a JSON string literal', () => {
  const expr = pickMenuItemExpr('Codex');
  assert.ok(expr.includes('"Codex"'));
  assert.doesNotThrow(() => new Script('(' + expr + ')'));
});

test('homeToggleButtonExpr embeds its target as a JSON string literal', () => {
  const expr = homeToggleButtonExpr('Work');
  assert.ok(expr.includes('"Work"'));
  assert.doesNotThrow(() => new Script('(' + expr + ')'));
});

// ---------------------------------------------------------------------
// buildThemeCheckScript — Plan 0004 M2. The generated in-page script lives
// inside a string (built by array.join, not a template literal — see the
// function's own header for why) that this repo's own `node --check` cannot
// see into, exactly the trap probe.test.js's own header describes for
// buildProbeScript(). Compiled here for the same reason.
// ---------------------------------------------------------------------

test('buildThemeCheckScript() returns a string that compiles as valid JavaScript', () => {
  const script = buildThemeCheckScript();
  assert.equal(typeof script, 'string');
  assert.doesNotThrow(() => new Script(script));
});

test('buildThemeCheckScript() reads the OWL-era root attributes and every declared token', () => {
  const script = buildThemeCheckScript();
  assert.ok(script.includes('data-theme'), 'expected data-theme to be read');
  assert.ok(script.includes('data-codex-window-type'), 'expected data-codex-window-type to be read');
  for (const token of THEME_CHECK_TOKENS) {
    assert.ok(script.includes(token), `expected token ${token} to appear in the generated script`);
  }
});

test('buildThemeCheckScript() checks every required shipped font family', () => {
  const script = buildThemeCheckScript();
  for (const family of THEME_CHECK_FONT_FAMILIES) {
    assert.ok(script.includes(family), `expected font family ${family} to appear in the generated script`);
  }
  // fonts.check() alone cannot distinguish "loadable" from "undeclared" —
  // both a FontFace census and the boolean check must be present.
  assert.ok(script.includes('document.fonts.check'));
  assert.ok(script.includes('document.fonts.forEach'));
});

test('buildThemeCheckScript() samples the sidebar, active row, composer and heading landmarks', () => {
  const script = buildThemeCheckScript();
  assert.ok(script.includes('.app-shell-left-panel'));
  assert.ok(script.includes('data-app-action-sidebar-thread-active'));
  assert.ok(script.includes('.ProseMirror'));
  assert.ok(script.includes('.heading-xl'));
  assert.ok(script.includes('--codex-titlebar-tint'));
});

test('buildThemeCheckScript() contains no doubled backslash (a sign of an escaped regex)', () => {
  const script = buildThemeCheckScript();
  // This repo's array.join convention for generated in-page scripts exists
  // precisely to avoid the doubled-backslash regex-escaping hazard probe.js's
  // own template-literal approach carries (see this function's own header).
  // Alpha/quote handling here is plain string operations instead, so no
  // backslash of any kind should ever appear in the generated source.
  assert.equal(script.indexOf('\\'), -1, 'expected no backslash characters in the generated script');
});

// ---------------------------------------------------------------------
// STOCK_SURFACE_HEX — the values waitForThemedSurface() polls against.
// ---------------------------------------------------------------------

test('STOCK_SURFACE_HEX carries the measured OWL stock values for both modes', () => {
  assert.equal(STOCK_SURFACE_HEX.dark, '#111111');
  assert.equal(STOCK_SURFACE_HEX.light, '#ffffff');
});

// ---------------------------------------------------------------------
// pollUntil — generic predicate poller shared by every new wait spot.
// ---------------------------------------------------------------------

test('pollUntil resolves as soon as the predicate turns truthy', async () => {
  let calls = 0;
  const result = await pollUntil(() => {
    calls++;
    return calls >= 3;
  }, 2000, 1);
  assert.equal(result, true);
  assert.equal(calls, 3);
});

test('pollUntil gives up after timeoutMs and returns the last falsy result', async () => {
  const result = await pollUntil(() => false, 50, 10);
  assert.equal(result, false);
});

// ---------------------------------------------------------------------
// findMenuItemByLabel — pure recursive finder over a plain
// { items: [{ label, submenu: { items } }] } shape (Plan 0004 M3).
// ---------------------------------------------------------------------

test('findMenuItemByLabel finds an item nested at depth 2 (inside a submenu)', () => {
  const menu = {
    items: [
      { label: 'File' },
      {
        label: 'View',
        submenu: {
          items: [
            { label: 'Reload' },
            { label: 'Open Terminal' },
          ],
        },
      },
    ],
  };
  const found = findMenuItemByLabel(menu, 'Open Terminal');
  assert.ok(found);
  assert.equal(found.label, 'Open Terminal');
});

test('findMenuItemByLabel returns null when the label is not present anywhere', () => {
  const menu = { items: [{ label: 'File' }, { label: 'View', submenu: { items: [{ label: 'Reload' }] } }] };
  assert.equal(findMenuItemByLabel(menu, 'Toggle Nonexistent Panel'), null);
});

test('findMenuItemByLabel returns null for a missing/empty menu without throwing', () => {
  assert.equal(findMenuItemByLabel(null, 'Anything'), null);
  assert.equal(findMenuItemByLabel({ items: [] }, 'Anything'), null);
});

test('findMenuItemByLabel: first match wins (a top-level match beats a same-labelled nested one)', () => {
  const nested = { label: 'Duplicate' };
  const menu = {
    items: [
      { label: 'Duplicate', marker: 'top-level' },
      { label: 'View', submenu: { items: [nested] } },
    ],
  };
  const found = findMenuItemByLabel(menu, 'Duplicate');
  assert.equal(found.marker, 'top-level');
  assert.notEqual(found, nested);
});

// ---------------------------------------------------------------------
// setThemeScript — Plan 0004 M3 addendum: also rewrites every OTHER
// [data-theme] element, not just <html>.
// ---------------------------------------------------------------------

test('setThemeScript() compiles and rewrites both <html> and inner [data-theme] scopes', () => {
  const script = setThemeScript('light');
  assert.doesNotThrow(() => new Script(script));
  assert.ok(script.includes('"light"'));
  assert.ok(script.includes('document.documentElement.dataset.theme'));
  assert.ok(script.includes('querySelectorAll("[data-theme]")'));
  assert.ok(script.includes('innerScopesRewritten'));
});

// ---------------------------------------------------------------------
// New Plan 0004 M3 in-page finder expressions / builders — each must
// compile as a standalone JS expression, same discipline as the M1/M2
// exprs above.
// ---------------------------------------------------------------------

test('every new M3 finder expression compiles as valid JavaScript', () => {
  const exprs = [
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
  ];
  for (const expr of exprs) {
    assert.equal(typeof expr, 'string');
    assert.doesNotThrow(() => new Script('(' + expr + ')'), `expected "${expr}" to compile`);
  }
});

test('sidebarNavItemExpr() embeds its target and compiles', () => {
  const expr = sidebarNavItemExpr('Images');
  assert.ok(expr.includes('"Images"'));
  assert.doesNotThrow(() => new Script('(' + expr + ')'));
});

test('nthElementExpr() embeds the index and the collection expression, and compiles', () => {
  const expr = nthElementExpr(THREAD_ROWS_ARRAY_EXPR, 3);
  assert.ok(expr.includes('list[3]'));
  assert.doesNotThrow(() => new Script('(' + expr + ')'));
});

test('firstThreadRowByWorkBadgeExpr() compiles for both true and false and embeds "Work"', () => {
  const withWork = firstThreadRowByWorkBadgeExpr(true);
  const withoutWork = firstThreadRowByWorkBadgeExpr(false);
  assert.ok(withWork.includes('"Work"'));
  assert.ok(withoutWork.includes('"Work"'));
  assert.doesNotThrow(() => new Script('(' + withWork + ')'));
  assert.doesNotThrow(() => new Script('(' + withoutWork + ')'));
  assert.notEqual(withWork, withoutWork);
});

test('terminalMountedUnderExpr() and diffMountedUnderExpr() compile', () => {
  assert.doesNotThrow(() => new Script('(' + terminalMountedUnderExpr() + ')'));
  assert.doesNotThrow(() => new Script('(' + diffMountedUnderExpr() + ')'));
});

// ---------------------------------------------------------------------
// buildThemeCheckScript() — Plan 0004 M3 additions (updatePill,
// innerThemeScopes, externalLinks, terminal, diff).
// ---------------------------------------------------------------------

test('buildThemeCheckScript() still compiles with the M3 additions', () => {
  const script = buildThemeCheckScript();
  assert.doesNotThrow(() => new Script(script));
});

test('buildThemeCheckScript() reads the M3 landmarks and returns the M3 fields', () => {
  const script = buildThemeCheckScript();
  assert.ok(script.includes('button[aria-label="Update"]'));
  assert.ok(script.includes('innerThemeScopes'));
  assert.ok(script.includes('externalLinks'));
  assert.ok(script.includes('.xterm-rows'));
  assert.ok(script.includes('data-line-type'));
  assert.ok(script.includes('shadowCss'));
  assert.ok(script.includes('adoptedStyleSheets'));
  assert.ok(script.includes('updatePill:'));
  assert.ok(script.includes('terminal:'));
  assert.ok(script.includes('diff:'));
});

test('buildThemeCheckScript() still contains no backslash after the M3 additions', () => {
  const script = buildThemeCheckScript();
  assert.equal(script.indexOf('\\'), -1, 'expected no backslash characters in the generated script');
});

// ---------------------------------------------------------------------
// isPointInViewport — orchestrator QA fix: refuse a click computed outside
// the page's own viewport instead of firing sendInputEvent blind.
// ---------------------------------------------------------------------

test('isPointInViewport accepts a point inside the viewport', () => {
  assert.equal(isPointInViewport({ x: 100, y: 200 }, 1280, 800), true);
});

test('isPointInViewport rejects a point below the fold (the measured ChatGPT Recents-row case)', () => {
  // Measured: a Recents row resolved to y≈1613 on a 1382px-tall window.
  assert.equal(isPointInViewport({ x: 150, y: 1613 }, 1280, 1382), false);
  assert.equal(isPointInViewport({ x: 150, y: 1613 }, 1280, 1700), true);
});

test('isPointInViewport rejects negative coordinates and coordinates at/after the edge', () => {
  assert.equal(isPointInViewport({ x: -1, y: 10 }, 1280, 800), false);
  assert.equal(isPointInViewport({ x: 10, y: -1 }, 1280, 800), false);
  assert.equal(isPointInViewport({ x: 1280, y: 10 }, 1280, 800), false);
  assert.equal(isPointInViewport({ x: 10, y: 800 }, 1280, 800), false);
});

test('isPointInViewport rejects a missing/malformed point or viewport without throwing', () => {
  assert.equal(isPointInViewport(null, 1280, 800), false);
  assert.equal(isPointInViewport({}, 1280, 800), false);
  assert.equal(isPointInViewport({ x: 10, y: 10 }, null, 800), false);
  assert.equal(isPointInViewport({ x: 10, y: 10 }, 1280, undefined), false);
});

// ---------------------------------------------------------------------
// rowAtIndexActiveExpr / firstThreadRowIndexByWorkBadgeExpr — orchestrator
// QA fix: verifying "some row is active" is wrong (true from a PREVIOUS
// scenario's still-open thread); every row-click verification must check
// the SPECIFIC clicked row by its index into the same filtered list used
// to click it.
// ---------------------------------------------------------------------

test('rowAtIndexActiveExpr() embeds the index and compiles', () => {
  const expr = rowAtIndexActiveExpr(4);
  assert.ok(expr.includes('list[4]'));
  assert.doesNotThrow(() => new Script('(' + expr + ')'));
});

test('rowAtIndexActiveExpr() checks the row itself, its descendants, AND its closest role/data-theme ancestor, by either marker', () => {
  const expr = rowAtIndexActiveExpr(0);
  assert.ok(expr.includes('data-app-action-sidebar-thread-active'));
  assert.ok(expr.includes('aria-current'));
  assert.ok(expr.includes('querySelectorAll("*")'), 'expected a descendant search');
  assert.ok(expr.includes('.closest('), 'expected an ancestor search via closest()');
  assert.ok(expr.includes('role="button"'));
  assert.ok(expr.includes('data-theme'));
});

// ---------------------------------------------------------------------
// buildRowDiagnosticsScript — orchestrator QA fix #2: record state on a
// row-open verification failure instead of re-probing it afterward.
// ---------------------------------------------------------------------

test('buildRowDiagnosticsScript() compiles for a real index and for -1 (no row resolved)', () => {
  assert.doesNotThrow(() => new Script(buildRowDiagnosticsScript(3)));
  assert.doesNotThrow(() => new Script(buildRowDiagnosticsScript(-1)));
  assert.doesNotThrow(() => new Script(buildRowDiagnosticsScript(undefined)));
});

test('buildRowDiagnosticsScript() reads the row, up to 3 attributed descendants, header title, app mode and home toggle', () => {
  const script = buildRowDiagnosticsScript(2);
  assert.ok(script.includes('rowAttrs'));
  assert.ok(script.includes('descendants'));
  assert.ok(script.includes('descendants.length < 3'));
  assert.ok(script.includes('k !== "class"'));
  assert.ok(script.includes('headerTitle'));
  assert.ok(script.includes('hr.top < 0 || hr.top >= 90'));
  assert.ok(script.includes('appModeLabel'));
  assert.ok(script.includes('homeModeTogglePresent'));
  assert.ok(script.includes('home-mode-toggle'));
});

test('buildRowDiagnosticsScript(-1) never resolves a row (null, not an out-of-range index lookup)', () => {
  const script = buildRowDiagnosticsScript(-1);
  assert.ok(script.includes('var row = null;'));
});

test('firstThreadRowIndexByWorkBadgeExpr() compiles for both true and false and embeds "Work"', () => {
  const withWork = firstThreadRowIndexByWorkBadgeExpr(true);
  const withoutWork = firstThreadRowIndexByWorkBadgeExpr(false);
  assert.ok(withWork.includes('"Work"'));
  assert.ok(withoutWork.includes('"Work"'));
  assert.doesNotThrow(() => new Script('(' + withWork + ')'));
  assert.doesNotThrow(() => new Script('(' + withoutWork + ')'));
  assert.notEqual(withWork, withoutWork);
});
