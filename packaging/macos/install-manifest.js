'use strict';

/**
 * Codexterity — macOS install/uninstall shared path manifest (Phase 4 M4)
 * -----------------------------------------------------------------------
 * ONE canonical description of every filesystem path `install.sh` can leave
 * behind, so `uninstall.sh` (and the test that checks it) never carry an
 * independent copy that can silently drift from what install actually does.
 * The milestone brief is explicit about why this file has to exist: "a test
 * that hardcodes its own copy of the list proves nothing."
 *
 * The active-theme state path is NOT re-derived here — it is required
 * straight from `injector/cli.js`'s own `stateFilePath()` (D-0001-24), the
 * one existing source of truth for where Codexterity keeps that file.
 * Hand-writing `.codexterity` as a second string literal here would be
 * exactly the kind of copy this module exists to prevent, one level up.
 *
 * `uninstall.sh` calls this file directly (`node install-manifest.js`,
 * see the CLI block at the bottom) and parses its JSON stdout, so the shell
 * script and this Node test both read the *same* object at the *same*
 * moment they run — not a value transcribed into the shell script by hand
 * ahead of time.
 */

const path = require('path');
const os = require('os');
const { stateFilePath } = require('../../injector/cli.js');

const APP_NAME = 'Codexterity.app';

/**
 * Both are legitimate, sudo-free install targets (docs/ENGINEERING.md /
 * the plan's §2: "No elevation required on Windows... no re-signing on
 * macOS"; the macOS analogue is never writing outside a location the
 * user already owns). `install.sh` picks whichever is writable at install
 * time; `uninstall.sh` must check both, since it cannot assume which one
 * a given run chose.
 */
function candidateAppDirs(homeDir = os.homedir()) {
  return ['/Applications', path.join(homeDir, 'Applications')];
}

function candidateAppPaths(homeDir = os.homedir()) {
  return candidateAppDirs(homeDir).map((dir) => path.join(dir, APP_NAME));
}

/**
 * Every path `install.sh` can create, for a given $HOME. This is the "one
 * shared source" the milestone brief requires: `uninstall.sh`'s removal
 * list, and the test asserting its completeness, both read this function
 * instead of each keeping an independent copy that can go stale.
 */
function installedPaths(homeDir = os.homedir()) {
  const stateFile = stateFilePath(homeDir);
  return {
    appName: APP_NAME,
    appCandidates: candidateAppPaths(homeDir),
    stateFile,
    stateDir: path.dirname(stateFile),
  };
}

module.exports = { APP_NAME, candidateAppDirs, candidateAppPaths, installedPaths };

// CLI mode: `node install-manifest.js` prints installedPaths() as JSON for
// the given $HOME (or the real home directory when unset) to stdout.
// uninstall.sh's only way to learn these paths is this call — it never
// hardcodes '/Applications/Codexterity.app' or '.codexterity' itself.
if (require.main === module) {
  const homeDir = process.env.HOME || os.homedir();
  process.stdout.write(JSON.stringify(installedPaths(homeDir)));
}
