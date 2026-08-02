'use strict';

/**
 * Codexterity — relative-path safety guard (Phase 4 M1)
 * --------------------------------------------------------
 * D-0001-4 themes are data packages that get read into Codex's own Electron
 * main process (D-0001-1). Every relative path a package declares — the
 * manifest's `files.css` / `files.syntax`, each `assets[].path`, and every
 * zip entry name — is untrusted input pulled from something a third party
 * built. This is the ONE guard both loaders (directory and .ccskin) route
 * through, so the traversal/absolute-path check cannot silently drift
 * between the two source kinds.
 *
 * A path is safe iff it:
 *   - is a non-empty string
 *   - uses forward slashes only (a backslash is never a separator in a
 *     Codexterity package, even on Windows — packages must be
 *     platform-independent, and '\' is a valid *filename* character on
 *     POSIX, so treating it as a separator would be its own bug)
 *   - is not absolute (no leading '/', no drive letter like 'C:')
 *   - contains no '..' path segment, anywhere
 */
function isSafeRelativePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  if (candidate.includes('\\')) return false;
  if (candidate.startsWith('/')) return false;
  if (/^[a-zA-Z]:/.test(candidate)) return false;
  const segments = candidate.split('/');
  for (const segment of segments) {
    if (segment === '..') return false;
    // A leading/trailing/doubled slash produces an empty segment; harmless
    // on its own, but '.' segments and empties are still not path traversal
    // so they are not rejected here — only '..' is a safety concern.
  }
  return true;
}

module.exports = { isSafeRelativePath };
