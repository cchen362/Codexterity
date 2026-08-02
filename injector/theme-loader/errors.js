'use strict';

/**
 * Codexterity — theme-loader error type (Phase 4 M1)
 * ----------------------------------------------------
 * Every failure the loader raises is a `ThemeLoadError` carrying a
 * machine-readable `code` alongside the human-readable `message`. Callers
 * (the `cdx` CLI, `cdx verify` in a later milestone) branch on `code`;
 * humans read `message`. Per docs/ENGINEERING.md ("fail loudly"), the loader
 * never swallows a malformed package — it always throws one of these.
 *
 * Known codes (not exhaustive — new ones may be added as new failure shapes
 * are discovered, but existing ones must never change meaning):
 *   - SOURCE_NOT_FOUND  the path handed to loadTheme() does not exist
 *   - MANIFEST_INVALID  manifest.json (or a file/asset it declares) is
 *                       malformed, missing, or disagrees with the package
 *   - CSS_UNSAFE        theme.css failed the safe-CSS scan (D-0001-4)
 *   - SIZE_EXCEEDED     the 32 MiB package cap (D-0001-4), or the entry-count
 *                       cap, was hit
 *   - ZIP_MALFORMED     the .ccskin container itself is not a well-formed,
 *                       supported zip (bad EOCD, Zip64, unsupported
 *                       compression method, unsafe entry name, CRC mismatch)
 *   - PACKAGE_INVALID   the packer (tools/pack-ccskin.js) was handed entries
 *                       that cannot form a valid package (unsafe or
 *                       duplicate entry name, too many entries)
 */
class ThemeLoadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ThemeLoadError';
    this.code = code;
  }
}

module.exports = { ThemeLoadError };
