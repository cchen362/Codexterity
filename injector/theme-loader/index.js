'use strict';

/**
 * Codexterity — theme loader (Phase 4 M1, D-0001-4)
 * -----------------------------------------------------
 * Loads a Codexterity theme package from either a directory or a `.ccskin`
 * zip, validates its manifest.json strictly (manifest.js), runs its
 * theme.css through the safe-CSS scanner (safe-css.js), and enforces the
 * 32 MiB (33,554,432 byte) package size cap (D-0001-4) on both source
 * kinds. CommonJS throughout — the whole `injector/` tree is `--require`d
 * into Codex's Electron main process (D-0001-1), which loads it as CJS.
 *
 * D-0003-9 (Plan 0003 M6) — asset BYTES are opt-in. Plan 0003 M6 measured
 * that this loader was reading 328,622 bytes of raw font/hero assets into
 * Codex's own Electron main process on every single launch, and that
 * `injector/core/inject.js` — the only code that runs inside Codex — never
 * reads `activeTheme.assets` at all: the fonts and hero that actually paint
 * are the base64 copies already embedded in `theme.css`, which this loader
 * reads, CRC-checks (via the zip path) and safe-CSS-scans unconditionally,
 * every load, regardless of asset mode. The only consumer anywhere of the
 * raw asset bytes is `cdx verify` (injector/cli.js), summing their lengths
 * for one summary line. So: `loadTheme(source, options)` now takes
 * `options.assets`, `'lazy'` (the default) or `'eager'`. Lazy skips
 * decompressing/reading the asset bytes themselves but MUST NOT skip the
 * manifest/package byte-count integrity check (D-0001-4/D-0001-21) — that
 * check only ever compared LENGTHS, never contents, and a length is
 * obtainable without materialising anything (an `lstat` for a directory
 * source, the zip central directory's `uncompressedSize` for a `.ccskin`),
 * so it still runs on every load, lazy or eager. What laziness defers is
 * strictly the CRC-32 check and the inflate of asset bytes nobody in the
 * running app reads.
 *
 * Public API: `loadTheme(source, options)` — see the exported function's
 * own doc comment below for the return shape and failure modes.
 */

const fs = require('fs');
const path = require('path');

const { ThemeLoadError } = require('./errors.js');
const { validateManifest } = require('./manifest.js');
const { findCssViolations } = require('./safe-css.js');
const { readZip } = require('./zip.js');
const { isSafeRelativePath } = require('./path-safety.js');

// D-0001-4: the package size cap, in bytes. 32 * 1024 * 1024.
const MAX_PACKAGE_BYTES = 33554432;

function fail(code, message) {
  throw new ThemeLoadError(code, message);
}

function formatCssViolations(violations) {
  return violations
    .map((v) => `  line ${v.line} (offset ${v.offset}): ${v.message}`)
    .join('\n');
}

function assertCssSafe(cssText, cssLabel) {
  const violations = findCssViolations(cssText);
  if (violations.length > 0) {
    const error = new ThemeLoadError(
      'CSS_UNSAFE',
      `${cssLabel} failed the safe-CSS scan (D-0001-4), ${violations.length} violation(s):\n${formatCssViolations(violations)}`
    );
    error.violations = violations;
    throw error;
  }
}

function parseJson(text, label, code) {
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(code, `${label} is not valid JSON: ${err.message}`);
  }
}

// ---------------------------------------------------------------------
// Directory-sourced themes
// ---------------------------------------------------------------------

/**
 * Recursively sum the byte size of every file under `dir`, and enforce the
 * package cap AS we sum rather than after — a directory of many large
 * files should fail as soon as the running total crosses the cap, not
 * after every file has already been statted and read into memory.
 */
function sumDirectorySize(dir) {
  let total = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    // D-0001-3 — a symlink anywhere inside a theme directory is REFUSED, never
    // followed. This is the non-destructive boundary made structural rather
    // than merely intended: without it a theme package could ship
    // `assets/x.woff2` as a symlink to ~/.codex/auth.json, and the loader would
    // dutifully read the credential file into the assets map, having passed
    // every path check — the relative path is safe, and it resolves inside the
    // package. Path validation cannot see through a symlink; only refusing to
    // follow one can. `readdirSync` does not follow links, so a symlink reports
    // isFile() === false, which is why this is an explicit rejection and not a
    // silent skip: skipping would leave a manifest-declared asset mysteriously
    // "missing" instead of naming the real problem.
    if (entry.isSymbolicLink()) {
      const where = entry.parentPath || entry.path || dir;
      fail(
        'MANIFEST_INVALID',
        `theme directory contains a symbolic link at "${path.join(where, entry.name)}". ` +
          'Codexterity never follows links out of a theme package (D-0001-3); replace it with a real file.'
      );
    }
    if (!entry.isFile()) continue;
    const entryDir = entry.parentPath || entry.path || dir;
    const fullPath = path.join(entryDir, entry.name);
    total += fs.statSync(fullPath).size;
    if (total > MAX_PACKAGE_BYTES) {
      fail('SIZE_EXCEEDED', `theme directory "${dir}" exceeds the ${MAX_PACKAGE_BYTES}-byte package cap (D-0001-4)`);
    }
  }
  return total;
}

