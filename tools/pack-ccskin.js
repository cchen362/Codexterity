'use strict';

/**
 * Codexterity — `.ccskin` packer (Phase 4 M2, D-0001-20)
 * -----------------------------------------------------------
 * Turns a theme DIRECTORY (e.g. `themes/captains-cabin/`) into the
 * distributable `.ccskin` zip that `injector/theme-loader/index.js` already
 * knows how to read. This is CommonJS, not `.mjs` — unlike
 * `tools/palette/*.mjs`, this module is `require`d directly by a test, so it
 * follows the repo's default module system rather than the palette tool's.
 *
 * The packer never invents package contents of its own: everything it
 * writes is a byte-for-byte copy of a file `loadTheme()` already read and
 * validated from the source directory. Packing is therefore "reproduce the
 * validated bytes inside a container", never "regenerate the package from
 * the manifest's data" — see the comment on manifest.json below for why
 * that distinction matters for a specific file.
 */

const fs = require('fs');
const path = require('path');

const { loadTheme, ThemeLoadError, MAX_PACKAGE_BYTES } = require('../injector/theme-loader/index.js');
const { writeZip } = require('../injector/theme-loader/zip-write.js');
const { isSafeRelativePath } = require('../injector/theme-loader/path-safety.js');

const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, '..', 'dist');

/**
 * Pack the theme directory at `themeDir` into a `.ccskin` file.
 *
 * @param {string} themeDir - path to a theme directory (e.g.
 *   `themes/captains-cabin`)
 * @param {{ outDir?: string }} [options]
 * @returns {{ outputPath: string, bytes: number, entries: { name: string,
 *   bytes: number }[] }}
 * @throws {ThemeLoadError} unchanged, if `themeDir` does not validate as a
 *   theme in the first place — a package built from an invalid theme is not
 *   something to discover at install time.
 */
