'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  validateManifest,
  compareDottedVersions,
  isVersionInRange,
} = require(path.join('..', '..', 'injector', 'theme-loader', 'manifest.js'));
const { ThemeLoadError } = require(path.join('..', '..', 'injector', 'theme-loader', 'errors.js'));

function baseManifest(overrides = {}) {
  const manifest = {
    formatVersion: 1,
    id: 'captains-cabin',
    name: "Captain's Cabin",
    version: '0.1.0',
    author: 'cchen362',
    license: 'MIT',
    description: 'A captain\'s chart room at night.',
    targetApp: 'openai-codex-desktop',
    targetVersionRange: { min: '26.727', max: '27' },
    verifiedAgainst: '26.727.6591.0',
    files: { css: 'theme.css', syntax: 'syntax.json' },
    landmarks: [
      { name: 'app-shell-left-panel', selector: '.app-shell-left-panel', governedBy: 'D-0001-13', required: true },
    ],
    assets: [{ path: 'assets/hero-empty-state.webp', bytes: 127046 }],
  };
  return Object.assign(manifest, overrides);
}

function assertThemeLoadError(fn, codeExpected) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ThemeLoadError, 'expected a ThemeLoadError');
    assert.equal(err.code, codeExpected);
    return true;
  });
}

test('a valid manifest validates cleanly', () => {
  const manifest = baseManifest();
  assert.equal(validateManifest(manifest), manifest);
});

const requiredFields = [
  'formatVersion',
  'id',
  'name',
  'version',
  'author',
  'license',
  'description',
  'targetApp',
  'targetVersionRange',
  'verifiedAgainst',
  'files',
  'landmarks',
  'assets',
];

for (const field of requiredFields) {
  test(`missing required field "${field}" is rejected`, () => {
    const manifest = baseManifest();
    delete manifest[field];
    assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
  });
}

test('bad formatVersion is rejected with a forward/backward-compat message', () => {
  const manifest = baseManifest({ formatVersion: 2 });
  assert.throws(() => validateManifest(manifest), (err) => {
    assert.equal(err.code, 'MANIFEST_INVALID');
    assert.match(err.message, /newer or.*older/i);
    return true;
  });
});

test('non-integer formatVersion is rejected', () => {
  assertThemeLoadError(() => validateManifest(baseManifest({ formatVersion: '1' })), 'MANIFEST_INVALID');
});

test('bad id (uppercase) is rejected', () => {
  assertThemeLoadError(() => validateManifest(baseManifest({ id: 'Captains-Cabin' })), 'MANIFEST_INVALID');
});

test('bad id (path traversal attempt) is rejected', () => {
  assertThemeLoadError(() => validateManifest(baseManifest({ id: '../../etc/passwd' })), 'MANIFEST_INVALID');
});

test('unknown top-level key is rejected', () => {
  assertThemeLoadError(() => validateManifest(baseManifest({ extraTypo: true })), 'MANIFEST_INVALID');
});

test('asset byte mismatch is caught by the loader, not manifest validation alone (shape only here)', () => {
  // manifest.js validates SHAPE only (path safety + non-negative integer);
  // the actual byte-length cross-check against packaged content happens in
  // injector/theme-loader/index.js, exercised in loader.test.js.
  const manifest = baseManifest({ assets: [{ path: 'assets/x.webp', bytes: -1 }] });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

test('asset path traversal is rejected', () => {
  const manifest = baseManifest({ assets: [{ path: '../outside.webp', bytes: 10 }] });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

test('targetVersionRange min >= max is rejected', () => {
  const manifest = baseManifest({ targetVersionRange: { min: '27', max: '26.727' } });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

test('landmark with unknown key is rejected', () => {
  const manifest = baseManifest({
    landmarks: [{ name: 'x', selector: '.x', bogus: true }],
  });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

test('landmark governedBy must look like D-<plan>-<n>', () => {
  const manifest = baseManifest({
    landmarks: [{ name: 'x', selector: '.x', governedBy: 'not-a-marker' }],
  });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

test('files with unknown key is rejected', () => {
  const manifest = baseManifest({ files: { css: 'theme.css', syntax: 'syntax.json', extra: 'x' } });
  assertThemeLoadError(() => validateManifest(manifest), 'MANIFEST_INVALID');
});

// --- dotted-numeric comparator ---

test('compareDottedVersions: equal versions', () => {
  assert.equal(compareDottedVersions('1.2.3', '1.2.3'), 0);
});

test('compareDottedVersions: real four-component Codex version', () => {
  assert.equal(compareDottedVersions('26.727.6591.0', '26.727'), 1);
  assert.equal(compareDottedVersions('26.727', '26.727.6591.0'), -1);
});

test('compareDottedVersions: missing components treated as 0', () => {
  assert.equal(compareDottedVersions('27', '27.0.0.0'), 0);
  assert.equal(compareDottedVersions('26.9', '26.10'), -1);
});

test('isVersionInRange: min inclusive, max exclusive', () => {
  const range = { min: '26.727', max: '27' };
  assert.equal(isVersionInRange('26.727', range), true);
  assert.equal(isVersionInRange('26.727.6591.0', range), true);
  assert.equal(isVersionInRange('27', range), false);
  assert.equal(isVersionInRange('26.726.9999', range), false);
});