/**
 * `lstat` a file that a manifest declared, refusing anything that is not a
 * plain regular file, and return its byte size WITHOUT reading its content.
 * `lstat`, never `stat`: the whole point is to see the link itself rather
 * than what it points at (D-0001-3, and see sumDirectorySize). The check is
 * repeated here rather than trusted from the directory scan because the
 * scan and this call are separate filesystem observations.
 *
 * This is the D-0003-9 primitive that makes lazy asset loading possible: a
 * declared byte count is obtainable — and the symlink/regular-file guard
 * enforceable — from an `lstat`, with no `readFileSync` at all.
 */
function statPackageFile(fullPath, declaredAs, label) {
  let stat;
  try {
    stat = fs.lstatSync(fullPath);
  } catch (err) {
    fail('MANIFEST_INVALID', `manifest.json declares ${label} = "${declaredAs}" but that file does not exist in the package`);
  }
  if (stat.isSymbolicLink()) {
    fail(
      'MANIFEST_INVALID',
      `manifest.json declares ${label} = "${declaredAs}", which is a symbolic link. ` +
        'Codexterity never follows links out of a theme package (D-0001-3).'
    );
  }
  if (!stat.isFile()) {
    fail('MANIFEST_INVALID', `manifest.json declares ${label} = "${declaredAs}" but that path is not a regular file`);
  }
  return stat.size;
}

/**
 * Read a file that a manifest declared, refusing anything that is not a
 * plain regular file. Built on `statPackageFile` so the symlink/regular-file
 * guard is asserted exactly once and shared with the lazy asset-size path.
 */
function readPackageFile(fullPath, declaredAs, label, encoding) {
  statPackageFile(fullPath, declaredAs, label);
  return encoding ? fs.readFileSync(fullPath, encoding) : fs.readFileSync(fullPath);
}

/**
 * Resolve a manifest-declared relative path against the theme directory,
 * re-checking safety here (defense in depth: manifest.js already validated
 * the shape, but this is the function that actually touches the
 * filesystem, so it re-asserts the invariant it depends on rather than
 * trusting a caller several frames away).
 */
function resolveInDirectory(themeDir, relativePath, label) {
  if (!isSafeRelativePath(relativePath)) {
    fail('MANIFEST_INVALID', `${label} ("${relativePath}") is not a safe relative path`);
  }
  const resolved = path.resolve(themeDir, relativePath);
  const themeDirResolved = path.resolve(themeDir);
  if (resolved !== themeDirResolved && !resolved.startsWith(themeDirResolved + path.sep)) {
    fail('MANIFEST_INVALID', `${label} ("${relativePath}") resolves outside the theme package`);
  }
  return resolved;
}

function loadFromDirectory(themeDir, assetsMode) {
  const eager = assetsMode === 'eager';

  sumDirectorySize(themeDir);

  const manifestPath = path.join(themeDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    fail('MANIFEST_INVALID', `theme directory "${themeDir}" has no manifest.json`);
  }
  const manifestText = fs.readFileSync(manifestPath, 'utf8');
  const manifest = validateManifest(parseJson(manifestText, 'manifest.json', 'MANIFEST_INVALID'));

  const cssPath = resolveInDirectory(themeDir, manifest.files.css, 'manifest.json: files.css');
  const css = readPackageFile(cssPath, manifest.files.css, 'files.css', 'utf8');
  assertCssSafe(css, `${manifest.files.css}`);

  const syntaxPath = resolveInDirectory(themeDir, manifest.files.syntax, 'manifest.json: files.syntax');
  const syntaxText = readPackageFile(syntaxPath, manifest.files.syntax, 'files.syntax', 'utf8');
  const syntax = parseJson(syntaxText, manifest.files.syntax, 'MANIFEST_INVALID');

  // D-0003-9 — `assetSizes` is populated in BOTH modes (it is the cheap
  // half of the integrity check: an `lstat`, not a read). `assetBuffers`
  // stays `null` in lazy mode; `loadTheme` turns that `null` into a
  // throwing accessor rather than an empty Map, so a caller that reads
  // `.assets` after a lazy load fails loudly instead of silently summing
  // zero.
  const assetSizes = new Map();
  const assetBuffers = eager ? new Map() : null;
  for (const asset of manifest.assets) {
    const assetPath = resolveInDirectory(themeDir, asset.path, 'manifest.json: assets[].path');
    if (eager) {
      const buffer = readPackageFile(assetPath, asset.path, `assets[].path`, null);
      if (buffer.length !== asset.bytes) {
        fail(
          'MANIFEST_INVALID',
          `manifest.json declares asset "${asset.path}" as ${asset.bytes} bytes, but the file is ${buffer.length} bytes — the package and its manifest disagree about what shipped`
        );
      }
      assetSizes.set(asset.path, buffer.length);
      assetBuffers.set(asset.path, buffer);
    } else {
      const size = statPackageFile(assetPath, asset.path, `assets[].path`);
      if (size !== asset.bytes) {
        fail(
          'MANIFEST_INVALID',
          `manifest.json declares asset "${asset.path}" as ${asset.bytes} bytes, but the file is ${size} bytes — the package and its manifest disagree about what shipped`
        );
      }
      assetSizes.set(asset.path, size);
    }
  }

  return { manifest, css, syntax, assetSizes, assetBuffers };
}