function packTheme(themeDir, options = {}) {
  const outDir = options.outDir || DEFAULT_OUTPUT_DIR;

  // Step 1: refuse to pack an invalid theme. loadTheme() runs the FULL
  // validation pipeline (manifest shape, safe-CSS scan, asset size
  // agreement, the 32 MiB cap) and its ThemeLoadError already names the
  // offending file and line — wrapping or catching it here would only
  // obscure a message that is already as specific as it can be.
  //
  // D-0003-9 — 'eager' here on purpose: step 4 below round-trips every
  // ASSET BYTE (not just its declared size) through the packed archive to
  // prove the packer reproduces them exactly, so this is one of the few
  // legitimate callers that needs the actual buffers, not just their sizes.
  const loaded = loadTheme(themeDir, { assets: 'eager' });
  const { manifest } = loaded;
  const themeDirResolved = path.resolve(themeDir);

  // Every path read below comes out of manifest.json, i.e. untrusted input
  // from whoever built the theme. loadTheme() has already validated these
  // exact paths — but the packer's read is a SEPARATE filesystem observation
  // from the loader's, so the invariant is re-asserted here rather than
  // trusted from several frames away. That is the same reasoning the
  // loader's own readPackageFile states for repeating the check after its
  // directory scan; a packer that reads by manifest path without the guard
  // is a file-read primitive aimed by a file it was handed. Routed through
  // the ONE shared isSafeRelativePath, never a second copy of the check.
  // `lstat`, never `stat`: the point is to see the link itself rather than
  // what it points at (D-0001-3).
  function readVerbatim(relativePath, label) {
    if (!isSafeRelativePath(relativePath)) {
      throw new ThemeLoadError('MANIFEST_INVALID', `${label} ("${relativePath}") is not a safe relative path`);
    }
    const fullPath = path.join(themeDirResolved, relativePath);
    if (!fullPath.startsWith(themeDirResolved + path.sep)) {
      throw new ThemeLoadError('MANIFEST_INVALID', `${label} ("${relativePath}") resolves outside the theme directory`);
    }
    if (fs.lstatSync(fullPath).isSymbolicLink()) {
      throw new ThemeLoadError(
        'MANIFEST_INVALID',
        `${label} ("${relativePath}") is a symbolic link; Codexterity never follows links out of a theme package (D-0001-3)`
      );
    }
    return fs.readFileSync(fullPath);
  }

  // Step 2: the entry list, in a fixed order (manifest.json, then the two
  // declared files, then assets in manifest order) — order is itself part
  // of reproducibility (see zip-write.js), so it is not left to whatever
  // order an object's keys happen to iterate in.
  //
  // Every entry is read straight off disk with fs.readFileSync, never
  // reconstructed from the in-memory `manifest`/`css`/`syntax` objects
  // loadTheme() returned. manifest.json in particular is written as the
  // VERBATIM bytes on disk, never `JSON.stringify(manifest)` — the loader's
  // `manifest` is Codexterity's validated, defaulted VIEW of the file
  // (D-0001-21), and re-serialising it would silently reformat (key order,
  // whitespace, which optional fields got written out) a file a human
  // generated, changing the package's bytes for a reason that has nothing
  // to do with what the theme actually is.
  const entries = [
    { name: 'manifest.json', content: readVerbatim('manifest.json', 'manifest.json') },
    { name: manifest.files.css, content: readVerbatim(manifest.files.css, 'manifest.json: files.css') },
    { name: manifest.files.syntax, content: readVerbatim(manifest.files.syntax, 'manifest.json: files.syntax') },
  ];

  // Assets are read by the exact paths manifest.assets[] declares — NEVER
  // by walking the theme directory. themes/captains-cabin/assets/fonts/
  // holds NINE font faces on disk but the manifest declares only three
  // (D-0001-7): five are the losing typography candidates (bitter,
  // commissioner, ibm-plex-sans, newsreader, work-sans) and one is the
  // superseded Monaspace Xenon, all kept in the repo as the record of that
  // decision, not as shippable assets. A directory scan would happily zip
  // all nine into the .ccskin; reading only what the manifest names is what
  // keeps the package's contents equal to the theme's validated contents,
  // which is the whole reason this milestone's first judgement call
  // resolved this way. (Counts corrected 2026-08-05 — this comment said
  // "five on disk ... two candidates", undercounting both.)
  for (const asset of manifest.assets) {
    entries.push({ name: asset.path, content: readVerbatim(asset.path, 'manifest.json: assets[].path') });
  }

  // Step 3: write the archive.
  const archiveBytes = writeZip(entries);
  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, `${manifest.id}.ccskin`);
  fs.writeFileSync(outputPath, archiveBytes);

  // Step 4: verify what was just written, before returning. A packer that
  // emits an archive its OWN loader rejects must fail at build time, loudly
  // — never ship a `.ccskin` nobody has proven loadTheme() can read back.
  const onDiskSize = fs.statSync(outputPath).size;
  if (onDiskSize > MAX_PACKAGE_BYTES) {
    throw new ThemeLoadError(
      'SIZE_EXCEEDED',
      `packed "${outputPath}" is ${onDiskSize} bytes, exceeding the ${MAX_PACKAGE_BYTES}-byte package cap (D-0001-4)`
    );
  }

  // D-0003-9 — 'eager' for the same reason as the directory load above: the
  // per-asset byte comparison right below needs the packed archive's actual
  // buffers, not merely their verified sizes.
  const roundTripped = loadTheme(outputPath, { assets: 'eager' });

  if (roundTripped.id !== loaded.id) {
    throw new Error(`pack-ccskin: round-trip id mismatch — directory load gave "${loaded.id}", packed archive gave "${roundTripped.id}"`);
  }
  if (roundTripped.css !== loaded.css) {
    throw new Error('pack-ccskin: round-trip css mismatch between the directory load and the packed archive');
  }
  if (JSON.stringify(roundTripped.syntax) !== JSON.stringify(loaded.syntax)) {
    throw new Error('pack-ccskin: round-trip syntax mismatch between the directory load and the packed archive');
  }
  for (const [assetPath, buffer] of loaded.assets) {
    const packedBuffer = roundTripped.assets.get(assetPath);
    if (!packedBuffer || !packedBuffer.equals(buffer)) {
      throw new Error(`pack-ccskin: round-trip asset mismatch for "${assetPath}" between the directory load and the packed archive`);
    }
  }

  return {
    outputPath,
    bytes: onDiskSize,
    entries: entries.map((entry) => ({
      name: entry.name,
      bytes: Buffer.isBuffer(entry.content) ? entry.content.length : Buffer.byteLength(entry.content, 'utf8'),
    })),
  };
}

module.exports = { packTheme, DEFAULT_OUTPUT_DIR };

if (require.main === module) {
  const themeDirArg = process.argv[2] || path.resolve(__dirname, '..', 'themes', 'captains-cabin');
  try {
    const result = packTheme(themeDirArg);
    console.log(`Packed: ${result.outputPath} (${result.bytes} bytes)`);
    for (const entry of result.entries) {
      console.log(`  ${entry.name} (${entry.bytes} bytes)`);
    }
  } catch (err) {
    if (err instanceof ThemeLoadError) {
      console.error(`${err.code}: ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }
}
