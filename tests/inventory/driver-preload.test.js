'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Script } = require('node:vm');

const {
  isMainWindowUrl,
  pickMenuItemExpr,
  homeToggleButtonExpr,
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