// ---------------------------------------------------------------------
// .ccskin (zip) sourced themes
// ---------------------------------------------------------------------

function loadFromCcskin(ccskinPath, assetsMode) {
  const eager = assetsMode === 'eager';

  const fileSize = fs.statSync(ccskinPath).size;
  if (fileSize > MAX_PACKAGE_BYTES) {
    fail('SIZE_EXCEEDED', `"${ccskinPath}" is ${fileSize} bytes, exceeding the ${MAX_PACKAGE_BYTES}-byte package cap (D-0001-4)`);
  }
  const buf = fs.readFileSync(ccskinPath);

  // D-0003-9 — two passes over the SAME buffer, deliberately. `manifest.json`
  // is the only entry whose name we know before we have read anything: the
  // names of `files.css`, `files.syntax`, and every `assets[].path` are
  // themselves fields INSIDE the manifest, so a single pass cannot know what
  // to inflate until the manifest has already been parsed. Both passes
  // re-walk the central directory (cheap: no decompression happens for an
  // unselected entry) rather than decompress speculatively.
  const manifestPass = readZip(buf, {
    maxTotalBytes: MAX_PACKAGE_BYTES,
    inflate: (name) => name === 'manifest.json',
  });
  const manifestBuffer = manifestPass.files.get('manifest.json');
  if (!manifestBuffer) {
    fail('MANIFEST_INVALID', `"${ccskinPath}" has no manifest.json at its root`);
  }
  const manifest = validateManifest(parseJson(manifestBuffer.toString('utf8'), 'manifest.json', 'MANIFEST_INVALID'));

  // Second pass: css and syntax are read (and safe-CSS-scanned / JSON-parsed)
  // on EVERY load, lazy or eager — those are the bytes that actually reach
  // Codex, embedded in theme.css itself. Assets are inflated only when this
  // load asked for them eagerly (D-0003-9).
  const neededNames = new Set([manifest.files.css, manifest.files.syntax]);
  const pass = readZip(buf, {
    maxTotalBytes: MAX_PACKAGE_BYTES,
    inflate: eager ? () => true : (name) => neededNames.has(name),
  });
  const files = pass.files;
  const sizes = pass.sizes;

  function getEntry(relativePath, label) {
    if (!isSafeRelativePath(relativePath)) {
      fail('MANIFEST_INVALID', `${label} ("${relativePath}") is not a safe relative path`);
    }
    const buffer = files.get(relativePath);
    if (!buffer) {
      fail('MANIFEST_INVALID', `${label} declares "${relativePath}" but that entry does not exist in the .ccskin`);
    }
    return buffer;
  }

  const cssBuffer = getEntry(manifest.files.css, 'manifest.json: files.css');
  const css = cssBuffer.toString('utf8');
  assertCssSafe(css, manifest.files.css);

  const syntaxBuffer = getEntry(manifest.files.syntax, 'manifest.json: files.syntax');
  const syntax = parseJson(syntaxBuffer.toString('utf8'), manifest.files.syntax, 'MANIFEST_INVALID');

  // D-0003-9 — the manifest/package byte-count integrity check (D-0001-4 /
  // D-0001-21) runs on EVERY load, lazy or eager: `sizes` carries the
  // central directory's `uncompressedSize` for every entry regardless of
  // whether it was inflated, so the comparison against `asset.bytes` never
  // needs the entry's actual content. Only `assetBuffers` — the thing
  // nothing inside Codex ever reads — is conditional on `eager`.
  const assetSizes = new Map();
  const assetBuffers = eager ? new Map() : null;
  for (const asset of manifest.assets) {
    const label = 'manifest.json: assets[].path';
    if (!isSafeRelativePath(asset.path)) {
      fail('MANIFEST_INVALID', `${label} ("${asset.path}") is not a safe relative path`);
    }
    const size = sizes.get(asset.path);
    if (size === undefined) {
      fail('MANIFEST_INVALID', `${label} declares "${asset.path}" but that entry does not exist in the .ccskin`);
    }
    if (size !== asset.bytes) {
      fail(
        'MANIFEST_INVALID',
        `manifest.json declares asset "${asset.path}" as ${asset.bytes} bytes, but the packaged entry is ${size} bytes — the package and its manifest disagree about what shipped`
      );
    }
    assetSizes.set(asset.path, size);
    if (eager) {
      assetBuffers.set(asset.path, files.get(asset.path));
    }
  }

  return { manifest, css, syntax, assetSizes, assetBuffers };
}

