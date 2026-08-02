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
 * Read a file that a manifest declared, refusing anything that is not a plain
 * regular file. `lstat`, never `stat`: the whole point is to see the link
 * itself rather than what it points at (D-0001-3, and see sumDirectorySize).
 * The check is repeated here rather than trusted from the directory scan
 * because the scan and the read are separate filesystem observations.
 */
function readPackageFile(fullPath, declaredAs, label, encoding) {
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

function loadFromDirectory(themeDir) {
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

  const assets = new Map();
  for (const asset of manifest.assets) {
    const assetPath = resolveInDirectory(themeDir, asset.path, 'manifest.json: assets[].path');
    const buffer = readPackageFile(assetPath, asset.path, `assets[].path`, null);
    if (buffer.length !== asset.bytes) {
      fail(
        'MANIFEST_INVALID',
        `manifest.json declares asset "${asset.path}" as ${asset.bytes} bytes, but the file is ${buffer.length} bytes — the package and its manifest disagree about what shipped`
      );
    }
    assets.set(asset.path, buffer);
  }

  return { manifest, css, syntax, assets };
}

// ---------------------------------------------------------------------
// .ccskin (zip) sourced themes
// ---------------------------------------------------------------------

function loadFromCcskin(ccskinPath) {
  const fileSize = fs.statSync(ccskinPath).size;
  if (fileSize > MAX_PACKAGE_BYTES) {
    fail('SIZE_EXCEEDED', `"${ccskinPath}" is ${fileSize} bytes, exceeding the ${MAX_PACKAGE_BYTES}-byte package cap (D-0001-4)`);
  }
  const buf = fs.readFileSync(ccskinPath);

  const files = readZip(buf, { maxTotalBytes: MAX_PACKAGE_BYTES });

  const manifestBuffer = files.get('manifest.json');
  if (!manifestBuffer) {
    fail('MANIFEST_INVALID', `"${ccskinPath}" has no manifest.json at its root`);
  }
  const manifest = validateManifest(parseJson(manifestBuffer.toString('utf8'), 'manifest.json', 'MANIFEST_INVALID'));

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

  const assets = new Map();
  for (const asset of manifest.assets) {
    const buffer = getEntry(asset.path, 'manifest.json: assets[].path');
    if (buffer.length !== asset.bytes) {
      fail(
        'MANIFEST_INVALID',
        `manifest.json declares asset "${asset.path}" as ${asset.bytes} bytes, but the packaged entry is ${buffer.length} bytes — the package and its manifest disagree about what shipped`
      );
    }
    assets.set(asset.path, buffer);
  }

  return { manifest, css, syntax, assets };
}

/**
 * Load and fully validate a Codexterity theme package.
 *
 * @param {string} source - path to either a theme DIRECTORY or a `.ccskin`
 *   FILE. Detected by `fs.statSync`, never by file extension.
 * @returns {{ id: string, manifest: object, css: string, syntax: object,
 *   assets: Map<string, Buffer>, sourceKind: 'directory'|'ccskin',
 *   sourcePath: string }}
 * @throws {ThemeLoadError} with a machine-readable `code`
 *   (MANIFEST_INVALID, CSS_UNSAFE, SIZE_EXCEEDED, ZIP_MALFORMED,
 *   SOURCE_NOT_FOUND) and a human-readable `message` naming the offending
 *   file and, for CSS, the line.
 */
function loadTheme(source) {
  if (typeof source !== 'string' || source.length === 0) {
    throw new TypeError('loadTheme(source): source must be a non-empty path string');
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
    result = loadFromDirectory(sourcePath);
  } else if (stat.isFile()) {
    sourceKind = 'ccskin';
    result = loadFromCcskin(sourcePath);
  } else {
    fail('SOURCE_NOT_FOUND', `theme source "${source}" is neither a directory nor a regular file`);
  }

  return {
    id: result.manifest.id,
    manifest: result.manifest,
    css: result.css,
    syntax: result.syntax,
    assets: result.assets,
    sourceKind,
    sourcePath,
  };
}

module.exports = { loadTheme, ThemeLoadError, MAX_PACKAGE_BYTES };
