'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');

const { loadTheme, ThemeLoadError } = require(path.join('..', '..', 'injector', 'theme-loader', 'index.js'));
const { crc32 } = require(path.join('..', '..', 'injector', 'theme-loader', 'zip.js'));

const REPO_ROOT = path.join(__dirname, '..', '..');
const CAPTAINS_CABIN_DIR = path.join(REPO_ROOT, 'themes', 'captains-cabin');

// The end-to-end check that matters most: the loader's contract, exercised
// against the actual shipped theme rather than a fixture. It covers the real
// generated manifest.json, the real 476 KB theme.css with its three embedded
// font data URIs and its selector escapes, and the real asset byte counts.
test('loadTheme() loads the real themes/captains-cabin directory cleanly', () => {
  const theme = loadTheme(CAPTAINS_CABIN_DIR);
  assert.equal(theme.id, 'captains-cabin');
  assert.equal(theme.sourceKind, 'directory');
  assert.equal(typeof theme.css, 'string');
  assert.ok(theme.css.length > 0);
  assert.ok(theme.assets instanceof Map);
});

// --- directory-sourced fixtures, built in a temp dir per test ---

function makeTempThemeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-theme-loader-'));
  return dir;
}

function writeManifest(dir, overrides = {}) {
  const manifest = Object.assign(
    {
      formatVersion: 1,
      id: 'test-theme',
      name: 'Test Theme',
      version: '0.1.0',
      author: 'test',
      license: 'MIT',
      description: 'A fixture theme.',
      targetApp: 'openai-codex-desktop',
      targetVersionRange: { min: '26.727', max: '27' },
      verifiedAgainst: '26.727.6591.0',
      files: { css: 'theme.css', syntax: 'syntax.json' },
      landmarks: [],
      assets: [],
    },
    overrides
  );
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

test('loadTheme() on a minimal valid directory theme', () => {
  const dir = makeTempThemeDir();
  writeManifest(dir);
  fs.writeFileSync(path.join(dir, 'theme.css'), '.a { color: red; }');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{"keyword":"#000"}');

  const theme = loadTheme(dir);
  assert.equal(theme.id, 'test-theme');
  assert.equal(theme.sourceKind, 'directory');
  assert.equal(theme.css, '.a { color: red; }');
  assert.deepEqual(theme.syntax, { keyword: '#000' });
  assert.equal(theme.assets.size, 0);
});

test('loadTheme() rejects unsafe CSS in a directory theme', () => {
  const dir = makeTempThemeDir();
  writeManifest(dir);
  fs.writeFileSync(path.join(dir, 'theme.css'), '@import url("https://evil.example/x.css");');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{}');

  assert.throws(() => loadTheme(dir), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'CSS_UNSAFE');
    return true;
  });
});

test('loadTheme() verifies asset byte length against the manifest', () => {
  const dir = makeTempThemeDir();
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'hero.webp'), Buffer.alloc(10));
  writeManifest(dir, { assets: [{ path: 'assets/hero.webp', bytes: 999 }] });
  fs.writeFileSync(path.join(dir, 'theme.css'), '.a{color:red}');
  fs.writeFileSync(path.join(dir, 'syntax.json'), '{}');

  assert.throws(() => loadTheme(dir), (err) => {
    assert.equal(err.code, 'MANIFEST_INVALID');
    assert.match(err.message, /disagree about what shipped/);
    return true;
  });
});

test('loadTheme() throws SOURCE_NOT_FOUND for a missing path', () => {
  assert.throws(() => loadTheme(path.join(os.tmpdir(), 'this-does-not-exist-cdx')), (err) => {
    assert.ok(err instanceof ThemeLoadError);
    assert.equal(err.code, 'SOURCE_NOT_FOUND');
    return true;
  });
});

// --- .ccskin (zip)-sourced fixture, built with the same minimal builder as zip.test.js ---

function buildZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const uncompressed = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content || '', 'utf8');
    const method = 8;
    const data = zlib.deflateRawSync(uncompressed);
    const crc = crc32(uncompressed);

    const localHeaderOffset = offset;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, data);
    offset += localHeader.length + nameBuf.length + data.length;

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(localHeaderOffset, 42);

    centralParts.push(centralHeader, nameBuf);
  }

  const localSection = Buffer.concat(localParts);
  const centralSection = Buffer.concat(centralParts);
  const centralDirOffset = localSection.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSection.length, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localSection, centralSection, eocd]);
}

test('loadTheme() loads a minimal .ccskin (zip) theme', () => {
  const manifest = {
    formatVersion: 1,
    id: 'zip-theme',
    name: 'Zip Theme',
    version: '0.1.0',
    author: 'test',
    license: 'MIT',
    description: 'A fixture theme shipped as a zip.',
    targetApp: 'openai-codex-desktop',
    targetVersionRange: { min: '26.727', max: '27' },
    verifiedAgainst: '26.727.6591.0',
    files: { css: 'theme.css', syntax: 'syntax.json' },
    landmarks: [],
    assets: [],
  };
  const zip = buildZip([
    { name: 'manifest.json', content: JSON.stringify(manifest) },
    { name: 'theme.css', content: '.a { color: blue; }' },
    { name: 'syntax.json', content: '{}' },
  ]);
  const dir = makeTempThemeDir();
  const ccskinPath = path.join(dir, 'test.ccskin');
  fs.writeFileSync(ccskinPath, zip);

  const theme = loadTheme(ccskinPath);
  assert.equal(theme.id, 'zip-theme');
  assert.equal(theme.sourceKind, 'ccskin');
  assert.equal(theme.css, '.a { color: blue; }');
});

// --- D-0001-3: a theme DIRECTORY may not smuggle a read out via a symlink ---

test('refuses a theme directory containing a symbolic link', (t) => {
  // The concrete attack this closes: ship `assets/x.woff2` as a link to
  // ~/.codex/auth.json. Every path check passes -- the relative path is safe and
  // it resolves inside the package -- because path validation cannot see through
  // a symlink. Only declining to follow one can. D-0001-3 requires the violation
  // be impossible, not merely avoided.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdx-symlink-'));
  const secret = path.join(dir, 'secret.txt');
  fs.writeFileSync(secret, 'CREDENTIALS');
  const themeDir = path.join(dir, 'theme');
  fs.mkdirSync(path.join(themeDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(themeDir, 'theme.css'), 'a{color:red}');
  fs.writeFileSync(path.join(themeDir, 'syntax.json'), '{}');
  try {
    fs.symlinkSync(secret, path.join(themeDir, 'assets', 'evil.woff2'));
  } catch (err) {
    // Windows refuses file symlinks (EPERM) without Developer Mode or
    // elevation, and this is the primary dev machine -- so fall back to a
    // DIRECTORY JUNCTION, which Windows allows unprivileged and which Node
    // reports as isSymbolicLink() === true. Verified: without the guard the
    // recursive directory walk follows a junction straight through to the
    // linked file, so this exercises the same escape by the same route.
    try {
      fs.symlinkSync(path.dirname(secret), path.join(themeDir, 'assets', 'out'), 'junction');
    } catch (err2) {
      // Only if BOTH fail. Skipping is honest; silently passing would report a
      // security guard as verified when the hostile input was never built.
      t.skip(`cannot create a symlink or junction here (${err.code}/${err2.code}) -- guard NOT exercised`);
      return;
    }
  }
  writeManifest(themeDir, { assets: [{ path: 'assets/evil.woff2', bytes: 11 }] });

  assert.throws(() => loadTheme(themeDir), (err) => {
    assert.equal(err.code, 'MANIFEST_INVALID');
    assert.match(err.message, /symbolic link/);
    return true;
  });
});