/**
 * Load and fully validate a Codexterity theme package.
 *
 * @param {string} source - path to either a theme DIRECTORY or a `.ccskin`
 *   FILE. Detected by `fs.statSync`, never by file extension.
 * @param {object} [options]
 * @param {'lazy'|'eager'} [options.assets='lazy'] - D-0003-9. `'lazy'` (the
 *   default) skips decompressing/reading the actual asset bytes — the
 *   manifest/package byte-count check still runs regardless, so a package
 *   that lies about an asset's size still fails identically either way.
 *   `'eager'` reads and CRC-verifies every declared asset, as this function
 *   always did before D-0003-9. Pass `'eager'` only from the one caller
 *   whose job is to prove a package's bytes intact (`cdx verify`); nothing
 *   inside Codex's own process needs the raw asset bytes at all.
 * @returns {{ id: string, manifest: object, css: string, syntax: object,
 *   assetSizes: Map<string, number>, assets: Map<string, Buffer>,
 *   sourceKind: 'directory'|'ccskin', sourcePath: string }}
 *   `assetSizes` is always a real Map, in both modes. `assets` is a real Map
 *   only when `options.assets === 'eager'`; under the default `'lazy'` mode
 *   it is a GETTER that THROWS when read, naming the fix, rather than
 *   returning an empty Map — a silently-empty Map would let a future caller
 *   compute a wrong total (e.g. "0 bytes of assets") that looks like a real
 *   answer instead of a caller that forgot to opt in.
 * @throws {ThemeLoadError} with a machine-readable `code`
 *   (MANIFEST_INVALID, CSS_UNSAFE, SIZE_EXCEEDED, ZIP_MALFORMED,
 *   SOURCE_NOT_FOUND) and a human-readable `message` naming the offending
 *   file and, for CSS, the line.
 */
function loadTheme(source, options = {}) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError('loadTheme(source): source must be a non-empty path string');
  }
  const assetsMode = options.assets === undefined ? 'lazy' : options.assets;
  if (assetsMode !== 'lazy' && assetsMode !== 'eager') {
    throw new TypeError(`loadTheme(source, options): options.assets must be 'lazy' or 'eager' (got ${JSON.stringify(options.assets)})`);
  }

  let stat;
  try {
    stat = fs.statSync(source);
  } catch (err) {
    fail('SOURCE_NOT_FOUND', `theme source "${source}" does not exist or is not readable: ${err.message}`);
  }

  const sourcePath = path.resolve(source);
  let result;
  let sourceKind;

  if (stat.isDirectory()) {
    sourceKind = 'directory';
    result = loadFromDirectory(sourcePath, assetsMode);
  } else if (stat.isFile()) {
    sourceKind = 'ccskin';
    result = loadFromCcskin(sourcePath, assetsMode);
  } else {
    fail('SOURCE_NOT_FOUND', `theme source "${source}" is neither a directory nor a regular file`);
  }

  const theme = {
    id: result.manifest.id,
    manifest: result.manifest,
    css: result.css,
    syntax: result.syntax,
    assetSizes: result.assetSizes,
    sourceKind,
    sourcePath,
  };

  // D-0003-9 — `assets` is a getter, not a plain property, precisely so a
  // lazy load can fail loudly the moment something reads it instead of
  // handing back a Map that is empty for the wrong reason.
  Object.defineProperty(theme, 'assets', {
    enumerable: true,
    configurable: false,
    get() {
      if (result.assetBuffers === null) {
        throw new Error(
          'theme.assets: asset bytes were not read; call loadTheme(source, { assets: \'eager\' }) to load them.'
        );
      }
      return result.assetBuffers;
    },
  });

  return theme;
}

module.exports = { loadTheme, ThemeLoadError, MAX_PACKAGE_BYTES };
